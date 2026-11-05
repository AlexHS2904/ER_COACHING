# Servicios individuales dinámicos: aplicación y reversión

Migración aplicada y verificada en ER_COACHING el 4 de noviembre de 2026:
`20261104212623_dynamic_services_publication_and_intake.sql`. LOCAL = REMOTE.
SHA-256: `2e823f15b193bcf7d9172dc204aa07565d604a0dc02a7d01d2c75baa50a39904`.
Mantener `PAID_BOOKINGS_ENABLED=false`. No volver a aplicar esta migración.

## Contrato

- `services.published NOT NULL DEFAULT true` conserva la visibilidad del catálogo existente.
- `services.requires_intake NOT NULL DEFAULT false`; solo el servicio existente `sesion-1-1`, individual de una sesión, se configura como obligatorio. Un CHECK impide habilitar Intake para otros servicios. El panel muestra esta condición sin permitir editarla.
- `bookings.requires_intake_snapshot` es nullable, sin default ni backfill. Los holds nuevos congelan `true` para el 1:1 obligatorio y `false` para los demás individuales y paquetes nuevos. Las sesiones cubiertas heredan el snapshot de la compra.
- `NULL` conserva el contrato anterior, incluido el Intake compartido de paquetes históricos. Despublicar o archivar no elimina el acceso/finalización de una compra ya pagada.
- Un Intake activo/vigente con tokens válidos, o enviado con `submitted_at`, satisface la finalización del 1:1. No exige enviar el formulario antes de la redirección.

## Preflight remoto completado

El preflight y la verificación posterior se completaron mediante lecturas del proyecto `rysgpojjhiljrrwtjguy`.
Se preservaron 31 bookings, 2 procesos, 10 attempts, 10 intakes y 6 eventos Stripe mediante comparación de huellas.
La única actualización prevista fue el metadato de Intake del servicio 1:1 y su `updated_at`.
El historial se registró con el CLI oficial, sin reparaciones. La lista siguiente conserva el procedimiento previo de referencia:

1. Confirmar historial y cuerpos de las migraciones previas hasta `20261103035102`; la nueva debe estar ausente. Calcular SHA-256 del archivo que se autorizará.
2. Capturar internamente conteos y huellas determinísticas de bookings, procesos, attempts, eventos e intakes, sin mostrar datos personales ni tokens. Los procesos de escritura deben estar detenidos o sus cambios concurrentes deben poder distinguirse de la aplicación.
3. Confirmar ausencia de las tres columnas nuevas, de `booking_requires_intake_v1`, `get_admin_available_slots_v1`, `create_stripe_booking_hold_with_legal_v3`, de los nombres internos `dynamic_available_slots_base_v1` / `dynamic_create_booking_base_v1` y de las dos nuevas restricciones/policies.
4. Confirmar `services` con UUID `id`, slug único, booleanos `active/booking_enabled/requires_quote`, tipo single/package, precio numérico, duración y número de sesiones; `admin_users(user_id uuid,active boolean)`. Debe existir exactamente un `sesion-1-1` single/1. Revisar triggers de services: el único UPDATE de aplicación afecta a sus metadatos y puede actualizar su `updated_at`.
5. Inspeccionar firmas, argumentos, retornos, cuerpos y dependencias de `get_available_slots(text,date)` y `create_booking(text,timestamptz,text,text,text,text)`. Deben devolver conjuntos; la segunda debe generar un booking pending/pending con snapshots y validar disponibilidad. El cálculo interno de disponibilidad debe poder servir un servicio privado activo y sesiones ya pagadas de un paquete despublicado. Revisar restricciones actuales de actividad/publicación en ese cuerpo; detenerse si impiden este contrato.
6. La migración conserva las implementaciones instaladas bajo nombres internos y envuelve las dos RPCs del esquema `public`. Obtiene el retorno mediante `pg_get_function_result`, conservando columnas adicionales reales como `local_time`. En el cuerpo interno de creación sustituye la llamada calificada `public.get_available_slots(` por la versión interna; comprobar que esa llamada existe con esa forma y que no hay dependencias SQL preanalizadas que eludan los nuevos wrappers. Detenerse ante diferencias.
7. Comparar las RPCs reemplazadas con las instaladas y confirmar columnas/tipos usados: contexto y ledger Stripe, vigencia/resoluciones de paquetes, evidencia legal, campos de Intake y leases de finalización/reminder. Confirmar las versiones legales vigentes `2026-10-31.1` y `2026-10-29.2`.
8. Revisar grants efectivos de tabla/columna, RLS, policies y owners. Las nuevas columnas no deben introducir acceso de escritura de navegador. La policy restrictiva exige activo/publicado para anon/authenticated aunque otra policy permisiva exista. El admin autorizado usa el cliente servidor; no se concede acceso RLS administrativo al navegador.

Consultas auxiliares (solo lectura):

```sql
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
  ('services','bookings','booking_intake_forms','coaching_processes','admin_users')
ORDER BY table_name,ordinal_position;

SELECT p.oid::regprocedure,pg_get_function_result(p.oid),
  pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname LIKE '%stripe%' OR p.proname IN
  ('create_booking','get_available_slots','activate_booking_intake_v2','save_intake_with_legal_consent_v1'));

SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename='services';
```

## Impacto y secuencia de aplicación

Aplicar solo después del preflight remoto y autorización expresa, dentro de la transacción incluida. No ejecutar otros archivos pendientes ni `db push`.

