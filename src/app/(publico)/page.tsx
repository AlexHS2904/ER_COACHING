import AboutSection from "@/components/publico/home/AboutSection";
import BookingCTA from "@/components/publico/home/BookingCTA";
import Hero from "@/components/publico/home/Hero";
import ProcessSection from "@/components/publico/home/ProcessSection";
import ServicesSection from "@/components/publico/home/ServicesSection";
import TestimonialsSection from "@/components/publico/home/TestimonialsSection";

export default function HomePage() {
  return (
    <main>
      <Hero />
      <AboutSection />
      <ServicesSection />
      <ProcessSection />
      <TestimonialsSection />
      <BookingCTA />
    </main>
  );
}