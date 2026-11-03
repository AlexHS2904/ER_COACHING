# Stripe: sesiones individuales y paquetes — despliegue con ventas pausadas

La migración está aplicada y verificada en ER_COACHING; el código se prepara para
desplegar con nuevas ventas deshabilitadas. La activación de Stripe Live, sus
secretos, webhook y cobros requiere autorización posterior. El hotfix sigue
bloqueando confirmaciones de servicios con precio desde
rutas legacy y administrativas sin evidencia autorizada.

## Compra y comprobación financiera

Los dos productos forman un único lanzamiento: `sesion-1-1`, single/1, y el
servicio package/6. Ambos deben estar activos, habilitados para reserva, sin
cotización, con duración y precio positivos y moneda MXN. El servidor obtiene
precio, duración y sesiones de `services` y congela los snapshots. No multiplica
el precio individual para calcular un paquete. No acepta importes del navegador.

La bandera `PAID_BOOKINGS_ENABLED` está apagada salvo el valor exacto `true`.
Antes de un nuevo hold se verifican cuenta Stripe, configuración de medios de
pago inmediatos, secreto de webhook, worker autenticado y disponibilidad de ambos
productos. En Live también se exige cuenta habilitada para cargos y payouts.
Configuración ausente o
incorrecta bloquea ventas. Pausar ventas no revoca los derechos ya adquiridos ni
deshabilita webhook, recuperación o worker correctamente configurados.

La secuencia es selección → datos/18+/aceptación vigente → cookie HttpOnly →
hold y evidencia legal atómicos → Checkout → pago verificado → Calendar/Meet →
activar/reutilizar Intake → correos principales → finalización → redirect privado
al Intake cuando siga activo. No se espera al envío del formulario para crear la
cita. No hay confirmación financiera desde `success_url` ni desde el navegador.

El webhook exige firma sobre el body original y modo esperado. Solo procesa
`checkout.session.completed` y `checkout.session.expired`. Un completed debe
incluir Session y PaymentIntent pagados, importe recibido completo, MXN,
identidad de booking/attempt/referencia, cuenta y modo coincidentes. Se consulta
PaymentIntent con su cargo; solo card/link inmediatos. El retorno recupera el
evento real de Stripe y entra en el mismo ledger, sin fabricar eventos. El ledger
y el attempt aceptado son obligatorios para la finalización y nuevos derechos.

Se usa API `2026-09-30.endive`, fijada también en el endpoint de webhook. Checkout
usa Dynamic Payment Methods mediante una configuración dedicada del Dashboard.
No se envían `payment_method_types` ni `automatic_payment_methods` al crear la
Session. No habilitar OXXO, transferencias, débito diferido ni otros medios cuyo
ciclo asíncrono no está implementado. La validación rechaza métodos nuevos no
permitidos, aunque aparezcan más adelante en la cuenta.

## Separación Test / Live

Cada booking, attempt y evento nuevo conserva modo/cuenta; el booking y attempt
también conservan origen. Los procesos enlazan su compra inicial. Históricos con
estos campos NULL quedan sin clasificar: no se convierten en Live ni se rellenan
por inferencia. Su lectura privada ya finalizada continúa sin exigir claves ni
ventas habilitadas. Sus reintentos financieros no se adoptan en el ledger Live.
El worker nuevo tampoco reconcilia automáticamente holds históricos con
procedencia NULL; identificarlos en preflight y decidirlos individualmente.

- Live: clave `sk_live_`, cuenta esperada, Vercel Production y origen exacto
  `https://www.ednarojocoaching.com`, Supabase ER_COACHING
  `rysgpojjhiljrrwtjguy`.
- Test local: clave `sk_test_`, localhost y Supabase local o proyecto de pruebas
  explícito diferente de ER_COACHING. Preview exige además origen HTTPS exacto
  autorizado. Nunca mezclar Test con la base real de producción.
- El apex debe redirigir a www antes del flujo. No dar permisos Live al apex
  como excepción al guard. Comprobar la redirección durante el smoke.

`dev-stripe-test.mjs` sigue ejecutando Next en una copia temporal sin ningún
`.env*` y sin heredar credenciales del shell. Lee exclusivamente `.env.stripe-test`
ignorado por Git. El antiguo permiso Test contra ER_COACHING fue retirado. El
usuario debe proporcionar manualmente la configuración del entorno aislado; no
copiar `.env.local`. Las variables retiradas `STRIPE_E2E_*` siguen rechazadas.

## Paquete de seis sesiones

El hold crea un único proceso `pending_payment` y una primera reserva ordinal 1.
No hay acceso útil, entitlement ni seis eventos por adelantado. Un pago válido
dentro del deadline activa atómicamente ese proceso con exactamente seis
sesiones. Un pago tardío conserva evidencia para revisión y nunca resucita un
horario liberado ni activa el proceso.

