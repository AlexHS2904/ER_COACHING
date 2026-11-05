import "server-only";
import { hasBookingAccess } from "@/lib/stripe/access";
import { getStripeBookingAdmin } from "@/lib/stripe/server";
import { storedIntakeUrl } from "@/lib/intake/stored-intake-url";
import { bookingSiteOrigin } from "@/lib/bookings/site-origin";

export async function bookingIntakeDestination(booking: {
  id: string; booking_access_token_hash: string | null; status: string;
  payment_status: string; payment_flow: string | null; finalization_status: string | null;
  process_id?: string | null; stripe_mode?: string | null; stripe_account_id?: string | null;
  stripe_site_origin?: string | null;
  requires_intake_snapshot?: boolean | null;
}, accessToken: unknown): Promise<{ status: "waiting" | "submitted" | "available" | "unavailable" | "not_required"; redirectIntakeUrl: string | null }> {
  if (!hasBookingAccess(accessToken, booking.booking_access_token_hash) ||
      booking.payment_flow !== "stripe" || booking.payment_status !== "paid" ||
      booking.status !== "confirmed" || booking.finalization_status !== "completed") {
    return { status: "waiting", redirectIntakeUrl: null };
  }
  if (booking.requires_intake_snapshot === false) return { status: "not_required", redirectIntakeUrl: null };
  try {
    const db = getStripeBookingAdmin();
    let purchaseBookingId = booking.id;
    if (booking.process_id) {
      const process = await db.from("coaching_processes")
        .select("id,purchase_booking_id,stripe_mode,stripe_account_id,status")
        .eq("id", booking.process_id).maybeSingle();
      if (process.error || !process.data || !["active", "completed"].includes(process.data.status) ||
          process.data.stripe_mode !== booking.stripe_mode || process.data.stripe_account_id !== booking.stripe_account_id ||
          !process.data.purchase_booking_id) return { status: "unavailable", redirectIntakeUrl: null };
      purchaseBookingId = process.data.purchase_booking_id;
    }
    const form = await db.from("booking_intake_forms")
      .select("booking_id,process_id,source_type,status,submitted_at,expires_at,access_token_hash,access_token_encrypted")
      .eq(booking.process_id ? "process_id" : "booking_id", booking.process_id ?? booking.id).maybeSingle();
    if (form.error || !form.data || form.data.booking_id !== purchaseBookingId ||
        (booking.process_id && form.data.process_id !== booking.process_id) || form.data.source_type !== "booking") {
      return { status: "unavailable", redirectIntakeUrl: null };
    }
    if (form.data.status === "submitted" && form.data.submitted_at) return { status: "submitted", redirectIntakeUrl: null };
    if (form.data.status !== "active" || form.data.submitted_at || !(Date.parse(form.data.expires_at) > Date.now())) {
      return { status: "unavailable", redirectIntakeUrl: null };
    }
    return { status: "available", redirectIntakeUrl: storedIntakeUrl(form.data, bookingSiteOrigin(booking)) };
  } catch {
    return { status: "unavailable", redirectIntakeUrl: null };
  }
}
