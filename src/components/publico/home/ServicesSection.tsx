import Link from "next/link";

import ScrollReveal from "@/components/ui/ScrollReveal";
import FabricDecor from "@/components/ui/FabricDecor";

import {
  getActiveServices,
  type Service,
} from "@/lib/data/services";

import { routes } from "@/lib/routes";

/* =========================================================
   ESTILOS VISUALES

   Los datos del servicio vienen de Supabase.
   Estos estilos pertenecen al diseño de la web, por eso
   sí tiene sentido mantenerlos aquí.

   Si en el futuro hay más de 3 servicios, los colores
   simplemente se repiten.
========================================================= */

const cardStyles = [
  {
    background: "bg-brand-wine",
    text: "text-brand-cream",
    softText: "text-brand-cream/75",
    badge: "bg-brand-cream text-brand-wine",
  },
  {
    background: "bg-brand-green",
    text: "text-brand-cream",
    softText: "text-brand-cream/75",
    badge: "bg-brand-cream text-brand-green",
  },
  {
    background: "bg-[#c4afa6]",
    text: "text-[#684d43]",
    softText: "text-[#684d43]/75",
    badge: "bg-brand-cream text-[#684d43]",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function getServiceDetail(service: Service) {
  if (service.session_count && service.session_count > 1) {
    return `${service.session_count} sesiones`;
  }

  if (service.duration_minutes) {
    return `${service.duration_minutes} min`;
  }

  if (service.requires_quote) {
    return "Para grupos";
  }

  return "Servicio";
}

function formatPrice(service: Service) {
  if (service.requires_quote || service.price === null) {
    return "Cotiza";
  }

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: service.currency,
    maximumFractionDigits: 0,
  }).format(service.price);
}

/* =========================================================
   COMPONENTE
========================================================= */

export default async function ServicesSection() {
  const services = await getActiveServices();

  return (
    <section className="fabric-background relative overflow-hidden py-20 sm:py-24 lg:py-28">
      {/* =====================================================
          DECORACIÓN DE FONDO
      ====================================================== */}

      {/* Evitamos FabricDecor complejo en mobile */}
      <div className="hidden md:block">
        <FabricDecor variant="soft" />
      </div>

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
                <span
                  aria-hidden="true"
                  className="h-0.5 w-12 bg-brand-wine"
                />

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
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full bg-brand-green"
                />

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

        {services.length > 0 ? (
          <div className="mt-14 grid items-stretch gap-5 lg:mt-16 lg:grid-cols-3">
            {services.map((service, index) => {
              const style =
                cardStyles[index % cardStyles.length];

              const detail = getServiceDetail(service);
              const price = formatPrice(service);

              return (
                <ScrollReveal
                  key={service.id}
                  direction="up"
                  delay={index * 60}
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

                      md:shadow-[0_18px_45px_rgba(59,42,36,0.11)]
                      md:transition-[transform,box-shadow]
                      md:duration-300
                      md:hover:-translate-y-1
                      md:hover:shadow-[0_24px_55px_rgba(59,42,36,0.16)]

                      sm:p-8

                      ${style.background}
                      ${style.text}
                    `}
                  >
                    {/* =============================================
                        FILA 1 — número + precio
                    ============================================== */}

                    <div className="flex min-h-[62px] items-start justify-between">
                      <span className="pt-2 text-xs font-semibold tracking-[0.2em] opacity-70">
                        {String(index + 1).padStart(2, "0")}
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
                          ${style.badge}
                        `}
                      >
                        <p className="text-lg font-semibold leading-none">
                          {price}
                        </p>

                        <p
                          className="
                            mt-1
                            min-h-[10px]
                            text-[0.6rem]
                            font-semibold
                            tracking-[0.15em]
                            opacity-70
                          "
                        >
                          {service.currency || "MXN"}
                        </p>
                      </div>
                    </div>

                    {/* =============================================
                        FILA 2 — duración + título
                    ============================================== */}

                    <div className="mt-9">
                      <p className="min-h-[18px] text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
                        {detail}
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
                        {service.name}
                      </h3>
                    </div>

                    {/* =============================================
                        FILA 3 — descripción
                    ============================================== */}

                    <div className="pt-5">
                      <p
                        className={`
                          text-sm leading-7
                          sm:text-base
                          ${style.softText}
                        `}
                      >
                        {service.short_description}
                      </p>
                    </div>

                    {/* =============================================
                        FILA 4 — CTA
                    ============================================== */}

                    <div className="self-end pt-8">
                      <Link
                        href={routes.services}
                        className="
                          inline-flex
                          items-center
                          gap-5
                          border-b
                          border-current
                          pb-1
                          text-sm
                          font-semibold
                          transition-[gap]
                          duration-300
                          md:group-hover:gap-7
                        "
                      >
                        Ver detalles

                        <span aria-hidden="true">
                          →
                        </span>
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
              );
            })}
          </div>
        ) : (
          <div className="mt-14 text-center">
            <p className="text-brand-black/60">
              No hay servicios disponibles por el momento.
            </p>
          </div>
        )}

        {/* =====================================================
            CTA GENERAL
        ====================================================== */}

        <ScrollReveal direction="up">
          <div className="mt-10 flex justify-center">
            <Link
              href={routes.services}
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
                transition-colors
                duration-200
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