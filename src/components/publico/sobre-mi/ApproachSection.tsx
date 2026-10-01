const principles = [
  {
    title: "Escucha",
    description:
      "Un espacio para expresar y comprender lo que estás viviendo sin perder de vista aquello que quieres alcanzar.",
  },
  {
    title: "Claridad",
    description:
      "Trabajamos para identificar prioridades, obstáculos y oportunidades que permitan tomar decisiones más conscientes.",
  },
  {
    title: "Acción",
    description:
      "La reflexión se transforma en objetivos y pasos concretos que puedas integrar a tu vida.",
  },
];

export default function ApproachSection() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Mi enfoque
          </p>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
            Reflexionar para avanzar
          </h2>

          <p className="mt-6 text-lg leading-8 text-neutral-600">
            El acompañamiento busca crear las condiciones para que puedas
            observar tu situación desde nuevas perspectivas, identificar tus
            propios recursos y definir acciones coherentes con tus objetivos.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {principles.map((principle) => (
            <article
              key={principle.title}
              className="rounded-3xl border border-neutral-200 p-8"
            >
              <h3 className="text-xl font-semibold text-neutral-950">
                {principle.title}
              </h3>

              <p className="mt-4 leading-7 text-neutral-600">
                {principle.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}