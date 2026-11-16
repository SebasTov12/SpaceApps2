import EarthHero from "@/components/earth-hero";
import OrientationGuard from "@/components/orientation-guard";
import { LanguageProvider } from "@/lib/i18n";

export default function Home() {
  return (
    <LanguageProvider>
      <OrientationGuard />
      <main>
        <EarthHero />
      </main>
    </LanguageProvider>
  );
}
