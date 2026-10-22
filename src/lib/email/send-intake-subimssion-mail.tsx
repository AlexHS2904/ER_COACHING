import {
  getResend,
} from "@/lib/email/resend";

import IntakeSubmissionEmail from "@/emails/IntakeSubmissionEmail";

const labels:
  Record<
    string,
    string
  > = {
    student:
      "Estudiante",

    intern:
      "Practicante",

    graduate:
      "Recién egresado",

    employee:
      "Empleado",

    job_seeker:
      "Buscando empleo",

    other:
      "Otro",

    professional_clarity:
      "Falta de claridad profesional",

    vocational_doubts:
      "Dudas vocacionales",

    fear_of_mistakes:
      "Miedo a equivocarse",

    insecurity:
      "Inseguridad",

    job_search:
      "Dificultad para buscar empleo",

    lack_of_direction:
      "Falta de dirección",

    decision_making:
      "Dificultad para tomar decisiones",

    self_knowledge:
      "Deseo de autoconocimiento",

    less_than_month:
      "Menos de un mes",

    one_to_six_months:
      "De uno a seis meses",

    more_than_six_months:
      "Más de seis meses",

    unsure:
      "No estoy segura/o",

    personal_reflection:
      "Reflexión personal",

    practical_tools:
      "Herramientas prácticas",

    decision_clarity:
      "Claridad para tomar decisiones",

    action_plan:
      "Plan de acción",

    limiting_beliefs:
      "Identificación de creencias limitantes",
  };

function text(
  value:
    | string
    | number
    | null
    | undefined,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Sin respuesta";
  }

  return String(
    value,
  );
}

function translated(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "Sin respuesta";
  }

  return (
    labels[value] ??
    value
  );
}

function translatedArray(
  values:
    | string[]
    | null
    | undefined,
) {
  if (
    !values ||
    values.length ===
      0
  ) {
    return "Sin respuesta";
  }

  return values
    .map(
      (
        value,
      ) =>
        labels[value] ??
        value,
    )
    .join(", ");
}

type Params = {
  form: Record<
    string,
    any
  >;

  bookingReference?:
    | string
    | null;
};

export async function sendIntakeSubmissionEmail({
  form,
  bookingReference,
}: Params) {
  const from =
    process.env
      .RESEND_FROM_EMAIL;

  const coachEmail =
    process.env
      .CONTACT_TO_EMAIL;

  if (
    !from ||
    !coachEmail
  ) {
    throw new Error(
      "Missing email configuration",
    );
  }

  const sourceLabel =
    form.source_type ===
    "manual"
      ? "Invitación manual"
      : bookingReference
        ? `Sesión 1:1 · ${bookingReference}`
        : "Sesión 1:1";

  const sections = [
    {
      title:
        "01 · Sobre ti",

      items: [
        {
          label:
            "Edad",
          value:
            text(
              form.age,
            ),
        },
        {
          label:
            "Ocupación actual",
          value:
            translated(
              form.occupation,
            ),
        },
        {
          label:
            "Situación actual",
          value:
            text(
              form.current_situation,
            ),
        },
        {
          label:
            "¿Cómo conociste Encuentra tu Norte?",
          value:
            text(
              form.discovery_source,
            ),
        },
      ],
    },

    {
      title:
        "02 · Tu situación actual",

      items: [
        {
          label:
            "¿Qué te motivó a buscar una sesión 1:1?",
          value:
            text(
              form.motivation,
            ),
        },
        {
          label:
            "Situaciones que están costando más trabajo",
          value:
            translatedArray(
              form.current_challenges,
            ),
        },
        {
          label:
            "¿Desde hace cuánto tiempo te sientes así?",
          value:
            translated(
              form.challenge_duration,
            ),
        },
      ],
    },

    {
      title:
        "03 · Lo que te gustaría lograr",

      items: [
        {
          label:
            "¿Con qué te gustaría salir de la sesión?",
          value:
            text(
              form.desired_outcome,
            ),
        },
        {
          label:
            "¿Qué te gustaría que fuera diferente?",
          value:
            text(
              form.desired_change,
            ),
        },
        {
          label:
            "¿Qué ha impedido avanzar?",
          value:
            text(
              form.blocking_factors,
            ),
        },
      ],
    },

    {
      title:
        "04 · Conócete un poco más",

      items: [
        {
          label:
            "Principales fortalezas",
          value:
            text(
              form.strengths,
            ),
        },
        {
          label:
            "Mayor preocupación",
          value:
            text(
              form.main_concern,
            ),
        },
        {
          label:
            "¿Qué ha intentado hacer hasta ahora?",
          value:
            text(
              form.previous_attempts,
            ),
        },
      ],
    },

    {
      title:
        "05 · Expectativas",

      items: [
        {
          label:
            "Tipo de apoyo que le gustaría recibir",
          value:
            translatedArray(
              form.support_preferences,
            ),
        },
        {
          label:
            "Información adicional",
          value:
            text(
              form.additional_notes,
            ),
        },
      ],
    },
  ];

  return getResend()
    .emails
    .send({
      from,

      to:
        coachEmail,

      /*
        Muy útil:
        Edna puede pulsar Responder
        y contestarle directamente.
      */

      replyTo:
        form
          .invitee_email,

      subject:
        `Formulario completado · ${form.invitee_name}`,

      react:
        IntakeSubmissionEmail({
          name:
            form
              .invitee_name,

          email:
            form
              .invitee_email,

          sourceLabel,

          sections,
        }),
    });
}