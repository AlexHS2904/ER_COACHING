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

type CreateServiceBody = {
  name?: unknown;

  serviceType?: unknown;

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

function slugify(
  value: string,
) {
  return (
    value
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .slice(0, 70) ||
    "servicio"
  );
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

  return Number.isInteger(
    parsed,
  )
    ? parsed
    : Number.NaN;
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

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : Number.NaN;
}

export async function POST(
  request: NextRequest,
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

  let body:
    | CreateServiceBody
    | undefined;

  try {
    body =
      (await request.json()) as CreateServiceBody;
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

  const serviceType =
    typeof body.serviceType ===
      "string"
      ? body.serviceType
      : "";

  if (
    name.length < 2 ||
    name.length > 120
  ) {
    return NextResponse.json(
      {
        error:
          "Ingresa un nombre válido.",
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
          "Ingresa una descripción corta válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    ![
      "single",
      "package",
      "group",
    ].includes(
      serviceType,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Selecciona un tipo de servicio válido.",
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
          "La duración no es válida.",
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
          "El número de sesiones no es válido.",
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
    serviceType ===
    "single"
  ) {
    sessionCount = 1;
  }

  if (
    (
      serviceType ===
        "single" ||
      serviceType ===
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
      serviceType ===
        "single" ||
      serviceType ===
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
          "Un servicio reservable necesita duración.",
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

  const supabase =
    getSupabaseAdmin();

  let displayOrder:
    number;

  if (
    body.displayOrder ===
      undefined ||
    body.displayOrder ===
      null ||
    body.displayOrder === ""
  ) {
    const {
      data: lastService,
    } = await supabase
      .from("services")
      .select(
        "display_order",
      )
      .order(
        "display_order",
        {
          ascending: false,
        },
      )
      .limit(1)
      .maybeSingle();

    displayOrder =
      (
        lastService
          ?.display_order ??
        0
      ) + 1;
  } else {
    displayOrder =
      Number(
        body.displayOrder,
      );

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
  }

  /*
    Crear slug automáticamente.

    Ej:
    Sesión de seguimiento
    -> sesion-de-seguimiento

    Si existe:
    -> sesion-de-seguimiento-2
  */

  const baseSlug =
    slugify(name);

  let slug =
    baseSlug;

  let suffix =
    2;

  while (true) {
    const {
      data: existing,
      error,
    } = await supabase
      .from("services")
      .select("id")
      .eq(
        "slug",
        slug,
      )
      .maybeSingle();

    if (error) {
      console.error(
        "Slug check error:",
        error,
      );

      return NextResponse.json(
        {
          error:
            "No fue posible generar el identificador del servicio.",
        },
        {
          status: 500,
        },
      );
    }

    if (!existing) {
      break;
    }

    slug =
      `${baseSlug}-${suffix}`;

    suffix += 1;
  }

  const {
    data: service,
    error,
  } = await supabase
    .from("services")
    .insert({
      name,
      slug,

      short_description:
        shortDescription,

      description:
        description ||
        null,

      service_type:
        serviceType,

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
    })
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
      "Create service error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible crear el servicio.",
      },
      {
        status: 500,
      },
    );
  }

  revalidatePath("/");
  revalidatePath("/servicios");
  revalidatePath("/reservar");
  revalidatePath("/admin/servicios");

  return NextResponse.json(
    {
      ok: true,
      service,
    },
    {
      status: 201,
    },
  );
}