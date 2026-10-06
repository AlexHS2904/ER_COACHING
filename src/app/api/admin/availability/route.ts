import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

type WeeklyRuleInput = {
  day_of_week?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  active?: unknown;
};

type SettingsBody = {
  minimumNoticeHours?: unknown;
  maxAdvanceDays?: unknown;
  slotIntervalMinutes?: unknown;
  rules?: unknown;
};

type ExceptionBody = {
  type?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  reason?: unknown;
};

const TIME_REGEX =
  /^([01]\d|2[0-3]):[0-5]\d$/;

const DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}$/;

/* =========================================================
   AUTORIZACIÓN
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
      error:
        "No autorizado.",
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

function isValidDate(
  value: string,
) {
  if (
    !DATE_REGEX.test(
      value,
    )
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  return (
    date.getUTCFullYear() ===
      year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() ===
      day
  );
}

function normalizeReason(
  value: unknown,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return (
    cleaned || null
  );
}

/* =========================================================
   PUT
   GUARDAR CONFIGURACIÓN + HORARIO SEMANAL
========================================================= */

export async function PUT(
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
    | SettingsBody
    | undefined;

  try {
    body =
      (await request.json()) as SettingsBody;
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

  const minimumNoticeHours =
    Number(
      body.minimumNoticeHours,
    );

  const maxAdvanceDays =
    Number(
      body.maxAdvanceDays,
    );

  const slotIntervalMinutes =
    Number(
      body.slotIntervalMinutes,
    );

  if (
    !Number.isInteger(
      minimumNoticeHours,
    ) ||
    minimumNoticeHours < 0 ||
    minimumNoticeHours >
      720
  ) {
    return NextResponse.json(
      {
        error:
          "La anticipación mínima no es válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !Number.isInteger(
      maxAdvanceDays,
    ) ||
    maxAdvanceDays < 1 ||
    maxAdvanceDays > 365
  ) {
    return NextResponse.json(
      {
        error:
          "El rango máximo de reservación no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !Number.isInteger(
      slotIntervalMinutes,
    ) ||
    slotIntervalMinutes < 5 ||
    slotIntervalMinutes > 240
  ) {
    return NextResponse.json(
      {
        error:
          "El intervalo de horarios no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !Array.isArray(
      body.rules,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "La configuración semanal no es válida.",
      },
      {
        status: 400,
      },
    );
  }

  const rules =
    body.rules as WeeklyRuleInput[];

  const normalizedRules: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    active: boolean;
  }[] = [];

  for (
    const rule
    of rules
  ) {
    const day =
      Number(
        rule.day_of_week,
      );

    const start =
      typeof rule.start_time ===
      "string"
        ? rule.start_time
        : "";

    const end =
      typeof rule.end_time ===
      "string"
        ? rule.end_time
        : "";

    if (
      !Number.isInteger(day) ||
      day < 0 ||
      day > 6 ||
      !TIME_REGEX.test(
        start,
      ) ||
      !TIME_REGEX.test(
        end,
      ) ||
      start >= end
    ) {
      return NextResponse.json(
        {
          error:
            "Hay un horario semanal no válido.",
        },
        {
          status: 400,
        },
      );
    }

    normalizedRules.push({
      day_of_week:
        day,

      start_time:
        start,

      end_time:
        end,

      active:
        rule.active !==
        false,
    });
  }

  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } = await supabase.rpc(
    "admin_save_availability_configuration",
    {
      p_minimum_notice_hours:
        minimumNoticeHours,

      p_max_advance_days:
        maxAdvanceDays,

      p_slot_interval_minutes:
        slotIntervalMinutes,

      p_rules:
        normalizedRules,
    },
  );

  if (error) {
    console.error(
      "Availability configuration error:",
      error,
    );

    const overlap =
      error.message.includes(
        "OVERLAPPING_AVAILABILITY_RULES",
      );

    return NextResponse.json(
      {
        error:
          overlap
            ? "Hay horarios que se traslapan dentro del mismo día."
            : error.message,
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    ok: true,
  });
}

/* =========================================================
   POST
   CREAR EXCEPCIÓN
========================================================= */

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
    | ExceptionBody
    | undefined;

  try {
    body =
      (await request.json()) as ExceptionBody;
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

  const type =
    typeof body.type ===
    "string"
      ? body.type
      : "";

  const date =
    typeof body.date ===
    "string"
      ? body.date
      : "";

  if (
    ![
      "blocked_day",
      "blocked_window",
      "extra_window",
    ].includes(type)
  ) {
    return NextResponse.json(
      {
        error:
          "El tipo de excepción no es válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isValidDate(
      date,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Selecciona una fecha válida.",
      },
      {
        status: 400,
      },
    );
  }

  const reason =
    normalizeReason(
      body.reason,
    );

  if (
    reason &&
    reason.length > 200
  ) {
    return NextResponse.json(
      {
        error:
          "El motivo es demasiado largo.",
      },
      {
        status: 400,
      },
    );
  }

  let startTime:
    | string
    | null = null;

  let endTime:
    | string
    | null = null;

  let isAvailable =
    false;

  if (
    type !==
    "blocked_day"
  ) {
    startTime =
      typeof body.startTime ===
      "string"
        ? body.startTime
        : "";

    endTime =
      typeof body.endTime ===
      "string"
        ? body.endTime
        : "";

    if (
      !TIME_REGEX.test(
        startTime,
      ) ||
      !TIME_REGEX.test(
        endTime,
      ) ||
      startTime >=
        endTime
    ) {
      return NextResponse.json(
        {
          error:
            "Selecciona un rango de horario válido.",
        },
        {
          status: 400,
        },
      );
    }
  }

  if (
    type ===
    "extra_window"
  ) {
    isAvailable =
      true;
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from(
      "availability_exceptions",
    )
    .insert({
      exception_date:
        date,

      is_available:
        isAvailable,

      start_time:
        startTime,

      end_time:
        endTime,

      reason,
    })
    .select(`
      id,
      exception_date,
      is_available,
      start_time,
      end_time,
      reason
    `)
    .single();

  if (
    error ||
    !data
  ) {
    console.error(
      "Create availability exception error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible guardar la excepción.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    ok: true,
    exception:
      data,
  });
}

/* =========================================================
   DELETE
   ELIMINAR EXCEPCIÓN
========================================================= */

export async function DELETE(
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
    | {
        id?: unknown;
      }
    | undefined;

  try {
    body =
      (await request.json()) as {
        id?: unknown;
      };
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
    typeof body.id !==
      "string" ||
    !body.id
  ) {
    return NextResponse.json(
      {
        error:
          "Excepción no válida.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } = await supabase
    .from(
      "availability_exceptions",
    )
    .delete()
    .eq(
      "id",
      body.id,
    );

  if (error) {
    console.error(
      "Delete availability exception error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible eliminar la excepción.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    ok: true,
  });
}