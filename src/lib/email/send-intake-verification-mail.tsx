import {
  getResend,
} from "@/lib/email/resend";

import IntakeVerificationEmail from "@/emails/IntakeVerificationEmail";

type Params = {
  name: string;
  email: string;
  code: string;
};

export async function sendIntakeVerificationEmail({
  name,
  email,
  code,
}: Params) {
  const from =
    process.env
      .RESEND_FROM_EMAIL;

  if (!from) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL",
    );
  }

  return getResend()
    .emails
    .send({
      from,

      to:
        email,

      subject:
        "Código de acceso · Edna Rojo Coaching",

      react:
        IntakeVerificationEmail({
          name,
          code,
        }),
    });
}