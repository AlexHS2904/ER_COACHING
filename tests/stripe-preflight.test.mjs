import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { localPostgres } from "./helpers/local-postgres.mjs";

// Every failed application is rolled back on connection close. This cluster is
// disposable, isolated, and never uses an inherited Supabase connection.
const pg = localPostgres();
const migration = readFileSync(new URL("../supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql", import.meta.url), "utf8");
before(() => pg.start(new URL("./fixtures/stripe-local-schema.sql", import.meta.url), [
  new URL("../supabase/migrations/20261027000100_activate_booking_intake_v2.sql", import.meta.url),
]));
after(() => pg.stop());

async function rejectsContract(change, error) {
  const result = await pg.run(`BEGIN; ${change} ${migration}`);
  assert.notEqual(result.code, 0);
  assert.match(result.errors, error);
  assert.equal(pg.sql("SELECT to_regclass('public.booking_payment_attempts') IS NULL AND to_regclass('public.stripe_events') IS NULL;"), "t");
  assert.equal(pg.sql("SELECT count(*) FROM pg_attribute WHERE attrelid='public.bookings'::regclass AND attname='payment_flow' AND NOT attisdropped;"), "0");
}

test("preflight rejects an unexpected create_booking signature despite a same-name function", async () => {
  await rejectsContract(`ALTER FUNCTION public.create_booking(text,timestamptz,text,text,text,text) RENAME TO fixture_create_booking;
    CREATE FUNCTION public.create_booking(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;`, /Review create_booking.*expected public.create_booking/);
});

for (const column of ['id','created_at','starts_at','ends_at','status','payment_status','price_snapshot','currency_snapshot','booking_reference','service_id']) {
  test(`preflight rejects missing required bookings.${column} before creating Stripe objects`, async () => {
    await rejectsContract(`ALTER TABLE public.bookings RENAME COLUMN ${column} TO fixture_${column};`, new RegExp(`Review bookings\\.${column} before applying`));
  });
}

for (const [change, label] of [
  ["ALTER COLUMN created_at TYPE timestamp without time zone", "timestamp without time zone"],
  ["ALTER COLUMN created_at DROP NOT NULL", "nullable created_at"],
  ["ALTER COLUMN created_at DROP DEFAULT", "missing created_at default"],
  ["ALTER COLUMN created_at SET DEFAULT NULL", "null created_at default"],
  ["ALTER COLUMN created_at SET DEFAULT '2000-01-01'::timestamptz", "unexpected constant created_at default"],
  ["ALTER COLUMN price_snapshot TYPE double precision", "inexact money type"],
  ["ALTER COLUMN service_id TYPE text USING service_id::text", "wrong service ID type"],
]) test(`preflight rejects ${label} instead of repairing the schema`, async () => {
  // The fixture FK must be removed to inspect the incompatible ID type itself.
  const removeFk = label === 'wrong service ID type' ? 'ALTER TABLE public.bookings DROP CONSTRAINT bookings_service_id_fkey;' : '';
  await rejectsContract(`${removeFk} ALTER TABLE public.bookings ${change};`, /Review bookings\.(created_at|price_snapshot|service_id) before applying/);
});

test("preflight accepts the exact contract and existing current-time defaults without extensions", async () => {
  assert.equal(pg.sql("SELECT to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL;"), "t");
  assert.equal(pg.sql("SELECT count(*) FROM pg_extension WHERE extname='pgcrypto';"), "0");
  for (const expression of ['now()', 'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP(6)', 'transaction_timestamp()', 'statement_timestamp()', 'clock_timestamp()']) {
    // Success runs the complete migration and rolls it back explicitly.
    const withoutCommit = migration.replace(/COMMIT;\s*$/, 'ROLLBACK;');
    const result = await pg.run(`BEGIN; ALTER TABLE public.bookings ALTER COLUMN created_at SET DEFAULT ${expression}; ${withoutCommit}`);
    assert.equal(result.code, 0, result.errors);
  }
});
