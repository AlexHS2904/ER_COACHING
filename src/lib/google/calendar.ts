import "server-only";

import crypto from "node:crypto";
import { google } from "googleapis";

import { getGoogleOAuthClient } from "@/lib/google/oauth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const GOOGLE_TIME_ZONE =
  "America/Mexico_City";

type CreateCalendarEventInput = {
  bookingReference: string;
  serviceName: string;

  customerName: string;
  customerEmail: string;

  startsAt: string;
  endsAt: string;

  notes?: string | null;
};

type UpdateCalendarEventInput = {
  eventId: string;

  startsAt: string;
  endsAt: string;
};

/* =========================================================
   CLIENTE DE GOOGLE CALENDAR
========================================================= */

async function getGoogleCalendarClient() {
  const supabase =
    getSupabaseAdmin();

  const {
    data: connection,
    error: connectionError,
  } = await supabase
    .from(
      "google_calendar_connection",
    )
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

  const oauth2Client =
    getGoogleOAuthClient();

  oauth2Client.setCredentials({
    refresh_token:
      connection.refresh_token,
  });

  return google.calendar({
    version: "v3",
    auth: oauth2Client,
  });
}

/* =========================================================
   CREAR EVENTO
========================================================= */

export async function createGoogleCalendarEvent({
  bookingReference,
  serviceName,
  customerName,
  customerEmail,
  startsAt,
  endsAt,
  notes,
}: CreateCalendarEventInput) {
  const calendar =
    await getGoogleCalendarClient();

  const requestId =
    crypto.randomUUID();

  const description = [
    `Reserva: ${bookingReference}`,
    `Cliente: ${customerName}`,
    `Correo: ${customerEmail}`,
    notes
      ? `Notas: ${notes}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response =
    await calendar.events.insert({
      calendarId: "primary",

      conferenceDataVersion: 1,

      sendUpdates: "all",

      requestBody: {
        summary:
          `${serviceName} · ${customerName}`,

        description,

        start: {
          dateTime:
            startsAt,

          timeZone:
            GOOGLE_TIME_ZONE,
        },

        end: {
          dateTime:
            endsAt,

          timeZone:
            GOOGLE_TIME_ZONE,
        },

        attendees: [
          {
            email:
              customerEmail,
          },
        ],

        conferenceData: {
          createRequest: {
            requestId,

            conferenceSolutionKey: {
              type:
                "hangoutsMeet",
            },
          },
        },
      },
    });

  const event =
    response.data;

  const meetUrl =
    event.conferenceData
      ?.entryPoints?.find(
        (entry) =>
          entry.entryPointType ===
          "video",
      )?.uri ??
    event.hangoutLink ??
    null;

  return {
    eventId:
      event.id ?? null,

    calendarUrl:
      event.htmlLink ??
      null,

    meetUrl,

    conferenceStatus:
      event.conferenceData
        ?.createRequest
        ?.status
        ?.statusCode ??
      null,
  };
}

/* =========================================================
   REPROGRAMAR EVENTO
========================================================= */

export async function updateGoogleCalendarEvent({
  eventId,
  startsAt,
  endsAt,
}: UpdateCalendarEventInput) {
  const calendar =
    await getGoogleCalendarClient();

  const response =
    await calendar.events.patch({
      calendarId: "primary",

      eventId,
      sendUpdates: "all",

      requestBody: {
        start: {
          dateTime:
            startsAt,

          timeZone:
            GOOGLE_TIME_ZONE,
        },

        end: {
          dateTime:
            endsAt,

          timeZone:
            GOOGLE_TIME_ZONE,
        },
      },
    });

  return {
    eventId:
      response.data.id ??
      eventId,

    calendarUrl:
      response.data.htmlLink ??
      null,

    meetUrl:
      response.data
        .conferenceData
        ?.entryPoints?.find(
          (entry) =>
            entry.entryPointType ===
            "video",
        )?.uri ??
      response.data
        .hangoutLink ??
      null,
  };
}

/* =========================================================
   EXTRAER STATUS DE ERROR GOOGLE
========================================================= */

function getGoogleErrorStatus(
  error: unknown,
) {
  if (
    typeof error !==
      "object" ||
    error === null ||
    !("response" in error)
  ) {
    return null;
  }

  const response = (
    error as {
      response?: {
        status?: number;
      };
    }
  ).response;

  return (
    response?.status ??
    null
  );
}

/* =========================================================
   ELIMINAR EVENTO
========================================================= */

export async function deleteGoogleCalendarEvent(
  eventId: string,
) {
  const calendar =
    await getGoogleCalendarClient();

  try {
    await calendar.events.delete({
      calendarId:
        "primary",

      eventId,

      sendUpdates:
        "all",
    });
  } catch (error) {
    const status =
      getGoogleErrorStatus(
        error,
      );
    if (
      status === 404 ||
      status === 410
    ) {
      return;
    }

    throw error;
  }
}