/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { createClient, RedisClientType } from 'redis';

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

// 杩炴帴閰嶇疆鎺ュ彛
export interface RedisConnectionConfig {
  url: string;
  clientName: string; // 鐢ㄤ簬鏃ュ織鏄剧ず锛屽 "Redis" 鎴?"Pika"
}

// 娣诲姞Redis鎿嶄綔閲嶈瘯鍖呰鍣?
function createRetryWrapper(clientName: string, getClient: () => RedisClientType) {
  return async function withRetry<T>(
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
          err.code === 'EPIPE';

        if (isConnectionError && !isLastAttempt) {
          console.log(
            `${clientName} operation failed, retrying... (${i + 1}/${maxRetries})`
          );
          console.error('Error:', err.message);

          // 绛夊緟涓€娈垫椂闂村悗閲嶈瘯
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));

          // 灏濊瘯閲嶆柊杩炴帴
          try {
            const client = getClient();
            if (!client.isOpen) {
              await client.connect();
            }
          } catch (reconnectErr) {
            console.error('Failed to reconnect:', reconnectErr);
          }

          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  };
}

// 鍒涘缓瀹㈡埛绔殑宸ュ巶鍑芥暟
export function createRedisClient(config: RedisConnectionConfig, globalSymbol: symbol): RedisClientType {
  let client: RedisClientType | undefined = (global as any)[globalSymbol];

  if (!client) {
    if (!config.url) {
      throw new Error(`${config.clientName}_URL env variable not set`);
    }

    // 鍒涘缓瀹㈡埛绔厤缃?
    const clientConfig: any = {
      url: config.url,
      socket: {
        // 閲嶈繛绛栫暐锛氭寚鏁伴€€閬匡紝鏈€澶?0绉?
        reconnectStrategy: (retries: number) => {
          console.log(`${config.clientName} reconnection attempt ${retries + 1}`);
          if (retries > 10) {
            console.error(`${config.clientName} max reconnection attempts exceeded`);
            return false; // 鍋滄閲嶈繛
          }
          return Math.min(1000 * Math.pow(2, retries), 30000); // 鎸囨暟閫€閬匡紝鏈€澶?0绉?
        },
        connectTimeout: 10000, // 10绉掕繛鎺ヨ秴鏃?
        // 璁剧疆no delay锛屽噺灏戝欢杩?
        noDelay: true,
      },
      // 娣诲姞鍏朵粬閰嶇疆
      pingInterval: 30000, // 30绉抪ing涓€娆★紝淇濇寔杩炴帴娲昏穬
    };

    client = createClient(clientConfig);

    // 娣诲姞閿欒浜嬩欢鐩戝惉
    client.on('error', (err) => {
      console.error(`${config.clientName} client error:`, err);
    });

    client.on('connect', () => {
      console.log(`${config.clientName} connected`);
    });

    client.on('reconnecting', () => {
      console.log(`${config.clientName} reconnecting...`);
    });

    client.on('ready', () => {
      console.log(`${config.clientName} ready`);
    });

    // 鍒濆杩炴帴锛屽甫閲嶈瘯鏈哄埗
    const connectWithRetry = async () => {
      try {
        await client!.connect();
        console.log(`${config.clientName} connected successfully`);
      } catch (err) {
        console.error(`${config.clientName} initial connection failed:`, err);
        console.log('Will retry in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      }
    };

    connectWithRetry();

    (global as any)[globalSymbol] = client;
  }

  return client;
}

// 鎶借薄鍩虹被锛屽寘鍚墍鏈夐€氱敤鐨凴edis鎿嶄綔閫昏緫
export abstract class BaseRedisStorage implements IStorage {
  protected client: RedisClientType;
  protected withRetry: <T>(operation: () => Promise<T>, maxRetries?: number) => Promise<T>;

  constructor(config: RedisConnectionConfig, globalSymbol: symbol) {
    this.client = createRedisClient(config, globalSymbol);
    this.withRetry = createRetryWrapper(config.clientName, () => this.client);
  }

  // ---------- 鎾斁璁板綍 ----------
  private prHashKey(user: string) {
    return `u:${user}:pr`; // 涓€涓敤鎴风殑鎵€鏈夋挱鏀捐褰曞瓨鍦ㄤ竴涓?Hash 涓?
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await this.withRetry(() =>
      this.client.hGet(this.prHashKey(userName), key)
    );
    return val ? (JSON.parse(val) as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(this.prHashKey(userName), key, JSON.stringify(record))
    );
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const all = await this.withRetry(() =>
      this.client.hGetAll(this.prHashKey(userName))
    );
    const result: Record<string, PlayRecord> = {};
    for (const [field, raw] of Object.entries(all)) {
      if (raw) {
        result[field] = JSON.parse(raw) as PlayRecord;
      }
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await this.withRetry(() =>
      this.client.hDel(this.prHashKey(userName), key)
    );
  }

  async deleteAllPlayRecords(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.prHashKey(userName)));
  }

  // ---------- 鏀惰棌 ----------
  private favHashKey(user: string) {
    return `u:${user}:fav`; // 涓€涓敤鎴风殑鎵€鏈夋敹钘忓瓨鍦ㄤ竴涓?Hash 涓?
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await this.withRetry(() =>
      this.client.hGet(this.favHashKey(userName), key)
    );
    return val ? (JSON.parse(val) as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(this.favHashKey(userName), key, JSON.stringify(favorite))
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const all = await this.withRetry(() =>
      this.client.hGetAll(this.favHashKey(userName))
    );
    const result: Record<string, Favorite> = {};
    for (const [field, raw] of Object.entries(all)) {
      if (raw) {
        result[field] = JSON.parse(raw) as Favorite;
      }
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await this.withRetry(() =>
      this.client.hDel(this.favHashKey(userName), key)
    );
  }

  async deleteAllFavorites(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.favHashKey(userName)));
  }

  // ---------- 鐢ㄦ埛娉ㄥ唽 / 鐧诲綍 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const hashed = await hashPassword(password);
    await this.withRetry(() => this.client.set(this.userPwdKey(userName), hashed));
    // 缁存姢鐢ㄦ埛闆嗗悎
    await this.withRetry(() => this.client.sAdd(this.usersSetKey(), userName));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await this.withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    const storedStr = ensureString(stored);
    const ok = await verifyPassword(password, storedStr);
    // 骞虫粦杩佺Щ锛氬鏋滄槸鏄庢枃瀵嗙爜涓旈獙璇侀€氳繃锛岃嚜鍔ㄥ崌绾т负鍔犵洂鍝堝笇
    if (ok && !isHashed(storedStr)) {
      const hashed = await hashPassword(password);
      await this.withRetry(() => this.client.set(this.userPwdKey(userName), hashed));
    }
    return ok;
  }

  // 妫€鏌ョ敤鎴锋槸鍚﹀瓨鍦?
  async checkUserExist(userName: string): Promise<boolean> {
    // 浣跨敤 EXISTS 鍒ゆ柇 key 鏄惁瀛樺湪
    const exists = await this.withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 淇敼鐢ㄦ埛瀵嗙爜
  async changePassword(userName: string, newPassword: string): Promise<void> {
    const hashed = await hashPassword(newPassword);
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(userName), hashed)
    );
  }

  // 鍒犻櫎鐢ㄦ埛鍙婂叾鎵€鏈夋暟鎹?
  async deleteUser(userName: string): Promise<void> {
    // 鍒犻櫎鐢ㄦ埛瀵嗙爜
    await this.withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 浠庣敤鎴烽泦鍚堜腑绉婚櫎
    await this.withRetry(() => this.client.sRem(this.usersSetKey(), userName));

    // 鍒犻櫎鎼滅储鍘嗗彶
    await this.withRetry(() => this.client.del(this.shKey(userName)));

    // 鍒犻櫎鎾斁璁板綍锛圚ash key 鐩存帴鍒犻櫎锛?
    await this.withRetry(() => this.client.del(this.prHashKey(userName)));

    // 鍒犻櫎鏀惰棌澶癸紙Hash key 鐩存帴鍒犻櫎锛?
    await this.withRetry(() => this.client.del(this.favHashKey(userName)));

    // 鍒犻櫎璺宠繃鐗囧ご鐗囧熬閰嶇疆锛圚ash key 鐩存帴鍒犻櫎锛?
    await this.withRetry(() => this.client.del(this.skipHashKey(userName)));
  }

  // ---------- 鎼滅储鍘嗗彶 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await this.withRetry(() =>
      this.client.lRange(this.shKey(userName), 0, -1)
    );
    // 纭繚杩斿洖鐨勯兘鏄瓧绗︿覆绫诲瀷
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 鍏堝幓閲?
    await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    // 鎻掑叆鍒版渶鍓?
    await this.withRetry(() => this.client.lPush(key, ensureString(keyword)));
    // 闄愬埗鏈€澶ч暱搴?
    await this.withRetry(() => this.client.lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    } else {
      await this.withRetry(() => this.client.del(key));
    }
  }

  // ---------- 鑾峰彇鍏ㄩ儴鐢ㄦ埛 ----------
  private usersSetKey() {
    return 'sys:users';
  }

  async getAllUsers(): Promise<string[]> {
    const members = await this.withRetry(() => this.client.sMembers(this.usersSetKey()));
    return ensureStringArray(members as any[]);
  }

  // ---------- 绠＄悊鍛橀厤缃?----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await this.withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (JSON.parse(val) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.adminConfigKey(), JSON.stringify(config))
    );
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
    const val = await this.withRetry(() =>
      this.client.hGet(this.skipHashKey(userName), this.skipField(source, id))
    );
    return val ? (JSON.parse(val) as SkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(
        this.skipHashKey(userName),
        this.skipField(source, id),
        JSON.stringify(config)
      )
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hDel(this.skipHashKey(userName), this.skipField(source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const all = await this.withRetry(() =>
      this.client.hGetAll(this.skipHashKey(userName))
    );
    const configs: { [key: string]: SkipConfig } = {};
    for (const [field, raw] of Object.entries(all)) {
      if (raw) {
        configs[field] = JSON.parse(raw) as SkipConfig;
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
    const migrated = await this.withRetry(() => this.client.get(this.migrationKey()));
    if (migrated === 'done') return;

    console.log('寮€濮嬫暟鎹縼绉伙細鎵佸钩 key 鈫?Hash 缁撴瀯...');

    try {
      // 杩佺Щ鎾斁璁板綍锛歶:*:pr:* 鈫?u:username:pr (Hash)
      const prKeys = await this.withRetry(() => this.client.keys('u:*:pr:*'));
      if (prKeys.length > 0) {
        const oldPrKeys = prKeys.filter((k) => {
          const parts = k.split(':');
          return parts.length >= 4 && parts[2] === 'pr' && parts[3] !== '';
        });

        if (oldPrKeys.length > 0) {
          const values = await this.withRetry(() => this.client.mGet(oldPrKeys));
          for (let i = 0; i < oldPrKeys.length; i++) {
            const raw = values[i];
            if (!raw) continue;
            const match = oldPrKeys[i].match(/^u:(.+?):pr:(.+)$/);
            if (!match) continue;
            const [, userName, field] = match;
            await this.withRetry(() =>
              this.client.hSet(this.prHashKey(userName), field, raw)
            );
          }
          await this.withRetry(() => this.client.del(oldPrKeys));
          console.log(`杩佺Щ浜?${oldPrKeys.length} 鏉℃挱鏀捐褰昤);
        }
      }

      // 杩佺Щ鏀惰棌锛歶:*:fav:* 鈫?u:username:fav (Hash)
      const favKeys = await this.withRetry(() => this.client.keys('u:*:fav:*'));
      if (favKeys.length > 0) {
        const oldFavKeys = favKeys.filter((k) => {
          const parts = k.split(':');
          return parts.length >= 4 && parts[2] === 'fav' && parts[3] !== '';
        });

        if (oldFavKeys.length > 0) {
          const values = await this.withRetry(() => this.client.mGet(oldFavKeys));
          for (let i = 0; i < oldFavKeys.length; i++) {
            const raw = values[i];
            if (!raw) continue;
            const match = oldFavKeys[i].match(/^u:(.+?):fav:(.+)$/);
            if (!match) continue;
            const [, userName, field] = match;
            await this.withRetry(() =>
              this.client.hSet(this.favHashKey(userName), field, raw)
            );
          }
          await this.withRetry(() => this.client.del(oldFavKeys));
          console.log(`杩佺Щ浜?${oldFavKeys.length} 鏉℃敹钘廯);
        }
      }

      // 杩佺Щ skipConfig锛歶:*:skip:* 鈫?u:username:skip (Hash)
      const skipKeys = await this.withRetry(() => this.client.keys('u:*:skip:*'));
      if (skipKeys.length > 0) {
        const oldSkipKeys = skipKeys.filter((k) => {
          const parts = k.split(':');
          return parts.length >= 4 && parts[2] === 'skip' && parts[3] !== '';
        });

        if (oldSkipKeys.length > 0) {
          const values = await this.withRetry(() => this.client.mGet(oldSkipKeys));
          for (let i = 0; i < oldSkipKeys.length; i++) {
            const raw = values[i];
            if (!raw) continue;
            const match = oldSkipKeys[i].match(/^u:(.+?):skip:(.+)$/);
            if (!match) continue;
            const [, userName, field] = match;
            await this.withRetry(() =>
              this.client.hSet(this.skipHashKey(userName), field, raw)
            );
          }
          await this.withRetry(() => this.client.del(oldSkipKeys));
          console.log(`杩佺Щ浜?${oldSkipKeys.length} 鏉¤烦杩囬厤缃甡);
        }
      }

      // 杩佺Щ鐢ㄦ埛鍒楄〃锛氫粠 KEYS u:*:pwd 鏋勫缓 sys:users Set
      const userSetExists = await this.withRetry(() => this.client.exists(this.usersSetKey()));
      if (!userSetExists) {
        const pwdKeys = await this.withRetry(() => this.client.keys('u:*:pwd'));
        const userNames = pwdKeys
          .map((k) => {
            const match = k.match(/^u:(.+?):pwd$/);
            return match ? match[1] : undefined;
          })
          .filter((u): u is string => typeof u === 'string');
        if (userNames.length > 0) {
          await this.withRetry(() => this.client.sAdd(this.usersSetKey(), userNames));
          console.log(`杩佺Щ浜?${userNames.length} 涓敤鎴峰埌 Set`);
        }
      }

      // 鏍囪杩佺Щ瀹屾垚
      await this.withRetry(() => this.client.set(this.migrationKey(), 'done'));
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
    const migrated = await this.withRetry(() => this.client.get(this.pwdMigrationKey()));
    if (migrated === 'done') return;

    console.log('寮€濮嬪瘑鐮佽縼绉伙細鏄庢枃 鈫?鍔犵洂鍝堝笇...');

    try {
      const pwdKeys = await this.withRetry(() => this.client.keys('u:*:pwd'));
      let count = 0;

      for (const key of pwdKeys) {
        const stored = await this.withRetry(() => this.client.get(key));
        if (stored === null) continue;
        const storedStr = ensureString(stored);
        // 璺宠繃宸茬粡鏄搱甯屾牸寮忕殑
        if (isHashed(storedStr)) continue;
        // 灏嗘槑鏂囧瘑鐮佽浆涓哄姞鐩愬搱甯?
        const hashed = await hashPassword(storedStr);
        await this.withRetry(() => this.client.set(key, hashed));
        count++;
      }

      await this.withRetry(() => this.client.set(this.pwdMigrationKey(), 'done'));
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
      await this.withRetry(() => this.client.del(this.adminConfigKey()));

      console.log('鎵€鏈夋暟鎹凡娓呯┖');
    } catch (error) {
      console.error('娓呯┖鏁版嵁澶辫触:', error);
      throw new Error('娓呯┖鏁版嵁澶辫触');
    }
  }
}
