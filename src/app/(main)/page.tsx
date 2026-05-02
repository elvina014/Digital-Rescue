import { HeroSection } from "@/components/main/HeroSection";
import { AboutSection } from "@/components/main/AboutSection";
import { ServicesSection } from "@/components/main/ServicesSection";
import { SymptomsSection } from "@/components/main/SymptomsSection";
import { ProcessSection } from "@/components/main/ProcessSection";
import { ContactForm } from "@/components/main/ContactForm";
import { RealtimeStatus } from "@/components/main/RealtimeStatus";
import { DigitalResourcesSection } from "@/components/main/DigitalResourcesSection";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <ServicesSection />
      <SymptomsSection />
      <ProcessSection />
      <ContactForm />
      <RealtimeStatus />
      <DigitalResourcesSection />
    </>
  );
}
