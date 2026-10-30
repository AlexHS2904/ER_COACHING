import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { localPostgres } from "./helpers/local-postgres.mjs";

const pg = localPostgres();
const sql = (statement) => pg.sql(statement);
const json = (statement) => JSON.parse(sql(statement) || "null");
const hash = () => randomBytes(32).toString("hex");
let day = 0;
const slot = () => `2035-01-01T12:00:00Z'::timestamptz + interval '${day++ * 2} days`;
const holdSql = (time, token = hash(), service = "sesion-1-1") =>
  `SELECT public.create_stripe_booking_hold_v1('${service}','${time}','Test Customer','test@example.test',NULL,NULL,'${token}');`;
function hold() { return json(holdSql(slot())); }
function book(id) { return json(`SELECT row_to_json(b) FROM public.bookings b WHERE id='${id}';`); }
function claim(id, token = book(id).booking_access_token_hash, owner = randomUUID()) {
  const result = json(`SELECT public.claim_stripe_checkout_v1('${id}','${token}','${owner}','http://localhost:3000');`);
  return { ...result, owner };
}
function bind(id) {
  const result = claim(id);
  const session = `cs_test_${randomUUID().replaceAll("-", "")}`;
  sql(`SELECT public.save_stripe_checkout_v1('${id}','${result.attempt.id}','${result.owner}','${session}',now()+interval '1 hour');`);
  return { ...result, session };
}
function session(a, changes = {}) {
  return { id: a.session, mode: "payment", livemode: false, status: "complete", payment_status: "paid",
    payment_intent: `pi_${a.attempt.id.replaceAll("-", "")}`, amount_total: 50000, currency: "mxn",
    client_reference_id: a.booking.id,
    metadata: { booking_id: a.booking.id, booking_reference: a.booking.booking_reference, payment_attempt_id: a.attempt.id }, ...changes };
}
function eventSql(a, changes = {}, type = "checkout.session.completed", id = `evt_${randomUUID()}`) {
  return `SELECT public.apply_stripe_checkout_event_v1('${id}','${type}','${JSON.stringify(session(a,changes))}'::jsonb);`;
}
const expireSql = (a) => `SELECT public.expire_stripe_booking_hold_v1('${a.booking.id}','${a.attempt.id}',true);`;

before(() => pg.start(new URL("./fixtures/stripe-local-schema.sql", import.meta.url), [
  new URL("../supabase/migrations/20261027000100_activate_booking_intake_v2.sql", import.meta.url),
  new URL("../supabase/migrations/20261028000100_stripe_test_booking_lifecycle.sql", import.meta.url),
  new URL("../supabase/migrations/20261028000200_intake_v2_stable_service_identity.sql", import.meta.url),
  new URL("../supabase/migrations/20261028201527_stripe_failed_attempt_recovery.sql", import.meta.url),
]));
after(() => pg.stop());

test("hold uses server snapshots, fixed original 30m deadline and no side effects", () => {
  const token = hash(), time = slot();
  const result = json(holdSql(time, token));
  const b = book(result.booking_id);
  assert.equal(b.payment_flow,"stripe"); assert.equal(b.status,"pending"); assert.equal(b.payment_status,"pending");
  assert.equal(Number(b.price_snapshot),500); assert.equal(b.currency_snapshot,"MXN");
  assert.equal(Date.parse(b.payment_expires_at)-Date.parse(b.created_at),1800000);
  assert.equal(b.google_event_id,null); assert.equal(b.google_meet_url,null);
  assert.equal(b.customer_email_id,null); assert.equal(b.coach_email_id,null);
  assert.equal(sql(`SELECT count(*) FROM public.booking_intake_forms WHERE booking_id='${b.id}';`),"0");
  sql("UPDATE public.services SET price=600 WHERE slug='sesion-1-1';");
  const retry=json(holdSql(time,token));
  assert.equal(retry.booking_id,b.id); assert.equal(retry.payment_expires_at,result.payment_expires_at);
  assert.equal(Number(book(b.id).price_snapshot),500);
  sql("UPDATE public.services SET price=500 WHERE slug='sesion-1-1';");
});

