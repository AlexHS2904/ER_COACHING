-- PREPARED LOCALLY ONLY. Never auto-apply or backfill historical provenance.
-- Review against the real schema before an independently authorized deployment.
-- No business-row DML runs at application time. All DML below is inside RPCs.
BEGIN;

ALTER TABLE public.bookings ADD COLUMN stripe_mode text, ADD COLUMN stripe_account_id text,
  ADD COLUMN stripe_site_origin text,
  ADD COLUMN session_resolution text CHECK(session_resolution IN ('late_cancel_pending','replacement_approved','replacement_scheduled','consumed','no_show')),
  ADD COLUMN session_resolution_by uuid, ADD COLUMN session_resolution_at timestamptz,
  ADD COLUMN no_show_marked_by uuid, ADD COLUMN no_show_marked_at timestamptz,
  ADD COLUMN replaces_booking_id uuid UNIQUE REFERENCES public.bookings(id);
ALTER TABLE public.booking_payment_attempts ADD COLUMN stripe_mode text, ADD COLUMN stripe_account_id text,
  ADD COLUMN stripe_site_origin text;
ALTER TABLE public.stripe_events ADD COLUMN stripe_mode text, ADD COLUMN stripe_account_id text;
ALTER TABLE public.coaching_processes ADD COLUMN stripe_mode text, ADD COLUMN stripe_account_id text,
  ADD COLUMN access_token_encrypted text, ADD COLUMN purchase_booking_id uuid REFERENCES public.bookings(id),
  ADD COLUMN activated_at timestamptz, ADD COLUMN expires_at timestamptz;
ALTER TABLE public.booking_intake_forms ADD COLUMN process_id uuid REFERENCES public.coaching_processes(id);
ALTER TABLE public.bookings ADD CONSTRAINT booking_session_resolution_evidence CHECK (
  (session_resolution IS NULL AND session_resolution_by IS NULL AND session_resolution_at IS NULL)
  OR (session_resolution IS NOT NULL AND session_resolution_by IS NOT NULL AND session_resolution_at IS NOT NULL));
ALTER TABLE public.bookings ADD CONSTRAINT booking_no_show_evidence CHECK (
  (no_show_marked_by IS NULL AND no_show_marked_at IS NULL) OR
  (no_show_marked_by IS NOT NULL AND no_show_marked_at IS NOT NULL));

ALTER TABLE public.bookings ADD CONSTRAINT bookings_stripe_provenance_complete CHECK (
  (stripe_mode IS NULL AND stripe_account_id IS NULL AND stripe_site_origin IS NULL)
  OR (stripe_mode IS NOT NULL AND stripe_mode IN ('test','live') AND stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
    AND stripe_account_id IS NOT NULL AND stripe_site_origin IS NOT NULL AND payment_flow IS NOT DISTINCT FROM 'stripe'));
ALTER TABLE public.booking_payment_attempts ADD CONSTRAINT payment_attempt_stripe_provenance_complete CHECK (
  (stripe_mode IS NULL AND stripe_account_id IS NULL AND stripe_site_origin IS NULL)
  OR (stripe_mode IS NOT NULL AND stripe_mode IN ('test','live') AND stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
    AND stripe_account_id IS NOT NULL AND stripe_site_origin IS NOT NULL));
ALTER TABLE public.stripe_events ADD CONSTRAINT stripe_events_provenance_complete CHECK (
  (stripe_mode IS NULL AND stripe_account_id IS NULL)
  OR (stripe_mode IS NOT NULL AND stripe_mode IN ('test','live') AND stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
    AND stripe_account_id IS NOT NULL));
ALTER TABLE public.coaching_processes DROP CONSTRAINT coaching_processes_status_check;
ALTER TABLE public.coaching_processes ADD CONSTRAINT coaching_processes_status_check
  CHECK (status IN ('pending_payment','active','completed','cancelled'));
ALTER TABLE public.coaching_processes ADD CONSTRAINT process_stripe_provenance_complete CHECK (
  (stripe_mode IS NULL AND stripe_account_id IS NULL AND purchase_booking_id IS NULL AND activated_at IS NULL)
  OR (stripe_mode IS NOT NULL AND stripe_mode IN ('test','live') AND stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
    AND stripe_account_id IS NOT NULL AND purchase_booking_id IS NOT NULL
    AND access_token_encrypted IS NOT NULL AND total_sessions = 6
    AND (status NOT IN ('active','completed') OR activated_at IS NOT NULL)));
CREATE UNIQUE INDEX process_stripe_purchase_unique ON public.coaching_processes(purchase_booking_id)
  WHERE purchase_booking_id IS NOT NULL;
CREATE UNIQUE INDEX intake_one_per_stripe_process ON public.booking_intake_forms(process_id) WHERE process_id IS NOT NULL;
-- Historical cancelled slots are not reinterpreted or rewritten. New Stripe
-- processes reserve each ordinal once, including cancellation, until an explicit
-- coach-approved replacement policy is designed. Reschedule edits the same row.
CREATE UNIQUE INDEX booking_stripe_process_ordinal_unique ON public.bookings(process_id,package_session_number)
  WHERE process_id IS NOT NULL AND stripe_mode IS NOT NULL
    AND session_resolution IS DISTINCT FROM 'replacement_approved';

