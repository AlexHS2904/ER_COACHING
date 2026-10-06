"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import type { Service } from "@/lib/data/services";

/* =========================================================
   TYPES
========================================================= */

type AvailableSlot = {
  starts_at: string;
  ends_at: string;
  local_time: string;
};

type BookingFlowProps = {
  services: Service[];
  initialServiceSlug?: string;
};

type BookingResponse = {
  error?: string;

  bookingId?: string;

  bookingReference?: string;

  status?: string;

  calendar?: {
    eventId?: string | null;
    meetUrl?: string | null;
    calendarUrl?: string | null;
  };

  emails?: {
    customer?: string;
    coach?: string;
  };
};

/* =========================================================
   HELPERS
========================================================= */

function formatTime(time: string) {
  const [hours, minutes] = time.split(":");

  const date = new Date();

  date.setHours(Number(hours));
  date.setMinutes(Number(minutes));

  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDate(date: string) {
  const [year, month, day] = date
    .split("-")
    .map(Number);

  const localDate = new Date(
    year,
    month - 1,
    day,
  );

  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(localDate);
}

function formatPrice(service: Service) {
  if (service.price === null) {
    return null;
  }

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: service.currency,
    maximumFractionDigits: 0,
  }).format(service.price);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function BookingFlow({
  services,
  initialServiceSlug,
}: BookingFlowProps) {
    const router = useRouter();

    
  /* =======================================================
     REF FORMULARIO
  ======================================================= */

  const formSectionRef =
    useRef<HTMLDivElement>(null);

  /* =======================================================
     SERVICIO
  ======================================================= */

  const validInitialService =
    services.some(
      (service) =>
        service.slug ===
        initialServiceSlug,
    );

  const [
    selectedService,
    setSelectedService,
  ] = useState(
    validInitialService
      ? initialServiceSlug!
      : services[0]?.slug ?? "",
  );

  /* =======================================================
     FECHA / HORARIO
  ======================================================= */

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

const [
  bookingSuccess,
  setBookingSuccess,
] = useState<BookingResponse | null>(
  null,
);

  const [
    selectedSlot,
    setSelectedSlot,
  ] = useState<AvailableSlot | null>(
    null,
  );

  const [slots, setSlots] = useState<
    AvailableSlot[]
  >([]);

  const [loading, setLoading] =
    useState(false);

  /* =======================================================
     PASOS
  ======================================================= */

  const [step, setStep] = useState<2 | 3>(
    2,
  );

  /* =======================================================
     DATOS CLIENTE
  ======================================================= */

  const [
    customerName,
    setCustomerName,
  ] = useState("");

  const [
    customerEmail,
    setCustomerEmail,
  ] = useState("");

const [
  customerEmailConfirm,
  setCustomerEmailConfirm,
] = useState("");

  const [
    customerPhone,
    setCustomerPhone,
  ] = useState("");

  const [
    customerNotes,
    setCustomerNotes,
  ] = useState("");

  /* =======================================================
     ENVÍO
  ======================================================= */

  const [submitting, setSubmitting] =
    useState(false);

  const [formError, setFormError] =
    useState("");

  /* =======================================================
     SERVICIO ACTUAL
  ======================================================= */

  const currentService = useMemo(
    () =>
      services.find(
        (service) =>
          service.slug ===
          selectedService,
      ),
    [services, selectedService],
  );

  /* =======================================================
     SERVICIO DESDE URL
  ======================================================= */

  useEffect(() => {
    if (!initialServiceSlug) return;

    const exists = services.some(
      (service) =>
        service.slug ===
        initialServiceSlug,
    );

    if (exists) {
      setSelectedService(
        initialServiceSlug,
      );
    }
  }, [
    initialServiceSlug,
    services,
  ]);

  /* =======================================================
     DISPONIBILIDAD
  ======================================================= */

  useEffect(() => {
    setSelectedSlot(null);
    setSlots([]);
    setStep(2);

    if (
      !selectedService ||
      !selectedDate
    ) {
      return;
    }

    const controller =
      new AbortController();

    async function loadAvailability() {
      try {
        setLoading(true);

        const params =
          new URLSearchParams({
            service:
              selectedService,
            date: selectedDate,
          });

        const response = await fetch(
          `/api/availability?${params.toString()}`,
          {
            signal:
              controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            "No fue posible consultar la disponibilidad.",
          );
        }

        const data =
          await response.json();

        setSlots(
          data.slots ?? [],
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(error);

        setSlots([]);
      } finally {
        setLoading(false);
      }
    }

    loadAvailability();

    return () =>
      controller.abort();
  }, [
    selectedService,
    selectedDate,
  ]);

  /* =======================================================
     SCROLL AL PASO 03
  ======================================================= */

  useEffect(() => {
    if (step !== 3) return;

    requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView(
        {
          behavior: "smooth",
          block: "start",
        },
      );
    });
  }, [step]);

  /* =======================================================
     HANDLERS
  ======================================================= */

  function handleServiceChange(
    slug: string,
  ) {
    setSelectedService(slug);
    setSelectedSlot(null);
    setStep(2);
    setFormError("");
  }

  function handleDateChange(
    value: string,
  ) {
    setSelectedDate(value);
    setSelectedSlot(null);
    setStep(2);
    setFormError("");
  }

  function handleSlotChange(
    slot: AvailableSlot,
  ) {
    setSelectedSlot(slot);
    setStep(2);
    setFormError("");
  }

  function handleContinue() {
    if (
      !currentService ||
      !selectedDate ||
      !selectedSlot
    ) {
      return;
    }

    setFormError("");
    setStep(3);
  }

  /* =======================================================
     CONFIRMAR RESERVA
  ======================================================= */

  async function handleConfirmReservation(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setFormError("");

    if (
      !currentService ||
      !selectedDate ||
      !selectedSlot
    ) {
      setFormError(
        "Selecciona un servicio, una fecha y un horario.",
      );

      return;
    }

    const cleanName =
        customerName.trim();

    const cleanEmail =
        customerEmail
        .trim()
        .toLowerCase();

    const cleanEmailConfirm =
        customerEmailConfirm
            .trim()
            .toLowerCase();

        if (
        cleanEmail !==
        cleanEmailConfirm
        ) {
        setFormError(
            "Los correos electrónicos no coinciden.",
        );

        return;
        }

    const cleanPhone =
        customerPhone.trim();

    const cleanNotes =
        customerNotes.trim();

    if (cleanName.length < 2) {
        setFormError(
        "Ingresa tu nombre completo.",
    );

        return;
    }

    if (
      !cleanEmail ||
      !isValidEmail(cleanEmail)
    ) {
      setFormError(
        "Ingresa un correo electrónico válido.",
      );

      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(
        "/api/bookings",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            service:
              currentService.slug,

            startsAt:
              selectedSlot.starts_at,

            name: cleanName,

            email: cleanEmail,

            phone:
              cleanPhone || null,

            notes:
              cleanNotes || null,
          }),
        },
      );

      let data:
        | BookingResponse
        | undefined;

      try {
        data =
          await response.json();
      } catch {
        data = undefined;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "No fue posible confirmar la reserva.",
        );
      }

      if (
        !data?.bookingReference
        ) {
        throw new Error(
            "La reserva se creó, pero no fue posible obtener la confirmación.",
        );
        }

                router.replace(
        `/reservar/confirmada?ref=${encodeURIComponent(
            data.bookingReference,
        )}`,
        );

    } catch (error) {
      console.error(error);

      setFormError(
        error instanceof Error
          ? error.message
          : "No fue posible confirmar la reserva.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[1100px] px-5 sm:px-8">
        {/* =================================================
            HEADER
        ================================================== */}

        <div className="mx-auto max-w-[700px] text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-wine">
            Reserva
          </p>

          <h1
            className="
              mt-4
              font-display
              text-5xl
              font-semibold
              leading-[0.95]
              text-brand-brown
              sm:text-6xl
            "
          >
            Agenda tu sesión.
          </h1>

          <p className="mx-auto mt-5 max-w-[520px] text-base leading-7 text-brand-black/60">
            Elige el servicio,
            selecciona una fecha y
            encuentra el horario que
            mejor te funcione.
          </p>
        </div>

        {/* =================================================
            PASOS 01 + 02
        ================================================== */}

        <div
          className="
            mt-14
            grid
            items-stretch
            gap-6
            lg:grid-cols-[0.9fr_1.1fr]
          "
        >
          {/* ===============================================
              01 · SERVICIO
          ================================================ */}

          <div
            className="
              rounded-[1.75rem]
              border
              border-brand-taupe/25
              bg-white/60
              p-6
              sm:p-8
            "
          >
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-wine">
              01 · Servicio
            </p>

            <div className="mt-5 space-y-3">
              {services.map(
                (service) => {
                  const active =
                    selectedService ===
                    service.slug;

                  const price =
                    formatPrice(service);

                  const sessionCount =
                    service.session_count ??
                    1;

                  return (
                    <button
                      key={
                        service.id
                      }
                      type="button"
                      onClick={() =>
                        handleServiceChange(
                          service.slug,
                        )
                      }
                      className={`
                        w-full
                        rounded-xl
                        border
                        p-4
                        text-left
                        transition-colors
                        duration-200

                        ${
                          active
                            ? `
                              border-brand-wine
                              bg-brand-wine
                              text-brand-cream
                            `
                            : `
                              border-brand-taupe/30
                              bg-white/40
                              text-brand-brown
                              hover:border-brand-wine/50
                            `
                        }
                      `}
                    >
                      {/* ===================================
                          NOMBRE + PRECIO
                      ==================================== */}

                      <div className="flex items-start justify-between gap-4">
                        <p className="font-display text-2xl font-semibold leading-tight">
                          {
                            service.name
                          }
                        </p>

                        {price && (
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold">
                              {price}
                            </p>

                            <p
                              className={`
                                mt-0.5
                                text-[0.58rem]
                                font-semibold
                                uppercase
                                tracking-[0.16em]

                                ${
                                  active
                                    ? "text-brand-cream/55"
                                    : "text-brand-brown/40"
                                }
                              `}
                            >
                              {
                                service.currency
                              }
                            </p>
                          </div>
                        )}
                      </div>

                      {/* ===================================
                          SESIONES + DURACIÓN
                      ==================================== */}

                      <div
                        className={`
                          mt-2
                          flex
                          flex-wrap
                          items-center
                          gap-x-2
                          gap-y-1
                          text-sm

                          ${
                            active
                              ? "text-brand-cream/70"
                              : "text-brand-black/55"
                          }
                        `}
                      >
                        <span>
                          {sessionCount}{" "}
                          {sessionCount ===
                          1
                            ? "sesión"
                            : "sesiones"}
                        </span>

                        <span
                          aria-hidden="true"
                          className="opacity-50"
                        >
                          ·
                        </span>

                        <span>
                          {
                            service.duration_minutes
                          }{" "}
                          min
                        </span>
                      </div>
                    </button>
                  );
                },
              )}
            </div>

            {/* DESCRIPCIÓN */}

            {currentService && (
              <div className="mt-6 border-t border-brand-taupe/25 pt-5">
                <p className="text-sm leading-6 text-brand-black/60">
                  {
                    currentService.short_description
                  }
                </p>
              </div>
            )}
          </div>

          {/* ===============================================
              02 · FECHA Y HORARIO
          ================================================ */}

          <div
            className="
              flex
              h-full
              flex-col
              rounded-[1.75rem]
              border
              border-brand-taupe/25
              bg-white/60
              p-6
              sm:p-8
            "
          >
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-green">
              02 · Fecha y horario
            </p>

            {/* FECHA */}

            <label
              htmlFor="booking-date"
              className="
                mt-6
                block
                text-sm
                font-semibold
                text-brand-brown
              "
            >
              Selecciona una fecha
            </label>

            <input
              id="booking-date"
              type="date"
              value={selectedDate}
              onChange={(event) =>
                handleDateChange(
                  event.target.value,
                )
              }
              className="
                mt-2
                w-full
                rounded-xl
                border
                border-brand-taupe/30
                bg-brand-cream/60
                px-4
                py-3.5
                text-brand-brown
                outline-none
                transition-colors
                duration-200
                focus:border-brand-green
              "
            />

            {/* HORARIOS */}

            <div className="mt-8">
              {!selectedDate && (
                <p className="text-sm text-brand-black/50">
                  Selecciona una fecha
                  para consultar los
                  horarios disponibles.
                </p>
              )}

              {selectedDate &&
                loading && (
                  <p className="text-sm text-brand-black/50">
                    Consultando
                    disponibilidad...
                  </p>
                )}

              {selectedDate &&
                !loading &&
                slots.length ===
                  0 && (
                  <p className="text-sm text-brand-black/50">
                    No hay horarios
                    disponibles para
                    esta fecha.
                  </p>
                )}

              {slots.length > 0 &&
                !loading && (
                  <>
                    <p className="text-sm font-semibold text-brand-brown">
                      Horarios
                      disponibles
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {slots.map(
                        (slot) => {
                          const selected =
                            selectedSlot?.starts_at ===
                            slot.starts_at;

                          return (
                            <button
                              key={
                                slot.starts_at
                              }
                              type="button"
                              onClick={() =>
                                handleSlotChange(
                                  slot,
                                )
                              }
                              className={`
                                rounded-xl
                                border
                                px-4
                                py-3
                                text-sm
                                font-semibold
                                transition-colors
                                duration-200

                                ${
                                  selected
                                    ? `
                                      border-brand-green
                                      bg-brand-green
                                      text-brand-cream
                                    `
                                    : `
                                      border-brand-taupe/30
                                      bg-transparent
                                      text-brand-brown
                                      hover:border-brand-green
                                    `
                                }
                              `}
                            >
                              {formatTime(
                                slot.local_time,
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </>
                )}
            </div>

            {/* =============================================
                RESUMEN
            ============================================== */}

            {currentService &&
              selectedDate &&
              selectedSlot && (
                <div className="mt-auto pt-8">
                  <div
                    className="
                      rounded-[1.25rem]
                      border
                      border-brand-taupe/20
                      bg-brand-taupe/10
                      p-5
                      sm:p-6
                    "
                  >
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-brand-wine">
                      Tu selección
                    </p>

                    <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="font-display text-[1.8rem] font-semibold leading-none text-brand-brown">
                          {
                            currentService.name
                          }
                        </p>

                        <p className="mt-2 text-sm capitalize text-brand-brown/65">
                          {formatDate(
                            selectedDate,
                          )}
                        </p>

                        <p className="mt-1 text-sm text-brand-brown/55">
                          {formatTime(
                            selectedSlot.local_time,
                          )}

                          {" · "}

                          {
                            currentService.duration_minutes
                          }{" "}
                          min
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={
                          handleContinue
                        }
                        className="
                          group
                          flex
                          min-h-[50px]
                          shrink-0
                          items-center
                          justify-between
                          gap-8
                          rounded-xl
                          bg-brand-wine
                          px-5
                          font-semibold
                          text-brand-cream
                          transition-colors
                          duration-200
                          hover:bg-brand-brown
                        "
                      >
                        <span>
                          {step === 3
                            ? "Ir a tus datos"
                            : "Continuar"}
                        </span>

                        <span
                          aria-hidden="true"
                          className="
                            text-lg
                            transition-transform
                            duration-200
                            group-hover:translate-y-0.5
                          "
                        >
                          ↓
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* =================================================
            03 · DATOS
        ================================================== */}

        {bookingSuccess ? (
        <div className="mt-8 text-center">
            <div
            className="
                mx-auto
                flex
                h-14
                w-14
                items-center
                justify-center
                rounded-full
                bg-brand-green
                text-2xl
                text-brand-cream
            "
            >
            ✓
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-brand-green">
            Reserva confirmada
            </p>

            <h2 className="mt-3 font-display text-4xl font-semibold text-brand-brown">
            Tu sesión está lista.
            </h2>

            <p className="mx-auto mt-4 max-w-[520px] text-sm leading-6 text-brand-brown/60">
            Guardamos tu horario y enviamos la
            información de la sesión al correo
            que proporcionaste.
            </p>

            <div
            className="
                mx-auto
                mt-8
                max-w-[520px]
                rounded-[1.5rem]
                border
                border-brand-taupe/20
                bg-brand-taupe/10
                p-6
                text-left
            "
            >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-wine">
                Código de reserva
            </p>

            <p className="mt-2 font-display text-3xl font-semibold text-brand-brown">
                {
                bookingSuccess.bookingReference
                }
            </p>

            {bookingSuccess.calendar
                ?.meetUrl && (
                <a
                href={
                    bookingSuccess.calendar
                    .meetUrl
                }
                target="_blank"
                rel="noreferrer"
                className="
                    mt-6
                    flex
                    min-h-[54px]
                    items-center
                    justify-center
                    rounded-xl
                    bg-brand-wine
                    px-6
                    font-semibold
                    text-brand-cream
                    transition-colors
                    hover:bg-brand-brown
                "
                >
                Entrar a Google Meet
                </a>
            )}

            {bookingSuccess.calendar
                ?.calendarUrl && (
                <a
                href={
                    bookingSuccess.calendar
                    .calendarUrl
                }
                target="_blank"
                rel="noreferrer"
                className="
                    mt-3
                    flex
                    min-h-[52px]
                    items-center
                    justify-center
                    rounded-xl
                    border
                    border-brand-taupe/30
                    font-semibold
                    text-brand-brown
                    transition-colors
                    hover:border-brand-wine
                    hover:text-brand-wine
                "
                >
                Ver en Google Calendar
                </a>
            )}
            </div>

            {bookingSuccess.emails
            ?.customer ===
            "failed" && (
            <p className="mx-auto mt-5 max-w-[520px] text-sm leading-6 text-brand-wine">
                Tu reserva está confirmada, pero
                tuvimos un problema enviando el
                correo de confirmación. Guarda tu
                código de reserva.
            </p>
            )}
        </div>
        ) : (
        <form
            onSubmit={
            handleConfirmReservation
            }
            className="mt-8"
        >
            {/* aquí permanece TODO tu formulario actual */}
        </form>
        )}

        {step === 3 &&
          currentService &&
          selectedDate &&
          selectedSlot && (
            <div
              ref={formSectionRef}
              className="
                scroll-mt-28
                mt-8
                rounded-[1.75rem]
                border
                border-brand-taupe/25
                bg-white/60
                p-6
                sm:p-8
                lg:p-10
              "
            >
              {/* HEADER */}

              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-wine">
                    03 · Tus datos
                  </p>

                  <h2 className="mt-3 font-display text-3xl font-semibold text-brand-brown sm:text-4xl">
                    Ya casi está lista
                    tu sesión.
                  </h2>

                  <p className="mt-3 max-w-[620px] text-sm leading-6 text-brand-black/55">
                    Completa tus datos
                    para confirmar la
                    reserva. Recibirás
                    por correo los
                    detalles de tu
                    sesión y el enlace
                    de Google Meet.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStep(2);
                    setFormError("");
                  }}
                  className="
                    shrink-0
                    text-sm
                    font-semibold
                    text-brand-brown/45
                    transition-colors
                    duration-200
                    hover:text-brand-wine
                  "
                >
                  ← Volver
                </button>
              </div>

              {/* RESUMEN */}

              <div
                className="
                  mt-7
                  flex
                  flex-col
                  gap-3
                  rounded-[1.25rem]
                  border
                  border-brand-taupe/20
                  bg-brand-taupe/10
                  p-5
                  sm:flex-row
                  sm:items-center
                  sm:justify-between
                "
              >
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brand-wine">
                    Tu sesión
                  </p>

                  <p className="mt-2 font-display text-2xl font-semibold text-brand-brown">
                    {
                      currentService.name
                    }
                  </p>

                  <p className="mt-1 text-sm text-brand-brown/50">
                    {currentService.session_count ??
                      1}{" "}
                    {(currentService.session_count ??
                      1) === 1
                      ? "sesión"
                      : "sesiones"}

                    {" · "}

                    {
                      currentService.duration_minutes
                    }{" "}
                    min c/u
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="text-sm capitalize text-brand-brown/65">
                    {formatDate(
                      selectedDate,
                    )}
                  </p>

                  <p className="mt-1 text-sm text-brand-brown/50">
                    {formatTime(
                      selectedSlot.local_time,
                    )}
                  </p>

                  {formatPrice(
                    currentService,
                  ) && (
                    <p className="mt-2 font-semibold text-brand-wine">
                      {formatPrice(
                        currentService,
                      )}{" "}
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-brand-brown/40">
                        {
                          currentService.currency
                        }
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* FORM */}

              <form
                onSubmit={
                  handleConfirmReservation
                }
                className="mt-8"
              >
                <div className="grid gap-6 md:grid-cols-2">
                  {/* NOMBRE */}

                  <div>
                    <label
                      htmlFor="customer-name"
                      className="text-sm font-semibold text-brand-brown"
                    >
                      Nombre completo

                      <span className="text-brand-wine">
                        {" "}
                        *
                      </span>
                    </label>

                    <input
                      id="customer-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={
                        customerName
                      }
                      onChange={(
                        event,
                      ) =>
                        setCustomerName(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Tu nombre"
                      className="
                        mt-2
                        w-full
                        rounded-xl
                        border
                        border-brand-taupe/30
                        bg-brand-cream/50
                        px-4
                        py-3.5
                        text-brand-brown
                        outline-none
                        transition-colors
                        duration-200
                        placeholder:text-brand-brown/30
                        focus:border-brand-wine
                      "
                    />
                  </div>

                  {/* EMAIL */}

                    <div>
                    <label
                        htmlFor="customer-email"
                        className="text-sm font-semibold text-brand-brown"
                    >
                        Correo electrónico

                        <span className="text-brand-wine">
                        {" "}
                        *
                        </span>
                    </label>

                    <input
                        id="customer-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={customerEmail}
                        onChange={(event) =>
                        setCustomerEmail(
                            event.target.value,
                        )
                        }
                        placeholder="tu@correo.com"
                        className="
                        mt-2
                        w-full
                        rounded-xl
                        border
                        border-brand-taupe/30
                        bg-brand-cream/50
                        px-4
                        py-3.5
                        text-brand-brown
                        outline-none
                        transition-colors
                        duration-200
                        placeholder:text-brand-brown/30
                        focus:border-brand-wine
                        "
                    />
                    </div>

                    {/* CONFIRMAR EMAIL */}

                    <div>
                    <label
                        htmlFor="customer-email-confirm"
                        className="text-sm font-semibold text-brand-brown"
                    >
                        Confirma tu correo electrónico

                        <span className="text-brand-wine">
                        {" "}
                        *
                        </span>
                    </label>

                    <input
                        id="customer-email-confirm"
                        name="email-confirm"
                        type="email"
                        autoComplete="email"
                        required
                        value={customerEmailConfirm}
                        onChange={(event) =>
                        setCustomerEmailConfirm(
                            event.target.value,
                        )
                        }
                        placeholder="Vuelve a escribir tu correo"
                        className="
                        mt-2
                        w-full
                        rounded-xl
                        border
                        border-brand-taupe/30
                        bg-brand-cream/50
                        px-4
                        py-3.5
                        text-brand-brown
                        outline-none
                        transition-colors
                        duration-200
                        placeholder:text-brand-brown/30
                        focus:border-brand-wine
                        "
                    />
                    </div>

{/* TELÉFONO */}

                  {/* TELÉFONO */}

                  <div>
                    <label
                      htmlFor="customer-phone"
                      className="text-sm font-semibold text-brand-brown"
                    >
                      Teléfono

                      <span className="ml-1 font-normal text-brand-brown/40">
                        opcional
                      </span>
                    </label>

                    <input
                      id="customer-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={
                        customerPhone
                      }
                      onChange={(
                        event,
                      ) =>
                        setCustomerPhone(
                          event.target
                            .value,
                        )
                      }
                      placeholder="55 1234 5678"
                      className="
                        mt-2
                        w-full
                        rounded-xl
                        border
                        border-brand-taupe/30
                        bg-brand-cream/50
                        px-4
                        py-3.5
                        text-brand-brown
                        outline-none
                        transition-colors
                        duration-200
                        placeholder:text-brand-brown/30
                        focus:border-brand-wine
                      "
                    />
                  </div>

                  <div className="hidden md:block" />

                  {/* NOTAS */}

                  <div className="md:col-span-2">
                    <label
                      htmlFor="customer-notes"
                      className="text-sm font-semibold text-brand-brown"
                    >
                      ¿Hay algo que te
                      gustaría compartir
                      antes de la sesión?

                      <span className="ml-1 font-normal text-brand-brown/40">
                        opcional
                      </span>
                    </label>

                    <textarea
                      id="customer-notes"
                      name="notes"
                      rows={4}
                      value={
                        customerNotes
                      }
                      onChange={(
                        event,
                      ) =>
                        setCustomerNotes(
                          event.target
                            .value,
                        )
                      }
                      placeholder="Cuéntale brevemente a la coach qué te gustaría trabajar..."
                      className="
                        mt-2
                        w-full
                        resize-none
                        rounded-xl
                        border
                        border-brand-taupe/30
                        bg-brand-cream/50
                        px-4
                        py-3.5
                        text-brand-brown
                        outline-none
                        transition-colors
                        duration-200
                        placeholder:text-brand-brown/30
                        focus:border-brand-wine
                      "
                    />
                  </div>
                </div>

                {/* ERROR */}

                {formError && (
                  <div
                    role="alert"
                    className="
                      mt-6
                      rounded-xl
                      border
                      border-brand-wine/20
                      bg-brand-wine/5
                      px-4
                      py-3
                      text-sm
                      leading-6
                      text-brand-wine
                    "
                  >
                    {formError}
                  </div>
                )}

                {/* FOOTER */}

                <div
                  className="
                    mt-8
                    flex
                    flex-col
                    gap-5
                    border-t
                    border-brand-taupe/20
                    pt-6
                    sm:flex-row
                    sm:items-center
                    sm:justify-between
                  "
                >
                  <div className="max-w-[520px]">
                    <p className="text-sm leading-6 text-brand-brown/55">
                      Al confirmar,
                      volveremos a
                      comprobar que el
                      horario siga
                      disponible.
                    </p>

                    <p className="mt-1 text-xs leading-5 text-brand-brown/40">
                      Después recibirás
                      la información de
                      tu sesión por
                      correo electrónico.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      submitting
                    }
                    className="
                      group
                      flex
                      min-h-[56px]
                      min-w-[220px]
                      items-center
                      justify-between
                      gap-7
                      rounded-xl
                      bg-brand-wine
                      px-6
                      font-semibold
                      text-brand-cream
                      transition-colors
                      duration-200
                      hover:bg-brand-brown
                      disabled:cursor-not-allowed
                      disabled:opacity-50
                    "
                  >
                    <span>
                      {submitting
                        ? "Confirmando..."
                        : "Confirmar reserva"}
                    </span>

                    {!submitting && (
                      <span
                        aria-hidden="true"
                        className="
                          text-xl
                          transition-transform
                          duration-200
                          group-hover:translate-x-1
                        "
                      >
                        →
                      </span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
      </div>
    </section>
  );
}