// 省份争霸 · 多选版（多地图 / 任意对手数量 / 随机起点）
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const NEUTRAL = '#3a4560';
const BASE_COLORS = ['#3fa7ff', '#ff5d5d', '#5ee07a', '#c77dff', '#ffa94d', '#2ee6d6', '#ff6fb5', '#d4e157'];
const color = o => o < BASE_COLORS.length ? BASE_COLORS[o] : `hsl(${(o * 137.5) % 360},70%,60%)`;
const hex2 = c => c.startsWith('#') ? c : c; // hsl 颜色不能直接拼 alpha
const tint = (o, a) => { const c = color(o); return c.startsWith('#') ? c + a : c.replace('hsl', 'hsla').replace(')', `,${parseInt(a, 16) / 255})`); };
const AI_NAMES = ['你', '赤军', '翠军', '紫军', '橙军', '青军', '粉军', '黄军'];
const nameOf = o => AI_NAMES[o] || `AI-${o}`;

const cfg = { map: 'china', diff: 1, speed: 1, ais: 3, ratio: 1, start: 'pick' };
const DIFF = [ // AI 思考间隔(秒)、进攻所需兵力倍数、是否多点合兵、是否主动增援
  { think: 3.2, margin: 1.6, combine: false, reinforce: false },
  { think: 1.8, margin: 1.25, combine: true, reinforce: false },
  { think: 1.3, margin: 1.15, combine: true, reinforce: true },
];
const SPAWN_GAP = 0.06, UNIT_SPEED = 55;
let attackLines = [];
let paused = false, zoom = 1, panX = 0, panY = 0, baseScale = 1, panDrag = null;
let MAP, nodes, units, queues, phase = 'setup', sel, scale, ox, oy, aiTimers, drag, hover, over, t0, maxArea, inc;

function resize() {
  cv.width = innerWidth * devicePixelRatio; cv.height = (innerHeight - 52) * devicePixelRatio;
  cv.style.width = innerWidth + 'px'; cv.style.height = (innerHeight - 52) + 'px';
  if (!MAP) return;
  const BOTTOM = 48; // 给底部提示栏留空
  const avail = innerHeight - 52 - BOTTOM;
  baseScale = Math.min(innerWidth / MAP.w, avail / MAP.h) * 0.96;
  scale = baseScale * zoom;
  if (MAP.wrap) { const Ws = MAP.w * scale; panX = ((panX + Ws / 2) % Ws + Ws) % Ws - Ws / 2; } // 横向循环
  ox = (innerWidth - MAP.w * scale) / 2 + panX; oy = (avail - MAP.h * scale) / 2 + panY;
}
addEventListener('resize', resize);

function loadMap(key) {
  MAP = MAPS[key]; MAP.wrap = key === 'world'; zoom = 1; panX = panY = 0;
  if (!MAP.ready) { for (const p of MAP.p) p.path = new Path2D(p.d); MAP.ready = true; }
  maxArea = Math.max(...MAP.p.map(p => p.area));
  // 据点半径随地图密度缩放
  MAP.r = Math.max(6, Math.min(14, 120 / Math.sqrt(MAP.p.length)));
  resize();
}
// 城市等级：产兵倍率 / 兵力上限。开局最高 3 级，4 级只能靠发展
const BASE_RATE = 1.5; // 3 级城市每秒产兵
const LEVELS = { 1: { mul: 1 / 3, cap: 40 }, 2: { mul: 2 / 3, cap: 70 }, 3: { mul: 1, cap: 100 }, 4: { mul: 1.5, cap: 150 } };
const EXP_NEED = { 1: 1500, 2: 3500, 3: 8000 }; // 升级所需经验（驻军人数 × 秒）
const EXP_TROOP_CAP = 100; // 经验只按最多 100 名驻军计算
const CAPTURE_EXP_LOSS = 0.5; // 易主时扣除「本级升级所需经验」的 50%，不够扣就降级 // 城市易主时损失 50% 经验
function setLevel(n, lv) { n.level = lv; n.rate = BASE_RATE * LEVELS[lv].mul; }
function buildNodes() {
  // 初始等级按经济水平（maps/levels.js），未列出的为 1 级
  const E = (window.ECON_LEVEL || {})[cfg.map] || {};
  const lvTable = {}; for (const lv of [2, 3]) for (const nm of (E[lv] || '').split(',')) if (nm) lvTable[nm] = lv;
  const lvOf = MAP.p.map(p => lvTable[p.name] || 1);
  nodes = MAP.p.map((p, i) => {
    const n = { i, p, owner: -1, acc: 0, exp: 0 };
    setLevel(n, lvOf[i]);
    n.troops = Math.round(6 + lvOf[i] * 6 + Math.random() * 4);
    return n;
  });
  units = []; queues = []; attackLines = []; sel = new Set(); drag = null; over = false; t0 = 0;
}

