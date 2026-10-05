"use client";

import { useState, useTransition } from "react";
import DeviceModelPicker, { type PickedModel } from "@/components/catalog/DeviceModelPicker";
import BoardPicker, { type PickedBoard } from "@/components/catalog/BoardPicker";
import {
  COMPAT_STATUS_CLASS, COMPAT_STATUS_LABEL, CONFIDENCE_LABEL, EVIDENCE_KIND_LABEL, evidenceCountText,
} from "@/components/catalog/partLabels";
import { recordCompatibilityAction } from "../partActions";
import EvidenceList from "./EvidenceList";
import type { PartSpecRow } from "./types";

const inputCls = "rounded-lg border border-gray-300 px-2 py-1.5 text-sm";
const KIND_HINT: Record<string, string> = {
  DOCUMENT: "데이터시트·서비스 매뉴얼 등 (출처 필수)",
  INFERENCE: "규격이 같아 보이는 등 추정",
  INSTALL: "실제 장착해서 확인한 경우만",
  OVERRIDE: "상태만 조정 (사유 필수, '검증됨'은 만들 수 없음)",
};

/** 부품 규격의 호환성 목록(상태·신뢰도·근거 건수) + 근거 이력 + 근거 추가 */
export default function CompatibilityPanel({ spec }: { spec: PartSpecRow }) {
  const [model, setModel] = useState<PickedModel | null>(null);
  const [board, setBoard] = useState<PickedBoard | null>(null);
  const [kind, setKind] = useState("DOCUMENT");
  const [status, setStatus] = useState("compatible");
  const [limitationNote, setLimitationNote] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    const target =
      spec.compatTarget === "BOARD"
        ? board && { type: "BOARD" as const, id: board.boardId }
        : model && (model.variantId ? { type: "VARIANT" as const, id: model.variantId } : { type: "MODEL" as const, id: model.modelId });
    if (!target) return setMessage({ ok: false, text: "호환 대상(모델/변형/보드)을 선택해 주세요." });
    if (status === "conditional" && !limitationNote.trim()) return setMessage({ ok: false, text: "조건부는 제한사항을 입력해 주세요." });
    if (kind === "DOCUMENT" && !reference.trim()) return setMessage({ ok: false, text: "문서 근거는 출처(문서명 또는 URL)를 입력해 주세요." });
    if (kind === "OVERRIDE" && !note.trim()) return setMessage({ ok: false, text: "관리자 조정 사유를 입력해 주세요." });
    startTransition(async () => {
      const res = await recordCompatibilityAction({
        partSpecId: spec.id, targetType: target.type, targetId: target.id, kind, observedStatus: status, limitationNote, reference, note,
      });
      if (res.error) return setMessage({ ok: false, text: res.error });
      setMessage({ ok: true, text: "근거를 등록했습니다." });
      setLimitationNote("");
      setReference("");
      setNote("");
    });
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-800">호환성</p>
      {spec.compat.length === 0 ? (
        <p className="text-xs text-gray-400">등록된 호환 정보가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
          {spec.compat.map((c) => {
            const key = `${c.target_type}-${c.target_id}`;
            const counts = evidenceCountText(c);
            return (
              <li key={key} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-gray-900">{c.target_label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${COMPAT_STATUS_CLASS[c.status ?? "unknown"]}`}>{COMPAT_STATUS_LABEL[c.status ?? "unknown"]}</span>
                  <span className="text-xs text-gray-500">{CONFIDENCE_LABEL[c.confidence ?? "inferred"]}</span>
                  {c.is_candidate && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">호환 그룹 후보</span>}
                  {c.has_override && <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">관리자 조정</span>}
                  {counts && <span className="text-xs text-gray-500">근거: {counts}</span>}
                  {!c.is_candidate && c.compatibility_id && (
                    <button type="button" onClick={() => setOpen(open === key ? null : key)} className="ml-auto text-xs text-blue-700 hover:underline">
                      {open === key ? "근거 닫기" : "근거 보기"}
                    </button>
                  )}
                </div>
                {c.limitation_note && <p className="mt-0.5 text-xs text-amber-700">{c.limitation_note}</p>}
                {open === key && (
                  <div className="mt-2">
                    <EvidenceList evidence={spec.evidence.filter((e) => e.compatibilityId === c.compatibility_id)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-700">근거 추가</p>
        {spec.compatTarget === "BOARD" ? (
          <BoardPicker value={board} onChange={setBoard} />
        ) : (
          <DeviceModelPicker value={model} onChange={setModel} />
        )}
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls} aria-label="근거 종류">
            {["DOCUMENT", "INFERENCE", "INSTALL", "OVERRIDE"].map((k) => <option key={k} value={k}>{EVIDENCE_KIND_LABEL[k]}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls} aria-label="호환 여부">
            {["compatible", "conditional", "incompatible"].map((s) => <option key={s} value={s}>{COMPAT_STATUS_LABEL[s]}</option>)}
          </select>
          <span className="self-center text-xs text-gray-500">{KIND_HINT[kind]}</span>
        </div>
        {(status === "conditional" || kind === "OVERRIDE") && (
          <input value={limitationNote} onChange={(e) => setLimitationNote(e.target.value)} placeholder="제한사항 (예: 밝기 조절 불가, 브래킷 가공 필요)" className={`w-full ${inputCls}`} />
        )}
        {kind === "DOCUMENT" && (
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="출처 (문서명 또는 URL)" className={`w-full ${inputCls}`} />
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "OVERRIDE" ? "조정 사유 (필수)" : "메모 (선택 — 고객 개인정보를 적지 마세요)"} className={`w-full ${inputCls}`} />
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleAdd} disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {isPending ? "등록 중..." : "근거 등록"}
          </button>
          {message && <span className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
        </div>
      </div>
    </div>
  );
}
