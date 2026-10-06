"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type Booking = {
  id: string;

  booking_reference:
    | string
    | null;

  customer_name: string;
  customer_email: string;

  customer_phone:
    | string
    | null;

  starts_at: string;
  ends_at: string;

  notes:
    | string
    | null;

  status: string;

  service_name_snapshot:
    | string
    | null;

  duration_minutes_snapshot:
    | number
    | null;

  google_meet_url:
    | string
    | null;

  google_calendar_url:
    | string
    | null;

  calendar_status: string;
};

type AdminCalendarProps = {
  initialBookings: Booking[];
  initialYear: number;
  initialMonth: number;
};

const TIME_ZONE =
  "America/Mexico_City";

const weekDays = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
];

function getDateKey(
  value: string | Date,
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    );

  return formatter.format(
    new Date(value),
  );
}

function formatTime(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      timeZone:
        TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
  ).format(
    new Date(value),
  );
}

function formatSelectedDate(
  dateKey: string,
) {
  const [
    year,
    month,
    day,
  ] =
    dateKey
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12,
      ),
    );

  const value =
    new Intl.DateTimeFormat(
      "es-MX",
      {
        timeZone:
          "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      },
    ).format(date);

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function getMonthName(
  year: number,
  month: number,
) {
  const value =
    new Intl.DateTimeFormat(
      "es-MX",
      {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      },
    ).format(
      new Date(
        Date.UTC(
          year,
          month - 1,
          1,
        ),
      ),
    );

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function getStatusInfo(
  status: string,
) {
  switch (status) {
    case "confirmed":
      return {
        label:
          "Confirmada",
        dot:
          "bg-[#295C3B]",
        badge:
          "bg-[#E8F2EC] text-[#295C3B]",
      };

    case "pending":
      return {
        label:
          "Pendiente",
        dot:
          "bg-[#B58D24]",
        badge:
          "bg-[#F7F0DC] text-[#80671C]",
      };

    case "completed":
      return {
        label:
          "Completada",
        dot:
          "bg-[#58758E]",
        badge:
          "bg-[#E8EEF4] text-[#38546E]",
      };

    case "no_show":
      return {
        label:
          "No asistió",
        dot:
          "bg-[#725252]",
        badge:
          "bg-[#F1EAEA] text-[#725252]",
      };

    default:
      return {
        label:
          status,
        dot:
          "bg-brand-brown/40",
        badge:
          "bg-brand-brown/5 text-brand-brown/60",
      };
  }
}

function createCalendarDays(
  year: number,
  month: number,
) {
  const firstDay =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1,
      ),
    );

  const lastDay =
    new Date(
      Date.UTC(
        year,
        month,
        0,
      ),
    );

  /*
    JS:
    domingo = 0

    Nosotros:
    lunes = 0
  */
  const leadingDays =
    (
      firstDay.getUTCDay() +
      6
    ) % 7;

  const daysInMonth =
    lastDay.getUTCDate();

  const result: {
    dateKey: string;
    day: number;
    currentMonth: boolean;
  }[] = [];

  /* =========================================
     DÍAS DEL MES ANTERIOR
  ========================================== */

  for (
    let i =
      leadingDays;
    i > 0;
    i--
  ) {
    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          1 - i,
        ),
      );

    result.push({
      dateKey:
        date
          .toISOString()
          .slice(
            0,
            10,
          ),

      day:
        date.getUTCDate(),

      currentMonth:
        false,
    });
  }

  /* =========================================
     MES ACTUAL
  ========================================== */

  for (
    let day = 1;
    day <=
    daysInMonth;
    day++
  ) {
    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day,
        ),
      );

    result.push({
      dateKey:
        date
          .toISOString()
          .slice(
            0,
            10,
          ),

      day,

      currentMonth:
        true,
    });
  }

  /* =========================================
     COMPLETAR HASTA 42 CELDAS
  ========================================== */

  let nextDay = 1;

  while (
    result.length < 42
  ) {
    const date =
      new Date(
        Date.UTC(
          year,
          month,
          nextDay,
        ),
      );

    result.push({
      dateKey:
        date
          .toISOString()
          .slice(
            0,
            10,
          ),

      day:
        date.getUTCDate(),

      currentMonth:
        false,
    });

    nextDay++;
  }

  return result;
}

