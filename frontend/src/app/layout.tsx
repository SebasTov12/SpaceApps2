import type { Metadata } from "next";
import { Inter, Orbitron } from "next/font/google";
import "./globals.css";

// Identidad SAROS: Orbitron para títulos, display y logo; Inter para texto e interfaz
const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "SAROS | Monitoreo geoespacial con NISAR",
  description: "SAROS es una plataforma de monitoreo geoespacial impulsada por datos satelitales de NISAR para visualizar, analizar y anticipar riesgos en la Tierra.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${orbitron.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a className="skip-link" href="#zonas">Ir a las zonas de riesgo</a>
        {children}
      </body>
    </html>
  );
}
