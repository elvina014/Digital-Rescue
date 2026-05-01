"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateEmployeeAction,
  type EmployeeFormState,
} from "@/app/actions/employeeActions";
import { EmployeeRole } from "@/types";

const ROLES: { value: EmployeeRole; label: string }[] = [
  { value: EmployeeRole.ADMIN, label: "관리자" },
  { value: EmployeeRole.MANAGER, label: "팀장" },
  { value: EmployeeRole.RECEPTION, label: "접수처" },
  { value: EmployeeRole.TECHNICIAN, label: "담당기사" },
  { value: EmployeeRole.EXPERT_REPAIR, label: "정밀수리팀" },
  { value: EmployeeRole.CS, label: "고객서비스" },
];

const initialState: EmployeeFormState = {
  success: false,
  message: "",
};

interface EditEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  employee: {
    id: string;
    name: string;
    role: EmployeeRole;
    phone: string | null;
    email: string;
  };
}

export function EditEmployeeModal({
  open,
  onClose,
  onUpdated,
  employee,
}: EditEmployeeModalProps) {
  const [state, formAction, isPending] = useActionState(
    updateEmployeeAction,
    initialState
  );
  const [formKey, setFormKey] = useState(0);

  // 모달이 열릴 때 formKey를 갱신하여 defaultValue 반영
  useEffect(() => {
    if (open) {
      setFormKey((k) => k + 1);
    }
  }, [open, employee.id]);

  useEffect(() => {
    if (state.success) {
      onUpdated();
    } else if (state.message) {
      setFormKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) return null;

  const values = state.values ?? {
    name: employee.name,
    phone: employee.phone ?? "",
    role: employee.role,
    email: employee.email,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">직원 정보 수정</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!state.success && state.message && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.message}
          </div>
        )}

        <form key={formKey} action={formAction} className="space-y-4">
          <input type="hidden" name="employeeId" value={employee.id} />

          {/* 이메일 */}
          <div>
            <label htmlFor="edit-email" className="mb-1 block text-sm font-medium text-gray-700">
              이메일 <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-email"
              name="email"
              type="email"
              required
              defaultValue={values.email}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {state.errors?.email && (
              <p className="mt-1 text-xs text-red-500">{state.errors.email}</p>
            )}
          </div>

          {/* 이름 */}
          <div>
            <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-gray-700">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-name"
              name="name"
              type="text"
              required
              defaultValue={values.name}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {state.errors?.name && (
              <p className="mt-1 text-xs text-red-500">{state.errors.name}</p>
            )}
          </div>

          {/* 연락처 */}
          <div>
            <label htmlFor="edit-phone" className="mb-1 block text-sm font-medium text-gray-700">
              연락처
            </label>
            <input
              id="edit-phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              placeholder="010-1234-5678"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* 직급 */}
          <div>
            <label htmlFor="edit-role" className="mb-1 block text-sm font-medium text-gray-700">
              직급 <span className="text-red-500">*</span>
            </label>
            <select
              id="edit-role"
              name="role"
              required
              defaultValue={values.role}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {state.errors?.role && (
              <p className="mt-1 text-xs text-red-500">{state.errors.role}</p>
            )}
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isPending ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
