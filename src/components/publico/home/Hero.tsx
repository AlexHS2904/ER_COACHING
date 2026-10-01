import Image from "next/image";
import Link from "next/link";

const benefits = [
  {
    title: "Claridad",
    subtitle: "en tus objetivos",
    icon: "/images/svgs/obj.webp",
  },
  {
    title: "Acción",
    subtitle: "con enfoque",
    icon: "/images/svgs/bar.webp",
  },
  {
    title: "Avance",
    subtitle: "con confianza",
    icon: "/images/svgs/per.webp",
  },
];

export default function Hero() {
  return (
    <section className="overflow-hidden bg-brand-cream lg:h-[calc(100dvh-80px)]">
      <div className="grid h-full w-full lg:grid-cols-[1.02fr_0.98fr]">
        {/* =========================
            CONTENIDO IZQUIERDO
        ========================== */}
        <div className="animate-hero-content relative z-20 min-w-0 overflow-hidden px-5 pb-8 pt-10 sm:px-8 lg:flex lg:h-full lg:items-center lg:overflow-visible lg:pl-12 lg:pr-8 lg:py-4 xl:pl-14">
          <div className="min-w-0 w-full max-w-[760px]">
            {/* Eyebrow */}
            <div className="mb-5 flex items-start gap-4 sm:items-center lg:mb-5">
              <span className="mt-2 h-0.5 w-10 shrink-0 bg-brand-wine sm:mt-0 sm:w-14" />

              <p className="text-[0.68rem] font-medium uppercase leading-5 tracking-[0.27em] text-brand-black sm:text-sm sm:tracking-[0.3em]">
                Coaching personal y profesional
              </p>
            </div>

            {/* Título */}
            <h1 className="max-w-full font-display text-[3.35rem] font-semibold leading-[0.9] tracking-[-0.025em] text-brand-brown sm:text-[4.5rem] lg:text-[clamp(4.4rem,5.25vw,5.55rem)]">
              <span className="block">
                Transforma tus
              </span>

              <span className="block lg:whitespace-nowrap">
                metas en{" "}
                <span className="font-accent font-semibold italic text-brand-wine">
                  resultados
                </span>
              </span>
            </h1>

            {/* Descripción */}
            <p className="mt-5 max-w-[620px] text-[1rem] leading-7 text-brand-black sm:text-lg lg:text-[1rem]">
              Coaching personalizado para ayudarte a ganar claridad, tomar
              acción y avanzar con confianza.
            </p>

            {/* CTA */}
            <Link
              href="/servicios"
              className="relative mt-5 flex w-full max-w-full items-center justify-center rounded-xl bg-brand-wine px-7 py-4 text-center font-medium text-white transition-colors hover:bg-brand-brown sm:w-fit sm:min-w-[275px]"
            >
              <span>Agendar una cita</span>

              <span
                aria-hidden="true"
                className="absolute right-6 text-xl leading-none"
              >
                →
              </span>
            </Link>

            {/* =========================
                BENEFICIOS
            ========================== */}
            <div className="mt-7 grid grid-cols-3 sm:max-w-[560px] lg:mt-15">
              {benefits.map((benefit, index) => (
                <div
                  key={benefit.title}
                  className={`flex min-w-0 flex-col items-center px-2 text-center ${
                    index !== benefits.length - 1
                      ? "border-r border-brand-taupe/40"
                      : ""
                  }`}
                >
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-brand-taupe/15 sm:h-11 sm:w-11">
                    <Image
                      src={benefit.icon}
                      alt=""
                      width={26}
                      height={26}
                      aria-hidden="true"
                      className="h-6 w-6 object-contain sm:h-7 sm:w-7"
                    />
                  </div>

                  <p className="text-xs font-semibold leading-4 text-brand-black sm:text-sm">
                    {benefit.title}
                  </p>

                  <p className="mt-0.5 text-[0.65rem] leading-4 text-brand-black/75 sm:text-xs">
                    {benefit.subtitle}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* =========================
            COMPOSICIÓN MOBILE
        ========================== */}
        <div className="animate-hero-visual relative h-[420px] overflow-hidden sm:h-[500px] lg:hidden">
          {/* Arco */}
          <div className="absolute -bottom-32 left-1/2 h-[430px] w-[430px] -translate-x-1/2 rounded-full border-2 border-brand-taupe/80" />

          {/* Vino */}
          <div className="absolute -right-20 top-10 h-[230px] w-[230px] rounded-full bg-brand-wine" />

          {/* Taupe */}
          <div className="absolute -right-20 top-[175px] h-[270px] w-[270px] rounded-full bg-brand-taupe" />

          {/* Verde */}
          <div className="absolute -bottom-24 -left-24 h-[330px] w-[330px] rounded-full bg-brand-green" />

          {/* Coach */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex h-[400px] items-end justify-center">
            <div className="relative h-[380px] w-[305px]">
              <Image
                src="/images/coach/coach1.webp"
                alt="Coach profesional"
                fill
                sizes="305px"
                className="object-contain object-bottom"
              />
            </div>
          </div>
        </div>

        {/* =========================
            COMPOSICIÓN DESKTOP
        ========================== */}
        <div className="animate-hero-visual relative hidden h-full min-h-0 overflow-hidden lg:block">
          {/* Fondo decorativo:
              ocupa TODO el panel derecho */}
          <div className="pointer-events-none absolute inset-0">
            <Image
              src="/images/svgs/bg1.webp"
              alt=""
              fill
              aria-hidden="true"
              sizes="50vw"
              className="object-cover object-right"
            />
          </div>

          {/* Coach:
              altura proporcional al Hero para que nunca empuje el viewport */}
          <div className="pointer-events-none absolute bottom-0 right-[2%] z-10 h-[100%] w-[100%] max-w-[1040px]">
            <Image
              src="/images/coach/coach1_desk.webp"
              alt="Coach profesional"
              fill
              preload
              unoptimized
              sizes="(min-width: 1280px) 640px, 48vw"
              className="object-contain object-bottom"
            />
          </div>
        </div>
      </div>
    </section>
  );
}