import assert from "node:assert/strict";
import { test } from "node:test";
import { testModules } from "./helpers/load-typescript.mjs";

const site = "https://www.ednarojocoaching.com";
const adminId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const date = "2035-01-01";
const hiddenSlug = "prueba-tecnica-privada";
const hiddenSlot = { starts_at: "2035-01-01T18:00:00Z", ends_at: "2035-01-01T19:30:00Z", local_time: "12:00" };

function fixture({ role = "active", mode = "live", limited = false, serviceExists = true,
  serviceError = null, rpcError = null } = {}) {
  const calls = { limits: [], claims: 0, adminReads: 0, config: 0, serviceReads: [], rpc: [] };
  const throttle = { status: 429, data: { error: "Intenta nuevamente más tarde." },
    headers: { "Cache-Control": "no-store", "Retry-After": "60" } };
  const modules = testModules({
    "next/server": { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200, headers: init.headers ?? {} }) } },
    "@/lib/security/public-abuse": { enforcePublicAbuse: async (request, group) => {
      calls.limits.push({ request, group }); return limited ? throttle : null;
    } },
    "@/lib/stripe/server": { getStripeConfig() {
      calls.config++; return { mode, siteUrl: site, newSalesEnabled: false };
    } },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getClaims: async () => {
        calls.claims++;
        return { data: { claims: role === "anonymous" ? null : { sub: adminId } }, error: null };
      } },
      from(table) {
        assert.equal(table, "admin_users");
        const query = { select() { return query; }, eq(column, value) {
          assert.equal(column, "user_id"); assert.equal(value, adminId); return query;
        }, maybeSingle: async () => {
          calls.adminReads++;
          return { data: role === "common" ? null : { user_id: adminId, active: role === "active" }, error: null };
        } };
        return query;
      },
    }) },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => ({
      from(table) {
        assert.equal(table, "services");
        const query = { select(columns) { assert.equal(columns, "id"); return query; },
          eq(column, value) { assert.equal(column, "slug"); calls.serviceReads.push(value); return query; },
          maybeSingle: async () => ({ data: serviceExists ? { id: serviceId } : null, error: serviceError }) };
        return query;
      },
      async rpc(name, args) {
        calls.rpc.push({ name, args });
        assert.ok(["get_available_slots", "get_admin_available_slots_v1"].includes(name));
        return { data: name === "get_admin_available_slots_v1" ? [hiddenSlot] : [], error: rpcError };
      },
    }) },
  });
  const route = modules.load("src/app/api/availability/route.ts");
  const request = ({ marker = "1", origin = site, requestOrigin = site, slug = hiddenSlug, queryDate = date } = {}) => ({
    nextUrl: new URL(`${requestOrigin}/api/availability?service=${encodeURIComponent(slug)}&date=${queryDate}`),
    headers: new Headers({ ...(marker === null ? {} : { "X-ER-Admin-Live-Test": marker }),
      ...(origin === null ? {} : { origin }) }),
  });
  return { calls, logs: modules.logs, request, run: options => route.GET(request(options)), throttle };
}

for (const [role, status] of [["anonymous", 401], ["common", 403], ["inactive", 403]]) {
  test(`private availability rejects ${role} with a forged intent header before service lookup or RPC`, async () => {
    const f = fixture({ role }); const result = await f.run();
    assert.equal(result.status, status);
    assert.deepEqual(f.calls.serviceReads, []); assert.deepEqual(f.calls.rpc, []);
    assert.equal(JSON.stringify(result.data).includes(serviceId), false);
    assert.equal(JSON.stringify(result.data).includes(hiddenSlot.starts_at), false);
  });
}

for (const [name, options] of [
  ["invalid intent", { marker: "true" }],
  ["foreign Origin", { origin: "https://foreign.example.test" }],
  ["foreign request origin", { requestOrigin: "https://foreign.example.test" }],
  ["apex request origin", { requestOrigin: "https://ednarojocoaching.com" }],
]) {
  test(`${name} cannot request private slots, even with an active admin session`, async () => {
    const f = fixture(); const result = await f.run(options);
    assert.equal(result.status, 403); assert.equal(f.calls.claims, 0);
    assert.deepEqual(f.calls.serviceReads, []); assert.deepEqual(f.calls.rpc, []);
  });
}

test("Test mode cannot activate the private availability exception", async () => {
  const f = fixture({ mode: "test" }); const result = await f.run();
  assert.equal(result.status, 403); assert.equal(f.calls.claims, 0);
  assert.deepEqual(f.calls.rpc, []);
});

for (const origin of [site, null]) {
  test(`active admin retrieves hidden slots using only the service ID resolved on the server (Origin ${origin === null ? "absent" : "canonical"})`, async () => {
    const f = fixture(); const result = await f.run({ origin });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { service: hiddenSlug, date, slots: [hiddenSlot] });
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(f.calls.claims, 1); assert.equal(f.calls.adminReads, 1);
    assert.deepEqual(f.calls.serviceReads, [hiddenSlug]);
    assert.deepEqual(f.calls.rpc, [{ name: "get_admin_available_slots_v1", args: {
      p_service_id: serviceId, p_date: date, p_admin_user_id: adminId,
    } }]);
  });
}

test("public availability never uses the privileged lookup, even when the requester is an admin", async () => {
  const f = fixture(); const result = await f.run({ marker: null });
  assert.equal(result.status, 200); assert.deepEqual(result.data.slots, []);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(f.calls.config, 0); assert.equal(f.calls.claims, 0);
  assert.deepEqual(f.calls.serviceReads, []);
  assert.deepEqual(f.calls.rpc, [{ name: "get_available_slots", args: { p_service_slug: hiddenSlug, p_date: date } }]);
});

test("a missing private service has no slots and does not call its RPC", async () => {
  const f = fixture({ serviceExists: false }); const result = await f.run();
  assert.equal(result.status, 200); assert.deepEqual(result.data.slots, []);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.deepEqual(f.calls.rpc, []);
});

test("rate limiting rejects private and public availability before authorization or database access", async () => {
  for (const marker of ["1", null]) {
    const f = fixture({ limited: true }); const req = f.request({ marker });
    // Keep request identity visible to verify the original availability bucket is preserved.
    const response = await f.run({ marker });
    assert.deepEqual(response, f.throttle);
    assert.equal(f.calls.limits.length, 1); assert.equal(f.calls.limits[0].group, "availability-read");
    assert.equal(req.nextUrl.pathname, "/api/availability");
    assert.equal(f.calls.config, 0); assert.equal(f.calls.claims, 0);
    assert.deepEqual(f.calls.serviceReads, []); assert.deepEqual(f.calls.rpc, []);
    assert.equal(JSON.stringify(response.data).includes(serviceId), false);
  }
});

for (const [name, options] of [
  ["service lookup error", { serviceError: { message: "private-database-diagnostic" } }],
  ["RPC error", { rpcError: { message: "private-database-diagnostic" } }],
]) {
  test(`private ${name} returns a generic response without database diagnostics`, async () => {
    const f = fixture(options); const result = await f.run();
    assert.equal(result.status, 500);
    assert.deepEqual(result.data, { error: "No fue posible consultar la disponibilidad." });
    assert.equal(JSON.stringify({ response: result.data, logs: f.logs }).includes("private-database-diagnostic"), false);
  });
}
