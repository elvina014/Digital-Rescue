"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import defaults from "@/data/mainPageData.json";
import type { ServiceItem, ServicesSectionData, ThemeData } from "@/types/sections";
import { ServiceIcon, type IconName } from "@/components/common/icons";

const DEFAULT_SERVICES = defaults.services as ServicesSectionData;
const DEFAULT_THEME = defaults.theme as ThemeData;
const DEFAULT_MODAL_DETAILS = new Map(
  DEFAULT_SERVICES.items.map((item) => [item.id, item.modalDetails ?? []])
);

interface ServicesSectionProps {
  data?: ServicesSectionData;
  theme?: ThemeData;
  previewMode?: boolean;
}

export function ServicesSection({
  data: services = DEFAULT_SERVICES,
  theme = DEFAULT_THEME,
  previewMode = false,
}: ServicesSectionProps) {
  const [active, setActive] = useState<ServiceItem | null>(null);

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
          {(services.items ?? []).map((item, i) => (
            <ServiceCard
              key={item.id}
              index={i}
              title={item.title}
              description={item.description}
              imageUrl={item.imageUrl}
              iconName={item.iconName as IconName}
              accent={item.accent}
              theme={theme}
              onSelect={() => setActive(normalizeServiceItem(item))}
            />
          ))}
        </ul>
      </div>

      <ServiceModal
        service={active}
        onClose={() => setActive(null)}
        theme={theme}
        previewMode={previewMode}
      />
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
  onSelect,
}: {
  index: number;
  title: string;
  description: string;
  imageUrl: string;
  iconName: IconName;
  accent: string;
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
        transition: `opacity 700ms ease-out ${index * 80}ms, transform 700ms ease-out ${index * 80}ms`,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="group relative h-full w-full overflow-hidden rounded-3xl border bg-white p-7 text-left transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)] focus:outline-none focus:ring-4 focus:ring-blue-100 sm:p-8"
        style={{ borderColor: theme.borderSoft }}
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
          className="mt-3 whitespace-pre-line text-sm leading-relaxed sm:text-base"
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
      </button>
    </li>
  );
}

function ServiceModal({
  service,
  onClose,
  theme,
  previewMode,
}: {
  service: ServiceItem | null;
  onClose: () => void;
  theme: ThemeData;
  previewMode: boolean;
}) {
  useEffect(() => {
    if (!service) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [service, onClose]);

  if (!service) return null;

  const details = service.modalDetails?.filter(Boolean) ?? [];
  const accent = service.accent || theme.accentColor;

  const handleConsult = (event: MouseEvent<HTMLButtonElement>) => {
    if (previewMode) {
      event.preventDefault();
      onClose();
      return;
    }

    onClose();
    window.requestAnimationFrame(() => {
      document.getElementById("contact")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-modal-title"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      style={{ fontFamily: theme.fontFamily }}
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="dr-fade-in absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
      />

      <div className="dr-modal-in relative max-h-[92vh] w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div
          className="px-6 pb-5 pt-6 sm:px-8 sm:pt-8"
          style={{
            background: `linear-gradient(135deg, ${accent}18 0%, #ffffff 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background: `${accent}18`,
                  color: accent,
                }}
              >
                {service.imageUrl ? (
                  <img
                    src={service.imageUrl}
                    alt=""
                    className="h-full w-full rounded-2xl object-cover"
                  />
                ) : (
                  <ServiceIcon
                    name={service.iconName as IconName}
                    className="h-7 w-7"
                  />
                )}
              </div>
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: accent }}
                >
                  Service Detail
                </span>
                <h3
                  id="service-modal-title"
                  className="mt-2 text-2xl tracking-tight sm:text-3xl"
                  style={{ color: theme.textPrimary, fontWeight: 800 }}
                >
                  {service.title}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[56vh] overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
          <p
            className="whitespace-pre-line text-sm leading-relaxed sm:text-base"
            style={{ color: theme.textSecondary }}
          >
            {service.description}
          </p>

          {details.length > 0 && (
            <>
              <h4
                className="mt-7 text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: theme.textSecondary }}
              >
                주요 내용
              </h4>
              <ul className="mt-3 space-y-2.5">
                {details.map((detail) => (
                  <li
                    key={detail}
                    className="flex items-start gap-2.5 text-sm leading-relaxed sm:text-base"
                    style={{ color: theme.textPrimary }}
                  >
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: accent }}
                    />
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div
          className="px-6 py-5 sm:px-8 sm:py-6"
          style={{ background: theme.surfaceMuted }}
        >
          <button
            type="button"
            onClick={handleConsult}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold transition-all duration-200 hover:brightness-110"
            style={{
              background: accent,
              color: "#ffffff",
              boxShadow: "0 14px 32px -12px rgba(37, 99, 235, 0.55)",
            }}
          >
            지금 바로 상담하기
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeServiceItem(item: ServicesSectionData["items"][number]): ServiceItem {
  return {
    ...item,
    modalDetails: Array.isArray(item.modalDetails)
      ? item.modalDetails
      : DEFAULT_MODAL_DETAILS.get(item.id) ?? [],
  };
}
