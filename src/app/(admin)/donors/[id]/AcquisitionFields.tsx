"use client";

type Acquisition = { note: string; acquiredOn: string; cost: string };

const inputCls = "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50";

/** 매장 보관 Donor의 회사 자산 정보 (Phase 4.1) — 저장은 DonorInfoForm의 저장 버튼 */
export default function AcquisitionFields({
  value,
  disabled,
  onChange,
}: {
  value: Acquisition;
  disabled: boolean;
  onChange: (value: Acquisition) => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-900">회사 자산 정보 (매장 보관)</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-4">
        <label className="block text-xs text-gray-700 sm:col-span-2">
          취득 경위 <span className="text-red-500">*</span>
          <input value={value.note} maxLength={300} disabled={disabled} onChange={(e) => onChange({ ...value, note: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-xs text-gray-700">
          취득일
          <input type="date" value={value.acquiredOn} disabled={disabled} onChange={(e) => onChange({ ...value, acquiredOn: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-xs text-gray-700">
          취득가 (원)
          <input inputMode="numeric" value={value.cost} disabled={disabled} onChange={(e) => onChange({ ...value, cost: e.target.value })} className={inputCls} />
        </label>
      </div>
      <p className="mt-1 text-xs text-gray-500">취득가는 기록용이며 적출 부품의 재고 금액에는 반영되지 않습니다.</p>
    </div>
  );
}
