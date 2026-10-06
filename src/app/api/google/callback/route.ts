import {
  NextRequest,
  NextResponse,
} from "next/server";

import { cookies } from "next/headers";

import {
  getGoogleOAuthClient,
} from "@/lib/google/oauth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

import {
  createClient,
} from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
) {
  /* =========================================
     VALIDAR ADMINISTRADOR
  ========================================== */

  const authSupabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await authSupabase.auth.getClaims();

  const userId =
    claimsData?.claims?.sub;

  if (!userId) {
    return NextResponse.redirect(
      new URL(
        "/admin/login",
        request.url,
      ),
    );
  }

  const {
    data: admin,
    error: adminError,
  } = await authSupabase
    .from("admin_users")
    .select(`
      user_id,
      role,
      active
    `)
    .eq(
      "user_id",
      userId,
    )
    .maybeSingle();

  if (
    adminError ||
    !admin ||
    !admin.active
  ) {
    await authSupabase.auth.signOut();

    return NextResponse.redirect(
      new URL(
        "/admin/login",
        request.url,
      ),
    );
  }

  /* =========================================
     LEER RESPUESTA DE GOOGLE
  ========================================== */

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
    return NextResponse.redirect(
      new URL(
        `/admin?google=error&reason=${encodeURIComponent(
          oauthError,
        )}`,
        request.url,
      ),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(
        "/admin?google=invalid",
        request.url,
      ),
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

  const expectedState =
    `${userId}:${state}`;

  if (
    !savedState ||
    savedState !== expectedState
  ) {
    return NextResponse.redirect(
      new URL(
        "/admin?google=invalid",
        request.url,
      ),
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

  let tokens;

  try {
    const response =
      await oauth2Client.getToken(
        code,
      );

    tokens =
      response.tokens;
  } catch (error) {
    console.error(
      "Google OAuth token error:",
      error,
    );

    return NextResponse.redirect(
      new URL(
        "/admin?google=token_error",
        request.url,
      ),
    );
  }

  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      new URL(
        "/admin?google=no_refresh_token",
        request.url,
      ),
    );
  }

  /* =========================================
     GUARDAR CONEXIÓN
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

    return NextResponse.redirect(
      new URL(
        "/admin?google=database_error",
        request.url,
      ),
    );
  }

  /* =========================================
     FINALIZAR
  ========================================== */

  return NextResponse.redirect(
    new URL(
      "/admin?google=connected",
      request.url,
    ),
  );
}