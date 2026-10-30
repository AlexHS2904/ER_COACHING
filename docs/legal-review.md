# Revisión legal local — cierre del 30 de octubre de 2026

Estado: **READY FOR PRODUCTION desde el punto de vista del código legal**.
Única dependencia operativa previa al deploy: aplicar y verificar la migración
`20261029204535_legal_consent_evidence.sql` de forma explícita y autorizada.
No es una certificación de cumplimiento integral ni una autorización de deploy.
No hubo cambios remotos, dependencias nuevas ni modificación de migraciones aplicadas.

## Alcance y fuentes verificadas

Se reutilizan las rutas existentes, su diseño y sus enlaces del footer.
Se contrastó el funcionamiento actual con fuentes oficiales:

- [LFPDPPP](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf): nueva ley
  publicada el 20-03-2025, reforma 14-11-2025; consentimiento sensible, aviso,
  proporcionalidad y ARCO. Art. 31: respuesta en 20 días hábiles y efectividad
  en los 15 siguientes cuando proceda; ampliación justificada prevista por ley.
- [LFPC](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf), reforma
  12-12-2025: información previa y contratación electrónica (76 Bis/76 Bis 1),
  términos uniformes (85 y siguientes), cláusulas inválidas (90). La aplicación
  concreta de revocación del art. 56 y su excepción para servicios próximos
  requiere revisión. La política comercial de 24 horas fue confirmada por la
  responsable en la segunda pasada; no se presenta como un plazo impuesto por ley.
