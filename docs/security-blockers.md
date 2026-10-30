# Cierre de bloqueos antes de Legal

Estado: **READY FOR LEGAL**. Código preparado y validado; controles manuales
confirmados por el responsable del proyecto el 2026-10-29.
Este cierre permite continuar con Legal; no certifica un deploy ni una prueba
del rate limiting en producción.
No repetir la auditoría completa ni el E2E.
No hay cambios de migraciones, autenticación mayor, Live, commit, push o deploy.

## Protección de abuso

Implementado `src/lib/security/public-abuse.ts` con `@vercel/firewall` 1.2.6,
sin Redis, tablas, migraciones ni servicio adicional. El equipo usa Hobby:
una regla `er-public-abuse-v1`, Fixed Window, 10 solicitudes / 60 segundos.
Cada grupo tiene contadores independientes: creación de reservas, creación de
Checkout, recuperación de Checkout, contacto, borrador Intake, submission Intake,
sesiones de proceso, reseñas, disponibilidad y lecturas privadas de
formulario/proceso/reseña. Creación y recovery no consumen el mismo contador.

Cada operación exige primero cuota por IP y después, cuando corresponde, cuota
por recurso/identidad. Cambiar booking_reference/email/token no elude la cuota
IP. Las claves son HMAC-SHA256 con un secreto server-only; no se envían al
proveedor emails, tokens, cookies ni URLs privadas. Solo se pasan al SDK el
host de `VERCEL_URL` y la IP que Vercel proporciona en `x-vercel-forwarded-for`.
No se confía en el Host ni en forwarding headers alternativos del cliente.

Exceso devuelve 429 genérico, no-store y Retry-After: 60. Regla ausente,
configuración inválida o fallo del proveedor devuelve 503 genérico antes de
operaciones costosas. No hay fallback en memoria. Desarrollo local no llama
al proveedor; los tests usan transporte mock. Webhooks, worker y polling de
confirmación conservan su autorización sin consumir estas cuotas.
Los contadores son por región de Vercel, no una cuota global estricta ni una
defensa completa contra bots distribuidos. Hobby comparte el mismo umbral entre
grupos, pero no sus contadores. Intake guarda al avanzar de paso, no por tecla.

### Configuración manual y próximo deploy

Confirmado por el responsable del proyecto: Firewall publicado con
`er-public-abuse-v1` y `RATE_LIMIT_SECRET` configurado en Vercel. No se leyeron
ni registraron valores. Se conserva la referencia de configuración para el
próximo deploy autorizado:

1. Proyecto Vercel → Firewall → Configure → New Rule. Condición
   `@vercel/firewall`; Rate Limit ID `er-public-abuse-v1`; Fixed Window;
   10 requests / 60 seconds; acción de exceso 429. Guardar, Review Changes y
   Publish. Si la única regla Hobby ya está ocupada, detenerse y reportarlo:
   no borrar reglas ni cambiar de plan automáticamente.
2. Settings → Environment Variables: añadir `RATE_LIMIT_SECRET` nuevo,
   aleatorio (al menos 32 bytes; por ejemplo 64 caracteres hex), Sensitive y
   server-only, Production/Preview. Nunca NEXT_PUBLIC ni reutilizar otra clave.
   No pegar el valor en chat o documentación.
3. Exponer las variables de sistema de Vercel para disponer de `VERCEL` y
   `VERCEL_URL`. El SDK consulta la URL del deployment. Si está protegida
   (también ocurre con Standard Protection en deployments de producción),
   Settings → Deployment Protection → Protection Bypass for Automation:
   configurar el bypass oficial y su `VERCEL_AUTOMATION_BYPASS_SECRET`
   server-only. El SDK lo adjunta automáticamente; no pasar cookies privadas.
4. La regla fue publicada manualmente por el responsable. Esta revisión no
   ejecutó cambios remotos ni deploy: el guard de aplicación estará operativo
   en el hosting con el siguiente deploy aprobado y su configuración requerida.

