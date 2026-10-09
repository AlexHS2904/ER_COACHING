import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import RegenerateProcessAccessButton from "@/components/admin/RegenerateProcessAccessButton";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TYPES
========================================================= */

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type CoachingProcess = {
  id: string;
  process_reference: string;

  customer_name: string;
  customer_email: string;
  customer_phone:
    | string
    | null;

  service_name_snapshot: string;

  duration_minutes_snapshot:
    | number
    | null;

  price_snapshot:
    | number
    | string
    | null;

  currency_snapshot: string;

  total_sessions: number;

  status: string;

  created_at: string;
  updated_at: string;
};

type ProcessBooking = {
  id: string;

  booking_reference:
    | string
    | null;

  package_session_number:
    | number
    | null;

  starts_at: string;
  ends_at: string;

  status: string;

  google_meet_url:
    | string
    | null;

  google_calendar_url:
    | string
    | null;

  customer_email_status:
    string;

  coach_email_status:
    string;
};

/* =========================================================
   HELPERS
========================================================= */

function formatPrice(
  value:
    | number
    | string
    | null,

  currency: string,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "es-MX",
    {
      style:
        "currency",

      currency:
        currency ||
        "MXN",

      maximumFractionDigits:
        0,
    },
  ).format(
    Number(value),
  );
}

function formatDate(
  value: string,
  timezone: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      timeZone:
        timezone,

      weekday:
        "long",

      day:
        "numeric",

      month:
        "long",

      year:
        "numeric",
    },
  ).format(
    new Date(value),
  );
}

