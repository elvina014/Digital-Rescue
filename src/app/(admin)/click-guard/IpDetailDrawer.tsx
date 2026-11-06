"use client";

import { useEffect, useState } from "react";
import { formatDateTime, formatShortDateTime } from "@/lib/date";
import { getIpDetailAction } from "./actions";
import { CONVERSION_LABEL, MARK_BADGE, MARK_LABEL, type IpDetail } from "./shared";

/** 의심 IP 상세 드로어: 최근 30일 방문 타임라인, 같은 대역 클릭 수, 현재 표시 정보 */
export default function IpDetailDrawer({ ip, onClose }: { ip: string; onClose: () => void }) {
  const [detail, setDetail] = useState<IpDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getIpDetailAction(ip)
      .then((res) => {
        if (!alive) return;
        if (res.error || !res.data) setError(res.error ?? "상세 정보를 불러오지 못했습니다.");
        else setDetail(res.data);
      })
      .catch(() => alive && setError("상세 정보를 불러오지 못했습니다."));
    return () => {
      alive = false;
    };
  }, [ip]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${ip} 상세`}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-mono text-lg font-semibold text-gray-900">{ip}</p>
            {detail && (
              <p className="mt-0.5 text-xs text-gray-500">
                대역 {detail.ip_prefix} · 최근 30일 같은 대역 클릭 {detail.prefix_clicks}회 (IP {detail.prefix_ips}개)
                {detail.whitelisted && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">화이트리스트</span>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!error && !detail && <p className="text-sm text-gray-400">불러오는 중...</p>}
          {detail && (
            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">표시 정보</h3>
                {detail.mark ? (
                  <div className="rounded-lg border p-3 text-sm">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${MARK_BADGE[detail.mark.status]}`}>
                      {MARK_LABEL[detail.mark.status]}
                    </span>
                    <span className="ml-2 text-gray-600">
                      {detail.mark.marked_by_name ?? "알 수 없음"} · {formatDateTime(detail.mark.marked_at)}
                    </span>
                    {detail.mark.memo && <p className="mt-2 whitespace-pre-wrap text-gray-700">{detail.mark.memo}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">표시 없음 (미처리)</p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">방문 타임라인 ({detail.visits.length}건, 최근 30일)</h3>
                {detail.visits.length === 0 ? (
                  <p className="text-sm text-gray-400">방문 기록이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-xs">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="py-2 pr-3 font-medium">시각</th>
                          <th className="py-2 pr-3 font-medium">검색어</th>
                          <th className="py-2 pr-3 font-medium">키워드</th>
                          <th className="py-2 pr-3 text-right font-medium">순위</th>
                          <th className="py-2 pr-3 font-medium">기기</th>
                          <th className="py-2 pr-3 text-right font-medium">체류</th>
                          <th className="py-2 pr-3 text-right font-medium">스크롤</th>
                          <th className="py-2 pr-3 text-right font-medium">상호작용</th>
                          <th className="py-2 font-medium">전환</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.visits.map((v, i) => {
                          const conv = Object.entries(v.conversions ?? {})
                            .filter(([, n]) => n > 0)
                            .map(([k, n]) => `${CONVERSION_LABEL[k] ?? k} ${n}`)
                            .join(", ");
                          return (
                            <tr key={`${v.created_at}-${i}`} className={`border-b last:border-0 ${v.is_bot ? "text-gray-400" : "text-gray-800"}`}>
                              <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{formatShortDateTime(v.created_at)}</td>
                              <td className="py-1.5 pr-3">{v.n_query ?? "-"}</td>
                              <td className="py-1.5 pr-3">{v.n_keyword ?? "-"}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{v.n_rank ?? "-"}</td>
                              <td className="py-1.5 pr-3">
                                {v.device_type ?? "-"}
                                {v.is_bot && " (봇)"}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">
                                {v.dwell_ms == null ? "-" : `${(v.dwell_ms / 1000).toFixed(1)}초`}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{v.max_scroll_pct == null ? "-" : `${v.max_scroll_pct}%`}</td>
                              <td className="py-1.5 pr-3 text-right tabular-nums">{v.interactions ?? "-"}</td>
                              <td className="py-1.5">{conv || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-gray-400">체류·스크롤·상호작용·전환은 방문 세션(30분 쿠키) 단위 값입니다. 같은 세션의 새로고침은 같은 값이 반복됩니다.</p>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
