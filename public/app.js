const $ = (s) => document.querySelector(s);
const resultEl = $('#result');

// 多菜品列表状态（用于排序 / 折叠）
let currentQuery = '';
let currentDishes = null;
let currentWords = null;
let currentMode = 'search'; // 'search' | 'category'
let currentCatIcon = '';
let currentCatLabel = '';
let dishSort = 'default';
let dishShowAll = false;

const EXAMPLES = ['宫保鸡丁', '番茄炒蛋', '红烧肉', '麻婆豆腐', '可乐鸡翅', '酸辣土豆丝', '牛肉面', '凉拌黄瓜'];

// 渲染示例 chips
function renderChips(list, onClick) {
  const wrap = $('#chips');
  wrap.innerHTML = '';
  (list || EXAMPLES).forEach((name) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = name;
    c.onclick = () => { $('#searchInput').value = name; doSearch(name); };
    wrap.appendChild(c);
  });
}

function fmt(n) { return (n || 0).toLocaleString('zh-CN'); }
function fmtPlay(p) {
  if (p == null) return '';
  if (p >= 10000) return (p / 10000).toFixed(1) + '万';
  return String(p);
}
function fmtDur(d) {
  if (d == null) return '';
  const m = Math.floor(d / 60), s = d % 60;
  return m + ':' + String(s).padStart(2, '0');
}