test("service display name can change without breaking hold or Stripe line item", () => {
  sql("UPDATE public.services SET name='Consulta personalizada' WHERE slug='sesion-1-1';");
  try {
    const b = book(hold().booking_id);
    assert.equal(b.service_name_snapshot, "Consulta personalizada");
    assert.equal(claim(b.id).attempt.checkout_payload.line_items[0].price_data.product_data.name, "Consulta personalizada");
  } finally { sql("UPDATE public.services SET name='Sesión 1:1' WHERE slug='sesion-1-1';"); }
});

test("wrong slug is rejected even if name and the other service attributes match", () => {
  sql("INSERT INTO public.services(slug,name,service_type,duration_minutes,session_count,price,currency) VALUES('otra-sesion','Sesión 1:1','single',90,1,500,'MXN');");
  assert.throws(() => json(holdSql(slot(), hash(), "otra-sesion")), /service_unavailable/);
});

test("fingerprint normalizes whitespace, empty optional values and service slug", () => {
  const token = hash(), time = slot();
  const original = json(holdSql(time, token));
  const retry = json(`SELECT public.create_stripe_booking_hold_v1(' sesion-1-1 ','${time}',' Test Customer ',' test@example.test ','  ','  ','${token}');`);
  assert.equal(retry.booking_id, original.booking_id);
  assert.equal(book(original.booking_id).stripe_request_fingerprint.length, 64);
  assert.equal(book(original.booking_id).customer_phone, null);
});

test("fingerprint normalizes email case without changing customer name case", () => {
  const token = hash(), time = slot();
  const original = json(holdSql(time, token));
  const retry = json(`SELECT public.create_stripe_booking_hold_v1('sesion-1-1','${time}','Test Customer','TEST@EXAMPLE.TEST',NULL,NULL,'${token}');`);
  assert.equal(retry.booking_id, original.booking_id);
  assert.throws(() => json(`SELECT public.create_stripe_booking_hold_v1('sesion-1-1','${time}','test customer','test@example.test',NULL,NULL,'${token}');`), /flow_mismatch/);
});

test("fingerprint preserves exact instant across timezones and distinguishes real changes", () => {
  const token = hash(), time = slot();
  const original = json(holdSql(time, token));
  assert.equal(json(`SET TIME ZONE 'America/Mexico_City'; ${holdSql(time, token)}`).booking_id, original.booking_id);
  for (const [instant, name, email, phone, notes] of [
    [`('${time}') + interval '1 microsecond'`, "Test Customer", "test@example.test", "NULL", "NULL"],
    [`'${time}'`, "Other Customer", "test@example.test", "NULL", "NULL"],
    [`'${time}'`, "Test Customer", "other@example.test", "NULL", "NULL"],
    [`'${time}'`, "Test Customer", "test@example.test", "'5551234'", "NULL"],
    [`'${time}'`, "Test Customer", "test@example.test", "NULL", "'different'"],
  ]) assert.throws(() => json(`SELECT public.create_stripe_booking_hold_v1('sesion-1-1',${instant},'${name}','${email}',${phone},${notes},'${token}');`), /flow_mismatch/);
});

test("Checkout payload exposes public IDs only, never the hold credential/hash", () => {
  const credentialHash = hash();
  const a = claim(json(holdSql(slot(), credentialHash)).booking_id);
  const payload = a.attempt.checkout_payload;
  assert.equal(JSON.stringify(payload).includes(credentialHash), false);
  assert.deepEqual(Object.keys(payload.metadata).sort(), ['booking_id','booking_reference','payment_attempt_id']);
  for (const field of ['success_url','cancel_url']) {
    const url = new URL(payload[field]);
    assert.equal(url.searchParams.get('booking'), a.booking.id);
    assert.deepEqual([...url.searchParams.keys()].sort(), field === 'success_url' ? ['booking','session_id'] : ['booking']);
    assert.equal(url.search.includes(credentialHash), false);
  }
});

