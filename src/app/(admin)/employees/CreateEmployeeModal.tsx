"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createEmployeeAction,
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

interface CreateEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateEmployeeModal({
  open,
  onClose,
  onCreated,
}: CreateEmployeeModalProps) {
  const [state, formAction, isPending] = useActionState(
    createEmployeeAction,
    initialState
  );
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (state.success) {
      setFormKey((k) => k + 1);
      onCreated();
    } else if (state.message) {
      setFormKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* modal */}
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            직원 등록
          </h2>
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

        {/* 성공/에러 메시지 */}
        {state.message && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              state.success
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </div>
        )}

        <form key={formKey} action={formAction} className="space-y-4">
          {/* 이메일 */}
          <div>
            <label htmlFor="emp-email" className="mb-1 block text-sm font-medium text-gray-700">
              이메일 <span className="text-red-500">*</span>
            </label>
            <input
              id="emp-email"
              name="email"
              type="email"
              required
              defaultValue={state.values?.email}
              placeholder="employee@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {state.errors?.email && (
              <p className="mt-1 text-xs text-red-500">{state.errors.email}</p>
            )}
          </div>

          {/* 임시 비밀번호 */}
          <div>
            <label htmlFor="emp-password" className="mb-1 block text-sm font-medium text-gray-700">
              임시 비밀번호 <span className="text-red-500">*</span>
            </label>
            <input
              id="emp-password"
              name="password"
              type="password"
              required
              minLength={6}
              defaultValue={state.values?.password}
              placeholder="6자 이상"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {state.errors?.password && (
              <p className="mt-1 text-xs text-red-500">{state.errors.password}</p>
            )}
          </div>

          {/* 이름 */}
          <div>
            <label htmlFor="emp-name" className="mb-1 block text-sm font-medium text-gray-700">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="emp-name"
              name="name"
              type="text"
              required
              defaultValue={state.values?.name}
              placeholder="홍길동"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {state.errors?.name && (
              <p className="mt-1 text-xs text-red-500">{state.errors.name}</p>
            )}
          </div>

          {/* 연락처 */}
          <div>
            <label htmlFor="emp-phone" className="mb-1 block text-sm font-medium text-gray-700">
              연락처
            </label>
            <input
              id="emp-phone"
              name="phone"
              type="tel"
              defaultValue={state.values?.phone}
              placeholder="010-1234-5678"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* 직급 */}
          <div>
            <label htmlFor="emp-role" className="mb-1 block text-sm font-medium text-gray-700">
              직급 <span className="text-red-500">*</span>
            </label>
            <select
              id="emp-role"
              name="role"
              required
              defaultValue={state.values?.role ?? ""}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="" disabled>
                선택
              </option>
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
              {isPending ? "등록 중..." : "직원 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
