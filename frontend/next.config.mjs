/** @type {import('next').NextConfig} */
const internalApiBaseUrl = process.env.NEXT_INTERNAL_API_BASE_URL ?? "http://localhost:8000"

const nextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true,
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

export default nextConfig
