import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/[[...route]]": ["./node_modules/yt-dlp-exec/bin/**/*"],
  },
};

export default nextConfig;
