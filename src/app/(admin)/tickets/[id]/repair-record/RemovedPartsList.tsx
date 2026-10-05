"use client";

import { addRemovedPartAction, removeRepairRowAction, updateRemovedPartAction, type RemovedPartInput } from "./actions";
import { useOptimisticList } from "./useOptimisticList";
import RecordList from "./RecordList";
import RemovedPartForm from "./RemovedPartForm";
import { PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import type { PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import { DISPOSITION_LABEL, type MaterialReturnInfo, type RemovedPartRow } from "./labels";

interface Props {
  ticketId: string;
  removedParts: RemovedPartRow[];
  materialReturns: MaterialReturnInfo[];
  categories: { id: string; name: string }[];
  canEdit: boolean;
}

const toInput = (p: RemovedPartRow, disposition: string | null): RemovedPartInput => ({
  description: p.description, disposition, categoryId: p.category_id, returnSpec: p.return_spec ?? "",
  returnName: p.return_name ?? "", returnCapacity: p.return_capacity ?? "", returnCondition: p.return_condition ?? "", quantity: p.quantity,
  partSpecId: p.part_spec_id,
});

/** 적출 부품: 자재 출고 행에서 등록한 것(읽기 전용) + 자재 행 없이 떼어낸 부품 */
export default function RemovedPartsList({ ticketId, removedParts, materialReturns, categories, canEdit }: Props) {
  const list = useOptimisticList(removedParts);

  function add(input: RemovedPartInput, spec: PickedPartSpec | null) {
    const temp: RemovedPartRow = {
      id: `temp-${Date.now()}`, ticket_id: ticketId, description: input.description.trim(), category_id: input.categoryId,
      disposition: input.disposition, return_spec: input.returnSpec || null, return_name: input.returnName || null,
      return_capacity: input.returnCapacity || null, return_condition: input.returnCondition || null, quantity: input.quantity,
      handled_by: null, handled_at: null, inbound_approved_at: null, inbound_approved_by: null, inventory_item_id: null,
      created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      part_spec_id: input.partSpecId, part_specs: spec && { part_type: "", name: spec.label },
    };
    return list.run((l) => [...l, temp], () => addRemovedPartAction(ticketId, input));
  }

  function setDisposition(p: RemovedPartRow, value: string) {
    const disposition = value || null;
    list.run(
      (l) => l.map((x) => (x.id === p.id ? { ...x, disposition } : x)),
      () => updateRemovedPartAction(ticketId, p.id, toInput(p, disposition))
    );
  }

  return (
    <div className="space-y-2">
      {materialReturns.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-gray-800">
            적출 부품 <span className="text-xs font-normal text-gray-400">· 사용 자재에서 등록한 적출품 (자동 표시)</span>
          </h3>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50 text-sm">
            {materialReturns.map((m) => (
              <li key={m.id} className="px-3 py-2 text-gray-700">
                {m.label} / {m.condition} × {m.quantity}개{" "}
                <span className="text-xs text-indigo-600">
                  재고등록 · {m.status === "approved" ? "입고 완료" : m.status === "rejected" ? "반려" : "입고 대기"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <RecordList
        title={materialReturns.length > 0 ? "그 외 적출 부품" : "적출 부품"}
        hint="자재 출고 없이 떼어낸 부품"
        items={list.items}
        emptyText="기록된 적출 부품이 없습니다."
        error={list.error}
        canEdit={canEdit}
        isLocked={(p) => !!p.inbound_approved_at}
        onRemove={(p) => list.run((l) => l.filter((x) => x.id !== p.id), () => removeRepairRowAction(ticketId, "ticket_removed_parts", p.id))}
        renderItem={(p) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-900">{p.description}</span>
            {p.quantity > 1 && <span className="text-xs text-gray-500">× {p.quantity}개</span>}
            {p.part_specs && (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
                {[PART_TYPE_LABEL[p.part_specs.part_type], p.part_specs.name].filter(Boolean).join(" · ")}
              </span>
            )}
            {p.disposition === "STOCK" ? (
              <span className="text-xs text-indigo-600">
                재고등록 ({[p.return_spec, p.return_name, p.return_capacity].filter(Boolean).join(" / ")} / {p.return_condition}) ·{" "}
                {p.inbound_approved_at ? "입고 완료" : "입고 대기"}
              </span>
            ) : canEdit ? (
              <select
                value={p.disposition ?? ""}
                onChange={(e) => setDisposition(p, e.target.value)}
                className={`rounded border px-1.5 py-0.5 text-xs ${p.disposition ? "border-gray-300" : "border-amber-400 bg-amber-50"}`}
                aria-label="처리 방법"
              >
                <option value="">미정</option>
                {Object.entries(DISPOSITION_LABEL).filter(([k]) => k !== "STOCK").map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            ) : (
              <span className={p.disposition ? "text-xs text-gray-600" : "text-xs font-semibold text-amber-600"}>
                {p.disposition ? DISPOSITION_LABEL[p.disposition] : "미정"}
              </span>
            )}
          </div>
        )}
      >
        <RemovedPartForm categories={categories} pending={list.pending} onAdd={add} />
      </RecordList>
    </div>
  );
}
