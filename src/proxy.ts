import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

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
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/:path*",
    "/auth/:path*",
  ],
};
