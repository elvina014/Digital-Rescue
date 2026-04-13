"use client";

import { useState } from "react";
import type { EmployeeRole, TicketStatus } from "@/types";
import { TicketStatusBadge } from "@/components/common/TicketStatusBadge";
import {
  assignTechnicianAction,
  submitEstimateAction,
  updateTicketStatusAction,
  approveTicketAction,
} from "../actions";

interface TicketData {
  id: string;
  status: TicketStatus;
  receipt_type: string;
  device_brand: string;
  device_model: string | null;
  symptoms: string;
  initial_estimate: number;
  final_price: number;
  is_approved: boolean;
  payment_status: string;
  created_at: string;
  updated_at: string;
  customer: { name: string; phone: string; address: string | null } | null;
  assignee: { id: string; name: string } | null;
}

interface TechnicianOption {
  id: string;
  name: string;
}

interface TicketDetailFormProps {
  ticket: TicketData;
  currentEmployee: { id: string; name: string; role: EmployeeRole };
  technicians: TechnicianOption[];
}

const RECEIPT_LABEL: Record<string, string> = {
  VISIT: "방문",
  DELIVERY: "퀵/택배",
  WALK_IN: "내방",
};

export default function TicketDetailForm({
  ticket,
  currentEmployee,
  technicians,
}: TicketDetailFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const role = currentEmployee.role;
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const isReception = role === "RECEPTION";
  const isTechnician = role === "TECHNICIAN";

  // 승인 완료 시 잠금 (ADMIN, MANAGER 제외)
  const isLocked = ticket.is_approved && !isAdmin && !isManager;
  // ADMIN/MANAGER는 승인 완료 후에도 조회 가능 (금액 수정은 별도 제한)
  const isFullyLocked = ticket.is_approved && !isAdmin;

  // 담당기사 배정 가능: RECEPTION/MANAGER/ADMIN + 신규 상태
  const canAssign =
    (isReception || isManager || isAdmin) && ticket.status === "NEW";

  // 견적 입력 가능: TECHNICIAN(본인 건) 또는 ADMIN/MANAGER, 승인 전
  const canEditEstimate =
    !ticket.is_approved &&
    (isAdmin ||
      isManager ||
      (isTechnician && ticket.assignee?.id === currentEmployee.id));

  // 상태 변경 가능
  const canChangeStatus =
    !isLocked &&
    (isAdmin ||
      isManager ||
      (isTechnician && ticket.assignee?.id === currentEmployee.id));

  // 승인 가능: MANAGER/ADMIN + 승인 대기 상태
  const canApprove =
    (isAdmin || isManager) && ticket.status === "WAITING_APPROVAL" && !ticket.is_approved;

  async function handleAction(action: (formData: FormData) => Promise<{ error: string } | undefined>, formData: FormData) {
    setIsLoading(true);
    setError(null);
    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {ticket.is_approved && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          이 접수건은 승인 완료되었습니다. {isAdmin ? "관리자 권한으로 수정 가능합니다." : isManager ? "팀장 권한으로 일부 수정 가능합니다." : "수정이 불가합니다."}
        </div>
      )}

      {/* 기본 정보 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-800">접수 정보</h2>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-gray-500">접수 번호</dt>
            <dd className="mt-0.5 text-sm font-mono text-gray-900">{ticket.id.slice(0, 8)}...</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">접수 방식</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{RECEIPT_LABEL[ticket.receipt_type] ?? ticket.receipt_type}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">기기 브랜드</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{ticket.device_brand}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">모델명</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{ticket.device_model ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">상태</dt>
            <dd className="mt-0.5"><TicketStatusBadge status={ticket.status} /></dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">접수일</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{new Date(ticket.created_at).toLocaleString("ko-KR")}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500">고장 증상</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{ticket.symptoms}</dd>
          </div>
        </dl>
      </section>

      {/* 고객 정보 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-800">고객 정보</h2>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-gray-500">고객명</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{ticket.customer?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">연락처</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{ticket.customer?.phone ?? "-"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500">주소</dt>
            <dd className="mt-0.5 text-sm text-gray-900">{ticket.customer?.address ?? "-"}</dd>
          </div>
        </dl>
      </section>

      {/* 담당기사 배정 (RECEPTION / MANAGER / ADMIN, 신규 상태) */}
      {canAssign && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">담당기사 배정</h2>
          <form
            action={(fd) => handleAction(assignTechnicianAction, fd)}
            className="flex items-end gap-3"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div className="flex-1">
              <label htmlFor="assigneeId" className="mb-1 block text-sm font-medium text-gray-700">
                담당기사 선택
              </label>
              <select
                id="assigneeId"
                name="assigneeId"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">선택해 주세요</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              배정
            </button>
          </form>
        </section>
      )}

      {/* 현재 담당기사 표시 (배정 완료 시) */}
      {!canAssign && ticket.assignee && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">담당기사</h2>
          <p className="text-sm text-gray-900">{ticket.assignee.name}</p>
        </section>
      )}

      {/* 상태 변경 (TECHNICIAN: IN_PROGRESS 전환 등) */}
      {canChangeStatus && ticket.status === "ASSIGNED" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">수리 시작</h2>
          <form action={(fd) => handleAction(updateTicketStatusAction, fd)}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <input type="hidden" name="status" value="IN_PROGRESS" />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600 disabled:opacity-50"
            >
              수리 진행 시작
            </button>
          </form>
        </section>
      )}

      {/* 견적 입력 & 승인 요청 (TECHNICIAN / ADMIN / MANAGER) */}
      {canEditEstimate && (ticket.status === "IN_PROGRESS" || ticket.status === "ASSIGNED") && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">견적 입력 및 승인 요청</h2>
          {ticket.initial_estimate > 0 && (
            <p className="mb-3 text-sm text-gray-600">
              시스템 최소 견적: <span className="font-semibold">{ticket.initial_estimate.toLocaleString()}원</span>
              <span className="ml-1 text-xs text-gray-400">(이 금액 이하로는 입력 불가)</span>
            </p>
          )}
          <form
            action={(fd) => handleAction(submitEstimateAction, fd)}
            className="flex items-end gap-3"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div className="flex-1">
              <label htmlFor="finalPrice" className="mb-1 block text-sm font-medium text-gray-700">
                최종 견적 (원)
              </label>
              <input
                id="finalPrice"
                name="finalPrice"
                type="number"
                min={ticket.initial_estimate > 0 ? ticket.initial_estimate : 1}
                defaultValue={ticket.final_price > 0 ? ticket.final_price : ""}
                required
                placeholder="금액 입력"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              승인 요청
            </button>
          </form>
        </section>
      )}

      {/* 견적 정보 표시 (읽기 전용) */}
      {(isLocked || ticket.status === "WAITING_APPROVAL" || ticket.status === "COMPLETED") && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">견적 정보</h2>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">최소 견적</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-gray-900">
                {ticket.initial_estimate > 0 ? `${ticket.initial_estimate.toLocaleString()}원` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">최종 견적</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                {ticket.final_price > 0 ? `${ticket.final_price.toLocaleString()}원` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">승인 상태</dt>
              <dd className="mt-0.5 text-sm">
                {ticket.is_approved ? (
                  <span className="font-medium text-green-700">승인 완료</span>
                ) : (
                  <span className="font-medium text-orange-600">대기 중</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">결제 상태</dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {ticket.payment_status === "PAID" ? "결제 완료" : "결제 대기"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* 최종 승인 버튼 (MANAGER / ADMIN) */}
      {canApprove && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="mb-3 text-base font-semibold text-blue-900">센터 최종 승인</h2>
          <p className="mb-4 text-sm text-blue-700">
            최종 견적 <span className="font-semibold">{ticket.final_price.toLocaleString()}원</span>을 승인하시겠습니까?
            승인 후에는 ADMIN 외 수정이 불가합니다.
          </p>
          <form action={(fd) => handleAction(approveTicketAction, fd)}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              최종 승인
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
