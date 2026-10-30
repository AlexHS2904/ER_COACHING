# Auditoría final de seguridad de ER_COACHING

## Alcance y resultado

Este documento conserva el resultado de la auditoría original. El cierre
acotado posterior, sus controles implementados y los pasos manuales pendientes
se registran en [security-blockers.md](security-blockers.md).

Revisión de código y metadatos remotos READ-ONLY del proyecto ER_COACHING
(`rysgpojjhiljrrwtjguy`, PostgreSQL 17.11), después del E2E PASS.
No se repitió el E2E, no se hicieron escrituras remotas, rotaciones, cambios de
autenticación mayor, migraciones, commit, push, deploy ni Stripe Live.
Los cambios locales de esta revisión todavía no están desplegados.

Resultado: **SECURITY FIX REQUIRED**. Quedan pendientes controles de abuso
verificables en edge/proveedor y la revisión de logs de infraestructura.
La CSP parcial y una cadena de dependencias Low también quedan documentadas.

## Hallazgos

| Severidad | Componente | Riesgo / estado |
| --- | --- | --- |
| High | admin/formularios | Lectura privilegiada sin revalidar admin activo en la propia página RSC. Corregido con requireAdmin antes de service_role; tests visitante/normal/inactivo/activo. |
| High | OAuth y errores SDK/DB sensibles | Los objetos de error podían contener refresh tokens, headers o failing-row details con respuestas privadas. Corregido: solo evento, HTTP status y código técnico permitido. No se confirmó exposición pública ni se ejecutó rotación. |
| Medium | Cookies admin y booking | Secure podía omitirse en producción. Corregido: obligatorio en producción, Lax; booking conserva HttpOnly y deadlines. |
| Medium | Logs de URLs bearer | Corregido en el logger de desarrollo de Next: rutas privadas y callbacks omitidos. Pendiente comprobar retención/acceso/redacción en el hosting; Next no controla los access logs de Vercel. |
| Medium | Contacto y creación pública | Sin rate limiting/cuotas verificables en código. Pendiente configurar y probar controles compartidos en edge/proveedor; Origin e idempotencia no impiden bots con nuevos flujos. |
| Low | Referrer de procesos privados | Corregido: no-referrer en páginas/APIs privadas y callbacks sensibles. |
| Low | CSP | Parcial: frame-ancestors/base-uri/form-action/object-src; no restringe scripts con nonce/hash ni default-src. Pendiente diseño compatible con Next. No se encontró un XSS concreto. |
| Low | Email dependencies | Persisten tres entradas npm del mismo origen deepmerge, a través de html-to-text y @react-email/render. No hay parche deepmerge 4.x; la propuesta de actualización arrastra majors y no se aplicó. |
| Low | Supabase Auth | Advisor informa leaked-password protection deshabilitada. Recomendación pendiente de configuración; no se cambiaron políticas de autenticación. |

Los controles de abuso deben cubrir especialmente POST /api/contact,
POST /api/bookings y creación/recuperación en POST /api/bookings/stripe/checkout,
con fuente IP confiable y cuotas por destinatario/booking según el caso.
No se añadió un contador en memoria como protección para Vercel.
Intake/procesos/reseñas usan bearer de alta entropía; no existe enumeración pública.
El login depende de Supabase Auth; no se generaron intentos de fuerza bruta para medir límites.

## RLS, grants y Storage

Las 14 tablas de aplicación tienen RLS habilitado: admin_users,
availability_exceptions, availability_rules, booking_intake_forms,
booking_payment_attempts, booking_settings, bookings, coaching_processes,
google_calendar_connection, resources, review_invitations, services,
stripe_events y testimonials. No existe una tabla public.slots: la disponibilidad
se deriva de sus reglas/excepciones y bookings. Packages/process usan servicios,
coaching_processes y bookings.

- anon no tiene SELECT ni DML sobre las tablas privadas.
- authenticated no tiene acceso a attempts, eventos, intakes, procesos ni tokens.
- bookings permite SELECT solo mediante is_admin(), que exige active=true.
- admin_users permite leer únicamente la propia fila; no tiene policies de escritura.
  Conserva grants amplios de PostgreSQL, incluido TRUNCATE; RLS deniega DML sin
  policy, anon/authenticated no pueden iniciar sesión SQL ni crear objetos en
  public y no existe endpoint que exponga TRUNCATE. Es un punto de mínimo
  privilegio para endurecimiento futuro, sin bypass REST demostrado.
