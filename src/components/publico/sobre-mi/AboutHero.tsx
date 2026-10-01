import Image from "next/image";
import Link from "next/link";

import ScrollReveal from "@/components/ui/ScrollReveal";

export default function AboutHero() {
  return (
    <section className="relative overflow-hidden bg-brand-cream py-16 sm:py-20 lg:py-24">
      {/* Decoraciones */}

      <div className="relative z-10 mx-auto grid max-w-[1450px] gap-14 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-24 lg:px-12">
        {/* =========================
            FOTO
        ========================== */}

        <ScrollReveal direction="left">
          <div className="relative mx-auto w-full max-w-[560px]">
            {/* Marco exterior */}
            <div
              aria-hidden="true"
              className="absolute -bottom-5 -right-5 h-[92%] w-[88%] rounded-t-[999px] border-2 border-brand-taupe/70 sm:-bottom-7 sm:-right-7"
            />

            {/* Círculo vino */}
            <div
              aria-hidden="true"
              className="absolute -left-7 top-14 h-28 w-28 rounded-full bg-brand-wine sm:h-36 sm:w-36"
            />

            {/* Círculo verde */}
            <div
              aria-hidden="true"
              className="absolute -bottom-5 -right-10 h-32 w-32 rounded-full bg-brand-green sm:h-40 sm:w-40"
            />

            {/* Fotografía */}
            <div className="relative z-10 mx-auto aspect-[4/5] w-[86%] overflow-hidden rounded-t-[999px] rounded-b-[2rem] bg-brand-taupe/20 shadow-[0_22px_55px_rgba(59,42,36,0.12)]">
              <Image
                src="/images/coach/coach1_desk.webp"
                alt="Coach profesional"
                fill
                sizes="(max-width: 1024px) 86vw, 500px"
                className="object-cover object-top"
              />
            </div>

            {/* Tarjeta flotante */}
            <div className="absolute bottom-8 left-0 z-20 max-w-[260px] rounded-2xl border border-brand-taupe/25 bg-brand-cream/95 px-5 py-4 shadow-[0_12px_35px_rgba(59,42,36,0.12)] backdrop-blur-sm sm:left-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brand-wine">
                Coaching
              </p>

              <p className="mt-1 font-display text-2xl font-semibold leading-tight text-brand-brown">
                Un proceso cercano y consciente
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* =========================
            TEXTO
        ========================== */}

        <ScrollReveal direction="right">
          <div className="max-w-[690px]">
            <div className="mb-5 flex items-center gap-4">
              <span className="h-0.5 w-12 bg-brand-wine" />

              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-black sm:text-sm">
                Sobre mí
              </p>
            </div>

            <h1 className="font-display text-5xl font-semibold leading-[0.94] tracking-[-0.025em] text-brand-brown sm:text-6xl lg:text-[4.8rem]">
              Acompañarte a mirar con claridad, decidir y avanzar.
            </h1>

            <div className="mt-7 space-y-5 text-base leading-8 text-brand-black/80 sm:text-lg">
              <p>
                Creo en el coaching como un espacio para detenerse, observar con
                mayor claridad lo que está ocurriendo y tomar decisiones más
                conscientes sobre el camino que quieres construir.
              </p>

              <p>
                Cada proceso es diferente. Por eso, mi forma de acompañar parte
                de escuchar tu realidad, comprender tus objetivos y trabajar
                contigo para transformar ideas, inquietudes y posibilidades en
                pasos concretos.
              </p>

              <p>
                No se trata de darte respuestas prefabricadas, sino de crear un
                espacio donde puedas encontrar tus propias respuestas, reconocer
                tus recursos y avanzar con mayor intención.
              </p>
            </div>

            <Link
              href="/servicios"
              className="mt-8 inline-flex items-center gap-7 rounded-xl bg-brand-wine px-7 py-4 font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-brown"
            >
              Conocer mis servicios

              <span aria-hidden="true" className="text-xl">
                →
              </span>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}