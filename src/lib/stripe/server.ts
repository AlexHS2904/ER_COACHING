import "server-only";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function isLoopback(host: string) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(host);
}

export function getStripeTestSiteUrl() {
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "invalid:");
  const database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "invalid:");
  const allowedRemote = database.origin === "https://rysgpojjhiljrrwtjguy.supabase.co";
  if (!isLoopback(site.hostname) || (!isLoopback(database.hostname) && !allowedRemote) ||
      site.username || site.password || database.username || database.password ||
      database.pathname !== "/" || database.search || database.hash ||
      site.protocol !== "http:" || !["http:", "https:"].includes(database.protocol)) {
    throw new Error("stripe_local_only");
  }
  return site.origin;
}

export function isStripeTestCheckoutEnabled() {
  try {
    getStripeTestSiteUrl();
    return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
  } catch {
    return false;
  }
}

export function getStripeTestClient() {
  getStripeTestSiteUrl();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("stripe_test_key_required");
  return new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 });
}

export function getStripeBookingAdmin() {
  getStripeTestSiteUrl();
  return getSupabaseAdmin();
}
