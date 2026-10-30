import "server-only";

const messages = {
  slot_conflict: "El horario acaba de ser reservado por otra persona. Selecciona otro.",
  hold_expired: "El tiempo para completar el pago expiró. Selecciona un horario nuevamente.",
  already_paid: "Tu pago ya está registrado. Consulta el estado de tu reserva.",
  review_required: "Estamos revisando tu pago. No necesitas realizar otro pago.",
  invalid_access: "No fue posible verificar el acceso a esta reserva.",
  checkout_in_progress: "Estamos preparando tu pago. Intenta recuperar el mismo Checkout en unos segundos.",
  flow_mismatch: "Los datos de este intento cambiaron. Recupera tu reserva original.",
  checkout_unavailable: "No fue posible recuperar el pago. Tu reserva conserva su plazo original.",
  service_unavailable: "El servicio seleccionado no está disponible para este pago.",
  invalid_request: "Revisa los datos de la reserva.",
  stripe_local_only: "Stripe solo está habilitado con configuración local de pruebas.",
} as const;

export class StripeBookingError extends Error {
  constructor(public code: keyof typeof messages) { super(messages[code]); }
}

export function rpcError(error: { message?: string } | null) {
  if (!error) return;
  const message = error.message ?? "";
  const code = Object.keys(messages).find((key) => message === key) as keyof typeof messages | undefined;
  if (code) throw new StripeBookingError(code);
  if (/ya no está disponible|acaba de ser reservado|exclusion/i.test(message)) {
    throw new StripeBookingError("slot_conflict");
  }
  throw new StripeBookingError("checkout_unavailable");
}

export function publicStripeError(error: unknown) {
  const code = error instanceof StripeBookingError ? error.code : "checkout_unavailable";
  return { code, error: messages[code] };
}
