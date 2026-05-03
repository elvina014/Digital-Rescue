"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import defaults from "@/data/mainPageData.json";
import type { HeroSectionData, ThemeData } from "@/types/sections";

type Cta = {
  label: string;
  href: string;
  variant: "primary" | "ghost";
};

const DEFAULT_HERO = defaults.hero as HeroSectionData;
const DEFAULT_THEME = defaults.theme as ThemeData;

interface HeroSectionProps {
  data?: HeroSectionData;
  theme?: ThemeData;
}

export function HeroSection({
  data: hero = DEFAULT_HERO,
  theme = DEFAULT_THEME,
}: HeroSectionProps) {
  const [mounted, setMounted] = useState(false);
  const blobsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const el = blobsRef.current;
    if (!el) return;
    const strength = hero.animation.parallaxStrength;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const offset = window.scrollY * strength;
        el.style.transform = `translate3d(0, ${offset}px, 0)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      id="hero"
      className="relative isolate overflow-hidden bg-white"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div
        ref={blobsRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 will-change-transform"
      >
        {hero.background.blobs.map((blob, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-70"
            style={{
              left: blob.x,
              top: blob.y,
              width: blob.size,
              height: blob.size,
              background: blob.color,
              filter: `blur(${blob.blur})`,
            }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at top, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 70%, #ffffff 100%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-6xl px-5 pt-20 pb-24 sm:px-8 sm:pt-28 sm:pb-32 lg:pt-36 lg:pb-40">
        <div
          className="mx-auto max-w-3xl text-center"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(24px)",
            transition: `opacity ${hero.animation.fadeInDurationMs}ms ease-out, transform ${hero.animation.fadeInDurationMs}ms ease-out`,
          }}
        >
          {hero.badge.show && (
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide"
              style={{
                borderColor: theme.borderSoft,
                color: theme.accentColor,
                background: theme.surfaceMuted,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: theme.accentColor }}
              />
              {hero.badge.text}
            </span>
          )}

          <h1
            className="mt-6 text-4xl leading-[1.1] sm:text-5xl lg:text-6xl"
            style={{
              fontWeight: hero.headline.weight,
              letterSpacing: hero.headline.tracking === "tight" ? "-0.025em" : "normal",
              color: theme.textPrimary,
            }}
          >
            {hero.headline.lines.map((line, i) => (
              <span
                key={i}
                className="block"
                style={{
                  color: line.emphasis ? theme.accentColor : theme.textPrimary,
                  transitionDelay: `${i * 120}ms`,
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(20px)",
                  transition: `opacity 700ms ease-out ${i * 120}ms, transform 700ms ease-out ${i * 120}ms`,
                }}
              >
                {line.text}
              </span>
            ))}
          </h1>

          <p
            className="mx-auto mt-7 max-w-xl text-base leading-relaxed sm:text-lg"
            style={{ color: theme.textSecondary }}
          >
            {hero.subheadline}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {(hero.ctas as Cta[]).map((cta) => {
              const isPrimary = cta.variant === "primary";
              return (
                <Link
                  key={cta.label}
                  href={cta.href}
                  className="inline-flex items-center justify-center rounded-2xl px-7 py-3.5 text-sm font-semibold transition-all duration-200 sm:text-base"
                  style={
                    isPrimary
                      ? {
                          background: theme.accentColor,
                          color: "#ffffff",
                          boxShadow: "0 12px 30px -10px rgba(37, 99, 235, 0.45)",
                        }
                      : {
                          background: "transparent",
                          color: theme.textPrimary,
                          border: `1px solid ${theme.borderSoft}`,
                        }
                  }
                >
                  {cta.label}
                  {isPrimary && (
                    <svg
                      className="ml-1.5 h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        <div
          className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-3 sm:mt-20 sm:grid-cols-3 sm:gap-4"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(24px)",
            transition: `opacity 900ms ease-out 400ms, transform 900ms ease-out 400ms`,
          }}
        >
          {hero.trustStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border bg-white/70 px-5 py-5 text-center backdrop-blur-md sm:py-6"
              style={{ borderColor: theme.borderSoft }}
            >
              <div
                className="text-2xl font-extrabold tracking-tight sm:text-3xl"
                style={{ color: theme.textPrimary }}
              >
                {stat.value}
              </div>
              <div
                className="mt-1 text-xs sm:text-sm"
                style={{ color: theme.textSecondary }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
