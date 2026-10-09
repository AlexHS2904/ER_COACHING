"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import RequestTestimonialButton from "@/components/admin/RequestTestimonialButton";
import ReviewAvatar from "@/components/reviews/ReviewAvatar";
import Stars from "@/components/reviews/Stars";

import {
  isReviewAvatarKey,
} from "@/lib/reviews/avatars";

type Testimonial = {
  id: string;

  bookingId:
    | string
    | null;

  processId:
    | string
    | null;

  authorName: string;
  rating: number;
  content: string;

  consentToPublish:
    boolean;

  status: string;

  serviceName: string;

  avatarKey:
    | string
    | null;

  photoUrl:
    | string
    | null;

  createdAt: string;
};

type Source = {
  type:
    | "booking"
    | "process";

  id: string;

  reference: string;

  customerName: string;

  customerEmail: string;

  serviceName: string;

  completedAt:
    | string
    | null;
};

type Props = {
  testimonials:
    Testimonial[];

  sources:
    Source[];
};

function formatDate(
  value:
    | string
    | null,
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "es-MX",
    {
      day:
        "numeric",

      month:
        "long",

      year:
        "numeric",
    },
  ).format(
    new Date(
      value,
    ),
  );
}

function statusLabel(
  status: string,
) {
  switch (status) {
    case "pending":
      return "Pendiente";

    case "approved":
      return "Publicado";

    case "hidden":
      return "Oculto";

    case "rejected":
      return "Rechazado";

    default:
      return status;
  }
}

function statusClasses(
  status: string,
) {
  switch (status) {
    case "approved":
      return "bg-brand-green/10 text-brand-green";

    case "pending":
      return "bg-[#B18A3D]/10 text-[#80631F]";

    case "rejected":
      return "bg-brand-wine/10 text-brand-wine";

    default:
      return "bg-brand-taupe/20 text-brand-brown/55";
  }
}

