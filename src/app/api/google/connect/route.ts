import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  getGoogleOAuthClient,
  GOOGLE_CALENDAR_SCOPE,
} from "@/lib/google/oauth";

export async function GET() {
  const oauth2Client =
    getGoogleOAuthClient();

  const state =
    crypto.randomUUID();

  const cookieStore =
    await cookies();

  cookieStore.set(
    "google_oauth_state",
    state,
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

  const authorizationUrl =
    oauth2Client.generateAuthUrl({
      access_type: "offline",

      scope: [
        GOOGLE_CALENDAR_SCOPE,
      ],

      include_granted_scopes: true,

      prompt: "consent",

      state,
    });

  return NextResponse.redirect(
    authorizationUrl,
  );
}