test("hold blocks availability; expiration cancels it and frees the same range", () => {
  const b=book(hold().booking_id);
  const date=b.starts_at.slice(0,10);
  assert.equal(sql(`SELECT count(*) FROM public.get_available_slots('sesion-1-1','${date}');`),"0");
  sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${b.id}';`);
  assert.equal(sql(`SELECT public.expire_stripe_booking_hold_v1('${b.id}',NULL,true);`),"t");
  const expired=book(b.id);
  assert.equal(expired.status,"cancelled"); assert.equal(expired.payment_status,"pending");
  assert.equal(expired.cancellation_reason,"payment_expired"); assert.ok(expired.expired_at);
  assert.equal(sql(`SELECT count(*) FROM public.get_available_slots('sesion-1-1','${date}');`),"1");
});

test("REAL two-connection race: exactly one client gets hold, attempt and eligibility for Checkout", async () => {
  const time=slot();
  const tokens=[hash(),hash()];
  const results=await Promise.all(tokens.map(token=>pg.run(`SET test.before_insert_delay='0.5'; ${holdSql(time,token)}`)));
  assert.equal(results.filter(r=>r.code===0).length,1);
  assert.match(results.find(r=>r.code!==0).errors,/horario.*reservado|slot_conflict/);
  const winnerIndex=results.findIndex(r=>r.code===0);
  const winner=JSON.parse(results[winnerIndex].output);
  const a=claim(winner.booking_id,tokens[winnerIndex]);
  assert.equal(a.booking.id,winner.booking_id);
  assert.throws(()=>claim(winner.booking_id,tokens[1-winnerIndex]),/invalid_access/);
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE starts_at='${time}' AND status IN ('pending','confirmed');`),"1");
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${winner.booking_id}';`),"1");
  assert.equal(sql(`SELECT count(*) FROM public.bookings a JOIN public.bookings b ON a.id<b.id AND a.status IN ('pending','confirmed') AND b.status IN ('pending','confirmed') AND tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)');`),"0");
});

test("same-client retries reuse one hold, one attempt and immutable Checkout payload", () => {
  const token=hash(), time=slot();
  const h=json(holdSql(time,token));
  const first=claim(h.booking_id,token);
  assert.throws(()=>claim(h.booking_id,token),/checkout_in_progress/);
  sql(`UPDATE public.booking_payment_attempts SET status='unknown',lease_until=now()-interval '1 second' WHERE id='${first.attempt.id}';`);
  const retry=claim(h.booking_id,token);
  assert.equal(first.attempt.id,retry.attempt.id);
  assert.deepEqual(first.attempt.checkout_payload,retry.attempt.checkout_payload);
  assert.equal(json(holdSql(time,token)).payment_expires_at,h.payment_expires_at);
});

test("one-active-attempt and Stripe ID unique indexes reject duplicate financial identities", () => {
  const a=bind(hold().booking_id);
  assert.throws(()=>sql(`INSERT INTO public.booking_payment_attempts(booking_id,status,amount_minor,currency,checkout_payload) VALUES('${a.booking.id}','creating',50000,'mxn','{}');`),/duplicate key/);
  const b=claim(hold().booking_id);
  assert.throws(()=>sql(`UPDATE public.booking_payment_attempts SET stripe_checkout_session_id='${a.session}' WHERE id='${b.attempt.id}';`),/duplicate key/);
});

test("failed attempt without dispatch/rejection provenance is not recovered", () => {
  const h=hold(), first=claim(h.booking_id);
  const before=book(h.booking_id);
  // Isolated local database only: reproduce the proposed deterministic outcome.
  sql(`UPDATE public.booking_payment_attempts SET status='failed',last_error='stripe_invalid_request',lease_owner=NULL,lease_until=NULL WHERE id='${first.attempt.id}';`);
  assert.throws(()=>claim(h.booking_id),/checkout_unavailable/);
  assert.deepEqual(book(h.booking_id),before);
  assert.equal(sql(`SELECT count(*) FROM public.bookings WHERE id='${h.booking_id}';`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${h.booking_id}';`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${h.booking_id}' AND status IN ('creating','open','unknown');`),'0');
});

test("successful Checkout binding is open and retry keeps one attempt, session and fixed deadline", () => {
  const a=bind(hold().booking_id);
  const retry=claim(a.booking.id);
  assert.equal(retry.attempt.status,'open');
  assert.equal(retry.attempt.id,a.attempt.id);
  assert.equal(retry.attempt.stripe_checkout_session_id,a.session);
  assert.equal(retry.booking.id,a.booking.id);
  assert.equal(retry.booking.payment_expires_at,a.booking.payment_expires_at);
  assert.deepEqual(retry.attempt.checkout_payload,a.attempt.checkout_payload);
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${a.booking.id}' AND status IN ('creating','open','unknown');`),'1');
});

