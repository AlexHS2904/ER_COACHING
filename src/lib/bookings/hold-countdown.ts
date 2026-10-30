// Display only. The server's booking status is the sole expiration authority.
export function holdRemainingSeconds(deadline: string, serverNow: number, elapsedMs = 0) {
  const remaining = Date.parse(deadline) - serverNow - Math.max(0, elapsedMs);
  return Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / 1000)) : 0;
}

export function formatHoldRemaining(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
