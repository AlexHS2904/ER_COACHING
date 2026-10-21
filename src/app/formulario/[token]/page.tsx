import {
  notFound,
} from "next/navigation";

import {
  getIntakeByToken,
} from "@/lib/intake/get-intake-by-token";

import IntakeFormWizard from "@/components/intake/IntakeFormWizard";

export const dynamic =
  "force-dynamic";

export const metadata = {
  title:
    "Formulario previo | Edna Rojo Coaching",

  robots: {
    index:
      false,
    follow:
      false,
  },

  referrer:
    "no-referrer",
};

type Props = {
  params: Promise<{
    token: string;
  }>;
};

export default async function IntakePage({
  params,
}: Props) {
  const {
    token,
  } = await params;

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

  if (
    booking
      .payment_status !==
    "paid"
  ) {
    return (
      <main
        className="
          flex
          min-h-screen
          items-center
          justify-center
          bg-brand-cream
          px-6
        "
      >
        <div
          className="
            max-w-[600px]
            text-center
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.25em]
              text-brand-wine
            "
          >
            Formulario previo
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
            Aún no está
            disponible.
          </h1>

          <p
            className="
              mt-5
              leading-7
              text-brand-brown/55
            "
          >
            El formulario se
            habilitará una vez
            que tu pago haya
            sido confirmado.
          </p>
        </div>
      </main>
    );
  }

  if (
    form.submitted_at
  ) {
    return (
      <main
        className="
          flex
          min-h-screen
          items-center
          justify-center
          bg-brand-cream
          px-6
        "
      >
        <div
          className="
            max-w-[600px]
            text-center
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.25em]
              text-brand-green
            "
          >
            Completado
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
            Tu formulario ya
            fue enviado.
          </h1>

          <p
            className="
              mt-5
              leading-7
              text-brand-brown/55
            "
          >
            Gracias por
            compartir tus
            respuestas. Edna
            podrá revisarlas
            antes de tu sesión.
          </p>
        </div>
      </main>
    );
  }

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
          booking
            .customer_name
        }
        customerEmail={
          booking
            .customer_email
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