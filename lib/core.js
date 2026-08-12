// 核心业务逻辑（被本地 server.js 与 Vercel serverless 函数共用）
// 零依赖：仅用 Node 内置模块 + 全局 fetch（Node 18+）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { liveSearch } = require('../live');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT = 8000;

// ---------- 数据加载（内存缓存） ----------
let RECIPES = null;
let INGREDIENTS = null;
function loadData() {
  if (!RECIPES) RECIPES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'recipes.json'), 'utf8'));
  if (!INGREDIENTS) INGREDIENTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ingredients.json'), 'utf8'));
}
loadData();

// ---------- 菜谱匹配 + 热量计算 ----------
const ALIAS_MAP = {
  '鸡胸肉': '鸡肉', '鸡腿肉': '鸡肉', '猪瘦肉': '猪肉', '猪五花肉': '猪肉', '猪肚': '猪肉',
  '肥牛': '牛肉', '羊肉(瘦)': '羊肉', '鱼(鲫鱼)': '鱼', '排骨(猪小排)': '排骨', '牛肉(瘦)': '牛肉',
  '螃蟹': '蟹', '大闸蟹': '蟹', '大虾': '虾', '基围虾': '虾', '小龙虾': '虾', '明虾': '虾',
  '花蛤': '蛤蜊', '蛤蜊(花甲)': '蛤蜊', '小黄鱼': '鱼', '鲈鱼': '鱼', '巴沙鱼': '鱼',
  '马铃薯': '土豆', '西红柿': '番茄'
};
function recipeHasWord(r, w) {
  const targets = ALIAS_MAP[w] ? [w, ALIAS_MAP[w]] : [w];
  const name = r.name.toLowerCase();
  const aliases = (r.alias || []).map(a => a.toLowerCase());
  const ingNames = r.ingredients.map(it => it.n.toLowerCase());
  return targets.some(t => name.includes(t) || aliases.some(a => a.includes(t)) || ingNames.some(n => n.includes(t)));
}

function searchDishes(dish) {
  const raw = dish.trim().toLowerCase();
  if (!raw) return { mode: 'none' };

  const words = raw.split(/[\s,，、+]+/).filter(Boolean);

  if (words.length === 1) {
    const q = words[0];
    const exact = RECIPES.find(r =>
      r.name.toLowerCase() === q ||
      (r.alias || []).some(a => a.toLowerCase() === q) ||
      q.includes(r.name.toLowerCase()) ||
      (r.alias || []).some(a => q.includes(a.toLowerCase()))
    );
    if (exact) return { mode: 'single', recipe: exact };
  }

  const matched = RECIPES.filter(r => words.every(w => recipeHasWord(r, w)));
  if (matched.length === 1) return { mode: 'single', recipe: matched[0] };
  if (matched.length > 1) {
    const dishes = matched.map(r => {
      const c = calcCalories(r);
      return {
        name: r.name,
        desc: r.desc || '',
        servings: r.servings,
        calories: { total: c.total, perServing: c.perServing },
        topIngredients: r.ingredients.slice(0, 5).map(it => it.n)
      };
    });
    return { mode: 'multiple', dishes, words };
  }
  return { mode: 'none' };
}

function calcCalories(recipe) {
  const items = recipe.ingredients.map(it => {
    const kcalPer100 = INGREDIENTS[it.n];
    const known = typeof kcalPer100 === 'number';
    const subtotal = known ? Math.round((it.g * kcalPer100) / 100) : 0;
    return { name: it.n, grams: it.g, kcalPer100: known ? kcalPer100 : null, subtotal, known };
  });
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  return { items, total, perServing: Math.round(total / recipe.servings), unknown: items.some(i => !i.known) };
}

// ---------- 分类 ----------
const CAT_META = {
  '汤':   { icon: '🍲', label: '汤羹' },
  '牛肉': { icon: '🐂', label: '牛肉' },
  '鸡肉': { icon: '🐔', label: '鸡肉' },
  '猪肉': { icon: '🐷', label: '猪肉' },
  '羊肉': { icon: '🐑', label: '羊肉' },
  '鸭肉': { icon: '🦆', label: '鸭肉' },
  '海鲜': { icon: '🦐', label: '海鲜' },
  '青菜': { icon: '🥬', label: '青菜' },
  '素菜': { icon: '🥗', label: '素菜' },
  '其他': { icon: '🍽️', label: '其他' },
};
const CAT_ORDER = ['青菜', '海鲜', '牛肉', '猪肉', '鸡肉', '素菜', '汤', '羊肉', '鸭肉', '其他'];

