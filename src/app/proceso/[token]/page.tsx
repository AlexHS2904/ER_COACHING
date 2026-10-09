import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  getProcessByToken,
} from "@/lib/coaching/get-process-by-token";

export const metadata = {
  title:
    "Mi proceso de coaching",

  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic =
  "force-dynamic";

/* =========================================================
   TYPES
========================================================= */

type ProcessPageProps = {
  params: Promise<{
    token: string;
  }>;
};

/* =========================================================
   HELPERS
========================================================= */

function formatPrice(
  price:
    | number
    | string
    | null,
  currency: string,
) {
  if (price === null) {
    return null;
  }

  const value =
    typeof price === "string"
      ? Number(price)
      : price;

  if (
    Number.isNaN(value)
  ) {
    return null;
  }

  return new Intl.NumberFormat(
    "es-MX",
    {
      style:
        "currency",

      currency,

      maximumFractionDigits:
        0,
    },
  ).format(value);
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

function getStatusLabel(
  status: string,
) {
  switch (status) {
    case "pending":
      return "Pendiente";

    case "confirmed":
      return "Confirmada";

    case "completed":
      return "Completada";

    case "cancelled":
      return "Cancelada";

    default:
      return status;
  }
}

function getStatusClasses(
  status: string,
) {
  switch (status) {
    case "confirmed":
      return `
        bg-brand-green/10
        text-brand-green
      `;

    case "completed":
      return `
        bg-brand-wine/10
        text-brand-wine
      `;

    case "pending":
      return `
        bg-brand-taupe/20
        text-brand-brown
      `;

    case "cancelled":
      return `
        bg-brand-taupe/15
        text-brand-brown/45
      `;

    default:
      return `
        bg-brand-taupe/15
        text-brand-brown/60
      `;
  }
}

function getProcessStatusLabel(
  status: string,
) {
  switch (status) {
    case "active":
      return "En curso";

    case "completed":
      return "Completado";

    case "cancelled":
      return "Cerrado";

    default:
      return status;
  }
}

function getProcessStatusClasses(
  status: string,
) {
  switch (status) {
    case "active":
      return `
        bg-brand-green/10
        text-brand-green
      `;

    case "completed":
      return `
        bg-brand-wine/10
        text-brand-wine
      `;

    default:
      return `
        bg-brand-taupe/20
        text-brand-brown/55
      `;
  }
}

/* =========================================================
   PAGE
========================================================= */

export default async function ProcessPage({
  params,
}: ProcessPageProps) {
  const {
    token,
  } = await params;

  const data =
    await getProcessByToken(
      token,
    );

  if (!data) {
    notFound();
  }

  const {
    process,
    bookings,
    timezone,
  } = data;

  /* =======================================================
     RESERVAS ACTIVAS

     Una reserva cancelada NO ocupa
     una sesión del paquete.
  ======================================================= */

  const activeBookings =
    bookings.filter(
      (booking) =>
        booking.status !==
        "cancelled",
    );

  const scheduledSessions =
    activeBookings.length;

  const completedSessions =
    activeBookings.filter(
      (booking) =>
        booking.status ===
        "completed",
    ).length;

  const price =
    formatPrice(
      process.price_snapshot,
      process.currency_snapshot,
    );

  /* =======================================================
     CONSTRUIR SESIONES 1...N
  ======================================================= */

  const sessions =
    Array.from(
      {
        length:
          process.total_sessions,
      },
      (
        _,
        index,
      ) => {
        const sessionNumber =
          index + 1;

        const booking =
          activeBookings.find(
            (item) =>
              item.package_session_number ===
              sessionNumber,
          ) ?? null;

        return {
          number:
            sessionNumber,

          booking,
        };
      },
    );

  /* =======================================================
     SIGUIENTE SESIÓN DISPONIBLE

     Solo la primera sesión sin booking puede
     agendarse desde el portal.
  ======================================================= */

  const nextSessionNumber =
    sessions.find(
      (session) =>
        !session.booking,
    )?.number ?? null;

  /* =======================================================
     PROGRESO

     El porcentaje principal representa las
     sesiones ya agendadas.
  ======================================================= */

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

  return (
    <main
      className="
        min-h-screen
        bg-brand-cream
        text-brand-brown
      "
    >
      {/* ===============================================
          CABECERA
      ================================================ */}

      <section
        className="
          border-b
          border-brand-taupe/20
          px-5
          py-7
          sm:px-8
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-[1100px]
            items-center
            justify-between
            gap-5
          "
        >
          <Link
            href="/"
            className="
              font-display
              text-2xl
              font-semibold
              text-brand-wine
              sm:text-3xl
            "
          >
            Edna Rojo
          </Link>

          <p
            className="
              text-right
              text-[0.65rem]
              font-semibold
              uppercase
              tracking-[0.2em]
              text-brand-brown/45
            "
          >
            Área privada
          </p>
        </div>
      </section>

      {/* ===============================================
          HERO
      ================================================ */}

      <section
        className="
          px-5
          pb-12
          pt-12
          sm:px-8
          sm:pb-16
          sm:pt-16
        "
      >
        <div
          className="
            mx-auto
            max-w-[1100px]
          "
        >
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
                tracking-[0.28em]
                text-brand-wine
              "
            >
              Tu proceso
            </p>

            <span
              className={`
                rounded-full
                px-3
                py-1
                text-[0.65rem]
                font-semibold
                uppercase
                tracking-[0.12em]
                ${getProcessStatusClasses(
                  process.status,
                )}
              `}
            >
              {getProcessStatusLabel(
                process.status,
              )}
            </span>
          </div>

          <div
            className="
              mt-5
              grid
              gap-8
              lg:grid-cols-[1fr_auto]
              lg:items-end
            "
          >
            <div>
              <h1
                className="
                  max-w-[760px]
                  font-display
                  text-5xl
                  font-semibold
                  leading-[0.95]
                  tracking-[-0.02em]
                  text-brand-brown
                  sm:text-6xl
                "
              >
                {
                  process.service_name_snapshot
                }
              </h1>

              <p
                className="
                  mt-5
                  max-w-[600px]
                  text-base
                  leading-7
                  text-brand-black/60
                "
              >
                Hola{" "}

                {
                  process.customer_name
                    .trim()
                    .split(
                      /\s+/,
                    )[0]
                }

                . Desde aquí podrás
                consultar y gestionar
                las sesiones de tu
                proceso de coaching.
              </p>
            </div>

            <div
              className="
                rounded-2xl
                border
                border-brand-taupe/25
                bg-white/55
                px-5
                py-4
                lg:min-w-[220px]
              "
            >
              <p
                className="
                  text-[0.65rem]
                  font-semibold
                  uppercase
                  tracking-[0.2em]
                  text-brand-brown/45
                "
              >
                Referencia
              </p>

              <p
                className="
                  mt-2
                  font-semibold
                  text-brand-wine
                "
              >
                {
                  process.process_reference
                }
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===============================================
          PROCESO COMPLETADO
      ================================================ */}

      {process.status ===
        "completed" && (
        <section
          className="
            px-5
            pb-10
            sm:px-8
          "
        >
          <div
            className="
              mx-auto
              max-w-[1100px]
              overflow-hidden
              rounded-[1.75rem]
              border
              border-brand-green/15
              bg-brand-green/[0.06]
              px-6
              py-7
              sm:px-8
              sm:py-9
            "
          >
            <div
              className="
                max-w-[720px]
              "
            >
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.24em]
                  text-brand-green
                "
              >
                Proceso completado
              </p>

              <h2
                className="
                  mt-3
                  font-display
                  text-3xl
                  font-semibold
                  leading-tight
                  text-brand-brown
                  sm:text-4xl
                "
              >
                Has completado tu
                proceso de coaching.
              </h2>

              <p
                className="
                  mt-4
                  max-w-[650px]
                  text-sm
                  leading-7
                  text-brand-brown/55
                  sm:text-base
                "
              >
                Tus sesiones quedan
                disponibles en este
                espacio para que puedas
                consultar las fechas y
                los accesos asociados
                a tu proceso.
              </p>

              <div
                className="
                  mt-6
                  flex
                  flex-wrap
                  gap-3
                "
              >
                <span
                  className="
                    rounded-full
                    bg-white/70
                    px-4
                    py-2
                    text-sm
                    font-semibold
                    text-brand-green
                  "
                >
                  {
                    completedSessions
                  }{" "}
                  de{" "}
                  {
                    process.total_sessions
                  }{" "}
                  sesiones completadas
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===============================================
          RESUMEN
      ================================================ */}

      <section
        className="
          px-5
          sm:px-8
        "
      >
        <div
          className="
            mx-auto
            grid
            max-w-[1100px]
            gap-4
            md:grid-cols-3
          "
        >
          {/* SESIONES */}

          <div
            className="
              rounded-[1.5rem]
              border
              border-brand-taupe/25
              bg-white/65
              p-6
            "
          >
            <p
              className="
                text-[0.65rem]
                font-semibold
                uppercase
                tracking-[0.2em]
                text-brand-brown/45
              "
            >
              Sesiones
            </p>

            <p
              className="
                mt-3
                font-display
                text-4xl
                font-semibold
                text-brand-wine
              "
            >
              {
                process.total_sessions
              }
            </p>
          </div>

          {/* DURACIÓN */}

          <div
            className="
              rounded-[1.5rem]
              border
              border-brand-taupe/25
              bg-white/65
              p-6
            "
          >
            <p
              className="
                text-[0.65rem]
                font-semibold
                uppercase
                tracking-[0.2em]
                text-brand-brown/45
              "
            >
              Duración
            </p>

            <p
              className="
                mt-3
                font-display
                text-4xl
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

          {/* INVERSIÓN */}

          <div
            className="
              rounded-[1.5rem]
              border
              border-brand-taupe/25
              bg-white/65
              p-6
            "
          >
            <p
              className="
                text-[0.65rem]
                font-semibold
                uppercase
                tracking-[0.2em]
                text-brand-brown/45
              "
            >
              Inversión
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
                price ??
                "Consulta"
              }
            </p>
          </div>
        </div>
      </section>

      {/* ===============================================
          PROGRESO
      ================================================ */}

      <section
        className="
          px-5
          py-10
          sm:px-8
        "
      >
        <div
          className="
            mx-auto
            max-w-[1100px]
            rounded-[1.75rem]
            border
            border-brand-taupe/25
            bg-white/55
            p-6
            sm:p-8
          "
        >
          <div
            className="
              flex
              flex-col
              gap-3
              sm:flex-row
              sm:items-end
              sm:justify-between
            "
          >
            <div>
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.22em]
                  text-brand-wine
                "
              >
                Progreso
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
                {
                  scheduledSessions
                }{" "}
                de{" "}
                {
                  process.total_sessions
                }{" "}
                sesiones agendadas
              </h2>
            </div>

            <p
              className="
                text-sm
                text-brand-brown/55
              "
            >
              {
                completedSessions
              }{" "}
              de{" "}
              {
                process.total_sessions
              }{" "}
              completadas
            </p>
          </div>

          <div
            className="
              mt-6
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
                transition-[width]
                duration-500
              "
              style={{
                width:
                  `${progress}%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* ===============================================
          TODAS LAS SESIONES YA AGENDADAS
      ================================================ */}

      {process.status ===
          "active" &&
        nextSessionNumber ===
          null && (
          <section
            className="
              px-5
              pb-10
              sm:px-8
            "
          >
            <div
              className="
                mx-auto
                max-w-[1100px]
                rounded-[1.5rem]
                border
                border-brand-taupe/25
                bg-white/55
                px-6
                py-5
              "
            >
              <p
                className="
                  text-sm
                  font-semibold
                  text-brand-green
                "
              >
                Todas tus sesiones
                están agendadas.
              </p>

              <p
                className="
                  mt-1
                  text-sm
                  leading-6
                  text-brand-brown/50
                "
              >
                Puedes consultar abajo
                la fecha, horario y
                accesos de cada una.
              </p>
            </div>
          </section>
        )}

      {/* ===============================================
          SESIONES
      ================================================ */}

      <section
        className="
          px-5
          pb-20
          sm:px-8
        "
      >
        <div
          className="
            mx-auto
            max-w-[1100px]
          "
        >
          <div
            className="
              mb-7
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
                  font-semibold
                  uppercase
                  tracking-[0.22em]
                  text-brand-wine
                "
              >
                Tus sesiones
              </p>

              <h2
                className="
                  mt-2
                  font-display
                  text-4xl
                  font-semibold
                  text-brand-brown
                "
              >
                Tu recorrido
              </h2>
            </div>
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
                const isNextSession =
                  number ===
                  nextSessionNumber;

                return (
                  <article
                    key={
                      number
                    }
                    className="
                      rounded-[1.5rem]
                      border
                      border-brand-taupe/25
                      bg-white/65
                      p-5
                      sm:p-6
                    "
                  >
                    <div
                      className="
                        flex
                        flex-col
                        gap-5
                        sm:flex-row
                        sm:items-center
                        sm:justify-between
                      "
                    >
                      {/* ===========================
                          INFORMACIÓN
                      ============================ */}

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
                                ? "bg-brand-wine text-brand-cream"
                                : "border border-brand-taupe/40 text-brand-brown/45"
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
                                  text-brand-black/60
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
                                  text-brand-black/60
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
                            </>
                          ) : (
                            <p
                              className="
                                mt-1
                                text-sm
                                text-brand-black/45
                              "
                            >
                              Aún no
                              agendada
                            </p>
                          )}
                        </div>
                      </div>

                      {/* ===========================
                          ACCIONES / ESTADO
                      ============================ */}

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

                              ${getStatusClasses(
                                booking.status,
                              )}
                            `}
                          >
                            {getStatusLabel(
                              booking.status,
                            )}
                          </span>

                          {booking.google_meet_url &&
                            booking.status ===
                              "confirmed" && (
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
                                Entrar a Meet
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
                              Ver en calendario
                            </a>
                          )}
                        </div>
                      ) : (
                        <div>
                          {process.status ===
                            "active" &&
                          isNextSession ? (
                            <Link
                              href={`/proceso/${token}/agendar`}
                              className="
                                inline-flex
                                items-center
                                justify-center
                                rounded-xl
                                bg-brand-wine
                                px-5
                                py-3
                                text-sm
                                font-semibold
                                text-white
                                transition
                                hover:opacity-90
                              "
                            >
                              Agendar sesión
                            </Link>
                          ) : (
                            <span
                              className="
                                inline-flex
                                rounded-xl
                                border
                                border-brand-taupe/25
                                px-4
                                py-3
                                text-sm
                                font-semibold
                                text-brand-brown/35
                              "
                            >
                              {process.status ===
                              "completed"
                                ? "Proceso completado"
                                : process.status !==
                                    "active"
                                  ? "Proceso cerrado"
                                  : "Disponible después"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              },
            )}
          </div>

          {/* =============================================
              AVISO DE PRIVACIDAD DEL TOKEN
          ============================================== */}

          <p
            className="
              mx-auto
              mt-8
              max-w-[620px]
              text-center
              text-xs
              leading-6
              text-brand-brown/45
            "
          >
            Este enlace es privado.
            No lo compartas con
            otras personas, ya que
            permite consultar y
            gestionar tus sesiones.
          </p>
        </div>
      </section>
    </main>
  );
}