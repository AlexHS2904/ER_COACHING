import IntakeFormReadyEmail from "@/emails/IntakeFormReadyEmail";
import {
  getResend,
} from "@/lib/email/resend";

type Params = {
  formId: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  formUrl: string;
};

export async function sendIntakeFormReadyEmail({
  formId,
  customerName,
  customerEmail,
  serviceName,
  formUrl,
}: Params) {
  const from =
    process.env
      .RESEND_FROM_EMAIL;

  if (!from) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL",
    );
  }

  const resend =
    getResend();

  return resend
    .emails
    .send({
      from,

      to:
        customerEmail,

      subject:
        "Tu formulario previo · Edna Rojo Coaching",

      react:
        IntakeFormReadyEmail({
          customerName,
          serviceName,
          formUrl,
        }),
    }, {
      idempotencyKey: `intake-ready/${formId}`,
    });
}