test("only service_role can invoke financial RPCs; new tables expose no public policies", () => {
  for(const role of ["anon","authenticated"]) {
    assert.equal(sql(`SELECT has_function_privilege('${role}','public.claim_stripe_checkout_v1(uuid,text,uuid,text)','execute');`),"f");
    assert.equal(sql(`SELECT has_table_privilege('${role}','public.booking_payment_attempts','SELECT');`),"f");
    assert.equal(sql(`SELECT has_table_privilege('${role}','public.stripe_events','SELECT');`),"f");
  }
  assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('booking_payment_attempts','stripe_events');"),"0");
});

test("valid completed receipt records paid durably but does not confirm or run side effects", () => {
  const a=bind(hold().booking_id);
  const result=json(eventSql(a));
  const b=book(a.booking.id);
  assert.equal(result.accepted,true); assert.equal(b.payment_status,"paid"); assert.equal(b.status,"pending");
  assert.equal(b.finalization_status,"pending"); assert.equal(b.google_event_id,null);
  assert.equal(b.payment_reference,session(a).payment_intent);
  assert.throws(()=>claim(b.id),/already_paid/);
});

test("duplicate event IDs and different events for same payment preserve payment identity", () => {
  const a=bind(hold().booking_id), id=`evt_${randomUUID()}`;
  json(eventSql(a,{},"checkout.session.completed",id));
  assert.equal(json(eventSql(a,{},"checkout.session.completed",id)).duplicate,true);
  const paidAt=book(a.booking.id).paid_at;
  json(eventSql(a));
  assert.equal(book(a.booking.id).paid_at,paidAt);
  assert.equal(sql(`SELECT count(*) FROM public.booking_payment_attempts WHERE booking_id='${a.booking.id}';`),"1");
});

for(const [label,changes] of [
  ["amount",{amount_total:1}], ["currency",{currency:"usd"}],
  ["booking",{client_reference_id:randomUUID()}],
  ["fake metadata",{metadata:{booking_id:randomUUID(),payment_attempt_id:randomUUID()}}],
]) test(`${label} mismatch cannot apply payment or finalize another booking`,()=>{
  const a=bind(hold().booking_id);
  const result=json(eventSql(a,changes));
  assert.equal(result.review_required,true); assert.equal(book(a.booking.id).payment_status,"pending");
  assert.equal(book(a.booking.id).finalization_status,"review_required");
  assert.ok(json(`SELECT row_to_json(a) FROM public.booking_payment_attempts a WHERE id='${a.attempt.id}';`).payment_received_at);
});

test("an unbound session cannot use metadata alone to apply payment",()=>{
  const a=bind(hold().booking_id);
  assert.throws(()=>json(eventSql(a,{id:"cs_test_unbound"})),/attempt_not_bound/);
  assert.equal(book(a.booking.id).payment_status,"pending");
});

test("expired event cancels the correct overdue hold only",()=>{
  const a=bind(hold().booking_id);
  sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${a.booking.id}';`);
  json(eventSql(a,{status:"expired",payment_status:"unpaid",payment_intent:null},"checkout.session.expired"));
  assert.equal(book(a.booking.id).status,"cancelled");
  assert.equal(sql(`SELECT status FROM public.booking_payment_attempts WHERE id='${a.attempt.id}';`),"expired");
});

