import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import ProcessSessionScheduler from "@/components/publico/proceso/ProcessSessionsScheduler";

import {
  getProcessByToken,
} from "@/lib/coaching/get-process-by-token";

export const metadata = {
  title:
    "Agendar sesión",

  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic =
  "force-dynamic";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function ScheduleProcessSessionPage({
  params,
}: PageProps) {
  const {
    token,
  } = await params;

  const data =
    await getProcessByToken(
      token,
    );

  if (!data) {
    notFound();
  }

  const {
    process,
    bookings,
    serviceSlug,
  } = data;

  if (
    process.status !==
    "active"
  ) {
    redirect(
      `/proceso/${token}`,
    );
  }

  /*
    Las reservas canceladas
    no consumen una sesión.
  */

  const activeBookings =
    bookings.filter(
      (booking) =>
        booking.status !==
        "cancelled",
    );

  const usedNumbers =
    new Set(
      activeBookings
        .map(
          (booking) =>
            booking.package_session_number,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !== null,
        ),
    );

  let nextSessionNumber:
    | number
    | null = null;

  for (
    let number = 1;
    number <=
    process.total_sessions;
    number += 1
  ) {
    if (
      !usedNumbers.has(
        number,
      )
    ) {
      nextSessionNumber =
        number;

      break;
    }
  }

  if (
    nextSessionNumber ===
    null
  ) {
    redirect(
      `/proceso/${token}`,
    );
  }

  return (
    <main
      className="
        min-h-screen
        bg-brand-cream
        text-brand-brown
      "
    >
      {/* HEADER */}

      <section
        className="
          border-b
          border-brand-taupe/20
          px-5
          py-7
          sm:px-8
        "
      >
        <div
          className="
            mx-auto
            flex
            max-w-[900px]
            items-center
            justify-between
            gap-5
          "
        >
          <Link
            href={`/proceso/${token}`}
            className="
              text-sm
              font-semibold
              text-brand-wine
            "
          >
            ← Mi proceso
          </Link>

          <p
            className="
              text-[0.65rem]
              font-semibold
              uppercase
              tracking-[0.2em]
              text-brand-brown/45
            "
          >
            Área privada
          </p>
        </div>
      </section>

      {/* CONTENT */}

      <section
        className="
          px-5
          py-12
          sm:px-8
          sm:py-16
        "
      >
        <div
          className="
            mx-auto
            max-w-[760px]
          "
        >
          <div
            className="
              mb-8
              text-center
            "
          >
            <p
              className="
                text-xs
                font-semibold
                uppercase
                tracking-[0.25em]
                text-brand-wine
              "
            >
              Tu proceso
            </p>

            <h1
              className="
                mt-4
                font-display
                text-5xl
                font-semibold
                leading-[0.95]
                text-brand-brown
                sm:text-6xl
              "
            >
              Agenda tu
              próxima sesión.
            </h1>

            <p
              className="
                mx-auto
                mt-5
                max-w-[520px]
                text-sm
                leading-7
                text-brand-brown/55
              "
            >
              Elige la fecha y
              el horario que
              mejor se adapte a
              ti. Tus datos ya
              están asociados a
              este proceso, por
              lo que no necesitas
              volver a
              registrarlos.
            </p>
          </div>

          <ProcessSessionScheduler
            token={token}
            serviceSlug={
              serviceSlug
            }
            sessionNumber={
              nextSessionNumber
            }
            serviceName={
              process.service_name_snapshot
            }
            durationMinutes={
              process.duration_minutes_snapshot
            }
          />
        </div>
      </section>
    </main>
  );
}