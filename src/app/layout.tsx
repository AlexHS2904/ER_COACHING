import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Montserrat,
  Bodoni_Moda,
  Tangerine,
} from "next/font/google";

import "./globals.css";

/* =========================================================
  MONTSERRAT
  Texto general de la página.
========================================================= */
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  preload: true,
});

/* =========================================================
  CORMORANT GARAMOND
  Títulos principales.
========================================================= */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",

  weight: ["400", "600"],

  /* El Hero no necesita Cormorant italic */
  style: ["normal"],

  display: "swap",
  preload: true,
});

/* =========================================================
  BODONI MODA
  Palabras/accentos en cursiva.
========================================================= */
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",

  weight: ["600"],
  style: ["italic"],

  display: "swap",
  preload: true,
});

/* =========================================================
  TANGERINE
  Fuente decorativa/manuscrita.
========================================================= */
const tangerine = Tangerine({
  subsets: ["latin"],
  variable: "--font-tangerine",

  weight: ["400", "700"],

  display: "swap",

  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Coaching",
    template: "%s | Coaching",
  },

  description:
    "Coaching personal y profesional para ayudarte a ganar claridad, tomar acción y avanzar con confianza.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX">
      <body
        className={`
          ${montserrat.variable}
          ${cormorant.variable}
          ${bodoni.variable}
          ${tangerine.variable}
        `}
      >
        {children}
      </body>
    </html>
  );
}