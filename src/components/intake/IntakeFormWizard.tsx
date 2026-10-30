"use client";

import {
  useState,
} from "react";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal/documents";

type IntakeData = {
  age:
    | number
    | null;

  occupation:
    | string
    | null;

  currentSituation:
    string;

  discoverySource:
    string;

  motivation:
    string;

  currentChallenges:
    string[];

  challengeDuration:
    | string
    | null;

  desiredOutcome:
    string;

  desiredChange:
    string;

  blockingFactors:
    string;

  strengths:
    string;

  mainConcern:
    string;

  previousAttempts:
    string;

  supportPreferences:
    string[];

  additionalNotes:
    string;

  currentStep:
    number;
};

type Props = {
  token: string;
  customerName: string;
  customerEmail: string;
  initialData: IntakeData;
};

const occupationOptions = [
  {
    value:
      "student",
    label:
      "Estudiante",
  },
  {
    value:
      "intern",
    label:
      "Practicante",
  },
  {
    value:
      "graduate",
    label:
      "Recién egresado",
  },
  {
    value:
      "employee",
    label:
      "Empleado",
  },
  {
    value:
      "job_seeker",
    label:
      "Buscando empleo",
  },
  {
    value:
      "other",
    label:
      "Otro",
  },
];

const challengeOptions = [
  {
    value:
      "professional_clarity",
    label:
      "Falta de claridad profesional",
  },
  {
    value:
      "vocational_doubts",
    label:
      "Dudas vocacionales",
  },
  {
    value:
      "fear_of_mistakes",
    label:
      "Miedo a equivocarse",
  },
  {
    value:
      "insecurity",
    label:
      "Inseguridad",
  },
  {
    value:
      "job_search",
    label:
      "Dificultad para buscar empleo",
  },
  {
    value:
      "lack_of_direction",
    label:
      "Falta de dirección",
  },
  {
    value:
      "decision_making",
    label:
      "Dificultad para tomar decisiones",
  },
  {
    value:
      "self_knowledge",
    label:
      "Deseo de autoconocimiento",
  },
  {
    value:
      "other",
    label:
      "Otro",
  },
];

const durationOptions = [
  {
    value:
      "less_than_month",
    label:
      "Menos de un mes",
  },
  {
    value:
      "one_to_six_months",
    label:
      "De uno a seis meses",
  },
  {
    value:
      "more_than_six_months",
    label:
      "Más de seis meses",
  },
  {
    value:
      "unsure",
    label:
      "No estoy segura/o",
  },
];

const supportOptions = [
  {
    value:
      "personal_reflection",
    label:
      "Reflexión personal",
  },
  {
    value:
      "practical_tools",
    label:
      "Herramientas prácticas",
  },
  {
    value:
      "decision_clarity",
    label:
      "Claridad para tomar decisiones",
  },
  {
    value:
      "action_plan",
    label:
      "Plan de acción",
  },
  {
    value:
      "limiting_beliefs",
    label:
      "Identificación de creencias limitantes",
  },
  {
    value:
      "other",
    label:
      "Otro",
  },
];

const sections = [
  {
    eyebrow:
      "01 / 05 · SOBRE TI",
    title:
      "Conozcámonos",
    subtitle:
      "Empecemos por lo esencial para preparar este espacio contigo.",
  },
  {
    eyebrow:
      "02 / 05 · EL PRESENTE",
    title:
      "Tu situación actual",
    subtitle:
      "Tómate el tiempo que necesites para poner en palabras lo que estás viviendo.",
  },
  {
    eyebrow:
      "03 / 05 · HACIA DÓNDE",
    title:
      "Lo que te gustaría lograr",
    subtitle:
      "Imagina qué haría que este encuentro fuera valioso para ti.",
  },
  {
    eyebrow:
      "04 / 05 · MIRAR HACIA ADENTRO",
    title:
      "Conócete un poco más",
    subtitle:
      "Tus propias palabras son el mejor punto de partida.",
  },
  {
    eyebrow:
      "05 / 05 · TU ESPACIO",
    title:
      "Expectativas",
    subtitle:
      "Ayúdanos a entender qué acompañamiento te resultaría más útil.",
  },
];

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange:
    (
      value: string,
    ) => void;
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-brand-taupe/30
        bg-white
        p-5
      "
    >
      <label
        className="
          text-sm
          font-medium
          text-brand-wine
        "
      >
        {label}
      </label>

      <textarea
        rows={4}
        value={
          value
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target
              .value,
          )
        }
        className="
          mt-3
          w-full
          resize-y
          rounded-lg
          border
          border-brand-taupe/35
          bg-transparent
          px-4
          py-3
          leading-7
          text-brand-brown
          outline-none
          focus:border-brand-wine
        "
      />
    </div>
  );
}