test("early expiry and wrong attempt never release a hold; paid booking cannot expire",()=>{
  const a=bind(hold().booking_id);
  assert.equal(sql(expireSql(a)),"f");
  json(eventSql(a));
  sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${a.booking.id}';`);
  assert.equal(sql(expireSql(a)),"f"); assert.equal(book(a.booking.id).status,"pending");
  const b=bind(hold().booking_id);
  sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${b.booking.id}';`);
  assert.equal(sql(`SELECT public.expire_stripe_booking_hold_v1('${b.booking.id}','${a.attempt.id}',true);`),"f");
});

test("REAL payment wins row-lock race: concurrent expirator cannot cancel paid hold",async()=>{
  const a=bind(hold().booking_id);
  const payment=pg.run(`BEGIN; ${eventSql(a)} SELECT pg_sleep(0.4); COMMIT;`);
  const expire=pg.run(`SELECT pg_sleep(0.1); ${expireSql(a)}`);
  const results=await Promise.all([payment,expire]);
  assert.ok(results.every(r=>r.code===0)); assert.equal(book(a.booking.id).payment_status,"paid");
  assert.equal(book(a.booking.id).status,"pending");
});

test("REAL expiry wins row-lock race: later payment is retained for review, never resurrected",async()=>{
  const a=bind(hold().booking_id);
  sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${a.booking.id}';`);
  const results=await Promise.all([
    pg.run(`BEGIN; ${expireSql(a)} SELECT pg_sleep(0.4); COMMIT;`),
    pg.run(`SELECT pg_sleep(0.1); ${eventSql(a)}`),
  ]);
  assert.ok(results.every(r=>r.code===0));
  const b=book(a.booking.id);
  assert.equal(b.status,"cancelled"); assert.equal(b.payment_status,"paid"); assert.equal(b.finalization_status,"review_required");
  assert.equal(b.google_event_id,null);
  assert.equal(json(`SELECT public.claim_stripe_finalization_v1('${b.id}','${randomUUID()}');`),null);
});

test("out-of-order expired event cannot undo an accepted completed event",()=>{
  const a=bind(hold().booking_id); json(eventSql(a));
  sql(`UPDATE public.bookings SET payment_expires_at=now()-interval '1 second' WHERE id='${a.booking.id}';`);
  json(eventSql(a,{status:"expired",payment_status:"unpaid",payment_intent:null},"checkout.session.expired"));
  assert.equal(book(a.booking.id).payment_status,"paid"); assert.equal(book(a.booking.id).status,"pending");
});

test("finalizer lease prevents concurrent owners and stale-worker writes",()=>{
  const a=bind(hold().booking_id); json(eventSql(a));
  const owner=randomUUID(),other=randomUUID();
  assert.ok(json(`SELECT public.claim_stripe_finalization_v1('${a.booking.id}','${owner}');`));
  assert.equal(json(`SELECT public.claim_stripe_finalization_v1('${a.booking.id}','${other}');`),null);
  assert.throws(()=>sql(`SELECT public.save_stripe_finalization_v1('${a.booking.id}','${other}','heartbeat');`),/lease_lost/);
  sql(`UPDATE public.bookings SET finalization_lease_until=now()-interval '1 second' WHERE id='${a.booking.id}';`);
  assert.ok(json(`SELECT public.claim_stripe_finalization_v1('${a.booking.id}','${other}');`));
  assert.throws(()=>sql(`SELECT public.save_stripe_finalization_v1('${a.booking.id}','${owner}','heartbeat');`),/lease_lost/);
});

test("packages/processes keep pending legacy bookings and share the overlap authority",()=>{
  for(const fn of ["create_package_booking","create_process_session"]) {
    const time=slot();
    const b=json(`SELECT row_to_json(x) FROM public.${fn}('${time}') x;`);
    assert.equal(book(b.booking_id).payment_flow,null);
    assert.equal(sql(`SELECT public.expire_stripe_booking_hold_v1('${b.booking_id}',NULL,true);`),"f");
    assert.equal(book(b.booking_id).status,"pending");
    assert.throws(()=>json(holdSql(time)),/horario.*disponible/);
  }
  const time=slot(); json(holdSql(time));
  assert.throws(()=>sql(`SELECT * FROM public.create_process_session('${time}');`),/horario.*disponible/);
});

