import "server-only";

import ProcessAccessEmail from "@/emails/ProcessAccessEmail";

import {
  getResend,
} from "@/lib/email/resend";

type Input = {
  processId: string;

  customerName: string;
  customerEmail: string;

  serviceName: string;
  processReference: string;

  processAccessUrl: string;

  idempotencyKey: string;
};

export async function sendProcessAccessEmail(
  input: Input,
) {
  const resend =
    getResend();

  const from =
    process.env.RESEND_FROM_EMAIL;

  if (!from) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL",
    );
  }

  const result =
    await resend.emails.send(
      {
        from,

        to:
          input.customerEmail,

        subject:
          "Tu nuevo acceso · ER Coaching",

        react:
          ProcessAccessEmail({
            customerName:
              input.customerName,

            serviceName:
              input.serviceName,

            processReference:
              input.processReference,

            processAccessUrl:
              input.processAccessUrl,
          }),
      },
      {
        /*
          Cada token nuevo tiene una key distinta,
          así Resend no confunde una regeneración
          legítima con un reintento anterior.
        */
        idempotencyKey:
          input.idempotencyKey,
      },
    );

  return {
    id:
      result.data?.id ??
      null,

    error:
      result.error?.message ??
      null,
  };
}