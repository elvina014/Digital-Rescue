import { Suspense } from "react";
import LoginForm from "./LoginForm";

/**
 * 관리자 포털 로그인 페이지
 * login.digital-rescue.com/login
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* 로고 및 타이틀 */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">디지털레스큐</h1>
          <p className="mt-2 text-sm text-gray-500">
            직원 포털에 로그인하세요
          </p>
        </div>

        {/* 로그인 카드 */}
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <Suspense fallback={<div className="text-center text-sm text-gray-400">로딩 중...</div>}>
            <LoginForm />
          </Suspense>
        </div>

        {/* 하단 안내 */}
        <p className="mt-6 text-center text-xs text-gray-400">
          계정 관련 문의는 관리자에게 연락해 주세요.
        </p>
      </div>
    </div>
  );
}
