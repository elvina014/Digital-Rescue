import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  DEFAULT_PAGE_KEY,
  DEFAULT_SECTION_KEY,
  PAGE_CATALOG,
  findPage,
  findSection,
} from "./catalog";
import { EditorClient } from "./EditorClient";

interface EditorPageProps {
  searchParams: Promise<{ page?: string; section?: string }>;
}

/**
 * CMS 에디터 메인 (edit.digital-rescue.com / login.digital-rescue.com → /editor)
 *
 * URL 구조:
 *   /editor?page={pageKey}&section={sectionKey}
 *
 * 서버:
 *   1) URL 파라미터 검증 → 잘못되면 기본값으로 정규 redirect
 *   2) 현재 페이지(pageKey)의 모든 섹션 데이터를 단일 쿼리로 조회
 *   3) contentMap 으로 묶어서 EditorClient 에 전달
 *      (이후 섹션 전환은 EditorClient 로컬 state 로 처리 — URL/라우터 불필요)
 */
export default async function EditorPage({ searchParams }: EditorPageProps) {
  const sp = await searchParams;
  const pageKey = sp.page ?? DEFAULT_PAGE_KEY;
  const sectionKey = sp.section ?? DEFAULT_SECTION_KEY;

  // 카탈로그에 없는 키면 기본값으로 redirect (URL 정규화)
  if (!findPage(pageKey) || !findSection(pageKey, sectionKey)) {
    redirect(`/editor?page=${DEFAULT_PAGE_KEY}&section=${DEFAULT_SECTION_KEY}`);
  }

  const supabase = await createClient();

  // 현재 페이지의 모든 섹션 데이터를 한 번에 조회
  const { data: rows } = await supabase
    .from("page_contents")
    .select("section_key, content_data, updated_at")
    .eq("page_key", pageKey);

  type SectionRecord = { data: Record<string, unknown>; savedAt: string | null };
  const contentMap: Record<string, SectionRecord> = {};
  for (const row of rows ?? []) {
    contentMap[row.section_key] = {
      data: (row.content_data ?? {}) as Record<string, unknown>,
      savedAt: (row.updated_at as string | null) ?? null,
    };
  }

  // 프리뷰용 theme
  // - 메인 페이지: contentMap 에 이미 포함됨
  // - 브랜드 페이지: 메인 theme 을 별도 조회
  let themeContent: Record<string, unknown> | null;
  if (pageKey === "main") {
    themeContent = contentMap["theme"]?.data ?? null;
  } else {
    const { data: themeRow } = await supabase
      .from("page_contents")
      .select("content_data")
      .eq("page_key", "main")
      .eq("section_key", "theme")
      .maybeSingle();
    themeContent = (themeRow?.content_data ?? null) as Record<string, unknown> | null;
  }

  return (
    <EditorClient
      catalog={PAGE_CATALOG}
      pageKey={pageKey}
      initialSectionKey={sectionKey}
      contentMap={contentMap}
      themeContent={themeContent}
    />
  );
}
