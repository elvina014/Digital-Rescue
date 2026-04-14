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
  const { error: ticketError } = await supabase.from("repair_tickets").insert({
    customer_id: customerId,
    receipt_type: receiptType,
    device_brand: deviceBrand,
    device_model: deviceModel,
    symptoms,
  });

  if (ticketError) {
    return { error: "접수 등록에 실패했습니다: " + ticketError.message };
  }

  revalidatePath("/tickets");
  redirect("/tickets");
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

// ----- 수리 진행 시작 + 예상 견적 입력 (TECHNICIAN / EXPERT_REPAIR) -----
export async function startRepairAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." };

  const ticketId = formData.get("ticketId") as string;
  const expectedEstimate = parseInt(formData.get("expectedEstimate") as string, 10) || 0;

  if (!ticketId) return { error: "접수건 ID가 필요합니다." };
  if (expectedEstimate < 0) return { error: "예상 견적은 0 이상이어야 합니다." };

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

  const { error } = await supabase
    .from("repair_tickets")
    .update({ expected_estimate: expectedEstimate, status: "IN_PROGRESS" })
    .eq("id", ticketId);

  if (error) return { error: "수리 시작 처리에 실패했습니다: " + error.message };

  // 자동 로그
  const adminSupa = createAdminClient();
  const estimateText = expectedEstimate > 0 ? ` (예상견적: ${expectedEstimate.toLocaleString()}원)` : "";
  await adminSupa.from("ticket_logs").insert({
    ticket_id: ticketId,
    employee_id: employee.id,
    message: `시스템: 수리가 시작되었습니다.${estimateText}`,
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
  const newTotal = newDetails.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0);

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

  revalidatePath(`/tickets/${ticketId}`);
}
