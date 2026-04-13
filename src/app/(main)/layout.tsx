import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

/**
 * (main) 라우트 그룹 레이아웃
 * digital-rescue.com 대고객 페이지에 공통 적용
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
