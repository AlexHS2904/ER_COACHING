// Local test utility: fetch an existing TEST event and re-sign the same payload
// with the CLI listener secret. No login, migration, real key or production URL.
import Stripe from "stripe";
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "invalid:");
const key = process.env.STRIPE_SECRET_KEY;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
const eventId = process.argv[2];
if (site.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(site.hostname) ||
    !key?.startsWith("sk_test_") || !secret?.startsWith("whsec_") || !/^evt_[a-zA-Z0-9]+$/.test(eventId ?? "")) {
  throw new Error("Use local Test Mode configuration and an existing evt_ ID.");
}
const stripe = new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 });
const event = await stripe.events.retrieve(eventId);
if (event.livemode || !["checkout.session.completed", "checkout.session.expired"].includes(event.type)) {
  throw new Error("Only test Checkout events can be replayed.");
}
const payload = JSON.stringify(event);
const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
const response = await fetch(new URL("/api/webhooks/stripe", site), {
  method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
  body: payload, signal: AbortSignal.timeout(30_000),
});
console.log("Local test event replay", { eventId: event.id, status: response.status });
if (!response.ok) process.exitCode = 1;
