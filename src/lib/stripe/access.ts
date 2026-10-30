import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const isBookingId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export function hashBookingAccess(token: unknown) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error("invalid_access");
  return createHash("sha256").update(token).digest("hex");
}

export const createBookingAccess = () => randomBytes(32).toString("hex");
export const bookingAccessCookie = (id: string) => `booking_access_${id}`;
export const bookingFlowCookie = (id: string) => `booking_flow_${id}`;

// Retries use the original hold deadline; they never renew this grace period.
export const bookingConfirmationGraceMs = 90 * 60 * 1000;
export function holdCookieOptions(site: string, expiresAt: Date) {
  return {
    httpOnly: true, sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || new URL(site).protocol === "https:",
    path: "/", expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function hasBookingAccess(token: unknown, expected: unknown) {
  try {
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) return false;
    return timingSafeEqual(Buffer.from(hashBookingAccess(token), "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export const bookingCookieOptions = {
  httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 7,
  secure: process.env.NODE_ENV === "production" || (process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false),
};