DDL: tres columnas aditivas, CHECK de exclusividad, policies de publicación, wrappers de disponibilidad/creación, helper de elegibilidad, hold v3 y reemplazos de las RPCs de compatibilidad, finalización, activación/guardado de Intake, sesiones de paquete y reminders. ACL explícitas: postgres owner, search_path fijo; RPCs sensibles solo service_role. Los dos cuerpos internos no son ejecutables directamente ni por service_role. La disponibilidad pública pasa por el API y su rate limit; `get_available_slots` sigue ejecutable exclusivamente por service_role, sin permisos de PUBLIC/anon/authenticated. `create_booking` conserva los dos parámetros opcionales con DEFAULT NULL.

Único DML al aplicar: actualizar `requires_intake=true` en el servicio 1:1 existente. No hay INSERT/UPDATE/DELETE de bookings, procesos, pagos, eventos o intakes al aplicar; las escrituras dentro de los cuerpos de función solo ocurren cuando la aplicación las invoca. No se crean reminders ni servicios técnicos. Una repetición accidental falla y revierte la transacción; no repararla automáticamente.

Después: comparar huellas históricas excluyendo únicamente la nueva columna nullable; confirmar `NULL` en todos los bookings anteriores. Comparar firmas, bodies, owners, search_path, ACL, RLS y ausencia de nuevos permisos de navegador. Desplegar el código compatible después del esquema. Mantener ventas públicas pausadas.

La prueba privada posterior podrá crear un servicio single/1, 90 minutos, $10 MXN, activo/reservable y `published=false` desde el panel. Solo `/admin/reservas?checkoutLiveTest=1`, admin activo, Live y origen canónico pueden reservarlo. No es una excepción al importe: el ledger sigue tomando el precio del servicio y verificando su snapshot. No produce derechos de paquete ni Intake. Esta implementación no creó ese servicio ni realizó cargos.

## Reversión no destructiva

Antes de aplicación, basta con no desplegar/aplicar. Ante fallo SQL, verificar rollback transaccional y detenerse.

Después de aplicación, cerrar nuevas compras privadas/públicas y conservar el esquema aditivo y el código de recuperación/finalización para compras ya pagadas. No borrar columnas, snapshots, holds, tokens ni derechos. No volver al finalizer que exige Intake para toda compra: rompería reservas nuevas con snapshot false. Archivar/despublicar un servicio solo impide ventas nuevas; no es un rollback de pagos. Si fuera necesario revertir RPCs o snapshots después de existir compras dinámicas, preparar y autorizar otra migración de compatibilidad, nunca un down destructivo ni modificar migraciones aplicadas.

## Verificación local

`tests/dynamic-services-postgres.test.mjs` aplica la migración a PostgreSQL temporal aislado, con historial previo y proveedores simulados. Comprueba preservación de históricos, privacidad/RLS/grants, precios reales, pago obligatorio, idempotencia/concurrencia, snapshot congelado, finalización con/sin Intake, paquetes de seis sesiones/90 días y compatibilidad de paquetes históricos.

Las suites dynamic de admin/availability/Intake y la suite de Checkout administrativo cubren autorización real del handler, intención falsificada, publicación, rutas privadas, ausencia de CTA/redirect y rechazo de formularios accidentales. Ninguna prueba llama Stripe/Supabase/Calendar/Resend remotos.

## Inventario de archivos

Aplicación:

- Catálogo/admin: `src/lib/data/services.ts`, `src/components/admin/ServicesManager.tsx`, `src/app/admin/(protected)/servicios/page.tsx`, `src/app/api/admin/services/route.ts`, `src/app/api/admin/services/[id]/route.ts`.
- Reserva/visibilidad: `src/app/admin/(protected)/reservas/page.tsx`, `src/components/publico/reservar/BookingFlow.tsx`, `src/app/api/availability/route.ts`, `src/lib/data/availability.ts`, `src/app/api/bookings/route.ts`.
- Checkout: `src/lib/bookings/payment-policy.ts`, `src/lib/stripe/server.ts`, `src/app/api/bookings/stripe/checkout/route.ts`, `src/lib/stripe/checkout-return.ts`.
- Intake/finalización: `src/lib/bookings/finalize-paid-booking.ts`, `src/lib/bookings/intake-destination.ts`, `src/lib/bookings/confirmation-state.ts`, `src/lib/intake/activate-booking-intake.ts`, `src/lib/intake/get-intake-by-token.ts`, `src/app/reservar/confirmada/page.tsx`.
- Intake administrativo: `src/components/admin/BookingPaymentPanel.tsx`, `src/components/admin/ReservationsClient.tsx`, `src/app/admin/(protected)/reservas/[id]/formulario/page.tsx`, `src/app/api/admin/intake/by-booking/[bookingId]/link/route.ts`.

Pruebas nuevas: `tests/dynamic-service-admin.test.mjs`, `tests/dynamic-services-availability.test.mjs`, `tests/dynamic-services-intake.test.mjs`, `tests/dynamic-services-postgres.test.mjs`.

Pruebas/fixtures adaptados: `tests/helpers/stripe-runtime-fixture.mjs`, `tests/booking-payment-guards.test.mjs`, `tests/legal-booking-acceptance.test.mjs`, `tests/stripe-admin-live-checkout.test.mjs`, `tests/stripe-admin-live-page.test.mjs`, `tests/stripe-public-flow.test.mjs`, `tests/stripe-failed-recovery.test.mjs`, `tests/stripe-return-postgres.test.mjs`.

Otros archivos nuevos: la migración identificada al inicio y este documento. Ninguna migración aplicada fue editada. No hay scripts, workers, variables de entorno ni tablas nuevas.
