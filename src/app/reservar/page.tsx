import type { Metadata } from "next";

import Header from "@/components/publico/Header";
import Footer from "@/components/publico/Footer";
import BookingFlow from "@/components/publico/reservar/BookingFlow";

import { getActiveServices } from "@/lib/data/services";
import { assertStripeCatalogReady, getVerifiedStripeContext, isStripeCheckoutEnabled, verifyImmediatePaymentMethods } from "@/lib/stripe/server";
import { isBookingId } from "@/lib/stripe/access";

export const metadata: Metadata = {
  title: "Agendar una cita",
  description:
    "Selecciona tu servicio, fecha y horario para agendar una sesión.",
};

type BookingPageProps = {
  searchParams: Promise<{
    service?: string;
    restart?: string;
  }>;
};

export default async function BookingPage({
  searchParams,
}: BookingPageProps) {
  const { service, restart } = await searchParams;

  const services = await getActiveServices();

  const bookableServices = services.filter(
    (item) => item.booking_enabled,
  );
  let checkoutEnabled = false;
  if (isStripeCheckoutEnabled()) {
    try {
      const { config, stripe } = await getVerifiedStripeContext({ forNewSale: true });
      await verifyImmediatePaymentMethods(stripe, config);
      await assertStripeCatalogReady();
      checkoutEnabled = true;
    } catch { /* Missing/discrepant configuration keeps both products paused. */ }
  }

  return (
    <>
      <Header />

      <main className="bg-brand-cream">
        <BookingFlow
          services={bookableServices}
          initialServiceSlug={service}
          stripeCheckoutEnabled={checkoutEnabled}
          reservationRestartId={isBookingId(restart) ? restart : undefined}
        />
      </main>

      <Footer />
    </>
  );
}