-- Prior accepted contracts remain valid for recovery; only the new purchase
-- entry point below requires the new terms. No historical evidence is rewritten.
CREATE OR REPLACE FUNCTION public.assert_current_legal_acceptance_v1(p_legal_acceptance jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
  IF jsonb_typeof(p_legal_acceptance) IS DISTINCT FROM 'object'
    OR p_legal_acceptance-ARRAY['termsAccepted','ageConfirmed','termsVersion','privacyNoticeVersion'] <> '{}'::jsonb
    OR p_legal_acceptance->'termsAccepted' IS DISTINCT FROM 'true'::jsonb
    OR p_legal_acceptance->'ageConfirmed' IS DISTINCT FROM 'true'::jsonb
    OR coalesce(p_legal_acceptance->>'termsVersion','') NOT IN ('2026-10-29.2','2026-10-31.1')
    OR p_legal_acceptance->>'privacyNoticeVersion' IS DISTINCT FROM '2026-10-29.2' THEN
    RAISE EXCEPTION 'legal_acceptance_required';
  END IF;
END;
$f$;

CREATE FUNCTION public.assert_stripe_context_v1(p_stripe_mode text,p_stripe_account_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
  IF p_stripe_mode IS NULL OR p_stripe_mode NOT IN ('test','live')
     OR p_stripe_account_id IS NULL OR p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'stripe_context_mismatch';
  END IF;
END;
$f$;
CREATE FUNCTION public.assert_stripe_booking_context_v1(p_booking_id uuid,p_stripe_mode text,p_stripe_account_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.payment_flow IS DISTINCT FROM 'stripe' OR b.stripe_mode IS DISTINCT FROM p_stripe_mode
    OR b.stripe_account_id IS DISTINCT FROM p_stripe_account_id THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;
END;
$f$;

CREATE FUNCTION public.create_stripe_booking_hold_with_legal_v2(
  p_service_slug text,p_starts_at timestamptz,p_customer_name text,p_customer_email text,p_customer_phone text,p_notes text,
  p_access_token_hash text,p_legal_acceptance jsonb,p_stripe_mode text,p_stripe_account_id text,p_site_url text,
  p_process_access_token_hash text DEFAULT NULL,p_process_access_token_encrypted text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; s public.services%ROWTYPE; cp public.coaching_processes%ROWTYPE;
  r jsonb; fingerprint text; process_id uuid;
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  IF p_legal_acceptance->>'termsVersion' IS DISTINCT FROM '2026-10-31.1' THEN RAISE EXCEPTION 'legal_acceptance_required'; END IF;
  PERFORM public.assert_current_legal_acceptance_v1(p_legal_acceptance);
  IF p_access_token_hash IS NULL OR p_access_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid_access'; END IF;
  IF p_site_url IS NULL OR (p_stripe_mode='live' AND p_site_url <> 'https://www.ednarojocoaching.com')
    OR (p_stripe_mode='test' AND p_site_url !~ '^(http://(localhost|127\.0\.0\.1)(:[0-9]+)?|https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?)$') THEN
    RAISE EXCEPTION 'invalid_site_origin'; END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(btrim(p_service_slug),extract(epoch FROM p_starts_at),
    btrim(p_customer_name),lower(btrim(p_customer_email)),nullif(btrim(p_customer_phone),''),nullif(btrim(p_notes),''),
    p_stripe_mode,p_stripe_account_id,p_site_url)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_access_token_hash,0));
  SELECT x.* INTO b FROM public.bookings x WHERE x.booking_access_token_hash=p_access_token_hash FOR UPDATE;
  IF FOUND THEN
    IF b.stripe_request_fingerprint IS DISTINCT FROM fingerprint OR b.stripe_mode IS DISTINCT FROM p_stripe_mode
      OR b.stripe_account_id IS DISTINCT FROM p_stripe_account_id THEN RAISE EXCEPTION 'flow_mismatch'; END IF;
    SELECT x.* INTO cp FROM public.coaching_processes x WHERE x.id=b.process_id;
    RETURN jsonb_build_object('booking_id',b.id,'booking_reference',b.booking_reference,'payment_expires_at',b.payment_expires_at,
      'process_id',b.process_id,'process_reference',cp.process_reference);
  END IF;
  SELECT x.* INTO s FROM public.services x WHERE x.slug=btrim(p_service_slug) FOR SHARE;
  IF NOT FOUND OR s.active IS DISTINCT FROM true OR s.booking_enabled IS DISTINCT FROM true OR s.requires_quote IS DISTINCT FROM false
    OR NOT ((s.service_type='single' AND s.slug='sesion-1-1' AND s.session_count=1) OR (s.service_type='package' AND s.session_count=6))
    OR s.duration_minutes IS NULL OR s.duration_minutes<=0 OR s.price IS NULL OR s.price<=0
    OR s.price*100<>trunc(s.price*100) OR s.price*100>9007199254740991 OR lower(s.currency) IS DISTINCT FROM 'mxn' THEN
    RAISE EXCEPTION 'service_unavailable'; END IF;
  IF s.service_type='package' AND (p_process_access_token_hash IS NULL OR p_process_access_token_hash !~ '^[a-f0-9]{64}$'
      OR p_process_access_token_encrypted IS NULL OR length(p_process_access_token_encrypted)<32) THEN RAISE EXCEPTION 'invalid_process_access'; END IF;
  IF s.service_type='package' AND (s.duration_minutes<>90 OR
    p_starts_at+make_interval(mins=>s.duration_minutes)>
      ((now() AT TIME ZONE 'America/Mexico_City')+interval '90 days') AT TIME ZONE 'America/Mexico_City') THEN
    RAISE EXCEPTION 'process_outside_validity'; END IF;
  SELECT to_jsonb(x) INTO r FROM public.create_booking(s.slug,p_starts_at,btrim(p_customer_name),lower(btrim(p_customer_email)),
    nullif(btrim(p_customer_phone),''),nullif(btrim(p_notes),'')) x;
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=(r->>'booking_id')::uuid FOR UPDATE;
  IF NOT FOUND OR b.status IS DISTINCT FROM 'pending' OR b.payment_status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'invalid_initial_booking_state'; END IF;
  IF s.service_type='package' THEN
    process_id:=gen_random_uuid();
    INSERT INTO public.coaching_processes(id,process_reference,service_id,customer_name,customer_email,customer_phone,
      service_name_snapshot,duration_minutes_snapshot,price_snapshot,currency_snapshot,total_sessions,access_token_hash,
      access_token_encrypted,status,stripe_mode,stripe_account_id,purchase_booking_id)
    VALUES(process_id,'PROC-'||upper(substr(replace(process_id::text,'-',''),1,8)),s.id,b.customer_name,b.customer_email,b.customer_phone,
      b.service_name_snapshot,b.duration_minutes_snapshot,b.price_snapshot,b.currency_snapshot,s.session_count,p_process_access_token_hash,
      p_process_access_token_encrypted,'pending_payment',p_stripe_mode,p_stripe_account_id,b.id) RETURNING * INTO cp;
  END IF;
  UPDATE public.bookings SET payment_flow='stripe',payment_status='pending',payment_expires_at=b.created_at+interval '30 minutes',
    booking_access_token_hash=p_access_token_hash,stripe_request_fingerprint=fingerprint,finalization_status='not_started',
    stripe_mode=p_stripe_mode,stripe_account_id=p_stripe_account_id,stripe_site_origin=p_site_url,
    session_count_snapshot=s.session_count,process_id=cp.id,package_session_number=CASE WHEN cp.id IS NOT NULL THEN 1 ELSE NULL END
  WHERE id=b.id RETURNING * INTO b;
  PERFORM public.record_booking_legal_acceptance_v1(b.id,p_access_token_hash,p_legal_acceptance);
  RETURN jsonb_build_object('booking_id',b.id,'booking_reference',b.booking_reference,'payment_expires_at',b.payment_expires_at,
    'process_id',b.process_id,'process_reference',cp.process_reference);
EXCEPTION WHEN exclusion_violation OR deadlock_detected THEN RAISE EXCEPTION 'slot_conflict';
END;
$f$;


CREATE OR REPLACE FUNCTION public.claim_stripe_checkout_v2(
  p_booking_id uuid, p_access_token_hash text, p_owner uuid, p_site_url text, p_stripe_mode text, p_stripe_account_id text, p_payment_method_configuration_id text
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
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  IF p_payment_method_configuration_id IS NULL OR p_payment_method_configuration_id !~ '^pmc_[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'invalid_payment_configuration'; END IF;
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.booking_access_token_hash IS DISTINCT FROM p_access_token_hash THEN RAISE EXCEPTION 'invalid_access'; END IF;
  IF p_owner IS NULL THEN RAISE EXCEPTION 'invalid_request'; END IF;
  IF b.stripe_site_origin IS DISTINCT FROM p_site_url THEN RAISE EXCEPTION 'invalid_site_origin'; END IF;
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
      IF previous.stripe_mode IS DISTINCT FROM p_stripe_mode OR previous.stripe_account_id IS DISTINCT FROM p_stripe_account_id OR previous.stripe_site_origin IS DISTINCT FROM p_site_url THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;
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
      payload := jsonb_set(jsonb_set(previous.checkout_payload, '{metadata,payment_attempt_id}', to_jsonb(new_id::text), false), '{payment_intent_data,metadata,payment_attempt_id}',to_jsonb(new_id::text),false);
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
        'metadata', jsonb_build_object('booking_id', b.id::text, 'booking_reference', b.booking_reference, 'payment_attempt_id', new_id::text,'stripe_mode',p_stripe_mode,'stripe_account_id',p_stripe_account_id),
        'payment_intent_data',jsonb_build_object('metadata',jsonb_build_object('booking_id',b.id::text,'booking_reference',b.booking_reference,'payment_attempt_id',new_id::text,'stripe_mode',p_stripe_mode,'stripe_account_id',p_stripe_account_id)),
        'payment_method_configuration',p_payment_method_configuration_id,
        'success_url', target || '&session_id={CHECKOUT_SESSION_ID}', 'cancel_url', target,
        'expires_at', floor(extract(epoch FROM b.payment_expires_at + interval '31 minutes'))::bigint
      );
    END IF;
    INSERT INTO public.booking_payment_attempts(id, booking_id, status, amount_minor, currency, checkout_payload, checkout_creation_state,stripe_mode,stripe_account_id,stripe_site_origin)
      VALUES (new_id, b.id, 'creating', minor::bigint, lower(b.currency_snapshot), payload, 'not_started',p_stripe_mode,p_stripe_account_id,p_site_url) RETURNING * INTO a;
  END IF;
  IF a.stripe_mode IS DISTINCT FROM p_stripe_mode OR a.stripe_account_id IS DISTINCT FROM p_stripe_account_id OR a.stripe_site_origin IS DISTINCT FROM p_site_url THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;
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

CREATE FUNCTION public.begin_stripe_checkout_creation_v2(p_booking_id uuid,p_attempt_id uuid,p_owner uuid,p_stripe_mode text,p_stripe_account_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE result boolean;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);

  IF NOT EXISTS(SELECT 1 FROM public.booking_payment_attempts a WHERE a.id=p_attempt_id AND a.booking_id=p_booking_id
    AND a.stripe_mode=p_stripe_mode AND a.stripe_account_id=p_stripe_account_id) AND p_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;

  result:=public.begin_stripe_checkout_creation_v1(p_booking_id,p_attempt_id,p_owner);
  RETURN result;
END;
$f$;


CREATE FUNCTION public.record_stripe_checkout_failure_v2(p_booking_id uuid,p_attempt_id uuid,p_owner uuid,p_status text,p_error text,p_stripe_mode text,p_stripe_account_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE result boolean;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);

  IF NOT EXISTS(SELECT 1 FROM public.booking_payment_attempts a WHERE a.id=p_attempt_id AND a.booking_id=p_booking_id
    AND a.stripe_mode=p_stripe_mode AND a.stripe_account_id=p_stripe_account_id) AND p_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;

  result:=public.record_stripe_checkout_failure_v1(p_booking_id,p_attempt_id,p_owner,p_status,p_error);
  RETURN result;
END;
$f$;


CREATE FUNCTION public.save_stripe_checkout_v2(p_booking_id uuid,p_attempt_id uuid,p_owner uuid,p_session_id text,p_expires_at timestamptz,p_stripe_mode text,p_stripe_account_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE result boolean;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);

  IF NOT EXISTS(SELECT 1 FROM public.booking_payment_attempts a WHERE a.id=p_attempt_id AND a.booking_id=p_booking_id
    AND a.stripe_mode=p_stripe_mode AND a.stripe_account_id=p_stripe_account_id) AND p_attempt_id IS NOT NULL THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;
  IF p_session_id IS NULL OR (p_stripe_mode='test' AND p_session_id !~ '^cs_test_') OR (p_stripe_mode='live' AND p_session_id !~ '^cs_live_') THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;

  result:=public.save_stripe_checkout_v1(p_booking_id,p_attempt_id,p_owner,p_session_id,p_expires_at);
  RETURN result;
END;
$f$;


CREATE FUNCTION public.expire_stripe_booking_hold_v2(p_booking_id uuid,p_attempt_id uuid,p_remote_expired boolean,p_stripe_mode text,p_stripe_account_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF b.payment_status IS DISTINCT FROM 'pending' OR b.finalization_status='review_required'
    OR b.status NOT IN ('pending','cancelled') OR b.payment_expires_at IS NULL
    OR b.payment_expires_at>clock_timestamp() THEN RETURN false; END IF;
  -- The caller's external observation belongs to one exact attempt. A rejected
  -- attempt can acquire a successor while the worker is contacting Stripe.
  -- Serialize on the booking and prefer the active attempt, even on equal
  -- created_at timestamps: a stale observation must never expire its successor.
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.booking_id=b.id
    ORDER BY CASE WHEN x.status IN ('creating','open','unknown') THEN 0 ELSE 1 END,
      x.created_at DESC,x.id DESC LIMIT 1 FOR UPDATE;
  IF a.id IS DISTINCT FROM p_attempt_id OR a.payment_received_at IS NOT NULL THEN RETURN false; END IF;
  IF a.id IS NOT NULL AND (a.stripe_mode IS DISTINCT FROM p_stripe_mode OR a.stripe_account_id IS DISTINCT FROM p_stripe_account_id)
    THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;
  IF b.status='cancelled' AND b.stripe_expiration_reconciled_at IS NOT NULL
     AND (a.id IS NULL OR a.status='expired') THEN RETURN true; END IF;
  IF a.id IS NOT NULL AND a.status IN ('creating','open','unknown') THEN
    UPDATE public.booking_payment_attempts SET status=CASE WHEN p_remote_expired THEN 'expired' ELSE 'unknown' END,
      last_error=CASE WHEN p_remote_expired THEN NULL ELSE 'expiration_requires_reconciliation' END,
      lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=a.id;
  END IF;
  UPDATE public.bookings SET status='cancelled',expired_at=coalesce(expired_at,now()),cancellation_reason='payment_expired'
    WHERE id=b.id AND status='pending';
  IF p_remote_expired OR a.id IS NULL THEN
    UPDATE public.bookings SET stripe_expiration_reconciled_at=coalesce(stripe_expiration_reconciled_at,now()) WHERE id=b.id;
  END IF;
  UPDATE public.coaching_processes cp SET status='cancelled' WHERE cp.purchase_booking_id=b.id AND cp.status='pending_payment';
  RETURN true;
END;
$f$;

CREATE OR REPLACE FUNCTION public.apply_stripe_checkout_event_v2(p_event_id text, p_event_type text, p_session jsonb,p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE;
  e public.stripe_events%ROWTYPE; problem text; intent text := p_session->>'payment_intent'; accepted boolean := false; cp public.coaching_processes%ROWTYPE; receipt jsonb:=p_session->'verified_payment_intent';
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  IF p_event_type NOT IN ('checkout.session.completed', 'checkout.session.expired')
     OR jsonb_typeof(p_session->'livemode') IS DISTINCT FROM 'boolean' OR (p_session->>'livemode')::boolean IS DISTINCT FROM (p_stripe_mode='live') THEN RAISE EXCEPTION 'invalid_event'; END IF;
  INSERT INTO public.stripe_events(stripe_event_id, event_type, object_id,stripe_mode,stripe_account_id)
    VALUES (p_event_id, p_event_type, p_session->>'id',p_stripe_mode,p_stripe_account_id) ON CONFLICT DO NOTHING;
  SELECT x.* INTO e FROM public.stripe_events x WHERE x.stripe_event_id = p_event_id FOR UPDATE;
  IF e.stripe_mode IS DISTINCT FROM p_stripe_mode OR e.stripe_account_id IS DISTINCT FROM p_stripe_account_id THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;
  IF e.object_id IS DISTINCT FROM p_session->>'id' OR e.event_type <> p_event_type THEN RAISE EXCEPTION 'event_conflict'; END IF;
  IF e.processed_at IS NOT NULL THEN RETURN jsonb_build_object('booking_id', e.booking_id, 'duplicate', true); END IF;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.stripe_checkout_session_id = p_session->>'id';
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_not_bound'; END IF;
  PERFORM 1 FROM public.coaching_processes locked_process WHERE locked_process.id=(SELECT x.process_id FROM public.bookings x WHERE x.id=a.booking_id) FOR UPDATE;
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = a.booking_id FOR UPDATE;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.id = a.id FOR UPDATE;
  IF b.stripe_mode IS DISTINCT FROM p_stripe_mode OR b.stripe_account_id IS DISTINCT FROM p_stripe_account_id OR a.stripe_mode IS DISTINCT FROM p_stripe_mode OR a.stripe_account_id IS DISTINCT FROM p_stripe_account_id THEN RAISE EXCEPTION 'stripe_context_mismatch'; END IF;
  IF b.payment_flow IS DISTINCT FROM 'stripe' OR p_session->>'mode' IS DISTINCT FROM 'payment'
     OR p_session->>'client_reference_id' IS DISTINCT FROM b.id::text
     OR p_session->'metadata'->>'booking_id' IS DISTINCT FROM b.id::text
     OR p_session->'metadata'->>'payment_attempt_id' IS DISTINCT FROM a.id::text
     OR p_session->'metadata'->>'booking_reference' IS DISTINCT FROM b.booking_reference::text
     OR p_session->'metadata'->>'stripe_mode' IS DISTINCT FROM p_stripe_mode OR p_session->'metadata'->>'stripe_account_id' IS DISTINCT FROM p_stripe_account_id THEN problem := 'booking_attempt_mismatch';
  ELSIF (p_session->>'amount_total')::bigint IS DISTINCT FROM a.amount_minor
     OR b.price_snapshot::numeric * 100 IS DISTINCT FROM a.amount_minor::numeric THEN problem := 'amount_mismatch';
  ELSIF p_session->>'currency' IS DISTINCT FROM a.currency
     OR lower(b.currency_snapshot) IS DISTINCT FROM a.currency THEN problem := 'currency_mismatch';
  END IF;
  IF p_event_type = 'checkout.session.completed' THEN
    IF receipt IS NULL OR receipt->>'id' IS DISTINCT FROM intent OR receipt->>'status' IS DISTINCT FROM 'succeeded'
       OR jsonb_typeof(receipt->'livemode') IS DISTINCT FROM 'boolean' OR (receipt->>'livemode')::boolean IS DISTINCT FROM (p_stripe_mode='live')
       OR (receipt->>'amount_received')::bigint IS DISTINCT FROM a.amount_minor OR (receipt->>'amount')::bigint IS DISTINCT FROM a.amount_minor
       OR receipt->>'currency' IS DISTINCT FROM a.currency
       OR receipt->'metadata' IS DISTINCT FROM p_session->'metadata' THEN problem:=coalesce(problem,'payment_intent_mismatch'); END IF;
    IF jsonb_typeof(p_session->'payment_method_types') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_session->'payment_method_types')=0
       OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_session->'payment_method_types') x WHERE x NOT IN ('card','link')) THEN
      problem:=coalesce(problem,'unsupported_payment_method'); END IF;
    IF b.process_id IS NOT NULL THEN
      SELECT x.* INTO cp FROM public.coaching_processes x WHERE x.id=b.process_id FOR UPDATE;
      IF NOT FOUND OR cp.purchase_booking_id IS DISTINCT FROM b.id OR b.package_session_number IS DISTINCT FROM 1
         OR cp.stripe_mode IS DISTINCT FROM p_stripe_mode OR cp.stripe_account_id IS DISTINCT FROM p_stripe_account_id
         OR cp.total_sessions IS DISTINCT FROM 6 OR b.session_count_snapshot IS DISTINCT FROM cp.total_sessions
         OR cp.price_snapshot IS DISTINCT FROM b.price_snapshot OR cp.currency_snapshot IS DISTINCT FROM b.currency_snapshot
         OR cp.status NOT IN ('pending_payment','active') THEN problem:=coalesce(problem,'process_purchase_mismatch'); END IF;
    END IF;
    IF p_session->>'status' IS DISTINCT FROM 'complete' OR p_session->>'payment_status' IS DISTINCT FROM 'paid'
       OR intent IS NULL OR intent !~ '^pi_' THEN problem := coalesce(problem, 'payment_not_paid'); END IF;
    IF p_session->>'payment_status' = 'paid' THEN
      UPDATE public.booking_payment_attempts SET payment_received_at = coalesce(payment_received_at, now()),
        received_amount_minor = (p_session->>'amount_total')::bigint, received_currency = p_session->>'currency',
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, intent), updated_at = now() WHERE id = a.id;
    END IF;
    IF a.stripe_payment_intent_id IS NOT NULL AND a.stripe_payment_intent_id IS DISTINCT FROM intent THEN problem := coalesce(problem, 'payment_identity_conflict'); END IF;
    IF b.payment_status = 'refunded' OR (b.payment_provider IS NOT NULL AND b.payment_provider <> 'stripe')
       OR (b.payment_reference IS NOT NULL AND b.payment_reference IS DISTINCT FROM intent) THEN problem := coalesce(problem, 'payment_identity_conflict'); END IF;
    IF problem IS NULL THEN
      IF (b.status = 'cancelled' AND b.payment_status IS DISTINCT FROM 'paid') OR (b.payment_status <> 'paid' AND b.payment_expires_at <= clock_timestamp())
         OR b.finalization_status = 'review_required' THEN problem := 'payment_after_cancellation'; END IF;
      UPDATE public.bookings SET payment_status = 'paid', payment_provider = 'stripe', payment_reference = intent,
        paid_at = coalesce(paid_at, now()),
        finalization_status = CASE WHEN problem IS NOT NULL THEN 'review_required'
          WHEN finalization_status IN ('processing', 'completed') THEN finalization_status ELSE 'pending' END,
        next_finalization_at = CASE WHEN problem IS NULL THEN now() ELSE NULL END,
        status = CASE WHEN problem IS NOT NULL AND status = 'pending' THEN 'cancelled' ELSE status END,
        expired_at = CASE WHEN problem IS NOT NULL THEN coalesce(expired_at, now()) ELSE expired_at END,
        cancellation_reason = CASE WHEN problem IS NOT NULL THEN coalesce(cancellation_reason, 'payment_expired') ELSE cancellation_reason END
      WHERE id = b.id;
      IF problem IS NULL AND cp.id IS NOT NULL THEN
        UPDATE public.coaching_processes SET status='active',activated_at=coalesce(activated_at,now()),
          expires_at=coalesce(expires_at,((coalesce(b.paid_at,now()) AT TIME ZONE 'America/Mexico_City')+interval '90 days') AT TIME ZONE 'America/Mexico_City')
          WHERE id=cp.id;
      END IF;
      accepted := problem IS NULL;
    END IF;
    IF problem IS NOT NULL THEN
      UPDATE public.bookings SET finalization_status = 'review_required', finalization_error = problem, next_finalization_at = NULL WHERE id = b.id;
    END IF;
    UPDATE public.booking_payment_attempts SET status = CASE WHEN problem IS NULL THEN 'paid' ELSE 'review_required' END,
      last_error = problem, lease_owner = NULL, lease_until = NULL, updated_at = now() WHERE id = a.id;
  ELSIF problem IS NULL AND p_session->>'status' = 'expired' AND p_session->>'payment_status' <> 'paid' THEN
    PERFORM public.expire_stripe_booking_hold_v2(b.id, a.id, true,p_stripe_mode,p_stripe_account_id);
  END IF;
  UPDATE public.stripe_events SET booking_id = b.id, observed_payment_intent_id = intent,
    processed_at = now(), status = CASE WHEN problem IS NULL THEN 'processed' ELSE 'review_required' END,
    processing_error = problem WHERE stripe_event_id = p_event_id;
  RETURN jsonb_build_object('booking_id', b.id, 'accepted', accepted, 'review_required', problem IS NOT NULL);
