"use client";

import { useMemo, useState } from "react";

import CancelBookingButton from "@/components/admin/CancelBookingButton";

import RescheduleBookingButton from "@/components/admin/RescheduleBookingButton";

type Booking = {
  id: string;
  booking_reference: string | null;

  customer_name: string;
  customer_email: string;
  customer_phone: string | null;

  starts_at: string;
  ends_at: string;

  notes: string | null;

  status: string;
  created_at: string;

  service_name_snapshot: string | null;
  duration_minutes_snapshot: number | null;
  session_count_snapshot: number | null;

  price_snapshot:
    | number
    | string
    | null;

  currency_snapshot: string | null;

  google_meet_url: string | null;
  google_calendar_url: string | null;

  calendar_status: string;

  customer_email_status: string;
  coach_email_status: string;

  customer_email_error: string | null;
  coach_email_error: string | null;
};

type ReservationsClientProps = {
  bookings: Booking[];
};

type Filter =
  | "all"
  | "upcoming"
  | "completed"
  | "cancelled";

const TIME_ZONE =
  "America/Mexico_City";

const filters: {
  id: Filter;
  label: string;
}[] = [
  {
    id: "all",
    label: "Todas",
  },
  {
    id: "upcoming",
    label: "Próximas",
  },
  {
    id: "completed",
    label: "Completadas",
  },
  {
    id: "cancelled",
    label: "Canceladas",
  },
];

function capitalize(
  value: string,
) {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function formatDate(
  value: string,
) {
  return capitalize(
    new Intl.DateTimeFormat(
      "es-MX",
      {
        timeZone: TIME_ZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      },
    ).format(
      new Date(value),
    ),
  );
}

function formatLongDate(
  value: string,
) {
  return capitalize(
    new Intl.DateTimeFormat(
      "es-MX",
      {
        timeZone: TIME_ZONE,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      },
    ).format(
      new Date(value),
    ),
  );
}

function formatTime(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
  ).format(
    new Date(value),
  );
}

function formatPrice(
  value:
    | number
    | string
    | null,
  currency:
    | string
    | null,
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
      style: "currency",
      currency:
        currency || "MXN",
      maximumFractionDigits: 0,
    },
  ).format(
    Number(value),
  );
}

function getStatusInfo(
  status: string,
) {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmada",
        className:
          "bg-[#E8F2EC] text-[#295C3B]",
      };

    case "pending":
      return {
        label: "Pendiente",
        className:
          "bg-[#F7F0DC] text-[#80671C]",
      };

    case "completed":
      return {
        label: "Completada",
        className:
          "bg-[#E8EEF4] text-[#38546E]",
      };

    case "cancelled":
      return {
        label: "Cancelada",
        className:
          "bg-[#F7E8E8] text-[#8A3535]",
      };

    case "no_show":
      return {
        label: "No asistió",
        className:
          "bg-[#F1EAEA] text-[#725252]",
      };

    default:
      return {
        label: status,
        className:
          "bg-black/5 text-black/60",
      };
  }
}

function getCalendarInfo(
  calendarStatus: string,
  bookingStatus?: string,
) {
  if (
    bookingStatus ===
    "cancelled"
  ) {
    return {
      label:
        "Evento cancelado",
      className:
        "text-brand-brown/45",
      symbol: "—",
    };
  }

  switch (
    calendarStatus
  ) {
    case "created":
      return {
        label:
          "Calendar conectado",
        className:
          "text-[#295C3B]",
        symbol: "✓",
      };

    case "failed":
      return {
        label:
          "Error en Calendar",
        className:
          "text-[#8A3535]",
        symbol: "!",
      };

    default:
      return {
        label:
          "Calendar pendiente",
        className:
          "text-[#80671C]",
        symbol: "•",
      };
  }
}

function emailHasError(
  status: string,
) {
  return [
    "failed",
    "bounced",
    "suppressed",
    "complained",
  ].includes(status);
}

