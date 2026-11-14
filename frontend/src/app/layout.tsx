import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tobaru Workteam | Observación territorial",
  description: "Explora observaciones satelitales y cambios del terreno con contexto territorial.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <a className="skip-link" href="#explorador">Saltar al explorador</a>
        {children}
      </body>
    </html>
  );
}
