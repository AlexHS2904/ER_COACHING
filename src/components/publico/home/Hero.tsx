import Image from "next/image";
import Link from "next/link";

import FabricDecor from "@/components/ui/FabricDecor";

const benefits = [
  {
    title: "Claridad",
    subtitle: "en tus objetivos",
    icon: "/images/svgs/obj.webp",
  },
  {
    title: "Acción",
    subtitle: "con enfoque",
    icon: "/images/svgs/bar.webp",
  },
  {
    title: "Avance",
    subtitle: "con confianza",
    icon: "/images/svgs/per.webp",
  },
];

export default function Hero() {
  return (
    <section className="fabric-background overflow-hidden">
      <FabricDecor variant="soft" />

      <div
        className="
          grid w-full
          lg:min-h-[clamp(560px,calc(100dvh_-_80px),920px)]
          lg:grid-cols-[1.08fr_0.92fr]
        "
      >
        {/* =====================================================
            CONTENIDO
        ====================================================== */}
        <div
          className="
            animate-hero-content
            relative z-20 min-w-0 overflow-hidden
            px-5 pb-4 pt-10
            sm:px-8
            lg:flex lg:items-center lg:overflow-visible
            lg:py-10 lg:pl-12 lg:pr-6
            xl:pl-14
          "
        >
          <div className="w-full min-w-0 max-w-[760px]">
            {/* Eyebrow */}
            <div className="mb-5 flex items-start gap-4 sm:items-center">
              <span
                aria-hidden="true"
                className="mt-2 h-0.5 w-10 shrink-0 bg-brand-wine sm:mt-0 sm:w-14"
              />

              <p
                className="
                  text-[0.68rem] font-medium uppercase leading-5
                  tracking-[0.27em] text-brand-black
                  sm:text-sm sm:tracking-[0.3em]
                "
              >
                Coaching personal y profesional
              </p>
            </div>

            <h1
              className="
                max-w-full
                font-display
                text-[3.1rem] font-semibold
                leading-[0.92]
                tracking-[-0.025em]
                text-brand-brown
                sm:text-[4.35rem]
                lg:text-[clamp(3.75rem,5.6vw,5.45rem)]
              "
            >
              <span className="block">Transforma tus</span>

              <span className="block lg:whitespace-nowrap">
                metas en{" "}
                <span className="font-accent font-semibold italic text-brand-wine">
                  resultados
                </span>
              </span>
            </h1>

            {/* Descripción */}
            <p
              className="
                mt-5 max-w-[560px]
                text-[1rem] leading-7
                text-brand-black
                sm:text-lg
                lg:text-[1.05rem]
              "
            >
              Coaching personalizado para ayudarte a ganar claridad, tomar
              acción y avanzar con confianza.
            </p>

            {/* CTA */}
            <Link
              href="/servicios"
              className="
                relative mt-6 flex w-full max-w-full
                items-center justify-center
                rounded-xl
                bg-brand-wine
                px-7 py-4
                text-center font-medium text-white
                transition-colors duration-200
                hover:bg-brand-brown
                focus-visible:outline focus-visible:outline-2
                focus-visible:outline-offset-4 focus-visible:outline-brand-wine
                sm:w-fit sm:min-w-[275px]
              "
            >
              <span>Agendar una cita</span>

              <span
                aria-hidden="true"
                className="absolute right-6 text-xl leading-none"
              >
                →
              </span>
            </Link>

            {/* =================================================
                BENEFICIOS
            ================================================== */}
            <div className="mt-8 grid grid-cols-3 sm:max-w-[560px] lg:mt-12">
              {benefits.map((benefit, index) => (
                <div
                  key={benefit.title}
                  className={`
                    flex min-w-0 flex-col items-center
                    px-2 text-center
                    ${
                      index !== benefits.length - 1
                        ? "border-r border-brand-taupe/40"
                        : ""
                    }
                  `}
                >
                  <div
                    className="
                      mb-2 flex h-10 w-10
                      items-center justify-center
                      rounded-full
                      bg-brand-taupe/15
                      sm:h-11 sm:w-11
                    "
                  >
                    <Image
                      src={benefit.icon}
                      alt=""
                      width={28}
                      height={28}
                      aria-hidden="true"
                      loading="lazy"
                      sizes="28px"
                      className="h-6 w-6 object-contain sm:h-7 sm:w-7"
                    />
                  </div>

                  <p className="text-xs font-semibold leading-4 text-brand-black sm:text-sm">
                    {benefit.title}
                  </p>

                  <p className="mt-0.5 text-[0.65rem] leading-4 text-brand-black/75 sm:text-xs">
                    {benefit.subtitle}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* =====================================================
            VISUAL (un solo bloque para mobile y desktop)
            - [container-type:size] permite que el "escenario"
              se ajuste al alto Y al ancho disponibles.
        ====================================================== */}
        <div
          className="
            animate-hero-visual
            relative h-[480px] overflow-hidden
            [container-type:size]
            sm:h-[600px]
            lg:h-auto lg:overflow-visible
          "
        >
          {/* Escenario 4:5, centrado y anclado abajo.
              Todo lo de adentro se posiciona en %, así escala igual
              en cualquier pantalla. */}
          <div
            className="
              absolute bottom-0 left-1/2
              aspect-[4/5] h-[min(100cqh,125cqw)]
              -translate-x-1/2
            "
          >
            {/* Luz suave detrás de la coach */}
            <div
              aria-hidden="true"
              className="
                absolute left-1/2 top-[6%]
                aspect-square w-[95%]
                -translate-x-1/2
                rounded-full bg-white/50 blur-3xl
              "
            />

            {/* Círculo vino (arriba derecha, se sale del borde) */}
            <div
              aria-hidden="true"
              className="
                absolute left-[57%] top-[2%]
                aspect-square w-[60%]
                rounded-full bg-brand-wine
              "
            />

            {/* Círculo verde (abajo izquierda) */}
            <div
              aria-hidden="true"
              className="
                absolute left-[-18%] top-[64%]
                aspect-square w-[56%]
                rounded-full bg-brand-green
                lg:left-[-4%]
              "
            />

            {/* Halo: línea fina concéntrica al arco + punto que orbita */}
            <div
              aria-hidden="true"
              className="
                absolute left-[2%] top-[9.6%]
                aspect-square w-[96%]
                -rotate-[50deg] rounded-full border border-brand-taupe
                motion-safe:animate-[spin_70s_linear_infinite]
              "
            >
              <span
                className="
                  absolute left-1/2 top-0
                  aspect-square w-[3.5%]
                  -translate-x-1/2 -translate-y-1/2
                  rounded-full bg-brand-wine
                "
              />
            </div>

            {/* Arco principal */}
            <div
              aria-hidden="true"
              className="
                absolute bottom-0 left-[15%] top-[20%]
                w-[70%]
                rounded-t-full bg-brand-taupe
              "
            />

            {/* Línea interior del arco */}
            <div
              aria-hidden="true"
              className="
                absolute bottom-0 left-[19%] top-[23.2%]
                w-[62%]
                rounded-t-full border border-b-0 border-white/35
              "
            />

            {/* Puntos decorativos */}
            <span
              aria-hidden="true"
              className="absolute left-[8%] top-[44%] aspect-square w-[2.5%] rounded-full bg-brand-green"
            />
            <span
              aria-hidden="true"
              className="absolute left-[90%] top-[56%] aspect-square w-[4%] rounded-full bg-brand-taupe"
            />

            {/* Coach
                - h-[96%]: deja aire arriba
                - scale-[1.08] origin-top: la agranda hacia abajo
                  (la parte baja se recorta, la cabeza nunca)
                Para hacerla más grande, sube el scale (1.12, 1.15…) */}
            <div
              className="
                absolute bottom-0 left-1/2 z-10
                aspect-[2/3] h-[96%]
                -translate-x-1/2
              "
            >
              <Image
                src="/images/coach/coach1.webp"
                alt="Edna Rojo, coach profesional"
                fill
                priority
                sizes="(min-width: 1024px) 660px, (min-width: 640px) 440px, 360px"
                className="origin-top scale-[1.2] object-contain object-top"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}