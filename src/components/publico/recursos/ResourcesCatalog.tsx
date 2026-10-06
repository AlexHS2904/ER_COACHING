import Link from "next/link";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  resource_type: "file" | "link";
  external_url: string | null;
  mime_type: string | null;
  visibility: "public" | "private";
  active: boolean;
  display_order: number;
  cover_storage_path?: string | null;
};

type ResourcesCatalogProps = {
  resources: Resource[];
};

const accents = [
  {
    surface:
      "from-[#682830]/90 via-[#7a3440]/85 to-[#3b2a24]/85",
    ring: "border-brand-wine/20",
    badge: "bg-brand-wine/10 text-brand-wine",
    button:
      "bg-brand-brown text-brand-cream hover:bg-brand-wine",
  },
  {
    surface:
      "from-[#0f3d34]/92 via-[#1c5a4d]/85 to-[#3b2a24]/82",
    ring: "border-brand-green/20",
    badge: "bg-brand-green/10 text-brand-green",
    button:
      "bg-brand-green text-brand-cream hover:bg-brand-brown",
  },
  {
    surface:
      "from-[#a48c82]/92 via-[#8d7268]/88 to-[#3b2a24]/84",
    ring: "border-brand-taupe/30",
    badge: "bg-brand-taupe/20 text-brand-brown",
    button:
      "bg-brand-wine text-brand-cream hover:bg-brand-brown",
  },
];

function getResourceKindLabel(resource: Resource) {
  if (resource.resource_type === "link") {
    return "Enlace";
  }

  const mime = resource.mime_type?.toLowerCase() ?? "";

  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("epub")) return "EPUB";
  if (mime.includes("word")) return "Documento";
  if (mime.includes("presentation")) return "Presentación";
  if (mime.includes("sheet") || mime.includes("excel"))
    return "Hoja de cálculo";
  if (mime.startsWith("image/")) return "Imagen";

  return "Archivo";
}

function getResourceHref(resource: Resource) {
  if (resource.resource_type === "link" && resource.external_url) {
    return resource.external_url;
  }

  return `/api/resources/${resource.id}/download`;
}

function isExternalResource(resource: Resource) {
  return resource.resource_type === "link";
}

function getResourceActionLabel(resource: Resource) {
  return resource.resource_type === "link"
    ? "Explorar recurso"
    : "Descargar recurso";
}

function ResourceCover({
  resource,
  accentIndex,
}: {
  resource: Resource;
  accentIndex: number;
}) {
  const accent = accents[accentIndex % accents.length];

    if (resource.cover_storage_path) {
    return (
        <div className="relative aspect-[16/10] overflow-hidden rounded-[1.6rem]">
        <img
            src={`/api/resources/${resource.id}/cover`}
            alt={resource.title}
            className="h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

        <div className="absolute left-5 top-5">
            <span
            className="
                inline-flex
                items-center
                rounded-full
                bg-white/90
                px-3
                py-1
                text-[0.72rem]
                font-semibold
                uppercase
                tracking-[0.18em]
                text-brand-brown
                backdrop-blur-sm
            "
            >
            {getResourceKindLabel(resource)}
            </span>
        </div>
        </div>
    );
    }

  return (
    <div
      className={`
        relative aspect-[16/10] overflow-hidden rounded-[1.6rem]
        border ${accent.ring}
        bg-gradient-to-br ${accent.surface}
      `}
    >
      <div className="absolute left-5 top-5">
        <span
          className="
            inline-flex items-center rounded-full
            bg-white/90 px-3 py-1
            text-[0.72rem] font-semibold uppercase tracking-[0.18em]
            text-brand-brown
            backdrop-blur-sm
          "
        >
          {getResourceKindLabel(resource)}
        </span>
      </div>

      <div className="absolute left-6 top-[34%] max-w-[72%]">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/70">
          {resource.category}
        </p>

        <h3 className="mt-2 font-display text-[2rem] leading-[0.95] text-white sm:text-[2.2rem]">
          {resource.title}
        </h3>
      </div>

      <div className="absolute -left-10 -top-10 h-36 w-36 rounded-full border-[18px] border-white/12" />
      <div className="absolute -bottom-14 -right-10 h-44 w-44 rounded-full border-[20px] border-white/12" />
      <div className="absolute -bottom-3 left-7 h-24 w-24 rounded-full border-[14px] border-white/10" />
    </div>
  );
}

