import { NextRequest, NextResponse } from "next/server";

import { getAvailableSlots, getAdminAvailableSlots } from "@/lib/data/availability";
import { enforcePublicAbuse } from "@/lib/security/public-abuse";

export async function GET(request: NextRequest) {
  const limited = await enforcePublicAbuse(request, "availability-read");
  if (limited) return limited;

  const searchParams = request.nextUrl.searchParams;

  const service = searchParams.get("service");
  const date = searchParams.get("date");

  if (!service || !date) {
    return NextResponse.json(
      {
        error: "service y date son requeridos",
      },
      {
        status: 400,
      },
    );
  }

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

  if (!validDate) {
    return NextResponse.json(
      {
        error: "Formato de fecha inválido. Usa YYYY-MM-DD.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    let adminUserId: string | undefined;
    const testIntent = request.headers.get("x-er-admin-live-test");
    if (testIntent !== null) {
      if (testIntent !== "1") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
      const { getStripeConfig } = await import("@/lib/stripe/server");
      const config = getStripeConfig();
      if (config.mode !== "live" || request.nextUrl.origin !== config.siteUrl ||
          (request.headers.get("origin") !== null && request.headers.get("origin") !== config.siteUrl)) {
        return NextResponse.json({ error: "No autorizado." }, { status: 403 });
      }
      const { authorizeAdminRequest } = await import("@/lib/admin/authorize-admin");
      const admin = await authorizeAdminRequest();
      if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
      adminUserId = admin.userId;
    }
    const slots = adminUserId
      ? await getAdminAvailableSlots(service, date, adminUserId)
      : await getAvailableSlots(service, date);

    return NextResponse.json({
      service,
      date,
      slots,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "No fue posible consultar la disponibilidad.",
      },
      {
        status: 500,
      },
    );
  }
}
