/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getCachedUA } from "@/lib/config";

export const runtime = 'edge';

// KV 缓存配置
const CACHE_TTL = 3600;
const MAX_CACHE_SIZE = 5 * 1024 * 1024; // 最大缓存5MB

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');

  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  // 使用缓存的 UA，不查 D1
  const ua = getCachedUA(source || undefined);
  const decodedUrl = decodeURIComponent(url);

  // 尝试从 KV 读缓存
  try {
    const { getRequestContext } = require('@cloudflare/next-on-pages');
    const ctx = getRequestContext();
    const kv = ctx?.env?.KV as any;
    if (kv) {
      const cacheKey = `segment:${url}`;
      const cached = await kv.get(cacheKey, 'arrayBuffer');
      if (cached && (cached as ArrayBuffer).byteLength > 0) {
        return createVideoResponse(cached as ArrayBuffer);
      }
    }
  } catch {
    // KV 不可用，继续
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': ua,
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 });
    }

    // 流式转发，不缓冲整个分片
    // 同时异步缓存小分片到 KV
    const contentLength = response.headers.get('content-length');
    const isSmall = !contentLength || parseInt(contentLength) < MAX_CACHE_SIZE;

    if (isSmall) {
      // 小分片：读取后缓存 + 返回
      const data = await response.arrayBuffer();
      // 异步写入 KV，不阻塞响应
      try {
        const { getRequestContext } = require('@cloudflare/next-on-pages');
        const ctx = getRequestContext();
        const kv = ctx?.env?.KV as any;
        if (kv && ctx?.waitUntil) {
          const cacheKey = `segment:${url}`;
          ctx.waitUntil(kv.put(cacheKey, data, { expirationTtl: CACHE_TTL }));
        }
      } catch {
        // KV 不可用
      }
      return createVideoResponse(data);
    }

    // 大分片：直接流式转发
    return new Response(response.body, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Origin, Accept',
        'Accept-Ranges': 'bytes',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 });
  }
}

function createVideoResponse(data: ArrayBuffer): Response {
  return new Response(data, {
    headers: {
      'Content-Type': 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, Origin, Accept',
      'Accept-Ranges': 'bytes',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      'Content-Length': data.byteLength.toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
