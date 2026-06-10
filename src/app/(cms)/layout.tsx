import Link from "next/link";
import { requireCmsAccess } from "@/lib/auth";
import { logoutAction } from "@/app/(admin)/login/actions";

/**
 * (cms) 라우트 그룹 레이아웃
 * edit.digital-rescue.com 콘텐츠 관리 시스템
 *
 * 인증/인가:
 *   - requireCmsAccess() 가 ADMIN / MANAGER 외 사용자(미로그인 포함) 를
 *     자동으로 /login 으로 리다이렉트한다.
 *
 * 레이아웃:
 *   - flex column + min-h-screen 으로 nav 아래 영역이 화면을 채운다.
 *   - main 은 min-h-0 + flex-1 로, /editor 같은 3-pane 페이지가 자체적으로
 *     overflow / 스크롤을 관리할 수 있도록 한다 (전체 padding 없음).
 */
export default async function CmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await requireCmsAccess();

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      <nav className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-5">
          <Link href="/editor" className="text-lg font-semibold">
            디지털레스큐 CMS
          </Link>
          <Link
            href="/editor/news"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            뉴스 관리
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {employee.name}
            <span className="ml-1 text-xs text-gray-400">({employee.role})</span>
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
            >
              로그아웃
            </button>
          </form>
        </div>
      </nav>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
