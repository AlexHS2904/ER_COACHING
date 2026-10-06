import ResourcesManager, {
  type AdminResource,
} from "@/components/admin/ResourcesManager";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export default async function AdminResourcesPage() {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
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

      storage_path,
      original_filename,
      mime_type,
      file_size,

      cover_storage_path,
      cover_original_filename,
      cover_mime_type,

      visibility,
      active,
      display_order,

      created_at,
      updated_at
    `)
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
      "Admin resources error:",
      error,
    );
  }

  const resources:
    AdminResource[] =
    (data ?? []).map(
      (resource) => ({
        id:
          resource.id,

        title:
          resource.title,

        description:
          resource.description,

        category:
          resource.category,

        resource_type:
          resource.resource_type as
            | "file"
            | "link",

        external_url:
          resource.external_url,

        storage_path:
          resource.storage_path,

        original_filename:
          resource.original_filename,

        mime_type:
          resource.mime_type,

        file_size:
          resource.file_size ===
          null
            ? null
            : Number(
                resource.file_size,
              ),

        cover_storage_path:
          resource.cover_storage_path,

        cover_original_filename:
          resource.cover_original_filename,

        cover_mime_type:
          resource.cover_mime_type,

        visibility:
          resource.visibility as
            | "public"
            | "private",

        active:
          resource.active,

        display_order:
          resource.display_order,

        created_at:
          resource.created_at,

        updated_at:
          resource.updated_at,
      }),
    );

  return (
    <main
      className="
        px-5
        py-8
        sm:px-8
        lg:px-10
        xl:px-12
      "
    >
      <div className="mx-auto max-w-[1150px]">
        <header>
          <p
            className="
              text-sm
              text-brand-brown/45
            "
          >
            Administración
          </p>

          <h1
            className="
              mt-2
              font-display
              text-5xl
              font-semibold
              text-brand-brown
              sm:text-6xl
            "
          >
            Recursos
          </h1>

          <p
            className="
              mt-5
              max-w-2xl
              text-base
              leading-7
              text-brand-brown/55
            "
          >
            Publica guías,
            documentos, libros,
            ejercicios o enlaces
            para acompañar a tus
            clientes.
          </p>
        </header>

        <section className="mt-10">
          {error ? (
            <div
              className="
                rounded-[1.75rem]
                bg-[#F7E8E8]
                p-6
                text-[#8A3535]
              "
            >
              No fue posible cargar los
              recursos.
            </div>
          ) : (
            <ResourcesManager
              initialResources={
                resources
              }
            />
          )}
        </section>
      </div>
    </main>
  );
}