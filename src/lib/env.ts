type KVNamespace = any;

export async function getKVBinding(): Promise<KVNamespace | null> {
  try {
    const mod = await import('@cloudflare/next-on-pages');
    if (mod && typeof mod.getRequestContext === 'function') {
      const ctx = mod.getRequestContext();
      if (ctx?.env?.KV) return ctx.env.KV as KVNamespace;
    }
  } catch {
  }
  try {
    return (process.env as any).KV || null;
  } catch {
    return null;
  }
}
