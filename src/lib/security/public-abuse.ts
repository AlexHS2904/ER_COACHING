import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export type PublicAbuseGroup =
  | "booking-create"
  | "checkout-create"
  | "checkout-recover"
  | "contact"
  | "intake-draft"
  | "intake-submit"
  | "process-session"
  | "review-submit"
  | "availability-read"
  | "intake-read"
  | "process-read"
  | "review-read";

const RULE_ID = "er-public-abuse-v1";
const RETRY_AFTER_SECONDS = 60;

function unavailable(): Response {
  return Response.json(
    { error: "No fue posible procesar la solicitud. Intenta de nuevo más tarde." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function limited(): Response {
  return Response.json(
    { error: "Demasiadas solicitudes. Intenta de nuevo más tarde." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(RETRY_AFTER_SECONDS),
      },
    },
  );
}

/**
 * Production counters live in Vercel Firewall, never in a function's memory.
 * Configure RULE_ID for ten requests per 60 seconds before deploying this guard.
 * Local development makes no provider request; automated tests mock the SDK.
 */
export async function enforcePublicAbuse(
  request: Pick<Request, "headers">,
  group: PublicAbuseGroup,
  identity?: string,
): Promise<Response | null> {
  if (process.env.NODE_ENV !== "production") return null;

  const secret = process.env.RATE_LIMIT_SECRET;
  const host = process.env.VERCEL_URL ?? "";
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";

  // Vercel supplies these values. Do not use a caller-controlled Host/XFF fallback.
  if (
    process.env.VERCEL !== "1" ||
    !secret ||
    secret.length < 32 ||
    secret.length > 4096 ||
    /\s/.test(secret) ||
    host.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/i.test(host) ||
    isIP(ip) === 0 ||
    (identity !== undefined && (identity.length === 0 || identity.length > 2048))
  ) {
    return unavailable();
  }

  const key = (scope: "ip" | "identity", value: string) =>
    createHmac("sha256", secret)
      .update(JSON.stringify([RULE_ID, group, scope, value]))
      .digest("hex");

  // The SDK forwards headers it receives. Never pass the complete request,
  // private URL, Authorization, cookies, or raw identity/token to that transport.
  const headers = new Headers({ host: host.toLowerCase(), "x-real-ip": ip });
  const keys = [key("ip", ip)];
  if (identity !== undefined) keys.push(key("identity", identity));

  try {
    const { checkRateLimit } = await import("@vercel/firewall");
    for (const rateLimitKey of keys) {
      const result = await checkRateLimit(RULE_ID, {
        headers,
        rateLimitKey,
        timeout: 1000,
      });
      // The SDK reports missing rules as rateLimited:false. Never fail open.
      if (result.error === "not-found") return unavailable();
      if (result.rateLimited) return limited();
      if (result.error || result.rateLimited !== false) return unavailable();
    }
    return null;
  } catch {
    // Provider errors can contain request metadata. Do not log the raw error.
    return unavailable();
  }
}
