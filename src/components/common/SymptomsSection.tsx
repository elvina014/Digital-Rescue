"use client";

import { useEffect, useRef, useState } from "react";
import defaults from "@/data/mainPageData.json";
import type { SymptomsSectionData, ThemeData } from "@/types/sections";
import { ServiceIcon, type IconName } from "./icons";
import { SymptomModal, type SymptomData } from "./SymptomModal";

const DEFAULT_SYMPTOMS = defaults.symptoms as SymptomsSectionData;
const DEFAULT_THEME = defaults.theme as ThemeData;

interface SymptomsSectionProps {
  data?: SymptomsSectionData;
  theme?: ThemeData;
}

export function SymptomsSection({
  data = DEFAULT_SYMPTOMS,
  theme = DEFAULT_THEME,
}: SymptomsSectionProps) {
  const [active, setActive] = useState<SymptomData | null>(null);

  return (
    <section
      id="symptoms"
      className="relative bg-white"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
        <div className="text-center">
          <span
            className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: theme.accentColor }}
          >
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
        </div>

        <ul className="mt-14 grid grid-cols-2 gap-4 sm:mt-16 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {(data.items ?? []).map((item, i) => (
            <SymptomCard
              key={item.id}
              index={i}
              item={item}
              theme={theme}
              onSelect={() => setActive(item)}
            />
          ))}
        </ul>
      </div>

      <SymptomModal
        symptom={active}
        onClose={() => setActive(null)}
        theme={theme}
        ctaLabel={data.ctaLabel}
        ctaHref={data.ctaHref}
      />
    </section>
  );
}

function SymptomCard({
  index,
  item,
  theme,
  onSelect,
}: {
  index: number;
  item: SymptomData;
  theme: ThemeData;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <li
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 600ms ease-out ${index * 60}ms, transform 600ms ease-out ${index * 60}ms`,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="group relative flex h-full w-full flex-col items-start overflow-hidden rounded-3xl border bg-white p-5 text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_18px_40px_-22px_rgba(37,99,235,0.45)] sm:p-6"
        style={{ borderColor: theme.borderSoft }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/0 opacity-0 transition-opacity duration-300 group-hover:from-blue-50 group-hover:to-white group-hover:opacity-100"
        />

        <div
          className="relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-300 group-hover:scale-110"
          style={{
            background: theme.accentSoft,
            color: theme.accentColor,
          }}
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="h-full w-full rounded-2xl object-cover"
            />
          ) : (
            <ServiceIcon name={item.iconName as IconName} className="h-6 w-6" />
          )}
        </div>

        <h3
          className="relative mt-4 text-base tracking-tight transition-colors duration-300 group-hover:text-blue-700 sm:text-lg"
          style={{ color: theme.textPrimary, fontWeight: 700 }}
        >
          {item.title}
        </h3>
        <p
          className="relative mt-1.5 text-xs leading-relaxed sm:text-sm"
          style={{ color: theme.textSecondary }}
        >
          {item.shortDescription}
        </p>

        <span
          className="relative mt-auto inline-flex items-center gap-1 pt-4 text-xs font-semibold transition-colors duration-300 sm:text-sm"
          style={{ color: theme.accentColor }}
        >
          자세히 보기
          <svg
            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </span>
      </button>
    </li>
  );
}
