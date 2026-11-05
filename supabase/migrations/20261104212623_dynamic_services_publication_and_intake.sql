-- LOCAL ONLY. Additive publication and immutable intake eligibility.
-- No business-history backfill. The only application-time DML sets current core
-- service metadata; bookings/processes/attempts/events/intakes remain untouched.
BEGIN;
ALTER TABLE public.services ADD COLUMN published boolean NOT NULL DEFAULT true,
  ADD COLUMN requires_intake boolean NOT NULL DEFAULT false;
UPDATE public.services SET requires_intake=true
  WHERE slug='sesion-1-1' AND service_type='single' AND session_count=1;
ALTER TABLE public.services ADD CONSTRAINT services_intake_core_only CHECK (
  NOT requires_intake OR (slug='sesion-1-1' AND service_type='single' AND session_count=1));
ALTER TABLE public.bookings ADD COLUMN requires_intake_snapshot boolean;
COMMENT ON COLUMN public.bookings.requires_intake_snapshot IS
  'Immutable purchase eligibility. NULL preserves the pre-migration intake contract; never backfill historical rows.';

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active services" ON public.services;
CREATE POLICY "Public can view active services" ON public.services FOR SELECT TO anon,authenticated
  USING (active=true AND published=true);
-- A permissive policy elsewhere must never accidentally expose hidden services.
CREATE POLICY services_publication_guard ON public.services AS RESTRICTIVE FOR SELECT TO anon,authenticated
  USING (active=true AND published=true);

CREATE FUNCTION public.booking_requires_intake_v1(p_booking_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; purchase public.bookings%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF b.requires_intake_snapshot IS NOT NULL THEN RETURN b.requires_intake_snapshot; END IF;
  IF b.process_id IS NOT NULL THEN
    SELECT x.* INTO purchase FROM public.bookings x JOIN public.coaching_processes cp ON cp.purchase_booking_id=x.id
      WHERE cp.id=b.process_id;
    IF purchase.requires_intake_snapshot IS NOT NULL THEN RETURN purchase.requires_intake_snapshot; END IF;
    RETURN true; -- historical shared process intake, without rewriting history
  END IF;
  RETURN b.package_session_number IS NULL AND coalesce(b.session_count_snapshot,1)=1 AND EXISTS(
    SELECT 1 FROM public.services s WHERE s.id=b.service_id AND s.slug='sesion-1-1'
      AND s.service_type='single' AND s.session_count=1);
END;
$f$;

-- Preserve the installed availability result shape (Production has additional
-- columns to the test fixture). Internal calculations are inaccessible through
-- the Data API; paid package scheduling can still use them after unpublishing.
ALTER FUNCTION public.get_available_slots(text,date) RENAME TO dynamic_available_slots_base_v1;
ALTER FUNCTION public.create_booking(text,timestamptz,text,text,text,text) RENAME TO dynamic_create_booking_base_v1;
DO $wrap$
DECLARE result_type text; definition text;
BEGIN
  SELECT pg_get_function_result('public.dynamic_available_slots_base_v1(text,date)'::regprocedure) INTO result_type;
  EXECUTE format($sql$CREATE FUNCTION public.get_available_slots(p_service_slug text,p_date date)
    RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.services s WHERE s.slug=p_service_slug
        AND s.active=true AND s.published=true AND s.booking_enabled=true AND s.requires_quote=false) THEN RETURN; END IF;
      RETURN QUERY SELECT * FROM public.dynamic_available_slots_base_v1(p_service_slug,p_date);
    END; $body$;$sql$,result_type);
  EXECUTE format($sql$CREATE FUNCTION public.get_admin_available_slots_v1(p_service_id uuid,p_date date,p_admin_user_id uuid)
    RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
    DECLARE slug text;
    BEGIN
      IF p_admin_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.admin_users a
        WHERE a.user_id=p_admin_user_id AND a.active=true) THEN RAISE EXCEPTION 'admin_required'; END IF;
      SELECT s.slug INTO slug FROM public.services s WHERE s.id=p_service_id AND s.active=true
        AND s.booking_enabled=true AND s.requires_quote=false;
      IF NOT FOUND THEN RETURN; END IF;
      RETURN QUERY SELECT * FROM public.dynamic_available_slots_base_v1(slug,p_date);
    END; $body$;$sql$,result_type);
  -- The original scheduling/business implementation is retained verbatim except
  -- this internal availability call, so authorized hidden holds use its rules.
  SELECT pg_get_functiondef('public.dynamic_create_booking_base_v1(text,timestamptz,text,text,text,text)'::regprocedure) INTO definition;
  definition:=replace(definition,'public.get_available_slots(', 'public.dynamic_available_slots_base_v1(');
  EXECUTE definition;
  SELECT pg_get_function_result('public.dynamic_create_booking_base_v1(text,timestamptz,text,text,text,text)'::regprocedure) INTO result_type;
  EXECUTE format($sql$CREATE FUNCTION public.create_booking(p_service_slug text,p_starts_at timestamptz,
    p_customer_name text,p_customer_email text,p_customer_phone text DEFAULT NULL,p_notes text DEFAULT NULL)
    RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.services s WHERE s.slug=p_service_slug AND s.active=true AND s.published=true)
        THEN RAISE EXCEPTION 'service_unavailable'; END IF;
      RETURN QUERY SELECT * FROM public.dynamic_create_booking_base_v1(p_service_slug,p_starts_at,
        p_customer_name,p_customer_email,p_customer_phone,p_notes);
    END; $body$;$sql$,result_type);
