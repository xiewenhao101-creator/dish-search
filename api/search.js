// Vercel Serverless Function: GET /api/search?dish=xxx
const core = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const dish = decodeURIComponent(new URL(req.url, 'http://localhost').searchParams.get('dish') || '').trim();
  if (!dish) { res.statusCode = 400; return res.end(JSON.stringify({ mode: 'none' })); }
  try {
    res.end(JSON.stringify(await core.handleSearch(dish)));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'internal error', message: e.message }));
  }
};
