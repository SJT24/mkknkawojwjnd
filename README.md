# shanjitong-search-backend 1.1

独立部署的中文搜索 API + 简易网页前端。无须购买数据库，使用 JSON 文件保存索引；Render 免费服务的文件系统可能在重启/重新部署后丢失，适合验证和演示，不保证生产级持久化。

## Render 设置
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- 选择 Free 计划后再创建

部署完成后访问根网址应看到“善鸡通搜索”页面；`/health` 应返回 `{"ok":true,...}`；搜索“善鸡通”应至少返回一条示例结果。

## API
- `GET /health` 和 `GET /api/health`
- `GET /api/stats`
- `GET /api/pages`
- `GET /api/search?q=关键词`
- `POST /api/pages`（需要请求头 `x-admin-key: <ADMIN_API_KEY>`）
- `DELETE /api/pages/:id`（需要管理员密钥）

在 Render Dashboard → 服务 → Environment 中查看自动生成的 `ADMIN_API_KEY`。在网页“管理员：添加网页到搜索索引”区域粘贴该值即可添加内容。

本项目只提供手动录入内容与关键词检索，不是自动网页爬虫，也不含语义向量检索。
