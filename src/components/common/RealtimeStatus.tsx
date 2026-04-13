"use client";

import { useEffect, useState, useCallback } from "react";

const NAMES = [
  "김**", "이**", "박**", "최**", "정**", "강**", "조**", "윤**",
  "장**", "임**", "한**", "오**", "서**", "신**", "권**", "황**",
];

const DEVICES = [
  "삼성 갤럭시북 프로", "LG 그램 17", "레노버 씽크패드", "ASUS ROG",
  "HP 파빌리온", "델 인스피론", "맥북 프로 14", "맥북 에어 M2",
  "MSI GF63", "에이서 스위프트", "삼성 노트북9", "LG 울트라PC",
  "레노버 아이디어패드", "HP 스펙터", "델 XPS 15", "ASUS 젠북",
];

const SYMPTOMS = [
  "전원 불량", "화면 깜빡임", "충전 안됨", "키보드 불량",
  "블루스크린 반복", "액정 파손", "배터리 팽창", "발열 심함",
  "팬 소음 심함", "SSD 인식 불가", "와이파이 끊김", "터치패드 오작동",
  "힌지 파손", "데이터 복구", "윈도우 부팅 안됨", "메인보드 수리",
];

const STATUSES = [
  { label: "접수 완료", color: "bg-blue-500" },
  { label: "진단 중", color: "bg-yellow-500" },
  { label: "수리 중", color: "bg-orange-500" },
  { label: "수리 완료", color: "bg-green-500" },
] as const;

interface FakeEntry {
  id: number;
  name: string;
  device: string;
  symptom: string;
  status: (typeof STATUSES)[number];
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateEntries(count: number): FakeEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: pickRandom(NAMES),
    device: pickRandom(DEVICES),
    symptom: pickRandom(SYMPTOMS),
    status: pickRandom(STATUSES),
  }));
}

export function RealtimeStatus() {
  const [entries, setEntries] = useState<FakeEntry[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    setEntries(generateEntries(8));
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10 * 60 * 1000); // 10분
    return () => clearInterval(interval);
  }, [refresh]);

  if (!lastRefresh) return null;

  return (
    <section className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            실시간 수리 현황
          </h2>
          <p className="mt-3 text-slate-500">
            현재 진행 중인 수리 현황을 확인하세요
          </p>
          <p className="mt-1 text-xs text-slate-400">
            마지막 업데이트:{" "}
            {lastRefresh.toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* 데스크톱 테이블 */}
        <div className="mt-10 hidden overflow-hidden rounded-xl border border-slate-200 sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-5 py-3 font-semibold text-slate-600">고객명</th>
                <th className="px-5 py-3 font-semibold text-slate-600">기종</th>
                <th className="px-5 py-3 font-semibold text-slate-600">증상</th>
                <th className="px-5 py-3 font-semibold text-slate-600">상태</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                >
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {entry.name}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{entry.device}</td>
                  <td className="px-5 py-3 text-slate-600">{entry.symptom}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-700">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${entry.status.color}`}
                      />
                      {entry.status.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="mt-10 space-y-3 sm:hidden">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{entry.name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${entry.status.color}`}
                  />
                  {entry.status.label}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {entry.device} · {entry.symptom}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
