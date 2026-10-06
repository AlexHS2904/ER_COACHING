import AdminCalendar from "@/components/admin/AdminCalendar";

import {
  createClient,
} from "@/lib/supabase/server";

const TIME_ZONE =
  "America/Mexico_City";

function getCurrentMexicoYearMonth() {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          TIME_ZONE,
        year: "numeric",
        month: "numeric",
      },
    );

  const parts =
    formatter.formatToParts(
      new Date(),
    );

  const year =
    Number(
      parts.find(
        (part) =>
          part.type ===
          "year",
      )?.value,
    );

  const month =
    Number(
      parts.find(
        (part) =>
          part.type ===
          "month",
      )?.value,
    );

  return {
    year,
    month,
  };
}

export default async function CalendarioPage() {
  const supabase =
    await createClient();

  const {
    year,
    month,
  } =
    getCurrentMexicoYearMonth();

  /*
    Tomamos un día extra a cada lado
    por seguridad con la zona horaria.
  */

  const start =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1,
      ),
    );

  start.setUTCDate(
    start.getUTCDate() - 1,
  );

  const end =
    new Date(
      Date.UTC(
        year,
        month,
        1,
      ),
    );

  end.setUTCDate(
    end.getUTCDate() + 1,
  );

  const {
    data: bookings,
    error,
  } = await supabase
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
      service_name_snapshot,
      duration_minutes_snapshot,
      google_meet_url,
      google_calendar_url,
      calendar_status
    `)
    .gte(
      "starts_at",
      start.toISOString(),
    )
    .lt(
      "starts_at",
      end.toISOString(),
    )
    .neq(
      "status",
      "cancelled",
    )
    .order(
      "starts_at",
      {
        ascending: true,
      },
    );

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
      <div className="mx-auto max-w-[1500px]">
        <header>
          <p
            className="
              text-sm
              text-brand-brown/45
            "
          >
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
            Calendario
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
            Consulta tu agenda,
            sesiones programadas y
            accesos a Google Meet
            desde un solo lugar.
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
              No fue posible cargar
              el calendario.
            </p>

            <p className="mt-2 text-sm">
              {error.message}
            </p>
          </div>
        ) : (
          <AdminCalendar
            initialBookings={
              bookings ?? []
            }
            initialYear={
              year
            }
            initialMonth={
              month
            }
          />
        )}
      </div>
    </main>
  );
}