async function doSearch(dish) {
  dish = (dish || $('#searchInput').value).trim();
  if (!dish) return;
  resultEl.innerHTML = '<div class="loading">🔍 正在搜索「' + escapeHtml(dish) + '」的菜谱与教学视频…</div>';
  try {
    const res = await fetch('/api/search?dish=' + encodeURIComponent(dish));
    if (!res.ok) throw new Error('服务器返回 ' + res.status + '，请刷新重试');
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('服务器返回异常，请刷新重试'); }
    render(data);
  } catch (e) {
    resultEl.innerHTML = '<div class="empty">请求失败：' + escapeHtml(e.message) + '<br/><button class="chip" style="margin-top:10px" onclick="doSearch()">重试</button></div>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(data) {
  // 多菜品模式：输入"牛肉"等食材时，或联网（下厨房）搜不到本地时，列出多个做法
  if (data.dishes && data.dishes.length) {
    currentMode = data.live ? 'livelist' : 'search';
    currentQuery = data.query || '';
    currentWords = data.live ? ['下厨房'] : (data.words || null);
    currentDishes = data.dishes.slice();
    dishSort = 'default';
    dishShowAll = false;
    paintDishList();
    return;
  }
  const parts = [];
  const dish = data.recipe ? data.recipe.name : (data.query || '');

  // 教学视频（平台搜索按钮）
  let videoHtml = '<h2 class="section-title">🎬 教学视频</h2>';
  const links = data.links || {};
  videoHtml += '<div class="platforms">';
  if (links.douyin) videoHtml += platBtn('抖音', links.douyin, '🎵', dish, true);
  if (links.bilibili) videoHtml += platBtn('哔哩哔哩', links.bilibili, '📺');
  if (links.kuaishou) videoHtml += platBtn('快手', links.kuaishou, '⚡');
  if (links.xiaohongshu) videoHtml += platBtn('小红书', links.xiaohongshu, '📕');
  videoHtml += '</div>';

  const vids = data.videos || [];
  if (vids.length) {
    videoHtml += '<div class="videos">';
    vids.forEach((v) => {
      videoHtml += '<div class="video card" style="padding:12px">'
        + '<iframe src="https://player.bilibili.com/player.html?bvid=' + v.bvid + '&page=1&high_quality=1&danmaku=0" allowfullscreen></iframe>'
        + '<div class="meta"><a href="' + v.url + '" target="_blank" rel="noopener">' + escapeHtml(v.title) + '</a>'
        + ' · <span class="author">' + escapeHtml(v.author || '') + '</span>'
        + (v.play ? ' · ' + fmtPlay(v.play) + '播放' : '')
        + (v.duration ? ' · ' + fmtDur(v.duration) : '')
        + '</div></div>';
    });
    videoHtml += '</div>';
  } else {
    videoHtml += '<div class="empty">当前网络环境下未能拉取可内联播放的视频，点击上方平台按钮即可直接观看对应平台的「' + escapeHtml(dish) + '」教学视频。</div>';
  }
  parts.push(videoHtml);

  // 菜谱 + 热量
  if (data.recipe) {
    const r = data.recipe;
    const c = r.calories;
    let max = 0;
    c.items.forEach((i) => { if (i.subtotal > max) max = i.subtotal; });

    let html = '<h2 class="section-title">🥘 食材与热量</h2><div class="card">';
    let srcTag = '';
    if (r.source === 'live') {
      const origin = r.url ? ' <a class="src-link" href="' + r.url + '" target="_blank" rel="noopener">查看下厨房原文 ↗</a>' : '';
      srcTag = ' <span class="src-tag">📡 来自下厨房' + origin + '</span>';
    }
    html += '<div class="recipe-head"><h2>' + escapeHtml(r.name) + srcTag + '</h2><span class="recipe-desc">约 ' + r.servings + ' 人份</span></div>';
    if (r.desc) html += '<p class="recipe-desc">' + escapeHtml(r.desc) + '</p>';

    html += '<div class="kcal-grid">'
      + '<div class="kcal-box"><div class="num">' + fmt(c.total) + '</div><div class="label">总热量 (kcal)</div></div>'
      + '<div class="kcal-box"><div class="num per">' + fmt(c.perServing) + '</div><div class="label">每份热量 (kcal)</div></div>'
      + '</div>';

    if (c.unknown) html += '<div class="warn">⚠️ 部分食材暂无热量数据，未计入总计。</div>';

    html += '<table class="ing"><thead><tr><th>食材</th><th>用量</th><th>每100g热量</th><th>小计</th><th style="width:120px">占比</th></tr></thead><tbody>';
    c.items.forEach((i) => {
      const pct = max ? Math.round((i.subtotal / max) * 100) : 0;
      html += '<tr>'
        + '<td>' + escapeHtml(i.name) + '</td>'
        + '<td class="num">' + i.grams + ' g</td>'
        + '<td class="num">' + (i.known ? i.kcalPer100 + ' kcal' : '—') + '</td>'
        + '<td class="num">' + (i.known ? fmt(i.subtotal) + ' kcal' : '—') + '</td>'
        + '<td><div class="bar"><span style="width:' + pct + '%"></span></div></td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
    if (r.steps && r.steps.length) {
      html += '<h2 class="section-title">📝 做法步骤</h2><div class="card steps-card"><ol class="steps">';
      r.steps.forEach((s, i) => {
        html += '<li><span class="step-num">' + (i + 1) + '</span><span class="step-text">' + escapeHtml(s) + '</span></li>';
      });
      html += '</ol></div>';
    }
    parts.unshift(html);
  } else {
    let html = '<h2 class="section-title">🥘 食材与热量</h2><div class="card"><div class="empty">未收录「' + escapeHtml(dish) + '」的菜谱。<br/>你可以点击上方视频按钮学习做法，或试试以下菜品：</div>';
    if (data.suggestions && data.suggestions.length) {
      html += '<div class="suggest" style="margin-top:14px">';
      data.suggestions.forEach((s) => {
        html += '<span class="chip" onclick="doSearch(\'' + escapeAttr(s) + '\')">' + escapeHtml(s) + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';
    parts.unshift(html);
  }

  resultEl.innerHTML = parts.join('');
}

// 多菜品列表模式（输入食材如"牛肉"时、浏览某分类时、或联网搜不到本地时）+ 排序 / 折叠
function paintDishList() {
  const isCat = currentMode === 'category';
  const isLive = currentMode === 'livelist';
  const label = isCat
    ? currentCatIcon + ' ' + currentCatLabel
    : (currentWords && currentWords.length > 1 ? currentWords.join('、') : (currentQuery || ''));
  let list = currentDishes.slice();
  if (dishSort === 'asc') list.sort((a, b) => a.calories.total - b.calories.total);
  else if (dishSort === 'desc') list.sort((a, b) => b.calories.total - a.calories.total);
  const total = list.length;
  const shown = dishShowAll ? list : list.slice(0, 40);

  let titleText, noteText;
  if (isCat) { titleText = currentCatIcon + ' ' + currentCatLabel + ' · 共 ' + total + ' 道'; noteText = '点击下方任意一道查看食材、热量与教学视频：'; }
  else if (isLive) { titleText = '🔗 下厨房 · 共 ' + total + ' 道做法'; noteText = '本地菜谱未收录，以下为下厨房实时做法，点击任意一道查看食材、热量与原文：'; }
  else { titleText = '使用「' + label + '」的菜品'; noteText = '共找到 ' + total + ' 道相关菜品，点击任意一道查看食材、热量与教学视频：'; }

  let html = '<div class="multi-head"><h2 class="section-title" style="margin:0">' + escapeHtml(titleText) + '</h2>';
  html += '<div class="sort-btns">'
    + '<button data-sort="default" class="' + (dishSort === 'default' ? 'on' : '') + '">默认</button>'
    + '<button data-sort="asc" class="' + (dishSort === 'asc' ? 'on' : '') + '">热量↑</button>'
    + '<button data-sort="desc" class="' + (dishSort === 'desc' ? 'on' : '') + '">热量↓</button>'
    + '</div></div>';
  html += '<p class="multi-note">' + noteText + '</p>';
  html += '<div class="dish-grid">';
  shown.forEach((d, idx) => {
    html += '<div class="dish-card" data-idx="' + idx + '" data-dish="' + escapeAttr(d.name) + '">'
      + '<div class="dish-name">' + escapeHtml(d.name) + '</div>'
      + '<div class="dish-cal"><span class="num">' + fmt(d.calories.total) + '</span> kcal · 每份 ' + fmt(d.calories.perServing) + '</div>'
      + '<div class="dish-ing">' + (d.topIngredients || []).map(escapeHtml).join('、') + '</div>'
      + '<div class="dish-go">' + (isLive ? '查看做法 ↗' : '查看详情 →') + '</div>'
      + '</div>';
  });
  html += '</div>';
  if (total > 40 && !dishShowAll) {
    html += '<div class="more-wrap"><button id="showMore" class="chip" type="button">展开全部 ' + total + ' 道 ▾</button></div>';
  }
  resultEl.innerHTML = html;

  resultEl.querySelectorAll('.sort-btns button').forEach((b) => {
    b.onclick = () => { dishSort = b.getAttribute('data-sort'); paintDishList(); };
  });
  resultEl.querySelectorAll('.dish-card').forEach((card) => {
    card.onclick = () => {
      if (currentMode === 'livelist') {
        const idx = parseInt(card.getAttribute('data-idx'), 10);
        showLiveDetail(currentDishes[idx]);
      } else {
        doSearch(card.getAttribute('data-dish'));
      }
    };
  });
  const more = $('#showMore');
  if (more) more.onclick = () => { dishShowAll = true; paintDishList(); };
}

// 联网（下厨房）菜谱详情：复用单菜渲染，顶部加"返回做法列表"
function showLiveDetail(dish) {
  const r = dish._full || { name: dish.name, desc: dish.desc, servings: dish.servings, calories: dish.calories, source: 'live', url: dish.url };
  render({ recipe: r, links: platformLinks(r.name) });
  const back = document.createElement('div');
  back.className = 'back-row';
  back.innerHTML = '<button class="chip" id="backList" type="button">← 返回做法列表</button>';
  resultEl.insertBefore(back, resultEl.firstChild);
  const btn = $('#backList');
  if (btn) btn.onclick = () => { paintDishList(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
}

function platBtn(name, url, icon, dish, isDouyin) {
  if (isDouyin) {
    // 主按钮：直接打开抖音网页搜索（可正常跳转，电脑端可能会弹"打开应用"提示）
    // 副按钮：保留扫码提示，方便手机 App 观看
    return '<div class="plat-btn-wrap">'
      + '<a class="plat-btn" href="' + url + '" target="_blank" rel="noopener">' + icon + ' 抖音</a>'
      + '<button class="tip-btn douyin-tip" data-dish="' + escapeAttr(dish) + '" title="在抖音 App 中扫码搜索" type="button">📱</button>'
      + '</div>';
  }
  return '<a class="plat-btn" href="' + url + '" target="_blank" rel="noopener">' + icon + ' ' + name + '</a>';
}
function escapeAttr(s) { return String(s).replace(/'/g, "\\'"); }

function showDouyinTip(dish) {
  const kw = dish + ' 做法';
  try { if (navigator.clipboard) navigator.clipboard.writeText(kw); } catch (e) {}
  const existing = $('#douyinTip');
  if (existing) existing.remove();
  const tip = document.createElement('div');
  tip.id = 'douyinTip';
  tip.className = 'card douyin-tip-card';
  const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent('https://www.douyin.com/search/' + encodeURIComponent(kw));
  tip.innerHTML = '<div class="tip-head"><b>🎵 抖音搜索提示</b><button class="close-tip" aria-label="关闭" type="button">×</button></div>' +
    '<p>电脑端访问抖音网页可能会弹出“打开应用”提示。已为你复制搜索词，也可直接扫码在手机抖音查看：</p>' +
    '<div class="tip-body"><div class="tip-kw"><code>' + escapeHtml(kw) + '</code><button class="chip" id="copyKw" type="button">复制</button></div>' +
    '<img class="tip-qr" src="' + qr + '" alt="抖音搜索二维码" loading="lazy"/></div>' +
    '<p class="tip-note">在手机抖音顶部搜索框粘贴关键词即可。</p>';
  const after = $('#result .platforms');
  if (after) after.after(tip); else resultEl.appendChild(tip);
  $('#copyKw').onclick = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(kw).then(() => { $('#copyKw').textContent = '已复制'; setTimeout(() => $('#copyKw').textContent = '复制', 1500); });
    }
  };
  $('.close-tip').onclick = () => tip.remove();
}

resultEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tip-btn.douyin-tip');
  if (!btn) return;
  e.preventDefault();
  showDouyinTip(btn.getAttribute('data-dish'));
});

$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); doSearch(); });

// ---------- 分类浏览板块 ----------
async function loadCategories() {
  const wrap = $('#categories');
  if (!wrap) return;
  wrap.innerHTML = '<span class="chip" style="opacity:.6">加载分类中…</span>';
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    const cats = data.categories || [];
    if (!cats.length) { wrap.innerHTML = '<span class="chip">暂无可分类菜品</span>'; return; }
    wrap.innerHTML = '';
    cats.forEach((c) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cat-card';
      el.setAttribute('data-cat', c.key);
      el.innerHTML = '<span class="cat-icon">' + c.icon + '</span>'
        + '<span class="cat-name">' + escapeHtml(c.label) + '</span>'
        + '<span class="cat-count">' + c.count + ' 道</span>';
      el.onclick = () => loadCategory(c.key, c.icon, c.label);
      wrap.appendChild(el);
    });
  } catch (e) {
    wrap.innerHTML = '<span class="chip">分类加载失败</span>';
  }
}

