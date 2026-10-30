import "server-only";

const transportCodes = new Set([
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
  "ERR_NETWORK", "ERR_BAD_REQUEST", "ERR_BAD_RESPONSE",
]);
const providerReasons = new Set([
  "invalid_grant", "invalid_client", "unauthorized_client", "access_denied",
  "authError", "insufficientPermissions", "forbidden", "notFound",
  "accessNotConfigured", "rateLimitExceeded", "userRateLimitExceeded",
  "quotaExceeded", "backendError", "invalidParameter", "invalid", "duplicate",
]);

// OAuth/Gaxios errors may contain credentials in config, headers and response
// bodies. Keep only bounded status numbers and known technical error codes.
export function googleErrorLogMetadata(error: unknown, options: { providerReason?: boolean } = {}) {
  const source = typeof error === "object" && error !== null
    ? error as Record<string, unknown> : {};
  const response = typeof source.response === "object" && source.response !== null
    ? source.response as Record<string, unknown> : {};
  const candidate = response.status ?? source.statusCode ?? source.status ?? source.code;
  const status = typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 100 && candidate <= 599
    ? candidate : null;
  const code = typeof source.code === "string" &&
    (/^[0-9A-Z]{5}$/.test(source.code) || transportCodes.has(source.code))
    ? source.code : null;
  if (!options.providerReason) return { status, code };
  const data = typeof response.data === "object" && response.data !== null
    ? response.data as Record<string, unknown> : {};
  const providerError = typeof data.error === "object" && data.error !== null
    ? data.error as Record<string, unknown> : {};
  const first = Array.isArray(providerError.errors) ? providerError.errors[0] : null;
  const candidateReason = typeof data.error === "string" ? data.error
    : first && typeof first === "object" ? first.reason : null;
  const reason = typeof candidateReason === "string" && providerReasons.has(candidateReason) ? candidateReason : null;
  return { status, code, reason };
}
