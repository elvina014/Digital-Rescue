"use client";

import { useActionState, useEffect, useState } from "react";
import { updateMyProfileAction, type EmployeeFormState } from "@/app/actions/employeeActions";
import type { EmployeeRole } from "@/types";

const ROLE_LABEL: Record<EmployeeRole, string> = {
  ADMIN: "관리자",
  MANAGER: "팀장",
  RECEPTION: "접수처",
  TECHNICIAN: "담당기사",
  EXPERT_REPAIR: "정밀수리팀",
  CS: "고객서비스",
};

const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/;

const initialState: EmployeeFormState = { success: false, message: "" };

interface MyPageModalProps {
  open: boolean;
  onClose: () => void;
  employee: {
    id: string;
    name: string;
    role: EmployeeRole;
    phone: string | null;
    email: string;
  };
}

export function MyPageModal({ open, onClose, employee }: MyPageModalProps) {
  const [state, formAction, isPending] = useActionState(updateMyProfileAction, initialState);
  const [formKey, setFormKey] = useState(0);
  const [showPwSection, setShowPwSection] = useState(false);

  // 비밀번호 클라이언트 검증
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  // 성공 시 모달 닫기 (약간 딜레이로 메시지 확인 가능)
  useEffect(() => {
    if (state.success) {
      const t = setTimeout(onClose, 1200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  // 모달 열릴 때 폼 초기화
  useEffect(() => {
    if (open) {
      setFormKey((k) => k + 1);
      setShowPwSection(false);
      setNewPw("");
      setConfirmPw("");
      setPwError(null);
    }
  }, [open]);

  if (!open) return null;

  function validatePw(): boolean {
    if (!showPwSection) return true;
    if (!newPw) {
      setPwError("새 비밀번호를 입력해 주세요.");
      return false;
    }
    if (!PASSWORD_REGEX.test(newPw)) {
      setPwError("영문+숫자 조합 8자 이상이어야 합니다.");
      return false;
    }
    if (newPw !== confirmPw) {
      setPwError("비밀번호가 일치하지 않습니다.");
      return false;
    }
    setPwError(null);
    return true;
  }

  const values = state.values ?? { name: employee.name, phone: employee.phone ?? "" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        {/* 헤더 */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">내 정보</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 서버 응답 메시지 */}
        {state.message && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              state.success
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </div>
        )}

        <form
          key={formKey}
          action={(fd) => {
            if (!validatePw()) return;
            // 비밀번호 섹션이 닫혀있거나 값이 없으면 빈 문자열 전송 (서버에서 스킵)
            if (!showPwSection) {
              fd.set("newPassword", "");
              fd.set("confirmPassword", "");
            }
            formAction(fd);
          }}
          className="space-y-4"
        >
          {/* 이메일 (수정 불가) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">이메일</label>
            <input
              type="email"
              value={employee.email}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* 직급 (수정 불가) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">직급</label>
            <input
              type="text"
              value={ROLE_LABEL[employee.role] ?? employee.role}
              readOnly
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* 이름 */}
          <div>
            <label htmlFor="my-name" className="mb-1 block text-sm font-medium text-gray-700">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="my-name"
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
            <label htmlFor="my-phone" className="mb-1 block text-sm font-medium text-gray-700">
              연락처
            </label>
            <input
              id="my-phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              placeholder="010-1234-5678"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* 비밀번호 변경 섹션 토글 */}
          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setShowPwSection((v) => !v);
                setNewPw("");
                setConfirmPw("");
                setPwError(null);
              }}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              {showPwSection ? "▲ 비밀번호 변경 취소" : "▼ 비밀번호 변경"}
            </button>
          </div>

          {showPwSection && (
            <div className="space-y-3 rounded-lg bg-blue-50 p-4">
              <p className="text-xs text-blue-700">영문 + 숫자 조합 8자 이상이어야 합니다.</p>

              {/* 새 비밀번호 */}
              <div>
                <label htmlFor="my-newPw" className="mb-1 block text-sm font-medium text-gray-700">
                  새 비밀번호 <span className="text-red-500">*</span>
                </label>
                <input
                  id="my-newPw"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => { setNewPw(e.target.value); setPwError(null); }}
                  placeholder="영문+숫자 8자 이상"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              {/* 비밀번호 확인 */}
              <div>
                <label htmlFor="my-confirmPw" className="mb-1 block text-sm font-medium text-gray-700">
                  새 비밀번호 확인 <span className="text-red-500">*</span>
                </label>
                <input
                  id="my-confirmPw"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPw}
                  onChange={(e) => { setConfirmPw(e.target.value); setPwError(null); }}
                  placeholder="비밀번호 재입력"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            </div>
          )}

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
