import {
  notFound,
} from "next/navigation";

import {
  getIntakeByToken,
} from "@/lib/intake/get-intake-by-token";

import IntakeFormWizard from "@/components/intake/IntakeFormWizard";

/* =========================================================
   CONFIG
========================================================= */

export const dynamic =
  "force-dynamic";

export const metadata = {
  title:
    "Formulario previo | Edna Rojo Coaching",

  robots: {
    index: false,
    follow: false,
  },

  referrer:
    "no-referrer",
};

/* =========================================================
   TYPES
========================================================= */

type Props = {
  params: Promise<{
    token: string;
  }>;
};

/* =========================================================
   PAGE
========================================================= */

export default async function IntakePage({
  params,
}: Props) {
  const {
    token,
  } = await params;

  /* =====================================================
     BUSCAR FORMULARIO
  ===================================================== */

  const result =
    await getIntakeByToken(
      token,
    );

  if (!result) {
    notFound();
  }

  const {
    form,
    booking,
  } = result;

  /* =====================================================
     IDENTIDAD

     Nuevos formularios:
     invitee_name / invitee_email

     Compatibilidad con antiguos:
     booking.customer_name / customer_email
  ===================================================== */

  const customerName =
    form.invitee_name ??
    booking?.customer_name ??
    null;

  const customerEmail =
    form.invitee_email ??
    booking?.customer_email ??
    null;

  if (
    !customerName ||
    !customerEmail
  ) {
    notFound();
  }

  /* =====================================================
     REVOKED
  ===================================================== */

  if (
    form.status ===
    "revoked"
  ) {
    return (
      <StatusPage
        eyebrow="Acceso cerrado"
        title="Este formulario ya no está disponible."
        description="El acceso a este formulario fue desactivado."
      />
    );
  }

  /* =====================================================
     EXPIRADO
  ===================================================== */

  if (
    form.expires_at &&
    new Date(
      form.expires_at,
    ).getTime() <
      Date.now()
  ) {
    return (
      <StatusPage
        eyebrow="Enlace expirado"
        title="Este formulario ya no está disponible."
        description="El periodo para completar este formulario ha terminado."
      />
    );
  }

  /* =====================================================
     YA ENVIADO

     El mismo token sigue funcionando,
     pero ya no permite modificar respuestas.
  ===================================================== */

  if (
    form.submitted_at ||
    form.status ===
      "submitted"
  ) {
    return (
      <StatusPage
        eyebrow="Formulario completado"
        title="Gracias por compartir este espacio."
        description="Tus respuestas fueron enviadas correctamente y ya están disponibles para Edna."
        success
      />
    );
  }

  /* =====================================================
     FORMULARIO DE RESERVA

     Solamente source_type=booking requiere:
     - booking existente
     - pago confirmado
     - reserva no cancelada

     Invitaciones manuales entran directamente.
  ===================================================== */

  if (
    form.source_type ===
    "booking"
  ) {
    if (!booking) {
      return (
        <StatusPage
          eyebrow="Reserva no disponible"
          title="No pudimos encontrar la sesión asociada."
          description="Comunícate con Edna si consideras que esto es un error."
        />
      );
    }

    if (
      booking.status ===
      "cancelled"
    ) {
      return (
        <StatusPage
          eyebrow="Reserva cancelada"
          title="Esta sesión fue cancelada."
          description="El formulario asociado ya no está disponible."
        />
      );
    }

    if (
      booking
        .payment_status !==
      "paid"
    ) {
      return (
        <StatusPage
          eyebrow="Formulario previo"
          title="Aún no está disponible."
          description="El formulario se habilitará una vez que tu pago haya sido confirmado."
        />
      );
    }
  }

  /* =====================================================
     FORMULARIO
  ===================================================== */

  return (
    <main
      className="
        min-h-screen
        bg-[#f1efec]
      "
    >
      <IntakeFormWizard
        token={
          token
        }
        customerName={
          customerName
        }
        customerEmail={
          customerEmail
        }
        initialData={{
          age:
            form.age,

          occupation:
            form.occupation,

          currentSituation:
            form
              .current_situation ??
            "",

          discoverySource:
            form
              .discovery_source ??
            "",

          motivation:
            form
              .motivation ??
            "",

          currentChallenges:
            form
              .current_challenges ??
            [],

          challengeDuration:
            form
              .challenge_duration,

          desiredOutcome:
            form
              .desired_outcome ??
            "",

          desiredChange:
            form
              .desired_change ??
            "",

          blockingFactors:
            form
              .blocking_factors ??
            "",

          strengths:
            form
              .strengths ??
            "",

          mainConcern:
            form
              .main_concern ??
            "",

          previousAttempts:
            form
              .previous_attempts ??
            "",

          supportPreferences:
            form
              .support_preferences ??
            [],

          additionalNotes:
            form
              .additional_notes ??
            "",

          currentStep:
            form
              .current_step ??
            1,
        }}
      />
    </main>
  );
}

/* =========================================================
   STATUS PAGE
========================================================= */

function StatusPage({
  eyebrow,
  title,
  description,
  success = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  success?: boolean;
}) {
  return (
    <main
      className="
        flex
        min-h-screen
        items-center
        justify-center
        bg-brand-cream
        px-6
        py-16
      "
    >
      <div
        className="
          mx-auto
          max-w-[620px]
          text-center
        "
      >
        <div
          className={`
            mx-auto
            flex
            h-14
            w-14
            items-center
            justify-center
            rounded-full
            border

            ${
              success
                ? "border-brand-green/20 bg-brand-green/10 text-brand-green"
                : "border-brand-wine/15 bg-brand-wine/[0.05] text-brand-wine"
            }
          `}
        >
          {success
            ? "✓"
            : "—"}
        </div>

        <p
          className={`
            mt-7
            text-xs
            font-semibold
            uppercase
            tracking-[0.25em]

            ${
              success
                ? "text-brand-green"
                : "text-brand-wine"
            }
          `}
        >
          {eyebrow}
        </p>

        <h1
          className="
            mt-4
            font-display
            text-5xl
            font-semibold
            leading-[1]
            tracking-[-0.025em]
            text-brand-brown

            sm:text-6xl
          "
        >
          {title}
        </h1>

        <p
          className="
            mx-auto
            mt-6
            max-w-[520px]
            text-base
            leading-7
            text-brand-brown/55
          "
        >
          {description}
        </p>

        <div
          className="
            mx-auto
            mt-10
            flex
            items-center
            justify-center
            gap-2
          "
        >
          <span
            className="
              h-2
              w-2
              rounded-full
              bg-brand-wine
            "
          />

          <span
            className="
              h-2
              w-2
              rounded-full
              bg-brand-green
            "
          />

          <span
            className="
              h-2
              w-2
              rounded-full
              bg-brand-taupe
            "
          />
        </div>
      </div>
    </main>
  );
}