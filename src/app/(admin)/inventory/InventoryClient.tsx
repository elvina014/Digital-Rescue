"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteInventoryItem, adminInlineUpdateInventoryItem } from "@/app/actions/inventoryActions";
import { ItemCondition, EmployeeRole } from "@/types";

// ─── 상수 ───

const CONDITION_LABELS: Record<ItemCondition, string> = {
  [ItemCondition.NEW]: "신품",
  [ItemCondition.USED]: "중고",
};

const CONDITION_COLORS: Record<ItemCondition, string> = {
  [ItemCondition.NEW]: "bg-green-100 text-green-700",
  [ItemCondition.USED]: "bg-yellow-100 text-yellow-700",
};

const LOW_STOCK_THRESHOLD = 3;
const PAGE_SIZE = 10;

// ─── 타입 ───

interface InventoryItemRow {
  id: string;
  category_id: string;
  spec_id: string;
  product_id: string;
  capacity: string | null;
  condition: ItemCondition;
  quantity: number;
  base_estimate: number;
  created_at: string;
  updated_at: string;
  inventory_categories: { name: string } | null;
  inventory_specs: { name: string } | null;
  inventory_products: { name: string } | null;
}

interface TransactionRow {
  id: string;
  transaction_type: string;
  quantity_changed: number;
  notes: string | null;
  ticket_id: string | null;
  created_at: string;
  employees: { name: string } | null;
  inventory_items: {
    capacity: string | null;
    inventory_categories: { name: string } | null;
    inventory_specs: { name: string } | null;
    inventory_products: { name: string } | null;
  } | null;
}

interface Props {
  items: InventoryItemRow[];
  transactions: TransactionRow[];
  currentEmployee: { id: string; name: string; role: EmployeeRole };
}

// ─── 인라인 편집 셀 ───

function InlineEditCell({
  value,
  type,
  onSave,
}: {
  value: string;
  type: "text" | "number";
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function commit() {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setDraft(value); setEditing(false); }
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
        title="클릭하여 수정"
        className="cursor-pointer rounded px-1 py-0.5 hover:bg-blue-50 hover:text-blue-700 transition-colors"
      >
        {value || "-"}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      disabled={saving}
      autoFocus
      className="w-full rounded border border-blue-400 px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:opacity-50"
      style={{ minWidth: type === "number" ? "5rem" : "7rem" }}
    />
  );
}

// ─── 메인 컴포넌트 ───

