import Link from "next/link";

import ScrollReveal from "@/components/ui/ScrollReveal";
import FabricDecor from "@/components/ui/FabricDecor";

const services = [
  {
    number: "01",
    title: "Sesión 1:1",
    detail: "90 min",
    description:
      "Un espacio personalizado para trabajar un tema específico, desbloquear una situación o ganar claridad.",
    price: "$500",
    priceLabel: "MXN",

    background: "bg-brand-wine",
    text: "text-brand-cream",
    softText: "text-brand-cream/75",
    badge: "bg-brand-cream text-brand-wine",
  },

  {
    number: "02",
    title: "Proceso de coaching",
    detail: "6 sesiones",
    description:
      "Un acompañamiento para profundizar en tu autoconocimiento, identificar patrones y crear acciones alineadas con la vida que quieres construir.",
    price: "$2,500",
    priceLabel: "MXN",

    background: "bg-brand-green",
    text: "text-brand-cream",
    softText: "text-brand-cream/75",
    badge: "bg-brand-cream text-brand-green",
  },

  {
    number: "03",
    title: "Talleres y sesiones grupales",
    detail: "Para grupos",
    description:
      "Espacios diseñados para trabajar temas como autoconocimiento, creencias, propósito, emociones y desarrollo personal.",
      priceLabel: "MXN",
      price: "Cotiza",
    

    background: "bg-[#c4afa6]",
    text: "text-[#684d43]",
    softText: "text-[#684d43]/75",
    badge: "bg-brand-cream text-[#684d43]",
  },
];

export default function ServicesSection() {
  return (
    <section className="fabric-background relative overflow-hidden py-20 sm:py-24 lg:py-28">
      {/* =====================================================
          DECORACIÓN DE FONDO
      ====================================================== */}

      <FabricDecor variant="soft"/>

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
                  Servicios
                </p>
              </div>

              <h2 className="font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] text-brand-brown sm:text-6xl lg:text-[4.5rem]">
                ¿En qué puedo{" "}
                <span className="font-accent italic text-brand-wine">
                  ayudarte?
                </span>
              </h2>
            </div>
          </ScrollReveal>

          {/* derecha */}

          <ScrollReveal direction="right">
            <div className="lg:max-w-[650px]">
              <p className="text-base leading-8 text-brand-black/75 sm:text-lg">
                A entender dónde estás y hacia dónde quieres ir. El coaching te
                ayuda a pasar de la intención a la acción.
              </p>

              <div className="mt-5 flex items-center gap-3">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-green" />

                <p className="text-sm font-medium text-brand-brown/70">
                  Modalidad online · Sesiones personalizadas
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* =====================================================
            CARDS
        ====================================================== */}

        <div className="mt-14 grid items-stretch gap-5 lg:mt-16 lg:grid-cols-3">
          {services.map((service, index) => (
            <ScrollReveal
              key={service.title}
              direction="up"
              delay={index * 100}
              className="h-full"
            >
              <article
                className={`
                  fabric-card
                  group
                  relative
                  grid
                  h-full
                  min-h-[430px]
                  grid-rows-[auto_auto_1fr_auto]
                  overflow-hidden
                  rounded-[1.75rem]
                  p-7
                  shadow-[0_18px_45px_rgba(59,42,36,0.11)]
                  transition-all
                  duration-300
                  hover:-translate-y-1
                  hover:shadow-[0_24px_55px_rgba(59,42,36,0.16)]
                  sm:p-8
                  ${service.background}
                  ${service.text}
                `}
              >
                {/* =============================================
                    FILA 1 — número + precio
                ============================================== */}

                <div className="flex min-h-[62px] items-start justify-between">
                  <span className="pt-2 text-xs font-semibold tracking-[0.2em] opacity-70">
                    {service.number}
                  </span>

                  <div
                    className={`
                      flex
                      min-h-[58px]
                      min-w-[92px]
                      flex-col
                      items-center
                      justify-center
                      rounded-full
                      px-4
                      py-2
                      text-center
                      ${service.badge}
                    `}
                  >
                    <p className="text-lg font-semibold leading-none">
                      {service.price}
                    </p>

                    <p
                      className={`
                        mt-1
                        min-h-[10px]
                        text-[0.6rem]
                        font-semibold
                        tracking-[0.15em]
                        ${
                          service.priceLabel
                            ? "opacity-70"
                            : "opacity-0"
                        }
                      `}
                    >
                      {service.priceLabel || "MXN"}
                    </p>
                  </div>
                </div>

                {/* =============================================
                    FILA 2 — duración + título
                ============================================== */}

                <div className="mt-9">
                  <p className="min-h-[18px] text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
                    {service.detail}
                  </p>

                  <h3
                    className="
                      mt-3
                      min-h-[82px]
                      font-display
                      text-[2.25rem]
                      font-semibold
                      leading-[0.98]
                      sm:text-[2.4rem]
                    "
                  >
                    {service.title}
                  </h3>
                </div>

                {/* =============================================
                    FILA 3 — descripción
                ============================================== */}

                <div className="pt-5">
                  <p
                    className={`text-sm leading-7 sm:text-base ${service.softText}`}
                  >
                    {service.description}
                  </p>
                </div>

                {/* =============================================
                    FILA 4 — CTA
                ============================================== */}

                <div className="self-end pt-8">
                  <Link
                    href="/servicios"
                    className="
                      inline-flex
                      items-center
                      gap-5
                      border-b
                      border-current
                      pb-1
                      text-sm
                      font-semibold
                      transition-all
                      duration-300
                      group-hover:gap-7
                    "
                  >
                    Ver detalles

                    <span aria-hidden="true">→</span>
                  </Link>
                </div>

                {/* =============================================
                    DECORACIÓN INTERNA
                ============================================== */}

                <div
                  aria-hidden="true"
                  className="
                    pointer-events-none
                    absolute
                    -bottom-16
                    -right-16
                    h-40
                    w-40
                    rounded-full
                    border
                    border-current
                    opacity-15
                  "
                />

                <div
                  aria-hidden="true"
                  className="
                    pointer-events-none
                    absolute
                    -bottom-8
                    -right-8
                    h-24
                    w-24
                    rounded-full
                    border
                    border-current
                    opacity-10
                  "
                />
              </article>
            </ScrollReveal>
          ))}
        </div>

        {/* =====================================================
            CTA GENERAL
        ====================================================== */}

        <ScrollReveal direction="up">
          <div className="mt-10 flex justify-center">
            <Link
              href="/servicios"
              className="
                inline-flex
                items-center
                gap-7
                rounded-xl
                border
                border-brand-wine
                px-7
                py-3.5
                font-medium
                text-brand-wine
                transition-all
                duration-300
                hover:-translate-y-0.5
                hover:bg-brand-wine
                hover:text-white
              "
            >
              Conocer todos los servicios

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