const KEYWORDS = {
  '汤':   { name: /汤|煲|羹|粥|炖/ },
  '牛肉': { ing: ['牛肉', '牛排', '牛腩', '肥牛'], name: /牛肉|牛排|牛腩|肥牛|牛柳|牛尾/ },
  '鸡肉': { ing: ['鸡肉', '鸡腿肉', '鸡胸肉', '鸡翅'], name: /鸡(?!蛋|蛋羹|蛋花|蛋饼|蛋汤|蛋糕)/ },
  '猪肉': { ing: ['猪肉', '猪瘦肉', '猪肝', '猪血', '排骨', '五花肉', '香肠'], name: /猪|排骨|五花肉|里脊|腔骨|猪蹄|猪手|火腿|腊肉|培根|香肠/ },
  '羊肉': { ing: ['羊肉', '羊排', '羊蝎子'], name: /羊肉|羊排|羊蝎子|涮羊肉/ },
  '鸭肉': { ing: ['鸭肉', '鸭', '鹅'], name: /鸭|鹅|烤鸭|盐水鸭/ },
  '海鲜': {
    ing: ['鱼', '鱿鱼', '带鱼', '鲅鱼', '鳕鱼', '三文鱼', '鲍鱼', '虾', '虾仁', '蟹', '牛蛙', '海参', '花甲', '蛏子', '扇贝', '海螺', '龙虾', '海蜇', '牡蛎'],
    name: /(虾|蟹|鱿鱼|鲍鱼|带鱼|鲅鱼|鳕鱼|三文鱼|花甲|蛏子|扇贝|海参|龙虾|牛蛙|海蜇|海螺|蛤|田鸡|蚬|牡蛎)/
  },
  '青菜': {
    ing: ['白菜', '油菜', '菠菜', '芹菜', '韭菜', '生菜', '油麦菜', '空心菜', '娃娃菜', '上海青', '芥蓝', '茼蒿', '包菜', '卷心菜', '西葫芦', '蒿', '芥菜', '雪里蕻', '莴笋', '西兰花', '豌豆苗', '青苔', '菜心'],
    name: /(炒青菜|青菜|菠菜|芹菜|韭菜|生菜|油麦菜|空心菜|娃娃菜|上海青|芥蓝|茼蒿|包菜|卷心菜|西葫芦|西兰花|菜心|芥菜)/
  },
  '素菜': {
    ing: ['香菇', '金针菇', '杏鲍菇', '蘑菇', '平菇', '白玉菇', '蟹味菇', '芦笋', '竹笋', '豆腐', '豆腐干', '豆腐皮', '豆皮', '腐竹', '豆角', '荷兰豆', '豌豆', '毛豆', '黄豆', '绿豆', '红豆', '豆芽', '豆浆', '土豆', '胡萝卜', '冬瓜', '南瓜', '莲藕', '山药', '黄瓜', '番茄', '西红柿', '玉米', '木耳', '海带', '洋葱', '青椒', '辣椒', '花生', '秋葵', '芋头', '粉丝', '粉条', '丝瓜', '苦瓜', '茄子', '银耳', '百合', '荸荠', '茭白', '凉皮', '鸡蛋', '鹌鹑蛋', '蒜苗', '蒜苔', '魔芋', '韭黄', '萝卜', '紫甘蓝', '花菜', '香椿'],
    name: /(香菇|蘑菇|金针菇|杏鲍菇|笋|豆腐|豆角|土豆|胡萝卜|冬瓜|南瓜|莲藕|山药|黄瓜|番茄|西红柿|玉米|木耳|海带|洋葱|青椒|辣椒|花生|秋葵|芋头|丝瓜|苦瓜|茄子|萝卜|鸡蛋|腐竹|粉丝)/
  },
};