El correo principal contiene el acceso privado al proceso. Su token aleatorio de
256 bits se guarda como SHA-256 y cifrado autenticado con la infraestructura
existente de Intake. La recuperación administrativa usa el mismo token para
procesos Stripe nuevos; no lo rota durante retries. Nunca se incluye en Calendar.

Cada cita posterior exige token privado, proceso activo y recibo Stripe original
verificado. El lock del proceso serializa consumo; ordinal único por proceso,
máximo 6, y nonce estable ligado por HMAC al token permiten recuperar la misma
petición. Se crea una sola cita pagada/cubierta sin nuevo attempt ni cargo. La
duración y legal se heredan de la compra. Calendar y emails usan el finalizador
existente con lease e identidades estables. Cancelar/reprogramar no reserva otro
ordinal, no genera un reembolso ni concede automáticamente una sesión extra.
La disponibilidad actual debe cubrir la duración congelada completa: un cambio
posterior de catálogo no puede acortar la cita comprada ni extenderla fuera de
la ventana ofrecida. Si ya no cabe, el servidor rechaza ese horario; no cambia
el snapshot ni concede otro derecho.

Un Intake por proceso se vincula a la compra original y se reutiliza en las seis
sesiones. No se crea otro token por cita ni se vuelve a pedir aceptación
contractual ya válida. Se conserva el consentimiento sensible separado y el
bloqueo de segunda submission. Los 30 días de acceso existentes del formulario
no son una vigencia del paquete; sesiones posteriores no reabren un formulario
revocado, expirado o submitted ni pierden por ello su entitlement pagado.

## Agenda administrativa durable

Las rutas de cambio conservan la autorización de admin activo. Para Stripe nuevo
usan `booking_change_jobs`: cambio de negocio y trabajo durable en una misma
transacción, snapshot inmutable para el correo y una sola operación sin resolver
por booking. El worker actualiza/elimina el mismo evento de Calendar, no inserta
otro. Un error de Calendar o Resend no revierte la reserva ni pierde el trabajo.

El correo usa el UUID del trabajo como revisión/idempotency key. Se registra el
inicio antes del proveedor. Un envío ambiguo fuera de 23 horas requiere revisión;
no se reenvía a ciegas fuera de la ventana de idempotencia del proveedor. Repetir
un cambio ya guardado devuelve el trabajo existente. Cancelar la primera cita
no anula por sí mismo el pago del paquete ni sus otras sesiones.

Las reglas comerciales actuales siguen en Términos: solicitudes por contacto,
reprogramación sujeta a disponibilidad y política de 24 horas; cancelación
voluntaria definitiva sin reembolso comercial, respetando derechos legales.
Para compras nuevas, el paquete vence a los 90 días naturales desde el pago
verificado; se guarda ese vencimiento y toda la cita debe caber dentro del plazo.
No se aplica retroactivamente ni se extiende al reintentar/reponer. Cancelación
con menos de 24 horas: derecho reservado pendiente de resolución administrativa.
Edna puede consumirlo o autorizar una reposición, que conserva ordinal y vigencia,
con enlace único a la reserva anterior. En la individual se conserva la reserva,
Calendar e Intake originales: el cambio queda pendiente hasta la decisión y se
reprograma por el mecanismo administrativo existente. Inasistencia sin aviso: utilizada, con
administrador/fecha persistidos incluso después de una excepción autorizada.
No hay reembolso automático ni reglas nuevas para cancelación definitiva ≥24 h.
La declaración contractual nueva es `2026-10-31.1`; la privacidad no cambia.

## Hold, expiración y worker

El hold financiero sigue siendo `created_at + 30 minutes`; ni refresh ni successor
lo extienden. La Session expira técnicamente a deadline + 31 minutos para cumplir
el mínimo de Stripe incluso al recuperar cerca del final del hold. El worker
intenta cerrarla al vencer el hold; si el scheduler se retrasa puede seguir
existiendo una Session abierta, pero cualquier pago posterior va a revisión sin
confirmación automática. No se promete cierre de Stripe exactamente al segundo.

El worker procesa expiración, finalización, cambios de agenda y reminder con
filtros de cuenta/modo, locks/CAS, lotes pequeños, backoff y presupuesto de 75 s
(máximo 90; ruta 120 s). Un fallo individual no impide las fases siguientes.
Los holds se liberan localmente incluso si Stripe no responde; `unknown` nunca
autoriza crear un successor a ciegas. Solo una creación rechazada de forma
determinística y sin referencias permite `failed/rejected → successor` dentro
del mismo hold. Los estados ambiguos agotados requieren revisión manual.

