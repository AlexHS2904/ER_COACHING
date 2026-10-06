import Link from "next/link";

import ScrollReveal from "@/components/ui/ScrollReveal";
import FabricDecor from "@/components/ui/FabricDecor";

import HomeServicesShowcase, {
  type HomeService,
} from "@/components/publico/home/HomeServicesShowcase";

import {
  routes,
} from "@/lib/routes";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export default async function ServicesSection() {
  const supabase =
    getSupabaseAdmin();

  /*
    HOME:
    solamente los primeros 3 servicios
    ACTIVOS según display_order.
  */

  const {
    data,
    error,
  } = await supabase
    .from("services")
    .select(`
      id,
      name,
      slug,
      short_description,
      service_type,
      duration_minutes,
      session_count,
      price,
      currency,
      requires_quote,
      booking_enabled
    `)
    .eq(
      "active",
      true,
    )
    .order(
      "display_order",
      {
        ascending:
          true,
      },
    )
    .limit(3);

  if (error) {
    console.error(
      "Home services error:",
      error,
    );
  }

  const services:
    HomeService[] =
    (data ?? []).map(
      (service) => ({
        id:
          service.id,

        name:
          service.name,

        slug:
          service.slug,

        short_description:
          service.short_description,

        service_type:
          service.service_type as
            | "single"
            | "package"
            | "group",

        duration_minutes:
          service.duration_minutes,

        session_count:
          service.session_count,

        price:
          service.price ===
          null
            ? null
            : Number(
                service.price,
              ),

        currency:
          service.currency,

        requires_quote:
          service.requires_quote,

        booking_enabled:
          service.booking_enabled,
      }),
    );

  return (
    <section
      className="
        fabric-background
        relative
        overflow-hidden
        py-20
        sm:py-24
        lg:py-28
      "
    >
      <FabricDecor variant="soft" />

      <div
        className="
          relative
          z-10
          mx-auto
          max-w-[1450px]
          px-5
          sm:px-8
          lg:px-12
        "
      >
        {/* ================================================
            CABECERA
        ================================================ */}

        <div
          className="
            grid
            gap-8
            lg:grid-cols-[0.9fr_1.1fr]
            lg:items-end
            lg:gap-20
          "
        >
          <ScrollReveal direction="left">
            <div>
              <div
                className="
                  mb-5
                  flex
                  items-center
                  gap-4
                "
              >
                <span
                  className="
                    h-0.5
                    w-12
                    bg-brand-wine
                  "
                />

                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.3em]
                    text-brand-black
                    sm:text-sm
                  "
                >
                  Servicios
                </p>
              </div>

              <h2
                className="
                  font-display
                  text-5xl
                  font-semibold
                  leading-[0.95]
                  tracking-[-0.02em]
                  text-brand-brown
                  sm:text-6xl
                  lg:text-[4.5rem]
                "
              >
                ¿En qué puedo{" "}

                <span
                  className="
                    font-accent
                    italic
                    text-brand-wine
                  "
                >
                  ayudarte?
                </span>
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right">
            <div className="lg:max-w-[650px]">
              <p
                className="
                  text-base
                  leading-8
                  text-brand-black/75
                  sm:text-lg
                "
              >
                A entender dónde estás y hacia dónde quieres ir.
                El coaching te ayuda a pasar de la intención a
                la acción.
              </p>

              <div
                className="
                  mt-5
                  flex
                  items-center
                  gap-3
                "
              >
                <span
                  className="
                    h-2
                    w-2
                    shrink-0
                    rounded-full
                    bg-brand-green
                  "
                />

                <p
                  className="
                    text-sm
                    font-medium
                    text-brand-brown/70
                  "
                >
                  Modalidad online · Sesiones personalizadas
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* ================================================
            SERVICIOS
        ================================================ */}

        <ScrollReveal direction="up">
          <HomeServicesShowcase
            services={
              services
            }
          />
        </ScrollReveal>

        {/* ================================================
            TODOS LOS SERVICIOS
        ================================================ */}

        <ScrollReveal direction="up">
          <div
            className="
              mt-10
              flex
              justify-center
            "
          >
            <Link
              href={
                routes.services
              }
              className="
                inline-flex
                items-center
                gap-4
                border-b
                border-brand-wine
                pb-1
                text-sm
                font-semibold
                text-brand-wine
                transition-all
                duration-300
                hover:gap-6
              "
            >
              Conocer todos los servicios

              <span
                aria-hidden="true"
                className="text-xl"
              >
                →
              </span>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}