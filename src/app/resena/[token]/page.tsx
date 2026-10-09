import Link from "next/link";

import {
  notFound,
} from "next/navigation";

import ReviewForm from "@/components/reviews/ReviewForm";

import {
  getReviewInvitationByToken,
} from "@/lib/reviews/get-review-invitation";

export const metadata = {
  title:
    "Comparte tu experiencia · ER Coaching",

  robots: {
    index:
      false,

    follow:
      false,
  },

  referrer:
    "no-referrer",
};

export const dynamic =
  "force-dynamic";

type Props = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ReviewPage({
  params,
}: Props) {
  const {
    token,
  } =
    await params;

  const access =
    await getReviewInvitationByToken(
      token,
    );

  if (!access) {
    notFound();
  }

  if (
    access.state !==
    "active"
  ) {
    const title =
      access.state ===
      "used"
        ? "Este enlace ya fue utilizado."
        : access.state ===
            "expired"
          ? "Este enlace ha expirado."
          : "Este enlace ya no está disponible.";

    const description =
      access.state ===
      "used"
        ? "Tu testimonio ya fue recibido. Muchas gracias por compartir tu experiencia."
        : "Si necesitas un nuevo enlace, puedes solicitarlo directamente con Edna.";

    return (
      <main
        className="
          flex
          min-h-screen
          items-center
          bg-brand-cream
          px-5
          py-16
          text-brand-brown
        "
      >
        <div
          className="
            mx-auto
            w-full
            max-w-[680px]
            rounded-[2rem]
            border
            border-brand-taupe/25
            bg-white/65
            p-8
            text-center
            sm:p-12
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
            ER Coaching
          </p>

          <h1
            className="
              mt-4
              font-display
              text-4xl
              font-semibold
              text-brand-brown
              sm:text-5xl
            "
          >
            {title}
          </h1>

          <p
            className="
              mx-auto
              mt-5
              max-w-[520px]
              leading-7
              text-brand-brown/55
            "
          >
            {
              description
            }
          </p>

          <Link
            href="/"
            className="
              mt-7
              inline-flex
              rounded-xl
              bg-brand-wine
              px-6
              py-3
              font-semibold
              text-white
            "
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className="
        min-h-screen
        bg-brand-cream
        px-5
        py-12
        text-brand-brown
        sm:px-8
        sm:py-16
      "
    >
      <div
        className="
          mx-auto
          max-w-[820px]
        "
      >
        <Link
          href="/"
          className="
            font-display
            text-2xl
            font-semibold
            text-brand-wine
          "
        >
          Edna Rojo
        </Link>

        <section
          className="
            pb-10
            pt-14
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
            Tu experiencia importa
          </p>

          <h1
            className="
              mt-4
              max-w-[700px]
              font-display
              text-5xl
              font-semibold
              leading-[0.96]
              text-brand-brown
              sm:text-6xl
            "
          >
            Cuéntanos cómo fue
            tu proceso.
          </h1>

          <p
            className="
              mt-5
              max-w-[620px]
              text-base
              leading-7
              text-brand-brown/55
            "
          >
            Gracias por confiar
            en ER Coaching. Puedes
            compartir tu experiencia
            y decidir si quieres
            aparecer con una foto
            o con uno de nuestros
            avatares.
          </p>
        </section>

        <ReviewForm
          token={
            token
          }
          customerName={
            access
              .invitation
              .customer_name
          }
          serviceName={
            access
              .invitation
              .service_name_snapshot
          }
        />
      </div>
    </main>
  );
}