function classify(r) {
  const name = r.name || '';
  const ingNames = r.ingredients.map(i => i.n);
  const order = ['汤', '牛肉', '鸡肉', '猪肉', '羊肉', '鸭肉', '海鲜', '青菜', '素菜'];
  for (const cat of order) {
    const k = KEYWORDS[cat];
    if (k.name && k.name.test(name)) return cat;
    if (k.ing && k.ing.some(s => ingNames.some(n => n.includes(s)))) return cat;
  }
  return '其他';
}

let CATEGORY_INDEX = null;
function buildCategoryIndex() {
  if (CATEGORY_INDEX) return CATEGORY_INDEX;
  const idx = {};
  RECIPES.forEach((r, i) => {
    const c = classify(r);
    (idx[c] = idx[c] || []).push(i);
  });
  CATEGORY_INDEX = idx;
  return idx;
}

function dishesOfCategory(cat, limit) {
  const idx = buildCategoryIndex();
  const ids = (idx[cat] || []).slice();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, limit).map(i => {
    const r = RECIPES[i];
    const c = calcCalories(r);
    return {
      name: r.name,
      desc: r.desc || '',
      servings: r.servings,
      calories: { total: c.total, perServing: c.perServing },
      topIngredients: r.ingredients.slice(0, 5).map(it => it.n)
    };
  });
}

// ---------- B站 wbi 签名搜索 ----------
const mixinKeyEncTab = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
function getMixinKey(orig) { let s = ''; for (const i of mixinKeyEncTab) s += orig[i]; return s.slice(0, 32); }

let wbiCache = { key: null, ts: 0 };
async function getWbiKey(cookie) {
  if (wbiCache.key && Date.now() - wbiCache.ts < 10 * 60 * 1000) return wbiCache.key;
  const nav = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com', 'Cookie': cookie }
  });
  const j = await nav.json();
  const img = j.data.wbi_img.img_url.split('/').pop().split('.')[0];
  const sub = j.data.wbi_img.sub_url.split('/').pop().split('.')[0];
  const key = getMixinKey(img + sub);
  wbiCache = { key, ts: Date.now() };
  return key;
}

