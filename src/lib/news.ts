import { createClient } from "@/utils/supabase/server";
import type { DigitalResourcesNewsItem } from "@/types/sections";

/**
 * news_items 테이블 행 (관리/편집용 전체 형태).
 * 사이트 노출에는 일부 필드만 사용하지만, CMS 뉴스 관리에서는 전체가 필요하다.
 */
export interface NewsRecord {
  id: string;
  title: string;
  news_date: string;
  source: string;
  source_url: string | null;
  summary: string;
  body: string;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** 공개 노출용 최대 건수 (게시판 페이지네이션의 상한). */
export const PUBLISHED_NEWS_LIMIT = 40;

/**
 * 공개(published) 뉴스를 news_date 내림차순으로 조회해
 * DigitalResourcesSection 이 기대하는 형태로 매핑한다.
 *
 * - RLS 가 status='published' 만 익명에게 허용하므로 별도 필터가 없어도 안전하지만,
 *   인덱스/명시성을 위해 status 조건을 함께 건다.
 * - 조회 실패/0건이면 빈 배열 → 호출부(page.tsx)에서 블롭 폴백을 사용.
 */
export async function getPublishedNews(
  limit: number = PUBLISHED_NEWS_LIMIT
): Promise<DigitalResourcesNewsItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("news_items")
    .select("id, title, news_date, source, summary, body")
    .eq("status", "published")
    .order("news_date", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[news] failed to load published news", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    date: row.news_date as string,
    source: row.source as string,
    summary: row.summary as string,
    body: row.body as string,
  }));
}
