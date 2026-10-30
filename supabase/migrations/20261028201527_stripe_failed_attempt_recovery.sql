-- LOCAL ONLY until reviewed separately against the remote schema.
-- Add durable dispatch provenance without reclassifying historical attempts.
BEGIN;
ALTER TABLE public.booking_payment_attempts
  ADD COLUMN IF NOT EXISTS checkout_creation_state text NOT NULL DEFAULT 'ambiguous';
DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.booking_payment_attempts'::regclass
    AND conname = 'payment_attempt_checkout_creation_state_check') THEN
    ALTER TABLE public.booking_payment_attempts ADD CONSTRAINT payment_attempt_checkout_creation_state_check
      CHECK (checkout_creation_state IN ('not_started', 'in_flight', 'ambiguous', 'rejected', 'succeeded'));
  END IF;
END;
$constraint$;

CREATE OR REPLACE FUNCTION public.claim_stripe_checkout_v1(
  p_booking_id uuid, p_access_token_hash text, p_owner uuid, p_site_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE
  b public.bookings%ROWTYPE;
  a public.booking_payment_attempts%ROWTYPE;
  previous public.booking_payment_attempts%ROWTYPE;
  minor numeric;
  target text;
  payload jsonb;
  new_id uuid;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.booking_access_token_hash IS DISTINCT FROM p_access_token_hash THEN RAISE EXCEPTION 'invalid_access'; END IF;
  IF p_owner IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
  IF b.payment_flow IS DISTINCT FROM 'stripe' THEN RAISE EXCEPTION 'invalid_flow'; END IF;
  IF b.finalization_status = 'review_required' THEN RAISE EXCEPTION 'review_required'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'already_paid'; END IF;
  IF b.status IS DISTINCT FROM 'pending' OR b.payment_status IS DISTINCT FROM 'pending'
     OR b.payment_expires_at IS NULL OR b.payment_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'hold_expired'; END IF;

  -- Prefer an existing active attempt, irrespective of timestamp ties. All
  -- callers serialize on the booking; the existing partial unique index stays.
  SELECT x.* INTO a FROM public.booking_payment_attempts x
    WHERE x.booking_id = b.id AND x.provider = 'stripe' AND x.status IN ('creating', 'open', 'unknown')
    ORDER BY x.created_at DESC, x.id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    SELECT x.* INTO previous FROM public.booking_payment_attempts x
      WHERE x.booking_id = b.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      -- Legacy failures have ambiguous provenance and are never auto-recovered.
      IF previous.status IS DISTINCT FROM 'failed' OR previous.checkout_creation_state IS DISTINCT FROM 'rejected'
         OR previous.last_error IS NULL OR previous.last_error NOT IN
           ('stripe_invalid_request', 'stripe_authentication_failed', 'stripe_permission_denied')
         OR previous.stripe_checkout_session_id IS NOT NULL OR previous.stripe_payment_intent_id IS NOT NULL
         OR previous.payment_received_at IS NOT NULL THEN RAISE EXCEPTION 'checkout_unavailable'; END IF;
      IF previous.amount_minor::numeric IS DISTINCT FROM b.price_snapshot::numeric * 100
         OR previous.currency IS DISTINCT FROM lower(b.currency_snapshot) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
      new_id := gen_random_uuid();
      -- Clone the original trusted payload, changing only successor identity.
      minor := previous.amount_minor;
      payload := jsonb_set(previous.checkout_payload, '{metadata,payment_attempt_id}', to_jsonb(new_id::text), false);
      IF payload #>> '{metadata,payment_attempt_id}' IS DISTINCT FROM new_id::text THEN RAISE EXCEPTION 'checkout_unavailable'; END IF;
    ELSE
      minor := b.price_snapshot::numeric * 100;
      IF minor IS NULL OR minor <= 0 OR minor <> trunc(minor) OR minor > 9007199254740991
         OR lower(b.currency_snapshot) IS DISTINCT FROM 'mxn' THEN RAISE EXCEPTION 'invalid_amount'; END IF;
      new_id := gen_random_uuid();
      target := p_site_url || '/reservar/confirmada?booking=' || b.id::text;
      payload := jsonb_build_object(
        'mode', 'payment',
        'line_items', jsonb_build_array(jsonb_build_object('quantity', 1, 'price_data', jsonb_build_object(
          'currency', lower(b.currency_snapshot), 'unit_amount', minor::bigint,
          'product_data', jsonb_build_object('name', b.service_name_snapshot)))),
        'client_reference_id', b.id::text,
        'metadata', jsonb_build_object('booking_id', b.id::text, 'booking_reference', b.booking_reference, 'payment_attempt_id', new_id::text),
        'success_url', target || '&session_id={CHECKOUT_SESSION_ID}', 'cancel_url', target,
        'expires_at', floor(extract(epoch FROM b.payment_expires_at + interval '1 hour'))::bigint
      );
    END IF;
    INSERT INTO public.booking_payment_attempts(id, booking_id, status, amount_minor, currency, checkout_payload, checkout_creation_state)
      VALUES (new_id, b.id, 'creating', minor::bigint, lower(b.currency_snapshot), payload, 'not_started') RETURNING * INTO a;
  END IF;
  IF a.stripe_checkout_session_id IS NULL AND a.lease_until > clock_timestamp() AND a.lease_owner IS DISTINCT FROM p_owner THEN
    RAISE EXCEPTION 'checkout_in_progress';
  END IF;
  IF a.stripe_checkout_session_id IS NULL THEN
    UPDATE public.booking_payment_attempts SET lease_owner = p_owner, lease_until = clock_timestamp() + interval '2 minutes', updated_at = now()
      WHERE id = a.id RETURNING * INTO a;
  END IF;
  RETURN jsonb_build_object('booking', to_jsonb(b), 'attempt', to_jsonb(a) || jsonb_build_object('amount_minor', a.amount_minor::text));
END;
$f$;

CREATE OR REPLACE FUNCTION public.begin_stripe_checkout_creation_v1(p_booking_id uuid, p_attempt_id uuid, p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE; first_dispatch boolean;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.payment_flow IS DISTINCT FROM 'stripe' THEN RAISE EXCEPTION 'invalid_flow'; END IF;
  IF b.status IS DISTINCT FROM 'pending' OR b.payment_status IS DISTINCT FROM 'pending'
     OR b.payment_expires_at IS NULL OR b.payment_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'hold_expired'; END IF;
  IF b.finalization_status = 'review_required' THEN RAISE EXCEPTION 'review_required'; END IF;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.id = p_attempt_id AND x.booking_id = b.id FOR UPDATE;
  IF NOT FOUND OR p_owner IS NULL OR a.lease_owner IS DISTINCT FROM p_owner
     OR a.lease_until IS NULL OR a.lease_until <= clock_timestamp() THEN RAISE EXCEPTION 'checkout_in_progress'; END IF;
  IF a.status NOT IN ('creating', 'unknown', 'open') OR a.stripe_checkout_session_id IS NOT NULL
     OR a.stripe_payment_intent_id IS NOT NULL OR a.payment_received_at IS NOT NULL THEN RAISE EXCEPTION 'checkout_unavailable'; END IF;
  first_dispatch := a.status = 'creating' AND a.checkout_creation_state = 'not_started';
  -- A dispatch is recorded BEFORE network I/O. A crash/lost RPC response thus
  -- yields ambiguity, never permission to start a successor with another key.
  UPDATE public.booking_payment_attempts SET
    checkout_creation_state = CASE WHEN first_dispatch THEN 'in_flight' ELSE 'ambiguous' END,
    updated_at = now() WHERE id = a.id;
  RETURN first_dispatch;
END;
$f$;

CREATE OR REPLACE FUNCTION public.record_stripe_checkout_failure_v1(
  p_booking_id uuid, p_attempt_id uuid, p_owner uuid, p_status text, p_error text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE; rejected boolean;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('failed', 'unknown') OR p_error IS NULL
     OR (p_status = 'unknown' AND p_error <> 'stripe_request_unknown')
     OR (p_status = 'failed' AND p_error NOT IN ('stripe_invalid_request', 'stripe_authentication_failed', 'stripe_permission_denied'))
    THEN RAISE EXCEPTION 'invalid_request'; END IF;
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.payment_flow IS DISTINCT FROM 'stripe' OR b.status IS DISTINCT FROM 'pending'
     OR b.payment_status IS DISTINCT FROM 'pending' THEN RETURN false; END IF;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.id = p_attempt_id AND x.booking_id = b.id FOR UPDATE;
  IF NOT FOUND OR p_owner IS NULL OR a.lease_owner IS DISTINCT FROM p_owner
     OR a.lease_until IS NULL OR a.lease_until <= clock_timestamp()
     OR a.status NOT IN ('creating', 'unknown', 'open') OR a.stripe_checkout_session_id IS NOT NULL
     OR a.stripe_payment_intent_id IS NOT NULL OR a.payment_received_at IS NOT NULL THEN RETURN false; END IF;
  rejected := p_status = 'failed' AND a.status = 'creating' AND a.checkout_creation_state = 'in_flight';
  UPDATE public.booking_payment_attempts SET
    status = CASE WHEN rejected THEN 'failed' ELSE 'unknown' END,
    last_error = CASE WHEN rejected THEN p_error ELSE 'stripe_request_unknown' END,
    checkout_creation_state = CASE WHEN rejected THEN 'rejected' ELSE 'ambiguous' END,
    lease_owner = NULL, lease_until = NULL, updated_at = now() WHERE id = a.id;
  RETURN true;
END;
$f$;

CREATE OR REPLACE FUNCTION public.save_stripe_checkout_v1(
  p_booking_id uuid, p_attempt_id uuid, p_owner uuid, p_session_id text, p_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.id = p_attempt_id AND x.booking_id = b.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_unavailable'; END IF;
  IF a.stripe_checkout_session_id IS NOT NULL AND a.stripe_checkout_session_id <> p_session_id THEN RAISE EXCEPTION 'session_conflict'; END IF;
  IF a.stripe_checkout_session_id = p_session_id THEN
    RETURN b.status = 'pending' AND b.payment_status = 'pending' AND b.payment_expires_at > clock_timestamp();
  END IF;
  IF a.lease_owner IS DISTINCT FROM p_owner OR a.lease_until < clock_timestamp() THEN RAISE EXCEPTION 'checkout_in_progress'; END IF;
  UPDATE public.booking_payment_attempts SET stripe_checkout_session_id = p_session_id,
    stripe_expires_at = p_expires_at, checkout_creation_state = 'succeeded', status = CASE WHEN status IN ('creating', 'unknown') THEN 'open' ELSE status END,
    lease_owner = NULL, lease_until = NULL, last_error = NULL, updated_at = now() WHERE id = a.id;
  RETURN b.status = 'pending' AND b.payment_status = 'pending' AND b.payment_expires_at > clock_timestamp();
END;
$f$;

REVOKE ALL ON FUNCTION public.claim_stripe_checkout_v1(uuid,text,uuid,text),
  public.save_stripe_checkout_v1(uuid,uuid,uuid,text,timestamptz),
  public.begin_stripe_checkout_creation_v1(uuid,uuid,uuid),
  public.record_stripe_checkout_failure_v1(uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_checkout_v1(uuid,text,uuid,text),
  public.save_stripe_checkout_v1(uuid,uuid,uuid,text,timestamptz),
  public.begin_stripe_checkout_creation_v1(uuid,uuid,uuid),
  public.record_stripe_checkout_failure_v1(uuid,uuid,uuid,text,text) TO service_role;
COMMIT;
