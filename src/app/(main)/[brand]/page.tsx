import { ProcessSection } from "@/components/common/ProcessSection";
import { ContactForm } from "@/components/common/ContactForm";
import { RealtimeStatus } from "@/components/common/RealtimeStatus";
import Link from "next/link";

const BRAND_NAMES: Record<string, string> = {
  samsung: "삼성",
  lg: "LG",
  msi: "MSI",
  asus: "ASUS",
  lenovo: "레노버",
  hp: "HP",
  dell: "델",
  acer: "에이서",
  apple: "애플",
};

interface BrandPageProps {
  params: Promise<{ brand: string }>;
}

export default async function BrandPage({ params }: BrandPageProps) {
  const { brand } = await params;
  const brandName = BRAND_NAMES[brand.toLowerCase()] ?? brand.toUpperCase();

  return (
    <>
      {/* 브랜드 히어로 */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <span className="inline-block rounded-full bg-blue-500/20 px-4 py-1.5 text-xs font-semibold tracking-wide text-blue-300">
            {brandName} 공식 파트너 수준의 전문 수리
          </span>
          <h1 className="mt-6 text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            {brandName} 노트북 수리 전문
            <br />
            <span className="text-blue-400">디지털레스큐</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            {brandName} 노트북의 모든 고장을 직영 기술진이 직접 진단·수리합니다.
            투명한 전자 견적과 체계적인 수리 프로세스로 안심하세요.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href="#contact"
              className="w-full rounded-lg bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40 sm:w-auto"
            >
              무료 견적 받기
            </Link>
            <Link
              href="#process"
              className="w-full rounded-lg border border-white/20 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              수리 과정 보기
            </Link>
          </div>
        </div>
      </section>

      <ProcessSection />
      <ContactForm />
      <RealtimeStatus />
    </>
  );
}
