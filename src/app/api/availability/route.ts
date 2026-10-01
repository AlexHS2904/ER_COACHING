import { NextRequest, NextResponse } from "next/server";

import { getAvailableSlots } from "@/lib/data/availability";

export async function GET(request: NextRequest) {
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
    const slots = await getAvailableSlots(
      service,
      date,
    );

    return NextResponse.json({
      service,
      date,
      slots,
    });
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