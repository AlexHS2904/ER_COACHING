-- Apply manually before releasing the TypeScript caller. The v1 RPC is retained.
BEGIN;

-- These fields track the ready email, independently of the coach's submission
-- email. Resend acceptance is not a delivery confirmation.
ALTER TABLE public.booking_intake_forms
  ADD COLUMN IF NOT EXISTS ready_email_id text,
  ADD COLUMN IF NOT EXISTS ready_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_email_error text;

CREATE OR REPLACE FUNCTION public.activate_booking_intake_v2(
  p_booking_id uuid,
  p_access_token_hash text,
  p_access_token_encrypted text,
  p_payment_provider text,
  p_payment_reference text
)
RETURNS TABLE (
  form_id public.booking_intake_forms.id%TYPE,
  customer_name text,
  customer_email text,
  service_name text,
  starts_at public.bookings.starts_at%TYPE,
  access_token_hash text,
  access_token_encrypted text,
  intake_created boolean,
  payment_already_paid boolean,
  ready_email_sent_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_form public.booking_intake_forms%ROWTYPE;
  v_intake_created boolean := false;
  v_already_paid boolean;
  v_provider public.bookings.payment_provider%TYPE := nullif(btrim(p_payment_provider), '');
  v_reference public.bookings.payment_reference%TYPE := nullif(btrim(p_payment_reference), '');
BEGIN
  IF p_access_token_hash IS NULL
     OR length(p_access_token_hash) <> 64
     OR p_access_token_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'El hash de acceso debe ser SHA-256 hexadecimal de 64 caracteres.';
  END IF;

  IF p_access_token_encrypted IS NULL
     OR btrim(p_access_token_encrypted) = '' THEN
    RAISE EXCEPTION 'El token cifrado es obligatorio.';
  END IF;

  IF v_provider IS NULL OR v_provider NOT IN ('manual', 'stripe') THEN
    RAISE EXCEPTION 'Proveedor de pago no válido.';
  END IF;

  -- All v2 callers serialize on the same booking, including manual/Stripe races.
  SELECT b.* INTO v_booking
  FROM public.bookings AS b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada.';
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RAISE EXCEPTION 'No puedes registrar el pago de una reserva cancelada.';
  END IF;

  IF v_booking.payment_status = 'refunded' THEN
    RAISE EXCEPTION 'No puedes activar una reserva con pago reembolsado.';
  END IF;

  IF v_booking.service_name_snapshot IS DISTINCT FROM 'Sesión 1:1'
     OR coalesce(v_booking.session_count_snapshot, 1) <> 1 THEN
    RAISE EXCEPTION 'El formulario previo solo aplica a sesiones 1:1.';
  END IF;

  v_already_paid := coalesce(v_booking.payment_status = 'paid', false);

  IF NOT v_already_paid THEN
    UPDATE public.bookings AS b
    SET payment_status = 'paid',
        paid_at = coalesce(b.paid_at, now()),
        payment_provider = v_provider,
        -- Preserve a reference only when it belongs to the same provider.
        payment_reference = coalesce(
          v_reference,
          CASE WHEN b.payment_provider = v_provider
            THEN b.payment_reference ELSE NULL END
        )
    WHERE b.id = p_booking_id;
  ELSE
    -- A paid booking may only be retried by the same payment identity.
    -- Missing legacy metadata can be filled, but never replaced.
    IF v_booking.payment_provider IS NOT NULL
       AND v_booking.payment_provider IS DISTINCT FROM v_provider THEN
      RAISE EXCEPTION 'Conflicto de pago: la reserva ya está pagada con otro proveedor.';
    END IF;

    IF v_reference IS NOT NULL
       AND v_booking.payment_reference IS NOT NULL
       AND v_booking.payment_reference IS DISTINCT FROM v_reference THEN
      RAISE EXCEPTION 'Conflicto de pago: la reserva ya tiene una referencia de pago distinta.';
    END IF;

    UPDATE public.bookings AS b
    SET payment_provider = coalesce(b.payment_provider, v_provider),
        payment_reference = coalesce(b.payment_reference, v_reference)
    WHERE b.id = p_booking_id
      AND (
        (b.payment_provider IS NULL AND v_provider IS NOT NULL)
        OR (b.payment_reference IS NULL AND v_reference IS NOT NULL)
      );
  END IF;

  -- Never reactivate, extend expiry, or rotate access for an existing intake.
  SELECT f.* INTO v_form
  FROM public.booking_intake_forms AS f
  WHERE f.booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.booking_intake_forms AS f (
      booking_id, source_type, invitee_name, invitee_email,
      access_token_hash, access_token_encrypted,
      status, current_step, expires_at
    ) VALUES (
      p_booking_id, 'booking', v_booking.customer_name, v_booking.customer_email,
      lower(p_access_token_hash), p_access_token_encrypted,
      'active', 1, now() + interval '30 days'
    )
    ON CONFLICT (booking_id) DO NOTHING
    RETURNING f.* INTO v_form;

    v_intake_created := FOUND;

    IF NOT v_intake_created THEN
      SELECT f.* INTO v_form
      FROM public.booking_intake_forms AS f
      WHERE f.booking_id = p_booking_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'No fue posible recuperar el formulario existente.';
      END IF;
    END IF;
  END IF;

  IF v_form.source_type IS DISTINCT FROM 'booking' THEN
    RAISE EXCEPTION 'El formulario asociado no es un intake de reserva.';
  END IF;

  RETURN QUERY SELECT
    v_form.id,
    v_booking.customer_name::text,
    v_booking.customer_email::text,
    v_booking.service_name_snapshot::text,
    v_booking.starts_at,
    v_form.access_token_hash::text,
    v_form.access_token_encrypted::text,
    v_intake_created,
    v_already_paid,
    v_form.ready_email_sent_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_booking_intake_v2(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_booking_intake_v2(uuid, text, text, text, text)
  TO service_role;

COMMIT;
