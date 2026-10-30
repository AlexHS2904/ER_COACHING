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
import { googleErrorLogMetadata } from "@/lib/google/safe-error";
import { enforcePublicAbuse } from "@/lib/security/public-abuse";
import { PRIVACY_NOTICE_VERSION } from "@/lib/legal/documents";
import { hashIntakeToken } from "@/lib/intake/intake-access";

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

function hasSensitiveDataConsent(body: unknown): body is IntakeBody {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) &&
    (body as IntakeBody).sensitiveDataConsent === true &&
    (body as IntakeBody).privacyNoticeVersion === PRIVACY_NOTICE_VERSION);
}

function missingConsentResponse() {
  return NextResponse.json({
    error: "Debes aceptar el tratamiento de datos sensibles conforme al Aviso de Privacidad vigente antes de guardar o enviar el formulario.",
  }, { status: 400 });
}

function hasAdultAge(body: IntakeBody): boolean {
  return typeof body.age === "number" && Number.isInteger(body.age) && body.age >= 18 && body.age <= 120;
}

function invalidAgeResponse() {
  return NextResponse.json({ error: "Para continuar, confirma una edad válida de al menos 18 años." }, { status: 400 });
}

function intakeSaveRejection(result: { error_code?: string } | null) {
  const errors: Record<string, { status: number; error: string }> = {
    already_submitted: { status: 409, error: "Este formulario ya fue enviado." },
    expired: { status: 410, error: "Este enlace ha expirado." },
    inactive: { status: 410, error: "Este formulario ya no está disponible." },
    invalid_access: { status: 403, error: "No fue posible acceder al formulario." },
    booking_unavailable: { status: 403, error: "El formulario todavía no está disponible." },
  };
  if (result?.error_code === "consent_required") return missingConsentResponse();
  if (result?.error_code === "invalid_age") return invalidAgeResponse();
  if (!result?.error_code) return null;
  const failure = errors[result.error_code] ?? { status: 500, error: "No fue posible guardar el formulario." };
  return NextResponse.json({ error: failure.error }, { status: failure.status });
}

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

    const limited = await enforcePublicAbuse(request, "intake-draft", token);
    if (limited) return limited;

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
      await request.json();

    if (!hasSensitiveDataConsent(body)) return missingConsentResponse();
    if (!hasAdultAge(body)) return invalidAgeResponse();

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
      data: saved,
      error,
    } = await supabase
      .rpc("save_intake_with_legal_consent_v1", {
        p_form_id: access.result.form.id,
        p_access_token_hash: hashIntakeToken(token),
        p_answers: mapAnswers(body),
        p_current_step: currentStep,
        p_submit: false,
        p_privacy_notice_version: PRIVACY_NOTICE_VERSION,
        p_sensitive_data_consent: true,
      });

    if (error) {
      console.error(
        "Intake draft error:",
        googleErrorLogMetadata(error),
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

    const rejected = intakeSaveRejection(saved);
    if (rejected) return rejected;
    if (!saved?.form || saved.form.id !== access.result.form.id) {
      return NextResponse.json({ error: "No fue posible guardar tu progreso." }, { status: 500 });
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
      googleErrorLogMetadata(error),
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

    const limited = await enforcePublicAbuse(request, "intake-submit", token);
    if (limited) return limited;

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
      await request.json();

    if (!hasSensitiveDataConsent(body)) return missingConsentResponse();
    if (!hasAdultAge(body)) return invalidAgeResponse();

    const supabase =
      getSupabaseAdmin();

    /* =====================================================
       GUARDAR ENVÍO FINAL

       La RPC revalida token/reserva bajo locks y guarda respuestas,
       consentimiento y submitted_at juntos usando el reloj de la DB.
       Un fallo de RPC no tiene fallback de escritura sin evidencia.
    ===================================================== */

    const {
      data:
        saved,

      error:
        submitError,
    } = await supabase
      .rpc("save_intake_with_legal_consent_v1", {
        p_form_id: access.result.form.id,
        p_access_token_hash: hashIntakeToken(token),
        p_answers: mapAnswers(body),
        p_current_step: 5,
        p_submit: true,
        p_privacy_notice_version: PRIVACY_NOTICE_VERSION,
        p_sensitive_data_consent: true,
      });

    if (
      submitError
    ) {
      console.error(
        "Intake submit error:",
        googleErrorLogMetadata(submitError),
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

    const rejected = intakeSaveRejection(saved);
    if (rejected) return rejected;
    const submittedForm = saved?.form;

    if (
      !submittedForm || submittedForm.id !== access.result.form.id ||
      submittedForm.status !== "submitted" || typeof submittedForm.submitted_at !== "string" ||
      !Number.isFinite(Date.parse(submittedForm.submitted_at))
    ) {
      return NextResponse.json(
        {
          error:
            "No fue posible confirmar el envío del formulario.",
        },
        {
          status:
            500,
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
          googleErrorLogMetadata(emailResult.error),
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
        googleErrorLogMetadata(emailError),
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
          submittedForm.submitted_at,
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
      googleErrorLogMetadata(error),
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
