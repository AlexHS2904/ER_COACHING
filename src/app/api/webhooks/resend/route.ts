import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getResend } from "@/lib/email/resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const eventToStatus = {
  "email.sent": "sent",

  "email.delivered":
    "delivered",

  "email.delivery_delayed":
    "delivery_delayed",

  "email.bounced":
    "bounced",

  "email.failed":
    "failed",

  "email.suppressed":
    "suppressed",

  "email.complained":
    "complained",
} as const;

export async function POST(
  request: NextRequest,
) {
  const resend =
    getResend();

  const webhookSecret =
    process.env
      .RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return new NextResponse(
      "Missing webhook secret",
      {
        status: 500,
      },
    );
  }

  /* ===============================================
     RAW BODY
  ================================================ */

  const payload =
    await request.text();

  const id =
    request.headers.get(
      "svix-id",
    );

  const timestamp =
    request.headers.get(
      "svix-timestamp",
    );

  const signature =
    request.headers.get(
      "svix-signature",
    );

  if (
    !id ||
    !timestamp ||
    !signature
  ) {
    return new NextResponse(
      "Missing webhook headers",
      {
        status: 400,
      },
    );
  }

  let event;

  try {
    event =
      resend.webhooks.verify({
        payload,

        headers: {
          id,
          timestamp,
          signature,
        },

        webhookSecret,
      });
  } catch (error) {
    console.error(
      "Invalid Resend webhook:",
      error,
    );

    return new NextResponse(
      "Invalid webhook",
      {
        status: 400,
      },
    );
  }

  const status =
    eventToStatus[
      event.type as keyof typeof eventToStatus
    ];

  if (!status) {
    return NextResponse.json({
      received: true,
    });
  }

  const data =
    event.data as {
      email_id?: string;

      bounce?: {
        message?: string;
      };
    };

  const emailId =
    data.email_id;

  if (!emailId) {
    return NextResponse.json({
      received: true,
    });
  }

  const supabase =
    getSupabaseAdmin();

  const {
    data: booking,
    error,
  } = await supabase
    .from("bookings")
    .select(
      `
        id,
        customer_email_id,
        coach_email_id
      `,
    )
    .or(
      `customer_email_id.eq.${emailId},coach_email_id.eq.${emailId}`,
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Webhook booking lookup error:",
      error,
    );

    return new NextResponse(
      "Database error",
      {
        status: 500,
      },
    );
  }

  if (!booking) {
    return NextResponse.json({
      received: true,
    });
  }

  const now =
    new Date().toISOString();

  const errorMessage =
    data.bounce?.message ??
    null;

  if (
    booking.customer_email_id ===
    emailId
  ) {
    await supabase
      .from("bookings")
      .update({
        customer_email_status:
          status,

        customer_email_status_at:
          now,

        customer_email_error:
          errorMessage,
      })
      .eq(
        "id",
        booking.id,
      );
  }

  if (
    booking.coach_email_id ===
    emailId
  ) {
    await supabase
      .from("bookings")
      .update({
        coach_email_status:
          status,

        coach_email_status_at:
          now,

        coach_email_error:
          errorMessage,
      })
      .eq(
        "id",
        booking.id,
      );
  }

  return NextResponse.json({
    received: true,
  });
}