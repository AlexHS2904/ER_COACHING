import Link from "next/link";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TYPES
========================================================= */

type CoachingProcess = {
  id: string;
  process_reference: string;

  customer_name: string;
  customer_email: string;
  customer_phone:
    | string
    | null;

  service_name_snapshot: string;

  total_sessions: number;

  price_snapshot:
    | number
    | string
    | null;

  currency_snapshot: string;

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
   HELPERS
========================================================= */

function formatPrice(
  price:
    | number
    | string
    | null,

  currency: string,
) {
  if (
    price === null ||
    price === undefined
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
    Number(price),
  );
}

function formatDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      day:
        "numeric",

      month:
        "short",

      year:
        "numeric",

      timeZone:
        "America/Mexico_City",
    },
  ).format(
    new Date(value),
  );
}

function getStatusInfo(
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

    /*
      El sistema puede tener procesos
      cerrados internamente por fallos
      durante la creación inicial.

      No ofrecemos una acción de
      cancelación desde este panel.
    */

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

/* =========================================================
   PAGE
========================================================= */

export default async function ProcessesPage() {
  const supabase =
    getSupabaseAdmin();

  /* =======================================================
     PROCESOS
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

        total_sessions,

        price_snapshot,
        currency_snapshot,

        status,

        created_at
      `,
    )
    .order(
      "created_at",
      {
        ascending:
          false,
      },
    );

  if (processError) {
    console.error(
      "Error loading coaching processes:",
      processError,
    );

    throw new Error(
      "No fue posible cargar los procesos de coaching.",
    );
  }

  const processes =
    (processData ??
      []) as CoachingProcess[];

  /* =======================================================
     BOOKINGS DE PROCESOS
  ======================================================= */

  const processIds =
    processes.map(
      (process) =>
        process.id,
    );

  let bookings:
    ProcessBooking[] = [];

  if (
    processIds.length >
    0
  ) {
    const {
      data:
        bookingData,
      error:
        bookingError,
    } = await supabase
      .from("bookings")
      .select(
        `
          process_id,
          package_session_number,
          status,
          starts_at
        `,
      )
      .in(
        "process_id",
        processIds,
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
        "No fue posible cargar las sesiones de los procesos.",
      );
    }

    bookings =
      (bookingData ??
        []) as ProcessBooking[];
  }

  /* =======================================================
     MÉTRICAS
  ======================================================= */

  const activeCount =
    processes.filter(
      (process) =>
        process.status ===
        "active",
    ).length;

  const completedCount =
    processes.filter(
      (process) =>
        process.status ===
        "completed",
    ).length;

  return (
    <div
      className="
        space-y-8
      "
    >
      {/* ===============================================
          HEADER
      ================================================ */}

      <div
        className="
          flex
          flex-col
          gap-5
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
            Clientes
          </p>

          <h1
            className="
              mt-2
              font-display
              text-4xl
              font-semibold
              text-brand-brown
              sm:text-5xl
            "
          >
            Procesos de coaching
          </h1>

          <p
            className="
              mt-3
              max-w-[620px]
              text-sm
              leading-6
              text-brand-brown/55
            "
          >
            Consulta el avance,
            sesiones y datos de
            cada proceso activo.
          </p>
        </div>
      </div>

      {/* ===============================================
          RESUMEN
      ================================================ */}

      <div
        className="
          grid
          gap-4
          sm:grid-cols-3
        "
      >
        <div
          className="
            rounded-2xl
            border
            border-brand-taupe/25
            bg-white
            p-5
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.18em]
              text-brand-brown/45
            "
          >
            Total
          </p>

          <p
            className="
              mt-2
              font-display
              text-3xl
              font-semibold
              text-brand-brown
            "
          >
            {
              processes.length
            }
          </p>
        </div>

        <div
          className="
            rounded-2xl
            border
            border-brand-taupe/25
            bg-white
            p-5
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.18em]
              text-brand-brown/45
            "
          >
            Activos
          </p>

          <p
            className="
              mt-2
              font-display
              text-3xl
              font-semibold
              text-brand-green
            "
          >
            {
              activeCount
            }
          </p>
        </div>

        <div
          className="
            rounded-2xl
            border
            border-brand-taupe/25
            bg-white
            p-5
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.18em]
              text-brand-brown/45
            "
          >
            Completados
          </p>

          <p
            className="
              mt-2
              font-display
              text-3xl
              font-semibold
              text-brand-wine
            "
          >
            {
              completedCount
            }
          </p>
        </div>
      </div>

      {/* ===============================================
          LISTA
      ================================================ */}

      {processes.length ===
      0 ? (
        <div
          className="
            rounded-[1.5rem]
            border
            border-dashed
            border-brand-taupe/40
            bg-white/50
            px-6
            py-14
            text-center
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
            Aún no hay procesos
          </p>

          <p
            className="
              mt-2
              text-sm
              text-brand-brown/50
            "
          >
            Los procesos de
            coaching aparecerán
            aquí cuando un cliente
            reserve un paquete.
          </p>
        </div>
      ) : (
        <div
          className="
            space-y-4
          "
        >
          {processes.map(
            (process) => {
              const processBookings =
                bookings.filter(
                  (booking) =>
                    booking.process_id ===
                      process.id &&
                    booking.status !==
                      "cancelled",
                );

              const scheduled =
                processBookings.length;

              const completed =
                processBookings.filter(
                  (booking) =>
                    booking.status ===
                    "completed",
                ).length;

              const status =
                getStatusInfo(
                  process.status,
                );

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

              return (
                <article
                  key={
                    process.id
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
                      grid
                      gap-6
                      lg:grid-cols-[1fr_auto]
                      lg:items-center
                    "
                  >
                    {/* ===============================
                        CLIENTE
                    ================================ */}

                    <div>
                      <div
                        className="
                          flex
                          flex-wrap
                          items-center
                          gap-3
                        "
                      >
                        <h2
                          className="
                            font-display
                            text-2xl
                            font-semibold
                            text-brand-brown
                          "
                        >
                          {
                            process.customer_name
                          }
                        </h2>

                        <span
                          className={`
                            rounded-full
                            px-3
                            py-1
                            text-xs
                            font-semibold
                            ${status.className}
                          `}
                        >
                          {
                            status.label
                          }
                        </span>
                      </div>

                      <p
                        className="
                          mt-1
                          text-sm
                          text-brand-brown/50
                        "
                      >
                        {
                          process.customer_email
                        }
                      </p>

                      <div
                        className="
                          mt-5
                          grid
                          gap-4
                          sm:grid-cols-2
                          xl:grid-cols-4
                        "
                      >
                        <div>
                          <p
                            className="
                              text-[0.65rem]
                              font-semibold
                              uppercase
                              tracking-[0.16em]
                              text-brand-brown/40
                            "
                          >
                            Referencia
                          </p>

                          <p
                            className="
                              mt-1
                              text-sm
                              font-semibold
                              text-brand-wine
                            "
                          >
                            {
                              process.process_reference
                            }
                          </p>
                        </div>

                        <div>
                          <p
                            className="
                              text-[0.65rem]
                              font-semibold
                              uppercase
                              tracking-[0.16em]
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
                              scheduled
                            }{" "}
                            de{" "}
                            {
                              process.total_sessions
                            }{" "}
                            agendadas
                          </p>
                        </div>

                        <div>
                          <p
                            className="
                              text-[0.65rem]
                              font-semibold
                              uppercase
                              tracking-[0.16em]
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
                              completed
                            }{" "}
                            de{" "}
                            {
                              process.total_sessions
                            }
                          </p>
                        </div>

                        <div>
                          <p
                            className="
                              text-[0.65rem]
                              font-semibold
                              uppercase
                              tracking-[0.16em]
                              text-brand-brown/40
                            "
                          >
                            Inversión
                          </p>

                          <p
                            className="
                              mt-1
                              text-sm
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
                      </div>

                      {/* PROGRESS */}

                      <div
                        className="
                          mt-5
                          max-w-[600px]
                        "
                      >
                        <div
                          className="
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
                                `${progress}%`,
                            }}
                          />
                        </div>
                      </div>

                      <p
                        className="
                          mt-4
                          text-xs
                          text-brand-brown/40
                        "
                      >
                        Iniciado el{" "}
                        {formatDate(
                          process.created_at,
                        )}
                      </p>
                    </div>

                    {/* ===============================
                        ACTION
                    ================================ */}

                    <div
                      className="
                        flex
                        lg:justify-end
                      "
                    >
                      <Link
                        href={`/admin/procesos/${process.id}`}
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
                        Ver proceso
                      </Link>
                    </div>
                  </div>
                </article>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}