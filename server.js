// 本地开发服务器（常驻端口版）：供 localhost 调试用。
// 线上部署（Vercel）走 api/ 下的 serverless 函数，不会用到本文件。
const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('./lib/core');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJSON(res, obj, status = 200) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;
    const q = u.searchParams;
    if (p === '/api/search') {
      const dish = (q.get('dish') || '').trim();
      if (!dish) return sendJSON(res, { mode: 'none' }, 400);
      return sendJSON(res, await core.handleSearch(dish));
    }
    if (p === '/api/categories') return sendJSON(res, core.handleCategories());
    if (p === '/api/category') {
      const cat = (q.get('cat') || '').trim();
      const n = Math.min(parseInt(q.get('n'), 10) || 80, 300);
      if (!cat) return sendJSON(res, { error: 'missing cat' }, 400);
      return sendJSON(res, core.handleCategory(cat, n));
    }
    if (p === '/api/random') {
      const n = Math.min(parseInt(q.get('n'), 10) || 8, 24);
      return sendJSON(res, await core.handleRandom(n));
    }
    serveStatic(req, res);
  } catch (e) {
    console.error('[request error]', e);
    if (!res.headersSent) sendJSON(res, { error: 'internal error' }, 500);
  }
});

server.on('error', (e) => { console.error('[server error]', e); });
server.listen(PORT, () => {
  console.log('✅ 本地服务已启动: http://localhost:' + PORT);
});