END;
$f$;

-- New paid work must be backed by an accepted, matching receipt, not a flag.
CREATE FUNCTION public.assert_stripe_paid_entitlement_v1(p_booking_id uuid,p_stripe_mode text,p_stripe_account_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; purchase public.bookings%ROWTYPE; cp public.coaching_processes%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id;
  IF b.payment_status IS DISTINCT FROM 'paid' OR b.payment_provider IS DISTINCT FROM 'stripe' OR b.paid_at IS NULL
     OR b.payment_reference IS NULL OR b.finalization_status='review_required' THEN RAISE EXCEPTION 'stripe_payment_required'; END IF;
  purchase:=b;
  IF b.process_id IS NOT NULL THEN
    -- Do not acquire the process lock after the booking here: process-session
    -- creation takes process->purchase; immutable link/provenance is sufficient.
    SELECT x.* INTO cp FROM public.coaching_processes x WHERE x.id=b.process_id;
    SELECT x.* INTO purchase FROM public.bookings x WHERE x.id=cp.purchase_booking_id;
    IF cp.id IS NULL OR cp.status NOT IN ('active','completed') OR cp.activated_at IS NULL
      OR cp.stripe_mode IS DISTINCT FROM p_stripe_mode OR cp.stripe_account_id IS DISTINCT FROM p_stripe_account_id
      OR b.package_session_number<1 OR b.package_session_number>cp.total_sessions OR cp.total_sessions<>6
      OR b.service_id IS DISTINCT FROM cp.service_id OR b.session_count_snapshot IS DISTINCT FROM cp.total_sessions
      OR b.duration_minutes_snapshot IS DISTINCT FROM cp.duration_minutes_snapshot
      OR purchase.process_id IS DISTINCT FROM cp.id OR purchase.package_session_number IS DISTINCT FROM 1
      OR purchase.session_count_snapshot IS DISTINCT FROM cp.total_sessions OR purchase.price_snapshot IS DISTINCT FROM cp.price_snapshot
      OR purchase.currency_snapshot IS DISTINCT FROM cp.currency_snapshot
      OR purchase.payment_status IS DISTINCT FROM 'paid' OR purchase.payment_provider IS DISTINCT FROM 'stripe'
      OR purchase.stripe_mode IS DISTINCT FROM p_stripe_mode OR purchase.stripe_account_id IS DISTINCT FROM p_stripe_account_id
      OR purchase.payment_reference IS DISTINCT FROM b.payment_reference OR purchase.paid_at IS DISTINCT FROM b.paid_at
      OR purchase.finalization_status='review_required' THEN RAISE EXCEPTION 'stripe_payment_required'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.booking_payment_attempts a WHERE a.booking_id=purchase.id AND a.status='paid'
    AND a.stripe_mode=p_stripe_mode AND a.stripe_account_id=p_stripe_account_id
    AND a.stripe_payment_intent_id=purchase.payment_reference AND a.stripe_checkout_session_id IS NOT NULL
    AND a.payment_received_at IS NOT NULL AND a.amount_minor=purchase.price_snapshot*100
    AND a.received_amount_minor=a.amount_minor AND a.currency=lower(purchase.currency_snapshot) AND a.received_currency=a.currency
    AND EXISTS(SELECT 1 FROM public.stripe_events e WHERE e.booking_id=purchase.id AND e.observed_payment_intent_id=a.stripe_payment_intent_id
      AND e.event_type='checkout.session.completed' AND e.status='processed' AND e.processed_at IS NOT NULL
      AND e.stripe_mode=p_stripe_mode AND e.stripe_account_id=p_stripe_account_id))
    THEN RAISE EXCEPTION 'stripe_payment_required'; END IF;