// ---------- 坐标 / 命中 ----------
const toMap = (x, y) => { let mx = (x - ox) / scale; if (MAP && MAP.wrap) mx = ((mx % MAP.w) + MAP.w) % MAP.w; return [mx, (y - 52 - oy) / scale]; };
const toScr = (x, y) => [ox + x * scale, oy + y * scale];
const nodeR = n => MAP.r * Math.sqrt(zoom) * (0.7 + 0.15 * n.level); // 等级越高圈越大：1 级 0.85，4 级 1.3
function pathHit(n, mx, my) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); const r = ctx.isPointInPath(n.p.path, mx, my); ctx.restore(); return r; }
function hitNode(ex, ey) {
  if (!nodes) return null;
  const [mx, my] = toMap(ex, ey);
  let best = null, bd = 1e9;
  for (const n of nodes) { const d = Math.hypot(n.p.cx - mx, n.p.cy - my) * scale; if (d < nodeR(n) + 2 && d < bd) { bd = d; best = n; } }
  if (best) return best;
  for (const n of nodes) if (pathHit(n, mx, my)) return n;
  return null;
}

// ---------- 出兵 ----------
// amount 不传：玩家按出兵比例；传入：AI 按需出兵，最多留 1 个兵
function send(fromList, target, amount) {
  let left = amount;
  for (const f of fromList) {
    if (f === target || f.owner < 0) continue;
    if (amount !== undefined && left <= 0) break;
    const n = amount === undefined ? Math.floor(f.troops * cfg.ratio) : Math.min(f.troops - 1, Math.ceil(left));
    if (amount !== undefined) left -= n;
    if (n < 1) continue;
    // 兵力在出发时逐个扣除（见 update 里的队列），不再一次扣光
    queues.push({ from: f, to: target, owner: f.owner, left: n, t: 0 });
    if (f.owner > 0) attackLines.push({ from: f, to: target, owner: f.owner, life: 1.6, max: 1.6 }); // AI 出兵提示线
  }
}

// ---------- 开局 ----------
function placeArmies(playerNode) {
  playerNode.owner = 0; playerNode.troops = Math.max(playerNode.troops, 20);
  const minD = nodes.map(c => Math.hypot(c.p.cx - playerNode.p.cx, c.p.cy - playerNode.p.cy));
  for (let a = 1; a <= cfg.ais; a++) { // 依次选离已有势力最远的空省（带随机扰动）
    let best = null, bs = -1;
    for (const c of nodes) {
      if (c.owner !== -1) continue;
      const s = minD[c.i] * (0.75 + Math.random() * 0.5);
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) break;
    best.owner = a; best.troops = Math.max(best.troops, 20);
    for (const c of nodes) minD[c.i] = Math.min(minD[c.i], Math.hypot(c.p.cx - best.p.cx, c.p.cy - best.p.cy));
  }
  aiTimers = Array.from({ length: cfg.ais + 1 }, () => Math.random() * 2);
  phase = 'play';
}

