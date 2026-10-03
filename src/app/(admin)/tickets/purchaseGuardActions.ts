"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { catalogErrorMessage } from "@/lib/catalogErrors";
import { NOTE_MAX, REASON_CODES, reasonLabel } from "@/components/purchase-guard/labels";

/**
 * 구매 요청 확인 (Phase 6) — 세션 클라이언트로 RPC를 호출한다.
 * 권한·자원 계산·사유 검증은 DB 함수(purchase_guard_check / request_purchase_material)가 판정한다.
 */

export interface PurchaseResource {
  rule: number;
  source: string;
  ref_id: string;
  label: string;
  part_name: string | null;
  qty: number;
  condition: string | null;
  note: string | null;
  donor_id?: string;
}
export interface PurchaseGuardInfo {
  enabled: boolean;
  excluded: boolean;
  item_label: string;
  quantity: number;
  request_status: string;
  resources: PurchaseResource[];
  resource_count: number;
}

export async function getPurchaseGuardAction(materialId: string): Promise<{ data?: PurchaseGuardInfo; error?: string }> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchase_guard_check", { p_material_id: materialId });
  if (error) return { error: catalogErrorMessage(error) };
  return { data: data as unknown as PurchaseGuardInfo };
}

export async function requestPurchaseWithGuardAction(
  materialId: string,
  reasonCode: string | null,
  reasonNote: string | null
): Promise<{ success?: boolean; error?: string; reload?: boolean }> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };
  if (reasonCode && !(REASON_CODES as readonly string[]).includes(reasonCode)) return { error: "알 수 없는 구매 사유입니다." };
  const note = reasonNote?.trim() || null;
  if (reasonCode === "OTHER" && (!note || note.length < 2)) return { error: "기타 사유를 입력해 주세요." };
  if (note && note.length > NOTE_MAX) return { error: `사유는 ${NOTE_MAX}자 이내로 입력해 주세요.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_purchase_material", {
    p_material_id: materialId,
    p_reason_code: reasonCode ?? undefined,
    p_reason_note: note ?? undefined,
  });
  if (error) {
    const message = catalogErrorMessage(error);
    // 확인 창을 연 뒤 재고가 바뀐 경우 — 목록을 다시 불러오게 한다
    return { error: message, reload: message.startsWith("내부 자원이 있습니다") };
  }
  const result = data as unknown as { resource_count: number; reason_code: string | null; excluded: boolean };

  // 기존 요청 흐름과 같은 접수 로그 (+ 확인 결과)
  const adminSupa = createAdminClient();
  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select(`
      ticket_id,
      inventory_items (
        capacity,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      )
    `)
    .eq("id", materialId)
    .single();
  if (mat) {
    const inv = mat.inventory_items as unknown as {
      capacity: string | null;
      inventory_categories: { name: string } | null;
      inventory_specs: { name: string } | null;
      inventory_products: { name: string } | null;
    } | null;
    const itemLabel = [inv?.inventory_categories?.name, inv?.inventory_specs?.name, inv?.inventory_products?.name, inv?.capacity]
      .filter(Boolean)
      .join(" / ");
    const guardText = result.excluded
      ? ""
      : result.resource_count > 0
        ? ` — 내부 자원 ${result.resource_count}건, 사유: ${reasonLabel(result.reason_code)}${note ? ` (${note})` : ""}`
        : " — 내부 자원 없음";
    await adminSupa.from("ticket_logs").insert({
      ticket_id: mat.ticket_id,
      employee_id: employee.id,
      message: `시스템: 자재 구매가 요청되었습니다. (${itemLabel})${guardText}`,
    });
    revalidatePath(`/tickets/${mat.ticket_id}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}
