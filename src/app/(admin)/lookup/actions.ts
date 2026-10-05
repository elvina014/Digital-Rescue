"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";
import { NOTE_MAX, TICKET_LINK_ROLES } from "@/components/knowledge/labels";
import type { Database } from "@/types/supabase";

/**
 * 부품·기기 검색 / 접수 사전 확인 Server Actions — 세션 클라이언트만 사용한다.
 * 사례 조회는 get_device_knowledge(SECURITY DEFINER, 고객 정보 없음), 검색은 호출자 권한 RPC, 메모는 RLS가 판정한다.
 */

type Fn = Database["public"]["Functions"];
export type PartForDevice = Fn["search_parts_for_device"]["Returns"][number];
export type DeviceForPart = Fn["search_devices_for_part"]["Returns"][number];

export interface DeviceTarget {
  modelId: string | null;
  variantId: string | null;
  boardId: string | null;
}

export interface KnowledgeNote {
  id: string; note_type: string; body: string; is_pinned: boolean; target_label: string;
  author: string | null; updated_at: string; can_edit: boolean;
}
export interface KnowledgeCase {
  receipt_no: string; status: string; received_at: string | null; completed_at: string | null; canceled_at: string | null;
  result: string | null; fault_category: string | null; diagnosis_summary: string | null;
  symptoms: string[];
  actions: { action_type: string; description: string; succeeded: boolean | null }[];
  parts: { category: string; spec: string; product: string; capacity: string | null; quantity: number }[];
  final_price?: number; refunded_amount?: number;
}
export interface DeviceKnowledge {
  label: string;
  boards: { board_id: string; board_number: string }[];
  notes: KnowledgeNote[];
  cases: { total: number; by_result: Record<string, number>; by_status: Record<string, number>; recent: KnowledgeCase[]; skipped: number };
  parts_used: { category: string; spec: string; product: string; capacity: string | null; times: number; quantity: number }[];
  compatible_in_stock: number;
  donors: { donor_id: string; donor_no: string; storage_note: string | null; candidates: number }[];
  show_price: boolean;
  /** receipt_no → ticket id, 모든 접수건을 열 수 있는 직급에만 (RLS로 조회) */
  ticket_ids: Record<string, string>;
}
export interface SpecStockRow { id: string; label: string; capacity: string | null; condition: string; quantity: number }
export interface SpecDonorRow { donorId: string; donorNo: string; description: string; quantity: number; device: string }

type Result<T> = { data?: T; error?: string };

async function session() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  return createClient();
}

function target(t: DeviceTarget) {
  return { p_model_id: toUuidOrNull(t.modelId) ?? undefined, p_variant_id: toUuidOrNull(t.variantId) ?? undefined,
           p_board_id: toUuidOrNull(t.boardId) ?? undefined };
}

// ----- 접수 사전 확인 / 기기 지식 패널 -----
export async function getDeviceKnowledgeAction(t: DeviceTarget, excludeTicketId?: string | null): Promise<Result<DeviceKnowledge>> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_device_knowledge", {
    ...target(t), p_exclude_ticket_id: toUuidOrNull(excludeTicketId) ?? undefined,
  });
  if (error) return { error: catalogErrorMessage(error) };
  const knowledge = { ...(data as unknown as Omit<DeviceKnowledge, "ticket_ids">), ticket_ids: {} as Record<string, string> };

  // 사례 링크: 일반 접수 조회(RLS)로 id를 찾는다 — RPC는 접수번호만 돌려준다
  const receiptNos = knowledge.cases.recent.map((c) => c.receipt_no);
  if (TICKET_LINK_ROLES.includes(employee.role) && receiptNos.length) {
    const { data: rows } = await supabase.from("repair_tickets").select("id, receipt_no").in("receipt_no", receiptNos);
    for (const r of rows ?? []) knowledge.ticket_ids[r.receipt_no] = r.id;
  }
  return { data: knowledge };
}

// ----- 기기 → 부품 -----
export async function searchPartsForDeviceAction(t: DeviceTarget): Promise<Result<PartForDevice[]>> {
  const supabase = await session();
  if (!supabase) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  const { data, error } = await supabase.rpc("search_parts_for_device", target(t));
  if (error) return { error: catalogErrorMessage(error) };
  return { data: data ?? [] };
}