- [NMX-COE-001-SCFI-2018, estado vigente confirmado por Economía](https://platiica.economia.gob.mx/normalizacion/nmx-coe-001-scfi-2018/):
  referencia para identificación, información, aceptación y comprobación. No se
  atribuye certificación ni registro PROFECO; no se considera un proyecto de norma.
- [Código de Comercio](https://www.diputados.gob.mx/LeyesBiblio/pdf/CCom.pdf),
  arts. 49 y 89–93 Bis: atribución, integridad, consulta y conservación de mensajes.
  Si resulta aplicable al proveedor como comerciante, el art. 49 exige conservar
  documentos contractuales al menos diez años. No extender ese plazo a todas
  las respuestas sensibles del Intake; separar categorías y bases de conservación.
- [NOM-151-SCFI-2016](https://sidof.segob.gob.mx/notas/docFuente/5478024):
  evaluar conservación formal conforme al art. 49 cuando corresponda. No se
  integró un certificador ni se afirma que un timestamp/checkbox cumpla por sí
  solo esa norma. No asumir que siempre es opcional ni prometer certificación.

## Identificación y decisiones confirmadas

`src/lib/legal/provider.ts` centraliza nombre legal, domicilio, correo y teléfono
confirmados por la responsable, sin valores inventados. Solo las dos páginas legales deben importar ese módulo
server-only; nunca metadata, emails, footer, JSON-LD, Maps o cliente.
La responsable confirmó su nombre completo, personalidad como persona física,
nombre comercial ER Coaching y domicilio postal. El literal del domicilio se
conserva exclusivamente en ese módulo; las páginas lo muestran como texto normal,
sin referencias residenciales adicionales. Se aclara que es un domicilio para
efectos legales y notificaciones, no un establecimiento abierto al público.
En Términos se ubica en el último tercio del documento.

El correo público existente quedó confirmado para ARCO, revocación, limitación
de uso/divulgación, aclaraciones, reclamaciones, cancelación y reprogramación.
La contratación se limita a personas de 18 años o más. No se inventó un régimen
de atención a menores. El teléfono oficial está centralizado en el módulo legal,
sin duplicar su literal en reportes o componentes. No se publica ni se considera
pendiente el RFC para esta implementación. No se buscó ni incorporó ese dato.
No quedan marcadores legales visibles por datos de identificación o políticas
confirmadas. No se afirma certificación ni registro PROFECO.


Política comercial confirmada por la responsable e incorporada a los documentos:

- Reprogramar con al menos 24 horas de anticipación no tiene costo, sujeto a
  disponibilidad; la solicitud se comunica al correo de atención.
- La cancelación definitiva voluntaria no genera reembolso comercial, salvo los
  derechos obligatorios aplicables. No se excluyen revocación legal, incumplimiento
  ni reclamaciones por servicios no prestados.
- Con menos de 24 horas, la sesión puede considerarse utilizada y no hay
  reprogramación gratuita automática. Caso fortuito, fuerza mayor y otras
  circunstancias excepcionales reciben una valoración razonada.
- La inasistencia puede considerarse sesión utilizada, con las mismas salvedades.
  No se inventó tolerancia de retraso en minutos.
- Si ER Coaching cancela, reprograma sin costo. Si no puede acordarse una
  alternativa razonable aceptada por el cliente, devuelve el importe del servicio
  no prestado; no puede retenerlo por la sola cancelación de la prestadora.
- Paquetes/procesos: programación según disponibilidad, regla de 24 horas por
  sesión y sin reembolso parcial por cancelación voluntaria o sesiones no usadas,
  salvo derechos obligatorios. No se añadió expiración ni máximo de cambios.
- El régimen legal del art. 56 LFPC permanece condicionado a su aplicación y a
  la excepción de servicios a diez días hábiles o menos de la orden de compra;
  no se desplaza por la política comercial de 24 horas.

La implementación técnica sigue siendo administrativa y bloquea cambios Stripe
con 409; no se añadió autoservicio ni automatización de reembolsos. La política
contractual no se presenta como una funcionalidad automática existente. Deben
definirse los pasos operativos de gestión y conservar evidencia de atención,
sin impedir ni retrasar injustificadamente los derechos legales aplicables.

## Inventario completo del Intake

| Campo real | Clasificación y observación |
| --- | --- |
| Nombre de reserva/invitación | Identificación, mostrado sin edición en el wizard. |
| Email de reserva/invitación | Contacto, mostrado sin edición; no tarjeta ni cuenta financiera. |
| `age` | Edad entera 18–120 para comprobar elegibilidad antes de acceder a campos abiertos. La contratación se limita a 18+ por decisión confirmada; no se añadió un régimen de atención a menores ni se modificaron respuestas históricas. La validación server-side acompaña el gate de la interfaz. |
| `occupation` | Contexto profesional; valorar nivel de detalle necesario. |
| `current_situation` | Contexto del servicio; abierto, potencialmente sensible. |
| `discovery_source` | Fuente de conocimiento; cuestionar necesidad para preparar la sesión, no es autorización de marketing. |
| `motivation` | Objetivos/motivación; abierto, potencialmente sensible. |
| `current_challenges` | Retos seleccionados; su contexto puede revelar información íntima. |
| `challenge_duration` | Duración del reto; contexto que puede ser sensible. |
| `desired_outcome` | Resultado deseado; abierto, potencialmente sensible. |
| `desired_change` | Cambio deseado; abierto, potencialmente sensible. |
| `blocking_factors` | Obstáculos; abierto, potencialmente sensible. |
| `strengths` | Fortalezas; contexto personal, sensible según contenido. |
| `main_concern` | Preocupación principal; abierto, potencialmente sensible. |
| `previous_attempts` | Intentos previos; puede revelar voluntariamente terapia/salud, sin pedir diagnósticos. |
| `support_preferences` | Preferencias de acompañamiento; “creencias limitantes” no equivale automáticamente a religión. |
| `additional_notes` | Notas abiertas; riesgo de información excesiva/sensible. |
| `current_step` | Progreso técnico, no respuesta clínica. |
| `status`, `expires_at`, `submitted_at`, `updated_at` | Estado/fechas técnicas y de envío; no prueban consentimiento específico por sí solos. |
| Identificadores, hashes/tokens cifrados, estados de email | Acceso privado y operación; no se muestran como nuevos datos requeridos del titular. |

No se solicitan expresamente diagnósticos, medicamentos, información genética,
religión, opiniones políticas o preferencias sexuales. Su revelación espontánea
en campos abiertos puede constituir tratamiento sensible. No se eliminó ningún
campo. Revisar minimización de detalle, fuente de conocimiento y notas abiertas;
no convertir preguntas de preparación en historia clínica.

## Flujos y consentimientos implementados

- Reserva nueva, legado/paquete y Checkout/recovery: checkbox contractual
  desmarcado, enlaces legibles a los dos documentos y validación server-side de
  `legalAcceptance`/versiones antes de crear reserva/hold o llamar Checkout.
  No modifica importe, metadata Stripe, idempotency, hold ni webhook.
- Intake: gate separado antes de introducir/guardar respuestas; checkbox expreso
  sensible desmarcado y enlace al Aviso. PATCH y POST exigen `true` y versión
  vigente antes de escribir. No vuelve a contratar el servicio ni autoriza marketing.
- Contacto, reserva, Intake, reseña y programación de proceso: avisos simplificados
  cerca de la captura. Reseña mantiene autorización propia de publicación y
  moderación; no se amplía a publicidad externa.
- Versiones centrales de textos: `2026-10-29.2`. Código y migración preparada
  usan exactamente estas versiones; no se reciben timestamps del navegador.

### Evidencia durable preparada, pendiente de aplicar

La fuente SQL canónica es
`supabase/migrations/20261029204535_legal_consent_evidence.sql`.
[La propuesta anterior](proposals/legal-consent-evidence.sql) ahora remite a ese
archivo y no contiene un segundo DDL incompatible. **No se ejecutó la nueva
migración, ni local ni remotamente.**

Añade seis columnas nullable sin backfill: en bookings,
`legal_terms_accepted_at`, `legal_terms_version`, `legal_privacy_notice_version`
y `legal_adult_confirmed_at`; en Intake, `sensitive_data_consent_at` y
`sensitive_data_consent_version` (versión del Aviso y del copy de aceptación).
Añade dos CHECKs de integridad y seis funciones nuevas con owner postgres,
SECURITY INVOKER, search_path fijo y EXECUTE solo service_role. No reemplaza
las funciones previas ni debilita RLS.

Los wrappers de creación unen reserva/hold y evidencia en una transacción,
delegando la lógica financiera existente por argumentos nombrados. Recovery
requiere el hash de cookie del booking, registra aceptación antes de Checkout
y conserva la primera evidencia. Intake revalida token/asociación/edad/estado
bajo locks y guarda respuestas, consentimiento y submission en una sola RPC,
con reloj de DB. No hay fallback a escrituras sin evidencia si falta la RPC.

Los tests nuevos verifican rutas reales con transporte RPC simulado y revisión
estática del SQL. No demuestran por ejecución la transacción PostgreSQL nueva.
Las pruebas financieras existentes usan las migraciones anteriores en PG local;
los wrappers legales nuevos se simulan expresamente para no ejecutar el SQL nuevo.

Antes del deploy: preflight concreto de columnas/tipos/firmas y nombres nuevos,
revisión/aplicación explícita de **solo** esta migración, verificación post-apply
y pruebas de atomicidad/concurrencia en un entorno autorizado. Sin ella, el código
preparado falla de forma cerrada en las operaciones afectadas. No usar db push ni
reaplicar las cuatro migraciones existentes. Un cambio futuro de versión requiere
coordinar las constantes públicas, los validadores SQL y la conservación del texto.

No se usan notas, logs, localStorage ni Stripe metadata como sustituto de evidencia.
No se recopilan IP, huella, user-agent o geolocalización adicionales para esta
finalidad. La atribución mediante cookie HttpOnly/token privado y la suficiencia
jurídica del consentimiento escrito requieren revisión humana. No se añadió un
flujo parental. La conservación del texto exacto versionado y sus pruebas de
integridad debe formar parte de la operación; no se afirma certificación NOM-151.

## Datos e integraciones reales

Supabase conserva reservas, contactos asociados al servicio, respuestas Intake,
intentos/eventos de pago, procesos, testimonios y acceso administrativo/Storage.
Contacto se tramita por Resend. Checkout Stripe es hosted y solo Test en esta
fase; la aplicación conserva importes/moneda, identificadores/metadata y estados,
no captura PAN/CVC en un formulario propio. No hay suscripciones ni renovaciones.

Google recibe nombre/email, servicio, horario, referencia y notas de reserva
para el evento de la coach/Meet. El cliente no es attendee. No se añaden token
Intake, domicilio ni respuestas Intake a Calendar. Resend envía comunicaciones
transaccionales y los enlaces privados correspondientes, no newsletters.
Los roles jurídicos/DPA y ubicaciones internacionales de cada proveedor deben
confirmarse contractualmente; no etiquetar todo procesamiento como transferencia.

Cookies reales: `booking_access_*` (autorización HttpOnly), `booking_flow_*`
(bootstrap Checkout), sesión administrativa Supabase y `google_oauth_state`
(vinculación de la cuenta de la coach). localStorage conserva identificadores
de flujo/booking y hash de solicitud para coordinar pestañas; no credenciales.
No se detectaron analytics, anuncios, píxeles ni sessionStorage en el código.
Vercel recibe contexto técnico/IP y claves HMAC para prevención de abuso.
No se añadió banner de cookies no esenciales.

## Entrega y riesgos residuales

Ambos documentos se renderizan dinámicamente (`force-dynamic`, `revalidate=0`).
Únicamente sus dos rutas llevan `X-Robots-Tag: noindex, nofollow, noarchive,
nosnippet, noimageindex`; `Cache-Control: private, no-store, no-cache, max-age=0,
must-revalidate`; `CDN-Cache-Control: no-store`; `Vercel-CDN-Cache-Control:
no-store`; `Pragma: no-cache` y `Expires: 0`. Las cabeceras globales de seguridad
se conservan. Los enlaces legales de footer, formularios y entre documentos
usan navegación normal con `<a>`: no hay prefetch automático ni navegación al
documento mediante la caché del router cliente.

No se detectaron robots/sitemap propios, Service Worker, PWA, Workbox ni uso de
CacheStorage en el proyecto; no se crearon archivos de ese tipo. Las rutas
continúan accesibles para que el crawler pueda leer las directivas. Estas
medidas reducen indexación y caché; no impiden acceso, capturas, copia o
conservación por terceros ni borran copias históricas externas.
Los datos legales confirmados permanecen legibles; no quedan placeholders ni
avisos de borrador por información ya definida.

Confirmación y email existentes permiten conservar referencia y detalles del
servicio. El email incluye servicio, fecha, hora, duración, precio y Meet.
No hay comprobante CFDI automatizado confirmado ni copia contractual
inmutable adjunta; revisar conservación/formato y datos fiscales del proveedor.

Revisión rápida de marketing: no se detectaron promesas explícitas de resultados
garantizados. “Transforma tus metas en resultados” requiere lectura contextual
con el acompañamiento ofrecido; no se reescribió el marketing sin necesidad.

Cierre focalizado: identidad, domicilio, correo, teléfono, elegibilidad 18+ y
política comercial están definidos. La implementación legal queda lista desde
el punto de vista del código, con aplicación/verificación de la migración nueva
como única dependencia operativa previa al deploy. El entorno de pagos conserva
Stripe Test; no se activaron cobros Live ni se realizó deploy.

Se mantienen la versión `2026-10-29.2` y su fecha publicada: este cierre únicamente
retira el dato fiscal y marcadores, y completa el teléfono, sin cambiar condiciones
materiales ni generar inconsistencias con los validadores de consentimiento SQL.

## Verificación técnica

Validación final del cierre del 30 de octubre de 2026:

- Pruebas legales: 120/120. Suite completa: 557/557, sin fallos ni omitidos.
  La migración nueva no se ejecutó; cobertura RPC mediante mocks y SQL estático.
- TypeScript y lint del alcance legal: PASS. Build saneado en producción local:
  PASS, sin `.env*`, con HOME/npmconfig temporales y fixtures explícitas.
- `scripts/verify-legal-delivery.mjs`: build y Next start solo en loopback; curl -I
  real, fetch HEAD/GET y HTML para las dos rutas legales y `/contacto` como control. El HTML también confirma
  nombre, correo y teléfono oficiales, ausencia del dato fiscal y de marcadores
  de borrador o confirmación pendiente.
  La copia excluye entornos y artefactos a cualquier profundidad; no usa datos
  reales de Supabase, Stripe, correo o Calendar. El proceso se detiene al finalizar.
- Ambas rutas legales devuelven 200 y los mismos headers reales:
  `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate`,
  `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`,
  `Pragma: no-cache`, `Expires: 0`,
  `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`.
- `/contacto`: 200, `Cache-Control: s-maxage=31536000`; ninguno de los otros cinco
  headers legales. No contiene el domicilio. Bundles `.next/static` sin dirección,
  nombre legal completo del proveedor. HTML legal contiene domicilio/robots y
  contactos oficiales; no publica el dato fiscal ni placeholders.
- Navegación legal usa anchors normales sin prefetch/Client Router Cache. Las
  páginas usan force-dynamic/revalidate=0; fuera de sitemap, sin bloqueo robots.
  No hay Service Worker/PWA/Workbox/runtime cache propio que excluir.
- La presencia local de `Vercel-CDN-Cache-Control` está comprobada. Su efecto real
  en infraestructura Vercel solo podrá comprobarse tras un deploy futuro autorizado;
  no se hizo deploy ni se garantiza impedir copia/captura/bfcache en todo navegador.
- `git diff --check`: PASS. Las cuatro migraciones aplicadas mantienen sus hashes.
  No se modificaron env ni dependencias. Layout, responsive, paleta y tipografías
  conservados. Lint global anterior: 15 errores/11 avisos ajenos al alcance legal;
  no se introdujeron refactors generales para resolverlos.

## Archivos de esta iteración

| Archivo | Cambio |
| --- | --- |
| `src/app/aviso-de-privacidad/page.tsx` | Aviso integral definitivo para esta versión, sin marcadores editoriales; misma ruta/diseño. |
| `src/app/terminos-y-condiciones/page.tsx` | Flujo real, políticas confirmadas con salvedades legales, 18+ y domicilio discreto. |
| `src/lib/legal/provider.ts` | Identidad, domicilio, correo y teléfono confirmados, centralizados y server-only; sin configuración fiscal pública. |
| `src/lib/legal/documents.ts` | Fecha, versiones `.2` y robots reforzados compartidos sin domicilio. |
| `src/lib/legal/acceptance.ts` | Validación de aceptación contractual vigente; no simula persistencia. |
| `src/components/legal/BookingLegalAcceptance.tsx` | Checkbox contractual y enlaces separados de datos sensibles/marketing. |
| `src/components/publico/reservar/BookingFlow.tsx` | Aceptación antes de crear reserva y avisos de privacidad/minimización. |
| `src/components/publico/reservar/BookingStatusActions.tsx` | Aceptación antes de recuperar Checkout sin cambiar hold/booking. |
| `src/app/api/bookings/route.ts` | Rechaza aceptación ausente/inválida antes de efectos de negocio. |
| `src/app/api/bookings/stripe/checkout/route.ts` | Mismo control para creación y recovery. |
| `src/components/intake/IntakeFormWizard.tsx` | Gate sensible separado, no preseleccionado; protege borrador y envío. |
| `src/app/api/intake/[token]/route.ts` | Valida consentimiento y versión antes de escribir. |
| `src/components/publico/contacto/ContactoForm.tsx` | Aviso simplificado. |
| `src/components/reviews/ReviewForm.tsx` | Aviso simplificado; autorización de publicación conservada. |
| `src/components/publico/proceso/ProcessSessionsScheduler.tsx` | Aviso simplificado, sin volver a contratar. |
| `next.config.ts` | Headers de noindex y caché solo para rutas legales; seguridad preservada. |
| `tests/legal-booking-acceptance.test.mjs` | Aceptación contractual/adulta en UI/API y efectos protegidos. |
| `tests/legal-intake-consent.test.mjs` | Consentimiento separado, gate 18+ y guardado único mediante RPC. |
| `tests/legal-pages-delivery.test.mjs` | 14 pruebas de entrega, datos finales, ausencia de marcadores, SEO, robots/sitemap, headers y navegación sin prefetch. |
| `scripts/verify-legal-delivery.mjs` | Producción local aislada: curl/HTML, headers, bundles y control normal; PASS. |
| `tests/stripe-public-flow.test.mjs` | Fixtures legales y rechazo antes de aceptar; conserva pruebas de flujo. |
| `tests/stripe-booking-status.test.mjs` | Fixture de recuperación aceptada y payload actualizado. |
| `tests/stripe-failed-recovery.test.mjs` | Consentimiento en fixture para seguir validando successor local. |
| `tests/security-booking-idor.test.mjs` | Aceptación válida para conservar la prueba real de autorización. |
| `tests/security-abuse-routes.test.mjs` | Fixtures adaptadas para conservar la prueba de rate limiting. |
| `tests/security-google-logging.test.mjs` | Fixtures Intake aceptadas para seguir probando redacción de errores. |
| `docs/proposals/legal-consent-evidence.sql` | Remisión a la migración canónica; no ejecutar propuesta anterior. |
| `supabase/migrations/20261029204535_legal_consent_evidence.sql` | Nueva migración preparada, sin ejecutar: evidencia y operaciones atómicas. |
| `tests/legal-durable-api.test.mjs` | Contratos de las RPCs, errores cerrados, edad y revisión SQL estática. |
| `docs/legal-review.md` | Inventario, fuentes, decisiones, límites y resultados. |
| `docs/legal-migration-application.md` | Procedimiento manual, preflight/postchecks y comandos oficiales para aplicar solo la migración autorizada. |

El working tree también contiene trabajo anterior de Stripe/UX/seguridad;
`git status` y `git diff --stat` globales incluyen esas modificaciones previas.

Procedimiento operativo: [aplicación manual y verificación](legal-migration-application.md).
