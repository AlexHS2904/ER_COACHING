import { NextRequest, NextResponse } from "next/server";
import { assertStripeCatalogReady, assertStripeSalesReady, getStripeBookingAdmin, getStripeConfig, getVerifiedStripeContext,
  verifyImmediatePaymentMethods } from "@/lib/stripe/server";
import { createDurableProcessAccess } from "@/lib/coaching/process-access";
import { bookingAccessCookie, bookingFlowCookie, createBookingAccess, holdCookieOptions,
  bookingConfirmationGraceMs, hashBookingAccess, hasBookingAccess, isBookingId } from "@/lib/stripe/access";
import { publicStripeError, rpcError, StripeBookingError } from "@/lib/stripe/errors";
import { createOrRecoverCheckout } from "@/lib/stripe/checkout";
import { enforcePublicAbuse } from "@/lib/security/public-abuse";
import { hasCurrentBookingAcceptance, hasDurableCurrentBookingAcceptance } from "@/lib/legal/acceptance";
import { reconcileStripeCheckoutReturn } from "@/lib/stripe/checkout-return";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let bookingId: string | undefined;
  let bookingReference: string | undefined;
  let token: string | undefined;
  let cookieExpiresAt: Date | undefined;
  let site: string;
  const respond = (body: object, status = 200) => {
    const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (bookingId && token && cookieExpiresAt) {
      response.cookies.set(bookingAccessCookie(bookingId), token, holdCookieOptions(site, cookieExpiresAt));
    }
    return response;
  };
  try {
    const config = getStripeConfig();
    site = config.siteUrl;
    if (request.headers.get("origin") !== site) throw new StripeBookingError("invalid_access");
    let privateLiveTest = false;
    const testIntent = request.headers.get("x-er-admin-live-test");
    if (testIntent !== null) {
      if (testIntent !== "1" || config.mode !== "live") throw new StripeBookingError("invalid_access");
      // An intention header is public input, never a credential. Keep the
      // existing public path free of admin-session work unless requested.
      const { authorizeAdminRequest } = await import("@/lib/admin/authorize-admin");
      const admin = await authorizeAdminRequest();
      if (!admin.ok) return respond({ error: admin.error }, admin.status);
      privateLiveTest = true;
    }
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new StripeBookingError("invalid_request");
    const recovering = isBookingId(body.bookingId);
    if (!recovering && !hasCurrentBookingAcceptance(body.legalAcceptance)) {
      return respond({ error: "Lee y acepta los Términos y Condiciones vigentes antes de continuar." }, 400);
    }
    const recoveryToken = recovering ? request.cookies.get(bookingAccessCookie(body.bookingId))?.value : undefined;
    const identity = recovering
      ? (recoveryToken ? `${body.bookingId}:${recoveryToken}` : undefined)
      : (typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined);
    const limited = await enforcePublicAbuse(request, recovering ? "checkout-recover" : "checkout-create", identity);
    if (limited) return limited;
    const db = getStripeBookingAdmin();
    if (isBookingId(body.bookingId)) {
      if (Object.keys(body).some((key) => !["bookingId", "legalAcceptance"].includes(key))) throw new StripeBookingError("invalid_request");
      bookingId = body.bookingId;
      token = recoveryToken;
      // The secure cookie authorizes recovery; a reference/session ID does not.
      let accessHash: string;
      try { accessHash = hashBookingAccess(token); }
      catch { throw new StripeBookingError("invalid_access"); }
      const recovery = await reconcileStripeCheckoutReturn(bookingId!, token);
      bookingReference = recovery.booking.booking_reference;
      if (recovery.booking.payment_status === "paid" ||
          ["processing", "unknown"].includes(recovery.observation)) {
        // A verified receipt or uncertain provider result is not a request for
        // another charge. Continue the same authorized booking instead.
        return respond({ bookingId, statusUrl: `/reservar/confirmada?ref=${encodeURIComponent(bookingReference!)}`,
          ...(recovery.intake.redirectIntakeUrl ? { redirectIntakeUrl: recovery.intake.redirectIntakeUrl } : {}) });
      }
      if (recovery.booking.finalization_status === "review_required") throw new StripeBookingError("review_required");
      if (recovery.booking.status !== "pending" || recovery.booking.payment_status !== "pending" ||
          !(Date.parse(recovery.booking.payment_expires_at) > Date.now())) {
        throw new StripeBookingError("hold_expired");
      }
      if (!hasDurableCurrentBookingAcceptance(recovery.booking)) {
        if (!hasCurrentBookingAcceptance(body.legalAcceptance)) {
          return respond({ error: "Lee y acepta los Términos y Condiciones vigentes antes de continuar." }, 400);
        }
        // Never overwrite a prior contract with a newer version during retry.
        if (recovery.booking.legal_terms_accepted_at || recovery.booking.legal_adult_confirmed_at ||
            recovery.booking.legal_terms_version || recovery.booking.legal_privacy_notice_version) {
          return respond({ error: "La aceptación de esta reserva necesita revisión. Comunícate con Edna antes de continuar." }, 409);
        }
        const acceptance = await db.rpc("record_booking_legal_acceptance_v1", {
          p_booking_id: bookingId, p_access_token_hash: accessHash,
          p_legal_acceptance: body.legalAcceptance,
        });
        rpcError(acceptance.error);
        if (acceptance.data !== true) throw new StripeBookingError("invalid_access");
      }
    } else {
      const salesOptions = privateLiveTest ? { privateLiveTest: true } : {};
      assertStripeSalesReady(config, salesOptions);
      const allowed = ["service", "startsAt", "name", "email", "phone", "notes", "flowId", "legalAcceptance"];
      if (Object.keys(body).some((key) => !allowed.includes(key)) ||
          !isBookingId(body.flowId) || typeof body.service !== "string" || !body.service.trim() ||
          typeof body.startsAt !== "string" || !Number.isFinite(Date.parse(body.startsAt)) ||
          typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100 ||
          typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
          (body.phone != null && (typeof body.phone !== "string" || body.phone.length > 30)) ||
          (body.notes != null && (typeof body.notes !== "string" || body.notes.length > 2000))) {
        throw new StripeBookingError("invalid_request");
      }
      const context = await getVerifiedStripeContext({ forNewSale: true, ...salesOptions });
      await verifyImmediatePaymentMethods(context.stripe, config);
      const catalog = await assertStripeCatalogReady(db);
      const service = catalog.find((item) => item.slug === body.service.trim());
      if (!service) throw new StripeBookingError("service_unavailable");
      token = request.cookies.get(bookingFlowCookie(body.flowId))?.value;
      if (!token) {
        // Bootstrap before creating a hold. JavaScript receives only a flag;
        // the secret is sent exclusively through Set-Cookie, never JSON/storage.
        const response = respond({ requiresCookie: true });
        response.cookies.set(bookingFlowCookie(body.flowId), createBookingAccess(), {
          ...holdCookieOptions(site, new Date(Date.now() + 2 * 60 * 60 * 1000)),
          path: "/api/bookings/stripe/checkout",
        });
        return response;
      }
      const hash = hashBookingAccess(token);
      // Expiration/reconciliation belongs to the bounded worker. A new sale
      // never waits for an unrelated Stripe network batch. The exclusion
      // constraint remains the final authority when requests race.
      const processAccess = service.service_type === "package" ? createDurableProcessAccess() : null;
      const result = await db.rpc("create_stripe_booking_hold_with_legal_v2", {
        p_service_slug: body.service.trim(), p_starts_at: body.startsAt.trim(),
        p_customer_name: body.name.trim(), p_customer_email: body.email.trim().toLowerCase(),
        p_customer_phone: body.phone?.trim() || null, p_notes: body.notes?.trim() || null,
        p_access_token_hash: hash,
        p_legal_acceptance: body.legalAcceptance,
        p_stripe_mode: config.mode, p_stripe_account_id: config.accountId, p_site_url: site,
        p_process_access_token_hash: processAccess?.tokenHash ?? null,
        p_process_access_token_encrypted: processAccess?.tokenEncrypted ?? null,
      });
      rpcError(result.error);
      if (!isBookingId(result.data?.booking_id)) throw new StripeBookingError("checkout_unavailable");
      bookingId = result.data.booking_id;
      bookingReference = result.data.booking_reference;
      const deadline = Date.parse(result.data.payment_expires_at);
      if (!Number.isFinite(deadline)) throw new StripeBookingError("checkout_unavailable");
      cookieExpiresAt = new Date(deadline + bookingConfirmationGraceMs);
    }
    const result = await createOrRecoverCheckout(bookingId!, hashBookingAccess(token));
    return respond({ checkoutUrl: result.url, bookingId });
  } catch (error) {
    // The webhook may win between recovery and the Checkout claim, or Stripe
    // may have completed the Session just after our previous observation.
    if (error instanceof StripeBookingError && error.code === "already_paid" && bookingId && token) {
      try {
        const recovery = await reconcileStripeCheckoutReturn(bookingId, token);
        if (recovery.booking.payment_status === "paid" || recovery.observation === "processing") {
          return respond({ bookingId,
            statusUrl: `/reservar/confirmada?ref=${encodeURIComponent(recovery.booking.booking_reference)}`,
            ...(recovery.intake.redirectIntakeUrl ? { redirectIntakeUrl: recovery.intake.redirectIntakeUrl } : {}) });
        }
      } catch { /* Preserve the original safe conflict if reconciliation fails. */ }
    }
    const failure = publicStripeError(error);
    if (bookingId && token && !bookingReference &&
        !(error instanceof StripeBookingError && error.code === "invalid_access")) {
      try {
        const owned = await getStripeBookingAdmin().from("bookings")
          .select("booking_reference,booking_access_token_hash").eq("id", bookingId).maybeSingle();
        if (!owned.error && owned.data && hasBookingAccess(token, owned.data.booking_access_token_hash)) {
          bookingReference = owned.data.booking_reference;
        }
      } catch { /* Missing access never yields a private recovery destination. */ }
    }
    console.error("Stripe checkout request deferred", { bookingId, code: failure.code });
    return respond({ ...failure, ...(bookingId ? { bookingId } : {}),
      ...(bookingReference
        ? { statusUrl: `/reservar/confirmada?ref=${encodeURIComponent(bookingReference)}` } : {}),
    }, error instanceof StripeBookingError && error.code === "invalid_access" ? 403 : 409);
  }
}
