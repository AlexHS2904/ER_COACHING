-- EMERGENCY ONLY. Do not run after a successful migration/verification.
-- Reverts only objects introduced by 20261029204535_legal_consent_evidence.sql.
-- Keep outside supabase/migrations. Never use CASCADE or bypass the evidence guard.
-- Does not change business rows, prior RPCs, RLS, or migration history.
-- Before use: stop callers of the new RPCs and review migration-history handling
-- separately. Run the entire file as one transaction with stop-on-error enabled.
BEGIN;
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL lock_timeout = '5s';

-- Prevent a consent write between the guard and the removal of its columns.
-- These tables predate the migration and must never be removed by this script.
LOCK TABLE public.bookings, public.booking_intake_forms IN ACCESS EXCLUSIVE MODE;

DO $evidence_guard$
DECLARE
  consent_column record;
  has_evidence boolean;
BEGIN
  -- Inspect only columns that actually exist, so a partial/no-op rollback stays
  -- safe. Any non-NULL value, even incomplete evidence, must be preserved.
  FOR consent_column IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND (
      (table_name = 'bookings' AND column_name IN (
        'legal_terms_accepted_at', 'legal_terms_version',
        'legal_privacy_notice_version', 'legal_adult_confirmed_at'))
      OR (table_name = 'booking_intake_forms' AND column_name IN (
        'sensitive_data_consent_at', 'sensitive_data_consent_version')))
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I IS NOT NULL)',
      consent_column.table_schema, consent_column.table_name,
      consent_column.column_name)
      INTO has_evidence;
    IF has_evidence THEN
      RAISE EXCEPTION 'Rollback detenido: existen registros con evidencia de consentimiento que se perderían. Exportar/preservar la evidencia antes de continuar.';
    END IF;
  END LOOP;
END;
$evidence_guard$;

-- REVOKE has no IF EXISTS syntax; resolve each exact signature first.
DO $revoke_new_rpc_permissions$
DECLARE
  rpc_signature text;
  rpc_oid regprocedure;
BEGIN
  FOREACH rpc_signature IN ARRAY ARRAY[
    'public.save_intake_with_legal_consent_v1(uuid,text,jsonb,integer,boolean,text,boolean)',
    'public.create_package_booking_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb)',
    'public.create_booking_with_legal_v1(text,timestamptz,text,text,text,text,jsonb)',
    'public.create_stripe_booking_hold_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb)',
    'public.record_booking_legal_acceptance_v1(uuid,text,jsonb)',
    'public.assert_current_legal_acceptance_v1(jsonb)'
  ] LOOP
    rpc_oid := to_regprocedure(rpc_signature);
    IF rpc_oid IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', rpc_oid);
    END IF;
  END LOOP;
END;
$revoke_new_rpc_permissions$;

-- Reverse dependency order. A dependency outside this migration aborts the
-- transaction rather than silently removing another object's dependencies.
DROP FUNCTION IF EXISTS public.save_intake_with_legal_consent_v1(uuid,text,jsonb,integer,boolean,text,boolean);
DROP FUNCTION IF EXISTS public.create_package_booking_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.create_booking_with_legal_v1(text,timestamptz,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.create_stripe_booking_hold_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.record_booking_legal_acceptance_v1(uuid,text,jsonb);
DROP FUNCTION IF EXISTS public.assert_current_legal_acceptance_v1(jsonb);

ALTER TABLE public.booking_intake_forms
  DROP CONSTRAINT IF EXISTS intake_sensitive_consent_complete;
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_legal_acceptance_complete;

ALTER TABLE public.booking_intake_forms
  DROP COLUMN IF EXISTS sensitive_data_consent_version,
  DROP COLUMN IF EXISTS sensitive_data_consent_at;
ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS legal_adult_confirmed_at,
  DROP COLUMN IF EXISTS legal_privacy_notice_version,
  DROP COLUMN IF EXISTS legal_terms_version,
  DROP COLUMN IF EXISTS legal_terms_accepted_at;

COMMIT;
