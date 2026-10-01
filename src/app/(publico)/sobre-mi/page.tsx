import type { Metadata } from "next";

import AboutHero from "@/components/publico/sobre-mi/AboutHero";
import ApproachSection from "@/components/publico/sobre-mi/ApproachSection";

export const metadata: Metadata = {
  title: "Sobre mí",
  description:
    "Conoce el enfoque de coaching y la forma de acompañamiento utilizada durante cada proceso.",
};

export default function SobreMiPage() {
  return (
    <main>
      <AboutHero />
      <ApproachSection />
    </main>
  );
}