import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 bg-neutral-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold">Coaching</p>

          <p className="mt-3 max-w-sm text-sm leading-6 text-neutral-400">
            Acompañamiento personalizado para ayudarte a avanzar hacia tus
            objetivos personales y profesionales.
          </p>
        </div>

        <div>
          <p className="font-medium">Explorar</p>

          <nav
            aria-label="Navegación del pie de página"
            className="mt-4 flex flex-col gap-3"
          >
            <Link
              href="/sobre-mi"
              className="text-sm text-neutral-400 hover:text-white"
            >
              Sobre mí
            </Link>

            <Link
              href="/servicios"
              className="text-sm text-neutral-400 hover:text-white"
            >
              Servicios
            </Link>

            <Link
              href="/recursos"
              className="text-sm text-neutral-400 hover:text-white"
            >
              Recursos
            </Link>

            <Link
              href="/contacto"
              className="text-sm text-neutral-400 hover:text-white"
            >
              Contacto
            </Link>
          </nav>
        </div>

        <div>
          <p className="font-medium">Contacto</p>

          <p className="mt-4 text-sm leading-6 text-neutral-400">
            Agenda una sesión o ponte en contacto para conocer más sobre los
            servicios disponibles.
          </p>
        </div>
      </div>

      <div className="border-t border-neutral-800">
        <div className="mx-auto max-w-7xl px-6 py-6 text-sm text-neutral-500">
          © {currentYear} Coaching. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}