END;
$f$;
CREATE FUNCTION public.claim_stripe_finalization_v2(p_booking_id uuid,p_owner uuid,p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
BEGIN
  PERFORM public.assert_stripe_paid_entitlement_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  RETURN public.claim_stripe_finalization_v1(p_booking_id,p_owner);
END;
$f$;
CREATE FUNCTION public.save_stripe_finalization_v2(p_booking_id uuid,p_owner uuid,p_step text,p_data jsonb,p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_paid_entitlement_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id;
  IF p_step='completed' AND b.process_id IS NOT NULL THEN
    PERFORM 1 FROM public.booking_intake_forms f WHERE f.process_id=b.process_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.booking_intake_forms f WHERE f.process_id=b.process_id AND f.source_type='booking'
      AND f.booking_id=(SELECT cp.purchase_booking_id FROM public.coaching_processes cp WHERE cp.id=b.process_id)
      AND (b.id<>f.booking_id OR (f.status='submitted' AND f.submitted_at IS NOT NULL) OR (f.status='active' AND f.submitted_at IS NULL
        AND f.expires_at>clock_timestamp() AND f.access_token_hash ~ '^[a-f0-9]{64}$'
        AND f.access_token_encrypted ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{86}$'))) THEN
      RAISE EXCEPTION 'incomplete_finalization'; END IF;
  END IF;
  RETURN public.save_stripe_finalization_v1(p_booking_id,p_owner,p_step,p_data);
END;
$f$;
CREATE FUNCTION public.activate_stripe_intake_v1(p_booking_id uuid,p_stripe_mode text,p_stripe_account_id text,p_access_token_hash text,p_access_token_encrypted text)
RETURNS TABLE(form_id uuid,customer_name text,customer_email text,service_name text,starts_at timestamptz,
  access_token_hash text,access_token_encrypted text,intake_created boolean,payment_already_paid boolean,ready_email_sent_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE; cp public.coaching_processes%ROWTYPE; made boolean:=false;
BEGIN
  PERFORM public.assert_stripe_paid_entitlement_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id;
  IF b.process_id IS NOT NULL THEN
    SELECT x.* INTO cp FROM public.coaching_processes x WHERE x.id=b.process_id;
    SELECT x.* INTO b FROM public.bookings x WHERE x.id=cp.purchase_booking_id FOR UPDATE;
  ELSIF b.session_count_snapshot IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'intake_ineligible'; END IF;
  SELECT x.* INTO f FROM public.booking_intake_forms x WHERE x.booking_id=b.id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_access_token_hash IS NULL OR p_access_token_hash !~ '^[a-f0-9]{64}$' OR p_access_token_encrypted IS NULL
      OR p_access_token_encrypted !~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{86}$' THEN RAISE EXCEPTION 'invalid_access'; END IF;
    INSERT INTO public.booking_intake_forms AS x(booking_id,process_id,source_type,invitee_name,invitee_email,
      access_token_hash,access_token_encrypted,status,current_step,expires_at)
    VALUES(b.id,b.process_id,'booking',b.customer_name,b.customer_email,p_access_token_hash,p_access_token_encrypted,'active',1,
      now()+interval '30 days') RETURNING x.* INTO f;
    made:=true;
  END IF;
  IF f.source_type IS DISTINCT FROM 'booking' OR f.process_id IS DISTINCT FROM b.process_id THEN RAISE EXCEPTION 'intake_identity_conflict'; END IF;
  RETURN QUERY SELECT f.id,b.customer_name,b.customer_email,b.service_name_snapshot,b.starts_at,f.access_token_hash,f.access_token_encrypted,
    made,true,f.ready_email_sent_at;
END;
$f$;
CREATE FUNCTION public.create_stripe_process_session_v1(p_access_token_hash text,p_starts_at timestamptz,p_notes text,
  p_booking_access_token_hash text,p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE cp public.coaching_processes%ROWTYPE; purchase public.bookings%ROWTYPE; b public.bookings%ROWTYPE;
  s public.services%ROWTYPE; fingerprint text; ordinal integer; timezone text; result jsonb; replacement public.bookings%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  IF p_access_token_hash IS NULL OR p_access_token_hash !~ '^[a-f0-9]{64}$' OR p_booking_access_token_hash IS NULL
     OR p_booking_access_token_hash !~ '^[a-f0-9]{64}$' OR p_starts_at IS NULL OR p_starts_at<=clock_timestamp()
     OR length(coalesce(p_notes,''))>2000 THEN RAISE EXCEPTION 'invalid_request'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_booking_access_token_hash,0));
  SELECT x.* INTO cp FROM public.coaching_processes x WHERE x.access_token_hash=p_access_token_hash FOR UPDATE;
  IF NOT FOUND OR cp.status<>'active' OR cp.stripe_mode IS DISTINCT FROM p_stripe_mode OR cp.stripe_account_id IS DISTINCT FROM p_stripe_account_id
    OR cp.total_sessions<>6 OR cp.activated_at IS NULL THEN RAISE EXCEPTION 'process_unavailable'; END IF;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(cp.id,extract(epoch FROM p_starts_at),nullif(btrim(p_notes),''))::text,'UTF8')),'hex');
  SELECT x.* INTO b FROM public.bookings x WHERE x.booking_access_token_hash=p_booking_access_token_hash;
  IF FOUND THEN
    IF b.process_id IS DISTINCT FROM cp.id OR b.stripe_request_fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'flow_mismatch'; END IF;
    RETURN jsonb_build_object('booking_id',b.id,'booking_reference',b.booking_reference,'process_id',cp.id,'process_reference',cp.process_reference,
      'package_session_number',b.package_session_number,'payment_expires_at',b.payment_expires_at);
  END IF;
  PERFORM public.assert_stripe_paid_entitlement_v1(cp.purchase_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO purchase FROM public.bookings x WHERE x.id=cp.purchase_booking_id;
  IF cp.expires_at IS NOT NULL AND (now()>=cp.expires_at OR
    p_starts_at+make_interval(mins=>cp.duration_minutes_snapshot)>cp.expires_at) THEN RAISE EXCEPTION 'process_outside_validity'; END IF;
  SELECT x.* INTO replacement FROM public.bookings x WHERE x.process_id=cp.id
    AND x.session_resolution='replacement_approved'
    AND NOT EXISTS(SELECT 1 FROM public.bookings successor WHERE successor.replaces_booking_id=x.id)
    ORDER BY x.package_session_number FOR UPDATE LIMIT 1;
  SELECT coalesce(max(x.package_session_number),0)+1 INTO ordinal FROM public.bookings x WHERE x.process_id=cp.id;
  IF replacement.id IS NOT NULL THEN ordinal:=replacement.package_session_number; END IF;
  IF ordinal>cp.total_sessions THEN RAISE EXCEPTION 'process_sessions_exhausted'; END IF;
  SELECT x.* INTO s FROM public.services x WHERE x.id=cp.service_id FOR SHARE;
  SELECT x.timezone INTO timezone FROM public.booking_settings x WHERE x.id=1;
  IF s.id IS NULL OR timezone IS NULL OR cp.duration_minutes_snapshot IS NULL OR cp.duration_minutes_snapshot<=0 THEN RAISE EXCEPTION 'process_unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.get_available_slots(s.slug,(p_starts_at AT TIME ZONE timezone)::date) x
    WHERE x.starts_at=p_starts_at AND x.ends_at>=p_starts_at+make_interval(mins=>cp.duration_minutes_snapshot)) THEN RAISE EXCEPTION 'slot_conflict'; END IF;
  INSERT INTO public.bookings(service_id,process_id,package_session_number,service_name_snapshot,duration_minutes_snapshot,
    session_count_snapshot,price_snapshot,currency_snapshot,customer_name,customer_email,customer_phone,notes,starts_at,ends_at,
    payment_flow,payment_status,payment_provider,payment_reference,paid_at,payment_expires_at,booking_access_token_hash,
    stripe_request_fingerprint,stripe_mode,stripe_account_id,stripe_site_origin,finalization_status,next_finalization_at,
    legal_terms_accepted_at,legal_terms_version,legal_privacy_notice_version,legal_adult_confirmed_at,replaces_booking_id)
  VALUES(cp.service_id,cp.id,ordinal,cp.service_name_snapshot,cp.duration_minutes_snapshot,cp.total_sessions,NULL,cp.currency_snapshot,
    cp.customer_name,cp.customer_email,cp.customer_phone,nullif(btrim(p_notes),''),p_starts_at,p_starts_at+make_interval(mins=>cp.duration_minutes_snapshot),
    'stripe','paid','stripe',purchase.payment_reference,purchase.paid_at,purchase.payment_expires_at,p_booking_access_token_hash,
    fingerprint,p_stripe_mode,p_stripe_account_id,purchase.stripe_site_origin,'pending',now(),
    purchase.legal_terms_accepted_at,purchase.legal_terms_version,purchase.legal_privacy_notice_version,purchase.legal_adult_confirmed_at,replacement.id) RETURNING * INTO b;
  RETURN jsonb_build_object('booking_id',b.id,'booking_reference',b.booking_reference,'process_id',cp.id,'process_reference',cp.process_reference,
    'package_session_number',b.package_session_number,'payment_expires_at',b.payment_expires_at);
EXCEPTION WHEN exclusion_violation OR deadlock_detected THEN RAISE EXCEPTION 'slot_conflict';
END;
$f$;


CREATE OR REPLACE FUNCTION public.save_intake_with_legal_consent_v1(
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
    IF f.process_id IS NOT NULL THEN
      IF b.id IS NULL OR b.process_id IS DISTINCT FROM f.process_id OR b.package_session_number IS DISTINCT FROM 1
        OR NOT EXISTS(SELECT 1 FROM public.coaching_processes cp WHERE cp.id=f.process_id AND cp.purchase_booking_id=b.id
          AND cp.status IN ('active','completed') AND cp.activated_at IS NOT NULL AND cp.stripe_mode=b.stripe_mode AND cp.stripe_account_id=b.stripe_account_id)
        THEN RETURN jsonb_build_object('error_code','booking_unavailable'); END IF;
      BEGIN
        PERFORM public.assert_stripe_paid_entitlement_v1(b.id,b.stripe_mode,b.stripe_account_id);
      EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('error_code','booking_unavailable'); END;
    ELSE
    IF b.id IS NULL OR b.status = 'cancelled' OR b.payment_status IS DISTINCT FROM 'paid'
       OR s.id IS NULL OR s.slug IS DISTINCT FROM 'sesion-1-1' OR s.service_type IS DISTINCT FROM 'single'
       OR s.session_count IS DISTINCT FROM 1 OR coalesce(b.session_count_snapshot, 1) <> 1
       OR b.process_id IS NOT NULL OR b.package_session_number IS NOT NULL THEN
      RETURN jsonb_build_object('error_code', 'booking_unavailable');
    END IF;
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

CREATE OR REPLACE FUNCTION public.apply_stripe_checkout_event_v1(p_event_id text, p_event_type text, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE;
  e public.stripe_events%ROWTYPE; problem text; intent text := p_session->>'payment_intent'; accepted boolean := false;
BEGIN
  IF p_event_type NOT IN ('checkout.session.completed', 'checkout.session.expired')
     OR coalesce((p_session->>'livemode')::boolean, true) THEN RAISE EXCEPTION 'invalid_event'; END IF;
  INSERT INTO public.stripe_events(stripe_event_id, event_type, object_id)
    VALUES (p_event_id, p_event_type, p_session->>'id') ON CONFLICT DO NOTHING;
  SELECT x.* INTO e FROM public.stripe_events x WHERE x.stripe_event_id = p_event_id FOR UPDATE;
  IF e.object_id IS DISTINCT FROM p_session->>'id' OR e.event_type <> p_event_type THEN RAISE EXCEPTION 'event_conflict'; END IF;
  IF e.processed_at IS NOT NULL THEN RETURN jsonb_build_object('booking_id', e.booking_id, 'duplicate', true); END IF;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.stripe_checkout_session_id = p_session->>'id';
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_not_bound'; END IF;
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = a.booking_id FOR UPDATE;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.id = a.id FOR UPDATE;
  IF b.stripe_mode IS NOT NULL OR a.stripe_mode IS NOT NULL THEN RAISE EXCEPTION 'stripe_v2_required'; END IF;
  IF b.payment_flow IS DISTINCT FROM 'stripe' OR p_session->>'mode' IS DISTINCT FROM 'payment'
     OR p_session->>'client_reference_id' IS DISTINCT FROM b.id::text
     OR p_session->'metadata'->>'booking_id' IS DISTINCT FROM b.id::text
     OR p_session->'metadata'->>'payment_attempt_id' IS DISTINCT FROM a.id::text
     OR p_session->'metadata'->>'booking_reference' IS DISTINCT FROM b.booking_reference::text THEN problem := 'booking_attempt_mismatch';
  ELSIF (p_session->>'amount_total')::bigint IS DISTINCT FROM a.amount_minor
     OR b.price_snapshot::numeric * 100 IS DISTINCT FROM a.amount_minor::numeric THEN problem := 'amount_mismatch';
  ELSIF p_session->>'currency' IS DISTINCT FROM a.currency
     OR lower(b.currency_snapshot) IS DISTINCT FROM a.currency THEN problem := 'currency_mismatch';
  END IF;
  IF p_event_type = 'checkout.session.completed' THEN
    IF p_session->>'status' IS DISTINCT FROM 'complete' OR p_session->>'payment_status' IS DISTINCT FROM 'paid'
       OR intent IS NULL OR intent !~ '^pi_' THEN problem := coalesce(problem, 'payment_not_paid'); END IF;
    IF p_session->>'payment_status' = 'paid' THEN
      UPDATE public.booking_payment_attempts SET payment_received_at = coalesce(payment_received_at, now()),
        received_amount_minor = (p_session->>'amount_total')::bigint, received_currency = p_session->>'currency',
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, intent), updated_at = now() WHERE id = a.id;
    END IF;
    IF a.stripe_payment_intent_id IS NOT NULL AND a.stripe_payment_intent_id IS DISTINCT FROM intent THEN problem := coalesce(problem, 'payment_identity_conflict'); END IF;
    IF b.payment_status = 'refunded' OR (b.payment_provider IS NOT NULL AND b.payment_provider <> 'stripe')
       OR (b.payment_reference IS NOT NULL AND b.payment_reference IS DISTINCT FROM intent) THEN problem := coalesce(problem, 'payment_identity_conflict'); END IF;
    IF problem IS NULL THEN
      IF b.status = 'cancelled' OR (b.payment_status <> 'paid' AND b.payment_expires_at <= clock_timestamp())
         OR b.finalization_status = 'review_required' THEN problem := 'payment_after_cancellation'; END IF;
      UPDATE public.bookings SET payment_status = 'paid', payment_provider = 'stripe', payment_reference = intent,
        paid_at = coalesce(paid_at, now()),
        finalization_status = CASE WHEN problem IS NOT NULL THEN 'review_required'
          WHEN finalization_status IN ('processing', 'completed') THEN finalization_status ELSE 'pending' END,
        next_finalization_at = CASE WHEN problem IS NULL THEN now() ELSE NULL END,
        status = CASE WHEN problem IS NOT NULL AND status = 'pending' THEN 'cancelled' ELSE status END,
        expired_at = CASE WHEN problem IS NOT NULL THEN coalesce(expired_at, now()) ELSE expired_at END,
        cancellation_reason = CASE WHEN problem IS NOT NULL THEN coalesce(cancellation_reason, 'payment_expired') ELSE cancellation_reason END
      WHERE id = b.id;
      accepted := problem IS NULL;
    END IF;
    IF problem IS NOT NULL THEN
      UPDATE public.bookings SET finalization_status = 'review_required', finalization_error = problem, next_finalization_at = NULL WHERE id = b.id;
    END IF;
    UPDATE public.booking_payment_attempts SET status = CASE WHEN problem IS NULL THEN 'paid' ELSE 'review_required' END,
      last_error = problem, lease_owner = NULL, lease_until = NULL, updated_at = now() WHERE id = a.id;
  ELSIF problem IS NULL AND p_session->>'status' = 'expired' AND p_session->>'payment_status' <> 'paid' THEN
    PERFORM public.expire_stripe_booking_hold_v1(b.id, a.id, true);
  END IF;
  UPDATE public.stripe_events SET booking_id = b.id, observed_payment_intent_id = intent,
    processed_at = now(), status = CASE WHEN problem IS NULL THEN 'processed' ELSE 'review_required' END,
    processing_error = problem WHERE stripe_event_id = p_event_id;
  RETURN jsonb_build_object('booking_id', b.id, 'accepted', accepted, 'review_required', problem IS NOT NULL);
END;
$f$;

-- Durable admin-requested schedule changes. No rows are inserted when applied.
CREATE TABLE public.booking_change_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  request_id uuid NOT NULL,
  change_kind text NOT NULL CHECK (change_kind IN ('rescheduled','cancelled')),
  requested_starts_at timestamptz,
  stripe_mode text NOT NULL CHECK (stripe_mode IN ('test','live')),
  stripe_account_id text NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  booking_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retryable','completed','review_required')),
  lease_owner uuid, lease_until timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz DEFAULT now(),
  calendar_completed_at timestamptz,
  email_started_at timestamptz, email_id text, email_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_change_request_unique UNIQUE (booking_id,request_id),
  CONSTRAINT booking_change_kind_time CHECK ((change_kind='rescheduled' AND requested_starts_at IS NOT NULL)
    OR (change_kind='cancelled' AND requested_starts_at IS NULL)),
  CONSTRAINT booking_change_email_receipt CHECK ((email_id IS NULL AND email_sent_at IS NULL)
    OR (email_id IS NOT NULL AND email_started_at IS NOT NULL AND email_sent_at IS NOT NULL))
);
CREATE UNIQUE INDEX booking_change_one_unresolved ON public.booking_change_jobs(booking_id)
  WHERE status IN ('pending','processing','retryable','review_required');
CREATE INDEX booking_change_due ON public.booking_change_jobs(stripe_mode,stripe_account_id,next_attempt_at)
  WHERE status IN ('pending','processing','retryable');
ALTER TABLE public.booking_change_jobs ENABLE ROW LEVEL SECURITY;
-- Production default privileges grant ALL to service_role on new tables.
-- Business writes on this outbox must use its lease-checked RPCs only.
REVOKE ALL ON public.booking_change_jobs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.booking_change_jobs TO service_role;

CREATE FUNCTION public.request_stripe_booking_change_v1(
  p_booking_id uuid,p_change_kind text,p_starts_at timestamptz,p_request_id uuid,
  p_stripe_mode text,p_stripe_account_id text,p_admin_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; j public.booking_change_jobs%ROWTYPE;
  next_ends_at timestamptz; timezone_name text; snapshot jsonb;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF p_request_id IS NULL OR p_change_kind IS NULL OR p_change_kind NOT IN ('rescheduled','cancelled')
    OR (p_change_kind='rescheduled' AND p_starts_at IS NULL)
    OR (p_change_kind='cancelled' AND p_starts_at IS NOT NULL) THEN RAISE EXCEPTION 'invalid_booking_change'; END IF;
  SELECT x.* INTO j FROM public.booking_change_jobs x WHERE x.booking_id=b.id AND x.request_id=p_request_id;
  IF FOUND THEN
    IF j.change_kind IS DISTINCT FROM p_change_kind OR j.requested_starts_at IS DISTINCT FROM p_starts_at
      OR j.stripe_mode IS DISTINCT FROM p_stripe_mode OR j.stripe_account_id IS DISTINCT FROM p_stripe_account_id THEN
      RAISE EXCEPTION 'booking_change_request_mismatch'; END IF;
    RETURN jsonb_build_object('job_id',j.id,'booking_id',b.id,'status',j.status);
  END IF;
  -- A lost HTTP response may be retried with a regenerated browser request ID.
  -- An identical unresolved change still refers to the same durable operation.
  SELECT x.* INTO j FROM public.booking_change_jobs x WHERE x.booking_id=b.id
    AND x.status IN ('pending','processing','retryable','review_required');
  IF FOUND THEN
    IF j.change_kind=p_change_kind AND j.requested_starts_at IS NOT DISTINCT FROM p_starts_at THEN
      RETURN jsonb_build_object('job_id',j.id,'booking_id',b.id,'status',j.status); END IF;
    RAISE EXCEPTION 'booking_change_in_progress';
  END IF;
  -- Completed requests also deduplicate when the requested result is still
  -- the current business state. Repeating an old target after another real
  -- reschedule is a new operation and must not reuse that older email receipt.
  SELECT x.* INTO j FROM public.booking_change_jobs x WHERE x.booking_id=b.id AND x.status='completed'
    AND x.change_kind=p_change_kind AND x.requested_starts_at IS NOT DISTINCT FROM p_starts_at
    AND ((p_change_kind='cancelled' AND b.status='cancelled')
      OR (p_change_kind='rescheduled' AND b.status='confirmed' AND b.starts_at=p_starts_at))
    ORDER BY x.created_at DESC,x.id DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('job_id',j.id,'booking_id',b.id,'status',j.status); END IF;
  PERFORM public.assert_stripe_paid_entitlement_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  IF b.status IS DISTINCT FROM 'confirmed' OR b.finalization_status IS DISTINCT FROM 'completed'
    OR b.google_event_id IS NULL OR b.google_meet_url IS NULL OR (b.starts_at<=now() AND NOT coalesce(
      b.process_id IS NULL AND ((p_change_kind='rescheduled' AND b.session_resolution='replacement_approved')
        OR (p_change_kind='cancelled' AND b.session_resolution='consumed')),false)) THEN
    RAISE EXCEPTION 'booking_change_not_allowed'; END IF;
  IF p_change_kind='cancelled' AND b.process_id IS NULL AND b.legal_terms_version='2026-10-31.1'
    AND b.starts_at<now()+interval '24 hours' AND b.session_resolution IS DISTINCT FROM 'consumed' THEN
    IF NOT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.user_id=p_admin_user_id AND u.active) THEN RAISE EXCEPTION 'admin_required'; END IF;
    IF b.session_resolution IS DISTINCT FROM 'late_cancel_pending' THEN
      UPDATE public.bookings SET session_resolution='late_cancel_pending',session_resolution_by=p_admin_user_id,
        session_resolution_at=now(),updated_at=now() WHERE id=b.id;
    END IF;
    -- Keep the original appointment/event until the coach decides; a permitted
    -- replacement then uses the SAME booking, Calendar identity and Intake.
    RETURN jsonb_build_object('booking_id',b.id,'review_pending',true,'status',b.status);
  END IF;
  IF p_change_kind='rescheduled' THEN
    IF b.session_resolution='late_cancel_pending' THEN RAISE EXCEPTION 'session_decision_required'; END IF;
    IF p_starts_at<=now() OR p_starts_at=b.starts_at THEN RAISE EXCEPTION 'invalid_booking_change'; END IF;
    IF EXISTS(SELECT 1 FROM public.coaching_processes cp WHERE cp.id=b.process_id AND cp.expires_at IS NOT NULL
      AND (now()>=cp.expires_at OR p_starts_at+make_interval(mins=>b.duration_minutes_snapshot)>cp.expires_at)) THEN
      RAISE EXCEPTION 'process_outside_validity'; END IF;
    SELECT x.timezone INTO timezone_name FROM public.booking_settings x WHERE x.id=1;
    IF NOT EXISTS (SELECT 1 FROM public.get_reschedule_slots(b.id,(p_starts_at AT TIME ZONE coalesce(timezone_name,'America/Mexico_City'))::date) s
      WHERE s.starts_at=p_starts_at) THEN RAISE EXCEPTION 'slot_unavailable'; END IF;
    next_ends_at:=p_starts_at+make_interval(mins=>b.duration_minutes_snapshot);
    UPDATE public.bookings SET starts_at=p_starts_at,ends_at=next_ends_at,updated_at=now(),
      session_resolution=CASE WHEN process_id IS NULL AND session_resolution='replacement_approved' THEN 'replacement_scheduled' ELSE session_resolution END
      WHERE id=b.id RETURNING * INTO b;
  ELSE
    -- A definitive administrative cancellation does not issue a refund or
    -- restore a process ordinal. Coach-approved exceptions stay manual.
    IF b.starts_at<now()+interval '24 hours' AND EXISTS(SELECT 1 FROM public.coaching_processes cp
        WHERE cp.id=b.process_id AND cp.expires_at IS NOT NULL) THEN
      IF NOT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.user_id=p_admin_user_id AND u.active) THEN RAISE EXCEPTION 'admin_required'; END IF;
      UPDATE public.bookings SET session_resolution='late_cancel_pending',session_resolution_by=p_admin_user_id,session_resolution_at=now() WHERE id=b.id;
    END IF;
    UPDATE public.bookings SET status='cancelled',cancellation_reason='admin_cancelled',updated_at=now()
      WHERE id=b.id RETURNING * INTO b;
  END IF;
  snapshot:=jsonb_build_object('id',b.id,'booking_reference',b.booking_reference,
    'customer_name',b.customer_name,'customer_email',b.customer_email,'customer_phone',b.customer_phone,
    'service_name_snapshot',b.service_name_snapshot,'duration_minutes_snapshot',b.duration_minutes_snapshot,
    'session_count_snapshot',b.session_count_snapshot,'price_snapshot',b.price_snapshot,'currency_snapshot',b.currency_snapshot,
    'notes',b.notes,'starts_at',b.starts_at,'ends_at',b.ends_at,'google_event_id',b.google_event_id,
    'google_meet_url',b.google_meet_url,'process_id',b.process_id,'package_session_number',b.package_session_number,'replaces_booking_id',b.replaces_booking_id);
  INSERT INTO public.booking_change_jobs(booking_id,request_id,change_kind,requested_starts_at,stripe_mode,stripe_account_id,booking_snapshot)
    VALUES(b.id,p_request_id,p_change_kind,p_starts_at,p_stripe_mode,p_stripe_account_id,snapshot) RETURNING * INTO j;
  RETURN jsonb_build_object('job_id',j.id,'booking_id',b.id,'status',j.status);
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'slot_unavailable';
END;
$f$;

