"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

type Direction = "up" | "left" | "right";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  direction?: Direction;
  delay?: number;
};

const hiddenPosition: Record<Direction, string> = {
  up: "translate-y-4",
  left: "-translate-x-4",
  right: "translate-x-4",
};

export default function ScrollReveal({
  children,
  className = "",
  direction = "up",
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    if (mobileQuery.matches || reducedMotionQuery.matches) {
      element.dataset.visible = "true";
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;

        /*
         * No usamos setState.
         *
         * Cambiamos únicamente un atributo del DOM,
         * evitando un render adicional de React.
         */
        requestAnimationFrame(() => {
          element.dataset.visible = "true";
        });

        observer.unobserve(element);
      },
      {
        threshold: 0.01,
        rootMargin: "0px 0px 15% 0px",
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-visible="false"
      style={
        {
          "--reveal-delay": `${delay}ms`,
        } as CSSProperties
      }
      className={`
        ${hiddenPosition[direction]}

        opacity-0

        transition-[opacity,transform]
        duration-[420ms]
        ease-[cubic-bezier(0.22,1,0.36,1)]

        [transition-delay:var(--reveal-delay)]

        data-[visible=true]:translate-x-0
        data-[visible=true]:translate-y-0
        data-[visible=true]:opacity-100

        max-md:translate-x-0
        max-md:translate-y-0
        max-md:opacity-100
        max-md:transition-none

        motion-reduce:translate-x-0
        motion-reduce:translate-y-0
        motion-reduce:opacity-100
        motion-reduce:transition-none

        ${className}
      `}
    >
      {children}
    </div>
  );
}