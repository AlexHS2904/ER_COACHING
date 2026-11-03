import assert from "node:assert/strict";
import { test } from "node:test";
import { testModules } from "./helpers/load-typescript.mjs";
import { stripeRuntimeFixture } from "./helpers/stripe-runtime-fixture.mjs";

const processToken = "a".repeat(64);
const requestId = "22222222-2222-4222-8222-222222222222";
const bookingId = "33333333-3333-4333-8333-333333333333";
const processId = "44444444-4444-4444-8444-444444444444";
const purchaseId = "55555555-5555-4555-8555-555555555555";
const startsAt = "2035-01-01T12:00:00.000Z";
const siteUrl = "https://fixture.example.test";
const process = { id: processId, status: "active", total_sessions: 6,
  purchase_booking_id: purchaseId, stripe_mode: "test", stripe_account_id: "acct_fixture" };
const purchase = { id: purchaseId, process_id: processId, package_session_number: 1,
  payment_status: "paid", payment_provider: "stripe", payment_flow: "stripe", payment_reference: "pi_fixture",
  paid_at: "2034-12-01T12:00:00Z", stripe_mode: "test", stripe_account_id: "acct_fixture" };

const helpers = testModules({}, { INTAKE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") });
const access = helpers.load("src/lib/coaching/process-access.ts");
const entitlement = helpers.load("src/lib/coaching/process-entitlement.ts");

test("process credentials are random, durably recoverable, and never rotated on recovery", () => {
  const first = access.createDurableProcessAccess();
  const second = access.createDurableProcessAccess();
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenEncrypted, first.token);
  const row = { access_token_hash: first.tokenHash, access_token_encrypted: first.tokenEncrypted };
  assert.equal(access.recoverProcessAccessToken(row), first.token);
  assert.equal(access.recoverProcessAccessUrl(row, siteUrl), `${siteUrl}/proceso/${first.token}`);
  assert.equal(access.recoverProcessAccessToken(row), first.token);
  assert.throws(() => access.recoverProcessAccessToken({ ...row, access_token_hash: second.tokenHash }));
  assert.throws(() => access.recoverProcessAccessToken({ ...row, access_token_encrypted: `${first.tokenEncrypted}x` }));
  assert.throws(() => access.recoverProcessAccessUrl(row, "https://user:password@example.test"));
});

test("a session retry derives one private booking credential, isolated from another process or operation", () => {
  const token = access.processSessionBookingAccess(processToken, requestId);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(access.processSessionBookingAccess(processToken, requestId), token);
  assert.notEqual(access.processSessionBookingAccess("b".repeat(64), requestId), token);
  assert.notEqual(access.processSessionBookingAccess(processToken, "22222222-2222-4222-8222-222222222223"), token);
  assert.throws(() => access.processSessionBookingAccess("reference", requestId));
  assert.throws(() => access.processSessionBookingAccess(processToken, "reference"));
});

test("entitlements require a matching paid Stripe purchase and scoped process, never a client flag", () => {
  assert.equal(entitlement.hasVerifiedProcessPurchase(process, purchase), true);
  for (const patch of [{ status: "pending_payment" }, { purchase_booking_id: "another" }, { stripe_mode: null },
    { stripe_account_id: null }, { total_sessions: 7 }]) {
    assert.equal(entitlement.hasVerifiedProcessPurchase({ ...process, ...patch }, purchase), false);
  }
  for (const patch of [{ payment_status: "pending" }, { paid_at: null }, { payment_reference: null },
    { process_id: "another" }, { stripe_mode: "live" }, { stripe_account_id: "another" }, { package_session_number: 2 }]) {
    assert.equal(entitlement.hasVerifiedProcessPurchase(process, { ...purchase, ...patch }), false);
  }
  assert.equal(entitlement.hasVerifiedProcessPurchase(process, null), false);
});

test("six allocated ordinals exhaust entitlement; reschedule and cancelled session cannot grant a seventh", () => {
  const bookings = Array.from({ length: 6 }, (_, i) => ({ package_session_number: i + 1, status: i === 2 ? "cancelled" : "confirmed" }));
  assert.equal(entitlement.nextProcessSessionNumber(6, bookings.slice(0, 1)), 2);
  assert.equal(entitlement.nextProcessSessionNumber(6, bookings.slice(0, 5)), 6);
  assert.equal(entitlement.nextProcessSessionNumber(6, bookings), null);
  const rescheduled = bookings.map(b => ({ ...b, starts_at: "2036-01-01T12:00:00Z" }));
  assert.equal(entitlement.nextProcessSessionNumber(6, rescheduled), null);
});

function fixture(options = {}) {
  const calls = [], cookies = [], byHash = new Map();
  const p = { ...process, ...options.process };
  const initial = { ...purchase, ...options.purchase };
  const db = {
    from(table) {
      const filters = {};
      return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
        async maybeSingle() {
          calls.push({ read: table, filters });
          if (table === "coaching_processes") return { data: options.unknown ? null : p, error: null };
          if (filters.id === purchaseId) return { data: initial, error: null };
          return { data: { id: bookingId, booking_reference: "ER-FIXTURE", status: options.finalizerFails ? "pending" : "confirmed",
            finalization_status: options.finalizerFails ? "retryable_error" : "completed", google_event_id: "calendar_fixture",
            google_meet_url: "https://meet.google.com/fixture", customer_email_status: "sent", coach_email_status: "sent" }, error: null };
        },
        update() { throw new Error("route must not write directly"); },
      };
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (options.rpcError) return { data: null, error: { message: options.rpcError } };
      if (!byHash.has(args.p_booking_access_token_hash)) byHash.set(args.p_booking_access_token_hash, {
        booking_id: bookingId, booking_reference: "ER-FIXTURE", process_id: processId,
        process_reference: "PROC-FIXTURE", package_session_number: 2,
      });
      return { data: byHash.get(args.p_booking_access_token_hash), error: null };
    },
  };
  const modules = testModules({
    "next/server": { NextResponse: { json: (data, init) => ({ data, ...init, cookies: { set: (...args) => cookies.push(args) } }) } },
    "@/lib/security/public-abuse": { enforcePublicAbuse: async () => options.limited ?? null },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
    "@/lib/stripe/server": stripeRuntimeFixture(db, {}, {
      mode: "test", accountId: "acct_fixture", siteUrl, newSalesEnabled: false, paymentMethodConfigurationId: "pmc_fixture",
    }),
    "@/lib/bookings/finalize-paid-booking": { finalizePaidBooking: async id => {
      calls.push({ finalize: id }); if (options.finalizerFails) throw new Error("temporary");
    } },
  });
  const route = modules.load("src/app/api/processes/[token]/sessions/route.ts");
  const invoke = (body = {}, token = processToken, origin = siteUrl) => route.POST({
    headers: new Headers({ origin }), json: async () => ({ startsAt, requestId, ...body }),
  }, { params: Promise.resolve({ token }) });
  return { calls, cookies, byHash, invoke };
}

