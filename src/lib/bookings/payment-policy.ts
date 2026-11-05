export type BookableServicePayment = {
  price?: unknown;
  slug?: string | null;
  service_type?: string | null;
  session_count?: number | null;
  requires_quote?: boolean | null;
};

/** Unknown or malformed prices fail closed; only an explicit zero is free. */
export function serviceRequiresPayment(price: unknown): boolean {
  if (typeof price === "number") return !Number.isFinite(price) || price !== 0;
  if (typeof price !== "string" || price.trim() === "") return true;

  const parsed = Number(price);
  return !Number.isFinite(parsed) || parsed !== 0;
}

/** Quoted services never enter the payment flow. Prices remain server data. */
export function supportsPublicStripeCheckout(service: BookableServicePayment): boolean {
  if (service.requires_quote === true) return false;
  return (service.service_type === "single" &&
    service.session_count === 1) || (service.service_type === "package" && service.session_count === 6);
}

export function canUsePublicStripeCheckout(
  service: BookableServicePayment,
  enabled: boolean,
): boolean {
  const price = String(service.price ?? "");
  return enabled && /^\d+(?:\.\d{1,2})?$/.test(price) && Number.isFinite(Number(price)) && Number(price) > 0 &&
    supportsPublicStripeCheckout(service);
}
