"use client";

import {
  useRef,
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

function formatDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "es-MX",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  ).format(
    new Date(value),
  );
}

export default function HomeTestimonialsCarousel({
  testimonials,
}: Props) {
  const trackRef =
    useRef<HTMLDivElement>(
      null,
    );

  const [
    activeIndex,
    setActiveIndex,
  ] =
    useState(0);

  /* =======================================================
     IR A UNA TARJETA
  ======================================================= */

  function scrollToCard(
    index: number,
  ) {
    const track =
      trackRef.current;

    if (!track) {
      return;
    }

    const cards =
      Array.from(
        track.children,
      ) as HTMLElement[];

    const card =
      cards[index];

    if (!card) {
      return;
    }

    track.scrollTo({
      left:
        card.offsetLeft -
        track.offsetLeft,

      behavior:
        "smooth",
    });

    setActiveIndex(
      index,
    );
  }

  /* =======================================================
     ANTERIOR / SIGUIENTE
  ======================================================= */

  function previous() {
    scrollToCard(
      Math.max(
        activeIndex - 1,
        0,
      ),
    );
  }

  function next() {
    scrollToCard(
      Math.min(
        activeIndex + 1,
        testimonials.length -
          1,
      ),
    );
  }

  /* =======================================================
     DETECTAR POSICIÓN AL HACER SWIPE
  ======================================================= */

  function handleScroll() {
    const track =
      trackRef.current;

    if (!track) {
      return;
    }

    const cards =
      Array.from(
        track.children,
      ) as HTMLElement[];

    if (
      cards.length ===
      0
    ) {
      return;
    }

    const scrollLeft =
      track.scrollLeft;

    let closestIndex =
      0;

    let closestDistance =
      Infinity;

    cards.forEach(
      (
        card,
        index,
      ) => {
        const distance =
          Math.abs(
            card.offsetLeft -
              track.offsetLeft -
              scrollLeft,
          );

        if (
          distance <
          closestDistance
        ) {
          closestDistance =
            distance;

          closestIndex =
            index;
        }
      },
    );

    setActiveIndex(
      closestIndex,
    );
  }

  return (
    <div>
      {/* ===================================================
          CONTROLES SUPERIORES
      ==================================================== */}

      {testimonials.length >
        1 && (
        <div
          className="
            mx-auto
            mb-5
            flex
            max-w-[1180px]
            items-center
            justify-end
            gap-2
          "
        >
          <button
            type="button"
            onClick={
              previous
            }
            disabled={
              activeIndex ===
              0
            }
            aria-label="Testimonio anterior"
            className="
              flex
              h-11
              w-11
              items-center
              justify-center

              rounded-full

              border
              border-brand-cream/25

              text-xl
              text-brand-cream

              transition

              hover:bg-brand-cream
              hover:text-brand-wine

              disabled:cursor-default
              disabled:opacity-30
              disabled:hover:bg-transparent
              disabled:hover:text-brand-cream
            "
          >
            ←
          </button>

          <button
            type="button"
            onClick={
              next
            }
            disabled={
              activeIndex ===
              testimonials.length -
                1
            }
            aria-label="Siguiente testimonio"
            className="
              flex
              h-11
              w-11
              items-center
              justify-center

              rounded-full

              border
              border-brand-cream/25

              text-xl
              text-brand-cream

              transition

              hover:bg-brand-cream
              hover:text-brand-wine

              disabled:cursor-default
              disabled:opacity-30
              disabled:hover:bg-transparent
              disabled:hover:text-brand-cream
            "
          >
            →
          </button>
        </div>
      )}

      {/* ===================================================
          TRACK
      ==================================================== */}

      <div
        ref={
          trackRef
        }
        onScroll={
          handleScroll
        }
        className="
          mx-auto
          flex
          max-w-[1180px]

          snap-x
          snap-mandatory

          gap-4

          overflow-x-auto

          pb-4

          scroll-smooth

          [scrollbar-width:none]
          [&::-webkit-scrollbar]:hidden

          sm:gap-5
        "
      >
        {testimonials.map(
          (
            testimonial,
            index,
          ) => (
            <article
              key={
                testimonial.id
              }
              className="
                flex
                min-h-[420px]

                w-full
                shrink-0
                snap-start
                flex-col

                rounded-[2rem]

                border
                border-white/15

                bg-brand-cream

                p-6

                shadow-[0_18px_50px_rgba(0,0,0,0.12)]

                sm:p-7

                md:w-[calc(50%-0.625rem)]

                lg:w-[calc(33.333%-0.84rem)]
              "
            >
              {/* ===========================================
                  CABECERA
              ============================================ */}

              <div
                className="
                  flex
                  items-start
                  justify-between
                  gap-4

                  border-b
                  border-brand-taupe/25

                  pb-5
                "
              >
                <div
                  className="
                    flex
                    min-w-0
                    items-center
                    gap-3
                  "
                >
                  {/* FOTO / AVATAR */}

                  {testimonial.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        testimonial.photoUrl
                      }
                      alt={`Foto de ${testimonial.authorName}`}
                      className="
                        h-14
                        w-14
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
                        w-14
                        shrink-0
                      "
                    />
                  ) : (
                    <div
                      className="
                        flex
                        h-14
                        w-14
                        shrink-0
                        items-center
                        justify-center

                        rounded-full

                        bg-brand-taupe/15

                        font-display
                        text-xl
                        font-semibold

                        text-brand-wine
                      "
                    >
                      {testimonial.authorName
                        .charAt(
                          0,
                        )
                        .toUpperCase()}
                    </div>
                  )}

                  <div
                    className="
                      min-w-0
                    "
                  >
                    <h3
                      className="
                        truncate

                        font-display
                        text-xl
                        font-semibold
                        leading-tight

                        text-brand-brown
                      "
                    >
                      {
                        testimonial.authorName
                      }
                    </h3>

                    <p
                      className="
                        mt-1

                        line-clamp-2

                        text-[0.68rem]
                        leading-4

                        text-brand-brown/45
                      "
                    >
                      {
                        testimonial.serviceName
                      }
                    </p>
                  </div>
                </div>

                <p
                  className="
                    shrink-0

                    font-display
                    text-xl
                    italic

                    text-brand-wine/50
                  "
                >
                  {String(
                    index + 1,
                  ).padStart(
                    2,
                    "0",
                  )}
                </p>
              </div>

              {/* ===========================================
                  ESTRELLAS
              ============================================ */}

              <Stars
                rating={
                  testimonial.rating
                }
                className="
                  mt-6
                  text-lg
                "
              />

              {/* ===========================================
                  TESTIMONIO
              ============================================ */}

              <blockquote
                className="
                  mt-5
                  flex-1

                  font-display
                  text-[1.55rem]
                  leading-[1.25]

                  text-brand-brown
                "
              >
                “
                {
                  testimonial.content
                }
                ”
              </blockquote>

              {/* ===========================================
                  FECHA
              ============================================ */}

              <div
                className="
                  mt-7

                  border-t
                  border-brand-taupe/25

                  pt-4
                "
              >
                <p
                  className="
                    text-[0.68rem]
                    uppercase
                    tracking-[0.15em]

                    text-brand-brown/40
                  "
                >
                  {formatDate(
                    testimonial.createdAt,
                  )}
                </p>
              </div>
            </article>
          ),
        )}
      </div>

      {/* ===================================================
          INDICADORES
      ==================================================== */}

      {testimonials.length >
        1 && (
        <div
          className="
            mt-5
            flex
            items-center
            justify-center
            gap-2
          "
        >
          {testimonials.map(
            (
              testimonial,
              index,
            ) => (
              <button
                key={
                  testimonial.id
                }
                type="button"
                onClick={() =>
                  scrollToCard(
                    index,
                  )
                }
                aria-label={`Ir al testimonio ${
                  index + 1
                }`}
                className={`
                  h-2
                  rounded-full
                  transition-all
                  duration-300

                  ${
                    activeIndex ===
                    index
                      ? `
                        w-7
                        bg-brand-cream
                      `
                      : `
                        w-2
                        bg-brand-cream/30

                        hover:bg-brand-cream/60
                      `
                  }
                `}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}