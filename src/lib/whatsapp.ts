const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

function normalizePhoneNumber(
  number: string,
) {
  return number.replace(/\D/g, "");
}

export function getQuoteWhatsAppUrl(
  serviceName: string,
) {
  const phone =
    normalizePhoneNumber(
      WHATSAPP_NUMBER,
    );

  const message = [
    "Hola, me interesa cotizar el servicio:",
    `"${serviceName}".`,
    "",
    "¿Podrías compartirme más información?",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(
    message,
  )}`;
}