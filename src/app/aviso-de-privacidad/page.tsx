
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aviso de privacidad | Edna Rojo Coaching",
  description:
    "Información sobre el tratamiento de datos personales en Edna Rojo Coaching.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-20 text-brand-brown">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-brand-wine hover:underline"
        >
          ← Volver al inicio
        </Link>

        <h1 className="mt-10 font-display text-4xl sm:text-5xl">
          Aviso de privacidad
        </h1>

        <p className="mt-5 text-sm opacity-70">
          Última actualización: 21 de octubre de 2026
        </p>

        <div className="mt-10 space-y-9 leading-8">
          <section>
            <h2 className="text-xl font-semibold">
              Responsable del tratamiento
            </h2>
            <p className="mt-3">
              Edna Rojo Coaching es el nombre comercial
              del servicio de coaching ofrecido mediante
              este sitio web.
            </p>
            <p className="mt-3">
              Correo de contacto:
              {" "}
              <a
                href="mailto:ednarojo_coaching@outlook.com"
                className="text-brand-wine underline"
              >
                ednarojo_coaching@outlook.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Datos personales
            </h2>
            <p className="mt-3">
              Al utilizar nuestros formularios y servicios,
              podemos recopilar datos como nombre,
              correo electrónico, teléfono, información
              de reservaciones y respuestas proporcionadas
              voluntariamente en formularios.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Finalidades
            </h2>
            <p className="mt-3">
              Utilizamos la información para gestionar
              reservaciones, organizar sesiones,
              comunicarnos con los clientes y dar
              seguimiento a los servicios solicitados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Servicios tecnológicos
            </h2>
            <p className="mt-3">
              Podemos utilizar proveedores tecnológicos
              como Supabase para gestionar información,
              Resend para enviar notificaciones y Google
              Calendar y Google Meet para organizar
              reuniones.
            </p>
            <p className="mt-3">
              La integración autorizada de Google Calendar
              permite crear y administrar eventos,
              comprobar disponibilidad y generar enlaces
              de reunión relacionados con las reservas.
              El acceso se utiliza para prestar estas
              funciones, conforme a los permisos
              autorizados por la cuenta conectada.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Protección de la información
            </h2>
            <p className="mt-3">
              Aplicamos controles técnicos y de acceso
              orientados a proteger la información
              de usuarios y clientes frente a accesos
              no autorizados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Derechos sobre los datos
            </h2>
            <p className="mt-3">
              Puedes solicitar información sobre el
              tratamiento de tus datos personales,
              así como ejercer los derechos que te
              correspondan conforme a la legislación
              aplicable, escribiendo al correo de
              contacto indicado anteriormente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">
              Actualizaciones
            </h2>
            <p className="mt-3">
              Este aviso podrá actualizarse cuando cambien
              nuestras prácticas, servicios o requisitos
              legales. La versión vigente se publicará
              en esta página.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