export default function AdminCalendar({
  initialBookings,
  initialYear,
  initialMonth,
}: AdminCalendarProps) {
  const [
    year,
    setYear,
  ] =
    useState(
      initialYear,
    );

  const [
    month,
    setMonth,
  ] =
    useState(
      initialMonth,
    );

  const [
    bookings,
    setBookings,
  ] =
    useState(
      initialBookings,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState<string | null>(
      null,
    );

  const today =
    useMemo(
      () =>
        getDateKey(
          new Date(),
        ),
      [],
    );

  const calendarDays =
    useMemo(
      () =>
        createCalendarDays(
          year,
          month,
        ),
      [
        year,
        month,
      ],
    );

  const bookingsByDate =
    useMemo(() => {
      const map =
        new Map<
          string,
          Booking[]
        >();

      bookings.forEach(
        (booking) => {
          const key =
            getDateKey(
              booking.starts_at,
            );

          const existing =
            map.get(key) ??
            [];

          existing.push(
            booking,
          );

          map.set(
            key,
            existing,
          );
        },
      );

      return map;
    }, [bookings]);

  const selectedBookings =
    selectedDate
      ? bookingsByDate.get(
          selectedDate,
        ) ?? []
      : [];

  async function loadMonth(
    nextYear: number,
    nextMonth: number,
  ) {
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/calendar?year=${nextYear}&month=${nextMonth}`,
          {
            method: "GET",

            cache:
              "no-store",
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No fue posible cargar el calendario.",
        );
      }

      setBookings(
        data.bookings ??
          [],
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No fue posible cargar el calendario.",
      );
    } finally {
      setLoading(false);
    }
  }

  function changeMonth(
    direction:
      | -1
      | 1,
  ) {
    let nextYear =
      year;

    let nextMonth =
      month +
      direction;

    if (
      nextMonth === 0
    ) {
      nextMonth = 12;
      nextYear--;
    }

    if (
      nextMonth === 13
    ) {
      nextMonth = 1;
      nextYear++;
    }

    setYear(
      nextYear,
    );

    setMonth(
      nextMonth,
    );

    setSelectedDate(
      null,
    );

    void loadMonth(
      nextYear,
      nextMonth,
    );
  }

  function goToday() {
    const now =
      new Date();

    const formatter =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone:
            TIME_ZONE,
          year:
            "numeric",
          month:
            "numeric",
        },
      );

    const parts =
      formatter.formatToParts(
        now,
      );

    const currentYear =
      Number(
        parts.find(
          (part) =>
            part.type ===
            "year",
        )?.value,
      );

    const currentMonth =
      Number(
        parts.find(
          (part) =>
            part.type ===
            "month",
        )?.value,
      );

    setYear(
      currentYear,
    );

    setMonth(
      currentMonth,
    );

    setSelectedDate(
      today,
    );

    void loadMonth(
      currentYear,
      currentMonth,
    );
  }

  /*
    Si la página abrió en el
    mes actual, seleccionamos
    automáticamente hoy.
  */
  useEffect(() => {
    const [
      todayYear,
      todayMonth,
    ] =
      today
        .split("-")
        .map(Number);

    if (
      year ===
        todayYear &&
      month ===
        todayMonth
    ) {
      setSelectedDate(
        today,
      );
    }
  }, []);

  const monthSessions =
    bookings.filter(
      (booking) => {
        const key =
          getDateKey(
            booking.starts_at,
          );

        const [
          bookingYear,
          bookingMonth,
        ] =
          key
            .split("-")
            .map(Number);

        return (
          bookingYear ===
            year &&
          bookingMonth ===
            month
        );
      },
    );

  return (
    <div className="mt-10">
      {/* =====================================
          CABECERA CALENDARIO
      ====================================== */}

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
        <div>
          <h2
            className="
              font-display
              text-3xl
              font-semibold
              text-brand-brown
              sm:text-4xl
            "
          >
            {getMonthName(
              year,
              month,
            )}
          </h2>

          <p
            className="
              mt-1
              text-sm
              text-brand-brown/45
            "
          >
            {
              monthSessions.length
            }{" "}
            {monthSessions.length ===
            1
              ? "sesión este mes"
              : "sesiones este mes"}
          </p>
        </div>

        <div
          className="
            flex
            flex-wrap
            gap-2
          "
        >
          <button
            type="button"
            onClick={
              goToday
            }
            className="
              min-h-[44px]
              rounded-full
              border
              border-brand-taupe/25
              bg-white/60
              px-5
              text-sm
              font-semibold
              text-brand-brown
              transition
              hover:border-brand-wine/30
              hover:bg-white
            "
          >
            Hoy
          </button>

          <button
            type="button"
            onClick={() =>
              changeMonth(-1)
            }
            aria-label="Mes anterior"
            className="
              flex
              h-11
              w-11
              items-center
              justify-center
              rounded-full
              border
              border-brand-taupe/25
              bg-white/60
              text-xl
              text-brand-brown
              transition
              hover:border-brand-wine/30
              hover:bg-white
            "
          >
            ‹
          </button>

          <button
            type="button"
            onClick={() =>
              changeMonth(1)
            }
            aria-label="Mes siguiente"
            className="
              flex
              h-11
              w-11
              items-center
              justify-center
              rounded-full
              border
              border-brand-taupe/25
              bg-white/60
              text-xl
              text-brand-brown
              transition
              hover:border-brand-wine/30
              hover:bg-white
            "
          >
            ›
          </button>
        </div>
      </div>

      {error && (
        <div
          className="
            mt-6
            rounded-2xl
            bg-[#F7E8E8]
            px-5
            py-4
            text-sm
            text-[#8A3535]
          "
        >
          {error}
        </div>
      )}

      {/* =====================================
          CALENDARIO + PANEL
      ====================================== */}

      <div
        className="
          mt-6
          grid
          gap-6
          2xl:grid-cols-[minmax(0,1fr)_380px]
        "
      >
        <div
          className="
            overflow-hidden
            rounded-[1.75rem]
            border
            border-brand-taupe/20
            bg-white/55
          "
        >
          {/* DÍAS DE SEMANA */}

          <div
            className="
              grid
              grid-cols-7
              border-b
              border-brand-taupe/15
              bg-brand-cream/60
            "
          >
            {weekDays.map(
              (day) => (
                <div
                  key={day}
                  className="
                    px-2
                    py-4
                    text-center
                    text-[11px]
                    font-semibold
                    uppercase
                    tracking-[0.14em]
                    text-brand-brown/40
                    sm:text-xs
                  "
                >
                  {day}
                </div>
              ),
            )}
          </div>

          {/* GRID */}

          <div
            className={`
              relative
              grid
              grid-cols-7
              transition-opacity
              ${
                loading
                  ? "opacity-40"
                  : "opacity-100"
              }
            `}
          >
            {calendarDays.map(
              (
                calendarDay,
                index,
              ) => {
                const dayBookings =
                  bookingsByDate.get(
                    calendarDay.dateKey,
                  ) ?? [];

                const isToday =
                  calendarDay.dateKey ===
                  today;

                const selected =
                  calendarDay.dateKey ===
                  selectedDate;

                return (
                  <button
                    type="button"
                    key={
                      calendarDay.dateKey
                    }
                    onClick={() =>
                      setSelectedDate(
                        calendarDay.dateKey,
                      )
                    }
                    className={`
                      relative
                      min-h-[90px]
                      border-brand-taupe/15
                      p-2
                      text-left
                      transition
                      sm:min-h-[125px]
                      sm:p-3
                      ${
                        index %
                          7 !==
                        6
                          ? "border-r"
                          : ""
                      }
                      ${
                        index <
                        35
                          ? "border-b"
                          : ""
                      }
                      ${
                        selected
                          ? "bg-brand-wine/[0.06]"
                          : "hover:bg-brand-brown/[0.025]"
                      }
                    `}
                  >
                    <div
                      className={`
                        flex
                        h-7
                        w-7
                        items-center
                        justify-center
                        rounded-full
                        text-xs
                        font-semibold
                        sm:h-8
                        sm:w-8
                        sm:text-sm
                        ${
                          isToday
                            ? "bg-brand-wine text-brand-cream"
                            : calendarDay.currentMonth
                              ? "text-brand-brown"
                              : "text-brand-brown/25"
                        }
                      `}
                    >
                      {
                        calendarDay.day
                      }
                    </div>

                    {/* DESKTOP */}

                    <div
                      className="
                        mt-2
                        hidden
                        space-y-1.5
                        sm:block
                      "
                    >
                      {dayBookings
                        .slice(
                          0,
                          3,
                        )
                        .map(
                          (
                            booking,
                          ) => {
                            const status =
                              getStatusInfo(
                                booking.status,
                              );

                            return (
                              <div
                                key={
                                  booking.id
                                }
                                className="
                                  truncate
                                  rounded-lg
                                  bg-white/80
                                  px-2
                                  py-1.5
                                  text-[11px]
                                  text-brand-brown
                                "
                              >
                                <span
                                  className={`
                                    mr-1.5
                                    inline-block
                                    h-1.5
                                    w-1.5
                                    rounded-full
                                    ${status.dot}
                                  `}
                                />

                                <span className="font-semibold">
                                  {formatTime(
                                    booking.starts_at,
                                  )}
                                </span>

                                {" · "}

                                {
                                  booking.customer_name
                                }
                              </div>
                            );
                          },
                        )}

                      {dayBookings.length >
                        3 && (
                        <p
                          className="
                            px-2
                            text-[10px]
                            font-semibold
                            text-brand-wine
                          "
                        >
                          +
                          {dayBookings.length -
                            3}{" "}
                          más
                        </p>
                      )}
                    </div>

                    {/* MOBILE */}

                    {dayBookings.length >
                      0 && (
                      <div
                        className="
                          mt-2
                          flex
                          flex-wrap
                          gap-1
                          sm:hidden
                        "
                      >
                        {dayBookings
                          .slice(
                            0,
                            4,
                          )
                          .map(
                            (
                              booking,
                            ) => (
                              <span
                                key={
                                  booking.id
                                }
                                className="
                                  h-1.5
                                  w-1.5
                                  rounded-full
                                  bg-brand-wine
                                "
                              />
                            ),
                          )}
                      </div>
                    )}
                  </button>
                );
              },
            )}

            {loading && (
              <div
                className="
                  pointer-events-none
                  absolute
                  inset-0
                  flex
                  items-center
                  justify-center
                "
              >
                <div
                  className="
                    rounded-full
                    bg-white
                    px-5
                    py-2.5
                    text-sm
                    font-semibold
                    text-brand-brown
                    shadow-lg
                  "
                >
                  Cargando...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===================================
            PANEL DEL DÍA
        ==================================== */}

        <aside
          className="
            self-start
            rounded-[1.75rem]
            border
            border-brand-taupe/20
            bg-white/55
            p-5
            sm:p-6
            2xl:sticky
            2xl:top-6
          "
        >
          {!selectedDate ? (
            <div
              className="
                py-12
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
                Selecciona un día
              </p>

              <p
                className="
                  mx-auto
                  mt-3
                  max-w-[260px]
                  text-sm
                  leading-6
                  text-brand-brown/45
                "
              >
                Haz clic en una fecha
                para consultar las
                sesiones programadas.
              </p>
            </div>
          ) : (
            <>
              <div
                className="
                  border-b
                  border-brand-taupe/15
                  pb-5
                "
              >
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.18em]
                    text-brand-wine
                  "
                >
                  Agenda del día
                </p>

                <h3
                  className="
                    mt-2
                    font-display
                    text-2xl
                    font-semibold
                    leading-tight
                    text-brand-brown
                  "
                >
                  {formatSelectedDate(
                    selectedDate,
                  )}
                </h3>

                <p
                  className="
                    mt-2
                    text-sm
                    text-brand-brown/45
                  "
                >
                  {
                    selectedBookings.length
                  }{" "}
                  {selectedBookings.length ===
                  1
                    ? "sesión"
                    : "sesiones"}
                </p>
              </div>

              {selectedBookings.length ===
              0 ? (
                <div
                  className="
                    py-12
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
                    Sin sesiones
                  </p>

                  <p
                    className="
                      mt-2
                      text-sm
                      text-brand-brown/45
                    "
                  >
                    Este día está libre.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {selectedBookings.map(
                    (booking) => {
                      const status =
                        getStatusInfo(
                          booking.status,
                        );

                      return (
                        <article
                          key={
                            booking.id
                          }
                          className="
                            rounded-2xl
                            border
                            border-brand-taupe/15
                            bg-brand-cream/55
                            p-4
                          "
                        >
                          <div
                            className="
                              flex
                              items-start
                              justify-between
                              gap-3
                            "
                          >
                            <div>
                              <p
                                className="
                                  text-lg
                                  font-semibold
                                  text-brand-brown
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

                              <p
                                className="
                                  mt-1
                                  text-sm
                                  font-semibold
                                  text-brand-brown
                                "
                              >
                                {
                                  booking.customer_name
                                }
                              </p>
                            </div>

                            <span
                              className={`
                                shrink-0
                                rounded-full
                                px-2.5
                                py-1
                                text-[10px]
                                font-semibold
                                ${status.badge}
                              `}
                            >
                              {
                                status.label
                              }
                            </span>
                          </div>

                          <p
                            className="
                              mt-3
                              text-sm
                              text-brand-brown/50
                            "
                          >
                            {booking.service_name_snapshot ||
                              "Servicio"}
                          </p>

                          {booking.booking_reference && (
                            <p
                              className="
                                mt-1
                                text-xs
                                text-brand-brown/35
                              "
                            >
                              {
                                booking.booking_reference
                              }
                            </p>
                          )}

                          <div
                            className="
                              mt-4
                              flex
                              flex-wrap
                              gap-2
                            "
                          >
                            {booking.google_meet_url && (
                              <a
                                href={
                                  booking.google_meet_url
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="
                                  inline-flex
                                  min-h-[40px]
                                  items-center
                                  justify-center
                                  rounded-full
                                  bg-brand-wine
                                  px-4
                                  text-xs
                                  font-semibold
                                  text-brand-cream
                                  transition
                                  hover:bg-brand-brown
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
                                rel="noreferrer"
                                className="
                                  inline-flex
                                  min-h-[40px]
                                  items-center
                                  justify-center
                                  rounded-full
                                  border
                                  border-brand-brown/15
                                  px-4
                                  text-xs
                                  font-semibold
                                  text-brand-brown
                                  transition
                                  hover:bg-brand-brown/5
                                "
                              >
                                Calendar
                              </a>
                            )}
                          </div>

                          {(booking.customer_phone ||
                            booking.customer_email) && (
                            <div
                              className="
                                mt-4
                                border-t
                                border-brand-taupe/15
                                pt-3
                              "
                            >
                              <p
                                className="
                                  break-all
                                  text-xs
                                  text-brand-brown/45
                                "
                              >
                                {
                                  booking.customer_email
                                }
                              </p>

                              {booking.customer_phone && (
                                <p
                                  className="
                                    mt-1
                                    text-xs
                                    text-brand-brown/45
                                  "
                                >
                                  {
                                    booking.customer_phone
                                  }
                                </p>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    },
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}