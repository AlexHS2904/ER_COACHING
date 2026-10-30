# Aplicación manual de evidencia legal

Estado: **preparada, no aplicada por esta revisión**. Este procedimiento lo ejecuta
la persona autorizada antes de desplegar el código legal. Destino único:
**ER_COACHING**, ref `rysgpojjhiljrrwtjguy`.

Archivo único:
`supabase/migrations/20261029204535_legal_consent_evidence.sql`.
Versión documental que valida: `2026-10-29.2`.
SHA-256 de la versión revisada: `0e5ca1f98849e0713426dd56e72f5a6f0034077d6972d8adf52f151b62cb5a8f`.

## 1. Preflight sin escritura

1. Detener Next, worker y listener locales; coordinar una ventana sin escrituras
   administrativas ni solicitudes de clientes. No ejecutar las RPCs para probarlas
   sobre datos históricos.
2. Abrir el proyecto indicado en Supabase Dashboard y comprobar nombre y ref.
   Usar el CLI ya autenticado; no pasar claves, contraseñas o URLs de conexión
   como argumentos, ni leer archivos `.env*`.
3. Desde la raíz del repositorio, registrar la huella del archivo y consultar
   el historial. Estos comandos son de lectura:

   ```sh
   shasum -a 256 supabase/migrations/20261029204535_legal_consent_evidence.sql
   supabase --version
   supabase migration list --help
   supabase migration up --help
   supabase migration list --linked --project-ref rysgpojjhiljrrwtjguy
   ```

   Los ejemplos asumen que `supabase` es el CLI ya disponible. Si se utiliza
   mediante npm, sustituir ese prefijo por `npx --no-install supabase` en todos
   los comandos; no instalar ni actualizar paquetes para este procedimiento.
   Si no se encuentra la instalación existente, detenerse.

   Los flags anteriores se comprobaron con CLI **2.122.0**. Si la instalación
   disponible no admite `--project-ref`, detenerse y confirmar el enlace del
   proyecto antes de adaptar el comando. No instalar/actualizar el CLI a ciegas.

4. Las cuatro versiones `20261028000100`, `20261028000200`, `20261028201527`
   y `20261029012540` deben estar alineadas LOCAL = REMOTE. Todas las demás
   versiones previas también deben coincidir. Debe existir **una sola fila
   LOCAL sin REMOTE: `20261029204535`**, y ninguna fila REMOTE sin LOCAL.
   Si no se cumple, detenerse; no reparar historial ni aplicar otros archivos.
5. En SQL Editor del mismo proyecto, ejecutar únicamente los SELECT de este
   documento. Conservar sus resultados de forma privada para comparar después.

### Objetos y contratos existentes

```sql
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('bookings', 'booking_intake_forms', 'services')
ORDER BY table_name, ordinal_position;

SELECT p.oid::regprocedure AS signature,
       pg_get_function_arguments(p.oid) AS named_arguments,
       pg_get_function_result(p.oid) AS result,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proconfig,
       md5(pg_get_functiondef(p.oid)) AS definition_fingerprint
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_stripe_booking_hold_v1', 'create_booking',
    'create_package_booking', 'activate_booking_intake_v2',
    'save_stripe_finalization_v1', 'claim_stripe_checkout_v1',
    'claim_stripe_intake_reminder_v1',
    'mark_stripe_intake_reminder_dispatch_started_v1',
    'release_unstarted_stripe_intake_reminder_v1')
ORDER BY p.oid::regprocedure::text;
```

Contrastar todos los campos y tipos utilizados por el archivo íntegro. Incluye
los campos de respuestas del Intake, `current_step`, `source_type`, identidad
del invitado, tokens privados existentes y asociaciones booking/service/process.
Los resultados anteriores muestran solo metadatos, nunca valores de esas filas.

Las llamadas delegadas usan argumentos **nombrados**: deben existir los nombres
`p_service_slug`, `p_starts_at`, `p_customer_name`, `p_customer_email`,
`p_customer_phone`, `p_notes` y, cuando corresponda, `p_access_token_hash`.
`create_stripe_booking_hold_v1` debe devolver jsonb con `booking_id`;
`create_booking` debe devolver `booking_id`/`booking_reference`, y
`create_package_booking` debe devolver también `process_id`/`process_reference`.
Una diferencia de firma, nombres o retorno requiere detenerse antes de aplicar.

### Objetos nuevos: antes no deben existir; después deben estar completos