CREATE FUNCTION public.claim_stripe_booking_change_v1(
  p_job_id uuid,p_owner uuid,p_stripe_mode text,p_stripe_account_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE j public.booking_change_jobs%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  IF p_owner IS NULL THEN RAISE EXCEPTION 'invalid_booking_change_owner'; END IF;
  SELECT x.* INTO j FROM public.booking_change_jobs x
    WHERE (p_job_id IS NULL OR x.id=p_job_id) AND x.stripe_mode=p_stripe_mode AND x.stripe_account_id=p_stripe_account_id
      AND x.status IN ('pending','retryable','processing') AND x.next_attempt_at<=now()
      AND (x.lease_until IS NULL OR x.lease_until<=now())
    ORDER BY x.next_attempt_at,x.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false); END IF;
  -- The request was paid when queued; recheck immediately before any worker
  -- can contact Calendar/Resend. A later refund or process revocation goes to
  -- review without replaying side effects or preventing unrelated jobs.
  BEGIN
    PERFORM public.assert_stripe_paid_entitlement_v1(j.booking_id,p_stripe_mode,p_stripe_account_id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.booking_change_jobs SET status='review_required',last_error='booking_change_payment_review',
      lease_owner=NULL,lease_until=NULL,next_attempt_at=NULL,updated_at=now() WHERE id=j.id;
    RETURN jsonb_build_object('claimed',false,'review_required',true);
  END;
  IF j.email_started_at IS NOT NULL AND j.email_id IS NULL AND j.email_started_at<=now()-interval '23 hours' THEN
    UPDATE public.booking_change_jobs SET status='review_required',last_error='booking_change_email_delivery_unknown',
      lease_owner=NULL,lease_until=NULL,next_attempt_at=NULL,updated_at=now() WHERE id=j.id;
    RETURN jsonb_build_object('claimed',false,'review_required',true);
  END IF;
  UPDATE public.booking_change_jobs SET status='processing',lease_owner=p_owner,lease_until=now()+interval '2 minutes',
    attempt_count=attempt_count+1,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('claimed',true,'job',to_jsonb(j));
END;
$f$;

CREATE FUNCTION public.save_stripe_booking_change_v1(p_job_id uuid,p_owner uuid,p_action text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE j public.booking_change_jobs%ROWTYPE;
BEGIN
  SELECT x.* INTO j FROM public.booking_change_jobs x WHERE x.id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status IS DISTINCT FROM 'processing' OR j.lease_owner IS DISTINCT FROM p_owner
    OR j.lease_until IS NULL OR j.lease_until<=now() THEN RAISE EXCEPTION 'booking_change_lease_lost'; END IF;
  IF p_action='heartbeat' THEN
    UPDATE public.booking_change_jobs SET lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=j.id;
  ELSIF p_action='calendar_completed' THEN
    UPDATE public.booking_change_jobs SET calendar_completed_at=coalesce(calendar_completed_at,now()),updated_at=now() WHERE id=j.id;
  ELSIF p_action='email_started' THEN
    IF j.calendar_completed_at IS NULL THEN RAISE EXCEPTION 'booking_change_calendar_pending'; END IF;
    IF j.email_started_at IS NOT NULL AND j.email_started_at<=now()-interval '23 hours' AND j.email_id IS NULL THEN
      RAISE EXCEPTION 'booking_change_email_delivery_unknown'; END IF;
    UPDATE public.booking_change_jobs SET email_started_at=coalesce(email_started_at,now()),updated_at=now() WHERE id=j.id;
  ELSIF p_action='email_sent' THEN
    IF j.calendar_completed_at IS NULL OR j.email_started_at IS NULL OR nullif(p_payload->>'id','') IS NULL THEN
      RAISE EXCEPTION 'booking_change_email_not_started'; END IF;
    IF j.email_id IS NOT NULL AND j.email_id IS DISTINCT FROM p_payload->>'id' THEN RAISE EXCEPTION 'booking_change_email_identity_conflict'; END IF;
    UPDATE public.booking_change_jobs SET email_id=p_payload->>'id',email_sent_at=coalesce(email_sent_at,now()),updated_at=now() WHERE id=j.id;
  ELSIF p_action='completed' THEN
    IF j.calendar_completed_at IS NULL OR j.email_id IS NULL OR j.email_sent_at IS NULL THEN RAISE EXCEPTION 'booking_change_incomplete'; END IF;
    UPDATE public.booking_change_jobs SET status='completed',last_error=NULL,lease_owner=NULL,lease_until=NULL,next_attempt_at=NULL,updated_at=now() WHERE id=j.id;
  ELSIF p_action IN ('retryable','review_required') THEN
    UPDATE public.booking_change_jobs SET status=p_action,
      last_error=CASE WHEN p_action='review_required' THEN 'booking_change_requires_review' ELSE 'booking_change_retryable' END,
      lease_owner=NULL,lease_until=NULL,
      next_attempt_at=CASE WHEN p_action='retryable' THEN now()+make_interval(secs=>least(3600,60*power(2,least(attempt_count,6)))::integer) ELSE NULL END,
      updated_at=now() WHERE id=j.id;
  ELSE RAISE EXCEPTION 'invalid_booking_change_action'; END IF;
  SELECT x.* INTO j FROM public.booking_change_jobs x WHERE x.id=p_job_id;
  RETURN to_jsonb(j);
END;
$f$;

ALTER FUNCTION public.request_stripe_booking_change_v1(uuid,text,timestamptz,uuid,text,text,uuid) OWNER TO postgres;
ALTER FUNCTION public.claim_stripe_booking_change_v1(uuid,uuid,text,text) OWNER TO postgres;
ALTER FUNCTION public.save_stripe_booking_change_v1(uuid,uuid,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_stripe_booking_change_v1(uuid,text,timestamptz,uuid,text,text,uuid),
  public.claim_stripe_booking_change_v1(uuid,uuid,text,text),public.save_stripe_booking_change_v1(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_stripe_booking_change_v1(uuid,text,timestamptz,uuid,text,text,uuid),
  public.claim_stripe_booking_change_v1(uuid,uuid,text,text),public.save_stripe_booking_change_v1(uuid,uuid,text,jsonb) TO service_role;


-- A process shares one form/reminder; claiming a different covered session must
-- never clear an already started or ambiguous delivery on that shared form.
CREATE FUNCTION public.claim_stripe_intake_reminder_v2(p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE chosen_form_id uuid; chosen_booking_id uuid; result jsonb;
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  SELECT f.id,b.id INTO chosen_form_id,chosen_booking_id FROM public.bookings b
    JOIN public.booking_intake_forms f ON (f.booking_id=b.id OR (b.process_id IS NOT NULL AND f.process_id=b.process_id))
    WHERE b.stripe_mode=p_stripe_mode AND b.stripe_account_id=p_stripe_account_id
      AND b.payment_flow='stripe' AND b.payment_provider='stripe' AND b.payment_status='paid'
      AND b.status='confirmed' AND b.finalization_status='completed' AND b.stripe_intake_email_started_at IS NULL
      AND f.source_type='booking' AND f.status='active' AND f.submitted_at IS NULL
      AND f.ready_email_error IS NULL AND f.ready_email_sent_at IS NULL AND f.ready_email_id IS NULL
      AND clock_timestamp()>=b.starts_at-interval '1 hour' AND b.starts_at>clock_timestamp()
      AND f.expires_at>clock_timestamp()
    ORDER BY b.starts_at,f.id LIMIT 1 FOR UPDATE OF b,f SKIP LOCKED;
  IF chosen_form_id IS NULL THEN RETURN NULL; END IF;
  PERFORM public.assert_stripe_paid_entitlement_v1(chosen_booking_id,p_stripe_mode,p_stripe_account_id);
  UPDATE public.bookings b SET stripe_intake_email_started_at=clock_timestamp() WHERE b.id=chosen_booking_id;
  UPDATE public.booking_intake_forms f SET ready_email_error='reminder_claimed_not_started' WHERE f.id=chosen_form_id;
  SELECT jsonb_build_object('form_id',f.id,'booking_id',b.id,'customer_name',b.customer_name,
    'customer_email',b.customer_email,'service_name',b.service_name_snapshot,'access_token_hash',f.access_token_hash,
    'access_token_encrypted',f.access_token_encrypted,'claim_started_at',b.stripe_intake_email_started_at,
    'expected_starts_at',b.starts_at,'stripe_site_origin',b.stripe_site_origin) INTO result
    FROM public.bookings b JOIN public.booking_intake_forms f ON f.id=chosen_form_id WHERE b.id=chosen_booking_id;
  RETURN result;
END;
$f$;
CREATE FUNCTION public.mark_stripe_intake_reminder_dispatch_started_v2(p_booking_id uuid,p_form_id uuid,
  p_claim_started_at timestamptz,p_expected_starts_at timestamptz,p_stripe_mode text,p_stripe_account_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF p_claim_started_at IS NULL OR p_expected_starts_at IS NULL
    OR b.stripe_intake_email_started_at IS DISTINCT FROM p_claim_started_at OR b.starts_at IS DISTINCT FROM p_expected_starts_at
    OR b.payment_status IS DISTINCT FROM 'paid' OR b.status IS DISTINCT FROM 'confirmed'
    OR b.finalization_status IS DISTINCT FROM 'completed' OR b.starts_at<=clock_timestamp()
    OR clock_timestamp()<b.starts_at-interval '1 hour' THEN RETURN false; END IF;
  SELECT x.* INTO f FROM public.booking_intake_forms x WHERE x.id=p_form_id
    AND (x.booking_id=b.id OR (b.process_id IS NOT NULL AND x.process_id=b.process_id)) FOR UPDATE;
  IF NOT FOUND OR f.source_type IS DISTINCT FROM 'booking' OR f.status IS DISTINCT FROM 'active'
    OR f.submitted_at IS NOT NULL OR f.expires_at IS NULL OR f.expires_at<=clock_timestamp()
    OR f.ready_email_id IS NOT NULL OR f.ready_email_sent_at IS NOT NULL
    OR f.ready_email_error IS DISTINCT FROM 'reminder_claimed_not_started' THEN RETURN false; END IF;
  PERFORM public.assert_stripe_paid_entitlement_v1(b.id,p_stripe_mode,p_stripe_account_id);
  UPDATE public.booking_intake_forms SET ready_email_error='reminder_delivery_pending_or_unknown' WHERE id=f.id;
  RETURN true;
END;
$f$;
CREATE FUNCTION public.release_unstarted_stripe_intake_reminder_v2(p_booking_id uuid,p_claim_started_at timestamptz,
  p_stripe_mode text,p_stripe_account_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF p_claim_started_at IS NULL OR b.stripe_intake_email_started_at IS DISTINCT FROM p_claim_started_at THEN RETURN false; END IF;
  SELECT x.* INTO f FROM public.booking_intake_forms x WHERE x.booking_id=b.id
    OR (b.process_id IS NOT NULL AND x.process_id=b.process_id) FOR UPDATE;
  IF NOT FOUND OR f.source_type IS DISTINCT FROM 'booking' OR f.ready_email_id IS NOT NULL OR f.ready_email_sent_at IS NOT NULL
    OR f.ready_email_error IS DISTINCT FROM 'reminder_claimed_not_started' THEN RETURN false; END IF;
  UPDATE public.bookings SET stripe_intake_email_started_at=NULL WHERE id=b.id;
  UPDATE public.booking_intake_forms SET ready_email_error=NULL WHERE id=f.id;
  RETURN true;
END;
$f$;

-- One admin decision on the existing session. The ordinal stays reserved while
-- pending; approving replacement releases only that ordinal, once, within the
-- original expiry. No new tables, refunds, notifications or historical backfill.
CREATE FUNCTION public.resolve_stripe_session_v1(p_booking_id uuid,p_action text,p_admin_user_id uuid,
  p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; cp public.coaching_processes%ROWTYPE; target text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.user_id=p_admin_user_id AND u.active) THEN RAISE EXCEPTION 'admin_required'; END IF;
  -- Same process->booking lock order as session creation/payment processing.
  SELECT x.* INTO cp FROM public.coaching_processes x WHERE x.id=(SELECT y.process_id FROM public.bookings y WHERE y.id=p_booking_id) FOR UPDATE;
  PERFORM public.assert_stripe_paid_entitlement_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF b.legal_terms_version IS DISTINCT FROM '2026-10-31.1' OR
    (b.process_id IS NOT NULL AND cp.expires_at IS NULL) THEN RAISE EXCEPTION 'historical_conditions_unchanged'; END IF;
  target:=CASE p_action WHEN 'no_show' THEN 'no_show' WHEN 'consume' THEN 'consumed'
    WHEN 'approve_replacement' THEN 'replacement_approved' ELSE NULL END;
  IF target IS NULL THEN RAISE EXCEPTION 'invalid_session_resolution'; END IF;
  IF b.session_resolution=target THEN RETURN to_jsonb(b); END IF;
  IF p_action='no_show' THEN
    IF b.status IS DISTINCT FROM 'confirmed' OR b.finalization_status IS DISTINCT FROM 'completed'
      OR b.starts_at>now() OR b.session_resolution='late_cancel_pending' THEN RAISE EXCEPTION 'session_not_started'; END IF;
  ELSE
    IF NOT coalesce(((b.status='cancelled' OR (b.process_id IS NULL AND b.status='confirmed')) AND b.session_resolution='late_cancel_pending') OR
      (p_action='approve_replacement' AND b.status='no_show' AND b.session_resolution='no_show'),false) THEN
      RAISE EXCEPTION 'session_already_resolved'; END IF;
    IF p_action='approve_replacement' AND cp.id IS NOT NULL AND cp.expires_at<=now() THEN RAISE EXCEPTION 'process_outside_validity'; END IF;
  END IF;
  UPDATE public.bookings SET session_resolution=target,session_resolution_by=p_admin_user_id,
    no_show_marked_by=CASE WHEN p_action='no_show' THEN p_admin_user_id ELSE no_show_marked_by END,
    no_show_marked_at=CASE WHEN p_action='no_show' THEN now() ELSE no_show_marked_at END,
    session_resolution_at=now(),status=CASE WHEN p_action='no_show' THEN 'no_show'
      WHEN p_action='approve_replacement' AND process_id IS NULL THEN 'confirmed'
      -- The real legacy unique index excludes only cancelled bookings. Release
      -- that index too; dedicated no_show fields preserve the original evidence.
      WHEN p_action='approve_replacement' AND process_id IS NOT NULL THEN 'cancelled'
      ELSE status END,updated_at=now()
    WHERE id=b.id RETURNING * INTO b;
  IF p_action='consume' AND b.process_id IS NULL THEN
    PERFORM public.request_stripe_booking_change_v1(b.id,'cancelled',NULL,gen_random_uuid(),p_stripe_mode,p_stripe_account_id,p_admin_user_id);
    SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id;
  END IF;
  RETURN to_jsonb(b);
END;
$f$;

DO $permissions$
DECLARE p record;
BEGIN
  FOR p IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
    'assert_stripe_context_v1','assert_stripe_booking_context_v1','assert_stripe_paid_entitlement_v1',
    'assert_current_legal_acceptance_v1','resolve_stripe_session_v1',
    'create_stripe_booking_hold_with_legal_v2','claim_stripe_checkout_v2','begin_stripe_checkout_creation_v2',
    'record_stripe_checkout_failure_v2','save_stripe_checkout_v2','expire_stripe_booking_hold_v2','apply_stripe_checkout_event_v2',
    'claim_stripe_finalization_v2','save_stripe_finalization_v2','activate_stripe_intake_v1','create_stripe_process_session_v1',
    'save_intake_with_legal_consent_v1','apply_stripe_checkout_event_v1',
    'claim_stripe_intake_reminder_v2','mark_stripe_intake_reminder_dispatch_started_v2','release_unstarted_stripe_intake_reminder_v2')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',p.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',p.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p.signature);
  END LOOP;
END;
$permissions$;
COMMIT;
