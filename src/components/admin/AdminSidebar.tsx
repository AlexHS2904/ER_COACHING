"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    label: "Resumen",
    href: "/admin",
  },
  {
    label: "Reservas",
    href: "/admin/reservas",
  },
  {
    label: "Calendario",
    href: "/admin/calendario",
  },
  {
    label: "Servicios",
    href: "/admin/servicios",
  },
  {
    label: "Recursos",
    href: "/admin/recursos",
  },
  {
    label: "Configuración",
    href: "/admin/configuracion",
  },
];

function isActive(
  pathname: string,
  href: string,
) {
  if (href === "/admin") {
    return pathname === "/admin";
  }

  return pathname.startsWith(href);
}

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* DESKTOP */}
      <aside
        className="
          fixed
          inset-y-0
          left-0
          z-30
          hidden
          w-[260px]
          border-r
          border-brand-taupe/20
          bg-[#f7f5f1]
          lg:flex
          lg:flex-col
        "
      >
        <div className="px-7 pt-8">
          <Link
            href="/admin"
            className="block"
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
              ER Coaching
            </p>

            <p
              className="
                mt-2
                font-display
                text-2xl
                font-semibold
                text-brand-brown
              "
            >
              Administración
            </p>
          </Link>
        </div>

        <nav className="mt-12 px-4">
          <div className="space-y-1.5">
            {navigation.map(
              (item) => {
                const active =
                  isActive(
                    pathname,
                    item.href,
                  );

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex
                      min-h-[48px]
                      items-center
                      rounded-xl
                      px-4
                      text-sm
                      font-semibold
                      transition
                      ${
                        active
                          ? "bg-brand-wine text-brand-cream"
                          : "text-brand-brown/65 hover:bg-brand-brown/5 hover:text-brand-brown"
                      }
                    `}
                  >
                    {item.label}
                  </Link>
                );
              },
            )}
          </div>
        </nav>

        <div className="mt-auto px-7 pb-8">
          <p
            className="
              text-xs
              leading-5
              text-brand-brown/35
            "
          >
            Panel privado
            <br />
            ER Coaching
          </p>
        </div>
      </aside>

      {/* MOBILE / TABLET */}
      <div
        className="
          border-b
          border-brand-taupe/20
          bg-[#f7f5f1]
          lg:hidden
        "
      >
        <div
          className="
            flex
            items-center
            justify-between
            px-5
            py-5
          "
        >
          <Link href="/admin">
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.25em]
                text-brand-wine
              "
            >
              ER Coaching
            </p>
          </Link>

          <span
            className="
              text-xs
              text-brand-brown/40
            "
          >
            Administración
          </span>
        </div>

        <nav
          className="
            flex
            gap-2
            overflow-x-auto
            px-5
            pb-4
          "
        >
          {navigation.map(
            (item) => {
              const active =
                isActive(
                  pathname,
                  item.href,
                );

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    shrink-0
                    rounded-full
                    px-4
                    py-2
                    text-sm
                    font-semibold
                    transition
                    ${
                      active
                        ? "bg-brand-wine text-brand-cream"
                        : "border border-brand-taupe/25 text-brand-brown/60"
                    }
                  `}
                >
                  {item.label}
                </Link>
              );
            },
          )}
        </nav>
      </div>
    </>
  );
}