import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isActiveAdmin,
} from "@/lib/admin/is-active-admin";

import {
  createReviewAccess,
} from "@/lib/reviews/review-access";

import {
  sendReviewInvitationEmail,
} from "@/lib/reviews/send-review-invitation-mail";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

type Body = {
  sourceType?: unknown;
  sourceId?: unknown;
};

export async function POST(
  request: NextRequest,
) {
  if (
    !(await isActiveAdmin())
  ) {
    return NextResponse.json(
      {
        error:
          "No autorizado.",
      },
      {
        status:
          401,
      },
    );
  }

  try {
    const body =
      (await request.json()) as Body;

    if (
      (
        body.sourceType !==
          "booking" &&
        body.sourceType !==
          "process"
      ) ||
      typeof body.sourceId !==
        "string"
    ) {
      return NextResponse.json(
        {
          error:
            "La solicitud no es válida.",
        },
        {
          status:
            400,
        },
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      token,
      tokenHash,
    } =
      createReviewAccess();

    const expiresAt =
      new Date(
        Date.now() +
          30 *
            24 *
            60 *
            60 *
            1000,
      ).toISOString();

    const {
      data,
      error,
    } =
      await supabase.rpc(
        "create_review_invitation",
        {
          p_access_token_hash:
            tokenHash,

          p_expires_at:
            expiresAt,

          p_booking_id:
            body.sourceType ===
            "booking"
              ? body.sourceId
              : null,

          p_process_id:
            body.sourceType ===
            "process"
              ? body.sourceId
              : null,
        },
      );

    if (
      error ||
      !data?.[0]
    ) {
      const message =
        error?.message ??
        "No fue posible crear la invitación.";

      const conflict =
        message.includes(
          "Ya existe",
        ) ||
        message.includes(
          "todavía no",
        ) ||
        message.includes(
          "proceso no generan",
        );

      return NextResponse.json(
        {
          error:
            message,
        },
        {
          status:
            conflict
              ? 409
              : 400,
        },
      );
    }

    const invitation =
      data[0];

    const reviewUrl =
      new URL(
        `/resena/${token}`,
        request
          .nextUrl
          .origin,
      ).toString();

    let emailSent =
      false;

    let emailError:
      | string
      | null = null;

    try {
      const email =
        await sendReviewInvitationEmail(
          {
            invitationId:
              invitation
                .invitation_id,

            customerName:
              invitation
                .customer_name,

            customerEmail:
              invitation
                .customer_email,

            serviceName:
              invitation
                .service_name_snapshot,

            reviewUrl,
          },
        );

      emailSent =
        Boolean(
          email.id,
        );

      emailError =
        email.error;
    } catch (
      error
    ) {
      emailError =
        error instanceof
          Error
          ? error.message
          : "No fue posible enviar el correo.";
    }

    /*
      Aunque Resend falle, la URL se entrega
      al admin para poder compartirla por
      WhatsApp u otro medio.
    */

    return NextResponse.json(
      {
        success:
          true,

        reviewUrl,

        expiresAt,

        emailSent,

        emailError,
      },
      {
        status:
          201,
      },
    );
  } catch (error) {
    console.error(
      "Review invitation error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible generar la invitación.",
      },
      {
        status:
          500,
      },
    );
  }
}