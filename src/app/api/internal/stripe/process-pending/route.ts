import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStripeConfig } from "@/lib/stripe/server";
import { processPendingStripeBookings } from "@/lib/stripe/process-pending";

export const runtime = "nodejs";
export const maxDuration = 120;

async function run(request: NextRequest, cron: boolean) {
  const expected = cron ? process.env.CRON_SECRET
    : process.env.VERCEL_ENV === "production" ? process.env.STRIPE_WORKER_SECRET : process.env.STRIPE_LOCAL_WORKER_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if ((cron && (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production")) ||
      !expected || expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    getStripeConfig();
    return NextResponse.json(await processPendingStripeBookings(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "El trabajo permanece pendiente para reintento." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) { return run(request, false); }
// Vercel Cron uses GET with a server-held Bearer secret, never browser cookies.
export async function GET(request: NextRequest) { return run(request, true); }
