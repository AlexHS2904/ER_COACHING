# Flujo público Stripe y recordatorio de Intake

Estado: las cuatro migraciones están aplicadas en ER_COACHING y su historial
canónico LOCAL/REMOTE quedó alineado. El E2E final de UX terminó E2E PASS.
El reminder se validó con 77/77 pruebas aisladas, sin entrega remota real.
No reaplicar migraciones ni ejecutar db push.

## Migración local

`20261029012540_decouple_intake_email_from_finalization.sql`, generada con
`supabase migration new decouple_intake_email_from_finalization`.

El archivo fue actualizado antes de su primera aplicación remota para la regla
de sesión y el protocolo durable claim → marcar inicio → enviar. Sigue siendo
la única cuarta migración; no hay una quinta. Su preflight y aplicación remota
ya finalizaron y las definiciones aplicadas fueron verificadas.

No modifica las tres migraciones ya aplicadas, columnas, índices, RLS ni datos
históricos. No hay backfill ni DML ejecutado fuera de las funciones.

Contratos:

- `save_stripe_finalization_v1(uuid, uuid, text, jsonb)` conserva firma, retorno,
  leases, comprobaciones financieras, Calendar/Meet y emails normales. Para el
  1:1 elegible exige exactamente un intake de esa reserva, `source_type=booking`:
  activo, vigente, sin submitted_at y con hash/formato cifrado válido; o
  `submitted` con submitted_at. No exige ready_email_sent_at. La aplicación
  además descifra y verifica criptográficamente el token activo. Las reservas
  que no requieren intake conservan los requisitos de Calendar y emails.
- `claim_stripe_checkout_v1(uuid, text, uuid, text)` solo cambia el destino de
  nuevos payloads a `/reservar/confirmada?ref=...`. Los payloads persistidos y
  sus successors no se reescriben; la ruta antigua por UUID sigue autorizándose
  con cookie. Se conserva la idempotency key, importe, metadata y deadline.
- Nueva `claim_stripe_intake_reminder_v1()`: claim atómico con locks y SKIP LOCKED,
  exclusivamente service_role. Devuelve `claim_started_at` y el `expected_starts_at`
  exacto de la reserva; persiste `bookings.stripe_intake_email_started_at` y
  `ready_email_error='reminder_claimed_not_started'`. Ningún candidato implica
  ninguna escritura.
- Nueva `mark_stripe_intake_reminder_dispatch_started_v1(uuid, uuid, timestamptz, timestamptz)`
  con parámetros `p_booking_id`, `p_form_id`, `p_claim_started_at` y
  `p_expected_starts_at`, retorna boolean. Bajo locks revalida pago Stripe,
  confirmación/finalización, intake activo y no enviado, expiración, ventana de
  sesión, asociación form/booking, nonce del claim y starts_at exacto. Solo TRUE
  autoriza llamar a Resend: antes de retornar fija durablemente
  `ready_email_error='reminder_delivery_pending_or_unknown'`, conservando el
  timestamp del claim.
- Nueva `release_unstarted_stripe_intake_reminder_v1(uuid, timestamptz)`: permite
  limpiar únicamente la fase `reminder_claimed_not_started` sin email, con CAS
  sobre el timestamp exacto del claim y validación de la fuente Stripe/booking
  bajo locks. Puede limpiar un claim no iniciado tras cancelación, submission,
  expiración o cambio de starts_at; no borra un claim más reciente. SQL rechaza
  liberar dispatch pending, enviado, terminal o ambiguo tras una caída, aunque
  el caller invoque directamente la RPC. Solo service_role puede ejecutarla.
- Las RPCs privilegiadas mantienen search_path pg_catalog, pg_temp y acceso
  únicamente para service_role; no se cambian permisos de tablas.

