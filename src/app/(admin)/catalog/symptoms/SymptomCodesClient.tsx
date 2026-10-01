"use client";

import { useState, useTransition } from "react";
import { useOptimisticRemove } from "../useOptimisticRemove";
import { createSymptomCodeAction, deleteSymptomCodeAction, updateSymptomCodeAction } from "../adminActions";
import type { Database } from "@/types/supabase";

type Code = Database["public"]["Tables"]["symptom_codes"]["Row"];

const INPUT = "rounded-lg border border-gray-300 px-2 py-1.5 text-sm";

/** 증상 코드: 대분류 › 소분류 2단계. 사용 중인 코드는 삭제 대신 "사용 중지"한다 */
export default function SymptomCodesClient({ codes }: { codes: Code[] }) {
  const { isHidden, remove } = useOptimisticRemove();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ parentId: "", code: "", name: "" });

  const tops = codes.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => codes.filter((c) => c.parent_id === id);

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    startTransition(async () => {
      setError(null);
      const res = await action();
      if (res.error) setError(res.error);
      else after?.();
    });
  }

  function add() {
    if (!form.code.trim() || !form.name.trim()) return setError("코드와 이름을 입력해 주세요.");
    run(
      () => createSymptomCodeAction({ parentId: form.parentId || null, code: form.code, name: form.name }),
      () => setForm({ parentId: form.parentId, code: "", name: "" })
    );
  }

  async function handleDelete(c: Code) {
    if (!window.confirm(`"${c.name}" 코드를 삭제하시겠습니까?`)) return;
    setError(await remove(c.id, () => deleteSymptomCodeAction(c.id)));
  }

  const Row = ({ c, child }: { c: Code; child?: boolean }) =>
    isHidden(c.id) ? null : (
      <li className={`flex flex-wrap items-center gap-2 py-2 ${child ? "pl-6" : ""}`}>
        <input
          defaultValue={c.name}
          maxLength={50}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== c.name) run(() => updateSymptomCodeAction(c.id, { name }));
          }}
          className={`w-40 ${INPUT} ${child ? "" : "font-semibold"}`}
          aria-label="증상 이름"
        />
        <span className="font-mono text-xs text-gray-400">{c.code}</span>
        <input
          type="number"
          defaultValue={c.sort_order}
          onBlur={(e) => {
            const sortOrder = Number(e.target.value) || 0;
            if (sortOrder !== c.sort_order) run(() => updateSymptomCodeAction(c.id, { sortOrder }));
          }}
          className={`w-20 text-center ${INPUT}`}
          aria-label="정렬 순서"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => updateSymptomCodeAction(c.id, { isActive: !c.is_active }))}
          className={`rounded-full px-3 py-1 text-xs font-medium ${c.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
        >
          {c.is_active ? "사용 중" : "사용 중지"}
        </button>
        <button type="button" onClick={() => handleDelete(c)} className="text-xs text-gray-400 hover:text-red-600">
          삭제
        </button>
      </li>
    );

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-gray-800">새 증상 코드</h2>
        <div className="flex flex-wrap gap-2">
          <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className={INPUT} aria-label="대분류">
            <option value="">대분류로 추가</option>
            {tops.map((t) => (
              <option key={t.id} value={t.id}>{t.name} 아래</option>
            ))}
          </select>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="코드 (영문 대문자, 예: NO_POWER)"
            maxLength={40}
            className={`w-56 font-mono ${INPUT}`}
          />
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="이름 (예: 전원 안 켜짐)" maxLength={50} className={`w-48 ${INPUT}`} />
          <button type="button" onClick={add} disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            추가
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">소분류 코드는 자동으로 &quot;대분류코드.입력코드&quot; 형태로 저장됩니다. 코드는 등록 후 바꿀 수 없습니다.</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-base font-semibold text-gray-800">증상 코드 목록</h2>
        <p className="mb-3 text-xs text-gray-500">이름·순서는 입력 후 칸을 벗어나면 저장됩니다. 접수건에서 사용된 코드는 삭제할 수 없으니 &quot;사용 중지&quot;로 바꿔 주세요.</p>
        <ul className="divide-y divide-gray-100">
          {tops.map((t) => (
            <div key={t.id}>
              <Row c={t} />
              {childrenOf(t.id).map((c) => (
                <Row key={c.id} c={c} child />
              ))}
            </div>
          ))}
        </ul>
      </section>
    </div>
  );
}
