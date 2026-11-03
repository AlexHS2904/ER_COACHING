import "server-only";

/** New purchases retain their trusted origin; completed legacy reads use only
 * the deployment's public origin and never need an API key or a sales flag. */
export function bookingSiteOrigin(booking: { stripe_mode?: string | null; stripe_site_origin?: string | null }) {
  const url = new URL(booking.stripe_site_origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "invalid:");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol) ||
      (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
      (booking.stripe_mode === "live" && url.origin !== "https://www.ednarojocoaching.com")) {
    throw new Error("booking_site_origin_invalid");
  }
  return url.origin;
}
