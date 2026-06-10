import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { requireCmsAccess } from "@/lib/auth";
import type { NewsRecord } from "@/lib/news";
import { NewsManagerClient } from "./NewsManagerClient";

/**
 * CMS 뉴스 관리 (/editor/news)
 *
 * n8n 이 적재한 draft 뉴스를 검수해 공개/수정/삭제한다.
 * (Telegram 원탭 공개의 병행 경로 — 본문 손질이 필요할 때 사용)
 *
 * 권한은 (cms)/layout 의 requireCmsAccess 가 1차로 가드하지만,
 * 직접 진입/액션 호출에도 대비해 여기서도 검증한다.
 */
export default async function NewsManagerPage() {
  await requireCmsAccess("/editor/news");

  const supabase = await createClient();
  const { data } = await supabase
    .from("news_items")
    .select(
      "id, title, news_date, source, source_url, summary, body, status, created_at, updated_at, published_at"
    )
    .order("news_date", { ascending: false })
    .order("created_at", { ascending: false });

  const items = (data ?? []) as NewsRecord[];

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">IT 최신 뉴스 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            자동 수집된 초안을 검수해 공개하세요. 공개 시 메인 페이지에 즉시 반영됩니다.
          </p>
        </div>
        <Link
          href="/editor"
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
        >
          ← 에디터로
        </Link>
      </div>

      <NewsManagerClient items={items} />
    </div>
  );
}
