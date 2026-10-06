import crypto from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { cookies } from "next/headers";

import {
  getGoogleOAuthClient,
  GOOGLE_CALENDAR_SCOPE,
} from "@/lib/google/oauth";

import {
  createClient,
} from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
) {
  /* =========================================
     VALIDAR SESIÓN
  ========================================== */

  const supabase =
    await createClient();

  const {
    data: claimsData,
  } =
    await supabase.auth.getClaims();

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

  /* =========================================
     VALIDAR ADMIN
  ========================================== */

  const {
    data: admin,
    error: adminError,
  } = await supabase
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
    await supabase.auth.signOut();

    return NextResponse.redirect(
      new URL(
        "/admin/login",
        request.url,
      ),
    );
  }

  /* =========================================
     CREAR STATE
  ========================================== */

  const oauth2Client =
    getGoogleOAuthClient();

  const state =
    crypto.randomUUID();

  const cookieStore =
    await cookies();

  /*
    Guardamos también el userId para
    vincular la solicitud OAuth con
    el administrador que la inició.
  */
  cookieStore.set(
    "google_oauth_state",
    `${userId}:${state}`,
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV ===
        "production",
      maxAge: 60 * 10,
      path: "/",
    },
  );

  /* =========================================
     GENERAR URL GOOGLE
  ========================================== */

  const authorizationUrl =
    oauth2Client.generateAuthUrl({
      access_type: "offline",

      scope: [
        GOOGLE_CALENDAR_SCOPE,
      ],

      include_granted_scopes:
        true,

      prompt: "consent",

      state,
    });

  return NextResponse.redirect(
    authorizationUrl,
  );
}