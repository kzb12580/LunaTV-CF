import { NextRequest } from 'next/server';

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  role?: 'owner' | 'admin' | 'user';
} | null {
  const authCookie = request.cookies.get('auth');

  if (!authCookie) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(authCookie.value);
    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}

// 从cookie获取认证信息 (客户端使用)
// 注意: 当 cookie 为 httpOnly 时此函数无法读取，将返回 null。
// 请优先使用 fetchAuthInfo() 异步函数。
export function getAuthInfoFromBrowserCookie(): {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  role?: 'owner' | 'admin' | 'user';
} | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 解析 document.cookie
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const trimmed = cookie.trim();
      const firstEqualIndex = trimmed.indexOf('=');

      if (firstEqualIndex > 0) {
        const key = trimmed.substring(0, firstEqualIndex);
        const value = trimmed.substring(firstEqualIndex + 1);
        if (key && value) {
          acc[key] = value;
        }
      }

      return acc;
    }, {} as Record<string, string>);

    const authCookie = cookies['auth'];
    if (!authCookie) {
      return null;
    }

    // 处理可能的双重编码
    let decoded = decodeURIComponent(authCookie);

    // 如果解码后仍然包含 %，说明是双重编码，需要再次解码
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }

    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}

// 从服务器获取认证信息（推荐用于客户端）
// 优先调用 /api/auth-info 端点（支持 httpOnly cookie），
// 若请求失败则回退到 document.cookie 解析。
export async function fetchAuthInfo(): Promise<{
  username?: string;
  role?: 'owner' | 'admin' | 'user';
  storageType?: string;
} | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const res = await fetch('/api/auth-info', {
      method: 'GET',
      credentials: 'same-origin',
    });

    if (res.ok) {
      const data = await res.json();
      if (data.username) {
        return {
          username: data.username,
          role: data.role,
          storageType: data.storageType,
        };
      }
    }
  } catch {
    // 端点不可用，回退到 cookie 解析
  }

  // 回退: 从 document.cookie 直接解析
  const fallback = getAuthInfoFromBrowserCookie();
  if (fallback) {
    return {
      username: fallback.username,
      role: fallback.role,
    };
  }

  return null;
}
