"use client";

import { useMemo, useState } from "react";
import { getUnmappedModelStringsAction, mapModelStringAction, unmapAliasAction } from "../actions";
import type { UnmappedGroup } from "../actions";
import type { PickedModel } from "@/components/catalog/DeviceModelPicker";
import MappingRow from "./MappingRow";
import RecentMappings from "./RecentMappings";
import type { RecentMapping } from "./RecentMappings";

interface Props {
  initialGroups: UnmappedGroup[];
  initialRecent: RecentMapping[];
}

/** 모델 매핑 도구 — 자동 매핑 없음. 사람이 확인한 묶음만 연결한다. */
export default function MappingClient({ initialGroups, initialRecent }: Props) {
  const [groups, setGroups] = useState(initialGroups);
  const [recent, setRecent] = useState(initialRecent);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyAlias, setBusyAlias] = useState<string | null>(null);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return groups;
    return groups.filter((g) => g.raw_strings.some((r) => r.toLowerCase().includes(f)) || g.brands.some((b) => b.toLowerCase().includes(f)));
  }, [groups, filter]);

  async function handleMap(group: UnmappedGroup, model: PickedModel, alias: string) {
    if (!confirm(`"${group.raw_strings.join(", ")}" 접수건 ${group.ticket_count}건을\n[${model.label}]에 연결합니다. 계속할까요?`)) return;
    // 낙관적 업데이트: 목록에서 먼저 제거, 실패 시 원래 위치로 복원
    const index = groups.findIndex((g) => g.norm === group.norm);
    setGroups((prev) => prev.filter((g) => g.norm !== group.norm));
    setMessage(null);

    const res = await mapModelStringAction({ norm: group.norm, modelId: model.modelId, variantId: model.variantId, alias });
    if ("error" in res && res.error) {
      setGroups((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, group);
        return next;
      });
      setMessage({ ok: false, text: res.error });
      return;
    }
    if ("aliasId" in res && res.aliasId) {
      setRecent((prev) => [
        { aliasId: res.aliasId, alias, modelLabel: model.label, linked: res.linked, createdAt: new Date().toISOString() },
        ...prev.filter((r) => r.aliasId !== res.aliasId),
      ]);
      setMessage({ ok: true, text: `접수건 ${res.linked}건을 [${model.label}]에 연결했습니다.` });
    }
  }

  async function handleUndo(item: RecentMapping) {
    if (!confirm(`별칭 "${item.alias}"로 연결된 접수건을 해제합니다. (이후 다른 모델로 바뀐 접수건은 그대로 둡니다)`)) return;
    setBusyAlias(item.aliasId);
    const res = await unmapAliasAction(item.aliasId);
    setBusyAlias(null);
    if ("error" in res && res.error) {
      setMessage({ ok: false, text: res.error });
      return;
    }
    setRecent((prev) => prev.filter((r) => r.aliasId !== item.aliasId));
    setMessage({ ok: true, text: `접수건 ${"unlinked" in res ? res.unlinked : 0}건의 연결을 해제했습니다.` });
    // 해제된 모델명이 다시 미연결 목록에 나타나도록 새로 불러온다
    const fresh = await getUnmappedModelStringsAction();
    if (!fresh.error) setGroups(fresh.data);
  }

  return (
    <div className="space-y-6">
      {message && (
        <p className={`rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-800">
            미연결 모델명 <span className="text-gray-500">({groups.length}묶음, 접수건 수 많은 순)</span>
          </h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="모델명·브랜드로 거르기"
            className="w-60 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <p className="mb-3 text-xs text-gray-500">
          대소문자·공백·기호만 다른 모델명은 한 묶음으로 보입니다. 연결하면 이미 표준 모델이 지정된 접수건은 바뀌지 않으며, 접수건의 &quot;최종 수정&quot; 시각도 그대로입니다.
        </p>
        {visible.length === 0 ? (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">표시할 미연결 모델명이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((g) => (
              <MappingRow key={g.norm} group={g} onMap={handleMap} />
            ))}
          </ul>
        )}
      </section>

      <RecentMappings items={recent} busyId={busyAlias} onUndo={handleUndo} />
    </div>
  );
}