test("intake v2 remains exactly one form/token and manual invitations still accept null booking",()=>{
  const a=bind(hold().booking_id); json(eventSql(a));
  const first=json(`SELECT row_to_json(r) FROM public.activate_booking_intake_v2('${a.booking.id}','${hash()}','encrypted-first','stripe','${session(a).payment_intent}') r;`);
  const retry=json(`SELECT row_to_json(r) FROM public.activate_booking_intake_v2('${a.booking.id}','${hash()}','encrypted-other','stripe','${session(a).payment_intent}') r;`);
  assert.equal(first.form_id,retry.form_id); assert.equal(retry.access_token_encrypted,"encrypted-first");
  sql(`INSERT INTO public.booking_intake_forms(source_type,access_token_hash) VALUES('manual','${hash()}'),('manual','${hash()}');`);
});

test("paid Stripe booking with renamed service snapshot activates V2 and preserves payment/intake on retry",()=>{
  sql("UPDATE public.services SET name='Consulta individual renovada' WHERE slug='sesion-1-1';");
  try {
    const a=bind(hold().booking_id);
    sql("UPDATE public.services SET name='Otro título visible' WHERE slug='sesion-1-1';");
    json(eventSql(a));
    const paid=book(a.booking.id);
    const activate=()=>json(`SELECT row_to_json(r) FROM public.activate_booking_intake_v2('${a.booking.id}','${hash()}','encrypted-renamed','stripe','${session(a).payment_intent}') r;`);
    const first=activate(), retry=activate();
    assert.equal(first.service_name,'Consulta individual renovada');
    assert.equal(retry.service_name,first.service_name);
    assert.equal(retry.form_id,first.form_id);
    assert.equal(retry.access_token_hash,first.access_token_hash);
    assert.equal(retry.access_token_encrypted,first.access_token_encrypted);
    assert.equal(retry.intake_created,false);
    assert.deepEqual(book(a.booking.id),paid);
  } finally { sql("UPDATE public.services SET name='Sesión 1:1' WHERE slug='sesion-1-1';"); }
});

test("transactional finalization steps preserve paid/slot on failure and complete exactly once",()=>{
  const a=bind(hold().booking_id);json(eventSql(a));const owner=randomUUID();
  json(`SELECT public.claim_stripe_finalization_v1('${a.booking.id}','${owner}');`);
  const save=(step,data={})=>json(`SELECT public.save_stripe_finalization_v1('${a.booking.id}','${owner}','${step}','${JSON.stringify(data)}');`);
  save("calendar",{eventId:"stable-sql-event",meetUrl:null,calendarUrl:"https://calendar.google.com/test-only"});
  assert.equal(book(a.booking.id).status,"pending");
  save("retryable",{code:"meet_pending"});
  assert.equal(book(a.booking.id).payment_status,"paid");
  assert.equal(sql(`SELECT count(*) FROM public.get_available_slots('sesion-1-1','${book(a.booking.id).starts_at.slice(0,10)}');`),"0");
  json(`SELECT public.claim_stripe_finalization_v1('${a.booking.id}','${owner}');`);
  save("calendar",{eventId:"stable-sql-event",meetUrl:"https://meet.google.com/test-only",calendarUrl:"https://calendar.google.com/test-only"});
  assert.equal(book(a.booking.id).status,"confirmed");
  save("customer_email",{id:"customer-sql-test"});save("coach_email",{id:"coach-sql-test"});
  sql(`SELECT * FROM public.activate_booking_intake_v2('${a.booking.id}','${hash()}','encrypted-sql-test','stripe','${session(a).payment_intent}');`);
  sql(`UPDATE public.booking_intake_forms SET ready_email_sent_at=now() WHERE booking_id='${a.booking.id}';`);
  save("completed");
  assert.equal(book(a.booking.id).finalization_status,"completed");
  assert.ok(book(a.booking.id).finalized_at);
  assert.equal(json(`SELECT public.claim_stripe_finalization_v1('${a.booking.id}','${randomUUID()}');`),null);
});