export default function AdminTestimonialsClient({
  testimonials,
  sources,
}: Props) {
  const router =
    useRouter();

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    status,
    setStatus,
  ] =
    useState("all");

  const [
    rating,
    setRating,
  ] =
    useState("all");

  const [
    sourceQuery,
    setSourceQuery,
  ] =
    useState("");

  const [
    updating,
    setUpdating,
  ] =
    useState<
      string | null
    >(null);

  const filtered =
    useMemo(() => {
      const search =
        query
          .trim()
          .toLowerCase();

      return testimonials.filter(
        (
          testimonial,
        ) => {
          if (
            status !==
              "all" &&
            testimonial.status !==
              status
          ) {
            return false;
          }

          if (
            rating !==
              "all" &&
            testimonial.rating !==
              Number(
                rating,
              )
          ) {
            return false;
          }

          if (!search) {
            return true;
          }

          return [
            testimonial
              .authorName,

            testimonial
              .content,

            testimonial
              .serviceName,
          ]
            .join(
              " ",
            )
            .toLowerCase()
            .includes(
              search,
            );
        },
      );
    }, [
      testimonials,
      query,
      status,
      rating,
    ]);

  const filteredSources =
    useMemo(() => {
      const search =
        sourceQuery
          .trim()
          .toLowerCase();

      if (!search) {
        return sources;
      }

      return sources.filter(
        (
          source,
        ) =>
          [
            source
              .customerName,

            source
              .customerEmail,

            source
              .serviceName,

            source
              .reference,
          ]
            .join(
              " ",
            )
            .toLowerCase()
            .includes(
              search,
            ),
      );
    }, [
      sources,
      sourceQuery,
    ]);

  async function updateStatus(
    id: string,
    nextStatus: string,
  ) {
    setUpdating(
      id,
    );

    try {
      const response =
        await fetch(
          `/api/admin/testimonials/${id}/status`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  status:
                    nextStatus,
                },
              ),
          },
        );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok
      ) {
        window.alert(
          result.error ??
            "No fue posible actualizar el testimonio.",
        );

        return;
      }

      router.refresh();
    } finally {
      setUpdating(
        null,
      );
    }
  }

  return (
    <main
      className="
        px-5
        py-8
        sm:px-8
        lg:px-10
        xl:px-12
      "
    >
      <div
        className="
          mx-auto
          max-w-[1280px]
        "
      >
        <p
          className="
            text-xs
            font-semibold
            uppercase
            tracking-[0.28em]
            text-brand-wine
          "
        >
          ER Coaching
        </p>

        <h1
          className="
            mt-3
            font-display
            text-5xl
            font-semibold
            text-brand-brown
            sm:text-6xl
          "
        >
          Testimonios
        </h1>

        <p
          className="
            mt-4
            max-w-[650px]
            leading-7
            text-brand-brown/50
          "
        >
          Solicita nuevas
          reseñas, revisa las
          recibidas y decide
          cuáles se muestran
          públicamente.
        </p>

        {/* ===============================================
            SOLICITAR
        ================================================ */}

        <section
          className="
            mt-12
            rounded-[1.75rem]
            border
            border-brand-taupe/25
            bg-white/55
            p-6
            sm:p-8
          "
        >
          <h2
            className="
              font-display
              text-3xl
              font-semibold
              text-brand-brown
            "
          >
            Solicitar testimonio
          </h2>

          <p
            className="
              mt-2
              text-sm
              text-brand-brown/45
            "
          >
            Solo aparecen
            sesiones individuales
            completadas y procesos
            completos que todavía
            no tienen testimonio.
          </p>

          <input
            type="search"
            value={
              sourceQuery
            }
            onChange={(
              event,
            ) =>
              setSourceQuery(
                event.target
                  .value,
              )
            }
            placeholder="Buscar cliente, correo o servicio..."
            className="
              mt-6
              w-full
              rounded-xl
              border
              border-brand-taupe/25
              bg-brand-cream/50
              px-4
              py-3
              outline-none
              focus:border-brand-wine
            "
          />

          <div
            className="
              mt-6
              grid
              gap-4
              lg:grid-cols-2
            "
          >
            {filteredSources.map(
              (
                source,
              ) => (
                <article
                  key={`${source.type}-${source.id}`}
                  className="
                    rounded-2xl
                    border
                    border-brand-taupe/20
                    p-5
                  "
                >
                  <div
                    className="
                      flex
                      flex-wrap
                      items-start
                      justify-between
                      gap-3
                    "
                  >
                    <div>
                      <p
                        className="
                          text-xs
                          font-semibold
                          uppercase
                          tracking-[0.16em]
                          text-brand-wine
                        "
                      >
                        {source.type ===
                        "process"
                          ? "Proceso"
                          : "Sesión"}
                      </p>

                      <h3
                        className="
                          mt-2
                          font-display
                          text-2xl
                          font-semibold
                          text-brand-brown
                        "
                      >
                        {
                          source.customerName
                        }
                      </h3>
                    </div>

                    <span
                      className="
                        text-xs
                        text-brand-brown/35
                      "
                    >
                      {formatDate(
                        source.completedAt,
                      )}
                    </span>
                  </div>

                  <p
                    className="
                      mt-3
                      text-sm
                      font-semibold
                      text-brand-brown/65
                    "
                  >
                    {
                      source.serviceName
                    }
                  </p>

                  <p
                    className="
                      mt-1
                      text-xs
                      text-brand-brown/40
                    "
                  >
                    {
                      source.customerEmail
                    }
                  </p>

                  <p
                    className="
                      mt-1
                      text-xs
                      text-brand-brown/35
                    "
                  >
                    {
                      source.reference
                    }
                  </p>

                  <div className="mt-5">
                    <RequestTestimonialButton
                      sourceType={
                        source.type
                      }
                      sourceId={
                        source.id
                      }
                    />
                  </div>
                </article>
              ),
            )}
          </div>

          {filteredSources.length ===
            0 && (
            <p
              className="
                mt-6
                text-sm
                text-brand-brown/40
              "
            >
              No hay sesiones o
              procesos disponibles.
            </p>
          )}
        </section>

        {/* ===============================================
            MODERACIÓN
        ================================================ */}

        <section className="mt-14">
          <div>
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.22em]
                text-brand-wine
              "
            >
              Moderación
            </p>

            <h2
              className="
                mt-2
                font-display
                text-4xl
                font-semibold
                text-brand-brown
              "
            >
              Reseñas recibidas
            </h2>
          </div>

          <div
            className="
              mt-6
              grid
              gap-3
              rounded-[1.5rem]
              border
              border-brand-taupe/25
              bg-white/55
              p-4
              md:grid-cols-[1fr_auto_auto]
            "
          >
            <input
              type="search"
              value={
                query
              }
              onChange={(
                event,
              ) =>
                setQuery(
                  event.target
                    .value,
                )
              }
              placeholder="Buscar testimonio..."
              className="
                rounded-xl
                border
                border-brand-taupe/25
                bg-brand-cream/50
                px-4
                py-3
                outline-none
              "
            />

            <select
              value={
                status
              }
              onChange={(
                event,
              ) =>
                setStatus(
                  event.target
                    .value,
                )
              }
              className="
                rounded-xl
                border
                border-brand-taupe/25
                bg-brand-cream
                px-4
                py-3
              "
            >
              <option value="all">
                Todos
              </option>

              <option value="pending">
                Pendientes
              </option>

              <option value="approved">
                Publicados
              </option>

              <option value="hidden">
                Ocultos
              </option>

              <option value="rejected">
                Rechazados
              </option>
            </select>

            <select
              value={
                rating
              }
              onChange={(
                event,
              ) =>
                setRating(
                  event.target
                    .value,
                )
              }
              className="
                rounded-xl
                border
                border-brand-taupe/25
                bg-brand-cream
                px-4
                py-3
              "
            >
              <option value="all">
                Todas las estrellas
              </option>

              <option value="5">
                5 estrellas
              </option>

              <option value="4">
                4 estrellas
              </option>

              <option value="3">
                3 estrellas
              </option>

              <option value="2">
                2 estrellas
              </option>

              <option value="1">
                1 estrella
              </option>
            </select>
          </div>

          <div
            className="
              mt-7
              space-y-4
            "
          >
            {filtered.map(
              (
                testimonial,
              ) => (
                <article
                  key={
                    testimonial.id
                  }
                  className="
                    rounded-[1.5rem]
                    border
                    border-brand-taupe/20
                    bg-white/65
                    p-6
                  "
                >
                  <div
                    className="
                      flex
                      flex-col
                      gap-5
                      lg:flex-row
                      lg:justify-between
                    "
                  >
                    <div
                      className="
                        flex
                        gap-4
                      "
                    >
                      {testimonial.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            testimonial.photoUrl
                          }
                          alt=""
                          className="
                            h-16
                            w-16
                            shrink-0
                            rounded-full
                            object-cover
                          "
                        />
                      ) : testimonial.avatarKey &&
                        isReviewAvatarKey(
                          testimonial.avatarKey,
                        ) ? (
                        <ReviewAvatar
                          avatarKey={
                            testimonial.avatarKey
                          }
                          className="
                            w-16
                            shrink-0
                          "
                        />
                      ) : null}

                      <div>
                        <div
                          className="
                            flex
                            flex-wrap
                            items-center
                            gap-3
                          "
                        >
                          <h3
                            className="
                              font-display
                              text-2xl
                              font-semibold
                              text-brand-brown
                            "
                          >
                            {
                              testimonial.authorName
                            }
                          </h3>

                          <span
                            className={`
                              rounded-full
                              px-3
                              py-1
                              text-xs
                              font-semibold
                              ${statusClasses(
                                testimonial.status,
                              )}
                            `}
                          >
                            {statusLabel(
                              testimonial.status,
                            )}
                          </span>
                        </div>

                        <Stars
                          rating={
                            testimonial.rating
                          }
                          className="
                            mt-2
                          "
                        />

                        <p
                          className="
                            mt-2
                            text-xs
                            text-brand-brown/40
                          "
                        >
                          {
                            testimonial.serviceName
                          }{" "}
                          ·{" "}
                          {formatDate(
                            testimonial.createdAt,
                          )}
                        </p>
                      </div>
                    </div>

                    <div
                      className="
                        flex
                        flex-wrap
                        gap-2
                      "
                    >
                      {testimonial.status !==
                        "approved" && (
                        <button
                          type="button"
                          disabled={
                            updating ===
                            testimonial.id
                          }
                          onClick={() =>
                            updateStatus(
                              testimonial.id,
                              "approved",
                            )
                          }
                          className="
                            rounded-xl
                            bg-brand-green
                            px-4
                            py-2.5
                            text-sm
                            font-semibold
                            text-white
                          "
                        >
                          Publicar
                        </button>
                      )}

                      {testimonial.status ===
                        "approved" && (
                        <button
                          type="button"
                          disabled={
                            updating ===
                            testimonial.id
                          }
                          onClick={() =>
                            updateStatus(
                              testimonial.id,
                              "hidden",
                            )
                          }
                          className="
                            rounded-xl
                            border
                            border-brand-taupe/30
                            px-4
                            py-2.5
                            text-sm
                            font-semibold
                            text-brand-brown
                          "
                        >
                          Ocultar
                        </button>
                      )}

                      {testimonial.status !==
                        "rejected" && (
                        <button
                          type="button"
                          disabled={
                            updating ===
                            testimonial.id
                          }
                          onClick={() =>
                            updateStatus(
                              testimonial.id,
                              "rejected",
                            )
                          }
                          className="
                            rounded-xl
                            border
                            border-brand-wine/25
                            px-4
                            py-2.5
                            text-sm
                            font-semibold
                            text-brand-wine
                          "
                        >
                          Rechazar
                        </button>
                      )}
                    </div>
                  </div>

                  <p
                    className="
                      mt-6
                      max-w-[900px]
                      whitespace-pre-wrap
                      text-sm
                      leading-7
                      text-brand-brown/65
                    "
                  >
                    {
                      testimonial.content
                    }
                  </p>

                  <p
                    className="
                      mt-4
                      text-xs
                      text-brand-brown/35
                    "
                  >
                    Consentimiento para
                    publicación:{" "}

                    {testimonial.consentToPublish
                      ? "Sí"
                      : "No"}
                  </p>
                </article>
              ),
            )}
          </div>

          {filtered.length ===
            0 && (
            <p
              className="
                mt-8
                text-center
                text-brand-brown/40
              "
            >
              No hay testimonios
              con esos filtros.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}