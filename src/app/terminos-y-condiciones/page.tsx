import type { Metadata } from "next";
import Link from "next/link";

import { LEGAL_TERMS_VERSION, LEGAL_UPDATED_LABEL, legalRobotsMetadata } from "@/lib/legal/documents";
import { legalProvider } from "@/lib/legal/provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Términos y condiciones | Edna Rojo Coaching",
  description: "Condiciones de uso, reserva y contratación de sesiones y procesos de coaching.",
  robots: legalRobotsMetadata,
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-20 text-brand-brown">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-brand-wine hover:underline">← Volver al inicio</Link>
        <h1 className="mt-10 font-display text-4xl sm:text-5xl">Términos y condiciones</h1>
        <p className="mt-5 text-sm opacity-70">Última actualización: {LEGAL_UPDATED_LABEL}</p>
        <p className="mt-2 text-sm opacity-70">Versión: {LEGAL_TERMS_VERSION}</p>

        <div className="mt-10 space-y-9 leading-8">
          <section>
            <h2 className="text-xl font-semibold">1. Proveedor y contacto</h2>
            <p className="mt-3">{legalProvider.legalName}, persona física, presta los servicios
              descritos en este sitio bajo el nombre comercial {legalProvider.commercialName}.</p>
            <dl className="mt-3 space-y-2">
              <div><dt className="font-medium">Nombre o denominación del proveedor</dt><dd>{legalProvider.legalName}</dd></div>
              <div><dt className="font-medium">Teléfono de atención y reclamaciones</dt><dd>{legalProvider.phone}</dd></div>
            </dl>
            <p className="mt-3">Correo público: <a href={`mailto:${legalProvider.publicContactEmail}`} className="text-brand-wine underline">{legalProvider.publicContactEmail}</a>.
              La prestadora atiende por ese medio consultas, aclaraciones, reclamaciones y
              solicitudes de cancelación o reprogramación, así como solicitudes de privacidad.
              Este canal no limita otros medios ni derechos legales.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Objeto y naturaleza del servicio</h2>
            <p className="mt-3">El sitio permite conocer los servicios, consultar disponibilidad,
              solicitar reservas y, donde esté habilitado, contratar sesiones o procesos de coaching
              y acceder a sus materiales.</p>
            <p className="mt-3">El coaching acompaña la reflexión, definición de objetivos, decisiones
              y acciones. No constituye psicoterapia, atención médica ni psiquiátrica; no sustituye
              servicios profesionales de salud cuando sean necesarios, no realiza diagnóstico
              clínico ni tratamiento médico y no es un servicio de emergencia.
              No se prometen resultados personales o profesionales específicos.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Elegibilidad</h2>
            <p className="mt-3">La contratación está dirigida a personas de 18 años o más con
              capacidad legal para contratar. Proporciona datos correctos y utiliza de forma
              personal tus medios de acceso.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Servicios, precios y procesos</h2>
            <p className="mt-3">La ficha y el resumen de reserva presentan el servicio, duración,
              modalidad, número de sesiones cuando corresponda, fecha, horario, precio y moneda.
              El importe total aplicable debe conocerse antes de aceptar la contratación o pagar.
              Los servicios sujetos a cotización requieren una propuesta previa.</p>
            <p className="mt-3">Los pagos en línea habilitados para la sesión individual se expresan
              en pesos mexicanos (MXN). Los paquetes y procesos conservan sus condiciones particulares
              y su acceso para programar sesiones. No se presupone que compartan el flujo de pago de
              la sesión individual. Cada sesión se programa según disponibilidad y se sujeta a la
              política de cambios con 24 horas de anticipación descrita a continuación.</p>
            <p className="mt-3">Los paquetes o procesos no generan un reembolso parcial por su
              cancelación voluntaria o por sesiones que decidas no utilizar, salvo los derechos
              obligatorios que correspondan. Esta regla no permite retener importes de un servicio
              no prestado por una causa atribuible a ER Coaching.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Reservas y plazo de pago</h2>
            <p className="mt-3">Las reservas dependen de la disponibilidad real. En el flujo de
              Checkout para la sesión individual elegible, proceder al pago crea una retención
              provisional del horario durante 30 minutos. El contador usa el vencimiento original;
              actualizar la página o reintentar no reinicia ese plazo.</p>
            <p className="mt-3">La retención no equivale a pago ni a confirmación definitiva. Salir
              de Checkout permite volver a la misma reserva mientras siga vigente. Si no se verifica
              el pago dentro del plazo, el horario se libera conforme a la conciliación del servicio.</p>
            <p className="mt-3">La confirmación del flujo pagado depende de verificar el pago y
              preparar la sesión, no de la pantalla de retorno del navegador. Conserva la referencia
              para comunicarte con la coach; por sí sola no autoriza acceso a información privada.
              Las modalidades fuera de Checkout siguen el flujo indicado para su servicio.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Pago en línea y entorno de prueba</h2>
            <p className="mt-3">Cuando se habilita el pago en línea, Stripe aloja Checkout y procesa
              directamente los datos de tarjeta. ER Coaching conserva la información necesaria para
              identificar y conciliar la operación, sin almacenar los datos completos de tarjeta.
              El flujo es de pago único; no crea suscripciones ni cobros recurrentes.</p>
            <p className="mt-3">La integración actualmente revisada utiliza Stripe Test Mode; sus
              operaciones de prueba no constituyen cobros reales. Para una contratación real
              deberá identificarse previamente el medio
              de pago habilitado y sus condiciones.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Cancelación, reprogramación y reembolsos</h2>
            <p className="mt-3">Puedes comunicar una solicitud por el contacto publicado, indicando
              tu referencia y el cambio solicitado, sin incluir datos completos de tarjeta ni enlaces
              privados. Solicitar un cambio no implica por sí mismo su aprobación o un reembolso;
              la respuesta debe respetar tus derechos legales.</p>
            <p className="mt-3">Actualmente no hay autoservicio de cancelación o reprogramación ni
              reembolso automático. La gestión administrativa de reservas Stripe aún no está habilitada
              en esta fase. Esa limitación técnica no elimina derechos del consumidor ni autoriza a
              retener un pago contrario a la ley.</p>
            <p className="mt-3">Si solicitas reprogramar con al menos 24 horas de anticipación al
              inicio de la sesión, el cambio no tiene costo y queda sujeto a disponibilidad. Envía
              la solicitud al correo de atención e indica tu referencia y el horario de la sesión.</p>
            <p className="mt-3">La cancelación definitiva voluntaria no genera un reembolso
              comercial, salvo los derechos irrenunciables de revocación, devolución o cualquier
              otro que resulte obligatorio conforme a la ley. No se excluyen reclamaciones por
              incumplimiento o por servicios no prestados.</p>
            <p className="mt-3">Si solicitas cancelar o reprogramar con menos de 24 horas de
              anticipación, la sesión puede considerarse utilizada y no hay derecho automático a
              reprogramarla sin costo. La coach valorará de forma razonada las situaciones
              excepcionales, incluidos caso fortuito o fuerza mayor, sin limitar derechos legales.</p>
            <p className="mt-3">Si ER Coaching cancela, ofrecerá reprogramación sin costo. Si no
              es posible acordar una alternativa razonable aceptada por ti, se reembolsará el
              importe correspondiente al servicio no prestado; no se retendrá ese importe por la
              sola cancelación de la prestadora.</p>
            <p className="mt-3">Se preservan los derechos aplicables a la contratación a distancia.
              Cuando proceda el artículo 56 de la Ley Federal de Protección al Consumidor, su régimen
              permite revocar el consentimiento en cinco días hábiles en los términos de ese artículo.
              Para servicios, contempla la excepción cuando su prestación se encuentre a diez días
              hábiles o menos de la orden de compra. Su aplicación debe evaluarse para la operación
              concreta; la excepción no elimina otros derechos legales.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Asistencia e inasistencias</h2>
            <p className="mt-3">La sesión se prepara para el horario confirmado. Si no asistes,
              puede considerarse utilizada. Se valorarán de forma razonada las circunstancias
              excepcionales, incluidos caso fortuito o fuerza mayor, con respeto a los derechos
              obligatorios aplicables.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Calendar, Meet e Intake</h2>
            <p className="mt-3">El correo principal de confirmación entrega los datos de la sesión
              y su enlace de Meet. El evento se crea en el calendario de la coach sin añadir al cliente
              como asistente ni enviar una invitación automática de Google. “Agregar a Google Calendar”
              permite guardar voluntariamente los datos en tu calendario.</p>
            <p className="mt-3">El Intake prepara la sesión mediante un enlace privado. Mientras esté
              activo puedes guardar avances y realizar una sola entrega final. Sus datos y cualquier
              consentimiento sensible separado se rigen por el <a href="/aviso-de-privacidad" className="text-brand-wine underline">Aviso de Privacidad</a>.
              Si sigue pendiente, puede enviarse un recordatorio antes de la sesión; no es una newsletter.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Materiales y testimonios</h2>
            <p className="mt-3">Los textos, diseño y materiales propios se protegen conforme a sus
              derechos aplicables. Acceder a un recurso no concede autorización general para
              redistribuirlo, revenderlo o presentarlo como propio. Se respetan las licencias y derechos
              de materiales de terceros y los usos permitidos por ley.</p>
            <p className="mt-3">La publicación de testimonios y de la identidad o fotografía elegida
              requiere autorización específica y no es condición para recibir el servicio.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">11. Disponibilidad y responsabilidad</h2>
            <p className="mt-3">Pueden ocurrir interrupciones de conectividad, mantenimiento o fallos
              de proveedores. Las incidencias se atenderán por los canales publicados y conforme
              a las obligaciones aplicables. Esto no excluye la responsabilidad legal ni permite
              desconocer una contratación o pago.</p>
            <p className="mt-3">Tu participación y circunstancias influyen en el coaching. No se
              garantizan resultados específicos, sin limitar tu derecho a recibir el servicio ofrecido
              o reclamar un incumplimiento.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Identificación y domicilio para reclamaciones</h2>
            <p className="mt-3">Domicilio del proveedor: {legalProvider.address}</p>
            <p className="mt-3">El domicilio se proporciona para efectos legales, notificaciones,
              aclaraciones y reclamaciones; no constituye un establecimiento abierto para atención
              presencial al público. Puedes utilizarlo para las comunicaciones legales que correspondan,
              sin limitar los demás medios ni tus derechos de reclamación.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">12. Aceptación, cambios y legislación</h2>
            <p className="mt-3">Antes de continuar una reserva se presentan estos términos y el
              Aviso de Privacidad para su consulta y aceptación correspondiente. No sustituye el
              consentimiento expreso separado del Intake ni la autorización de testimonios.</p>
            <p className="mt-3">Las actualizaciones se publicarán aquí con fecha y versión. No
              alterarán retroactivamente las condiciones de una contratación realizada sin el acuerdo
              o fundamento legal que corresponda.</p>
            <p className="mt-3">Es aplicable la legislación mexicana, incluida la <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf" className="text-brand-wine underline" target="_blank" rel="noopener noreferrer">Ley Federal de Protección al Consumidor</a>,
              reformada el 12 de diciembre de 2025. Estos términos no implican renuncia a derechos
              irrenunciables ni impiden acudir a PROFECO u otras autoridades competentes.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