let cookieCache = { value: '', ts: 0 };
function parseCookies(res) {
  const sc = res.headers.get('set-cookie');
  if (!sc) return '';
  return sc.split(',').map(c => c.split(';')[0]).join('; ');
}
async function getCookie() {
  if (cookieCache.value && Date.now() - cookieCache.ts < 30 * 60 * 1000) return cookieCache.value;
  try {
    const r = await fetch('https://www.bilibili.com/', { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com' } });
    const c = parseCookies(r);
    if (c) cookieCache = { value: c, ts: Date.now() };
  } catch (e) { /* ignore */ }
  return cookieCache.value;
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function searchBilibili(keyword) {
  try {
    const cookie = await getCookie();
    const key = await getWbiKey(cookie);
    const params = { search_type: 'video', keyword, page: 1, wts: Math.floor(Date.now() / 1000) };
    const qs = Object.keys(params).sort().map(k => k + '=' + encodeURIComponent(params[k])).join('&');
    const w_rid = crypto.createHash('md5').update(qs + key).digest('hex');
    const url = 'https://api.bilibili.com/x/web-interface/search/type?' + qs + '&w_rid=' + w_rid;
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com',
        'Cookie': cookie,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch (e) { return []; }
    if (j.code !== 0) return [];
    return (j.data.result || []).slice(0, 6).map(v => ({
      title: (v.title || '').replace(/<[^>]+>/g, ''),
      bvid: v.bvid,
      author: v.author,
      cover: (v.pic || '').replace('http://', 'https://'),
      url: 'https://www.bilibili.com/video/' + v.bvid,
      duration: v.duration,
      play: v.play
    }));
  } catch (e) {
    console.error('[bilibili] search failed:', e.message);
    return [];
  }
}

function platformLinks(dish) {
  const q = encodeURIComponent(dish + ' 做法');
  const b = encodeURIComponent(dish);
  return {
    douyin: 'https://www.douyin.com/search/' + q,
    kuaishou: 'https://www.kuaishou.com/search/video?searchKey=' + q,
    xiaohongshu: 'https://www.xiaohongshu.com/search_result?keyword=' + q,
    bilibili: 'https://search.bilibili.com/all?keyword=' + b
  };
}

// ---------- 对外统一入口（供 server.js 与 api 函数复用） ----------
async function handleSearch(dish) {
  const found = searchDishes(dish);
  const payload = { query: dish, mode: found.mode };
  if (found.mode === 'single') {
    const recipe = found.recipe;
    const videos = await searchBilibili(recipe.name + ' 做法');
    payload.recipe = { name: recipe.name, desc: recipe.desc, servings: recipe.servings, calories: calcCalories(recipe) };
    payload.videos = videos;
    payload.links = platformLinks(recipe.name);
  } else if (found.mode === 'multiple') {
    payload.dishes = found.dishes;
    if (found.words) payload.words = found.words;
  } else {
    let live = null;
    try { live = await liveSearch(dish); } catch (e) { console.error('[live] search failed:', e.message); }
    if (live && live.length) {
      if (live.length === 1) {
        const r = live[0];
        payload.mode = 'single';
        payload.recipe = r;
        payload.videos = await searchBilibili(r.name + ' 做法');
        payload.links = platformLinks(r.name);
        payload.source = 'live';
      } else {
        payload.mode = 'multiple';
        payload.live = true;
        payload.dishes = live.map(r => ({
          name: r.name,
          desc: r.desc || '',
          servings: r.servings,
          calories: { total: r.calories.total, perServing: r.calories.perServing },
          topIngredients: r.calories.items.filter(i => i.known).map(i => i.name).slice(0, 5),
          source: 'live',
          url: r.url,
          _full: r
        }));
      }
    } else {
      payload.suggestions = RECIPES.map(r => r.name);
    }
  }
  return payload;
}

function handleCategories() {
  const idx = buildCategoryIndex();
  const list = CAT_ORDER
    .filter(c => idx[c] && idx[c].length)
    .map(c => ({ key: c, label: CAT_META[c].label, icon: CAT_META[c].icon, count: idx[c].length }));
  return { categories: list };
}

function handleCategory(cat, n) {
  const meta = CAT_META[cat] || { icon: '🍽️', label: cat };
  const dishes = dishesOfCategory(cat, n);
  return { category: cat, label: meta.label, icon: meta.icon, count: dishes.length, dishes };
}

async function handleRandom(n) {
  const all = RECIPES.map(r => r.name);
  const HOT = ['红烧肉','宫保鸡丁','牛肉面','鱼香肉丝','糖醋里脊','回锅肉','东坡肉','梅菜扣肉','酸菜鱼','水煮鱼','辣子鸡','口水鸡','夫妻肺片','咖喱鸡','葱烧海参','麻婆豆腐','番茄炒蛋','可乐鸡翅','酸辣土豆丝','凉拌黄瓜','青椒牛肉','孜然牛肉','番茄牛肉','黑椒牛柳','土豆炖牛肉','萝卜炖牛肉','水煮牛肉','西兰花炒牛肉','葱爆牛肉','煎牛排','卤牛肉','蒜蓉西兰花','葱油拌面','番茄炖豆腐','萝卜粉丝煲','香菇滑鸡饭','玉米排骨汤','鲜菇炒西兰花','家庭版麻婆豆腐','蚝油香菇','木耳炒鸡蛋','香辣花甲','盐焗大虾','酱油蒸全蛋','鸡蛋炒豆腐','蒜蓉粉丝蒸蛏子','香菇油菜','黄瓜口蘑炒蛋','嫩炒牛肉','凉拌皮蛋豆腐','灯笼土豆','地瓜丸子'];
  const picks = [];
  const take = (pool, k) => {
    const arr = pool.slice();
    for (let i = 0; i < k && arr.length; i++) {
      const j = Math.floor(Math.random() * arr.length);
      picks.push(arr.splice(j, 1)[0]);
    }
  };
  take(HOT, Math.ceil(n / 2));
  take(all, n - picks.length);
  const seen = new Set();
  return { names: picks.filter(x => (seen.has(x) ? false : (seen.add(x), true))).slice(0, n) };
}

module.exports = {
  handleSearch, handleCategories, handleCategory, handleRandom,
  searchDishes, calcCalories, buildCategoryIndex, dishesOfCategory,
  searchBilibili, platformLinks, CAT_META, CAT_ORDER
};
