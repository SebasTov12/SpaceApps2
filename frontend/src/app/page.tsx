import EarthHero from "@/components/earth-hero";
import { LanguageProvider } from "@/lib/i18n";

export default function Home() {
  return (
    <LanguageProvider>
      <main>
        <EarthHero />
      </main>
    </LanguageProvider>
  );
}
