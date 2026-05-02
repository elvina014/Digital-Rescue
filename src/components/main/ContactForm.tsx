"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import data from "@/data/mainPageData.json";
import {
  submitTicketAction,
  type TicketFormState,
} from "@/app/actions/ticketActions";

const cf = data.contactForm;
const theme = data.theme;

type ReceiptValue = (typeof cf.receiptTypes)[number]["value"];

const initialState: TicketFormState = { success: false, message: "" };

const inputBaseClass =
  "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 sm:text-[15px]";
const labelClass =
  "mb-2 block text-sm font-semibold tracking-tight text-slate-700";

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(
    submitTicketAction,
    initialState
  );

  const [showToast, setShowToast] = useState(false);
  const [imageEntries, setImageEntries] = useState<
    { file: File; description: string }[]
  >([]);
  const [receiptType, setReceiptType] = useState<ReceiptValue | "">("");
  const [visitDateTime, setVisitDateTime] = useState("");
  const [parcelMethod, setParcelMethod] = useState("");
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    setFormKey((k) => k + 1);
    if (state.success) {
      setShowToast(true);
      setImageEntries([]);
      setVisitDateTime("");
      setParcelMethod("");
      const t = setTimeout(() => setShowToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const guide =
    receiptType in cf.dynamicGuides
      ? cf.dynamicGuides[receiptType as keyof typeof cf.dynamicGuides]
      : null;

  return (
    <>
      {showToast && (
        <div className="fixed right-4 top-4 z-50 animate-slide-in">
          <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-white px-5 py-4 shadow-2xl shadow-green-100/40">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-5 w-5 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">접수 완료!</p>
              <p className="mt-0.5 text-sm text-slate-500">{state.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowToast(false)}
              aria-label="닫기"
              className="ml-2 text-slate-400 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <section
        id="contact"
        className="relative bg-slate-50"
        style={{ fontFamily: theme.fontFamily }}
      >
        <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
          <div className="text-center">
            <span
              className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: theme.accentColor }}
            >
              {cf.eyebrow}
            </span>
            <h2
              className="mx-auto mt-5 max-w-2xl text-3xl leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl"
              style={{ color: theme.textPrimary, fontWeight: 800 }}
            >
              {cf.title}
            </h2>
            <p
              className="mx-auto mt-5 max-w-xl text-base leading-relaxed sm:text-lg"
              style={{ color: theme.textSecondary }}
            >
              {cf.subtitle}
            </p>
          </div>

          {!state.success && state.message && (
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {state.message}
            </div>
          )}

          <form
            key={formKey}
            action={(formData) => {
              if (visitDateTime)
                formData.append("visitDateTime", visitDateTime);
              if (parcelMethod) formData.append("parcelMethod", parcelMethod);

              const meta: string[] = [];
              if (receiptType === "WALK_IN" && visitDateTime)
                meta.push(`[방문 예정 일시: ${visitDateTime}]`);
              if (receiptType === "PARCEL" && parcelMethod) {
                const opt = cf.dynamicGuides.PARCEL.extras
                  ?.find((e) => e.name === "parcelMethod")
                  ?.options?.find((o) => o.value === parcelMethod);
                if (opt) meta.push(`[택배 방식: ${opt.label}]`);
              }
              if (meta.length > 0) {
                const symptoms = String(formData.get("symptoms") ?? "");
                formData.set("symptoms", `${meta.join(" ")}\n${symptoms}`);
              }

              for (const entry of imageEntries) {
                formData.append("images", entry.file);
                formData.append("imageDescriptions", entry.description);
              }
              formAction(formData);
            }}
            className="mx-auto mt-12 max-w-2xl space-y-6 rounded-3xl border bg-white p-6 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] sm:p-10"
            style={{ borderColor: theme.borderSoft }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="name"
                label={cf.labels.name}
                required
                error={state.errors?.name}
              >
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={state.values?.name}
                  placeholder={cf.labels.namePlaceholder}
                  className={inputBaseClass}
                  style={{ borderColor: theme.borderSoft }}
                />
              </Field>
              <Field
                id="phone"
                label={cf.labels.phone}
                required
                error={state.errors?.phone}
              >
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  defaultValue={state.values?.phone}
                  placeholder={cf.labels.phonePlaceholder}
                  className={inputBaseClass}
                  style={{ borderColor: theme.borderSoft }}
                />
              </Field>
            </div>

            <Field id="address" label={cf.labels.address}>
              <input
                id="address"
                name="address"
                type="text"
                defaultValue={state.values?.address}
                placeholder={cf.labels.addressPlaceholder}
                className={inputBaseClass}
                style={{ borderColor: theme.borderSoft }}
              />
            </Field>

            <Field
              id="receiptType"
              label={cf.labels.receiptType}
              required
              error={state.errors?.receiptType}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cf.receiptTypes.map((t) => {
                  const active = receiptType === t.value;
                  return (
                    <label
                      key={t.value}
                      className="cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="receiptType"
                        value={t.value}
                        required
                        checked={active}
                        onChange={() =>
                          setReceiptType(t.value as ReceiptValue)
                        }
                        className="peer sr-only"
                      />
                      <span
                        className="flex h-full items-center justify-center rounded-2xl border px-3 py-3 text-center text-sm font-semibold transition-all"
                        style={{
                          borderColor: active
                            ? theme.accentColor
                            : theme.borderSoft,
                          background: active ? theme.accentSoft : "#ffffff",
                          color: active
                            ? theme.accentColor
                            : theme.textSecondary,
                        }}
                      >
                        {t.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>

            {guide && (
              <DynamicGuide
                receiptType={receiptType as ReceiptValue}
                visitDateTime={visitDateTime}
                onVisitDateTime={setVisitDateTime}
                parcelMethod={parcelMethod}
                onParcelMethod={setParcelMethod}
              />
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="deviceType"
                label={cf.labels.deviceType}
                required
                error={state.errors?.deviceType}
              >
                <select
                  id="deviceType"
                  name="deviceType"
                  required
                  defaultValue={state.values?.deviceType ?? ""}
                  className={inputBaseClass}
                  style={{ borderColor: theme.borderSoft }}
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {cf.deviceTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="deviceBrand"
                label={cf.labels.deviceBrand}
                required
                error={state.errors?.deviceBrand}
              >
                <select
                  id="deviceBrand"
                  name="deviceBrand"
                  required
                  defaultValue={state.values?.deviceBrand ?? ""}
                  className={inputBaseClass}
                  style={{ borderColor: theme.borderSoft }}
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {cf.brands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field id="deviceModel" label={cf.labels.deviceModel}>
              <input
                id="deviceModel"
                name="deviceModel"
                type="text"
                defaultValue={state.values?.deviceModel}
                placeholder={cf.labels.deviceModelPlaceholder}
                className={inputBaseClass}
                style={{ borderColor: theme.borderSoft }}
              />
            </Field>

            <Field
              id="symptoms"
              label={cf.labels.symptoms}
              required
              error={state.errors?.symptoms}
            >
              <textarea
                id="symptoms"
                name="symptoms"
                rows={5}
                required
                defaultValue={state.values?.symptoms}
                placeholder={cf.labels.symptomsPlaceholder}
                className={`${inputBaseClass} resize-none`}
                style={{ borderColor: theme.borderSoft }}
              />
            </Field>

            <PhotoAttacher
              entries={imageEntries}
              onChange={setImageEntries}
              max={cf.maxImages}
            />

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-2xl px-6 py-4 text-base font-bold text-white transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: theme.accentColor,
                  boxShadow: "0 14px 32px -12px rgba(37, 99, 235, 0.55)",
                }}
              >
                {isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {cf.labels.submitting}
                  </span>
                ) : (
                  cf.labels.submit
                )}
              </button>
              <p
                className="mt-4 text-center text-sm"
                style={{ color: theme.textSecondary }}
              >
                {cf.footnote}
              </p>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function DynamicGuide({
  receiptType,
  visitDateTime,
  onVisitDateTime,
  parcelMethod,
  onParcelMethod,
}: {
  receiptType: ReceiptValue;
  visitDateTime: string;
  onVisitDateTime: (v: string) => void;
  parcelMethod: string;
  onParcelMethod: (v: string) => void;
}) {
  const guide =
    cf.dynamicGuides[receiptType as keyof typeof cf.dynamicGuides];
  if (!guide) return null;

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor: theme.accentSoft,
        background: `linear-gradient(135deg, ${theme.accentSoft}50 0%, #ffffff 100%)`,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: theme.accentColor, color: "#ffffff" }}
        >
          i
        </span>
        <p
          className="text-sm leading-relaxed sm:text-[15px]"
          style={{ color: theme.textPrimary, fontWeight: 600 }}
        >
          {guide.message}
        </p>
      </div>

      {receiptType === "WALK_IN" && (
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="visitDateTime"
              className="mb-2 block text-xs font-semibold tracking-tight"
              style={{ color: theme.textSecondary }}
            >
              방문 예정 일시
            </label>
            <input
              id="visitDateTime"
              type="datetime-local"
              value={visitDateTime}
              onChange={(e) => onVisitDateTime(e.target.value)}
              className={inputBaseClass}
              style={{ borderColor: theme.borderSoft }}
            />
          </div>
          {"address" in guide && guide.address && (
            <div
              className="rounded-xl border bg-white px-4 py-3 text-sm"
              style={{ borderColor: theme.borderSoft }}
            >
              <span
                className="block text-xs font-semibold tracking-wider uppercase"
                style={{ color: theme.textSecondary }}
              >
                {guide.address.label}
              </span>
              <span
                className="mt-1 block"
                style={{ color: theme.textPrimary, fontWeight: 600 }}
              >
                {guide.address.value}
              </span>
            </div>
          )}
        </div>
      )}

      {receiptType === "PARCEL" && (
        <div className="mt-4">
          <span
            className="mb-2 block text-xs font-semibold tracking-tight"
            style={{ color: theme.textSecondary }}
          >
            택배 방식 선택
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {cf.dynamicGuides.PARCEL.extras
              ?.find((e) => e.name === "parcelMethod")
              ?.options?.map((opt) => {
                const active = parcelMethod === opt.value;
                return (
                  <label key={opt.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="parcelMethod"
                      value={opt.value}
                      checked={active}
                      onChange={() => onParcelMethod(opt.value)}
                      className="peer sr-only"
                    />
                    <span
                      className="flex h-full items-center justify-center rounded-2xl border px-4 py-3 text-center text-sm font-semibold transition-all"
                      style={{
                        borderColor: active
                          ? theme.accentColor
                          : theme.borderSoft,
                        background: active ? theme.accentColor : "#ffffff",
                        color: active ? "#ffffff" : theme.textPrimary,
                      }}
                    >
                      {opt.label}
                    </span>
                  </label>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoAttacher({
  entries,
  onChange,
  max,
}: {
  entries: { file: File; description: string }[];
  onChange: (next: { file: File; description: string }[]) => void;
  max: number;
}) {
  return (
    <div>
      <label className={labelClass}>
        {cf.labels.photos}{" "}
        <span className="ml-1 text-xs font-normal" style={{ color: theme.textSecondary }}>
          (선택, 최대 {max}장)
        </span>
      </label>

      {entries.map((entry, idx) => (
        <div
          key={idx}
          className="mb-2 flex items-start gap-3 rounded-2xl border bg-white p-3"
          style={{ borderColor: theme.borderSoft }}
        >
          <img
            src={URL.createObjectURL(entry.file)}
            alt={`첨부 ${idx + 1}`}
            className="h-16 w-16 shrink-0 rounded-xl border object-cover"
            style={{ borderColor: theme.borderSoft }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-600">{entry.file.name}</p>
            {entry.description && (
              <p className="mt-0.5 text-xs text-slate-400">{entry.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(entries.filter((_, i) => i !== idx))}
            aria-label="첨부 삭제"
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {entries.length < max && (
        <PhotoAdder
          onAdd={(file, description) =>
            onChange([...entries, { file, description }])
          }
        />
      )}
    </div>
  );
}

function PhotoAdder({
  onAdd,
}: {
  onAdd: (file: File, description: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [desc, setDesc] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type.startsWith("image/")) setFile(selected);
    e.target.value = "";
  };

  const handleAdd = () => {
    if (!file) return;
    onAdd(file, desc.trim());
    setFile(null);
    setDesc("");
  };

  if (!file) {
    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-4 text-sm font-medium transition-all hover:border-blue-400 hover:text-blue-600"
        style={{ borderColor: theme.borderSoft, color: theme.textSecondary }}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        사진 첨부 버튼
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSelect}
        />
      </button>
    );
  }

  return (
    <div
      className="space-y-2 rounded-2xl border p-3"
      style={{
        borderColor: theme.accentSoft,
        background: `${theme.accentSoft}40`,
      }}
    >
      <div className="flex items-center gap-3">
        <img
          src={URL.createObjectURL(file)}
          alt="미리보기"
          className="h-16 w-16 shrink-0 rounded-xl border object-cover"
          style={{ borderColor: theme.borderSoft }}
        />
        <p className="min-w-0 flex-1 truncate text-xs text-slate-600">
          {file.name}
        </p>
      </div>
      <input
        type="text"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="사진 설명 (선택사항)"
        className="w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        style={{ borderColor: theme.borderSoft }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-xl px-4 py-2 text-xs font-bold text-white"
          style={{ background: theme.accentColor }}
        >
          추가
        </button>
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setDesc("");
          }}
          className="rounded-xl border px-4 py-2 text-xs font-semibold"
          style={{ borderColor: theme.borderSoft, color: theme.textSecondary }}
        >
          취소
        </button>
      </div>
    </div>
  );
}