## Logging

La aplicación ya restringe logs de OAuth, booking e Intake a metadata técnica.
Se cerraron los cuatro logs raw restantes del endpoint de contacto usando el
helper existente. Cinco regresiones nuevas más ocho de Google: 13/13 PASS.
No se cambió el comportamiento de envío ni las respuestas de contacto.

Next logging.incomingRequests controla el logger de desarrollo, no los metadatos
de acceso del proveedor. Vercel Runtime Logs puede incluir Request Path y Search
Params; no se afirma que la aplicación elimine esos metadatos internos.

Configuración manual confirmada por el responsable:

- Build Logs and Source Protection: Enabled. Protege acceso; no redacta las
  URLs de runtime.
- Git Fork Protection: Enabled.
- Vercel Drains: ninguno configurado; no hay destinos externos que revisar.

No se exige demostrar físicamente la retención interna de Vercel en esta fase.

## Supabase Auth

Leaked Password Protection no está disponible en el plan actual; requiere Pro.
Se registra como hardening opcional limitado por plan y no bloquea Legal por
decisión explícita del responsable. No se contrató un plan ni se cambiaron
políticas desde esta revisión.

Controles compensatorios configurados y confirmados por el responsable:

- Longitud mínima de contraseña: 12 caracteres.
- Requiere minúsculas, mayúsculas, dígitos y símbolos.
- Secure email change: habilitado.
- Secure password change: habilitado.
- Require current password when updating: habilitado.
- Email OTP: 8 dígitos.

Estos controles no comprueban si una contraseña aparece en filtraciones;
esa capacidad queda documentada como mejora opcional al disponer del plan.

## Validación local de este cierre

- Suite completa: 436/436; seguridad relevante: 97/97.
- 52 tests nuevos: 28 del guard, 19 de rutas y 5 de redacción de contacto.
- TypeScript y build saneado sin `.env*`: PASS. El build genera avisos esperados
  por el Supabase local ficticio no conectado; no usa el proyecto real.
- Los cuatro archivos de migración aplicados mantienen sus hashes autorizados.
- `git diff --check`: PASS. Escaneo de 230 candidatos Git: solo literales
  sintéticos de tests, ninguna clave real encontrada; `.env.local`,
  `.env.stripe-test` y `supabase/.temp/cli-latest` siguen ignorados.
- Dependency audit: 0 Critical, 0 High, 0 Moderate; 3 entradas Low de la misma
  cadena `@react-email/render → html-to-text → deepmerge`.
- La configuración manual fue confirmada por el responsable. Los tests de
  límites usan un transporte mock; no se ejecutó una prueba del guard desplegado
  ni se autoriza deploy en este cierre.

Veredicto final: **READY FOR LEGAL**. Los bloqueos de esta fase están cerrados.
CSP, deepmerge Low y Leaked Password Protection limitado por plan quedan
documentados como hardening posterior y no bloquean Legal. La validación de
operación del guard en hosting corresponde al próximo deploy autorizado.

## Low fuera de los bloqueos para Legal

- CSP: conservar el hardening actual. Completar script/default-src requiere
  nonce/hash y trabajo Next separado; no hacer un cambio grande a ciegas.
- deepmerge: mantener la cadena Low documentada. La auditoría actual no encontró
  explotación directa relevante en este runtime ni Critical/High/Medium en esa
  cadena. No aplicar upgrades mayores o transitivos arriesgados por esta advisory.

## Referencias oficiales

- [Vercel rate limiting SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)
- [Vercel límites por plan](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel Runtime Logs](https://vercel.com/docs/logs/runtime)
- [Vercel protección de logs/source](https://vercel.com/docs/project-configuration/security-settings)
- [Vercel bypass de automatización](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
- [Vercel Drains](https://vercel.com/docs/drains/using-drains)
- [Supabase contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [Email Auth del proyecto](https://supabase.com/dashboard/project/rysgpojjhiljrrwtjguy/auth/providers?provider=Email)
