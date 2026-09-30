const testimonials = [
  {
    quote:
      "El proceso me ayudó a ordenar mis ideas y tomar decisiones con mucha más claridad.",
    author: "Cliente",
  },
  {
    quote:
      "Encontré un espacio donde pude plantear mis objetivos y convertirlos en acciones concretas.",
    author: "Cliente",
  },
  {
    quote:
      "Las sesiones me ayudaron a entender mejor qué quería y cómo podía avanzar.",
    author: "Cliente",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Testimonios
          </p>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-950 md:text-5xl">
            Experiencias de quienes ya comenzaron
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <blockquote
              key={index}
              className="rounded-3xl bg-neutral-50 p-8"
            >
              <p className="text-lg leading-8 text-neutral-700">
                “{testimonial.quote}”
              </p>

              <footer className="mt-6 text-sm font-medium text-neutral-950">
                {testimonial.author}
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}