"use client";

import { useState, useTransition } from "react";
import { updateRepairGateFlags } from "@/app/actions/inventoryActions";

interface Props {
  approvalEnabled: boolean;
  cancelEnabled: boolean;
}

/** 수리 기록 필수 확인(게이트) 켜기/끄기 — 관리자 전용. 먼저 화면을 바꾸고 실패하면 되돌린다 */
export default function RepairGateSettingsCard({ approvalEnabled, cancelEnabled }: Props) {
  const [flags, setFlags] = useState({ approvalEnabled, cancelEnabled });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(key: keyof typeof flags) {
    const previous = flags;
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    startTransition(async () => {
      setError(null);
      const res = await updateRepairGateFlags(next);
      if (res && "error" in res && res.error) {
        setFlags(previous);
        setError("설정을 저장하지 못했습니다: " + res.error);
      }
    });
  }

  const rows = [
    {
      key: "approvalEnabled" as const,
      title: "최종 승인 시 수리 기록 필수",
      desc: "진단 요약 · 결과 · 증상 · 조치 내역 · 적출 부품 확인이 없으면 최종 승인을 막습니다.",
    },
    {
      key: "cancelEnabled" as const,
      title: "접수 취소 시 취소 구분 필수",
      desc: "수리불가 / 고객포기 / 단순취소 선택을 요구하고, 입고된 기기는 적출 부품 처리까지 확인합니다.",
    },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-800">수리 기록 필수 확인</h2>
      <p className="mt-1 text-xs text-gray-500">
        직원 교육 후에 켜 주세요. 꺼져 있으면 승인·취소는 기존과 동일하게 동작합니다. 관리자는 사유를 입력해 강제 진행할 수 있으며 이력이 남습니다.
      </p>
      <ul className="mt-4 divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{r.title}</p>
              <p className="text-xs text-gray-500">{r.desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={flags[r.key]}
              aria-label={r.title}
              disabled={isPending}
              onClick={() => toggle(r.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                flags[r.key] ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {flags[r.key] ? "켜짐" : "꺼짐"}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
