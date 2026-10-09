import "server-only";

import ReviewInvitationEmail from "@/emails/ReviewInvitationEmail";

import {
  getResend,
} from "@/lib/email/resend";

type Input = {
  invitationId: string;

  customerName: string;
  customerEmail: string;

  serviceName: string;

  reviewUrl: string;
};

export async function sendReviewInvitationEmail(
  input: Input,
) {
  const resend =
    getResend();

  const from =
    process.env
      .RESEND_FROM_EMAIL;

  if (!from) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL",
    );
  }

  const result =
    await resend
      .emails
      .send(
        {
          from,

          to:
            input
              .customerEmail,

          subject:
            "Cuéntanos tu experiencia · ER Coaching",

          react: (
            <ReviewInvitationEmail
              customerName={
                input
                  .customerName
              }
              serviceName={
                input
                  .serviceName
              }
              reviewUrl={
                input
                  .reviewUrl
              }
            />
          ),
        },
        {
          idempotencyKey:
            `review-invitation/${input.invitationId}`,
        },
      );

  return {
    id:
      result
        .data
        ?.id ??
      null,

    error:
      result
        .error
        ?.message ??
      null,
  };
}