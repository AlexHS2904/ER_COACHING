import Link from "next/link";

export default function AboutCTA() {
  return (
    <section className="relative overflow-hidden bg-brand-cream px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
      <div className="mx-auto max-w-[1100px]">
        <div className="mx-auto max-w-[920px]">
          {/* tarjeta tipo papel */}
          <div
            className="
              relative overflow-hidden
              rounded-[22px]
              border border-brand-wine/20
              bg-[linear-gradient(145deg,#682830_0%,#742d38_45%,#5f232c_100%)]
              px-8 py-10
              shadow-[0_22px_60px_rgba(59,42,36,0.18)]
              sm:px-12 sm:py-14
              lg:px-16 lg:py-16
              transition-all duration-500
              hover:-translate-y-1
            "
          >
            {/* textura tipo papel */}
            <div className="pointer-events-none absolute inset-0 opacity-30">
              {/* manchas suaves */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.16),transparent_24%),radial-gradient(circle_at_82%_24%,rgba(255,255,255,0.12),transparent_22%),radial-gradient(circle_at_28%_78%,rgba(255,255,255,0.10),transparent_24%),radial-gradient(circle_at_75%_75%,rgba(255,255,255,0.12),transparent_20%)]" />

              {/* pliegues finos */}
              <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.05)_18%,transparent_30%,rgba(255,255,255,0.035)_45%,transparent_58%,rgba(255,255,255,0.04)_72%,transparent_100%)]" />

              {/* ruido lineal leve */}
              <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.018)_0px,rgba(255,255,255,0.018)_1px,transparent_1px,transparent_4px)]" />
            </div>

            {/* luces/sombras ambientales */}
            <div className="pointer-events-none absolute -left-8 top-0 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-52 w-52 rounded-full bg-black/10 blur-3xl" />

            {/* borde interno sutil como hoja */}
            <div className="pointer-events-none absolute inset-[14px] rounded-[16px] border border-brand-cream/12" />

            {/* comillas decorativas */}
            <span className="absolute left-5 top-3 font-display text-5xl leading-none text-brand-cream/20 sm:left-8 sm:top-5 sm:text-7xl">
              “
            </span>
            <span className="absolute bottom-2 right-5 font-display text-5xl leading-none text-brand-cream/20 sm:bottom-4 sm:right-8 sm:text-7xl">
              ”
            </span>

            {/* contenido */}
            <div className="relative z-10 text-center">
              <p className="mx-auto max-w-[760px] font-accent text-[2rem] italic leading-[1.28] text-[#f1f1ed] sm:text-[2.5rem] lg:text-[3.2rem]">
                No necesitas tener todas las respuestas para comenzar. A veces,
                el primer paso es hacer mejores preguntas.
              </p>

              <div className="mt-8 flex justify-center">
                <Link
                  href="/contacto"
                  className="inline-flex items-center gap-3 rounded-full border border-[#f1f1ed]/35 bg-white/8 px-6 py-3 text-sm font-medium text-[#f1f1ed] backdrop-blur-sm transition-all duration-300 hover:bg-[#f1f1ed] hover:text-brand-wine"
                >
                  Agenda una sesión
                  <span aria-hidden="true" className="text-base leading-none">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* sombra inferior */}
          <div className="mx-auto mt-5 h-6 w-[80%] rounded-full bg-brand-brown/10 blur-xl" />
        </div>
      </div>
    </section>
  );
}