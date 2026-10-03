"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeLabelCode } from "@/app/(admin)/labels/shared";

/** 라벨 코드 입력 (키보드 또는 USB 스캐너 — QR의 URL 전체가 입력돼도 처리) */
export default function ScanForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeLabelCode(value);
    if (!code) {
      setError("라벨 코드를 입력해 주세요.");
      return;
    }
    setError(null);
    router.push(`/scan/${encodeURIComponent(code)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-start gap-2">
      <div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="예: P-00012, D-0003"
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase focus:border-blue-500 focus:outline-none"
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        조회
      </button>
    </form>
  );
}
