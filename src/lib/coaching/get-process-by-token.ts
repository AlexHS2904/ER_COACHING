import "server-only";

import {
  hashProcessAccessToken,
} from "@/lib/coaching/process-access";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";
import { hasVerifiedProcessPurchase, isProcessWithinValidity, type ProcessPurchase } from "@/lib/coaching/process-entitlement";

export type ProcessBooking = {
  id: string;
  session_resolution: string | null;
  replaces_booking_id: string | null;

  booking_reference:
    | string
    | null;

  package_session_number:
    | number
    | null;

  starts_at: string;
  ends_at: string;

  status: string;

  google_meet_url:
    | string
    | null;

  google_calendar_url:
    | string
    | null;
};

export type CoachingProcess = {
  id: string;
  expires_at: string | null;

  process_reference:
    string;

  service_id:
    string;

  customer_name:
    string;

  service_name_snapshot:
    string;

  duration_minutes_snapshot:
    | number
    | null;

  price_snapshot:
    | number
    | string
    | null;

  currency_snapshot:
    string;

  total_sessions:
    number;

  status:
    string;

  created_at:
    string;

  purchase_booking_id: string | null;
  stripe_mode: string | null;
  stripe_account_id: string | null;
};

export type ProcessAccessData = {
  process:
    CoachingProcess;

  bookings:
    ProcessBooking[];

  serviceSlug:
    string;

  timezone:
    string;

  canSchedule: boolean;
};

export async function getProcessByToken(
  token: string,
): Promise<
  ProcessAccessData | null
> {
  if (
    !/^[0-9a-f]{64}$/.test(
      token,
    )
  ) {
    return null;
  }

  const supabase =
    getSupabaseAdmin();

  const tokenHash =
    hashProcessAccessToken(
      token,
    );

  /* =======================================================
     PROCESO
  ======================================================= */

  const {
    data: process,
    error: processError,
  } = await supabase
    .from(
      "coaching_processes",
    )
    .select(
      `
        id,
        process_reference,
        service_id,

        customer_name,

        service_name_snapshot,
        duration_minutes_snapshot,
        price_snapshot,
        currency_snapshot,
        total_sessions,

        status,
        created_at,
        purchase_booking_id,
        stripe_mode,
        stripe_account_id
        ,expires_at
      `,
    )
    .eq(
      "access_token_hash",
      tokenHash,
    )
    .maybeSingle();

  if (processError) {
    console.error(
      "Error reading coaching process:",
      { code: processError.code },
    );

    throw new Error(
      "No fue posible consultar el proceso de coaching.",
    );
  }

  if (!process) {
    return null;
  }

  const purchase = process.purchase_booking_id ? await supabase.from("bookings")
    .select("id,process_id,package_session_number,payment_status,payment_provider,payment_flow,payment_reference,paid_at,stripe_mode,stripe_account_id")
    .eq("id", process.purchase_booking_id).maybeSingle() : { data: null, error: null };
  if (purchase.error) throw new Error("No fue posible consultar el proceso de coaching.");
  const paid = hasVerifiedProcessPurchase(process, purchase.data as ProcessPurchase | null);
  // A new unpaid purchase has no usable portal. Legacy private history remains readable.
  if (process.stripe_mode && !paid) return null;

  /* =======================================================
     SERVICIO
  ======================================================= */

  const {
    data: service,
    error: serviceError,
  } = await supabase
    .from("services")
    .select(
      "slug",
    )
    .eq(
      "id",
      process.service_id,
    )
    .maybeSingle();

  if (
    serviceError ||
    !service
  ) {
    console.error(
      "Error reading process service:",
      { code: serviceError?.code },
    );

    throw new Error(
      "No fue posible consultar el servicio del proceso.",
    );
  }

  /* =======================================================
     RESERVAS DEL PROCESO
  ======================================================= */

  const {
    data: bookings,
    error: bookingsError,
  } = await supabase
    .from("bookings")
    .select(
      `
        id,
        booking_reference,
        package_session_number,
        session_resolution,
        replaces_booking_id,

        starts_at,
        ends_at,

        status,

        google_meet_url,
        google_calendar_url
      `,
    )
    .eq(
      "process_id",
      process.id,
    )
    .order(
      "package_session_number",
      {
        ascending: true,
      },
    )
    .order(
      "starts_at",
      {
        ascending: true,
      },
    );

  if (bookingsError) {
    console.error(
      "Error reading process bookings:",
      { code: bookingsError.code },
    );

    throw new Error(
      "No fue posible consultar las sesiones del proceso.",
    );
  }

  /* =======================================================
     ZONA HORARIA
  ======================================================= */

  const {
    data: settings,
  } = await supabase
    .from(
      "booking_settings",
    )
    .select(
      "timezone",
    )
    .eq(
      "id",
      1,
    )
    .maybeSingle();

  return {
    process,

    bookings:
      bookings ?? [],

    serviceSlug:
      service.slug,

    timezone:
      settings?.timezone ??
      "America/Mexico_City",

    canSchedule: paid && process.status === "active" && isProcessWithinValidity(process.expires_at),
  };
}
