type BookingCardProps = {
  booking: {
    id: string;
    booking_reference: string | null;

    customer_name: string;
    customer_email: string;
    customer_phone: string | null;

    starts_at: string;
    ends_at: string;

    notes: string | null;
    status: string;

    service_name_snapshot: string | null;
    duration_minutes_snapshot: number | null;
    session_count_snapshot: number | null;

    price_snapshot: number | string | null;
    currency_snapshot: string | null;

    google_meet_url: string | null;
    google_calendar_url: string | null;
    calendar_status: string;

    customer_email_status: string;
    coach_email_status: string;

    customer_email_error: string | null;
    coach_email_error: string | null;
  };
};

const TIME_ZONE =
  "America/Mexico_City";

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

function getBookingStatus(
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

function getCalendarStatus(
  status: string,
) {
  switch (status) {
    case "created":
      return {
        label: "Confirmado",
        symbol: "✓",
      };

    case "failed":
      return {
        label:
          "Error de Calendar",
        symbol: "!",
      };

    default:
      return {
        label: "Pendiente",
        symbol: "•",
      };
  }
}

function getEmailStatus(
  customerStatus: string,
  coachStatus: string,
) {
  const statuses = [
    customerStatus,
    coachStatus,
  ];

  if (
    statuses.every(
      (status) =>
        status === "delivered",
    )
  ) {
    return {
      label: "Entregados",
      symbol: "✓",
    };
  }

  if (
    statuses.some(
      (status) =>
        status === "failed" ||
        status === "bounced" ||
        status ===
          "suppressed" ||
        status ===
          "complained",
    )
  ) {
    return {
      label:
        "Requiere atención",
      symbol: "!",
    };
  }

  if (
    statuses.some(
      (status) =>
        status === "sent" ||
        status ===
          "delivery_delayed",
    )
  ) {
    return {
      label: "En proceso",
      symbol: "•",
    };
  }

  return {
    label: "Pendiente",
    symbol: "•",
  };
}

function translateEmailStatus(
  status: string,
) {
  switch (status) {
    case "delivered":
      return "Entregado";

    case "sent":
      return "Enviado";

    case "pending":
      return "Pendiente";

    case "failed":
      return "Fallido";

    case "bounced":
      return "Rebotado";

    case "delivery_delayed":
      return "Entrega demorada";

    case "suppressed":
      return "Suprimido";

    case "complained":
      return "Marcado como spam";

    default:
      return status;
  }
}

export default function BookingCard({
  booking,
}: BookingCardProps) {
  const bookingStatus =
    getBookingStatus(
      booking.status,
    );

  const calendarStatus =
    getCalendarStatus(
      booking.calendar_status,
    );

  const emailStatus =
    getEmailStatus(
      booking.customer_email_status,
      booking.coach_email_status,
    );

  return (
    <article
      className="
        rounded-[1.75rem]
        border
        border-brand-taupe/20
        bg-white/65
        p-6
        shadow-[0_18px_50px_rgba(59,42,36,0.04)]
        sm:p-7
      "
    >
      <div
        className="
          flex
          flex-col
          gap-6
          lg:flex-row
          lg:items-start
          lg:justify-between
        "
      >
        <div className="min-w-0">
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
                py-1
                text-xs
                font-semibold
                ${bookingStatus.className}
              `}
            >
              {bookingStatus.label}
            </span>

            {booking.booking_reference && (
              <span
                className="
                  text-xs
                  font-medium
                  tracking-wide
                  text-brand-brown/40
                "
              >
                {
                  booking.booking_reference
                }
              </span>
            )}
          </div>

          <h2
            className="
              mt-5
              font-display
              text-3xl
              font-semibold
              text-brand-brown
            "
          >
            {booking.customer_name}
          </h2>

          <p
            className="
              mt-1
              text-sm
              text-brand-brown/55
            "
          >
            {
              booking.service_name_snapshot ||
              "Servicio"
            }
          </p>

          <div
            className="
              mt-5
              flex
              flex-wrap
              gap-x-7
              gap-y-2
              text-sm
              text-brand-brown/70
            "
          >
            <span>
              {formatDate(
                booking.starts_at,
              )}
            </span>

            <span className="font-semibold text-brand-brown">
              {formatTime(
                booking.starts_at,
              )}
              {" – "}
              {formatTime(
                booking.ends_at,
              )}
            </span>
          </div>
        </div>

        <div
          className="
            flex
            shrink-0
            flex-wrap
            gap-3
          "
        >
          {booking.google_calendar_url && (
            <a
              href={
                booking.google_calendar_url
              }
              target="_blank"
              rel="noreferrer"
              className="
                inline-flex
                min-h-[46px]
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
                hover:border-brand-brown/35
                hover:bg-brand-brown/5
              "
            >
              Ver en Calendar
            </a>
          )}

          {booking.google_meet_url ? (
            <a
              href={
                booking.google_meet_url
              }
              target="_blank"
              rel="noreferrer"
              className="
                inline-flex
                min-h-[46px]
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
          ) : (
            <span
              className="
                inline-flex
                min-h-[46px]
                items-center
                rounded-full
                bg-black/5
                px-5
                text-sm
                text-brand-brown/45
              "
            >
              Meet no disponible
            </span>
          )}
        </div>
      </div>

      <div
        className="
          mt-7
          grid
          gap-3
          border-t
          border-brand-taupe/15
          pt-5
          sm:grid-cols-2
        "
      >
        <div
          className="
            rounded-2xl
            bg-brand-cream/55
            px-4
            py-3
          "
        >
          <p
            className="
              text-xs
              uppercase
              tracking-[0.16em]
              text-brand-brown/40
            "
          >
            Calendar
          </p>

          <p
            className="
              mt-1.5
              text-sm
              font-semibold
              text-brand-brown
            "
          >
            {calendarStatus.symbol}
            {" "}
            {calendarStatus.label}
          </p>
        </div>

        <div
          className="
            rounded-2xl
            bg-brand-cream/55
            px-4
            py-3
          "
        >
          <p
            className="
              text-xs
              uppercase
              tracking-[0.16em]
              text-brand-brown/40
            "
          >
            Correos
          </p>

          <p
            className="
              mt-1.5
              text-sm
              font-semibold
              text-brand-brown
            "
          >
            {emailStatus.symbol}
            {" "}
            {emailStatus.label}
          </p>
        </div>
      </div>

      <details
        className="
          group
          mt-5
          border-t
          border-brand-taupe/15
          pt-5
        "
      >
        <summary
          className="
            cursor-pointer
            list-none
            text-sm
            font-semibold
            text-brand-wine
          "
        >
          Ver detalles
          <span
            className="
              ml-2
              inline-block
              transition-transform
              group-open:rotate-180
            "
          >
            ↓
          </span>
        </summary>

        <div
          className="
            mt-5
            grid
            gap-5
            text-sm
            md:grid-cols-2
          "
        >
          <div>
            <p className="text-brand-brown/40">
              Correo
            </p>

            <p
              className="
                mt-1
                break-all
                font-medium
                text-brand-brown
              "
            >
              {booking.customer_email}
            </p>
          </div>

          <div>
            <p className="text-brand-brown/40">
              Teléfono
            </p>

            <p
              className="
                mt-1
                font-medium
                text-brand-brown
              "
            >
              {booking.customer_phone ||
                "No proporcionado"}
            </p>
          </div>

          <div>
            <p className="text-brand-brown/40">
              Duración
            </p>

            <p
              className="
                mt-1
                font-medium
                text-brand-brown
              "
            >
              {booking.duration_minutes_snapshot
                ? `${booking.duration_minutes_snapshot} minutos`
                : "—"}
            </p>
          </div>

          <div>
            <p className="text-brand-brown/40">
              Sesiones
            </p>

            <p
              className="
                mt-1
                font-medium
                text-brand-brown
              "
            >
              {booking.session_count_snapshot ??
                1}
            </p>
          </div>

          <div>
            <p className="text-brand-brown/40">
              Precio
            </p>

            <p
              className="
                mt-1
                font-medium
                text-brand-brown
              "
            >
              {formatPrice(
                booking.price_snapshot,
                booking.currency_snapshot,
              )}
            </p>
          </div>

          <div>
            <p className="text-brand-brown/40">
              Email cliente
            </p>

            <p
              className="
                mt-1
                font-medium
                text-brand-brown
              "
            >
              {translateEmailStatus(
                booking.customer_email_status,
              )}
            </p>
          </div>

          <div>
            <p className="text-brand-brown/40">
              Email coach
            </p>

            <p
              className="
                mt-1
                font-medium
                text-brand-brown
              "
            >
              {translateEmailStatus(
                booking.coach_email_status,
              )}
            </p>
          </div>

          {booking.notes && (
            <div className="md:col-span-2">
              <p className="text-brand-brown/40">
                Notas del cliente
              </p>

              <p
                className="
                  mt-1
                  whitespace-pre-wrap
                  leading-6
                  text-brand-brown
                "
              >
                {booking.notes}
              </p>
            </div>
          )}

          {booking.customer_email_error && (
            <div
              className="
                rounded-2xl
                bg-[#F7E8E8]
                p-4
                md:col-span-2
              "
            >
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.14em]
                  text-[#8A3535]
                "
              >
                Error correo cliente
              </p>

              <p
                className="
                  mt-2
                  break-words
                  text-[#8A3535]
                "
              >
                {
                  booking.customer_email_error
                }
              </p>
            </div>
          )}

          {booking.coach_email_error && (
            <div
              className="
                rounded-2xl
                bg-[#F7E8E8]
                p-4
                md:col-span-2
              "
            >
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.14em]
                  text-[#8A3535]
                "
              >
                Error correo coach
              </p>

              <p
                className="
                  mt-2
                  break-words
                  text-[#8A3535]
                "
              >
                {
                  booking.coach_email_error
                }
              </p>
            </div>
          )}
        </div>
      </details>
    </article>
  );
}