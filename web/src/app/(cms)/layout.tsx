/**
 * (cms) 라우트 그룹 레이아웃
 * edit.digital-rescue.com 콘텐츠 관리 시스템
 * TODO: ADMIN/MANAGER 권한 체크 필요
 */
export default function CmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="border-b bg-white px-6 py-4">
        <span className="text-lg font-semibold">디지털레스큐 CMS</span>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
