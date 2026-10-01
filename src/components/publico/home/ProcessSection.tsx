import ScrollReveal from "@/components/ui/ScrollReveal";
import FabricDecor from "@/components/ui/FabricDecor";

const steps = [
  {
    number: "01",
    title: "Reserva tu sesión",
    description:
      "Elige el servicio que mejor se adapte a lo que necesitas y agenda un espacio en el horario disponible.",
    circle: "bg-brand-wine text-brand-cream",
    accent: "text-brand-wine",
  },
  {
    number: "02",
    title: "Conversamos sobre ti",
    description:
      "Partimos de dónde estás, qué quieres trabajar y qué necesitas comprender con mayor claridad.",
    circle: "bg-brand-green text-brand-cream",
    accent: "text-brand-green",
  },
  {
    number: "03",
    title: "Avanzamos con claridad",
    description:
      "Definimos objetivos, exploramos posibilidades y construimos pasos concretos que puedas llevar a tu vida.",
    circle: "bg-brand-taupe text-brand-brown",
    accent: "text-brand-brown",
  },
];

export default function ProcessSection() {
  return (
    <section className="fabric-background relative overflow-hidden py-20 sm:py-24 lg:py-28">
      {/* =====================================================
          DECORACIÓN DE FONDO
      ====================================================== */}

      <FabricDecor/>

      {/* círculos muy sutiles adicionales */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          -left-40 bottom-[8%]
          h-[340px] w-[340px]
          rounded-full
          border border-brand-taupe/20
        "
      />

      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          right-[12%] top-[18%]
          h-40 w-40
          rounded-full
          bg-brand-wine/4
          blur-3xl
        "
      />

      {/* =====================================================
          CONTENIDO
      ====================================================== */}

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        {/* =====================================================
            CABECERA
        ====================================================== */}

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-20">
          {/* izquierda */}

          <ScrollReveal direction="left">
            <div>
              <div className="mb-5 flex items-center gap-4">
                <span className="h-0.5 w-12 bg-brand-wine" />

                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-black sm:text-sm">
                  Cómo funciona
                </p>
              </div>

              <h2 className="max-w-[650px] font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] text-brand-brown sm:text-6xl lg:text-[4.5rem]">
                Un proceso simple,{" "}
                <span className="font-accent italic text-brand-wine">
                  pensado para ti.
                </span>
              </h2>
            </div>
          </ScrollReveal>

          {/* derecha */}

          <ScrollReveal direction="right">
            <div className="lg:max-w-[650px]">
              <p className="text-base leading-8 text-brand-black/75 sm:text-lg">
                No necesitas tener todo claro antes de comenzar. El proceso se
                construye a partir de tu realidad, tus objetivos y tu propio
                ritmo.
              </p>

              <div className="mt-5 flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-green" />

                <p className="text-sm font-medium text-brand-brown/65">
                  Claridad · Reflexión · Acción
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* =====================================================
            DESKTOP — TIMELINE HORIZONTAL
        ====================================================== */}

        <div className="relative mt-20 hidden lg:block">
          {/* línea */}
          <div
            aria-hidden="true"
            className="
              absolute
              left-[16.666%] right-[16.666%]
              top-8
              h-px
              bg-brand-taupe/45
            "
          />

          <div className="grid grid-cols-3 gap-16">
            {steps.map((step, index) => (
              <ScrollReveal
                key={step.number}
                direction="up"
                delay={index * 120}
              >
                <article className="relative">
                  {/* punto / número */}
                  <div
                    className={`
                      relative z-10
                      flex h-16 w-16
                      items-center justify-center
                      rounded-full
                      shadow-[0_10px_30px_rgba(59,42,36,0.12)]
                      ${step.circle}
                    `}
                  >
                    <span className="text-xs font-semibold tracking-[0.18em]">
                      {step.number}
                    </span>
                  </div>

                  {/* contenido */}
                  <div className="mt-8 max-w-[360px]">
                    <p
                      className={`
                        mb-3 text-[0.68rem]
                        font-semibold uppercase
                        tracking-[0.24em]
                        ${step.accent}
                      `}
                    >
                      Paso {step.number}
                    </p>

                    <h3 className="font-display text-[2.15rem] font-semibold leading-[1] text-brand-brown">
                      {step.title}
                    </h3>

                    <p className="mt-5 text-sm leading-7 text-brand-black/70 sm:text-base">
                      {step.description}
                    </p>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* =====================================================
            MOBILE / TABLET — TIMELINE VERTICAL
        ====================================================== */}

        <div className="mt-14 lg:hidden">
          <div className="relative">
            {/* línea vertical */}
            <div
              aria-hidden="true"
              className="
                absolute
                bottom-8 left-[27px] top-8
                w-px
                bg-brand-taupe/45
              "
            />

            <div className="space-y-12">
              {steps.map((step, index) => (
                <ScrollReveal
                  key={step.number}
                  direction="up"
                  delay={index * 100}
                >
                  <article className="relative flex gap-6 sm:gap-8">
                    {/* número */}
                    <div
                      className={`
                        relative z-10
                        flex h-14 w-14
                        shrink-0
                        items-center justify-center
                        rounded-full
                        shadow-[0_8px_24px_rgba(59,42,36,0.12)]
                        ${step.circle}
                      `}
                    >
                      <span className="text-[0.68rem] font-semibold tracking-[0.16em]">
                        {step.number}
                      </span>
                    </div>

                    {/* texto */}
                    <div className="pb-2 pt-1">
                      <p
                        className={`
                          mb-2 text-[0.65rem]
                          font-semibold uppercase
                          tracking-[0.22em]
                          ${step.accent}
                        `}
                      >
                        Paso {step.number}
                      </p>

                      <h3 className="font-display text-[2rem] font-semibold leading-[1] text-brand-brown sm:text-[2.2rem]">
                        {step.title}
                      </h3>

                      <p className="mt-4 max-w-xl text-sm leading-7 text-brand-black/70 sm:text-base">
                        {step.description}
                      </p>
                    </div>
                  </article>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>

        {/* =====================================================
            CIERRE SUTIL
        ====================================================== */}

        <ScrollReveal direction="up">
          <div className="mt-16 flex justify-center lg:mt-20">
            <div
              className="
                max-w-[760px]
                rounded-[1.5rem]
                border border-brand-taupe/20
                bg-white/40
                px-6 py-5
                text-center
                shadow-[0_12px_40px_rgba(59,42,36,0.05)]
                backdrop-blur-[2px]
                sm:px-9 sm:py-6
              "
            >
              <p className="font-display text-xl leading-relaxed text-brand-brown sm:text-2xl">
                Cada proceso es diferente. Lo importante es comenzar desde
                donde hoy estás.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}