import EarthHero from "@/components/earth-hero";
import ExplorerDashboard from "@/components/explorer-dashboard";
import { LanguageProvider } from "@/lib/i18n";

export default function Home() {
  return (
    <LanguageProvider>
      <main>
        <EarthHero />
        <ExplorerDashboard />
      </main>
    </LanguageProvider>
  );
}
