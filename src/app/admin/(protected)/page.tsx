import Link from "next/link";

import BookingCard from "@/components/admin/BookingCard";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  signOut,
} from "./actions";

const TIME_ZONE =
  "America/Mexico_City";

/* =========================================================
   TYPES
========================================================= */

type CoachingProcess = {
  id: string;
  process_reference: string;
  customer_name: string;
  service_name_snapshot: string;
  total_sessions: number;
  status: string;
  created_at: string;
};

type ProcessBooking = {
  process_id:
    | string
    | null;

  package_session_number:
    | number
    | null;

  status: string;
  starts_at: string;
};

/* =========================================================
   DATE HELPERS
========================================================= */

function getDateKey(
  value: Date | string,
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          TIME_ZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      },
    );

  const parts =
    formatter.formatToParts(
      new Date(value),
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        "day",
    )?.value;

  return `${year}-${month}-${day}`;
}

function addDays(
  dateKey: string,
  amount: number,
) {
  const date =
    new Date(
      `${dateKey}T00:00:00Z`,
    );

  date.setUTCDate(
    date.getUTCDate() +
      amount,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function getWeekRange(
  today: string,
) {
  const date =
    new Date(
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

function formatProcessDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      timeZone:
        TIME_ZONE,

      day:
        "numeric",

      month:
        "short",

      hour:
        "numeric",

      minute:
        "2-digit",

      hour12:
        true,
    },
  ).format(
    new Date(value),
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function AdminPage() {
  const supabase =
    await createClient();

  const adminSupabase =
    getSupabaseAdmin();

  const now =
    new Date();

  /* =======================================================
     PRÓXIMAS RESERVAS
  ======================================================= */

  const {
    data:
      bookings,

    error:
      bookingsError,
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
        ascending:
          true,
      },
    )
    .limit(50);

  const upcoming =
    bookings ?? [];

  /* =======================================================
     PROCESOS ACTIVOS — TOTAL
  ======================================================= */

  const {
    count:
      activeProcessCount,

    error:
      processCountError,
  } = await adminSupabase
    .from(
      "coaching_processes",
    )
    .select(
      "id",
      {
        count:
          "exact",

        head:
          true,
      },
    )
    .eq(
      "status",
      "active",
    );

  /* =======================================================
     PROCESOS ACTIVOS — RESUMEN
  ======================================================= */

  const {
    data:
      processData,

    error:
      processesError,
  } = await adminSupabase
    .from(
      "coaching_processes",
    )
    .select(`
      id,
      process_reference,
      customer_name,
      service_name_snapshot,
      total_sessions,
      status,
      created_at
    `)
    .eq(
      "status",
      "active",
    )
    .order(
      "created_at",
      {
        ascending:
          false,
      },
    )
    .limit(6);

  const activeProcesses =
    (processData ??
      []) as CoachingProcess[];

  /* =======================================================
     SESIONES DE ESOS PROCESOS
  ======================================================= */

  const processIds =
    activeProcesses.map(
      (process) =>
        process.id,
    );

  let processBookings:
    ProcessBooking[] = [];

  let processBookingsError:
    string
    | null = null;

  if (
    processIds.length >
    0
  ) {
    const {
      data,
      error,
    } = await adminSupabase
      .from("bookings")
      .select(`
        process_id,
        package_session_number,
        status,
        starts_at
      `)
      .in(
        "process_id",
        processIds,
      )
      .neq(
        "status",
        "cancelled",
      )
      .order(
        "starts_at",
        {
          ascending:
            true,
        },
      );

    if (error) {
      console.error(
        "Error loading process bookings:",
        error,
      );

      processBookingsError =
        error.message;
    } else {
      processBookings =
        (data ??
          []) as ProcessBooking[];
    }
  }

  /* =======================================================
     MÉTRICAS DE AGENDA
  ======================================================= */

  const today =
    getDateKey(now);

  const {
    monday,
    sunday,
  } =
    getWeekRange(
      today,
    );

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
          date >=
            monday &&
          date <=
            sunday
        );
      },
    ).length;

  /* =======================================================
     RESUMEN DE PROCESOS

     Mostramos primero los procesos que todavía
     no tienen una próxima sesión agendada.
  ======================================================= */

  const processSummaries =
    activeProcesses
      .map(
        (process) => {
          const sessions =
            processBookings.filter(
              (booking) =>
                booking.process_id ===
                process.id,
            );

          const scheduled =
            sessions.length;

          const completed =
            sessions.filter(
              (booking) =>
                booking.status ===
                "completed",
            ).length;

          const nextBooking =
            sessions.find(
              (booking) =>
                [
                  "pending",
                  "confirmed",
                ].includes(
                  booking.status,
                ) &&
                new Date(
                  booking.starts_at,
                ) >=
                  now,
            ) ??
            null;

          const progress =
            process.total_sessions >
            0
              ? Math.min(
                  100,
                  Math.round(
                    (scheduled /
                      process.total_sessions) *
                      100,
                  ),
                )
              : 0;

          return {
            ...process,

            scheduled,
            completed,
            nextBooking,
            progress,
          };
        },
      )
      .sort(
        (a, b) => {
          /*
            Primero ponemos quienes NO tienen
            una próxima sesión agendada.

            Son los que más fácilmente
            podrían requerir seguimiento.
          */

          if (
            !a.nextBooking &&
            b.nextBooking
          ) {
            return -1;
          }

          if (
            a.nextBooking &&
            !b.nextBooking
          ) {
            return 1;
          }

          if (
            a.nextBooking &&
            b.nextBooking
          ) {
            return (
              new Date(
                a.nextBooking.starts_at,
              ).getTime() -
              new Date(
                b.nextBooking.starts_at,
              ).getTime()
            );
          }

          return (
            new Date(
              b.created_at,
            ).getTime() -
            new Date(
              a.created_at,
            ).getTime()
          );
        },
      )
      .slice(
        0,
        4,
      );

  const processDataError =
    processCountError ||
    processesError ||
    processBookingsError;

  /* =======================================================
     UI
  ======================================================= */

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
        {/* =============================================
            HEADER
        ============================================== */}

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

          <form
            action={
              signOut
            }
          >
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

        {/* =============================================
            INTRO
        ============================================== */}

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

        {/* =============================================
            MÉTRICAS
        ============================================== */}

        <section
          className="
            mt-10
            grid
            gap-4
            sm:grid-cols-2
            xl:grid-cols-4
          "
        >
          {/* HOY */}

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
              {
                todayCount
              }
            </p>
          </div>

          {/* SEMANA */}

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
              {
                weekCount
              }
            </p>
          </div>

          {/* PRÓXIMAS */}

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
              {
                upcoming.length
              }
            </p>
          </div>

          {/* PROCESOS */}

          <Link
            href="/admin/procesos"
            className="
              group
              rounded-[1.5rem]
              border
              border-brand-wine/15
              bg-brand-wine
              p-5
              transition
              hover:opacity-95
            "
          >
            <div
              className="
                flex
                items-start
                justify-between
                gap-4
              "
            >
              <div>
                <p
                  className="
                    text-sm
                    text-brand-cream/65
                  "
                >
                  Procesos activos
                </p>

                <p
                  className="
                    mt-3
                    font-display
                    text-4xl
                    font-semibold
                    text-brand-cream
                  "
                >
                  {processCountError
                    ? "—"
                    : activeProcessCount ??
                      0}
                </p>
              </div>

              <span
                className="
                  text-xl
                  text-brand-cream/70
                  transition-transform
                  group-hover:translate-x-1
                "
                aria-hidden="true"
              >
                →
              </span>
            </div>
          </Link>
        </section>

        {/* =============================================
            PROCESOS EN SEGUIMIENTO
        ============================================== */}

        <section
          className="
            mt-12
          "
        >
          <div
            className="
              flex
              items-end
              justify-between
              gap-5
            "
          >
            <div>
              <p
                className="
                  text-sm
                  text-brand-brown/45
                "
              >
                Clientes
              </p>

              <h2
                className="
                  mt-1
                  font-display
                  text-3xl
                  font-semibold
                  text-brand-brown
                "
              >
                Procesos en seguimiento
              </h2>
            </div>

            <Link
              href="/admin/procesos"
              className="
                hidden
                text-sm
                font-semibold
                text-brand-wine
                hover:underline
                sm:inline-flex
              "
            >
              Ver todos →
            </Link>
          </div>

          {processDataError ? (
            <div
              className="
                mt-5
                rounded-[1.5rem]
                border
                border-[#8A3535]/15
                bg-[#F7E8E8]
                p-6
                text-[#8A3535]
              "
            >
              <p
                className="
                  font-semibold
                "
              >
                No fue posible cargar
                los procesos.
              </p>

              <p
                className="
                  mt-2
                  text-sm
                "
              >
                Revisa la conexión con
                la base de datos.
              </p>
            </div>
          ) : processSummaries.length ===
            0 ? (
            <div
              className="
                mt-5
                rounded-[1.5rem]
                border
                border-dashed
                border-brand-taupe/35
                px-6
                py-10
              "
            >
              <p
                className="
                  font-display
                  text-2xl
                  font-semibold
                  text-brand-brown
                "
              >
                No hay procesos activos
              </p>

              <p
                className="
                  mt-2
                  text-sm
                  text-brand-brown/50
                "
              >
                Los clientes que
                contraten un proceso de
                coaching aparecerán aquí.
              </p>
            </div>
          ) : (
            <div
              className="
                mt-5
                grid
                gap-4
                md:grid-cols-2
              "
            >
              {processSummaries.map(
                (process) => (
                  <Link
                    key={
                      process.id
                    }
                    href={`/admin/procesos/${process.id}`}
                    className="
                      group
                      rounded-[1.5rem]
                      border
                      border-brand-taupe/20
                      bg-white/55
                      p-5
                      transition
                      hover:border-brand-wine/25
                      hover:bg-white
                    "
                  >
                    <div
                      className="
                        flex
                        items-start
                        justify-between
                        gap-5
                      "
                    >
                      <div>
                        <p
                          className="
                            text-[0.65rem]
                            font-semibold
                            uppercase
                            tracking-[0.18em]
                            text-brand-wine
                          "
                        >
                          {
                            process.process_reference
                          }
                        </p>

                        <h3
                          className="
                            mt-2
                            font-display
                            text-2xl
                            font-semibold
                            text-brand-brown
                          "
                        >
                          {
                            process.customer_name
                          }
                        </h3>

                        <p
                          className="
                            mt-1
                            text-sm
                            text-brand-brown/45
                          "
                        >
                          {
                            process.service_name_snapshot
                          }
                        </p>
                      </div>

                      <span
                        className="
                          text-lg
                          text-brand-wine/50
                          transition-transform
                          group-hover:translate-x-1
                        "
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </div>

                    <div
                      className="
                        mt-6
                        flex
                        items-end
                        justify-between
                        gap-5
                      "
                    >
                      <div>
                        <p
                          className="
                            text-xs
                            text-brand-brown/40
                          "
                        >
                          Sesiones
                        </p>

                        <p
                          className="
                            mt-1
                            text-sm
                            font-semibold
                            text-brand-brown
                          "
                        >
                          {
                            process.scheduled
                          }{" "}
                          de{" "}
                          {
                            process.total_sessions
                          }{" "}
                          agendadas
                        </p>
                      </div>

                      <div
                        className="
                          text-right
                        "
                      >
                        <p
                          className="
                            text-xs
                            text-brand-brown/40
                          "
                        >
                          Completadas
                        </p>

                        <p
                          className="
                            mt-1
                            text-sm
                            font-semibold
                            text-brand-brown
                          "
                        >
                          {
                            process.completed
                          }{" "}
                          de{" "}
                          {
                            process.total_sessions
                          }
                        </p>
                      </div>
                    </div>

                    <div
                      className="
                        mt-4
                        h-1.5
                        overflow-hidden
                        rounded-full
                        bg-brand-taupe/20
                      "
                    >
                      <div
                        className="
                          h-full
                          rounded-full
                          bg-brand-wine
                        "
                        style={{
                          width:
                            `${process.progress}%`,
                        }}
                      />
                    </div>

                    <div
                      className="
                        mt-5
                        border-t
                        border-brand-taupe/15
                        pt-4
                      "
                    >
                      {process.nextBooking ? (
                        <>
                          <p
                            className="
                              text-xs
                              text-brand-brown/40
                            "
                          >
                            Próxima sesión
                          </p>

                          <p
                            className="
                              mt-1
                              text-sm
                              font-semibold
                              text-brand-green
                            "
                          >
                            {formatProcessDate(
                              process.nextBooking
                                .starts_at,
                            )}
                          </p>
                        </>
                      ) : (
                        <>
                          <p
                            className="
                              text-xs
                              text-brand-brown/40
                            "
                          >
                            Próxima sesión
                          </p>

                          <p
                            className="
                              mt-1
                              text-sm
                              font-semibold
                              text-brand-wine
                            "
                          >
                            Sin sesión
                            próxima agendada
                          </p>
                        </>
                      )}
                    </div>
                  </Link>
                ),
              )}
            </div>
          )}

          <Link
            href="/admin/procesos"
            className="
              mt-5
              inline-flex
              text-sm
              font-semibold
              text-brand-wine
              sm:hidden
            "
          >
            Ver todos los procesos →
          </Link>
        </section>

        {/* =============================================
            PRÓXIMAS SESIONES
        ============================================== */}

        <section
          className="
            mt-12
          "
        >
          <div
            className="
              mb-5
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

            <h2
              className="
                mt-1
                font-display
                text-3xl
                font-semibold
                text-brand-brown
              "
            >
              Próximas reservas
            </h2>
          </div>

          {bookingsError ? (
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
              <p
                className="
                  font-semibold
                "
              >
                No fue posible cargar
                las reservas.
              </p>

              <p
                className="
                  mt-2
                  text-sm
                "
              >
                {
                  bookingsError.message
                }
              </p>
            </div>
          ) : upcoming.length ===
            0 ? (
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
            <div
              className="
                space-y-5
              "
            >
              {upcoming.map(
                (booking) => (
                  <BookingCard
                    key={
                      booking.id
                    }
                    booking={
                      booking
                    }
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