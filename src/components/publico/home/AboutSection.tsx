import Link from "next/link";

export default function AboutSection() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div className="min-h-[450px] rounded-3xl bg-neutral-100" />

        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Sobre mí
          </p>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
            Un acompañamiento pensado para ti
          </h2>

          <p className="mt-6 text-lg leading-8 text-neutral-600">
            Cada proceso comienza desde una realidad diferente. Mi objetivo es
            ofrecerte un espacio de escucha, reflexión y acción donde puedas
            trabajar en tus metas de forma consciente y estructurada.
          </p>

          <p className="mt-4 leading-7 text-neutral-600">
            A través de sesiones personalizadas podrás identificar áreas de
            mejora, reconocer tus recursos y construir estrategias que te
            permitan avanzar de manera sostenible.
          </p>

          <Link
            href="/sobre-mi"
            className="mt-8 inline-flex rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            Conocer más
          </Link>
        </div>
      </div>
    </section>
  );
}