END;
$wrap$;
REVOKE ALL ON FUNCTION public.dynamic_available_slots_base_v1(text,date),
  public.dynamic_create_booking_base_v1(text,timestamptz,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.create_stripe_booking_hold_with_legal_v3(
  p_service_id uuid,p_starts_at timestamptz,p_customer_name text,p_customer_email text,p_customer_phone text,p_notes text,
  p_access_token_hash text,p_legal_acceptance jsonb,p_stripe_mode text,p_stripe_account_id text,p_site_url text,
  p_process_access_token_hash text DEFAULT NULL,p_process_access_token_encrypted text DEFAULT NULL,p_admin_user_id uuid DEFAULT NULL
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
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_service_id,extract(epoch FROM p_starts_at),
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
  SELECT x.* INTO s FROM public.services x WHERE x.id=p_service_id FOR SHARE;
  IF NOT FOUND OR s.active IS DISTINCT FROM true OR s.booking_enabled IS DISTINCT FROM true OR s.requires_quote IS DISTINCT FROM false
    OR NOT ((s.service_type='single' AND s.session_count=1) OR (s.service_type='package' AND s.session_count=6))
    OR s.duration_minutes IS NULL OR s.duration_minutes<=0 OR s.price IS NULL OR s.price<=0
    OR s.price*100<>trunc(s.price*100) OR s.price*100>9007199254740991 OR lower(s.currency) IS DISTINCT FROM 'mxn' THEN
    RAISE EXCEPTION 'service_unavailable'; END IF;
  IF s.published IS DISTINCT FROM true AND (p_admin_user_id IS NULL OR p_stripe_mode IS DISTINCT FROM 'live'
    OR p_site_url IS DISTINCT FROM 'https://www.ednarojocoaching.com' OR NOT EXISTS(SELECT 1 FROM public.admin_users a
      WHERE a.user_id=p_admin_user_id AND a.active=true)) THEN RAISE EXCEPTION 'service_unavailable'; END IF;
  IF s.service_type='package' AND (p_process_access_token_hash IS NULL OR p_process_access_token_hash !~ '^[a-f0-9]{64}$'
      OR p_process_access_token_encrypted IS NULL OR length(p_process_access_token_encrypted)<32) THEN RAISE EXCEPTION 'invalid_process_access'; END IF;
  IF s.service_type='package' AND (s.duration_minutes<>90 OR
    p_starts_at+make_interval(mins=>s.duration_minutes)>
      ((now() AT TIME ZONE 'America/Mexico_City')+interval '90 days') AT TIME ZONE 'America/Mexico_City') THEN
    RAISE EXCEPTION 'process_outside_validity'; END IF;
  SELECT to_jsonb(x) INTO r FROM public.dynamic_create_booking_base_v1(s.slug,p_starts_at,btrim(p_customer_name),lower(btrim(p_customer_email)),
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
    requires_intake_snapshot=(s.service_type='single' AND s.requires_intake),
    session_count_snapshot=s.session_count,process_id=cp.id,package_session_number=CASE WHEN cp.id IS NOT NULL THEN 1 ELSE NULL END
  WHERE id=b.id RETURNING * INTO b;
  PERFORM public.record_booking_legal_acceptance_v1(b.id,p_access_token_hash,p_legal_acceptance);
  RETURN jsonb_build_object('booking_id',b.id,'booking_reference',b.booking_reference,'payment_expires_at',b.payment_expires_at,
    'process_id',b.process_id,'process_reference',cp.process_reference);
EXCEPTION WHEN exclusion_violation OR deadlock_detected THEN RAISE EXCEPTION 'slot_conflict';
END;
$f$;

-- Compatibility entry point: existing caller signature remains valid, but
-- cannot opt into private visibility. Existing holds retain their old fingerprint.
CREATE OR REPLACE FUNCTION public.create_stripe_booking_hold_with_legal_v2(
  p_service_slug text,p_starts_at timestamptz,p_customer_name text,p_customer_email text,p_customer_phone text,p_notes text,
  p_access_token_hash text,p_legal_acceptance jsonb,p_stripe_mode text,p_stripe_account_id text,p_site_url text,
  p_process_access_token_hash text DEFAULT NULL,p_process_access_token_encrypted text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE s public.services%ROWTYPE; b public.bookings%ROWTYPE; cp public.coaching_processes%ROWTYPE; fingerprint text;
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  PERFORM public.assert_current_legal_acceptance_v1(p_legal_acceptance);
  -- Do not reinterpret existing v2 request fingerprints after the entrypoint upgrade.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_access_token_hash,0));
  SELECT x.* INTO b FROM public.bookings x WHERE x.booking_access_token_hash=p_access_token_hash FOR UPDATE;
  IF FOUND AND b.requires_intake_snapshot IS NULL THEN
    fingerprint:=encode(sha256(convert_to(jsonb_build_array(btrim(p_service_slug),extract(epoch FROM p_starts_at),
      btrim(p_customer_name),lower(btrim(p_customer_email)),nullif(btrim(p_customer_phone),''),nullif(btrim(p_notes),''),
      p_stripe_mode,p_stripe_account_id,p_site_url)::text,'UTF8')),'hex');
    IF b.stripe_request_fingerprint IS DISTINCT FROM fingerprint OR b.stripe_mode IS DISTINCT FROM p_stripe_mode
      OR b.stripe_account_id IS DISTINCT FROM p_stripe_account_id THEN RAISE EXCEPTION 'flow_mismatch'; END IF;
    SELECT x.* INTO cp FROM public.coaching_processes x WHERE x.id=b.process_id;
    RETURN jsonb_build_object('booking_id',b.id,'booking_reference',b.booking_reference,'payment_expires_at',b.payment_expires_at,
      'process_id',b.process_id,'process_reference',cp.process_reference);
  END IF;
  SELECT x.* INTO s FROM public.services x WHERE x.slug=btrim(p_service_slug) AND x.published=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_unavailable'; END IF;
  RETURN public.create_stripe_booking_hold_with_legal_v3(s.id,p_starts_at,p_customer_name,p_customer_email,p_customer_phone,
    p_notes,p_access_token_hash,p_legal_acceptance,p_stripe_mode,p_stripe_account_id,p_site_url,
    p_process_access_token_hash,p_process_access_token_encrypted,NULL);
END;
$f$;

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
    IF public.booking_requires_intake_v1(b.id) AND b.process_id IS NULL THEN
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

CREATE OR REPLACE FUNCTION public.save_stripe_finalization_v2(p_booking_id uuid,p_owner uuid,p_step text,p_data jsonb,p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_paid_entitlement_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id;
  IF p_step='completed' AND b.process_id IS NOT NULL AND public.booking_requires_intake_v1(b.id) THEN
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

CREATE OR REPLACE FUNCTION public.activate_stripe_intake_v1(p_booking_id uuid,p_stripe_mode text,p_stripe_account_id text,p_access_token_hash text,p_access_token_encrypted text)
RETURNS TABLE(form_id uuid,customer_name text,customer_email text,service_name text,starts_at timestamptz,
  access_token_hash text,access_token_encrypted text,intake_created boolean,payment_already_paid boolean,ready_email_sent_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE; cp public.coaching_processes%ROWTYPE; made boolean:=false;
BEGIN
  PERFORM public.assert_stripe_paid_entitlement_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id;
  IF NOT public.booking_requires_intake_v1(b.id) THEN RAISE EXCEPTION 'intake_ineligible'; END IF;
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
  v_service public.services%ROWTYPE;
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

  -- Eligibility follows stable identity, never the display name/snapshot.
  -- Keep the service identity stable during this transaction. A service may
  -- have been unpublished after booking: active/booking_enabled are purchase
  -- controls, not a reason to deny an existing booking its intake.
  SELECT s.* INTO v_service
  FROM public.services AS s
  WHERE s.id = v_booking.service_id
  FOR SHARE;

  IF NOT public.booking_requires_intake_v1(v_booking.id)
     OR coalesce(v_booking.session_count_snapshot,1) <> 1
     OR v_booking.process_id IS NOT NULL OR v_booking.package_session_number IS NOT NULL THEN
    RAISE EXCEPTION 'El formulario previo solo aplica a reservas individuales del servicio sesion-1-1.';
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

CREATE OR REPLACE FUNCTION public.create_stripe_process_session_v1(p_access_token_hash text,p_starts_at timestamptz,p_notes text,
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
  IF NOT EXISTS(SELECT 1 FROM public.dynamic_available_slots_base_v1(s.slug,(p_starts_at AT TIME ZONE timezone)::date) x
    WHERE x.starts_at=p_starts_at AND x.ends_at>=p_starts_at+make_interval(mins=>cp.duration_minutes_snapshot)) THEN RAISE EXCEPTION 'slot_conflict'; END IF;
  INSERT INTO public.bookings(service_id,process_id,package_session_number,service_name_snapshot,duration_minutes_snapshot,
    session_count_snapshot,price_snapshot,currency_snapshot,customer_name,customer_email,customer_phone,notes,starts_at,ends_at,
    payment_flow,payment_status,payment_provider,payment_reference,paid_at,payment_expires_at,booking_access_token_hash,
    stripe_request_fingerprint,stripe_mode,stripe_account_id,stripe_site_origin,finalization_status,next_finalization_at,
    legal_terms_accepted_at,legal_terms_version,legal_privacy_notice_version,legal_adult_confirmed_at,replaces_booking_id,requires_intake_snapshot)
  VALUES(cp.service_id,cp.id,ordinal,cp.service_name_snapshot,cp.duration_minutes_snapshot,cp.total_sessions,NULL,cp.currency_snapshot,
    cp.customer_name,cp.customer_email,cp.customer_phone,nullif(btrim(p_notes),''),p_starts_at,p_starts_at+make_interval(mins=>cp.duration_minutes_snapshot),
    'stripe','paid','stripe',purchase.payment_reference,purchase.paid_at,purchase.payment_expires_at,p_booking_access_token_hash,
    fingerprint,p_stripe_mode,p_stripe_account_id,purchase.stripe_site_origin,'pending',now(),
    purchase.legal_terms_accepted_at,purchase.legal_terms_version,purchase.legal_privacy_notice_version,purchase.legal_adult_confirmed_at,replacement.id,purchase.requires_intake_snapshot) RETURNING * INTO b;
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
    IF NOT public.booking_requires_intake_v1(b.id) THEN RETURN jsonb_build_object('error_code','booking_unavailable'); END IF;
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
       OR coalesce(b.session_count_snapshot, 1) <> 1
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

CREATE OR REPLACE FUNCTION public.claim_stripe_intake_reminder_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE chosen uuid; result jsonb;
BEGIN
  SELECT f.id INTO chosen
  FROM public.booking_intake_forms f JOIN public.bookings b ON b.id = f.booking_id
  WHERE public.booking_requires_intake_v1(b.id) AND b.payment_flow = 'stripe' AND b.payment_provider = 'stripe'
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

CREATE OR REPLACE FUNCTION public.mark_stripe_intake_reminder_dispatch_started_v1(
  p_booking_id uuid, p_form_id uuid, p_claim_started_at timestamptz, p_expected_starts_at timestamptz
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT public.booking_requires_intake_v1(b.id) OR p_claim_started_at IS NULL OR p_expected_starts_at IS NULL
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

CREATE OR REPLACE FUNCTION public.claim_stripe_intake_reminder_v2(p_stripe_mode text,p_stripe_account_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE chosen_form_id uuid; chosen_booking_id uuid; result jsonb;
BEGIN
  PERFORM public.assert_stripe_context_v1(p_stripe_mode,p_stripe_account_id);
  SELECT f.id,b.id INTO chosen_form_id,chosen_booking_id FROM public.bookings b
    JOIN public.booking_intake_forms f ON (f.booking_id=b.id OR (b.process_id IS NOT NULL AND f.process_id=b.process_id))
    WHERE public.booking_requires_intake_v1(b.id) AND b.stripe_mode=p_stripe_mode AND b.stripe_account_id=p_stripe_account_id
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

CREATE OR REPLACE FUNCTION public.mark_stripe_intake_reminder_dispatch_started_v2(p_booking_id uuid,p_form_id uuid,
  p_claim_started_at timestamptz,p_expected_starts_at timestamptz,p_stripe_mode text,p_stripe_account_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; f public.booking_intake_forms%ROWTYPE;
BEGIN
  PERFORM public.assert_stripe_booking_context_v1(p_booking_id,p_stripe_mode,p_stripe_account_id);
  SELECT x.* INTO b FROM public.bookings x WHERE x.id=p_booking_id FOR UPDATE;
  IF NOT public.booking_requires_intake_v1(b.id) OR p_claim_started_at IS NULL OR p_expected_starts_at IS NULL
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

-- Fix the exact final ACL, including permissive database default privileges.
DO $acl$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'booking_requires_intake_v1(uuid)',
    'create_booking(text,timestamp with time zone,text,text,text,text)',
    'get_admin_available_slots_v1(uuid,date,uuid)',
    'create_stripe_booking_hold_with_legal_v3(uuid,timestamp with time zone,text,text,text,text,text,jsonb,text,text,text,text,text,uuid)',
    'create_stripe_booking_hold_with_legal_v2(text,timestamp with time zone,text,text,text,text,text,jsonb,text,text,text,text,text)',
    'save_stripe_finalization_v1(uuid,uuid,text,jsonb)',
    'save_stripe_finalization_v2(uuid,uuid,text,jsonb,text,text)',
    'activate_stripe_intake_v1(uuid,text,text,text,text)',
    'activate_booking_intake_v2(uuid,text,text,text,text)',
    'create_stripe_process_session_v1(text,timestamp with time zone,text,text,text,text)',
    'save_intake_with_legal_consent_v1(uuid,text,jsonb,integer,boolean,text,boolean)',
    'claim_stripe_intake_reminder_v1()',
    'mark_stripe_intake_reminder_dispatch_started_v1(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'claim_stripe_intake_reminder_v2(text,text)',
    'mark_stripe_intake_reminder_dispatch_started_v2(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text)'
  ] LOOP
    EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,anon,authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||signature||' TO service_role';
  END LOOP;
END;
$acl$;
ALTER FUNCTION public.get_available_slots(text,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_available_slots(text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(text,date) TO service_role;
COMMIT;
