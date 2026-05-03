import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          // edit 서브도메인 전체 → /editor 로 내부 리라이트 (브라우저 URL 유지)
          // ^edit\. 패턴: edit.digital-rescue.com, edit.localhost:3000 모두 매칭
          source: "/",
          has: [{ type: "host", value: "^edit\\." }],
          destination: "/editor",
        },
      ],
    };
  },
};

export default nextConfig;
