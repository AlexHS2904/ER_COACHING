import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);

// Exercise the actual TypeScript with isolated integration boundaries. No
// Supabase/Resend requests or production environment variables are used.
function load(path, dependencies = {}, env = {}) {
  const source = readFileSync(new URL(path, root), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const resolve = (name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name === "crypto") return require("node:crypto");
    throw new Error(`Unexpected integration: ${name}`);
  };
  new Function("require", "module", "exports", "process", "console", outputText)(
    resolve, module, module.exports, { env }, { error() {} },
  );
  return module.exports;
}

const access = load("src/lib/intake/intake-access.ts");
const crypto = load("src/lib/intake/intake-token-crypto.ts", {}, {
  INTAKE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
});
const storedToken = "a".repeat(64);
const stored = {
  form_id: "form-1",
  customer_name: "Test Customer",
  customer_email: "customer@example.test",
  service_name: "Sesión 1:1",
  access_token_hash: access.hashIntakeToken(storedToken),
  access_token_encrypted: crypto.encryptIntakeToken(storedToken),
  intake_created: false,
  payment_already_paid: true,
  ready_email_sent_at: null,
};
const params = { bookingId: "booking-1", provider: "manual", siteUrl: "https://example.test" };

function setup({ row = stored, rpcError = null, emailError = false, saveError = false, saveThrows = false } = {}) {
  const calls = { rpc: [], email: [], updates: [] };
  const client = {
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: [row], error: rpcError };
    },
    from(table) {
      assert.equal(table, "booking_intake_forms");
      return {
        update(values) {
          calls.updates.push(values);
          return {
            eq(column, id) {
              assert.equal(column, "id");
              assert.equal(id, stored.form_id);
              return {
                async is(column, value) {
                  assert.equal(column, "ready_email_sent_at");
                  assert.equal(value, null);
                  if (saveThrows) throw new Error("storage unavailable");
                  return { error: saveError ? { message: "storage unavailable" } : null };
                },
              };
            },
          };
        },
      };
    },
  };
  const helper = load("src/lib/intake/activate-booking-intake.ts", {
    "@/lib/intake/intake-access": access,
    "@/lib/intake/intake-token-crypto": crypto,
    "@/lib/supabase/admin": { getSupabaseAdmin: () => client },
    "@/lib/email/send-intake-form-ready-email": {
      async sendIntakeFormReadyEmail(payload) {
        calls.email.push(payload);
        return emailError
          ? { data: null, error: { message: "Resend unavailable" } }
          : { data: { id: "email-1" }, error: null };
      },
    },
  });
  return { ...helper, calls };
}

test("paid retries discard candidates and reuse the returned encrypted token/link", async () => {
  const { activateBookingIntake, calls } = setup();
  const first = await activateBookingIntake(params);
  const retry = await activateBookingIntake(params);
  assert.equal(first.formId, retry.formId);
  assert.equal(first.formUrl, `https://example.test/formulario/${storedToken}`);
  assert.equal(first.formUrl, retry.formUrl);
  assert.equal(retry.paymentAlreadyPaid, true);
  assert.notEqual(calls.rpc[0].args.p_access_token_hash, calls.rpc[1].args.p_access_token_hash);
  for (const { name, args } of calls.rpc) {
    assert.equal(name, "activate_booking_intake_v2");
    const token = crypto.decryptIntakeToken(args.p_access_token_encrypted);
    assert.equal(access.hashIntakeToken(token), args.p_access_token_hash);
  }
  assert.ok(calls.updates.every((update) => !("access_token_encrypted" in update)));
});

test("RPC failure prevents email and all subsequent writes", async () => {
  const { activateBookingIntake, calls } = setup({ rpcError: { message: "cancelled booking" } });
  await assert.rejects(activateBookingIntake(params), /No fue posible activar/);
  assert.equal(calls.email.length, 0);
  assert.equal(calls.updates.length, 0);
});

for (const invalid of [
  { access_token_hash: "b".repeat(64) },
  { access_token_encrypted: null },
  { access_token_encrypted: "corrupt" },
]) {
  test(`invalid stored access is reported without repair: ${Object.keys(invalid)[0]}`, async () => {
    const { activateBookingIntake, calls } = setup({ row: { ...stored, ...invalid } });
    await assert.rejects(activateBookingIntake(params), /integridad/);
    assert.equal(calls.email.length, 0);
    assert.equal(calls.updates.length, 0);
  });
}

