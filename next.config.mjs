import withPWA from "@ducanh2912/next-pwa"

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
}

export default withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig)
