import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function authorizeAdminRequest() {
  const supabase = await createClient();

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const userId =
    claimsData?.claims?.sub;

  if (
    claimsError ||
    !userId
  ) {
    return {
      ok: false,
      status: 401,
      error: "No autorizado.",
    } as const;
  }

  const {
    data: admin,
    error: adminError,
  } = await supabase
    .from("admin_users")
    .select(`
      user_id,
      active
    `)
    .eq("user_id", userId)
    .maybeSingle();

  if (
    adminError ||
    !admin ||
    !admin.active
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "No tienes permisos para realizar esta acción.",
    } as const;
  }

  return {
    ok: true,
    userId,
  } as const;
}