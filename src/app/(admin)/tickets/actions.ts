"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import sharp from "sharp";

// ----- 신규 접수 생성 권한 -----
const CAN_CREATE_TICKET: EmployeeRole[] = [
  EmployeeRole.ADMIN,
  EmployeeRole.MANAGER,
  EmployeeRole.RECEPTION,
];

/**
 * 신규 접수 Server Action
 * 1) customers upsert (동일 연락처 고객 재사용)
 * 2) repair_tickets INSERT
 */
export async function createTicketAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !CAN_CREATE_TICKET.includes(employee.role)) {
    return { error: "접수 권한이 없습니다." };
  }

  // 폼 값 추출
  const customerName = (formData.get("customerName") as string)?.trim();
  const customerPhone = (formData.get("customerPhone") as string)?.trim();
  const customerAddress = (formData.get("customerAddress") as string)?.trim() || null;
  const receiptType = formData.get("receiptType") as string;
  const deviceType = (formData.get("deviceType") as string)?.trim();
  const deviceBrand = (formData.get("deviceBrand") as string)?.trim();
  const deviceModel = (formData.get("deviceModel") as string)?.trim() || null;
  const symptoms = (formData.get("symptoms") as string)?.trim();
  // 테스트 접수 플래그는 ADMIN/MANAGER만 설정 가능 (UI는 RECEPTION에 숨겨져 있지만 서버에서도 강제)
  const canMarkAsTest =
    employee.role === EmployeeRole.ADMIN || employee.role === EmployeeRole.MANAGER;
  const isTest = canMarkAsTest && formData.get("isTest") === "true";

  if (!customerName || !customerPhone || !receiptType || !deviceType || !deviceBrand || !symptoms) {
    return { error: "필수 항목을 모두 입력해 주세요." };
  }

  const supabase = await createClient();

  // 1) 고객 조회 또는 생성 (동일 연락처 기준)
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", customerPhone)
    .single();

  let customerId: string;

  if (existingCustomer) {
    customerId = existingCustomer.id;
    // 이름/주소가 바뀌었을 수 있으니 업데이트
    await supabase
      .from("customers")
      .update({ name: customerName, address: customerAddress })
      .eq("id", customerId);
  } else {
    const { data: newCustomer, error: customerError } = await supabase
      .from("customers")
      .insert({ name: customerName, phone: customerPhone, address: customerAddress })
      .select("id")
      .single();

    if (customerError || !newCustomer) {
      return { error: "고객 등록에 실패했습니다: " + (customerError?.message ?? "") };
    }
    customerId = newCustomer.id;
  }

  // 2) 접수건 생성
  const { data: newTicket, error: ticketError } = await supabase
    .from("repair_tickets")
    .insert({
      customer_id: customerId,
      receipt_type: receiptType,
      device_type: deviceType,
      device_brand: deviceBrand,
      device_model: deviceModel,
      symptoms,
      is_test: isTest,
    })
    .select("id")
    .single();

  if (ticketError || !newTicket) {
    return { error: "접수 등록에 실패했습니다: " + (ticketError?.message ?? "") };
  }

  revalidatePath("/tickets");
  return { ticketId: newTicket.id };
}

// ----- 테스트 접수 플래그 토글 (ADMIN 전용) -----
export async function toggleTestFlagAction(ticketId: string, nextValue: boolean) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== EmployeeRole.ADMIN) {
    return { error: "권한이 없습니다 (ADMIN 전용)." };
  }

  if (!ticketId) return { error: "접수건 ID가 없습니다." };

  // 승인보호 트리거를 우회해야 하므로 admin 클라이언트 사용 (ADMIN 권한 확인됨)
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("repair_tickets")
    .update({ is_test: nextValue })
    .eq("id", ticketId);

  if (error) return { error: error.message };

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  revalidatePath("/stats");
  return { success: true };
}

// ----- 담당기사 배정/변경 (RECEPTION, MANAGER, ADMIN) -----
// NEW, ASSIGNED, RECEIVED, IN_PROGRESS 상태에서 가능
const CAN_ASSIGN_STATUSES = ["NEW", "ASSIGNED", "RECEIVED", "IN_PROGRESS"];

export async function assignTechnicianAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !CAN_CREATE_TICKET.includes(employee.role)) {
    return { error: "배정 권한이 없습니다." };
  }

  const ticketId = formData.get("ticketId") as string;
  const assigneeId = formData.get("assigneeId") as string;

  if (!ticketId || !assigneeId) {
    return { error: "필수 항목을 입력해 주세요." };
  }

  const supabase = createAdminClient();

  // 현재 상태 확인
  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("status, assignee_id, is_approved")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  if (!CAN_ASSIGN_STATUSES.includes(ticket.status)) {
    return { error: "현재 상태에서는 기사를 배정/변경할 수 없습니다." };
  }

  if (ticket.is_approved && employee.role !== EmployeeRole.ADMIN) {
    return { error: "승인 완료된 접수건은 수정할 수 없습니다." };
  }

  // 새 담당기사 이름 조회 (로그용)
  const { data: newTech } = await supabase
    .from("employees")
    .select("name")
    .eq("id", assigneeId)
    .single();

  const isReassign = !!ticket.assignee_id;
  const newStatus = ticket.status === "NEW" ? "ASSIGNED" : ticket.status;

  const { error } = await supabase
    .from("repair_tickets")
    .update({ assignee_id: assigneeId, status: newStatus })
    .eq("id", ticketId);

  if (error) {
    return { error: "배정에 실패했습니다: " + error.message };
  }

  // 자동 로그: 기사 배정/변경
  const techName = newTech?.name ?? "알 수 없음";
  const logMsg = isReassign
    ? `시스템: 담당기사가 ${techName}님으로 변경되었습니다.`
    : `시스템: 담당기사가 ${techName}님으로 배정되었습니다.`;
  await supabase.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: logMsg,
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  redirect(`/tickets/${ticketId}`);
}

// ----- 과거 접수건 기기가치 조회 (자동완성용) -----
export type DeviceModelLookupResult = {
  releasePrice: number;
  modelName?: string | null;
  tagInfo?: string | null;
  releaseYear?: number | null;
};

export async function lookupPastEvaluatedValue(
  deviceType: string,
  deviceBrand: string,
  deviceModel: string,
  tagInfo?: string
): Promise<{ data: DeviceModelLookupResult | null; multipleResults?: boolean }> {
  const employee = await getCurrentEmployee();
  if (!employee) return { data: null };

  const adminSupa = createAdminClient();
  const brand = deviceBrand?.trim() ?? "";
  const model = deviceModel?.trim() ?? "";
  const tag = tagInfo?.trim() ?? "";

  // ── 1순위: 태그정보가 있으면 '브랜드 + 태그정보' 부분일치 조회
  if (tag && brand) {
    // (a) device_models 캐시 부분일치
    const { data: byTag } = await adminSupa
      .from("device_models")
      .select("release_price, model_name, release_year")
      .ilike("brand", `%${brand}%`)
      .ilike("tag_info", `%${tag}%`)
      .gt("release_price", 0);

    if (byTag && byTag.length === 1) {
      return {
        data: {
          releasePrice: byTag[0].release_price as number,
          modelName: byTag[0].model_name as string | null,
          releaseYear: byTag[0].release_year as number | null,
        },
      };
    }
    if (byTag && byTag.length > 1) {
      return { data: null, multipleResults: true };
    }

    // (b) repair_tickets 부분일치 폴백
    const { data: tixByTag } = await adminSupa
      .from("repair_tickets")
      .select("device_model, tag_info, release_year, evaluated_value, created_at")
      .ilike("device_brand", `%${brand}%`)
      .ilike("tag_info", `%${tag}%`)
      .not("evaluated_value", "is", null)
      .gt("evaluated_value", 0)
      .order("created_at", { ascending: false });

    if (tixByTag && tixByTag.length > 0) {
      const uniqueKeys = new Set(
        tixByTag.map((t) => `${t.device_model ?? ""}|${t.release_year ?? ""}`)
      );
      if (uniqueKeys.size === 1) {
        const t = tixByTag[0];
        return {
          data: {
            releasePrice: Number(t.evaluated_value),
            modelName: (t.device_model as string | null) ?? null,
            releaseYear: t.release_year != null ? Number(t.release_year) : null,
          },
        };
      }
      return { data: null, multipleResults: true };
    }

    return { data: null };
  }

  // ── 2순위: 태그정보가 없을 때 '브랜드 + 모델명' 부분일치 조회
  if (brand && model) {
    // (a) device_models 캐시 부분일치
    const { data: byModel } = await adminSupa
      .from("device_models")
      .select("release_price, tag_info, release_year")
      .ilike("brand", `%${brand}%`)
      .ilike("model_name", `%${model}%`)
      .gt("release_price", 0);

    if (byModel && byModel.length === 1) {
      return {
        data: {
          releasePrice: byModel[0].release_price as number,
          tagInfo: byModel[0].tag_info as string | null,
          releaseYear: byModel[0].release_year as number | null,
        },
      };
    }
    if (byModel && byModel.length > 1) {
      return { data: null, multipleResults: true };
    }

    // (b) repair_tickets 부분일치 폴백
    const { data: tixByModel } = await adminSupa
      .from("repair_tickets")
      .select("device_model, tag_info, release_year, evaluated_value, created_at")
      .ilike("device_brand", `%${brand}%`)
      .ilike("device_model", `%${model}%`)
      .not("evaluated_value", "is", null)
      .gt("evaluated_value", 0)
      .order("created_at", { ascending: false });

    if (tixByModel && tixByModel.length > 0) {
      const uniqueKeys = new Set(
        tixByModel.map((t) => `${t.device_model ?? ""}|${t.release_year ?? ""}`)
      );
      if (uniqueKeys.size === 1) {
        const t = tixByModel[0];
        return {
          data: {
            releasePrice: Number(t.evaluated_value),
            tagInfo: (t.tag_info as string | null) ?? null,
            releaseYear: t.release_year != null ? Number(t.release_year) : null,
          },
        };
      }
      return { data: null, multipleResults: true };
    }
  }

  return { data: null };
}

