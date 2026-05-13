/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { Redis } from '@upstash/redis';

import { AdminConfig } from './admin.types';
import { hashPassword, isHashed, verifyPassword } from './password';
import { Favorite, IStorage, PlayRecord, SkipConfig } from './types';

// 鎼滅储鍘嗗彶鏈€澶ф潯鏁?
const SEARCH_HISTORY_LIMIT = 20;

// 鏁版嵁绫诲瀷杞崲杈呭姪鍑芥暟
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 娣诲姞Upstash Redis鎿嶄綔閲嶈瘯鍖呰鍣?
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        err.name === 'UpstashError';

      if (isConnectionError && !isLastAttempt) {
        console.log(
          `Upstash Redis operation failed, retrying... (${i + 1}/${maxRetries})`
        );
        console.error('Error:', err.message);

        // 绛夊緟涓€娈垫椂闂村悗閲嶈瘯
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export class UpstashRedisStorage implements IStorage {
  private client: Redis;

  constructor() {
    this.client = getUpstashRedisClient();
  }

  // ---------- 鎾斁璁板綍 ----------
  private prHashKey(user: string) {
    return `u:${user}:pr`; // 涓€涓敤鎴风殑鎵€鏈夋挱鏀捐褰曞瓨鍦ㄤ竴涓?Hash 涓?
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await withRetry(() =>
      this.client.hget(this.prHashKey(userName), key)
    );
    return val ? (val as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await withRetry(() =>
      this.client.hset(this.prHashKey(userName), { [key]: record })
    );
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const all = await withRetry(() =>
      this.client.hgetall(this.prHashKey(userName))
    );
    if (!all || Object.keys(all).length === 0) return {};
    const result: Record<string, PlayRecord> = {};
    for (const [field, value] of Object.entries(all)) {
      if (value) {
        result[field] = value as PlayRecord;
      }
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.hdel(this.prHashKey(userName), key));
  }

  async deleteAllPlayRecords(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.prHashKey(userName)));
  }

  // ---------- 鏀惰棌 ----------
  private favHashKey(user: string) {
    return `u:${user}:fav`; // 涓€涓敤鎴风殑鎵€鏈夋敹钘忓瓨鍦ㄤ竴涓?Hash 涓?
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await withRetry(() =>
      this.client.hget(this.favHashKey(userName), key)
    );
    return val ? (val as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await withRetry(() =>
      this.client.hset(this.favHashKey(userName), { [key]: favorite })
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const all = await withRetry(() =>
      this.client.hgetall(this.favHashKey(userName))
    );
    if (!all || Object.keys(all).length === 0) return {};
    const result: Record<string, Favorite> = {};
    for (const [field, value] of Object.entries(all)) {
      if (value) {
        result[field] = value as Favorite;
      }
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.hdel(this.favHashKey(userName), key));
  }

  async deleteAllFavorites(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.favHashKey(userName)));
  }

  // ---------- 鐢ㄦ埛娉ㄥ唽 / 鐧诲綍 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const hashed = await hashPassword(password);
    await withRetry(() => this.client.set(this.userPwdKey(userName), hashed));
    // 缁存姢鐢ㄦ埛闆嗗悎
    await withRetry(() => this.client.sadd(this.usersSetKey(), userName));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    const storedStr = ensureString(stored as any);
    const ok = await verifyPassword(password, storedStr);
    // 骞虫粦杩佺Щ锛氬鏋滄槸鏄庢枃瀵嗙爜涓旈獙璇侀€氳繃锛岃嚜鍔ㄥ崌绾т负鍔犵洂鍝堝笇
    if (ok && !isHashed(storedStr)) {
      const hashed = await hashPassword(password);
      await withRetry(() => this.client.set(this.userPwdKey(userName), hashed));
    }
    return ok;
  }

  // 妫€鏌ョ敤鎴锋槸鍚﹀瓨鍦?
  async checkUserExist(userName: string): Promise<boolean> {
    // 浣跨敤 EXISTS 鍒ゆ柇 key 鏄惁瀛樺湪
    const exists = await withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 淇敼鐢ㄦ埛瀵嗙爜
  async changePassword(userName: string, newPassword: string): Promise<void> {
    const hashed = await hashPassword(newPassword);
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), hashed)
    );
  }

  // 鍒犻櫎鐢ㄦ埛鍙婂叾鎵€鏈夋暟鎹?
  async deleteUser(userName: string): Promise<void> {
    // 鍒犻櫎鐢ㄦ埛瀵嗙爜
    await withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 浠庣敤鎴烽泦鍚堜腑绉婚櫎
    await withRetry(() => this.client.srem(this.usersSetKey(), userName));

    // 鍒犻櫎鎼滅储鍘嗗彶
    await withRetry(() => this.client.del(this.shKey(userName)));

    // 鍒犻櫎鎾斁璁板綍锛圚ash key 鐩存帴鍒犻櫎锛?
    await withRetry(() => this.client.del(this.prHashKey(userName)));

    // 鍒犻櫎鏀惰棌澶癸紙Hash key 鐩存帴鍒犻櫎锛?
    await withRetry(() => this.client.del(this.favHashKey(userName)));

    // 鍒犻櫎璺宠繃鐗囧ご鐗囧熬閰嶇疆锛圚ash key 鐩存帴鍒犻櫎锛?
    await withRetry(() => this.client.del(this.skipHashKey(userName)));
  }

  // ---------- 鎼滅储鍘嗗彶 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.client.lrange(this.shKey(userName), 0, -1)
    );
    // 纭繚杩斿洖鐨勯兘鏄瓧绗︿覆绫诲瀷
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 鍏堝幓閲?
    await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    // 鎻掑叆鍒版渶鍓?
    await withRetry(() => this.client.lpush(key, ensureString(keyword)));
    // 闄愬埗鏈€澶ч暱搴?
    await withRetry(() => this.client.ltrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    } else {
      await withRetry(() => this.client.del(key));
    }
  }

  // ---------- 鑾峰彇鍏ㄩ儴鐢ㄦ埛 ----------
  private usersSetKey() {
    return 'sys:users';
  }

  async getAllUsers(): Promise<string[]> {
    const members = await withRetry(() => this.client.smembers(this.usersSetKey()));
    return ensureStringArray(members as any[]);
  }

  // ---------- 绠＄悊鍛橀厤缃?----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (val as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await withRetry(() => this.client.set(this.adminConfigKey(), config));
  }

  // ---------- 璺宠繃鐗囧ご鐗囧熬閰嶇疆 ----------
  private skipHashKey(user: string) {
    return `u:${user}:skip`; // 涓€涓敤鎴风殑鎵€鏈夎烦杩囬厤缃瓨鍦ㄤ竴涓?Hash 涓?
  }

  private skipField(source: string, id: string) {
    return `${source}+${id}`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const val = await withRetry(() =>
      this.client.hget(this.skipHashKey(userName), this.skipField(source, id))
    );
    return val ? (val as SkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    await withRetry(() =>
      this.client.hset(this.skipHashKey(userName), {
        [this.skipField(source, id)]: config,
      })
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await withRetry(() =>
      this.client.hdel(this.skipHashKey(userName), this.skipField(source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const all = await withRetry(() =>
      this.client.hgetall(this.skipHashKey(userName))
    );
    if (!all || Object.keys(all).length === 0) return {};
    const configs: { [key: string]: SkipConfig } = {};
    for (const [field, value] of Object.entries(all)) {
      if (value) {
        configs[field] = value as SkipConfig;
      }
    }
    return configs;
  }

  // ---------- 鏁版嵁杩佺Щ锛氭棫鎵佸钩 key 鈫?Hash 缁撴瀯 ----------
  private migrationKey() {
    return 'sys:migration:hash_v2';
  }

  async migrateData(): Promise<void> {
    // 妫€鏌ユ槸鍚﹀凡杩佺Щ
    const migrated = await withRetry(() => this.client.get(this.migrationKey()));
    if (migrated === 'done') return;

    console.log('寮€濮嬫暟鎹縼绉伙細鎵佸钩 key 鈫?Hash 缁撴瀯...');

    try {
      // 杩佺Щ鎾斁璁板綍锛歶:*:pr:* 鈫?u:username:pr (Hash)
      const prKeys: string[] = await withRetry(() => this.client.keys('u:*:pr:*'));
      if (prKeys.length > 0) {
        const oldPrKeys = prKeys.filter((k) => {
          const parts = k.split(':');
          return parts.length >= 4 && parts[2] === 'pr' && parts[3] !== '';
        });

        for (const oldKey of oldPrKeys) {
          const match = oldKey.match(/^u:(.+?):pr:(.+)$/);
          if (!match) continue;
          const [, userName, field] = match;
          const value = await withRetry(() => this.client.get(oldKey));
          if (value) {
            await withRetry(() =>
              this.client.hset(this.prHashKey(userName), { [field]: value })
            );
            await withRetry(() => this.client.del(oldKey));
          }
        }
        if (oldPrKeys.length > 0) {
          console.log(`杩佺Щ浜?${oldPrKeys.length} 鏉℃挱鏀捐褰昤);
        }
      }

      // 杩佺Щ鏀惰棌锛歶:*:fav:* 鈫?u:username:fav (Hash)
      const favKeys: string[] = await withRetry(() => this.client.keys('u:*:fav:*'));
      if (favKeys.length > 0) {
        const oldFavKeys = favKeys.filter((k) => {
          const parts = k.split(':');
          return parts.length >= 4 && parts[2] === 'fav' && parts[3] !== '';
        });

        for (const oldKey of oldFavKeys) {
          const match = oldKey.match(/^u:(.+?):fav:(.+)$/);
          if (!match) continue;
          const [, userName, field] = match;
          const value = await withRetry(() => this.client.get(oldKey));
          if (value) {
            await withRetry(() =>
              this.client.hset(this.favHashKey(userName), { [field]: value })
            );
            await withRetry(() => this.client.del(oldKey));
          }
        }
        if (oldFavKeys.length > 0) {
          console.log(`杩佺Щ浜?${oldFavKeys.length} 鏉℃敹钘廯);
        }
      }

      // 杩佺Щ skipConfig锛歶:*:skip:* 鈫?u:username:skip (Hash)
      const skipKeys: string[] = await withRetry(() => this.client.keys('u:*:skip:*'));
      if (skipKeys.length > 0) {
        const oldSkipKeys = skipKeys.filter((k) => {
          const parts = k.split(':');
          return parts.length >= 4 && parts[2] === 'skip' && parts[3] !== '';
        });

        for (const oldKey of oldSkipKeys) {
          const match = oldKey.match(/^u:(.+?):skip:(.+)$/);
          if (!match) continue;
          const [, userName, field] = match;
          const value = await withRetry(() => this.client.get(oldKey));
          if (value) {
            await withRetry(() =>
              this.client.hset(this.skipHashKey(userName), { [field]: value })
            );
            await withRetry(() => this.client.del(oldKey));
          }
        }
        if (oldSkipKeys.length > 0) {
          console.log(`杩佺Щ浜?${oldSkipKeys.length} 鏉¤烦杩囬厤缃甡);
        }
      }

      // 杩佺Щ鐢ㄦ埛鍒楄〃锛氫粠 KEYS u:*:pwd 鏋勫缓 sys:users Set
      const userSetExists = await withRetry(() => this.client.exists(this.usersSetKey()));
      if (!userSetExists) {
        const pwdKeys: string[] = await withRetry(() => this.client.keys('u:*:pwd'));
        const userNames = pwdKeys
          .map((k) => {
            const match = k.match(/^u:(.+?):pwd$/);
            return match ? match[1] : undefined;
          })
          .filter((u): u is string => typeof u === 'string');
        if (userNames.length > 0) {
          await withRetry(() => this.client.sadd(this.usersSetKey(), userNames));
          console.log(`杩佺Щ浜?${userNames.length} 涓敤鎴峰埌 Set`);
        }
      }

      // 鏍囪杩佺Щ瀹屾垚
      await withRetry(() => this.client.set(this.migrationKey(), 'done'));
      console.log('鏁版嵁杩佺Щ瀹屾垚');
    } catch (error) {
      console.error('鏁版嵁杩佺Щ澶辫触:', error);
    }
  }

  // ---------- 瀵嗙爜杩佺Щ锛氭槑鏂?鈫?鍔犵洂鍝堝笇 ----------
  private pwdMigrationKey() {
    return 'sys:migration:pwd_hash_v1';
  }

  async migratePasswords(): Promise<void> {
    const migrated = await withRetry(() => this.client.get(this.pwdMigrationKey()));
    if (migrated === 'done') return;

    console.log('寮€濮嬪瘑鐮佽縼绉伙細鏄庢枃 鈫?鍔犵洂鍝堝笇...');

    try {
      const pwdKeys: string[] = await withRetry(() => this.client.keys('u:*:pwd'));
      let count = 0;

      for (const key of pwdKeys) {
        const stored = await withRetry(() => this.client.get(key));
        if (stored === null) continue;
        const storedStr = ensureString(stored as any);
        // 璺宠繃宸茬粡鏄搱甯屾牸寮忕殑
        if (isHashed(storedStr)) continue;
        // 灏嗘槑鏂囧瘑鐮佽浆涓哄姞鐩愬搱甯?
        const hashed = await hashPassword(storedStr);
        await withRetry(() => this.client.set(key, hashed));
        count++;
      }

      await withRetry(() => this.client.set(this.pwdMigrationKey(), 'done'));
      console.log(`瀵嗙爜杩佺Щ瀹屾垚锛屽叡杩佺Щ ${count} 涓敤鎴穈);
    } catch (error) {
      console.error('瀵嗙爜杩佺Щ澶辫触:', error);
    }
  }

  // 娓呯┖鎵€鏈夋暟鎹?
  async clearAllData(): Promise<void> {
    try {
      // 鑾峰彇鎵€鏈夌敤鎴?
      const allUsers = await this.getAllUsers();

      // 鍒犻櫎鎵€鏈夌敤鎴峰強鍏舵暟鎹?
      for (const username of allUsers) {
        await this.deleteUser(username);
      }

      // 鍒犻櫎绠＄悊鍛橀厤缃?
      await withRetry(() => this.client.del(this.adminConfigKey()));

      console.log('鎵€鏈夋暟鎹凡娓呯┖');
    } catch (error) {
      console.error('娓呯┖鏁版嵁澶辫触:', error);
      throw new Error('娓呯┖鏁版嵁澶辫触');
    }
  }
}

// 鍗曚緥 Upstash Redis 瀹㈡埛绔?
function getUpstashRedisClient(): Redis {
  const globalKey = Symbol.for('__MOONTV_UPSTASH_REDIS_CLIENT__');
  let client: Redis | undefined = (global as any)[globalKey];

  if (!client) {
    const upstashUrl = process.env.UPSTASH_URL;
    const upstashToken = process.env.UPSTASH_TOKEN;

    if (!upstashUrl || !upstashToken) {
      throw new Error(
        'UPSTASH_URL and UPSTASH_TOKEN env variables must be set'
      );
    }

    // 鍒涘缓 Upstash Redis 瀹㈡埛绔?
    client = new Redis({
      url: upstashUrl,
      token: upstashToken,
      // 鍙€夐厤缃?
      retry: {
        retries: 3,
        backoff: (retryCount: number) =>
          Math.min(1000 * Math.pow(2, retryCount), 30000),
      },
    });

    console.log('Upstash Redis client created successfully');

    (global as any)[globalKey] = client;
  }

  return client;
}
