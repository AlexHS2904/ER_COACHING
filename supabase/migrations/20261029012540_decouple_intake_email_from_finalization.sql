-- LOCAL ONLY: review/preflight before any remote application. No backfill.
-- Revised BEFORE first remote application: reminder is session-relative.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_stripe_finalization_v1(p_booking_id uuid, p_owner uuid, p_step text, p_data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.payment_flow IS DISTINCT FROM 'stripe' OR b.payment_status <> 'paid' OR b.status = 'cancelled'
     OR b.finalization_status <> 'processing' OR b.finalization_owner IS DISTINCT FROM p_owner
     OR b.finalization_lease_until <= clock_timestamp() THEN RAISE EXCEPTION 'finalization_lease_lost'; END IF;
  IF p_step = 'calendar' THEN
    IF b.google_event_id IS NOT NULL AND b.google_event_id IS DISTINCT FROM p_data->>'eventId' THEN RAISE EXCEPTION 'calendar_identity_conflict'; END IF;
    UPDATE public.bookings SET google_event_id = p_data->>'eventId',
      google_meet_url = coalesce(p_data->>'meetUrl', google_meet_url),
      google_calendar_url = coalesce(p_data->>'calendarUrl', google_calendar_url) WHERE id = b.id;
    IF p_data->>'meetUrl' IS NOT NULL AND p_data->>'eventId' IS NOT NULL THEN
      UPDATE public.bookings SET calendar_status = 'created', status = 'confirmed', finalization_error = NULL WHERE id = b.id;
    END IF;
  ELSIF p_step = 'customer_email_start' THEN
    UPDATE public.bookings SET stripe_customer_email_started_at = coalesce(stripe_customer_email_started_at, now()) WHERE id = b.id;
  ELSIF p_step = 'coach_email_start' THEN
    UPDATE public.bookings SET stripe_coach_email_started_at = coalesce(stripe_coach_email_started_at, now()) WHERE id = b.id;
  ELSIF p_step = 'intake_start' THEN
    UPDATE public.bookings SET stripe_intake_email_started_at = coalesce(stripe_intake_email_started_at, now()) WHERE id = b.id;
  ELSIF p_step = 'customer_email' THEN
    UPDATE public.bookings SET customer_email_id = p_data->>'id', customer_email_status = 'sent',
      customer_email_sent_at = now(), customer_email_status_at = now(), customer_email_error = NULL WHERE id = b.id;
  ELSIF p_step = 'coach_email' THEN
    UPDATE public.bookings SET coach_email_id = p_data->>'id', coach_email_status = 'sent',
      coach_email_sent_at = now(), coach_email_status_at = now(), coach_email_error = NULL WHERE id = b.id;
  ELSIF p_step IN ('retryable', 'review_required') THEN
    UPDATE public.bookings SET finalization_status = p_step, finalization_error = p_data->>'code',
      next_finalization_at = CASE WHEN p_step = 'retryable' THEN clock_timestamp() + interval '30 seconds' ELSE NULL END,
      finalization_owner = NULL, finalization_lease_until = NULL WHERE id = b.id;
  ELSIF p_step = 'completed' THEN
    IF b.status <> 'confirmed' OR b.google_event_id IS NULL OR b.google_meet_url IS NULL
       OR b.customer_email_id IS NULL OR b.coach_email_id IS NULL THEN
      RAISE EXCEPTION 'incomplete_finalization';
    END IF;
    -- Purchase visibility is irrelevant to an already paid booking's intake.
    IF EXISTS (SELECT 1 FROM public.services s WHERE s.id = b.service_id
        AND s.slug = 'sesion-1-1' AND s.service_type = 'single' AND s.session_count = 1)
       AND coalesce(b.session_count_snapshot, 1) = 1
       AND b.process_id IS NULL AND b.package_session_number IS NULL THEN
      -- Lock the existing unique intake against submission/revocation races.
      PERFORM 1 FROM public.booking_intake_forms f WHERE f.booking_id = b.id FOR UPDATE;
      IF (SELECT count(*) FROM public.booking_intake_forms f WHERE f.booking_id = b.id) <> 1
         OR NOT EXISTS (SELECT 1 FROM public.booking_intake_forms f WHERE f.booking_id = b.id
           AND f.source_type = 'booking'
           AND ((f.status = 'submitted' AND f.submitted_at IS NOT NULL)
             OR (f.status = 'active' AND f.submitted_at IS NULL AND f.expires_at > clock_timestamp()
               AND f.access_token_hash ~ '^[0-9a-f]{64}$'
               AND f.access_token_encrypted ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{86}$'))) THEN
        RAISE EXCEPTION 'incomplete_finalization';
      END IF;
    END IF;
    UPDATE public.bookings SET finalization_status = 'completed', finalized_at = coalesce(finalized_at, now()),
      finalization_error = NULL, next_finalization_at = NULL, finalization_owner = NULL, finalization_lease_until = NULL WHERE id = b.id;
  ELSIF p_step <> 'heartbeat' THEN RAISE EXCEPTION 'invalid_finalization_step';
  END IF;
  UPDATE public.bookings SET finalization_lease_until = clock_timestamp() + interval '2 minutes'
    WHERE id = b.id AND finalization_owner = p_owner;
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = b.id;
  RETURN to_jsonb(b);
END;
$f$;

-- A durable one-shot claim precedes external delivery. Concurrent workers and
-- crash recovery never redispatch a claimed reminder. Ambiguity needs review;
-- we deliberately prefer a missing reminder over a duplicate email.
CREATE OR REPLACE FUNCTION public.claim_stripe_intake_reminder_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE chosen uuid; result jsonb;
BEGIN
  SELECT f.id INTO chosen
  FROM public.booking_intake_forms f JOIN public.bookings b ON b.id = f.booking_id
  WHERE b.payment_flow = 'stripe' AND b.payment_provider = 'stripe'
    AND b.payment_status = 'paid' AND b.status = 'confirmed' AND b.finalization_status = 'completed'
    AND b.stripe_intake_email_started_at IS NULL
    AND f.source_type = 'booking' AND f.status = 'active' AND f.submitted_at IS NULL
    AND f.ready_email_sent_at IS NULL AND f.ready_email_id IS NULL
    -- Use the current session time so a reschedule shifts eligibility.
    AND clock_timestamp() >= b.starts_at - interval '1 hour'
    AND b.starts_at > clock_timestamp()
    AND f.expires_at > clock_timestamp()
  ORDER BY b.starts_at, f.id
  LIMIT 1 FOR UPDATE OF b, f SKIP LOCKED;
  IF chosen IS NULL THEN RETURN NULL; END IF;
  UPDATE public.bookings b SET stripe_intake_email_started_at = clock_timestamp()
    FROM public.booking_intake_forms f WHERE f.id = chosen AND b.id = f.booking_id;
  -- No provider call is permitted in this phase. Dispatch must first win the
  -- separate durable transition below, even if it subsequently crashes.
  UPDATE public.booking_intake_forms SET ready_email_error = 'reminder_claimed_not_started' WHERE id = chosen;
  SELECT jsonb_build_object('form_id', f.id, 'booking_id', b.id,
    'customer_name', b.customer_name, 'customer_email', b.customer_email,
    'service_name', b.service_name_snapshot, 'access_token_hash', f.access_token_hash,
    'access_token_encrypted', f.access_token_encrypted,
    'claim_started_at', b.stripe_intake_email_started_at,
    'expected_starts_at', b.starts_at) INTO result
  FROM public.booking_intake_forms f JOIN public.bookings b ON b.id = f.booking_id WHERE f.id = chosen;
  RETURN result;
END;
$f$;

-- This is the permission to attempt delivery, not a record of its success.
-- A lost response after COMMIT must be treated as potentially dispatched: never
-- release or repeat the transition. Only its first confirmed winner may send.
CREATE OR REPLACE FUNCTION public.mark_stripe_intake_reminder_dispatch_started_v1(
  p_booking_id uuid, p_form_id uuid, p_claim_started_at timestamptz, p_expected_starts_at timestamptz
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF NOT FOUND OR p_claim_started_at IS NULL OR p_expected_starts_at IS NULL
     OR b.stripe_intake_email_started_at IS DISTINCT FROM p_claim_started_at
     OR b.starts_at IS DISTINCT FROM p_expected_starts_at
     OR b.payment_flow IS DISTINCT FROM 'stripe' OR b.payment_provider IS DISTINCT FROM 'stripe'
     OR b.payment_status IS DISTINCT FROM 'paid' OR b.status IS DISTINCT FROM 'confirmed'
     OR b.finalization_status IS DISTINCT FROM 'completed'
     OR b.starts_at <= clock_timestamp()
     OR clock_timestamp() < b.starts_at - interval '1 hour' THEN RETURN false; END IF;
  SELECT x.* INTO f FROM public.booking_intake_forms x
    WHERE x.id=p_form_id AND x.booking_id=b.id FOR UPDATE;
  IF NOT FOUND OR f.source_type IS DISTINCT FROM 'booking' OR f.status IS DISTINCT FROM 'active'
     OR f.submitted_at IS NOT NULL OR f.expires_at IS NULL OR f.expires_at <= clock_timestamp()
     OR f.ready_email_id IS NOT NULL OR f.ready_email_sent_at IS NOT NULL
     OR f.ready_email_error IS DISTINCT FROM 'reminder_claimed_not_started' THEN RETURN false; END IF;
  UPDATE public.booking_intake_forms SET ready_email_error='reminder_delivery_pending_or_unknown' WHERE id=f.id;
  RETURN true;
END;
$f$;

-- Release only a provably unstarted claim. This also handles submission,
-- cancellation, expiry or rescheduling between claim and pre-dispatch. Once
-- dispatch was marked, even a crash before the actual network call is terminal.
CREATE OR REPLACE FUNCTION public.release_unstarted_stripe_intake_reminder_v1(
  p_booking_id uuid, p_claim_started_at timestamptz
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF NOT FOUND OR p_claim_started_at IS NULL
     OR b.stripe_intake_email_started_at IS DISTINCT FROM p_claim_started_at
     OR b.payment_flow IS DISTINCT FROM 'stripe' THEN RETURN false; END IF;
  SELECT x.* INTO f FROM public.booking_intake_forms x WHERE x.booking_id=b.id FOR UPDATE;
  IF NOT FOUND OR f.source_type IS DISTINCT FROM 'booking'
     OR f.ready_email_id IS NOT NULL OR f.ready_email_sent_at IS NOT NULL
     OR f.ready_email_error IS DISTINCT FROM 'reminder_claimed_not_started' THEN RETURN false; END IF;
  UPDATE public.bookings SET stripe_intake_email_started_at=NULL WHERE id=b.id;
  UPDATE public.booking_intake_forms SET ready_email_error=NULL WHERE id=f.id;
  RETURN true;
END;
$f$;

REVOKE ALL ON FUNCTION public.save_stripe_finalization_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_stripe_finalization_v1(uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.claim_stripe_intake_reminder_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_intake_reminder_v1() TO service_role;
REVOKE ALL ON FUNCTION public.mark_stripe_intake_reminder_dispatch_started_v1(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stripe_intake_reminder_dispatch_started_v1(uuid, uuid, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.release_unstarted_stripe_intake_reminder_v1(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_unstarted_stripe_intake_reminder_v1(uuid, timestamptz) TO service_role;

-- New bookings return to their reference URL. Existing payloads stay immutable.
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
      target := p_site_url || '/reservar/confirmada?ref=' || b.booking_reference;
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
COMMIT;