// ----- 제품 입고 완료 처리 (ASSIGNED → RECEIVED) -----
// 접수처/팀장/관리자 또는 해당 건 배정 담당기사
export async function markReceivedAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  if (!ticketId) return { error: "접수건 ID가 필요합니다." };

  // 권한 확인 후 admin 클라이언트로 처리 (RECEPTION RLS 회피 — 미승인 건이라 보호 트리거 영향 없음)
  const supabase = createAdminClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("status, assignee_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  if (ticket.status !== "ASSIGNED") {
    return { error: "배정 완료 상태의 접수건만 입고 처리할 수 있습니다." };
  }

  const isReceptionRole =
    employee.role === EmployeeRole.ADMIN ||
    employee.role === EmployeeRole.MANAGER ||
    employee.role === EmployeeRole.RECEPTION;
  const isAssignedTech =
    (employee.role === EmployeeRole.TECHNICIAN || employee.role === EmployeeRole.EXPERT_REPAIR) &&
    ticket.assignee_id === employee.id;
  if (!isReceptionRole && !isAssignedTech) {
    return { error: "입고 처리 권한이 없습니다." };
  }

  const { error } = await supabase
    .from("repair_tickets")
    .update({ status: "RECEIVED", received_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (error) return { error: "입고 처리에 실패했습니다: " + error.message };

  await supabase.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: "시스템: 제품 입고가 완료되었습니다.",
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}`);
}

// ----- 수리 진행 시작 + 견적 산출 (TECHNICIAN / EXPERT_REPAIR) -----
export async function startRepairAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const deviceType = formData.get("deviceType") as string;
  const deviceBrand = (formData.get("deviceBrand") as string)?.trim() || "";
  const deviceModel = (formData.get("deviceModel") as string)?.trim() || null;
  const tagInfo = (formData.get("tagInfo") as string)?.trim() || null;
  const releaseYear = (formData.get("releaseYear") as string)?.trim() || null;
  const evaluatedValue = parseInt(formData.get("evaluatedValue") as string, 10) || 0;
  const minimumEstimate = parseInt(formData.get("minimumEstimate") as string, 10) || 0;
  const confirmedEstimate = parseInt(formData.get("confirmedEstimate") as string, 10) || 0;
  const materialsJson = formData.get("materials") as string;

  if (!ticketId) return { error: "접수건 ID가 필요합니다." };
  if (!deviceType) return { error: "기기 종류를 선택해 주세요." };
  if (confirmedEstimate <= 0) return { error: "확정 예상 견적을 입력해 주세요." };
  if (confirmedEstimate < minimumEstimate) {
    return { error: "확정 예상 견적이 최소 견적 금액보다 낮습니다." };
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("assignee_id, status, receipt_type")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };
  if (ticket.status !== "RECEIVED") return { error: "제품 입고 완료 상태의 접수건만 수리 시작할 수 있습니다." };

  // 접수방식이 "미정"이면 수리 시작 차단
  if (ticket.receipt_type === "미정") {
    return {
      error:
        "접수방식이 정해지지 않았습니다. 리스트에서 접수 방식을 먼저 선택해 주세요.",
    };
  }

  const isTechOrExpert = employee.role === EmployeeRole.TECHNICIAN || employee.role === EmployeeRole.EXPERT_REPAIR;
  if (isTechOrExpert && ticket.assignee_id !== employee.id) {
    return { error: "본인에게 배정된 접수건만 수정할 수 있습니다." };
  }
  if (!isTechOrExpert && employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "수리 시작 권한이 없습니다." };
  }

  // 1) 티켓 업데이트: 기기정보 + 견적 + 상태 변경
  const { error } = await supabase
    .from("repair_tickets")
    .update({
      device_type: deviceType,
      device_brand: deviceBrand,
      device_model: deviceModel,
      tag_info: tagInfo,
      release_year: releaseYear,
      evaluated_value: evaluatedValue,
      minimum_estimate: minimumEstimate,
      confirmed_estimate: confirmedEstimate,
      expected_estimate: confirmedEstimate,
      status: "IN_PROGRESS",
    })
    .eq("id", ticketId);

  if (error) return { error: "수리 시작 처리에 실패했습니다: " + error.message };

  // 2) 선택된 자재를 ticket_materials에 저장
  let materials: { inventory_item_id: string; quantity: number; request_type?: string }[] = [];
  try {
    materials = materialsJson ? JSON.parse(materialsJson) : [];
  } catch {
    // 파싱 실패 시 빈 배열
  }

  if (materials.length > 0) {
    const rows = materials.map((m) => ({
      ticket_id: ticketId,
      inventory_item_id: m.inventory_item_id,
      quantity: m.quantity,
      request_status: "pending",
      request_type: m.request_type === "purchase" ? "purchase" : "dispatch",
      created_by: employee.id,
    }));

    const { error: matError } = await supabase
      .from("ticket_materials")
      .insert(rows);

    if (matError) {
      // 자재 저장 실패해도 티켓 상태는 이미 변경됨 — 로그 남김
      console.error("ticket_materials insert error:", matError.message);
    }
  }

  // 3) 자동 로그 + device_models 캐시 저장
  const adminSupa = createAdminClient();
  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: `시스템: 수리가 시작되었습니다. (확정견적: ${confirmedEstimate.toLocaleString()}원, 최소견적: ${minimumEstimate.toLocaleString()}원, 자재 ${materials.length}건)`,
  });

  // 기기 가치 평가가 입력된 경우 device_models 캐시에 저장
  if (evaluatedValue > 0 && deviceBrand && deviceModel) {
    await adminSupa
      .from("device_models")
      .upsert(
        {
          brand: deviceBrand,
          model_name: deviceModel,
          tag_info: tagInfo || null,
          release_year: releaseYear ? parseInt(releaseYear, 10) : null,
          release_price: evaluatedValue,
          min_repair_cost: 0,
        },
        { onConflict: "brand,model_name", ignoreDuplicates: false }
      );
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  redirect(`/tickets/${ticketId}`);
}

// ----- 자재비 항목 추가 (TECHNICIAN / EXPERT_REPAIR) -----
export async function addMaterialCostAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const description = (formData.get("description") as string)?.trim();
  const amount = parseInt(formData.get("amount") as string, 10);

  if (!ticketId || !description || isNaN(amount) || amount <= 0) {
    return { error: "비용 내용과 유효한 금액을 입력해 주세요." };
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("assignee_id, is_approved, status, material_cost_details, material_cost")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };
  if (ticket.status !== "IN_PROGRESS") return { error: "수리 진행 중인 접수건만 자재비를 추가할 수 있습니다." };

  const isTechOrExpert = employee.role === EmployeeRole.TECHNICIAN || employee.role === EmployeeRole.EXPERT_REPAIR;
  if (isTechOrExpert && ticket.assignee_id !== employee.id) {
    return { error: "본인에게 배정된 접수건만 수정할 수 있습니다." };
  }
  if (ticket.is_approved && employee.role !== EmployeeRole.ADMIN) {
    return { error: "승인 완료된 접수건은 수정할 수 없습니다." };
  }

  // 기존 배열에 항목 추가
  const existing = Array.isArray(ticket.material_cost_details) ? ticket.material_cost_details : [];
  const newDetails = [...existing, { description, amount }];
  const manualTotal = newDetails.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0);

  // 승인 완료된 자재 비용 합산
  const { data: approvedMats } = await supabase
    .from("ticket_materials")
    .select("quantity, inventory_item_id")
    .eq("ticket_id", ticketId)
    .eq("request_status", "approved");

  let approvedTotal = 0;
  if (approvedMats && approvedMats.length > 0) {
    const itemIds = approvedMats.map((m) => m.inventory_item_id);
    const { data: items } = await supabase
      .from("inventory_items")
      .select("id, base_estimate")
      .in("id", itemIds);
    const estMap = new Map<string, number>();
    for (const item of items ?? []) estMap.set(item.id, item.base_estimate ?? 0);
    approvedTotal = approvedMats.reduce((s, m) => s + (estMap.get(m.inventory_item_id) ?? 0) * m.quantity, 0);
  }

  const newTotal = approvedTotal + manualTotal;

  const { error } = await supabase
    .from("repair_tickets")
    .update({ material_cost_details: newDetails, material_cost: newTotal })
    .eq("id", ticketId);

  if (error) return { error: "자재비 추가에 실패했습니다: " + error.message };

  // 자동 로그
  const adminSupa = createAdminClient();
  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: `시스템: 자재비가 추가되었습니다. ${description} ${amount.toLocaleString()}원 (합계: ${newTotal.toLocaleString()}원)`,
  });

  revalidatePath(`/tickets/${ticketId}`);
}

// ----- 수리 진행 중 재고 자재 추가 (TECHNICIAN / EXPERT_REPAIR / ADMIN / MANAGER) -----
// 수리 계획 변경 등으로 IN_PROGRESS 상태에서 추가 재고를 요청할 때 사용.
// startRepairAction과 동일하게 pending 상태로 삽입하며, 출고/구매 요청은 사용자가 직접 눌러야 한다.
export async function addTicketMaterialsAction(
  ticketId: string,
  materials: { inventory_item_id: string; quantity: number; request_type?: string }[]
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  if (!ticketId) return { error: "접수건 ID가 필요합니다." };
  if (!Array.isArray(materials) || materials.length === 0) {
    return { error: "추가할 자재를 선택해 주세요." };
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("assignee_id, is_approved, status")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };
  if (ticket.status !== "IN_PROGRESS") return { error: "수리 진행 중인 접수건만 자재를 추가할 수 있습니다." };

  const isTechOrExpert = employee.role === EmployeeRole.TECHNICIAN || employee.role === EmployeeRole.EXPERT_REPAIR;
  if (isTechOrExpert && ticket.assignee_id !== employee.id) {
    return { error: "본인에게 배정된 접수건만 수정할 수 있습니다." };
  }
  if (ticket.is_approved && employee.role !== EmployeeRole.ADMIN) {
    return { error: "승인 완료된 접수건은 수정할 수 없습니다." };
  }

  const rows = materials
    .filter((m) => m.inventory_item_id && m.quantity > 0)
    .map((m) => ({
      ticket_id: ticketId,
      inventory_item_id: m.inventory_item_id,
      quantity: m.quantity,
      request_status: "pending",
      request_type: m.request_type === "purchase" ? "purchase" : "dispatch",
      created_by: employee.id,
    }));

  if (rows.length === 0) return { error: "추가할 자재를 선택해 주세요." };

  const { data: inserted, error } = await supabase
    .from("ticket_materials")
    .insert(rows)
    .select("id, inventory_item_id, quantity, request_status, request_type");
  if (error) return { error: "자재 추가에 실패했습니다: " + error.message };

  const adminSupa = createAdminClient();
  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: `시스템: 수리 진행 중 추가 자재 ${rows.length}건이 선택되었습니다. (출고/구매 요청 대기)`,
  });

  revalidatePath(`/tickets/${ticketId}`);
  return { success: true, inserted: inserted ?? [] };
}

// ----- 견적 입력 및 승인 요청 (TECHNICIAN / EXPERT_REPAIR) -----
export async function submitEstimateAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const finalPrice = parseInt(formData.get("finalPrice") as string, 10);
  const paymentMethod = (formData.get("paymentMethod") as string)?.trim();

  if (!ticketId || isNaN(finalPrice) || finalPrice <= 0) {
    return { error: "유효한 최종 견적 금액을 입력해 주세요." };
  }

  if (!paymentMethod) {
    return { error: "결제 방식을 선택해 주세요." };
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("assignee_id, is_approved, initial_estimate, final_price, status")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  if (ticket.status !== "IN_PROGRESS") {
    return { error: "수리 진행 중인 접수건만 승인 요청할 수 있습니다." };
  }

  // 담당기사/정밀수리는 본인 건만 수정 가능
  const isTechOrExpert = employee.role === EmployeeRole.TECHNICIAN || employee.role === EmployeeRole.EXPERT_REPAIR;
  if (isTechOrExpert && ticket.assignee_id !== employee.id) {
    return { error: "본인에게 배정된 접수건만 수정할 수 있습니다." };
  }

  // 승인 완료 후 수정 불가 (ADMIN 제외)
  if (ticket.is_approved && employee.role !== EmployeeRole.ADMIN) {
    return { error: "승인 완료된 접수건은 수정할 수 없습니다." };
  }

  // 견적 하한선 검증: final_price >= initial_estimate
  if (ticket.initial_estimate > 0 && finalPrice < ticket.initial_estimate) {
    return {
      error: `최종 견적(${finalPrice.toLocaleString()}원)이 최소 견적(${ticket.initial_estimate.toLocaleString()}원)보다 낮습니다. 팀장의 예외 승인이 필요합니다.`,
    };
  }

  const { error } = await supabase
    .from("repair_tickets")
    .update({
      final_price: finalPrice,
      payment_method: paymentMethod,
      status: "WAITING_APPROVAL",
    })
    .eq("id", ticketId);

  if (error) {
    return { error: "견적 저장에 실패했습니다: " + error.message };
  }

  // 자동 로그
  const adminSupa = createAdminClient();
  const PAYMENT_LABELS: Record<string, string> = { CARD: "카드결제", BANK_TRANSFER: "계좌이체", E_PAYMENT: "간편결제" };
  const logParts: string[] = [];
  if (finalPrice !== ticket.final_price) {
    logParts.push(`최종 견적: ${finalPrice.toLocaleString()}원`);
  }
  logParts.push(`결제 방식: ${PAYMENT_LABELS[paymentMethod] ?? paymentMethod}`);

  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: `시스템: 견적이 확정되었습니다. ${logParts.join(", ")}`,
  });
  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: "시스템: 팀장 승인이 요청되었습니다.",
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  redirect(`/tickets/${ticketId}`);
}

// ----- 상태 변경 (TECHNICIAN: IN_PROGRESS 등) -----
export async function updateTicketStatusAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const newStatus = formData.get("status") as string;

  if (!ticketId || !newStatus) return { error: "필수 항목을 입력해 주세요." };

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("assignee_id, is_approved, status")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  // TECHNICIAN: 본인 건만
  if (employee.role === EmployeeRole.TECHNICIAN && ticket.assignee_id !== employee.id) {
    return { error: "본인에게 배정된 접수건만 수정할 수 있습니다." };
  }

  // COMPLETED/CANCELED는 ADMIN만
  if (
    (ticket.status === "COMPLETED" || ticket.status === "CANCELED") &&
    employee.role !== EmployeeRole.ADMIN
  ) {
    return { error: "완료/취소 상태의 접수건은 관리자만 변경할 수 있습니다." };
  }

  // 승인 완료 후 ADMIN 외 수정 불가
  if (ticket.is_approved && employee.role !== EmployeeRole.ADMIN) {
    return { error: "승인 완료된 접수건은 수정할 수 없습니다." };
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (newStatus === "COMPLETED") updatePayload.completed_at = now;
  if (newStatus === "CANCELED")  updatePayload.canceled_at  = now;

  const { error } = await supabase
    .from("repair_tickets")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(updatePayload as any)
    .eq("id", ticketId);

  if (error) {
    return { error: "상태 변경에 실패했습니다: " + error.message };
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  redirect(`/tickets/${ticketId}`);
}

// ----- 최종 승인 (MANAGER, ADMIN) -----
export async function approveTicketAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  // MANAGER, ADMIN만 승인 가능
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "승인 권한이 없습니다." };
  }

  const ticketId = formData.get("ticketId") as string;
  if (!ticketId) return { error: "접수건 ID가 필요합니다." };

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("final_price, status")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  if (ticket.status !== "WAITING_APPROVAL") {
    return { error: "승인 대기 상태의 접수건만 승인할 수 있습니다." };
  }

  if (ticket.final_price <= 0) {
    return { error: "최종 견적이 입력되지 않은 접수건은 승인할 수 없습니다." };
  }

  const { error } = await supabase
    .from("repair_tickets")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ is_approved: true, status: "COMPLETED", completed_at: new Date().toISOString() } as any)
    .eq("id", ticketId);

  if (error) {
    return { error: "승인 처리에 실패했습니다: " + error.message };
  }

  // 자동 로그: 최종 승인/완료
  const adminSupa = createAdminClient();
  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: "시스템: 최종 승인 및 완료 처리되었습니다.",
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  redirect(`/tickets/${ticketId}`);
}

// ----- 처리 현황 로그 추가 (인증된 직원 누구나) -----
export async function addTicketLogAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const message = (formData.get("message") as string)?.trim();
  const notifyAssignee = formData.get("notifyAssignee") === "on";

  if (!ticketId || !message) {
    return { error: "로그 내용을 입력해 주세요." };
  }

  if (message.length > 2000) {
    return { error: "로그 내용은 2000자 이내로 입력해 주세요." };
  }

  const supabase = await createClient();

  // 접수건 존재 확인 (RLS에 의해 본인 권한 범위 내의 건만 조회됨)
  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("id")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return { error: "접수건을 찾을 수 없거나 접근 권한이 없습니다." };
  }

  const { error } = await supabase.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message,
  });

  if (error) {
    return { error: "로그 저장에 실패했습니다: " + error.message };
  }

  // 알림 플래그 설정 (ADMIN/MANAGER/RECEPTION만)
  if (notifyAssignee && ["ADMIN", "MANAGER", "RECEPTION"].includes(employee.role)) {
    await supabase
      .from("repair_tickets")
      .update({ has_admin_message: true })
      .eq("id", ticketId);
  }

  revalidatePath(`/tickets/${ticketId}`);
}

/**
 * 관리자 메시지 확인 완료 (has_admin_message → false)
 */
export async function dismissAdminMessageAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  if (!ticketId) return { error: "접수건 ID가 필요합니다." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("repair_tickets")
    .update({ has_admin_message: false })
    .eq("id", ticketId);

  if (error) {
    return { error: "메시지 확인 처리에 실패했습니다." };
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/dashboard");
}

/**
 * 접수 취소 Server Action
 * 상태를 CANCELED로 변경하고 시스템 로그를 남김
 */
export async function cancelTicketAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  if (!ticketId) return { error: "접수건 ID가 필요합니다." };

  const deviceDisposalRaw = formData.get("deviceDisposal") as string | null;

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("status, is_approved, received_at")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  if (ticket.status === "COMPLETED") {
    return { error: "완료된 접수건은 취소할 수 없습니다." };
  }

  if (ticket.status === "CANCELED") {
    return { error: "이미 취소된 접수건입니다." };
  }

  // 승인 완료 후 ADMIN 외 취소 불가
  if (ticket.is_approved && employee.role !== EmployeeRole.ADMIN) {
    return { error: "승인 완료된 접수건은 관리자만 취소할 수 있습니다." };
  }

  // 입고 전(received_at IS NULL) 취소는 기기 처리방법(반환/폐기) 질문을 생략한다.
  // 제품이 아직 입고되지 않아 우리 측에서 처리할 실물이 없기 때문.
  const isPreReceipt = !ticket.received_at;

  let deviceDisposal: "RETURN" | "DISPOSE" | null = null;
  if (!isPreReceipt) {
    if (!deviceDisposalRaw || !["RETURN", "DISPOSE"].includes(deviceDisposalRaw)) {
      return { error: "의뢰 기기 처리방법을 선택해주세요." };
    }
    deviceDisposal = deviceDisposalRaw as "RETURN" | "DISPOSE";
  }

  const { error } = await supabase
    .from("repair_tickets")
    .update({
      status: "CANCELED",
      cancel_device_disposal: deviceDisposal, // 입고 전이면 null
      canceled_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (error) {
    return { error: "취소 처리에 실패했습니다: " + error.message };
  }

  // 시스템 로그 기록 (입고 전/후 구분)
  const phaseLabel = isPreReceipt ? "입고 전 취소" : "입고 후 취소";
  const cancelLogMsg = isPreReceipt
    ? `시스템: 접수가 취소되었습니다. (${phaseLabel})`
    : `시스템: 접수가 취소되었습니다. (${phaseLabel}, 처리방법: ${deviceDisposal === "DISPOSE" ? "기기 폐기" : "기기 반환"})`;
  await supabase.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: cancelLogMsg,
  });

  // 승인 완료된 자재가 있으면 cancel_requested로 일괄 전환 (관리자 반환 확인 대기)
  const adminSupa = createAdminClient();
  await adminSupa
    .from("ticket_materials")
    .update({ request_status: "cancel_requested" })
    .eq("ticket_id", ticketId)
    .eq("request_status", "approved");

  // 연결된 이미지 스토리지 삭제
  const { data: ticketForImages } = await supabase
    .from("repair_tickets")
    .select("images")
    .eq("id", ticketId)
    .single();

  const imgs = (ticketForImages?.images ?? []) as { path: string }[];
  if (imgs.length > 0) {
    const paths = imgs.map((img) => img.path);
    await supabase.storage.from("ticket-images").remove(paths);
    await supabase
      .from("repair_tickets")
      .update({ images: [] })
      .eq("id", ticketId);
  }

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  redirect(`/tickets/${ticketId}`);
}

/**
 * 티켓에 이미지 URL 추가 Server Action
 * 클라이언트에서 Storage 업로드 완료 후 DB에 메타 저장
 */
export async function addTicketImagesAction(
  ticketId: string,
  newImages: { path: string; url: string; description?: string; uploaded_by?: string; uploader_name?: string; uploaded_at?: string; is_customer?: boolean }[]
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  if (!ticketId || newImages.length === 0) {
    return { error: "업로드 데이터가 없습니다." };
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("images")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  const existing = (ticket.images ?? []) as { path: string; url: string }[];
  const total = existing.length + newImages.length;

  if (total > 12) {
    return { error: `이미지는 최대 12장까지 등록 가능합니다. (현재 ${existing.length}장)` };
  }

  const merged = [...existing, ...newImages];

  const { error } = await supabase
    .from("repair_tickets")
    .update({ images: merged })
    .eq("id", ticketId);

  if (error) {
    return { error: "이미지 저장에 실패했습니다: " + error.message };
  }

  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

/**
 * 단일 이미지 서버 사이드 압축·업로드 Server Action
 *
 * 클라이언트(browser-image-compression)가 일부 모바일 브라우저에서 canvas 디코딩에
 * 실패하는 문제를 피하기 위해, 공개 접수 폼(submitTicketAction)과 동일하게 서버에서
 * sharp 로 WebP 압축 후 Storage 에 업로드한다. DB 반영은 호출 측에서 addTicketImagesAction 사용.
 */
export async function uploadTicketImageAction(
  formData: FormData
): Promise<{
  uploaded: {
    path: string;
    url: string;
    description: string;
    uploaded_by: string;
    uploader_name: string;
    uploaded_at: string;
    is_customer: boolean;
  } | null;
  error?: string;
}> {
  const employee = await getCurrentEmployee();
  if (!employee) return { uploaded: null, error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const file = formData.get("file") as File | null;
  const description = (formData.get("description") as string) ?? "";
  const isCustomer = formData.get("isCustomer") === "true";

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB (next.config serverActions bodySizeLimit 와 일치)
  if (!ticketId || !(file instanceof File) || file.size === 0) {
    return { uploaded: null, error: "업로드할 파일이 없습니다." };
  }
  if (!file.type.startsWith("image/")) {
    return { uploaded: null, error: `지원하지 않는 파일 형식입니다: ${file.name}` };
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { uploaded: null, error: `파일 크기가 너무 큽니다 (최대 10MB): ${file.name}` };
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("images")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { uploaded: null, error: "접수건을 찾을 수 없습니다." };

  const existing = (ticket.images ?? []) as unknown[];
  if (existing.length >= 12) {
    return { uploaded: null, error: "이미지는 최대 12장까지 등록 가능합니다." };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);
    const outputBuffer = await sharp(inputBuffer, { failOn: "none" })
      .rotate()
      .resize({
        width: 1920,
        height: 1920,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer();

    const timestamp = Date.now();
    const safeName = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 40);
    const filePath = `${ticketId}/${timestamp}_${safeName}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("ticket-images")
      .upload(filePath, outputBuffer, {
        contentType: "image/webp",
        upsert: false,
      });

    if (uploadError) {
      console.error("[uploadTicketImageAction] Upload failed:", uploadError);
      return { uploaded: null, error: uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from("ticket-images")
      .getPublicUrl(filePath);

    return {
      uploaded: {
        path: filePath,
        url: urlData.publicUrl,
        description,
        uploaded_by: employee.id,
        uploader_name: employee.name,
        uploaded_at: new Date().toISOString(),
        is_customer: isCustomer,
      },
    };
  } catch (err) {
    console.error("[uploadTicketImageAction] processing failed:", err);
    return { uploaded: null, error: "이미지 처리 중 오류가 발생했습니다." };
  }
}

/**
 * 티켓 이미지 삭제 Server Action
 */
export async function removeTicketImageAction(
  ticketId: string,
  imagePath: string
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("images")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  const existing = (ticket.images ?? []) as { path: string; url: string }[];
  const filtered = existing.filter((img) => img.path !== imagePath);

  // Storage 파일 삭제
  await supabase.storage.from("ticket-images").remove([imagePath]);

  const { error } = await supabase
    .from("repair_tickets")
    .update({ images: filtered })
    .eq("id", ticketId);

  if (error) {
    return { error: "이미지 삭제에 실패했습니다." };
  }

  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

// ----- 자재 출고 요청 (기사) -----
export async function requestMaterialDispatchAction(materialId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  // anon client로는 RLS에 의해 TECHNICIAN이 UPDATE 불가 → adminClient 사용
  const adminSupa = createAdminClient();

  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select(`
      request_status, request_type, ticket_id,
      inventory_items (
        capacity,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      )
    `)
    .eq("id", materialId)
    .single();

  if (!mat) return { error: "자재 항목을 찾을 수 없습니다." };
  if (mat.request_status !== "pending") return { error: "이미 출고 요청 중이거나 승인된 항목입니다." };

  const { error } = await adminSupa
    .from("ticket_materials")
    .update({ request_status: "requested" })
    .eq("id", materialId)
    .eq("request_status", "pending");  // 낙관적 잠금: pending일 때만 변경

  if (error) return { error: "출고 요청에 실패했습니다: " + error.message };

  const isPurchase = mat.request_type === "purchase";
  const invReq = mat.inventory_items as unknown as {
    capacity: string | null;
    inventory_categories: { name: string } | null;
    inventory_specs: { name: string } | null;
    inventory_products: { name: string } | null;
  } | null;
  const reqItemLabel = [invReq?.inventory_categories?.name, invReq?.inventory_specs?.name, invReq?.inventory_products?.name, invReq?.capacity].filter(Boolean).join(" / ");

  // 상태 변경 성공 시에만 로그 삽입
  await adminSupa.from("ticket_logs").insert({
    ticket_id: mat.ticket_id,
    employee_id: employee.id,
    message: isPurchase
      ? `시스템: 자재 구매가 요청되었습니다. (${reqItemLabel})`
      : `시스템: 자재 출고가 요청되었습니다. (${reqItemLabel})`,
  });

  revalidatePath(`/tickets/${mat.ticket_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}

// ----- 자재 출고 승인 (관리자/팀장) — DB RPC 호출 -----
export async function approveMaterialDispatchAction(materialId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "승인 권한이 없습니다." };
  }

  const adminSupa = createAdminClient();

  // RPC 호출 (트랜잭션 원자성): p_user_id 전달하여 OUTBOUND 기록 포함
  const { data, error } = await adminSupa.rpc("approve_material_dispatch", {
    p_material_id: materialId,
    p_user_id: employee.id,
  });

  if (error) return { error: "승인 처리 실패: " + error.message };

  const result = data as { error?: string; success?: boolean } | null;
  if (result?.error) return { error: result.error };

  // 승인 후: 해당 티켓의 approved 자재 기초견적 합계를 material_cost에 반영
  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select(`
      ticket_id, request_type, inventory_item_id, quantity, created_by,
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
    // inventory_transactions에 OUTBOUND 기록 (RPC가 구버전이라 미기록된 경우 보완)
    const { count } = await adminSupa
      .from("inventory_transactions")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", mat.ticket_id)
      .eq("item_id", mat.inventory_item_id)
      .eq("transaction_type", "OUTBOUND")
      .gte("created_at", new Date(Date.now() - 10000).toISOString()); // 10초 이내

    if (!count || count === 0) {
      await adminSupa.from("inventory_transactions").insert({
        item_id: mat.inventory_item_id,
        user_id: mat.created_by ?? employee.id, // 요청자 우선, 없으면 승인자
        transaction_type: "OUTBOUND",
        quantity_changed: mat.quantity,
        ticket_id: mat.ticket_id,
        notes: "자재 출고 승인",
      });
    }

    // 해당 티켓의 모든 approved 자재 비용 합산
    const { data: approvedMats } = await adminSupa
      .from("ticket_materials")
      .select("quantity, inventory_item_id")
      .eq("ticket_id", mat.ticket_id)
      .eq("request_status", "approved");

    // 승인 자재 비용 합산
    let approvedTotal = 0;
    if (approvedMats && approvedMats.length > 0) {
      const itemIds = approvedMats.map((m) => m.inventory_item_id);
      const { data: items } = await adminSupa
        .from("inventory_items")
        .select("id, base_estimate")
        .in("id", itemIds);

      const estimateMap = new Map<string, number>();
      for (const item of items ?? []) {
        estimateMap.set(item.id, item.base_estimate ?? 0);
      }

      approvedTotal = approvedMats.reduce((sum, m) => {
        return sum + (estimateMap.get(m.inventory_item_id) ?? 0) * m.quantity;
      }, 0);
    }

    // 수동 추가 비용 합산
    const { data: ticketRow } = await adminSupa
      .from("repair_tickets")
      .select("material_cost_details")
      .eq("id", mat.ticket_id)
      .single();

    const manualDetails = Array.isArray(ticketRow?.material_cost_details) ? ticketRow.material_cost_details : [];
    const manualTotal = manualDetails.reduce((s: number, item: { amount: number }) => s + (item.amount ?? 0), 0);

    await adminSupa
      .from("repair_tickets")
      .update({ material_cost: approvedTotal + manualTotal })
      .eq("id", mat.ticket_id);

    // 로그
    const approveLabel = mat.request_type === "purchase" ? "자재 구매가" : "자재 출고가";
    const invApprove = mat.inventory_items as unknown as {
      capacity: string | null;
      inventory_categories: { name: string } | null;
      inventory_specs: { name: string } | null;
      inventory_products: { name: string } | null;
    } | null;
    const approveItemLabel = [invApprove?.inventory_categories?.name, invApprove?.inventory_specs?.name, invApprove?.inventory_products?.name, invApprove?.capacity].filter(Boolean).join(" / ");
    await adminSupa.from("ticket_logs").insert({
      ticket_id: mat.ticket_id,
      employee_id: employee.id,
      message: `시스템: ${approveLabel} 승인되었습니다. (${approveItemLabel})`,
    });

    revalidatePath(`/tickets/${mat.ticket_id}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}

// ----- 자재 출고 요청 대기 목록 조회 (관리자/팀장) -----
export async function getPendingMaterialRequests() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다.", data: [] };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "권한이 없습니다.", data: [] };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ticket_materials")
    .select(`
      id, ticket_id, inventory_item_id, quantity, request_status, request_type, notes, created_at,
      inventory_items ( base_estimate, capacity, condition,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      ),
      repair_tickets ( device_brand, device_model, status,
        customers ( name ),
        employees:assignee_id ( name )
      ),
      employees:created_by ( name )
    `)
    .eq("request_status", "requested")
    .order("created_at", { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

// ----- 자재 출고/구매 거부 (관리자/팀장) -----
export async function rejectMaterialDispatchAction(materialId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "거부 권한이 없습니다." };
  }

  const adminSupa = createAdminClient();

  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select(`
      ticket_id, request_status, request_type,
      inventory_items (
        capacity,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      )
    `)
    .eq("id", materialId)
    .single();

  if (!mat) return { error: "자재 항목을 찾을 수 없습니다." };
  if (mat.request_status !== "requested") return { error: "요청 상태가 아닌 항목은 거부할 수 없습니다." };

  const { error } = await adminSupa
    .from("ticket_materials")
    .update({ request_status: "rejected" })
    .eq("id", materialId)
    .eq("request_status", "requested");

  if (error) return { error: "거부 처리 실패: " + error.message };

  const rejectLabel = mat.request_type === "purchase" ? "자재 구매 요청이" : "자재 출고 요청이";
  const invReject = mat.inventory_items as unknown as {
    capacity: string | null;
    inventory_categories: { name: string } | null;
    inventory_specs: { name: string } | null;
    inventory_products: { name: string } | null;
  } | null;
  const rejectItemLabel = [invReject?.inventory_categories?.name, invReject?.inventory_specs?.name, invReject?.inventory_products?.name, invReject?.capacity].filter(Boolean).join(" / ");
  await adminSupa.from("ticket_logs").insert({
    ticket_id: mat.ticket_id,
    employee_id: employee.id,
    message: `시스템: ${rejectLabel} 거부되었습니다. (${rejectItemLabel})`,
  });

  revalidatePath(`/tickets/${mat.ticket_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}

// ----- 자재 출고 취소 요청 (기사 → 관리자 반환 확인 대기) -----
export async function cancelMaterialDispatchAction(materialId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const adminSupa = createAdminClient();

  // 1) 자재 레코드 조회
  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select(`
      ticket_id, request_type, request_status,
      inventory_items (
        capacity,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      )
    `)
    .eq("id", materialId)
    .single();

  if (!mat) return { error: "자재 항목을 찾을 수 없습니다." };
  if (mat.request_status !== "approved") {
    return { error: "승인 상태가 아닌 항목은 취소할 수 없습니다. (현재: " + mat.request_status + ")" };
  }

  // 2) 상태만 cancel_requested로 변경 (재고 롤백은 관리자 반환 확인 시 처리)
  const { error: cancelError } = await adminSupa
    .from("ticket_materials")
    .update({ request_status: "cancel_requested" })
    .eq("id", materialId)
    .eq("request_status", "approved");

  if (cancelError) return { error: "취소 요청 실패: " + cancelError.message };

  const cancelLabel = mat.request_type === "purchase" ? "자재 구매" : "자재 출고";
  const invCancel = mat.inventory_items as unknown as {
    capacity: string | null;
    inventory_categories: { name: string } | null;
    inventory_specs: { name: string } | null;
    inventory_products: { name: string } | null;
  } | null;
  const cancelItemLabel = [invCancel?.inventory_categories?.name, invCancel?.inventory_specs?.name, invCancel?.inventory_products?.name, invCancel?.capacity].filter(Boolean).join(" / ");
  await adminSupa.from("ticket_logs").insert({
    ticket_id: mat.ticket_id,
    employee_id: employee.id,
    message: `시스템: ${cancelLabel} 반환이 요청되었습니다. (${cancelItemLabel}) (관리자 확인 대기)`,
  });

  revalidatePath(`/tickets/${mat.ticket_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}

// ----- 자재 반환 대기 목록 조회 (관리자/팀장) -----
export async function getCancelRequestedMaterials() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다.", data: [] };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "권한이 없습니다.", data: [] };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ticket_materials")
    .select(`
      id, ticket_id, inventory_item_id, quantity, request_status, request_type, notes, created_at,
      inventory_items ( base_estimate, capacity, condition,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      ),
      repair_tickets ( device_brand, device_model, status,
        customers ( name ),
        employees:assignee_id ( name )
      )
    `)
    .eq("request_status", "cancel_requested")
    .order("created_at", { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

// ----- 자재 반환 확인 (관리자/팀장 — 재고 복구 + 자재비 차감) -----
export async function confirmMaterialReturnAction(materialId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "반환 확인 권한이 없습니다." };
  }

  const adminSupa = createAdminClient();

  // 1) 자재 레코드 조회
  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select(`
      ticket_id, request_type, request_status, quantity, inventory_item_id,
      inventory_items (
        capacity,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      )
    `)
    .eq("id", materialId)
    .single();

  if (!mat) return { error: "자재 항목을 찾을 수 없습니다." };
  if (mat.request_status !== "cancel_requested") {
    return { error: "반환 대기 상태가 아닙니다. (현재: " + mat.request_status + ")" };
  }

  // 2) 상태를 cancelled로 최종 변경
  const { error: updateError } = await adminSupa
    .from("ticket_materials")
    .update({ request_status: "cancelled" })
    .eq("id", materialId)
    .eq("request_status", "cancel_requested");

  if (updateError) return { error: "반환 처리 실패: " + updateError.message };

  // 3) dispatch 타입이면 재고 복구 + 입출고 로그 생성
  if (mat.request_type === "dispatch") {
    const { data: invItem } = await adminSupa
      .from("inventory_items")
      .select("quantity")
      .eq("id", mat.inventory_item_id)
      .single();

    if (invItem) {
      const { error: invError } = await adminSupa
        .from("inventory_items")
        .update({
          quantity: invItem.quantity + mat.quantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", mat.inventory_item_id);

      if (invError) {
        // 재고 복구 실패 시 롤백
        await adminSupa
          .from("ticket_materials")
          .update({ request_status: "cancel_requested" })
          .eq("id", materialId);
        return { error: "재고 복구 실패: " + invError.message };
      }

      // 입출고 기록 생성 (접수 취소로 인한 자재 원복)
      await adminSupa.from("inventory_transactions").insert({
        item_id: mat.inventory_item_id,
        user_id: employee.id,
        transaction_type: "INBOUND",
        quantity_changed: mat.quantity,
        ticket_id: mat.ticket_id,
        notes: "접수 취소로 인한 자재 원복",
      });
    }
  }

  // 4) 티켓 자재비 합계 재계산
  const { data: approvedMats } = await adminSupa
    .from("ticket_materials")
    .select("quantity, inventory_item_id")
    .eq("ticket_id", mat.ticket_id)
    .eq("request_status", "approved");

  let approvedTotal = 0;
  if (approvedMats && approvedMats.length > 0) {
    const itemIds = approvedMats.map((m) => m.inventory_item_id);
    const { data: items } = await adminSupa
      .from("inventory_items")
      .select("id, base_estimate")
      .in("id", itemIds);

    const estimateMap = new Map<string, number>();
    for (const item of items ?? []) {
      estimateMap.set(item.id, item.base_estimate ?? 0);
    }

    approvedTotal = approvedMats.reduce((sum, m) => {
      return sum + (estimateMap.get(m.inventory_item_id) ?? 0) * m.quantity;
    }, 0);
  }

  const { data: ticketRow } = await adminSupa
    .from("repair_tickets")
    .select("material_cost_details")
    .eq("id", mat.ticket_id)
    .single();

  const manualDetails = Array.isArray(ticketRow?.material_cost_details) ? ticketRow.material_cost_details : [];
  const manualTotal = manualDetails.reduce((s: number, item: { amount: number }) => s + (item.amount ?? 0), 0);

  await adminSupa
    .from("repair_tickets")
    .update({ material_cost: approvedTotal + manualTotal })
    .eq("id", mat.ticket_id);

  // 5) 로그
  const returnLabel = mat.request_type === "purchase" ? "자재 구매" : "자재 출고";
  const invReturn = mat.inventory_items as unknown as {
    capacity: string | null;
    inventory_categories: { name: string } | null;
    inventory_specs: { name: string } | null;
    inventory_products: { name: string } | null;
  } | null;
  const returnItemLabel = [invReturn?.inventory_categories?.name, invReturn?.inventory_specs?.name, invReturn?.inventory_products?.name, invReturn?.capacity].filter(Boolean).join(" / ");
  await adminSupa.from("ticket_logs").insert({
    ticket_id: mat.ticket_id,
    employee_id: employee.id,
    message: `시스템: ${returnLabel} 반환이 확인되었습니다. (${returnItemLabel}) (재고 복구 완료)`,
  });

  revalidatePath(`/tickets/${mat.ticket_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}

// ----- 적출/반환 자재 등록 (담당 기사) -----
export async function registerReturnMaterialAction(
  materialId: string,
  returnCategoryId: string,
  returnSpec: string,
  returnName: string,
  returnCondition: "중고품" | "불량품",
  returnQuantity: number = 1,
  returnCapacity: string | null = null
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const adminSupa = createAdminClient();

  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select("ticket_id, request_status, is_return_registered")
    .eq("id", materialId)
    .single();

  if (!mat) return { error: "자재 항목을 찾을 수 없습니다." };
  if (mat.is_return_registered) return { error: "이미 반환 등록된 항목입니다." };
  if (mat.request_status !== "approved" && mat.request_status !== "cancel_requested" && mat.request_status !== "cancelled") {
    return { error: "승인/취소 상태의 자재만 반환 등록이 가능합니다." };
  }

  const { error: updateError } = await adminSupa
    .from("ticket_materials")
    .update({
      is_return_registered: true,
      return_category_id: returnCategoryId,
      return_spec: returnSpec.trim(),
      return_name: returnName.trim(),
      return_condition: returnCondition,
      return_quantity: Math.max(1, returnQuantity),
      return_capacity: returnCapacity ?? null,
      return_status: "pending",
    })
    .eq("id", materialId);

  if (updateError) return { error: "반환 등록 실패: " + updateError.message };

  await adminSupa.from("ticket_logs").insert({
    ticket_id: mat.ticket_id,
    employee_id: employee.id,
    message: `시스템: 적출 자재가 등록되었습니다. (${returnSpec} / ${returnName}${returnCapacity ? ` / ${returnCapacity}` : ""} / ${returnCondition} × ${Math.max(1, returnQuantity)}개)`,
  });

  revalidatePath(`/tickets/${mat.ticket_id}`);
  revalidatePath("/dashboard");
  return { success: true };
}

// ----- 적출/반환 자재 입고 대기 목록 조회 (관리자/팀장) -----
export async function getPendingReturnMaterials() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다.", data: [] };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "권한이 없습니다.", data: [] };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ticket_materials")
    .select(`
      id, ticket_id, inventory_item_id, quantity, request_status, request_type,
      return_spec, return_name, return_condition, return_status, return_quantity, return_capacity,
      created_at,
      inventory_items (
        category_id, spec_id, product_id,
        base_estimate, capacity, condition,
        inventory_categories ( id, name ),
        inventory_specs ( name ),
        inventory_products ( name )
      ),
      repair_tickets (
        receipt_no, device_brand, device_model, status,
        customers ( name ),
        employees:assignee_id ( name )
      )
    `)
    .eq("is_return_registered", true)
    .eq("return_status", "pending")
    .order("created_at", { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data: data ?? [] };
}

// ----- 적출/반환 자재 입고 승인 (관리자/팀장 — 재고 등록) -----
export async function approveReturnMaterialAction(materialId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "입고 승인 권한이 없습니다." };
  }

  const adminSupa = createAdminClient();

  // 1) 자재 레코드 조회
  const { data: mat } = await adminSupa
    .from("ticket_materials")
    .select(`
      ticket_id, is_return_registered, return_category_id, return_spec, return_name, return_condition, return_status, return_quantity, return_capacity,
      inventory_items (
        category_id,
        inventory_categories ( id, name )
      ),
      repair_tickets:ticket_id (
        assignee_id
      )
    `)
    .eq("id", materialId)
    .single();

  if (!mat) return { error: "자재 항목을 찾을 수 없습니다." };
  if (!mat.is_return_registered || mat.return_status !== "pending") {
    return { error: "입고 대기 상태가 아닙니다." };
  }

  const inv = mat.inventory_items as unknown as {
    category_id: string;
    inventory_categories: { id: string; name: string } | null;
  };
  // return_category_id가 있으면 사용, 없으면 원본 자재의 category_id 사용 (하위 호환)
  const categoryId = (mat as Record<string, unknown>).return_category_id as string | null ?? inv?.category_id;
  if (!categoryId) return { error: "반환 자재의 카테고리를 찾을 수 없습니다." };

  const returnSpec = mat.return_spec!;
  const returnName = mat.return_name!;
  const returnCondition = "USED"; // 적출품은 모두 중고로 입고
  const returnQty = (mat as Record<string, unknown>).return_quantity as number | null ?? 1;
  const returnCapacity = (mat as Record<string, unknown>).return_capacity as string | null ?? null;

  // 담당 기사 ID 조회 (트랜잭션 담당자로 기록)
  const ticket = mat.repair_tickets as unknown as { assignee_id: string | null } | null;
  const technicianUserId = ticket?.assignee_id ?? employee.id;

  // 2) return_status → approved
  const { error: statusError } = await adminSupa
    .from("ticket_materials")
    .update({ return_status: "approved" })
    .eq("id", materialId)
    .eq("return_status", "pending");

  if (statusError) return { error: "승인 상태 변경 실패: " + statusError.message };

  // 3) spec 조회 또는 생성
  let specId: string;
  const { data: existingSpec } = await adminSupa
    .from("inventory_specs")
    .select("id")
    .eq("category_id", categoryId)
    .eq("name", returnSpec)
    .single();

  if (existingSpec) {
    specId = existingSpec.id;
  } else {
    const { data: newSpec, error: specErr } = await adminSupa
      .from("inventory_specs")
      .insert({ category_id: categoryId, name: returnSpec })
      .select("id")
      .single();
    if (specErr || !newSpec) {
      await adminSupa.from("ticket_materials").update({ return_status: "pending" }).eq("id", materialId);
      return { error: "스펙 생성 실패: " + (specErr?.message ?? "알 수 없는 오류") };
    }
    specId = newSpec.id;
  }

  // 4) product 조회 또는 생성
  let productId: string;
  const { data: existingProduct } = await adminSupa
    .from("inventory_products")
    .select("id")
    .eq("spec_id", specId)
    .eq("name", returnName)
    .single();

  if (existingProduct) {
    productId = existingProduct.id;
  } else {
    const { data: newProduct, error: prodErr } = await adminSupa
      .from("inventory_products")
      .insert({ spec_id: specId, name: returnName })
      .select("id")
      .single();
    if (prodErr || !newProduct) {
      await adminSupa.from("ticket_materials").update({ return_status: "pending" }).eq("id", materialId);
      return { error: "제품 생성 실패: " + (prodErr?.message ?? "알 수 없는 오류") };
    }
    productId = newProduct.id;
  }

  // 5) inventory_items: 완전 일치 → 수량+1, 없으면 insert (기초견적 0원)
  const { data: existingItem } = await adminSupa
    .from("inventory_items")
    .select("id, quantity")
    .eq("category_id", categoryId)
    .eq("spec_id", specId)
    .eq("product_id", productId)
    .eq("condition", returnCondition)
    .single();

  let inboundItemId: string | null = null;

  if (existingItem) {
    const { error: updateErr } = await adminSupa
      .from("inventory_items")
      .update({
        quantity: existingItem.quantity + returnQty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingItem.id);

    if (updateErr) {
      await adminSupa.from("ticket_materials").update({ return_status: "pending" }).eq("id", materialId);
      return { error: "재고 수량 업데이트 실패: " + updateErr.message };
    }
    inboundItemId = existingItem.id;
  } else {
    const { data: newItem, error: insertErr } = await adminSupa
      .from("inventory_items")
      .insert({
        category_id: categoryId,
        spec_id: specId,
        product_id: productId,
        capacity: null,
        condition: returnCondition,
        quantity: returnQty,
        base_estimate: 0,
      })
      .select("id")
      .single();

    if (insertErr || !newItem) {
      await adminSupa.from("ticket_materials").update({ return_status: "pending" }).eq("id", materialId);
      return { error: "재고 신규 등록 실패: " + (insertErr?.message ?? "알 수 없는 오류") };
    }
    inboundItemId = newItem.id;
  }

  // 6) 카테고리 이름 조회 (반환 카테고리가 원본과 다를 수 있음)
  let categoryName = inv?.inventory_categories?.name ?? "카테고리";
  if (categoryId !== inv?.category_id) {
    const { data: returnCat } = await adminSupa
      .from("inventory_categories")
      .select("name")
      .eq("id", categoryId)
      .single();
    if (returnCat) categoryName = returnCat.name;
  }

  // inventory_transactions INBOUND 기록 (적출품 반환 입고)
  if (inboundItemId) {
    await adminSupa.from("inventory_transactions").insert({
      item_id: inboundItemId,
      user_id: technicianUserId,
      transaction_type: "INBOUND",
      quantity_changed: returnQty,
      ticket_id: mat.ticket_id,
      notes: "적출품 반환 입고",
    });
  }

  await adminSupa.from("ticket_logs").insert({
    ticket_id: mat.ticket_id,
    employee_id: employee.id,
    message: `시스템: 적출 자재 입고 승인 완료 (${categoryName} / ${returnSpec} / ${returnName}${returnCapacity ? ` / ${returnCapacity}` : ""} / ${mat.return_condition})`,
  });

  revalidatePath(`/tickets/${mat.ticket_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}

// ----- n8n AI 기기 라벨 분석 (신규 기기 가치 자동 조회) -----
export interface DeviceLabelAnalysisResult {
  tagInfo: string;
  brand: string;
  model: string;
  releaseYear: string;
  evaluatedValue: number;
  priceSource?: string;
}

export async function analyzeDeviceLabelAction(payload: {
  imageBase64?: string;
  modelName?: string;
  tagInfo?: string;
  deviceType?: string;
  brand?: string;
}): Promise<{ data?: DeviceLabelAnalysisResult; error?: string }> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const webhookUrl = process.env.N8N_DEVICE_WEBHOOK_URL;
  if (!webhookUrl) return { error: "AI 분석 서비스가 설정되지 않았습니다." };

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { error: "AI 분석 서버에 연결할 수 없습니다." };
  }

  if (!response.ok) {
    return { error: `AI 분석 실패 (${response.status})` };
  }

  let result: DeviceLabelAnalysisResult;
  try {
    result = await response.json();
  } catch {
    return { error: "AI 응답을 파싱할 수 없습니다." };
  }

  if (!result.brand || !result.model) {
    return { error: "AI가 기기 정보를 인식하지 못했습니다. 직접 입력해 주세요." };
  }

  // device_models 테이블에 캐시 (다음 동일 기기 조회 시 재활용)
  if (result.evaluatedValue > 0) {
    const adminSupa = createAdminClient();
    await adminSupa
      .from("device_models")
      .upsert(
        {
          brand: result.brand,
          model_name: result.model,
          tag_info: payload.tagInfo?.trim() || null,
          release_year: result.releaseYear ? parseInt(result.releaseYear, 10) : null,
          release_price: result.evaluatedValue,
          min_repair_cost: 0,
        },
        { onConflict: "brand,model_name", ignoreDuplicates: false }
      );
  }

  return { data: result };
}

/**
 * 폐기 확인 대기 티켓 목록 조회 (ADMIN/MANAGER 전용)
 * 취소 처리방법이 DISPOSE이고 아직 관리자 확인이 완료되지 않은 티켓
 */
export async function getDisposalPendingTickets() {
  const employee = await getCurrentEmployee();
  if (!employee) return { data: [] };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { data: [] };
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("repair_tickets")
    .select(`
      id, receipt_no, device_brand, device_model, tag_info, cancel_device_disposal, created_at,
      customers ( name, phone ),
      employees:assignee_id ( name )
    `)
    .eq("status", "CANCELED")
    .eq("cancel_device_disposal", "DISPOSE")
    .is("dispose_confirmed_at", null)
    .order("created_at", { ascending: false });

  return { data: (data ?? []) as {
    id: string;
    receipt_no: string;
    device_brand: string | null;
    device_model: string | null;
    tag_info: string | null;
    cancel_device_disposal: string | null;
    created_at: string;
    customers: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
    employees: { name: string } | { name: string }[] | null;
  }[] };
}

/**
 * 폐기 기기 확인 완료 처리 (ADMIN/MANAGER 전용)
 */
export async function confirmDisposalAction(ticketId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "폐기 확인 권한이 없습니다." };
  }

  const adminSupa = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (adminSupa as any)
    .from("repair_tickets")
    .update({ dispose_confirmed_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("cancel_device_disposal", "DISPOSE")
    .is("dispose_confirmed_at", null);

  if (error) return { error: "폐기 확인 처리 실패: " + error.message };

  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: "시스템: 폐기 기기 실물 확인이 완료되었습니다.",
  });

  revalidatePath("/dashboard");
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

// ----- 접수방식 변경 (RECEPTION / MANAGER / ADMIN — 수리 시작 전만 가능) -----
const RECEIPT_TYPE_LABELS: Record<string, string> = {
  WALK_IN: "내방",
  VISIT: "방문",
  QUICK: "퀵",
  PARCEL: "택배",
};
const VALID_RECEIPT_TYPES = Object.keys(RECEIPT_TYPE_LABELS);

export async function updateReceiptTypeAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const canUpdate = [EmployeeRole.ADMIN, EmployeeRole.MANAGER, EmployeeRole.RECEPTION, EmployeeRole.TECHNICIAN, EmployeeRole.EXPERT_REPAIR];
  if (!canUpdate.includes(employee.role)) {
    return { error: "접수방식 변경 권한이 없습니다." };
  }

  const ticketId = formData.get("ticketId") as string;
  const receiptType = formData.get("receiptType") as string;

  if (!ticketId) return { error: "접수건 ID가 필요합니다." };
  if (!VALID_RECEIPT_TYPES.includes(receiptType)) {
    return { error: "유효한 접수 방식을 선택해 주세요." };
  }

  const supabase = createAdminClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("status")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };

  if (!["NEW", "ASSIGNED", "RECEIVED"].includes(ticket.status)) {
    return { error: "수리 시작 전 상태(신규·배정·입고완료)에서만 접수방식을 변경할 수 있습니다." };
  }

  const { error } = await supabase
    .from("repair_tickets")
    .update({ receipt_type: receiptType })
    .eq("id", ticketId);

  if (error) return { error: "접수방식 변경 실패: " + error.message };

  await supabase.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: `시스템: 접수방식이 '${RECEIPT_TYPE_LABELS[receiptType]}'(으)로 변경되었습니다.`,
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  return { success: true };
}
