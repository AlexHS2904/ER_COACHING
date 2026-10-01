"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navLinks } from "@/lib/routes";

export default function NavLinks() {
  const pathname = usePathname();

  return (
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
              relative py-2
              text-sm font-medium
              transition-colors duration-200
              ${
                isActive
                  ? "text-brand-wine"
                  : "text-brand-black hover:text-brand-wine"
              }
            `}
          >
            {link.label}

            {isActive && (
              <span
                aria-hidden="true"
                className="
                  absolute bottom-0 left-0
                  h-0.5 w-full
                  bg-brand-wine
                "
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}