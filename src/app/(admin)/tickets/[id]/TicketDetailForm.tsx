"use client";

import { useState } from "react";
import type { EmployeeRole, TicketStatus } from "@/types";
import { TicketStatusBadge } from "@/components/common/TicketStatusBadge";
import {
  assignTechnicianAction,
  startRepairAction,
  addMaterialCostAction,
  submitEstimateAction,
  updateTicketStatusAction,
  approveTicketAction,
  addTicketLogAction,
} from "../actions";

interface TicketData {
  id: string;
  status: TicketStatus;
  receipt_type: string;
  device_brand: string;
  device_model: string | null;
  symptoms: string;
  initial_estimate: number;
  expected_estimate: number;
  material_cost: number;
  material_cost_details: { description: string; amount: number }[];
  final_price: number;
  is_approved: boolean;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  customer: { name: string; phone: string; address: string | null } | null;
  assignee: { id: string; name: string } | null;
}

interface TechnicianOption {
  id: string;
  name: string;
}

interface LogEntry {
  id: string;
  message: string;
  created_at: string;
  employee_name: string;
}

interface TicketDetailFormProps {
  ticket: TicketData;
  currentEmployee: { id: string; name: string; role: EmployeeRole };
  technicians: TechnicianOption[];
  logs: LogEntry[];
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
  logs,
}: TicketDetailFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expectedEstimateInput, setExpectedEstimateInput] = useState<number | "">(
    ticket.expected_estimate > 0 ? ticket.expected_estimate : ""
  );

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  const role = currentEmployee.role;
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const isReception = role === "RECEPTION";
  const isTechnician = role === "TECHNICIAN";
  const isExpertRepair = role === "EXPERT_REPAIR";

  // 승인 완료 시 잠금 (ADMIN, MANAGER 제외)
  const isLocked = ticket.is_approved && !isAdmin && !isManager;
  // ADMIN/MANAGER는 승인 완료 후에도 조회 가능 (금액 수정은 별도 제한)
  const isFullyLocked = ticket.is_approved && !isAdmin;

  // 담당기사 배정/변경 가능: RECEPTION/MANAGER/ADMIN + NEW/ASSIGNED/IN_PROGRESS 상태
  const canAssign =
    (isReception || isManager || isAdmin) &&
    ["NEW", "ASSIGNED", "IN_PROGRESS"].includes(ticket.status) &&
    !(ticket.is_approved && !isAdmin);

  // 견적 입력 가능: TECHNICIAN/EXPERT_REPAIR(본인 건) 또는 ADMIN/MANAGER, 승인 전
  const canEditEstimate =
    !ticket.is_approved &&
    (isAdmin ||
      isManager ||
      ((isTechnician || isExpertRepair) && ticket.assignee?.id === currentEmployee.id));

  // 상태 변경 가능
  const canChangeStatus =
    !isLocked &&
    (isAdmin ||
      isManager ||
      ((isTechnician || isExpertRepair) && ticket.assignee?.id === currentEmployee.id));

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
            <dd className="mt-0.5 text-sm text-gray-900">{formatDate(ticket.created_at)}</dd>
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

      {/* 담당기사 배정/변경 (RECEPTION / MANAGER / ADMIN) */}
      {canAssign && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">
            {ticket.assignee ? "담당기사 변경" : "담당기사 배정"}
          </h2>
          {ticket.assignee && (
            <p className="mb-3 text-sm text-gray-600">
              현재 담당기사: <span className="font-semibold">{ticket.assignee.name}</span>
            </p>
          )}
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
                defaultValue={ticket.assignee?.id ?? ""}
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
              {ticket.assignee ? "기사 변경" : "기사 배정"}
            </button>
          </form>
        </section>
      )}

      {/* 현재 담당기사 표시 (배정 완료 & 변경 불가 시) */}
      {!canAssign && ticket.assignee && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">담당기사</h2>
          <p className="text-sm text-gray-900">{ticket.assignee.name}</p>
        </section>
      )}

      {/* 수리 시작 + 예상 견적 입력 (TECHNICIAN / EXPERT_REPAIR, ASSIGNED 상태) */}
      {canChangeStatus && ticket.status === "ASSIGNED" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">수리 시작</h2>
          <form
            action={(fd) => handleAction(startRepairAction, fd)}
            className="space-y-3"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div>
              <label htmlFor="expectedEstimate" className="mb-1 block text-sm font-medium text-gray-700">
                예상 견적 (원)
              </label>
              <input
                id="expectedEstimate"
                name="expectedEstimate"
                type="number"
                min={0}
                value={expectedEstimateInput}
                onChange={(e) =>
                  setExpectedEstimateInput(e.target.value === "" ? "" : Number(e.target.value))
                }
                placeholder="고객과 조율한 예상 금액"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isLoading || !expectedEstimateInput || expectedEstimateInput <= 0}
                className="whitespace-nowrap rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:opacity-50"
              >
                수리 진행 시작
              </button>
              {(!expectedEstimateInput || expectedEstimateInput <= 0) && (
                <p className="text-xs text-gray-400">
                  예상 견적 금액을 입력해야 수리를 시작할 수 있습니다.
                </p>
              )}
            </div>
          </form>
        </section>
      )}

      {/* 자재비 추가 및 목록 (IN_PROGRESS 상태, 견적 수정 권한자) */}
      {canEditEstimate && ticket.status === "IN_PROGRESS" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">자재비 관리</h2>

          {/* 자재비 추가 폼 */}
          <form
            action={(fd) => handleAction(addMaterialCostAction, fd)}
            className="mb-4 flex items-end gap-3"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div className="flex-1">
              <label htmlFor="mcDescription" className="mb-1 block text-sm font-medium text-gray-700">
                비용 내용
              </label>
              <input
                id="mcDescription"
                name="description"
                type="text"
                required
                placeholder="예: DDR4 8GB RAM"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="w-36">
              <label htmlFor="mcAmount" className="mb-1 block text-sm font-medium text-gray-700">
                자재비 (원)
              </label>
              <input
                id="mcAmount"
                name="amount"
                type="number"
                min={1}
                required
                placeholder="금액"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="whitespace-nowrap rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              비용 추가
            </button>
          </form>

          {/* 자재비 목록 */}
          {ticket.material_cost_details.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <ul className="divide-y divide-gray-200 text-sm">
                {ticket.material_cost_details.map((item, idx) => (
                  <li key={idx} className="flex items-center justify-between py-1.5">
                    <span className="text-gray-700">{item.description}</span>
                    <span className="tabular-nums font-medium text-gray-900">{item.amount.toLocaleString()}원</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-gray-300 pt-2">
                <span className="text-sm font-semibold text-gray-700">합계</span>
                <span className="tabular-nums text-sm font-bold text-gray-900">{ticket.material_cost.toLocaleString()}원</span>
              </div>
            </div>
          )}

          {ticket.material_cost_details.length === 0 && (
            <p className="text-sm text-gray-400">아직 추가된 자재비가 없습니다.</p>
          )}
        </section>
      )}

      {/* 고객 결제 & 승인 요청 (IN_PROGRESS 상태, 견적 수정 권한자) */}
      {canEditEstimate && ticket.status === "IN_PROGRESS" && (
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-5">
          <h2 className="mb-4 text-base font-semibold text-orange-900">고객 결제 및 승인 요청</h2>
          {ticket.initial_estimate > 0 && (
            <p className="mb-3 text-sm text-orange-700">
              시스템 최소 견적: <span className="font-semibold">{ticket.initial_estimate.toLocaleString()}원</span>
              <span className="ml-1 text-xs text-orange-500">(최종 견적은 이 금액 이상이어야 합니다)</span>
            </p>
          )}
          {ticket.expected_estimate > 0 && (
            <p className="mb-3 text-sm text-orange-700">
              예상 견적: <span className="font-semibold">{ticket.expected_estimate.toLocaleString()}원</span>
            </p>
          )}
          {ticket.material_cost > 0 && (
            <p className="mb-3 text-sm text-orange-700">
              자재비 합계: <span className="font-semibold">{ticket.material_cost.toLocaleString()}원</span>
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!window.confirm("본 건을 마무리 하시겠습니까? 이후에는 내용 수정을 할 수 없습니다.")) return;
              const fd = new FormData(e.currentTarget);
              handleAction(submitEstimateAction, fd);
            }}
            className="space-y-4"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />

            {/* 결제 방식 */}
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-gray-700">결제 방식</legend>
              <div className="flex flex-wrap gap-4">
                {([
                  { value: "CARD", label: "카드결제" },
                  { value: "BANK_TRANSFER", label: "계좌이체" },
                  { value: "E_PAYMENT", label: "간편결제" },
                ] as const).map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="paymentMethod" value={opt.value} required className="accent-orange-500" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* 최종 견적 */}
            <div>
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
                placeholder="고객이 최종 결제할 금액"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                승인 요청
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 견적 정보 표시 (읽기 전용) */}
      {(isLocked || ticket.status === "WAITING_APPROVAL" || ticket.status === "COMPLETED") && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">견적 정보</h2>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-gray-500">최소 견적</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-gray-900">
                {ticket.initial_estimate > 0 ? `${ticket.initial_estimate.toLocaleString()}원` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">예상 견적</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-gray-900">
                {ticket.expected_estimate > 0 ? `${ticket.expected_estimate.toLocaleString()}원` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">자재비 합계</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-gray-900">
                {ticket.material_cost > 0 ? `${ticket.material_cost.toLocaleString()}원` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">최종 견적</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
                {ticket.final_price > 0 ? `${ticket.final_price.toLocaleString()}원` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">결제 방식</dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                {ticket.payment_method === "CARD" ? "카드결제" : ticket.payment_method === "BANK_TRANSFER" ? "계좌이체" : ticket.payment_method === "E_PAYMENT" ? "간편결제" : "-"}
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
          </dl>

          {/* 자재비 상세 목록 (읽기 전용) */}
          {ticket.material_cost_details.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <h3 className="mb-2 text-xs font-semibold text-gray-500">자재비 상세</h3>
              <ul className="divide-y divide-gray-200 text-sm">
                {ticket.material_cost_details.map((item, idx) => (
                  <li key={idx} className="flex items-center justify-between py-1.5">
                    <span className="text-gray-700">{item.description}</span>
                    <span className="tabular-nums font-medium text-gray-900">{item.amount.toLocaleString()}원</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {/* 작업 메모 입력 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-800">메모 추가</h2>
        <form
          action={(fd) => handleAction(addTicketLogAction, fd)}
          className="flex items-end gap-3"
        >
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div className="flex-1">
            <label htmlFor="logMessage" className="mb-1 block text-sm font-medium text-gray-700">
              작업 내용 / 메모
            </label>
            <textarea
              id="logMessage"
              name="message"
              required
              rows={2}
              placeholder="작업 진행 사항이나 메모를 입력하세요"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            등록
          </button>
        </form>
      </section>

      {/* 작업 로그 타임라인 */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-gray-800">작업 로그</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">아직 기록된 로그가 없습니다.</p>
        ) : (
          <ol className="relative border-l-2 border-gray-200 pl-6 space-y-5">
            {logs.map((log) => (
              <li key={log.id} className="relative">
                <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-blue-500 bg-white" />
                <div className="flex items-baseline gap-2 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{log.employee_name}</span>
                  <time>{formatDate(log.created_at)}</time>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{log.message}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
