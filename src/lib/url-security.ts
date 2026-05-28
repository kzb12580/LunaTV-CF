/**
 * URL 安全验证工具
 * 防止 SSRF 攻击，限制代理请求只能访问允许的域名
 */

// 允许代理的域名白名单
const ALLOWED_DOMAINS = [
  'img1.doubanio.com',
  'img2.doubanio.com',
  'img3.doubanio.com',
  'img9.doubanio.com',
  'img.doubanio.com',
  'movie.douban.com',
  'doubanio.com',
  'infura-ipfs.io',
  'ipfs.io',
  'cloudflare-ipfs.com',
  'lain.bgm.tv',
];

// 允许代理的 URL 模式（正则）
const ALLOWED_PATTERNS: RegExp[] = [
  /^https?:\/\/.*\.doubanio\.com\/.*$/i,
  /^https?:\/\/.*\.douban\.com\/.*$/i,
  /^https?:\/\/.*\.infura-ipfs\.io\/.*$/i,
  /^https?:\/\/.*\.cloudflare-ipfs\.com\/.*$/i,
  /^https?:\/\/lain\.bgm\.tv\/.*$/i,
];

// 禁止的内网/保留 IP 范围
const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

/**
 * 验证 URL 是否在允许的代理范围内
 * @param url 要验证的 URL
 * @param mode 验证模式：'image' 仅允许图片域名，'m3u8' 允许直播源域名，'open' 允许所有非内网地址
 */
export function isAllowedProxyUrl(
  url: string,
  mode: 'image' | 'm3u8' | 'open' = 'open'
): boolean {
  try {
    const parsed = new URL(url);

    // 只允许 http/https 协议
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // 禁止内网/保留 IP
    if (BLOCKED_IP_RANGES.some((pattern) => pattern.test(hostname))) {
      return false;
    }

    // image 模式：严格白名单
    if (mode === 'image') {
      return (
        ALLOWED_DOMAINS.some(
          (domain) => hostname === domain || hostname.endsWith('.' + domain)
        ) || ALLOWED_PATTERNS.some((pattern) => pattern.test(url))
      );
    }

    // m3u8 模式：允许直播源域名（通过 config.LiveConfig 配置的源）
    // 这些源已经在 m3u8 route 中通过 config 验证了 source key
    // 所以 m3u8 代理不需要额外的域名限制，但仍然禁止内网地址
    if (mode === 'm3u8') {
      return !BLOCKED_IP_RANGES.some((pattern) => pattern.test(hostname));
    }

    // open 模式：仅禁止内网地址
    return !BLOCKED_IP_RANGES.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}