// ---------- 逻辑 ----------
function update(dt) {
  if (phase !== 'play' || paused) return;
  t0 += dt;
  for (const l of attackLines) l.life -= dt;
  attackLines = attackLines.filter(l => l.life > 0);
  for (const n of nodes) if (n.owner >= 0) {
    n.acc += n.rate * dt;
    while (n.acc >= 1) { n.acc--; n.troops++; }
  }
  for (const n of nodes) if (n.owner >= 0 && n.level < 4) {
    n.exp += Math.min(n.troops, EXP_TROOP_CAP) * dt;
    if (n.exp >= EXP_NEED[n.level]) { n.exp -= EXP_NEED[n.level]; setLevel(n, n.level + 1); n.flash = 1; toast(`⬆️ ${nameOf(n.owner)}的 ${n.p.name} 升到 ${n.level} 级`, n.owner); }
  }
  for (const q of queues) {
    q.t -= dt;
    while (q.left > 0 && q.t <= 0) {
      if (q.from.owner !== q.owner || q.from.troops < 1) { q.left = 0; break; } // 城市易主或兵已派完：剩下的不再出发
      q.t += SPAWN_GAP; q.left--; q.from.troops--;
      const j = (Math.random() - .5) * 6;
      units.push({ x: q.from.p.cx + j, y: q.from.p.cy + j, to: q.to, owner: q.owner, dead: false });
    }
  }
  queues = queues.filter(q => q.left > 0);
  for (const u of units) {
    if (u.dead) continue;
    const dx = u.to.p.cx - u.x, dy = u.to.p.cy - u.y, d = Math.hypot(dx, dy), s = UNIT_SPEED * dt;
    if (d <= s) { arrive(u); u.dead = true; } else { u.x += dx / d * s; u.y += dy / d * s; }
  }
  const grid = new Map(), CELL = 6; // 途中相遇抵消
  for (const u of units) {
    if (u.dead) continue;
    const k = ((u.x / CELL) | 0) * 4096 + ((u.y / CELL) | 0);
    let c = grid.get(k); if (!c) grid.set(k, c = []);
    const foe = c.find(v => !v.dead && v.owner !== u.owner && Math.hypot(v.x - u.x, v.y - u.y) < 3.5);
    if (foe) { foe.dead = true; u.dead = true; } else c.push(u);
  }
  units = units.filter(u => !u.dead);
  // 每帧统计：在途兵力、各方存活
  inc = new Map(); const live = new Set();
  const addInc = (to, o, v) => { const k = to.i * 10000 + o; inc.set(k, (inc.get(k) || 0) + v); };
  for (const u of units) { addInc(u.to, u.owner, 1); live.add(u.owner); }
  for (const q of queues) { addInc(q.to, q.owner, q.left); live.add(q.owner); }
  for (const n of nodes) if (n.owner >= 0) live.add(n.owner);
  // AI 太多时每帧只让一部分思考，避免卡顿
  let budget = 40;
  for (let a = 1; a <= cfg.ais; a++) {
    if (!live.has(a)) continue;
    aiTimers[a] -= dt;
    if (aiTimers[a] <= 0 && budget > 0) { budget--; aiTimers[a] = DIFF[cfg.diff].think * (0.7 + Math.random() * 0.6); ai(a); }
  }
  checkEnd(live);
}
function arrive(u) {
  const n = u.to;
  if (n.owner === u.owner) { n.troops++; return; }
  n.troops--;
  if (n.troops < 0) { toast(`⚔️ ${nameOf(u.owner)}${n.owner < 0 ? '占领了' : '攻下了' + nameOf(n.owner) + '的'} ${n.p.name}`, u.owner, n.owner); n.troops = 1; n.owner = u.owner; n.acc = 0; loseExp(n); sel.delete(n); }
}
function checkEnd(live) {
  if (over) return;
  const me = live.has(0), foes = [...live].some(o => o > 0);
  if (!me || !foes) {
    over = true; phase = 'end';
    $('mtitle').textContent = me ? `🎉 统一${MAP.title}！` : '💀 你被消灭了';
    $('mtitle').style.color = me ? '#ffd166' : '#ff5d5d';
    $('mtext').textContent = `用时 ${Math.round(t0)} 秒 · 占领 ${nodes.filter(n => n.owner === 0).length} / ${nodes.length} 个地区`;
    $('endMask').style.display = 'flex';
  }
}

