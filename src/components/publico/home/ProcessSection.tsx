const steps = [
  {
    number: "01",
    title: "Elige tu servicio",
    description:
      "Conoce las opciones disponibles y selecciona el tipo de acompañamiento que mejor se adapte a ti.",
  },
  {
    number: "02",
    title: "Reserva tu sesión",
    description:
      "Consulta los horarios disponibles y agenda directamente desde la plataforma.",
  },
  {
    number: "03",
    title: "Comienza tu proceso",
    description:
      "Recibe la información de tu sesión y comienza a trabajar en tus objetivos.",
  },
];

export default function ProcessSection() {
  return (
    <section className="bg-neutral-950 py-24 text-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-400">
            Cómo funciona
          </p>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Comenzar es sencillo
          </h2>
        </div>

        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.number}>
              <span className="text-sm text-neutral-500">
                {step.number}
              </span>

              <h3 className="mt-4 text-xl font-semibold">
                {step.title}
              </h3>

              <p className="mt-4 leading-7 text-neutral-400">
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}