import { cache } from "react";
import { createClient } from "@/utils/supabase/server";

/**
 * page_contents 테이블에서 (page_key, section_key) 쌍의 콘텐츠를 조회한다.
 *
 * 설계:
 *   - 한 페이지 단위로 모든 섹션을 한 번의 쿼리로 가져와 매핑(map)을 반환한다.
 *   - React `cache()` 로 동일 렌더 트리 안에서는 같은 page_key 호출이 dedup 된다
 *     (예: layout 과 page 가 둘 다 'main' 을 호출해도 1회 쿼리).
 *   - DB 조회 실패 / 행 없음 시 빈 객체를 반환 → 컴포넌트의 defaultProps 가 사용됨.
 *
 * 성능:
 *   - 쿼리 1회 / 페이지. 단일 PK 인덱스(page_key)로 적은 latency.
 *   - revalidatePath() 가 캐시 무효화를 처리하므로 ISR 친화적.
 */
export const getPageSections = cache(
  async (pageKey: string): Promise<Record<string, unknown>> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("page_contents")
      .select("section_key, content_data")
      .eq("page_key", pageKey);

    if (error) {
      console.error("[pageContents] failed to load", pageKey, error.message);
      return {};
    }

    const map: Record<string, unknown> = {};
    for (const row of data ?? []) {
      map[row.section_key as string] = row.content_data;
    }
    return map;
  }
);

/**
 * 디자인 토큰(theme)은 모든 페이지에서 공유되므로 별도 헬퍼로 분리.
 * 내부적으로 main 페이지 섹션 페치를 재사용해 추가 쿼리 없음.
 */
export async function getTheme(): Promise<unknown> {
  const main = await getPageSections("main");
  return main.theme ?? null;
}