- services permite solo lectura del catálogo active=true a anon/authenticated.
- Las tablas solo-backend sin policies tienen denegación por defecto;
  el advisor informativo no implica que sean públicas.
- service_role es privilegiado por diseño y solo se usa en módulos server-only.
- Storage objects tiene RLS; buckets resources y testimonial-photos son privados.
  Las rutas de recursos públicos validan active/visibility antes de generar acceso.

## Inventario RPC

31 funciones de aplicación, excluyendo extensiones: 25 RPCs y 6 funciones trigger.
Las 24 RPCs de negocio requieren service_role, con PUBLIC/anon/authenticated
sin EXECUTE efectivo. La excepción is_admin() consulta auth.uid() y active=true,
sin aceptar identidad del navegador. Todos los owners son postgres.
Las seis funciones trigger no admiten invocación directa como RPC.

Los 22 SECURITY DEFINER tienen search_path fijo. Cuatro legacy usan public,
con tablas calificadas y sin CREATE para roles externos; no se demostró un
vector de shadowing. Los avisos de invokers/triggers con search_path mutable y
btree_gist en public no se convirtieron en una migración sin riesgo demostrado.
No hay SQL dinámico en las funciones revisadas.

| Función y firma | SECURITY DEFINER | search_path | EXECUTE efectivo |
| --- | --- | --- | --- |
| `activate_booking_intake(p_booking_id uuid, p_access_token_hash text, p_payment_provider text, p_payment_reference text)` | sí | `public` | service_role |
| `activate_booking_intake_v2(p_booking_id uuid, p_access_token_hash text, p_access_token_encrypted text, p_payment_provider text, p_payment_reference text)` | sí | `pg_catalog, pg_temp` | service_role |
| `admin_save_availability_configuration(p_minimum_notice_hours integer, p_max_advance_days integer, p_slot_interval_minutes integer, p_rules jsonb)` | sí | `public` | service_role |
| `apply_stripe_checkout_event_v1(p_event_id text, p_event_type text, p_session jsonb)` | sí | `pg_catalog, pg_temp` | service_role |
| `begin_stripe_checkout_creation_v1(p_booking_id uuid, p_attempt_id uuid, p_owner uuid)` | sí | `pg_catalog, pg_temp` | service_role |
| `claim_stripe_checkout_v1(p_booking_id uuid, p_access_token_hash text, p_owner uuid, p_site_url text)` | sí | `pg_catalog, pg_temp` | service_role |
| `claim_stripe_finalization_v1(p_booking_id uuid, p_owner uuid)` | sí | `pg_catalog, pg_temp` | service_role |
| `claim_stripe_intake_reminder_v1()` | sí | `pg_catalog, pg_temp` | service_role |
| `complete_finished_bookings()` | sí | `""` | service_role |
| `create_booking(p_service_slug text, p_starts_at timestamp with time zone, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text)` | no | `(sin fijar; invoker/trigger)` | service_role |
| `create_package_booking(p_service_slug text, p_starts_at timestamp with time zone, p_customer_name text, p_customer_email text, p_access_token_hash text, p_customer_phone text, p_notes text)` | no | `""` | service_role |
| `create_process_session(p_access_token_hash text, p_starts_at timestamp with time zone, p_notes text)` | no | `""` | service_role |
| `create_review_invitation(p_access_token_hash text, p_expires_at timestamp with time zone, p_booking_id uuid, p_process_id uuid)` | sí | `""` | service_role |
| `create_stripe_booking_hold_v1(p_service_slug text, p_starts_at timestamp with time zone, p_customer_name text, p_customer_email text, p_customer_phone text, p_notes text, p_access_token_hash text)` | sí | `pg_catalog, pg_temp` | service_role |
| `expire_stripe_booking_hold_v1(p_booking_id uuid, p_attempt_id uuid, p_remote_expired boolean)` | sí | `pg_catalog, pg_temp` | service_role |
| `get_available_slots(p_service_slug text, p_date date)` | no | `(sin fijar; invoker/trigger)` | service_role |
| `get_reschedule_slots(p_booking_id uuid, p_date date)` | sí | `public` | service_role |
| `is_admin()` | sí | `public` | anon / authenticated / service_role |
| `mark_stripe_intake_reminder_dispatch_started_v1(p_booking_id uuid, p_form_id uuid, p_claim_started_at timestamp with time zone, p_expected_starts_at timestamp with time zone)` | sí | `pg_catalog, pg_temp` | service_role |
| `record_stripe_checkout_failure_v1(p_booking_id uuid, p_attempt_id uuid, p_owner uuid, p_status text, p_error text)` | sí | `pg_catalog, pg_temp` | service_role |
| `release_unstarted_stripe_intake_reminder_v1(p_booking_id uuid, p_claim_started_at timestamp with time zone)` | sí | `pg_catalog, pg_temp` | service_role |
| `save_stripe_checkout_v1(p_booking_id uuid, p_attempt_id uuid, p_owner uuid, p_session_id text, p_expires_at timestamp with time zone)` | sí | `pg_catalog, pg_temp` | service_role |
| `save_stripe_finalization_v1(p_booking_id uuid, p_owner uuid, p_step text, p_data jsonb)` | sí | `pg_catalog, pg_temp` | service_role |
| `set_booking_completed_at()` | no | `""` | solo contexto trigger |
| `set_booking_intake_updated_at()` | no | `(sin fijar; invoker/trigger)` | solo contexto trigger |
| `set_review_updated_at()` | no | `""` | solo contexto trigger |
| `submit_testimonial(p_access_token_hash text, p_author_name text, p_rating integer, p_content text, p_consent_to_publish boolean, p_avatar_key text, p_photo_path text)` | sí | `""` | service_role |
| `sync_coaching_process_completion(p_process_id uuid)` | sí | `""` | service_role |
| `sync_process_after_booking_change()` | sí | `""` | solo contexto trigger |
| `update_coaching_process_updated_at()` | no | `(sin fijar; invoker/trigger)` | solo contexto trigger |
| `update_updated_at_column()` | no | `(sin fijar; invoker/trigger)` | solo contexto trigger |

