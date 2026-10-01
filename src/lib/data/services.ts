import { createClient } from "@/lib/supabase/server";

export type Service = {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string | null;

  service_type: "single" | "package" | "group";

  duration_minutes: number | null;
  session_count: number | null;

  price: number | null;
  currency: string;

  requires_quote: boolean;
  booking_enabled: boolean;

  active: boolean;
  display_order: number;
};

export async function getActiveServices(): Promise<Service[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select(`
      id,
      name,
      slug,
      short_description,
      description,
      service_type,
      duration_minutes,
      session_count,
      price,
      currency,
      requires_quote,
      booking_enabled,
      active,
      display_order
    `)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("Error loading services:", error);
    throw new Error("No fue posible cargar los servicios.");
  }

  return data ?? [];
}