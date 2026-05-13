/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getKVBinding } from "@/lib/env";
import { validateUrl } from "@/lib/url-validate";

export const runtime = 'edge';

const CACHE_TTL = 3600;
const MAX_CACHE_SIZE = 5 * 1024 * 1024;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const decodedUrl = decodeURIComponent(url);
  const validation = validateUrl(decodedUrl);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 403 });
  }

  try {
    const kv = getKVBinding();
    if (kv) {
      const cacheKey = `segment:${url}`;
      const cached = await kv.get(cacheKey, 'arrayBuffer');
      if (cached && (cached as ArrayBuffer).byteLength > 0) {
        return createVideoResponse(cached as ArrayBuffer);
      }
    }
  } catch {
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'AptvPlayer/1.4.10',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 500 });
    }

    const contentLength = response.headers.get('content-length');
    const isSmall = !contentLength || parseInt(contentLength) < MAX_CACHE_SIZE;

    if (isSmall) {
      const data = await response.arrayBuffer();
      try {
        const kv = getKVBinding();
        if (kv) {
          const cacheKey = `segment:${url}`;
          kv.put(cacheKey, data, { expirationTtl: CACHE_TTL }).catch(() => {});
        }
      } catch {
      }
      return createVideoResponse(data);
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'CDN-Cache-Control': 'public, s-maxage=86400',
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Accept-Ranges': 'bytes',
      'Content-Length': data.byteLength.toString(),
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'CDN-Cache-Control': 'public, s-maxage=86400',
    },
  });
}