## Inventario de las 31 rutas API

| Clase | Métodos | Rutas |
| --- | --- | --- |
| Público | GET | `/api/availability`; `/api/resources/[id]/cover`; `/api/resources/[id]/download` |
| Público | POST | `/api/bookings`; `/api/contact` |
| Creación pública / booking-cookie para recuperar | POST | `/api/bookings/stripe/checkout` |
| Token privado | PATCH, POST | `/api/intake/[token]` |
| Token privado | POST | `/api/processes/[token]/sessions`; `/api/reviews/[token]` |
| Internal Bearer | POST | `/api/internal/stripe/process-pending` |
| Webhook firmado | POST | `/api/webhooks/stripe`; `/api/webhooks/resend` |
| Admin activo | PUT, POST, DELETE | `/api/admin/availability` |
| Admin activo | GET | `/api/admin/calendar`; `/api/admin/intake/by-booking/[bookingId]/link`; `/api/admin/intake-invitations/[id]/link`; `/api/admin/resources/[id]/cover`; `/api/google/connect`; `/api/google/callback` |
| Admin activo | POST | `/api/admin/intake-invitations`; `/api/admin/payments/mark-paid`; `/api/admin/processes/[id]/regenerate-access`; `/api/admin/resources`; `/api/admin/resources/upload-url`; `/api/admin/review-invitations`; `/api/admin/services`; `/api/bookings/[id]/cancel` |
| Admin activo | PUT, PATCH, DELETE | `/api/admin/resources/[id]`; `/api/admin/services/[id]` |
| Admin activo | PATCH | `/api/admin/testimonials/[id]/status` |
| Admin activo | GET, POST | `/api/bookings/[id]/reschedule` |

Las rutas admin verifican claims y admin_users.active antes de service_role.
Cancel/reschedule requieren admin, no una booking cookie. OAuth valida state
vinculado al usuario y cookie protegida. Auth confirm, fuera de /api, valida OTP
invite y redirige a una ruta fija.

