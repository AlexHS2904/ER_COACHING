import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

// Integration fixture only: this creates an isolated local cluster, never uses
// Supabase credentials, and does not claim to reproduce production's schema.
// Requires initdb, pg_ctl and psql on PATH.
const directory = mkdtempSync(join(tmpdir(), "coaching-intake-pg-"));
const database = join(directory, "data");
const env = { PATH: process.env.PATH, LC_ALL: "C" };
const options = { env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] };
const psqlArgs = ["-X", "-h", directory, "-p", "55439", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const migration = readFileSync(new URL("../supabase/migrations/20261027000100_activate_booking_intake_v2.sql", import.meta.url), "utf8");
let started = false;

function sql(input) {
  return execFileSync("psql", psqlArgs, { ...options, input }).trim();
}

function rpc(id, hash = "a".repeat(64), encrypted = "cipher-a", provider = "manual", reference = "NULL") {
  return `SELECT row_to_json(r) FROM public.activate_booking_intake_v2('${id}', '${hash}', '${encrypted}', '${provider}', ${reference}) AS r;`;
}

function booking(overrides = "") {
  const id = randomUUID();
  sql(`INSERT INTO public.bookings(id) VALUES ('${id}'); ${overrides ? `UPDATE public.bookings SET ${overrides} WHERE id = '${id}';` : ""}`);
  return id;
}

before(() => {
  execFileSync("initdb", ["-D", database, "-A", "trust", "-U", "postgres", "--no-locale"], options);
  execFileSync("pg_ctl", ["-D", database, "-l", join(directory, "postgres.log"), "-o", `-F -k ${directory} -h '' -p 55439`, "-w", "start"], options);
  started = true;
  sql(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TYPE public.test_payment_provider AS ENUM ('manual', 'stripe');
    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY,
      customer_name varchar NOT NULL DEFAULT 'Test Customer',
      customer_email varchar NOT NULL DEFAULT 'customer@example.test',
      service_name_snapshot varchar DEFAULT 'Sesión 1:1',
      session_count_snapshot integer DEFAULT 1,
      starts_at timestamptz DEFAULT now(),
      status text DEFAULT 'confirmed',
      payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
      paid_at timestamptz,
      payment_provider public.test_payment_provider,
      payment_reference text
    );
    CREATE TABLE public.booking_intake_forms (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id uuid UNIQUE REFERENCES public.bookings(id),
      source_type text NOT NULL CHECK (source_type IN ('booking', 'manual')),
      invitee_name text,
      invitee_email text,
      access_token_hash text NOT NULL UNIQUE,
      access_token_encrypted text,
      status text NOT NULL DEFAULT 'active',
      current_step integer NOT NULL DEFAULT 1,
      expires_at timestamptz
    );
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.booking_intake_forms ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION public.activate_booking_intake() RETURNS text
      LANGUAGE sql AS $$ SELECT 'v1 preserved'::text $$;
  `);
  sql(migration);
});

after(() => {
  if (started) execFileSync("pg_ctl", ["-D", database, "-m", "immediate", "-w", "stop"], options);
  rmSync(directory, { recursive: true, force: true });
});

test("migration can be reapplied and preserves v1 and service-only privileges", () => {
  sql(migration);
  assert.equal(sql("SELECT public.activate_booking_intake();"), "v1 preserved");
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`SELECT has_function_privilege('${role}', 'public.activate_booking_intake_v2(uuid,text,text,text,text)', 'EXECUTE');`), "f");
  }
  assert.equal(sql("SELECT has_function_privilege('service_role', 'public.activate_booking_intake_v2(uuid,text,text,text,text)', 'EXECUTE');"), "t");
  const id = booking();
  const result = JSON.parse(sql(`SET ROLE service_role; ${rpc(id)}`));
  assert.equal(result.intake_created, true);
});

test("stripe same-reference retry preserves intake, token and payment details", () => {
  const id = booking("session_count_snapshot = NULL");
  const first = JSON.parse(sql(rpc(id, "b".repeat(64), "cipher-b", "stripe", "'pi_first'")));
  const payment = sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`);
  const intake = sql(`SELECT row_to_json(f) FROM public.booking_intake_forms f WHERE booking_id = '${id}';`);
  const retry = JSON.parse(sql(rpc(id, "c".repeat(64), "cipher-c", "stripe", "'pi_first'")));
  assert.equal(first.intake_created, true);
  assert.equal(first.payment_already_paid, false);
  assert.equal(retry.intake_created, false);
  assert.equal(retry.payment_already_paid, true);
  assert.equal(retry.form_id, first.form_id);
  assert.equal(retry.access_token_hash, first.access_token_hash);
  assert.equal(retry.access_token_encrypted, "cipher-b");
  assert.equal(sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`), payment);
  assert.equal(sql(`SELECT row_to_json(f) FROM public.booking_intake_forms f WHERE booking_id = '${id}';`), intake);
});

test("manual payment and manual retry reuse the same intake and access", () => {
  const id = booking();
  const first = JSON.parse(sql(rpc(id, "3".repeat(64), "cipher-manual")));
  const payment = sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`);
  const retry = JSON.parse(sql(rpc(id, "4".repeat(64), "unused-candidate")));
  assert.equal(retry.form_id, first.form_id);
  assert.equal(retry.access_token_hash, first.access_token_hash);
  assert.equal(retry.access_token_encrypted, first.access_token_encrypted);
  assert.equal(retry.intake_created, false);
  assert.equal(retry.payment_already_paid, true);
  assert.equal(sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`), payment);
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id = '${id}';`), "1");
});

