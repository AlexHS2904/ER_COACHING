import Link from "next/link";

export default function Hero() {
  return (
    <section className="bg-neutral-50">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <div>
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Coaching personalizado
          </p>

          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-neutral-950 md:text-6xl lg:text-7xl">
            Construye claridad.
            <br />
            Avanza con propósito.
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-neutral-600">
            Un espacio de acompañamiento diseñado para ayudarte a identificar
            tus objetivos, trabajar en tus retos y convertir tus intenciones
            en acciones concretas.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/servicios"
              className="rounded-full bg-neutral-950 px-7 py-3.5 text-center text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              Conocer servicios
            </Link>

            <Link
              href="/sobre-mi"
              className="rounded-full border border-neutral-300 px-7 py-3.5 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Conoce a tu coach
            </Link>
          </div>
        </div>

        <div className="flex min-h-[500px] items-center justify-center rounded-3xl bg-neutral-200">
          <p className="text-sm text-neutral-500">
            Fotografía de la coach
          </p>
        </div>
      </div>
    </section>
  );
}