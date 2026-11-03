import "server-only";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toStripeMinorUnits } from "@/lib/stripe/money";

export type StripeMode = "test" | "live";
export type StripeRuntimeScope = { mode: StripeMode; accountId: string };
export type StripeConfig = StripeRuntimeScope & {
  siteUrl: string;
  newSalesEnabled: boolean;
  paymentMethodConfigurationId: string;
};
const PRODUCTION_REF = "rysgpojjhiljrrwtjguy";
const PRODUCTION_SITE = "https://www.ednarojocoaching.com";
function isLoopback(host: string) { return ["localhost", "127.0.0.1", "[::1]"].includes(host); }
function origin(value: string | undefined) {
  const url = new URL(value ?? "invalid:");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol)) throw new Error("stripe_configuration_invalid");
  return url;
}

// Sales are explicit opt-in. Pausing sales never disables paid access/recovery.
export function getStripeConfig(): StripeConfig {
  const mode = process.env.STRIPE_MODE;
  const accountId = process.env.STRIPE_EXPECTED_ACCOUNT_ID ?? "";
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if ((mode !== "test" && mode !== "live") || !/^acct_[A-Za-z0-9]+$/.test(accountId) ||
      !key.startsWith(mode === "live" ? "sk_live_" : "sk_test_")) throw new Error("stripe_configuration_invalid");
  const site = origin(process.env.NEXT_PUBLIC_SITE_URL);
  const database = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (mode === "live") {
    if (site.origin !== PRODUCTION_SITE || database.origin !== `https://${PRODUCTION_REF}.supabase.co` ||
        process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production") throw new Error("stripe_live_environment_invalid");
  } else {
    const local = isLoopback(site.hostname) && site.protocol === "http:";
    const staging = site.protocol === "https:" && process.env.VERCEL_ENV === "preview" &&
      site.origin === process.env.STRIPE_TEST_SITE_ORIGIN && site.origin !== PRODUCTION_SITE &&
      site.hostname !== "ednarojocoaching.com";
    const testRef = process.env.STRIPE_TEST_SUPABASE_PROJECT_REF;
    const isolatedDatabase = isLoopback(database.hostname) ||
      (testRef && /^[a-z]{20}$/.test(testRef) && testRef !== PRODUCTION_REF && database.origin === `https://${testRef}.supabase.co`);
    if ((!local && !staging) || !isolatedDatabase || database.origin === `https://${PRODUCTION_REF}.supabase.co`) {
      throw new Error("stripe_test_environment_invalid");
    }
  }
  return { mode, accountId, siteUrl: site.origin, newSalesEnabled: process.env.PAID_BOOKINGS_ENABLED === "true",
    paymentMethodConfigurationId: process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID ?? "" };
}
export function isStripeCheckoutEnabled() {
  try {
    assertStripeSalesReady();
    return true;
  } catch { return false; }
}

/** Configuration prerequisites for NEW sales only. Existing receipts, private
 * access, webhook delivery and recovery must survive a paused sales switch. */
export function assertStripeSalesReady(config = getStripeConfig()) {
  const strongWorkerSecret = (value: string | undefined) => Boolean(value && value.length >= 32 && !/\s/.test(value));
  const signatureSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const workerReady = config.mode === "live"
    ? strongWorkerSecret(process.env.CRON_SECRET) || strongWorkerSecret(process.env.STRIPE_WORKER_SECRET)
    : strongWorkerSecret(process.env.STRIPE_LOCAL_WORKER_SECRET);
  if (!config.newSalesEnabled || !/^pmc_[A-Za-z0-9]+$/.test(config.paymentMethodConfigurationId) ||
      !signatureSecret?.startsWith("whsec_") || signatureSecret.length < 24 || /\s/.test(signatureSecret) || !workerReady) {
    throw new Error("stripe_new_sales_not_ready");
  }
}
export function getStripeClient() {
  getStripeConfig();
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-09-30.endive", timeout: 10_000, maxNetworkRetries: 1,
  });
}
export async function getVerifiedStripeContext(options: { forNewSale?: boolean } = {}) {
  const config = getStripeConfig();
  if (options.forNewSale) assertStripeSalesReady(config);
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(null);
  if (account.id !== config.accountId) throw new Error("stripe_account_mismatch");
  if (options.forNewSale && config.mode === "live" &&
      (account.charges_enabled !== true || account.payouts_enabled !== true)) throw new Error("stripe_live_account_not_ready");
  return { config, stripe };
}
export function assertStripeRecordScope(record: {
  stripe_mode?: unknown; stripe_account_id?: unknown; stripe_site_origin?: unknown;
}, scope: StripeRuntimeScope & { siteUrl?: string }) {
  if (record.stripe_mode !== scope.mode || record.stripe_account_id !== scope.accountId ||
      (scope.siteUrl !== undefined && record.stripe_site_origin !== scope.siteUrl)) throw new Error("stripe_record_scope_mismatch");
}
// Only immediate methods may be enabled in the dedicated Dashboard configuration.
// Future enabled methods fail closed instead of silently entering our lifecycle.
export async function verifyImmediatePaymentMethods(stripe: Stripe, config: StripeConfig) {
  if (!/^pmc_[A-Za-z0-9]+$/.test(config.paymentMethodConfigurationId)) throw new Error("stripe_payment_methods_invalid");
  const methods = await stripe.paymentMethodConfigurations.retrieve(config.paymentMethodConfigurationId);
  if (!methods.active || methods.livemode !== (config.mode === "live")) throw new Error("stripe_payment_methods_invalid");
  let cardEnabled = false;
  for (const [name, value] of Object.entries(methods)) {
    if (!value || typeof value !== "object" || !("display_preference" in value)) continue;
    const preference = value.display_preference as { value?: string };
    if (preference.value !== "on") continue;
    if (!["card", "link", "apple_pay", "google_pay"].includes(name)) throw new Error("stripe_deferred_methods_not_supported");
    if (name === "card" && "available" in value && value.available === true) cardEnabled = true;
  }
  if (!cardEnabled) throw new Error("stripe_payment_methods_invalid");
}

// Both launch products must be available together. Public data and a sales flag
// alone cannot silently launch only the individual product.
export async function assertStripeCatalogReady(db = getSupabaseAdmin()) {
  const result = await db.from("services")
    .select("id,slug,service_type,session_count,duration_minutes,price,currency,active,booking_enabled,requires_quote");
  if (result.error) throw new Error("stripe_catalog_unavailable");
  const eligible = (result.data ?? []).filter((s) => s.active === true && s.booking_enabled === true &&
    s.requires_quote === false && s.currency === "MXN" && Number.isInteger(s.duration_minutes) && s.duration_minutes > 0);
  const singles = eligible.filter((s) => s.slug === "sesion-1-1" && s.service_type === "single" && s.session_count === 1);
  const packages = eligible.filter((s) => s.service_type === "package" && s.session_count === 6 && s.duration_minutes === 90);
  if (singles.length !== 1 || packages.length !== 1) throw new Error("stripe_catalog_unavailable");
  for (const service of [singles[0], packages[0]]) toStripeMinorUnits(service.price, service.currency);
  return [singles[0], packages[0]];
}
// Ownership is checked by callers; completed historical reads need no Stripe config.
export function getStripeBookingAdmin() { return getSupabaseAdmin(); }
export const getStripeTestSiteUrl = () => getStripeConfig().siteUrl;
export const getStripeTestClient = getStripeClient;
export const isStripeTestCheckoutEnabled = isStripeCheckoutEnabled;
