import type { Metadata } from "next";
import Link from "next/link";

import { LEGAL_UPDATED_LABEL, PRIVACY_NOTICE_VERSION, legalRobotsMetadata } from "@/lib/legal/documents";
import { legalProvider } from "@/lib/legal/provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Aviso de privacidad | Edna Rojo Coaching",
  description: "Datos personales, finalidades y derechos de privacidad en Edna Rojo Coaching.",
  robots: legalRobotsMetadata,
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-20 text-brand-brown">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-brand-wine hover:underline">← Volver al inicio</Link>
        <h1 className="mt-10 font-display text-4xl sm:text-5xl">Aviso de privacidad integral</h1>
        <p className="mt-5 text-sm opacity-70">Última actualización: {LEGAL_UPDATED_LABEL}</p>
        <p className="mt-2 text-sm opacity-70">Versión: {PRIVACY_NOTICE_VERSION}</p>

        <div className="mt-10 space-y-9 leading-8">
          <section>
            <h2 className="text-xl font-semibold">1. Datos que tratamos</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Identificación y contacto: nombre, correo y teléfono cuando se proporciona; edad
                y ocupación en el formulario previo.</li>
              <li>Reservas y procesos: servicio, duración, número de sesiones, precio, moneda,
                fecha, horario, referencia, notas, cambios y estados de la reserva o proceso.</li>
              <li>Contacto: motivo de la consulta y contenido del mensaje.</li>
              <li>Pago: importe, moneda, estado e identificadores de las operaciones e intentos de
                pago. Los datos completos de tarjeta se introducen directamente en Stripe Checkout;
                ER Coaching no los recibe ni almacena en su plataforma.</li>
              <li>Formulario previo: situación actual, motivaciones, dificultades, objetivos, fortalezas,
                preocupaciones, acciones previas, preferencias de acompañamiento, notas, avance
                y estado de entrega del formulario.</li>
              <li>Reseñas: nombre de publicación, valoración, texto, avatar o fotografía opcional
                y autorización de publicación.</li>
              <li>Información técnica y de seguridad: IP, datos de solicitud y navegador,
                registros operativos, autenticación administrativa e identificadores de acceso.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Información que puede ser sensible</h2>
            <p className="mt-3">El formulario previo no solicita diagnósticos ni una historia clínica. Las
              preguntas sobre tu situación personal, emociones y preocupaciones, y sus campos
              abiertos, pueden permitir que compartas información íntima o relacionada con tu salud.
              Otras categorías sensibles solo podrían aparecer si las incluyes voluntariamente;
              no se solicitan, por ejemplo, creencias religiosas o preferencias sexuales.</p>
            <p className="mt-3">Comparte solo lo necesario para preparar el acompañamiento y evita
              datos sensibles de otras personas. El tratamiento de los datos sensibles que decidas
              proporcionar requiere consentimiento expreso separado de la contratación y de los
              testimonios. Al guardar tus respuestas, la fecha de tu consentimiento y la versión
              del Aviso se registran vinculadas al formulario para conservar constancia de tu decisión.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Finalidades necesarias</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Atender consultas y administrar reservas, horarios, sesiones y procesos.</li>
              <li>Procesar y conciliar pagos, comprobar su resultado y atender incidencias.</li>
              <li>Preparar la sesión mediante el formulario previo, guardar avances y permitir una entrega final.</li>
              <li>Crear y administrar los eventos de Calendar y enlaces de Meet de la sesión.</li>
              <li>Enviar confirmaciones, accesos, cambios y recordatorios del servicio. El recordatorio
                del formulario previo se dirige al formulario pendiente antes de la sesión.</li>
              <li>Gestionar solicitudes de cancelación y reprogramación por los canales de atención.</li>
              <li>Proteger accesos, prevenir abuso y fraude, investigar fallos y cumplir obligaciones
                contractuales o legales aplicables.</li>
            </ul>
            <p className="mt-3">Sin los datos necesarios, puede no ser posible atender la solicitud
              o prestar la parte del servicio que dependa de ellos.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Testimonios y usos opcionales</h2>
            <p className="mt-3">Publicar tu testimonio, nombre elegido y avatar o fotografía es
              opcional y requiere tu autorización específica. No condiciona el servicio. Puedes
              solicitar que se deje de mostrar por el canal de privacidad.</p>
            <p className="mt-3">La plataforma actual no tiene suscripción a newsletters ni marketing
              automatizado. Los correos de reserva, contacto y formulario se relacionan con tu
              solicitud o servicio.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Proveedores tecnológicos</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Supabase: almacena reservas, procesos, formularios y archivos, y autentica el acceso
                administrativo.</li>
              <li>Stripe: aloja Checkout y procesa información de las transacciones en el entorno
                de pago habilitado.</li>
              <li>Resend: entrega correos y recibe destinatarios y contenido. Los avisos a la coach
                pueden incluir información de la solicitud o respuestas del formulario previo.</li>
              <li>Google Calendar y Meet: agenda y videollamada. El evento incluye nombre, correo,
                servicio, referencia, horario y notas de reserva que se proporcionen. Las respuestas
                del formulario previo no se incorporan a Calendar. El cliente no se añade automáticamente
                como asistente al evento de la coach.</li>
              <li>Vercel: aloja el sitio, ejecuta funciones y presta controles de seguridad y abuso.
                Sus registros operativos pueden incluir rutas y parámetros de solicitudes; conserva
                confidenciales tus enlaces privados.</li>
            </ul>
            <p className="mt-3">Los proveedores que tratan datos por cuenta del responsable actúan
              como encargados en lo que corresponda; ese uso no equivale por sí mismo a vender datos.
              Si un proveedor determina finalidades propias para una operación, también resulta
              aplicable su aviso.</p>
            <p className="mt-3">Algunos proveedores pueden procesar o almacenar información fuera
              de México. Se limitará la información a la necesaria y se aplicarán las condiciones
              y salvaguardas correspondientes. Las transferencias que requieran consentimiento se
              informarán y someterán a autorización; podrán existir comunicaciones exigidas por ley
              o por una autoridad competente.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Cookies y almacenamiento local</h2>
            <p className="mt-3">Usamos cookies técnicas para coordinar reservas y autorizar el acceso
              a su pago o confirmación; cookies de sesión de Supabase para el área administrativa;
              y una cookie temporal de seguridad al conectar Google para la coach. Los proveedores
              pueden utilizar mecanismos propios al visitar sus servicios.</p>
            <p className="mt-3">El almacenamiento local conserva identificadores de flujo y reserva
              para recuperar la misma operación y coordinar pestañas. No sustituyen la credencial
              de la cookie. No se guardan allí respuestas del formulario previo ni datos completos de tarjeta.</p>
            <p className="mt-3">El sitio no integra cookies de publicidad, analytics comercial ni
              píxeles de seguimiento. Puedes borrar o bloquear cookies y almacenamiento desde tu
              navegador; algunas funciones de acceso o recuperación de reservas podrían dejar de
              estar disponibles.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Responsable y contacto</h2>
            <p className="mt-3">{legalProvider.legalName}, persona física que presta sus servicios
              bajo el nombre comercial {legalProvider.commercialName}, es la responsable del
              tratamiento de los datos personales descrito en este aviso.</p>
            <dl className="mt-3 space-y-2">
              <div><dt className="font-medium">Nombre o denominación del responsable</dt><dd>{legalProvider.legalName}</dd></div>
              <div><dt className="font-medium">Domicilio del responsable</dt><dd>{legalProvider.address}</dd></div>
              <div><dt className="font-medium">País</dt><dd>{legalProvider.country}</dd></div>
              <div><dt className="font-medium">Teléfono de atención</dt><dd>{legalProvider.phone}</dd></div>
            </dl>
            <p className="mt-3">El domicilio se proporciona para efectos legales y notificaciones;
              no es un establecimiento abierto para atención presencial al público.</p>
            <p className="mt-3">Correo público: <a href={`mailto:${legalProvider.publicContactEmail}`} className="text-brand-wine underline">{legalProvider.publicContactEmail}</a>.</p>
            <p className="mt-3">La responsable atiende por ese correo las solicitudes ARCO,
              revocación del consentimiento, limitación de uso o divulgación, reclamaciones y
              solicitudes de cancelación o reprogramación.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Derechos ARCO, revocación y limitación</h2>
            <p className="mt-3">Puedes solicitar acceso a tus datos, rectificarlos, pedir su cancelación
              u oponerte al tratamiento en los supuestos legales. También puedes revocar tu
              consentimiento o solicitar que se limite su uso o divulgación.</p>
            <p className="mt-3">Envía tu solicitud a:
              {" "}<a href={`mailto:${legalProvider.publicContactEmail}`} className="text-brand-wine underline">{legalProvider.publicContactEmail}</a>.
              Indica tu nombre, medio de respuesta, derecho o solicitud y la información para
              localizar tus datos. Para rectificación, señala la corrección y su sustento. Se indicará
              cómo acreditar tu identidad o representación antes de entregar datos o ejecutar cambios.</p>
            <p className="mt-3">Para solicitudes ARCO, la determinación se comunicará dentro del
              máximo legal de 20 días hábiles desde su recepción. Si procede, se hará efectiva en
              los 15 días hábiles siguientes a la comunicación. Los plazos pueden ampliarse una vez
              por un periodo igual cuando las circunstancias lo justifiquen, conforme a la ley.</p>
            <p className="mt-3">La revocación no tiene efectos retroactivos; determinadas obligaciones
              pueden exigir conservar información. Este procedimiento no limita tu acceso a la
              autoridad competente.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Conservación y seguridad</h2>
            <p className="mt-3">Los datos se conservan durante el tiempo necesario para el servicio,
              atención de solicitudes y obligaciones o responsabilidades legales y contractuales.
              Los datos sensibles se tratarán durante el mínimo indispensable.</p>
            <p className="mt-3">Se emplean conexiones seguras, autenticación, controles y restricciones
              de acceso a los datos y protección de credenciales y enlaces privados, mediante
              proveedores especializados. Ninguna medida elimina por completo los riesgos. No
              compartas los enlaces de tu formulario o proceso.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Cambios y marco aplicable</h2>
            <p className="mt-3">Las modificaciones se publicarán aquí con fecha y versión. Si un cambio
              requiere nueva autorización, se solicitará antes del tratamiento correspondiente.</p>
            <p className="mt-3">Este Aviso considera la <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf" className="text-brand-wine underline" target="_blank" rel="noopener noreferrer">Ley Federal de Protección de Datos Personales en Posesión de los Particulares</a>,
              publicada el 20 de marzo de 2025 y reformada el 14 de noviembre de 2025. Consulta también
              los <a href="/terminos-y-condiciones" className="text-brand-wine underline">Términos y Condiciones</a>.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
