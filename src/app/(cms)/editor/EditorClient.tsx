"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PageEntry } from "./catalog";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { Preview } from "./Preview";
import { savePageContentAction } from "./actions";

interface EditorClientProps {
  catalog: PageEntry[];
  pageKey: string;
  sectionKey: string;
  initialContent: Record<string, unknown>;
  themeContent: Record<string, unknown> | null;
  lastUpdatedAt: string | null;
}

type ToastKind = "success" | "error";

/**
 * 에디터 3-pane shell.
 *
 * State 모델:
 *   - draft: 사용자가 편집 중인 content_data (로컬 상태)
 *   - initialContent prop: 서버가 마지막으로 알려준 DB 값 (= "saved")
 *   - dirty = draft !== initialContent (얕은 비교 충분치 않으므로 deep)
 *
 * '저장' 버튼을 누르기 전까지는 모든 변경이 draft 에만 머문다.
 * 페이지/섹션을 바꾸면 라우터로 페이지를 다시 로드해 새 initialContent 를 받는다.
 *  (dirty 상태에서 페이지 전환 시 confirm 으로 사용자에게 확인)
 */
export function EditorClient({
  catalog,
  pageKey,
  sectionKey,
  initialContent,
  themeContent,
  lastUpdatedAt,
}: EditorClientProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, unknown>>(initialContent);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(lastUpdatedAt);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialContent),
    [draft, initialContent]
  );

  // 페이지/섹션 전환 — dirty 면 사용자 확인
  const navigate = useCallback(
    (nextPage: string, nextSection: string) => {
      if (nextPage === pageKey && nextSection === sectionKey) return;
      if (
        dirty &&
        !window.confirm(
          "저장하지 않은 변경사항이 있습니다. 이대로 페이지를 이동하시겠습니까?"
        )
      ) {
        return;
      }
      router.push(`/editor?page=${encodeURIComponent(nextPage)}&section=${encodeURIComponent(nextSection)}`);
    },
    [pageKey, sectionKey, dirty, router]
  );

  const reset = useCallback(() => {
    if (
      !dirty ||
      window.confirm("편집 내용을 모두 되돌릴까요? 마지막 저장 상태로 복원됩니다.")
    ) {
      setDraft(initialContent);
      setToast(null);
    }
  }, [dirty, initialContent]);

  const save = useCallback(() => {
    startTransition(async () => {
      const res = await savePageContentAction(pageKey, sectionKey, draft);
      if (res.success) {
        setToast({ kind: "success", message: res.message });
        setSavedAt(res.savedAt ?? new Date().toISOString());
        // 서버에서 받은 새 baseline 으로 갱신하기 위해 라우터 새로고침
        router.refresh();
      } else {
        setToast({ kind: "error", message: res.message });
      }
      setTimeout(() => setToast(null), 4000);
    });
  }, [pageKey, sectionKey, draft, router]);

  // theme 을 편집 중이라면 프리뷰는 draft 자체를 theme 으로 사용
  const previewTheme = useMemo(() => {
    if (pageKey === "main" && sectionKey === "theme") return draft;
    return themeContent ?? {};
  }, [pageKey, sectionKey, draft, themeContent]);

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_400px]">
      <Sidebar
        catalog={catalog}
        currentPage={pageKey}
        currentSection={sectionKey}
        onSelect={navigate}
      />

      <section className="flex min-h-0 flex-col bg-slate-100">
        <div className="flex shrink-0 items-center justify-between border-b bg-white px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">실시간 미리보기</h2>
            <p className="text-xs text-slate-400">
              편집 중인 내용으로 즉시 렌더링됩니다 (저장 전)
            </p>
          </div>
          {dirty && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              저장되지 않은 변경사항
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Preview
            pageKey={pageKey}
            sectionKey={sectionKey}
            content={draft}
            theme={previewTheme}
          />
        </div>
      </section>

      <aside className="flex min-h-0 flex-col border-l bg-white">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">설정</h2>
            <p className="text-xs text-slate-400">
              {pageKey} · {sectionKey}
              {savedAt && (
                <>
                  {" · "}저장: {new Date(savedAt).toLocaleString("ko-KR")}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <Inspector value={draft} onChange={setDraft} />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-white px-5 py-3">
          <button
            type="button"
            onClick={reset}
            disabled={!dirty || pending}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {pending ? "저장 중..." : dirty ? "저장" : "변경사항 없음"}
          </button>
        </div>
      </aside>

      {toast && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50">
          <div
            className={
              "pointer-events-auto rounded-xl px-5 py-3 text-sm font-semibold shadow-lg " +
              (toast.kind === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white")
            }
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
