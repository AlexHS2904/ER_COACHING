import Link from "next/link";

import ScrollReveal from "@/components/ui/ScrollReveal";

export default function BookingCTA() {
  return (
    <section
      className="
        relative overflow-hidden
        bg-[linear-gradient(115deg,#e9dfd7_0%,#f5f1ec_48%,#eee6df_100%)]
        py-20 sm:py-24 lg:py-32
      "
    >
      {/* =====================================================
          TEXTURA GENERAL DE PAPEL
      ====================================================== */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          opacity-[0.16]
          bg-[radial-gradient(rgba(59,42,36,0.18)_0.55px,transparent_0.8px)]
          bg-[size:19px_19px]
        "
      />

      {/* luz suave central */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          left-1/2 top-1/2
          h-[600px] w-[800px]
          -translate-x-1/2 -translate-y-1/2
          rounded-full
          bg-white/30
          blur-[100px]
        "
      />

      {/* línea editorial superior */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          left-0 top-12
          h-px w-[18%]
          bg-brand-wine/20
        "
      />

      {/* =====================================================
          CONTENIDO
      ====================================================== */}

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        <div
          className="
            grid gap-16
            lg:grid-cols-[0.88fr_1.12fr]
            lg:items-center
            lg:gap-24
          "
        >
          {/* =================================================
              COLUMNA IZQUIERDA
          ================================================== */}

          <ScrollReveal direction="left">
            <div className="mx-auto max-w-[620px] lg:mx-0">
              {/* pequeño identificador */}
              <div className="mb-8 flex items-center gap-4">
                <span className="h-px w-12 bg-brand-wine" />

                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-brand-brown/60 sm:text-xs">
                  Tu siguiente paso
                </p>
              </div>

              {/* título */}
              <h2
                className="
                  font-display
                  text-[3.5rem]
                  font-semibold
                  leading-[0.9]
                  tracking-[-0.035em]
                  text-brand-brown
                  sm:text-[4.7rem]
                  lg:text-[5.4rem]
                "
              >
                ¿Y si este fuera
                <span className="block">el momento de</span>

                <span className="block font-accent italic text-brand-wine">
                  empezar?
                </span>
              </h2>

              {/* texto */}
              <p
                className="
                  mt-8 max-w-[500px]
                  text-base leading-8
                  text-brand-black/65
                  sm:text-lg
                "
              >
                No necesitas llegar con todas las respuestas. Solo con la
                disposición de darte un espacio, escucharte y comenzar desde
                donde hoy estás.
              </p>

              {/* guía visual hacia tarjeta */}
              <div className="mt-12 hidden items-center lg:flex">
                <p
                  className="
                    shrink-0
                    text-[0.62rem]
                    font-semibold uppercase
                    tracking-[0.28em]
                    text-brand-wine
                  "
                >
                  Empieza por aquí
                </p>

                <div className="ml-5 h-px flex-1 bg-brand-wine/30" />

                <span
                  aria-hidden="true"
                  className="ml-3 text-xl text-brand-wine"
                >
                  →
                </span>
              </div>

              {/* mobile */}
              <div className="mt-10 flex items-center gap-4 lg:hidden">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-brand-wine">
                  Empieza por aquí
                </p>

                <span aria-hidden="true" className="text-lg text-brand-wine">
                  ↓
                </span>
              </div>
            </div>
          </ScrollReveal>

          {/* =================================================
              TARJETA / INVITACIÓN
          ================================================== */}

          <ScrollReveal direction="right">
            <div className="relative mx-auto w-full max-w-[680px] lg:mr-0">
              {/* sombra física detrás */}
              <div
                aria-hidden="true"
                className="
                  absolute
                  left-[5%] top-[7%]
                  h-[96%] w-[94%]
                  rounded-[2rem]
                  bg-brand-brown/10
                  blur-2xl
                "
              />

              {/* hoja trasera taupe */}
              <div
                aria-hidden="true"
                className="
                  absolute
                  -bottom-4 left-5
                  h-full w-[94%]
                  rotate-[-1.4deg]
                  rounded-[2rem]
                  bg-brand-taupe/30
                "
              />

              {/* tarjeta principal */}
              <article
                className="
                  relative
                  overflow-hidden
                  rounded-[2rem]
                  border border-brand-brown/10
                  bg-[#f8f3ed]
                  px-6 py-7
                  shadow-[0_28px_70px_rgba(59,42,36,0.15)]
                  sm:px-9 sm:py-9
                  lg:px-11 lg:py-10
                "
              >
                {/* textura */}
                <div
                  aria-hidden="true"
                  className="
                    pointer-events-none absolute inset-0
                    opacity-[0.18]
                    bg-[radial-gradient(rgba(59,42,36,0.16)_0.55px,transparent_0.8px)]
                    bg-[size:17px_17px]
                  "
                />

                {/* pestaña lateral */}
                <div
                  aria-hidden="true"
                  className="
                    absolute right-0 top-[88px]
                    h-[90px] w-2
                    rounded-l-full
                    bg-brand-wine
                    sm:w-2.5
                  "
                />

                {/* =================================================
                    CABECERA DE TARJETA
                ================================================== */}

                <div className="relative flex items-start justify-between gap-6">
                  <div>
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-brand-wine">
                      Edna Rojo
                    </p>

                    <p className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.28em] text-brand-brown/45">
                      Coaching
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-display text-3xl italic leading-none text-brand-wine/65">
                      01
                    </p>

                    <p className="mt-1 text-[0.55rem] uppercase tracking-[0.22em] text-brand-brown/35">
                      Sesión
                    </p>
                  </div>
                </div>

                {/* línea */}
                <div className="relative mt-7 h-px bg-brand-brown/15" />

                {/* =================================================
                    CONTENIDO PRINCIPAL
                ================================================== */}

                <div className="relative py-9 sm:py-11">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-brand-wine">
                    Tu próxima
                  </p>

                  <h3
                    className="
                      mt-2
                      max-w-[470px]
                      font-display
                      text-[3rem]
                      font-semibold
                      leading-[0.9]
                      tracking-[-0.025em]
                      text-brand-brown
                      sm:text-[4rem]
                    "
                  >
                    Sesión de
                    <span className="block font-accent italic text-brand-wine">
                      coaching.
                    </span>
                  </h3>
                </div>

                {/* =================================================
                    DATOS
                ================================================== */}

                <div
                  className="
                    relative grid
                    border-y border-brand-brown/12
                    sm:grid-cols-3
                  "
                >
                  <div className="border-b border-brand-brown/10 py-5 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0">
                    <p className="text-[0.55rem] font-semibold uppercase tracking-[0.25em] text-brand-brown/40">
                      Modalidad
                    </p>

                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-brand-brown">
                      Online
                    </p>
                  </div>

                  <div className="border-b border-brand-brown/10 py-5 sm:border-b-0 sm:border-r sm:px-5">
                    <p className="text-[0.55rem] font-semibold uppercase tracking-[0.25em] text-brand-brown/40">
                      Duración
                    </p>

                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-brand-brown">
                      90 min
                    </p>
                  </div>

                  <div className="py-5 sm:pl-5">
                    <p className="text-[0.55rem] font-semibold uppercase tracking-[0.25em] text-brand-brown/40">
                      Sesión 1:1
                    </p>

                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-brand-brown">
                      $500 MXN
                    </p>
                  </div>
                </div>

                {/* =================================================
                    PERFORACIÓN / TICKET
                ================================================== */}

                <div className="relative my-7 flex items-center gap-3">
                  <div className="h-px flex-1 bg-[repeating-linear-gradient(to_right,rgba(59,42,36,0.22)_0_5px,transparent_5px_11px)]" />

                  <span
                    aria-hidden="true"
                    className="text-[0.55rem] tracking-[0.25em] text-brand-brown/25"
                  >
                    ✦
                  </span>

                  <div className="h-px flex-1 bg-[repeating-linear-gradient(to_right,rgba(59,42,36,0.22)_0_5px,transparent_5px_11px)]" />
                </div>

                {/* =================================================
                    CTA
                ================================================== */}

                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[0.58rem] font-semibold uppercase tracking-[0.24em] text-brand-brown/40">
                      ¿Empezamos?
                    </p>

                    <p className="mt-1 font-display text-xl italic text-brand-brown/70">
                      Reserva tu espacio.
                    </p>
                  </div>

                  <Link
                    href="/servicios"
                    className="
                      group
                      inline-flex
                      min-h-[54px]
                      items-center
                      justify-between
                      gap-8
                      rounded-xl
                      bg-brand-wine
                      px-6
                      font-semibold
                      text-brand-cream
                      shadow-[0_12px_28px_rgba(104,40,48,0.18)]
                      transition-all
                      duration-300
                      hover:-translate-y-0.5
                      hover:bg-[#592129]
                      hover:shadow-[0_18px_35px_rgba(104,40,48,0.25)]
                    "
                  >
                    <span>Agendar sesión</span>

                    <span
                      aria-hidden="true"
                      className="text-lg transition-transform duration-300 group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </Link>
                </div>

                {/* número inferior decorativo */}
                <p
                  aria-hidden="true"
                  className="
                    pointer-events-none absolute
                    -bottom-7 -left-1
                    font-display
                    text-[7rem]
                    font-semibold
                    leading-none
                    text-brand-wine/[0.035]
                  "
                >
                  01
                </p>
              </article>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}