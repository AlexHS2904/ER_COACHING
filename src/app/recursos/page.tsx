import Header from "@/components/publico/Header";
import Footer from "@/components/publico/Footer";

import ResourcesCatalog from "@/components/publico/recursos/ResourcesCatalog";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export default async function RecursosPage() {
  const supabase =
    getSupabaseAdmin();

  const {
    data: resources,
    error,
  } = await supabase
    .from("resources")
    .select(`
      id,
      title,
      description,
      category,
      resource_type,
      external_url,
      mime_type,
      visibility,
      active,
      display_order,
      cover_storage_path
    `)
    .eq(
      "visibility",
      "public",
    )
    .eq(
      "active",
      true,
    )
    .order(
      "display_order",
      {
        ascending: true,
      },
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    );

  if (error) {
    console.error(
      "Public resources error:",
      error,
    );
  }

  return (
    <>
      <Header />

      <main className="min-h-screen">
        <ResourcesCatalog
          resources={
            resources ?? []
          }
        />
      </main>

      <Footer />
    </>
  );
}