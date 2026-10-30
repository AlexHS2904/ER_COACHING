import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Footer from "@/components/publico/Footer";
import Header from "@/components/publico/Header";
import BookingStatusActions from "@/components/publico/reservar/BookingStatusActions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripeBookingAdmin } from "@/lib/stripe/server";
import { bookingAccessCookie, hasBookingAccess, isBookingId } from "@/lib/stripe/access";
import { bookingConfirmationState } from "@/lib/bookings/confirmation-state";
import { bookingIntakeDestination } from "@/lib/bookings/intake-destination";
import { reconcileStripeCheckoutReturn, type CheckoutReturnObservation } from "@/lib/stripe/checkout-return";
import { hasDurableCurrentBookingAcceptance } from "@/lib/legal/acceptance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estado de tu reserva", robots: { index: false, follow: false } };

export default async function BookingConfirmationPage({ searchParams }: {
  searchParams: Promise<{ ref?: string; booking?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  let verified = null;
  let observation: CheckoutReturnObservation = "unpaid";
  let intake: Awaited<ReturnType<typeof bookingIntakeDestination>> = { status: "waiting", redirectIntakeUrl: null };
  try {
    const db = isBookingId(params.booking) ? getStripeBookingAdmin() : getSupabaseAdmin();
    const query = db.from("bookings").select(
      "id,booking_reference,status,payment_status,payment_flow,finalization_status,expired_at,payment_expires_at,booking_access_token_hash,legal_terms_accepted_at,legal_terms_version,legal_privacy_notice_version,legal_adult_confirmed_at",
    );
    const result = isBookingId(params.booking)
      ? await query.eq("id", params.booking).maybeSingle()
      : typeof params.ref === "string" && params.ref.length <= 100
        ? await query.eq("booking_reference", params.ref).maybeSingle()
        : { data: null, error: null };
    if (!result.error && result.data) {
      const token = (await cookies()).get(bookingAccessCookie(result.data.id))?.value;
      if (hasBookingAccess(token, result.data.booking_access_token_hash)) {
        if (result.data.payment_flow === "stripe") {
          const returned = await reconcileStripeCheckoutReturn(result.data.id, token, params.session_id);
          verified = returned.booking;
          intake = returned.intake;
          observation = returned.observation;
        } else if (!params.session_id) {
          verified = result.data;
          intake = await bookingIntakeDestination(verified, token);
        }
      }
    }
  } catch {
    // No identifiers, secrets, tokens, or customer data are logged or exposed.
  }
  // Keep Next's redirect outside the error boundary: its control-flow exception
  // must reach the router. Completed returns never render the payment screen.
  if (intake.redirectIntakeUrl) redirect(intake.redirectIntakeUrl);
  const serverNow = Date.now();
  const processing = Boolean(verified && verified.payment_status !== "paid" &&
    verified.status !== "cancelled" && verified.finalization_status !== "review_required" &&
    ["processing", "unknown"].includes(observation));
  const state = processing ? {
    title: "Pago en proceso", detail: "Estamos verificando tu pago y preparando tu sesión. No realices otro pago.", refresh: true,
  } : verified ? bookingConfirmationState(verified, intake.status, serverNow) : {
    title: "Consulta el enlace desde el navegador de tu reserva",
    detail: "No pudimos verificar el acceso. Revisa tu correo o comunícate con Edna si necesitas ayuda.", refresh: false,
  };
  const canPay = !processing && verified?.payment_flow === "stripe" && verified.status === "pending" &&
    verified.payment_status === "pending" && verified.finalization_status !== "review_required" &&
    Date.parse(verified.payment_expires_at) > serverNow;
  const paymentExpiresAt = !processing && verified?.payment_flow === "stripe" && verified.status === "pending" &&
    verified.payment_status === "pending" && verified.finalization_status !== "review_required"
    ? verified.payment_expires_at : null;
  return <>
    <Header />
    <main className="min-h-[75vh] bg-brand-cream">
      <section className="mx-auto max-w-[720px] px-5 py-20 text-center sm:py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-wine">Estado de tu reserva</p>
        <h1 className="mt-4 font-display text-5xl leading-tight text-brand-brown">{state.title}</h1>
        <p className="mt-6 leading-7 text-brand-brown/60">{state.detail}</p>
        {verified && <>
          <p className="mt-8 text-sm text-brand-brown/60">Código de reserva</p>
          <p className="mt-2 font-display text-3xl text-brand-brown">{verified.booking_reference}</p>
          <BookingStatusActions bookingId={verified.id} refresh={state.refresh} canPay={Boolean(canPay)}
            paymentExpiresAt={paymentExpiresAt} serverNow={serverNow} redirectIntakeUrl={intake.redirectIntakeUrl}
            legalAccepted={hasDurableCurrentBookingAcceptance(verified)} processing={processing} />
          {verified.status === "cancelled" && verified.expired_at &&
            <Link href={`/reservar?restart=${verified.id}`} className="mt-6 inline-flex rounded-xl bg-brand-wine px-6 py-3 font-semibold text-white">Elegir otro horario</Link>}
        </>}
        <Link href="/" className="mt-10 inline-flex rounded-xl border border-brand-wine/25 px-6 py-3 font-semibold text-brand-wine">Volver al inicio</Link>
      </section>
    </main>
    <Footer />
  </>;
}