test("covered session uses scoped transactional RPC and durable finalizer with no second payment", async () => {
  const f = fixture();
  const r = await f.invoke();
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "confirmed");
  assert.equal(r.headers["Cache-Control"], "no-store");
  const rpc = f.calls.find(c => c.rpc);
  assert.equal(rpc.rpc, "create_stripe_process_session_v1");
  assert.equal(rpc.args.p_stripe_mode, "test");
  assert.equal(rpc.args.p_stripe_account_id, "acct_fixture");
  assert.equal(rpc.args.p_starts_at, startsAt);
  assert.equal(f.calls.some(c => c.finalize === bookingId), true);
  assert.equal(f.cookies.length, 1);
  assert.equal(f.cookies[0][0], `booking_access_${bookingId}`);
  assert.equal(f.cookies[0][2].httpOnly, true);
  assert.equal(JSON.stringify(r.data).includes(processToken), false);
  assert.equal(JSON.stringify(r.data).includes(purchase.payment_reference), false);
});

test("concurrent retries forward the same credential so the RPC consumes one entitlement", async () => {
  const f = fixture();
  const results = await Promise.all([f.invoke(), f.invoke()]);
  assert.deepEqual(results.map(r => r.status), [201, 201]);
  assert.equal(f.byHash.size, 1);
  assert.equal(f.cookies[0][1], f.cookies[1][1]);
});

test("temporary finalization failure keeps the paid session queued without cancelling or reallocating", async () => {
  const f = fixture({ finalizerFails: true });
  const r = await f.invoke();
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "pending");
  assert.equal(r.data.finalizationStatus, "retryable_error");
  await f.invoke();
  assert.equal(f.byHash.size, 1);
});

for (const [name, options] of [
  ["pending payment", { purchase: { payment_status: "pending", paid_at: null } }],
  ["legacy unscoped history", { process: { stripe_mode: null, stripe_account_id: null } }],
  ["inactive entitlement", { process: { status: "cancelled" } }],
  ["other process purchase", { purchase: { process_id: "other" } }],
  ["wrong Stripe account", { process: { stripe_account_id: "acct_other" }, purchase: { stripe_account_id: "acct_other" } }],
  ["live attempt in test", { process: { stripe_mode: "live" }, purchase: { stripe_mode: "live" } }],
]) test(`private scheduling rejects ${name} before booking or side effects`, async () => {
  const f = fixture(options);
  assert.equal((await f.invoke()).status, 409);
  assert.equal(f.calls.some(c => c.rpc || c.finalize), false);
});

test("process reference, unknown token, forged price and cross-origin requests cannot schedule", async () => {
  for (const [options, body, token, origin, expected] of [
    [{}, {}, "PROC-FIXTURE", siteUrl, 404], [{ unknown: true }, {}, processToken, siteUrl, 404],
    [{}, { amount_minor: 0, payment_status: "paid", processId }, processToken, siteUrl, 400],
    [{}, {}, processToken, "https://attacker.example.test", 403],
  ]) {
    const f = fixture(options);
    const r = await f.invoke(body, token, origin);
    assert.equal(r.status, expected);
    assert.equal(f.calls.some(c => c.rpc || c.finalize), false);
    assert.equal(JSON.stringify(r.data).includes(processId), false);
  }
});

