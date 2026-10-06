"use client";

import {
  useRef,
  useState,
} from "react";

import Link from "next/link";

import {
  routes,
} from "@/lib/routes";

export type HomeService = {
  id: string;
  name: string;
  slug: string;

  short_description:
    string;

  service_type:
    | "single"
    | "package"
    | "group";

  duration_minutes:
    | number
    | null;

  session_count:
    | number
    | null;

  price:
    | number
    | null;

  currency: string;

  requires_quote:
    boolean;

  booking_enabled:
    boolean;
};

type Props = {
  services:
    HomeService[];
};

const CARD_STYLES = [
  {
    background:
      "bg-brand-wine",

    text:
      "text-brand-cream",

    softText:
      "text-brand-cream/75",

    badge:
      "bg-brand-cream text-brand-wine",
  },

  {
    background:
      "bg-brand-green",

    text:
      "text-brand-cream",

    softText:
      "text-brand-cream/75",

    badge:
      "bg-brand-cream text-brand-green",
  },

  {
    background:
      "bg-[#c4afa6]",

    text:
      "text-[#684d43]",

    softText:
      "text-[#684d43]/75",

    badge:
      "bg-brand-cream text-[#684d43]",
  },
];

function formatPrice(
  service:
    HomeService,
) {
  if (
    service.requires_quote
  ) {
    return {
      price:
        "Cotiza",

      label:
        "",
    };
  }

  if (
    service.price ===
    null
  ) {
    return {
      price:
        "Consulta",

      label:
        "",
    };
  }

  return {
    price:
      new Intl.NumberFormat(
        "es-MX",
        {
          style:
            "currency",

          currency:
            service.currency,

          maximumFractionDigits:
            0,
        },
      ).format(
        service.price,
      ),

    label:
      service.currency,
  };
}

function getDetail(
  service:
    HomeService,
) {
  if (
    service.service_type ===
      "group"
  ) {
    return "Para grupos";
  }

  if (
    service.service_type ===
      "package" &&
    service.session_count
  ) {
    return `${service.session_count} sesiones`;
  }

  if (
    service.duration_minutes
  ) {
    return `${service.duration_minutes} min`;
  }

  return "Coaching";
}

