export type BookableServicePayment = {
  price?: unknown;
  slug?: string | null;
  service_type?: string | null;
  session_count?: number | null;
};

/** Unknown or malformed prices fail closed; only an explicit zero is free. */
export function serviceRequiresPayment(price: unknown): boolean {
  if (typeof price === "number") return !Number.isFinite(price) || price !== 0;
  if (typeof price !== "string" || price.trim() === "") return true;

  const parsed = Number(price);
  return !Number.isFinite(parsed) || parsed !== 0;
}

/** Checkout is currently implemented only for the one-session 1:1 service. */
export function supportsPublicStripeCheckout(service: BookableServicePayment): boolean {
  return service.service_type === "single" &&
    service.slug === "sesion-1-1" &&
    service.session_count === 1;
}

export function canUsePublicStripeCheckout(
  service: BookableServicePayment,
  enabled: boolean,
): boolean {
  return enabled && supportsPublicStripeCheckout(service);
}
