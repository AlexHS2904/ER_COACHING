import Link from "next/link";

import MobileMenu from "@/components/publico/MobileMenu";
import NavLinks from "@/components/publico/NavLinks";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-taupe/30 bg-brand-cream">
      <div className="mx-auto flex h-[72px] max-w-[1450px] items-center justify-between px-5 sm:h-20 sm:px-8 lg:px-12">
        {/* LOGO */}
        <Link
          href="/"
          aria-label="Ir al inicio"
          className="animate-header-item font-display text-5xl leading-none text-brand-brown sm:text-6xl"
        >
          A<span className="text-brand-wine">.</span>
        </Link>

        {/* DESKTOP NAV */}
        <div className="animate-header-item hidden lg:block">
          <NavLinks />
        </div>

        {/* ACCIONES */}
        <div className="flex items-center gap-3">
          <Link
            href="/servicios"
            className="animate-header-item hidden rounded-xl bg-brand-wine px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-brown sm:inline-flex lg:px-6"
          >
            Agendar una cita
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}