export default function InventoryClient({ items: initialItems, transactions, currentEmployee }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();

  const isAdmin = currentEmployee.role === EmployeeRole.ADMIN;

  // 필터 상태
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCondition, setFilterCondition] = useState<ItemCondition | "">("");

  // 페이징 상태
  const [page, setPage] = useState(1);

  // 트랜잭션 탭
  const [txFilter, setTxFilter] = useState<"ALL" | "INBOUND" | "OUTBOUND">("ALL");

  // 알림
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ─── 통계 ───
  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const lowStock = items.filter((i) => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD).length;
    const outOfStock = items.filter((i) => i.quantity === 0).length;
    return { totalItems, totalQuantity, lowStock, outOfStock };
  }, [items]);

  // ─── 필터링 ───
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filterCondition && item.condition !== filterCondition) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const catName = item.inventory_categories?.name ?? "";
        const specName = item.inventory_specs?.name ?? "";
        const prodName = item.inventory_products?.name ?? "";
        const capacity = item.capacity ?? "";
        if (
          !catName.toLowerCase().includes(q) &&
          !specName.toLowerCase().includes(q) &&
          !prodName.toLowerCase().includes(q) &&
          !capacity.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [items, filterCondition, searchQuery]);

  // 필터 변경 시 페이지 리셋
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [searchQuery, filterCondition]);

  // ─── 페이징 ───
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── 삭제 ───
  async function handleDelete(item: InventoryItemRow) {
    const prodName = item.inventory_products?.name ?? "이 품목";
    if (!confirm(`"${prodName}" 품목을 삭제하시겠습니까?`)) return;

    startTransition(async () => {
      const result = await deleteInventoryItem(item.id);
      if (result.error) {
        showToast(result.error, "error");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast("품목이 삭제되었습니다.");
    });
  }

  // ─── 인라인 수정 (Admin 전용) ───
  function makeInlineSaver(itemId: string, field: "capacity" | "quantity" | "base_estimate") {
    return async (rawValue: string) => {
      let data: Parameters<typeof adminInlineUpdateInventoryItem>[1] = {};

      if (field === "capacity") {
        data = { capacity: rawValue.trim() || null };
      } else if (field === "quantity") {
        const n = parseInt(rawValue, 10);
        if (isNaN(n)) { showToast("유효한 숫자를 입력해 주세요.", "error"); return; }
        data = { quantity: n };
      } else if (field === "base_estimate") {
        const n = parseInt(rawValue.replace(/,/g, ""), 10);
        if (isNaN(n)) { showToast("유효한 숫자를 입력해 주세요.", "error"); return; }
        data = { base_estimate: n };
      }

      const result = await adminInlineUpdateInventoryItem(itemId, data);
      if (result.error) {
        showToast(result.error, "error");
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  ...(field === "capacity" ? { capacity: data.capacity ?? null } : {}),
                  ...(field === "quantity" && data.quantity !== undefined ? { quantity: data.quantity } : {}),
                  ...(field === "base_estimate" && data.base_estimate !== undefined ? { base_estimate: data.base_estimate } : {}),
                }
              : i
          )
        );
        showToast("수정되었습니다.");
      }
    };
  }

  // ─── 트랜잭션 필터 ───
  const filteredTx = useMemo(
    () => transactions.filter((t) => txFilter === "ALL" ? true : t.transaction_type === txFilter),
    [transactions, txFilter]
  );

  return (
    <>
      {/* 토스트 */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 animate-slide-in">
          <div
            className={`rounded-xl border px-5 py-3 text-sm font-medium shadow-lg ${
              toast.type === "success"
                ? "border-green-200 bg-white text-green-700"
                : "border-red-200 bg-white text-red-700"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">재고 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            전체 {stats.totalItems}개 품목 · 총 {stats.totalQuantity.toLocaleString()}개 재고
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => router.push("/inventory/settings")}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              분류 설정
            </button>
          )}
          <button
            onClick={() => router.push("/inventory/new")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + 신규 등록
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="전체 품목" value={stats.totalItems} unit="종" color="bg-blue-50" />
        <StatCard label="총 재고 수량" value={stats.totalQuantity} unit="개" color="bg-green-50" />
        <StatCard
          label="부족 재고"
          value={stats.lowStock}
          unit="종"
          color="bg-yellow-50"
          highlight={stats.lowStock > 0}
        />
        <StatCard
          label="재고 없음"
          value={stats.outOfStock}
          unit="종"
          color="bg-red-50"
          highlight={stats.outOfStock > 0}
        />
      </div>

      {/* 검색 + 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="카테고리, 사양, 제품, 용량 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-64"
        />
        <select
          value={filterCondition}
          onChange={(e) => setFilterCondition(e.target.value as ItemCondition | "")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">전체 상태</option>
          {Object.entries(CONDITION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        {(searchQuery || filterCondition) && (
          <button
            onClick={() => { setSearchQuery(""); setFilterCondition(""); }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            필터 초기화
          </button>
        )}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length}개 품목 · 페이지 {page}/{totalPages}
        </span>
      </div>

      {/* 인라인 편집 안내 (Admin) */}
      {isAdmin && (
        <p className="mb-2 text-xs text-blue-600">
          ✏️ 용량·수량·기초견적 셀을 클릭하면 바로 수정할 수 있습니다.
        </p>
      )}

      {/* 테이블 */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">카테고리</th>
                <th className="px-4 py-3 font-semibold text-gray-600">사양</th>
                <th className="px-4 py-3 font-semibold text-gray-600">제품명</th>
                <th className="px-4 py-3 font-semibold text-gray-600">
                  용량{isAdmin && <span className="ml-1 text-blue-400 text-xs">✏</span>}
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600">상태</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  수량{isAdmin && <span className="ml-1 text-blue-400 text-xs">✏</span>}
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  기초견적{isAdmin && <span className="ml-1 text-blue-400 text-xs">✏</span>}
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600">최종 수정</th>
                {isAdmin && (
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">관리</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="px-4 py-12 text-center text-gray-400">
                    {items.length === 0 ? "등록된 재고 품목이 없습니다." : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                pagedItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors hover:bg-gray-50/50 ${
                      item.quantity === 0 ? "bg-red-50/30" : item.quantity <= LOW_STOCK_THRESHOLD ? "bg-yellow-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {item.inventory_categories?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {item.inventory_specs?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {item.inventory_products?.name ?? "-"}
                    </td>

                    {/* 용량 — Admin 인라인 편집 */}
                    <td className="px-4 py-3 text-gray-600">
                      {isAdmin ? (
                        <InlineEditCell
                          value={item.capacity ?? ""}
                          type="text"
                          onSave={makeInlineSaver(item.id, "capacity")}
                        />
                      ) : (
                        item.capacity ?? "-"
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          CONDITION_COLORS[item.condition] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {CONDITION_LABELS[item.condition] ?? item.condition}
                      </span>
                    </td>

                    {/* 수량 — Admin 인라인 편집 */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isAdmin ? (
                        <InlineEditCell
                          value={String(item.quantity)}
                          type="number"
                          onSave={makeInlineSaver(item.id, "quantity")}
                        />
                      ) : (
                        <span
                          className={`font-semibold ${
                            item.quantity === 0
                              ? "text-red-600"
                              : item.quantity <= LOW_STOCK_THRESHOLD
                                ? "text-yellow-600"
                                : "text-gray-900"
                          }`}
                        >
                          {item.quantity}
                        </span>
                      )}
                    </td>

                    {/* 기초견적 — Admin 인라인 편집 */}
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {isAdmin ? (
                        <InlineEditCell
                          value={String(item.base_estimate)}
                          type="number"
                          onSave={makeInlineSaver(item.id, "base_estimate")}
                        />
                      ) : (
                        `${item.base_estimate.toLocaleString()}원`
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(item.updated_at).toLocaleDateString("ko-KR")}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={isPending}
                            className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-40"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-xs text-gray-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length}개
            </span>
            <div className="flex items-center gap-1">
              <PageButton label="←" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} />
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PageButton key={p} label={String(p)} onClick={() => setPage(p)} active={p === page} />
              ))}
              <PageButton label="→" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
            </div>
          </div>
        )}
      </div>

      {/* ─── 입출고 기록 ─── */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">입출고 기록</h2>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["ALL", "INBOUND", "OUTBOUND"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setTxFilter(tab)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  txFilter === tab
                    ? tab === "INBOUND"
                      ? "bg-green-600 text-white shadow-sm"
                      : tab === "OUTBOUND"
                        ? "bg-red-600 text-white shadow-sm"
                        : "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "ALL" ? "전체" : tab === "INBOUND" ? "▲ 입고" : "▼ 출고"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-500">일시</th>
                <th className="px-4 py-3 font-semibold text-gray-500">구분</th>
                <th className="px-4 py-3 font-semibold text-gray-500">담당자</th>
                <th className="px-4 py-3 font-semibold text-gray-500">품목</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">수량</th>
                <th className="px-4 py-3 font-semibold text-gray-500">메모</th>
                <th className="px-4 py-3 font-semibold text-gray-500">접수번호</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    기록이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredTx.map((tx) => {
                  const isIn = tx.transaction_type === "INBOUND";
                  const inv = tx.inventory_items;
                  const itemLabel = [
                    inv?.inventory_categories?.name,
                    inv?.inventory_specs?.name,
                    inv?.inventory_products?.name,
                    inv?.capacity,
                  ]
                    .filter(Boolean)
                    .join(" / ");

                  return (
                    <tr key={tx.id} className="hover:bg-gray-50/50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                        {new Date(tx.created_at).toLocaleString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isIn ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {isIn ? "▲ 입고" : "▼ 출고"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{tx.employees?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-700">{itemLabel || "-"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={`font-semibold ${isIn ? "text-green-600" : "text-red-600"}`}>
                          {isIn ? "+" : "-"}{tx.quantity_changed}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{tx.notes ?? "-"}</td>
                      <td className="px-4 py-3 text-xs">
                        {tx.ticket_id ? (
                          <a href={`/tickets/${tx.ticket_id}`} className="text-blue-600 hover:underline">
                            #{tx.ticket_id.slice(0, 8)}
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── 서브 컴포넌트 ───

function StatCard({
  label,
  value,
  unit,
  color,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 p-4 shadow-sm ${color}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${highlight ? "text-red-600" : "text-gray-900"}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-sm font-normal text-gray-400">{unit}</span>
      </p>
    </div>
  );
}

function PageButton({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[2rem] rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-600 hover:bg-gray-200 disabled:opacity-30"
      }`}
    >
      {label}
    </button>
  );
}