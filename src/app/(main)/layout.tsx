import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileCTA } from "@/components/layout/MobileCTA";

/**
 * (main) 라우트 그룹 레이아웃
 * digital-rescue.com 대고객 페이지에 공통 적용
 * pb-20: 모바일 CTA 높이만큼 하단 패딩 확보
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <Footer />
      <MobileCTA />
    </>
  );
}
