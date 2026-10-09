type SocialItem = {
  name: string;
  description: string;
  href: string;
  icon:
    | "instagram"
    | "linkedin"
    | "whatsapp"
    | "tiktok";
};

function SocialIcon({
  type,
}: {
  type: SocialItem["icon"];
}) {
  if (
    type ===
    "instagram"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-7 w-7"
        aria-hidden="true"
      >
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="5"
          stroke="currentColor"
          strokeWidth="1.7"
        />

        <circle
          cx="12"
          cy="12"
          r="4"
          stroke="currentColor"
          strokeWidth="1.7"
        />

        <circle
          cx="17.4"
          cy="6.7"
          r="1"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (
    type ===
    "linkedin"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-7 w-7"
        aria-hidden="true"
      >
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.7"
        />

        <path
          d="M8 10v7M8 7.3v.2M12 17v-4c0-1.7 1-3 2.6-3 1.5 0 2.4 1 2.4 3v4M12 10v7"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (
    type ===
    "whatsapp"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-7 w-7"
        aria-hidden="true"
      >
        <path
          d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />

        <path
          d="M9 8.5c.3 2.8 2 4.6 4.8 5.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-7 w-7"
      aria-hidden="true"
    >
      <path
        d="M14.5 4v10.2a4 4 0 1 1-3-3.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />

      <path
        d="M14.5 4c.7 2.7 2.3 4.1 5 4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SocialLinks() {
  const instagram =
    process.env
      .NEXT_PUBLIC_INSTAGRAM_URL;

  const linkedin =
    process.env
      .NEXT_PUBLIC_LINKEDIN_URL;

  const tiktok =
    process.env
      .NEXT_PUBLIC_TIKTOK_URL;

  const whatsappNumber =
    process.env
      .NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(
        /\D/g,
        "",
      );

  const whatsapp =
    whatsappNumber
      ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
          "Hola Edna, vi tu página de coaching y me gustaría recibir más información.",
        )}`
      : undefined;

  const socialItems: SocialItem[] =
    [
      instagram
        ? {
            name:
              "Instagram",

            description:
              "Contenido, reflexiones y novedades.",

            href:
              instagram,

            icon:
              "instagram",
          }
        : null,

      linkedin
        ? {
            name:
              "LinkedIn",

            description:
              "Trayectoria, proyectos y desarrollo profesional.",

            href:
              linkedin,

            icon:
              "linkedin",
          }
        : null,

      whatsapp
        ? {
            name:
              "WhatsApp",

            description:
              "Escríbeme para resolver una duda directamente.",

            href:
              whatsapp,

            icon:
              "whatsapp",
          }
        : null,

      tiktok
        ? {
            name:
              "TikTok",

            description:
              "Ideas y contenido breve sobre coaching.",

            href:
              tiktok,

            icon:
              "tiktok",
          }
        : null,
    ].filter(
      (
        item,
      ): item is SocialItem =>
        item !== null,
    );

  return (
    <section
      className="
        relative
        overflow-hidden
        bg-brand-wine
        px-5
        py-20
        text-brand-cream

        sm:px-8
        sm:py-24

        lg:px-12
        lg:py-28
      "
    >
      {/* TEXTO DECORATIVO */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          left-1/2
          top-2
          hidden
          -translate-x-1/2

          whitespace-nowrap

          font-display
          text-[8rem]
          font-semibold
          leading-none

          text-white/[0.04]

          lg:block
          lg:text-[11rem]
        "
      >
        CONECTEMOS
      </div>

      {/* CÍRCULO */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          -right-20
          top-20

          h-72
          w-72

          rounded-full

          border
          border-white/10
        "
      />

      <div
        className="
          relative
          z-10

          mx-auto
          max-w-[1280px]
        "
      >
        <div
          className="
            mx-auto
            max-w-[760px]
            text-center
          "
        >
          <p
            className="
              text-xs
              font-semibold
              uppercase
              tracking-[0.3em]
              text-brand-cream/60
            "
          >
            Conecta conmigo
          </p>

          <h2
            className="
              mt-5
              font-display
              text-4xl
              font-semibold
              leading-[0.98]
              tracking-[-0.03em]

              sm:text-5xl
              lg:text-6xl
            "
          >
            También podemos
            encontrarnos{" "}

            <span
              className="
                font-accent
                italic
                text-[#d8b7b0]
              "
            >
              por aquí.
            </span>
          </h2>

          <p
            className="
              mx-auto
              mt-5
              max-w-[560px]

              text-sm
              leading-7
              text-brand-cream/60

              sm:text-base
            "
          >
            Sígueme en redes o escríbeme directamente
            para conocer más sobre mi trabajo.
          </p>
        </div>

        {/* CARDS */}

        <div
          className="
            mt-12
            grid
            gap-4

            sm:grid-cols-2
            lg:grid-cols-4
          "
        >
          {socialItems.map(
            (
              social,
            ) => (
              <a
                key={
                  social.name
                }
                href={
                  social.href
                }
                target="_blank"
                rel="noopener noreferrer"
                className="
                  group

                  flex
                  min-h-[220px]
                  flex-col
                  justify-between

                  rounded-[1.75rem]

                  border
                  border-white/15

                  bg-white/[0.06]

                  p-6

                  transition-all
                  duration-300

                  hover:-translate-y-1
                  hover:bg-brand-cream
                  hover:text-brand-wine

                  sm:p-7
                "
              >
                <div
                  className="
                    flex
                    items-start
                    justify-between
                    gap-4
                  "
                >
                  <div
                    className="
                      flex
                      h-12
                      w-12
                      items-center
                      justify-center

                      rounded-full

                      border
                      border-current/20
                    "
                  >
                    <SocialIcon
                      type={
                        social.icon
                      }
                    />
                  </div>

                  <span
                    className="
                      text-xl

                      transition-transform
                      duration-300

                      group-hover:translate-x-1
                      group-hover:-translate-y-1
                    "
                  >
                    ↗
                  </span>
                </div>

                <div
                  className="
                    mt-10
                  "
                >
                  <h3
                    className="
                      font-display
                      text-3xl
                      font-semibold
                    "
                  >
                    {
                      social.name
                    }
                  </h3>

                  <p
                    className="
                      mt-2
                      text-sm
                      leading-6
                      opacity-60
                    "
                  >
                    {
                      social.description
                    }
                  </p>
                </div>
              </a>
            ),
          )}
        </div>
      </div>
    </section>
  );
}