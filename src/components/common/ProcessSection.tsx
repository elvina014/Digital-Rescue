"use client";

import { useEffect, useRef, useState } from "react";
import defaults from "@/data/mainPageData.json";
import type { ProcessSectionData, ThemeData } from "@/types/sections";
import { ServiceIcon, type IconName } from "./icons";

const DEFAULT_PROCESS = defaults.process as ProcessSectionData;
const DEFAULT_THEME = defaults.theme as ThemeData;

function smoothScrollTo(target: string) {
  const id = target.startsWith("#") ? target.slice(1) : target;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.location.hash = target;
  }
}

interface ProcessSectionProps {
  data?: ProcessSectionData;
  theme?: ThemeData;
}

export function ProcessSection({
  data = DEFAULT_PROCESS,
  theme = DEFAULT_THEME,
}: ProcessSectionProps) {
  return (
    <section
      id="process"
      className="relative bg-slate-50"
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
            {(data.title ?? '').split("\n").map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </h2>
          <p
            className="mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg"
            style={{ color: theme.textSecondary }}
          >
            {data.subtitle}
          </p>
          <p
            className="mt-3 inline-flex items-center gap-1.5 text-xs sm:text-sm"
            style={{ color: theme.textSecondary }}
          >
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: theme.accentColor }}
            />
            {data.ctaHint}
          </p>
        </div>

        <div className="relative mt-16 sm:mt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 lg:block"
            style={{
              background: `linear-gradient(to bottom, transparent 0%, ${theme.borderSoft} 12%, ${theme.borderSoft} 88%, transparent 100%)`,
            }}
          />

          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            {(data.steps ?? []).map((step, i) => (
              <ProcessCard
                key={step.step ?? i}
                index={i}
                step={step.step ?? ''}
                title={step.title ?? ''}
                description={step.description ?? ''}
                iconName={step.iconName as IconName}
                ctaTarget={data.ctaTarget ?? '#'}
                theme={theme}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ProcessCard({
  index,
  step,
  title,
  description,
  iconName,
  ctaTarget,
  theme,
}: {
  index: number;
  step: string;
  title: string;
  description: string;
  iconName: IconName;
  ctaTarget: string;
  theme: ThemeData;
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
        transition: `opacity 700ms ease-out ${index * 90}ms, transform 700ms ease-out ${index * 90}ms`,
      }}
    >
      <a
        href={ctaTarget ?? '#'}
        onClick={(e) => {
          e.preventDefault();
          smoothScrollTo(ctaTarget);
        }}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-blue-300 hover:shadow-[0_20px_40px_-22px_rgba(37,99,235,0.4)] sm:p-7"
        style={{ borderColor: theme.borderSoft }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100"
          style={{ background: theme.accentColor }}
        />

        <div className="flex items-center justify-between">
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
            style={{
              background: theme.accentSoft,
              color: theme.accentColor,
            }}
          >
            <ServiceIcon name={iconName} className="h-6 w-6" />
          </span>
          <span
            className="font-mono text-2xl font-extrabold tracking-tight"
            style={{ color: theme.borderSoft }}
          >
            {step}
          </span>
        </div>

        <h3
          className="mt-5 text-lg tracking-tight transition-colors duration-300 group-hover:text-blue-700 sm:text-xl"
          style={{ color: theme.textPrimary, fontWeight: 700 }}
        >
          {title}
        </h3>
        <p
          className="mt-2 text-sm leading-relaxed sm:text-[15px]"
          style={{ color: theme.textSecondary }}
        >
          {description}
        </p>

        <span
          className="mt-5 inline-flex items-center gap-1 pt-1 text-xs font-semibold sm:text-sm"
          style={{ color: theme.accentColor }}
        >
          바로 접수
          <svg
            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
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
      </a>
    </li>
  );
}
