import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // edit 서브도메인 → /editor 리라이트는 src/proxy.ts 미들웨어에서 처리.
  // (next.config.ts beforeFiles 리라이트는 source:"/" 매칭이 불안정하여 미들웨어로 이전)
};

export default nextConfig;
