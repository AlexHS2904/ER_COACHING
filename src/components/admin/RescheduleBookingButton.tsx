"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type AvailableSlot = {
  starts_at: string;
  ends_at: string;
};

type RescheduleBookingButtonProps = {
  bookingId: string;
  customerName: string;

  currentStartsAt: string;
  currentEndsAt: string;

  onRescheduled?: () => void;
};

const TIME_ZONE =
  "America/Mexico_City";

function getDateKey(
  value:
    | string
    | Date,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
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
    ).formatToParts(
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

function formatTime(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      timeZone:
        TIME_ZONE,

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

function formatLongDate(
  value: string,
) {
  const formatted =
    new Intl.DateTimeFormat(
      "es-MX",
      {
        timeZone:
          TIME_ZONE,

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

  return (
    formatted
      .charAt(0)
      .toUpperCase() +
    formatted.slice(1)
  );
}

export default function RescheduleBookingButton({
  bookingId,
  customerName,
  currentStartsAt,
  currentEndsAt,
  onRescheduled,
}: RescheduleBookingButtonProps) {
  const router =
    useRouter();

  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState("");

  const [
    slots,
    setSlots,
  ] =
    useState<
      AvailableSlot[]
    >([]);

  const [
    selectedSlot,
    setSelectedSlot,
  ] =
    useState<
      AvailableSlot | null
    >(null);

  const [
    loadingSlots,
    setLoadingSlots,
  ] =
    useState(false);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const today =
    useMemo(
      () =>
        getDateKey(
          new Date(),
        ),
      [],
    );

  /* =========================================================
     CONSULTAR DISPONIBILIDAD
  ========================================================= */

  useEffect(() => {
    if (
      !open ||
      !selectedDate
    ) {
      return;
    }

    const controller =
      new AbortController();

    async function loadSlots() {
      setLoadingSlots(
        true,
      );

      setError("");

      setSelectedSlot(
        null,
      );

      try {
        const params =
          new URLSearchParams({
            date:
              selectedDate,
          });

        const response =
          await fetch(
            `/api/bookings/${encodeURIComponent(
              bookingId,
            )}/reschedule?${params.toString()}`,
            {
              signal:
                controller.signal,

              cache:
                "no-store",
            },
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data?.error ||
              "No fue posible consultar los horarios.",
          );
        }

        setSlots(
          data.slots ??
            [],
        );
      } catch (error) {
        if (
          error instanceof
            Error &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        setSlots([]);

        setError(
          error instanceof
            Error
            ? error.message
            : "No fue posible consultar los horarios.",
        );
      } finally {
        setLoadingSlots(
          false,
        );
      }
    }

    void loadSlots();

    return () =>
      controller.abort();
  }, [
    open,
    selectedDate,
    bookingId,
  ]);

  /* =========================================================
     ABRIR
  ========================================================= */

  function openModal() {
    setError("");

    setSlots([]);

    setSelectedSlot(
      null,
    );

    /*
      Iniciamos mostrando el
      mismo día de la cita actual.
    */
    setSelectedDate(
      getDateKey(
        currentStartsAt,
      ),
    );

    setOpen(true);
  }

  /* =========================================================
     CONFIRMAR
  ========================================================= */

  async function confirmReschedule() {
    if (
      !selectedSlot ||
      submitting
    ) {
      return;
    }

    setSubmitting(
      true,
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/bookings/${encodeURIComponent(
            bookingId,
          )}/reschedule`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                startsAt:
                  selectedSlot.starts_at,
              }),
          },
        );

      const data =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          data?.error ||
            "No fue posible reprogramar la reserva.",
        );
      }

      setOpen(false);

      setSelectedSlot(
        null,
      );

      onRescheduled?.();

      router.refresh();
    } catch (error) {
      setError(
        error instanceof
          Error
          ? error.message
          : "No fue posible reprogramar la reserva.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={
          openModal
        }
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
          hover:border-brand-wine/25
          hover:bg-brand-brown/5
        "
      >
        Reprogramar
      </button>

      {open && (
        <div
          className="
            fixed
            inset-0
            z-[110]
            flex
            items-center
            justify-center
            overflow-y-auto
            bg-black/35
            px-5
            py-8
          "
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
                event.currentTarget &&
              !submitting
            ) {
              setOpen(
                false,
              );
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-title"
            className="
              w-full
              max-w-[560px]
              rounded-[1.75rem]
              bg-[#f7f5f1]
              p-6
              shadow-2xl
              sm:p-8
            "
          >
            {/* HEADER */}

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
                    tracking-[0.18em]
                    text-brand-wine
                  "
                >
                  Reprogramar
                </p>

                <h2
                  id="reschedule-title"
                  className="
                    mt-3
                    font-display
                    text-3xl
                    font-semibold
                    text-brand-brown
                  "
                >
                  Cambiar horario
                </h2>

                <p
                  className="
                    mt-2
                    text-sm
                    text-brand-brown/50
                  "
                >
                  {customerName}
                </p>
              </div>

              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={() =>
                  setOpen(
                    false,
                  )
                }
                aria-label="Cerrar"
                className="
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  border
                  border-brand-brown/15
                  text-xl
                  text-brand-brown
                  transition
                  hover:bg-brand-brown/5
                  disabled:opacity-50
                "
              >
                ×
              </button>
            </div>

            {/* HORARIO ACTUAL */}

            <div
              className="
                mt-7
                rounded-2xl
                border
                border-brand-taupe/20
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
                Horario actual
              </p>

              <p
                className="
                  mt-2
                  text-sm
                  font-semibold
                  text-brand-brown
                "
              >
                {formatLongDate(
                  currentStartsAt,
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
                  currentStartsAt,
                )}
                {" – "}
                {formatTime(
                  currentEndsAt,
                )}
              </p>
            </div>

            {/* FECHA */}

            <div className="mt-6">
              <label
                htmlFor={`reschedule-date-${bookingId}`}
                className="
                  text-sm
                  font-semibold
                  text-brand-brown
                "
              >
                Nueva fecha
              </label>

              <input
                id={`reschedule-date-${bookingId}`}
                type="date"
                min={today}
                value={
                  selectedDate
                }
                disabled={
                  submitting
                }
                onChange={(
                  event,
                ) => {
                  setSelectedDate(
                    event.target
                      .value,
                  );

                  setSelectedSlot(
                    null,
                  );
                }}
                className="
                  mt-2
                  min-h-[50px]
                  w-full
                  rounded-xl
                  border
                  border-brand-taupe/25
                  bg-white
                  px-4
                  text-sm
                  text-brand-brown
                  outline-none
                  transition
                  focus:border-brand-wine/45
                  disabled:opacity-60
                "
              />
            </div>

            {/* HORARIOS */}

            <div className="mt-6">
              <p
                className="
                  text-sm
                  font-semibold
                  text-brand-brown
                "
              >
                Horario disponible
              </p>

              {loadingSlots ? (
                <div
                  className="
                    mt-3
                    rounded-2xl
                    bg-white/55
                    px-4
                    py-6
                    text-center
                    text-sm
                    text-brand-brown/45
                  "
                >
                  Consultando horarios...
                </div>
              ) : slots.length ===
                0 ? (
                <div
                  className="
                    mt-3
                    rounded-2xl
                    border
                    border-dashed
                    border-brand-taupe/30
                    px-4
                    py-6
                    text-center
                  "
                >
                  <p
                    className="
                      text-sm
                      font-semibold
                      text-brand-brown
                    "
                  >
                    Sin horarios disponibles
                  </p>

                  <p
                    className="
                      mt-1
                      text-xs
                      leading-5
                      text-brand-brown/45
                    "
                  >
                    Selecciona otra fecha
                    para consultar la agenda.
                  </p>
                </div>
              ) : (
                <div
                  className="
                    mt-3
                    grid
                    grid-cols-2
                    gap-2
                    sm:grid-cols-3
                  "
                >
                  {slots.map(
                    (slot) => {
                      const selected =
                        selectedSlot
                          ?.starts_at ===
                        slot.starts_at;

                      return (
                        <button
                          key={
                            slot.starts_at
                          }
                          type="button"
                          disabled={
                            submitting
                          }
                          onClick={() =>
                            setSelectedSlot(
                              slot,
                            )
                          }
                          className={`
                            min-h-[48px]
                            rounded-xl
                            border
                            px-3
                            text-sm
                            font-semibold
                            transition
                            ${
                              selected
                                ? "border-brand-wine bg-brand-wine text-brand-cream"
                                : "border-brand-taupe/20 bg-white/70 text-brand-brown hover:border-brand-wine/30"
                            }
                          `}
                        >
                          {formatTime(
                            slot.starts_at,
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </div>

            {/* NUEVA SELECCIÓN */}

            {selectedSlot && (
              <div
                className="
                  mt-6
                  rounded-2xl
                  bg-[#E8F2EC]
                  p-4
                  text-[#295C3B]
                "
              >
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.14em]
                  "
                >
                  Nuevo horario
                </p>

                <p
                  className="
                    mt-2
                    text-sm
                    font-semibold
                  "
                >
                  {formatLongDate(
                    selectedSlot.starts_at,
                  )}
                </p>

                <p className="mt-1 text-sm">
                  {formatTime(
                    selectedSlot.starts_at,
                  )}
                  {" – "}
                  {formatTime(
                    selectedSlot.ends_at,
                  )}
                </p>
              </div>
            )}

            {/* INFO GOOGLE */}

            <div
              className="
                mt-6
                rounded-2xl
                bg-brand-cream
                p-4
              "
            >
              <p
                className="
                  text-xs
                  leading-5
                  text-brand-brown/50
                "
              >
                Se conservará el mismo
                evento y el mismo enlace
                de Google Meet. Google
                Calendar notificará al
                cliente sobre el cambio
                de horario.
              </p>
            </div>

            {/* ERROR */}

            {error && (
              <div
                role="alert"
                className="
                  mt-4
                  rounded-2xl
                  bg-[#F7E8E8]
                  px-4
                  py-3
                  text-sm
                  leading-6
                  text-[#8A3535]
                "
              >
                {error}
              </div>
            )}

            {/* BOTONES */}

            <div
              className="
                mt-7
                flex
                flex-col-reverse
                gap-3
                sm:flex-row
                sm:justify-end
              "
            >
              <button
                type="button"
                disabled={
                  submitting
                }
                onClick={() =>
                  setOpen(
                    false,
                  )
                }
                className="
                  min-h-[48px]
                  rounded-full
                  border
                  border-brand-brown/15
                  px-5
                  text-sm
                  font-semibold
                  text-brand-brown
                  transition
                  hover:bg-brand-brown/5
                  disabled:opacity-50
                "
              >
                Volver
              </button>

              <button
                type="button"
                disabled={
                  !selectedSlot ||
                  submitting
                }
                onClick={
                  confirmReschedule
                }
                className="
                  min-h-[48px]
                  rounded-full
                  bg-brand-wine
                  px-6
                  text-sm
                  font-semibold
                  text-brand-cream
                  transition
                  hover:bg-brand-brown
                  disabled:cursor-not-allowed
                  disabled:opacity-45
                "
              >
                {submitting
                  ? "Reprogramando..."
                  : "Confirmar cambio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}