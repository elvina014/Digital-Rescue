"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";

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
  const deviceBrand = (formData.get("deviceBrand") as string)?.trim();
  const deviceModel = (formData.get("deviceModel") as string)?.trim() || null;
  const symptoms = (formData.get("symptoms") as string)?.trim();

  if (!customerName || !customerPhone || !receiptType || !deviceBrand || !symptoms) {
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
      device_brand: deviceBrand,
      device_model: deviceModel,
      symptoms,
    })
    .select("id")
    .single();

  if (ticketError || !newTicket) {
    return { error: "접수 등록에 실패했습니다: " + (ticketError?.message ?? "") };
  }

  revalidatePath("/tickets");
  return { ticketId: newTicket.id };
}

// ----- 담당기사 배정/변경 (RECEPTION, MANAGER, ADMIN) -----
// NEW, ASSIGNED, IN_PROGRESS 상태에서 가능
const CAN_ASSIGN_STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS"];

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
export async function lookupPastEvaluatedValue(
  deviceType: string,
  deviceBrand: string,
  deviceModel: string
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { data: null };

  if (!deviceType || !deviceBrand || !deviceModel) return { data: null };

  const supabase = await createClient();

  const { data } = await supabase
    .from("repair_tickets")
    .select("evaluated_value")
    .eq("device_type", deviceType)
    .eq("device_brand", deviceBrand)
    .eq("device_model", deviceModel)
    .not("evaluated_value", "is", null)
    .gt("evaluated_value", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: data?.evaluated_value ?? null };
}

// ----- 수리 진행 시작 + 견적 산출 (TECHNICIAN / EXPERT_REPAIR) -----
export async function startRepairAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const deviceType = formData.get("deviceType") as string;
  const deviceBrand = (formData.get("deviceBrand") as string)?.trim() || "";
  const deviceModel = (formData.get("deviceModel") as string)?.trim() || null;
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
    .select("assignee_id, status")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "접수건을 찾을 수 없습니다." };
  if (ticket.status !== "ASSIGNED") return { error: "배정 완료 상태의 접수건만 수리 시작할 수 있습니다." };

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

  // 3) 자동 로그
  const adminSupa = createAdminClient();
  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: `시스템: 수리가 시작되었습니다. (확정견적: ${confirmedEstimate.toLocaleString()}원, 최소견적: ${minimumEstimate.toLocaleString()}원, 자재 ${materials.length}건)`,
  });

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

  const { error } = await supabase
    .from("repair_tickets")
    .update({ status: newStatus })
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
    .update({ is_approved: true, status: "COMPLETED" })
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

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("repair_tickets")
    .select("status, is_approved")
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

  const { error } = await supabase
    .from("repair_tickets")
    .update({ status: "CANCELED" })
    .eq("id", ticketId);

  if (error) {
    return { error: "취소 처리에 실패했습니다: " + error.message };
  }

  // 시스템 로그 기록
  await supabase.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: "시스템: 접수가 취소되었습니다.",
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

  // 3) dispatch 타입이면 재고 복구
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
        device_brand, device_model, status,
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
      ticket_id, is_return_registered, return_category_id, return_spec, return_name, return_condition, return_status, return_quantity,
      inventory_items (
        category_id,
        inventory_categories ( id, name )
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
  } else {
    const { error: insertErr } = await adminSupa
      .from("inventory_items")
      .insert({
        category_id: categoryId,
        spec_id: specId,
        product_id: productId,
        capacity: null,
        condition: returnCondition,
        quantity: returnQty,
        base_estimate: 0,
      });

    if (insertErr) {
      await adminSupa.from("ticket_materials").update({ return_status: "pending" }).eq("id", materialId);
      return { error: "재고 신규 등록 실패: " + insertErr.message };
    }
  }

  // 6) 로그 — 카테고리 이름 조회 (반환 카테고리가 원본과 다를 수 있음)
  let categoryName = inv?.inventory_categories?.name ?? "카테고리";
  if (categoryId !== inv?.category_id) {
    const { data: returnCat } = await adminSupa
      .from("inventory_categories")
      .select("name")
      .eq("id", categoryId)
      .single();
    if (returnCat) categoryName = returnCat.name;
  }
  await adminSupa.from("ticket_logs").insert({
    ticket_id: mat.ticket_id,
    employee_id: employee.id,
    message: `시스템: 적출 자재 입고 승인 완료 (${categoryName} / ${returnSpec} / ${returnName} / ${mat.return_condition})`,
  });

  revalidatePath(`/tickets/${mat.ticket_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}
