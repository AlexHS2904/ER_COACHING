
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos y condiciones | Edna Rojo Coaching",
  description:
    "Condiciones generales de uso y reservación de servicios.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-20 text-brand-brown">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-brand-wine hover:underline"
        >
          ← Volver al inicio
        </Link>

        <h1 className="mt-10 font-display text-4xl sm:text-5xl">
          Términos y condiciones
        </h1>

        <p className="mt-5 text-sm opacity-70">
          Última actualización: 21 de octubre de 2026
        </p>

        <div className="mt-10 space-y-9 leading-8">
          <section>
            <h2 className="text-xl font-semibold">
              Uso del sitio web
            </h2>
            <p className="mt-3">
              Este sitio permite conocer los servicios
              de Edna Rojo Coaching, consultar
              información y solicitar reservaciones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Reservaciones
            </h2>
            <p className="mt-3">
              Las reservaciones están sujetas a la
              disponibilidad de fechas y horarios.
              Los clientes deben proporcionar información
              correcta para gestionar sus sesiones.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Sesiones virtuales
            </h2>
            <p className="mt-3">
              Las sesiones virtuales podrán realizarse
              mediante Google Meet u otras herramientas
              comunicadas previamente al cliente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Pagos y cancelaciones
            </h2>
            <p className="mt-3">
              Los precios y las condiciones de pago
              aplicables serán los informados al contratar
              cada servicio. Las políticas específicas de
              cancelación, reprogramación y reembolso
              deberán comunicarse antes de completar
              una contratación.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Naturaleza del servicio
            </h2>
            <p className="mt-3">
              Los servicios de coaching están orientados
              al acompañamiento en objetivos personales
              y profesionales. No garantizan resultados
              específicos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Privacidad
            </h2>
            <p className="mt-3">
              El tratamiento de datos personales se
              describe en nuestro{" "}
              <Link
                href="/aviso-de-privacidad"
                className="text-brand-wine underline"
              >
                aviso de privacidad
              </Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Contacto
            </h2>
            <p className="mt-3">
              Para consultas relacionadas con los
              servicios y estas condiciones, escribe a
              {" "}
              <a
                href="mailto:ednarojo_coaching@outlook.com"
                className="text-brand-wine underline"
              >
                ednarojo_coaching@outlook.com
              </a>.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
