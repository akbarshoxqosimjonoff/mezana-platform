/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdfkit", "pg", "iyzipay"],
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" }
    ]
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://plausible.io https://www.googletagmanager.com https://sandbox-api.iyzipay.com https://api.iyzipay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com https://sandbox-api.iyzipay.com https://api.iyzipay.com",
      "connect-src 'self' https://challenges.cloudflare.com https://plausible.io https://www.google-analytics.com https://sandbox-api.iyzipay.com https://api.iyzipay.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://sandbox-api.iyzipay.com https://api.iyzipay.com"
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" }
        ]
      }
    ];
  }
};

export default nextConfig;