async function loadCategory(key, icon, label) {
  // 高亮当前分类
  document.querySelectorAll('.cat-card').forEach((el) => {
    el.classList.toggle('on', el.getAttribute('data-cat') === key);
  });
  icon = icon || (CAT_ICONS[key] || '🍽️');
  label = label || (CAT_LABELS[key] || key);
  resultEl.innerHTML = '<div class="loading">🔍 正在整理「' + escapeHtml(label) + '」的菜品…</div>';
  try {
    const res = await fetch('/api/category?cat=' + encodeURIComponent(key) + '&n=300');
    if (!res.ok) throw new Error('服务器返回 ' + res.status);
    const data = await res.json();
    if (!data.dishes || !data.dishes.length) {
      resultEl.innerHTML = '<div class="empty">「' + escapeHtml(label) + '」分类下暂无菜品。</div>';
      return;
    }
    currentMode = 'category';
    currentCatIcon = icon;
    currentCatLabel = label;
    currentWords = null;
    currentDishes = data.dishes.slice();
    dishSort = 'default';
    dishShowAll = false;
    paintDishList();
    // 滚动到结果区
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    resultEl.innerHTML = '<div class="empty">分类加载失败：' + escapeHtml(e.message) + '</div>';
  }
}

// 分类元信息（前端兜底，避免图标缺失）
const CAT_ICONS = { '汤': '🍲', '牛肉': '🐂', '鸡肉': '🐔', '猪肉': '🐷', '羊肉': '🐑', '鸭肉': '🦆', '海鲜': '🦐', '青菜': '🥬', '素菜': '🥗', '其他': '🍽️' };
const CAT_LABELS = { '汤': '汤羹', '牛肉': '牛肉', '鸡肉': '鸡肉', '猪肉': '猪肉', '羊肉': '羊肉', '鸭肉': '鸭肉', '海鲜': '海鲜', '青菜': '青菜', '素菜': '素菜', '其他': '其他' };

// 随机推荐 chips：从后端随机取一批菜名，点击可搜索；刷新按钮换一批
async function loadRandomChips() {
  const wrap = $('#chips');
  wrap.innerHTML = '<span class="chip" style="opacity:.6">加载中…</span>';
  try {
    const res = await fetch('/api/random?n=12');
    const data = await res.json();
    renderChips(data.names || []);
  } catch (e) {
    renderChips(EXAMPLES);
  }
}
const refreshBtn = $('#refreshChips');
if (refreshBtn) refreshBtn.onclick = loadRandomChips;
loadRandomChips();
loadCategories();
