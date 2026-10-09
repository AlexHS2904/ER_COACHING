import type { Metadata } from "next";

import Header from "@/components/publico/Header";
import Footer from "@/components/publico/Footer";

import ContactForm from "@/components/publico/contacto/ContactoForm";
import SocialLinks from "@/components/publico/contacto/SocialLinks";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Ponte en contacto con Edna Rojo para resolver dudas sobre sesiones, procesos de coaching, talleres y acompañamiento.",
};

export default function ContactPage() {
  return (
    <>
      <Header />

      <main
        className="
          bg-brand-cream
          text-brand-brown
        "
      >
        {/* =================================================
            01 · CONTACTO
        ================================================== */}

        <section
          className="
            px-5
            pb-20
            pt-20
            sm:px-8
            sm:pb-24
            sm:pt-28
            lg:px-12
            lg:pb-28
          "
        >
          <div
            className="
              mx-auto
              max-w-[1280px]
            "
          >
            {/* HEADER */}

            <div
              className="
                max-w-[820px]
              "
            >
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.3em]
                  text-brand-wine
                "
              >
                Contacto
              </p>

              <h1
                className="
                  mt-5
                  font-display
                  text-5xl
                  font-semibold
                  leading-[0.95]
                  tracking-[-0.03em]
                  text-brand-brown
                  sm:text-6xl
                  lg:text-7xl
                "
              >
                Hablemos sobre lo que
                quieres lograr.
              </h1>

              <p
                className="
                  mt-6
                  max-w-[640px]
                  text-base
                  leading-7
                  text-brand-brown/55
                  sm:text-lg
                "
              >
                Si tienes alguna duda sobre las
                sesiones, el proceso de coaching o
                quieres conocer más sobre talleres y
                sesiones grupales, puedes escribirme
                desde aquí.
              </p>
            </div>

            {/* CONTENIDO */}

            <div
              className="
                mt-14
                grid
                gap-6
                lg:grid-cols-[0.72fr_1.28fr]
                lg:items-start
              "
            >
              {/* INFORMACIÓN */}

              <aside
                className="
                  rounded-[2rem]
                  bg-brand-wine
                  p-7
                  text-brand-cream
                  sm:p-9
                  lg:sticky
                  lg:top-28
                "
              >
                <p
                  className="
                    text-[0.68rem]
                    font-semibold
                    uppercase
                    tracking-[0.28em]
                    text-brand-cream/60
                  "
                >
                  Antes de escribir
                </p>

                <h2
                  className="
                    mt-4
                    font-display
                    text-4xl
                    font-semibold
                    leading-[1]
                  "
                >
                  Estoy aquí para
                  escucharte.
                </h2>

                <p
                  className="
                    mt-5
                    text-sm
                    leading-7
                    text-brand-cream/70
                    sm:text-base
                  "
                >
                  Puedes utilizar este formulario para
                  resolver dudas, conocer qué opción de
                  acompañamiento puede adaptarse mejor a
                  ti o conversar sobre una propuesta
                  para grupos.
                </p>

                <div
                  className="
                    mt-8
                    border-t
                    border-brand-cream/15
                    pt-6
                  "
                >
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-[0.22em]
                      text-brand-cream/50
                    "
                  >
                    Para reservar
                  </p>

                  <p
                    className="
                      mt-3
                      text-sm
                      leading-6
                      text-brand-cream/70
                    "
                  >
                    Si ya sabes qué servicio quieres,
                    puedes utilizar directamente la
                    sección de reservas para consultar
                    fechas y horarios disponibles.
                  </p>

                  <a
                    href="/reservar"
                    className="
                      group
                      mt-5
                      inline-flex
                      items-center
                      gap-4
                      text-sm
                      font-semibold
                      text-brand-cream
                    "
                  >
                    Agendar una cita

                    <span
                      className="
                        transition-transform
                        duration-200
                        group-hover:translate-x-1
                      "
                    >
                      →
                    </span>
                  </a>
                </div>

                <div
                  className="
                    mt-8
                    flex
                    items-center
                    gap-2
                    border-t
                    border-brand-cream/15
                    pt-6
                  "
                >
                  <span
                    className="
                      h-2.5
                      w-2.5
                      rounded-full
                      bg-brand-cream
                    "
                  />

                  <span
                    className="
                      h-2.5
                      w-2.5
                      rounded-full
                      bg-brand-green
                    "
                  />

                  <span
                    className="
                      h-2.5
                      w-2.5
                      rounded-full
                      bg-brand-taupe
                    "
                  />
                </div>
              </aside>

              {/* FORMULARIO */}

              <ContactForm />
            </div>
          </div>
        </section>

        {/* =================================================
            02 · REDES
        ================================================== */}

        <SocialLinks />
      </main>

      <Footer />
    </>
  );
}