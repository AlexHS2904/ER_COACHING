"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type Direction = "up" | "left" | "right";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  direction?: Direction;
  delay?: number;
};

const hiddenPosition: Record<Direction, string> = {
  up: "translate-y-5",
  left: "-translate-x-5",
  right: "translate-x-5",
};

export default function ScrollReveal({
  children,
  className = "",
  direction = "up",
  delay = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.5,
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
      }}
      className={`
        transition-all duration-700
        ease-[cubic-bezier(0.22,1,0.36,1)]
        motion-reduce:transform-none
        motion-reduce:opacity-100
        motion-reduce:transition-none
        ${
          visible
            ? "translate-x-0 translate-y-0 opacity-100"
            : `opacity-0 ${hiddenPosition[direction]}`
        }
        ${className}
      `}
    >
      {children}
    </div>
  );
}