function assertPaymentConflict(statement, id, message) {
  const payment = sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`);
  const intake = sql(`SELECT coalesce(json_agg(f)::text, '[]') FROM public.booking_intake_forms f WHERE booking_id = '${id}';`);
  assert.throws(() => sql(statement), (error) => {
    assert.match(error.stderr.toString(), message);
    return true;
  });
  assert.equal(sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`), payment);
  assert.equal(sql(`SELECT coalesce(json_agg(f)::text, '[]') FROM public.booking_intake_forms f WHERE booking_id = '${id}';`), intake);
}

test("manual paid booking rejects a Stripe attempt without changing payment or intake", () => {
  const id = booking();
  sql(rpc(id, "5".repeat(64)));
  assertPaymentConflict(
    rpc(id, "6".repeat(64), "unused-candidate", "stripe", "'pi_conflict'"),
    id,
    /Conflicto de pago:.*otro proveedor/,
  );
});

test("Stripe reference A rejects reference B and preserves the existing access", () => {
  const id = booking();
  sql(rpc(id, "7".repeat(64), "cipher-stripe", "stripe", "'pi_A'"));
  assertPaymentConflict(
    rpc(id, "8".repeat(64), "unused-candidate", "stripe", "'pi_B'"),
    id,
    /Conflicto de pago:.*referencia de pago distinta/,
  );
  // Omitting a reference on a same-provider retry must not erase it.
  sql(rpc(id, "8".repeat(64), "unused-candidate", "stripe"));
  assert.equal(sql(`SELECT payment_reference FROM public.bookings WHERE id = '${id}';`), "pi_A");
});

test("historical paid booking can fill a null provider and preserve reference and paid_at", () => {
  const id = booking("payment_status = 'paid', payment_reference = 'pi_legacy', paid_at = '2026-01-01T00:00:00Z'");
  const before = JSON.parse(sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`));
  const result = JSON.parse(sql(rpc(id, "9".repeat(64), "cipher-legacy", "stripe", "'pi_legacy'")));
  const after = JSON.parse(sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`));
  assert.deepEqual(after, { ...before, payment_provider: "stripe" });
  assert.equal(result.payment_already_paid, true);
  assert.equal(result.intake_created, true);
  const retry = JSON.parse(sql(rpc(id, "a".repeat(64), "unused-candidate", "stripe", "'pi_legacy'")));
  assert.equal(retry.form_id, result.form_id);
  assert.equal(retry.access_token_encrypted, "cipher-legacy");
});

test("historical paid booking can fill a null reference or both null fields", () => {
  for (const provider of ["'stripe'", "NULL"]) {
    const id = booking(`payment_status = 'paid', payment_provider = ${provider}`);
    const result = JSON.parse(sql(rpc(id, randomUUID().replaceAll("-", "").repeat(2), "cipher-history", "stripe", "'pi_completed'")));
    const payment = JSON.parse(sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`));
    assert.equal(payment.payment_provider, "stripe");
    assert.equal(payment.payment_reference, "pi_completed");
    assert.equal(payment.paid_at, null);
    assert.equal(result.payment_already_paid, true);
  }
});

test("historical reference conflict cannot fill provider or create an intake", () => {
  const id = booking("payment_status = 'paid', payment_reference = 'pi_history'");
  assertPaymentConflict(
    rpc(id, "a".repeat(64), "unused-candidate", "stripe", "'pi_other'"),
    id,
    /Conflicto de pago:.*referencia de pago distinta/,
  );
});

test("an intake insert failure rolls back the payment update", () => {
  const original = booking();
  sql(rpc(original, "d".repeat(64)));
  const failed = booking();
  assert.throws(() => sql(rpc(failed, "d".repeat(64))), /Command failed/);
  assert.equal(sql(`SELECT payment_status FROM public.bookings WHERE id = '${failed}';`), "pending");
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id = '${failed}';`), "0");
});