El preflight y la verificación post-apply comprobaron las definiciones de las dos
RPCs reemplazadas y las tres nuevas (claim, mark y release), además de owner,
grants y search_path; tipos/nullability/defaults de booking_intake_forms.submitted_at,
expires_at y campos ready_email; bookings.starts_at y stripe_intake_email_started_at;
unique booking_id, formato AES-GCM, columnas y permisos usados.
La fixture añade created_at/submitted_at existentes en el contrato real para
probar estas dependencias, no como cambio de esquema remoto.

## Flujo y acceso

Horario → datos → Proceder al pago → hold de 30 minutos → Stripe Checkout.
Solo la rama Stripe cambia el CTA; procesos/paquetes mantienen su flujo.

Después de un error con hold y acceso válido, el servidor entrega statusUrl para
la misma referencia y el navegador usa router.replace. Sin hold, el error
permanece en el formulario. La referencia sola no autoriza nada.

La página de estado exige la cookie HttpOnly y comprueba la Session de retorno
si se proporciona. El contador parte de payment_expires_at y un instante del
servidor; avanza con tiempo monotónico. Refresh, pestañas y successor conservan
el deadline. Cero provoca una lectura del servidor, nunca una decisión de pago
o cancelación. Hasta confirmarse la cancelación no se afirma que se liberó el
horario. El contador desaparece con pago aplicado.

Pago → Calendar/Meet → activar/reutilizar Intake V2 sin email específico →
email principal con CTA estable → completed → redirect al intake autorizado.
El navegador solo consulta/redirige; nunca crea Calendar, intake ni marca paid.
El servidor comprueba pago, confirmed, completed, asociación correcta y cookie
antes de entregar redirectIntakeUrl. canonicalIntakeUrl nunca se serializa en
esta página pública. No se persiste el token en localStorage.
Submitted muestra estado final sin redirect. Review required y acceso corrupto,
revocado o expirado conservan una pantalla segura.

## URL canónica y redirección

La activación devuelve formId, intakeStatus, submittedAt, canonicalIntakeUrl y
redirectIntakeUrl; no usa formUrl para mezclar correo y navegación. No cambia la
firma de activate_booking_intake_v2. Si ya existe acceso recuperable no se genera un candidato nuevo. Los
candidatos de primera creación del contrato V2 no sustituyen el acceso ganador: el link se reconstruye del hash/cifrado que
retorna PostgreSQL, sin rotar el token persistido.

canonicalIntakeUrl conserva el mismo token y URL en active → submitted. El
email principal siempre usa ese campo, nunca la elegibilidad de redirect. Con
la misma clave y datos del booking se reconstruyen sender, recipient, subject,
HTML, CTA, Meet y enlace Calendar idénticos. Fecha/hora/precio/servicio vienen de
los datos persistidos y snapshots del booking, no del catálogo vigente ni del
reloj. El remitente y la configuración de origen deben mantenerse constantes
durante una entrega en recuperación. No se cambian las claves de idempotencia.

redirectIntakeUrl solo se entrega al navegador público después de validar la
cookie, pago y finalización; requiere active, submitted_at NULL y acceso vigente,
no revocado y verificable. Submitted devuelve redirectIntakeUrl NULL. Abrir el
link canónico con el token correcto muestra “Este formulario ya fue completado.”,
incluso tras expirar; revoked conserva su pantalla de acceso cerrado. La API
sigue rechazando una segunda entrega o guardado, sin enviar otro correo.

Si se perdió el material cifrado después de una entrega principal ambigua, el
finalizador requiere revisión antes de reconstruir otro payload sin CTA. No
inventa un token. Para intakes submitted heredados sin token recuperable,
canonicalIntakeUrl puede ser NULL si no hay una entrega ambigua pendiente.

El endpoint administrativo mantiene formUrl como alias de compatibilidad de
canonicalIntakeUrl dentro de su respuesta autorizada. El flujo público no usa
ese alias ni devuelve la URL canónica al consultar una referencia.

## Un recordatorio, ligado a la sesión

Si el Intake sigue pendiente, se envía un único recordatorio aproximadamente
1 hora antes de la sesión. El worker exige intake activo, submitted_at NULL,
ready_email_sent_at NULL, ready_email_id NULL, acceso vigente y booking Stripe
pagado/confirmado/completed.

