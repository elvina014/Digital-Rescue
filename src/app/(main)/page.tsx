import { HeroSection } from "@/components/common/HeroSection";
import { ProcessSection } from "@/components/common/ProcessSection";
import { ContactForm } from "@/components/common/ContactForm";
import { RealtimeStatus } from "@/components/common/RealtimeStatus";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ProcessSection />
      <ContactForm />
      <RealtimeStatus />
    </>
  );
}
