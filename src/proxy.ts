import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";
import { enforcePublicAbuse, type PublicAbuseGroup } from "@/lib/security/public-abuse";

/*
  Refresca la sesión de Supabase y guarda las cookies nuevas.

  Los Server Components no pueden escribir cookies, así que sin
  este archivo la sesión del admin se renueva mal y puede cerrarse
  sola. OJO: esto NO es la autorización; cada página y cada API
  siguen validando por su cuenta.
*/
export async function proxy(
  request: NextRequest,
) {
  // Status polling, webhooks and the worker keep their existing authorization.
  const privatePath = request.nextUrl?.pathname.match(/^\/(formulario|proceso|resena)\/([^/]+)(?:\/|$)/);
  if (privatePath && (request.method === "GET" || request.method === "HEAD")) {
    const groups: Record<string, PublicAbuseGroup> = {
      formulario: "intake-read", proceso: "process-read", resena: "review-read",
    };
    let token: string | undefined;
    try { token = decodeURIComponent(privatePath[2]); } catch { /* The route rejects malformed access. */ }
    const limited = await enforcePublicAbuse(request, groups[privatePath[1]], token);
    if (limited) return limited;
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/:path*",
    "/auth/:path*",
    "/formulario/:path*",
    "/proceso/:path*",
    "/resena/:path*",
  ],
};
