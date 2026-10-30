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
  stableEventId?: string;
  conferenceRequestId?: string;
  bookingId?: string;
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
  stableEventId,
  conferenceRequestId,
  bookingId,
}: CreateCalendarEventInput) {
  const calendar =
    await getGoogleCalendarClient();

  const requestId =
    conferenceRequestId ?? crypto.randomUUID();

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

      sendUpdates: "none",

      requestBody: {
        ...(stableEventId ? { id: stableEventId } : {}),
        ...(bookingId ? { extendedProperties: { private: { bookingId } } } : {}),
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
    }, stableEventId ? { timeout: 10_000 } : undefined);

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

// Used by the paid Stripe finalizer. Google IDs use lowercase
// base32hex-compatible characters; customer invitations are never created.
export async function ensurePaidBookingCalendar(
  input: CreateCalendarEventInput & { bookingId: string; existingEventId?: string | null },
) {
  const calendar = await getGoogleCalendarClient();
  const eventId = input.existingEventId ?? `edna${input.bookingId.replaceAll("-", "").toLowerCase()}`;
  const read = async () => {
    const { data } = await calendar.events.get({ calendarId: "primary", eventId }, { timeout: 10_000 });
    if (data.status === "cancelled" ||
        (data.extendedProperties?.private?.bookingId && data.extendedProperties.private.bookingId !== input.bookingId) ||
        (!input.existingEventId && data.extendedProperties?.private?.bookingId !== input.bookingId) ||
        Date.parse(data.start?.dateTime ?? "") !== Date.parse(input.startsAt) ||
        Date.parse(data.end?.dateTime ?? "") !== Date.parse(input.endsAt)) {
      throw new Error("calendar_review_required");
    }
    return {
      eventId: data.id ?? eventId,
      calendarUrl: data.htmlLink ?? null,
      meetUrl: data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ?? data.hangoutLink ?? null,
      conferenceStatus: data.conferenceData?.createRequest?.status?.statusCode ?? null,
    };
  };
  try {
    return await read();
  } catch (error) {
    if (input.existingEventId || getGoogleErrorStatus(error) !== 404) throw error;
  }
  try {
    return await createGoogleCalendarEvent({
      ...input, stableEventId: eventId, conferenceRequestId: `meet-${input.bookingId}`,
    });
  } catch {
    // Includes a 409 and an ambiguous timeout after insert. Never choose a new ID.
    return await read();
  }
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
      sendUpdates: "none",

      requestBody: {
        attendees: [],
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
        "none",
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
