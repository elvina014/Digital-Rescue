import Link from "next/link";
import defaults from "@/data/mainPageData.json";
import type { FooterData, ThemeData } from "@/types/sections";

const DEFAULT_FOOTER = defaults.footer as FooterData;
const DEFAULT_THEME = defaults.theme as ThemeData;

interface FooterProps {
  data?: FooterData;
  theme?: ThemeData;
}

/**
 * 대고객 페이지 푸터 — DB(page_contents → main:footer) 에서 주입.
 * 데이터 미주입 시 src/data/mainPageData.json 의 footer 값으로 폴백.
 *
 * 디자인:
 *   - 다크 배경은 의도적으로 고정 색(slate-900) — 이 슬롯은 theme 토큰과 별개.
 *   - 강조색만 theme.accentColor 로 동적 적용해 브랜드 컬러 변경에 반응.
 *   - 그 외 색은 다크 배경 위 가독성을 보장하는 슬레이트 계열 유지.
 */
export function Footer({ data = DEFAULT_FOOTER, theme = DEFAULT_THEME }: FooterProps) {
  const year = new Date().getFullYear();
  const copyright = data.copyright.replace(/%YEAR%/g, String(year));

  return (
    <footer
      className="bg-slate-900 text-slate-400"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* 회사 정보 */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="text-xl font-extrabold text-white">
              {data.brand.leadText}
              <span style={{ color: theme.accentColor }}>{data.brand.accentText}</span>
            </Link>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
              {data.brand.intro}
            </p>
          </div>

          {/* 동적 컬럼 (서비스 / 고객센터 등) */}
          {data.columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
                {col.title}
              </h4>
              <ul className="mt-3 space-y-2 text-sm">
                {col.items.map((item, i) => (
                  <li key={`${col.title}-${i}`}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="hover:text-white"
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noopener noreferrer" : undefined}
                      >
                        {item.label}
                      </Link>
                    ) : (
                      item.label
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* 사업자 정보 */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
              사업자 정보
            </h4>
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed">
              {data.business.map((row) => (
                <li key={row.label}>
                  {row.label}: {row.value}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 면책 조항 + 저작권 */}
        <div className="mt-10 border-t border-slate-700 pt-6">
          <p className="whitespace-pre-line text-center text-xs leading-relaxed text-slate-500">
            {data.disclaimer}
          </p>
          <p className="mt-4 text-center text-xs text-slate-500">
            {copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
