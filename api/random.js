// Vercel Serverless Function: GET /api/random?n=8
const core = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const n = Math.min(parseInt(new URL(req.url, 'http://localhost').searchParams.get('n'), 10) || 8, 24);
  res.end(JSON.stringify(await core.handleRandom(n)));
};
