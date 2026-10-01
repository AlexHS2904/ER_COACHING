import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type AvailableSlot = {
  starts_at: string;
  ends_at: string;
  local_time: string;
};

export async function getAvailableSlots(
  serviceSlug: string,
  date: string,
): Promise<AvailableSlot[]> {
  const { data, error } = await supabaseAdmin.rpc(
    "get_available_slots",
    {
      p_service_slug: serviceSlug,
      p_date: date,
    },
  );

  if (error) {
    console.error("Error loading available slots:", error);

    throw new Error(
      "No fue posible obtener los horarios disponibles.",
    );
  }

  return data ?? [];
}