test("seventh session returns conflict, without a finalizer or additional payment", async () => {
  const f = fixture({ rpcError: "all_sessions_used" });
  assert.equal((await f.invoke()).status, 409);
  assert.equal(f.calls.some(c => c.finalize), false);
});

test("process abuse limiter remains first and never shares a Checkout bucket", async () => {
  const f = fixture({ limited: { status: 429 } });
  assert.equal((await f.invoke()).status, 429);
  assert.equal(f.calls.length, 0);
});

function adminAccessFixture({ activeAdmin = true, paid = true } = {}) {
  const calls = [];
  const durable = access.createDurableProcessAccess();
  const record = { ...process, access_token_hash: durable.tokenHash, access_token_encrypted: durable.tokenEncrypted,
    customer_name: "Fixture", customer_email: "fixture@example.test", process_reference: "PROC-FIXTURE",
    service_name_snapshot: "Proceso" };
  const db = { from(table) { return { select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: table === "coaching_processes" ? record : { ...purchase, payment_status: paid ? "paid" : "pending" }, error: null }; },
    update() { throw new Error("a paid process access must not rotate credentials"); },
  }; } };
  const auth = { auth: { getClaims: async () => ({ data: { claims: { sub: "fixture-admin" } } }) },
    from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { active: activeAdmin }, error: null }) }; } };
  const modules = testModules({
    "next/server": { NextResponse: { json: (data, init) => ({ data, ...init }) } },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
    "@/lib/supabase/server": { createClient: async () => auth },
    "@/lib/stripe/server": stripeRuntimeFixture(db, {}, {
      siteUrl, mode: "test", accountId: "acct_fixture", newSalesEnabled: false, paymentMethodConfigurationId: "pmc_fixture",
    }),
    "@/lib/email/send-process-access-email": { sendProcessAccessEmail: async input => { calls.push(input); return { id: "fixture_email", error: null }; } },
  }, { INTAKE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64") });
  const route = modules.load("src/app/api/admin/processes/[id]/regenerate-access/route.ts");
  return { calls, durable, invoke: () => route.POST({ nextUrl: new URL(siteUrl) }, { params: Promise.resolve({ id: processId }) }) };
}

test("admin re-send recovers the original encrypted process link, never rotates it", async () => {
  const f = adminAccessFixture();
  assert.equal((await f.invoke()).status, 200);
  assert.equal((await f.invoke()).status, 200);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].processAccessUrl, `${siteUrl}/proceso/${f.durable.token}`);
  assert.deepEqual(f.calls[0], f.calls[1]);
  assert.equal(f.calls[0].idempotencyKey.includes(f.durable.token), false);
});

test("inactive admin and unverified purchase cannot recover or email process credentials", async () => {
  for (const [options, expected] of [[{ activeAdmin: false }, 403], [{ paid: false }, 409]]) {
    const f = adminAccessFixture(options);
    const r = await f.invoke();
    assert.equal(r.status, expected);
    assert.equal(f.calls.length, 0);
    assert.equal(JSON.stringify(r.data).includes(f.durable.token), false);
  }
});

test("Stripe cancellation/reschedule remains admin-only and cannot silently restore a right", async () => {
  // An unverified historical purchase cannot enter the durable change workflow.
  // A private process token is never administrative authorization.
  for (const path of ["cancel", "reschedule"]) {
    const calls = [];
    const auth = { auth: { getClaims: async () => ({ data: { claims: { sub: "fixture-admin" } } }) },
      from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { active: true }, error: null }) }; } };
    const db = { from() { return { select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: { id: bookingId, status: "confirmed", payment_flow: "stripe", process_id: processId, package_session_number: 2 }, error: null }),
      update() { calls.push("update"); throw new Error("blocked operation cannot write"); },
    }; } };
    const modules = testModules({
      "next/server": { NextResponse: { json: (data, init) => ({ data, ...init }) } },
      "@/lib/supabase/admin": { getSupabaseAdmin: () => db },
      "@/lib/supabase/server": { createClient: async () => auth },
      "@/lib/google/calendar": { deleteGoogleCalendarEvent: async () => calls.push("calendar"), updateGoogleCalendarEvent: async () => calls.push("calendar") },
      "@/lib/email/send-booking-change-email": { sendBookingChangeEmail: async () => calls.push("email") },
      "@/lib/bookings/stripe-booking-changes": { requestStripeBookingChange: async () => { throw new Error("booking_change_not_available"); } },
    });
    const route = modules.load(`src/app/api/bookings/[id]/${path}/route.ts`);
    assert.equal((await route.POST({ json: async () => ({ startsAt }) }, { params: Promise.resolve({ id: bookingId }) })).status, 409);
    assert.deepEqual(calls, []);
  }
});
