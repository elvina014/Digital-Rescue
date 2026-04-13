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
      id, status, receipt_type, device_brand, device_model,
      symptoms, initial_estimate, final_price, is_approved,
      payment_status, created_at, updated_at,
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

  // Supabase 조인 결과 타입 정리
  const ticketData = {
    id: ticket.id,
    status: ticket.status as TicketStatus,
    receipt_type: ticket.receipt_type,
    device_brand: ticket.device_brand,
    device_model: ticket.device_model,
    symptoms: ticket.symptoms,
    initial_estimate: ticket.initial_estimate,
    final_price: ticket.final_price,
    is_approved: ticket.is_approved,
    payment_status: ticket.payment_status,
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
      />
    </div>
  );
}
