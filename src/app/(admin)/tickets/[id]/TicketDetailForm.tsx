"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import type { EmployeeRole, TicketStatus } from "@/types";
import { TicketStatusBadge } from "@/components/common/TicketStatusBadge";
import ImageUploader from "@/components/common/ImageUploader";
import Lightbox from "@/components/common/Lightbox";
import { compressAndUploadSingle, MAX_IMAGES_PER_TICKET, type TicketImage } from "@/lib/imageUpload";
import {
  assignTechnicianAction,
  addMaterialCostAction,
  submitEstimateAction,
  updateTicketStatusAction,
  approveTicketAction,
  addTicketLogAction,
  dismissAdminMessageAction,
  cancelTicketAction,
  addTicketImagesAction,
  removeTicketImageAction,
  requestMaterialDispatchAction,
  cancelMaterialDispatchAction,
  registerReturnMaterialAction,
} from "../actions";
import EstimateCard from "./EstimateCard";


import { formatDateTime } from "@/lib/date";

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
  has_admin_message: boolean;
  images: TicketImage[];
  payment_status: string;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  customer: { name: string; phone: string; address: string | null } | null;
  assignee: { id: string; name: string } | null;
}

interface InventoryItemRow {
  id: string;
  category_id: string;
  spec_id: string;
  product_id: string;
  capacity: string | null;
  condition: string;
  quantity: number;
  base_estimate: number;
  category_name: string;
  spec_name: string;
  product_name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface GlobalSettingsData {
  base_service_cost: number;
  value_reference_amount: number;
  discount_surcharge_rate: number;
}

interface TicketMaterialRow {
  id: string;
  inventory_item_id: string;
  quantity: number;
  request_status: string;
  request_type: string;
  notes: string | null;
  category_id: string | null;
  category_name: string;
  spec_name: string;
  product_name: string;
  capacity: string | null;
  condition: string;
  base_estimate: number;
  is_return_registered: boolean;
  return_spec: string | null;
  return_name: string | null;
  return_condition: string | null;
  return_status: string | null;
  return_quantity: number;
  return_capacity: string | null;
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
  inventoryItems: InventoryItemRow[];
  inventoryCategories: CategoryOption[];
  globalSettings: GlobalSettingsData;
  ticketMaterials: TicketMaterialRow[];
}

const RECEIPT_LABEL: Record<string, string> = {
  WALK_IN: "내방",
  VISIT: "방문",
  QUICK: "퀵",
  PARCEL: "택배",
};

export default function TicketDetailForm({
  ticket,
  currentEmployee,
  technicians,
  logs,
  inventoryItems,
  inventoryCategories,
  globalSettings,
  ticketMaterials: initialMaterials,
}: TicketDetailFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [materials, setMaterials] = useState(initialMaterials);

  // 서버 데이터 재검증 시 props 변경을 동기화
  useEffect(() => {
    setMaterials(initialMaterials);
  }, [initialMaterials]);

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

  const canUpload =
    !isLocked &&
    (isAdmin ||
      isManager ||
      isReception ||
      ((isTechnician || isExpertRepair) && ticket.assignee?.id === currentEmployee.id));

  const canDeleteImage = isAdmin || isManager;

  // 이미지를 고객/직원으로 분리
  const customerImages = ticket.images.filter((img) => img.is_customer === true);
  const employeeImages = ticket.images.filter((img) => img.is_customer !== true);
  const totalImageCount = ticket.images.length;

  async function handleAction(action: (formData: FormData) => Promise<{ error: string } | undefined>, formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
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

      {/* 관리자 메시지 경고 배너 (TECHNICIAN/EXPERT_REPAIR에게만 표시) */}
      {ticket.has_admin_message && (isTechnician || isExpertRepair) && (
        <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-700">
            ⚠ 관리자가 남긴 메시지가 있습니다. 아래 작업 로그를 확인해 주세요.
          </p>
          <form action={(fd) => handleAction(dismissAdminMessageAction, fd)}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <button
              type="submit"
              disabled={isPending}
              className="whitespace-nowrap rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              메시지 확인 완료
            </button>
          </form>
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
            <dd className="mt-0.5 text-sm text-gray-900">{formatDateTime(ticket.created_at)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-gray-500">고장 증상</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{ticket.symptoms}</dd>
          </div>
          {/* 고객 업로드 이미지 (접수 정보 카드 내부) */}
          {customerImages.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500 mb-2">고객 첨부 사진</dt>
              <dd>
                <CustomerImageGallery
                  images={customerImages}
                  canDelete={canDeleteImage}
                  ticketId={ticket.id}
                />
              </dd>
            </div>
          )}
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
              disabled={isPending}
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

      {/* 수리 시작 · 견적 산출 카드 (ASSIGNED 상태, 상태변경 가능자) */}
      {canChangeStatus && ticket.status === "ASSIGNED" && (
        <EstimateCard
          ticketId={ticket.id}
          currentDeviceBrand={ticket.device_brand}
          currentDeviceModel={ticket.device_model}
          categories={inventoryCategories}
          inventoryItems={inventoryItems}
          globalSettings={globalSettings}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* 연관 이미지 (직원 업로드) — 담당기사/수리 시작 카드와 자재비 카드 사이 */}
      <EmployeeImageSection
        ticketId={ticket.id}
        employeeImages={employeeImages}
        totalImageCount={totalImageCount}
        canUpload={canUpload}
        canDelete={canDeleteImage}
        currentEmployee={currentEmployee}
      />



      {/* 자재비 추가 및 목록 (IN_PROGRESS 상태, 견적 수정 권한자) */}
      {canEditEstimate && ticket.status === "IN_PROGRESS" && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-gray-800">자재비 관리</h2>

          {/* ticket_materials 목록 (재고 자재) */}
          {materials.length > 0 && (
            <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-600">재고 자재</h3>
              <ul className="divide-y divide-gray-200 text-sm">
                {materials.map((m) => {
                  const label = [m.category_name, m.spec_name, m.product_name, m.capacity].filter(Boolean).join(" / ");
                  const subtotal = m.base_estimate * m.quantity;
                  const isPurchase = m.request_type === "purchase";
                  const isSoftware = m.category_name === "소프트웨어";
                  const canShowReturn = !isSoftware &&
                    (m.request_status === "approved" || m.request_status === "cancel_requested" || m.request_status === "cancelled");
                  return (
                    <li key={m.id} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-gray-700">{label}</span>
                          <span className="ml-2 text-xs text-gray-400">× {m.quantity}</span>
                          {isPurchase && (
                            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">구매</span>
                          )}
                          {m.notes && <span className="ml-2 text-xs text-gray-400">({m.notes})</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums font-medium text-gray-900 whitespace-nowrap">
                            {subtotal.toLocaleString()}원
                          </span>
                        {m.request_status === "pending" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              // Optimistic UI: 즉시 상태 변경
                              setMaterials((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, request_status: "requested" } : x))
                              );
                              startTransition(async () => {
                                setError(null);
                                const res = await requestMaterialDispatchAction(m.id);
                                if (res?.error) {
                                  // 실패 시 롤백
                                  setMaterials((prev) =>
                                    prev.map((x) => (x.id === m.id ? { ...x, request_status: "pending" } : x))
                                  );
                                  setError(res.error);
                                }
                              });
                            }}
                            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 ${
                              isPurchase
                                ? "bg-purple-600 hover:bg-purple-700"
                                : "bg-blue-600 hover:bg-blue-700"
                            }`}
                          >
                            {isPurchase ? "자재구매요청" : "자재출고요청"}
                          </button>
                        )}
                        {m.request_status === "requested" && (
                          <span className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ${
                            isPurchase
                              ? "bg-purple-100 text-purple-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}>
                            {isPurchase ? "구매요청중" : "출고요청중"}
                          </span>
                        )}
                        {m.request_status === "approved" && (
                          <>
                            <span className="whitespace-nowrap rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                              승인완료
                            </span>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                if (!confirm("출고 취소를 요청하시겠습니까? 관리자 반환 확인 후 재고가 복구됩니다.")) return;
                                setMaterials((prev) =>
                                  prev.map((x) => (x.id === m.id ? { ...x, request_status: "cancel_requested" } : x))
                                );
                                startTransition(async () => {
                                  setError(null);
                                  const res = await cancelMaterialDispatchAction(m.id);
                                  if (res?.error) {
                                    setMaterials((prev) =>
                                      prev.map((x) => (x.id === m.id ? { ...x, request_status: "approved" } : x))
                                    );
                                    setError(res.error);
                                  }
                                });
                              }}
                              className="whitespace-nowrap rounded-md bg-red-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              출고 취소
                            </button>
                          </>
                        )}
                        {m.request_status === "cancel_requested" && (
                          <span className="whitespace-nowrap rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            반환 대기중
                          </span>
                        )}
                        {m.request_status === "rejected" && (
                          <span className="whitespace-nowrap rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                            거부됨
                          </span>
                        )}
                        {m.request_status === "cancelled" && (
                          <span className="whitespace-nowrap rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                            취소됨
                          </span>
                        )}
                      </div>
                      </div>
                      {/* 반환 자재 등록 섹션 */}
                      {canShowReturn && !m.is_return_registered && (
                        <ReturnMaterialForm
                          materialId={m.id}
                          defaultCategoryId={m.category_id}
                          categories={inventoryCategories}
                          inventoryItems={inventoryItems}
                          onUpdate={(updated) => {
                            setMaterials((prev) => prev.map((x) => x.id === m.id ? { ...x, ...updated } : x));
                          }}
                          onError={setError}
                        />
                      )}
                      {m.is_return_registered && (
                        <div className="mt-1.5 rounded bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-700">
                          <span className="font-semibold">적출품 등록:</span> {m.return_spec} / {m.return_name}{m.return_capacity ? ` / ${m.return_capacity}` : ""} / {m.return_condition} × {m.return_quantity ?? 1}개
                          {m.return_status === "pending" && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 font-semibold">입고 대기</span>
                          )}
                          {m.return_status === "approved" && (
                            <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-green-700 font-semibold">입고 완료</span>
                          )}
                          {m.return_status === "rejected" && (
                            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700 font-semibold">입고 거부</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-gray-300 pt-2">
                <span className="text-sm font-semibold text-gray-700">자재 합계</span>
                <span className="tabular-nums text-sm font-bold text-gray-900">
                  {materials.reduce((s, m) => s + m.base_estimate * m.quantity, 0).toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* 수동 자재비 추가 폼 */}
          <form
            action={(fd) => handleAction(addMaterialCostAction, fd)}
            className="mb-4 flex items-end gap-3"
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div className="flex-1">
              <label htmlFor="mcDescription" className="mb-1 block text-sm font-medium text-gray-700">
                추가 비용 내용
              </label>
              <input
                id="mcDescription"
                name="description"
                type="text"
                required
                placeholder="예: 부품 수급비"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="w-36">
              <label htmlFor="mcAmount" className="mb-1 block text-sm font-medium text-gray-700">
                금액 (원)
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
              disabled={isPending}
              className="whitespace-nowrap rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              비용 추가
            </button>
          </form>

          {/* 수동 자재비 목록 */}
          {ticket.material_cost_details.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-600">수동 추가 비용</h3>
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

          {materials.length === 0 && ticket.material_cost_details.length === 0 && (
            <p className="text-sm text-gray-400">아직 추가된 자재비가 없습니다.</p>
          )}
        </section>
      )}

      {/* 고객 결제 & 승인 요청 (IN_PROGRESS 상태, 견적 수정 권한자) */}
      {canEditEstimate && ticket.status === "IN_PROGRESS" && (() => {
        // 적출품 미등록 실물 자재 확인
        const unregisteredPhysicalMaterials = materials.filter(
          (m) =>
            m.category_name !== "소프트웨어" &&
            !m.is_return_registered &&
            (m.request_status === "approved" || m.request_status === "cancel_requested" || m.request_status === "cancelled")
        );
        const hasUnregistered = unregisteredPhysicalMaterials.length > 0;

        return (
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-5">
          <h2 className="mb-4 text-base font-semibold text-orange-900">고객 결제 및 승인 요청</h2>

          {/* ⚠️ 적출품 미등록 경고 */}
          {hasUnregistered && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3">
              <p className="text-sm font-bold text-red-700">⚠️ 적출품 등록안됨</p>
              <p className="mt-1 text-xs text-red-600">
                출고된 실물 자재 중 {unregisteredPhysicalMaterials.length}건의 적출품이 아직 등록되지 않았습니다.
                결제 요청 전에 먼저 적출품 등록을 완료해 주세요.
              </p>
            </div>
          )}

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
              if (hasUnregistered) {
                if (!window.confirm(`⚠️ 적출품이 ${unregisteredPhysicalMaterials.length}건 미등록 상태입니다.\n그래도 승인 요청을 진행하시겠습니까?`)) return;
              }
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
                disabled={isPending}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                승인 요청
              </button>
            </div>
          </form>
        </section>
        );
      })()}

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
              disabled={isPending}
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
          className="space-y-3"
        >
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
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
          <div className="flex items-center justify-between">
            {(isAdmin || isManager || isReception) && (
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  name="notifyAssignee"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                담당자 대시보드에 알림 띄우기
              </label>
            )}
            {!(isAdmin || isManager || isReception) && <div />}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              등록
            </button>
          </div>
        </form>
      </section>

      {/* 접수 취소 */}
      {ticket.status !== "COMPLETED" && ticket.status !== "CANCELED" && (
        <section className="flex justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const msg =
                ticket.status === "IN_PROGRESS"
                  ? "주의: 진행 중인 건의 취소입니다. 사용된 자재 및 경비에 주의해주세요. 취소 하시겠습니까?"
                  : "정말 이 접수건을 취소하시겠습니까?";
              if (!confirm(msg)) return;
              const fd = new FormData();
              fd.set("ticketId", ticket.id);
              handleAction(cancelTicketAction, fd);
            }}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
          >
            접수 취소
          </button>
        </section>
      )}

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
                  <time>{formatDateTime(log.created_at)}</time>
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

// ─── 적출/반환 자재 등록 폼 (카테고리별 상품 리스트 드롭다운) ───

function ReturnMaterialForm({
  materialId,
  defaultCategoryId,
  categories,
  inventoryItems,
  onUpdate,
  onError,
}: {
  materialId: string;
  defaultCategoryId: string | null;
  categories: CategoryOption[];
  inventoryItems: InventoryItemRow[];
  onUpdate: (fields: { is_return_registered: boolean; return_spec: string; return_name: string; return_condition: string; return_status: string; return_quantity: number }) => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(defaultCategoryId ?? "");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [condition, setCondition] = useState<"중고품" | "불량품">("중고품");
  const [returnQty, setReturnQty] = useState(1);
  const [isPending, startTransition] = useTransition();

  // 선택된 카테고리에 해당하는 재고 아이템 목록
  const filteredItems = inventoryItems.filter((i) => i.category_id === selectedCategoryId);

  const selectedItem = inventoryItems.find((i) => i.id === selectedItemId);

  function itemLabel(item: InventoryItemRow) {
    const parts = [item.spec_name, item.product_name];
    if (item.capacity) parts.push(item.capacity);
    parts.push(`(${item.condition === "NEW" ? "신품" : "중고"})`);
    parts.push(`— ${item.base_estimate.toLocaleString()}원`);
    parts.push(`[재고: ${item.quantity}]`);
    return parts.join(" ");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        + 적출품 등록
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <p className="mb-2 text-xs font-semibold text-indigo-700">적출/반환 자재 등록</p>
      <div className="space-y-2">
        {/* 카테고리 선택 */}
        <div>
          <label className="mb-0.5 block text-[11px] text-gray-500">카테고리</label>
          <select
            value={selectedCategoryId}
            onChange={(e) => {
              setSelectedCategoryId(e.target.value);
              setSelectedItemId("");
            }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="">선택</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {/* 상품 선택 (카테고리 하위 전체 리스트) */}
        {selectedCategoryId && (
          <div>
            <label className="mb-0.5 block text-[11px] text-gray-500">상품</label>
            {filteredItems.length === 0 ? (
              <p className="text-xs text-gray-400">해당 카테고리에 등록된 재고가 없습니다.</p>
            ) : (
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
              >
                <option value="">선택</option>
                {filteredItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {itemLabel(item)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {/* 상태 및 수량 선택 */}
        <div className="flex items-end gap-2">
          <div className="w-28">
            <label className="mb-0.5 block text-[11px] text-gray-500">상태</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as "중고품" | "불량품")}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
            >
              <option value="중고품">중고품</option>
              <option value="불량품">불량품</option>
            </select>
          </div>
          <div className="w-20">
            <label className="mb-0.5 block text-[11px] text-gray-500">수량</label>
            <input
              type="number"
              min={1}
              value={returnQty}
              onChange={(e) => setReturnQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded border border-gray-300 px-2 py-1 text-center text-xs tabular-nums focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={isPending || !selectedItem}
            onClick={() => {
              if (!selectedItem) return;
              startTransition(async () => {
                onError(null);
                const res = await registerReturnMaterialAction(
                  materialId, selectedCategoryId, selectedItem.spec_name, selectedItem.product_name, condition, returnQty, selectedItem.capacity ?? null
                );
                if (res?.error) {
                  onError(res.error);
                } else {
                  onUpdate({
                    is_return_registered: true,
                    return_spec: selectedItem.spec_name,
                    return_name: selectedItem.product_name,
                    return_condition: condition,
                    return_status: "pending",
                    return_quantity: returnQty,
                  });
                  setOpen(false);
                }
              });
            }}
            className="whitespace-nowrap rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            반환 등록
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="whitespace-nowrap rounded bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-300"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 고객 이미지 갤러리 (접수 정보 카드 내부) ───

function CustomerImageGallery({
  images,
  canDelete,
  ticketId,
}: {
  images: TicketImage[];
  canDelete: boolean;
  ticketId: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function handleDelete(path: string) {
    if (!confirm("이 이미지를 삭제하시겠습니까?")) return;
    await removeTicketImageAction(ticketId, path);
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {images.map((img, i) => (
          <div key={img.path} className="group relative">
            <button
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="block w-full"
            >
              <img
                src={img.url}
                alt={img.description || `고객 이미지 ${i + 1}`}
                className="h-20 w-full rounded-lg border border-gray-200 object-cover transition-transform hover:scale-105"
              />
            </button>
            {img.description && (
              <p className="mt-0.5 truncate text-[10px] text-gray-400">{img.description}</p>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => handleDelete(img.path)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </>
  );
}

// ─── 직원 이미지 섹션 (연관 이미지 카드) ───

function EmployeeImageSection({
  ticketId,
  employeeImages,
  totalImageCount,
  canUpload,
  canDelete,
  currentEmployee,
}: {
  ticketId: string;
  employeeImages: TicketImage[];
  totalImageCount: number;
  canUpload: boolean;
  canDelete: boolean;
  currentEmployee: { id: string; name: string };
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const remaining = MAX_IMAGES_PER_TICKET - totalImageCount;

  const handleUpload = useCallback(async (file: File, description: string) => {
    setUploading(true);
    setUploadError(null);

    const { uploaded, error } = await compressAndUploadSingle(ticketId, file, totalImageCount, {
      description,
      uploaded_by: currentEmployee.id,
      uploader_name: currentEmployee.name,
      is_customer: false,
    });

    if (error) {
      setUploadError(error);
      setUploading(false);
      return;
    }

    if (uploaded) {
      const result = await addTicketImagesAction(ticketId, [uploaded]);
      if (result?.error) {
        setUploadError(result.error);
      }
    }
    setUploading(false);
  }, [ticketId, totalImageCount, currentEmployee]);

  async function handleDelete(path: string) {
    if (!confirm("이 이미지를 삭제하시겠습니까?")) return;
    const result = await removeTicketImageAction(ticketId, path);
    if (result?.error) {
      setUploadError(result.error);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-base font-semibold text-gray-800">
        연관 이미지 ({employeeImages.length}장 · 전체 {totalImageCount}/{MAX_IMAGES_PER_TICKET})
      </h2>

      {/* 업로드 영역 */}
      {canUpload && remaining > 0 && (
        <div className="mb-4">
          <ImageUploader
            onUpload={handleUpload}
            disabled={remaining <= 0}
            uploading={uploading}
            label={`이미지 추가 (남은 ${remaining}장)`}
          />
        </div>
      )}

      {uploadError && (
        <p className="mb-3 text-xs text-red-500">{uploadError}</p>
      )}

      {/* 직원 업로드 이미지 갤러리 */}
      {employeeImages.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {employeeImages.map((img, i) => (
            <div key={img.path} className="group relative">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block w-full"
              >
                <img
                  src={img.url}
                  alt={img.description || `직원 이미지 ${i + 1}`}
                  className="h-24 w-full rounded-lg border border-gray-200 object-cover transition-transform hover:scale-105"
                />
              </button>
              <div className="mt-1 space-y-0.5">
                {img.description && (
                  <p className="truncate text-[11px] text-gray-600">{img.description}</p>
                )}
                <p className="text-[10px] text-gray-400">
                  {img.uploader_name ?? "직원"}
                </p>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(img.path)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">등록된 연관 이미지가 없습니다.</p>
      )}

      {/* 라이트박스 */}
      {lightboxIndex !== null && (
        <Lightbox
          images={employeeImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </section>
  );
}