export default function HomeServicesShowcase({
  services,
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

  function scrollToCard(
    index: number,
  ) {
    const track =
      trackRef.current;

    if (!track) {
      return;
    }

    const card =
      track.children[
        index
      ] as
        | HTMLElement
        | undefined;

    if (!card) {
      return;
    }

    const left =
      card.offsetLeft -
      (
        track.clientWidth -
        card.clientWidth
      ) /
        2;

    track.scrollTo({
      left,
      behavior:
        "smooth",
    });

    setActiveIndex(
      index,
    );
  }

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
      cards.length === 0
    ) {
      return;
    }

    const center =
      track.scrollLeft +
      track.clientWidth /
        2;

    let closestIndex =
      0;

    let closestDistance =
      Infinity;

    cards.forEach(
      (
        card,
        index,
      ) => {
        const cardCenter =
          card.offsetLeft +
          card.clientWidth /
            2;

        const distance =
          Math.abs(
            center -
              cardCenter,
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

  if (
    services.length === 0
  ) {
    return null;
  }

  return (
    <>
      {/* ===============================================
          MOBILE
      ================================================ */}

      <div className="mt-12 md:hidden">
        <div
          ref={
            trackRef
          }
          onScroll={
            handleScroll
          }
          className="
            -mx-5
            flex
            snap-x
            snap-mandatory
            gap-4
            overflow-x-auto
            scroll-smooth
            px-5
            pb-4
            [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          "
        >
          {services.map(
            (
              service,
              index,
            ) => (
              <div
                key={
                  service.id
                }
                className="
                  w-[86vw]
                  max-w-[365px]
                  shrink-0
                  snap-center
                "
              >
                <ServiceCard
                  service={
                    service
                  }
                  index={
                    index
                  }
                />
              </div>
            ),
          )}
        </div>

        {/* CONTROLES */}

        {services.length >
          1 && (
          <div
            className="
              mt-5
              flex
              items-center
              justify-center
              gap-5
            "
          >
            <button
              type="button"
              aria-label="Servicio anterior"
              disabled={
                activeIndex ===
                0
              }
              onClick={() =>
                scrollToCard(
                  Math.max(
                    0,
                    activeIndex -
                      1,
                  ),
                )
              }
              className="
                flex
                h-11
                w-11
                items-center
                justify-center
                rounded-full
                border
                border-brand-taupe/30
                bg-white/60
                text-lg
                text-brand-brown
                transition
                active:scale-95
                disabled:opacity-30
              "
            >
              ←
            </button>

            <div
              className="
                flex
                items-center
                gap-2
              "
            >
              {services.map(
                (
                  service,
                  index,
                ) => (
                  <button
                    key={
                      service.id
                    }
                    type="button"
                    aria-label={`Ir al servicio ${
                      index +
                      1
                    }`}
                    onClick={() =>
                      scrollToCard(
                        index,
                      )
                    }
                    className={`
                      h-2
                      rounded-full
                      transition-all
                      duration-300
                      ${
                        activeIndex ===
                        index
                          ? "w-7 bg-brand-wine"
                          : "w-2 bg-brand-taupe/50"
                      }
                    `}
                  />
                ),
              )}
            </div>

            <button
              type="button"
              aria-label="Servicio siguiente"
              disabled={
                activeIndex ===
                services.length -
                  1
              }
              onClick={() =>
                scrollToCard(
                  Math.min(
                    services.length -
                      1,
                    activeIndex +
                      1,
                  ),
                )
              }
              className="
                flex
                h-11
                w-11
                items-center
                justify-center
                rounded-full
                border
                border-brand-taupe/30
                bg-white/60
                text-lg
                text-brand-brown
                transition
                active:scale-95
                disabled:opacity-30
              "
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* ===============================================
          TABLET / DESKTOP
      ================================================ */}

      <div
        className="
          mt-14
          hidden
          items-stretch
          gap-5
          md:grid
          md:grid-cols-1
          lg:mt-16
          lg:grid-cols-3
        "
      >
        {services.map(
          (
            service,
            index,
          ) => (
            <ServiceCard
              key={
                service.id
              }
              service={
                service
              }
              index={
                index
              }
            />
          ),
        )}
      </div>
    </>
  );
}

/* =========================================================
   CARD
========================================================= */

function ServiceCard({
  service,
  index,
}: {
  service:
    HomeService;

  index: number;
}) {
  const style =
    CARD_STYLES[
      index %
        CARD_STYLES.length
    ];

  const price =
    formatPrice(
      service,
    );

  return (
    <article
      className={`
        fabric-card
        group
        relative
        grid
        h-full
        min-h-[430px]
        grid-rows-[auto_auto_1fr_auto]
        overflow-hidden
        rounded-[1.75rem]
        p-7
        shadow-[0_18px_45px_rgba(59,42,36,0.11)]
        transition-all
        duration-300
        hover:-translate-y-1
        hover:shadow-[0_24px_55px_rgba(59,42,36,0.16)]
        sm:p-8
        ${style.background}
        ${style.text}
      `}
    >
      <div
        className="
          flex
          min-h-[62px]
          items-start
          justify-between
        "
      >
        <span
          className="
            pt-2
            text-xs
            font-semibold
            tracking-[0.2em]
            opacity-70
          "
        >
          {String(
            index + 1,
          ).padStart(
            2,
            "0",
          )}
        </span>

        <div
          className={`
            flex
            min-h-[58px]
            min-w-[92px]
            flex-col
            items-center
            justify-center
            rounded-full
            px-4
            py-2
            text-center
            ${style.badge}
          `}
        >
          <p
            className="
              text-lg
              font-semibold
              leading-none
            "
          >
            {
              price.price
            }
          </p>

          <p
            className={`
              mt-1
              min-h-[10px]
              text-[0.6rem]
              font-semibold
              tracking-[0.15em]
              ${
                price.label
                  ? "opacity-70"
                  : "opacity-0"
              }
            `}
          >
            {price.label ||
              "MXN"}
          </p>
        </div>
      </div>

      <div className="mt-9">
        <p
          className="
            min-h-[18px]
            text-xs
            font-semibold
            uppercase
            tracking-[0.22em]
            opacity-70
          "
        >
          {getDetail(
            service,
          )}
        </p>

        <h3
          className="
            mt-3
            min-h-[82px]
            font-display
            text-[2.25rem]
            font-semibold
            leading-[0.98]
            sm:text-[2.4rem]
          "
        >
          {service.name}
        </h3>
      </div>

      <div className="pt-5">
        <p
          className={`
            text-sm
            leading-7
            sm:text-base
            ${style.softText}
          `}
        >
          {
            service.short_description
          }
        </p>
      </div>

      <div className="self-end pt-8">
        <Link
          href={
            routes.services
          }
          className="
            inline-flex
            items-center
            gap-5
            border-b
            border-current
            pb-1
            text-sm
            font-semibold
            transition-all
            duration-300
            group-hover:gap-7
          "
        >
          Ver detalles

          <span
            aria-hidden="true"
          >
            →
          </span>
        </Link>
      </div>

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          -bottom-16
          -right-16
          h-40
          w-40
          rounded-full
          border
          border-current
          opacity-15
        "
      />

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          -bottom-8
          -right-8
          h-24
          w-24
          rounded-full
          border
          border-current
          opacity-10
        "
      />
    </article>
  );
}