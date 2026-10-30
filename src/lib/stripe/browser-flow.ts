"use client";

// These UUIDs coordinate tabs. Neither a flow ID nor a booking ID authorizes
// anything: only the server-issued HttpOnly cookie can authenticate a request.
const prefix = "edna-booking-flow/v2/";
const isId = (value: string | null): value is string =>
  !!value && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export async function getBookingFlowId(payload: object) {
  // Purge credentials from the previous implementation, without reading them.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("edna-booking-flow/") && !key.startsWith(prefix)) localStorage.removeItem(key);
  }
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  const key = `${prefix}request/${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const get = () => {
    const existing = localStorage.getItem(key);
    if (isId(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  };
  return navigator.locks ? navigator.locks.request(key, get) : get();
}

export async function withBookingFlowLock<T>(flowId: string, work: () => Promise<T>): Promise<T> {
  return navigator.locks ? await navigator.locks.request(`${prefix}${flowId}`, work) : await work();
}

export function getBookingForFlow(flowId: string) {
  const id = localStorage.getItem(`${prefix}booking/${flowId}`);
  return isId(id) ? id : null;
}

export function rememberBookingForFlow(flowId: string, bookingId: string) {
  if (isId(flowId) && isId(bookingId)) localStorage.setItem(`${prefix}booking/${flowId}`, bookingId);
}
