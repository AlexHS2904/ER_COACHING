import ScrollReveal from "@/components/ui/ScrollReveal";

const testimonials: {
  id: string;
  name: string;
  text: string;
}[] = [];

export default function TestimonialsSection() {
  const publishedCount = testimonials.length;

  return (
    <section className="relative overflow-hidden bg-brand-wine py-20 sm:py-24 lg:py-28">
      {/* textura sutil */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0 opacity-[0.08]
          bg-[radial-gradient(rgba(255,255,255,0.22)_0.7px,transparent_0.9px)]
          bg-[size:18px_18px]
        "
      />

      {/* palabra decorativa al fondo */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute left-1/2 top-6 -translate-x-1/2
          select-none whitespace-nowrap font-display
          text-[5rem] font-semibold leading-none tracking-[-0.06em]
          text-white/[0.05]
          sm:text-[7rem]
          lg:text-[10rem]
        "
      >
        TESTIMONIOS
      </div>

      {/* círculo decorativo sutil */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute -right-16 top-10
          h-56 w-56 rounded-full border border-white/10
          sm:h-72 sm:w-72
        "
      />

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        {/* heading breve */}
        <ScrollReveal direction="up">
          <div className="mx-auto max-w-[760px] text-center">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.34em] text-brand-cream/70 sm:text-xs">
              Testimonios
            </p>

            <h2 className="mt-5 font-display text-4xl font-semibold leading-[0.96] tracking-[-0.03em] text-brand-cream sm:text-5xl lg:text-[4rem]">
              Un espacio para
              <span className="font-accent italic text-[#d8b7b0]">
                {" "}
                voces reales
              </span>
            </h2>
          </div>
        </ScrollReveal>

        {/* cuadrado central */}
        <ScrollReveal direction="up" delay={100}>
          <div className="mx-auto mt-12 max-w-[760px] lg:mt-14">
            <div
              className="
                relative overflow-hidden rounded-[2rem]
                border border-white/15 bg-brand-cream
                shadow-[0_24px_70px_rgba(0,0,0,0.18)]
                aspect-auto min-h-[420px]
                sm:min-h-[500px]
                md:aspect-square md:min-h-0
              "
            >
              {/* textura interna */}
              <div
                aria-hidden="true"
                className="
                  pointer-events-none absolute inset-0 opacity-[0.06]
                  bg-[radial-gradient(rgba(59,42,36,0.16)_0.65px,transparent_0.9px)]
                  bg-[size:18px_18px]
                "
              />

              {/* contenido interno */}
              <div className="relative flex h-full flex-col p-6 sm:p-8 lg:p-10">
                {/* top bar */}
                <div className="flex items-start justify-between border-b border-brand-taupe/25 pb-5">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-brand-brown/45">
                      Archivo de experiencias
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-display text-2xl italic text-brand-wine/55">
                      {String(publishedCount).padStart(2, "0")}
                    </p>
                  </div>
                </div>

                {/* cuerpo */}
                <div className="flex flex-1 flex-col justify-center py-8 text-center sm:py-10">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-brand-wine/75">
                    Próximamente
                  </p>

                  <h3 className="mx-auto mt-5 max-w-[520px] font-display text-4xl font-semibold leading-[1.02] tracking-[-0.025em] text-brand-brown sm:text-5xl">
                    Este espacio se irá llenando de testimonios reales.
                  </h3>

                  <p className="mx-auto mt-6 max-w-[520px] text-sm leading-7 text-brand-brown/65 sm:text-base">
                    Cuando las personas invitadas compartan su experiencia y la
                    coach autorice su publicación, aparecerán aquí.
                  </p>
                </div>

                {/* footer */}
                <div className="flex items-center justify-between border-t border-brand-taupe/25 pt-5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-wine" />
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-green" />
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-taupe" />
                  </div>
                </div>

                {/* comilla decorativa */}
                <div
                  aria-hidden="true"
                  className="
                    pointer-events-none absolute right-8 top-24
                    font-display text-7xl leading-none text-brand-taupe/18
                    sm:text-8xl
                  "
                >
                  ”
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}