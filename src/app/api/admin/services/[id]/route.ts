import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  revalidatePath,
} from "next/cache";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateServiceBody = {
  name?: unknown;
  shortDescription?: unknown;
  description?: unknown;

  durationMinutes?: unknown;
  sessionCount?: unknown;
  price?: unknown;

  currency?: unknown;

  requiresQuote?: unknown;
  bookingEnabled?: unknown;
  active?: unknown;

  displayOrder?: unknown;
};

type ActionBody = {
  action?: unknown;
};

/* =========================================================
   AUTH
========================================================= */

async function authorizeAdmin() {
  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

  const userId =
    claimsData
      ?.claims
      ?.sub;

  if (!userId) {
    return {
      allowed: false,
      status: 401,
      error: "No autorizado.",
    } as const;
  }

  const {
    data: admin,
    error,
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
    error ||
    !admin ||
    !admin.active
  ) {
    return {
      allowed: false,
      status: 403,
      error:
        "No tienes permisos para realizar esta acción.",
    } as const;
  }

  return {
    allowed: true,
  } as const;
}

/* =========================================================
   HELPERS
========================================================= */

function refreshServicePaths() {
  revalidatePath("/");
  revalidatePath("/servicios");
  revalidatePath("/reservar");
  revalidatePath("/admin/servicios");
}

function parseNullableInteger(
  value: unknown,
) {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed,
    )
  ) {
    return Number.NaN;
  }

  return parsed;
}

function parseNullableNumber(
  value: unknown,
) {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return Number.NaN;
  }

  return parsed;
}

/* =========================================================
   PUT
   EDITAR SERVICIO
========================================================= */