function getEmailInfo(
  customerStatus: string,
  coachStatus: string,
) {
  if (
    emailHasError(
      customerStatus,
    ) ||
    emailHasError(
      coachStatus,
    )
  ) {
    return {
      label:
        "Correo requiere atención",
      className:
        "text-[#8A3535]",
      symbol: "!",
    };
  }

  if (
    customerStatus ===
      "delivered" &&
    coachStatus ===
      "delivered"
  ) {
    return {
      label:
        "Correos entregados",
      className:
        "text-[#295C3B]",
      symbol: "✓",
    };
  }

  if (
    customerStatus === "sent" ||
    coachStatus === "sent" ||
    customerStatus ===
      "delivery_delayed" ||
    coachStatus ===
      "delivery_delayed"
  ) {
    return {
      label:
        "Correos en proceso",
      className:
        "text-[#80671C]",
      symbol: "•",
    };
  }

  return {
    label:
      "Correos pendientes",
    className:
      "text-brand-brown/50",
    symbol: "•",
  };
}

function translateEmailStatus(
  status: string,
) {
  switch (status) {
    case "pending":
      return "Pendiente";

    case "sent":
      return "Enviado";

    case "delivered":
      return "Entregado";

    case "delivery_delayed":
      return "Entrega demorada";

    case "bounced":
      return "Rebotado";

    case "failed":
      return "Fallido";

    case "suppressed":
      return "Suprimido";

    case "complained":
      return "Marcado como spam";

    default:
      return status;
  }
}

