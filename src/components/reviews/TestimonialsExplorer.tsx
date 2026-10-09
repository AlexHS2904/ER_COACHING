"use client";

import {
  useMemo,
  useState,
} from "react";

import ReviewAvatar from "@/components/reviews/ReviewAvatar";
import Stars from "@/components/reviews/Stars";

import {
  isReviewAvatarKey,
} from "@/lib/reviews/avatars";

type Testimonial = {
  id: string;

  authorName: string;

  rating: number;

  content: string;

  serviceName: string;

  avatarKey:
    | string
    | null;

  photoUrl:
    | string
    | null;

  createdAt: string;
};

type Props = {
  testimonials:
    Testimonial[];
};

function normalize(
  value: string,
) {
  return value
    .normalize(
      "NFD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase();
}

function formatDate(
  value: string,
) {
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

export default function TestimonialsExplorer({
  testimonials,
}: Props) {
  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    rating,
    setRating,
  ] =
    useState("all");

  const [
    service,
    setService,
  ] =
    useState("all");

  const [
    order,
    setOrder,
  ] =
    useState<
      | "newest"
      | "oldest"
      | "highest"
    >(
      "newest",
    );

  const services =
    useMemo(
      () =>
        Array.from(
          new Set(
            testimonials.map(
              (
                testimonial,
              ) =>
                testimonial
                  .serviceName,
            ),
          ),
        ).sort(),
      [
        testimonials,
      ],
    );

  const filtered =
    useMemo(() => {
      const query =
        normalize(
          search.trim(),
        );

      return [
        ...testimonials,
      ]
        .filter(
          (
            testimonial,
          ) => {
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

            if (
              service !==
                "all" &&
              testimonial
                .serviceName !==
                service
            ) {
              return false;
            }

            if (!query) {
              return true;
            }

            return normalize(
              [
                testimonial
                  .authorName,

                testimonial
                  .content,

                testimonial
                  .serviceName,
              ].join(
                " ",
              ),
            ).includes(
              query,
            );
          },
        )
        .sort(
          (
            a,
            b,
          ) => {
            if (
              order ===
              "highest"
            ) {
              const stars =
                b.rating -
                a.rating;

              if (
                stars !==
                0
              ) {
                return stars;
              }
            }

            const first =
              new Date(
                a.createdAt,
              ).getTime();

            const second =
              new Date(
                b.createdAt,
              ).getTime();

            if (
              order ===
              "oldest"
            ) {
              return (
                first -
                second
              );
            }

            return (
              second -
              first
            );
          },
        );
    }, [
      testimonials,
      search,
      rating,
      service,
      order,
    ]);

  return (
    <div>
      {/* FILTROS */}

      <div
        className="
          grid
          gap-3
          rounded-[1.5rem]
          border
          border-brand-taupe/25
          bg-white/55
          p-4
          md:grid-cols-[1fr_auto_auto_auto]
        "
      >
        <input
          type="search"
          value={
            search
          }
          onChange={(
            event,
          ) =>
            setSearch(
              event.target
                .value,
            )
          }
          placeholder="Buscar por nombre, servicio o palabra..."
          className="
            min-h-[46px]
            rounded-xl
            border
            border-brand-taupe/25
            bg-brand-cream/50
            px-4
            text-sm
            outline-none
            focus:border-brand-wine
          "
        />

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
            min-h-[46px]
            rounded-xl
            border
            border-brand-taupe/25
            bg-brand-cream
            px-4
            text-sm
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

        <select
          value={
            service
          }
          onChange={(
            event,
          ) =>
            setService(
              event.target
                .value,
            )
          }
          className="
            min-h-[46px]
            rounded-xl
            border
            border-brand-taupe/25
            bg-brand-cream
            px-4
            text-sm
          "
        >
          <option value="all">
            Todos los servicios
          </option>

          {services.map(
            (
              item,
            ) => (
              <option
                key={
                  item
                }
                value={
                  item
                }
              >
                {item}
              </option>
            ),
          )}
        </select>

        <select
          value={
            order
          }
          onChange={(
            event,
          ) =>
            setOrder(
              event
                .target
                .value as
                | "newest"
                | "oldest"
                | "highest",
            )
          }
          className="
            min-h-[46px]
            rounded-xl
            border
            border-brand-taupe/25
            bg-brand-cream
            px-4
            text-sm
          "
        >
          <option value="newest">
            Más recientes
          </option>

          <option value="oldest">
            Más antiguas
          </option>

          <option value="highest">
            Mejor calificadas
          </option>
        </select>
      </div>

      <div
        className="
          mt-5
          flex
          items-center
          justify-between
          gap-4
        "
      >
        <p
          className="
            text-sm
            text-brand-brown/45
          "
        >
          {
            filtered.length
          }{" "}
          testimonio
          {filtered.length ===
          1
            ? ""
            : "s"}
        </p>
      </div>

      {/* CARDS */}

      {filtered.length >
      0 ? (
        <div
          className="
            mt-8
            grid
            gap-5
            md:grid-cols-2
            xl:grid-cols-3
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
                  flex
                  flex-col
                  rounded-[1.75rem]
                  border
                  border-brand-taupe/20
                  bg-white/65
                  p-6
                  shadow-[0_20px_55px_rgba(59,42,36,0.05)]
                "
              >
                <div
                  className="
                    flex
                    items-center
                    gap-4
                  "
                >
                  {testimonial.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        testimonial
                          .photoUrl
                      }
                      alt={`Foto de ${testimonial.authorName}`}
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
                    <h2
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
                    </h2>

                    <p
                      className="
                        mt-1
                        text-xs
                        text-brand-brown/40
                      "
                    >
                      {
                        testimonial.serviceName
                      }
                    </p>
                  </div>
                </div>

                <Stars
                  rating={
                    testimonial.rating
                  }
                  className="
                    mt-5
                    text-lg
                  "
                />

                <blockquote
                  className="
                    mt-5
                    flex-1
                    text-[0.95rem]
                    leading-7
                    text-brand-brown/65
                  "
                >
                  “
                  {
                    testimonial.content
                  }
                  ”
                </blockquote>

                <p
                  className="
                    mt-6
                    border-t
                    border-brand-taupe/20
                    pt-4
                    text-xs
                    text-brand-brown/35
                  "
                >
                  Publicado el{" "}
                  {formatDate(
                    testimonial.createdAt,
                  )}
                </p>
              </article>
            ),
          )}
        </div>
      ) : (
        <div
          className="
            mt-8
            rounded-[1.5rem]
            border
            border-brand-taupe/20
            p-10
            text-center
          "
        >
          <p
            className="
              text-brand-brown/50
            "
          >
            No encontramos
            testimonios con esos
            filtros.
          </p>
        </div>
      )}
    </div>
  );
}