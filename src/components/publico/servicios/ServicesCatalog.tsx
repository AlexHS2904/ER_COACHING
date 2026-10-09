import Link from "next/link";

import type { Service } from "@/lib/data/services";
import { routes } from "@/lib/routes";
import { getQuoteWhatsAppUrl } from "@/lib/whatsapp";

type ServicesCatalogProps = {
  services: Service[];
};

const accents = [
  {
    dot: "bg-brand-wine",
    price: "text-brand-wine",
    number: "text-brand-wine",
    button:
      "border-brand-wine text-brand-wine hover:bg-brand-wine hover:text-brand-cream",
  },
  {
    dot: "bg-brand-green",
    price: "text-brand-green",
    number: "text-brand-green",
    button:
      "border-brand-green text-brand-green hover:bg-brand-green hover:text-brand-cream",
  },
  {
    dot: "bg-brand-taupe",
    price: "text-brand-brown",
    number: "text-brand-brown",
    button:
      "border-brand-brown text-brand-brown hover:bg-brand-brown hover:text-brand-cream",
  },
];

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

  return null;
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

export default function ServicesCatalog({
  services,
}: ServicesCatalogProps) {
  return (
    <section className="bg-brand-cream py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-12">
        {/* =========================================
            INTRO
        ========================================== */}

        <div className="mx-auto max-w-[760px] text-center">
          <div className="mb-5 flex items-center justify-center gap-4">
            <span
              aria-hidden="true"
              className="h-px w-10 bg-brand-wine"
            />

            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-brand-wine">
              Servicios
            </p>

            <span
              aria-hidden="true"
              className="h-px w-10 bg-brand-wine"
            />
          </div>

          <h1
            className="
              font-display
              text-[3.2rem]
              font-semibold
              leading-[1.2]
              tracking-[-0.025em]
              text-brand-brown
              sm:text-6xl
              lg:text-[3.2rem]
            "
          >
            Encuentra el acompañamiento
            <span className="font-accent italic text-brand-wine">
              {" "}
              que mejor encaje contigo.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-[600px] text-base leading-7 text-brand-black/65 sm:text-lg">
            Elige según lo que necesitas trabajar y el nivel de acompañamiento
            que buscas.
          </p>
        </div>

        {/* =========================================
            SERVICIOS
        ========================================== */}

        {services.length > 0 ? (
          <div className="mt-14 grid gap-5 lg:mt-16 lg:grid-cols-3">
            {services.map((service, index) => {
              const accent = accents[index % accents.length];
              const detail = getServiceDetail(service);
              const price = formatPrice(service);

              const bookingHref = `${routes.booking}?service=${encodeURIComponent(
                service.slug,
              )}`;

              return (
                <article
                  key={service.id}
                  className="
                    relative
                    flex
                    h-full
                    flex-col
                    rounded-[1.75rem]
                    border
                    border-brand-taupe/25
                    bg-white/65
                    p-6
                    sm:p-7
                    lg:p-8
                  "
                >
                  {/* Número + indicador */}

                  <div className="flex items-start justify-between">
                    <p
                      className={`
                        text-xs
                        font-semibold
                        tracking-[0.2em]
                        ${accent.number}
                      `}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </p>

                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full ${accent.dot}`}
                    />
                  </div>

                  {/* Nombre */}

                  <div className="mt-10">
                    {detail && (
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-brand-brown/50">
                        {detail}
                      </p>
                    )}

                    <h2
                      className="
                        mt-3
                        font-display
                        text-[2.15rem]
                        font-semibold
                        leading-[0.98]
                        text-brand-brown
                        sm:text-[2.3rem]
                      "
                    >
                      {service.name}
                    </h2>
                  </div>

                  {/* Descripción */}

                  <p className="mt-5 flex-1 text-sm leading-7 text-brand-black/65 sm:text-base">
                    {service.short_description}
                  </p>

                  {/* Precio */}

                  <div className="mt-8 border-t border-brand-taupe/25 pt-6">
                    <div className="flex items-end gap-2">
                      <p
                        className={`
                          font-display
                          text-[2.4rem]
                          font-semibold
                          leading-none
                          ${accent.price}
                        `}
                      >
                        {price}
                      </p>

                      {!service.requires_quote &&
                        service.price !== null && (
                          <span className="pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand-brown/45">
                            {service.currency}
                          </span>
                        )}
                    </div>
                  </div>

                  {/* =========================================
                      BOTÓN
                  ========================================== */}

                  {service.requires_quote ? (
                    <a
                      href={getQuoteWhatsAppUrl(service.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`
                        group
                        mt-7
                        flex
                        min-h-[52px]
                        w-full
                        items-center
                        justify-between
                        rounded-xl
                        border
                        px-5
                        text-sm
                        font-semibold
                        transition-colors
                        duration-200
                        ${accent.button}
                      `}
                    >
                      <span>Solicitar cotización</span>

                      <span
                        aria-hidden="true"
                        className="
                          text-lg
                          transition-transform
                          duration-200
                          group-hover:translate-x-1
                        "
                      >
                        →
                      </span>
                    </a>
                  ) : service.booking_enabled ? (
                    <Link
                      href={bookingHref}
                      className={`
                        group
                        mt-7
                        flex
                        min-h-[52px]
                        w-full
                        items-center
                        justify-between
                        rounded-xl
                        border
                        px-5
                        text-sm
                        font-semibold
                        transition-colors
                        duration-200
                        ${accent.button}
                      `}
                    >
                      <span>Agendar sesión</span>

                      <span
                        aria-hidden="true"
                        className="
                          text-lg
                          transition-transform
                          duration-200
                          group-hover:translate-x-1
                        "
                      >
                        →
                      </span>
                    </Link>
                  ) : (
                    <Link
                      href={routes.contact}
                      className={`
                        group
                        mt-7
                        flex
                        min-h-[52px]
                        w-full
                        items-center
                        justify-between
                        rounded-xl
                        border
                        px-5
                        text-sm
                        font-semibold
                        transition-colors
                        duration-200
                        ${accent.button}
                      `}
                    >
                      <span>Más información</span>

                      <span
                        aria-hidden="true"
                        className="
                          text-lg
                          transition-transform
                          duration-200
                          group-hover:translate-x-1
                        "
                      >
                        →
                      </span>
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-16 text-center">
            <p className="text-brand-black/60">
              No hay servicios disponibles por el momento.
            </p>
          </div>
        )}

        {/* =========================================
            CTA GENERAL
        ========================================== */}

        <div className="mx-auto mt-16 max-w-[650px] text-center lg:mt-20">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-brand-wine">
            Tu siguiente paso
          </p>

          <h2 className="mt-4 font-display text-4xl font-semibold leading-[1] text-brand-brown sm:text-5xl">
            Tu proceso puede empezar aquí.
          </h2>

          <Link
            href={routes.booking}
            className="
              group
              mx-auto
              mt-8
              flex
              min-h-[58px]
              w-full
              max-w-[330px]
              items-center
              justify-between
              rounded-xl
              bg-brand-wine
              px-6
              font-semibold
              text-brand-cream
              transition-colors
              duration-200
              hover:bg-brand-brown
            "
          >
            <span>Agendar una cita</span>

            <span
              aria-hidden="true"
              className="
                text-xl
                transition-transform
                duration-200
                group-hover:translate-x-1
              "
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}