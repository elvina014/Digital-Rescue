"use client";

import { useEffect, useState } from "react";
import type { NaverBlockStatus } from "@/lib/naver-sa/core";
import { getNaverBlockStatusAction } from "./naverActions";
import { isSharedIpRisk, type SuspectIp } from "./shared";

/**
 * 네이버 광고노출 제한 등록/해제/현황 창 (docs/click-guard/NAVER-API.md).
 * 외부 시스템(네이버) 결과가 확정돼야 하므로 낙관적 UI를 쓰지 않는다: 처리 중에는 버튼을 막고, 서버 응답 후 부모가 반영한다.
 */

const NETWORK_ERROR = "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type StatusState = { loading: true } | { loading: false; status?: NaverBlockStatus; error?: string };

/** 네이버 목록 현황을 한 번 불러온다. quiet=true 면 감사 로그를 남기지 않는다 */
function useNaverStatus(quiet: boolean): StatusState {
  const [state, setState] = useState<StatusState>({ loading: true });
  useEffect(() => {
    let alive = true;
    getNaverBlockStatusAction(quiet)
      .catch(() => ({ error: NETWORK_ERROR, data: undefined }))
      .then((res) => {
        if (alive) setState({ loading: false, status: res.data, error: res.error });
      });
    return () => {
      alive = false;
    };
  }, [quiet]);
  return state;
}

function Shell({ title, onClose, busy, children }: { title: string; onClose: () => void; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={busy ? undefined : onClose}>
      <div className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function SlotUsage({ state }: { state: StatusState }) {
  if (state.loading) return <p className="text-sm text-gray-400">네이버 등록 현황을 확인하는 중…</p>;
  if (!state.status) return <p className="text-sm text-red-600">현재 사용량을 확인하지 못했습니다. {state.error}</p>;
  const { total, limit, erpLimit } = state.status;
  const full = total >= erpLimit;
  return (
    <p className={`text-sm ${full ? "font-medium text-red-700" : "text-gray-700"}`}>
      현재 네이버 등록 <span className="font-semibold tabular-nums">{total.toLocaleString()}</span> / {limit}개
      <span className="text-gray-400"> (ERP 등록 상한 {erpLimit}개)</span>
      {full && " — 슬롯이 부족해 등록할 수 없습니다."}
    </p>
  );
}

export function RegisterNaverDialog({
  row,
  busy,
  onClose,
  onConfirm,
}: {
  row: SuspectIp;
  busy: boolean;
  onClose: () => void;
  onConfirm: (memo: string) => void;
}) {
  const [memo, setMemo] = useState("");
  const usage = useNaverStatus(true);
  const slotFull = !usage.loading && !!usage.status && usage.status.total >= usage.status.erpLimit;

  return (
    <Shell title="네이버에 차단 등록" onClose={onClose} busy={busy}>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-3">
          <dt className="w-12 shrink-0 text-gray-500">IP</dt>
          <dd className="font-mono text-gray-900">{row.client_ip}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-12 shrink-0 text-gray-500">점수</dt>
          <dd className="font-semibold tabular-nums text-gray-900">{row.score}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-12 shrink-0 text-gray-500">사유</dt>
          <dd className="text-gray-800">{row.reasons.map((r) => `${r.label} ${r.value}`).join(", ") || "-"}</dd>
        </div>
      </dl>

      <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
        네이버 검색광고의 광고노출 제한에 이 IP를 바로 등록합니다. 등록하면 이 IP에는 광고가 보이지 않습니다.
      </p>
      {isSharedIpRisk(row) && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
          모바일/공용 IP일 수 있어 일반 고객도 차단될 수 있습니다.
        </p>
      )}

      <div className="mt-3 rounded-lg border border-gray-200 px-3 py-2">
        <SlotUsage state={usage} />
      </div>

      <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="cg-register-memo">
        메모 <span className="text-red-600">(필수)</span>
      </label>
      <textarea
        id="cg-register-memo"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        maxLength={500}
        rows={3}
        disabled={busy}
        placeholder="예: 10분 안에 4번 클릭, 체류 1초"
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
      />
      <p className="mt-1 text-xs text-gray-400">네이버에는 날짜와 메모 앞 13자만 들어갑니다(네이버 메모 25자 제한). 전체 메모는 ERP에 남습니다.</p>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => onConfirm(memo.trim())}
          disabled={busy || !memo.trim() || slotFull}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "등록 중…" : "네이버에 차단 등록"}
        </button>
      </div>
    </Shell>
  );
}

export function UnregisterNaverDialog({
  ip,
  busy,
  onClose,
  onConfirm,
}: {
  ip: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Shell title="네이버 차단 해제" onClose={onClose} busy={busy}>
      <p className="font-mono text-sm text-gray-900">{ip}</p>
      <p className="mt-3 text-sm text-gray-700">
        네이버 광고노출 제한에서 이 IP를 삭제합니다. 해제하면 이 IP에 다시 광고가 보이고, ERP 표시는 미처리로 돌아갑니다.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "해제 중…" : "차단 해제"}
        </button>
      </div>
    </Shell>
  );
}

export function NaverStatusDialog({ onClose }: { onClose: () => void }) {
  const state = useNaverStatus(false);

  return (
    <Shell title="네이버 등록 현황" onClose={onClose}>
      {state.loading ? (
        <p className="py-6 text-center text-sm text-gray-400">네이버 목록을 불러오는 중…</p>
      ) : !state.status ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error ?? "현황을 불러오지 못했습니다."}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-gray-500">네이버 등록 수</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">
                {state.status.total.toLocaleString()} <span className="text-sm font-medium text-gray-400">/ {state.status.limit}</span>
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-gray-500">ERP가 등록한 항목 [CG]</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{state.status.cgCount.toLocaleString()}</p>
            </div>
          </div>

          <MismatchList
            title="ERP는 등록완료인데 네이버에 없음"
            empty="없음"
            items={state.status.missingInNaver.map((m) => ({ ip: m.ip, note: m.source === "api" ? "API 등록" : "수동 표시" }))}
          />
          <MismatchList
            title="네이버에 [CG] 항목이 있는데 ERP에 표시 없음"
            empty="없음"
            items={state.status.missingInErp.map((m) => ({ ip: m.ip, note: m.memo ?? "" }))}
          />
          <p className="text-xs text-gray-400">
            확인만 하고 자동으로 고치지 않습니다. 네이버에 없는 IP는 [표시 해제] 또는 [차단 해제]로, ERP에 표시가 없는 IP는 [네이버에 차단 등록]을
            다시 누르면 맞춰집니다.
          </p>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          닫기
        </button>
      </div>
    </Shell>
  );
}

function MismatchList({ title, empty, items }: { title: string; empty: string; items: { ip: string; note: string }[] }) {
  return (
    <div>
      <p className="font-medium text-gray-800">
        {title} <span className="tabular-nums text-gray-400">({items.length})</span>
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-gray-400">{empty}</p>
      ) : (
        <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
          {items.map((item) => (
            <li key={item.ip} className="flex justify-between gap-3">
              <span className="font-mono text-gray-900">{item.ip}</span>
              <span className="truncate text-gray-500">{item.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
