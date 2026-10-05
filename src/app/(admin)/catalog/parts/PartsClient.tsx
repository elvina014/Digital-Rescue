"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import NewPartSpecInline from "@/components/catalog/NewPartSpecInline";
import { PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import { createInterchangeGroupAction } from "../partActions";
import PartSpecEditor from "./PartSpecEditor";
import type { GroupOption, PartSpecRow } from "./types";

const inputCls = "rounded-lg border border-gray-300 px-3 py-1.5 text-sm";

/** 부품 규격 목록 (필터: 종류 / 검토 필요 / 검색어) + 선택한 규격 편집·호환성 */
export default function PartsClient({ specs, groups }: { specs: PartSpecRow[]; groups: GroupOption[] }) {
  const router = useRouter();
  const [partType, setPartType] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const t = text.trim().toLowerCase();
  const visible = specs.filter((s) => {
    if (partType && s.partType !== partType) return false;
    if (reviewOnly && !s.needsReview) return false;
    return !t || s.name.toLowerCase().includes(t) || s.aliases.some((a) => a.alias.toLowerCase().includes(t));
  });
  const selected = specs.find((s) => s.id === selectedId) ?? null;

  function handleCreateGroup() {
    if (!groupName.trim()) return setMessage({ ok: false, text: "호환 그룹 이름을 입력해 주세요." });
    startTransition(async () => {
      const res = await createInterchangeGroupAction(groupName);
      if (res.error) return setMessage({ ok: false, text: res.error });
      setMessage({ ok: true, text: `호환 그룹 "${groupName.trim()}" 등록 완료` });
      setGroupName("");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
      <section>
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={partType} onChange={(e) => setPartType(e.target.value)} className={inputCls} aria-label="부품 종류">
            <option value="">전체 종류</option>
            {Object.entries(PART_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="품번·별칭 검색" className={`flex-1 ${inputCls}`} />
          <label className="flex items-center gap-1 text-sm text-gray-700">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} /> 검토 필요만
          </label>
          <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            + 새 부품 규격
          </button>
        </div>
        {creating && (
          <NewPartSpecInline
            onCreated={(s, msg) => { setCreating(false); setMessage({ ok: true, text: msg }); setSelectedId(s.partSpecId); router.refresh(); }}
            onCancel={() => setCreating(false)}
          />
        )}
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {visible.length === 0 && <li className="p-4 text-sm text-gray-500">표시할 부품 규격이 없습니다.</li>}
          {visible.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 ${s.id === selectedId ? "bg-blue-50" : ""}`}
              >
                <span>
                  <span className="text-gray-500">{PART_TYPE_LABEL[s.partType] ?? s.partType}</span> <span className="text-gray-900">{s.name}</span>
                  {s.needsReview && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">검토 필요</span>}
                </span>
                <span className="text-xs text-gray-500">호환 {s.compat.filter((c) => !c.is_candidate).length} · 별칭 {s.aliases.length}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <span className="text-sm font-semibold text-gray-800">호환 그룹</span>
          <input className={`flex-1 ${inputCls}`} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="새 그룹 이름 (예: 15.6 FHD 30핀)" maxLength={100} />
          <button type="button" onClick={handleCreateGroup} disabled={isPending} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
            {isPending ? "등록 중..." : "그룹 등록"}
          </button>
          <p className="w-full text-xs text-gray-500">
            등록된 그룹 {groups.length}개{groups.length > 0 && `: ${groups.map((g) => g.name).join(", ")}`} — 같은 그룹의 규격은 서로의 호환 정보를 &quot;추정&quot; 후보로 보여줍니다.
          </p>
        </div>
        {message && <p className={`mt-2 rounded-lg p-2 text-xs ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
      </section>
      <section>
        {selected ? (
          <PartSpecEditor key={selected.id} spec={selected} groups={groups} onDeleted={() => setSelectedId(null)} />
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">왼쪽에서 부품 규격을 선택하면 편집하고 호환성을 볼 수 있습니다.</p>
        )}
      </section>
    </div>
  );
}
