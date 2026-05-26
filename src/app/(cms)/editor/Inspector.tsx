"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { uploadCmsImage } from "@/lib/cmsImageUpload";

interface InspectorProps {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

/**
 * Inspector — content_data 의 임의의 JSON 트리를 재귀적으로 폼으로 변환한다.
 *
 * 필드 추론 휴리스틱(inferFieldKind):
 *   - 키에 "color" 포함 또는 값이 hex 문자열 (#abc) → 컬러 피커
 *   - 키에 "imageurl" 포함 또는 키가 image/photo 로 끝남 → 파일 업로더(데이터 URL)
 *   - 숫자값 + 키가 weight/size/duration/strength/interval/count → 슬라이더
 *   - 긴 문자열 또는 줄바꿈 포함 → textarea
 *   - 외 문자열 → 단일행 텍스트 입력
 *   - 불리언 → 체크박스
 *   - 배열 → 항목별 nested form + 추가/삭제
 *   - 객체 → 펼쳐지는 nested 그룹
 */
export function Inspector({ value, onChange }: InspectorProps) {
  return (
    <div className="space-y-4">
      <ObjectField path="" value={value} onChange={onChange} depth={0} />
    </div>
  );
}

// ────────────────────────── 휴리스틱 ──────────────────────────

type FieldKind =
  | "color"
  | "image"
  | "slider"
  | "number"
  | "textarea"
  | "text"
  | "boolean"
  | "array"
  | "object";

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SLIDER_KEY_RE =
  /(weight|size|duration|strength|interval|count|fontsize|opacity|ms)$/i;
// body 계열 키는 값 길이와 무관하게 항상 줄바꿈 가능한 textarea 로 렌더링
const TEXTAREA_KEY_RE = /body/i;

function inferFieldKind(key: string, val: unknown): FieldKind {
  // null / undefined → 빈 문자열 텍스트 필드로 처리 (크래시 방지)
  if (val === null || val === undefined) return "text";

  const lk = key.toLowerCase();

  if (typeof val === "boolean") return "boolean";

  if (typeof val === "number") {
    return SLIDER_KEY_RE.test(lk) ? "slider" : "number";
  }

  if (typeof val === "string") {
    if (lk.includes("color") || HEX_COLOR_RE.test(val)) return "color";
    if (
      lk.includes("imageurl") ||
      lk.endsWith("image") ||
      lk.endsWith("photo") ||
      lk.endsWith("logo") ||
      lk.endsWith("icon") && val.startsWith("data:image")
    )
      return "image";
    if (TEXTAREA_KEY_RE.test(lk) || val.length > 80 || val.includes("\n"))
      return "textarea";
    return "text";
  }

  if (Array.isArray(val)) return "array";
  if (val !== null && typeof val === "object") return "object";

  return "text";
}

// ────────────────────────── 즉시 immer-light: 경로 기반 set ──────────────────────────

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ────────────────────────── 공통 레이아웃 ──────────────────────────

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold tracking-tight text-slate-700">
        {label}
        {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

// ────────────────────────── 객체 필드 ──────────────────────────

function ObjectField({
  path,
  value,
  onChange,
  depth,
}: {
  path: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  depth: number;
}) {
  // null/undefined 방어 — 빈 객체로 폴백해 크래시 방지
  const safeValue = (value !== null && typeof value === "object" && !Array.isArray(value))
    ? value
    : {} as Record<string, unknown>;
  const entries = Object.entries(safeValue);
  return (
    <div
      className={
        depth > 0
          ? "space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
          : "space-y-3"
      }
    >
      {entries.map(([k, v]) => (
        <DispatchField
          key={k}
          fieldKey={k}
          path={path ? `${path}.${k}` : k}
          value={v}
          onChange={(next) => {
            const updated = { ...safeValue, [k]: next };
            onChange(updated);
          }}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

// ────────────────────────── 디스패처 ──────────────────────────

function DispatchField({
  fieldKey,
  path,
  value,
  onChange,
  depth,
}: {
  fieldKey: string;
  path: string;
  value: unknown;
  onChange: (next: unknown) => void;
  depth: number;
}) {
  const kind = inferFieldKind(fieldKey, value);
  const label = fieldKey;

  switch (kind) {
    case "boolean":
      return (
        <FieldRow label={label}>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600">
              {value ? "true" : "false"}
            </span>
          </label>
        </FieldRow>
      );

    case "color":
      return (
        <FieldRow label={label} hint="(색상)">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={asColorValue(value)}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded border border-slate-300"
            />
            <input
              type="text"
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass + " font-mono"}
            />
          </div>
        </FieldRow>
      );

    case "image":
      return (
        <FieldRow label={label} hint="(이미지 업로드)">
          <ImageField value={value as string} onChange={onChange} />
        </FieldRow>
      );

    case "slider":
      return (
        <FieldRow label={label} hint="(슬라이더)">
          <SliderField fieldKey={fieldKey} value={value as number} onChange={onChange} />
        </FieldRow>
      );

    case "number":
      return (
        <FieldRow label={label}>
          <input
            type="number"
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            className={inputClass}
          />
        </FieldRow>
      );

    case "textarea":
      return (
        <FieldRow label={label}>
          <textarea
            rows={3}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass + " resize-y"}
          />
        </FieldRow>
      );

    case "text":
      return (
        <FieldRow label={label}>
          <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        </FieldRow>
      );

    case "array": {
      // null/undefined 방어 — 빈 배열로 폴백
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      return (
        <FieldRow label={label} hint={`(목록 · ${arr.length}개)`}>
          <ArrayField
            path={path}
            value={arr}
            onChange={onChange}
            depth={depth}
          />
        </FieldRow>
      );
    }

    case "object": {
      // null/undefined 방어 — 빈 객체로 폴백
      const obj =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return (
        <details
          open={depth <= 1}
          className="rounded-lg border border-slate-200 bg-white"
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold tracking-tight text-slate-700 hover:bg-slate-50">
            {label}{" "}
            <span className="font-normal text-slate-400">(중첩 객체)</span>
          </summary>
          <div className="px-3 pb-3 pt-2">
            <ObjectField
              path={path}
              value={obj}
              onChange={onChange as (v: Record<string, unknown>) => void}
              depth={depth}
            />
          </div>
        </details>
      );
    }
  }
}

// ────────────────────────── 슬라이더 ──────────────────────────

function rangeFor(fieldKey: string): { min: number; max: number; step: number } {
  const lk = fieldKey.toLowerCase();
  if (lk === "weight") return { min: 100, max: 900, step: 100 };
  if (lk.includes("opacity") || lk.includes("strength"))
    return { min: 0, max: 1, step: 0.05 };
  if (lk.includes("ms") || lk.includes("duration"))
    return { min: 0, max: 5000, step: 50 };
  if (lk.includes("interval")) return { min: 1, max: 60, step: 1 };
  if (lk.includes("count")) return { min: 1, max: 30, step: 1 };
  if (lk.includes("fontsize") || lk.includes("size"))
    return { min: 8, max: 120, step: 1 };
  return { min: 0, max: 100, step: 1 };
}

function SliderField({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const { min, max, step } = rangeFor(fieldKey);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-600"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass + " w-20"}
      />
    </div>
  );
}

// ────────────────────────── 이미지 (Supabase Storage 업로드) ──────────────────────────

function ImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 파일 선택 즉시 압축 + Supabase Storage 로 업로드 → public URL 을 JSON 에 저장.
  // (저장 버튼을 누르기 전에 업로드되지만, draft 가 dirty 인 상태에서 '되돌리기' 시
  //  storage 의 파일은 남는 orphan 이 됨 — 운영 단계에서 cleanup 작업 별도 권장)
  const handleSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        const { url } = await uploadCmsImage(file);
        onChange(url);
      } catch (err) {
        console.error("[ImageField] upload failed", err);
        const msg =
          err instanceof Error ? err.message : "이미지 업로드 실패";
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [onChange]
  );

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <img
            src={value}
            alt="preview"
            className="block max-h-48 w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs text-slate-400">
          이미지 없음
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? "업로드 중..." : value ? "이미지 교체" : "이미지 업로드"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            제거
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleSelect}
          className="hidden"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {value && (
        <details className="rounded-md bg-slate-50 px-2 py-1">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            URL 직접 입력 / 확인
          </summary>
          <textarea
            rows={2}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass + " mt-1 font-mono text-[11px]"}
            placeholder="https://... (외부 이미지 URL 도 사용 가능)"
          />
        </details>
      )}
    </div>
  );
}

