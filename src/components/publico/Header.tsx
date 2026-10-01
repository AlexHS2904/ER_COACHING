"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { navLinks, routes } from "@/lib/routes";

export default function Header() {
  const pathname = usePathname();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /* =========================================================
     DETECTAR SCROLL
  ========================================================= */

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  /* =========================================================
     CERRAR MOBILE MENU CON ESC
  ========================================================= */

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  /* =========================================================
     CERRAR MOBILE MENU AL CAMBIAR DE RUTA
  ========================================================= */

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header
      className={`
        sticky
        top-0
        z-50
        w-full
        transition-[padding,background-color]
        duration-300
        ease-out

        ${
          scrolled
            ? "bg-transparent px-3 pt-3 sm:px-5"
            : "bg-brand-cream px-0 pt-0"
        }
      `}
    >
      {/* =====================================================
          NAVBAR
      ====================================================== */}

      <div
        className={`
          mx-auto
          flex
          items-center
          justify-between
          transition-[height,max-width,border-radius,background-color,border-color,box-shadow,padding]
          duration-300
          ease-out

          ${
            scrolled
              ? `
                h-[68px]
                max-w-[1320px]
                rounded-[999px]
                border
                border-brand-taupe/20
                bg-brand-cream/60
                px-5
                shadow-[0_10px_35px_rgba(59,42,36,0.08)]
                backdrop-blur-xl
                sm:px-7
                lg:px-8
              `
              : `
                h-[92px]
                max-w-none
                rounded-none
                border-b
                border-brand-taupe/25
                bg-brand-cream
                px-5
                shadow-none
                sm:px-8
                lg:px-12
              `
          }
        `}
      >
        {/* ===================================================
            LOGO
        ==================================================== */}

        <Link
          href={routes.home}
          aria-label="Ir al inicio"
          className="
            relative
            z-10
            shrink-0
            font-display
            text-[3.3rem]
            font-medium
            leading-none
            tracking-[-0.05em]
            text-brand-brown
            transition-transform
            duration-200
            hover:scale-[1.03]
          "
        >
          A
          <span className="text-brand-wine">.</span>
        </Link>

        {/* ===================================================
            DESKTOP NAV
        ==================================================== */}

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-8 lg:flex"
        >
          {navLinks.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`
                  relative
                  py-2
                  text-[0.95rem]
                  font-medium
                  transition-colors
                  duration-200

                  ${
                    isActive
                      ? "text-brand-wine"
                      : "text-brand-black hover:text-brand-wine"
                  }
                `}
              >
                {link.label}

                <span
                  aria-hidden="true"
                  className={`
                    absolute
                    bottom-0
                    left-0
                    h-[1.5px]
                    bg-brand-wine
                    transition-[width]
                    duration-300

                    ${isActive ? "w-full" : "w-0"}
                  `}
                />
              </Link>
            );
          })}
        </nav>

        {/* ===================================================
            DESKTOP CTA
        ==================================================== */}

        <div className="hidden lg:block">
          <Link
            href={routes.booking}
            className={`
              inline-flex
              min-h-[48px]
              items-center
              justify-center
              rounded-xl
              bg-brand-wine
              px-6
              text-sm
              font-semibold
              text-brand-cream
              transition-[background-color,transform]
              duration-200

              hover:-translate-y-0.5
              hover:bg-brand-brown

              ${
                scrolled
                  ? "min-h-[44px] px-5"
                  : ""
              }
            `}
          >
            Agendar una cita
          </Link>
        </div>

        {/* ===================================================
            MOBILE HAMBURGER
        ==================================================== */}

        <button
          type="button"
          aria-label={
            menuOpen
              ? "Cerrar menú de navegación"
              : "Abrir menú de navegación"
          }
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((current) => !current)}
          className="
            relative
            z-20
            flex
            h-12
            w-12
            items-center
            justify-center
            rounded-full
            border
            border-brand-wine/20
            text-brand-wine
            transition-colors
            duration-200

            hover:bg-brand-wine
            hover:text-brand-cream

            lg:hidden
          "
        >
          <span className="sr-only">
            {menuOpen ? "Cerrar menú" : "Abrir menú"}
          </span>

          <span className="relative block h-[18px] w-[22px]">
            <span
              aria-hidden="true"
              className={`
                absolute
                left-0
                top-0
                h-[2px]
                w-full
                rounded-full
                bg-current
                transition-[transform,top]
                duration-300

                ${
                  menuOpen
                    ? "top-[8px] rotate-45"
                    : "top-0 rotate-0"
                }
              `}
            />

            <span
              aria-hidden="true"
              className={`
                absolute
                left-0
                top-[8px]
                h-[2px]
                w-full
                rounded-full
                bg-current
                transition-opacity
                duration-200

                ${menuOpen ? "opacity-0" : "opacity-100"}
              `}
            />

            <span
              aria-hidden="true"
              className={`
                absolute
                bottom-0
                left-0
                h-[2px]
                w-full
                rounded-full
                bg-current
                transition-[transform,bottom]
                duration-300

                ${
                  menuOpen
                    ? "bottom-[8px] -rotate-45"
                    : "bottom-0 rotate-0"
                }
              `}
            />
          </span>
        </button>
      </div>

      {/* =====================================================
          MOBILE MENU
      ====================================================== */}

      <div
        id="mobile-navigation"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={`
          mx-auto
          max-w-[1320px]
          overflow-hidden
          border
          border-brand-taupe/20
          bg-brand-cream/95
          shadow-[0_18px_50px_rgba(59,42,36,0.12)]
          backdrop-blur-xl

          transition-[opacity,transform,max-height,margin]
          duration-300
          ease-[cubic-bezier(0.22,1,0.36,1)]

          lg:hidden

          ${
            menuOpen
              ? `
                pointer-events-auto
                mt-2
                max-h-[600px]
                translate-y-0
                scale-100
                rounded-[1.75rem]
                opacity-100
              `
              : `
                pointer-events-none
                mt-0
                max-h-0
                -translate-y-3
                scale-[0.98]
                rounded-[1.75rem]
                opacity-0
              `
          }
        `}
      >
        <nav
          aria-label="Navegación móvil"
          className="flex flex-col p-4"
        >
          {navLinks.map((link, index) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                style={{
                  transitionDelay: menuOpen
                    ? `${70 + index * 45}ms`
                    : "0ms",
                }}
                className={`
                  flex
                  min-h-[54px]
                  items-center
                  justify-between
                  rounded-xl
                  px-4
                  text-base
                  font-medium

                  transition-[color,background-color,padding,opacity,transform]
                  duration-300
                  ease-out

                  ${
                    menuOpen
                      ? "translate-y-0 opacity-100"
                      : "-translate-y-2 opacity-0"
                  }

                  ${
                    isActive
                      ? `
                        bg-brand-wine/8
                        pl-5
                        text-brand-wine
                      `
                      : `
                        text-brand-brown
                        hover:bg-brand-taupe/10
                        hover:text-brand-wine
                      `
                  }
                `}
              >
                <span>{link.label}</span>

                {isActive && (
                  <span
                    aria-hidden="true"
                    className="
                      h-2
                      w-2
                      rounded-full
                      bg-brand-wine
                    "
                  />
                )}
              </Link>
            );
          })}

          {/* ===============================================
              MOBILE CTA
          ================================================ */}

          <Link
            href={routes.booking}
            style={{
              transitionDelay: menuOpen
                ? `${70 + navLinks.length * 45}ms`
                : "0ms",
            }}
            className={`
              group
              mt-3
              flex
              min-h-[56px]
              items-center
              justify-between
              rounded-xl
              bg-brand-wine
              px-5
              font-semibold
              text-brand-cream

              transition-[background-color,opacity,transform]
              duration-300
              ease-out

              hover:bg-brand-brown

              ${
                menuOpen
                  ? "translate-y-0 opacity-100"
                  : "-translate-y-2 opacity-0"
              }
            `}
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
        </nav>
      </div>
    </header>
  );
}