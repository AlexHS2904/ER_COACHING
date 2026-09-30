import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Coaching",
    template: "%s | Coaching",
  },
  description:
    "Servicios de coaching, acompañamiento personalizado y recursos para tu desarrollo personal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX">
      <body className={geist.className}>{children}</body>
    </html>
  );
}