Las RPCs de claim y marcado deciden con reloj PostgreSQL y el starts_at vigente:

`clock_timestamp() >= booking.starts_at - interval '1 hour'`

`booking.starts_at > clock_timestamp()`

No se deriva ningún deadline del momento de compra, creación del intake o
finalización. Una sesión a más de 1h no es elegible; dentro de la última hora
puede enviarse en el siguiente ciclo, incluso si acaba de pagarse. Nunca se
reclama una sesión que ya empezó. El marcado revalida booking, horario,
submission, revocación y expiración bajo locks inmediatamente antes de autorizar
el envío; exige también igualdad con el `expected_starts_at` del claim.

Una reprogramación desplaza automáticamente la elegibilidad al nuevo starts_at,
sin fijar un reminder al horario antiguo. Un cambio de starts_at entre claim y
marcado invalida el marcado aunque el horario nuevo también esté dentro de la
ventana. El worker recibe FALSE, libera únicamente ese claim no iniciado y no
llama a Resend; podrá reclamar de nuevo cuando el horario vigente sea elegible.
Cancelaciones, submission, expiración o inicio de sesión detectados en el marcado
también suprimen el envío. Un booking no elegible no bloquea a los demás; se
prioriza starts_at.

Se reutilizan ready_email_id, ready_email_sent_at, ready_email_error y
bookings.stripe_intake_email_started_at; no se añade ninguna columna. El claim
graba el timestamp y `reminder_claimed_not_started`; el marcado cambia la fase
a `reminder_delivery_pending_or_unknown` antes de la llamada externa. Una segunda
instancia no puede reclamarlo. Se conserva la clave Resend
`intake-ready/<form_id>` y el token original.

| Estado durable | stripe_intake_email_started_at | ready_email_error | Resultado de email |
| --- | --- | --- | --- |
| Sin claim; elegibilidad calculada con starts_at/estados | NULL | Sin evidencia de despacho del protocolo | ID y sent_at NULL |
| claimed_not_started | Timestamp exacto del claim | reminder_claimed_not_started | ID y sent_at NULL |
| dispatch_started_or_unknown | Mismo timestamp | reminder_delivery_pending_or_unknown | ID y sent_at NULL |
| sent | Mismo timestamp | NULL | ready_email_id y ready_email_sent_at presentes |
| terminal_error predispatch | Conservado | reminder_pre_dispatch_requires_review | Sin envío |
| terminal_error postdispatch | Conservado | reminder_delivery_rejected o reminder_delivery_requires_review | No retry automático |

La liberación devuelve el marcador y el diagnóstico a NULL; esto no convierte
un booking cancelado, un intake submitted o una sesión pasada en elegibles.
Siempre vuelven a aplicarse los predicados de claim. Un claim abandonado antes
de mark puede revisarse/liberarse explícitamente por un operador autorizado con
CAS; no hay recuperación automática ni lease temporal que permita enviar dos.

El worker prepara el payload localmente después del claim, sin llamadas externas;
después marca el inicio y solo ante TRUE llama a Resend y persiste el resultado.
Un error al preparar el payload se guarda como terminal predispatch, sin retry.
Si el marcado retorna FALSE, intenta release y nunca llama a Resend. Si el marcado
falla o se pierde su respuesta, no llama a Resend ni intenta release: la transacción
podría haberse confirmado y el estado requiere revisión.

Máximo un intento de red automático por reminder, también si Resend devuelve un
rechazo determinístico. Una caída antes del marcado deja el claim para revisión
manual, sin lease ni recuperación automática. Una caída después del marcado,
incluso antes de contactar al proveedor, deja la entrega pendiente o desconocida;
una caída o respuesta perdida después de Resend tiene el mismo tratamiento. No
hay redispatch ni release de estas fases: lo impide el estado durable en SQL,
sin depender de que el worker recuerde si llamó al proveedor. Si falla el guardado
del resultado, el marcador previo conserva esa protección. Un reminder puede no
llegar, pero pago, finalización y acceso no dependen de él. No hay backfill de
registros históricos con started_at previo.

