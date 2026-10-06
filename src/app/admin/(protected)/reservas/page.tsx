import ReservationsClient from "@/components/admin/ReservationsClient";

import { createClient } from "@/lib/supabase/server";

export default async function ReservasPage() {
  const supabase = await createClient();

  const { data: bookings, error } =
    await supabase
      .from("bookings")
      .select(`
        id,
        booking_reference,
        customer_name,
        customer_email,
        customer_phone,
        starts_at,
        ends_at,
        notes,
        status,
        created_at,
        service_name_snapshot,
        duration_minutes_snapshot,
        session_count_snapshot,
        price_snapshot,
        currency_snapshot,
        google_meet_url,
        google_calendar_url,
        calendar_status,
        customer_email_status,
        coach_email_status,
        customer_email_error,
        coach_email_error
      `)
      .order("starts_at", {
        ascending: false,
      });

  return (
    <main
      className="
        px-5
        py-8
        sm:px-8
        lg:px-10
        xl:px-12
      "
    >
      <div className="mx-auto max-w-[1280px]">
        <header>
          <p className="text-sm text-brand-brown/45">
            Administración
          </p>

          <h1
            className="
              mt-2
              font-display
              text-5xl
              font-semibold
              text-brand-brown
              sm:text-6xl
            "
          >
            Reservas
          </h1>

          <p
            className="
              mt-5
              max-w-2xl
              text-base
              leading-7
              text-brand-brown/55
            "
          >
            Consulta y organiza todas las
            sesiones reservadas desde el
            sitio.
          </p>
        </header>

        {error ? (
          <div
            className="
              mt-10
              rounded-[1.5rem]
              border
              border-[#8A3535]/15
              bg-[#F7E8E8]
              p-6
              text-[#8A3535]
            "
          >
            <p className="font-semibold">
              No fue posible cargar las
              reservas.
            </p>

            <p className="mt-2 text-sm">
              {error.message}
            </p>
          </div>
        ) : (
          <ReservationsClient
            bookings={bookings ?? []}
          />
        )}
      </div>
    </main>
  );
}