import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import type { TicketStatus } from "@/types";
import TicketDetailForm from "./TicketDetailForm";

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * 접수건 상세/수정 페이지
 * 직급별 권한에 따라 조작 가능 영역이 다름
 */
export default async function TicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  const supabase = await createClient();

  // 접수건 + 고객 + 담당기사 조인 조회
  const { data: ticket, error } = await supabase
    .from("repair_tickets")
    .select(
      `
      id, status, receipt_type, device_brand, device_model, tag_info, release_year,
      symptoms, initial_estimate, expected_estimate, material_cost,
      material_cost_details, final_price, is_approved, has_admin_message, images,
      payment_status, payment_method, cancel_device_disposal, created_at, updated_at,
      customers ( name, phone, address ),
      employees:assignee_id ( id, name )
    `
    )
    .eq("id", id)
    .single();

  if (error || !ticket) {
    notFound();
  }

  // 담당기사 배정용: TECHNICIAN + EXPERT_REPAIR 직급 직원 목록 조회
  const { data: technicians } = await supabase
    .from("employees")
    .select("id, name")
    .in("role", ["TECHNICIAN", "EXPERT_REPAIR"])
    .order("name");

  // 처리 현황 로그 조회 (타임라인)
  const { data: logs } = await supabase
    .from("ticket_logs")
    .select("id, message, created_at, employees:employee_id ( name )")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  // 재고 카테고리 조회
  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("id, name")
    .order("name");

  // 재고 아이템 조회 (카테고리/스펙/제품명 포함)
  const { data: inventoryItems } = await supabase
    .from("inventory_items")
    .select(`
      id, category_id, spec_id, product_id,
      capacity, condition, quantity, base_estimate,
      inventory_categories ( name ),
      inventory_specs ( name ),
      inventory_products ( name )
    `)
    .order("created_at", { ascending: false });

  // 글로벌 설정 조회
  const { data: globalSettings } = await supabase
    .from("global_settings")
    .select("base_service_cost, value_reference_amount, discount_surcharge_rate")
    .eq("id", true)
    .single();

  // 해당 티켓의 ticket_materials 조회
  const { data: ticketMaterialsRaw } = await supabase
    .from("ticket_materials")
    .select(`
      id, inventory_item_id, quantity, request_status, request_type, notes,
      is_return_registered, return_spec, return_name, return_condition, return_status, return_quantity, return_capacity,
      inventory_items (
        category_id, base_estimate, capacity, condition,
        inventory_categories ( name ),
        inventory_specs ( name ),
        inventory_products ( name )
      )
    `)
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  // 재고 아이템 데이터 정리
  const inventoryItemRows = (inventoryItems ?? []).map((item) => ({
    id: item.id,
    category_id: item.category_id,
    spec_id: item.spec_id,
    product_id: item.product_id,
    capacity: item.capacity,
    condition: item.condition,
    quantity: item.quantity,
    base_estimate: item.base_estimate,
    category_name: (item.inventory_categories as unknown as { name: string })?.name ?? "",
    spec_name: (item.inventory_specs as unknown as { name: string })?.name ?? "",
    product_name: (item.inventory_products as unknown as { name: string })?.name ?? "",
  }));

  const globalSettingsData = globalSettings ?? {
    base_service_cost: 0,
    value_reference_amount: 1,
    discount_surcharge_rate: 100,
  };

  // ticket_materials 정리
  const ticketMaterialRows = (ticketMaterialsRaw ?? []).map((tm) => {
    const inv = tm.inventory_items as unknown as {
      base_estimate: number;
      capacity: string | null;
      condition: string;
      category_id?: string;
      inventory_categories: { name: string } | null;
      inventory_specs: { name: string } | null;
      inventory_products: { name: string } | null;
    } | null;
    return {
      id: tm.id,
      inventory_item_id: tm.inventory_item_id,
      quantity: tm.quantity,
      request_status: tm.request_status,
      request_type: (tm.request_type as string) ?? "dispatch",
      notes: tm.notes,
      category_id: inv?.category_id ?? null,
      category_name: inv?.inventory_categories?.name ?? "",
      spec_name: inv?.inventory_specs?.name ?? "",
      product_name: inv?.inventory_products?.name ?? "",
      capacity: inv?.capacity ?? null,
      condition: inv?.condition ?? "중고",
      base_estimate: inv?.base_estimate ?? 0,
      is_return_registered: (tm as Record<string, unknown>).is_return_registered as boolean ?? false,
      return_spec: (tm as Record<string, unknown>).return_spec as string | null ?? null,
      return_name: (tm as Record<string, unknown>).return_name as string | null ?? null,
      return_condition: (tm as Record<string, unknown>).return_condition as string | null ?? null,
      return_status: (tm as Record<string, unknown>).return_status as string | null ?? null,
      return_quantity: (tm as Record<string, unknown>).return_quantity as number | null ?? 1,
      return_capacity: (tm as Record<string, unknown>).return_capacity as string | null ?? null,
    };
  });

  // Supabase 조인 결과 타입 정리
  const ticketData = {
    id: ticket.id,
    status: ticket.status as TicketStatus,
    receipt_type: ticket.receipt_type,
    device_brand: ticket.device_brand,
    device_model: ticket.device_model,
    tag_info: (ticket as Record<string, unknown>).tag_info as string | null ?? null,
    release_year: (ticket as Record<string, unknown>).release_year as string | null ?? null,
    symptoms: ticket.symptoms,
    initial_estimate: ticket.initial_estimate,
    expected_estimate: ticket.expected_estimate,
    material_cost: ticket.material_cost,
    material_cost_details: (ticket.material_cost_details ?? []) as { description: string; amount: number }[],
    final_price: ticket.final_price,
    is_approved: ticket.is_approved,
    has_admin_message: ticket.has_admin_message as boolean,
    images: ((ticket.images ?? []) as { path: string; url: string; description?: string; uploaded_by?: string; uploader_name?: string; uploaded_at?: string; is_customer?: boolean }[]),
    payment_status: ticket.payment_status,
    payment_method: ticket.payment_method ?? null,
    cancel_device_disposal: (ticket as Record<string, unknown>).cancel_device_disposal as string | null ?? null,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    customer: ticket.customers as unknown as {
      name: string;
      phone: string;
      address: string | null;
    } | null,
    assignee: ticket.employees as unknown as {
      id: string;
      name: string;
    } | null,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/tickets"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 목록으로
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">접수건 상세</h1>

      <TicketDetailForm
        ticket={ticketData}
        currentEmployee={employee}
        technicians={technicians ?? []}
        logs={
          (logs ?? []).map((log) => ({
            id: log.id,
            message: log.message,
            created_at: log.created_at,
            employee_name:
              (log.employees as unknown as { name: string } | null)?.name ?? "알 수 없음",
          }))
        }
        inventoryItems={inventoryItemRows}
        inventoryCategories={categories ?? []}
        globalSettings={globalSettingsData}
        ticketMaterials={ticketMaterialRows}
      />
    </div>
  );
}
