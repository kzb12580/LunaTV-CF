/**
 * 密码哈希工具 — 使用 Web Crypto API (PBKDF2)
 * 
 * 适配 CF Workers/Pages edge runtime：
 * - PBKDF2 通过 crypto.subtle 实现，不阻塞 CPU
 * - scryptSync 是同步 CPU 密集型，会超 CF 免费版 10ms 限制
 */

const SALT_LENGTH = 16;
const ITERATIONS = 100000;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function getRandomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = getRandomHex(SALT_LENGTH);
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = fromHex(salt);

  const key = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );

  return `${salt}:${toHex(hashBuffer)}`;
}

export async function verifyPassword(
  password: string,
  storedValue: string
): Promise<boolean> {
  const parts = storedValue.split(':');

  if (parts.length === 2) {
    const [salt, storedHash] = parts;

    if (salt.length === SALT_LENGTH * 2 && storedHash.length === 64) {
      const encoder = new TextEncoder();
      const passwordBuffer = encoder.encode(password);
      const saltBuffer = fromHex(salt);

      const key = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      const hashBuffer = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBuffer,
          iterations: ITERATIONS,
          hash: 'SHA-256',
        },
        key,
        256
      );

      const computedHash = toHex(hashBuffer);
      if (computedHash.length !== storedHash.length) return false;
      let result = 0;
      for (let i = 0; i < computedHash.length; i++) {
        result |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
      }
      return result === 0;
    }

    if (salt.length === SALT_LENGTH * 2 && storedHash.length === 128) {
      try {
        const { scryptSync, timingSafeEqual } = require('crypto');
        const hash = scryptSync(password, salt, 64, {
          N: 16384, r: 8, p: 1,
        });
        const storedHashBuf = Buffer.from(storedHash, 'hex');
        return timingSafeEqual(hash, storedHashBuf);
      } catch {
        return false;
      }
    }
  }

  return storedValue === password;
}

export function isHashed(storedValue: string): boolean {
  const parts = storedValue.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  return salt.length === SALT_LENGTH * 2 && (hash.length === 64 || hash.length === 128);
}