// ---------- AI ----------
const incoming = (n, o) => (inc && inc.get(n.i * 10000 + o)) || 0;
function ai(a) {
  const D = DIFF[cfg.diff];
  const mine = nodes.filter(n => n.owner === a);
  if (!mine.length) return;
  const dist = (x, y) => Math.hypot(x.p.cx - y.p.cx, x.p.cy - y.p.cy);
  const reach = 260 * Math.sqrt(33 / nodes.length) + 60;
  if (D.reinforce) { // 困难：受威胁的据点请求增援
    for (const m of mine) {
      let threat = 0; for (let o = 0; o <= cfg.ais; o++) if (o !== a) threat += incoming(m, o);
      const gap = threat - m.troops - incoming(m, a);
      if (gap > 0) {
        const helpers = mine.filter(h => h !== m && h.troops > 15).sort((x, y) => dist(x, m) - dist(y, m)).slice(0, 2);
        if (helpers.length) { send(helpers, m, gap + 2); return; }
      }
    }
  }
  // 找出除自己外总兵力最多的一方
  const power = new Map();
  for (const n of nodes) if (n.owner >= 0 && n.owner !== a) power.set(n.owner, (power.get(n.owner) || 0) + n.troops + n.rate * 20);
  let leader = -1, lp = -1; for (const [o, v] of power) if (v > lp) { lp = v; leader = o; }
  let best = null, bs = -1e9;
  for (const t of nodes) {
    if (t.owner === a) continue;
    let nd = 1e9; for (const m of mine) nd = Math.min(nd, dist(m, t));
    if (nd > reach) continue;
    const near = mine.map(m => ({ m, d: dist(m, t) })).sort((x, y) => x.d - y.d);
    const need = (t.troops + (t.owner >= 0 ? t.rate * nd / UNIT_SPEED : 0)) * D.margin + 2 - incoming(t, a);
    const avail = near.slice(0, D.combine ? 3 : 1).filter(x => x.d < nd + 120).reduce((s, x) => s + x.m.troops - 1, 0);
    if (avail < need) continue;
    let s = t.rate * 30 - need - nd * 0.08;
    if (t.owner >= 0 && t.owner === leader) s += cfg.diff * 6; // 越难越针对当前最强的一方（可能是你，也可能是别的 AI）
    if (t.owner === -1) s += 4;
    if (s > bs) { bs = s; best = { near, need, t }; }
  }
  if (!best) return;
  send(best.near.slice(0, D.combine ? 3 : 1).map(x => x.m), best.t, best.need);
}

