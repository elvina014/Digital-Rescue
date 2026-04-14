"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RoleBadge } from "@/components/common/RoleBadge";
import { CreateEmployeeModal } from "./CreateEmployeeModal";
import { EditEmployeeModal } from "./EditEmployeeModal";
import type { EmployeeRole } from "@/types";

interface EmployeeRow {
  id: string;
  name: string;
  role: EmployeeRole;
  phone: string | null;
  created_at: string;
}

interface EmployeeListClientProps {
  employees: EmployeeRow[];
}

export function EmployeeListClient({ employees }: EmployeeListClientProps) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [showToast, setShowToast] = useState(false);
  const router = useRouter();

  const handleUpdated = () => {
    setEditTarget(null);
    setShowToast(true);
    router.refresh();
    setTimeout(() => setShowToast(false), 4000);
  };

  return (
    <>
      {/* 성공 토스트 */}
      {showToast && (
        <div className="fixed right-4 top-4 z-50 animate-slide-in">
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-white px-5 py-4 shadow-xl shadow-green-100/50">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
              <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">수정 완료</p>
              <p className="mt-0.5 text-sm text-slate-500">직원 정보가 수정되었습니다.</p>
            </div>
            <button type="button" onClick={() => setShowToast(false)} className="ml-4 text-slate-400 hover:text-slate-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {employees.length}명
          </p>
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
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th className="px-5 py-3 font-semibold text-gray-600">이름</th>
              <th className="px-5 py-3 font-semibold text-gray-600">직급</th>
              <th className="px-5 py-3 font-semibold text-gray-600">연락처</th>
              <th className="px-5 py-3 font-semibold text-gray-600">등록일</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-gray-400"
                >
                  등록된 직원이 없습니다.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50"
                >
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {emp.name}
                  </td>
                  <td className="px-5 py-3">
                    <RoleBadge role={emp.role} />
                  </td>
                  <td className="px-5 py-3 text-gray-600">
                    {emp.phone || "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(emp.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditTarget(emp)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      수정
                    </button>
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
