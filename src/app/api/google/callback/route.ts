import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getGoogleOAuthClient } from "@/lib/google/oauth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
) {
  const code =
    request.nextUrl.searchParams.get(
      "code",
    );

  const state =
    request.nextUrl.searchParams.get(
      "state",
    );

  const oauthError =
    request.nextUrl.searchParams.get(
      "error",
    );

  if (oauthError) {
    return NextResponse.json(
      {
        error:
          "Google no autorizó la conexión.",
        details: oauthError,
      },
      {
        status: 400,
      },
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      {
        error:
          "Respuesta de Google incompleta.",
      },
      {
        status: 400,
      },
    );
  }

  /* =========================================
     VALIDAR STATE
  ========================================== */

  const cookieStore =
    await cookies();

  const savedState =
    cookieStore.get(
      "google_oauth_state",
    )?.value;

  if (
    !savedState ||
    savedState !== state
  ) {
    return NextResponse.json(
      {
        error:
          "La solicitud OAuth no es válida.",
      },
      {
        status: 400,
      },
    );
  }

  cookieStore.delete(
    "google_oauth_state",
  );

  /* =========================================
     INTERCAMBIAR CODE POR TOKENS
  ========================================== */

  const oauth2Client =
    getGoogleOAuthClient();

  const { tokens } =
    await oauth2Client.getToken(
      code,
    );

  if (!tokens.refresh_token) {
    return NextResponse.json(
      {
        error:
          "Google no devolvió un refresh token. Vuelve a conectar la cuenta y autoriza el acceso.",
      },
      {
        status: 400,
      },
    );
  }

  /* =========================================
     GUARDAR EN SUPABASE
  ========================================== */

  const supabase =
    getSupabaseAdmin();

  const {
    error: databaseError,
  } = await supabase
    .from(
      "google_calendar_connection",
    )
    .upsert(
      {
        id: 1,

        refresh_token:
          tokens.refresh_token,

        scope:
          tokens.scope ?? null,

        token_type:
          tokens.token_type ??
          null,

        expiry_date:
          tokens.expiry_date ??
          null,
      },
      {
        onConflict: "id",
      },
    );

  if (databaseError) {
    console.error(
      "Error saving Google token:",
      databaseError,
    );

    return NextResponse.json(
      {
        error:
          "No fue posible guardar la conexión con Google Calendar.",
      },
      {
        status: 500,
      },
    );
  }

  /* =========================================
     REDIRECCIÓN
  ========================================== */

  return NextResponse.redirect(
    new URL(
      "/reservar?google=connected",
      request.url,
    ),
  );
}