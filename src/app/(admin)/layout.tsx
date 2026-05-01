import { redirect } from "next/navigation";
import { getCurrentEmployeeFull } from "@/lib/auth";
import { AdminLayoutShell } from "@/components/layout/AdminLayoutShell";
import { logoutAction } from "./login/actions";

/**
 * (admin) 라우트 그룹 레이아웃
 * login.digital-rescue.com 직원/관리자 포털
 * - 데스크탑: 좌측 고정 사이드바
 * - 모바일: 상단 헤더 + 햄버거 → 슬라이드 드로어
 * - /login 페이지에서는 사이드바/헤더 없이 렌더링
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const employee = await getCurrentEmployeeFull();

  // 미인증 상태 (로그인 페이지 등) → 사이드바 없이 렌더링
  if (!employee) {
    return <>{children}</>;
  }

  const logoutButton = (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600
                   transition-colors hover:bg-gray-100"
      >
        로그아웃
      </button>
    </form>
  );

  return (
    <AdminLayoutShell
      employeeName={employee.name}
      employeeRole={employee.role}
      logoutButton={logoutButton}
      myPageData={{
        id: employee.id,
        name: employee.name,
        role: employee.role,
        phone: employee.phone,
        email: employee.email,
      }}
    >
      {children}
    </AdminLayoutShell>
  );
}
