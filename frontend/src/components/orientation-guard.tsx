"use client";

import { RotateCw } from "lucide-react";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

const LANDSCAPE_TOUCH = "(orientation: landscape) and (hover: none) and (pointer: coarse) and (max-height: 1024px)";

export default function OrientationGuard() {
  const { lang } = useI18n();

  useEffect(() => {
    const media = window.matchMedia(LANDSCAPE_TOUCH);
    const app = document.querySelector("main");
    if (!app) return;
    const sync = () => { app.inert = media.matches; };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      app.inert = false;
    };
  }, []);

  return (
    <div className="orientation-guard" role="dialog" aria-modal="true" aria-label={lang === "es" ? "Gira el dispositivo" : "Rotate your device"}>
      <RotateCw size={36} strokeWidth={1.5} aria-hidden="true" />
      <p>{lang === "es" ? "Gira tu dispositivo para explorar SAROS en vertical." : "Rotate your device to explore SAROS in portrait mode."}</p>
    </div>
  );
}
