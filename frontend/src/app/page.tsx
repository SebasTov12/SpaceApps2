import EarthHero from "@/components/earth-hero";
import ExplorerDashboard from "@/components/explorer-dashboard";
import HowItWorks from "@/components/how-it-works";
import MotionProvider from "@/components/motion/motion-provider";
import ScrollProgress from "@/components/motion/scroll-progress";

export default function Home() {
  return (
    <MotionProvider>
      <ScrollProgress />
      <main>
        <EarthHero />
        <HowItWorks />
        <ExplorerDashboard />
      </main>
    </MotionProvider>
  );
}
