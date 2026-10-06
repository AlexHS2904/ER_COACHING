import Link from "next/link";

import Footer from "@/components/publico/Footer";
import Header from "@/components/publico/Header";

type BookingConfirmationPageProps = {
  searchParams: Promise<{
    ref?: string;
  }>;
};

export default async function BookingConfirmationPage({
  searchParams,
}: BookingConfirmationPageProps) {
  const params = await searchParams;

  const bookingReference =
    typeof params.ref === "string"
      ? params.ref
      : null;

  return (
    <>
      <Header />

      <main className="min-h-[75vh] bg-brand-cream">
        <section className="px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-[720px] text-center">
            <div
              className="
                mx-auto
                flex
                h-16
                w-16
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

            <p
              className="
                mt-7
                text-xs
                font-semibold
                uppercase
                tracking-[0.28em]
                text-brand-green
              "
            >
              Reserva confirmada
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
              Tu sesión está lista.
            </h1>

            <p
              className="
                mx-auto
                mt-6
                max-w-[560px]
                text-base
                leading-7
                text-brand-brown/60
              "
            >
              Tu horario ha sido reservado
              correctamente. En unos momentos
              recibirás por correo todos los
              detalles de tu sesión y el enlace
              de Google Meet.
            </p>

            {bookingReference && (
              <div
                className="
                  mx-auto
                  mt-10
                  max-w-[500px]
                  rounded-[1.5rem]
                  border
                  border-brand-taupe/25
                  bg-white/55
                  p-7
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
                  Código de reserva
                </p>

                <p
                  className="
                    mt-3
                    font-display
                    text-3xl
                    font-semibold
                    text-brand-brown
                  "
                >
                  {bookingReference}
                </p>

                <p
                  className="
                    mt-3
                    text-sm
                    leading-6
                    text-brand-brown/45
                  "
                >
                  Guarda este código por si
                  necesitas consultar tu
                  reserva más adelante.
                </p>
              </div>
            )}

            <div
              className="
                mx-auto
                mt-8
                max-w-[560px]
                rounded-2xl
                bg-brand-taupe/10
                px-6
                py-5
              "
            >
              <p className="text-sm leading-6 text-brand-brown/60">
                Revisa también tu carpeta de
                spam o correo no deseado si no
                ves la confirmación en unos
                minutos.
              </p>
            </div>

            <Link
              href="/"
              className="
                mx-auto
                mt-10
                inline-flex
                min-h-[52px]
                items-center
                justify-center
                rounded-xl
                bg-brand-wine
                px-8
                font-semibold
                text-brand-cream
                transition-colors
                duration-200
                hover:bg-brand-brown
              "
            >
              Volver al inicio
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}