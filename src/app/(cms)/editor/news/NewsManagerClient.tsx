"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NewsRecord } from "@/lib/news";
import {
  archiveNewsAction,
  deleteNewsAction,
  publishNewsAction,
  restoreNewsAction,
  unpublishNewsAction,
  updateNewsAction,
  type NewsActionResult,
  type NewsEditableFields,
} from "./news-actions";

type StatusFilter = "draft" | "published" | "archived" | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "draft", label: "검수 대기" },
  { key: "published", label: "공개" },
  { key: "archived", label: "보관" },
  { key: "all", label: "전체" },
];

const STATUS_BADGE: Record<NewsRecord["status"], { label: string; cls: string }> = {
  draft: { label: "검수 대기", cls: "bg-amber-100 text-amber-700" },
  published: { label: "공개", cls: "bg-green-100 text-green-700" },
  archived: { label: "보관", cls: "bg-gray-200 text-gray-600" },
};

export function NewsManagerClient({ items }: { items: NewsRecord[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("draft");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c = { draft: 0, published: 0, archived: 0, all: items.length };
    for (const it of items) c[it.status] += 1;
    return c;
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((it) => it.status === filter)),
    [items, filter]
  );

  const run = (id: string, action: () => Promise<NewsActionResult>) => {
    setBusyId(id);
    setToast(null);
    startTransition(async () => {
      const res = await action();
      setToast({ ok: res.success, text: res.message });
      setBusyId(null);
      if (res.success) {
        setEditingId(null);
        router.refresh();
      }
    });
  };

  return (
    <div>
      {/* 필터 탭 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
              <span className={active ? "ml-1.5 text-gray-300" : "ml-1.5 text-gray-400"}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${
            toast.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-400">
          해당 상태의 뉴스가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
            >
              {editingId === item.id ? (
                <NewsEditForm
                  item={item}
                  busy={busyId === item.id}
                  onCancel={() => setEditingId(null)}
                  onSave={(fields) => run(item.id, () => updateNewsAction(item.id, fields))}
                />
              ) : (
                <NewsRow
                  item={item}
                  busy={busyId === item.id}
                  onEdit={() => {
                    setToast(null);
                    setEditingId(item.id);
                  }}
                  onPublish={() => run(item.id, () => publishNewsAction(item.id))}
                  onUnpublish={() => run(item.id, () => unpublishNewsAction(item.id))}
                  onArchive={() => run(item.id, () => archiveNewsAction(item.id))}
                  onRestore={() => run(item.id, () => restoreNewsAction(item.id))}
                  onDelete={() => {
                    if (confirm("이 뉴스를 삭제할까요? 되돌릴 수 없습니다.")) {
                      run(item.id, () => deleteNewsAction(item.id));
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewsRow({
  item,
  busy,
  onEdit,
  onPublish,
  onUnpublish,
  onArchive,
  onRestore,
  onDelete,
}: {
  item: NewsRecord;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const badge = STATUS_BADGE[item.status];

  return (
    <div className={busy ? "pointer-events-none opacity-50" : undefined}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
        <span>{item.news_date}</span>
        <span>·</span>
        <span>{item.source || "출처 없음"}</span>
        {item.source_url && !item.source_url.startsWith("seed:") && (
          <>
            <span>·</span>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              원문
            </a>
          </>
        )}
      </div>

      <h3 className="mt-2 font-semibold text-gray-900">{item.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-gray-500">{item.summary}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.status !== "published" && (
          <ActionButton onClick={onPublish} variant="primary">
            공개
          </ActionButton>
        )}
        {item.status === "published" && (
          <ActionButton onClick={onUnpublish}>비공개</ActionButton>
        )}
        <ActionButton onClick={onEdit}>수정</ActionButton>
        {item.status === "archived" ? (
          <ActionButton onClick={onRestore}>복원</ActionButton>
        ) : (
          <ActionButton onClick={onArchive}>보관</ActionButton>
        )}
        <ActionButton onClick={onDelete} variant="danger">
          삭제
        </ActionButton>
      </div>
    </div>
  );
}

function NewsEditForm({
  item,
  busy,
  onCancel,
  onSave,
}: {
  item: NewsRecord;
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: NewsEditableFields) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [newsDate, setNewsDate] = useState(item.news_date);
  const [source, setSource] = useState(item.source);
  const [sourceUrl, setSourceUrl] = useState(item.source_url ?? "");
  const [summary, setSummary] = useState(item.summary);
  const [body, setBody] = useState(item.body);

  return (
    <form
      className={busy ? "pointer-events-none space-y-3 opacity-50" : "space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title,
          news_date: newsDate,
          source,
          source_url: sourceUrl,
          summary,
          body,
        });
      }}
    >
      <Field label="제목">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          required
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="날짜">
          <input
            type="date"
            value={newsDate}
            onChange={(e) => setNewsDate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </Field>
        <Field label="출처">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label="원문 URL">
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="https://..."
        />
      </Field>

      <Field label="요약 (목록에 노출)">
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </Field>

      <Field label="본문 (문단 사이는 빈 줄로 구분)">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed"
        />
      </Field>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
}) {
  const cls =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : variant === "danger"
        ? "text-red-600 ring-1 ring-red-200 hover:bg-red-50"
        : "text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}
