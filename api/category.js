// Vercel Serverless Function: GET /api/category?cat=汤&n=80
const core = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = new URL(req.url, 'http://localhost');
  const cat = (u.searchParams.get('cat') || '').trim();
  const n = Math.min(parseInt(u.searchParams.get('n'), 10) || 80, 300);
  if (!cat) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'missing cat' })); }
  res.end(JSON.stringify(core.handleCategory(cat, n)));
};
