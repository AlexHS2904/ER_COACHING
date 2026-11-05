import assert from "node:assert/strict";
import { test } from "node:test";
import { testModules } from "./helpers/load-typescript.mjs";

const serviceId = "11111111-1111-4111-8111-111111111111";
const validBody = {
  name: "Prueba técnica privada", serviceType: "single",
  shortDescription: "Sesión técnica privada", description: "",
  durationMinutes: 90, sessionCount: 1, price: 10, currency: "MXN",
  requiresQuote: false, bookingEnabled: true, active: true, displayOrder: 3,
};

function adminFixture({ signedIn = true, activeAdmin = true, published = false } = {}) {
  const writes = [];
  const current = { id: serviceId, slug: "prueba-tecnica", service_type: "single", published };
  const admin = { from(table) {
    assert.equal(table, "services");
    let write = null;
    const query = {
      select() { return query; }, eq() { return query; },
      insert(data) { write = data; writes.push({ operation: "insert", data }); return query; },
      update(data) { write = data; writes.push({ operation: "update", data }); return query; },
      async maybeSingle() { return { data: current, error: null }; },
      async single() { return { data: { ...current, requires_intake: false, ...write }, error: null }; },
    };
    // The create route checks for an existing generated slug before inserting.
    query.eq = (column) => {
      if (column === "slug") query.maybeSingle = async () => ({ data: null, error: null });
      return query;
    };
    return query;
  } };
  const modules = testModules({
    "next/server": { NextResponse: { json: (data, init = {}) => ({ data, status: init.status ?? 200 }) } },
    "next/cache": { revalidatePath() {} },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getClaims: async () => ({ data: { claims: signedIn ? { sub: "admin-fixture" } : null } }) },
      from(table) {
        assert.equal(table, "admin_users");
        const query = { select() { return query; }, eq() { return query; },
          maybeSingle: async () => ({ data: { active: activeAdmin }, error: null }) };
        return query;
      },
    }) },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => admin },
  });
  return {
    writes,
    create: modules.load("src/app/api/admin/services/route.ts").POST,
    update: modules.load("src/app/api/admin/services/[id]/route.ts").PUT,
  };
}
const request = body => ({ json: async () => body });
const context = { params: Promise.resolve({ id: serviceId }) };

test("active admin creates a hidden individual with a trusted single-session shape and no Intake override", async () => {
  const f = adminFixture();
  const response = await f.create(request({ ...validBody, published: false, sessionCount: 6 }));
  assert.equal(response.status, 201);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].data.published, false);
  assert.equal(f.writes[0].data.session_count, 1);
  assert.equal(f.writes[0].data.price, 10);
  assert.equal(Object.hasOwn(f.writes[0].data, "requires_intake"), false);
  assert.equal(response.data.service.requires_intake, false);
});

test("older create clients retain published=true by default", async () => {
  const f = adminFixture();
  assert.equal((await f.create(request(validBody))).status, 201);
  assert.equal(f.writes[0].data.published, true);
});

for (const value of ["false", null, 0]) {
  test(`publication requires a boolean: ${JSON.stringify(value)}`, async () => {
    const f = adminFixture();
    assert.equal((await f.create(request({ ...validBody, published: value }))).status, 400);
    assert.equal((await f.update(request({ ...validBody, published: value }), context)).status, 400);
    assert.equal(f.writes.length, 0);
  });
}

for (const flag of ["requiresIntake", "requires_intake"]) {
  test(`generic service admin cannot change ${flag} even with active admin authorization`, async () => {
    for (const value of [true, false]) {
      const f = adminFixture();
      assert.equal((await f.create(request({ ...validBody, [flag]: value }))).status, 400);
      assert.equal((await f.update(request({ ...validBody, [flag]: value }), context)).status, 400);
      assert.equal(f.writes.length, 0);
    }
  });
}

for (const published of [false, true]) {
  test(`edit without published preserves existing value ${published}`, async () => {
    const f = adminFixture({ published });
    assert.equal((await f.update(request(validBody), context)).status, 200);
    assert.equal(f.writes[0].data.published, published);
    assert.equal(Object.hasOwn(f.writes[0].data, "requires_intake"), false);
  });
}

test("publication can change without changing booking availability or activity", async () => {
  const f = adminFixture({ published: true });
  const response = await f.update(request({ ...validBody, published: false }), context);
  assert.equal(response.status, 200);
  assert.equal(f.writes[0].data.published, false);
  assert.equal(f.writes[0].data.active, true);
  assert.equal(f.writes[0].data.booking_enabled, true);
});

for (const [name, options, status] of [
  ["anonymous", { signedIn: false }, 401], ["inactive admin", { activeAdmin: false }, 403],
]) {
  test(`${name} cannot publish or create private services`, async () => {
    const f = adminFixture(options);
    assert.equal((await f.create(request({ ...validBody, published: false }))).status, status);
    assert.equal((await f.update(request({ ...validBody, published: false }), context)).status, status);
    assert.equal(f.writes.length, 0);
  });
}

test("public catalog filters active published rows and fails closed for missing publication/Intake metadata", async () => {
  const filters = [];
  const publicService = { id: "public", active: true, published: true, requires_intake: false };
  const rows = [publicService,
    { id: "private", active: true, published: false, requires_intake: false },
    { id: "archived", active: false, published: true, requires_intake: false },
    { id: "unknown-publication", active: true, requires_intake: false },
    { id: "unknown-intake", active: true, published: true },
  ];
  const modules = testModules({ "@/lib/supabase/server": { createClient: async () => ({
    from(table) {
      assert.equal(table, "services");
      const query = { select(columns) {
        assert.match(columns, /published/); assert.match(columns, /requires_intake/);
        return query;
      }, eq(column, value) { filters.push([column, value]); return query; },
      order: async () => ({ data: rows, error: null }) };
      return query;
    },
  }) } });
  const { getActiveServices } = modules.load("src/lib/data/services.ts");
  assert.deepEqual(await getActiveServices(), [publicService]);
  assert.deepEqual(filters, [["active", true], ["published", true]]);
});
