import { HeroSection } from "@/components/main/HeroSection";
import { AboutSection } from "@/components/main/AboutSection";
import { ServicesSection } from "@/components/main/ServicesSection";
import { DigitalResourcesSection } from "@/components/main/DigitalResourcesSection";
import { SymptomsSection } from "@/components/common/SymptomsSection";
import { ProcessSection } from "@/components/common/ProcessSection";
import { ContactForm } from "@/components/common/ContactForm";
import { RealtimeStatus } from "@/components/common/RealtimeStatus";
import { getPageSections } from "@/lib/pageContents";
import type {
  AboutSectionData,
  ContactFormData,
  DigitalResourcesData,
  HeroSectionData,
  ProcessSectionData,
  RealtimeStatusData,
  ServicesSectionData,
  SymptomsSectionData,
  ThemeData,
} from "@/types/sections";

/**
 * 메인 페이지 (digital-rescue.com)
 *
 * page_contents 의 'main' 페이지 섹션을 한 번에 가져와 각 컴포넌트에 주입.
 * (cache() 로 layout.tsx 와 dedup 되므로 1 페이지당 1 쿼리.)
 *
 * 어떤 섹션이든 DB 행이 없으면 컴포넌트의 defaultProps 가 사용된다.
 */
export default async function HomePage() {
  const main = await getPageSections("main");
  const theme = main.theme as ThemeData | undefined;

  return (
    <>
      <HeroSection data={main.hero as HeroSectionData | undefined} theme={theme} />
      <AboutSection data={main.about as AboutSectionData | undefined} theme={theme} />
      <ServicesSection
        data={main.services as ServicesSectionData | undefined}
        theme={theme}
      />
      <SymptomsSection
        data={main.symptoms as SymptomsSectionData | undefined}
        theme={theme}
      />
      <ProcessSection
        data={main.process as ProcessSectionData | undefined}
        theme={theme}
      />
      <ContactForm
        data={main.contactForm as ContactFormData | undefined}
        theme={theme}
      />
      <RealtimeStatus
        data={main.realtimeStatus as RealtimeStatusData | undefined}
        theme={theme}
      />
      <DigitalResourcesSection
        data={main.digitalResources as DigitalResourcesData | undefined}
        theme={theme}
      />
    </>
  );
}
