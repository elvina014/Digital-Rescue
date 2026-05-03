"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireCmsAccess } from "@/lib/auth";
import { findSection } from "./catalog";

export interface SaveResult {
  success: boolean;
  message: string;
  /** 서버에서 반영된 updated_at (toast/표시용) */
  savedAt?: string;
}

/**
 * page_contents 의 (page_key, section_key) 행을 UPSERT 한다.
 * - 권한: requireCmsAccess (ADMIN/MANAGER)
 * - DB RLS 도 동일 정책으로 방어 (defense in depth)
 * - 성공 시 메인 페이지 + 브랜드 라우트 캐시 재검증
 *
 * contentData 는 임의의 JSON 직렬화 가능 값. 클라이언트에서 이미
 * draft state 로 들고 있던 값을 그대로 전달.
 */
export async function savePageContentAction(
  pageKey: string,
  sectionKey: string,
  contentData: unknown
): Promise<SaveResult> {
  // 권한 검증 (실패 시 redirect 가 throw 되어 함수가 종료됨)
  const employee = await requireCmsAccess();

  // 카탈로그에 없는 (page, section) 은 거부
  if (!findSection(pageKey, sectionKey)) {
    return {
      success: false,
      message: `유효하지 않은 섹션입니다: ${pageKey} / ${sectionKey}`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("page_contents")
    .upsert(
      {
        page_key: pageKey,
        section_key: sectionKey,
        content_data: contentData,
        updated_by: employee.id,
      },
      { onConflict: "page_key,section_key" }
    )
    .select("updated_at")
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  // 사이트 캐시 무효화 — 어떤 페이지가 영향받는지 정확히 모르므로 layout 단위로 일괄 재검증
  revalidatePath("/", "layout");

  return {
    success: true,
    message: "저장되었습니다.",
    savedAt: data?.updated_at as string | undefined,
  };
}
