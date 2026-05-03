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
 *   2) page_contents 에서 선택된 (page, section) 행 + theme 행을 함께 조회
 *   3) 결과를 EditorClient 로 전달 (이후 모든 편집은 client 로컬 state)
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

  // 1) 선택된 섹션 콘텐츠
  const { data: row } = await supabase
    .from("page_contents")
    .select("content_data, updated_at")
    .eq("page_key", pageKey)
    .eq("section_key", sectionKey)
    .maybeSingle();

  // 2) 프리뷰용 theme — theme 자체를 편집할 때는 동일 행을 그대로 사용
  let themeContent: unknown = row?.content_data ?? null;
  if (!(pageKey === "main" && sectionKey === "theme")) {
    const { data: themeRow } = await supabase
      .from("page_contents")
      .select("content_data")
      .eq("page_key", "main")
      .eq("section_key", "theme")
      .maybeSingle();
    themeContent = themeRow?.content_data ?? null;
  }

  return (
    <EditorClient
      catalog={PAGE_CATALOG}
      pageKey={pageKey}
      sectionKey={sectionKey}
      initialContent={(row?.content_data ?? {}) as Record<string, unknown>}
      themeContent={themeContent as Record<string, unknown> | null}
      lastUpdatedAt={(row?.updated_at as string | undefined) ?? null}
    />
  );
}