function formatTime(
  value: string,
  timezone: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      timeZone:
        timezone,

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

function getProcessStatus(
  status: string,
) {
  switch (status) {
    case "active":
      return {
        label:
          "Activo",

        className:
          "bg-[#E8F2EC] text-[#295C3B]",
      };

    case "completed":
      return {
        label:
          "Completado",

        className:
          "bg-brand-wine/10 text-brand-wine",
      };

    case "cancelled":
      return {
        label:
          "Cerrado",

        className:
          "bg-brand-taupe/20 text-brand-brown/60",
      };

    default:
      return {
        label:
          status,

        className:
          "bg-brand-taupe/20 text-brand-brown/60",
      };
  }
}

function getBookingStatus(
  status: string,
) {
  switch (status) {
    case "confirmed":
      return {
        label:
          "Confirmada",

        className:
          "bg-[#E8F2EC] text-[#295C3B]",
      };

    case "completed":
      return {
        label:
          "Completada",

        className:
          "bg-brand-wine/10 text-brand-wine",
      };

    case "pending":
      return {
        label:
          "Pendiente",

        className:
          "bg-[#F5EFD9] text-[#80671C]",
      };

    case "cancelled":
      return {
        label:
          "Cancelada",

        className:
          "bg-brand-taupe/20 text-brand-brown/50",
      };

    default:
      return {
        label:
          status,

        className:
          "bg-brand-taupe/20 text-brand-brown/50",
      };
  }
}

/* =========================================================
   PAGE
========================================================= */

export default async function ProcessDetailPage({
  params,
}: PageProps) {
  const {
    id,
  } = await params;

  const supabase =
    getSupabaseAdmin();

  /* =======================================================
     PROCESO
  ======================================================= */

  const {
    data:
      processData,
    error:
      processError,
  } = await supabase
    .from(
      "coaching_processes",
    )
    .select(
      `
        id,
        process_reference,

        customer_name,
        customer_email,
        customer_phone,

        service_name_snapshot,
        duration_minutes_snapshot,

        price_snapshot,
        currency_snapshot,

        total_sessions,

        status,

        created_at,
        updated_at
      `,
    )
    .eq(
      "id",
      id,
    )
    .maybeSingle();

  if (
    processError ||
    !processData
  ) {
    if (processError) {
      console.error(
        "Error loading coaching process:",
        processError,
      );
    }

    notFound();
  }

  const process =
    processData as CoachingProcess;

  /* =======================================================
     SESIONES
  ======================================================= */

  const {
    data:
      bookingData,
    error:
      bookingError,
  } = await supabase
    .from("bookings")
    .select(
      `
        id,
        booking_reference,

        package_session_number,

        starts_at,
        ends_at,

        status,

        google_meet_url,
        google_calendar_url,

        customer_email_status,
        coach_email_status
      `,
    )
    .eq(
      "process_id",
      process.id,
    )
    .order(
      "package_session_number",
      {
        ascending:
          true,
      },
    )
    .order(
      "starts_at",
      {
        ascending:
          true,
      },
    );

  if (bookingError) {
    console.error(
      "Error loading process bookings:",
      bookingError,
    );

    throw new Error(
      "No fue posible cargar las sesiones del proceso.",
    );
  }

  const bookings =
    (bookingData ??
      []) as ProcessBooking[];

  /* =======================================================
     TIMEZONE
  ======================================================= */

  const {
    data:
      settings,
  } = await supabase
    .from(
      "booking_settings",
    )
    .select(
      "timezone",
    )
    .eq(
      "id",
      1,
    )
    .maybeSingle();

  const timezone =
    settings?.timezone ??
    "America/Mexico_City";

  /* =======================================================
     SESIONES ACTIVAS VS HISTÓRICAS
  ======================================================= */

  const activeBookings =
    bookings.filter(
      (booking) =>
        booking.status !==
        "cancelled",
    );

  const cancelledBookings =
    bookings.filter(
      (booking) =>
        booking.status ===
        "cancelled",
    );

  const completedSessions =
    activeBookings.filter(
      (booking) =>
        booking.status ===
        "completed",
    ).length;

  const scheduledSessions =
    activeBookings.length;

  /* =======================================================
     MAPA 1...N
  ======================================================= */

  const sessions =
    Array.from(
      {
        length:
          process.total_sessions,
      },
      (_, index) => {
        const number =
          index + 1;

        const booking =
          activeBookings.find(
            (item) =>
              item.package_session_number ===
              number,
          ) ?? null;

        return {
          number,
          booking,
        };
      },
    );

  const progress =
    process.total_sessions >
    0
      ? Math.min(
          100,
          Math.round(
            (scheduledSessions /
              process.total_sessions) *
              100,
          ),
        )
      : 0;

  const processStatus =
    getProcessStatus(
      process.status,
    );

  return (
    <div
      className="
        space-y-8
      "
    >
      {/* ===============================================
          BACK
      ================================================ */}

      <Link
        href="/admin/procesos"
        className="
          inline-flex
          items-center
          gap-2
          text-sm
          font-semibold
          text-brand-wine
        "
      >
        ← Procesos
      </Link>

      {/* ===============================================
          HEADER
      ================================================ */}

      <div
        className="
          flex
          flex-col
          gap-5
          lg:flex-row
          lg:items-end
          lg:justify-between
        "
      >
        <div>
          <div
            className="
              flex
              flex-wrap
              items-center
              gap-3
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.22em]
                text-brand-wine
              "
            >
              {
                process.process_reference
              }
            </p>

            <span
              className={`
                rounded-full
                px-3
                py-1
                text-xs
                font-semibold
                ${processStatus.className}
              `}
            >
              {
                processStatus.label
              }
            </span>
          </div>

          <h1
            className="
              mt-3
              font-display
              text-4xl
              font-semibold
              text-brand-brown
              sm:text-5xl
            "
          >
            {
              process.customer_name
            }
          </h1>

          <p
            className="
              mt-3
              text-sm
              text-brand-brown/55
            "
          >
            {
              process.service_name_snapshot
            }
          </p>
        </div>

        <div
          className="
            text-sm
            text-brand-brown/45
          "
        >
          Iniciado el{" "}
          {formatDate(
            process.created_at,
            timezone,
          )}
        </div>
      </div>

      {/* ===============================================
          CLIENTE + PROCESO
      ================================================ */}

      <div
        className="
          grid
          gap-5
          lg:grid-cols-2
        "
      >
        {/* CLIENTE */}

        <section
          className="
            rounded-[1.5rem]
            border
            border-brand-taupe/25
            bg-white
            p-6
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.2em]
              text-brand-wine
            "
          >
            Cliente
          </p>

          <div
            className="
              mt-6
              space-y-5
            "
          >
            <div>
              <p
                className="
                  text-xs
                  text-brand-brown/40
                "
              >
                Nombre
              </p>

              <p
                className="
                  mt-1
                  font-semibold
                  text-brand-brown
                "
              >
                {
                  process.customer_name
                }
              </p>
            </div>

            <div>
              <p
                className="
                  text-xs
                  text-brand-brown/40
                "
              >
                Correo
              </p>

              <a
                href={`mailto:${process.customer_email}`}
                className="
                  mt-1
                  inline-block
                  font-semibold
                  text-brand-wine
                  hover:underline
                "
              >
                {
                  process.customer_email
                }
              </a>
            </div>

            <div>
              <p
                className="
                  text-xs
                  text-brand-brown/40
                "
              >
                Teléfono
              </p>

              <div
                className="
                    border-t
                    border-brand-taupe/20
                    pt-5
                "
                >
                <p
                    className="
                    mb-3
                    text-xs
                    text-brand-brown/40
                    "
                >
                    Acceso privado
                </p>

                <RegenerateProcessAccessButton
                    processId={
                    process.id
                    }
                    customerEmail={
                    process.customer_email
                    }
                    disabled={
                    process.status ===
                    "cancelled"
                    }
                />
                </div>

              {process.customer_phone ? (
                <a
                  href={`tel:${process.customer_phone}`}
                  className="
                    mt-1
                    inline-block
                    font-semibold
                    text-brand-brown
                    hover:text-brand-wine
                  "
                >
                  {
                    process.customer_phone
                  }
                </a>
              ) : (
                <p
                  className="
                    mt-1
                    text-brand-brown/40
                  "
                >
                  No registrado
                </p>
              )}
            </div>
          </div>
        </section>

        {/* PROCESO */}

        <section
          className="
            rounded-[1.5rem]
            border
            border-brand-taupe/25
            bg-white
            p-6
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.2em]
              text-brand-wine
            "
          >
            Proceso
          </p>

          <div
            className="
              mt-6
              grid
              grid-cols-2
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
                  font-display
                  text-3xl
                  font-semibold
                  text-brand-brown
                "
              >
                {
                  process.total_sessions
                }
              </p>
            </div>

            <div>
              <p
                className="
                  text-xs
                  text-brand-brown/40
                "
              >
                Duración
              </p>

              <p
                className="
                  mt-1
                  font-display
                  text-3xl
                  font-semibold
                  text-brand-green
                "
              >
                {
                  process.duration_minutes_snapshot ??
                  "—"
                }

                {process.duration_minutes_snapshot
                  ? " min"
                  : ""}
              </p>
            </div>

            <div>
              <p
                className="
                  text-xs
                  text-brand-brown/40
                "
              >
                Inversión
              </p>

              <p
                className="
                  mt-1
                  font-semibold
                  text-brand-brown
                "
              >
                {formatPrice(
                  process.price_snapshot,
                  process.currency_snapshot,
                )}
              </p>
            </div>

            <div>
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
                  font-semibold
                  text-brand-brown
                "
              >
                {
                  completedSessions
                }{" "}
                de{" "}
                {
                  process.total_sessions
                }
              </p>
            </div>
          </div>

          {/* PROGRESS */}

          <div
            className="
              mt-7
            "
          >
            <div
              className="
                mb-2
                flex
                items-center
                justify-between
                gap-4
              "
            >
              <p
                className="
                  text-xs
                  font-semibold
                  text-brand-brown/55
                "
              >
                {
                  scheduledSessions
                }{" "}
                de{" "}
                {
                  process.total_sessions
                }{" "}
                agendadas
              </p>

              <p
                className="
                  text-xs
                  text-brand-brown/40
                "
              >
                {
                  progress
                }
                %
              </p>
            </div>

            <div
              className="
                h-2
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
                    `${progress}%`,
                }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* ===============================================
          SESIONES
      ================================================ */}

      <section>
        <div
          className="
            mb-5
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.2em]
              text-brand-wine
            "
          >
            Seguimiento
          </p>

          <h2
            className="
              mt-2
              font-display
              text-3xl
              font-semibold
              text-brand-brown
            "
          >
            Sesiones del proceso
          </h2>
        </div>

        <div
          className="
            space-y-4
          "
        >
          {sessions.map(
            ({
              number,
              booking,
            }) => {
              const bookingStatus =
                booking
                  ? getBookingStatus(
                      booking.status,
                    )
                  : null;

              return (
                <article
                  key={
                    number
                  }
                  className="
                    rounded-[1.5rem]
                    border
                    border-brand-taupe/25
                    bg-white
                    p-5
                    sm:p-6
                  "
                >
                  <div
                    className="
                      flex
                      flex-col
                      gap-5
                      md:flex-row
                      md:items-center
                      md:justify-between
                    "
                  >
                    <div
                      className="
                        flex
                        items-start
                        gap-4
                      "
                    >
                      <div
                        className={`
                          flex
                          h-11
                          w-11
                          shrink-0
                          items-center
                          justify-center
                          rounded-full
                          font-semibold

                          ${
                            booking
                              ? "bg-brand-wine text-white"
                              : "border border-brand-taupe/35 text-brand-brown/40"
                          }
                        `}
                      >
                        {
                          number
                        }
                      </div>

                      <div>
                        <p
                          className="
                            font-semibold
                            text-brand-brown
                          "
                        >
                          Sesión{" "}
                          {
                            number
                          }
                        </p>

                        {booking ? (
                          <>
                            <p
                              className="
                                mt-1
                                text-sm
                                capitalize
                                text-brand-brown/55
                              "
                            >
                              {formatDate(
                                booking.starts_at,
                                timezone,
                              )}
                            </p>

                            <p
                              className="
                                mt-1
                                text-sm
                                text-brand-brown/55
                              "
                            >
                              {formatTime(
                                booking.starts_at,
                                timezone,
                              )}

                              {
                                " – "
                              }

                              {formatTime(
                                booking.ends_at,
                                timezone,
                              )}
                            </p>

                            {booking.booking_reference && (
                              <p
                                className="
                                  mt-2
                                  text-xs
                                  font-semibold
                                  text-brand-wine
                                "
                              >
                                {
                                  booking.booking_reference
                                }
                              </p>
                            )}
                          </>
                        ) : (
                          <p
                            className="
                              mt-1
                              text-sm
                              text-brand-brown/40
                            "
                          >
                            Aún no
                            agendada
                          </p>
                        )}
                      </div>
                    </div>

                    {booking ? (
                      <div
                        className="
                          flex
                          flex-wrap
                          items-center
                          gap-3
                        "
                      >
                        <span
                          className={`
                            rounded-full
                            px-3
                            py-1.5
                            text-xs
                            font-semibold
                            ${bookingStatus?.className}
                          `}
                        >
                          {
                            bookingStatus?.label
                          }
                        </span>

                        {booking.google_meet_url && (
                          <a
                            href={
                              booking.google_meet_url
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="
                              text-sm
                              font-semibold
                              text-brand-wine
                              underline
                              underline-offset-4
                            "
                          >
                            Meet
                          </a>
                        )}

                        {booking.google_calendar_url && (
                          <a
                            href={
                              booking.google_calendar_url
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="
                              text-sm
                              font-semibold
                              text-brand-green
                              underline
                              underline-offset-4
                            "
                          >
                            Calendar
                          </a>
                        )}
                      </div>
                    ) : (
                      <span
                        className="
                          text-sm
                          font-semibold
                          text-brand-brown/30
                        "
                      >
                        Pendiente de agendar
                      </span>
                    )}
                  </div>
                </article>
              );
            },
          )}
        </div>
      </section>

      {/* ===============================================
          HISTORIAL DE CANCELACIONES

          Solo informativo. No hay acción para cancelar
          el proceso desde la plataforma.
      ================================================ */}

      {cancelledBookings.length >
        0 && (
        <section
          className="
            rounded-[1.5rem]
            border
            border-brand-taupe/25
            bg-white/60
            p-6
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.2em]
              text-brand-brown/40
            "
          >
            Historial
          </p>

          <h2
            className="
              mt-2
              font-display
              text-2xl
              font-semibold
              text-brand-brown
            "
          >
            Sesiones canceladas
          </h2>

          <div
            className="
              mt-5
              space-y-3
            "
          >
            {cancelledBookings.map(
              (booking) => (
                <div
                  key={
                    booking.id
                  }
                  className="
                    flex
                    flex-col
                    gap-2
                    rounded-xl
                    border
                    border-brand-taupe/20
                    px-4
                    py-3
                    sm:flex-row
                    sm:items-center
                    sm:justify-between
                  "
                >
                  <div>
                    <p
                      className="
                        text-sm
                        font-semibold
                        text-brand-brown
                      "
                    >
                      Sesión{" "}
                      {
                        booking.package_session_number ??
                        "—"
                      }
                    </p>

                    <p
                      className="
                        mt-1
                        text-xs
                        capitalize
                        text-brand-brown/45
                      "
                    >
                      {formatDate(
                        booking.starts_at,
                        timezone,
                      )}

                      {
                        " · "
                      }

                      {formatTime(
                        booking.starts_at,
                        timezone,
                      )}
                    </p>
                  </div>

                  <span
                    className="
                      text-xs
                      font-semibold
                      text-brand-brown/40
                    "
                  >
                    Cancelada
                  </span>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {/* ===============================================
          NOTA OPERATIVA
      ================================================ */}

      <div
        className="
          rounded-xl
          border
          border-brand-taupe/20
          bg-brand-cream/40
          px-5
          py-4
        "
      >
        <p
          className="
            text-xs
            leading-6
            text-brand-brown/45
          "
        >
          Cualquier cancelación del proceso,
          devolución o acuerdo económico se
          gestiona directamente con el cliente,
          fuera de la plataforma.
        </p>
      </div>
    </div>
  );
}