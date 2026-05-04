"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "./actions";

/**
 * 관리자 포털 로그인 폼 (클라이언트 컴포넌트)
 * Server Action을 호출하여 인증 처리
 */
export default function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);
    formData.set("redirect", redirectTo);

    try {
      const result = await loginAction(formData);
      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
      }
    } catch {
      // 세션 잔재(localStorage의 sb-* 항목)를 제거하고 재시도 유도
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-")) localStorage.removeItem(key);
        });
      } catch {
        // localStorage 접근 불가 환경이면 무시
      }
      setError("로그인 중 문제가 발생했습니다. 다시 시도해 주세요.");
      setIsLoading(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="admin@digital-rescue.com"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm
                     transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm
                     transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white
                   transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50
                   disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
