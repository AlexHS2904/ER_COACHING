export const routes = {
  home: "/",
  about: "/sobre-mi",
  services: "/servicios",
  booking: "/reservar",
  testimonials: "/testimonios",
  resources: "/recursos",
  contact: "/contacto",
} as const;

export const navLinks = [
  {
    href: routes.home,
    label: "Inicio",
  },
  {
    href: routes.about,
    label: "Sobre mí",
  },
  {
    href: routes.services,
    label: "Servicios",
  },
  {
    href: routes.testimonials,
    label: "Testimonios",
  },
  {
    href: routes.resources,
    label: "Recursos",
  },
  {
    href: routes.contact,
    label: "Contacto",
  },
];