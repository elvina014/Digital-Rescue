/**
 * 공통 푸터 컴포넌트
 * 대고객 페이지(digital-rescue.com)에서 사용
 */
export function Footer() {
  return (
    <footer className="border-t bg-gray-900 text-gray-300">
      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-semibold text-white">디지털레스큐</h3>
            <p className="mt-2 text-sm">
              직영 운영, 투명한 전자 견적.
              <br />
              노트북·PC 수리 및 데이터 복구 전문 서비스.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white">서비스</h4>
            <ul className="mt-2 space-y-1 text-sm">
              <li>노트북 수리</li>
              <li>PC 수리</li>
              <li>데이터 복구</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white">고객센터</h4>
            <ul className="mt-2 space-y-1 text-sm">
              <li>전화 상담</li>
              <li>카톡 상담</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-700 pt-4 text-center text-sm">
          © {new Date().getFullYear()} 디지털레스큐. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
