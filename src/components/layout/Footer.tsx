import Link from "next/link";

/**
 * 대고객 페이지 푸터
 * 상호명, 대표자, 주소, 사업자번호, 면책 조항 포함
 */
export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* 회사 정보 */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="text-xl font-extrabold text-white">
              디지털<span className="text-blue-400">레스큐</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed">
              직영 운영, 투명한 전자 견적.
              <br />
              노트북·PC 수리 및 데이터 복구 전문 서비스.
            </p>
          </div>

          {/* 서비스 */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
              서비스
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>노트북 수리</li>
              <li>데스크탑 PC 수리</li>
              <li>데이터 복구</li>
              <li>부품 교체 / 업그레이드</li>
            </ul>
          </div>

          {/* 고객센터 */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
              고객센터
            </h4>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="tel:010-0000-0000" className="hover:text-white">
                  전화: 010-0000-0000
                </Link>
              </li>
              <li>
                <Link href="https://pf.kakao.com/" className="hover:text-white" target="_blank" rel="noopener noreferrer">
                  카카오톡 문의
                </Link>
              </li>
              <li>영업시간: 평일 10:00 ~ 19:00</li>
            </ul>
          </div>

          {/* 사업자 정보 */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
              사업자 정보
            </h4>
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed">
              <li>상호명: 디지털레스큐</li>
              <li>대표자: 홍길동</li>
              <li>사업자등록번호: 000-00-00000</li>
              <li>주소: 서울특별시 OO구 OO로 00, 0층</li>
            </ul>
          </div>
        </div>

        {/* 면책 조항 */}
        <div className="mt-10 border-t border-slate-700 pt-6">
          <p className="text-center text-xs leading-relaxed text-slate-500">
            본 센터는 제조사 공식 서비스 센터가 아닌 독립적인 사설 수리 전문점입니다.
            <br />
            제조사의 공식 보증과는 별개로 운영되며, 수리 후 자체 보증을 제공합니다.
          </p>
          <p className="mt-4 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} 디지털레스큐. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
