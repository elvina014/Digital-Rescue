"use client";

import { useState } from "react";
import { addModelNoteAction, deleteModelNoteAction, updateModelNoteAction } from "@/app/(admin)/lookup/actions";
import type { DeviceTarget, KnowledgeNote, NoteInput } from "@/app/(admin)/lookup/actions";
import ModelNoteForm from "./ModelNoteForm";
import { NOTE_TYPE_CLASS, NOTE_TYPE_LABEL } from "./labels";

interface Props {
  initial: KnowledgeNote[];
  target: DeviceTarget;
  targetLabel: string;
  canWrite: boolean;
  authorName: string;
}

/** 모델 메모 목록 — 추가·수정·삭제는 낙관적 반영, 실패 시 원래 상태로 되돌린다 */
export default function ModelNoteList({ initial, target, targetLabel, canWrite, authorName }: Props) {
  const [notes, setNotes] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(input: NoteInput) {
    const temp: KnowledgeNote = {
      id: `temp-${Date.now()}`, note_type: input.noteType, body: input.body.trim(), is_pinned: input.isPinned,
      target_label: targetLabel, author: authorName, updated_at: new Date().toISOString(), can_edit: false,
    };
    const before = notes;
    setNotes([temp, ...notes]);
    const res = await addModelNoteAction(target, input);
    if (res.error || !res.data) {
      setNotes(before);
      return res.error ?? "저장하지 못했습니다.";
    }
    const id = res.data.id;
    setNotes((cur) => cur.map((n) => (n.id === temp.id ? { ...n, id, can_edit: true } : n)));
    return null;
  }

  async function update(id: string, input: NoteInput) {
    const before = notes;
    setNotes(notes.map((n) => (n.id === id ? { ...n, note_type: input.noteType, body: input.body.trim(), is_pinned: input.isPinned } : n)));
    setEditing(null);
    const res = await updateModelNoteAction(id, input);
    if (res.error) {
      setNotes(before);
      setEditing(id);
      return res.error;
    }
    return null;
  }

  async function remove(id: string) {
    if (!window.confirm("이 메모를 삭제할까요?")) return;
    const before = notes;
    setNotes(notes.filter((n) => n.id !== id));
    setError(null);
    const res = await deleteModelNoteAction(id);
    if (res.error) {
      setNotes(before);
      setError(res.error);
    }
  }

  return (
    <div className="space-y-2">
      {notes.length === 0 && <p className="text-sm text-gray-500">등록된 메모가 없습니다.</p>}
      <ul className="space-y-2">
        {notes.map((n) =>
          editing === n.id ? (
            <li key={n.id}>
              <ModelNoteForm initial={{ noteType: n.note_type, body: n.body, isPinned: n.is_pinned }} submitLabel="수정 저장"
                onSubmit={(input) => update(n.id, input)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={n.id} className={`rounded-lg border p-3 ${n.is_pinned ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${NOTE_TYPE_CLASS[n.note_type] ?? ""}`}>
                  {NOTE_TYPE_LABEL[n.note_type] ?? n.note_type}
                </span>
                {n.is_pinned && <span className="text-amber-700">고정</span>}
                <span className="text-gray-500">{n.target_label}</span>
                <span className="text-gray-400">{n.author ?? "-"} · {n.updated_at.slice(0, 10)}</span>
                {n.can_edit && !n.id.startsWith("temp-") && (
                  <span className="ml-auto flex gap-2">
                    <button type="button" onClick={() => setEditing(n.id)} className="text-blue-700 underline">수정</button>
                    <button type="button" onClick={() => remove(n.id)} className="text-red-600 underline">삭제</button>
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{n.body}</p>
            </li>
          )
        )}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {canWrite && <ModelNoteForm submitLabel="메모 추가" onSubmit={add} />}
    </div>
  );
}
