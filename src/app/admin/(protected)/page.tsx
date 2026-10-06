import BookingCard from "@/components/admin/BookingCard";

import { createClient } from "@/lib/supabase/server";

import { signOut } from "./actions";

const TIME_ZONE =
  "America/Mexico_City";

function getDateKey(
  value: Date | string,
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    );

  const parts =
    formatter.formatToParts(
      new Date(value),
    );

  const year =
    parts.find(
      (part) =>
        part.type === "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type === "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type === "day",
    )?.value;

  return `${year}-${month}-${day}`;
}

function addDays(
  dateKey: string,
  amount: number,
) {
  const date = new Date(
    `${dateKey}T00:00:00Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + amount,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function getWeekRange(
  today: string,
) {
  const date = new Date(
    `${today}T00:00:00Z`,
  );

  const day =
    date.getUTCDay();

  const daysFromMonday =
    (day + 6) % 7;

  const monday =
    addDays(
      today,
      -daysFromMonday,
    );

  const sunday =
    addDays(
      monday,
      6,
    );

  return {
    monday,
    sunday,
  };
}

export default async function AdminPage() {
  const supabase =
    await createClient();

  const now =
    new Date();

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
    .in(
      "status",
      [
        "pending",
        "confirmed",
      ],
    )
    .gte(
      "ends_at",
      now.toISOString(),
    )
    .order(
      "starts_at",
      {
        ascending: true,
      },
    )
    .limit(50);

  const upcoming =
    bookings ?? [];

  const today =
    getDateKey(now);

  const {
    monday,
    sunday,
  } =
    getWeekRange(today);

  const todayCount =
    upcoming.filter(
      (booking) =>
        getDateKey(
          booking.starts_at,
        ) === today,
    ).length;

  const weekCount =
    upcoming.filter(
      (booking) => {
        const date =
          getDateKey(
            booking.starts_at,
          );

        return (
          date >= monday &&
          date <= sunday
        );
      },
    ).length;

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
      <div
        className="
          mx-auto
          max-w-[1280px]
        "
      >
        <header
          className="
            flex
            items-center
            justify-between
            gap-6
          "
        >
          <div>
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.28em]
                text-brand-wine
              "
            >
              ER Coaching
            </p>

            <p
              className="
                mt-1
                text-sm
                text-brand-brown/45
              "
            >
              Panel de administración
            </p>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="
                rounded-full
                border
                border-brand-brown/15
                px-5
                py-2.5
                text-sm
                font-semibold
                text-brand-brown
                transition
                hover:border-brand-brown/35
                hover:bg-brand-brown/5
              "
            >
              Cerrar sesión
            </button>
          </form>
        </header>

        <section
          className="
            mt-14
            max-w-3xl
          "
        >
          <p
            className="
              text-sm
              text-brand-brown/45
            "
          >
            Agenda
          </p>

          <h1
            className="
              mt-2
              font-display
              text-5xl
              font-semibold
              leading-none
              text-brand-brown
              sm:text-6xl
            "
          >
            Próximas sesiones
          </h1>

          <p
            className="
              mt-5
              max-w-xl
              text-base
              leading-7
              text-brand-brown/55
            "
          >
            Consulta tus próximas
            sesiones, datos de clientes,
            accesos a Meet y estado de
            las confirmaciones.
          </p>
        </section>

        <section
          className="
            mt-10
            grid
            gap-4
            sm:grid-cols-3
          "
        >
          <div
            className="
              rounded-[1.5rem]
              border
              border-brand-taupe/20
              bg-white/55
              p-5
            "
          >
            <p
              className="
                text-sm
                text-brand-brown/45
              "
            >
              Hoy
            </p>

            <p
              className="
                mt-3
                font-display
                text-4xl
                font-semibold
                text-brand-brown
              "
            >
              {todayCount}
            </p>
          </div>

          <div
            className="
              rounded-[1.5rem]
              border
              border-brand-taupe/20
              bg-white/55
              p-5
            "
          >
            <p
              className="
                text-sm
                text-brand-brown/45
              "
            >
              Esta semana
            </p>

            <p
              className="
                mt-3
                font-display
                text-4xl
                font-semibold
                text-brand-brown
              "
            >
              {weekCount}
            </p>
          </div>

          <div
            className="
              rounded-[1.5rem]
              border
              border-brand-taupe/20
              bg-white/55
              p-5
            "
          >
            <p
              className="
                text-sm
                text-brand-brown/45
              "
            >
              Próximas
            </p>

            <p
              className="
                mt-3
                font-display
                text-4xl
                font-semibold
                text-brand-brown
              "
            >
              {upcoming.length}
            </p>
          </div>
        </section>

        <section className="mt-10">
          {error ? (
            <div
              className="
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
                las reservas.
              </p>

              <p className="mt-2 text-sm">
                {error.message}
              </p>
            </div>
          ) : upcoming.length === 0 ? (
            <div
              className="
                rounded-[1.75rem]
                border
                border-dashed
                border-brand-taupe/35
                px-6
                py-16
                text-center
              "
            >
              <p
                className="
                  font-display
                  text-3xl
                  font-semibold
                  text-brand-brown
                "
              >
                Agenda libre
              </p>

              <p
                className="
                  mx-auto
                  mt-3
                  max-w-md
                  text-sm
                  leading-6
                  text-brand-brown/50
                "
              >
                No hay próximas
                sesiones confirmadas
                o pendientes.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {upcoming.map(
                (booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                  />
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}