/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const runtime = 'edge';

// KV 缓存配置
const CACHE_TTL = 3600; // 1小时缓存
const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 最大缓存5MB的分片

// 预加载队列（使用全局变量在请求间共享）
declare global {
  var preloadQueue: Map<string, Promise<ArrayBuffer>> | undefined;
}

if (typeof globalThis.preloadQueue === 'undefined') {
  globalThis.preloadQueue = new Map();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');
  const preload = searchParams.get('preload') === 'true';
  
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  const ua = liveSource.ua || 'AptvPlayer/1.4.10';
  const decodedUrl = decodeURIComponent(url);
  
  // 检查预加载队列
  const preloadPromise = globalThis.preloadQueue?.get(decodedUrl);
  if (preloadPromise) {
    try {
      const cachedData = await preloadPromise;
      globalThis.preloadQueue?.delete(decodedUrl);
      return createVideoResponse(cachedData);
    } catch {
      // 预加载失败，继续正常请求
      globalThis.preloadQueue?.delete(decodedUrl);
    }
  }

  // 检查 KV 缓存（如果配置了）
  try {
    const cacheKey = `segment:${url}`;
    // @ts-ignore - KV 在 Cloudflare 环境中可用
    const cached = await globalThis.KV?.get(cacheKey, 'arrayBuffer');
    if (cached && cached.byteLength > 0) {
      console.log('Cache hit for:', url.substring(0, 50));
      return createVideoResponse(cached);
    }
  } catch {
    // KV 不可用，继续正常请求
  }

  let response: Response | null = null;
  try {
    // 并行发起请求
    const fetchPromise = fetch(decodedUrl, {
      headers: {
        'User-Agent': ua,
        'Accept': '*/*',
        'Accept-Encoding': 'identity', // 不压缩，避免解压延迟
      },
    });

    // 超时控制
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 15000);
    });

    response = await Promise.race([fetchPromise, timeoutPromise]) as Response | null;

    if (!response || !response.ok) {
      return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 });
    }

    const data = await response.arrayBuffer();
    
    // 缓存小分片到 KV
    if (data.byteLength < MAX_CACHE_SIZE) {
      try {
        const cacheKey = `segment:${url}`;
        // @ts-ignore
        await globalThis.KV?.put(cacheKey, data, { expirationTtl: CACHE_TTL });
      } catch {
        // KV 不可用，忽略
      }
    }

    return createVideoResponse(data);

  } catch (error) {
    console.error('Segment fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 });
  } finally {
    if (response?.body) {
      try {
        response.body.cancel();
      } catch {}
    }
  }
}

function createVideoResponse(data: ArrayBuffer): Response {
  const headers = new Headers();
  headers.set('Content-Type', 'video/mp2t');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  headers.set('Content-Length', data.byteLength.toString());
  headers.set('Cache-Control', 'public, max-age=3600');
  
  return new Response(data, { headers });
}

// 预加载函数（内部使用）
async function preloadSegment(url: string, source: string): Promise<void> {
  const key = url;
  if (globalThis.preloadQueue?.has(key)) return;
  
  const promise = fetch(url, {
    headers: { 'User-Agent': 'AptvPlayer/1.4.10' }
  }).then(r => r.arrayBuffer());
  
  globalThis.preloadQueue?.set(key, promise);
  
  // 限制队列大小
  if (globalThis.preloadQueue.size > 10) {
    const firstKey = globalThis.preloadQueue.keys().next().value;
    globalThis.preloadQueue.delete(firstKey);
  }
}
