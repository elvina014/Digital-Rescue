"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PageEntry } from "./catalog";
import { SECTION_DEFAULTS } from "./catalog";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { Preview } from "./Preview";
import { savePageContentAction } from "./actions";

// ────────────────────────── 타입 ──────────────────────────

interface SectionRecord {
  data: Record<string, unknown>;
  savedAt: string | null;
}

interface EditorClientProps {
  catalog: PageEntry[];
  /** 현재 URL 의 page_key (페이지 전환 시만 router 사용) */
  pageKey: string;
  /** 초기 선택 섹션 — 이후 전환은 로컬 state 로 처리 */
  initialSectionKey: string;
  /** 이 페이지에 속한 모든 섹션의 DB 데이터 + savedAt */
  contentMap: Record<string, SectionRecord>;
  /** 다른 섹션 미리보기용 theme 데이터 */
  themeContent: Record<string, unknown> | null;
}

/** 섹션별 로컬 상태 (저장된 baseline + 저장 시각) */
interface SectionState {
  /** 마지막으로 저장된 데이터 (dirty 비교 기준) */
  saved: Record<string, unknown>;
  savedAt: string | null;
}

type ToastKind = "success" | "error";

// ────────────────────────── Deep Merge ──────────────────────────

/**
 * base(defaultData) 에 override(DB 값)를 깊은 병합한다.
 * - 빈 객체({}) 또는 null override → base 를 그대로 반환
 * - 배열 필드는 override 가 있으면 통째로 교체 (요소 단위 병합 없음)
 */
function deepMerge(
  base: Record<string, unknown>,
  override: unknown,
): Record<string, unknown> {
  if (
    override === null ||
    override === undefined ||
    typeof override !== "object" ||
    Array.isArray(override) ||
    Object.keys(override as Record<string, unknown>).length === 0
  ) {
    return base;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (
      v !== null &&
      v !== undefined &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof result[k] === "object" &&
      result[k] !== null &&
      !Array.isArray(result[k])
    ) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * 특정 섹션의 "완전한 초기 데이터"를 반환한다.
 * SECTION_DEFAULTS (구조 skeleton) + DB 값 (실제 콘텐츠) 를 병합.
 */
function buildSaved(
  sectionKey: string,
  contentMap: Record<string, SectionRecord>,
): Record<string, unknown> {
  const defaults = SECTION_DEFAULTS[sectionKey] ?? {};
  const dbData = contentMap[sectionKey]?.data;
  return normalizeSectionData(sectionKey, deepMerge(defaults, dbData));
}

function normalizeSectionData(
  sectionKey: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (sectionKey !== "services" || !Array.isArray(data.items)) return data;

  const serviceDefaults = SECTION_DEFAULTS.services as
    | { items?: Record<string, unknown>[] }
    | undefined;
  const defaultsById = new Map(
    (serviceDefaults?.items ?? [])
      .filter((item) => typeof item.id === "string")
      .map((item) => [item.id as string, item]),
  );

  const items = data.items.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }

    const service = item as Record<string, unknown>;
    const defaults =
      typeof service.id === "string" ? defaultsById.get(service.id) : undefined;

    return {
      ...defaults,
      ...service,
      modalDetails: Array.isArray(service.modalDetails)
        ? service.modalDetails
        : Array.isArray(defaults?.modalDetails)
          ? defaults.modalDetails
          : [],
    };
  });

  return { ...data, items };
}

// ────────────────────────── 컴포넌트 ──────────────────────────

/**
 * 에디터 3-pane shell.
 *
 * 섹션 전환 전략:
 *   - 같은 page 내 섹션 이동 → 로컬 state 전환 (router 없음, 즉시 반응)
 *   - 다른 page 로 이동 → router.push() (서버에서 새 contentMap 로드)
 *
 * Dirty 상태:
 *   - JSON.stringify(draft) !== JSON.stringify(sectionStates[selectedSection].saved)
 *   - 저장 후에는 saved 를 draft 로 업데이트 → dirty = false
 *   - 섹션 이동 시 draft 를 새 섹션의 saved 로 교체 → dirty = false
 */
