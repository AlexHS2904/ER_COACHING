import assert from "node:assert/strict";
import { test } from "node:test";
import { testModules } from "./helpers/load-typescript.mjs";

const legalAcceptance = testModules().load("src/lib/legal/acceptance.ts").currentBookingAcceptance;
const paymentPolicy = testModules().load("src/lib/bookings/payment-policy.ts");
const bookingId = "11111111-1111-4111-8111-111111111111";
const processToken = "a".repeat(64);

function jsonResponse(data, init = {}) {
  return { data, status: init.status ?? 200, headers: init.headers ?? {}, cookies: { set() {} } };
}

function bookingBody(overrides = {}) {
  return {
    service: "sesion-1-1",
    startsAt: "2035-01-01T12:00:00.000Z",
    name: "Fixture Customer",
    email: "fixture@example.test",
    legalAcceptance,
    ...overrides,
  };
}

function legacyBookingFixture({ service, checkoutEnabled = false, createdBooking = null, host = "www.ednarojocoaching.com" } = {}) {
  const calls = [];
  const db = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          calls.push({ read: table });
          return { data: table === "services" ? service : null, error: null };
        },
        async single() {
          calls.push({ read: table });
          return { data: table === "bookings" ? createdBooking : null, error: null };
        },
        update(values) {
          calls.push({ update: table, values });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      return createdBooking
        ? { data: [{ booking_id: bookingId, booking_reference: "FIXTURE-1" }], error: null }
        : { data: null, error: { message: "fixture stops after the RPC boundary" } };
    },
  };
  const modules = testModules({
    "next/server": { NextResponse: { json: jsonResponse } },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
    "@/lib/stripe/server": { isStripeTestCheckoutEnabled: () => checkoutEnabled },
    "@/lib/security/public-abuse": { enforcePublicAbuse: async () => null },
    "@/lib/google/safe-error": { googleErrorLogMetadata: error => ({ message: error?.message }) },
    "@/lib/google/calendar": { createGoogleCalendarEvent: async () => { calls.push("calendar"); throw new Error("unexpected calendar"); } },
    "@/lib/email/send-booking-emails": { sendBookingEmails: async () => { calls.push("email"); throw new Error("unexpected email"); } },
    "@/lib/coaching/process-access": { createProcessAccess: () => ({ token: processToken, tokenHash: "process-hash" }) },
    "@/lib/stripe/access": {
      createBookingAccess: () => "booking-token", hashBookingAccess: () => "booking-hash",
      bookingAccessCookie: () => "booking-access", bookingCookieOptions: () => ({}),
    },
  });
  const request = { headers: new Headers({ host, origin: `https://${host}` }), json: async () => bookingBody({
    // These client claims must never make a paid booking eligible for the legacy route.
    price: 0, status: "confirmed", payment_status: "paid", payment_provider: "stripe", paid_at: "2035-01-01T00:00:00Z",
  }) };
  return { calls, route: modules.load("src/app/api/bookings/route.ts"), request };
}

test("payment policy fails closed for paid, malformed and unknown prices", () => {
  for (const value of [500, "500.00", 2500, null, undefined, "", "not-a-price", -1]) {
    assert.equal(paymentPolicy.serviceRequiresPayment(value), true, `${String(value)} must require payment`);
  }
  assert.equal(paymentPolicy.serviceRequiresPayment(0), false);
  assert.equal(paymentPolicy.serviceRequiresPayment("0.00"), false);
  assert.equal(paymentPolicy.canUsePublicStripeCheckout({
    slug: "sesion-1-1", service_type: "single", session_count: 1,
  }, true), true);
  assert.equal(paymentPolicy.canUsePublicStripeCheckout({
    slug: "proceso", service_type: "package", session_count: 6,
  }, true), false);
});

for (const service of [
  { slug: "sesion-1-1", service_type: "single", name: "Sesión 1:1", price: 500, session_count: 1, booking_enabled: true, requires_quote: false },
  { slug: "proceso-de-coaching", service_type: "package", name: "Proceso", price: 2500, session_count: 6, booking_enabled: true, requires_quote: false },
]) {
  test(`legacy public booking refuses priced ${service.service_type} before RPC, Calendar or email`, async () => {
    const f = legacyBookingFixture({ service });
    const response = await f.route.POST(f.request);
    assert.equal(response.status, 503);
    assert.equal(response.data.code, "payment_unavailable");
    assert.match(response.data.error, /No se creó una reserva/);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(f.calls.some(call => call.rpc), false);
    assert.equal(f.calls.includes("calendar"), false);
    assert.equal(f.calls.includes("email"), false);
    assert.equal(JSON.stringify(response.data).includes("fixture@example.test"), false);
  });
}

