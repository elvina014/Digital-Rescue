"use client";

import { useState, useTransition } from "react";
import { formatDateTime, formatShortDateTime } from "@/lib/date";
import { addWhitelistAction, markIpAction } from "./actions";
import IpDetailDrawer from "./IpDetailDrawer";
import WhitelistPanel from "./WhitelistPanel";
import {
  MARK_BADGE,
  MARK_LABEL,
  NAVER_BLOCK_LIMIT,
  NAVER_BLOCK_WARN,
  STALE_HOURS,
  hoursSince,
  isSharedIpRisk,
  type AdSummary,
  type MarkStatus,
  type SuspectIp,
  type WhitelistRow,
} from "./shared";

type StatusFilter = "none" | MarkStatus;

const NETWORK_ERROR = "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
type Toast = { type: "success" | "error"; message: string } | null;

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "none", label: "미처리" },
  { key: "naver_blocked", label: "네이버 등록완료" },
  { key: "watch", label: "관찰" },
  { key: "normal", label: "정상" },
];

const REASON_BADGE: Record<string, string> = {
  R1: "bg-red-50 text-red-700",
  R2: "bg-orange-50 text-orange-700",
  R3: "bg-amber-50 text-amber-700",
  R4: "bg-indigo-50 text-indigo-700",
  R5: "bg-gray-100 text-gray-600",
  CONV: "bg-green-50 text-green-700",
};

interface Props {
  tab: "suspects" | "whitelist";
  summary: AdSummary;
  suspects: SuspectIp[];
  whitelist: WhitelistRow[];
}

