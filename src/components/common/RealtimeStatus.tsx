"use client";

import { useCallback, useEffect, useState } from "react";
import defaults from "@/data/mainPageData.json";
import type { RealtimeStatusData, ThemeData } from "@/types/sections";

const DEFAULT_REALTIME_STATUS = defaults.realtimeStatus as RealtimeStatusData;
const DEFAULT_THEME = defaults.theme as ThemeData;

type StatusItem = RealtimeStatusData["statuses"][number];

interface FakeEntry {
  id: number;
  name: string;
  device: string;
  symptom: string;
  status: StatusItem;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateEntries(count: number, data: RealtimeStatusData): FakeEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    name: pickRandom(data.dummyData.names),
    device: pickRandom(data.dummyData.devices),
    symptom: pickRandom(data.dummyData.symptoms),
    status: pickRandom(data.statuses),
  }));
}

interface RealtimeStatusProps {
  data?: RealtimeStatusData;
  theme?: ThemeData;
}

export function RealtimeStatus({
  data = DEFAULT_REALTIME_STATUS,
  theme = DEFAULT_THEME,
}: RealtimeStatusProps) {
  const [entries, setEntries] = useState<FakeEntry[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    setEntries(generateEntries(data.rowCount, data));
    setLastRefresh(new Date());
  }, [data]);

  useEffect(() => {
    refresh();
    const interval = setInterval(
      refresh,
      data.refreshIntervalMinutes * 60 * 1000
    );
    return () => clearInterval(interval);
  }, [refresh, data.refreshIntervalMinutes]);

  if (!lastRefresh) return null;

  return (
    <section
      id="status"
      className="relative bg-white"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide"
            style={{
              borderColor: theme.borderSoft,
              color: theme.accentColor,
              background: theme.surfaceMuted,
            }}
          >
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: theme.accentColor }}
            />
            {data.eyebrow}
          </span>
          <h2
            className="mx-auto mt-5 max-w-3xl text-3xl leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: theme.textPrimary, fontWeight: 800 }}
          >
            {data.title}
          </h2>
          <p
            className="mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg"
            style={{ color: theme.textSecondary }}
          >
            {data.subtitle}
          </p>
          <p
            className="mt-3 text-xs"
            style={{ color: theme.textSecondary }}
          >
            마지막 업데이트:{" "}
            {lastRefresh.toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        <div
          className="mt-12 hidden overflow-hidden rounded-3xl border bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] sm:block"
          style={{ borderColor: theme.borderSoft }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left"
                style={{ background: theme.surfaceMuted }}
              >
                <th
                  className="px-6 py-4 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: theme.textSecondary }}
                >
                  {data.columns.name}
                </th>
                <th
                  className="px-6 py-4 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: theme.textSecondary }}
                >
                  {data.columns.device}
                </th>
                <th
                  className="px-6 py-4 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: theme.textSecondary }}
                >
                  {data.columns.symptom}
                </th>
                <th
                  className="px-6 py-4 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: theme.textSecondary }}
                >
                  {data.columns.status}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="transition-colors duration-200 hover:bg-slate-50/70"
                  style={{
                    borderTop:
                      i === 0 ? "none" : `1px solid ${theme.borderSoft}`,
                  }}
                >
                  <td
                    className="px-6 py-4 font-semibold"
                    style={{ color: theme.textPrimary }}
                  >
                    {entry.name}
                  </td>
                  <td
                    className="px-6 py-4"
                    style={{ color: theme.textSecondary }}
                  >
                    {entry.device}
                  </td>
                  <td
                    className="px-6 py-4"
                    style={{ color: theme.textSecondary }}
                  >
                    {entry.symptom}
                  </td>
                  <td className="px-6 py-4">
                    <StatusPill status={entry.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 space-y-3 sm:hidden">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border bg-white p-5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.25)]"
              style={{ borderColor: theme.borderSoft }}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-base font-bold"
                  style={{ color: theme.textPrimary }}
                >
                  {entry.name}
                </span>
                <StatusPill status={entry.status} />
              </div>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: theme.textSecondary }}
              >
                {entry.device} · {entry.symptom}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: StatusItem }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        background: `${status.color}15`,
        color: status.color,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: status.color }}
      />
      {status.label}
    </span>
  );
}
