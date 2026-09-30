import Link from "next/link";

const services = [
  {
    title: "Coaching individual",
    description:
      "Sesiones personalizadas para trabajar objetivos, decisiones y procesos de cambio.",
  },
  {
    title: "Desarrollo personal",
    description:
      "Un proceso enfocado en autoconocimiento, hábitos y crecimiento personal.",
  },
  {
    title: "Acompañamiento profesional",
    description:
      "Define metas profesionales, fortalece habilidades y estructura tus siguientes pasos.",
  },
];

export default function ServicesSection() {
  return (
    <section className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Servicios
          </p>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
            Encuentra el acompañamiento que necesitas
          </h2>

          <p className="mt-6 text-lg leading-8 text-neutral-600">
            Diferentes formatos de acompañamiento adaptados a tus objetivos y a
            la etapa en la que te encuentras.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <article
              key={service.title}
              className="rounded-3xl border border-neutral-200 bg-white p-8"
            >
              <h3 className="text-xl font-semibold text-neutral-950">
                {service.title}
              </h3>

              <p className="mt-4 leading-7 text-neutral-600">
                {service.description}
              </p>

              <Link
                href="/servicios"
                className="mt-6 inline-flex text-sm font-medium text-neutral-950 underline underline-offset-4"
              >
                Ver servicio
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}