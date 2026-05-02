import type { ReactElement } from "react";

type Props = {
  className?: string;
};

const STROKE = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type IconRenderer = (props: Props) => ReactElement;

const ICONS: Record<string, IconRenderer> = {
  laptop: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <rect x="3" y="5" width="18" height="11" rx="1.8" />
      <path d="M2 19h20" />
    </svg>
  ),
  desktop: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <rect x="3" y="4" width="18" height="13" rx="1.8" />
      <path d="M9 21h6M12 17v4" />
    </svg>
  ),
  tablet: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  ),
  database: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  ),
  code: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" />
    </svg>
  ),
  power: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 3v9" />
      <path d="M5.6 7.6a8 8 0 1 0 12.8 0" />
    </svg>
  ),
  loader: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  ),
  monitor: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  "alert-triangle": ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 4l9.5 16h-19z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  ),
  droplet: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 3s-6 7-6 11.5A6 6 0 0 0 18 14.5C18 10 12 3 12 3z" />
    </svg>
  ),
  thermometer: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" />
    </svg>
  ),
  "battery-charging": ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M5 8h6l-2 4h4l-2 4" />
      <path d="M2 9v6a2 2 0 0 0 2 2h11" />
      <path d="M19 9v6" />
      <path d="M22 11v2" />
    </svg>
  ),
  "hard-drive": ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <rect x="3" y="13" width="18" height="6" rx="1.5" />
      <path d="M5 13l3-7h8l3 7" />
      <path d="M7 16h.01M11 16h.01" />
    </svg>
  ),
  inbox: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M3 13h5l1.5 2h5L16 13h5" />
      <path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5l2-8z" />
    </svg>
  ),
  search: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  wrench: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M14.7 6.3a4 4 0 0 1 5 5l-2.5-1-1.5 1.5 1 2.5a4 4 0 0 1-5-5l-7.3 7.3a2 2 0 1 0 2.8 2.8l7.3-7.3a4 4 0 0 1 .2-3.8z" />
    </svg>
  ),
  package: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  ),
  "shield-check": ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" {...STROKE}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M9 12l2.5 2.5L15.5 10" />
    </svg>
  ),
};

export type IconName = keyof typeof ICONS;

export function ServiceIcon({ name, className }: Props & { name: IconName }) {
  const Render = ICONS[name] ?? ICONS.laptop;
  return <Render className={className} />;
}
