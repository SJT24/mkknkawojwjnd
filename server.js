import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'documents.json');
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const MAX_DOCS = 2000;
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const starter = [{
      id: 'welcome-shanjitong',
      url: 'https://example.com/shanjitong-search',
      title: '善鸡通搜索服务使用说明',
      description: '这是搜索后端的示例文档。你可以搜索“善鸡通”“搜索服务”，也可以通过管理员面板添加自己的网页内容。',
      text: 'shanjitong-search-backend 已启动。健康检查地址为 /health，搜索接口为 /api/search?q=关键词。添加文档需要管理员密钥。',
      updatedAt: new Date().toISOString()
    }];
    fs.writeFileSync(DATA_FILE, JSON.stringify(starter, null, 2), 'utf8');
  }
}
function readDocs() {
  ensureStore();
  try { const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); return Array.isArray(data) ? data : []; }
  catch (e) { console.error('Cannot read index file:', e.message); return []; }
}
function writeDocs(docs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(docs, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}
function norm(s) { return String(s || '').toLocaleLowerCase().trim(); }
function adminOnly(req, res, next) {
  if (!ADMIN_API_KEY) return res.status(503).json({ ok: false, error: '管理员密钥未配置。请在 Render 环境变量中设置 ADMIN_API_KEY。' });
  const supplied = req.get('x-admin-key') || '';
  const a = Buffer.from(supplied), b = Buffer.from(ADMIN_API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ ok: false, error: '管理员密钥错误或缺失。' });
  next();
}
function rank(doc, terms) {
  const title = norm(doc.title), desc = norm(doc.description), body = norm(doc.text);
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (title.includes(term)) score += 8;
    if (desc.includes(term)) score += 4;
    if (body.includes(term)) score += 1;
  }
  return score;
}
app.get('/health', (_req, res) => res.json({ ok: true, service: 'shanjitong-search-backend', timestamp: new Date().toISOString() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'shanjitong-search-backend', timestamp: new Date().toISOString() }));
app.get('/api/stats', (_req, res) => res.json({ ok: true, count: readDocs().length, storage: 'json-file', note: 'Render 免费实例的本地文件可能在重启或重新部署后丢失。' }));
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: '请提供查询参数 q，例如 /api/search?q=善鸡通' });
  if (q.length > 200) return res.status(400).json({ ok: false, error: '查询词不能超过 200 个字符' });
  const terms = q.split(/\s+/).filter(Boolean);
  const results = readDocs().map(doc => ({ doc, score: rank(doc, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.doc.updatedAt).localeCompare(String(a.doc.updatedAt)))
    .slice(0, Math.min(Math.max(Number(req.query.limit) || 10, 1), 50))
    .map(({ doc, score }) => ({ id: doc.id, url: doc.url, title: doc.title, description: doc.description, score, snippet: String(doc.description || doc.text || '').slice(0, 240), updatedAt: doc.updatedAt }));
  res.json({ ok: true, query: q, count: results.length, results });
});
app.get('/api/pages', (_req, res) => {
  const docs = readDocs().map(({ text, ...doc }) => doc);
  res.json({ ok: true, count: docs.length, pages: docs });
});
app.post('/api/pages', adminOnly, (req, res) => {
  const url = String(req.body?.url || '').trim();
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const text = String(req.body?.text || '').trim();
  if (!url || !title || !text) return res.status(400).json({ ok: false, error: 'url、title、text 为必填字段。' });
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ ok: false, error: 'URL 格式无效。' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ ok: false, error: '只允许 HTTP/HTTPS URL。' });
  if (title.length > 300 || description.length > 3000 || text.length > 100000) return res.status(413).json({ ok: false, error: '字段内容过长。' });
  const docs = readDocs();
  const index = docs.findIndex(d => d.url === url);
  if (index < 0 && docs.length >= MAX_DOCS) return res.status(507).json({ ok: false, error: '索引已达到 2000 篇上限。' });
  const doc = { id: index >= 0 ? docs[index].id : crypto.randomUUID(), url, title, description, text, updatedAt: new Date().toISOString() };
  if (index >= 0) docs[index] = doc; else docs.unshift(doc);
  writeDocs(docs);
  res.status(index >= 0 ? 200 : 201).json({ ok: true, page: { id: doc.id, url, title, updatedAt: doc.updatedAt } });
});
app.delete('/api/pages/:id', adminOnly, (req, res) => {
  const docs = readDocs();
  const next = docs.filter(d => d.id !== req.params.id);
  if (next.length === docs.length) return res.status(404).json({ ok: false, error: '未找到该文档。' });
  writeDocs(next);
  res.json({ ok: true, deleted: true });
});
app.post('/api/instant', (req, res) => {
  const q = String(req.body?.q || '').trim();
  if (!q || q.length > 200) return res.status(400).json({ ok: false, error: '请提供 1–200 个字符的 q。' });
  res.json({ ok: true, query: q, message: '即时问答接口尚未连接外部搜索引擎；请使用 /api/search 进行本地索引检索。' });
});
app.use((err, _req, res, _next) => {
  console.error('Request error:', err.message);
  res.status(err.status === 413 ? 413 : 400).json({ ok: false, error: '请求格式错误或请求体过大。' });
});
ensureStore();
app.listen(PORT, '0.0.0.0', () => console.log(`shanjitong-search-backend listening on 0.0.0.0:${PORT}`));
