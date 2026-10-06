import Link from "next/link";

import AvailabilitySettings from "@/components/admin/AvailabilitySettings";

import {
  getSupabaseAdmin,
} from "@/lib/supabase/admin";

const TIME_ZONE =
  "America/Mexico_City";

function getTodayKey() {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          TIME_ZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      },
    ).formatToParts(
      new Date(),
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        "year",
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        "month",
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        "day",
    )?.value;

  return `${year}-${month}-${day}`;
}

export default async function ConfiguracionPage() {
  const supabase =
    getSupabaseAdmin();

  /* ======================================================
     GOOGLE
  ====================================================== */

  const {
    data:
      googleConnection,
    error:
      googleError,
  } = await supabase
    .from(
      "google_calendar_connection",
    )
    .select("id")
    .eq("id", 1)
    .maybeSingle();

  const googleConnected =
    !googleError &&
    Boolean(
      googleConnection,
    );

  /* ======================================================
     SETTINGS
  ====================================================== */

  const {
    data:
      settings,
    error:
      settingsError,
  } = await supabase
    .from(
      "booking_settings",
    )
    .select(`
      timezone,
      slot_interval_minutes,
      minimum_notice_hours,
      max_advance_days
    `)
    .eq("id", 1)
    .single();

  /* ======================================================
     REGLAS
  ====================================================== */

  const {
    data:
      rules,
    error:
      rulesError,
  } = await supabase
    .from(
      "availability_rules",
    )
    .select(`
      id,
      day_of_week,
      start_time,
      end_time,
      active
    `)
    .order(
      "day_of_week",
      {
        ascending: true,
      },
    )
    .order(
      "start_time",
      {
        ascending: true,
      },
    );

  /* ======================================================
     EXCEPCIONES FUTURAS
  ====================================================== */

  const today =
    getTodayKey();

  const {
    data:
      exceptions,
    error:
      exceptionsError,
  } = await supabase
    .from(
      "availability_exceptions",
    )
    .select(`
      id,
      exception_date,
      is_available,
      start_time,
      end_time,
      reason
    `)
    .gte(
      "exception_date",
      today,
    )
    .order(
      "exception_date",
      {
        ascending: true,
      },
    );

  const configurationError =
    settingsError ||
    rulesError ||
    exceptionsError;

  return (
    <main
      className="
        px-5
        py-8
        sm:px-8
        lg:px-10
        xl:px-12
      "
    >
      <div className="mx-auto max-w-[1100px]">
        <header>
          <p
            className="
              text-sm
              text-brand-brown/45
            "
          >
            Administración
          </p>

          <h1
            className="
              mt-2
              font-display
              text-5xl
              font-semibold
              text-brand-brown
              sm:text-6xl
            "
          >
            Configuración
          </h1>

          <p
            className="
              mt-5
              max-w-2xl
              text-base
              leading-7
              text-brand-brown/55
            "
          >
            Gestiona las conexiones,
            horarios y reglas utilizadas
            por el sistema de reservas.
          </p>
        </header>

        {/* ================================================
            GOOGLE CALENDAR
        ================================================ */}

        <section className="mt-12">
          <div
            className="
              rounded-[1.75rem]
              border
              border-brand-taupe/20
              bg-white/65
              p-6
              sm:p-8
            "
          >
            <div
              className="
                flex
                flex-col
                gap-6
                md:flex-row
                md:items-center
                md:justify-between
              "
            >
              <div>
                <div
                  className="
                    flex
                    flex-wrap
                    items-center
                    gap-3
                  "
                >
                  <h2
                    className="
                      font-display
                      text-3xl
                      font-semibold
                      text-brand-brown
                    "
                  >
                    Google Calendar
                  </h2>

                  <span
                    className={`
                      rounded-full
                      px-3
                      py-1
                      text-xs
                      font-semibold
                      ${
                        googleConnected
                          ? "bg-[#E8F2EC] text-[#295C3B]"
                          : "bg-[#F7F0DC] text-[#80671C]"
                      }
                    `}
                  >
                    {googleConnected
                      ? "Conectado"
                      : "Sin conexión"}
                  </span>
                </div>

                <p
                  className="
                    mt-3
                    max-w-xl
                    text-sm
                    leading-6
                    text-brand-brown/55
                  "
                >
                  Esta cuenta se utiliza
                  para crear, cancelar y
                  reprogramar eventos de
                  las reservas, además de
                  generar Google Meet.
                </p>
              </div>

              <Link
                href="/api/google/connect"
                className="
                  inline-flex
                  min-h-[48px]
                  shrink-0
                  items-center
                  justify-center
                  rounded-full
                  bg-brand-wine
                  px-6
                  text-sm
                  font-semibold
                  text-brand-cream
                  transition
                  hover:bg-brand-brown
                "
              >
                {googleConnected
                  ? "Reconectar cuenta"
                  : "Conectar Google"}
              </Link>
            </div>
          </div>
        </section>

        {/* ================================================
            DISPONIBILIDAD
        ================================================ */}

        <section className="mt-6">
          {configurationError ||
          !settings ? (
            <div
              className="
                rounded-[1.75rem]
                bg-[#F7E8E8]
                p-6
                text-[#8A3535]
              "
            >
              <p className="font-semibold">
                No fue posible cargar
                la configuración de
                agenda.
              </p>

              <p className="mt-2 text-sm">
                Revisa la conexión con
                Supabase e inténtalo
                nuevamente.
              </p>
            </div>
          ) : (
            <AvailabilitySettings
              initialSettings={
                settings
              }
              initialRules={
                rules ?? []
              }
              initialExceptions={
                exceptions ??
                []
              }
            />
          )}
        </section>
      </div>
    </main>
  );
}