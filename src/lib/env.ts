/**
 * 统一获取 Cloudflare 环境绑定
 * 优先从 getRequestContext 获取，兜底 process.env
 */

type KVNamespace = any;

export function getKVBinding(): KVNamespace | null {
  try {
    const { getRequestContext } = require('@cloudflare/next-on-pages');
    const ctx = getRequestContext();
    if (ctx?.env?.KV) return ctx.env.KV as KVNamespace;
  } catch {
    // 非 CF 环境
  }
  try {
    return (process.env as any).KV || null;
  } catch {
    return null;
  }
}
