import type { Metadata } from "next";

import AboutHero from "@/components/publico/sobre-mi/AboutHero";
import ApproachSection from "@/components/publico/sobre-mi/ApproachSection";
import AboutCTA from "@/components/publico/sobre-mi/AboutCTA";

export const metadata: Metadata = {
  title: "Sobre mí",
  description:
    "Conoce el enfoque de acompañamiento, filosofía y forma de trabajo de la coach.",
};

export default function AboutPage() {
  return (
    <main>
      <AboutHero />
      <ApproachSection />
      <AboutCTA />
    </main>
  );
}