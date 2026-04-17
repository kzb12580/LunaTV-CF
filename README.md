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
- 🚀 **视频加速**：KV 缓存热门分片，优化播放体验

---

## 🚀 Cloudflare Pages 部署（推荐）

> 📌 **小白教程**：跟着下面的步骤一步一步来，保证能部署成功！

### 第一步：Fork 仓库

1. 点击本仓库右上角的 **Fork** 按钮
2. 在弹出的页面点击 **Create fork**（创建分支）
3. 等待几秒钟，Fork 完成后会自动跳转到你的仓库

### 第二步：注册 Cloudflare 账号

1. 打开 [Cloudflare 官网](https://dash.cloudflare.com/sign-up)
2. 输入邮箱和密码，点击 **Create Account**
3. 去邮箱验证一下

### 第三步：创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击左侧菜单 **计算(Workers)** → **Workers 和 Pages**
3. 点击右上角 **创建** → **Pages** → **连接到 Git**
4. 选择 **GitHub**，授权 Cloudflare 访问你的 GitHub
5. 选择刚才 Fork 的 **LunaTV-CF** 仓库
6. 设置项目名称（随便起，比如 `lunatv`）
7. **重要！** 点击 **保存并部署** 前面的 **设置**

### 第四步：配置构建设置

在构建设置页面填写：

| 设置项 | 填写内容 |
|--------|----------|
| **框架预设** | Next.js |
| **构建命令** | `pnpm install --frozen-lockfile && pnpm run pages:build` |
| **构建输出目录** | `.vercel/output/static` |

> ⚠️ **注意**：如果提示兼容性标志，在 **环境变量** 下方找到 **兼容性标志**，添加 `nodejs_compat`

点击 **保存并部署**，等待构建（约 3-5 分钟）

### 第五步：创建 D1 数据库

1. 点击左侧 **存储和数据库** → **D1 SQL 数据库**
2. 点击 **创建数据库**
3. 数据库名称填 `lunatv-db`（随便起）
4. 点击 **创建**
5. 创建完成后，点击进入数据库
6. 点击 **控制台** 标签页
7. 打开本仓库的 [D1初始化.md](D1初始化.md) 文件
8. 复制里面的所有 SQL 语句
9. 粘贴到控制台的输入框，点击 **执行**

### 第六步：绑定 D1 数据库到 Pages

1. 回到 **Workers 和 Pages**
2. 点击你的 Pages 项目（lunatv）
3. 点击 **设置** → **绑定**
4. 点击 **添加绑定** → **D1 数据库**
5. **变量名称**：`DB`（必须是这个名称）
6. 选择刚才创建的数据库 `lunatv-db`
7. 点击 **保存**

### 第七步：绑定 KV 命名空间（用于视频加速）

> 🚀 **强烈推荐**：绑定 KV 可以加速视频播放！

1. 点击左侧 **存储和数据库** → **KV**
2. 点击 **创建命名空间**
3. 名称填 `lunatv-cache`
4. 点击 **添加**
5. 回到 Pages 项目的 **设置** → **绑定**
6. 点击 **添加绑定** → **KV 命名空间**
7. **变量名称**：`KV`（必须是这个名称）
8. 选择刚才创建的 `lunatv-cache`
9. 点击 **保存**

### 第八步：设置环境变量

在 Pages 项目 **设置** → **环境变量** 中添加：

| 变量名称 | 值 | 说明 |
|----------|-----|------|
| `NEXT_PUBLIC_STORAGE_TYPE` | `d1` | 存储类型（必须） |
| `USERNAME` | `admin` | 管理员用户名（自己改） |
| `PASSWORD` | `your_password` | 管理员密码（自己改个复杂的） |
| `NEXT_PUBLIC_SITE_NAME` | `LunaTV` | 网站名称（随便改） |

> ⚠️ **安全提示**：密码不要用 `your_password`，改成自己的复杂密码！

### 第九步：重新部署

1. 回到 Pages 项目主页
2. 点击 **部署** 标签页
3. 找到最早的一次部署
4. 点击右侧 **⋯** → **重试部署**
5. 等待部署完成

### 第十步：访问网站

部署完成后，页面会显示一个网址，类似：
```
https://lunatv.pages.dev
```

点击这个网址就能访问你的 LunaTV 了！🎉

---

## ❓ 常见问题

### Q: 构建失败怎么办？

**A:** 检查以下几点：
1. 确保构建命令完全正确（直接复制上面的）
2. 确保构建输出目录是 `.vercel/output/static`
3. 添加了 `nodejs_compat` 兼容性标志

### Q: 网站打不开/报错 500？

**A:** 检查以下几点：
1. 是否绑定了 D1 数据库（变量名必须是 `DB`）
2. 是否执行了 D1 初始化 SQL
3. 是否设置了环境变量 `NEXT_PUBLIC_STORAGE_TYPE=d1`

### Q: 视频卡顿？

**A:** 
1. 确保绑定了 KV 命名空间（变量名必须是 `KV`）
2. KV 缓存需要首次播放后生效，第二次播放会更快
3. 卡顿也可能是源站问题，尝试切换其他源

### Q: 如何自定义域名？

**A:**
1. 在 Pages 项目 **设置** → **自定义域**
2. 点击 **设置自定义域**
3. 输入你的域名
4. 按提示添加 DNS 记录

---

## 🐳 Docker 部署（备选）

如果你有服务器，也可以用 Docker 部署：

```bash
# 拉取镜像
docker pull ghcr.io/kzb12580/lunatv-cf:latest

# 运行（需要 Redis）
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
| `NEXT_PUBLIC_STORAGE_TYPE` | 存储类型 | localstorage |
| `USERNAME` | 管理员用户名 | - |
| `PASSWORD` | 管理员密码 | - |
| `REDIS_URL` | Redis 连接 URL | - |
| `NEXT_PUBLIC_SITE_NAME` | 站点名称 | LunaTV |

---

## 📝 配置视频源

编辑 `config.json` 添加播放源：

```json
{
  "cache_time": 7200,
  "api_site": {
    "source1": {
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
