# LunaTV-CF

<div align="center">
<img src="public/logo.png" alt="LunaTV Logo" width="120">
</div>

> 🎬 **LunaTV-CF** 是 LunaTV 的 Cloudflare Pages 适配版本，支持 D1 数据库和 KV 缓存。

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-000?logo=nextdotjs)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-F38020?logo=cloudflare)
![D1](https://img.shields.io/badge/D1-Database-F38020?logo=cloudflare)
![License](https://img.shields.io/badge/License-CC--BY--NC--SA-green)

</div>

---

## ✨ 特性

- 🔍 **多源聚合搜索**：一次搜索立刻返回全源结果
- 📄 **丰富详情页**：剧集列表、演员、年份、简介等完整信息
- ▶️ **流畅在线播放**：集成 HLS.js & ArtPlayer
- ❤️ **收藏 + 继续观看**：支持多端同步进度
- 📱 **PWA**：离线缓存、安装到桌面/主屏
- 🌗 **响应式布局**：自适应各种屏幕尺寸
- ☁️ **Cloudflare 原生支持**：D1 数据库 + KV 缓存

---

## 🚀 Cloudflare Pages 部署

### 1. Fork 仓库

Fork 本仓库到你的 GitHub 账户。

### 2. 创建 Cloudflare 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击 **计算(Workers) → Workers 和 Pages**
3. 点击 **创建 → Pages → 连接到 Git**
4. 选择你 Fork 的仓库

### 3. 配置构建

| 设置 | 值 |
|------|-----|
| 构建命令 | `pnpm install --frozen-lockfile && pnpm run pages:build` |
| 构建输出目录 | `.vercel/output/static` |
| 兼容性标志 | `nodejs_compat` |

### 4. 创建 D1 数据库

1. 点击 **存储和数据库 → D1 SQL 数据库**
2. 点击 **创建数据库**，名称随意（如 `lunatv-db`）
3. 进入数据库，点击 **控制台**
4. 将 [D1初始化.md](D1初始化.md) 中的 SQL 粘贴并执行

### 5. 绑定 D1 数据库

在 Pages 项目设置中：

1. 进入 **设置 → 绑定**
2. 点击 **添加绑定 → D1 数据库**
3. 变量名称：`DB`
4. 选择创建的数据库

### 6. 绑定 KV 命名空间（可选，用于缓存）

1. 点击 **存储和数据库 → KV**
2. 创建命名空间（如 `lunatv-cache`）
3. 在 Pages 项目设置中绑定，变量名称：`KV`

### 7. 设置环境变量

在 Pages 项目设置中添加：

| 变量 | 值 | 说明 |
|------|-----|------|
| `NEXT_PUBLIC_STORAGE_TYPE` | `d1` | 存储类型 |
| `USERNAME` | `admin` | 管理员用户名 |
| `PASSWORD` | `your_password` | 管理员密码 |
| `NEXT_PUBLIC_SITE_NAME` | `LunaTV` | 站点名称 |

### 8. 部署

点击 **部署**，等待构建完成后即可访问。

---

## 🐳 Docker 部署

仍支持 Docker 部署（使用 Redis/KVRocks）：

```bash
docker pull ghcr.io/kzb12580/lunatv-cf:latest
docker run -d -p 3000:3000 \
  -e USERNAME=admin \
  -e PASSWORD=your_password \
  -e NEXT_PUBLIC_STORAGE_TYPE=redis \
  -e REDIS_URL=redis://redis:6379 \
  ghcr.io/kzb12580/lunatv-cf:latest
```

---

## 📦 存储支持矩阵

| 存储 | Docker | Vercel | Cloudflare |
|------|--------|--------|------------|
| Redis | ✅ | ❌ | ❌ |
| KVRocks | ✅ | ❌ | ❌ |
| Upstash | ✅ | ✅ | ✅ |
| **D1** | ❌ | ❌ | ✅ |

---

## 🔧 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NEXT_PUBLIC_STORAGE_TYPE` | 存储类型 (redis/kvrocks/upstash/d1) | localstorage |
| `USERNAME` | 管理员用户名 | - |
| `PASSWORD` | 管理员密码 | - |
| `REDIS_URL` | Redis 连接 URL | - |
| `KVROCKS_URL` | KVRocks 连接 URL | - |
| `UPSTASH_URL` | Upstash HTTPS Endpoint | - |
| `UPSTASH_TOKEN` | Upstash Token | - |
| `NEXT_PUBLIC_SITE_NAME` | 站点名称 | LunaTV |

---

## 📝 配置文件

编辑 `config.json` 自定义播放源：

```json
{
  "cache_time": 7200,
  "api_site": {
    "example": {
      "api": "https://example.com/api.php/provide/vod",
      "name": "示例资源"
    }
  }
}
```

---

## 📜 License

本项目采用 CC BY-NC-SA 4.0 协议，禁止任何商业化行为。

---

## 🙏 致谢

- [LunaTV](https://github.com/MoonTechLab/LunaTV) - 原始项目
- [MoonTV](https://github.com/samqin123/MoonTV) - 启发项目
- [Cloudflare](https://cloudflare.com) - 提供免费的 Pages/D1/KV 服务