test("legacy direct 1:1 request is rejected even when Stripe is available", async () => {
  const f = legacyBookingFixture({
    checkoutEnabled: true,
    service: { slug: "sesion-1-1", service_type: "single", price: 500, session_count: 1, booking_enabled: true, requires_quote: false },
  });
  const response = await f.route.POST(f.request);
  assert.equal(response.status, 409);
  assert.equal(response.data.code, "checkout_required");
  assert.equal(f.calls.some(call => call.rpc), false);
  assert.equal(f.calls.includes("calendar"), false);
  assert.equal(f.calls.includes("email"), false);
});

for (const host of ["www.ednarojocoaching.com", "ednarojocoaching.com"]) {
  test(`apex/www host headers cannot bypass the server payment guard (${host})`, async () => {
    const f = legacyBookingFixture({
      host,
      service: { slug: "sesion-1-1", service_type: "single", price: 500, session_count: 1, booking_enabled: true, requires_quote: false },
    });
    const response = await f.route.POST(f.request);
    assert.equal(response.status, 503);
    assert.equal(f.calls.some(call => call.rpc), false);
    assert.equal(f.calls.includes("calendar"), false);
    assert.equal(f.calls.includes("email"), false);
  });
}

test("legacy route rechecks the immutable booking price snapshot before Calendar and email", async () => {
  const f = legacyBookingFixture({
    service: { slug: "sesion-1-1", service_type: "single", price: 0, session_count: 1, booking_enabled: true, requires_quote: false },
    createdBooking: {
      id: bookingId, booking_reference: "FIXTURE-1", process_id: null, package_session_number: null,
      service_name_snapshot: "Sesión 1:1", starts_at: "2035-01-01T12:00:00Z", ends_at: "2035-01-01T13:00:00Z",
      price_snapshot: "500.00", payment_status: "pending", payment_provider: null, paid_at: null,
    },
  });
  const response = await f.route.POST(f.request);
  assert.equal(response.status, 409);
  assert.equal(response.data.code, "payment_required");
  assert.equal(f.calls.some(call => call.rpc === "create_booking_with_legal_v1"), true);
  assert.equal(f.calls.some(call => call.update === "bookings" && call.values.status === "cancelled"), true);
  assert.equal(f.calls.includes("calendar"), false);
  assert.equal(f.calls.includes("email"), false);
});

function processSessionFixture({ paid = false, price = 2500, missingBooking = false } = {}) {
  const calls = [];
  const db = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          calls.push({ read: table });
          if (table === "coaching_processes") return { data: { id: "process-id" }, error: null };
          if (table === "bookings") return { data: missingBooking ? null : {
            price_snapshot: price, payment_status: paid ? "paid" : "pending",
            payment_provider: paid ? "stripe" : null, paid_at: paid ? "2035-01-01T00:00:00Z" : null,
          }, error: null };
          return { data: null, error: null };
        },
      };
    },
    async rpc(name) {
      calls.push({ rpc: name });
      return { data: null, error: { message: "ya no está disponible" } };
    },
  };
  const modules = testModules({
    "next/server": { NextResponse: { json: jsonResponse } },
    "@/lib/coaching/process-access": { hashProcessAccessToken: () => "process-hash" },
    "@/lib/security/public-abuse": { enforcePublicAbuse: async () => null },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
    "@/lib/google/safe-error": { googleErrorLogMetadata: error => ({ message: error?.message }) },
    "@/lib/google/calendar": { createGoogleCalendarEvent: async () => { calls.push("calendar"); } },
    "@/lib/email/send-booking-emails": { sendBookingEmails: async () => { calls.push("email"); } },
  });
  return {
    calls,
    route: modules.load("src/app/api/processes/[token]/sessions/route.ts"),
    request: { json: async () => ({ startsAt: "2035-01-01T12:00:00Z" }) },
    context: { params: Promise.resolve({ token: processToken }) },
  };
}

test("package session endpoint rejects unpaid or unverifiable initial booking before the RPC", async () => {
  for (const options of [{}, { missingBooking: true }]) {
    const f = processSessionFixture(options);
    const response = await f.route.POST(f.request, f.context);
    assert.equal(response.status, 409);
    assert.equal(response.data.code, "payment_required");
    assert.equal(f.calls.some(call => call.rpc), false);
    assert.equal(f.calls.includes("calendar"), false);
    assert.equal(f.calls.includes("email"), false);
  }
});

test("package session endpoint reaches the existing RPC for a recorded Stripe-paid package", async () => {
  const f = processSessionFixture({ paid: true });
  const response = await f.route.POST(f.request, f.context);
  assert.equal(response.status, 409); // the fixture RPC reports an unavailable slot
  assert.equal(f.calls.some(call => call.rpc === "create_process_session"), true);
  assert.equal(f.calls.includes("calendar"), false);
  assert.equal(f.calls.includes("email"), false);
});

