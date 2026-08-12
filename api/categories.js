// Vercel Serverless Function: GET /api/categories
const core = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(core.handleCategories()));
};
