-- Supplemental schema contracts used only by isolated PostgreSQL tests.
-- No real records, credentials, external services or production connection.
CREATE TABLE public.coaching_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), process_reference text NOT NULL UNIQUE,
  service_id uuid NOT NULL REFERENCES public.services(id),customer_name text NOT NULL,
  customer_email text NOT NULL,customer_phone text,service_name_snapshot text NOT NULL,
  duration_minutes_snapshot integer CHECK(duration_minutes_snapshot>0),price_snapshot numeric CHECK(price_snapshot>=0),
  currency_snapshot text NOT NULL,total_sessions integer NOT NULL CHECK(total_sessions>1),
  access_token_hash text NOT NULL UNIQUE,status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
  CONSTRAINT coaching_processes_status_check CHECK(status IN ('active','completed','cancelled'))
);
ALTER TABLE public.coaching_processes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coaching_processes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.coaching_processes TO service_role;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_process_id_fkey FOREIGN KEY(process_id) REFERENCES public.coaching_processes(id);
ALTER TABLE public.bookings ADD CONSTRAINT bookings_process_session_pair_check CHECK(
  (process_id IS NULL AND package_session_number IS NULL) OR (process_id IS NOT NULL AND package_session_number>0));
-- Exact pre-existing Production index, including no_show rows until explicitly
-- cancelled. An approved replacement must coexist with this legacy authority.
CREATE UNIQUE INDEX bookings_process_session_active_unique_idx ON public.bookings(process_id,package_session_number)
  WHERE process_id IS NOT NULL AND status<>'cancelled';
CREATE TABLE public.booking_settings(id integer PRIMARY KEY,timezone text NOT NULL);
INSERT INTO public.booking_settings VALUES(1,'UTC');
CREATE TABLE public.admin_users(user_id uuid PRIMARY KEY,active boolean NOT NULL);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
INSERT INTO public.admin_users VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
ALTER TABLE public.bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check CHECK(status IN ('pending','confirmed','cancelled','completed','no_show'));
ALTER TABLE public.booking_intake_forms ADD COLUMN age integer,ADD COLUMN occupation text,
  ADD COLUMN current_situation text,ADD COLUMN discovery_source text,ADD COLUMN motivation text,
  ADD COLUMN current_challenges text[],ADD COLUMN challenge_duration text,ADD COLUMN desired_outcome text,
  ADD COLUMN desired_change text,ADD COLUMN blocking_factors text[],ADD COLUMN strengths text,
  ADD COLUMN main_concern text,ADD COLUMN previous_attempts text,ADD COLUMN support_preferences text[],
  ADD COLUMN additional_notes text,ADD COLUMN coach_email_sent_at timestamptz,ADD COLUMN coach_email_error text;

-- Real availability returns both boundaries; child sessions must fit their
-- purchase duration inside the offered interval even after catalogue edits.
DROP FUNCTION public.get_available_slots(text,date);
CREATE FUNCTION public.get_available_slots(p_service_slug text,p_date date)
RETURNS TABLE(starts_at timestamptz,ends_at timestamptz) LANGUAGE sql AS $$
  SELECT p_date::timestamptz+make_interval(hours=>hour),p_date::timestamptz+make_interval(hours=>hour,mins=>s.duration_minutes)
  FROM public.services s CROSS JOIN generate_series(12,18,2) hour WHERE s.slug=p_service_slug AND NOT EXISTS(SELECT 1 FROM public.bookings b WHERE b.status IN ('pending','confirmed')
    AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(p_date::timestamptz+make_interval(hours=>hour),p_date::timestamptz+make_interval(hours=>hour,mins=>s.duration_minutes),'[)'));
$$;
CREATE FUNCTION public.get_reschedule_slots(p_booking_id uuid,p_date date)
RETURNS TABLE(starts_at timestamptz) LANGUAGE sql AS $$
  SELECT p_date::timestamptz+make_interval(hours=>hour) FROM generate_series(12,18,2) hour
  WHERE NOT EXISTS(SELECT 1 FROM public.bookings b WHERE b.id<>p_booking_id AND b.status IN ('pending','confirmed')
    AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(p_date::timestamptz+make_interval(hours=>hour),p_date::timestamptz+make_interval(hours=>hour,mins=>90),'[)'));
$$;

-- Same defaults as Production for objects created by the pending migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;

-- Production's process-completion trigger must not activate an unpaid process.
CREATE FUNCTION public.sync_coaching_process_completion(p_process_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE v_total_sessions integer; v_process_status text; v_completed_sessions integer;
BEGIN
  IF p_process_id IS NULL THEN RETURN; END IF;
  SELECT cp.total_sessions,cp.status INTO v_total_sessions,v_process_status
    FROM public.coaching_processes cp WHERE cp.id=p_process_id FOR UPDATE;
  IF NOT FOUND OR v_process_status='cancelled' THEN RETURN; END IF;
  SELECT count(DISTINCT b.package_session_number) INTO v_completed_sessions FROM public.bookings b
    WHERE b.process_id=p_process_id AND b.status='completed' AND b.package_session_number IS NOT NULL;
  IF v_completed_sessions>=v_total_sessions THEN
    UPDATE public.coaching_processes SET status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
      WHERE id=p_process_id AND status<>'cancelled';
  ELSE
    UPDATE public.coaching_processes SET status='active',completed_at=NULL,updated_at=now()
      WHERE id=p_process_id AND status='completed';
  END IF;
END;
$f$;
CREATE FUNCTION public.sync_process_after_booking_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM public.sync_coaching_process_completion(OLD.process_id); RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.process_id IS DISTINCT FROM NEW.process_id THEN
    PERFORM public.sync_coaching_process_completion(OLD.process_id);
  END IF;
  PERFORM public.sync_coaching_process_completion(NEW.process_id); RETURN NEW;
END;
$f$;
CREATE TRIGGER trg_sync_process_after_booking_change AFTER INSERT OR DELETE OR UPDATE OF status,process_id,package_session_number
  ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_process_after_booking_change();
REVOKE ALL ON FUNCTION public.sync_coaching_process_completion(uuid),public.sync_process_after_booking_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_coaching_process_completion(uuid),public.sync_process_after_booking_change() TO service_role;
