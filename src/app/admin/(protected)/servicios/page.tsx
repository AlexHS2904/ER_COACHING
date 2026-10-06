import ServicesManager, {
  type AdminService,
} from "@/components/admin/ServicesManager";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

export default async function AdminServicesPage() {
  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
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
    .order(
      "display_order",
      {
        ascending: true,
      },
    );

  if (error) {
    console.error(
      "Admin services error:",
      error,
    );
  }

  const services:
    AdminService[] =
    (data ?? []).map(
      (service) => ({
        id:
          service.id,

        name:
          service.name,

        slug:
          service.slug,

        short_description:
          service.short_description,

        description:
          service.description,

        service_type:
          service.service_type as
            | "single"
            | "package"
            | "group",

        duration_minutes:
          service.duration_minutes,

        session_count:
          service.session_count,

        price:
          service.price ===
          null
            ? null
            : Number(
                service.price,
              ),

        currency:
          service.currency,

        requires_quote:
          service.requires_quote,

        booking_enabled:
          service.booking_enabled,

        active:
          service.active,

        display_order:
          service.display_order,
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
      <div className="mx-auto max-w-[1100px]">
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
            Servicios
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
            Edita precios,
            duración, número de
            sesiones y disponibilidad
            de los servicios ofrecidos
            a tus clientes.
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
              <p className="font-semibold">
                No fue posible cargar
                los servicios.
              </p>

              <p className="mt-2 text-sm">
                Inténtalo nuevamente.
              </p>
            </div>
          ) : (
            <ServicesManager
              initialServices={
                services
              }
            />
          )}
        </section>
      </div>
    </main>
  );
}