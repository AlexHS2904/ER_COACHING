
import Link from "next/link";

import { routes } from "@/lib/routes";

const footerLinks = [
  { label: "Sobre mí", href: routes.about },
  { label: "Servicios", href: routes.services },
  { label: "Testimonios", href: routes.testimonials },
  { label: "Recursos", href: routes.resources },
  { label: "Contacto", href: routes.contact },
];

const legalLinks = [
  {
    label: "Aviso de privacidad",
    href: "/aviso-de-privacidad",
  },
  {
    label: "Términos y condiciones",
    href: "/terminos-y-condiciones",
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#e5d9d2] text-brand-brown">
      {/* Línea superior */}
      <div
        aria-hidden="true"
        className="h-[3px] w-full bg-brand-wine"
      />

      {/* Textura decorativa solo desde tablet */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          hidden opacity-[0.07]
          bg-[radial-gradient(rgba(59,42,36,0.18)_0.55px,transparent_0.8px)]
          bg-[size:20px_20px]
          md:block
        "
      />

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        {/* ===============================================
            PARTE PRINCIPAL
        ================================================ */}
        <div
          className="
            flex flex-col gap-8
            py-10
            sm:py-12
            lg:flex-row
            lg:items-center
            lg:justify-between
          "
        >
          {/* Logo + frase */}
          <div className="max-w-[390px]">
            <Link
              href={routes.home}
              aria-label="Ir al inicio"
              className="inline-block"
            >
              <span className="font-display text-5xl leading-none text-brand-wine">
                A.
              </span>
            </Link>

            <p className="mt-3 text-sm leading-6 text-brand-brown/60">
              Coaching para avanzar con mayor claridad,
              intención y propósito.
            </p>
          </div>

          {/* =============================================
              NAVEGACIÓN
          ============================================== */}
          <nav aria-label="Navegación del footer">
            <ul
              className="
                flex flex-wrap gap-x-6 gap-y-3
                text-sm font-medium
                text-brand-brown/65
              "
            >
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="
                      transition-colors duration-200
                      hover:text-brand-wine
                      focus-visible:rounded-sm
                      focus-visible:outline-2
                      focus-visible:outline-offset-4
                      focus-visible:outline-brand-wine
                    "
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* =============================================
              CTA
          ============================================== */}
          <Link
            href={routes.booking}
            className="
              group inline-flex w-fit
              items-center gap-5
              rounded-xl
              bg-brand-wine
              px-5 py-3
              text-sm font-semibold
              text-brand-cream
              transition-[background-color,transform]
              duration-300
              hover:bg-[#592129]
              md:hover:-translate-y-0.5
              focus-visible:outline-2
              focus-visible:outline-offset-4
              focus-visible:outline-brand-wine
            "
          >
            Agendar sesión

            <span
              aria-hidden="true"
              className="
                transition-transform duration-300
                group-hover:translate-x-1
              "
            >
              →
            </span>
          </Link>
        </div>

        {/* ===============================================
            CIERRE Y ENLACES LEGALES
        ================================================ */}
        <div
          className="
            flex flex-col gap-4
            border-t border-brand-brown/15
            py-6
            sm:gap-3
          "
        >
          {/* Copyright y ubicación */}
          <div
            className="
              flex flex-col gap-2
              sm:flex-row
              sm:items-center
              sm:justify-between
            "
          >
            <p className="text-xs text-brand-brown/65">
              © {new Date().getFullYear()} Edna Rojo Coaching.
              Todos los derechos reservados.
            </p>

            <p className="text-xs text-brand-brown/55">
              Sesiones online · México
            </p>
          </div>

          {/* Enlaces legales */}
          <nav aria-label="Información legal">
            <ul
              className="
                flex flex-wrap items-center
                gap-x-5 gap-y-2
              "
            >
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="
                      text-xs text-brand-brown/65
                      underline-offset-4
                      transition-colors duration-200
                      hover:text-brand-wine
                      hover:underline
                      focus-visible:rounded-sm
                      focus-visible:outline-2
                      focus-visible:outline-offset-4
                      focus-visible:outline-brand-wine
                    "
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