export default function ClickGuardClient({ tab, summary, suspects, whitelist }: Props) {
  const [toast, setToast] = useState<Toast>(null);
  const [filter, setFilter] = useState<StatusFilter>("none");
  // 낙관적 UI: 서버 응답 전 표시 상태 / 숨김(화이트리스트 추가) — 실패하면 되돌린다
  const [overrides, setOverrides] = useState<Record<string, MarkStatus | null>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingIp, setPendingIp] = useState<string | null>(null);
  const [markTarget, setMarkTarget] = useState<SuspectIp | null>(null);
  const [whitelistTarget, setWhitelistTarget] = useState<SuspectIp | null>(null);
  const [detailIp, setDetailIp] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  function copy(text: string, label: string) {
    const done = () => showToast("success", `${label} 복사했습니다.`);
    // 클립보드 권한이 없는 환경(일부 브라우저·임베드)에서는 선택 후 복사 방식으로 대신한다
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      if (ok) done();
      else showToast("error", "복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  const statusOf = (row: SuspectIp): MarkStatus | null =>
    row.client_ip in overrides ? overrides[row.client_ip] : row.mark_status;

  const visibleRows = suspects.filter((r) => !hidden.has(r.client_ip));
  const counts = FILTERS.reduce<Record<StatusFilter, number>>(
    (acc, f) => ({ ...acc, [f.key]: visibleRows.filter((r) => (statusOf(r) ?? "none") === f.key).length }),
    { none: 0, naver_blocked: 0, watch: 0, normal: 0 }
  );
  const rows = visibleRows.filter((r) => (statusOf(r) ?? "none") === filter);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.client_ip));

  function applyMark(row: SuspectIp, status: MarkStatus | null, memo?: string) {
    const ip = row.client_ip;
    const had = ip in overrides;
    const previous = overrides[ip];
    setOverrides((o) => ({ ...o, [ip]: status }));
    setPendingIp(ip);
    startTransition(async () => {
      const res = await markIpAction(ip, status, memo).catch(() => ({ error: NETWORK_ERROR }));
      setPendingIp(null);
      if (res.error) {
        setOverrides((o) => {
          const next = { ...o };
          if (had) next[ip] = previous;
          else delete next[ip];
          return next;
        });
        showToast("error", res.error);
        return;
      }
      showToast("success", status ? `${ip}: ${MARK_LABEL[status]}로 표시했습니다.` : `${ip}: 표시를 해제했습니다.`);
    });
  }

  function applyWhitelist(row: SuspectIp, reason: string) {
    const ip = row.client_ip;
    setHidden((h) => new Set(h).add(ip));
    setPendingIp(ip);
    startTransition(async () => {
      const res = await addWhitelistAction(ip, reason).catch(() => ({ error: NETWORK_ERROR }));
      setPendingIp(null);
      if (res.error) {
        setHidden((h) => {
          const next = new Set(h);
          next.delete(ip);
          return next;
        });
        showToast("error", res.error);
        return;
      }
      showToast("success", `${ip}를 화이트리스트에 추가했습니다. 이후 집계에서 제외됩니다.`);
    });
  }

  function toggle(ip: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) rows.forEach((r) => next.delete(r.client_ip));
      else rows.forEach((r) => next.add(r.client_ip));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {tab === "suspects" ? (
        <>
          <SummaryCards summary={summary} suspectCount={visibleRows.length} />

          <div className="rounded-xl border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      filter === f.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {f.label} <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => copy([...selected].join("\n"), `선택한 IP ${selected.size}개를`)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 IP 복사 ({selected.size})
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-400">해당하는 의심 IP가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="px-3 py-2">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="전체 선택" />
                      </th>
                      <th className="px-3 py-2 font-medium">IP</th>
                      <th className="px-3 py-2 text-right font-medium">점수</th>
                      <th className="px-3 py-2 font-medium">사유</th>
                      <th className="px-3 py-2 text-right font-medium">클릭/방문</th>
                      <th className="px-3 py-2 text-right font-medium">평균 체류</th>
                      <th className="px-3 py-2 text-right font-medium">전환</th>
                      <th className="px-3 py-2 text-right font-medium">모바일</th>
                      <th className="px-3 py-2 font-medium">주요 검색어</th>
                      <th className="px-3 py-2 font-medium">최근 시각</th>
                      <th className="px-3 py-2 font-medium">표시</th>
                      <th className="px-3 py-2 font-medium">처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const status = statusOf(r);
                      const busy = pendingIp === r.client_ip;
                      return (
                        <tr key={r.client_ip} className="border-b align-top last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(r.client_ip)}
                              onChange={() => toggle(r.client_ip)}
                              aria-label={`${r.client_ip} 선택`}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setDetailIp(r.client_ip)}
                              className="font-mono text-blue-700 hover:underline"
                            >
                              {r.client_ip}
                            </button>
                            <button
                              type="button"
                              onClick={() => copy(r.client_ip, "IP를")}
                              className="ml-1.5 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-100"
                            >
                              복사
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{r.score}</td>
                          <td className="px-3 py-2">
                            <div className="flex max-w-[260px] flex-wrap gap-1">
                              {r.reasons.map((reason) => (
                                <span
                                  key={reason.rule}
                                  title={`${reason.rule} · ${reason.points > 0 ? "+" : ""}${reason.points}점`}
                                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${REASON_BADGE[reason.rule] ?? ""}`}
                                >
                                  {reason.label} {reason.value}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.clicks}/{r.visits}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.avg_dwell_ms == null ? "-" : `${(r.avg_dwell_ms / 1000).toFixed(1)}초`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.conversions}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.mobile_ratio * 100)}%</td>
                          <td className="min-w-[160px] max-w-[260px] break-keep px-3 py-2 text-gray-600 [overflow-wrap:anywhere]">
                            {r.top_queries.join(", ") || "-"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600" title={formatDateTime(r.last_seen)}>
                            {formatShortDateTime(r.last_seen)}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${MARK_BADGE[status ?? "none"]}`}>
                              {status ? MARK_LABEL[status] : "미처리"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              <ActionButton disabled={busy || status === "naver_blocked"} onClick={() => setMarkTarget(r)} tone="red">
                                네이버 등록 완료
                              </ActionButton>
                              <ActionButton disabled={busy || status === "watch"} onClick={() => applyMark(r, "watch")}>
                                관찰
                              </ActionButton>
                              <ActionButton disabled={busy || status === "normal"} onClick={() => applyMark(r, "normal")}>
                                정상
                              </ActionButton>
                              <ActionButton disabled={busy || status === null} onClick={() => applyMark(r, null)}>
                                표시 해제
                              </ActionButton>
                              <ActionButton disabled={busy} onClick={() => setWhitelistTarget(r)}>
                                화이트리스트 추가
                              </ActionButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <WhitelistPanel rows={whitelist} onToast={showToast} />
      )}

      {markTarget && (
        <MarkNaverDialog
          row={markTarget}
          onClose={() => setMarkTarget(null)}
          onConfirm={(memo) => {
            applyMark(markTarget, "naver_blocked", memo);
            setMarkTarget(null);
          }}
        />
      )}

      {whitelistTarget && (
        <WhitelistDialog
          row={whitelistTarget}
          onClose={() => setWhitelistTarget(null)}
          onConfirm={(reason) => {
            applyWhitelist(whitelistTarget, reason);
            setWhitelistTarget(null);
          }}
        />
      )}

      {detailIp && <IpDetailDrawer ip={detailIp} onClose={() => setDetailIp(null)} />}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] animate-slide-in rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function SummaryCards({ summary, suspectCount }: { summary: AdSummary; suspectCount: number }) {
  const since = hoursSince(summary.last_collected_at);
  const stale = since === null || since >= STALE_HOURS;
  const blockedWarn = summary.naver_blocked >= NAVER_BLOCK_WARN;

  return (
    <div className="space-y-3">
      {stale && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          수집 중단 또는 네이버 추적 파라미터 OFF 의심 —{" "}
          {summary.last_collected_at ? `마지막 수집 ${formatDateTime(summary.last_collected_at)}` : "수집 기록이 없습니다"}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card label="광고 방문" value={summary.visits} hint="봇 제외" />
        <Card label="클릭" value={summary.clicks} hint="새로고침 제외" />
        <Card label="고유 IP" value={summary.ips} />
        <Card label="의심 IP" value={suspectCount} />
        <div className={`rounded-xl border p-5 shadow-sm ${blockedWarn ? "border-red-300 bg-red-50" : "bg-white"}`}>
          <p className={`text-sm ${blockedWarn ? "text-red-700" : "text-gray-500"}`}>노출제한 등록 표시</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${blockedWarn ? "text-red-700" : "text-gray-900"}`}>
            {summary.naver_blocked.toLocaleString()} <span className="text-base font-medium text-gray-400">/ {NAVER_BLOCK_LIMIT}</span>
          </p>
          {blockedWarn && <p className="mt-1 text-xs text-red-600">네이버 등록 상한에 가깝습니다. 오래된 항목 정리가 필요합니다.</p>}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">
        {label} {hint && <span className="text-xs text-gray-400">({hint})</span>}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "red";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "red"
          ? "border-red-200 text-red-700 hover:bg-red-50"
          : "border-gray-300 text-gray-700 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function MarkNaverDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: SuspectIp;
  onClose: () => void;
  onConfirm: (memo: string) => void;
}) {
  const [memo, setMemo] = useState(row.mark_memo ?? "");
  return (
    <Dialog title="네이버 등록 완료 표시" onClose={onClose}>
      <p className="font-mono text-sm text-gray-900">{row.client_ip}</p>
      <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
        검색광고센터 &gt; 도구 &gt; 광고노출 제한관리에 이 IP를 직접 등록한 뒤 눌러주세요.
      </p>
      {isSharedIpRisk(row) && (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
          모바일/공용 IP일 수 있어 일반 고객도 차단될 수 있습니다.
        </p>
      )}
      <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="cg-mark-memo">
        메모
      </label>
      <textarea
        id="cg-mark-memo"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="예: 11/6 검색광고센터 등록"
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          취소
        </button>
        <button
          type="button"
          onClick={() => onConfirm(memo)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          등록 완료로 표시
        </button>
      </div>
    </Dialog>
  );
}

function WhitelistDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: SuspectIp;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog title="화이트리스트 추가" onClose={onClose}>
      <p className="font-mono text-sm text-gray-900">{row.client_ip}</p>
      <p className="mt-3 text-sm text-gray-600">이 IP는 이후 의심 IP 집계에서 제외됩니다. (사무실·직원·협력업체 IP 등)</p>
      <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="cg-wl-reason">
        사유
      </label>
      <input
        id="cg-wl-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        placeholder="예: 사무실 IP"
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          취소
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          추가
        </button>
      </div>
    </Dialog>
  );
}
