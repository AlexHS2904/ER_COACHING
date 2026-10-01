import ScrollReveal from "@/components/ui/ScrollReveal";

const steps = [
  {
    number: "01",
    title: "Escuchar",
    description:
      "Comprender tu situación actual, lo que estás viviendo y aquello que hoy necesita tu atención.",
  },
  {
    number: "02",
    title: "Comprender",
    description:
      "Identificar patrones, prioridades, recursos y posibilidades que pueden ayudarte a avanzar.",
  },
  {
    number: "03",
    title: "Definir",
    description:
      "Dar claridad a tus objetivos y convertirlos en una dirección concreta y realista.",
  },
  {
    number: "04",
    title: "Actuar",
    description:
      "Traducir la reflexión en decisiones y acciones que puedas sostener en tu día a día.",
  },
];

export default function ApproachSection() {
  return (
    <section className="relative overflow-hidden bg-brand-cream pt-20 pb-2 sm:pt-24 sm:pb-14 lg:pt-28 lg:pb-0">
      {/* Decoración */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 -top-28 h-44 w-80 rounded-full bg-brand-taupe/30"
      />

      

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        {/* CABECERA */}
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-24">
          <ScrollReveal direction="left">
            <div>
              <div className="mb-5 flex items-center gap-4">
                <span className="h-0.5 w-12 bg-brand-wine" />

                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-black sm:text-sm">
                  Mi enfoque
                </p>
              </div>

              <h2 className="font-display text-5xl font-semibold leading-[0.95] text-brand-brown sm:text-6xl lg:text-[4.4rem]">
                Un proceso pensado para{" "}
                <span className="font-accent italic text-brand-wine">
                  ti.
                </span>
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right">
            <p className="max-w-[650px] text-base leading-8 text-brand-black/75 sm:text-lg">
              El acompañamiento se adapta a tu momento y a tus objetivos. La
              intención es crear un proceso estructurado, pero suficientemente
              flexible para permitirte explorar, cuestionar y avanzar a tu
              propio ritmo.
            </p>
          </ScrollReveal>
        </div>

        {/* PASOS */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {steps.map((step, index) => (
            <ScrollReveal
              key={step.number}
              direction="up"
              delay={index * 90}
              className="h-full"
            >
              <article className="group h-full rounded-2xl border border-brand-taupe/25 bg-brand-cream/80 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_35px_rgba(59,42,36,0.10)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-[0.2em] text-brand-wine">
                    {step.number}
                  </span>

                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full bg-brand-green"
                  />
                </div>

                <h3 className="mt-8 font-display text-3xl font-semibold text-brand-brown">
                  {step.title}
                </h3>

                <p className="mt-3 text-sm leading-6 text-brand-black/70">
                  {step.description}
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}