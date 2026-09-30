import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight text-neutral-900"
        >
          Coaching
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-8 md:flex"
        >
          <Link
            href="/sobre-mi"
            className="text-sm text-neutral-700 transition hover:text-neutral-950"
          >
            Sobre mí
          </Link>

          <Link
            href="/servicios"
            className="text-sm text-neutral-700 transition hover:text-neutral-950"
          >
            Servicios
          </Link>

          <Link
            href="/recursos"
            className="text-sm text-neutral-700 transition hover:text-neutral-950"
          >
            Recursos
          </Link>

          <Link
            href="/testimonios"
            className="text-sm text-neutral-700 transition hover:text-neutral-950"
          >
            Testimonios
          </Link>

          <Link
            href="/contacto"
            className="text-sm text-neutral-700 transition hover:text-neutral-950"
          >
            Contacto
          </Link>
        </nav>

        <Link
          href="/servicios"
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Reservar
        </Link>
      </div>
    </header>
  );
}