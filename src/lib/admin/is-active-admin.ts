import "server-only";

import {
  createClient,
} from "@/lib/supabase/server";

export async function isActiveAdmin() {
  const supabase =
    await createClient();

  const {
    data:
      claimsData,
  } =
    await supabase
      .auth
      .getClaims();

  const userId =
    claimsData
      ?.claims
      ?.sub;

  if (!userId) {
    return false;
  }

  const {
    data:
      admin,
  } =
    await supabase
      .from(
        "admin_users",
      )
      .select(
        "active",
      )
      .eq(
        "user_id",
        userId,
      )
      .maybeSingle();

  return Boolean(
    admin?.active,
  );
}