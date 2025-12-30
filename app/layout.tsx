"use client";

import "./globals.css";
import { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <title>Generador IA de Videos</title>
        <meta
          name="description"
          content="Crea videos con IA a partir de imágenes, diálogos y audio sin restricciones."
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