function RadioGrid({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: {
    value: string;
    label: string;
  }[];
  value:
    | string
    | null;
  onChange:
    (
      value: string,
    ) => void;
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-brand-taupe/30
        bg-white
        p-5
      "
    >
      <p
        className="
          text-sm
          font-medium
          text-brand-wine
        "
      >
        {label}
      </p>

      <div
        className="
          mt-4
          grid
          gap-2
          sm:grid-cols-2
        "
      >
        {options.map(
          (
            option,
          ) => (
            <label
              key={
                option.value
              }
              className="
                flex
                min-h-[48px]
                cursor-pointer
                items-center
                gap-3
                rounded-lg
                border
                border-brand-taupe/30
                px-4
                py-3
                text-sm
                text-brand-brown
              "
            >
              <input
                type="radio"
                checked={
                  value ===
                  option.value
                }
                onChange={() =>
                  onChange(
                    option.value,
                  )
                }
              />

              {
                option.label
              }
            </label>
          ),
        )}
      </div>
    </div>
  );
}

function CheckboxGrid({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: {
    value: string;
    label: string;
  }[];
  values:
    string[];
  onChange:
    (
      values:
        string[],
    ) => void;
}) {
  function toggle(
    value: string,
  ) {
    if (
      values.includes(
        value,
      )
    ) {
      onChange(
        values.filter(
          (
            item,
          ) =>
            item !==
            value,
        ),
      );
    } else {
      onChange([
        ...values,
        value,
      ]);
    }
  }

  return (
    <div
      className="
        rounded-xl
        border
        border-brand-taupe/30
        bg-white
        p-5
      "
    >
      <p
        className="
          text-sm
          font-medium
          text-brand-wine
        "
      >
        {label}
      </p>

      <div
        className="
          mt-4
          grid
          gap-2
          sm:grid-cols-2
        "
      >
        {options.map(
          (
            option,
          ) => (
            <label
              key={
                option.value
              }
              className="
                flex
                min-h-[48px]
                cursor-pointer
                items-center
                gap-3
                rounded-lg
                border
                border-brand-taupe/30
                px-4
                py-3
                text-sm
                text-brand-brown
              "
            >
              <input
                type="checkbox"
                checked={
                  values.includes(
                    option.value,
                  )
                }
                onChange={() =>
                  toggle(
                    option.value,
                  )
                }
              />

              {
                option.label
              }
            </label>
          ),
        )}
      </div>
    </div>
  );
}