Se revalida al marcar, pero una entrega ya autorizada no puede retirarse si
el usuario envía el formulario, cancela o reprograma simultáneamente, o si la sesión comienza con el correo ya en curso. Esto puede
producir un único correo ya despachado; nunca dos. Evitarlo estrictamente exigiría
coordinar una transacción distribuida con el proveedor de email.

## Calendar y correo principal

Evento y Meet permanecen en primary de Edna, sin customer attendee. Creación,
reprogramación y cancelación usan sendUpdates=none. Reprogramación elimina la
lista previa de asistentes; no se realizan cambios retroactivos en esta fase.
No se confía solo en sendUpdates para eventos nuevos: no hay destinatario
cliente dentro del evento. No podemos retirar invitaciones históricas ya
entregadas por Google.

Nuestro ticket incluye servicio, fecha/hora México, referencia, Meet y el CTA
Completar formulario cuando corresponde. Agregar a Google Calendar usa una URL
TEMPLATE con horario y Meet, sin URL privada de Edna, sin token intake y sin
invitar automáticamente al cliente. No se ha añadido ICS nuevo.

Reprogramación/cancelación administrativa legacy envían un aviso propio después
de guardar el cambio. Un fallo de email devuelve emailWarning y registra un
integration_error seguro; no revierte la operación. Las guardas existentes que
impiden estas operaciones administrativas para Stripe siguen vigentes.

## Instalación y E2E completados

Preflight remoto → aplicación autorizada → verificación de definiciones →
alineación del historial → E2E UX Test Mode: completados. No volver a aplicar
la migración desde scripts ni cambiar las cuatro migraciones aplicadas.

El E2E final confirmó un booking y pago Test, hold/deadline fijos, cancel/retry,
correo principal, un evento/Meet en Calendar verificado manualmente sin attendee
cliente, ausencia de invitación Google, enlace Calendar guardado por el cliente,
redirect Intake y submission único con segundo POST 409 sin alterar filas.
Se corrigieron la navegación bloqueada al Intake (navegación completa y enlace
de respaldo) y la omisión de CONTACT_TO_EMAIL en el arranque aislado. El aviso
de submission que falló antes de completar esa configuración conserva su error
histórico; no fue reenviado. No se repitió el pago.

## Validación local histórica de la preparación UX

- Suite completa del protocolo durable: 335/335 tests, sin fallos ni omitidos (34 casos nuevos frente a la ronda de 301).
- TypeScript: `tsc --noEmit --incremental false`, correcto.
- Build saneado: `node scripts/build-stripe-test.mjs`, correcto; ejecuta
  `npm run build -- --webpack` sin archivos .env. Los avisos ECONNREFUSED a
  127.0.0.1:54321 durante prerender son esperados en la copia sin base local.
- `git diff --check`: correcto.
- SHA-256 de las tres migraciones aplicadas: iguales antes/después, sin modificaciones.
- No se ejecutaron consultas ni escrituras remotas, ni emails/pagos/Calendar
  reales. No se leyó .env.local. .env.stripe-test sigue ignorado. Sin commit,
  push o deploy. Se retiró el archivo temporal cli-latest generado por el CLI.

La validación del protocolo durable ejecutó las RPCs contra PostgreSQL temporal, el finalizador,
la activación, los templates y el worker reales con transporte email aislado.
Incluye pago/finalización sin email intake inmediato, CTA estable, retry,
ventana de 1h antes de sesión, reprogramación, sesión iniciada, submitted, revocación,
expiración, locks concurrentes, CAS y nonce, starts_at exacto, release rechazado
después del marcado o envío, crashes antes/después del marcado, respuesta perdida
y ambigüedad sin redispatch, permisos y aplicación local idempotente de la migración
sin alterar filas. El retry ambiguo del correo principal compara el HTML real que renderiza el SDK con la misma clave,
incluyendo active → submitted entre aceptación y persistencia. La capa pública cubre
cookies, destinos de intake, formulario enviado, countdown monotónico, cero con
lectura server-side, error pre/post hold, CTA y recuperación del mismo booking.
Calendar se verifica mediante sus requests mockeados, no contra Google real.

