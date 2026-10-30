// Reads explicit process environment (optionally Node --env-file=.env.stripe-test).
// Never loads .env.local. Does not run SQL or use Supabase credentials.
const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "invalid:");
const secret = process.env.STRIPE_LOCAL_WORKER_SECRET;
if (site.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(site.hostname) || !secret || secret.length < 32) {
  throw new Error("Configure a loopback NEXT_PUBLIC_SITE_URL and STRIPE_LOCAL_WORKER_SECRET (32+ characters).");
}
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
console.log("Stripe test worker running; stop with Ctrl+C. No secrets are logged.");
while (!stopped) {
  try {
    const response = await fetch(new URL("/api/internal/stripe/process-pending", site), {
      method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) console.error("Local Stripe work remains pending", { status: response.status });
  } catch { console.error("Local Stripe server unavailable; retrying."); }
  if (!stopped) await new Promise((resolve) => setTimeout(resolve, 5_000));
}
