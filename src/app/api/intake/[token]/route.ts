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

import {
  sendIntakeSubmissionEmail,
} from "@/lib/email/send-intake-subimssion-mail";

/* =========================================================
   TYPES
========================================================= */

type Params = {
  params: Promise<{
    token: string;
  }>;
};

type IntakeBody =
  Record<
    string,
    unknown
  >;

/* =========================================================
   CLEANERS
========================================================= */

function cleanText(
  value: unknown,
  maxLength = 4000,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const valueClean =
    value
      .trim()
      .slice(
        0,
        maxLength,
      );

  return valueClean ||
    null;
}

function cleanAge(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
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

function cleanStringArray(
  value: unknown,
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
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            "string",
        )
        .map(
          (
            item,
          ) =>
            item
              .trim()
              .slice(
                0,
                300,
              ),
        )
        .filter(
          Boolean,
        ),
    ),
  ];
}

/* =========================================================
   MAP ANSWERS
========================================================= */

function mapAnswers(
  body: IntakeBody,
) {
  return {
    age:
      cleanAge(
        body.age,
      ),

    occupation:
      cleanText(
        body.occupation,
        300,
      ),

    current_situation:
      cleanText(
        body
          .currentSituation,
      ),

    discovery_source:
      cleanText(
        body
          .discoverySource,
        1000,
      ),

    motivation:
      cleanText(
        body.motivation,
      ),

    current_challenges:
      cleanStringArray(
        body
          .currentChallenges,
      ),

    challenge_duration:
      cleanText(
        body
          .challengeDuration,
        300,
      ),

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
        body.strengths,
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
      cleanStringArray(
        body
          .supportPreferences,
      ),

    additional_notes:
      cleanText(
        body
          .additionalNotes,
      ),
  };
}

/* =========================================================
   ACCESS VALIDATION

   Ya NO existe OTP.

   El propio token privado es la credencial.
========================================================= */

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

  const {
    form,
    booking,
  } = result;

  /* =====================================================
     REVOKED
  ===================================================== */

  if (
    form.status ===
    "revoked"
  ) {
    return {
      error:
        "Este formulario ya no está disponible.",

      status:
        410,

      result:
        null,
    };
  }

  /* =====================================================
     EXPIRED
  ===================================================== */

  if (
    form.expires_at &&
    new Date(
      form.expires_at,
    ).getTime() <
      Date.now()
  ) {
    return {
      error:
        "Este enlace ha expirado.",

      status:
        410,

      result:
        null,
    };
  }

  /* =====================================================
     BOOKING
  ===================================================== */

  if (
    form.source_type ===
    "booking"
  ) {
    if (!booking) {
      return {
        error:
          "No fue posible recuperar la reserva asociada.",

        status:
          404,

        result:
          null,
      };
    }

    if (
      booking.status ===
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
      booking
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
  }

  /* =====================================================
     ALREADY SUBMITTED
  ===================================================== */

  if (
    form.submitted_at ||
    form.status ===
      "submitted"
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

  /* =====================================================
     IDENTITY
  ===================================================== */

  const inviteeName =
    form.invitee_name ??
    booking?.customer_name ??
    null;

  const inviteeEmail =
    form.invitee_email ??
    booking?.customer_email ??
    null;

  if (
    !inviteeName ||
    !inviteeEmail
  ) {
    return {
      error:
        "El formulario no tiene un destinatario válido.",

      status:
        500,

      result:
        null,
    };
  }

  return {
    error:
      null,

    status:
      200,

    result: {
      ...result,

      inviteeName,

      inviteeEmail,
    },
  };
}

/* =========================================================
   PATCH
   SAVE PROGRESS
========================================================= */

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: Params,
) {
  try {
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
      (await request.json()) as IntakeBody;

    /* =====================================================
       CURRENT STEP
    ===================================================== */

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

    /* =====================================================
       SAVE PROGRESS
    ===================================================== */

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
      )
      .eq(
        "status",
        "active",
      )
      .is(
        "submitted_at",
        null,
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

      currentStep,
    });
  } catch (
    error
  ) {
    console.error(
      "Unexpected intake draft error:",
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
}

/* =========================================================
   POST
   FINAL SUBMISSION
========================================================= */

export async function POST(
  request: NextRequest,
  {
    params,
  }: Params,
) {
  try {
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
      (await request.json()) as IntakeBody;

    const supabase =
      getSupabaseAdmin();

    const now =
      new Date()
        .toISOString();

    /* =====================================================
       GUARDAR ENVÍO FINAL

       .is(submitted_at, null)
       +
       status = active

       evita un segundo envío.
    ===================================================== */

    const {
      data:
        submittedForm,

      error:
        submitError,
    } = await supabase
      .from(
        "booking_intake_forms",
      )
      .update({
        ...mapAnswers(
          body,
        ),

        /*
          Nos aseguramos de que identidad
          también exista en formularios
          antiguos.
        */

        invitee_name:
          access.result
            .inviteeName,

        invitee_email:
          access.result
            .inviteeEmail,

        current_step:
          5,

        status:
          "submitted",

        submitted_at:
          now,
      })
      .eq(
        "id",
        access.result
          .form.id,
      )
      .eq(
        "status",
        "active",
      )
      .is(
        "submitted_at",
        null,
      )
      .select("*")
      .maybeSingle();

    if (
      submitError
    ) {
      console.error(
        "Intake submit error:",
        submitError,
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

    /*
      Si dos requests intentaran enviarlo
      al mismo tiempo, uno de ellos ya no
      encontrará status=active.
    */

    if (
      !submittedForm
    ) {
      return NextResponse.json(
        {
          error:
            "Este formulario ya fue enviado.",
        },
        {
          status:
            409,
        },
      );
    }

    /* =====================================================
       CORREO PARA EDNA

       Primero guardamos respuestas.
       Después enviamos email.

       Si Resend falla, NO perdemos
       el formulario.
    ===================================================== */

    try {
      const emailResult =
        await sendIntakeSubmissionEmail({
          form:
            submittedForm,

          bookingReference:
            access.result
              .booking
              ?.booking_reference ??
            null,
        });

      if (
        emailResult.error
      ) {
        console.error(
          "Intake coach email error:",
          emailResult.error,
        );

        await supabase
          .from(
            "booking_intake_forms",
          )
          .update({
            coach_email_sent_at:
              null,

            coach_email_error:
              JSON.stringify(
                emailResult.error,
              ),
          })
          .eq(
            "id",
            submittedForm.id,
          );
      } else {
        await supabase
          .from(
            "booking_intake_forms",
          )
          .update({
            coach_email_sent_at:
              new Date()
                .toISOString(),

            coach_email_error:
              null,
          })
          .eq(
            "id",
            submittedForm.id,
          );
      }
    } catch (
      emailError
    ) {
      console.error(
        "Intake coach email exception:",
        emailError,
      );

      await supabase
        .from(
          "booking_intake_forms",
        )
        .update({
          coach_email_sent_at:
            null,

          coach_email_error:
            emailError instanceof
            Error
              ? emailError.message
              : "Unknown email error",
        })
        .eq(
          "id",
          submittedForm.id,
        );
    }

    /* =====================================================
       SUCCESS
    ===================================================== */

    return NextResponse.json(
      {
        success:
          true,

        submittedAt:
          now,
      },
      {
        status:
          200,
      },
    );
  } catch (
    error
  ) {
    console.error(
      "Unexpected intake submit error:",
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
}