// 实时联网模块：下厨房移动版抓取 + 解析（零依赖，仅用 Node 内置）
// 用途：本地菜谱库搜不到时，实时抓取下厨房菜谱，解析食材/步骤并算热量。
const fs = require('fs');
const path = require('path');

const INGREDIENTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ingredients.json'), 'utf8'));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const MOBILE = 'https://m.xiachufang.com';
const TIMEOUT = 12000;

// 下厨房食材名 -> ingredients.json 标准名（对齐热量表）
const NAME_MAP = {
  '姜片': '姜', '姜末': '姜', '生姜': '姜', '姜丝': '姜',
  '葱花': '葱', '葱段': '葱', '葱末': '葱', '小葱': '葱', '香葱': '葱', '大葱': '葱',
  '蒜瓣': '蒜', '蒜末': '蒜', '大蒜': '蒜', '蒜蓉': '蒜',
  '鸡翅': '鸡翅', '鸡腿': '鸡腿肉', '鸡胸': '鸡胸肉', '鸡胸肉': '鸡胸肉',
  '食用油': '食用油', '植物油': '食用油', '色拉油': '食用油', '玉米油': '食用油', '橄榄油': '食用油',
  '白砂糖': '白砂糖', '白糖': '白砂糖', '冰糖': '冰糖',
  '生抽': '生抽', '酱油': '生抽', '老抽': '老抽', '蒸鱼豉油': '生抽',
  '料酒': '料酒', '黄酒': '料酒', '米酒': '料酒',
  '盐': '盐', '蚝油': '蚝油', '醋': '醋', '香醋': '醋', '陈醋': '醋', '米醋': '醋', '白醋': '醋',
  '芝麻油': '香油', '花椒': '花椒', '八角': '八角', '干辣椒': '干辣椒', '辣椒粉': '干辣椒',
  '番茄': '番茄', '西红柿': '番茄', '土豆': '土豆', '马铃薯': '土豆', '胡萝卜': '胡萝卜',
  '可口可乐': '可乐', '可乐': '可乐', '百事可乐': '可乐',
  '牛奶': '牛奶', '鸡蛋': '鸡蛋',
  '奶油': '奶油', '淡奶油': '奶油',
  '龙虾': '龙虾',
  '意大利面': '意大利面', '意面': '意大利面', '直面': '意大利面', '螺旋面': '意大利面',
  '奶酪': '奶酪', '芝士': '奶酪', '芝士片': '奶酪', '马苏里拉': '奶酪',
  '黄油': '黄油',
  '洋葱': '洋葱', '洋葱丝': '洋葱',
  '香菇': '香菇', '口蘑': '口蘑', '蘑菇': '香菇',
  '面粉': '面粉', '低筋面粉': '面粉', '高筋面粉': '面粉',
  '蜂蜜': '蜂蜜'
};

// 单件克数（用于「只/个/颗/片」等无克数单位，取常见均值）
const PIECE_G = {
  '鸡翅': 50, '鸡蛋': 50, '鸡腿肉': 150, '鸡胸肉': 120, '牛肉(瘦)': 200, '猪肉': 150,
  '鱼': 500, '虾': 15, '虾仁': 15, '龙虾': 200, '番茄': 200, '土豆': 150, '洋葱': 150,
  '青椒': 100, '胡萝卜': 80, '姜': 3, '葱': 10, '蒜': 5, '八角': 1, '干辣椒': 2, '小米辣': 5,
  '香菇': 10, '木耳': 2, '豆腐': 300, '米饭(熟)': 200, '面条(熟)': 200, '意大利面': 100, '奶酪': 20
};

function mapName(n) { return NAME_MAP[n] || NAME_MAP[n.replace(/\s/g, '')] || n; }

