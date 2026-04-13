import Link from "next/link";

/**
 * 모바일 하단 고정 CTA 버튼
 * 모바일 뷰에서만 표시 (md 이상 숨김)
 * 지침서: 모바일에서 '전화 걸기' / '카톡 상담' 버튼이 화면 하단에 고정(Sticky)
 */
export function MobileCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white px-4 py-3 md:hidden">
      <div className="flex gap-3">
        <Link
          href="tel:010-0000-0000"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          전화 상담
        </Link>
        <Link
          href="https://pf.kakao.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-400 py-3 text-sm font-semibold text-yellow-900 transition-colors hover:bg-yellow-500"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.72 1.794 5.11 4.508 6.459l-.96 3.551a.375.375 0 00.573.397l4.2-2.8c.55.072 1.11.109 1.679.109 5.523 0 10-3.463 10-7.716S17.523 3 12 3z" />
          </svg>
          카톡 문의
        </Link>
      </div>
    </div>
  );
}
