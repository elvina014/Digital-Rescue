"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RoleBadge } from "@/components/common/RoleBadge";
import { CreateEmployeeModal } from "./CreateEmployeeModal";
import { EditEmployeeModal } from "./EditEmployeeModal";
import { resetEmployeePasswordAction } from "@/app/actions/employeeActions";
import type { EmployeeRole } from "@/types";

interface EmployeeRow {
  id: string;
  name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string;
  created_at: string;
}

interface EmployeeListClientProps {
  employees: EmployeeRow[];
}

type ToastType = "success" | "error" | "password";

interface ToastState {
  type: ToastType;
  title: string;
  message: string;
}

export function EmployeeListClient({ employees }: EmployeeListClientProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ name: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function showToast(state: ToastState) {
    setToast(state);
    if (state.type !== "password") {
      setTimeout(() => setToast(null), 4000);
    }
  }

  const handleUpdated = () => {
    setEditTarget(null);
    showToast({ type: "success", title: "수정 완료", message: "직원 정보가 수정되었습니다." });
    router.refresh();
  };

  function handleResetPassword(emp: EmployeeRow) {
    if (
      !window.confirm(
        `[${emp.name}] 직원의 비밀번호를 초기화하시겠습니까?\n\n임시 비밀번호가 발급되며, 해당 직원에게 전달 후 변경을 안내해 주세요.`
      )
    ) return;

    startTransition(async () => {
      const result = await resetEmployeePasswordAction(emp.id);
      if (result.success && result.tempPassword) {
        setTempPasswordModal({ name: emp.name, password: result.tempPassword });
      } else {
        showToast({ type: "error", title: "초기화 실패", message: result.message });
      }
    });
  }

  return (
    <>
      {/* 성공/오류 토스트 */}
      {toast && toast.type !== "password" && (
        <div className="fixed right-4 top-4 z-50 animate-slide-in">
          <div
            className={`flex items-start gap-3 rounded-xl border bg-white px-5 py-4 shadow-xl ${
              toast.type === "success"
                ? "border-green-200 shadow-green-100/50"
                : "border-red-200 shadow-red-100/50"
            }`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                toast.type === "success" ? "bg-green-100" : "bg-red-100"
              }`}
            >
              {toast.type === "success" ? (
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
              <p className="mt-0.5 text-sm text-slate-500">{toast.message}</p>
            </div>
            <button type="button" onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 임시 비밀번호 모달 */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTempPasswordModal(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-base font-bold text-gray-900">임시 비밀번호 발급 완료</h3>
            <p className="mb-4 text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{tempPasswordModal.name}</span> 직원의 임시 비밀번호입니다.
              직원에게 전달 후 마이페이지에서 변경하도록 안내해 주세요.
            </p>
            <div className="mb-5 flex items-center justify-between rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-3">
              <span className="font-mono text-xl font-bold tracking-widest text-blue-800">
                {tempPasswordModal.password}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(tempPasswordModal.password);
                  showToast({ type: "success", title: "복사 완료", message: "임시 비밀번호가 클립보드에 복사되었습니다." });
                }}
                className="ml-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                복사
              </button>
            </div>
            <button
              type="button"
              onClick={() => setTempPasswordModal(null)}
              className="w-full rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
          <p className="mt-1 text-sm text-gray-500">총 {employees.length}명</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          + 직원 추가
        </button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="px-5 py-3 font-semibold text-gray-600">이름</th>
              <th className="px-5 py-3 font-semibold text-gray-600">직급</th>
              <th className="px-5 py-3 font-semibold text-gray-600">이메일</th>
              <th className="px-5 py-3 font-semibold text-gray-600">연락처</th>
              <th className="px-5 py-3 font-semibold text-gray-600">등록일</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  등록된 직원이 없습니다.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50"
                >
                  <td className="px-5 py-3 font-medium text-gray-900">{emp.name}</td>
                  <td className="px-5 py-3">
                    <RoleBadge role={emp.role} />
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {emp.email || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{emp.phone || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(emp.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditTarget(emp)}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleResetPassword(emp)}
                        className="rounded-md border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                      >
                        비밀번호 초기화
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 등록 모달 */}
      <CreateEmployeeModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => {
          setCreateModalOpen(false);
          router.refresh();
        }}
      />

      {/* 수정 모달 */}
      {editTarget && (
        <EditEmployeeModal
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={handleUpdated}
          employee={editTarget}
        />
      )}
    </>
  );
}
