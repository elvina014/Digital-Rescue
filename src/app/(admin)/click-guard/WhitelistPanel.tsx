"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/date";
import { addWhitelistAction, deleteWhitelistAction } from "./actions";
import type { WhitelistRow } from "./shared";

const NETWORK_ERROR = "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

// 화면 입력 1차 검사 (최종 검사는 서버 액션·DB)
const CIDR_INPUT_RE = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:.]*:[0-9a-f:.]*)(\/\d{1,3})?$/i;

/** 화이트리스트 탭: 사무실·직원 IP 등을 의심 IP 집계에서 제외 */
export default function WhitelistPanel({
  rows,
  onToast,
}: {
  rows: WhitelistRow[];
  onToast: (type: "success" | "error", message: string) => void;
}) {
  const [cidr, setCidr] = useState("");
  const [reason, setReason] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, startAdd] = useTransition();
  const [, startDelete] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = cidr.trim();
    if (!CIDR_INPUT_RE.test(value)) {
      setInputError("IP 또는 대역 형식이 올바르지 않습니다. 예: 203.0.113.7 또는 203.0.113.0/24");
      return;
    }
    setInputError(null);
    startAdd(async () => {
      const res = await addWhitelistAction(value, reason.trim()).catch(() => ({ error: NETWORK_ERROR, data: undefined }));
      if (res.error) {
        setInputError(res.error);
        onToast("error", res.error);
        return;
      }
      setCidr("");
      setReason("");
      onToast("success", `${res.data?.cidr ?? value}를 화이트리스트에 추가했습니다.`);
    });
  }

  function remove(row: WhitelistRow) {
    if (!window.confirm(`${row.cidr}를 화이트리스트에서 삭제할까요? 이후 다시 의심 IP 집계에 포함됩니다.`)) return;
    setRemoved((s) => new Set(s).add(row.id));
    setBusyId(row.id);
    startDelete(async () => {
      const res = await deleteWhitelistAction(row.id).catch(() => ({ error: NETWORK_ERROR }));
      setBusyId(null);
      if (res.error) {
        setRemoved((s) => {
          const next = new Set(s);
          next.delete(row.id);
          return next;
        });
        onToast("error", res.error);
        return;
      }
      onToast("success", `${row.cidr}를 삭제했습니다.`);
    });
  }

  const visible = rows.filter((r) => !removed.has(r.id));

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">화이트리스트 추가</h2>
        <p className="mt-1 text-sm text-gray-500">
          여기에 넣은 IP·대역의 광고 방문은 의심 IP 점수 계산에서 빠집니다. 단일 IP는 그대로, 대역은 203.0.113.0/24처럼 입력합니다.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-2">
          <div>
            <input
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              placeholder="203.0.113.7 또는 203.0.113.0/24"
              aria-label="IP 또는 대역"
              className="w-64 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
            />
            {inputError && <p className="mt-1 text-xs text-red-600">{inputError}</p>}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="사유 (예: 사무실 IP)"
            aria-label="사유"
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || !cidr.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? "추가 중..." : "추가"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border bg-white shadow-sm">
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">등록된 화이트리스트가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="px-4 py-2 font-medium">IP / 대역</th>
                <th className="px-4 py-2 font-medium">사유</th>
                <th className="px-4 py-2 font-medium">등록 시각</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-mono">{r.cidr}</td>
                  <td className="px-4 py-2 text-gray-600">{r.reason ?? "-"}</td>
                  <td className="px-4 py-2 tabular-nums text-gray-600">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={busyId === r.id}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
