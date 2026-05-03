"use client";

import { useEffect, useRef, useState } from "react";
import defaults from "@/data/mainPageData.json";
import type { ServicesSectionData, ThemeData } from "@/types/sections";
import { ServiceIcon, type IconName } from "@/components/common/icons";

const DEFAULT_SERVICES = defaults.services as ServicesSectionData;
const DEFAULT_THEME = defaults.theme as ThemeData;

interface ServicesSectionProps {
  data?: ServicesSectionData;
  theme?: ThemeData;
}

export function ServicesSection({
  data: services = DEFAULT_SERVICES,
  theme = DEFAULT_THEME,
}: ServicesSectionProps) {
  return (
    <section
      id="services"
      className="relative bg-slate-50"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
        <div className="text-center">
          <span
            className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: theme.accentColor }}
          >
            {services.eyebrow}
          </span>
          <h2
            className="mx-auto mt-5 max-w-3xl text-3xl leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: theme.textPrimary, fontWeight: 800 }}
          >
            {services.title}
          </h2>
          <p
            className="mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg"
            style={{ color: theme.textSecondary }}
          >
            {services.subtitle}
          </p>
        </div>

        <ul className="mt-14 grid gap-5 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
          {services.items.map((item, i) => (
            <ServiceCard
              key={item.id}
              index={i}
              title={item.title}
              description={item.description}
              imageUrl={item.imageUrl}
              iconName={item.iconName as IconName}
              accent={item.accent}
              theme={theme}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ServiceCard({
  index,
  title,
  description,
  imageUrl,
  iconName,
  accent,
  theme,
}: {
  index: number;
  title: string;
  description: string;
  imageUrl: string;
  iconName: IconName;
  accent: string;
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
      className="group relative overflow-hidden rounded-3xl border bg-white p-7 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)] sm:p-8"
      style={{
        borderColor: theme.borderSoft,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 700ms ease-out ${index * 80}ms, transform 700ms ease-out ${index * 80}ms, box-shadow 300ms ease-out, border-color 300ms ease-out`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100"
        style={{ background: accent }}
      />

      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl transition-colors duration-300 group-hover:scale-105"
        style={{
          background: `${accent}15`,
          color: accent,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full rounded-2xl object-cover"
          />
        ) : (
          <ServiceIcon name={iconName} className="h-8 w-8" />
        )}
      </div>

      <h3
        className="mt-6 text-xl tracking-tight transition-colors duration-300 sm:text-2xl"
        style={{ color: theme.textPrimary, fontWeight: 700 }}
      >
        {title}
      </h3>
      <p
        className="mt-3 text-sm leading-relaxed sm:text-base"
        style={{ color: theme.textSecondary }}
      >
        {description}
      </p>

      <span
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ color: accent }}
      >
        자세히 보기
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </span>
    </li>
  );
}
