import "server-only";

import { google } from "googleapis";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

export function getGoogleOAuthClient() {
  const clientId =
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI;

  if (!clientId) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID",
    );
  }

  if (!clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_SECRET",
    );
  }

  if (!redirectUri) {
    throw new Error(
      "Missing GOOGLE_REDIRECT_URI",
    );
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );
}