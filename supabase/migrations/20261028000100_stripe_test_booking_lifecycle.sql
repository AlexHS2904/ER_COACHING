-- LOCAL/TEST ONLY. Review the preflight and existing RPC signatures before use.
-- Never apply automatically. The overlap constraint and all legacy RPCs remain.
BEGIN;

DO $preflight$
DECLARE
  expected record;
  actual_type oid;
  created_not_null boolean;
  created_default text;
BEGIN
  -- Inspect types in the target catalog at application time. No legacy type or
  -- default is altered; unknown layouts abort the transaction for review.
  IF to_regprocedure('public.create_booking(text,timestamp with time zone,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Review create_booking before applying: expected public.create_booking(text,timestamp with time zone,text,text,text,text).';
  END IF;
  IF to_regprocedure('pg_catalog.sha256(bytea)') IS NULL THEN
    RAISE EXCEPTION 'Review PostgreSQL SHA-256 support before applying; no extension is installed automatically.';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('id', ARRAY['uuid']), ('service_id', ARRAY['uuid']),
    ('created_at', ARRAY['timestamptz']), ('starts_at', ARRAY['timestamptz']), ('ends_at', ARRAY['timestamptz']),
    ('status', ARRAY['text','varchar']), ('payment_status', ARRAY['text','varchar']),
    ('price_snapshot', ARRAY['numeric','int2','int4','int8']),
    ('currency_snapshot', ARRAY['text','varchar']), ('booking_reference', ARRAY['text','varchar'])
  ) AS required(column_name, allowed_types)
  LOOP
    SELECT a.atttypid INTO actual_type FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.bookings') AND a.attname = expected.column_name
      AND a.attnum > 0 AND NOT a.attisdropped;
    IF actual_type IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(expected.allowed_types) AS allowed(type_name)
      WHERE actual_type = to_regtype('pg_catalog.' || allowed.type_name)
    ) THEN
      RAISE EXCEPTION 'Review bookings.% before applying: missing column or incompatible type % (expected %).',
        expected.column_name, coalesce(format_type(actual_type, NULL), 'missing'), expected.allowed_types;
    END IF;
  END LOOP;
  SELECT a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    INTO created_not_null, created_default
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = to_regclass('public.bookings') AND a.attname = 'created_at' AND NOT a.attisdropped;
  -- Only known current-time defaults are accepted. Custom defaults require review.
  IF created_not_null IS DISTINCT FROM true OR created_default IS NULL OR
     created_default !~* '^(now\(\)|CURRENT_TIMESTAMP(\([0-6]\))?|(pg_catalog\.)?(transaction_timestamp|statement_timestamp|clock_timestamp)\(\))$' THEN
    RAISE EXCEPTION 'Review bookings.created_at before applying: requires NOT NULL timestamptz with a current-time default; found %.', created_default;
  END IF;
  IF to_regprocedure('public.activate_booking_intake_v2(uuid,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply the reviewed intake v2 migration first.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.bookings')
      AND conname = 'bookings_no_overlap' AND contype = 'x'
  ) THEN
    RAISE EXCEPTION 'Expected bookings_no_overlap exclusion constraint is missing.';
  END IF;
