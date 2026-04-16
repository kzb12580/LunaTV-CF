/** @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

// Cloudflare Pages 检测
const isCFPages = process.env.CF_PAGES === '1' || process.env.NEXT_PUBLIC_CF_PAGES === 'true';

const nextConfig = {
  // Cloudflare Pages 使用 export 模式，Docker 使用 standalone
  output: isCFPages ? 'export' : 'standalone',
  
  eslint: {
    dirs: ['src'],
  },
  reactStrictMode: false,
  swcMinify: false,
  
  experimental: {
    instrumentationHook: process.env.NODE_ENV === 'production',
  },
  
  // 图片配置
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  
  webpack(config) {
    // SVG 处理
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.('.svg')
    );
    
    config.module.rules.push(
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/,
      },
      {
        test: /\.svg$/i,
        issuer: { not: /\.(css|scss|sass)$/ },
        resourceQuery: { not: /url/ },
        loader: '@svgr/webpack',
        options: {
          dimensions: false,
          titleProp: true,
        },
      }
    );
    
    fileLoaderRule.exclude = /\.svg$/i;
    
    // Cloudflare 兼容性
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      crypto: false,
      fs: false,
      path: false,
    };
    
    return config;
  },
};

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development' || isCFPages,
  register: true,
  skipWaiting: true,
});

module.exports = withPWA(nextConfig);
