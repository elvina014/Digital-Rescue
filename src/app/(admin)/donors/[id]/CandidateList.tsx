"use client";

import { useState } from "react";
import type { PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import { useOptimisticList } from "@/app/(admin)/tickets/[id]/repair-record/useOptimisticList";
import {
  addCandidateAction, deleteCandidateAction, extractDonorPartAction, requestExtractionAction, setCandidateStatusAction,
  type CandidateInput,
} from "../actions";
import { CANDIDATE_STATUS_LABEL, CONDITION_LABEL, type CandidateRow, type InboundInput } from "../labels";
import CandidateForm from "./CandidateForm";
import ExtractForm from "./ExtractForm";

interface Props {
  donorId: string;
  donorAvailable: boolean;
  /** 관리자/팀장: 적출 입고(재고 반영) 가능 */
  canBook: boolean;
  candidates: CandidateRow[];
  categories: { id: string; name: string }[];
}

const STATUS_CLS: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-800",
  REQUESTED: "bg-indigo-100 text-indigo-800",
  EXTRACTED: "bg-gray-100 text-gray-600",
  UNUSABLE: "bg-red-50 text-red-700",
};

const linkBtn = "text-xs underline disabled:opacity-50";

/** 적출 후보 부품 목록 — 낙관적 갱신, 실패 시 되돌림 */
export default function CandidateList({ donorId, donorAvailable, canBook, candidates, categories }: Props) {
  const list = useOptimisticList(candidates);
  const [open, setOpen] = useState<{ id: string; mode: "REQUEST" | "BOOK" } | null>(null);

  function add(input: CandidateInput, spec: PickedPartSpec | null) {
    const temp: CandidateRow = {
      id: `temp-${Date.now()}`, description: input.description.trim(), quantity: input.quantity, condition_estimate: input.conditionEstimate,
      status: "AVAILABLE", note: input.note || null, part_spec_id: input.partSpecId, partSpecLabel: spec?.label ?? null,
      category_id: null, categoryName: null, return_spec: null, return_name: null, return_capacity: null, extracted_at: null, inventory_item_id: null,
    };
    return list.run((l) => [...l, temp], () => addCandidateAction(donorId, input));
  }

  const patch = (id: string, values: Partial<CandidateRow>) => (l: CandidateRow[]) => l.map((x) => (x.id === id ? { ...x, ...values } : x));

  function submitInbound(c: CandidateRow, mode: "REQUEST" | "BOOK", input: InboundInput) {
    const fields = { category_id: input.categoryId, return_spec: input.returnSpec, return_name: input.returnName, return_capacity: input.returnCapacity || null };
    return mode === "BOOK"
      ? list.run(patch(c.id, { ...fields, status: "EXTRACTED" }), () => extractDonorPartAction(donorId, c.id, input))
      : list.run(patch(c.id, { ...fields, status: "REQUESTED" }), () => requestExtractionAction(donorId, c.id, input));
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-900">적출 후보 부품</h2>
      <p className="mb-3 text-xs text-gray-500">
        필요할 때 떼어내 입고합니다. 기사는 입고 요청, 관리자·팀장이 입고 승인(재고 반영)합니다.
      </p>
      {list.error && <p className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{list.error}</p>}
      <ul className="mb-3 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
        {list.items.length === 0 && <li className="p-3 text-gray-500">등록된 후보 부품이 없습니다.</li>}
        {list.items.map((c) => {
          const locked = c.status === "EXTRACTED" || c.id.startsWith("temp-");
          return (
            <li key={c.id} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-900">{c.description}</span>
                {c.quantity > 1 && <span className="text-xs text-gray-500">× {c.quantity}</span>}
                {c.partSpecLabel && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-900">{c.partSpecLabel}</span>}
                <span className="text-xs text-gray-500">{CONDITION_LABEL[c.condition_estimate] ?? c.condition_estimate}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[c.status] ?? ""}`}>{CANDIDATE_STATUS_LABEL[c.status] ?? c.status}</span>
                {c.return_spec && (
                  <span className="text-xs text-indigo-700">
                    → {[c.categoryName, c.return_spec, c.return_name, c.return_capacity].filter(Boolean).join(" / ")}
                  </span>
                )}
                {!locked && donorAvailable && (
                  <span className="ml-auto flex gap-3">
                    {c.status !== "UNUSABLE" && (
                      <button type="button" className={`${linkBtn} text-indigo-700`} onClick={() => setOpen({ id: c.id, mode: canBook ? "BOOK" : "REQUEST" })}>
                        {canBook ? "적출 입고" : c.status === "REQUESTED" ? "요청 수정" : "입고 요청"}
                      </button>
                    )}
                    {c.status === "REQUESTED" && !canBook && (
                      <button type="button" disabled={list.pending} className={`${linkBtn} text-gray-600`}
                        onClick={() => list.run(patch(c.id, { status: "AVAILABLE" }), () => setCandidateStatusAction(donorId, c.id, "AVAILABLE"))}>
                        요청 취소
                      </button>
                    )}
                    {c.status !== "REQUESTED" && (
                      <button type="button" disabled={list.pending} className={`${linkBtn} text-gray-600`}
                        onClick={() => {
                          const next = c.status === "UNUSABLE" ? "AVAILABLE" : "UNUSABLE";
                          list.run(patch(c.id, { status: next }), () => setCandidateStatusAction(donorId, c.id, next));
                        }}>
                        {c.status === "UNUSABLE" ? "적출 가능으로" : "사용 불가"}
                      </button>
                    )}
                    {c.status !== "REQUESTED" && (
                      <button type="button" disabled={list.pending} className={`${linkBtn} text-red-600`}
                        onClick={() => list.run((l) => l.filter((x) => x.id !== c.id), () => deleteCandidateAction(donorId, c.id))}>
                        삭제
                      </button>
                    )}
                  </span>
                )}
              </div>
              {c.note && <p className="mt-0.5 text-xs text-gray-500">{c.note}</p>}
              {open?.id === c.id && (
                <ExtractForm
                  candidate={c}
                  categories={categories}
                  mode={open.mode}
                  pending={list.pending}
                  onSubmit={(input) => submitInbound(c, open.mode, input)}
                  onCancel={() => setOpen(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {donorAvailable ? (
        <CandidateForm pending={list.pending} onAdd={add} />
      ) : (
        <p className="text-xs text-gray-500">보관 중인 Donor 기기에만 후보 부품을 추가하거나 입고할 수 있습니다.</p>
      )}
    </section>
  );
}