Ejecutar las tres consultas antes y después. **Antes se esperan cero filas en
cada consulta**. Si aparece cualquier objeto nuevo o aplicación parcial, no
reaplicar el archivo.

```sql
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND (
  (table_name = 'bookings' AND column_name IN (
    'legal_terms_accepted_at', 'legal_terms_version',
    'legal_privacy_notice_version', 'legal_adult_confirmed_at'))
  OR (table_name = 'booking_intake_forms' AND column_name IN (
    'sensitive_data_consent_at', 'sensitive_data_consent_version')))
ORDER BY table_name, column_name;

SELECT c.conrelid::regclass AS relation, c.conname, c.convalidated,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN ('public.bookings'::regclass,
                    'public.booking_intake_forms'::regclass)
  AND c.conname IN ('bookings_legal_acceptance_complete',
                    'intake_sensitive_consent_complete')
ORDER BY c.conname;

SELECT p.oid::regprocedure AS signature, pg_get_function_result(p.oid) AS result,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proconfig,
       NOT EXISTS (
         SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS public_cannot_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'assert_current_legal_acceptance_v1', 'record_booking_legal_acceptance_v1',
  'create_stripe_booking_hold_with_legal_v1', 'create_booking_with_legal_v1',
  'create_package_booking_with_legal_v1', 'save_intake_with_legal_consent_v1')
ORDER BY p.oid::regprocedure::text;
```

### Baseline de RLS, policies y grants existentes

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'bookings', 'booking_intake_forms', 'booking_payment_attempts', 'stripe_events')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename IN (
  'bookings', 'booking_intake_forms', 'booking_payment_attempts', 'stripe_events')
ORDER BY tablename, policyname;

SELECT p.oid::regprocedure AS signature, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%stripe%' OR p.proname IN (
    'create_booking', 'create_package_booking', 'activate_booking_intake_v2'))
ORDER BY p.oid::regprocedure::text;
```

### Baseline de filas sin revelar PII ni tokens

La consulta devuelve solo conteos y huellas técnicas internas; no publicar sus
valores. Excluye las seis columnas nuevas para que la representación de filas
históricas sea comparable antes y después del DDL. Conservar también los
resultados de metadata anteriores. Sin una ventana sin escrituras concurrentes
no atribuir diferencias de negocio a esta migración.

```sql
SELECT 'bookings' AS relation, count(*) AS rows,
       md5(coalesce(jsonb_agg(to_jsonb(b) - ARRAY[
         'legal_terms_accepted_at', 'legal_terms_version',
         'legal_privacy_notice_version', 'legal_adult_confirmed_at']
         ORDER BY b.id), '[]'::jsonb)::text) AS fingerprint
FROM public.bookings b
UNION ALL
SELECT 'booking_intake_forms', count(*),
       md5(coalesce(jsonb_agg(to_jsonb(f) - ARRAY[
         'sensitive_data_consent_at', 'sensitive_data_consent_version']
         ORDER BY f.id), '[]'::jsonb)::text)
FROM public.booking_intake_forms f
UNION ALL
SELECT 'booking_payment_attempts', count(*),
       md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)::text)
FROM public.booking_payment_attempts a
UNION ALL
SELECT 'stripe_events', count(*),
       md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.stripe_event_id), '[]'::jsonb)::text)
