import ExplorerDashboard from "@/components/explorer-dashboard";
import HowItWorks from "@/components/how-it-works";
import GlobeJourney from "@/components/journey/globe-journey";
import MotionProvider from "@/components/motion/motion-provider";
import ScrollProgress from "@/components/motion/scroll-progress";
import SiteFooter from "@/components/site-footer";
import SiteNav from "@/components/site-nav";

export default function Home() {
  return (
    <MotionProvider>
      <ScrollProgress />
      <SiteNav />
      <main>
        <GlobeJourney />
        <HowItWorks />
        <ExplorerDashboard />
      </main>
      <SiteFooter />
    </MotionProvider>
  );
}
