import { requireAdmin } from "@/lib/admin/require-admin";

import ReservationsClient from "@/components/admin/ReservationsClient";
import BookingFlow from "@/components/publico/reservar/BookingFlow";

import { createClient } from "@/lib/supabase/server";
import type { Service } from "@/lib/data/services";
import { assertStripeCatalogReady, getStripeBookingAdmin, getStripeConfig, getVerifiedStripeContext, verifyImmediatePaymentMethods } from "@/lib/stripe/server";

export default async function ReservasPage({ searchParams }: {
  searchParams?: Promise<{ checkoutLiveTest?: string }>;
}) {
  await requireAdmin();

  if ((await searchParams)?.checkoutLiveTest === "1") {
    let services: Service[] = [];
    let checkoutEnabled = false;
    try {
      if (getStripeConfig().mode !== "live") throw new Error("private_live_test_unavailable");
      const { config, stripe } = await getVerifiedStripeContext({ forNewSale: true, privateLiveTest: true });
      await verifyImmediatePaymentMethods(stripe, config);
      services = await assertStripeCatalogReady(getStripeBookingAdmin(), { privateLiveTest: true });
      checkoutEnabled = true;
    } catch { /* Keep the private form unavailable without exposing provider details. */ }

    return (
      <main className="px-5 py-8 sm:px-8 lg:px-10 xl:px-12">
        <div className="mx-auto max-w-[1280px]">
          <h1 className="font-display text-4xl font-semibold text-brand-brown sm:text-5xl">
            Prueba privada de pago Live
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-brand-brown/70">
            Esta prueba realiza un cobro real. Las nuevas reservas de pago siguen pausadas para el público.
          </p>
          {!checkoutEnabled && (
            <p role="alert" className="mt-6 text-sm text-[#8A3535]">
              La prueba privada no está disponible. Revisa la configuración antes de continuar.
            </p>
          )}
          <BookingFlow services={services} stripeCheckoutEnabled={checkoutEnabled} privateLiveTest />
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  const { data: bookings, error } =
    await supabase
      .from("bookings")
      .select(`
        id,
        booking_reference,
        customer_name,
        customer_email,
        customer_phone,
        starts_at,
        ends_at,
        notes,
        status,
        process_id,
        stripe_mode,
        legal_terms_version,
        session_resolution,
        session_resolution_at,
        finalization_status,
        requires_intake_snapshot,
        created_at,
        service_name_snapshot,
        duration_minutes_snapshot,
        session_count_snapshot,
        price_snapshot,
        currency_snapshot,
        google_meet_url,
        google_calendar_url,
        calendar_status,
        customer_email_status,
        coach_email_status,
        customer_email_error,
        coach_email_error,
        payment_status,
        paid_at,
        payment_provider,
        payment_reference
      `)
      .order("starts_at", {
        ascending: false,
      });

  return (
    <main
      className="
        px-5
        py-8
        sm:px-8
        lg:px-10
        xl:px-12
      "
    >
      <div className="mx-auto max-w-[1280px]">
        <header>
          <p className="text-sm text-brand-brown/45">
            Administración
          </p>

          <h1
            className="
              mt-2
              font-display
              text-5xl
              font-semibold
              text-brand-brown
              sm:text-6xl
            "
          >
            Reservas
          </h1>

          <p
            className="
              mt-5
              max-w-2xl
              text-base
              leading-7
              text-brand-brown/55
            "
          >
            Consulta y organiza todas las
            sesiones reservadas desde el
            sitio.
          </p>
        </header>

        {error ? (
          <div
            className="
              mt-10
              rounded-[1.5rem]
              border
              border-[#8A3535]/15
              bg-[#F7E8E8]
              p-6
              text-[#8A3535]
            "
          >
            <p className="font-semibold">
              No fue posible cargar las
              reservas.
            </p>

            <p className="mt-2 text-sm">
              {error.message}
            </p>
          </div>
        ) : (
          <ReservationsClient
            bookings={bookings ?? []}
          />
        )}
      </div>
    </main>
  );
}
