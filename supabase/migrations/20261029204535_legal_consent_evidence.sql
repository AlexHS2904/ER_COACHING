-- PREPARED ONLY: requires a separate schema preflight and explicit application.
-- Do not execute during the legal draft task. No historical backfill/DML runs
-- when this file is applied; writes below are bodies of service-role RPCs.
BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS legal_terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_terms_version text,
  ADD COLUMN IF NOT EXISTS legal_privacy_notice_version text,
  ADD COLUMN IF NOT EXISTS legal_adult_confirmed_at timestamptz;

ALTER TABLE public.booking_intake_forms
  ADD COLUMN IF NOT EXISTS sensitive_data_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sensitive_data_consent_version text;

DO $checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_legal_acceptance_complete') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_legal_acceptance_complete CHECK (
      (legal_terms_accepted_at IS NULL AND legal_terms_version IS NULL
        AND legal_privacy_notice_version IS NULL AND legal_adult_confirmed_at IS NULL)
      OR
      (legal_terms_accepted_at IS NOT NULL AND length(btrim(legal_terms_version)) > 0
        AND legal_terms_version IS NOT NULL AND legal_privacy_notice_version IS NOT NULL
        AND length(btrim(legal_privacy_notice_version)) > 0 AND legal_adult_confirmed_at IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.booking_intake_forms'::regclass AND conname = 'intake_sensitive_consent_complete') THEN
    ALTER TABLE public.booking_intake_forms ADD CONSTRAINT intake_sensitive_consent_complete CHECK (
      (sensitive_data_consent_at IS NULL AND sensitive_data_consent_version IS NULL)
      OR (sensitive_data_consent_at IS NOT NULL AND sensitive_data_consent_version IS NOT NULL
        AND length(btrim(sensitive_data_consent_version)) > 0)
    );
  END IF;
END;
$checks$;

-- Exactly the current public declaration, never client timestamps/IP/UA.
CREATE FUNCTION public.assert_current_legal_acceptance_v1(p_legal_acceptance jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $f$
BEGIN
  IF jsonb_typeof(p_legal_acceptance) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'legal_acceptance_required';
  END IF;
  IF p_legal_acceptance - ARRAY['termsAccepted','ageConfirmed','termsVersion','privacyNoticeVersion'] <> '{}'::jsonb
     OR p_legal_acceptance->'termsAccepted' IS DISTINCT FROM 'true'::jsonb
     OR p_legal_acceptance->'ageConfirmed' IS DISTINCT FROM 'true'::jsonb
     OR p_legal_acceptance->>'termsVersion' IS DISTINCT FROM '2026-10-29.2'
     OR p_legal_acceptance->>'privacyNoticeVersion' IS DISTINCT FROM '2026-10-29.2' THEN
    RAISE EXCEPTION 'legal_acceptance_required';
  END IF;
END;
$f$;

CREATE FUNCTION public.record_booking_legal_acceptance_v1(
  p_booking_id uuid, p_access_token_hash text, p_legal_acceptance jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; accepted_at timestamptz;
BEGIN
  IF p_access_token_hash IS NULL OR p_access_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_access';
  END IF;
  SELECT x.* INTO b FROM public.bookings x
    WHERE x.id = p_booking_id AND x.booking_access_token_hash = p_access_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_access'; END IF;
  PERFORM public.assert_current_legal_acceptance_v1(p_legal_acceptance);
  -- A retry never replaces the first evidence, identity, hold or payment state.
  IF b.legal_terms_accepted_at IS NOT NULL THEN RETURN true; END IF;
  accepted_at := clock_timestamp();
  UPDATE public.bookings x SET
    legal_terms_accepted_at = accepted_at,
    legal_terms_version = p_legal_acceptance->>'termsVersion',
    legal_privacy_notice_version = p_legal_acceptance->>'privacyNoticeVersion',
    legal_adult_confirmed_at = accepted_at
  WHERE x.id = b.id;
  RETURN true;
END;
$f$;

CREATE FUNCTION public.create_stripe_booking_hold_with_legal_v1(
  p_service_slug text, p_starts_at timestamptz, p_customer_name text,
  p_customer_email text, p_customer_phone text, p_notes text,
  p_access_token_hash text, p_legal_acceptance jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_current_legal_acceptance_v1(p_legal_acceptance);
  -- Existing RPC retains availability, fingerprint, advisory lock, booking
  -- identity and created_at + 30 minutes, including a repeated flow request.
  result := public.create_stripe_booking_hold_v1(
    p_service_slug => p_service_slug, p_starts_at => p_starts_at,
    p_customer_name => p_customer_name, p_customer_email => p_customer_email,
    p_customer_phone => p_customer_phone, p_notes => p_notes,
    p_access_token_hash => p_access_token_hash);
  IF result->>'booking_id' IS NULL THEN RAISE EXCEPTION 'hold_creation_failed'; END IF;
  PERFORM public.record_booking_legal_acceptance_v1((result->>'booking_id')::uuid,
    p_access_token_hash, p_legal_acceptance);
  -- A failure above rolls back both the original hold and legal evidence.
  RETURN result;
END;
$f$;

CREATE FUNCTION public.create_booking_with_legal_v1(
  p_service_slug text, p_starts_at timestamptz, p_customer_name text,
  p_customer_email text, p_customer_phone text, p_notes text, p_legal_acceptance jsonb
) RETURNS TABLE(booking_id uuid, booking_reference text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE result jsonb; accepted_at timestamptz;
BEGIN
  PERFORM public.assert_current_legal_acceptance_v1(p_legal_acceptance);
  SELECT to_jsonb(x) INTO STRICT result FROM public.create_booking(
    p_service_slug => p_service_slug, p_starts_at => p_starts_at,
    p_customer_name => p_customer_name, p_customer_email => p_customer_email,
    p_customer_phone => p_customer_phone, p_notes => p_notes) x;
  IF result->>'booking_id' IS NULL OR result->>'booking_reference' IS NULL THEN
    RAISE EXCEPTION 'booking_creation_failed';
  END IF;
  PERFORM 1 FROM public.bookings x WHERE x.id = (result->>'booking_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_creation_failed'; END IF;
  accepted_at := clock_timestamp();
  UPDATE public.bookings x SET legal_terms_accepted_at = accepted_at,
    legal_terms_version = p_legal_acceptance->>'termsVersion',
    legal_privacy_notice_version = p_legal_acceptance->>'privacyNoticeVersion',
    legal_adult_confirmed_at = accepted_at
  WHERE x.id = (result->>'booking_id')::uuid AND x.legal_terms_accepted_at IS NULL;
  RETURN QUERY SELECT (result->>'booking_id')::uuid, result->>'booking_reference';
END;
$f$;

CREATE FUNCTION public.create_package_booking_with_legal_v1(
  p_service_slug text, p_starts_at timestamptz, p_customer_name text,
  p_customer_email text, p_access_token_hash text, p_customer_phone text,
  p_notes text, p_legal_acceptance jsonb
) RETURNS TABLE(booking_id uuid, booking_reference text, process_id uuid, process_reference text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE result jsonb; accepted_at timestamptz;
BEGIN
  PERFORM public.assert_current_legal_acceptance_v1(p_legal_acceptance);
  SELECT to_jsonb(x) INTO STRICT result FROM public.create_package_booking(
    p_service_slug => p_service_slug, p_starts_at => p_starts_at,
    p_customer_name => p_customer_name, p_customer_email => p_customer_email,
    p_access_token_hash => p_access_token_hash, p_customer_phone => p_customer_phone,
    p_notes => p_notes) x;
  IF result->>'booking_id' IS NULL OR result->>'booking_reference' IS NULL
     OR result->>'process_id' IS NULL OR result->>'process_reference' IS NULL THEN
    RAISE EXCEPTION 'package_creation_failed';
  END IF;
  PERFORM 1 FROM public.bookings x WHERE x.id = (result->>'booking_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_creation_failed'; END IF;
  accepted_at := clock_timestamp();
  UPDATE public.bookings x SET legal_terms_accepted_at = accepted_at,
    legal_terms_version = p_legal_acceptance->>'termsVersion',
    legal_privacy_notice_version = p_legal_acceptance->>'privacyNoticeVersion',
    legal_adult_confirmed_at = accepted_at
  WHERE x.id = (result->>'booking_id')::uuid AND x.legal_terms_accepted_at IS NULL;
  RETURN QUERY SELECT (result->>'booking_id')::uuid, result->>'booking_reference',
    (result->>'process_id')::uuid, result->>'process_reference';
END;
$f$;

CREATE FUNCTION public.save_intake_with_legal_consent_v1(
  p_form_id uuid, p_access_token_hash text, p_answers jsonb,
  p_current_step integer, p_submit boolean, p_privacy_notice_version text,
  p_sensitive_data_consent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE
  f public.booking_intake_forms%ROWTYPE;
  a public.booking_intake_forms%ROWTYPE;
  b public.bookings%ROWTYPE;
  s public.services%ROWTYPE;
  expected_booking_id uuid;
  saved_at timestamptz;
  supplied_age numeric;
BEGIN
  IF p_access_token_hash IS NULL OR p_access_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error_code', 'invalid_access');
  END IF;
  IF p_sensitive_data_consent IS DISTINCT FROM true
     OR p_privacy_notice_version IS DISTINCT FROM '2026-10-29.2' THEN
    RETURN jsonb_build_object('error_code', 'consent_required');
  END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('error_code', 'invalid_age');
  END IF;
  IF jsonb_typeof(p_answers->'age') IS DISTINCT FROM 'number' THEN
    RETURN jsonb_build_object('error_code', 'invalid_age');
  END IF;
  supplied_age := (p_answers->>'age')::numeric;
  IF supplied_age < 18 OR supplied_age > 120 OR supplied_age <> trunc(supplied_age) THEN
    RETURN jsonb_build_object('error_code', 'invalid_age');
  END IF;
  IF p_answers - ARRAY['age','occupation','current_situation','discovery_source','motivation',
      'current_challenges','challenge_duration','desired_outcome','desired_change',
      'blocking_factors','strengths','main_concern','previous_attempts',
      'support_preferences','additional_notes'] <> '{}'::jsonb
     OR p_current_step IS NULL OR p_current_step < 1 OR p_current_step > 5 OR p_submit IS NULL THEN
    RAISE EXCEPTION 'invalid_intake_payload';
  END IF;

  SELECT x.booking_id INTO expected_booking_id FROM public.booking_intake_forms x
    WHERE x.id = p_form_id AND x.access_token_hash = p_access_token_hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('error_code', 'invalid_access'); END IF;
  -- Match activation/finalizer lock order: booking, service (if present), form.
  -- Never hold a form lock while waiting for its booking.
  IF expected_booking_id IS NOT NULL THEN
    SELECT x.* INTO b FROM public.bookings x WHERE x.id = expected_booking_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error_code', 'booking_unavailable'); END IF;
    SELECT x.* INTO s FROM public.services x WHERE x.id = b.service_id FOR SHARE;
  END IF;
  SELECT x.* INTO f FROM public.booking_intake_forms x
    WHERE x.id = p_form_id AND x.access_token_hash = p_access_token_hash FOR UPDATE;
  IF NOT FOUND OR f.booking_id IS DISTINCT FROM expected_booking_id THEN
    RETURN jsonb_build_object('error_code', 'invalid_access');
  END IF;
  IF f.submitted_at IS NOT NULL OR f.status = 'submitted' THEN
    RETURN jsonb_build_object('error_code', 'already_submitted');
  END IF;
  saved_at := clock_timestamp();
  IF f.expires_at IS NOT NULL AND f.expires_at <= saved_at THEN
    RETURN jsonb_build_object('error_code', 'expired');
  END IF;
  IF f.status IS DISTINCT FROM 'active' THEN RETURN jsonb_build_object('error_code', 'inactive'); END IF;
  IF f.source_type = 'booking' THEN
    IF b.id IS NULL OR b.status = 'cancelled' OR b.payment_status IS DISTINCT FROM 'paid'
       OR s.id IS NULL OR s.slug IS DISTINCT FROM 'sesion-1-1' OR s.service_type IS DISTINCT FROM 'single'
       OR s.session_count IS DISTINCT FROM 1 OR coalesce(b.session_count_snapshot, 1) <> 1
       OR b.process_id IS NOT NULL OR b.package_session_number IS NOT NULL THEN
      RETURN jsonb_build_object('error_code', 'booking_unavailable');
    END IF;
  ELSIF f.source_type IS DISTINCT FROM 'manual' OR f.booking_id IS NOT NULL THEN
    RETURN jsonb_build_object('error_code', 'invalid_access');
  END IF;
  IF nullif(btrim(coalesce(f.invitee_name, b.customer_name)), '') IS NULL
     OR nullif(btrim(coalesce(f.invitee_email, b.customer_email)), '') IS NULL THEN
    RETURN jsonb_build_object('error_code', 'invalid_access');
  END IF;

  -- Populate using actual column types (including existing arrays), only after
  -- whitelist/age/ownership checks; browser identity/status/tokens are excluded.
  SELECT * INTO a FROM jsonb_populate_record(NULL::public.booking_intake_forms, p_answers);
  UPDATE public.booking_intake_forms x SET
    age = a.age, occupation = a.occupation, current_situation = a.current_situation,
    discovery_source = a.discovery_source, motivation = a.motivation,
    current_challenges = a.current_challenges, challenge_duration = a.challenge_duration,
    desired_outcome = a.desired_outcome, desired_change = a.desired_change,
    blocking_factors = a.blocking_factors, strengths = a.strengths,
    main_concern = a.main_concern, previous_attempts = a.previous_attempts,
    support_preferences = a.support_preferences, additional_notes = a.additional_notes,
    sensitive_data_consent_at = coalesce(f.sensitive_data_consent_at, saved_at),
    sensitive_data_consent_version = coalesce(f.sensitive_data_consent_version, p_privacy_notice_version),
    current_step = CASE WHEN p_submit THEN 5 ELSE p_current_step END,
    invitee_name = CASE WHEN p_submit THEN coalesce(f.invitee_name, b.customer_name) ELSE f.invitee_name END,
    invitee_email = CASE WHEN p_submit THEN coalesce(f.invitee_email, b.customer_email) ELSE f.invitee_email END,
    status = CASE WHEN p_submit THEN 'submitted' ELSE f.status END,
    submitted_at = CASE WHEN p_submit THEN saved_at ELSE f.submitted_at END
  WHERE x.id = f.id RETURNING x.* INTO f;
  RETURN jsonb_build_object('form', to_jsonb(f));
END;
$f$;

ALTER FUNCTION public.assert_current_legal_acceptance_v1(jsonb) OWNER TO postgres;
ALTER FUNCTION public.record_booking_legal_acceptance_v1(uuid,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.create_stripe_booking_hold_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.create_booking_with_legal_v1(text,timestamptz,text,text,text,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.create_package_booking_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) OWNER TO postgres;
ALTER FUNCTION public.save_intake_with_legal_consent_v1(uuid,text,jsonb,integer,boolean,text,boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assert_current_legal_acceptance_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_booking_legal_acceptance_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_stripe_booking_hold_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_booking_with_legal_v1(text,timestamptz,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_package_booking_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_intake_with_legal_consent_v1(uuid,text,jsonb,integer,boolean,text,boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_current_legal_acceptance_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_booking_legal_acceptance_v1(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_stripe_booking_hold_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_with_legal_v1(text,timestamptz,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_package_booking_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_intake_with_legal_consent_v1(uuid,text,jsonb,integer,boolean,text,boolean) TO service_role;

COMMIT;
