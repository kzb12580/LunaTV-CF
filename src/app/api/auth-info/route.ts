import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'edge';

/**
 * GET /api/auth-info
 * 从请求的 httpOnly cookie 中读取认证信息，返回给客户端。
 * 客户端 JS 无法读取 httpOnly cookie，因此需要通过此端点获取。
 */
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  if (!authInfo) {
    return NextResponse.json(
      { username: null, role: null, storageType },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  return NextResponse.json(
    {
      username: authInfo.username || null,
      role: authInfo.role || 'user',
      storageType,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
