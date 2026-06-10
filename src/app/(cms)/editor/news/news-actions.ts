"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireCmsAccess } from "@/lib/auth";

export interface NewsActionResult {
  success: boolean;
  message: string;
}

export interface NewsEditableFields {
  title: string;
  news_date: string;
  source: string;
  source_url: string | null;
  summary: string;
  body: string;
}

/** 공개 사이트(메인 페이지) 캐시를 무효화. CMS 저장 경로와 동일하게 layout 단위. */
function revalidateSite() {
  revalidatePath("/", "layout");
}

/** draft/archived → published. published_at 은 최초 게시 시각을 보존하기 위해 비어있을 때만 채운다. */
export async function publishNewsAction(id: string): Promise<NewsActionResult> {
  const employee = await requireCmsAccess("/editor/news");
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("news_items")
    .select("published_at")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("news_items")
    .update({
      status: "published",
      published_at: current?.published_at ?? new Date().toISOString(),
      updated_by: employee.id,
    })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateSite();
  return { success: true, message: "공개되었습니다." };
}

/** published → draft (사이트에서 내림). */
export async function unpublishNewsAction(id: string): Promise<NewsActionResult> {
  const employee = await requireCmsAccess("/editor/news");
  const supabase = await createClient();

  const { error } = await supabase
    .from("news_items")
    .update({ status: "draft", updated_by: employee.id })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateSite();
  return { success: true, message: "비공개로 전환했습니다." };
}

/** 보관 처리 (목록에서 정리하되 이력은 남김). */
export async function archiveNewsAction(id: string): Promise<NewsActionResult> {
  const employee = await requireCmsAccess("/editor/news");
  const supabase = await createClient();

  const { error } = await supabase
    .from("news_items")
    .update({ status: "archived", updated_by: employee.id })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateSite();
  return { success: true, message: "보관 처리했습니다." };
}

/** archived → draft 로 복원. */
export async function restoreNewsAction(id: string): Promise<NewsActionResult> {
  const employee = await requireCmsAccess("/editor/news");
  const supabase = await createClient();

  const { error } = await supabase
    .from("news_items")
    .update({ status: "draft", updated_by: employee.id })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateSite();
  return { success: true, message: "검수 대기로 복원했습니다." };
}

export async function deleteNewsAction(id: string): Promise<NewsActionResult> {
  await requireCmsAccess("/editor/news");
  const supabase = await createClient();

  const { error } = await supabase.from("news_items").delete().eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateSite();
  return { success: true, message: "삭제되었습니다." };
}

export async function updateNewsAction(
  id: string,
  fields: NewsEditableFields
): Promise<NewsActionResult> {
  const employee = await requireCmsAccess("/editor/news");

  const title = fields.title.trim();
  if (!title) return { success: false, message: "제목을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("news_items")
    .update({
      title,
      news_date: fields.news_date,
      source: fields.source.trim(),
      source_url: fields.source_url?.trim() || null,
      summary: fields.summary.trim(),
      body: fields.body,
      updated_by: employee.id,
    })
    .eq("id", id);

  if (error) return { success: false, message: error.message };

  revalidateSite();
  return { success: true, message: "저장되었습니다." };
}
