"use client";

import { useEffect, useRef, useState } from "react";
import defaults from "@/data/mainPageData.json";
import type { AboutSectionData, ThemeData } from "@/types/sections";

const DEFAULT_ABOUT = defaults.about as AboutSectionData;
const DEFAULT_THEME = defaults.theme as ThemeData;

interface AboutSectionProps {
  data?: AboutSectionData;
  theme?: ThemeData;
}

function useReveal<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T>(null);
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
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

export function AboutSection({
  data: about = DEFAULT_ABOUT,
  theme = DEFAULT_THEME,
}: AboutSectionProps) {
  const { ref: headerRef, visible: headerVisible } = useReveal<HTMLDivElement>();
  const { ref: closingRef, visible: closingVisible } = useReveal<HTMLDivElement>();

  return (
    <section
      id="about"
      className="relative bg-white"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
        <div
          ref={headerRef}
          className="text-center"
          style={{
            opacity: headerVisible ? 1 : 0,
            transform: headerVisible ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 800ms ease-out, transform 800ms ease-out",
          }}
        >
          <span
            className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: theme.accentColor }}
          >
            {about.eyebrow}
          </span>
          <h2
            className="mx-auto mt-5 max-w-3xl text-3xl leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: theme.textPrimary, fontWeight: 800 }}
          >
            {(about.title ?? '').split("\n").map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </h2>
          <p
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
            style={{ color: theme.textSecondary }}
          >
            {about.intro}
          </p>
        </div>

        <ul className="mt-16 grid gap-px overflow-hidden rounded-3xl border bg-slate-100 sm:mt-20 sm:grid-cols-2"
          style={{ borderColor: theme.borderSoft }}
        >
          {(about.statements ?? []).map((stmt, i) => (
            <Statement
              key={stmt.lead}
              index={i}
              lead={stmt.lead}
              body={stmt.body}
              theme={theme}
            />
          ))}
        </ul>

        <div
          ref={closingRef}
          className="mt-20 text-center sm:mt-24"
          style={{
            opacity: closingVisible ? 1 : 0,
            transform: closingVisible ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 800ms ease-out, transform 800ms ease-out",
          }}
        >
          <p
            className="mx-auto max-w-2xl text-xl leading-relaxed sm:text-2xl"
            style={{ color: theme.textPrimary, fontWeight: 600 }}
          >
            “{about.closing}”
          </p>
          <div
            className="mx-auto mt-8 h-px w-16"
            style={{ background: theme.accentColor }}
          />
        </div>
      </div>
    </section>
  );
}

function Statement({
  index,
  lead,
  body,
  theme,
}: {
  index: number;
  lead: string;
  body: string;
  theme: ThemeData;
}) {
  const { ref, visible } = useReveal<HTMLLIElement>();
  return (
    <li
      ref={ref}
      className="bg-white p-7 sm:p-9"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 700ms ease-out ${index * 80}ms, transform 700ms ease-out ${index * 80}ms`,
      }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="text-xs font-mono font-semibold"
          style={{ color: theme.accentColor }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <h3
          className="text-xl tracking-tight sm:text-2xl"
          style={{ color: theme.textPrimary, fontWeight: 700 }}
        >
          {lead}
        </h3>
      </div>
      <p
        className="mt-4 text-sm leading-relaxed sm:text-base"
        style={{ color: theme.textSecondary }}
      >
        {body}
      </p>
    </li>
  );
}