export default function ReservationsClient({
  bookings,
}: ReservationsClientProps) {
  const [
    activeFilter,
    setActiveFilter,
  ] =
    useState<Filter>(
      "upcoming",
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    selectedBooking,
    setSelectedBooking,
  ] =
    useState<Booking | null>(
      null,
    );

  const now =
    useMemo(
      () => new Date(),
      [],
    );

  const counts =
    useMemo(() => {
      return {
        all:
          bookings.length,

        upcoming:
          bookings.filter(
            (booking) =>
              [
                "pending",
                "confirmed",
              ].includes(
                booking.status,
              ) &&
              new Date(
                booking.ends_at,
              ) >= now,
          ).length,

        completed:
          bookings.filter(
            (booking) =>
              booking.status ===
              "completed",
          ).length,

        cancelled:
          bookings.filter(
            (booking) =>
              booking.status ===
              "cancelled",
          ).length,
      };
    }, [
      bookings,
      now,
    ]);

  const filteredBookings =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return bookings
        .filter(
          (booking) => {
            if (
              activeFilter ===
              "upcoming"
            ) {
              return (
                [
                  "pending",
                  "confirmed",
                ].includes(
                  booking.status,
                ) &&
                new Date(
                  booking.ends_at,
                ) >= now
              );
            }

            if (
              activeFilter ===
              "completed"
            ) {
              return (
                booking.status ===
                "completed"
              );
            }

            if (
              activeFilter ===
              "cancelled"
            ) {
              return (
                booking.status ===
                "cancelled"
              );
            }

            return true;
          },
        )
        .filter(
          (booking) => {
            if (
              !normalizedSearch
            ) {
              return true;
            }

            const values = [
              booking.customer_name,
              booking.customer_email,
              booking.customer_phone ??
                "",
              booking.booking_reference ??
                "",
              booking.service_name_snapshot ??
                "",
            ];

            return values.some(
              (value) =>
                value
                  .toLowerCase()
                  .includes(
                    normalizedSearch,
                  ),
            );
          },
        )
        .sort(
          (a, b) => {
            const first =
              new Date(
                a.starts_at,
              ).getTime();

            const second =
              new Date(
                b.starts_at,
              ).getTime();

            if (
              activeFilter ===
              "upcoming"
            ) {
              return (
                first -
                second
              );
            }

            return (
              second -
              first
            );
          },
        );
    }, [
      bookings,
      activeFilter,
      search,
      now,
    ]);

  return (
    <>
      {/* ==================================================
          FILTROS
      ================================================== */}

      <section
        className="
          mt-10
          grid
          gap-4
          sm:grid-cols-2
          xl:grid-cols-4
        "
      >
        {filters.map(
          (filter) => {
            const active =
              activeFilter ===
              filter.id;

            return (
              <button
                key={filter.id}
                type="button"
                onClick={() =>
                  setActiveFilter(
                    filter.id,
                  )
                }
                className={`
                  rounded-[1.4rem]
                  border
                  p-5
                  text-left
                  transition
                  ${
                    active
                      ? "border-brand-wine bg-brand-wine text-brand-cream"
                      : "border-brand-taupe/20 bg-white/55 text-brand-brown hover:border-brand-wine/25"
                  }
                `}
              >
                <p
                  className={`
                    text-sm
                    ${
                      active
                        ? "text-brand-cream/70"
                        : "text-brand-brown/45"
                    }
                  `}
                >
                  {filter.label}
                </p>

                <p
                  className="
                    mt-3
                    font-display
                    text-4xl
                    font-semibold
                  "
                >
                  {
                    counts[
                      filter.id
                    ]
                  }
                </p>
              </button>
            );
          },
        )}
      </section>

      {/* ==================================================
          LISTADO
      ================================================== */}

      <section className="mt-8">
        <div
          className="
            flex
            flex-col
            gap-4
            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          <div>
            <h2
              className="
                font-display
                text-3xl
                font-semibold
                text-brand-brown
              "
            >
              {
                filters.find(
                  (filter) =>
                    filter.id ===
                    activeFilter,
                )?.label
              }
            </h2>

            <p
              className="
                mt-1
                text-sm
                text-brand-brown/45
              "
            >
              {
                filteredBookings.length
              }{" "}
              {filteredBookings.length ===
              1
                ? "reserva"
                : "reservas"}
            </p>
          </div>

          <div
            className="
              relative
              w-full
              sm:max-w-[360px]
            "
          >
            <input
              type="search"
              value={search}
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target
                    .value,
                )
              }
              placeholder="Buscar cliente, correo o ER-..."
              className="
                min-h-[50px]
                w-full
                rounded-full
                border
                border-brand-taupe/25
                bg-white/70
                px-5
                text-sm
                text-brand-brown
                outline-none
                transition
                placeholder:text-brand-brown/35
                focus:border-brand-wine/50
                focus:bg-white
              "
            />
          </div>
        </div>

        {filteredBookings.length ===
        0 ? (
          <div
            className="
              mt-6
              rounded-[1.75rem]
              border
              border-dashed
              border-brand-taupe/30
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
              Sin resultados
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
              No encontramos
              reservas que coincidan
              con este filtro o
              búsqueda.
            </p>
          </div>
        ) : (
          <div
            className="
              mt-6
              overflow-hidden
              rounded-[1.75rem]
              border
              border-brand-taupe/20
              bg-white/60
            "
          >
            {filteredBookings.map(
              (
                booking,
                index,
              ) => {
                const status =
                  getStatusInfo(
                    booking.status,
                  );

                const calendar =
                  getCalendarInfo(
                    booking.calendar_status,
                    booking.status,
                  );

                const email =
                  getEmailInfo(
                    booking.customer_email_status,
                    booking.coach_email_status,
                  );

                return (
                  <div
                    key={
                      booking.id
                    }
                    className={`
                      p-5
                      sm:p-6
                      ${
                        index !== 0
                          ? "border-t border-brand-taupe/15"
                          : ""
                      }
                    `}
                  >
                    <div
                      className="
                        flex
                        flex-col
                        gap-5
                        xl:flex-row
                        xl:items-center
                        xl:justify-between
                      "
                    >
                      <div
                        className="
                          grid
                          flex-1
                          gap-5
                          md:grid-cols-[1.5fr_1fr]
                          xl:grid-cols-[1.5fr_1fr_1fr]
                        "
                      >
                        <div>
                          <div
                            className="
                              flex
                              flex-wrap
                              items-center
                              gap-2
                            "
                          >
                            <h3
                              className="
                                font-semibold
                                text-brand-brown
                              "
                            >
                              {
                                booking.customer_name
                              }
                            </h3>

                            <span
                              className={`
                                rounded-full
                                px-2.5
                                py-1
                                text-[11px]
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
                            {booking.service_name_snapshot ||
                              "Servicio"}
                          </p>

                          <p
                            className="
                              mt-2
                              text-xs
                              font-medium
                              tracking-wide
                              text-brand-brown/35
                            "
                          >
                            {booking.booking_reference ||
                              "Sin referencia"}
                          </p>
                        </div>

                        <div>
                          <p
                            className="
                              text-xs
                              uppercase
                              tracking-[0.14em]
                              text-brand-brown/35
                            "
                          >
                            Fecha
                          </p>

                          <p
                            className="
                              mt-1.5
                              text-sm
                              font-medium
                              text-brand-brown
                            "
                          >
                            {formatDate(
                              booking.starts_at,
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
                            )}
                            {" – "}
                            {formatTime(
                              booking.ends_at,
                            )}
                          </p>
                        </div>

                        <div
                          className="
                            space-y-2
                            md:col-span-2
                            xl:col-span-1
                          "
                        >
                          <p
                            className={`
                              text-sm
                              font-medium
                              ${calendar.className}
                            `}
                          >
                            {
                              calendar.symbol
                            }{" "}
                            {
                              calendar.label
                            }
                          </p>

                          <p
                            className={`
                              text-sm
                              font-medium
                              ${email.className}
                            `}
                          >
                            {
                              email.symbol
                            }{" "}
                            {
                              email.label
                            }
                          </p>
                        </div>
                      </div>

                      <div
                        className="
                          flex
                          shrink-0
                          flex-wrap
                          gap-2
                        "
                      >
                        {booking.google_meet_url &&
                          booking.status !==
                            "cancelled" && (
                            <a
                              href={
                                booking.google_meet_url
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="
                                inline-flex
                                min-h-[44px]
                                items-center
                                justify-center
                                rounded-full
                                border
                                border-brand-wine/20
                                px-4
                                text-sm
                                font-semibold
                                text-brand-wine
                                transition
                                hover:bg-brand-wine/5
                              "
                            >
                              Meet
                            </a>
                          )}

                        <button
                          type="button"
                          onClick={() =>
                            setSelectedBooking(
                              booking,
                            )
                          }
                          className="
                            inline-flex
                            min-h-[44px]
                            items-center
                            justify-center
                            rounded-full
                            bg-brand-brown
                            px-5
                            text-sm
                            font-semibold
                            text-brand-cream
                            transition
                            hover:bg-brand-wine
                          "
                        >
                          Ver detalles
                        </button>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      {/* ==================================================
          DETALLE DE RESERVA
      ================================================== */}

      {selectedBooking && (
        <div
          className="
            fixed
            inset-0
            z-50
            flex
            justify-end
            bg-black/25
          "
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedBooking(
                null,
              );
            }
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Detalles de reserva"
            className="
              h-full
              w-full
              max-w-[560px]
              overflow-y-auto
              bg-[#f7f5f1]
              p-6
              shadow-2xl
              sm:p-8
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
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.2em]
                    text-brand-wine
                  "
                >
                  Reserva
                </p>

                <h2
                  className="
                    mt-3
                    font-display
                    text-4xl
                    font-semibold
                    text-brand-brown
                  "
                >
                  {
                    selectedBooking.customer_name
                  }
                </h2>

                <p
                  className="
                    mt-2
                    text-sm
                    text-brand-brown/45
                  "
                >
                  {
                    selectedBooking.booking_reference
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedBooking(
                    null,
                  )
                }
                aria-label="Cerrar"
                className="
                  flex
                  h-10
                  w-10
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-brand-brown/15
                  text-xl
                  text-brand-brown
                  transition
                  hover:bg-brand-brown/5
                "
              >
                ×
              </button>
            </div>

            {/* SESIÓN */}

            <div
              className="
                mt-8
                rounded-[1.5rem]
                border
                border-brand-taupe/20
                bg-white/65
                p-5
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-[0.16em]
                  text-brand-brown/35
                "
              >
                Sesión
              </p>

              <p
                className="
                  mt-3
                  font-display
                  text-2xl
                  font-semibold
                  text-brand-brown
                "
              >
                {selectedBooking.service_name_snapshot ||
                  "Servicio"}
              </p>

              <p
                className="
                  mt-4
                  text-sm
                  leading-6
                  text-brand-brown/65
                "
              >
                {formatLongDate(
                  selectedBooking.starts_at,
                )}
              </p>

              <p
                className="
                  mt-1
                  text-sm
                  font-semibold
                  text-brand-brown
                "
              >
                {formatTime(
                  selectedBooking.starts_at,
                )}
                {" – "}
                {formatTime(
                  selectedBooking.ends_at,
                )}
              </p>
            </div>

            {/* DATOS */}

            <div
              className="
                mt-5
                grid
                gap-4
                sm:grid-cols-2
              "
            >
              <InfoBlock
                label="Correo"
                value={
                  selectedBooking.customer_email
                }
              />

              <InfoBlock
                label="Teléfono"
                value={
                  selectedBooking.customer_phone ||
                  "No proporcionado"
                }
              />

              <InfoBlock
                label="Duración"
                value={
                  selectedBooking.duration_minutes_snapshot
                    ? `${selectedBooking.duration_minutes_snapshot} minutos`
                    : "—"
                }
              />

              <InfoBlock
                label="Sesiones"
                value={String(
                  selectedBooking.session_count_snapshot ??
                    1,
                )}
              />

              <InfoBlock
                label="Precio"
                value={formatPrice(
                  selectedBooking.price_snapshot,
                  selectedBooking.currency_snapshot,
                )}
              />

              <InfoBlock
                label="Estado"
                value={
                  getStatusInfo(
                    selectedBooking.status,
                  ).label
                }
              />
            </div>

            {/* INTEGRACIONES */}

            <div
              className="
                mt-5
                rounded-[1.5rem]
                border
                border-brand-taupe/20
                bg-white/55
                p-5
              "
            >
              <p
                className="
                  text-xs
                  uppercase
                  tracking-[0.16em]
                  text-brand-brown/35
                "
              >
                Integraciones
              </p>

              <div className="mt-4 space-y-3">
                <StatusRow
                  label="Google Calendar"
                  value={
                    getCalendarInfo(
                      selectedBooking.calendar_status,
                      selectedBooking.status,
                    ).label
                  }
                />

                <StatusRow
                  label="Email cliente"
                  value={translateEmailStatus(
                    selectedBooking.customer_email_status,
                  )}
                />

                <StatusRow
                  label="Email coach"
                  value={translateEmailStatus(
                    selectedBooking.coach_email_status,
                  )}
                />
              </div>
            </div>

            {/* NOTAS */}

            {selectedBooking.notes && (
              <div
                className="
                  mt-5
                  rounded-[1.5rem]
                  border
                  border-brand-taupe/20
                  bg-white/55
                  p-5
                "
              >
                <p
                  className="
                    text-xs
                    uppercase
                    tracking-[0.16em]
                    text-brand-brown/35
                  "
                >
                  Notas del cliente
                </p>

                <p
                  className="
                    mt-3
                    whitespace-pre-wrap
                    text-sm
                    leading-6
                    text-brand-brown/70
                  "
                >
                  {
                    selectedBooking.notes
                  }
                </p>
              </div>
            )}

            {/* ERRORES EMAIL */}

            {(selectedBooking.customer_email_error ||
              selectedBooking.coach_email_error) && (
              <div
                className="
                  mt-5
                  rounded-[1.5rem]
                  bg-[#F7E8E8]
                  p-5
                  text-[#8A3535]
                "
              >
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.16em]
                  "
                >
                  Atención requerida
                </p>

                {selectedBooking.customer_email_error && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold">
                      Cliente
                    </p>

                    <p
                      className="
                        mt-1
                        break-words
                        text-sm
                        leading-6
                      "
                    >
                      {
                        selectedBooking.customer_email_error
                      }
                    </p>
                  </div>
                )}

                {selectedBooking.coach_email_error && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold">
                      Coach
                    </p>

                    <p
                      className="
                        mt-1
                        break-words
                        text-sm
                        leading-6
                      "
                    >
                      {
                        selectedBooking.coach_email_error
                      }
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ENLACES */}

            <div
              className="
                mt-7
                flex
                flex-wrap
                gap-3
              "
            >
              {selectedBooking.google_calendar_url &&
                selectedBooking.status !==
                  "cancelled" && (
                  <a
                    href={
                      selectedBooking.google_calendar_url
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="
                      inline-flex
                      min-h-[48px]
                      items-center
                      justify-center
                      rounded-full
                      border
                      border-brand-brown/15
                      px-5
                      text-sm
                      font-semibold
                      text-brand-brown
                      transition
                      hover:bg-brand-brown/5
                    "
                  >
                    Abrir Calendar
                  </a>
                )}

              {selectedBooking.google_meet_url &&
                selectedBooking.status !==
                  "cancelled" && (
                  <a
                    href={
                      selectedBooking.google_meet_url
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="
                      inline-flex
                      min-h-[48px]
                      items-center
                      justify-center
                      rounded-full
                      bg-brand-wine
                      px-5
                      text-sm
                      font-semibold
                      text-brand-cream
                      transition
                      hover:bg-brand-brown
                    "
                  >
                    Entrar a Meet
                  </a>
                )}
            </div>

            {/* GESTIÓN */}

            {[
              "pending",
              "confirmed",
            ].includes(
              selectedBooking.status,
            ) && (
              <div
                className="
                  mt-10
                  border-t
                  border-brand-taupe/20
                  pt-6
                "
              >
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.16em]
                    text-brand-brown/35
                  "
                >
                  Gestión de reserva
                </p>

                <div
                  className="
                    mt-4
                    flex
                    flex-wrap
                    gap-3
                  "
                >
                <RescheduleBookingButton
                    bookingId={
                        selectedBooking.id
                    }
                    customerName={
                        selectedBooking.customer_name
                    }
                    currentStartsAt={
                        selectedBooking.starts_at
                    }
                    currentEndsAt={
                        selectedBooking.ends_at
                    }
                    onRescheduled={() =>
                        setSelectedBooking(
                        null,
                        )
                    }
                    />

                  <CancelBookingButton
                    bookingId={
                      selectedBooking.id
                    }
                    bookingReference={
                      selectedBooking.booking_reference
                    }
                    customerName={
                      selectedBooking.customer_name
                    }
                    onCancelled={() =>
                      setSelectedBooking(
                        null,
                      )
                    }
                  />
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="
        rounded-2xl
        bg-white/55
        p-4
      "
    >
      <p
        className="
          text-xs
          uppercase
          tracking-[0.14em]
          text-brand-brown/35
        "
      >
        {label}
      </p>

      <p
        className="
          mt-2
          break-words
          text-sm
          font-medium
          text-brand-brown
        "
      >
        {value}
      </p>
    </div>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="
        flex
        items-center
        justify-between
        gap-4
      "
    >
      <span className="text-sm text-brand-brown/50">
        {label}
      </span>

      <span
        className="
          text-right
          text-sm
          font-semibold
          text-brand-brown
        "
      >
        {value}
      </span>
    </div>
  );
}