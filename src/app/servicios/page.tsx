import type { Metadata } from "next";

import Header from "@/components/publico/Header";
import ServicesCatalog from "@/components/publico/servicios/ServicesCatalog";

import { getActiveServices } from "@/lib/data/services";

export const metadata: Metadata = {
  title: "Servicios",
  description:
    "Conoce las opciones de coaching disponibles y encuentra el acompañamiento que mejor se adapte a ti.",
};

export default async function ServicesPage() {
  const services = await getActiveServices();

  return (
    <>
      <Header />

      <main>
        <ServicesCatalog services={services} />
      </main>
    </>
  );
}