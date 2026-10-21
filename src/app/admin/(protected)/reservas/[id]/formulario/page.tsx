import { requireAdmin } from "@/lib/admin/require-admin";

import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export const dynamic =
  "force-dynamic";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

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

function Answer({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number
    | null
    | undefined;
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-brand-taupe/25
        bg-white/70
        p-5
      "
    >
      <p
        className="
          text-xs
          font-semibold
          uppercase
          tracking-[0.14em]
          text-brand-wine
        "
      >
        {label}
      </p>

      <p
        className="
          mt-3
          whitespace-pre-wrap
          leading-7
          text-brand-brown/75
        "
      >
        {value ||
          "Sin respuesta"}
      </p>
    </div>
  );
}

function MultiAnswer({
  label,
  values,
}: {
  label: string;
  values:
    string[];
}) {
  return (
    <Answer
      label={
        label
      }
      value={
        values.length
          ? values
              .map(
                (
                  value,
                ) =>
                  labels[
                    value
                  ] ??
                  value,
              )
              .join(
                ", ",
              )
          : null
      }
    />
  );
}

export default async function AdminIntakePage({
  params,
}: Props) {
  await requireAdmin();

  const {
    id,
  } = await params;

  const supabase =
    getSupabaseAdmin();

  const {
    data: booking,
  } = await supabase
    .from(
      "bookings",
    )
    .select(
      `
        id,
        booking_reference,
        customer_name,
        customer_email,
        service_name_snapshot,
        starts_at,
        payment_status
      `,
    )
    .eq(
      "id",
      id,
    )
    .maybeSingle();

  if (!booking) {
    notFound();
  }

  const {
    data: form,
  } = await supabase
    .from(
      "booking_intake_forms",
    )
    .select("*")
    .eq(
      "booking_id",
      id,
    )
    .maybeSingle();

  return (
    <main
      className="
        px-5
        py-8
        sm:px-8
        lg:px-10
      "
    >
      <div
        className="
          mx-auto
          max-w-[1000px]
        "
      >
        <Link
          href="/admin/reservas"
          className="
            text-sm
            font-semibold
            text-brand-wine
          "
        >
          ← Volver a reservas
        </Link>

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
              tracking-[0.22em]
              text-brand-wine
            "
          >
            Formulario previo
          </p>

          <h1
            className="
              mt-3
              font-display
              text-5xl
              font-semibold
              text-brand-brown
            "
          >
            {
              booking
                .customer_name
            }
          </h1>

          <p
            className="
              mt-2
              text-brand-brown/50
            "
          >
            {
              booking
                .customer_email
            }
          </p>
        </div>

        {!form ? (
          <div
            className="
              mt-10
              rounded-2xl
              border
              border-brand-taupe/25
              bg-white/60
              p-8
            "
          >
            <h2
              className="
                font-display
                text-3xl
                text-brand-brown
              "
            >
              Formulario aún
              no activado
            </h2>

            <p
              className="
                mt-3
                text-brand-brown/55
              "
            >
              Se generará cuando
              el pago de la sesión
              sea confirmado.
            </p>
          </div>
        ) : (
          <>
            <div
              className="
                mt-8
                flex
                flex-wrap
                gap-3
              "
            >
              <span
                className="
                  rounded-full
                  bg-brand-green/10
                  px-4
                  py-2
                  text-xs
                  font-semibold
                  text-brand-green
                "
              >
                Pago confirmado
              </span>

              <span
                className="
                  rounded-full
                  bg-brand-wine/10
                  px-4
                  py-2
                  text-xs
                  font-semibold
                  text-brand-wine
                "
              >
                {form.submitted_at
                  ? "Formulario completado"
                  : `En progreso · sección ${form.current_step}/5`}
              </span>
            </div>

            <section
              className="
                mt-10
              "
            >
              <h2
                className="
                  font-display
                  text-3xl
                  text-brand-wine
                "
              >
                01 · Sobre ti
              </h2>

              <div
                className="
                  mt-5
                  grid
                  gap-3
                  md:grid-cols-2
                "
              >
                <Answer
                  label="Edad"
                  value={
                    form.age
                  }
                />

                <Answer
                  label="Ocupación actual"
                  value={
                    form.occupation
                      ? labels[
                          form
                            .occupation
                        ] ??
                        form
                          .occupation
                      : null
                  }
                />

                <Answer
                  label="Situación actual"
                  value={
                    form
                      .current_situation
                  }
                />

                <Answer
                  label="¿Cómo conociste Encuentra tu Norte?"
                  value={
                    form
                      .discovery_source
                  }
                />
              </div>
            </section>

            <section
              className="
                mt-10
              "
            >
              <h2
                className="
                  font-display
                  text-3xl
                  text-brand-wine
                "
              >
                02 · Tu situación
                actual
              </h2>

              <div
                className="
                  mt-5
                  grid
                  gap-3
                "
              >
                <Answer
                  label="Motivación"
                  value={
                    form
                      .motivation
                  }
                />

                <MultiAnswer
                  label="Situaciones que cuestan más trabajo"
                  values={
                    form
                      .current_challenges ??
                    []
                  }
                />

                <Answer
                  label="Tiempo sintiéndose así"
                  value={
                    form
                      .challenge_duration
                      ? labels[
                          form
                            .challenge_duration
                        ] ??
                        form
                          .challenge_duration
                      : null
                  }
                />
              </div>
            </section>

            <section
              className="
                mt-10
              "
            >
              <h2
                className="
                  font-display
                  text-3xl
                  text-brand-wine
                "
              >
                03 · Lo que te
                gustaría lograr
              </h2>

              <div
                className="
                  mt-5
                  grid
                  gap-3
                "
              >
                <Answer
                  label="¿Con qué te gustaría salir de la sesión?"
                  value={
                    form
                      .desired_outcome
                  }
                />

                <Answer
                  label="¿Qué te gustaría que fuera diferente?"
                  value={
                    form
                      .desired_change
                  }
                />

                <Answer
                  label="¿Qué ha impedido avanzar?"
                  value={
                    form
                      .blocking_factors
                  }
                />
              </div>
            </section>

            <section
              className="
                mt-10
              "
            >
              <h2
                className="
                  font-display
                  text-3xl
                  text-brand-wine
                "
              >
                04 · Conócete un
                poco más
              </h2>

              <div
                className="
                  mt-5
                  grid
                  gap-3
                "
              >
                <Answer
                  label="Fortalezas"
                  value={
                    form
                      .strengths
                  }
                />

                <Answer
                  label="Mayor preocupación"
                  value={
                    form
                      .main_concern
                  }
                />

                <Answer
                  label="Qué ha intentado hasta ahora"
                  value={
                    form
                      .previous_attempts
                  }
                />
              </div>
            </section>

            <section
              className="
                mb-14
                mt-10
              "
            >
              <h2
                className="
                  font-display
                  text-3xl
                  text-brand-wine
                "
              >
                05 · Expectativas
              </h2>

              <div
                className="
                  mt-5
                  grid
                  gap-3
                "
              >
                <MultiAnswer
                  label="Tipo de apoyo que le gustaría recibir"
                  values={
                    form
                      .support_preferences ??
                    []
                  }
                />

                <Answer
                  label="Información adicional"
                  value={
                    form
                      .additional_notes
                  }
                />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}