test("invalid candidates, cancelled/refunded bookings and ineligible services are rejected", () => {
  const id = booking();
  for (const statement of [
    rpc(id, "bad"),
    rpc(id, "a".repeat(64), " "),
    rpc(id, "a".repeat(64), "cipher", "unknown"),
    rpc(randomUUID()),
  ]) assert.throws(() => sql(statement), /Command failed/);
  for (const state of [
    "status = 'cancelled'",
    "payment_status = 'refunded'",
    "service_name_snapshot = 'Other'",
    "service_name_snapshot = NULL",
    "session_count_snapshot = 2",
  ]) {
    const invalid = booking(state);
    assert.throws(() => sql(rpc(invalid)), /Command failed/);
    assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id = '${invalid}';`), "0");
  }
  assert.equal(sql(`SELECT payment_status FROM public.bookings WHERE id = '${id}';`), "pending");
});

test("existing revoked/submitted/expired intake is reused without resetting it", () => {
  const id = booking();
  sql(rpc(id, "e".repeat(64)));
  for (const status of ["submitted", "revoked"]) {
    sql(`UPDATE public.booking_intake_forms SET status = '${status}', current_step = 5, expires_at = now() - interval '1 day' WHERE booking_id = '${id}';`);
    const before = sql(`SELECT row_to_json(f) FROM public.booking_intake_forms f WHERE booking_id = '${id}';`);
    sql(rpc(id));
    assert.equal(sql(`SELECT row_to_json(f) FROM public.booking_intake_forms f WHERE booking_id = '${id}';`), before);
  }
});

test("manual invitations still allow multiple null booking IDs", () => {
  sql(`INSERT INTO public.booking_intake_forms(source_type, access_token_hash) VALUES ('manual', '${"1".repeat(64)}'), ('manual', '${"2".repeat(64)}');`);
  assert.equal(sql("SELECT count(*) FROM public.booking_intake_forms WHERE booking_id IS NULL;"), "2");
});

test("two database sessions serialize same-payment retries and keep one access", async () => {
  const id = booking();
  const run = (input) => new Promise((resolve, reject) => {
    const child = spawn("psql", psqlArgs, { env });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(JSON.parse(output.trim())) : reject(new Error(errors)));
    child.stdin.end(input);
  });
  const [first, second] = await Promise.all([
    run(`BEGIN; ${rpc(id, "f".repeat(64), "cipher-f", "stripe", "'pi_concurrent'")} SELECT pg_sleep(0.3); COMMIT;`),
    run(rpc(id, "0".repeat(64), "cipher-0", "stripe", "'pi_concurrent'")),
  ]);
  assert.equal(first.form_id, second.form_id);
  assert.equal(first.access_token_hash, second.access_token_hash);
  assert.equal(first.access_token_encrypted, second.access_token_encrypted);
  assert.notEqual(first.intake_created, second.intake_created);
  assert.notEqual(first.payment_already_paid, second.payment_already_paid);
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id = '${id}';`), "1");
});

test("concurrent manual and Stripe requests allow only the winning provider", async () => {
  const id = booking();
  const manualHash = randomUUID().replaceAll("-", "").repeat(2);
  const stripeHash = randomUUID().replaceAll("-", "").repeat(2);
  const run = (input) => new Promise((resolve, reject) => {
    const child = spawn("psql", psqlArgs, { env });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output, errors }));
    child.stdin.end(input);
  });
  const results = await Promise.all([
    run(`BEGIN; ${rpc(id, manualHash, "cipher-manual", "manual")} SELECT pg_sleep(0.3); COMMIT;`),
    run(rpc(id, stripeHash, "cipher-stripe", "stripe", "'pi_racing'")),
  ]);
  const winner = results.findIndex((result) => result.code === 0);
  assert.notEqual(winner, -1);
  assert.notEqual(results[1 - winner].code, 0);
  assert.match(results[1 - winner].errors, /Conflicto de pago:.*otro proveedor/);
  const form = JSON.parse(results[winner].output.trim());
  const payment = JSON.parse(sql(`SELECT row_to_json(b) FROM public.bookings b WHERE id = '${id}';`));
  assert.equal(payment.payment_provider, winner === 0 ? "manual" : "stripe");
  assert.equal(payment.payment_reference, winner === 0 ? null : "pi_racing");
  assert.equal(form.access_token_encrypted, winner === 0 ? "cipher-manual" : "cipher-stripe");
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id = '${id}';`), "1");
});
