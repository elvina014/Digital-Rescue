/**
 * (admin) 라우트 그룹 레이아웃
 * login.digital-rescue.com 직원/관리자 포털 공통 레이아웃
 * TODO: 인증 및 역할 기반 접근 제어(Auth Guard) 적용 필요
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <span className="text-lg font-semibold">디지털레스큐 관리자 포털</span>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
