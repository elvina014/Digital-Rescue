const STEPS = [
  {
    step: "01",
    title: "접수",
    description: "전화, 카톡, 웹 폼을 통해 고장 증상을 접수합니다.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
    ),
  },
  {
    step: "02",
    title: "진단",
    description: "전문 기술진이 기기를 정밀 진단하고 투명한 전자 견적을 산출합니다.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    step: "03",
    title: "수리",
    description: "고객 승인 후 자체 기술진이 직접 수리합니다. 외주 없이 직영 수리.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1a2.121 2.121 0 113-3l5.1 5.1m0 0l2.83 2.83m-2.83-2.83l5.1-5.1a2.121 2.121 0 113 3l-5.1 5.1m-2.83-2.83L8.59 18m0 0l-2.83 2.83m2.83-2.83l2.83-2.83" />
      </svg>
    ),
  },
  {
    step: "04",
    title: "출고",
    description: "수리 완료 후 결제 및 출고. 자체 보증 기간을 제공합니다.",
    icon: (
      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
] as const;

/**
 * 서비스 프로세스 안내 섹션 (4단계)
 */
export function ProcessSection() {
  return (
    <section id="process" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            수리 과정
          </h2>
          <p className="mt-3 text-slate-500">
            접수부터 출고까지, 투명하고 체계적인 4단계 프로세스
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((item) => (
            <div
              key={item.step}
              className="group relative rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100/50"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                  {item.icon}
                </div>
                <span className="text-2xl font-extrabold text-slate-200">
                  {item.step}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
