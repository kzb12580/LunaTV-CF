# LunaTV-CF

基于 [LunaTV](https://github.com/MoonTechLab/LunaTV) 修改的 Cloudflare Pages 适配版（D1 + KV），参考 [MoonTV](https://github.com/samqin123/MoonTV) 启发。

## 技术栈

- **框架**: Next.js 14 + TypeScript (strict mode)
- **样式**: Tailwind CSS 3 + `@tailwindcss/forms`, dark mode via `class`
- **包管理**: pnpm@10.14.0
- **播放器**: ArtPlayer 5 + HLS.js
- **PWA**: next-pwa（离线缓存 + 桌面安装）
- **运行时**: Cloudflare Pages via `@cloudflare/next-on-pages`

## 关键命令

```bash
pnpm dev             # 本地开发（含 gen:manifest）
pnpm build           # 标准构建
pnpm pages:build     # Cloudflare Pages 构建
pnpm lint            # ESLint
pnpm lint:fix        # ESLint 自动修复 + prettier
pnpm lint:strict     # ESLint 零容错
pnpm typecheck       # tsc 类型检查
pnpm test            # Jest 测试
pnpm format          # Prettier 格式化
```

## 优化版本改进

从私有版移植的改进：

- **SSRF 防护**: 代理路由（segment/m3u8/key/image-proxy）拦截内网 IP + 非 HTTP 协议
- **PBKDF2 密码哈希**: 通过 Web Crypto API 异步哈希，避免 CF 10ms CPU 限制
- **Cron 认证**: 设置 `CRON_SECRET` 后必须 `?token=xxx` 才能触发
- **saveConfig() 统一入口**: admin 路由统一走 `saveConfig()`，同时写 D1 + 更新 KV 缓存
- **KV 分片缓存**: <5MB 分片自动缓存到 KV 边缘节点，≥5MB 流式转发
- **AbortController 超时**: 15s（segment）/ 10s（key/image）自动中断
- **KV 绑定统一入口**: 通过 `getKVBinding()` 优先 `getRequestContext` 兜底 `process.env`

## 存储架构

`NEXT_PUBLIC_STORAGE_TYPE` 控制后端。三层配置缓存：L1 内存 → L2 KV → L3 D1。

| 值 | 平台 | 绑定/变量 |
|----|------|-----------|
| `d1` | CF Pages | `DB`（D1）+ `KV` |
| `redis` | Docker | `REDIS_URL` |
| `upstash` | 全平台 | `REDIS_URL` |
| `kvrocks` | Docker | KVRocks |
| `localstorage` | 开发 | 浏览器 localStorage |

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── admin/        # 管理员 API（6+ 路由，统一 saveConfig）
│   │   ├── cron/         # 定时任务（CRON_SECRET 认证）
│   │   ├── proxy/        # segment/m3u8/key 代理 + SSRF + KV 缓存
│   │   ├── image-proxy/  # 图片代理（SSRF 防护）
│   │   ├── search/       # 搜索 API + ws 流式
│   │   ├── live/         # 直播（m3u8 + EPG）
│   │   └── ...
│   ├── middleware.ts     # 全局认证（cookie HMAC 签名）
│   └── layout.tsx        # 根布局（注入 RUNTIME_CONFIG）
├── lib/
│   ├── env.ts            # KV 绑定统一入口
│   ├── config.ts         # 三层缓存 + saveConfig
│   ├── password.ts       # PBKDF2 密码哈希
│   ├── url-validate.ts   # SSRF IP 验证
│   ├── auth.ts           # cookie 认证
│   └── db.ts             # 存储抽象层
├── components/           # UI 组件
└── styles/
```

## Cloudflare Pages 部署

| 配置 | 值 |
|------|-----|
| 框架预设 | Next.js |
| 构建命令 | `pnpm install --frozen-lockfile && pnpm run pages:build` |
| 输出目录 | `.vercel/output/static` |
| 兼容性标志 | `nodejs_compat` |

**绑定**: D1 → `DB`, KV → `KV`
**环境变量**: `NEXT_PUBLIC_STORAGE_TYPE=d1`, `USERNAME`, `PASSWORD`, `CRON_SECRET`（推荐）

## 开发约定

- **提交格式**: Conventional Commits
- **提交检查**: husky + commitlint + lint-staged
- **路径别名**: `@/` → `src/`, `~/*` → `public/*`
- **reactStrictMode**: `false`