END;
$preflight$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_flow text,
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS finalization_status text,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalization_error text,
  ADD COLUMN IF NOT EXISTS finalization_owner uuid,
  ADD COLUMN IF NOT EXISTS finalization_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_finalization_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_access_token_hash text,
  ADD COLUMN IF NOT EXISTS stripe_request_fingerprint text,
  ADD COLUMN IF NOT EXISTS stripe_customer_email_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_coach_email_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_intake_email_started_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS stripe_expiration_reconciled_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS stripe_expiration_last_attempt_at timestamptz;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_payment_flow_check') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_flow_check
      CHECK (payment_flow IS NULL OR payment_flow IN ('legacy', 'manual', 'stripe'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_finalization_status_check') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_finalization_status_check
      CHECK (finalization_status IS NULL OR finalization_status IN
        ('not_started', 'pending', 'processing', 'completed', 'retryable', 'review_required'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_stripe_hold_check') THEN
    ALTER TABLE public.bookings ADD CONSTRAINT bookings_stripe_hold_check
      CHECK (payment_flow IS DISTINCT FROM 'stripe' OR
        (payment_expires_at IS NOT NULL AND booking_access_token_hash IS NOT NULL
         AND booking_access_token_hash ~ '^[a-f0-9]{64}$'));
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_access_hash_unique
  ON public.bookings(booking_access_token_hash) WHERE booking_access_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_stripe_expiration_idx
  ON public.bookings(payment_expires_at)
  WHERE payment_flow = 'stripe' AND status = 'pending' AND payment_status = 'pending';
CREATE INDEX IF NOT EXISTS bookings_stripe_finalization_idx
  ON public.bookings(next_finalization_at)
  WHERE payment_flow = 'stripe' AND payment_status = 'paid'
    AND finalization_status IN ('pending', 'processing', 'retryable');

CREATE TABLE IF NOT EXISTS public.booking_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  status text NOT NULL CHECK (status IN ('creating', 'open', 'unknown', 'paid', 'expired', 'failed', 'review_required')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency text NOT NULL CHECK (currency = 'mxn'),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_expires_at timestamptz,
  checkout_payload jsonb NOT NULL,
  lease_owner uuid,
  lease_until timestamptz,
  payment_received_at timestamptz,
  received_amount_minor bigint,
  received_currency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempt_session_unique
  ON public.booking_payment_attempts(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempt_intent_unique
  ON public.booking_payment_attempts(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempt_one_active_stripe
  ON public.booking_payment_attempts(booking_id)
  WHERE provider = 'stripe' AND status IN ('creating', 'open', 'unknown');
CREATE INDEX IF NOT EXISTS payment_attempt_booking_idx ON public.booking_payment_attempts(booking_id);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  object_id text NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  observed_payment_intent_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'review_required'))
);
ALTER TABLE public.booking_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_payment_attempts, public.stripe_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.booking_payment_attempts, public.stripe_events TO service_role;

-- Wrapper delegates settings, reference generation, availability and INSERT to
-- the existing create_booking. Its work and the Stripe fields commit together.
CREATE OR REPLACE FUNCTION public.create_stripe_booking_hold_v1(
  p_service_slug text, p_starts_at timestamptz,
  p_customer_name text, p_customer_email text, p_customer_phone text,
  p_notes text, p_access_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE
  b public.bookings%ROWTYPE;
  s public.services%ROWTYPE;
  r jsonb;
  fingerprint text;
  service_slug text := btrim(p_service_slug);
  customer_name text := btrim(p_customer_name);
  customer_email text := lower(btrim(p_customer_email));
  customer_phone text := nullif(btrim(p_customer_phone), '');
  notes text := nullif(btrim(p_notes), '');
BEGIN
  IF p_access_token_hash IS NULL OR p_access_token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_access';
  END IF;
  -- Equality checksum only, NEVER an authentication credential. Epoch preserves
  -- the exact instant (including microseconds), independently of session timezone.
  -- sha256(bytea) is built into PostgreSQL; no pgcrypto dependency.
  fingerprint := encode(sha256(convert_to(jsonb_build_array(service_slug,
    extract(epoch FROM p_starts_at), customer_name, customer_email, customer_phone, notes)::text, 'UTF8')), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_access_token_hash, 0));
  SELECT x.* INTO b FROM public.bookings x
    WHERE x.booking_access_token_hash = p_access_token_hash FOR UPDATE;
  IF FOUND THEN
    IF b.payment_flow IS DISTINCT FROM 'stripe' OR b.stripe_request_fingerprint IS DISTINCT FROM fingerprint THEN
      RAISE EXCEPTION 'flow_mismatch';
    END IF;
    RETURN jsonb_build_object('booking_id', b.id, 'booking_reference', b.booking_reference,
      'payment_expires_at', b.payment_expires_at);
  END IF;
  SELECT x.* INTO s FROM public.services x WHERE x.slug = service_slug FOR SHARE;
  IF NOT FOUND OR NOT coalesce(s.active, false) OR NOT coalesce(s.booking_enabled, false)
     OR coalesce(s.requires_quote, true) OR s.service_type IS DISTINCT FROM 'single'
     OR s.slug IS DISTINCT FROM 'sesion-1-1' OR s.session_count IS DISTINCT FROM 1
     OR s.duration_minutes IS NULL OR s.duration_minutes <= 0
     OR s.price IS NULL OR s.price::numeric <= 0
     OR s.price::numeric * 100 <> trunc(s.price::numeric * 100)
     OR s.price::numeric * 100 > 9007199254740991
     OR lower(s.currency) IS DISTINCT FROM 'mxn' THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;
  BEGIN
    SELECT to_jsonb(x) INTO r FROM public.create_booking(
      p_service_slug => service_slug, p_starts_at => p_starts_at,
      p_customer_name => customer_name, p_customer_email => customer_email,
      p_customer_phone => customer_phone, p_notes => notes
    ) x;
  EXCEPTION WHEN exclusion_violation OR deadlock_detected THEN
    RAISE EXCEPTION 'slot_conflict';
  END;
  IF r->>'booking_id' IS NULL THEN RAISE EXCEPTION 'hold_creation_failed'; END IF;
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = (r->>'booking_id')::uuid FOR UPDATE;
  IF b.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'invalid_initial_booking_state'; END IF;
  UPDATE public.bookings SET payment_flow = 'stripe', payment_status = 'pending',
    payment_expires_at = b.created_at + interval '30 minutes',
    booking_access_token_hash = p_access_token_hash, stripe_request_fingerprint = fingerprint,
    finalization_status = 'not_started'
  WHERE id = b.id RETURNING * INTO b;
  RETURN jsonb_build_object('booking_id', b.id, 'booking_reference', b.booking_reference,
    'payment_expires_at', b.payment_expires_at);
EXCEPTION WHEN exclusion_violation OR deadlock_detected THEN
  -- The wrapper's UPDATE also creates an indexed row version. PostgreSQL can
  -- choose that point (not only INSERT) to abort one exclusion-constraint racer.
  -- Rolling back the whole wrapper leaves the loser with no booking/attempt.
  RAISE EXCEPTION 'slot_conflict';
END;
$f$;

CREATE OR REPLACE FUNCTION public.claim_stripe_checkout_v1(
  p_booking_id uuid, p_access_token_hash text, p_owner uuid, p_site_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE; minor numeric; target text;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.booking_access_token_hash IS DISTINCT FROM p_access_token_hash THEN RAISE EXCEPTION 'invalid_access'; END IF;
  IF b.payment_flow IS DISTINCT FROM 'stripe' THEN RAISE EXCEPTION 'invalid_flow'; END IF;
  IF b.finalization_status = 'review_required' THEN RAISE EXCEPTION 'review_required'; END IF;
  IF b.payment_status = 'paid' THEN RAISE EXCEPTION 'already_paid'; END IF;
  IF b.status <> 'pending' OR b.payment_status <> 'pending' OR b.payment_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'hold_expired'; END IF;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.booking_id = b.id ORDER BY x.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    minor := b.price_snapshot::numeric * 100;
    IF minor <= 0 OR minor <> trunc(minor) OR minor > 9007199254740991 OR lower(b.currency_snapshot) IS DISTINCT FROM 'mxn' THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    a.id := gen_random_uuid();
    target := p_site_url || '/reservar/confirmada?booking=' || b.id::text;
    INSERT INTO public.booking_payment_attempts(id, booking_id, status, amount_minor, currency, checkout_payload)
    VALUES (a.id, b.id, 'creating', minor::bigint, lower(b.currency_snapshot), jsonb_build_object(
      'mode', 'payment', 'payment_method_types', jsonb_build_array('card'),
      'line_items', jsonb_build_array(jsonb_build_object('quantity', 1, 'price_data', jsonb_build_object(
        'currency', lower(b.currency_snapshot), 'unit_amount', minor::bigint,
        'product_data', jsonb_build_object('name', b.service_name_snapshot)))),
      'client_reference_id', b.id::text,
      'metadata', jsonb_build_object('booking_id', b.id::text, 'booking_reference', b.booking_reference, 'payment_attempt_id', a.id::text),
      'success_url', target || '&session_id={CHECKOUT_SESSION_ID}', 'cancel_url', target,
      -- Stripe's minimum is 30 minutes from Session creation, later than the
      -- booking's fixed deadline. A local worker explicitly expires it at 30m.
      'expires_at', floor(extract(epoch FROM b.payment_expires_at + interval '1 hour'))::bigint
    )) RETURNING * INTO a;
  END IF;
  IF a.status NOT IN ('creating', 'unknown', 'open') THEN RAISE EXCEPTION 'checkout_unavailable'; END IF;
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
    stripe_expires_at = p_expires_at, status = CASE WHEN status IN ('creating', 'unknown') THEN 'open' ELSE status END,
    lease_owner = NULL, lease_until = NULL, last_error = NULL, updated_at = now() WHERE id = a.id;
  RETURN b.status = 'pending' AND b.payment_status = 'pending' AND b.payment_expires_at > clock_timestamp();
END;
$f$;

CREATE OR REPLACE FUNCTION public.expire_stripe_booking_hold_v1(p_booking_id uuid, p_attempt_id uuid DEFAULT NULL, p_remote_expired boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE; a public.booking_payment_attempts%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.payment_flow IS DISTINCT FROM 'stripe' OR b.payment_status <> 'pending'
     OR b.finalization_status = 'review_required' OR b.status NOT IN ('pending', 'cancelled')
     OR b.payment_expires_at > clock_timestamp() THEN RETURN false; END IF;
  SELECT x.* INTO a FROM public.booking_payment_attempts x WHERE x.booking_id = b.id ORDER BY x.created_at DESC LIMIT 1 FOR UPDATE;
  IF (a.id IS NOT NULL AND a.id IS DISTINCT FROM p_attempt_id) OR (a.id IS NULL AND p_attempt_id IS NOT NULL)
     OR a.payment_received_at IS NOT NULL THEN RETURN false; END IF;
  IF a.id IS NOT NULL AND a.status IN ('creating', 'unknown', 'open') THEN
    UPDATE public.booking_payment_attempts SET status = CASE WHEN p_remote_expired THEN 'expired' ELSE 'unknown' END,
      last_error = CASE WHEN p_remote_expired THEN NULL ELSE 'expiration_requires_reconciliation' END,
      updated_at = now() WHERE id = a.id;
  END IF;
  UPDATE public.bookings SET status = 'cancelled', expired_at = coalesce(expired_at, now()), cancellation_reason = 'payment_expired'
    WHERE id = b.id AND status = 'pending';
  IF p_remote_expired OR a.id IS NULL THEN
    UPDATE public.bookings SET stripe_expiration_reconciled_at = now() WHERE id = b.id;
  END IF;
  RETURN true;
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

CREATE OR REPLACE FUNCTION public.claim_stripe_finalization_v1(p_booking_id uuid, p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
DECLARE b public.bookings%ROWTYPE;
BEGIN
  SELECT x.* INTO b FROM public.bookings x WHERE x.id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.payment_flow IS DISTINCT FROM 'stripe' OR b.payment_status <> 'paid'
     OR b.status = 'cancelled' OR b.finalization_status IN ('review_required', 'completed')
     OR (b.finalization_lease_until > clock_timestamp() AND b.finalization_owner IS DISTINCT FROM p_owner) THEN RETURN NULL; END IF;
  UPDATE public.bookings SET finalization_status = 'processing', finalization_owner = p_owner,
    finalization_lease_until = clock_timestamp() + interval '2 minutes'
    WHERE id = b.id RETURNING * INTO b;
  RETURN to_jsonb(b);
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
       OR b.customer_email_id IS NULL OR b.coach_email_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.booking_intake_forms f WHERE f.booking_id = b.id AND f.ready_email_sent_at IS NOT NULL) THEN
      RAISE EXCEPTION 'incomplete_finalization';
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

DO $permissions$
DECLARE p record;
BEGIN
  FOR p IN SELECT oid::regprocedure AS signature FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname IN (
      'create_stripe_booking_hold_v1', 'claim_stripe_checkout_v1', 'save_stripe_checkout_v1',
      'expire_stripe_booking_hold_v1', 'apply_stripe_checkout_event_v1',
      'claim_stripe_finalization_v1', 'save_stripe_finalization_v1'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', p.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', p.signature);
  END LOOP;
END;
$permissions$;
COMMIT;
