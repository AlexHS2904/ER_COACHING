import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getIntakeByToken,
} from "@/lib/intake/get-intake-by-token";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

type Params = {
  params: Promise<{
    token: string;
  }>;
};

const occupations =
  new Set([
    "student",
    "intern",
    "graduate",
    "employee",
    "job_seeker",
    "other",
  ]);

const challenges =
  new Set([
    "professional_clarity",
    "vocational_doubts",
    "fear_of_mistakes",
    "insecurity",
    "job_search",
    "lack_of_direction",
    "decision_making",
    "self_knowledge",
    "other",
  ]);

const durations =
  new Set([
    "less_than_month",
    "one_to_six_months",
    "more_than_six_months",
    "unsure",
  ]);

const supports =
  new Set([
    "personal_reflection",
    "practical_tools",
    "decision_clarity",
    "action_plan",
    "limiting_beliefs",
    "other",
  ]);

function cleanText(
  value: unknown,
  max = 3000,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const trimmed =
    value
      .trim()
      .slice(
        0,
        max,
      );

  return trimmed ||
    null;
}

function cleanArray(
  value: unknown,
  allowed: Set<string>,
) {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (
          item,
        ): item is string =>
          typeof item ===
            "string" &&
          allowed.has(
            item,
          ),
      ),
    ),
  ];
}

function cleanAge(
  value: unknown,
) {
  if (
    value === null ||
    value === "" ||
    value === undefined
  ) {
    return null;
  }

  const age =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      age,
    ) ||
    age < 1 ||
    age > 120
  ) {
    return null;
  }

  return age;
}

function mapAnswers(
  body: Record<
    string,
    unknown
  >,
) {
  const occupation =
    typeof body
      .occupation ===
      "string" &&
    occupations.has(
      body
        .occupation,
    )
      ? body
          .occupation
      : null;

  const challengeDuration =
    typeof body
      .challengeDuration ===
      "string" &&
    durations.has(
      body
        .challengeDuration,
    )
      ? body
          .challengeDuration
      : null;

  return {
    age:
      cleanAge(
        body.age,
      ),

    occupation,

    current_situation:
      cleanText(
        body
          .currentSituation,
      ),

    discovery_source:
      cleanText(
        body
          .discoverySource,
        500,
      ),

    motivation:
      cleanText(
        body
          .motivation,
      ),

    current_challenges:
      cleanArray(
        body
          .currentChallenges,
        challenges,
      ),

    challenge_duration:
      challengeDuration,

    desired_outcome:
      cleanText(
        body
          .desiredOutcome,
      ),

    desired_change:
      cleanText(
        body
          .desiredChange,
      ),

    blocking_factors:
      cleanText(
        body
          .blockingFactors,
      ),

    strengths:
      cleanText(
        body
          .strengths,
      ),

    main_concern:
      cleanText(
        body
          .mainConcern,
      ),

    previous_attempts:
      cleanText(
        body
          .previousAttempts,
      ),

    support_preferences:
      cleanArray(
        body
          .supportPreferences,
        supports,
      ),

    additional_notes:
      cleanText(
        body
          .additionalNotes,
      ),
  };
}

async function validateAccess(
  token: string,
) {
  const result =
    await getIntakeByToken(
      token,
    );

  if (!result) {
    return {
      error:
        "Formulario no encontrado.",
      status:
        404,
      result:
        null,
    };
  }

  if (
    result.booking
      .payment_status !==
    "paid"
  ) {
    return {
      error:
        "El formulario todavía no está disponible.",
      status:
        403,
      result:
        null,
    };
  }

  if (
    result.booking
      .status ===
    "cancelled"
  ) {
    return {
      error:
        "Esta reserva fue cancelada.",
      status:
        403,
      result:
        null,
    };
  }

  if (
    result.form
      .submitted_at
  ) {
    return {
      error:
        "Este formulario ya fue enviado.",
      status:
        409,
      result:
        null,
    };
  }

  return {
    error:
      null,
    status:
      200,
    result,
  };
}


/* =========================================================
   GUARDAR BORRADOR
========================================================= */

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: Params,
) {
  const {
    token,
  } = await params;

  const access =
    await validateAccess(
      token,
    );

  if (
    !access.result
  ) {
    return NextResponse.json(
      {
        error:
          access.error,
      },
      {
        status:
          access.status,
      },
    );
  }

  const body =
    (await request.json()) as Record<
      string,
      unknown
    >;

  const requestedStep =
    Number(
      body.currentStep ??
      1,
    );

  const currentStep =
    Math.min(
      5,
      Math.max(
        1,
        Number.isFinite(
          requestedStep,
        )
          ? Math.trunc(
              requestedStep,
            )
          : 1,
      ),
    );

  const supabase =
    getSupabaseAdmin();

  const {
    error,
  } = await supabase
    .from(
      "booking_intake_forms",
    )
    .update({
      ...mapAnswers(
        body,
      ),

      current_step:
        currentStep,
    })
    .eq(
      "id",
      access.result
        .form.id,
    );

  if (error) {
    console.error(
      "Intake draft error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible guardar tu progreso.",
      },
      {
        status:
          500,
      },
    );
  }

  return NextResponse.json({
    success:
      true,
  });
}


/* =========================================================
   ENVÍO FINAL
========================================================= */

export async function POST(
  request: NextRequest,
  {
    params,
  }: Params,
) {
  const {
    token,
  } = await params;

  const access =
    await validateAccess(
      token,
    );

  if (
    !access.result
  ) {
    return NextResponse.json(
      {
        error:
          access.error,
      },
      {
        status:
          access.status,
      },
    );
  }

  const body =
    (await request.json()) as Record<
      string,
      unknown
    >;

  const supabase =
    getSupabaseAdmin();

  const now =
    new Date()
      .toISOString();

  const {
    error,
  } = await supabase
    .from(
      "booking_intake_forms",
    )
    .update({
      ...mapAnswers(
        body,
      ),

      current_step:
        5,

      submitted_at:
        now,
    })
    .eq(
      "id",
      access.result
        .form.id,
    );

  if (error) {
    console.error(
      "Intake submit error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible enviar el formulario.",
      },
      {
        status:
          500,
      },
    );
  }

  return NextResponse.json({
    success:
      true,
  });
}