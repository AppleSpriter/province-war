// 预处理地图：raw/*.json -> maps/<key>.js  （投影 + 抽稀 + 面积 + 据点位置）
const fs = require('fs');
const D = __dirname;
const ZH_WORLD = { China: '中国', Russia: '俄罗斯', 'United States of America': '美国', Canada: '加拿大', Brazil: '巴西', Australia: '澳大利亚', India: '印度', Japan: '日本', Germany: '德国', France: '法国', 'United Kingdom': '英国', Italy: '意大利', Spain: '西班牙', Mexico: '墨西哥', Indonesia: '印尼', Argentina: '阿根廷', Egypt: '埃及', 'South Africa': '南非', Kazakhstan: '哈萨克斯坦', Mongolia: '蒙古', Iran: '伊朗', 'Saudi Arabia': '沙特', Turkey: '土耳其', Pakistan: '巴基斯坦', 'South Korea': '韩国', 'North Korea': '朝鲜', Vietnam: '越南', Thailand: '泰国', Ukraine: '乌克兰', Poland: '波兰', Algeria: '阿尔及利亚', Nigeria: '尼日利亚', Ethiopia: '埃塞俄比亚', 'Democratic Republic of the Congo': '刚果(金)', Sudan: '苏丹', Libya: '利比亚', Peru: '秘鲁', Colombia: '哥伦比亚', Venezuela: '委内瑞拉', Chile: '智利', Bolivia: '玻利维亚', Greenland: '格陵兰', Norway: '挪威', Sweden: '瑞典', Finland: '芬兰', Afghanistan: '阿富汗', Iraq: '伊拉克', Myanmar: '缅甸', Philippines: '菲律宾', Malaysia: '马来西亚', 'New Zealand': '新西兰', Angola: '安哥拉', Mali: '马里', Niger: '尼日尔', Chad: '乍得', Kenya: '肯尼亚', Tanzania: '坦桑尼亚', Madagascar: '马达加斯加', Namibia: '纳米比亚', Botswana: '博茨瓦纳', Zambia: '赞比亚', Mozambique: '莫桑比克', Somalia: '索马里', Morocco: '摩洛哥', Mauritania: '毛里塔尼亚', Uzbekistan: '乌兹别克斯坦', Turkmenistan: '土库曼斯坦', Yemen: '也门', Oman: '阿曼', Nepal: '尼泊尔', Bangladesh: '孟加拉', Laos: '老挝', Cambodia: '柬埔寨', Romania: '罗马尼亚', Belarus: '白俄罗斯', Greece: '希腊', Portugal: '葡萄牙', Ireland: '爱尔兰', Iceland: '冰岛', Cuba: '古巴', Paraguay: '巴拉圭', Uruguay: '乌拉圭', Ecuador: '厄瓜多尔', 'Papua New Guinea': '巴新', Syria: '叙利亚', Israel: '以色列', Jordan: '约旦', Netherlands: '荷兰', Belgium: '比利时', Switzerland: '瑞士', Austria: '奥地利', 'Czech Republic': '捷克', Hungary: '匈牙利', Serbia: '塞尔维亚', Bulgaria: '保加利亚', Taiwan: '中国台湾' };
const BR = { AC: '阿克里', AL: '阿拉戈斯', AP: '阿马帕', AM: '亚马孙', BA: '巴伊亚', CE: '塞阿拉', DF: '联邦区', ES: '圣埃斯皮里图', GO: '戈亚斯', MA: '马拉尼昂', MT: '马托格罗索', MS: '南马托格罗索', MG: '米纳斯', PA: '帕拉', PB: '帕拉伊巴', PR: '巴拉那', PE: '伯南布哥', PI: '皮奥伊', RJ: '里约', RN: '北里奥', RS: '南里奥', RO: '朗多尼亚', RR: '罗赖马', SC: '圣卡塔琳娜', SP: '圣保罗', SE: '塞尔希培', TO: '托坎廷斯' };
const DE = { 'Baden-Württemberg': '巴登-符腾堡', Bayern: '巴伐利亚', Berlin: '柏林', Brandenburg: '勃兰登堡', Bremen: '不来梅', Hamburg: '汉堡', Hessen: '黑森', 'Mecklenburg-Vorpommern': '梅前州', Niedersachsen: '下萨克森', 'Nordrhein-Westfalen': '北威州', 'Rheinland-Pfalz': '莱法州', Saarland: '萨尔', Sachsen: '萨克森', 'Sachsen-Anhalt': '萨安州', 'Schleswig-Holstein': '石荷州', 'Thüringen': '图林根' };

const MAPS = [
  { key: 'china', title: '中国', file: 'china.json', lat: [17.5, 54], minD: 0, name: p => p.name && p.name.replace(/(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)$/, '') },
  { key: 'usa', title: '美国', file: 'usa.json', name: p => p.name, skip: n => ['Alaska', 'Hawaii', 'Puerto Rico'].includes(n), minD: 45 },
  { key: 'japan', title: '日本', file: 'japan.json', name: p => p.nam_ja.replace(/(都|府|県)$/, ''), lat: [24, 46], minD: 38 },
  { key: 'europe', title: '欧洲', file: 'europe.json', name: p => p.NAME, lon: [-25, 45], lat: [34, 72], skip: n => ['Azerbaijan', 'Armenia', 'Georgia', 'Kazakhstan'].includes(n), tiny: 40, minD: 50, minA: 120 },
  { key: 'india', title: '印度', file: 'india.json', name: p => p.NAME_1, minD: 50, minA: 150 },
  { key: 'brazil', title: '巴西', file: 'brazil.json', name: p => BR[p.sigla] || p.name, minD: 50 },
  { key: 'germany', title: '德国', file: 'germany.json', name: p => DE[p.name] || p.name, minD: 60 },
  { key: 'world', title: '世界', file: 'world.json', name: p => ZH_WORLD[p.name] || p.name, skip: n => ['Antarctica', 'French Southern and Antarctic Lands'].includes(n), lat: [-58, 80], tiny: 30, minD: 24, minA: 20 },
];

