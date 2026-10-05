"use client";

import { useState } from "react";
import type { NoteInput } from "@/app/(admin)/lookup/actions";
import { NOTE_MAX, NOTE_TYPE_LABEL } from "./labels";

interface Props {
  initial?: NoteInput;
  submitLabel: string;
  onSubmit: (input: NoteInput) => Promise<string | null>;
  onCancel?: () => void;
}

/** 메모 입력 (추가/수정 공용) — 한국어 검증, 실패 시 입력값 유지 */
export default function ModelNoteForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [noteType, setNoteType] = useState(initial?.noteType ?? "TIP");
  const [body, setBody] = useState(initial?.body ?? "");
  const [isPinned, setIsPinned] = useState(initial?.isPinned ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!body.trim()) return setError("메모 내용을 입력해 주세요.");
    if (body.trim().length > NOTE_MAX) return setError(`${NOTE_MAX}자 이내로 입력해 주세요.`);
    setSaving(true);
    setError(null);
    const err = await onSubmit({ noteType, body, isPinned });
    setSaving(false);
    if (err) return setError(err);
    if (!initial) {
      setBody("");
      setIsPinned(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={noteType} onChange={(e) => setNoteType(e.target.value)} aria-label="메모 종류"
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm">
          {Object.entries(NOTE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1 text-sm text-gray-700">
          <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} /> 상단 고정
        </label>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} aria-label="메모 내용"
        placeholder="예: 하판 나사 길이가 위치마다 다름 — 고객 개인정보를 입력하지 마세요"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">{body.trim().length} / {NOTE_MAX}</span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1 text-sm text-gray-600 hover:bg-gray-100">취소</button>
          )}
          <button type="button" onClick={submit} disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "저장 중…" : submitLabel}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