function ResourceCard({
  resource,
  index,
}: {
  resource: Resource;
  index: number;
}) {
  const accent = accents[index % accents.length];
  const href = getResourceHref(resource);
  const external = isExternalResource(resource);

  return (
    <article
      className="
        rounded-[2rem]
        border border-brand-taupe/18
        bg-white
        p-6
        shadow-[0_24px_60px_-34px_rgba(59,42,36,0.22)]
        transition-all duration-300
        hover:-translate-y-1
        hover:shadow-[0_34px_70px_-34px_rgba(59,42,36,0.28)]
        sm:p-7
      "
    >
      <ResourceCover resource={resource} accentIndex={index} />

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`
              inline-flex rounded-full px-3 py-1
              text-[0.72rem] font-semibold uppercase tracking-[0.18em]
              ${accent.badge}
            `}
          >
            {resource.category}
          </span>

          <span className="text-xs font-medium uppercase tracking-[0.16em] text-brand-brown/40">
            {getResourceKindLabel(resource)}
          </span>
        </div>

        <h3 className="font-display text-[2rem] leading-[1] text-brand-brown sm:text-[2.15rem]">
          {resource.title}
        </h3>

        <p className="mt-4 text-base leading-8 text-brand-black/65">
          {resource.description ||
            "Un recurso pensado para acompañar tu proceso con mayor claridad, profundidad y acción."}
        </p>

        <div className="mt-7">
          <Link
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer noopener" : undefined}
            className={`
              inline-flex items-center gap-2 rounded-full
              px-5 py-3 text-sm font-semibold
              transition-all duration-300
              hover:-translate-y-0.5
              ${accent.button}
            `}
          >
            {getResourceActionLabel(resource)}
            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              ↗
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function ResourcesCatalog({
  resources,
}: ResourcesCatalogProps) {
  const visibleResources = resources
    .filter((resource) => resource.active && resource.visibility === "public")
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <section className="bg-brand-cream py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-12">
        {/* Intro */}
        <div className="mx-auto max-w-[760px] text-center">
          <div className="mb-5 flex items-center justify-center gap-4">
            <span
              aria-hidden="true"
              className="h-px w-10 bg-brand-wine"
            />
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-brand-wine">
              Recursos
            </p>
            <span
              aria-hidden="true"
              className="h-px w-10 bg-brand-wine"
            />
          </div>

          <h1
            className="
              font-display
              text-[3rem]
              font-semibold
              leading-[1.08]
              tracking-[-0.025em]
              text-brand-brown
              sm:text-[3.8rem]
              lg:text-[4.2rem]
            "
          >
            Recursos para
            <span className="font-accent italic text-brand-wine">
              {" "}
              acompañar tu proceso.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-[620px] text-base leading-7 text-brand-black/65 sm:text-lg">
            Materiales seleccionados para profundizar, reflexionar y seguir
            avanzando entre sesiones.
          </p>
        </div>

        {visibleResources.length > 0 ? (
            <div
                className="
                mt-14
                grid
                gap-6
                md:grid-cols-2
                lg:mt-16
                "
            >
                {visibleResources.map((resource, index) => (
                <ResourceCard
                    key={resource.id}
                    resource={resource}
                    index={index}
                />
                ))}
            </div>
            ) : (
            <div className="mt-16 text-center">
                <p
                className="
                    font-display
                    text-2xl
                    italic
                    text-brand-brown/45
                "
                >
                Próximamente encontrarás nuevos recursos aquí.
                </p>
            </div>
            )}
      </div>
    </section>
  );
}