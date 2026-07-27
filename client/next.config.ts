import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework/version to anyone scanning the deployment.
  poweredByHeader: false,

  // Keep /sales canonical rather than also answering /sales/.
  trailingSlash: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Block the app being framed by another site — clickjacking a billing counter
          // would let an attacker overlay their own controls on real invoice actions.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The app uses none of these APIs; denying them removes the prompts entirely.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
