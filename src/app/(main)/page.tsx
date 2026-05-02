import data from "@/data/mainPageData.json";
import { HeroSection } from "@/components/main/HeroSection";
import { AboutSection } from "@/components/main/AboutSection";
import { ServicesSection } from "@/components/main/ServicesSection";
import { DigitalResourcesSection } from "@/components/main/DigitalResourcesSection";
import { SymptomsSection } from "@/components/common/SymptomsSection";
import { ProcessSection } from "@/components/common/ProcessSection";
import { ContactForm } from "@/components/common/ContactForm";
import { RealtimeStatus } from "@/components/common/RealtimeStatus";
import type {
  ContactFormData,
  ProcessSectionData,
  RealtimeStatusData,
  SymptomsSectionData,
  ThemeData,
} from "@/types/sections";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <ServicesSection />
      <SymptomsSection
        data={data.symptoms as SymptomsSectionData}
        theme={data.theme as ThemeData}
      />
      <ProcessSection
        data={data.process as ProcessSectionData}
        theme={data.theme as ThemeData}
      />
      <ContactForm
        data={data.contactForm as ContactFormData}
        theme={data.theme as ThemeData}
      />
      <RealtimeStatus
        data={data.realtimeStatus as RealtimeStatusData}
        theme={data.theme as ThemeData}
      />
      <DigitalResourcesSection />
    </>
  );
}
