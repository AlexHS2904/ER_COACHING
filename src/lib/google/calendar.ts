import "server-only";

import crypto from "node:crypto";
import { google } from "googleapis";

import { getGoogleOAuthClient } from "@/lib/google/oauth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CreateCalendarEventInput = {
  bookingReference: string;
  serviceName: string;

  customerName: string;
  customerEmail: string;

  startsAt: string;
  endsAt: string;

  notes?: string | null;
};

export async function createGoogleCalendarEvent({
  bookingReference,
  serviceName,
  customerName,
  customerEmail,
  startsAt,
  endsAt,
  notes,
}: CreateCalendarEventInput) {
  const supabase = getSupabaseAdmin();

  /* =====================================================
     OBTENER REFRESH TOKEN
  ===================================================== */

  const {
    data: connection,
    error: connectionError,
  } = await supabase
    .from("google_calendar_connection")
    .select("refresh_token")
    .eq("id", 1)
    .single();

  if (
    connectionError ||
    !connection?.refresh_token
  ) {
    throw new Error(
      "Google Calendar no está conectado.",
    );
  }

  /* =====================================================
     AUTENTICAR
  ===================================================== */

  const oauth2Client =
    getGoogleOAuthClient();

  oauth2Client.setCredentials({
    refresh_token:
      connection.refresh_token,
  });

  const calendar = google.calendar({
    version: "v3",
    auth: oauth2Client,
  });

  /* =====================================================
     CREAR EVENTO + SOLICITAR GOOGLE MEET
  ===================================================== */

  const requestId =
    crypto.randomUUID();

  const description = [
    `Reserva: ${bookingReference}`,
    `Cliente: ${customerName}`,
    `Correo: ${customerEmail}`,
    notes ? `Notas: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response =
    await calendar.events.insert({
      calendarId: "primary",

      conferenceDataVersion: 1,

      sendUpdates: "all",

      requestBody: {
        summary: `${serviceName} · ${customerName}`,

        description,

        start: {
          dateTime: startsAt,
          timeZone:
            "America/Mexico_City",
        },

        end: {
          dateTime: endsAt,
          timeZone:
            "America/Mexico_City",
        },

        attendees: [
          {
            email: customerEmail,
          },
        ],

        conferenceData: {
          createRequest: {
            requestId,

            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
      },
    });

  const event =
    response.data;

  /* =====================================================
     EXTRAER GOOGLE MEET
  ===================================================== */

  const meetUrl =
    event.conferenceData?.entryPoints?.find(
      (entry) =>
        entry.entryPointType ===
        "video",
    )?.uri ??
    event.hangoutLink ??
    null;

  return {
    eventId: event.id ?? null,
    calendarUrl:
      event.htmlLink ?? null,
    meetUrl,

    conferenceStatus:
      event.conferenceData
        ?.createRequest?.status
        ?.statusCode ?? null,
  };
}