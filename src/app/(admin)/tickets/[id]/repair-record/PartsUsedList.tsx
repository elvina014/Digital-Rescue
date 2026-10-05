"use client";

import { useState } from "react";
import type { PickedModel } from "@/components/catalog/DeviceModelPicker";
import type { PickedBoard } from "@/components/catalog/BoardPicker";
import {
  COMPAT_STATUS_CLASS, COMPAT_STATUS_LABEL, CONFIDENCE_LABEL, INSTALL_ANSWER_LABEL, evidenceCountText,
} from "@/components/catalog/partLabels";
import { recordPartResultAction } from "./actions";
import PartResultForm, { type PartResultInput } from "./PartResultForm";
import type { PartCompatInfo, PartUsedRow } from "./labels";

interface Props {
  ticketId: string;
  partsUsed: PartUsedRow[];
  partCompat: Record<string, PartCompatInfo>;
  ticketModel: PickedModel | null;
  ticketBoard: PickedBoard | null;
  canEdit: boolean;
}

/** 사용 부품 (출고·구매 승인 내역 자동 표시) + 부품별 호환 확인 응답 */
export default function PartsUsedList({ ticketId, partsUsed, partCompat, ticketModel, ticketBoard, canEdit }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  // 낙관적 업데이트: 저장 중인 응답을 먼저 보여주고, 서버 오류면 되돌린다
  const [optimistic, setOptimistic] = useState<Record<string, PartResultInput>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  async function save(materialId: string, input: PartResultInput) {
    setError(null);
    setPending(true);
    setOptimistic((prev) => ({ ...prev, [materialId]: input }));
    setEditing(null);
    const res = await recordPartResultAction(ticketId, {
      materialId,
      partSpecId: input.spec?.partSpecId ?? null,
      answer: input.answer,
      limitationNote: input.limitationNote,
      targetType: input.targetType,
      targetId: input.targetId,
    });
    setPending(false);
    setOptimistic((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
    if (res.error) {
      setError({ id: materialId, text: res.error });
      setEditing(materialId);
    }
  }

  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-gray-800">
        사용 부품 <span className="text-xs font-normal text-gray-400">· 출고·구매 승인 내역에서 자동 표시 · 장착 결과(호환 확인)를 남겨 주세요</span>
      </h3>
      {partsUsed.length === 0 ? (
        <p className="text-xs text-gray-400">승인된 자재가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50 text-sm">
          {partsUsed.map((p) => {
            const id = p.material_id ?? "";
            const info = partCompat[id];
            const opt = optimistic[id];
            const answer = opt ? opt.answer : info?.answer?.answer ?? "UNKNOWN";
            const summary = opt ? null : info?.answer?.summary ?? null;
            const counts = summary ? evidenceCountText(summary) : "";
            return (
              <li key={id} className="px-3 py-2 text-gray-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    {[p.category_name, p.spec_name, p.product_name, p.capacity].filter(Boolean).join(" / ")} × {p.quantity}개
                  </span>
                  {p.request_type === "purchase" && <span className="text-xs text-amber-600">구매</span>}
                  {p.is_outsourced && <span className="text-xs text-gray-400">외주</span>}
                  {info && !info.excluded && (
                    <>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${answer === "UNKNOWN" ? "bg-gray-200 text-gray-600" : "bg-teal-100 text-teal-800"}`}>
                        {answer === "UNKNOWN" ? "호환 확인 미응답" : INSTALL_ANSWER_LABEL[answer]}
                      </span>
                      {summary && (
                        <span className={`rounded px-1.5 py-0.5 text-xs ${COMPAT_STATUS_CLASS[summary.status ?? "unknown"]}`}>
                          {summary.target_label} {COMPAT_STATUS_LABEL[summary.status ?? "unknown"]} · {CONFIDENCE_LABEL[summary.confidence ?? "inferred"]}
                          {counts && ` (${counts})`}
                        </span>
                      )}
                      {canEdit && editing !== id && (
                        <button type="button" onClick={() => { setEditing(id); setError(null); }} disabled={pending} className="ml-auto text-xs text-teal-700 hover:underline disabled:opacity-50">
                          {answer === "UNKNOWN" ? "호환 확인" : "변경"}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {(opt?.spec ?? info?.answer?.spec) && answer !== "UNKNOWN" && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    부품 규격: {(opt?.spec ?? info?.answer?.spec)?.label}
                    {(opt?.limitationNote || info?.answer?.limitationNote) && ` · 제한사항: ${opt?.limitationNote || info?.answer?.limitationNote}`}
                  </p>
                )}
                {error?.id === id && <p className="mt-1 text-xs text-red-600">{error.text}</p>}
                {editing === id && info && (
                  <PartResultForm
                    initialSpec={info.answer?.spec ?? info.defaultSpec}
                    initialAnswer={info.answer?.answer ?? "OK"}
                    initialNote={info.answer?.limitationNote ?? ""}
                    ticketModel={ticketModel}
                    ticketBoard={ticketBoard}
                    pending={pending}
                    onSubmit={(input) => save(id, input)}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
