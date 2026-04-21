/**
 * Next.js 미들웨어 진입점
 * proxy.ts의 서브도메인 라우팅 + Supabase 세션 갱신 로직을 실행
 *
 * ⚠️ Next.js는 이 파일(middleware.ts)만 미들웨어로 인식합니다.
 * 실제 로직은 src/proxy.ts에 있으며, 이 파일에서 re-export합니다.
 */
export { proxy as default, config } from "./proxy";