## Archivos de esta iteración

Nuevos:

- `supabase/migrations/20261029012540_decouple_intake_email_from_finalization.sql`
- `src/lib/bookings/hold-countdown.ts`
- `src/lib/bookings/intake-destination.ts`
- `src/lib/intake/stored-intake-url.ts`
- `src/lib/intake/process-stripe-reminders.ts`
- `src/lib/google/calendar-link.ts`
- `src/lib/email/send-booking-change-email.ts`
- `tests/stripe-booking-status.test.mjs`
- `tests/stripe-intake-finalization.test.mjs`
- `tests/stripe-reminder-dispatch.test.mjs`
- `docs/stripe-public-ux.md`

Modificados respecto a la limpieza previa:

- `src/app/api/bookings/stripe/checkout/route.ts`
- `src/app/api/bookings/[id]/cancel/route.ts`
- `src/app/api/bookings/[id]/reschedule/route.ts`
- `src/app/reservar/confirmada/page.tsx`
- `src/app/formulario/[token]/page.tsx`
- `src/app/api/admin/payments/mark-paid/route.ts`
- `src/components/publico/reservar/BookingFlow.tsx`
- `src/components/publico/reservar/BookingStatusActions.tsx`
- `src/emails/CustomerBookingEmail.tsx`
- `src/lib/bookings/confirmation-state.ts`
- `src/lib/bookings/finalize-paid-booking.ts`
- `src/lib/email/send-booking-emails.tsx`
- `src/lib/google/calendar.ts`
- `src/lib/intake/activate-booking-intake.ts`
- `src/lib/stripe/process-pending.ts`
- `tests/activate-booking-intake.test.mjs`
- `tests/stripe-services.test.mjs`
- `tests/stripe-public-flow.test.mjs`
- `tests/helpers/local-supabase-query.mjs`
- `tests/fixtures/stripe-local-schema.sql`
- `docs/stripe-local-test.md`
- `docs/stripe-review-inventory.md`

La preparación UX original no modificó scripts. El E2E posterior añadió
CONTACT_TO_EMAIL al entorno permitido y requerido de dev-stripe-test.mjs.


## Migraciones aplicadas e historial alineado

Las cuatro migraciones siguientes están aplicadas, verificadas y registradas
remotamente con las versiones canónicas de los archivos locales. Las RPCs claim,
mark y release y su protocolo durable están presentes. No se necesita reaplicar
ni crear otra migración para este flujo.

SHA-256 verificados de las cuatro migraciones aplicadas, sin cambios:

| Archivo | SHA-256 |
| --- | --- |
| `20261028000100_stripe_test_booking_lifecycle.sql` | `bd840dfbd917f93e04a9de0291f9b734b2c484fecaa8218b3fbf3039d4ff2537` |
| `20261028000200_intake_v2_stable_service_identity.sql` | `04fbb60429e70c8ccdc685cebd108ba4ac397ce21f5fffaa55e1e6dfd956ec64` |
| `20261028201527_stripe_failed_attempt_recovery.sql` | `9d25b53717a4513616a2932ca8bbb1f9d9a70265b2e9e4eff3ced060ff8fe18b` |
| `20261029012540_decouple_intake_email_from_finalization.sql` | `174e056f27b7c726b889204f3b3ef90b4538625baf9fa2f5e243392fcd9aaccb` |

El metadato temporal del CLI queda excluido mediante /supabase/.temp/ en .gitignore.

Revisión estática independiente del protocolo durable: sin bugs accionables; la autorización de despacho queda persistida antes del proveedor y SQL rechaza release post-dispatch, incluso tras crash.
