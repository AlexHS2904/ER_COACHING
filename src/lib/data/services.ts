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
  published: boolean;
  requires_intake: boolean;
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
      published,
      requires_intake,
      display_order
    `)
    .eq("active", true)
    .eq("published", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("Error loading services:", error);
    throw new Error("No fue posible cargar los servicios.");
  }

  return (data ?? []).filter((service) =>
    service.active === true && service.published === true &&
    typeof service.requires_intake === "boolean",
  );
}