test("recorded email acceptance skips Resend on later retries", async () => {
  const { activateBookingIntake, calls } = setup({ row: { ...stored, ready_email_sent_at: "2026-10-27T00:00:00Z" } });
  const result = await activateBookingIntake(params);
  assert.equal(result.emailSent, true);
  assert.equal(calls.email.length, 0);
  assert.equal(calls.updates.length, 0);
});

test("Resend failure preserves success and records a retryable email error", async () => {
  const { activateBookingIntake, calls } = setup({ emailError: true });
  const result = await activateBookingIntake(params);
  assert.equal(result.success, true);
  assert.equal(result.emailSent, false);
  assert.equal(result.formId, stored.form_id);
  assert.equal(calls.updates[0].ready_email_error, "Resend unavailable");
});

test("email status persistence failure does not lose the activation", async () => {
  const { activateBookingIntake } = setup({ emailError: true, saveError: true });
  const result = await activateBookingIntake(params);
  assert.equal(result.success, true);
  assert.equal(result.emailSent, false);
});

test("accepted email remains accepted even if status storage throws", async () => {
  const { activateBookingIntake, calls } = setup({ saveThrows: true });
  const result = await activateBookingIntake(params);
  assert.equal(result.success, true);
  assert.equal(result.emailSent, true);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].ready_email_error, null);
});

test("admin mark-paid keeps delegating and returns the same intake on a retry", async () => {
  const { activateBookingIntake } = setup();
  const { POST } = load("src/app/api/admin/payments/mark-paid/route.ts", {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
    "next/cache": { revalidatePath() {} },
    "@/lib/admin/is-active-admin": { isActiveAdmin: async () => true },
    "@/lib/intake/activate-booking-intake": { activateBookingIntake },
  });
  const request = { url: params.siteUrl, json: async () => ({ bookingId: params.bookingId }) };
  const first = await POST(request);
  const retry = await POST(request);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(first.body.formId, retry.body.formId);
  assert.equal(first.body.formUrl, retry.body.formUrl);
});

test("ready email supplies a stable Resend key without changing its content", async () => {
  const requests = [];
  const { sendIntakeFormReadyEmail } = load("src/lib/email/send-intake-form-ready-email.tsx", {
    "@/emails/IntakeFormReadyEmail": { default: (props) => props },
    "@/lib/email/resend": {
      getResend: () => ({ emails: { send: async (...args) => { requests.push(args); } } }),
    },
  }, { RESEND_FROM_EMAIL: "test@example.test" });
  const payload = { formId: "form-1", customerName: "Customer", customerEmail: "customer@example.test", serviceName: "Sesión 1:1", formUrl: "https://example.test/form" };
  await sendIntakeFormReadyEmail(payload);
  await sendIntakeFormReadyEmail(payload);
  assert.equal(requests[0][1].idempotencyKey, "intake-ready/form-1");
  assert.deepEqual(requests[0], requests[1]);
});

for (const [label, hash, encrypted, expectedStatus] of [
  ["valid", stored.access_token_hash, stored.access_token_encrypted, 200],
  ["missing", stored.access_token_hash, null, 409],
  ["mismatch", "b".repeat(64), stored.access_token_encrypted, 409],
  ["corrupt", stored.access_token_hash, "corrupt", 409],
]) {
  test(`admin GET is read-only for ${label} stored access`, async () => {
    const { GET } = load("src/app/api/admin/intake/by-booking/[bookingId]/link/route.ts", {
      "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
      "@/lib/admin/is-active-admin": { isActiveAdmin: async () => true },
      "@/lib/intake/intake-access": access,
      "@/lib/intake/intake-token-crypto": crypto,
      "@/lib/supabase/admin": {
        getSupabaseAdmin: () => ({
          from: (table) => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  error: null,
                  data: table === "bookings"
                    ? { id: params.bookingId, payment_status: "paid" }
                    : { id: stored.form_id, access_token_hash: hash, access_token_encrypted: encrypted },
                }),
              }),
            }),
            // No mutation method is available: any attempted repair fails.
          }),
        }),
      },
    });
    const result = await GET({ url: params.siteUrl }, { params: Promise.resolve({ bookingId: params.bookingId }) });
    assert.equal(result.status, expectedStatus);
    if (expectedStatus === 200) assert.equal(result.body.formUrl, `https://example.test/formulario/${storedToken}`);
    else assert.equal(result.body.formUrl, undefined);
  });
}
