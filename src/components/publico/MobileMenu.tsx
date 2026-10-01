"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/sobre-mi", label: "Sobre mí" },
  { href: "/servicios", label: "Servicios" },
  { href: "/testimonios", label: "Testimonios" },
  { href: "/recursos", label: "Recursos" },
  { href: "/contacto", label: "Contacto" },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);

        requestAnimationFrame(() => {
          menuButtonRef.current?.focus();
        });
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
  };

  return (
    <>
      {/* =====================================================
          HAMBURGUESA / X
      ====================================================== */}
      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="
          relative z-[120]
          flex h-11 w-11
          items-center justify-center
          lg:hidden
        "
      >
        {/* Línea superior */}
        <span
          aria-hidden="true"
          className={`
            absolute
            h-0.5 w-7
            rounded-full
            transition-all duration-300
            ${
              open
                ? "translate-y-0 rotate-45 bg-brand-cream"
                : "-translate-y-[7px] rotate-0 bg-brand-brown"
            }
          `}
        />

        {/* Línea central */}
        <span
          aria-hidden="true"
          className={`
            absolute
            h-0.5 w-7
            rounded-full
            transition-all duration-300
            ${
              open
                ? "scale-x-0 opacity-0 bg-brand-cream"
                : "scale-x-100 opacity-100 bg-brand-brown"
            }
          `}
        />

        {/* Línea inferior */}
        <span
          aria-hidden="true"
          className={`
            absolute
            h-0.5 w-7
            rounded-full
            transition-all duration-300
            ${
              open
                ? "translate-y-0 -rotate-45 bg-brand-cream"
                : "translate-y-[7px] rotate-0 bg-brand-brown"
            }
          `}
        />
      </button>

      {/* =====================================================
          MENÚ MOBILE
      ====================================================== */}
      <div
        id="mobile-menu"
        aria-hidden={!open}
        inert={!open}
        className={`
          fixed inset-0 z-[100]
          lg:hidden
          ${
            open
              ? "pointer-events-auto"
              : "pointer-events-none"
          }
        `}
      >
        {/* =================================================
            BURBUJA / FONDO
        ================================================== */}
        <div
          aria-hidden="true"
          className="
            absolute inset-0
            bg-brand-wine
            transition-[clip-path]
            duration-700
            ease-[cubic-bezier(0.76,0,0.24,1)]
            motion-reduce:duration-0
          "
          style={{
            clipPath: open
              ? "circle(150vmax at calc(100% - 44px) 36px)"
              : "circle(0px at calc(100% - 44px) 36px)",
          }}
        />

        {/* =================================================
            CONTENIDO
        ================================================== */}
        <div
          className={`
            relative z-10
            flex h-full flex-col
            px-7 pb-8 pt-6
            text-brand-cream
            transition-all
            duration-500
            ease-out
            motion-reduce:transition-none
            ${
              open
                ? "translate-y-0 opacity-100 delay-150"
                : "-translate-y-3 opacity-0 delay-0"
            }
          `}
        >
          {/* ===============================================
              LOGO
          ================================================ */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              onClick={closeMenu}
              className="
                font-display
                text-6xl
                leading-none
                text-brand-cream
              "
            >
              A<span className="text-brand-taupe">.</span>
            </Link>

            <div
              aria-hidden="true"
              className="h-11 w-11"
            />
          </div>

          {/* ===============================================
              NAVEGACIÓN
          ================================================ */}
          <nav
            aria-label="Navegación móvil"
            className="mt-14 flex flex-col"
          >
            {links.map((link, index) => {
              const isActive = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  aria-current={isActive ? "page" : undefined}
                  className={`
                    border-b
                    border-brand-cream/15
                    py-4
                    text-xl
                    font-medium
                    transition-all
                    duration-300
                    hover:pl-2
                    hover:text-brand-taupe

                    ${
                      isActive
                        ? "text-brand-taupe"
                        : "text-brand-cream"
                    }

                    ${
                      open
                        ? "translate-x-0 opacity-100"
                        : "translate-x-5 opacity-0"
                    }
                  `}
                  style={{
                    transitionDelay: open
                      ? `${180 + index * 55}ms`
                      : "0ms",
                  }}
                >
                  <span className="relative inline-block">
                    {link.label}

                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="
                          absolute
                          -bottom-2 left-0
                          h-0.5 w-full
                          bg-brand-taupe
                        "
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* ===============================================
              CTA
          ================================================ */}
          <div
            className={`
              mt-auto
              transition-all
              duration-500
              ${
                open
                  ? "translate-y-0 opacity-100"
                  : "translate-y-5 opacity-0"
              }
            `}
            style={{
              transitionDelay: open ? "430ms" : "0ms",
            }}
          >
            <Link
              href="/servicios"
              onClick={closeMenu}
              className="
                flex w-full
                items-center justify-between
                rounded-xl
                border
                border-brand-cream/70
                px-6 py-4
                text-lg
                font-medium
                text-brand-cream
                transition-colors
                hover:bg-brand-cream
                hover:text-brand-wine
              "
            >
              Agendar una cita

              <span
                aria-hidden="true"
                className="text-2xl"
              >
                →
              </span>
            </Link>

            <p
              className="
                mt-6
                text-center
                text-[0.65rem]
                uppercase
                tracking-[0.28em]
                text-brand-cream/50
              "
            >
              Coaching personal y profesional
            </p>
          </div>
        </div>
      </div>
    </>
  );
}