const merc = la => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, la)) * Math.PI / 360));
const ringArea = r => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); };
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const segDist = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
function simplify(pts, tol) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const q = out[out.length - 1]; if (Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]) >= tol) out.push(pts[i]); } return out; }
function label(ring) { // 在最大多边形内找离边界最远的点
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], bd = -1; const N = 24;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N;
    if (!inRing(x, y, ring)) continue;
    let d = 1e9; for (let k = 0; k < ring.length; k++) d = Math.min(d, segDist(x, y, ring[k], ring[(k + 1) % ring.length]));
    if (d > bd) { bd = d; best = [x, y]; }
  }
  return best;
}

fs.mkdirSync(D + '/maps', { recursive: true });
const index = [];
for (const M of MAPS) {
  const g = JSON.parse(fs.readFileSync(D + '/raw/' + M.file, 'utf8'));
  const feats = [];
  for (const f of g.features) {
    if (!f.geometry) continue;
    const name = M.name(f.properties || {});
    if (!name || (M.skip && M.skip(name))) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    const rings = polys.map(p => p[0]).filter(r => r.every(([lo, la]) => (!M.lon || (lo >= M.lon[0] && lo <= M.lon[1])) && (!M.lat || (la >= M.lat[0] && la <= M.lat[1]))));
    if (rings.length) feats.push({ name, rings });
  }
  // 自动取范围
  let lo0 = 1e9, lo1 = -1e9, la0 = 1e9, la1 = -1e9;
  for (const f of feats) for (const r of f.rings) for (const [lo, la] of r) { lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); la0 = Math.min(la0, la); la1 = Math.max(la1, la); }
  const W = 1000, yT = merc(la1), yB = merc(la0), kx = W / ((lo1 - lo0) * Math.PI / 180);
  const H = Math.round((yT - yB) * kx);
  const proj = ([lo, la]) => [(lo - lo0) * Math.PI / 180 * kx, (yT - merc(la)) * kx];
  const tol = W / 900;
  const out = [];
  for (const f of feats) {
    let d = '', area = 0, big = null, bigA = 0;
    for (const r0 of f.rings) {
      const r = simplify(r0.map(proj), tol), a = ringArea(r);
      if (r.length < 3 || a < 1.5) continue;
      area += a; if (a > bigA) { bigA = a; big = r; }
      d += 'M' + r.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join('L') + 'Z';
    }
    if (!d || area < (M.tiny || 0) * 0) continue;
    const [cx, cy] = label(big);
    out.push({ name: f.name, d, area: Math.round(area), cx: +cx.toFixed(1), cy: +cy.toFixed(1) });
  }
  // 合并同名（如欧洲数据里的重复国家）
  const merged = {};
  for (const o of out) { const m = merged[o.name]; if (!m) merged[o.name] = o; else { m.d += o.d; if (o.area > m.area) { m.cx = o.cx; m.cy = o.cy; } m.area += o.area; } }
  // 世界地图：中国台湾归入中国（不单列、不出现在「含…」描述里）
  if (merged['中国台湾'] && merged['中国']) { const t = merged['中国台湾'], c = merged['中国']; c.d += t.d; c.area += t.area; delete merged['中国台湾']; }
  let list = Object.values(merged);
  // 合并过近 / 过小的地区：小的并入离它最近的大地区，直到任意两个据点间距 >= minD
  const minD = M.minD || 26, minA = M.minA || 0;
  for (;;) {
    let pick = null, pd = 1e9;
    for (const a of list) for (const b of list) {
      if (a === b) continue;
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if ((d < minD || a.area < minA) && a.area <= b.area && d < pd) { pd = d; pick = [a, b]; }
    }
    if (!pick) break;
    const [a, b] = pick;
    b.d += a.d; b.area += a.area; (b.absorbed = b.absorbed || []).push(a.name, ...(a.absorbed || []));
    list = list.filter(x => x !== a);
  }
  for (const o of list) { if (o.absorbed) o.full = o.name + '（含 ' + o.absorbed.join('、') + '）'; delete o.absorbed; }
  fs.writeFileSync(`${D}/maps/${M.key}.js`, `(window.MAPS=window.MAPS||{})[${JSON.stringify(M.key)}]=` + JSON.stringify({ title: M.title, w: W, h: H, p: list }) + ';');
  index.push({ key: M.key, title: M.title, n: list.length });
  console.log(M.key, list.length, 'regions', W + 'x' + H, (fs.statSync(`${D}/maps/${M.key}.js`).size / 1024 | 0) + 'KB');
}
fs.writeFileSync(D + '/maps/index.js', 'window.MAP_INDEX=' + JSON.stringify(index) + ';');