Checkout exige Origin exacto; cookie A no autoriza booking B, ni siquiera si se
renombra como cookie B. Una referencia, UUID o Session sin cookie válida no
entrega Checkout ni redirectIntakeUrl. Las RPCs comparan hash/asociación/lease.
Las APIs mutables basadas en sesión conservan SameSite=Lax; no se identificó
un CSRF cross-site explotable que requiera un mecanismo adicional.

## Otros controles

- Intake: randomBytes(32), SHA-256, AES-256-GCM con IV aleatorio de 12 bytes;
  no se deriva de referencia/UUID. Expired/revoked/submitted se comprueban
  server-side; una segunda entrega falla antes de escribir/enviar email.
- Las URLs privadas aparecen en el formulario privado y su email autorizado,
  no en Calendar. No se detectó un endpoint público de respuestas/listado.
- Booking cookies: HttpOnly, Secure en producción, Lax, paths y expiraciones
  conservados. La cookie del flow está restringida al endpoint de Checkout.
- Admin conserva el diseño Supabase browser SDK: los tokens necesitan acceso
  desde ese SDK, así que no se forzó HttpOnly ni se rediseñó la autenticación.
  La duración/rotación de sesión del proveedor no se alteró.
- Internal: POST, Bearer obligatorio, comparación timingSafeEqual, sin secreto
  en query string y sin GET mutable.
- Stripe: claves server-only/Test, firma sobre raw body, precio/moneda del
  servidor, asociación Session/booking/attempt verificada, success_url sin
  autoridad financiera, replay/late-payment protegidos en código y tests.
- Inputs usan filtros/RPC parametrizados. No se encontró raw SQL con input
  interpolado ni dangerouslySetInnerHTML para testimonios/Intake/emails.
- HSTS, nosniff, DENY, Permissions-Policy y referrer están configurados.
  La CSP sigue parcial como se indica arriba; no se afirmó una allowlist completa.
- Secret scan de candidatos Git: únicamente placeholders de tests, sin claves
  reales encontradas. No se abrió .env.local ni se copiaron valores de otros
  archivos de entorno. .env.local/.env.stripe-test y supabase/.temp/ están ignorados.
- Documentación vigente actualizada a cuatro migraciones aplicadas/alineadas,
  cliente sin attendee y sin invitaciones automáticas de Google.
  Se preservaron los resultados históricos de pruebas.

Coincidencias del secret scan, sin valores:

| Tipo | Archivo | Clasificación |
| --- | --- | --- |
| Stripe Test | tests/helpers/stripe-checkout-transport.mjs | Placeholder |
| Stripe Test | tests/stripe-failed-recovery.test.mjs | Placeholder |
| Stripe Test / webhook | tests/stripe-isolated-dev.test.mjs | Placeholders |
| Stripe Test / Live negativo / webhook | tests/stripe-services.test.mjs | Placeholders |

## Dependencias y validación

Actualizaciones acotadas en package-lock.json, respetando rangos existentes:
fast-uri 3.1.8 → 3.1.9; qs 6.16.0 → 6.17.1;
zod 4.6.5 → 4.6.7 (solo desarrollo). package.json, Next y React no cambiaron.
Audit completo y runtime: 0 Critical, 0 High, 0 Moderate, 3 Low de una sola cadena.

- Suite completa: 384/384, sin fallos ni omitidos.
- TypeScript: correcto, tsc --noEmit --incremental false.
- Build saneado: correcto, npm run build -- --webpack en copia sin env.
  Avisos esperados ECONNREFUSED 127.0.0.1:54321 durante prerender.
- git diff --check y whitespace de los archivos nuevos: correctos.
- Secret scan: 225 archivos candidatos Git; ocho coincidencias sintéticas,
  ninguna clave real encontrada y ningún archivo env sensible versionado.
- Git status revisado; no hay archivos staged. Los secretos locales y el
  metadato temporal del CLI permanecen ignorados.
- Las cuatro migraciones aplicadas conservan sus hashes autorizados.

Referencias: [RLS oficial](https://supabase.com/docs/guides/database/postgres/row-level-security),
[advisory deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
[advisor search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
