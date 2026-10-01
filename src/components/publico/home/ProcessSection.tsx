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
          FONDO
      ====================================================== */}

        <FabricDecor />

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
            TÍTULO
        ====================================================== */}

        <div className="text-center">
          <ScrollReveal direction="up">
            <div className="mx-auto">
              <div className="mb-5 flex items-center justify-center gap-4">
                <span className="h-0.5 w-12 bg-brand-wine" />

                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-black sm:text-sm">
                  Cómo funciona
                </p>

                <span className="h-0.5 w-12 bg-brand-wine" />
              </div>

              <h2 className="mx-auto max-w-[700px] font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] text-brand-brown sm:text-6xl lg:text-[4.5rem]">
                Un proceso simple,{" "}
                <span className="font-accent italic text-brand-wine">
                  pensado para ti.
                </span>
              </h2>
            </div>
          </ScrollReveal>
        </div>

        {/* =====================================================
            DESKTOP
        ====================================================== */}

        <div className="relative mt-20 hidden lg:block">
          {/* =========================================
              NODOS + LÍNEA
          ========================================== */}

          <div className="relative">
            {/* línea base */}
            <div
              aria-hidden="true"
              className="
                absolute
                left-[16.666%]
                right-[16.666%]
                top-8
                h-px
                bg-brand-taupe/35
              "
            />

            {/* línea que recorre el proceso */}
            <div
              aria-hidden="true"
              className="
                process-line-animated
                absolute
                left-[16.666%]
                right-[16.666%]
                top-[30px]
                h-[3px]
                rounded-full
                bg-gradient-to-r
                from-brand-wine
                via-brand-green
                to-brand-taupe
              "
            />

            {/* puntos */}
            <div className="relative grid grid-cols-3 gap-16">
              {steps.map((step, index) => (
                <ScrollReveal
                  key={step.number}
                  direction="up"
                  delay={index * 120}
                >
                  <div className="flex justify-center">
                    <div
                      className={`
                        process-node-${index + 1}
                        relative z-10
                        flex h-16 w-16
                        items-center justify-center
                        rounded-full
                        shadow-[0_10px_30px_rgba(59,42,36,0.14)]
                        ${step.circle}
                      `}
                    >
                      {/* HALO */}
                      <span
                        aria-hidden="true"
                        className="
                          pointer-events-none
                          absolute inset-[-9px]
                          z-0
                          rounded-full
                          border-2 border-current
                          opacity-30
                        "
                      />

                      {/* número */}
                      <span className="relative z-10 text-xs font-semibold tracking-[0.18em]">
                        {step.number}
                      </span>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>

          {/* =========================================
              TEXTOS
          ========================================== */}

          <div className="mt-8 grid grid-cols-3 gap-16">
            {steps.map((step, index) => (
              <ScrollReveal
                key={`content-${step.number}`}
                direction="up"
                delay={index * 120 + 80}
              >
                <article className="mx-auto w-full max-w-[360px]">
                  <p
                    className={`
                      mb-3
                      text-[0.68rem]
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

                  <p className="mt-5 text-base leading-7 text-brand-black/70">
                    {step.description}
                  </p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>

        {/* =====================================================
            MOBILE / TABLET
        ====================================================== */}

        <div className="mt-14 lg:hidden">
          <div className="space-y-12">
            {steps.map((step, index) => (
              <ScrollReveal
                key={step.number}
                direction="up"
                delay={index * 100}
              >
                <article
                  className="
                    relative grid
                    grid-cols-[56px_1fr]
                    gap-6
                    sm:gap-8
                  "
                >
                  {/* =========================================
                      COLUMNA DEL TIMELINE
                  ========================================== */}

                  <div className="relative flex justify-center">
                    {/* línea hacia el siguiente punto */}
                    {index < steps.length - 1 && (
                      <>
                        {/* base */}
                        <div
                          aria-hidden="true"
                          className="
                            absolute
                            left-1/2
                            top-7
                            -bottom-[76px]
                            w-px
                            -translate-x-1/2
                            bg-brand-taupe/35
                          "
                        />

                        {/* línea animada */}
                        <div
                          aria-hidden="true"
                          className={`
                            process-mobile-segment
                            process-mobile-segment-${index + 1}
                            absolute
                            left-1/2
                            top-7
                            -bottom-[76px]
                            w-[3px]
                            -translate-x-1/2
                            rounded-full
                            ${
                              index === 0
                                ? "bg-gradient-to-b from-brand-wine to-brand-green"
                                : "bg-gradient-to-b from-brand-green to-brand-taupe"
                            }
                          `}
                        />
                      </>
                    )}

                    {/* nodo */}
                    <div
                      className={`
                        process-node-${index + 1}
                        relative z-10
                        flex h-14 w-14
                        shrink-0
                        items-center justify-center
                        rounded-full
                        shadow-[0_8px_24px_rgba(59,42,36,0.14)]
                        ${step.circle}
                      `}
                    >
                      {/* HALO */}
                      <span
                        aria-hidden="true"
                        className="
                          pointer-events-none
                          absolute inset-[-8px]
                          z-0
                          rounded-full
                          border-2 border-current
                          opacity-30
                        "
                      />

                      {/* número */}
                      <span className="relative z-10 text-[0.68rem] font-semibold tracking-[0.16em]">
                        {step.number}
                      </span>
                    </div>
                  </div>

                  {/* =========================================
                      TEXTO
                  ========================================== */}

                  <div className="pb-2 pt-1">
                    <p
                      className={`
                        mb-2
                        text-[0.65rem]
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
    </section>
  );
}