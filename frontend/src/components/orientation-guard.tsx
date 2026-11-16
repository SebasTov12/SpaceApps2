"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const LANDSCAPE_TOUCH = "(hover: none) and (pointer: coarse)";

export default function OrientationGuard() {
  const { lang } = useI18n();
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const touchDevice = window.matchMedia(LANDSCAPE_TOUCH);
    const app = document.querySelector("main");
    if (!app) return;
    const readPhysicalOrientation = () => {
      const type = screen.orientation?.type;
      if (type) return type.startsWith("landscape");
      if (typeof window.orientation === "number") return Math.abs(window.orientation) === 90;
      return window.matchMedia("(orientation: landscape)").matches;
    };
    const sync = () => {
      const isLandscape = touchDevice.matches && readPhysicalOrientation();
      setLandscape(isLandscape);
      app.inert = isLandscape;
    };
    sync();
    screen.orientation?.addEventListener("change", sync);
    window.addEventListener("orientationchange", sync);
    touchDevice.addEventListener("change", sync);
    return () => {
      screen.orientation?.removeEventListener("change", sync);
      window.removeEventListener("orientationchange", sync);
      touchDevice.removeEventListener("change", sync);
      app.inert = false;
    };
  }, []);

  return (
    <div className={`orientation-guard${landscape ? " is-active" : ""}`} role="dialog" aria-modal="true" aria-hidden={!landscape} aria-label={lang === "es" ? "Gira el dispositivo" : "Rotate your device"}>
      <RotateCw size={36} strokeWidth={1.5} aria-hidden="true" />
      <p>{lang === "es" ? "Gira tu dispositivo para explorar SAROS en vertical." : "Rotate your device to explore SAROS in portrait mode."}</p>
    </div>
  );
}
