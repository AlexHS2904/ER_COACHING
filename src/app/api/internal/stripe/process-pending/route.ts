import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStripeTestClient } from "@/lib/stripe/server";
import { processPendingStripeBookings } from "@/lib/stripe/process-pending";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected = process.env.STRIPE_LOCAL_WORKER_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!expected || expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    getStripeTestClient();
    return NextResponse.json(await processPendingStripeBookings());
  } catch {
    return NextResponse.json({ error: "El trabajo permanece pendiente para reintento." }, { status: 503 });
  }
}
