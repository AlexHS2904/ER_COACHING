"use client";

import {
  type FormEvent,
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
  local_time: string;
};

type Props = {
  token: string;
  serviceSlug: string;
  sessionNumber: number;
  serviceName: string;
  durationMinutes:
    | number
    | null;
};

/* =========================================================
   HELPERS
========================================================= */

function getToday() {
  const now =
    new Date();

  const local =
    new Date(
      now.getTime() -
        now.getTimezoneOffset() *
          60_000,
    );

  return local
    .toISOString()
    .slice(
      0,
      10,
    );
}

function formatTime(
  value: string,
) {
  const [
    hours,
    minutes,
  ] =
    value.split(":");

  const date =
    new Date();

  date.setHours(
    Number(hours),
  );

  date.setMinutes(
    Number(minutes),
  );

  return new Intl.DateTimeFormat(
    "es-MX",
    {
      hour:
        "numeric",

      minute:
        "2-digit",

      hour12:
        true,
    },
  ).format(date);
}

function formatSelectedDate(
  value: string,
) {
  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  const date =
    new Date(
      year,
      month - 1,
      day,
    );

  return new Intl.DateTimeFormat(
    "es-MX",
    {
      weekday:
        "long",

      day:
        "numeric",

      month:
        "long",

      year:
        "numeric",
    },
  ).format(date);
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ProcessSessionScheduler({
  token,
  serviceSlug,
  sessionNumber,
  serviceName,
  durationMinutes,
}: Props) {
  const router =
    useRouter();

  const today =
    useMemo(
      () =>
        getToday(),
      [],
    );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState("");

  const [
    slots,
    setSlots,
  ] = useState<
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
    loading,
    setLoading,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  /* =======================================================
     DISPONIBILIDAD
  ======================================================= */

  useEffect(() => {
    setSlots([]);
    setSelectedSlot(
      null,
    );
    setError("");

    if (!selectedDate) {
      return;
    }

    const controller =
      new AbortController();

    async function loadAvailability() {
      try {
        setLoading(
          true,
        );

        const params =
          new URLSearchParams(
            {
              service:
                serviceSlug,

              date:
                selectedDate,
            },
          );

        const response =
          await fetch(
            `/api/availability?${params.toString()}`,
            {
              signal:
                controller.signal,
            },
          );

        if (
          !response.ok
        ) {
          throw new Error(
            "No fue posible consultar la disponibilidad.",
          );
        }

        const data =
          await response.json();

        setSlots(
          data.slots ??
            [],
        );
      } catch (
        loadError
      ) {
        if (
          loadError instanceof
            Error &&
          loadError.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          loadError,
        );

        setError(
          "No fue posible consultar la disponibilidad.",
        );
      } finally {
        setLoading(
          false,
        );
      }
    }

    loadAvailability();

    return () =>
      controller.abort();
  }, [
    selectedDate,
    serviceSlug,
  ]);

  /* =======================================================
     CREAR SESIÓN
  ======================================================= */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");

    if (
      !selectedDate ||
      !selectedSlot
    ) {
      setError(
        "Selecciona una fecha y un horario.",
      );

      return;
    }

    try {
      setSubmitting(
        true,
      );

      const response =
        await fetch(
          `/api/processes/${encodeURIComponent(
            token,
          )}/sessions`,
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

      let data:
        | {
            error?: string;
            success?: boolean;
            sessionNumber?: number;
          }
        | undefined;

      try {
        data =
          await response.json();
      } catch {
        data =
          undefined;
      }

      if (
        !response.ok
      ) {
        throw new Error(
          data?.error ??
            "No fue posible agendar la sesión.",
        );
      }

      /*
        Regresamos al portal.

        Como la página es dinámica,
        mostrará inmediatamente
        la nueva sesión.
      */

      router.push(
        `/proceso/${token}`,
      );

      router.refresh();
    } catch (
      submitError
    ) {
      console.error(
        submitError,
      );

      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "No fue posible agendar la sesión.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="
        rounded-[1.75rem]
        border
        border-brand-taupe/25
        bg-white/65
        p-6
        sm:p-8
      "
    >
      {/* ===============================================
          RESUMEN
      ================================================ */}

      <div
        className="
          border-b
          border-brand-taupe/20
          pb-7
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
          Sesión{" "}
          {
            sessionNumber
          }
        </p>

        <h2
          className="
            mt-3
            font-display
            text-3xl
            font-semibold
            text-brand-brown
            sm:text-4xl
          "
        >
          {
            serviceName
          }
        </h2>

        {durationMinutes && (
          <p
            className="
              mt-2
              text-sm
              text-brand-brown/55
            "
          >
            {
              durationMinutes
            }{" "}
            minutos
          </p>
        )}
      </div>

      {/* ===============================================
          FECHA
      ================================================ */}

      <div
        className="
          pt-7
        "
      >
        <label
          htmlFor="process-date"
          className="
            text-sm
            font-semibold
            text-brand-brown
          "
        >
          Selecciona una
          fecha
        </label>

        <input
          id="process-date"
          type="date"
          min={today}
          value={
            selectedDate
          }
          onChange={(
            event,
          ) =>
            setSelectedDate(
              event.target
                .value,
            )
          }
          className="
            mt-3
            w-full
            rounded-xl
            border
            border-brand-taupe/35
            bg-brand-cream/40
            px-4
            py-3
            text-sm
            text-brand-brown
            outline-none
            transition
            focus:border-brand-wine
          "
        />

        {selectedDate && (
          <p
            className="
              mt-3
              text-sm
              capitalize
              text-brand-brown/55
            "
          >
            {formatSelectedDate(
              selectedDate,
            )}
          </p>
        )}
      </div>

      {/* ===============================================
          HORARIOS
      ================================================ */}

      {selectedDate && (
        <div
          className="
            mt-8
          "
        >
          <p
            className="
              text-sm
              font-semibold
              text-brand-brown
            "
          >
            Horarios
            disponibles
          </p>

          {loading ? (
            <p
              className="
                mt-4
                text-sm
                text-brand-brown/50
              "
            >
              Consultando
              horarios...
            </p>
          ) : slots.length >
            0 ? (
            <div
              className="
                mt-4
                grid
                grid-cols-2
                gap-3
                sm:grid-cols-3
              "
            >
              {slots.map(
                (
                  slot,
                ) => {
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
                      onClick={() =>
                        setSelectedSlot(
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
                        transition

                        ${
                          selected
                            ? "border-brand-wine bg-brand-wine text-brand-cream"
                            : "border-brand-taupe/30 bg-white text-brand-brown hover:border-brand-wine/50"
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
          ) : (
            <p
              className="
                mt-4
                text-sm
                leading-6
                text-brand-brown/50
              "
            >
              No hay horarios
              disponibles para
              esta fecha.
            </p>
          )}
        </div>
      )}

      {/* ===============================================
          ERROR
      ================================================ */}

      {error && (
        <div
          className="
            mt-7
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
          {error}
        </div>
      )}

      {/* ===============================================
          CONFIRMAR
      ================================================ */}

      <button
        type="submit"
        disabled={
          !selectedSlot ||
          submitting
        }
        className="
          mt-8
          inline-flex
          w-full
          items-center
          justify-center
          rounded-xl
          bg-brand-wine
          px-6
          py-4
          text-sm
          font-semibold
          text-brand-cream
          transition
          hover:opacity-90
          disabled:cursor-not-allowed
          disabled:opacity-40
        "
      >
        {submitting
          ? "Agendando..."
          : `Confirmar sesión ${sessionNumber}`}
      </button>

      <p
        className="
          mt-4
          text-center
          text-xs
          leading-5
          text-brand-brown/45
        "
      >
        Al confirmar se
        generará tu evento
        de Google Calendar y
        enlace de Google
        Meet.
      </p>
    </form>
  );
}