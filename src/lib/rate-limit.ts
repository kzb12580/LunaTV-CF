/**
 * 简单的内存速率限制器
 * 用于防止暴力破解攻击
 * 注意：Cloudflare Workers 每个请求独立，内存状态不共享
 * 生产环境建议使用 Cloudflare Rate Limiting 或 KV 存储
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// 惰性清理过期条目（兼容 Edge Runtime，避免顶层 setInterval）
function cleanupExpiredEntries(): void {
  const now = Date.now();
  rateLimitStore.forEach((_entry, key) => {
    const entry = rateLimitStore.get(key);
    if (entry && now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  });
}

// 超过此条目数时触发清理
const CLEANUP_THRESHOLD = 100;

/**
 * 检查速率限制
 * @param key 限制键（如 IP 地址）
 * @param maxRequests 时间窗口内最大请求数
 * @param windowMs 时间窗口（毫秒）
 * @returns { limited: boolean, retryAfter?: number }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 5,
  windowMs: number = 15 * 60 * 1000 // 默认15分钟
): { limited: boolean; retryAfter?: number } {
  // 条目过多时触发惰性清理
  if (rateLimitStore.size > CLEANUP_THRESHOLD) {
    cleanupExpiredEntries();
  }

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // 新条目或已过期
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { limited: false };
  }

  if (entry.count >= maxRequests) {
    // 超出限制
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { limited: true, retryAfter };
  }

  // 未超出限制，增加计数
  entry.count++;
  return { limited: false };
}

/**
 * 获取客户端 IP 地址
 */
export function getClientIp(request: Request): string {
  // Cloudflare 提供的 IP 地址
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  // 其他代理
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const firstIp = xff.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;

  return 'unknown';
}
