import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileCTA } from "@/components/layout/MobileCTA";
import { getPageSections } from "@/lib/pageContents";
import type {
  FooterData,
  HeaderData,
  ThemeData,
} from "@/types/sections";

/**
 * (main) 라우트 그룹 레이아웃
 * digital-rescue.com 대고객 페이지에 공통 적용
 *
 * Header/Footer/Theme 는 page_contents (DB) 에서 main 페이지 섹션을 한 번에 조회해 주입.
 * React cache() 로 같은 렌더 트리의 page.tsx 가 다시 호출해도 1회 쿼리.
 * DB 행이 없거나 조회 실패 시 컴포넌트의 defaultProps(= mainPageData.json) 폴백.
 */
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const main = await getPageSections("main");
  const header = main.header as HeaderData | undefined;
  const footer = main.footer as FooterData | undefined;
  const theme = main.theme as ThemeData | undefined;

  return (
    <>
      <Header data={header} theme={theme} />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <Footer data={footer} theme={theme} />
      <MobileCTA data={footer} />
    </>
  );
}
