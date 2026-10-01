"use client";

import { useEffect, useMemo, useState } from "react";

import type { Service } from "@/lib/data/services";

type AvailableSlot = {
  starts_at: string;
  ends_at: string;
  local_time: string;
};

type BookingFlowProps = {
  services: Service[];
  initialServiceSlug?: string;
};

/* =========================================================
   FORMATEAR HORA
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

/* =========================================================
   FORMATEAR FECHA
========================================================= */

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  const localDate = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(localDate);
}

/* =========================================================
   COMPONENTE
========================================================= */

export default function BookingFlow({
  services,
  initialServiceSlug,
}: BookingFlowProps) {
  const validInitialService = services.some(
    (service) => service.slug === initialServiceSlug,
  );

  const [selectedService, setSelectedService] = useState(
    validInitialService
      ? initialServiceSlug!
      : services[0]?.slug ?? "",
  );

  const [selectedDate, setSelectedDate] = useState("");

  const [selectedSlot, setSelectedSlot] =
    useState<AvailableSlot | null>(null);

  const [slots, setSlots] = useState<AvailableSlot[]>([]);

  const [loading, setLoading] = useState(false);

  /* =========================================================
     SERVICIO ACTUAL
  ========================================================= */

  const currentService = useMemo(
    () =>
      services.find(
        (service) => service.slug === selectedService,
      ),
    [services, selectedService],
  );

  /* =========================================================
     SINCRONIZAR SERVICIO DESDE LA URL

     Ejemplo:
     /reservar?service=proceso-de-coaching
  ========================================================= */

  useEffect(() => {
    if (!initialServiceSlug) return;

    const exists = services.some(
      (service) => service.slug === initialServiceSlug,
    );

    if (exists) {
      setSelectedService(initialServiceSlug);
    }
  }, [initialServiceSlug, services]);

  /* =========================================================
     CONSULTAR DISPONIBILIDAD
  ========================================================= */

  useEffect(() => {
    setSelectedSlot(null);
    setSlots([]);

    if (!selectedService || !selectedDate) {
      return;
    }

    const controller = new AbortController();

    async function loadAvailability() {
      try {
        setLoading(true);

        const params = new URLSearchParams({
          service: selectedService,
          date: selectedDate,
        });

        const response = await fetch(
          `/api/availability?${params.toString()}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            "No fue posible consultar la disponibilidad.",
          );
        }

        const data = await response.json();

        setSlots(data.slots ?? []);
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
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

    return () => controller.abort();
  }, [selectedService, selectedDate]);

  /* =========================================================
     CAMBIAR SERVICIO
  ========================================================= */

  function handleServiceChange(slug: string) {
    setSelectedService(slug);

    /*
      Dejamos la fecha seleccionada,
      pero quitamos horario porque la disponibilidad
      puede ser distinta para otro servicio.
    */

    setSelectedSlot(null);
  }

  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[1100px] px-5 sm:px-8">
        {/* =====================================================
            ENCABEZADO
        ====================================================== */}

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
            Elige el servicio, selecciona una fecha y encuentra
            el horario que mejor te funcione.
          </p>
        </div>

        {/* =====================================================
            RESERVA
        ====================================================== */}

        <div
          className="
            mt-14
            grid
            items-stretch
            gap-6
            lg:grid-cols-[0.9fr_1.1fr]
          "
        >
          {/* ===================================================
              IZQUIERDA — SERVICIO
          ==================================================== */}

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
              {services.map((service) => {
                const active =
                  selectedService === service.slug;

                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() =>
                      handleServiceChange(service.slug)
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
                    <p className="font-display text-2xl font-semibold">
                      {service.name}
                    </p>

                    <p
                      className={`
                        mt-1
                        text-sm

                        ${
                          active
                            ? "text-brand-cream/70"
                            : "text-brand-black/55"
                        }
                      `}
                    >
                      {service.duration_minutes} min
                    </p>
                  </button>
                );
              })}
            </div>

            {/* =================================================
                DESCRIPCIÓN
            ================================================== */}

            {currentService && (
              <div className="mt-6 border-t border-brand-taupe/25 pt-5">
                <p className="text-sm leading-6 text-brand-black/60">
                  {currentService.short_description}
                </p>
              </div>
            )}
          </div>

          {/* ===================================================
              DERECHA — FECHA, HORARIO Y CHECKOUT
          ==================================================== */}

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

            {/* =================================================
                FECHA
            ================================================== */}

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
                setSelectedDate(event.target.value)
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

            {/* =================================================
                HORARIOS
            ================================================== */}

            <div className="mt-8">
              {!selectedDate && (
                <p className="text-sm text-brand-black/50">
                  Selecciona una fecha para consultar los
                  horarios disponibles.
                </p>
              )}

              {selectedDate && loading && (
                <p className="text-sm text-brand-black/50">
                  Consultando disponibilidad...
                </p>
              )}

              {selectedDate &&
                !loading &&
                slots.length === 0 && (
                  <p className="text-sm text-brand-black/50">
                    No hay horarios disponibles para esta fecha.
                  </p>
                )}

              {slots.length > 0 && !loading && (
                <>
                  <p className="text-sm font-semibold text-brand-brown">
                    Horarios disponibles
                  </p>

                  <div
                    className="
                      mt-4
                      grid
                      grid-cols-2
                      gap-3
                      sm:grid-cols-3
                    "
                  >
                    {slots.map((slot) => {
                      const selected =
                        selectedSlot?.starts_at ===
                        slot.starts_at;

                      return (
                        <button
                          key={slot.starts_at}
                          type="button"
                          onClick={() =>
                            setSelectedSlot(slot)
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
                          {formatTime(slot.local_time)}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* =================================================
                RESUMEN / CHECKOUT

                mt-auto hace que ocupe el espacio inferior
                disponible de esta misma card.
            ================================================== */}

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
                    <p
                      className="
                        text-[0.65rem]
                        font-semibold
                        uppercase
                        tracking-[0.25em]
                        text-brand-wine
                      "
                    >
                      Tu selección
                    </p>

                    <div
                      className="
                        mt-4
                        flex
                        flex-col
                        gap-5
                        sm:flex-row
                        sm:items-end
                        sm:justify-between
                      "
                    >
                      {/* =========================================
                          INFORMACIÓN
                      ========================================== */}

                      <div>
                        <p
                          className="
                            font-display
                            text-[1.8rem]
                            font-semibold
                            leading-none
                            text-brand-brown
                          "
                        >
                          {currentService.name}
                        </p>

                        <p className="mt-2 text-sm capitalize text-brand-brown/65">
                          {formatDate(selectedDate)}
                        </p>

                        <p className="mt-1 text-sm text-brand-brown/55">
                          {formatTime(selectedSlot.local_time)}
                          {" · "}
                          {currentService.duration_minutes} min
                        </p>
                      </div>

                      {/* =========================================
                          CONTINUAR
                      ========================================== */}

                      <button
                        type="button"
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
                          Continuar
                        </span>

                        <span
                          aria-hidden="true"
                          className="
                            text-lg
                            transition-transform
                            duration-200
                            group-hover:translate-x-1
                          "
                        >
                          →
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}