Reminder compartido: como máximo uno por Intake/proceso, solo en la ventana
`[starts_at - 1h, starts_at)`. Claim durable → mark confirmado → Resend. Nunca
release después de dispatch started; submitted/cancelled/expired/past o email
previo quedan excluidos. No reenvío automático ambiguo.

Scheduler necesario: cada minuto, observabilidad de retrasos y reintentos,
alertas por `review_required`, trabajos pendientes y webhook fallido. La ruta
GET de Vercel Cron exige `CRON_SECRET`; POST para scheduler externo exige
`STRIPE_WORKER_SECRET` en producción. Secretos Bearer independientes, de al
menos 32 caracteres, nunca query string. Local POST usa el secreto local.

Recomendación: Vercel Pro con Cron por minuto o hosting comercial equivalente y
scheduler autenticado. Hobby es para uso personal no comercial y su cron admite
solo una ejecución diaria con precisión horaria: no sirve para este lanzamiento.
[Planes](https://vercel.com/docs/plans/hobby),
[frecuencia Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Ejemplo pendiente de autorización, NO configurado en `vercel.json`:
`{"crons":[{"path":"/api/internal/stripe/process-pending","schedule":"* * * * *"}]}`.
Las leases soportan invocaciones simultáneas. Un presupuesto agotado deja trabajo
durable para el siguiente ciclo; no garantiza una cota dura si un proveedor no
responde. Monitorizar volumen y duración antes de aumentar los lotes.

## Variables requeridas (solo nombres/configuración pública)

| Nombre | Uso |
| --- | --- |
| `STRIPE_MODE` | `test` o `live`, sin inferencia por hostname |
| `STRIPE_EXPECTED_ACCOUNT_ID` | Cuenta propia comprobada por API |
| `STRIPE_SECRET_KEY` | Secreto server-only del modo elegido |
| `STRIPE_WEBHOOK_SECRET` | Firma del endpoint y modo concretos |
| `STRIPE_PAYMENT_METHOD_CONFIGURATION_ID` | Configuración dedicada card/link, card disponible |
| `PAID_BOOKINGS_ENABLED` | `false` durante despliegue/preflight; activación comercial separada |
| `NEXT_PUBLIC_SITE_URL` | Origen canónico exacto |
| `NEXT_PUBLIC_SUPABASE_URL` | Base correspondiente al entorno |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública del entorno |
| `SUPABASE_SECRET_KEY` | Solo servidor, jamás NEXT_PUBLIC |
| `STRIPE_TEST_SITE_ORIGIN` | Solo Preview Test, origen HTTPS autorizado |
| `STRIPE_TEST_SUPABASE_PROJECT_REF` | Solo Test remoto aislado |
| `CRON_SECRET` / `STRIPE_WORKER_SECRET` | Scheduler elegido, solo servidor |
| `STRIPE_LOCAL_WORKER_SECRET` | Solo worker local |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Calendar existente |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `COACH_EMAIL`, `CONTACT_TO_EMAIL` | Correos existentes |
| `INTAKE_TOKEN_ENCRYPTION_KEY` | Cifrado existente, preservar clave y recuperación |
| `RATE_LIMIT_SECRET` | Mantener cuotas y fail-closed existentes |

`VERCEL` y `VERCEL_ENV` deben provenir de la plataforma, no del navegador. Hosted
Checkout no necesita una publishable key Stripe en el cliente. No intercambiar
secretos Test/Live ni cambiar PMC a mitad de un intento con payload persistido.
Las variables existentes no han sido leídas ni cambiadas por esta implementación.

## Migración aplicada y equivalencia verificada

`20261103035102_stripe_live_single_and_package_lifecycle.sql` está aplicada en
ER_COACHING con esa misma versión remota. Se renombró únicamente el archivo
local desde `20261031062246`, sin modificar su SQL; SHA-256 verificado:
`21af69a16e2286b2884883e6198c7d6e38af25b08925cd071337bbbbe0f2f17e`.
No reaplicar ni reparar historial. Añade procedencia nullable sin backfill; enlaces proceso/compra/Intake;
constraints/índices de integridad; estado de proceso pending_payment; outbox
privada con RLS; RPCs v2 y RPCs de proceso, agenda y reminder. Conserva las RPCs
anteriores, endurece su uso sobre registros de nueva procedencia y adapta la
submission legal para el Intake compartido. No cambia los archivos ya aplicados.

Al aplicar solo hay DDL/transacción/grants: no UPDATE/INSERT/DELETE de filas de
negocio fuera de funciones ni backfill. Constraints/índices sí validan datos y
pueden tomar locks; no es una migración para ejecutar sin preflight remoto.

- Revisar SHA del archivo y esquema remoto: nombres, columnas, tipos, constraints,
  funciones/firma, índice único de booking/proceso e historial alineado.
- Comparar especialmente `coaching_processes_status_check`, esquema real de
  procesos y `get_reschedule_slots`; la fixture aislada no sustituye esa revisión.
- Verificar que las funciones nuevas sean postgres, SECURITY DEFINER donde
  corresponde, search_path fijo, sin EXECUTE PUBLIC/anon/authenticated; solo
  service_role. La tabla outbox debe permanecer RLS privada, sin policies públicas.
- Baseline con huellas internas y conteos de bookings, procesos, attempts,
  eventos e intakes; no imprimir PII/tokens ni secretos. Repetir después de la
  aplicación autorizada y exigir igualdad de negocio histórico.
- Confirmar columnas históricas nuevas NULL y acceso privado histórico intacto.
  No reparar manualmente históricos ni declararlos Live por `payment_status`.

## Pruebas y autorización de lanzamiento

1. Validación local: suite completa con `node --test --test-concurrency=2
   tests/*.test.mjs`, TypeScript sin incremental, build saneado y diff check.
   Los tests PostgreSQL usan clúster temporal aislado, nunca credenciales remotas.
2. E2E Test en staging separado: compra individual y paquete (un pago, una primera
   cita/proceso/Intake); cinco citas posteriores, séptima rechazada, carreras de
   agenda, IDOR de proceso/cookie; legal y segundo submit 409.
3. Rechazo, cancel, expiración/late pay, replay, webhook tardío y antes/después del
   retorno, refresh, retries simultáneos; nunca duplicar booking/charge/event.
4. Caída de Calendar y correo: guardar pago, recuperar por worker, mismo evento,
   mismo payload/clave; pérdida de respuesta fuera de ventana → revisión.
   Agenda administrativa con fallo/lease recuperable y ordinal intacto.
5. Obtener aprobación independiente del preflight y aplicación de esta migración.
   Desplegar código con ventas apagadas solo tras autorización distinta.
6. Configurar cuenta Live habilitada para cargos/payouts, PMC inmediata, webhook
   `https://www.ednarojocoaching.com/api/webhooks/stripe`, versión indicada y los
   dos eventos; secretos separados. Verificar scheduler/minuto y alertas. No
   activar una sola modalidad: individual y paquete deben pasar juntos.
7. Smoke público sin escribir: apex→www, catálogo/slots/legales, ventas apagadas,
   legacy/mark-paid sin bypass, worker no autorizado 401, webhook sin firma400,
   acceso privado propio de históricos. No crear holds/cargos/email con probes.
8. E2E Live requiere autorización explícita de una compra real legítima por
   producto y tratamiento comercial/fiscal/reembolso acordado. No fabricar un
   cliente ni simular pago mediante SQL; hasta entonces no declarar Live probado.
9. Activar `PAID_BOOKINGS_ENABLED=true` solo después de todo lo anterior y una
   autorización comercial. Rollback operativo: apagar nuevas ventas, mantener
   webhook/worker/accesos pagados; no revertir esquema ni perder el ledger.

Históricos pendientes de decisión humana, intactos: procesos PROC-D73C01FD
(ER-01594207/ER-C56F34AA), PROC-E0B33585 (ER-8B6559DC), y reservas individuales
ER-B0958A0F/ER-877D5A4A confirmadas sin evidencia Stripe. `pending` no demuestra
ausencia de pago por otro medio. No regularizarlos mediante este lanzamiento.

## Validación local completada

- Suite completa: **848/848 PASS**, sin skips ni fallos, con concurrencia 2.
- Incluye **84 pruebas PostgreSQL** de la nueva migración y **57 de
  Intake/finalización**; estos subconjuntos no se suman otra vez al total.
- TypeScript sin incremental: PASS.
- Build de producción en copia saneada, mediante `npm run build -- --webpack`:
  PASS. Sin archivos `.env`, credenciales reales ni servicios externos de negocio.
- `git diff --check`: PASS. Escaneo de secretos de archivos modificados/nuevos:
  sin candidatos reales; URLs con credenciales solo en fixtures negativos.
- Migraciones previamente versionadas: idénticas byte por byte a HEAD.
- Sin aplicación remota, modificación de históricos, cambios de configuración,
  commit, push, deploy ni activación Live. El E2E nuevo con proveedores reales y
  cualquier smoke/compra Live quedan sujetos a la checklist y autorización.

Fuentes técnicas: [Checkout](https://docs.stripe.com/api/checkout/sessions/create),
[configuración de medios](https://docs.stripe.com/api/payment_method_configurations/object),
[idempotencia](https://docs.stripe.com/api/idempotent_requests),
[webhook](https://docs.stripe.com/webhooks),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