// ----- 부품 → 기기 (+ 이 규격의 재고·Donor) -----
export async function searchDevicesForPartAction(
  partSpecId: string
): Promise<Result<{ devices: DeviceForPart[]; stock: SpecStockRow[]; donors: SpecDonorRow[] }>> {
  const supabase = await session();
  if (!supabase) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  const id = toUuidOrNull(partSpecId);
  if (!id) return { error: "부품 규격을 선택해 주세요." };

  const [devRes, stockRes, donorRes] = await Promise.all([
    supabase.rpc("search_devices_for_part", { p_part_spec_id: id }),
    supabase
      .from("inventory_items")
      .select("id, capacity, condition, quantity, inventory_categories ( name ), inventory_specs ( name ), inventory_products ( name )")
      .eq("part_spec_id", id),
    supabase.from("donor_potential_stock").select("donor_id, donor_no, description, quantity, catalog_model_label, brand, model_text")
      .eq("part_spec_id", id),
  ]);
  const error = devRes.error ?? stockRes.error ?? donorRes.error;
  if (error) return { error: catalogErrorMessage(error) };

  const name = (v: unknown) => (v as { name: string } | null)?.name ?? "";
  const stock: SpecStockRow[] = (stockRes.data ?? [])
    .filter((i) => name(i.inventory_specs) !== "외주") // Q5
    .map((i) => ({
      id: i.id,
      label: [name(i.inventory_categories), name(i.inventory_specs), name(i.inventory_products)].filter(Boolean).join(" / "),
      capacity: i.capacity, condition: i.condition, quantity: i.quantity,
    }));

  const donors: SpecDonorRow[] = (donorRes.data ?? []).map((d) => ({
    donorId: d.donor_id ?? "", donorNo: d.donor_no ?? "", description: d.description ?? "", quantity: d.quantity ?? 1,
    device: d.catalog_model_label ?? [d.brand, d.model_text].filter(Boolean).join(" "),
  }));
  return { data: { devices: devRes.data ?? [], stock, donors } };
}

// ----- 모델 메모 -----
export interface NoteInput { noteType: string; body: string; isPinned: boolean }

function noteError(i: NoteInput): string | null {
  if (!i.body.trim()) return "메모 내용을 입력해 주세요.";
  if (i.body.trim().length > NOTE_MAX) return `${NOTE_MAX}자 이내로 입력해 주세요.`;
  if (!["CAUTION", "KNOWN_ISSUE", "TIP", "PARTS"].includes(i.noteType)) return "메모 종류를 선택해 주세요.";
  return null;
}

export async function addModelNoteAction(t: DeviceTarget, input: NoteInput): Promise<Result<{ id: string }>> {
  const supabase = await session();
  if (!supabase) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  const invalid = noteError(input);
  if (invalid) return { error: invalid };
  const modelId = toUuidOrNull(t.modelId);
  const boardId = modelId ? null : toUuidOrNull(t.boardId);
  if (!modelId && !boardId) return { error: "메모를 남길 모델 또는 보드를 선택해 주세요." };

  const { data, error } = await supabase
    .from("model_notes")
    .insert({ model_id: modelId, variant_id: modelId ? toUuidOrNull(t.variantId) : null, board_id: boardId,
              note_type: input.noteType, body: input.body.trim(), is_pinned: input.isPinned })
    .select("id")
    .single();
  if (error) return { error: catalogErrorMessage(error) };
  return { data: { id: data.id } };
}

export async function updateModelNoteAction(id: string, input: NoteInput): Promise<Result<true>> {
  const supabase = await session();
  if (!supabase) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  const invalid = noteError(input);
  if (invalid) return { error: invalid };
  const { data, error } = await supabase
    .from("model_notes")
    .update({ note_type: input.noteType, body: input.body.trim(), is_pinned: input.isPinned })
    .eq("id", toUuidOrNull(id) ?? "")
    .select("id");
  if (error) return { error: catalogErrorMessage(error) };
  if (!data?.length) return { error: "권한이 없거나 이미 삭제된 메모입니다." };
  return { data: true };
}

export async function deleteModelNoteAction(id: string): Promise<Result<true>> {
  const supabase = await session();
  if (!supabase) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  const { data, error } = await supabase.from("model_notes").delete().eq("id", toUuidOrNull(id) ?? "").select("id");
  if (error) return { error: catalogErrorMessage(error) };
  if (!data?.length) return { error: "권한이 없거나 이미 삭제된 메모입니다." };
  return { data: true };
}
