// The first integration intentionally supports the service's MXN currency only.
export function toStripeMinorUnits(value: string | number, currency: string) {
  if (currency.toLowerCase() !== "mxn") throw new Error("unsupported_currency");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error("invalid_amount");
  const minor = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor <= BigInt(0) || minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("invalid_amount");
  return Number(minor);
}