export function EditorClient({
  catalog,
  pageKey,
  initialSectionKey,
  contentMap,
  themeContent,
}: EditorClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);

  // 현재 선택된 섹션 (로컬 state — 같은 페이지 내 전환은 router 불필요)
  const [selectedSection, setSelectedSection] = useState(initialSectionKey);

  // 섹션별 "저장된 baseline" 상태
  // 초기화: 현재 페이지의 모든 섹션에 대해 defaultData + DB 값 deep merge
  const [sectionStates, setSectionStates] = useState<Record<string, SectionState>>(() => {
    const page = catalog.find((p) => p.pageKey === pageKey);
    const map: Record<string, SectionState> = {};
    for (const section of page?.sections ?? []) {
      map[section.key] = {
        saved: buildSaved(section.key, contentMap),
        savedAt: contentMap[section.key]?.savedAt ?? null,
      };
    }
    return map;
  });

  // 현재 섹션의 baseline (dirty 비교 기준)
  const initialData: Record<string, unknown> =
    sectionStates[selectedSection]?.saved ?? buildSaved(selectedSection, contentMap);

  // 편집 중인 draft
  const [draft, setDraft] = useState<Record<string, unknown>>(initialData);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialData),
    [draft, initialData],
  );

  // 변경사항 버리기 확인 모달
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [pendingNav, setPendingNav] = useState<{ page: string; section: string } | null>(null);

  // 실제 섹션 전환 (dirty 체크 없이 즉시 실행)
  const doSelectSection = useCallback(
    (nextSection: string) => {
      const next =
        sectionStates[nextSection]?.saved ?? buildSaved(nextSection, contentMap);
      setDraft(next);
      setSelectedSection(nextSection);
    },
    [sectionStates, contentMap],
  );

  // 사이드바 클릭 진입점 — dirty 분기 후 섹션/페이지 전환
  const handleSectionSelect = useCallback(
    (nextPage: string, nextSection: string) => {
      // 현재와 동일한 섹션이면 무시
      if (nextPage === pageKey && nextSection === selectedSection) return;

      if (dirty) {
        // dirty 상태 → 모달 표시 후 사용자 확인 대기
        setPendingNav({ page: nextPage, section: nextSection });
        setShowDiscardModal(true);
        return;
      }

      // 다른 페이지 → router (서버에서 새 contentMap 필요)
      if (nextPage !== pageKey) {
        router.push(
          `/editor?page=${encodeURIComponent(nextPage)}&section=${encodeURIComponent(nextSection)}`,
        );
        return;
      }

      // 같은 페이지, 다른 섹션 → 로컬 state 전환
      doSelectSection(nextSection);
    },
    [dirty, pageKey, selectedSection, doSelectSection, router],
  );

  // 모달 "변경 버리기" 확인
  const confirmDiscard = useCallback(() => {
    setShowDiscardModal(false);
    if (!pendingNav) return;
    if (pendingNav.page !== pageKey) {
      router.push(
        `/editor?page=${encodeURIComponent(pendingNav.page)}&section=${encodeURIComponent(pendingNav.section)}`,
      );
    } else {
      doSelectSection(pendingNav.section);
    }
    setPendingNav(null);
  }, [pendingNav, pageKey, router, doSelectSection]);

  const cancelDiscard = useCallback(() => {
    setShowDiscardModal(false);
    setPendingNav(null);
  }, []);

  // 되돌리기 — draft 를 마지막 저장 상태로 복원
  const reset = useCallback(() => {
    setDraft(initialData);
    setToast(null);
  }, [initialData]);

  // 저장
  const save = useCallback(() => {
    startTransition(async () => {
      const res = await savePageContentAction(pageKey, selectedSection, draft);
      if (res.success) {
        const now = res.savedAt ?? new Date().toISOString();
        // 저장 성공 → sectionStates baseline 업데이트 (router.refresh 불필요)
        setSectionStates((prev) => ({
          ...prev,
          [selectedSection]: { saved: draft, savedAt: now },
        }));
        setToast({ kind: "success", message: res.message });
      } else {
        setToast({ kind: "error", message: res.message });
      }
      setTimeout(() => setToast(null), 4000);
    });
  }, [pageKey, selectedSection, draft]);

  // 미리보기용 theme
  // - theme 섹션 편집 중이면 draft 를 직접 사용
  // - 그 외 main 페이지: 저장된 theme baseline 사용 (저장 즉시 반영)
  // - brand 페이지: 서버에서 받은 themeContent 사용
  const previewTheme = useMemo(() => {
    if (pageKey === "main" && selectedSection === "theme") return draft;
    if (pageKey === "main") {
      return sectionStates["theme"]?.saved ?? themeContent ?? {};
    }
    return themeContent ?? {};
  }, [pageKey, selectedSection, draft, sectionStates, themeContent]);

  const savedAt = sectionStates[selectedSection]?.savedAt ?? null;

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_400px]">
      <Sidebar
        catalog={catalog}
        currentPage={pageKey}
        currentSection={selectedSection}
        onSelect={handleSectionSelect}
      />

      {/* 가운데: 실시간 미리보기 */}
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
            sectionKey={selectedSection}
            content={draft}
            theme={previewTheme}
          />
        </div>
      </section>

      {/* 오른쪽: Inspector + 저장 버튼 */}
      <aside className="flex min-h-0 flex-col border-l bg-white">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">설정</h2>
            <p className="text-xs text-slate-400">
              {pageKey} · {selectedSection}
              {savedAt && (
                <> · 저장: {new Date(savedAt).toLocaleString("ko-KR")}</>
              )}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {/* key 를 변경하면 Inspector 가 완전히 리마운트되어 내부 상태(details 열림 등)가 초기화됨 */}
          <Inspector
            key={`${pageKey}:${selectedSection}`}
            value={draft}
            onChange={setDraft}
          />
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

      {/* 변경사항 버리기 확인 모달 */}
      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            aria-hidden
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={cancelDiscard}
          />
          <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              저장하지 않은 변경사항
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              현재 섹션의 편집 내용이 저장되지 않았습니다.
              <br />
              이동하면 변경사항이 사라집니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDiscard}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                취소 (계속 편집)
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
              >
                변경 버리기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
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
