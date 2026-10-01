import Link from "next/link";

const links = [
  { label: "Sobre mí", href: "/sobre-mi" },
  { label: "Servicios", href: "/servicios" },
  { label: "Testimonios", href: "/testimonios" },
  { label: "Contacto", href: "/contacto" },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#e5d9d2] text-brand-brown">
      {/* línea superior */}
      <div className="h-[3px] w-full bg-brand-wine" />

      {/* textura muy leve */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          opacity-[0.07]
          bg-[radial-gradient(rgba(59,42,36,0.18)_0.55px,transparent_0.8px)]
          bg-[size:20px_20px]
        "
      />

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-12">
        {/* parte principal */}
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
          {/* logo + frase */}
          <div className="max-w-[390px]">
            <Link href="/" className="inline-block">
              <span className="font-display text-5xl leading-none text-brand-wine">
                A.
              </span>
            </Link>

            <p className="mt-3 text-sm leading-6 text-brand-brown/60">
              Coaching para avanzar con mayor claridad, intención y propósito.
            </p>
          </div>

          {/* navegación */}
          <nav aria-label="Navegación del footer">
            <ul
              className="
                flex flex-wrap gap-x-6 gap-y-3
                text-sm font-medium
                text-brand-brown/65
              "
            >
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors duration-200 hover:text-brand-wine"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* CTA */}
          <Link
            href="/servicios"
            className="
              group inline-flex w-fit
              items-center gap-5
              rounded-xl
              bg-brand-wine
              px-5 py-3
              text-sm font-semibold
              text-brand-cream
              transition-all duration-300
              hover:-translate-y-0.5
              hover:bg-[#592129]
            "
          >
            Agendar sesión

            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>

        {/* cierre */}
        <div
          className="
            flex flex-col gap-3
            border-t border-brand-brown/15
            py-5
            text-xs text-brand-brown/40
            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          <p>
            © {new Date().getFullYear()} Edna Rojo Coaching.
          </p>

          <p>
            Sesiones online · México
          </p>
        </div>
      </div>
    </footer>
  );
}