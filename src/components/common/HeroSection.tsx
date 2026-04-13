import Link from "next/link";

/**
 * Hero 섹션
 * 신뢰감을 주는 네이비 블루 히어로 배너 + CTA
 */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
      {/* 배경 패턴 */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZ2LTRoMnY0aC0yem0tNiA2di00aDJ2NGgtMnptMC02di00aDJ2NGgtMnoiLz48L2c+PC9nPjwvc3ZnPg==')]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
        <div className="max-w-2xl">
          <div className="mb-4 inline-block rounded-full bg-blue-500/20 px-4 py-1.5 text-xs font-semibold text-blue-300">
            직영 운영 · 투명한 전자 견적
          </div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            노트북·PC 수리는
            <br />
            <span className="text-blue-400">디지털레스큐</span>에
            맡기세요
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-300 sm:text-lg">
            과도한 견적, 외주로 인한 책임 회피는 이제 그만.
            <br className="hidden sm:block" />
            자체 기술진이 직접 수리하고, 모든 과정을 투명하게 공개합니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="#contact"
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/40"
            >
              무료 견적 받기
            </Link>
            <Link
              href="#process"
              className="rounded-xl border border-slate-500 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-white hover:text-white"
            >
              수리 과정 보기
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
