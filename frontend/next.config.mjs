/** @type {import('next').NextConfig} */
const internalApiBaseUrl = process.env.NEXT_INTERNAL_API_BASE_URL ?? "http://localhost:8000"

// The student edition is a plain static site that the local backend serves next to /api, so it
// needs no Node server and no rewrites. Built by student/build.ps1 with NEXT_PUBLIC_APP_MODE=local.
const staticStudentConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // A separate folder keeps this build from disturbing a running server build's .next.
  distDir: ".next-local",
  turbopack: {
    root: import.meta.dirname,
  },
}

const serverConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true,
  experimental: {
    proxyClientMaxBodySize: "550mb",
    proxyTimeout: 30 * 60_000,
  },
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/projects",
        destination: `${internalApiBaseUrl}/api/projects/`,
      },
      {
        source: "/api/projects/",
        destination: `${internalApiBaseUrl}/api/projects/`,
      },
      {
        source: "/api/:path*",
        destination: `${internalApiBaseUrl}/api/:path*`,
      },
      {
        source: "/docs",
        destination: `${internalApiBaseUrl}/docs`,
      },
      {
        source: "/docs/:path*",
        destination: `${internalApiBaseUrl}/docs/:path*`,
      },
      {
        source: "/openapi.json",
        destination: `${internalApiBaseUrl}/openapi.json`,
      },
      {
        source: "/redoc",
        destination: `${internalApiBaseUrl}/redoc`,
      },
    ]
  },
}

export default process.env.NEXT_PUBLIC_APP_MODE === "local" ? staticStudentConfig : serverConfig
