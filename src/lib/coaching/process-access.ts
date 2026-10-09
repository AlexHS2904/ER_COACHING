import "server-only";

import {
  createHash,
  randomBytes,
} from "crypto";

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