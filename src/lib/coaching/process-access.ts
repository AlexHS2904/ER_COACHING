import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { decryptIntakeToken, encryptIntakeToken } from "@/lib/intake/intake-token-crypto";

/**
 * Genera el token secreto que recibirá el cliente.
 *
 * Ejemplo:
 * /proceso/8f3c0d...
 */
export function generateProcessAccessToken() {
  return randomBytes(32).toString("hex");
}

/**
 * Genera el SHA-256 que sí guardaremos
 * dentro de Supabase.
 */
export function hashProcessAccessToken(
  token: string,
) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

/**
 * Genera ambas versiones.
 *
 * token:
 *   Se entrega al cliente.
 *
 * tokenHash:
 *   Se almacena en coaching_processes.
 */
export function createProcessAccess() {
  const token =
    generateProcessAccessToken();

  const tokenHash =
    hashProcessAccessToken(
      token,
    );

  return {
    token,
    tokenHash,
  };
}

/** Durable recovery uses the existing authenticated token encryption, never a new key. */
export function createDurableProcessAccess() {
  const access = createProcessAccess();
  return { ...access, tokenEncrypted: encryptIntakeToken(access.token) };
}

export function recoverProcessAccessToken(process: {
  access_token_hash: string | null;
  access_token_encrypted: string | null;
}) {
  if (!process.access_token_hash || !/^[a-f0-9]{64}$/.test(process.access_token_hash) ||
      !process.access_token_encrypted) throw new Error("process_access_unavailable");
  const token = decryptIntakeToken(process.access_token_encrypted);
  if (!/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(
    Buffer.from(hashProcessAccessToken(token), "hex"), Buffer.from(process.access_token_hash, "hex"),
  )) throw new Error("process_access_unavailable");
  return token;
}

export function recoverProcessAccessUrl(process: Parameters<typeof recoverProcessAccessToken>[0], siteUrl: string) {
  const site = new URL(siteUrl);
  if (!["http:", "https:"].includes(site.protocol) || site.username || site.password) {
    throw new Error("process_access_unavailable");
  }
  return new URL(`/proceso/${recoverProcessAccessToken(process)}`, site.origin).toString();
}

/** The same private-process request always obtains the same booking credential.
 * The browser nonce is not authorization: possession of the process secret and
 * the RPC's verified purchase/entitlement checks remain mandatory.
 */
export function processSessionBookingAccess(processToken: string, requestId: string) {
  if (!/^[a-f0-9]{64}$/.test(processToken) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) {
    throw new Error("invalid_process_session_request");
  }
  return createHmac("sha256", Buffer.from(processToken, "hex"))
    .update(`process-session-booking/v1/${requestId.toLowerCase()}`).digest("hex");
}
