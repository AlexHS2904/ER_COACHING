"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/sobre-mi", label: "Sobre mí" },
  { href: "/servicios", label: "Servicios" },
  { href: "/testimonios", label: "Testimonios" },
  { href: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
  { href: "/contacto", label: "Contacto" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="hidden items-center gap-8 lg:flex"
    >
      {links.map((link) => {
        const isActive = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`relative py-2 text-sm font-medium transition-colors ${
              isActive
                ? "text-brand-wine"
                : "text-brand-black hover:text-brand-wine"
            }`}
          >
            {link.label}

            {isActive && (
              <span className="absolute bottom-0 left-0 h-0.5 w-full bg-brand-wine" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}