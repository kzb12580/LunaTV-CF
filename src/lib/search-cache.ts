import { SearchResult } from '@/lib/types';

export type CachedPageStatus = 'ok' | 'timeout' | 'forbidden';

export interface CachedPageEntry {
  expiresAt: number;
  status: CachedPageStatus;
  data: SearchResult[];
  pageCount?: number;
}

const SEARCH_CACHE_TTL_S = 10 * 60;
const MAX_MEMORY_CACHE_SIZE = 200;

const MEMORY_CACHE: Map<string, CachedPageEntry> = new Map();

function makeSearchCacheKey(sourceKey: string, query: string, page: number): string {
  return `${sourceKey}::${query.trim().toLowerCase()}::${page}`;
}

export async function getCachedSearchPage(
  sourceKey: string,
  query: string,
  page: number
): Promise<CachedPageEntry | null> {
  const key = makeSearchCacheKey(sourceKey, query, page);
  const now = Date.now();

  const memEntry = MEMORY_CACHE.get(key);
  if (memEntry && memEntry.expiresAt > now) {
    return memEntry;
  }
  if (memEntry) {
    MEMORY_CACHE.delete(key);
  }

  return null;
}

export async function setCachedSearchPage(
  sourceKey: string,
  query: string,
  page: number,
  status: CachedPageStatus,
  data: SearchResult[],
  pageCount?: number
): Promise<void> {
  const key = makeSearchCacheKey(sourceKey, query, page);
  const now = Date.now();
  const entry: CachedPageEntry = {
    expiresAt: now + SEARCH_CACHE_TTL_S * 1000,
    status,
    data,
    pageCount,
  };

  if (MEMORY_CACHE.size >= MAX_MEMORY_CACHE_SIZE) {
    const oldest = MEMORY_CACHE.keys().next().value;
    if (oldest) MEMORY_CACHE.delete(oldest);
  }
  MEMORY_CACHE.set(key, entry);
}