// ---------- 输入（多选） ----------
cv.addEventListener('contextmenu', e => e.preventDefault());
// 滚轮缩放（以鼠标为中心），右键/中键拖动平移，右键单击清空选择
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (!MAP) return;
  const [mx, my] = toMap(e.clientX, e.clientY);
  zoom = Math.max(1, Math.min(8, zoom * Math.exp(-e.deltaY * 0.0015)));
  if (zoom === 1 && !MAP.wrap) { panX = panY = 0; resize(); return; }
  resize();
  const [sx, sy] = toScr(mx, my); // 让鼠标下的点保持不动
  panX += e.clientX - sx; panY += e.clientY - 52 - sy; resize();
}, { passive: false });
cv.addEventListener('mousedown', e => { if (e.button === 1 || e.button === 2) panDrag = { x: e.clientX, y: e.clientY, moved: false }; });
addEventListener('mousemove', e => {
  if (!panDrag) return;
  const dx = e.clientX - panDrag.x, dy = e.clientY - panDrag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) panDrag.moved = true;
  if (panDrag.moved && (zoom > 1 || MAP.wrap)) { panX += dx; panY += dy; panDrag.x = e.clientX; panDrag.y = e.clientY; resize(); }
});
addEventListener('mouseup', e => { if (panDrag && (e.button === 1 || e.button === 2)) { if (!panDrag.moved && e.button === 2) rightClick(e); panDrag = null; } });
const held = new Set();
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if ('wasd'.includes(k) && k && !/INPUT|SELECT/.test(e.target.tagName)) held.add(k); });
addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());
function panByKeys(realDt) { // WASD 移动视野，每秒约 700 像素
  if (!held.size || !MAP) return;
  const v = 700 * realDt;
  if (held.has('a')) panX += v; if (held.has('d')) panX -= v;
  if (held.has('w')) panY += v; if (held.has('s')) panY -= v;
  resize();
}
addEventListener('keydown', e => { if (e.key === '0' && !/INPUT|SELECT/.test(e.target.tagName)) { zoom = 1; panX = panY = 0; resize(); } });
cv.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const n = hitNode(e.clientX, e.clientY);
  if (paused) return;
  if (phase === 'pick') { if (n) placeArmies(n); return; }
  if (phase !== 'play') return;
  drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, from: n, moved: false, shift: e.shiftKey || e.metaKey || e.ctrlKey, t0: performance.now() };
  if (n && n.owner === 0) drag.chain = new Set(sel.has(n) ? [...sel] : [n]);
});
addEventListener('mousemove', e => {
  hover = (phase === 'play' || phase === 'pick') ? hitNode(e.clientX, e.clientY) : null;
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) > 6) drag.moved = true;
  if (drag.chain && drag.moved && hover && hover.owner === 0) drag.chain.add(hover); // 途经己方城市自动串联
});
const LONG_PRESS = 350; // ms
addEventListener('mouseup', e => {
  if (e.button !== 0 || !drag) return;
  const d = drag; drag = null;
  if (phase !== 'play') return;
  const n = hitNode(e.clientX, e.clientY);
  if (d.chain) {
    if (d.moved) { // 拖动松开：串联城市一起往目标出兵（己方即增援）
      if (n && !(d.chain.size === 1 && d.chain.has(n))) { send([...d.chain].filter(g => g !== n), n); sel.clear(); }
      return;
    }
    const src = d.from;
    if (performance.now() - d.t0 >= LONG_PRESS || d.shift) { sel.has(src) ? sel.delete(src) : sel.add(src); } // 长按：加入/移出选择
    else if (sel.size && !sel.has(src)) { send([...sel], src); sel.clear(); } // 短按己方城市＝选中城市增援它
    else if (sel.size === 1 && sel.has(src)) sel.clear();
    else { sel.clear(); sel.add(src); }
    return;
  }
  if (d.moved) { // 空白处拖动：框选
    const [ax, ay] = toMap(Math.min(d.x0, d.x), Math.min(d.y0, d.y)), [bx, by] = toMap(Math.max(d.x0, d.x), Math.max(d.y0, d.y));
    if (!d.shift) sel.clear();
    for (const m of nodes) if (m.owner === 0 && m.p.cx >= ax && m.p.cx <= bx && m.p.cy >= ay && m.p.cy <= by) sel.add(m);
    return;
  }
  if (n && sel.size) { send([...sel], n); sel.clear(); }
  else if (!d.shift) sel.clear();
});
// 右键单击：选中的城市往这里出兵（己方即增援）
function rightClick(e) {
  if (phase !== 'play' || paused) return;
  const n = hitNode(e.clientX, e.clientY);
  if (n && sel.size) send([...sel].filter(g => g !== n), n);
}
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'q' || e.key === 'Q') selectAll();
  if (e.code === 'Space' || e.key === 'Escape') { e.preventDefault(); togglePause(); }
});
function setPaused(v) {
  paused = v && phase === 'play';
  $('pauseBtn').textContent = paused ? '▶ 继续 (空格/Esc)' : '⏸ 暂停 (空格/Esc)';
  $('pauseBtn').classList.toggle('on', paused);
  $('pauseTag').style.display = paused ? 'block' : 'none';
}
function togglePause() { setPaused(!paused); }
$('pauseBtn').onclick = e => { togglePause(); e.target.blur(); };
addEventListener('blur', () => setPaused(true)); // 切走窗口自动暂停
function selectAll() { if (phase === 'play') nodes.forEach(n => n.owner === 0 && sel.add(n)); }
$('selAll').onclick = selectAll;

