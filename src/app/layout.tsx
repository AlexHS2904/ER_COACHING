import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Montserrat,
  Bodoni_Moda,
  Tangerine,
} from "next/font/google";

import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const tangerine = Tangerine({
  subsets: ["latin"],
  variable: "--font-script",
  weight: ["400", "700"],
  display: "swap",
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