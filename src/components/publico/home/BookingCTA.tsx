import Link from "next/link";

export default function BookingCTA() {
  return (
    <section className="bg-white px-6 py-24">
      <div className="mx-auto max-w-7xl rounded-3xl bg-neutral-100 px-8 py-16 text-center md:px-16 md:py-20">
        <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
          Da el siguiente paso hacia tus objetivos
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-neutral-600">
          Conoce los servicios disponibles y encuentra el acompañamiento que
          mejor se adapte a lo que necesitas.
        </p>

        <Link
          href="/servicios"
          className="mt-8 inline-flex rounded-full bg-neutral-950 px-7 py-3.5 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Reservar una sesión
        </Link>
      </div>
    </section>
  );
}