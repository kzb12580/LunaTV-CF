/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

// Cloudflare KV 缓存接口
interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | null>;
  get(key: string, options: { type: 'json' }): Promise<any | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: any }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

// 获取 KV 实例
function getKV(): KVNamespace | null {
  try {
    return (process.env as any).KV as KVNamespace;
  } catch {
    return null;
  }
}

// 缓存键前缀
const CACHE_PREFIX = 'cache:';
const SEARCH_PREFIX = 'search:';
const DOUBAN_PREFIX = 'douban:';
const API_CACHE_PREFIX = 'api:';

// 默认缓存时间（秒）
const DEFAULT_TTL = 3600; // 1小时
const SEARCH_TTL = 1800; // 30分钟
const DOUBAN_TTL = 86400; // 24小时
const API_TTL = 7200; // 2小时

// KV 缓存管理器
export class KVCache {
  private kv: KVNamespace | null = null;
  private enabled: boolean = false;

  constructor() {
    this.kv = getKV();
    this.enabled = !!this.kv;
    
    if (this.enabled) {
      console.log('KV Cache enabled');
    }
  }

  // 检查是否启用
  isEnabled(): boolean {
    return this.enabled;
  }

  // 通用缓存操作
  async get<T>(key: string): Promise<T | null> {
    if (!this.kv) return null;

    try {
      const fullKey = CACHE_PREFIX + key;
      const data = await this.kv.get(fullKey, { type: 'json' });
      return data as T | null;
    } catch (err) {
      console.error('KV get error:', err);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = DEFAULT_TTL): Promise<void> {
    if (!this.kv) return;

    try {
      const fullKey = CACHE_PREFIX + key;
      await this.kv.put(fullKey, JSON.stringify(value), { expirationTtl: ttl });
    } catch (err) {
      console.error('KV set error:', err);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.kv) return;

    try {
      const fullKey = CACHE_PREFIX + key;
      await this.kv.delete(fullKey);
    } catch (err) {
      console.error('KV delete error:', err);
    }
  }

  // 搜索结果缓存
  async getSearchResult(keyword: string, source: string): Promise<any | null> {
    return this.get(`${SEARCH_PREFIX}${source}:${Buffer.from(keyword).toString('base64')}`);
  }

  async setSearchResult(keyword: string, source: string, data: any): Promise<void> {
    return this.set(`${SEARCH_PREFIX}${source}:${Buffer.from(keyword).toString('base64')}`, data, SEARCH_TTL);
  }

  // 豆瓣数据缓存
  async getDoubanData(id: string): Promise<any | null> {
    return this.get(`${DOUBAN_PREFIX}${id}`);
  }

  async setDoubanData(id: string, data: any): Promise<void> {
    return this.set(`${DOUBAN_PREFIX}${id}`, data, DOUBAN_TTL);
  }

  // API 响应缓存
  async getApiResponse(endpoint: string, params: string): Promise<any | null> {
    return this.get(`${API_CACHE_PREFIX}${endpoint}:${params}`);
  }

  async setApiResponse(endpoint: string, params: string, data: any, ttl: number = API_TTL): Promise<void> {
    return this.set(`${API_CACHE_PREFIX}${endpoint}:${params}`, data, ttl);
  }

  // 批量清除缓存
  async clearPattern(pattern: string): Promise<void> {
    if (!this.kv) return;

    try {
      let cursor: string | undefined;
      do {
        const result = await this.kv.list({ prefix: CACHE_PREFIX + pattern, limit: 100, cursor });
        
        for (const key of result.keys) {
          await this.kv.delete(key.name);
        }
        
        cursor = result.cursor;
      } while (cursor);
    } catch (err) {
      console.error('KV clearPattern error:', err);
    }
  }

  // 清除所有缓存
  async clearAll(): Promise<void> {
    await this.clearPattern('');
  }

  // 清除搜索缓存
  async clearSearch(): Promise<void> {
    await this.clearPattern(SEARCH_PREFIX);
  }

  // 清除豆瓣缓存
  async clearDouban(): Promise<void> {
    await this.clearPattern(DOUBAN_PREFIX);
  }
}

// 导出单例
export const kvCache = new KVCache();
