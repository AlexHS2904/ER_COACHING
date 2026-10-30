import "server-only";
import { decryptIntakeToken } from "@/lib/intake/intake-token-crypto";
import { hashIntakeToken, isValidIntakeToken } from "@/lib/intake/intake-access";

// Recover the winning stored token. Never rotate it to repair corrupt access.
export function storedIntakeUrl(form: {
  access_token_hash: string | null; access_token_encrypted: string | null;
}, siteUrl: string) {
  if (!form.access_token_hash || !form.access_token_encrypted) throw new Error("intake_access_integrity");
  const token = decryptIntakeToken(form.access_token_encrypted);
  if (!isValidIntakeToken(token) || hashIntakeToken(token) !== form.access_token_hash) {
    throw new Error("intake_access_integrity");
  }
  return new URL(`/formulario/${token}`, siteUrl).toString();
}