FROM public.stripe_events e;
```

## 2. Aplicar únicamente después de un preflight conforme

El comando oficial `migration up --linked` aplica **todas las pendientes**.
CLI 2.122.0 no ofrece aquí selección por versión ni `--dry-run`.
Por eso solo es admisible tras comprobar que la lista contiene exactamente una
pendiente, la legal, y mantener el árbol de migraciones sin cambios entre ambos
comandos. No usar `--include-all`, `--yes`, `db push` ni reparar el historial.

Repetir inmediatamente el listado y comprobar que el SHA-256 coincide tanto
con el registrado al inicio como con la versión revisada indicada arriba:

```sh
supabase migration list --linked --project-ref rysgpojjhiljrrwtjguy
shasum -a 256 supabase/migrations/20261029204535_legal_consent_evidence.sql
```

**Solo la persona autorizada, con el preflight conforme, ejecuta esta escritura:**

```sh
supabase migration up --linked --project-ref rysgpojjhiljrrwtjguy
```

Debe anunciar únicamente `20261029204535_legal_consent_evidence.sql` y registrar
la versión canónica `20261029204535`. No se ejecuta ninguna migración anterior.
Si el resultado contiene un error, es ambiguo o anuncia otro archivo: detenerse,
conservar el error y observar el estado con SELECT/listado. No reintentar ni
reparar automáticamente. La transacción explícita del archivo protege sus
cambios; el resultado real y el historial deben comprobarse igualmente.

## 3. Verificación posterior exclusivamente de lectura

Repetir todas las consultas del preflight y el listado:

```sh
supabase migration list --linked --project-ref rysgpojjhiljrrwtjguy
```

Resultado exigido:

- Las cinco migraciones indicadas están alineadas LOCAL = REMOTE. Las cuatro
  previas no se reaplicaron ni cambiaron de versión.
- Seis columnas nuevas, todas nullable y sin default: tres `timestamptz`
  (`legal_terms_accepted_at`, `legal_adult_confirmed_at`,
  `sensitive_data_consent_at`) y tres `text`.
- Dos CHECKs validados, con definición igual a la del archivo: evidencia toda
  NULL o completa, con versiones no vacías. No hay backfill.
- Exactamente estas seis firmas nuevas, sin sobrecargas adicionales:

  ```text
  assert_current_legal_acceptance_v1(jsonb) → void
  record_booking_legal_acceptance_v1(uuid,text,jsonb) → boolean
  create_stripe_booking_hold_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) → jsonb
  create_booking_with_legal_v1(text,timestamptz,text,text,text,text,jsonb) → TABLE(booking_id uuid, booking_reference text)
  create_package_booking_with_legal_v1(text,timestamptz,text,text,text,text,text,jsonb) → TABLE(booking_id uuid, booking_reference text, process_id uuid, process_reference text)
  save_intake_with_legal_consent_v1(uuid,text,jsonb,integer,boolean,text,boolean) → jsonb
  ```

- Las seis son owner `postgres`, `security_definer = false` (SECURITY INVOKER),
  `search_path=pg_catalog, pg_temp`; `public_cannot_execute=true`,
  `anon_execute=false`, `authenticated_execute=false`, `service_role_execute=true`.
  Comparar los seis cuerpos completos con el archivo; `pg_get_functiondef`
  normaliza el encabezado, por lo que no exigir identidad byte a byte del DDL.
- Las definiciones y firmas anteriores siguen iguales; RLS, policies y grants
  de tablas/RPCs previas coinciden con el baseline. La consulta de ACLs incorpora
  ahora las funciones legales nuevas que contienen `stripe` en el nombre; esas
  incorporaciones son las únicas diferencias esperadas en ese listado.
- Los cuatro conteos y huellas de filas anteriores coinciden exactamente.
  Las seis columnas nuevas están NULL en todo histórico; comprobarlo sin
  devolver filas de clientes:

  ```sql
  SELECT
    (SELECT count(*) FROM public.bookings WHERE
      legal_terms_accepted_at IS NOT NULL OR legal_terms_version IS NOT NULL OR
      legal_privacy_notice_version IS NOT NULL OR legal_adult_confirmed_at IS NOT NULL)
      AS bookings_with_legal_evidence,
    (SELECT count(*) FROM public.booking_intake_forms WHERE
      sensitive_data_consent_at IS NOT NULL OR sensitive_data_consent_version IS NOT NULL)
      AS intakes_with_legal_evidence;
  ```

  Ambos resultados deben ser cero durante esta ventana, antes de habilitar
  tráfico de la nueva aplicación. No se crearon reservas, intakes ni pagos.

Aplicar el archivo añade columnas/CHECKs/RPCs/permisos, pero **no ejecuta el DML
incluido dentro de los cuerpos de las RPCs**, ni modifica filas históricas,
ni dispara recordatorios/correos/Calendar. No cambia las funciones financieras
previas. El código falla de forma cerrada si faltan las nuevas RPCs.

La comprobación estructural no equivale a haber ejecutado nuevas operaciones
legales. Tras verificar estructura y antes de habilitar tráfico, comprobar en
un entorno de pruebas autorizado la atomicidad, consentimiento falso/ausente,
versiones incorrectas, edad inválida, aislamiento de token y segundo submit.
La revisión actual no ejecutó este SQL ni afirma haber probado esos locks en DB.

Referencias oficiales consultadas: [migration list](https://supabase.com/docs/reference/cli/supabase-migration-list),
[migration up](https://supabase.com/docs/reference/cli/supabase-migration-up)
y [changelog](https://supabase.com/changelog). Las opciones exactas se verificaron
también mediante `--help` del CLI instalado, sin acceder al proyecto remoto.
