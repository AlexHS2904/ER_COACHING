export function bookingConfirmationState(booking: {
  status: string; payment_status: string; payment_flow?: string | null;
  finalization_status?: string | null; expired_at?: string | null;
  payment_expires_at?: string | null;
}, intakeStatus?: "waiting" | "submitted" | "available" | "unavailable", serverNow = Date.now()) {
  if (booking.finalization_status === "review_required") return {
    title: "Estamos revisando tu pago", detail: "No realices otro pago. Nos comunicaremos contigo para resolver tu reserva.", refresh: false,
  };
  if (booking.status === "cancelled") return {
    title: booking.expired_at ? "El tiempo para completar el pago terminó" : "Reserva cancelada",
    detail: booking.expired_at ? "El tiempo para completar el pago terminó y el horario fue liberado." : "Selecciona un horario nuevamente. Si realizaste un pago, comunícate con Edna para revisarlo.", refresh: false,
  };
  if (booking.payment_status === "paid" && booking.payment_flow === "stripe") {
    if (booking.finalization_status !== "completed") return {
      title: "Pago confirmado",
      detail: booking.finalization_status === "retryable"
        ? "Tu pago está registrado. Estamos reintentando la preparación de tu sesión y formulario; no necesitas pagar nuevamente."
        : "Estamos preparando tu sesión y formulario…", refresh: true,
    };
    if (intakeStatus === "available") return {
      title: "Redirigiendo a tu formulario", detail: "Tu sesión está confirmada. En un momento podrás completar tu formulario previo.", refresh: false,
    };
    if (intakeStatus === "submitted") return {
      title: "Formulario completado", detail: "Tu sesión está confirmada y tus respuestas fueron enviadas. Revisa tu correo para consultar los detalles y el enlace de Meet.", refresh: false,
    };
    if (intakeStatus === "unavailable") return {
      title: "Reserva confirmada", detail: "Tu pago está registrado. El acceso al formulario necesita revisión; comunícate con Edna si necesitas ayuda.", refresh: false,
    };
    return { title: "Preparando tu formulario", detail: "Tu sesión está confirmada. Estamos verificando el acceso seguro a tu formulario.", refresh: true };
  }
  if (booking.status === "confirmed") return {
    title: "Reserva confirmada", detail: "Tu horario está reservado. Recibirás los detalles de tu sesión por correo electrónico.", refresh: false,
  };
  if (booking.payment_status === "paid") return {
    title: "Pago confirmado", detail: "Estamos preparando tu sesión y formulario…", refresh: true,
  };
  if (booking.payment_flow === "stripe" && booking.payment_expires_at &&
      Date.parse(booking.payment_expires_at) <= serverNow) return {
    title: "Estamos verificando tu reserva",
    detail: "El plazo de pago terminó. Estamos comprobando el estado final de tu reserva.", refresh: true,
  };
  return { title: "Pago pendiente", detail: "Tu horario está apartado temporalmente. Puedes reintentar el pago mientras siga vigente tu reserva temporal.", refresh: true };
}
