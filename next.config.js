/** @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const nextConfig = {
  // 不使用 static export，让 @cloudflare/next-on-pages 处理
  eslint: {
    dirs: ['src'],
  },
  reactStrictMode: false,
  swcMinify: false,
  experimental: {
    instrumentationHook: process.env.NODE_ENV === 'production',
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  webpack(config) {
    const fileLoaderRule = config.module.rules.find(
      (rule) => rule.test?.test?.('.svg')
    );
    config.module.rules.push(
      { ...fileLoaderRule, test: /\.svg$/i, resourceQuery: /url/ },
      {
        test: /\.svg$/i,
        issuer: { not: /\.(css|scss|sass)$/ },
        resourceQuery: { not: /url/ },
        loader: '@svgr/webpack',
        options: { dimensions: false, titleProp: true },
      }
    );
    fileLoaderRule.exclude = /\.svg$/i;
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false, tls: false, crypto: false, fs: false, path: false,
    };
    return config;
  },
};

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: true, // Cloudflare 不需要 PWA
  register: true,
  skipWaiting: true,
});

module.exports = withPWA(nextConfig);
