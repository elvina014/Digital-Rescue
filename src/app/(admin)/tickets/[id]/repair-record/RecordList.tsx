"use client";

import type { ReactNode } from "react";

interface Props<T extends { id: string }> {
  title: string;
  hint?: string;
  items: T[];
  emptyText: string;
  error: string | null;
  canEdit: boolean;
  renderItem: (item: T) => ReactNode;
  onRemove?: (item: T) => void;
  /** 삭제 버튼을 숨길 항목 (예: 입고 승인된 적출 부품) */
  isLocked?: (item: T) => boolean;
  children?: ReactNode;
}

/** 수리 기록 하위 목록 공통 틀: 제목 + 항목 + 삭제 + (편집 가능 시) 추가 폼 */
export default function RecordList<T extends { id: string }>({
  title, hint, items, emptyText, error, canEdit, renderItem, onRemove, isLocked, children,
}: Props<T>) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">{renderItem(item)}</div>
              {canEdit && onRemove && !isLocked?.(item) && (
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="shrink-0 text-xs text-gray-400 hover:text-red-600"
                  aria-label="삭제"
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {canEdit && children && <div className="mt-2">{children}</div>}
    </div>
  );
}