function adminActivationFixture({ paid = false } = {}) {
  const calls = [];
  const booking = {
    payment_flow: paid ? "stripe" : null,
    payment_status: paid ? "paid" : "pending",
    payment_provider: paid ? "stripe" : null,
    paid_at: paid ? "2035-01-01T00:00:00Z" : null,
    price_snapshot: "500.00",
  };
  const db = { from(table) { return {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { calls.push({ read: table }); return { data: booking, error: null }; },
  }; } };
  const modules = testModules({
    "next/server": { NextResponse: { json: jsonResponse } },
    "next/cache": { revalidatePath() {} },
    "@/lib/admin/is-active-admin": { isActiveAdmin: async () => true },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
    "@/lib/intake/activate-booking-intake": { activateBookingIntake: async () => {
      calls.push("activate-intake"); return { canonicalIntakeUrl: "/private-intake", redirectIntakeUrl: "/private-intake" };
    } },
    "@/lib/google/safe-error": { googleErrorLogMetadata: error => ({ message: error?.message }) },
  });
  return { calls, route: modules.load("src/app/api/admin/payments/mark-paid/route.ts") };
}

test("admin manual activation cannot create Intake for an unpaid priced booking", async () => {
  const f = adminActivationFixture();
  const response = await f.route.POST({ url: "https://example.test/api/admin/payments/mark-paid", json: async () => ({ bookingId }) });
  assert.equal(response.status, 409);
  assert.equal(f.calls.includes("activate-intake"), false);
});

test("admin manual payment endpoint never reactivates a Stripe booking", async () => {
  const f = adminActivationFixture({ paid: true });
  const response = await f.route.POST({ url: "https://example.test/api/admin/payments/mark-paid", json: async () => ({ bookingId }) });
  assert.equal(response.status, 409);
  assert.equal(f.calls.includes("activate-intake"), false);
});

function bookingUi({ checkoutEnabled = false, step = 2 } = {}) {
  const changes = [];
  let stateIndex = 0;
  const slot = { starts_at: "2035-01-01T12:00:00Z", ends_at: "2035-01-01T13:30:00Z", local_time: "06:00" };
  const states = { 1: "2035-01-01", 3: slot, 4: [slot], 6: step };
  const modules = testModules({
    react: {
      useRef: value => ({ current: value }), useEffect() {}, useMemo: callback => callback(),
      useState(initial) {
        const index = stateIndex++;
        return [Object.hasOwn(states, index) ? states[index] : initial, value => changes.push([index, value])];
      },
    },
    "next/navigation": { useRouter: () => ({ replace() {} }) },
  });
  const component = modules.load("src/components/publico/reservar/BookingFlow.tsx").default;
  const service = { id: "fixture-service", name: "Sesión 1:1", slug: "sesion-1-1", service_type: "single",
    price: 500, currency: "MXN", session_count: 1, duration_minutes: 90, short_description: "Coaching" };
  const tree = component({ services: [service], stripeCheckoutEnabled: checkoutEnabled });
  const nodes = node => !node || typeof node !== "object" ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  return { nodes: nodes(tree), changes };
}

test("unavailable production payment is visible before data capture and prevents continuation", () => {
  const f = bookingUi();
  assert.ok(f.nodes.some(node => node.props?.role === "status" && JSON.stringify(node.props.children).includes("Reservas temporalmente pausadas")));
  assert.ok(f.nodes.some(node => node.type === "input" && node.props.type === "date"));
  const continueButton = f.nodes.find(node => node.type === "button" && JSON.stringify(node.props.children).includes("Reservas pausadas"));
  assert.equal(continueButton.props.disabled, true);
  continueButton.props.onClick();
  assert.equal(f.changes.some(([index, value]) => index === 6 && value === 3), false);
});

test("unavailable payment does not render the customer-data step even with stale step state", () => {
  const f = bookingUi({ step: 3 });
  assert.equal(f.nodes.some(node => node.type === "input" && node.props.type !== "date"), false);
  assert.equal(f.nodes.some(node => node.type === "button" && node.props.type === "submit"), false);
});

test("configured local Stripe retains data capture and the separate required legal checkbox", () => {
  const f = bookingUi({ checkoutEnabled: true, step: 3 });
  assert.equal(f.nodes.some(node => node.props?.role === "status"), false);
  assert.ok(f.nodes.some(node => node.type === "input" && node.props.type === "email"));
  const legal = f.nodes.find(node => typeof node.type === "function" && node.type.name === "BookingLegalAcceptance");
  assert.equal(legal.props.checked, false);
  const checkbox = legal.type(legal.props);
  assert.match(JSON.stringify(checkbox), /"required":true/);
  const pay = f.nodes.find(node => node.type === "button" && node.props.type === "submit");
  assert.equal(pay.props.disabled, true); // unchecked acceptance remains mandatory
});
