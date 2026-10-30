-- A test fixture matching the USER-CONFIRMED contracts, not a production schema
-- dump. Real create_booking/settings definitions must be reviewed manually.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE, name text,
  service_type text, duration_minutes integer, session_count integer,
  price numeric, currency text, active boolean DEFAULT true,
  booking_enabled boolean DEFAULT true, requires_quote boolean DEFAULT false
);
INSERT INTO public.services(slug,name,service_type,duration_minutes,session_count,price,currency)
VALUES ('sesion-1-1','Sesión 1:1','single',90,1,500.00,'MXN'),
       ('proceso','Proceso','package',90,6,2500.00,'MXN');
CREATE SEQUENCE public.fixture_references;
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.services(id),
  booking_reference text UNIQUE DEFAULT ('TEST-' || nextval('public.fixture_references')),
  service_name_snapshot text, duration_minutes_snapshot integer, session_count_snapshot integer,
  price_snapshot numeric, currency_snapshot text,
  customer_name text, customer_email text, customer_phone text, notes text,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','completed')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','failed','refunded')),
  payment_provider text CHECK(payment_provider IN ('manual','stripe')),
  payment_reference text, paid_at timestamptz,
  calendar_status text DEFAULT 'pending', integration_error text,
  google_event_id text, google_meet_url text, google_calendar_url text,
  customer_email_id text, customer_email_status text DEFAULT 'pending',
  customer_email_sent_at timestamptz, customer_email_status_at timestamptz, customer_email_error text,
  coach_email_id text, coach_email_status text DEFAULT 'pending',
  coach_email_sent_at timestamptz, coach_email_status_at timestamptz, coach_email_error text,
  process_id uuid, package_session_number integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz DEFAULT now(),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist
    (tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status IN ('pending','confirmed'))
);
CREATE TABLE public.booking_intake_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid UNIQUE REFERENCES public.bookings(id),
  source_type text NOT NULL CHECK(source_type IN ('booking','manual')),
  invitee_name text, invitee_email text, access_token_hash text NOT NULL UNIQUE,
  access_token_encrypted text, status text NOT NULL DEFAULT 'active',
  current_step integer DEFAULT 1, expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_intake_forms ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.create_booking(
  p_service_slug text, p_starts_at timestamptz, p_customer_name text,
  p_customer_email text, p_customer_phone text, p_notes text
) RETURNS TABLE(booking_id uuid, booking_reference text)
LANGUAGE plpgsql AS $$
DECLARE s public.services%ROWTYPE; b public.bookings%ROWTYPE;
BEGIN
  IF length(trim(p_customer_name)) < 2 OR p_customer_email NOT LIKE '%@%.%' OR p_starts_at < now() THEN RAISE EXCEPTION 'invalid data'; END IF;
  SELECT * INTO s FROM public.services WHERE slug = p_service_slug AND active AND booking_enabled AND NOT requires_quote;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid service'; END IF;
  IF EXISTS(SELECT 1 FROM public.bookings x WHERE x.status IN ('pending','confirmed')
    AND tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(p_starts_at,p_starts_at + make_interval(mins => s.duration_minutes),'[)')) THEN
    RAISE EXCEPTION 'El horario ya no está disponible';
  END IF;
  -- Both concurrent test sessions can pass availability before either INSERT.
  PERFORM pg_sleep(coalesce(nullif(current_setting('test.before_insert_delay', true), '')::numeric, 0));
  INSERT INTO public.bookings(service_id,service_name_snapshot,duration_minutes_snapshot,session_count_snapshot,
    price_snapshot,currency_snapshot,customer_name,customer_email,customer_phone,notes,starts_at,ends_at)
  VALUES(s.id,s.name,s.duration_minutes,s.session_count,s.price,s.currency,p_customer_name,p_customer_email,
    p_customer_phone,p_notes,p_starts_at,p_starts_at+make_interval(mins=>s.duration_minutes)) RETURNING * INTO b;
  RETURN QUERY SELECT b.id,b.booking_reference;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'El horario acaba de ser reservado';
END;
$$;
CREATE FUNCTION public.get_available_slots(p_service_slug text,p_date date)
RETURNS TABLE(starts_at timestamptz) LANGUAGE sql AS $$
  SELECT p_date::timestamptz + interval '12 hours'
  WHERE NOT EXISTS(SELECT 1 FROM public.bookings b WHERE b.status IN ('pending','confirmed')
    AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(p_date::timestamptz+interval '12 hours',p_date::timestamptz+interval '13 hours 30 minutes','[)'));
$$;
CREATE FUNCTION public.create_package_booking(p_starts_at timestamptz)
RETURNS TABLE(booking_id uuid,booking_reference text) LANGUAGE sql AS $$
  SELECT * FROM public.create_booking('proceso',p_starts_at,'Package Customer','package@example.test',NULL,NULL);
$$;
CREATE FUNCTION public.create_process_session(p_starts_at timestamptz)
RETURNS TABLE(booking_id uuid,booking_reference text) LANGUAGE sql AS $$
  SELECT * FROM public.create_booking('proceso',p_starts_at,'Process Customer','process@example.test',NULL,NULL);
$$;
