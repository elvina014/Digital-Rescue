"use client";

import type { PageEntry } from "./catalog";

interface SidebarProps {
  catalog: PageEntry[];
  currentPage: string;
  currentSection: string;
  onSelect: (pageKey: string, sectionKey: string) => void;
}

/**
 * 좌측 사이드바
 *  1) 페이지 선택 드롭다운 (메인 + 14개 브랜드)
 *  2) 선택한 페이지의 섹션 리스트 (현재 섹션 하이라이트)
 */
export function Sidebar({
  catalog,
  currentPage,
  currentSection,
  onSelect,
}: SidebarProps) {
  const current = catalog.find((p) => p.pageKey === currentPage);

  return (
    <aside className="flex min-h-0 flex-col border-r bg-white">
      <div className="shrink-0 border-b px-5 py-4">
        <label
          htmlFor="page-selector"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
        >
          편집할 페이지
        </label>
        <select
          id="page-selector"
          value={currentPage}
          onChange={(e) => {
            const next = e.target.value;
            const nextPage = catalog.find((p) => p.pageKey === next);
            if (!nextPage) return;
            // 섹션이 다른 그룹(main↔brand)이면 첫 번째 섹션으로 점프
            const stillExists = nextPage.sections.some(
              (s) => s.key === currentSection
            );
            const nextSectionKey = stillExists
              ? currentSection
              : nextPage.sections[0]?.key ?? "";
            onSelect(next, nextSectionKey);
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <optgroup label="메인">
            {catalog
              .filter((p) => p.group === "main")
              .map((p) => (
                <option key={p.pageKey} value={p.pageKey}>
                  {p.label}
                </option>
              ))}
          </optgroup>
          <optgroup label="브랜드 랜딩">
            {catalog
              .filter((p) => p.group === "brand")
              .map((p) => (
                <option key={p.pageKey} value={p.pageKey}>
                  {p.label}
                </option>
              ))}
          </optgroup>
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          섹션 ({current?.sections.length ?? 0})
        </p>
        <ul className="space-y-1">
          {current?.sections.map((s) => {
            const active = s.key === currentSection;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => onSelect(currentPage, s.key)}
                  className={
                    "block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors " +
                    (active
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-700 hover:bg-slate-100")
                  }
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