// ────────────────────────── 배열 ──────────────────────────

function ArrayField({
  path,
  value,
  onChange,
  depth,
}: {
  path: string;
  value: unknown[];
  onChange: (next: unknown) => void;
  depth: number;
}) {
  const addItem = () => {
    // 마지막 항목을 템플릿으로 복제. 없으면 빈 객체 또는 빈 문자열.
    let next: unknown;
    if (value.length > 0) {
      next = clone(value[value.length - 1]);
      if (typeof next === "string") next = "";
    } else {
      next = "";
    }
    onChange([...value, next]);
  };

  const removeItem = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-slate-400">(비어 있음)</p>
      )}
      <ul className="space-y-2">
        {value.map((item, idx) => (
          <li
            key={idx}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="rounded-md px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                삭제
              </button>
            </div>
            <DispatchField
              fieldKey={`item${idx}`}
              path={`${path}[${idx}]`}
              value={item}
              onChange={(next) => {
                const copy = value.slice();
                copy[idx] = next;
                onChange(copy);
              }}
              depth={depth + 1}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addItem}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
      >
        + 항목 추가
      </button>
    </div>
  );
}

// ────────────────────────── 유틸 ──────────────────────────

function asColorValue(v: unknown): string {
  if (typeof v === "string" && HEX_COLOR_RE.test(v)) {
    // <input type="color"> 는 #rgb / #rrggbbaa 를 못 받음 — #rrggbb 로 보정
    if (v.length === 4) {
      const [, r, g, b] = v;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    if (v.length === 9) return v.slice(0, 7);
    return v;
  }
  return "#000000";
}
