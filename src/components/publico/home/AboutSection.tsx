import Link from "next/link";

import ScrollReveal from "@/components/ui/ScrollReveal";
import FabricDecor from "@/components/ui/FabricDecor";

const values = [
  {
    number: "01",
    title: "Escucha",
    description: "Un espacio para comprender tu momento actual.",
    accent: "bg-brand-wine/10 text-brand-wine",
  },
  {
    number: "02",
    title: "Claridad",
    description: "Definir prioridades y dar dirección a tu proceso.",
    accent: "bg-brand-green/10 text-brand-green",
  },
  {
    number: "03",
    title: "Acción",
    description: "Convertir ideas en pasos concretos y sostenibles.",
    accent: "bg-brand-taupe/35 text-brand-brown",
  },
];

export default function AboutSection() {
  return (
    <section className="fabric-background relative overflow-hidden py-20 sm:py-24 lg:py-28">
      <FabricDecor variant="alternate" />
      {/* Separador superior */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-brand-taupe/30"
      />

      {/* =========================
          ESQUINA VERDE SUPERIOR IZQUIERDA
      ========================== */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          -left-24 -top-28
          h-44 w-64 rounded-full
          bg-brand-green
          sm:-left-28 sm:-top-32 sm:h-50 sm:w-92
        "
      />

      {/* puntito verde */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          left-8 top-10
          h-2.5 w-2.5 rounded-full bg-brand-green
          sm:left-11 sm:top-11
        "
      />

      {/* decoraciones suaves */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[58%] top-[55%] h-56 w-56 rounded-full bg-brand-wine/5 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[8%] top-[18%] h-32 w-32 rounded-full bg-brand-green/6 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full border border-brand-taupe/25"
      />

      {/* CONTENIDO */}
      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
          {/* IZQUIERDA */}
          <ScrollReveal
            direction="left"
            className="lg:flex lg:min-h-[520px] lg:items-center"
          >
            {/* más espacio arriba en mobile */}
            <div className="pt-10 sm:pt-12 lg:pt-0">
              <div className="mb-5 flex items-center gap-4">
                <span className="h-0.5 w-12 bg-brand-wine" />

                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-black sm:text-sm">
                  Sobre mí
                </p>
              </div>

              <h2 className="max-w-[620px] font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] text-brand-brown sm:text-6xl lg:text-[4.4rem]">
                Acompañamiento con
                <span className="font-accent italic text-brand-wine">
                  {" "}
                  claridad y propósito.
                </span>
              </h2>
            </div>
          </ScrollReveal>

          {/* DERECHA */}
          <div>
            <ScrollReveal direction="right">
              <div className="w-full">
                <p className="text-base leading-8 text-brand-black/80 sm:text-lg">
                  Cada proceso parte de una realidad distinta. Mi objetivo es
                  acompañarte a comprender dónde estás, definir hacia dónde
                  quieres avanzar y construir acciones que tengan sentido para
                  ti.
                </p>

                <p className="mt-4 text-base leading-8 text-brand-black/70">
                  Un espacio cercano, estructurado y enfocado en convertir la
                  reflexión en movimiento.
                </p>

                <Link
                  href="/sobre-mi"
                  className="
                    mt-7 inline-flex items-center gap-7
                    rounded-xl border border-brand-wine
                    px-7 py-3.5 font-medium text-brand-wine
                    transition-all duration-300
                    hover:-translate-y-0.5
                    hover:bg-brand-wine hover:text-white
                  "
                >
                  Conocer más sobre mí

                  <span aria-hidden="true" className="text-xl leading-none">
                    →
                  </span>
                </Link>
              </div>
            </ScrollReveal>

            {/* BASE DEL ACOMPAÑAMIENTO */}
            <div className="mt-14 w-full">
              <ScrollReveal direction="up">
                <div className="mb-5 flex items-center gap-3">
                  <span className="h-px w-10 bg-brand-taupe/70" />

                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-brand-brown/70">
                    Base del acompañamiento
                  </p>
                </div>
              </ScrollReveal>

              <div className="grid gap-4 sm:grid-cols-3">
                {values.map((value, index) => (
                  <ScrollReveal
                    key={value.title}
                    direction="up"
                    delay={index * 100}
                    className="h-full"
                  >
                    <article
                      className="
                        h-full rounded-2xl
                        border border-brand-taupe/25
                        bg-white/70 p-5
                        shadow-[0_10px_30px_rgba(59,42,36,0.06)]
                        transition-all duration-300
                        hover:-translate-y-1
                        hover:shadow-[0_16px_36px_rgba(59,42,36,0.10)]
                      "
                    >
                      <div
                        className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${value.accent}`}
                      >
                        {value.number}
                      </div>

                      <h3 className="font-display text-[1.65rem] font-semibold leading-none text-brand-brown">
                        {value.title}
                      </h3>

                      <p className="mt-3 text-sm leading-6 text-brand-black/70">
                        {value.description}
                      </p>
                    </article>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}