export default function IntakeFormWizard({
  token,
  customerName,
  customerEmail,
  initialData,
}: Props) {
  const [
    started,
    setStarted,
  ] =
    useState(
      false,
    );

  const [sensitiveDataConsent, setSensitiveDataConsent] = useState(false);

  const [
    step,
    setStep,
  ] =
    useState(
      Math.min(
        5,
        Math.max(
          1,
          initialData
            .currentStep,
        ),
      ),
    );

  const [
    form,
    setForm,
  ] =
    useState(
      initialData,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    completed,
    setCompleted,
  ] =
    useState(
      false,
    );

  function update<
    K extends keyof IntakeData,
  >(
    key: K,
    value:
      IntakeData[K],
  ) {
    setForm(
      (
        current,
      ) => ({
        ...current,
        [key]:
          value,
      }),
    );
  }

  const isAdult = typeof form.age === "number" && Number.isInteger(form.age) &&
    form.age >= 18 && form.age <= 120;

  async function saveDraft(
    nextStep:
      number,
  ) {
    if (!isAdult) {
      setError("Este servicio está dirigido a personas de 18 años o más. No podemos continuar con la edad indicada.");
      return;
    }
    if (!sensitiveDataConsent) {
      setError("Acepta el tratamiento de datos sensibles antes de guardar tus respuestas.");
      return;
    }
    setSaving(
      true,
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/intake/${encodeURIComponent(
            token,
          )}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                ...form,
                sensitiveDataConsent,
                privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
                currentStep:
                  nextStep,
              }),
          },
        );

      const data =
        await response
          .json();

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            "No fue posible guardar tu progreso.",
        );
      }

      update(
        "currentStep",
        nextStep,
      );

      setStep(
        nextStep,
      );

      window.scrollTo({
        top: 0,
        behavior:
          "smooth",
      });
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof
          Error
          ? saveError.message
          : "No fue posible guardar tu progreso.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  async function submit() {
    if (!isAdult) {
      setError("Este servicio está dirigido a personas de 18 años o más. No podemos continuar con la edad indicada.");
      return;
    }
    if (!sensitiveDataConsent) {
      setError("Acepta el tratamiento de datos sensibles antes de enviar tus respuestas.");
      return;
    }
    setSaving(
      true,
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/intake/${encodeURIComponent(
            token,
          )}`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                ...form,
                sensitiveDataConsent,
                privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
              }),
          },
        );

      const data =
        await response
          .json();

      if (
        !response.ok
      ) {
        throw new Error(
          data.error ??
            "No fue posible enviar el formulario.",
        );
      }

      setCompleted(
        true,
      );

      window.scrollTo({
        top: 0,
        behavior:
          "smooth",
      });
    } catch (
      submitError
    ) {
      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "No fue posible enviar el formulario.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  if (completed) {
    return (
      <div
        className="
          mx-auto
          flex
          min-h-[75vh]
          max-w-[760px]
          flex-col
          items-center
          justify-center
          px-6
          text-center
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
          Formulario
          completado
        </p>

        <h1
          className="
            mt-5
            font-display
            text-5xl
            font-semibold
            text-brand-brown
          "
        >
          Gracias por
          compartir este
          espacio.
        </h1>

        <p
          className="
            mt-6
            max-w-[520px]
            leading-7
            text-brand-brown/55
          "
        >
          Tus respuestas
          fueron guardadas
          correctamente y
          ayudarán a preparar
          mejor tu sesión.
        </p>
      </div>
    );
  }

  if (!started || !sensitiveDataConsent || !isAdult) {
    return (
      <div
        className="
          mx-auto
          flex
          min-h-[78vh]
          max-w-[760px]
          flex-col
          justify-center
          px-6
          py-16
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
          Programa |
          Encuentra tu Norte
        </p>

        <h1
          className="
            mt-5
            font-display
            text-5xl
            font-semibold
            leading-tight
            text-brand-wine
            sm:text-6xl
          "
        >
          Formulario previo
          a sesión 1:1
        </h1>

        <div
          className="
            mt-8
            h-px
            w-14
            bg-brand-wine/40
          "
        />

        <p
          className="
            mt-8
            font-display
            text-xl
            text-brand-wine
          "
        >
          Un primer paso para
          conocerte, encontrar
          claridad y avanzar.
        </p>

        <p
          className="
            mt-5
            max-w-[620px]
            leading-7
            text-brand-brown/65
          "
        >
          Gracias por estar
          aquí. Este formulario
          nos ayudará a
          conocerte un poco
          mejor y a preparar
          una sesión pensada
          para tu momento
          actual. No hay
          respuestas correctas:
          responde con
          honestidad y a tu
          propio ritmo.
        </p>

        <p
          className="
            mt-6
            text-sm
            text-brand-wine/70
          "
        >
          Tiempo estimado:
          5–8 minutos
        </p>

        <p className="mt-6 max-w-[620px] text-sm leading-6 text-brand-brown/65">
          Tus respuestas se utilizarán para preparar tu sesión de coaching.
          Las respuestas abiertas son voluntarias: comparte solo lo necesario
          para este propósito. No necesitas incluir
          datos de salud, vida íntima, creencias religiosas, opiniones políticas
          o preferencias sexuales que no sean necesarios para tu solicitud.
          Consulta el{" "}
          <a href="/aviso-de-privacidad" target="_blank" rel="noopener noreferrer"
            className="font-medium text-brand-wine underline underline-offset-4">
            Aviso de Privacidad
          </a>.
        </p>

        <div className="mt-6 max-w-sm text-sm leading-6 text-brand-brown">
          <label htmlFor="intake-eligibility-age" className="font-medium">Edad</label>
          <input id="intake-eligibility-age" type="number" min={18} max={120} required
            inputMode="numeric" value={form.age ?? ""}
            onChange={(event) => {
              update("age", event.target.value ? Number(event.target.value) : null);
              setSensitiveDataConsent(false);
            }}
            className="mt-2 w-full rounded-lg border border-brand-taupe/30 bg-white px-4 py-3" />
          <p className="mt-2">El servicio está disponible únicamente para personas de 18 años o más.</p>
          {form.age !== null && !isAdult && <p role="alert" className="mt-2 text-brand-wine">
            No podemos continuar con la edad indicada. Si necesitas una aclaración, contacta a la coach.
          </p>}
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-taupe/30 bg-white p-5 text-sm leading-6 text-brand-brown">
          <input type="checkbox" checked={sensitiveDataConsent}
            disabled={!isAdult}
            onChange={(event) => setSensitiveDataConsent(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-brand-wine" />
          <span>
            He leído el Aviso de Privacidad y consiento expresamente el
            tratamiento de los datos personales sensibles que, en su caso,
            proporcione en este formulario para preparar mi sesión y prestar
            el acompañamiento de coaching solicitado.
          </span>
        </label>

        <button
          type="button"
          disabled={!sensitiveDataConsent || !isAdult}
          onClick={() =>
            sensitiveDataConsent && isAdult && setStarted(true)
          }
          className="
            mt-7
            w-fit
            rounded-lg
            bg-brand-wine
            px-7
            py-4
            text-sm
            font-semibold
            text-white
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >
          Comenzar
        </button>
      </div>
    );
  }

  const section =
    sections[
      step - 1
    ];

  const progress =
    `${step * 20}%`;

  return (
    <div
      className="
        mx-auto
        max-w-[820px]
        px-5
        py-10
        sm:px-8
        sm:py-14
      "
    >
      <div
        className="
          flex
          items-center
          justify-between
          gap-6
          border-b
          border-brand-taupe/40
          pb-6
        "
      >
        <p
          className="
            font-display
            text-xl
            text-brand-wine
          "
        >
          EDNA ROJO |
          COACHING
        </p>

        <p
          className="
            hidden
            text-[0.65rem]
            font-semibold
            uppercase
            tracking-[0.3em]
            text-brand-brown/40
            sm:block
          "
        >
          Sesiones 1:1 ·
          Un espacio para ti
        </p>
      </div>

      <div
        className="
          mt-8
        "
      >
        <p
          className="
            text-xs
            font-semibold
            uppercase
            tracking-[0.2em]
            text-brand-wine
          "
        >
          Sección {step} de 5
        </p>

        <div
          className="
            mt-3
            h-px
            w-full
            bg-brand-taupe/40
          "
        >
          <div
            className="
              h-px
              bg-brand-wine
              transition-all
              duration-300
            "
            style={{
              width:
                progress,
            }}
          />
        </div>
      </div>

      <div
        className="
          mt-7
        "
      >
        <p
          className="
            text-xs
            font-semibold
            uppercase
            tracking-[0.25em]
            text-brand-wine/70
          "
        >
          {
            section.eyebrow
          }
        </p>

        <h1
          className="
            mt-3
            font-display
            text-4xl
            font-semibold
            text-brand-wine
          "
        >
          {
            section.title
          }
        </h1>

        <p
          className="
            mt-3
            text-sm
            leading-6
            text-brand-brown/55
          "
        >
          {
            section.subtitle
          }
        </p>

        <p className="mt-3 text-xs leading-5 text-brand-brown/60">
          Usaremos tus respuestas para preparar tu sesión. Consulta el{" "}
          <a href="/aviso-de-privacidad" target="_blank" rel="noopener noreferrer"
            className="text-brand-wine underline underline-offset-4">
            Aviso de Privacidad
          </a>.
        </p>
      </div>

      <div
        className="
          mt-8
          space-y-3
        "
      >
        {step ===
          1 && (
          <>
            <div
              className="
                rounded-xl
                border
                border-brand-taupe/30
                bg-white
                p-5
              "
            >
              <label
                className="
                  text-sm
                  font-medium
                  text-brand-wine
                "
              >
                Nombre completo
              </label>

              <input
                readOnly
                value={
                  customerName
                }
                className="
                  mt-3
                  w-full
                  rounded-lg
                  border
                  border-brand-taupe/30
                  bg-brand-cream/40
                  px-4
                  py-3
                  text-brand-brown
                "
              />
            </div>

            <div
              className="
                rounded-xl
                border
                border-brand-taupe/30
                bg-white
                p-5
              "
            >
              <label
                className="
                  text-sm
                  font-medium
                  text-brand-wine
                "
              >
                Edad
              </label>

              <input
                type="number"
                min={18}
                max={120}
                value={
                  form.age ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  update(
                    "age",
                    event.target
                      .value
                      ? Number(
                          event
                            .target
                            .value,
                        )
                      : null,
                  )
                }
                className="
                  mt-3
                  w-full
                  rounded-lg
                  border
                  border-brand-taupe/35
                  px-4
                  py-3
                  outline-none
                  focus:border-brand-wine
                "
              />
            </div>

            <RadioGrid
              label="Ocupación actual"
              options={
                occupationOptions
              }
              value={
                form.occupation
              }
              onChange={(
                value,
              ) =>
                update(
                  "occupation",
                  value,
                )
              }
            />

            <TextArea
              label="Situación actual"
              value={
                form.currentSituation
              }
              onChange={(
                value,
              ) =>
                update(
                  "currentSituation",
                  value,
                )
              }
            />

            <div
              className="
                rounded-xl
                border
                border-brand-taupe/30
                bg-white
                p-5
              "
            >
              <label
                className="
                  text-sm
                  font-medium
                  text-brand-wine
                "
              >
                Correo
                electrónico
              </label>

              <input
                readOnly
                value={
                  customerEmail
                }
                className="
                  mt-3
                  w-full
                  rounded-lg
                  border
                  border-brand-taupe/30
                  bg-brand-cream/40
                  px-4
                  py-3
                  text-brand-brown
                "
              />
            </div>

            <div
              className="
                rounded-xl
                border
                border-brand-taupe/30
                bg-white
                p-5
              "
            >
              <label
                className="
                  text-sm
                  font-medium
                  text-brand-wine
                "
              >
                ¿Cómo conociste
                Encuentra tu
                Norte?
              </label>

              <input
                value={
                  form.discoverySource
                }
                onChange={(
                  event,
                ) =>
                  update(
                    "discoverySource",
                    event.target
                      .value,
                  )
                }
                className="
                  mt-3
                  w-full
                  rounded-lg
                  border
                  border-brand-taupe/35
                  px-4
                  py-3
                  outline-none
                  focus:border-brand-wine
                "
              />
            </div>
          </>
        )}

        {step ===
          2 && (
          <>
            <TextArea
              label="¿Qué te motivó a buscar una sesión 1:1 en este momento?"
              value={
                form.motivation
              }
              onChange={(
                value,
              ) =>
                update(
                  "motivation",
                  value,
                )
              }
            />

            <CheckboxGrid
              label="¿Qué situaciones te están costando más trabajo actualmente?"
              options={
                challengeOptions
              }
              values={
                form.currentChallenges
              }
              onChange={(
                values,
              ) =>
                update(
                  "currentChallenges",
                  values,
                )
              }
            />

            <RadioGrid
              label="¿Desde hace cuánto tiempo te sientes así?"
              options={
                durationOptions
              }
              value={
                form.challengeDuration
              }
              onChange={(
                value,
              ) =>
                update(
                  "challengeDuration",
                  value,
                )
              }
            />
          </>
        )}

        {step ===
          3 && (
          <>
            <TextArea
              label="Si esta sesión fuera muy útil para ti, ¿con qué te gustaría salir?"
              value={
                form.desiredOutcome
              }
              onChange={(
                value,
              ) =>
                update(
                  "desiredOutcome",
                  value,
                )
              }
            />

            <TextArea
              label="¿Qué te gustaría que fuera diferente después de trabajar en este tema?"
              value={
                form.desiredChange
              }
              onChange={(
                value,
              ) =>
                update(
                  "desiredChange",
                  value,
                )
              }
            />

            <TextArea
              label="¿Qué sientes que te ha impedido avanzar hasta ahora?"
              value={
                form.blockingFactors
              }
              onChange={(
                value,
              ) =>
                update(
                  "blockingFactors",
                  value,
                )
              }
            />
          </>
        )}

        {step ===
          4 && (
          <>
            <TextArea
              label="¿Cuáles consideras que son tus principales fortalezas?"
              value={
                form.strengths
              }
              onChange={(
                value,
              ) =>
                update(
                  "strengths",
                  value,
                )
              }
            />

            <TextArea
              label="¿Qué es lo que más te preocupa de tu situación actual?"
              value={
                form.mainConcern
              }
              onChange={(
                value,
              ) =>
                update(
                  "mainConcern",
                  value,
                )
              }
            />

            <TextArea
              label="¿Qué has intentado hacer hasta ahora para resolverlo?"
              value={
                form.previousAttempts
              }
              onChange={(
                value,
              ) =>
                update(
                  "previousAttempts",
                  value,
                )
              }
            />
          </>
        )}

        {step ===
          5 && (
          <>
            <CheckboxGrid
              label="¿Qué tipo de apoyo te gustaría recibir?"
              options={
                supportOptions
              }
              values={
                form.supportPreferences
              }
              onChange={(
                values,
              ) =>
                update(
                  "supportPreferences",
                  values,
                )
              }
            />

            <TextArea
              label="¿Hay algo más que consideres importante que la coach sepa antes de la sesión?"
              value={
                form.additionalNotes
              }
              onChange={(
                value,
              ) =>
                update(
                  "additionalNotes",
                  value,
                )
              }
            />

            <p
              className="
                px-1
                text-sm
                leading-6
                text-brand-brown/50
              "
            >
              Comparte solo
              lo que te resulte
              cómodo. Esta
              información se
              utilizará para
              preparar mejor
              tu sesión.
            </p>
          </>
        )}
      </div>

      {error && (
        <div
          className="
            mt-6
            rounded-xl
            border
            border-brand-wine/20
            bg-brand-wine/5
            px-4
            py-3
            text-sm
            text-brand-wine
          "
        >
          {error}
        </div>
      )}

      <div
        className="
          mt-8
          flex
          items-center
          justify-between
          gap-4
        "
      >
        {step >
          1 ? (
          <button
            type="button"
            disabled={
              saving
            }
            onClick={() =>
              saveDraft(
                step - 1,
              )
            }
            className="
              rounded-lg
              bg-brand-green
              px-6
              py-3.5
              text-sm
              font-semibold
              text-white
              disabled:opacity-50
            "
          >
            Atrás
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          disabled={
            saving
          }
          onClick={() =>
            step <
            5
              ? saveDraft(
                  step +
                    1,
                )
              : submit()
          }
          className="
            rounded-lg
            bg-brand-wine
            px-7
            py-3.5
            text-sm
            font-semibold
            text-white
            disabled:opacity-50
          "
        >
          {saving
            ? "Guardando..."
            : step ===
                5
              ? "Enviar formulario"
              : "Continuar"}
        </button>
      </div>
    </div>
  );
}