export async function PUT(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorizeAdmin();

  if (
    !authorization.allowed
  ) {
    return NextResponse.json(
      {
        error:
          authorization.error,
      },
      {
        status:
          authorization.status,
      },
    );
  }

  const { id } =
    await context.params;

  let body:
    | UpdateServiceBody
    | undefined;

  try {
    body =
      (await request.json()) as UpdateServiceBody;
  } catch {
    return NextResponse.json(
      {
        error:
          "Solicitud no válida.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data: currentService,
    error: currentError,
  } = await supabase
    .from("services")
    .select(`
      id,
      slug,
      service_type
    `)
    .eq("id", id)
    .maybeSingle();

  if (
    currentError ||
    !currentService
  ) {
    return NextResponse.json(
      {
        error:
          "El servicio no existe.",
      },
      {
        status: 404,
      },
    );
  }

  const name =
    typeof body.name ===
      "string"
      ? body.name.trim()
      : "";

  const shortDescription =
    typeof body.shortDescription ===
      "string"
      ? body.shortDescription.trim()
      : "";

  const description =
    typeof body.description ===
      "string"
      ? body.description.trim()
      : "";

  if (
    name.length < 2 ||
    name.length > 120
  ) {
    return NextResponse.json(
      {
        error:
          "El nombre debe tener entre 2 y 120 caracteres.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    shortDescription.length < 5 ||
    shortDescription.length > 600
  ) {
    return NextResponse.json(
      {
        error:
          "La descripción corta debe tener entre 5 y 600 caracteres.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    description.length > 5000
  ) {
    return NextResponse.json(
      {
        error:
          "La descripción es demasiado larga.",
      },
      {
        status: 400,
      },
    );
  }

  let durationMinutes =
    parseNullableInteger(
      body.durationMinutes,
    );

  let sessionCount =
    parseNullableInteger(
      body.sessionCount,
    );

  let price =
    parseNullableNumber(
      body.price,
    );

  const displayOrder =
    Number(
      body.displayOrder,
    );

  if (
    Number.isNaN(
      durationMinutes,
    ) ||
    (
      durationMinutes !== null &&
      durationMinutes <= 0
    )
  ) {
    return NextResponse.json(
      {
        error:
          "La duración debe ser mayor a 0.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    Number.isNaN(
      sessionCount,
    ) ||
    (
      sessionCount !== null &&
      sessionCount <= 0
    )
  ) {
    return NextResponse.json(
      {
        error:
          "El número de sesiones debe ser mayor a 0.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    Number.isNaN(price) ||
    (
      price !== null &&
      price < 0
    )
  ) {
    return NextResponse.json(
      {
        error:
          "El precio no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !Number.isInteger(
      displayOrder,
    ) ||
    displayOrder < 0 ||
    displayOrder > 999
  ) {
    return NextResponse.json(
      {
        error:
          "El orden no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof body.requiresQuote !==
      "boolean" ||
    typeof body.bookingEnabled !==
      "boolean" ||
    typeof body.active !==
      "boolean"
  ) {
    return NextResponse.json(
      {
        error:
          "La configuración no es válida.",
      },
      {
        status: 400,
      },
    );
  }

  const requiresQuote =
    body.requiresQuote;

  let bookingEnabled =
    body.bookingEnabled;

  const active =
    body.active;

  const currency =
    typeof body.currency ===
      "string"
      ? body.currency
          .trim()
          .toUpperCase()
      : "";

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "La moneda no es válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    currentService.service_type ===
    "single"
  ) {
    sessionCount = 1;
  }

  if (
    (
      currentService.service_type ===
        "single" ||
      currentService.service_type ===
        "package"
    ) &&
    durationMinutes === null
  ) {
    return NextResponse.json(
      {
        error:
          "Este servicio necesita una duración.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    (
      currentService.service_type ===
        "single" ||
      currentService.service_type ===
        "package"
    ) &&
    sessionCount === null
  ) {
    return NextResponse.json(
      {
        error:
          "Este servicio necesita un número de sesiones.",
      },
      {
        status: 400,
      },
    );
  }

  if (requiresQuote) {
    bookingEnabled =
      false;

    price =
      null;
  }

  if (
    bookingEnabled &&
    durationMinutes === null
  ) {
    return NextResponse.json(
      {
        error:
          "Un servicio reservable necesita una duración.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !requiresQuote &&
    price === null
  ) {
    return NextResponse.json(
      {
        error:
          "Ingresa un precio o activa la cotización.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    data: updatedService,
    error: updateError,
  } = await supabase
    .from("services")
    .update({
      name,

      short_description:
        shortDescription,

      description:
        description ||
        null,

      duration_minutes:
        durationMinutes,

      session_count:
        sessionCount,

      price,

      currency,

      requires_quote:
        requiresQuote,

      booking_enabled:
        bookingEnabled,

      active,

      display_order:
        displayOrder,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", id)
    .select(`
      id,
      name,
      slug,
      short_description,
      description,
      service_type,
      duration_minutes,
      session_count,
      price,
      currency,
      requires_quote,
      booking_enabled,
      active,
      display_order
    `)
    .single();

  if (
    updateError ||
    !updatedService
  ) {
    console.error(
      "Update service error:",
      updateError,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible guardar el servicio.",
      },
      {
        status: 500,
      },
    );
  }

  refreshServicePaths();

  return NextResponse.json({
    ok: true,
    service:
      updatedService,
  });
}

/* =========================================================
   PATCH
   ARCHIVAR / RESTAURAR
========================================================= */

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorizeAdmin();

  if (
    !authorization.allowed
  ) {
    return NextResponse.json(
      {
        error:
          authorization.error,
      },
      {
        status:
          authorization.status,
      },
    );
  }

  const { id } =
    await context.params;

  let body:
    | ActionBody
    | undefined;

  try {
    body =
      (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json(
      {
        error:
          "Solicitud no válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    body.action !==
      "archive" &&
    body.action !==
      "restore"
  ) {
    return NextResponse.json(
      {
        error:
          "Acción no válida.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    getSupabaseAdmin();

  /*
    Archivar solo cambia active.

    No modificamos booking_enabled porque así,
    al restaurar, conservamos exactamente la
    configuración que tenía el servicio.
  */

  const active =
    body.action ===
    "restore";

  const {
    data: service,
    error,
  } = await supabase
    .from("services")
    .update({
      active,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", id)
    .select(`
      id,
      name,
      slug,
      short_description,
      description,
      service_type,
      duration_minutes,
      session_count,
      price,
      currency,
      requires_quote,
      booking_enabled,
      active,
      display_order
    `)
    .single();

  if (
    error ||
    !service
  ) {
    console.error(
      "Archive/restore service error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible actualizar el servicio.",
      },
      {
        status: 500,
      },
    );
  }

  refreshServicePaths();

  return NextResponse.json({
    ok: true,
    service,
  });
}

/* =========================================================
   DELETE
   ELIMINACIÓN DEFINITIVA
========================================================= */

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  const authorization =
    await authorizeAdmin();

  if (
    !authorization.allowed
  ) {
    return NextResponse.json(
      {
        error:
          authorization.error,
      },
      {
        status:
          authorization.status,
      },
    );
  }

  const { id } =
    await context.params;

  const supabase =
    getSupabaseAdmin();

  const {
    data: service,
    error: serviceError,
  } = await supabase
    .from("services")
    .select(`
      id,
      name,
      active
    `)
    .eq("id", id)
    .maybeSingle();

  if (
    serviceError ||
    !service
  ) {
    return NextResponse.json(
      {
        error:
          "El servicio no existe.",
      },
      {
        status: 404,
      },
    );
  }

  if (service.active) {
    return NextResponse.json(
      {
        error:
          "Primero archiva el servicio antes de eliminarlo definitivamente.",
      },
      {
        status: 409,
      },
    );
  }

  /*
    Si existen reservas, jamás eliminamos
    físicamente el servicio.
  */

  const {
    count,
    error: countError,
  } = await supabase
    .from("bookings")
    .select(
      "id",
      {
        count: "exact",
        head: true,
      },
    )
    .eq(
      "service_id",
      id,
    );

  if (countError) {
    console.error(
      "Booking count error:",
      countError,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible comprobar el historial del servicio.",
      },
      {
        status: 500,
      },
    );
  }

  if (
    (count ?? 0) > 0
  ) {
    return NextResponse.json(
      {
        error:
          "Este servicio tiene reservas asociadas y debe conservarse archivado para proteger el historial.",
      },
      {
        status: 409,
      },
    );
  }

  const {
    error: deleteError,
  } = await supabase
    .from("services")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error(
      "Delete service error:",
      deleteError,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible eliminar el servicio.",
      },
      {
        status: 500,
      },
    );
  }

  refreshServicePaths();

  return NextResponse.json({
    ok: true,
  });
}