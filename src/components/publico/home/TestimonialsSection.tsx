import ScrollReveal from "@/components/ui/ScrollReveal";

export default function TestimonialsSection() {
  return (
    <section className="relative overflow-hidden bg-brand-wine py-20 sm:py-24 lg:py-32">
      {/* =====================================================
          TEXTURA / PROFUNDIDAD PROPIA DE ESTA SECCIÓN
      ====================================================== */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_82%_78%,rgba(15,61,52,0.28),transparent_34%)]
        "
      />

      {/* palabra gigante de fondo */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          -left-6 top-10
          select-none
          font-display
          text-[8rem] font-semibold
          leading-none
          tracking-[-0.06em]
          text-brand-cream/[0.035]
          sm:text-[12rem]
          lg:left-[-2rem]
          lg:top-[-1rem]
          lg:text-[19rem]
        "
      >
        VOCES
      </div>

      {/* círculo editorial */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          -right-40 -top-40
          h-[430px] w-[430px]
          rounded-full
          border border-brand-cream/10
        "
      />

      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          -right-24 -top-24
          h-[300px] w-[300px]
          rounded-full
          border border-brand-cream/10
        "
      />

      {/* =====================================================
          CONTENIDO
      ====================================================== */}

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        {/* pequeño encabezado editorial */}
        <ScrollReveal direction="up">
          <div className="flex items-center justify-between border-b border-brand-cream/15 pb-5">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-brand-cream/65 sm:text-xs">
              Testimonios
            </p>

            <p className="hidden text-xs uppercase tracking-[0.18em] text-brand-cream/35 sm:block">
              Experiencias reales · Publicadas con autorización
            </p>
          </div>
        </ScrollReveal>

        {/* =====================================================
            COMPOSICIÓN PRINCIPAL
        ====================================================== */}

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-20">
          {/* =================================================
              IZQUIERDA
          ================================================== */}

          <ScrollReveal direction="left">
            <div>
              <div className="mb-8 font-display text-[7rem] leading-[0.5] text-brand-taupe sm:text-[9rem] lg:text-[11rem]">
                “
              </div>

              <h2 className="max-w-[560px] font-display text-5xl font-semibold leading-[0.92] tracking-[-0.03em] text-brand-cream sm:text-6xl lg:text-[5rem]">
                Historias reales,
                <span className="block font-accent italic text-brand-taupe">
                  de voces reales.
                </span>
              </h2>

              <p className="mt-8 max-w-[470px] text-sm leading-7 text-brand-cream/65 sm:text-base sm:leading-8">
                Cada experiencia que aparezca aquí habrá sido compartida de
                forma voluntaria por una persona que decidió contar parte de su
                proceso.
              </p>
            </div>
          </ScrollReveal>

          {/* =================================================
              PAPEL / ESTADO VACÍO
          ================================================== */}

          <ScrollReveal direction="right">
            <div className="relative mx-auto w-full max-w-[720px] lg:mr-0">
              {/* hoja trasera 1 */}
              <div
                aria-hidden="true"
                className="
                  absolute
                  left-4 top-5
                  h-full w-[95%]
                  rotate-[-2deg]
                  rounded-[2rem]
                  bg-brand-taupe/25
                "
              />

              {/* hoja trasera 2 */}
              <div
                aria-hidden="true"
                className="
                  absolute
                  right-2 top-4
                  h-full w-[94%]
                  rotate-[1.5deg]
                  rounded-[2rem]
                  border border-brand-cream/10
                  bg-brand-green/35
                "
              />

              {/* hoja principal */}
              <div
                className="
                  relative
                  min-h-[430px]
                  overflow-hidden
                  rounded-[2rem]
                  bg-[#f3efe8]
                  px-7 py-9
                  shadow-[0_30px_80px_rgba(9,7,6,0.28)]
                  sm:min-h-[480px]
                  sm:px-10 sm:py-11
                  lg:px-12
                "
              >
                {/* textura del papel */}
                <div
                  aria-hidden="true"
                  className="
                    pointer-events-none absolute inset-0
                    opacity-[0.22]
                    bg-[radial-gradient(rgba(59,42,36,0.18)_0.6px,transparent_0.8px)]
                    bg-[size:17px_17px]
                  "
                />

                {/* línea editorial superior */}
                <div className="relative flex items-center justify-between border-b border-brand-brown/15 pb-5">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-brand-brown/50">
                    Archivo de experiencias
                  </span>

                  <span className="font-display text-2xl italic text-brand-wine/50">
                    00
                  </span>
                </div>

                {/* centro */}
                <div className="relative flex min-h-[300px] flex-col justify-center py-10 sm:min-h-[330px]">
                  <span
                    aria-hidden="true"
                    className="
                      absolute
                      right-0 top-8
                      font-display
                      text-[8rem]
                      leading-none
                      text-brand-wine/[0.07]
                      sm:text-[10rem]
                    "
                  >
                    ”
                  </span>

                  <div className="relative max-w-[520px]">
                    <p className="mb-5 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-brand-wine">
                      Próximamente
                    </p>

                    <h3 className="font-display text-[2.6rem] font-semibold leading-[0.98] text-brand-brown sm:text-[3.4rem]">
                      Este espacio se irá llenando de voces reales.
                    </h3>

                    <p className="mt-6 max-w-[470px] text-sm leading-7 text-brand-brown/65 sm:text-base">
                      Los testimonios aparecerán aquí cuando las personas
                      invitadas compartan su experiencia y autoricen su
                      publicación.
                    </p>
                  </div>
                </div>

                {/* pie tipo revista */}
                <div className="relative flex items-end justify-between border-t border-brand-brown/15 pt-5">
                  <div>
                    <p className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-brand-brown/45">
                      Edna Rojo Coaching
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-wine" />
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-taupe" />
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* =====================================================
            BANDA INFERIOR
        ====================================================== */}

        <ScrollReveal direction="up">
          <div className="mt-16 overflow-hidden border-y border-brand-cream/10 py-4 lg:mt-24">
            <div
              className="
                flex
                justify-center
                gap-5
                whitespace-nowrap
                text-[0.65rem]
                font-semibold uppercase
                tracking-[0.28em]
                text-brand-cream/35
                sm:gap-8
              "
            >
              <span>Escuchar</span>
              <span className="text-brand-taupe">✦</span>

              <span>Compartir</span>
              <span className="text-brand-taupe">✦</span>

              <span>Reflexionar</span>
              <span className="text-brand-taupe">✦</span>

              <span>Avanzar</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}