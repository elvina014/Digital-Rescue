import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { logoutAction } from "./login/actions";

/**
 * (admin) 라우트 그룹 레이아웃
 * login.digital-rescue.com 직원/관리자 포털
 * - 좌측 고정 사이드바 (역할 기반 메뉴)
 * - 상단 헤더 (로그아웃)
 * - /login 페이지에서는 사이드바/헤더 없이 렌더링
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await getCurrentEmployee();

  // 미인증 상태 (로그인 페이지 등) → 사이드바 없이 렌더링
  if (!employee) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 사이드바 */}
      <AdminSidebar employeeName={employee.name} employeeRole={employee.role} />

      {/* 메인 영역 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 헤더 */}
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <div />
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600
                         transition-colors hover:bg-gray-100"
            >
              로그아웃
            </button>
          </form>
        </header>

        {/* 콘텐츠 */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
