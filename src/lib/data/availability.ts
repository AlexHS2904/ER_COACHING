import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AvailableSlot = {
  starts_at: string;
  ends_at: string;
  local_time: string;
};

export async function getAvailableSlots(
  serviceSlug: string,
  date: string,
): Promise<AvailableSlot[]> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.rpc(
    "get_available_slots",
    {
      p_service_slug: serviceSlug,
      p_date: date,
    },
  );

  if (error) {
    console.error(
      "Error loading available slots:",
      error,
    );

    throw new Error(
      "No fue posible obtener los horarios disponibles.",
    );
  }

  return data ?? [];
}

// Only called after active-admin authorization. The RPC rechecks that identity
// and service eligibility; a public slug never grants access to a private row.
export async function getAdminAvailableSlots(serviceSlug: string, date: string, adminUserId: string): Promise<AvailableSlot[]> {
  const db = getSupabaseAdmin();
  const service = await db.from("services").select("id").eq("slug", serviceSlug).maybeSingle();
  if (service.error) throw new Error("availability_unavailable");
  if (!service.data) return [];
  const result = await db.rpc("get_admin_available_slots_v1", {
    p_service_id: service.data.id, p_date: date, p_admin_user_id: adminUserId,
  });
  if (result.error) throw new Error("availability_unavailable");
  return result.data ?? [];
}
