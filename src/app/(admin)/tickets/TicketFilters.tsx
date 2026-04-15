"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { TicketStatus } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  [TicketStatus.NEW]: "신규 접수",
  [TicketStatus.ASSIGNED]: "배정 완료",
  [TicketStatus.IN_PROGRESS]: "수리 진행 중",
  [TicketStatus.WAITING_APPROVAL]: "승인 대기",
  [TicketStatus.COMPLETED]: "완료",
  [TicketStatus.CANCELED]: "취소",
};

interface Technician {
  id: string;
  name: string;
}

export default function TicketFilters({
  technicians,
}: {
  technicians: Technician[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/tickets?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
      {/* 검색 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">고객 검색</label>
        <input
          type="text"
          placeholder="이름 또는 연락처"
          className="w-48 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParams("search", searchInput.trim());
          }}
          onBlur={() => updateParams("search", searchInput.trim())}
        />
      </div>

      {/* 상태 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">상태</label>
        <select
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => updateParams("status", e.target.value)}
        >
          <option value="">전체</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* 시작일 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">시작일</label>
        <input
          type="date"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={searchParams.get("startDate") ?? ""}
          onChange={(e) => updateParams("startDate", e.target.value)}
        />
      </div>

      {/* 종료일 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">종료일</label>
        <input
          type="date"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={searchParams.get("endDate") ?? ""}
          onChange={(e) => updateParams("endDate", e.target.value)}
        />
      </div>

      {/* 담당기사 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">담당기사</label>
        <select
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          value={searchParams.get("assignee") ?? ""}
          onChange={(e) => updateParams("assignee", e.target.value)}
        >
          <option value="">전체</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* 초기화 */}
      <button
        type="button"
        className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
        onClick={() => router.push("/tickets")}
      >
        초기화
      </button>
    </div>
  );
}
