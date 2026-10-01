export default function AboutHero() {
  return (
    <section className="bg-neutral-50">
      <div className="mx-auto grid max-w-7xl gap-14 px-6 py-24 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Sobre mí
          </p>

          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-neutral-950 md:text-6xl">
            Un acompañamiento centrado en tu proceso
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-neutral-600">
            Cada persona vive retos, decisiones y procesos diferentes. Mi
            objetivo es ofrecer un espacio de acompañamiento donde puedas
            detenerte, observar tu situación con claridad y construir acciones
            alineadas con aquello que quieres alcanzar.
          </p>

          <p className="mt-5 max-w-xl leading-8 text-neutral-600">
            El proceso se adapta a tus objetivos y a tu momento personal,
            buscando siempre convertir la reflexión en acciones concretas.
          </p>
        </div>

        <div
          className="flex min-h-[560px] items-center justify-center rounded-3xl bg-neutral-200"
          aria-label="Espacio reservado para fotografía de la coach"
        >
          <p className="text-sm text-neutral-500">
            Fotografía de la coach
          </p>
        </div>
      </div>
    </section>
  );
}