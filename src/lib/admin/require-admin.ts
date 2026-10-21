import "server-only";

import { redirect } from "next/navigation";

import { isActiveAdmin } from "@/lib/admin/is-active-admin";

/**
 * Llamar al inicio de CADA página de admin.
 *
 * El layout de (protected) también valida, pero en Next.js
 * el layout no se vuelve a ejecutar en cada navegación,
 * y estas páginas leen con la llave secreta (sin RLS).
 * Por eso cada página valida por sí misma.
 */
export async function requireAdmin() {
  const allowed =
    await isActiveAdmin();

  if (!allowed) {
    redirect("/admin/login");
  }
}
