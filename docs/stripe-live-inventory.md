# Inventario local — Stripe individual y paquetes

Ver [arquitectura, configuración y autorización](stripe-live-launch.md). La migración ya está aplicada; este inventario corresponde al código para desplegar con ventas pausadas. Ningún archivo `.env` forma parte de este inventario.

## Aplicación

- `src/app/api/admin/processes/[id]/regenerate-access/route.ts` — modificado.
- `src/app/api/bookings/[id]/cancel/route.ts` — modificado.
- `src/app/api/bookings/[id]/reschedule/route.ts` — modificado.
- `src/app/api/bookings/stripe/checkout/route.ts` — modificado.
- `src/app/api/intake/[token]/route.ts` — modificado.
- `src/app/api/internal/stripe/process-pending/route.ts` — modificado.
- `src/app/api/processes/[token]/sessions/route.ts` — modificado.
- `src/app/api/webhooks/stripe/route.ts` — modificado.
- `src/app/formulario/[token]/page.tsx` — modificado.
- `src/app/proceso/[token]/agendar/page.tsx` — modificado.
- `src/app/proceso/[token]/page.tsx` — modificado.
- `src/app/reservar/page.tsx` — modificado.
- `src/components/admin/RegenerateProcessAccessButton.tsx` — modificado.
- `src/components/publico/proceso/ProcessSessionsScheduler.tsx` — modificado.
- `src/lib/bookings/finalize-paid-booking.ts` — modificado.
- `src/lib/bookings/intake-destination.ts` — modificado.
- `src/lib/bookings/payment-policy.ts` — modificado.
- `src/lib/coaching/get-process-by-token.ts` — modificado.
- `src/lib/coaching/process-access.ts` — modificado.
- `src/lib/intake/activate-booking-intake.ts` — modificado.
- `src/lib/intake/get-intake-by-token.ts` — modificado.
- `src/lib/intake/process-stripe-reminders.ts` — modificado.
- `src/lib/stripe/checkout-return.ts` — modificado.
- `src/lib/stripe/checkout.ts` — modificado.
- `src/lib/stripe/expire-hold.ts` — modificado.
- `src/lib/stripe/process-pending.ts` — modificado.
- `src/lib/stripe/server.ts` — modificado.
- `src/lib/stripe/webhook.ts` — modificado.
- `src/lib/bookings/site-origin.ts` — nuevo.
- `src/lib/bookings/stripe-booking-changes.ts` — nuevo.
- `src/lib/coaching/process-entitlement.ts` — nuevo.

## Migración preparada

- `supabase/migrations/20261103035102_stripe_live_single_and_package_lifecycle.sql` — nuevo.

## Scripts

- `scripts/build-stripe-test.mjs` — modificado.
- `scripts/dev-stripe-test.mjs` — modificado.

## Pruebas y fixtures

- `tests/booking-payment-guards.test.mjs` — modificado.
- `tests/helpers/stripe-checkout-transport.mjs` — modificado.
- `tests/legal-booking-acceptance.test.mjs` — modificado.
- `tests/legal-pages-delivery.test.mjs` — modificado.
- `tests/security-abuse-routes.test.mjs` — modificado.
- `tests/security-booking-idor.test.mjs` — modificado.
- `tests/security-google-logging.test.mjs` — modificado.
- `tests/stripe-booking-status.test.mjs` — modificado.
- `tests/stripe-checkout-return.test.mjs` — modificado.
- `tests/stripe-expiration-reconciliation.test.mjs` — modificado.
- `tests/stripe-failed-recovery.test.mjs` — modificado.
- `tests/stripe-intake-finalization.test.mjs` — modificado.
- `tests/stripe-isolated-dev.test.mjs` — modificado.
- `tests/stripe-public-flow.test.mjs` — modificado.
- `tests/stripe-return-postgres.test.mjs` — modificado.
- `tests/stripe-services.test.mjs` — modificado.
- `tests/fixtures/stripe-live-package-schema.sql` — nuevo.
- `tests/helpers/stripe-live-postgres.mjs` — nuevo.
- `tests/helpers/stripe-runtime-fixture.mjs` — nuevo.
- `tests/stripe-live-booking-changes.test.mjs` — nuevo.
- `tests/stripe-live-postgres.test.mjs` — nuevo.
- `tests/stripe-live-processes.test.mjs` — nuevo.
- `tests/stripe-live-runtime.test.mjs` — nuevo.
- `tests/stripe-live-worker.test.mjs` — nuevo.

## Documentación

- `docs/stripe-local-test.md` — modificado.
- `docs/stripe-live-launch.md` — nuevo.

Este inventario también es un documento nuevo. Las migraciones previamente versionadas se compararon byte por byte contra HEAD: sin cambios. `.env.local`, `.env.stripe-test` y `supabase/.temp/cli-latest` permanecen ignorados; no incluirlos. Los logs de pruebas/build residen fuera del repositorio.

## Ajuste comercial de vigencia, cancelación e inasistencia

Archivos de esta pasada (sobre el working tree anterior):

- `supabase/migrations/20261103035102_stripe_live_single_and_package_lifecycle.sql`: aplicada y verificada; nombre local alineado al timestamp remoto sin cambios de SQL.
- `src/lib/legal/documents.ts`, `src/lib/legal/acceptance.ts`, `src/app/terminos-y-condiciones/page.tsx`: versión contractual y cláusulas necesarias; privacidad sin cambios.
- `src/lib/stripe/server.ts`: catálogo del paquete de seis sesiones de 90 minutos.
- `src/lib/coaching/process-entitlement.ts`, `src/lib/coaching/get-process-by-token.ts`: vigencia y derecho de reposición.
- `src/app/api/processes/[token]/sessions/route.ts`, `src/app/proceso/[token]/page.tsx`: bloqueo y consulta privada sin borrar datos.
- `src/components/publico/servicios/ServicesCatalog.tsx`, `src/components/publico/reservar/BookingFlow.tsx`: condiciones visibles antes de contratar.
- `src/app/api/bookings/[id]/cancel/route.ts`, `src/lib/bookings/stripe-booking-changes.ts`: resolución por admin activo usando la ruta existente.
- `src/app/admin/(protected)/reservas/page.tsx`, `src/components/admin/ReservationsClient.tsx`: acciones en la gestión de reservas existente.
- `src/lib/bookings/finalize-paid-booking.ts`: una reposición de la primera sesión también es una sesión cubierta, sin otro cargo ni Intake nuevo.
- `tests/fixtures/stripe-live-package-schema.sql`, `tests/stripe-live-postgres.test.mjs`, `tests/stripe-intake-finalization.test.mjs`, `tests/package-conditions.test.mjs`: fixtures y pruebas focalizadas.
- `docs/stripe-live-launch.md` y este inventario: condiciones definitivas y resultados.

No se añadieron tablas, workers, dashboards ni notificaciones nuevas. Suite existente: 848/848; comprobación focal final: 148/148 (subconjunto), sin omisiones.
