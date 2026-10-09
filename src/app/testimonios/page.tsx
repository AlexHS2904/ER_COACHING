import type { Metadata } from "next";
import Link from "next/link";

import Header from "@/components/publico/Header";
import Footer from "@/components/publico/Footer";

import TestimonialsExplorer from "@/components/reviews/TestimonialsExplorer";

import {
  getPublicTestimonials,
} from "@/lib/reviews/get-public-testimonials";

export const metadata: Metadata = {
  title: "Testimonios",
  description:
    "Conoce las experiencias de personas que han vivido sesiones y procesos de coaching con Edna Rojo.",
};

export const dynamic =
  "force-dynamic";

export default async function TestimonialsPage() {
  const testimonials =
    await getPublicTestimonials();

  return (
    <>
      <Header />

      <main
        className="
          min-h-screen
          bg-brand-cream
          text-brand-brown
        "
      >
        {/* =================================================
            HERO
        ================================================== */}

        <section
          className="
            px-5
            pb-14
            pt-20
            sm:px-8
            sm:pb-20
            sm:pt-28
            lg:px-12
          "
        >
          <div
            className="
              mx-auto
              max-w-[1280px]
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.28em]
                text-brand-wine
              "
            >
              Experiencias reales
            </p>

            <h1
              className="
                mt-5
                max-w-[900px]
                font-display
                text-5xl
                font-semibold
                leading-[0.95]
                tracking-[-0.02em]
                text-brand-brown
                sm:text-6xl
                lg:text-7xl
              "
            >
              Historias de personas
              que decidieron avanzar.
            </h1>

            <p
              className="
                mt-6
                max-w-[650px]
                text-base
                leading-7
                text-brand-brown/55
                sm:text-lg
              "
            >
              Cada proceso se vive de
              manera distinta. Aquí
              puedes conocer experiencias
              compartidas por personas
              que han trabajado en sus
              objetivos, decisiones y
              crecimiento personal.
            </p>
          </div>
        </section>

        {/* =================================================
            TESTIMONIOS + FILTROS
        ================================================== */}

        <section
          className="
            px-5
            pb-24
            sm:px-8
            lg:px-12
          "
        >
          <div
            className="
              mx-auto
              max-w-[1280px]
            "
          >
            {testimonials.length > 0 ? (
              <TestimonialsExplorer
                testimonials={
                  testimonials
                }
              />
            ) : (
              <div
                className="
                  rounded-[2rem]
                  border
                  border-brand-taupe/20
                  bg-white/55
                  px-6
                  py-16
                  text-center
                  sm:px-10
                "
              >
                <p
                  className="
                    text-xs
                    font-semibold
                    uppercase
                    tracking-[0.22em]
                    text-brand-wine
                  "
                >
                  Testimonios
                </p>

                <h2
                  className="
                    mt-4
                    font-display
                    text-4xl
                    font-semibold
                    text-brand-brown
                  "
                >
                  Próximamente encontrarás
                  experiencias aquí.
                </h2>

                <p
                  className="
                    mx-auto
                    mt-4
                    max-w-[560px]
                    text-sm
                    leading-7
                    text-brand-brown/50
                  "
                >
                  Los testimonios se
                  publican únicamente
                  después de haber sido
                  autorizados por la
                  persona y revisados
                  previamente.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* =================================================
            CTA FINAL
        ================================================== */}

        <section
          className="
            border-t
            border-brand-taupe/20
            bg-white/25
            px-5
            py-20
            sm:px-8
            sm:py-24
            lg:px-12
          "
        >
          <div
            className="
              mx-auto
              max-w-[850px]
              text-center
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.25em]
                text-brand-green
              "
            >
              Tu proceso
            </p>

            <h2
              className="
                mt-4
                font-display
                text-4xl
                font-semibold
                leading-tight
                text-brand-brown
                sm:text-5xl
              "
            >
              Tu experiencia también
              puede comenzar aquí.
            </h2>

            <p
              className="
                mx-auto
                mt-5
                max-w-[590px]
                text-base
                leading-7
                text-brand-brown/55
              "
            >
              Explora las opciones de
              coaching y encuentra el
              acompañamiento que mejor
              se adapte al momento que
              estás viviendo.
            </p>

            <div
              className="
                mt-8
                flex
                flex-col
                items-center
                justify-center
                gap-3
                sm:flex-row
              "
            >
              <Link
                href="/reservar"
                className="
                  inline-flex
                  min-h-[52px]
                  items-center
                  justify-center
                  rounded-xl
                  bg-brand-wine
                  px-7
                  font-semibold
                  text-white
                  transition
                  hover:opacity-90
                "
              >
                Agendar cita
              </Link>

              <Link
                href="/servicios"
                className="
                  inline-flex
                  min-h-[52px]
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-brand-taupe/30
                  px-7
                  font-semibold
                  text-brand-brown
                  transition
                  hover:border-brand-wine
                  hover:text-brand-wine
                "
              >
                Ver servicios
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}