function bindGroup(attr, key, parse) {
  const bs = document.querySelectorAll(`[data-${attr}]`);
  bs.forEach(b => b.onclick = () => { bs.forEach(x => x.classList.remove('on')); b.classList.add('on'); cfg[key] = parse(b.dataset[attr]); });
}
bindGroup('d', 'diff', Number); bindGroup('s', 'speed', Number); bindGroup('r', 'ratio', Number);

// ---------- 开局设置面板 ----------
function refreshSetup() {
  loadMap(cfg.map); buildNodes(); phase = 'setup';
  const maxAi = MAP.p.length - 1; // 对手 + 你 = 全部地区
  cfg.ais = Math.max(1, Math.min(cfg.ais, maxAi));
  for (const id of ['aiRange', 'aiNum']) { $(id).max = maxAi; $(id).value = cfg.ais; }
  $('aiMax').textContent = `最多 ${maxAi}（共 ${MAP.p.length} 个地区）`;
  const opts = MAP.p.map((p, i) => [i, p.name]).sort((a, b) => a[1].localeCompare(b[1], 'zh'));
  $('startSel').innerHTML = '<option value="pick">在地图上点选</option><option value="random">🎲 随机</option>' + opts.map(([i, n]) => `<option value="${i}">${n}</option>`).join('');
  $('startSel').value = cfg.start === 'pick' || cfg.start === 'random' ? cfg.start : 'pick';
  document.querySelectorAll('#mapBtns button').forEach(b => b.classList.toggle('on', b.dataset.m === cfg.map));
}
$('mapBtns').innerHTML = MAP_INDEX.map(m => `<button data-m="${m.key}">${m.title}<span class="hint"> ${m.n}</span></button>`).join('');
document.querySelectorAll('#mapBtns button').forEach(b => b.onclick = () => { cfg.map = b.dataset.m; refreshSetup(); });
const setAi = v => { const max = +$('aiNum').max; cfg.ais = Math.max(1, Math.min(max, Math.round(+v) || 1)); $('aiRange').value = $('aiNum').value = cfg.ais; };
$('aiRange').oninput = e => setAi(e.target.value);
$('aiNum').onchange = e => setAi(e.target.value);
$('startSel').onchange = e => cfg.start = e.target.value;
function openSetup() { setPaused(false); $('endMask').style.display = 'none'; refreshSetup(); $('setup').style.display = 'flex'; }
$('newGame').onclick = openSetup; $('again').onclick = openSetup;
$('goBtn').onclick = () => {
  $('setup').style.display = 'none';
  buildNodes();
  const s = cfg.start;
  if (s === 'pick') phase = 'pick';
  else placeArmies(nodes[s === 'random' ? Math.floor(Math.random() * nodes.length) : +s]);
};

