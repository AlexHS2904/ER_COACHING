"use client";

import {
  useMemo,
  useState,
} from "react";

type BookingSettings = {
  timezone: string;
  slot_interval_minutes: number;
  minimum_notice_hours: number;
  max_advance_days: number;
};

type AvailabilityRule = {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
};

type AvailabilityException = {
  id: string;
  exception_date: string;
  is_available: boolean;

  start_time:
    | string
    | null;

  end_time:
    | string
    | null;

  reason:
    | string
    | null;
};

type AvailabilitySettingsProps = {
  initialSettings:
    BookingSettings;

  initialRules:
    AvailabilityRule[];

  initialExceptions:
    AvailabilityException[];
};

const DAYS = [
  {
    id: 1,
    label: "Lunes",
  },
  {
    id: 2,
    label: "Martes",
  },
  {
    id: 3,
    label: "Miércoles",
  },
  {
    id: 4,
    label: "Jueves",
  },
  {
    id: 5,
    label: "Viernes",
  },
  {
    id: 6,
    label: "Sábado",
  },
  {
    id: 0,
    label: "Domingo",
  },
];

function normalizeTime(
  value: string,
) {
  return value.slice(
    0,
    5,
  );
}

function getTodayKey() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Mexico_City",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      },
    ).formatToParts(
      new Date(),
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

function formatDate(
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
      Date.UTC(
        year,
        month - 1,
        day,
        12,
      ),
    );

  const formatted =
    new Intl.DateTimeFormat(
      "es-MX",
      {
        timeZone:
          "UTC",

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

  return (
    formatted
      .charAt(0)
      .toUpperCase() +
    formatted.slice(1)
  );
}

function formatHour(
  value:
    | string
    | null,
) {
  if (!value) {
    return "";
  }

  const [
    hours,
    minutes,
  ] =
    normalizeTime(
      value,
    )
      .split(":")
      .map(Number);

  const date =
    new Date();

  date.setHours(
    hours,
    minutes,
    0,
    0,
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

export default function AvailabilitySettings({
  initialSettings,
  initialRules,
  initialExceptions,
}: AvailabilitySettingsProps) {
  const [
    minimumNoticeHours,
    setMinimumNoticeHours,
  ] =
    useState(
      initialSettings
        .minimum_notice_hours,
    );

  const [
    maxAdvanceDays,
    setMaxAdvanceDays,
  ] =
    useState(
      initialSettings
        .max_advance_days,
    );

  const [
    slotIntervalMinutes,
    setSlotIntervalMinutes,
  ] =
    useState(
      initialSettings
        .slot_interval_minutes,
    );

  const [
    rules,
    setRules,
  ] =
    useState<
      AvailabilityRule[]
    >(
      initialRules.map(
        (rule) => ({
          ...rule,

          start_time:
            normalizeTime(
              rule.start_time,
            ),

          end_time:
            normalizeTime(
              rule.end_time,
            ),
        }),
      ),
    );

  const [
    exceptions,
    setExceptions,
  ] =
    useState<
      AvailabilityException[]
    >(
      initialExceptions,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    saveError,
    setSaveError,
  ] =
    useState("");

  const [
    saveSuccess,
    setSaveSuccess,
  ] =
    useState(false);

  /* =========================================================
     EXCEPCIONES
  ========================================================= */

  const [
    exceptionType,
    setExceptionType,
  ] =
    useState(
      "blocked_day",
    );

  const [
    exceptionDate,
    setExceptionDate,
  ] =
    useState("");

  const [
    exceptionStart,
    setExceptionStart,
  ] =
    useState(
      "18:00",
    );

  const [
    exceptionEnd,
    setExceptionEnd,
  ] =
    useState(
      "19:30",
    );

  const [
    exceptionReason,
    setExceptionReason,
  ] =
    useState("");

  const [
    addingException,
    setAddingException,
  ] =
    useState(false);

  const [
    exceptionError,
    setExceptionError,
  ] =
    useState("");

  const today =
    useMemo(
      () =>
        getTodayKey(),
      [],
    );

  /* =========================================================
     HORARIOS POR DÍA
  ========================================================= */

  function getRulesForDay(
    day: number,
  ) {
    return rules
      .filter(
        (rule) =>
          rule.day_of_week ===
          day,
      )
      .sort(
        (a, b) =>
          a.start_time.localeCompare(
            b.start_time,
          ),
      );
  }

  function isDayActive(
    day: number,
  ) {
    return getRulesForDay(
      day,
    ).some(
      (rule) =>
        rule.active,
    );
  }

  function toggleDay(
    day: number,
  ) {
    const dayRules =
      getRulesForDay(
        day,
      );

    if (
      dayRules.length === 0
    ) {
      setRules(
        (
          current,
        ) => [
          ...current,
          {
            day_of_week:
              day,

            start_time:
              "18:00",

            end_time:
              "19:30",

            active:
              true,
          },
        ],
      );

      return;
    }

    const shouldActivate =
      !dayRules.some(
        (rule) =>
          rule.active,
      );

    setRules(
      (current) =>
        current.map(
          (rule) =>
            rule.day_of_week ===
            day
              ? {
                  ...rule,
                  active:
                    shouldActivate,
                }
              : rule,
        ),
    );
  }

  function addRule(
    day: number,
  ) {
    setRules(
      (
        current,
      ) => [
        ...current,
        {
          day_of_week:
            day,

          start_time:
            "18:00",

          end_time:
            "19:30",

          active:
            true,
        },
      ],
    );
  }

  function updateRule(
    target:
      AvailabilityRule,

    field:
      | "start_time"
      | "end_time",

    value:
      string,
  ) {
    setRules(
      (current) =>
        current.map(
          (rule) =>
            rule === target
              ? {
                  ...rule,

                  [field]:
                    value,
                }
              : rule,
        ),
    );
  }

  function removeRule(
    target:
      AvailabilityRule,
  ) {
    setRules(
      (current) =>
        current.filter(
          (rule) =>
            rule !== target,
        ),
    );
  }

  /* =========================================================
     GUARDAR
  ========================================================= */

  async function saveConfiguration() {
    setSaving(true);

    setSaveError("");

    setSaveSuccess(
      false,
    );

    try {
      const response =
        await fetch(
          "/api/admin/availability",
          {
            method:
              "PUT",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                minimumNoticeHours,
                maxAdvanceDays,
                slotIntervalMinutes,

                rules:
                  rules.map(
                    (rule) => ({
                      day_of_week:
                        rule.day_of_week,

                      start_time:
                        rule.start_time,

                      end_time:
                        rule.end_time,

                      active:
                        rule.active,
                    }),
                  ),
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
            "No fue posible guardar la configuración.",
        );
      }

      setSaveSuccess(
        true,
      );
    } catch (error) {
      setSaveError(
        error instanceof
          Error
          ? error.message
          : "No fue posible guardar la configuración.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  /* =========================================================
     CREAR EXCEPCIÓN
  ========================================================= */

  async function addException() {
    if (
      !exceptionDate
    ) {
      setExceptionError(
        "Selecciona una fecha.",
      );

      return;
    }

    setAddingException(
      true,
    );

    setExceptionError(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/admin/availability",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                type:
                  exceptionType,

                date:
                  exceptionDate,

                startTime:
                  exceptionStart,

                endTime:
                  exceptionEnd,

                reason:
                  exceptionReason,
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
            "No fue posible guardar la excepción.",
        );
      }

      setExceptions(
        (current) =>
          [
            ...current,
            data.exception,
          ].sort(
            (
              a,
              b,
            ) =>
              a.exception_date.localeCompare(
                b.exception_date,
              ),
          ),
      );

      setExceptionDate(
        "",
      );

      setExceptionReason(
        "",
      );
    } catch (error) {
      setExceptionError(
        error instanceof
          Error
          ? error.message
          : "No fue posible guardar la excepción.",
      );
    } finally {
      setAddingException(
        false,
      );
    }
  }

  /* =========================================================
     ELIMINAR EXCEPCIÓN
  ========================================================= */

  async function removeException(
    id: string,
  ) {
    try {
      const response =
        await fetch(
          "/api/admin/availability",
          {
            method:
              "DELETE",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                id,
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
            "No fue posible eliminar la excepción.",
        );
      }

      setExceptions(
        (current) =>
          current.filter(
            (
              exception,
            ) =>
              exception.id !==
              id,
          ),
      );
    } catch (error) {
      setExceptionError(
        error instanceof
          Error
          ? error.message
          : "No fue posible eliminar la excepción.",
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* ==================================================
          AJUSTES GENERALES
      ================================================== */}

      <section
        className="
          rounded-[1.75rem]
          border
          border-brand-taupe/20
          bg-white/65
          p-6
          sm:p-8
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
          Agenda
        </p>

        <h2
          className="
            mt-3
            font-display
            text-3xl
            font-semibold
            text-brand-brown
          "
        >
          Reglas de reservación
        </h2>

        <p
          className="
            mt-3
            max-w-2xl
            text-sm
            leading-6
            text-brand-brown/50
          "
        >
          Define con cuánta
          anticipación puede reservar
          un cliente y hasta qué fecha
          estará disponible la agenda.
        </p>

        <div
          className="
            mt-7
            grid
            gap-5
            md:grid-cols-3
          "
        >
          <SettingInput
            label="Anticipación mínima"
            value={
              minimumNoticeHours
            }
            suffix="horas"
            min={0}
            max={720}
            onChange={
              setMinimumNoticeHours
            }
          />

          <SettingInput
            label="Reservar hasta"
            value={
              maxAdvanceDays
            }
            suffix="días"
            min={1}
            max={365}
            onChange={
              setMaxAdvanceDays
            }
          />

          <SettingInput
            label="Intervalo de horarios"
            value={
              slotIntervalMinutes
            }
            suffix="min"
            min={5}
            max={240}
            onChange={
              setSlotIntervalMinutes
            }
          />
        </div>

        <div
          className="
            mt-5
            rounded-2xl
            bg-brand-cream/65
            p-4
          "
        >
          <p
            className="
              text-xs
              leading-5
              text-brand-brown/45
            "
          >
            Zona horaria:{" "}
            <strong className="text-brand-brown/70">
              America/Mexico_City
            </strong>
          </p>
        </div>
      </section>

      {/* ==================================================
          HORARIO SEMANAL
      ================================================== */}

      <section
        className="
          rounded-[1.75rem]
          border
          border-brand-taupe/20
          bg-white/65
          p-6
          sm:p-8
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
          Disponibilidad
        </p>

        <h2
          className="
            mt-3
            font-display
            text-3xl
            font-semibold
            text-brand-brown
          "
        >
          Horario semanal
        </h2>

        <p
          className="
            mt-3
            max-w-2xl
            text-sm
            leading-6
            text-brand-brown/50
          "
        >
          Puedes agregar uno o
          varios bloques de horario
          por día.
        </p>

        <div
          className="
            mt-8
            divide-y
            divide-brand-taupe/15
          "
        >
          {DAYS.map(
            (day) => {
              const dayRules =
                getRulesForDay(
                  day.id,
                );

              const active =
                isDayActive(
                  day.id,
                );

              return (
                <div
                  key={
                    day.id
                  }
                  className="
                    py-6
                    first:pt-0
                    last:pb-0
                  "
                >
                  <div
                    className="
                      flex
                      flex-wrap
                      items-center
                      justify-between
                      gap-4
                    "
                  >
                    <div>
                      <p
                        className="
                          font-semibold
                          text-brand-brown
                        "
                      >
                        {
                          day.label
                        }
                      </p>

                      <p
                        className="
                          mt-1
                          text-xs
                          text-brand-brown/40
                        "
                      >
                        {active
                          ? "Disponible"
                          : "No disponible"}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        toggleDay(
                          day.id,
                        )
                      }
                      className={`
                        relative
                        h-7
                        w-12
                        rounded-full
                        transition
                        ${
                          active
                            ? "bg-brand-wine"
                            : "bg-brand-brown/15"
                        }
                      `}
                      aria-label={`${
                        active
                          ? "Desactivar"
                          : "Activar"
                      } ${day.label}`}
                    >
                      <span
                        className={`
                          absolute
                          top-1
                          h-5
                          w-5
                          rounded-full
                          bg-white
                          shadow-sm
                          transition
                          ${
                            active
                              ? "left-6"
                              : "left-1"
                          }
                        `}
                      />
                    </button>
                  </div>

                  {dayRules.length >
                    0 && (
                    <div className="mt-5 space-y-3">
                      {dayRules.map(
                        (
                          rule,
                          index,
                        ) => (
                          <div
                            key={`${day.id}-${index}`}
                            className={`
                              flex
                              flex-wrap
                              items-center
                              gap-3
                              ${
                                !rule.active
                                  ? "opacity-40"
                                  : ""
                              }
                            `}
                          >
                            <input
                              type="time"
                              value={
                                rule.start_time
                              }
                              disabled={
                                !active
                              }
                              onChange={(
                                event,
                              ) =>
                                updateRule(
                                  rule,
                                  "start_time",
                                  event.target
                                    .value,
                                )
                              }
                              className="
                                min-h-[46px]
                                rounded-xl
                                border
                                border-brand-taupe/25
                                bg-white
                                px-3
                                text-sm
                                text-brand-brown
                                outline-none
                                focus:border-brand-wine/50
                              "
                            />

                            <span className="text-brand-brown/35">
                              —
                            </span>

                            <input
                              type="time"
                              value={
                                rule.end_time
                              }
                              disabled={
                                !active
                              }
                              onChange={(
                                event,
                              ) =>
                                updateRule(
                                  rule,
                                  "end_time",
                                  event.target
                                    .value,
                                )
                              }
                              className="
                                min-h-[46px]
                                rounded-xl
                                border
                                border-brand-taupe/25
                                bg-white
                                px-3
                                text-sm
                                text-brand-brown
                                outline-none
                                focus:border-brand-wine/50
                              "
                            />

                            <button
                              type="button"
                              onClick={() =>
                                removeRule(
                                  rule,
                                )
                              }
                              className="
                                flex
                                h-10
                                w-10
                                items-center
                                justify-center
                                rounded-full
                                border
                                border-[#8A3535]/15
                                text-lg
                                text-[#8A3535]
                                transition
                                hover:bg-[#F7E8E8]
                              "
                              aria-label="Eliminar horario"
                            >
                              ×
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  {active && (
                    <button
                      type="button"
                      onClick={() =>
                        addRule(
                          day.id,
                        )
                      }
                      className="
                        mt-4
                        text-sm
                        font-semibold
                        text-brand-wine
                        transition
                        hover:text-brand-brown
                      "
                    >
                      + Agregar horario
                    </button>
                  )}
                </div>
              );
            },
          )}
        </div>

        {saveError && (
          <div
            className="
              mt-6
              rounded-2xl
              bg-[#F7E8E8]
              px-4
              py-3
              text-sm
              text-[#8A3535]
            "
          >
            {saveError}
          </div>
        )}

        {saveSuccess && (
          <div
            className="
              mt-6
              rounded-2xl
              bg-[#E8F2EC]
              px-4
              py-3
              text-sm
              text-[#295C3B]
            "
          >
            Configuración guardada.
            Los nuevos horarios ya
            están disponibles en el
            sistema de reservas.
          </div>
        )}

        <div
          className="
            mt-7
            flex
            justify-end
          "
        >
          <button
            type="button"
            disabled={
              saving
            }
            onClick={
              saveConfiguration
            }
            className="
              min-h-[48px]
              rounded-full
              bg-brand-wine
              px-7
              text-sm
              font-semibold
              text-brand-cream
              transition
              hover:bg-brand-brown
              disabled:opacity-50
            "
          >
            {saving
              ? "Guardando..."
              : "Guardar cambios"}
          </button>
        </div>
      </section>

      {/* ==================================================
          EXCEPCIONES
      ================================================== */}

      <section
        className="
          rounded-[1.75rem]
          border
          border-brand-taupe/20
          bg-white/65
          p-6
          sm:p-8
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
          Excepciones
        </p>

        <h2
          className="
            mt-3
            font-display
            text-3xl
            font-semibold
            text-brand-brown
          "
        >
          Fechas especiales
        </h2>

        <p
          className="
            mt-3
            max-w-2xl
            text-sm
            leading-6
            text-brand-brown/50
          "
        >
          Bloquea días u horarios
          específicos, o agrega
          disponibilidad extraordinaria.
        </p>

        <div
          className="
            mt-7
            rounded-2xl
            border
            border-brand-taupe/15
            bg-brand-cream/45
            p-5
          "
        >
          <div
            className="
              grid
              gap-4
              md:grid-cols-2
            "
          >
            <div>
              <label className="text-sm font-semibold text-brand-brown">
                Tipo
              </label>

              <select
                value={
                  exceptionType
                }
                onChange={(
                  event,
                ) =>
                  setExceptionType(
                    event.target
                      .value,
                  )
                }
                className="
                  mt-2
                  min-h-[48px]
                  w-full
                  rounded-xl
                  border
                  border-brand-taupe/25
                  bg-white
                  px-4
                  text-sm
                  text-brand-brown
                  outline-none
                "
              >
                <option value="blocked_day">
                  Bloquear día completo
                </option>

                <option value="blocked_window">
                  Bloquear horario
                </option>

                <option value="extra_window">
                  Agregar horario extra
                </option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-brand-brown">
                Fecha
              </label>

              <input
                type="date"
                min={today}
                value={
                  exceptionDate
                }
                onChange={(
                  event,
                ) =>
                  setExceptionDate(
                    event.target
                      .value,
                  )
                }
                className="
                  mt-2
                  min-h-[48px]
                  w-full
                  rounded-xl
                  border
                  border-brand-taupe/25
                  bg-white
                  px-4
                  text-sm
                  text-brand-brown
                  outline-none
                "
              />
            </div>
          </div>

          {exceptionType !==
            "blocked_day" && (
            <div
              className="
                mt-4
                grid
                gap-4
                sm:grid-cols-2
              "
            >
              <div>
                <label className="text-sm font-semibold text-brand-brown">
                  Desde
                </label>

                <input
                  type="time"
                  value={
                    exceptionStart
                  }
                  onChange={(
                    event,
                  ) =>
                    setExceptionStart(
                      event.target
                        .value,
                    )
                  }
                  className="
                    mt-2
                    min-h-[48px]
                    w-full
                    rounded-xl
                    border
                    border-brand-taupe/25
                    bg-white
                    px-4
                    text-sm
                    text-brand-brown
                    outline-none
                  "
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-brand-brown">
                  Hasta
                </label>

                <input
                  type="time"
                  value={
                    exceptionEnd
                  }
                  onChange={(
                    event,
                  ) =>
                    setExceptionEnd(
                      event.target
                        .value,
                    )
                  }
                  className="
                    mt-2
                    min-h-[48px]
                    w-full
                    rounded-xl
                    border
                    border-brand-taupe/25
                    bg-white
                    px-4
                    text-sm
                    text-brand-brown
                    outline-none
                  "
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <label className="text-sm font-semibold text-brand-brown">
              Motivo{" "}
              <span className="font-normal text-brand-brown/35">
                (opcional)
              </span>
            </label>

            <input
              type="text"
              maxLength={200}
              value={
                exceptionReason
              }
              onChange={(
                event,
              ) =>
                setExceptionReason(
                  event.target
                    .value,
                )
              }
              placeholder="Ej. vacaciones, evento personal..."
              className="
                mt-2
                min-h-[48px]
                w-full
                rounded-xl
                border
                border-brand-taupe/25
                bg-white
                px-4
                text-sm
                text-brand-brown
                outline-none
                placeholder:text-brand-brown/30
              "
            />
          </div>

          {exceptionError && (
            <p
              className="
                mt-4
                text-sm
                text-[#8A3535]
              "
            >
              {exceptionError}
            </p>
          )}

          <div
            className="
              mt-5
              flex
              justify-end
            "
          >
            <button
              type="button"
              disabled={
                addingException
              }
              onClick={
                addException
              }
              className="
                min-h-[46px]
                rounded-full
                bg-brand-brown
                px-6
                text-sm
                font-semibold
                text-brand-cream
                transition
                hover:bg-brand-wine
                disabled:opacity-50
              "
            >
              {addingException
                ? "Guardando..."
                : "+ Agregar excepción"}
            </button>
          </div>
        </div>

        <div
          className="
            mt-7
            rounded-2xl
            bg-[#F7F0DC]
            p-4
          "
        >
          <p
            className="
              text-xs
              leading-5
              text-[#80671C]
            "
          >
            Bloquear una fecha evita
            nuevas reservas, pero no
            cancela automáticamente
            sesiones que ya estén
            confirmadas ese día.
          </p>
        </div>

        {exceptions.length >
        0 ? (
          <div className="mt-7 space-y-3">
            {exceptions.map(
              (
                exception,
              ) => {
                const fullDay =
                  !exception.is_available &&
                  !exception.start_time &&
                  !exception.end_time;

                const extra =
                  exception.is_available;

                return (
                  <div
                    key={
                      exception.id
                    }
                    className="
                      flex
                      flex-col
                      gap-4
                      rounded-2xl
                      border
                      border-brand-taupe/15
                      bg-white/60
                      p-5
                      sm:flex-row
                      sm:items-center
                      sm:justify-between
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
                        <p
                          className="
                            font-semibold
                            text-brand-brown
                          "
                        >
                          {formatDate(
                            exception.exception_date,
                          )}
                        </p>

                        <span
                          className={`
                            rounded-full
                            px-2.5
                            py-1
                            text-[10px]
                            font-semibold
                            ${
                              extra
                                ? "bg-[#E8F2EC] text-[#295C3B]"
                                : "bg-[#F7E8E8] text-[#8A3535]"
                            }
                          `}
                        >
                          {extra
                            ? "Horario extra"
                            : fullDay
                              ? "Día bloqueado"
                              : "Horario bloqueado"}
                        </span>
                      </div>

                      {!fullDay &&
                        exception.start_time &&
                        exception.end_time && (
                          <p
                            className="
                              mt-2
                              text-sm
                              text-brand-brown/55
                            "
                          >
                            {formatHour(
                              exception.start_time,
                            )}
                            {" – "}
                            {formatHour(
                              exception.end_time,
                            )}
                          </p>
                        )}

                      {exception.reason && (
                        <p
                          className="
                            mt-1
                            text-sm
                            text-brand-brown/40
                          "
                        >
                          {
                            exception.reason
                          }
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeException(
                          exception.id,
                        )
                      }
                      className="
                        shrink-0
                        rounded-full
                        border
                        border-[#8A3535]/20
                        px-4
                        py-2
                        text-xs
                        font-semibold
                        text-[#8A3535]
                        transition
                        hover:bg-[#F7E8E8]
                      "
                    >
                      Eliminar
                    </button>
                  </div>
                );
              },
            )}
          </div>
        ) : (
          <div
            className="
              mt-7
              rounded-2xl
              border
              border-dashed
              border-brand-taupe/25
              px-5
              py-10
              text-center
            "
          >
            <p
              className="
                text-sm
                text-brand-brown/45
              "
            >
              No hay excepciones
              próximas.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SettingInput({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  onChange: (
    value: number,
  ) => void;
}) {
  return (
    <div
      className="
        rounded-2xl
        bg-brand-cream/60
        p-5
      "
    >
      <label
        className="
          text-sm
          font-semibold
          text-brand-brown
        "
      >
        {label}
      </label>

      <div
        className="
          mt-3
          flex
          items-center
          gap-3
        "
      >
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(
            event,
          ) =>
            onChange(
              Number(
                event.target
                  .value,
              ),
            )
          }
          className="
            min-h-[48px]
            min-w-0
            flex-1
            rounded-xl
            border
            border-brand-taupe/25
            bg-white
            px-4
            text-sm
            font-semibold
            text-brand-brown
            outline-none
            focus:border-brand-wine/50
          "
        />

        <span
          className="
            text-sm
            text-brand-brown/45
          "
        >
          {suffix}
        </span>
      </div>
    </div>
  );
}