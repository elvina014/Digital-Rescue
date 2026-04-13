import Link from "next/link";

/**
 * 공통 헤더 컴포넌트
 * 대고객 페이지(digital-rescue.com)에서 사용
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-white">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold">
          디지털레스큐
        </Link>
        <nav className="hidden gap-6 md:flex">
          <Link href="/" className="hover:text-blue-600">
            홈
          </Link>
          <Link href="#services" className="hover:text-blue-600">
            서비스
          </Link>
          <Link href="#process" className="hover:text-blue-600">
            수리 과정
          </Link>
          <Link href="#contact" className="hover:text-blue-600">
            문의
          </Link>
        </nav>
      </div>
    </header>
  );
}