// 把「6-8只 / 1瓶 / 1勺 / 适量 / 1只（500g）」这类用量转成克数；无法量化返回 null
function parseAmount(amount, name) {
  if (!amount) return null;
  if (/适量|少许|若干|一些|大量|依口味|一点点|自由/.test(amount)) return null;
  // 优先：明确带 克/g/ml/毫升 的数值（兼容「1只（500g）」「1瓶（500ml）」）
  let m = amount.match(/([\d.]+)\s*(?:克|g|G|ml|毫升|mL)/);
  if (m) return parseFloat(m[1]);
  // 范围（6-8只 → 7）
  m = amount.match(/([\d.]+)\s*[-~到至]\s*([\d.]+)/);
  let num;
  if (m) num = (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  else { m = amount.match(/([\d.]+)/); num = m ? parseFloat(m[1]) : null; }
  if (num == null) return null;
  if (/千克|公斤/.test(amount)) return num * 1000;
  if (/斤/.test(amount)) return num * 500;
  if (/汤匙|勺|茶匙/.test(amount)) return num * 15;    // 1 平勺 ≈ 15g
  if (/瓶/.test(amount)) return 500;                  // 瓶装调料/可乐 ≈ 500g
  if (/只|个|颗|粒|枚|片|段|根|瓣|块/.test(amount)) {
    const pg = PIECE_G[name] || PIECE_G[mapName(name)] || 50;
    return Math.round(num * pg);
  }
  return num; // 纯数字按克
}

function cleanName(raw) {
  return (raw || '').replace(/^[#＃]+/, '').replace(/【[^】]*】/g, '').replace(/\s+/g, ' ').trim();
}

function parseDetail(txt) {
  const SKIP = ['装饰', '点缀', '摆盘', 'garnish', '水', '冰块', '凉水', '热水'];
  const ings = [];
  const lines = [...txt.matchAll(/class="ing-line"[^>]*>([\s\S]*?)<\/a>/g)];
  for (const m of lines) {
    const b = m[1];
    const name = cleanName((b.match(/class="ing-name[^"]*"[^>]*>\s*([^<]+?)\s*<\/div>/) || [])[1]);
    const amount = (b.match(/class="ing-amount[^"]*"[^>]*>\s*([^<]*)<\/div>/) || [])[1] || '';
    if (name && !SKIP.includes(name)) ings.push({ name, amount: amount.trim() });
  }
  const steps = [...txt.matchAll(/class="step-text"[^>]*>\s*([\s\S]*?)<\/div>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // 菜名优先取页面内 <h1 class="recipe-name">，更干净（避免误吞 style 内同名 class）
  let name = '';
  const rm = txt.match(/<h1[^>]*class="[^"]*recipe-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (rm) name = cleanName(rm[1].replace(/<[^>]+>/g, '').replace(/用APP打开/g, '')).split(/[｜|｜\-\—]/)[0].trim();
  if (!name) {
    const tm = txt.match(/<title[^>]*>([^<]+)<\/title>/);
    if (tm) name = tm[1].replace(/【步骤图】/g, '').split(/[_\-|]/)[0].replace(/的做法.*$/, '').replace(/的?做法步骤?.*$/, '').trim();
  }
  return { name, ings, steps };
}

// ---- 反爬：先拿首页 cookie，提升后续请求成功率 ----
let cookieCache = '';
async function ensureCookie() {
  if (cookieCache) return;
  try {
    const r = await fetch(MOBILE + '/', { headers: { 'User-Agent': UA } });
    const sc = r.headers.get('set-cookie');
    if (sc) cookieCache = sc.split(',').map(c => c.split(';')[0]).join('; ');
  } catch (e) { /* ignore */ }
}

async function fetchText(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', 'Cookie': cookieCache, ...headers },
      signal: ctrl.signal
    });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function searchIds(kw) {
  await ensureCookie();
  const txt = await fetchText(MOBILE + '/search/?keyword=' + encodeURIComponent(kw), { Referer: MOBILE + '/' });
  if (!txt) return [];
  return [...txt.matchAll(/\/recipe\/(\d+)/g)].map(m => m[1]).slice(0, 8);
}

// 解析单条菜谱为与本地 single 模式同构的对象，失败返回 null
function buildRecipe(id, txt, dish) {
  const d = parseDetail(txt);
  if (!d.ings.length) return null;
  const ingredients = d.ings.map(i => {
    const std = mapName(i.name);
    return { n: std, g: parseAmount(i.amount, std), raw: i.amount };
  });
  const items = ingredients.map(it => {
    const kcal = INGREDIENTS[it.n];
    const known = typeof kcal === 'number';
    const counted = known && it.g != null;
    const subtotal = counted ? Math.round(it.g * kcal / 100) : 0;
    return { name: it.n, grams: it.g, raw: it.raw, kcalPer100: known ? kcal : null, subtotal, known: counted };
  });
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const servings = 2; // 下厨房默认按 2 人份估算
  return {
    name: d.name || dish,
    desc: '来自下厨房实时抓取',
    servings,
    calories: { items, total, perServing: Math.round(total / servings), unknown: items.some(i => !i.known) },
    steps: d.steps,
    source: 'live',
    url: MOBILE + '/recipe/' + id
  };
}

// 主入口：返回多条做法（数组），搜不到时也能给"多几个选项"；偶发限流重试一轮
async function tryMany(dish, n) {
  await ensureCookie();
  const ids = await searchIds(dish);
  if (!ids.length) return [];
  const out = [];
  for (const id of ids) {
    const txt = await fetchText(MOBILE + '/recipe/' + id);
    if (!txt) continue;
    const r = buildRecipe(id, txt, dish);
    if (r) out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

async function liveSearch(dish) {
  let r = await tryMany(dish, 5);
  if (!r.length) r = await tryMany(dish, 5); // 偶发限流/超时，重试一轮
  return r; // 始终返回数组（可能为空）
}

module.exports = { liveSearch };
