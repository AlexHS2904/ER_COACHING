import { NextRequest, NextResponse } from "next/server";
import { hashProcessAccessToken, processSessionBookingAccess } from "@/lib/coaching/process-access";
import { hasVerifiedProcessPurchase, isProcessWithinValidity, type ProcessPurchase } from "@/lib/coaching/process-entitlement";
import { finalizePaidBooking } from "@/lib/bookings/finalize-paid-booking";
import { bookingAccessCookie, bookingCookieOptions, hashBookingAccess, isBookingId } from "@/lib/stripe/access";
import { assertStripeRecordScope, getStripeConfig } from "@/lib/stripe/server";
import { enforcePublicAbuse } from "@/lib/security/public-abuse";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };
const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const reply = (data: object, status: number) => NextResponse.json(data, { status, headers: privateHeaders });

/** A process token authorizes this process only. The database serializes the
 * entitlement and verifies the original Stripe purchase again atomically.
 * No Calendar, email or financial state is written directly by this route.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const limited = await enforcePublicAbuse(request, "process-session", token);
  if (limited) return limited;
  if (!/^[a-f0-9]{64}$/.test(token)) return reply({ error: "El acceso al proceso no es válido." }, 404);

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "La solicitud no es válida." }, 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !["startsAt", "notes", "requestId"].includes(key)) ||
        typeof input.startsAt !== "string" || !input.startsAt.trim() ||
        typeof input.requestId !== "string" ||
        (input.notes !== undefined && typeof input.notes !== "string")) {
      return reply({ error: "La solicitud no es válida." }, 400);
    }
    const startsAt = new Date(input.startsAt);
    const notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (!Number.isFinite(startsAt.getTime()) || notes.length > 2000) {
      return reply({ error: "El horario o las notas no son válidos." }, 400);
    }
    let bookingToken: string;
    try { bookingToken = processSessionBookingAccess(token, input.requestId); }
    catch { return reply({ error: "La solicitud no es válida." }, 400); }

    const db = getSupabaseAdmin();
    const tokenHash = hashProcessAccessToken(token);
    const read = await db.from("coaching_processes")
      .select("id,status,purchase_booking_id,total_sessions,stripe_mode,stripe_account_id,expires_at")
      .eq("access_token_hash", tokenHash).maybeSingle();
    if (read.error) return reply({ error: "No fue posible verificar el acceso al proceso." }, 503);
    if (!read.data) return reply({ error: "El acceso al proceso no es válido." }, 404);
    const process = read.data;
    const purchase = process.purchase_booking_id ? await db.from("bookings")
      .select("id,process_id,package_session_number,payment_status,payment_provider,payment_flow,payment_reference,paid_at,stripe_mode,stripe_account_id")
      .eq("id", process.purchase_booking_id).maybeSingle() : { data: null, error: null };
    if (purchase.error) return reply({ error: "No fue posible verificar el pago del proceso." }, 503);
    if (!hasVerifiedProcessPurchase(process, purchase.data as ProcessPurchase | null) || process.status !== "active") {
      return reply({ code: "payment_required", error: "Este proceso requiere un pago confirmado antes de agendar sesiones." }, 409);
    }

    const config = getStripeConfig(); // New-sales switch does not revoke a previously purchased entitlement.
    try { assertStripeRecordScope(process, { mode: config.mode, accountId: config.accountId }); }
    catch { return reply({ error: "No fue posible verificar el acceso al proceso." }, 409); }
    if (request.headers.get("origin") !== config.siteUrl) {
      return reply({ error: "El acceso al proceso no es válido." }, 403);
    }
    if (!isProcessWithinValidity(process.expires_at)) {
      return reply({ error: "La vigencia del paquete terminó. Puedes seguir consultando tus sesiones." }, 409);
    }
    const bookingHash = hashBookingAccess(bookingToken);
    const result = await db.rpc("create_stripe_process_session_v1", {
      p_access_token_hash: tokenHash, p_starts_at: startsAt.toISOString(), p_notes: notes || null,
      p_booking_access_token_hash: bookingHash, p_stripe_mode: config.mode, p_stripe_account_id: config.accountId,
    });
    if (result.error) {
      const message = result.error.message ?? "";
      if (message.includes("process_outside_validity")) {
        return reply({ error: "La sesión debe realizarse dentro de la vigencia original del paquete." }, 409);
      }
      const completed = /all_sessions_used|todas las sesiones|session_limit|process_sessions_exhausted/.test(message);
      const conflict = /slot_unavailable|slot_conflict|no está disponible|acaba de ser reservado|idempotency_conflict|ya fue agendada/.test(message);
      const denied = /invalid_access|process_not_active|process_unavailable|payment_required|scope_mismatch|stripe_context_mismatch/.test(message);
      return reply({ error: completed ? "Ya se han utilizado todas las sesiones de este proceso."
        : conflict ? "Ese horario ya no está disponible. Actualiza la página y selecciona otro."
        : denied ? "Este proceso no está disponible para agendar sesiones."
        : "No fue posible agendar la sesión." }, completed || conflict || denied ? 409 : 503);
    }
    const value = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!value || !isBookingId(value.booking_id) || value.process_id !== process.id || !value.booking_reference) {
      return reply({ error: "No fue posible recuperar la sesión. Actualiza tu proceso antes de volver a intentarlo." }, 503);
    }

    // The finalizer owns stable Calendar IDs, idempotent emails, and recovery.
    // A temporary integration failure leaves the same paid session queued.
    try { await finalizePaidBooking(value.booking_id); }
    catch { console.error("Paid process session remains queued", { bookingId: value.booking_id }); }

    const booking = await db.from("bookings")
      .select("id,booking_reference,status,finalization_status,calendar_status,google_event_id,google_calendar_url,google_meet_url,customer_email_status,coach_email_status")
      .eq("id", value.booking_id).eq("process_id", process.id).eq("booking_access_token_hash", bookingHash).maybeSingle();
    const saved = booking.data;
    const response = reply({ success: true, bookingId: value.booking_id, bookingReference: value.booking_reference,
      processId: process.id, processReference: value.process_reference, sessionNumber: value.package_session_number,
      status: saved?.status ?? "pending", finalizationStatus: saved?.finalization_status ?? "pending",
      calendar: { eventId: saved?.google_event_id ?? null, calendarUrl: saved?.google_calendar_url ?? null,
        meetUrl: saved?.google_meet_url ?? null },
      emails: { customer: saved?.customer_email_status ?? "pending", coach: saved?.coach_email_status ?? "pending" },
    }, 201);
    response.cookies.set(bookingAccessCookie(value.booking_id), bookingToken, bookingCookieOptions);
    return response;
  } catch {
    // Never log a request URL, the process token, or integration objects.
    return reply({ error: "No fue posible procesar la solicitud. Intenta nuevamente con el mismo horario." }, 503);
  }
}
