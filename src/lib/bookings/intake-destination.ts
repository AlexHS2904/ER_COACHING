import "server-only";
import { hasBookingAccess } from "@/lib/stripe/access";
import { getStripeBookingAdmin, getStripeTestSiteUrl } from "@/lib/stripe/server";
import { storedIntakeUrl } from "@/lib/intake/stored-intake-url";

export async function bookingIntakeDestination(booking: {
  id: string; booking_access_token_hash: string | null; status: string;
  payment_status: string; payment_flow: string | null; finalization_status: string | null;
}, accessToken: unknown): Promise<{ status: "waiting" | "submitted" | "available" | "unavailable"; redirectIntakeUrl: string | null }> {
  if (!hasBookingAccess(accessToken, booking.booking_access_token_hash) ||
      booking.payment_flow !== "stripe" || booking.payment_status !== "paid" ||
      booking.status !== "confirmed" || booking.finalization_status !== "completed") {
    return { status: "waiting", redirectIntakeUrl: null };
  }
  try {
    const form = await getStripeBookingAdmin().from("booking_intake_forms")
      .select("booking_id,source_type,status,submitted_at,expires_at,access_token_hash,access_token_encrypted")
      .eq("booking_id", booking.id).maybeSingle();
    if (form.error || !form.data || form.data.booking_id !== booking.id || form.data.source_type !== "booking") {
      return { status: "unavailable", redirectIntakeUrl: null };
    }
    if (form.data.status === "submitted" && form.data.submitted_at) return { status: "submitted", redirectIntakeUrl: null };
    if (form.data.status !== "active" || form.data.submitted_at || !(Date.parse(form.data.expires_at) > Date.now())) {
      return { status: "unavailable", redirectIntakeUrl: null };
    }
    return { status: "available", redirectIntakeUrl: storedIntakeUrl(form.data, getStripeTestSiteUrl()) };
  } catch {
    return { status: "unavailable", redirectIntakeUrl: null };
  }
}
