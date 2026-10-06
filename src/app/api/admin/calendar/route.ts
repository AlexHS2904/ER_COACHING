import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
) {
  const supabase =
    await createClient();

  /* =========================================
     VALIDAR SESIÓN
  ========================================== */

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  const userId =
    claimsData?.claims?.sub;

  if (!userId) {
    return NextResponse.json(
      {
        error: "No autorizado.",
      },
      {
        status: 401,
      },
    );
  }

  /* =========================================
     VALIDAR ADMIN
  ========================================== */

  const {
    data: admin,
    error: adminError,
  } = await supabase
    .from("admin_users")
    .select(`
      user_id,
      active
    `)
    .eq(
      "user_id",
      userId,
    )
    .maybeSingle();

  if (
    adminError ||
    !admin ||
    !admin.active
  ) {
    return NextResponse.json(
      {
        error:
          "No tienes permisos para consultar el calendario.",
      },
      {
        status: 403,
      },
    );
  }

  /* =========================================
     LEER AÑO Y MES
  ========================================== */

  const yearParam =
    request.nextUrl.searchParams.get(
      "year",
    );

  const monthParam =
    request.nextUrl.searchParams.get(
      "month",
    );

  const year =
    Number(yearParam);

  const month =
    Number(monthParam);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      {
        error:
          "Año o mes no válido.",
      },
      {
        status: 400,
      },
    );
  }

  /* =========================================
     RANGO DEL MES

     Importante:
     los timestamps se guardan como timestamptz.

     Construimos un margen alrededor del mes
     para evitar perder sesiones cercanas al
     cambio de día por zona horaria.
  ========================================== */

  const start =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1,
      ),
    );

  start.setUTCDate(
    start.getUTCDate() - 1,
  );

  const end =
    new Date(
      Date.UTC(
        year,
        month,
        1,
      ),
    );

  end.setUTCDate(
    end.getUTCDate() + 1,
  );

  /* =========================================
     CONSULTAR RESERVAS
  ========================================== */

  const {
    data: bookings,
    error,
  } = await supabase
    .from("bookings")
    .select(`
      id,
      booking_reference,
      customer_name,
      customer_email,
      customer_phone,
      starts_at,
      ends_at,
      notes,
      status,
      service_name_snapshot,
      duration_minutes_snapshot,
      google_meet_url,
      google_calendar_url,
      calendar_status
    `)
    .gte(
      "starts_at",
      start.toISOString(),
    )
    .lt(
      "starts_at",
      end.toISOString(),
    )
    .neq(
      "status",
      "cancelled",
    )
    .order(
      "starts_at",
      {
        ascending: true,
      },
    );

  if (error) {
    console.error(
      "Calendar bookings error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible cargar las sesiones.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    bookings:
      bookings ?? [],
  });
}