// ---------- 绘制 ----------
let firstPass = true;
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!nodes) return;
  if (!MAP.wrap) { firstPass = true; drawPass(); return; }
  const base = ox, Ws = MAP.w * scale;
  for (const k of [-1, 0, 1]) { // 世界地图：左右各再画一份，实现无缝循环
    ox = base + k * Ws; firstPass = k === 0;
    if (ox + Ws > 0 && ox < innerWidth) drawPass();
  }
  ox = base;
}
function drawPass() {
  const dpr = devicePixelRatio;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  for (const n of nodes) {
    ctx.fillStyle = n.owner < 0 ? NEUTRAL : tint(n.owner, sel.has(n) ? 'cc' : '88');
    ctx.fill(n.p.path);
    ctx.lineWidth = 1 / scale; ctx.strokeStyle = '#0b1424'; ctx.stroke(n.p.path);
    if (hover === n) { ctx.fillStyle = '#ffffff22'; ctx.fill(n.p.path); }
  }
  if (drag && drag.chain && drag.moved) { // 串联拖拽箭头
    const group = [...drag.chain];
    const tx = (drag.x - ox) / scale, ty = (drag.y - 52 - oy) / scale;
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2 / scale; ctx.setLineDash([6 / scale, 4 / scale]);
    for (const g of group) { ctx.beginPath(); ctx.moveTo(g.p.cx, g.p.cy); ctx.lineTo(tx, ty); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  for (const l of attackLines) { // AI 进攻提示线：虚线 + 箭头，指向你的城市时为红色加粗
    const a = l.life / l.max, toMe = l.to.owner === 0;
    const x1 = l.from.p.cx, y1 = l.from.p.cy, x2 = l.to.p.cx, y2 = l.to.p.cy, ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.globalAlpha = Math.min(1, a * 1.5);
    ctx.strokeStyle = toMe ? '#ff3b3b' : color(l.owner); ctx.lineWidth = (toMe ? 2.5 : 1.5) / scale;
    ctx.setLineDash([5 / scale, 4 / scale]); ctx.lineDashOffset = -performance.now() / 40 / scale;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
    const h = 8 / scale, ex = x2 - Math.cos(ang) * MAP.r / scale, ey = y2 - Math.sin(ang) * MAP.r / scale;
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(ex, ey);
    ctx.lineTo(ex - h * Math.cos(ang - 0.45), ey - h * Math.sin(ang - 0.45)); ctx.lineTo(ex - h * Math.cos(ang + 0.45), ey - h * Math.sin(ang + 0.45)); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const ur = Math.max(1, MAP.r / 7) / Math.sqrt(zoom);
  for (const u of units) { ctx.fillStyle = color(u.owner); ctx.beginPath(); ctx.arc(u.x, u.y, ur, 0, 7); ctx.fill(); }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fs = Math.round(MAP.r * Math.sqrt(zoom) * 0.9);
  for (const n of nodes) {
    const [x, y] = toScr(n.p.cx, n.p.cy), r = nodeR(n), s = sel.has(n);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = n.owner < 0 ? '#566180' : color(n.owner); ctx.fill();
    ctx.lineWidth = s ? 3 : 1.5; ctx.strokeStyle = s ? '#ffd166' : '#0b1424'; ctx.stroke();
    if (drag && drag.chain && drag.chain.has(n) && !s) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffd166'; ctx.stroke(); }
    if (n.owner >= 0 && n.level < 4) {
      ctx.beginPath(); ctx.arc(x, y, r + 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * n.exp / EXP_NEED[n.level]);
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (n.flash > 0) { if (firstPass) n.flash -= 0.02; ctx.beginPath(); ctx.arc(x, y, r + 14 * (1 - n.flash), 0, 7); ctx.strokeStyle = `rgba(255,209,102,${Math.max(0, n.flash)})`; ctx.lineWidth = 3; ctx.stroke(); }
    { // 等级圆点：圈上方，几级就几个点（4 级为金色）
      const dr = Math.max(2, r * 0.18), gap = dr * 2.6, by = y - r - dr - 3;
      for (let k = 0; k < n.level; k++) {
        ctx.beginPath(); ctx.arc(x + (k - (n.level - 1) / 2) * gap, by, dr, 0, 7);
        ctx.fillStyle = n.level === 4 ? '#ffd166' : '#ffffff'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = '#0b1424'; ctx.stroke();
      }
    }
    if (s) { ctx.beginPath(); ctx.arc(x, y, r + 4 + Math.sin(performance.now() / 150) * 1.5, 0, 7); ctx.strokeStyle = '#ffd16688'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px sans-serif`; ctx.fillText(n.troops, x, y + 1);
    if (MAP.r * Math.sqrt(zoom) >= 9 || hover === n) { ctx.fillStyle = '#ffffffbb'; ctx.font = `${Math.max(10, fs - 2)}px sans-serif`; ctx.fillText(hover === n && n.p.full ? n.p.full : n.p.name, x, y + r + 8); }
  }
  if (drag && drag.moved && !drag.chain && firstPass) { // 框选矩形
    ctx.translate(0, -52);
    ctx.fillStyle = '#ffd16622'; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1;
    ctx.fillRect(drag.x0, drag.y0, drag.x - drag.x0, drag.y - drag.y0); ctx.strokeRect(drag.x0, drag.y0, drag.x - drag.x0, drag.y - drag.y0);
  }
}
function hud() { // 状态栏：只列出你和兵力前 4 的对手
  if (!nodes) return;
  const agg = new Map();
  for (const n of nodes) if (n.owner >= 0) { const a = agg.get(n.owner) || { c: 0, t: 0 }; a.c++; a.t += n.troops; agg.set(n.owner, a); }
  const others = [...agg.keys()].filter(o => o > 0).sort((a, b) => agg.get(b).t - agg.get(a).t);
  const show = [0, ...others.slice(0, 4)];
  const rest = others.length - 4;
  $('stats').innerHTML = show.map(o => { const a = agg.get(o) || { c: 0, t: 0 }; return `<span><b style="background:${color(o)}"></b>${nameOf(o)} ${a.c}地 / ${a.t}兵</span>`; }).join('')
    + (rest > 0 ? `<span>+${rest} 个对手</span>` : '');
  $('tip').innerHTML = phase === 'pick' ? `点击地图选择你在<em>${MAP.title}</em>的起始地区`
    : phase === 'play' ? `已选 <em>${sel.size}</em> · 按住己方城市<em>拖到</em>目标出兵 · <em>长按</em>加入选择 · 空白拖动框选 · 圆点＝等级 · WASD 移动 · 滚轮缩放 · Q 全选 · 空格暂停`
    : '';
  $('tip').style.display = $('tip').innerHTML ? '' : 'none';
}

let last = performance.now(), hudT = 0;
function loop(now) {
  const realDt = Math.min(0.05, (now - last) / 1000), dt = realDt * cfg.speed; last = now;
  panByKeys(realDt);
  update(dt); draw();
  if ((hudT -= dt) <= 0) { hudT = 0.2; hud(); }
  requestAnimationFrame(loop);
}
openSetup(); requestAnimationFrame(loop);

// ---------- 顶部事件提示 ----------
function toast(text, a, b) {
  const box = $('toasts'), el = document.createElement('div');
  const mine = a === 0 || b === 0;
  el.className = 'toast' + (mine ? ' mine' : '');
  el.style.borderLeftColor = color(b === 0 ? b : a);
  el.textContent = text;
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 400); }, mine ? 3500 : 2200);
}

// 城市易主：扣经验，不够就降一级并从上一级的经验里继续扣
function loseExp(n) {
  const loss = EXP_NEED[Math.min(n.level, 3)] * CAPTURE_EXP_LOSS;
  n.exp -= loss;
  if (n.exp < 0 && n.level > 1) {
    setLevel(n, n.level - 1);
    n.exp = Math.max(0, n.exp + EXP_NEED[n.level]);
    toast(`⬇️ ${n.p.name} 经验不足，降为 ${n.level} 级`, n.owner);
  } else n.exp = Math.max(0, n.exp);
}
