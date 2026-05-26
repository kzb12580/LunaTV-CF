import { NextRequest } from 'next/server';

/**
 * CSRF 保护工具
 * 通过验证 Origin/Referer 头来防御 CSRF 攻击
 * 注意：cookie 已设置 sameSite: 'strict'，这是第一道防线
 * 此工具提供额外的 Origin/Referer 验证作为第二道防线
 */

/**
 * 验证 CSRF token（检查 Origin/Referer 头）
 * 对于 mutation 请求（POST/PUT/DELETE），验证请求来源
 */
export function verifyCsrfToken(request: NextRequest): boolean {
  // GET/HEAD/OPTIONS 请求不需要 CSRF 保护
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const host = request.headers.get('host');
  if (!host) {
    return false;
  }

  // 检查 Origin 头
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return true;
      }
    } catch {
      // invalid origin header
    }
    return false;
  }

  // 检查 Referer 头
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) {
        return true;
      }
    } catch {
      // invalid referer header
    }
    return false;
  }

  // 既没有 Origin 也没有 Referer，拒绝请求
  return false;
}
