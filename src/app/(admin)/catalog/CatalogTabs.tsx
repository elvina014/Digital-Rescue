import Link from "next/link";

const TABS = [
  { href: "/catalog/mapping", label: "모델 매핑" },
  { href: "/catalog/models", label: "모델 목록" },
  { href: "/catalog/boards", label: "보드 목록" },
  { href: "/catalog/symptoms", label: "증상 코드" },
  { href: "/catalog/parts", label: "부품 규격" },
  { href: "/catalog/parts/stock", label: "재고 연결" },
] as const;

/** 기기 마스터 화면 상단 탭 (ADMIN 전용 화면) */
export default function CatalogTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold text-gray-900">기기 마스터</h1>
      <p className="mt-1 text-sm text-gray-500">
        표준 모델·변형·메인보드를 관리하고, 접수건의 자유입력 모델명을 표준 모델에 연결합니다. (관리자 전용)
      </p>
      <nav className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              t.href === active ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
