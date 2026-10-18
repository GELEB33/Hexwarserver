// Сгенерировано extract-core.js из index.html — не редактируйте вручную
const HexCore = (function () {
'use strict';
// ---- 00-config.js ----
// ============ Настройки и общие мелочи ============
const CFG = {
  units: {
    1: { name: 'Крестьянин', cost: 10, upkeep: 2,  atk: 1, def: 1 },
    2: { name: 'Копейщик',   cost: 20, upkeep: 6,  atk: 2, def: 2 },
    3: { name: 'Барон',      cost: 30, upkeep: 18, atk: 3, def: 3 },
    4: { name: 'Рыцарь',     cost: 40, upkeep: 36, atk: 4, def: 3 }
  },
  buildings: {
    farm:  { name: 'Ферма',    cost: 12, costStep: 2, income: 4, upkeep: 0, def: 0 },
    tower: { name: 'Башня',    cost: 15, costStep: 0, income: 0, upkeep: 1, def: 2 },
    fort:  { name: 'Крепость', cost: 35, costStep: 0, income: 0, upkeep: 6, def: 3 }
  },
  ship: { name: 'Корабль', cost: 25, upkeep: 3, range: 5 },          // вмещает одного солдата
  res: { life: 5, density: 0.07, wood: { name: 'Лес', income: 3 }, stone: { name: 'Камень', income: 5 }, gold: { name: 'Золото', income: 10, life: 10 } },
  // золотая жила: одновременно не больше max на карте, живёт life ходов (считая от появления), +10 монет тому, кто владеет клеткой
  gold: { max: 2, chance: 0.45, firstRound: 2 },
  // дуэль: фермы только рядом с другими фермами (первая — где угодно) и дороже: каждая следующая дорожнее на farmStep (в обычном режиме — на 2)
  duel: { farmStep: 6 },
  // настройки ИИ (подобраны симуляциями бот против бота)
  ai: { farmDiv: 4, farmCap: 14, farmFree: 4, contactBase: 3, contactDiv: 10, fortV: 9, fortExtra: 3, defVal: 0.5, fortNet: 5 },
  blitz: { rounds: 10, money: 300 },
  landIncome: 1, treeIncome: 0,
  moveRange: 4,
  startMoney: 25, startTiles: 8,
  treeDensity: 0.1, treeSpreadMin: 2, treeSpreadMax: 6,
  dominationShare: 0.7,
  diplo: { minTreatyRounds: 2, proposalTTL: 3, refuseCooldown: 2, maxMoney: 500, minTerm: 2, maxTerm: 10 }
};
const SHAPES = ['hex', 'round', 'rect', 'ring', 'cross', 'dumbbell', 'archipelago', 'triangle'];
const resLife = kind => (CFG.res[kind] && CFG.res[kind].life) || CFG.res.life;

const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isInt = Number.isInteger;
const key = (q, r) => q + ',' + r;
const RANK = { war: 0, peace: 1, alliance: 2 };
const LVL_RU = { peace: 'дружбу', alliance: 'альянс' };
// Имена по цвету: имя всегда совпадает с цветом на карте
const COLOR_ADJ = ['Красный', 'Синий', 'Оливковый', 'Фиолетовый', 'Зелёный', 'Серый', 'Оранжевый', 'Бирюзовый', 'Жёлтый', 'Розовый'];
const botName = i => COLOR_ADJ[i % 10] + ' бот';
const humanName = i => COLOR_ADJ[i % 10] + ' игрок';

function hexDist(a, b) { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; }
function rnd(G) { G.seed = (G.seed + 0x6D2B79F5) | 0; let t = G.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function rint(G, a, b) { return a + Math.floor(rnd(G) * (b - a + 1)); }
const ok = (msg, extra) => Object.assign({ ok: true, msg: msg || '' }, extra || {});
const fail = msg => ({ ok: false, msg });

function ev(G, msg) {
  G.events.push({ id: ++G.evId, msg });
  if (G.events.length > 40) G.events.splice(0, G.events.length - 40);
}

// соседи любой координаты: суша (G.tiles) и море (G.sea) хранятся отдельно
function nbrs(G, t) {
  const out = [];
  for (const d of DIRS) { const n = G.tiles.get(key(t.q + d[0], t.r + d[1])); if (n) out.push(n); }
  return out;
}
function seaNbrs(G, t) {
  const out = [];
  for (const d of DIRS) { const n = G.sea.get(key(t.q + d[0], t.r + d[1])); if (n) out.push(n); }
  return out;
}
const tileAt = (G, k) => G.tiles.get(k) || G.sea.get(k) || null;

// ---- 10-map.js ----
// ============ Создание партии и сохранение ============
function newGame(opts) {
  const base = (opts.seed != null ? opts.seed : Date.now()) | 0;
  for (let a = 0; a < 140; a++) { const G = tryGen(opts, base + a * 7919, a); if (G) return G; }
  throw new Error('Не удалось сгенерировать карту');
}

function components(G) {
  const seen = new Set(), out = [];
  for (const t of G.tiles.values()) {
    if (seen.has(t)) continue;
    const comp = [t]; seen.add(t);
    for (let i = 0; i < comp.length; i++) for (const m of nbrs(G, comp[i])) if (!seen.has(m)) { seen.add(m); comp.push(m); }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length);
}

// Маска формы карты: has(q, r) — клетка входит в форму. Размеры считаются в «ширинах клетки»,
// площадь у всех форм примерно одинаковая (≈ как у шестиугольника радиуса R).
function shapeMask(G, shape, R) {
  const X = (q, r) => q + r / 2, Y = r => r * 0.866;
  const lim = (q, r) => Math.abs(q) <= 36 && Math.abs(r) <= 36;
  let f;
  if (shape === 'round') {
    const p1 = rnd(G) * 6.283, p2 = rnd(G) * 6.283, p3 = rnd(G) * 6.283;
    f = (q, r) => { const x = X(q, r), y = Y(r), a = Math.atan2(y, x), nz = 0.5 * Math.sin(2 * a + p1) + 0.35 * Math.sin(3 * a + p2) + 0.15 * Math.sin(5 * a + p3); return Math.hypot(x, y) <= R * 0.92 * (1 + 0.3 * nz); };
  } else if (shape === 'rect') {
    f = (q, r) => Math.abs(X(q, r)) <= R * 1.1 && Math.abs(r) <= R * 0.7;
  } else if (shape === 'ring') {
    const ro = R * 1.02, ri = R * 0.42;
    f = (q, r) => { const u = Math.hypot(X(q, r), Y(r)); return u <= ro && u >= ri; };
  } else if (shape === 'cross') {
    f = (q, r) => { const x = Math.abs(X(q, r)); return (x <= R * 1.2 && Math.abs(r) <= R * 0.34) || (x <= R * 0.5 && Math.abs(r) <= R * 1.1); };
  } else if (shape === 'dumbbell') {
    f = (q, r) => { const x = X(q, r), y = Y(r); return Math.hypot(Math.abs(x) - R * 0.78, y) <= R * 0.62 || (Math.abs(x) <= R * 0.8 && Math.abs(r) <= 1); };
  } else if (shape === 'archipelago') {
    const cs = [{ x: 0, y: 0, r: R * 0.5 }];
    for (let i = 0; i < 7; i++) { const a = rnd(G) * 6.283, d = R * 0.95 * Math.sqrt(rnd(G)); cs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: R * (0.3 + rnd(G) * 0.22) }); }
    f = (q, r) => { const x = X(q, r), y = Y(r); for (const c of cs) if (Math.hypot(x - c.x, y - c.y) <= c.r) return true; return false; };
  } else if (shape === 'triangle') {
    const H = R * 1.15;
    f = (q, r) => Math.abs(r) <= H && Math.abs(X(q, r)) <= (r + H) * 0.6;
  } else {
    f = (q, r) => hexDist({ q, r }, { q: 0, r: 0 }) <= R;
  }
  return { has: (q, r) => lim(q, r) && f(q, r) };
}

// Вода вокруг суши для не-шестиугольных форм: полоса мелководья в 3 клетки + все замкнутые озёра/заливы
function seaAround(G) {
  let q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
  for (const t of G.tiles.values()) { q0 = Math.min(q0, t.q); q1 = Math.max(q1, t.q); r0 = Math.min(r0, t.r); r1 = Math.max(r1, t.r); }
  q0 -= 5; q1 += 5; r0 -= 5; r1 += 5;
  const inBox = (q, r) => q >= q0 && q <= q1 && r >= r0 && r <= r1;
  const land = (q, r) => G.tiles.has(key(q, r));
  const dist = new Map(), queue = [];
  for (const t of G.tiles.values()) { dist.set(key(t.q, t.r), 0); queue.push([t.q, t.r]); }
  for (let i = 0; i < queue.length; i++) {
    const [q, r] = queue[i], d = dist.get(key(q, r)); if (d >= 3) continue;
    for (const dd of DIRS) { const nq = q + dd[0], nr = r + dd[1], k = key(nq, nr); if (!inBox(nq, nr) || dist.has(k)) continue; dist.set(k, d + 1); queue.push([nq, nr]); }
  }
  const outside = new Set(), oq = [];
  for (let q = q0; q <= q1; q++) for (let r = r0; r <= r1; r++) if ((q === q0 || q === q1 || r === r0 || r === r1) && !land(q, r)) { outside.add(key(q, r)); oq.push([q, r]); }
  for (let i = 0; i < oq.length; i++) {
    const [q, r] = oq[i];
    for (const dd of DIRS) { const nq = q + dd[0], nr = r + dd[1], k = key(nq, nr); if (!inBox(nq, nr) || land(nq, nr) || outside.has(k)) continue; outside.add(k); oq.push([nq, nr]); }
  }
  for (let q = q0; q <= q1; q++) for (let r = r0; r <= r1; r++) {
    const k = key(q, r); if (land(q, r)) continue;
    if (!outside.has(k) || dist.has(k)) G.sea.set(k, { q, r, sea: true, ship: null });
  }
}

function tryGen(opts, seed, attempt) {
  const duel = opts.mode === 'duel';
  const plist = duel ? [0, 1].map(i => opts.players[i] || { ai: true }) : opts.players;
  const n = plist.length;
  const blitz = opts.mode === 'blitz';
  const G = {
    seed: seed | 0, tiles: new Map(), sea: new Map(), players: [], cur: 0, round: 1, over: false, winner: null, winners: [],
    opts: {
      size: opts.size || 'medium', winMode: (blitz || duel) ? 'last' : (opts.winMode || 'last'), connectivity: !!opts.connectivity,
      allyWin: (blitz || duel) ? false : opts.allyWin !== false, turnSec: opts.turnSec | 0,
      mode: blitz ? 'blitz' : duel ? 'duel' : 'classic', map: opts.map === 'continent' ? 'continent' : 'islands', diplomacy: duel ? false : opts.diplomacy !== false,
      fresh: duel, shape: 'hex'
    },
    maxRounds: blitz ? CFG.blitz.rounds : 0,
    nextId: 1, evId: 0, events: [], hist: [],
    dipl: { rel: {}, props: [], cool: {}, nextProp: 1, fav: {} }
  };
  let shape = opts.shape === 'random' ? SHAPES[Math.floor(rnd(G) * SHAPES.length)] : (SHAPES.indexOf(opts.shape) >= 0 ? opts.shape : 'hex');
  if (attempt >= 100) shape = 'hex';                // запасной вариант: форма не получилась — классический шестиугольник
  G.opts.shape = shape;
  const R = ({ small: 5, medium: 7, large: 9 }[G.opts.size] || 7) + (n >= 5 ? 1 : 0) + (n >= 7 ? 2 : 0) + (n >= 9 ? 2 : 0);
  const disc = [];
  if (shape === 'hex') {
    for (let q = -R; q <= R; q++) for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) {
      disc.push([q, r]);
      const dist = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (dist >= R - 1 && rnd(G) < 0.3) continue;
      G.tiles.set(key(q, r), { q, r, owner: -1, tree: false, treeTimer: 0, building: null, unit: null, res: null });
    }
  } else {
    const Rs = attempt >= 40 ? R * 1.2 : R;           // не помещается — делаем форму чуть крупнее
    const M = shapeMask(G, shape, Rs), ext = Math.ceil(Rs * 1.6) + 3;
    for (let r = -ext; r <= ext; r++) for (let q = -2 * ext; q <= 2 * ext; q++) {
      if (!M.has(q, r)) continue;
      if (rnd(G) < 0.3 && DIRS.some(d => !M.has(q + d[0], r + d[1]))) continue;      // рваный берег
      G.tiles.set(key(q, r), { q, r, owner: -1, tree: false, treeTimer: 0, building: null, unit: null, res: null });
    }
  }
  const all = [...G.tiles.values()];
  for (let i = 0; i < Math.floor(R / 2); i++) {           // озёра
    const c = all[Math.floor(rnd(G) * all.length)];
    if (!c || !G.tiles.has(key(c.q, c.r))) continue;
    for (const t of [c, ...nbrs(G, c)]) if (rnd(G) < 0.6) G.tiles.delete(key(t.q, t.r));
  }

  if (G.opts.map === 'islands') {
    const k = Math.max(2, Math.min(8, Math.round(n * 0.7) + 1));
    const land = [...G.tiles.values()];
    const seeds = [land[Math.floor(rnd(G) * land.length)]];
    while (seeds.length < k) {
      let best = null, bd = -1;
      for (const t of land) { const d = Math.min(...seeds.map(s => hexDist(s, t))) + rnd(G) * 1.5; if (d > bd) { bd = d; best = t; } }
      seeds.push(best);
    }
    const reg = new Map();
    for (const t of land) { let bi = 0, bd = 1e9; seeds.forEach((s, i) => { const d = hexDist(s, t) + rnd(G) * 0.01; if (d < bd) { bd = d; bi = i; } }); reg.set(t, bi); }
    const carve = [];
    for (const t of land) for (const m of nbrs(G, t)) if (reg.get(m) < reg.get(t)) { carve.push(t); break; }
    for (const t of carve) G.tiles.delete(key(t.q, t.r));
  }
  let comps = components(G);
  if (G.opts.map === 'continent') comps = comps.slice(0, 1);
  comps = comps.filter(c => c.length >= 14);
  G.tiles = new Map(comps.flat().map(t => [key(t.q, t.r), t]));
  const islands = comps;
  if (!islands.length || G.tiles.size < n * (CFG.startTiles + 8)) return null;
  if (shape === 'hex') { for (const [q, r] of disc) if (!G.tiles.has(key(q, r))) G.sea.set(key(q, r), { q, r, sea: true, ship: null }); }
  else seaAround(G);

  G.players = plist.map((p, i) => ({
    id: i, name: String(p.name || (p.ai ? botName(i) : humanName(i))).slice(0, 20), ai: p.ai ? 'hard' : null,
    color: i, money: blitz ? CFG.blitz.money : CFG.startMoney, alive: true, tiles: 0, betrayals: 0
  }));

  // распределяем игроков по островам (больше остров — больше игроков)
  const need = CFG.startTiles + 10;
  const cap = islands.map(isl => Math.floor(isl.length / need)), used = islands.map(() => 0), assign = [];
  for (let p = 0; p < n; p++) {
    let bi = -1, bv = 0;
    islands.forEach((isl, i) => { const rem = cap[i] - used[i]; const v = rem - rnd(G) * 0.5; if (rem > 0 && v > bv) { bv = v; bi = i; } });
    if (bi < 0) return null;
    used[bi]++; assign.push(bi);
  }
  const minD = attempt < 30 ? 5 : 4;
  for (let i = 0; i < islands.length; i++) {
    const ps = assign.map((a, p) => a === i ? p : -1).filter(p => p >= 0), chosen = [];
    for (const p of ps) {
      let best = null, bd = -1;
      for (const t of islands[i]) {
        const d = (chosen.length ? Math.min(...chosen.map(s => hexDist(s, t))) : 9) + rnd(G) * 0.8;
        if (d > bd) { bd = d; best = t; }
      }
      if (chosen.length && Math.min(...chosen.map(s => hexDist(s, best))) < minD) return null;
      chosen.push(best);
      const area = [best]; best.owner = p;
      while (area.length < CFG.startTiles) {
        const fr = [];
        for (const t of area) for (const m of nbrs(G, t)) if (m.owner === -1 && !fr.includes(m)) fr.push(m);
        if (!fr.length) return null;
        const m = fr[Math.floor(rnd(G) * fr.length)]; m.owner = p; area.push(m);
      }
    }
  }
  // ресурсы: лес и камень (временные «фермы»), на пустых островах — обязательно
  const free = [...G.tiles.values()].filter(t => t.owner === -1);
  const nRes = Math.max(2, Math.round(G.tiles.size * CFG.res.density));
  const putRes = t => { t.res = { kind: rnd(G) < 0.6 ? 'wood' : 'stone', left: CFG.res.life }; };
  islands.forEach((isl, i) => {
    if (used[i] > 0) return;
    const f = isl.filter(t => t.owner === -1);
    for (let k = 0; k < Math.min(3, Math.floor(f.length / 6) + 1); k++) { const t = f[Math.floor(rnd(G) * f.length)]; if (t && !t.res) putRes(t); }
  });
  for (let k = 0; k < nRes; k++) { const t = free[Math.floor(rnd(G) * free.length)]; if (t && !t.res) putRes(t); }
  for (const t of G.tiles.values()) if (t.owner === -1 && !t.res && rnd(G) < CFG.treeDensity) { t.tree = true; t.treeTimer = rint(G, CFG.treeSpreadMin, CFG.treeSpreadMax); }
  updateStatus(G);
  recordHist(G);
  return G;
}

// история для графиков: срез по каждому игроку в начале каждого раунда
function recordHist(G) {
  if (G.hist.length && G.hist[G.hist.length - 1].r === G.round) return;
  G.hist.push({ r: G.round, p: G.players.map(p => {
    if (!p.alive) return null;
    const e = econ(G, p.id);
    return { tiles: e.tiles, income: e.income, net: e.net, money: p.money, farms: e.farms, units: e.units, power: strength(G, p.id) };
  }) });
  if (G.hist.length > 400) G.hist.shift();
}

// компактный формат: суша [q,r,owner,tree,treeTimer,building,unit,res], unit=[id,type,owner,moved,fresh], res=[kind,left]
// море [q,r] или [q,r,ship], ship=[id,owner,moved,cargo|0], cargo=[id,type,owner,moved]
function serialize(G) {
  const o = Object.assign({}, G);
  o.tiles = [...G.tiles.values()].map(t => [t.q, t.r, t.owner, t.tree ? 1 : 0, t.treeTimer, t.building,
    t.unit ? [t.unit.id, t.unit.type, t.unit.owner, t.unit.moved ? 1 : 0, t.unit.fresh ? 1 : 0] : null, t.res ? [t.res.kind, t.res.left] : null]);
  o.sea = [...G.sea.values()].map(s => !s.ship ? [s.q, s.r] : [s.q, s.r, [s.ship.id, s.ship.owner, s.ship.moved ? 1 : 0,
    s.ship.cargo ? [s.ship.cargo.id, s.ship.cargo.type, s.ship.cargo.owner, s.ship.cargo.moved ? 1 : 0] : 0]]);
  return o;
}
function deserialize(o) {
  const G = Object.assign({}, o);
  G.tiles = new Map(o.tiles.map(a => [key(a[0], a[1]), { q: a[0], r: a[1], owner: a[2], tree: !!a[3], treeTimer: a[4], building: a[5],
    unit: a[6] ? { id: a[6][0], type: a[6][1], owner: a[6][2], moved: !!a[6][3], fresh: !!a[6][4] } : null, res: a[7] ? { kind: a[7][0], left: a[7][1] } : null }]));
  G.sea = new Map(o.sea.map(a => [key(a[0], a[1]), { q: a[0], r: a[1], sea: true, ship: a[2] ? { id: a[2][0], owner: a[2][1], moved: !!a[2][2],
    cargo: a[2][3] ? { id: a[2][3][0], type: a[2][3][1], owner: a[2][3][2], moved: !!a[2][3][3] } : null } : null }]));
  if (!G.hist) G.hist = [];
  return G;
}

// ---- 20-economy.js ----
// ============ Защита, доход, расходы ============
function tileDef(G, t) {
  if (t.owner < 0) return 0;
  let best = 0;
  const check = s => {
    if (s.owner !== t.owner) return;
    if (s.unit) best = Math.max(best, CFG.units[s.unit.type].def);
    if (s.building) best = Math.max(best, CFG.buildings[s.building].def);
  };
  check(t);
  for (const n of nbrs(G, t)) check(n);
  return best;
}

function econ(G, pid) {
  let land = 0, farmInc = 0, resInc = 0, upU = 0, upB = 0, farms = 0, towers = 0, tiles = 0, units = 0, ships = 0, res = 0;
  for (const t of G.tiles.values()) {
    if (t.owner !== pid) continue;
    tiles++; land += t.tree ? CFG.treeIncome : CFG.landIncome;
    if (t.res) { res++; resInc += CFG.res[t.res.kind].income; }
    if (t.building) { const b = CFG.buildings[t.building]; farmInc += b.income; upB += b.upkeep; if (t.building === 'farm') farms++; else towers++; }
    if (t.unit) { upU += CFG.units[t.unit.type].upkeep; units++; }
  }
  for (const s of G.sea.values()) {
    if (!s.ship || s.ship.owner !== pid) continue;
    ships++; upU += CFG.ship.upkeep;
    if (s.ship.cargo) { upU += CFG.units[s.ship.cargo.type].upkeep; units++; }
  }
  const income = land + farmInc + resInc;
  return { land, farmInc, resInc, upkeep: upU + upB, income, net: income - upU - upB, tiles, farms, towers, units, ships, res };
}
function farmCost(G, pid) { const b = CFG.buildings.farm; return b.cost + (G.opts.fresh ? CFG.duel.farmStep : b.costStep) * econ(G, pid).farms; }
// можно ли поставить ферму на клетку t (дуэль: рядом с другой своей фермой, если ферма уже есть)
function farmSpotOk(G, pid, t) {
  if (!G.opts.fresh) return true;
  if (econ(G, pid).farms === 0) return true;
  return nbrs(G, t).some(n => n.owner === pid && n.building === 'farm');
}
function buildCost(G, pid, kind) { return kind === 'farm' ? farmCost(G, pid) : CFG.buildings[kind].cost; }

function strength(G, pid) {
  const e = econ(G, pid); let lv = 0;
  for (const t of G.tiles.values()) if (t.owner === pid && t.unit) lv += t.unit.type;
  for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid && s.ship.cargo) lv += s.ship.cargo.type;
  return e.tiles + 4 * e.farms + 2 * lv + e.ships;
}

// ---- 30-diplomacy.js ----
// ============ Дипломатия: дружба, альянс, война, деньги, найм на войну ============
function pairKey(a, b) { return a < b ? a + '-' + b : b + '-' + a; }
function relOf(G, a, b) { if (a === b) return 'self'; if (!G.opts.diplomacy) return 'war'; const r = G.dipl.rel[pairKey(a, b)]; return r ? r.lvl : 'war'; }
function relSince(G, a, b) { const r = G.dipl.rel[pairKey(a, b)]; return r ? r.since : 0; }
// turns > 0 — срочный договор: действует turns ходов (until — номер раунда, когда он истекает).
// Срочная дружба по истечении превращается в войну, срочный союз — в дружбу, срочная война — в мир.
function setRel(G, a, b, lvl, turns) {
  if (lvl === 'war' && !turns) delete G.dipl.rel[pairKey(a, b)];
  else G.dipl.rel[pairKey(a, b)] = { lvl, since: G.round, until: turns ? G.round + turns : 0 };
}
function relUntil(G, a, b) { const r = G.dipl.rel[pairKey(a, b)]; return r && r.until ? r.until : 0; }
function termLeft(G, a, b) { const u = relUntil(G, a, b); return u ? Math.max(0, u - G.round) : 0; }
const termOk = t => t === undefined || t === null || t === 0 || (isInt(t) && t >= CFG.diplo.minTerm && t <= CFG.diplo.maxTerm);
const treatyUseful = (G, a, b, level) => { const cur = relOf(G, a, b); return RANK[level] > RANK[cur] || (RANK[level] === RANK[cur] && relUntil(G, a, b) > 0); };
function dropProps(G, a, b) { G.dipl.props = G.dipl.props.filter(p => !((p.from === a && p.to === b) || (p.from === b && p.to === a))); }
const pname = (G, id) => G.players[id].name;
function favOf(G, a, b) { return G.dipl.fav[a + '>' + b] || 0; }          // как a относится к b
function addFav(G, a, b, v) { const k = a + '>' + b; G.dipl.fav[k] = Math.max(-8, Math.min(8, (G.dipl.fav[k] || 0) + v)); }

function dipGuard(G, pid, to) {
  const g = guard(G, pid); if (g) return g;
  if (!G.opts.diplomacy) return fail('Дипломатия отключена в этой партии');
  if (!isInt(to) || to < 0 || to >= G.players.length || to === pid || !G.players[to].alive) return fail('Нет такого игрока');
  return null;
}
const lockLeft = (G, a, b) => {
  const r = G.dipl.rel[pairKey(a, b)];
  return Math.max(CFG.diplo.minTreatyRounds - (G.round - relSince(G, a, b)), r && r.lvl !== 'war' && r.until ? r.until - G.round : 0);
};
const termTxt = t => t ? ' на ' + t + ' ход.' : '';
const hasProp = (G, from, to, kind) => G.dipl.props.some(p => p.from === from && p.to === to && p.kind === kind);
const onCooldown = (G, from, to) => (G.dipl.cool[from + '>' + to] || 0) > G.round;
function amountOk(G, amount, max) { return isInt(amount) && amount >= 1 && amount <= Math.min(CFG.diplo.maxMoney, max === undefined ? CFG.diplo.maxMoney : max); }

function actPropose(G, pid, to, level, turns) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (level !== 'peace' && level !== 'alliance') return fail('Неизвестное предложение');
  if (!termOk(turns)) return fail('Срок — от ' + CFG.diplo.minTerm + ' до ' + CFG.diplo.maxTerm + ' ходов');
  turns = turns | 0;
  const cur = relOf(G, pid, to);
  if (!treatyUseful(G, pid, to, level)) return fail('Это уже действует');
  if (level === 'alliance' && cur === 'war') return fail('Сначала заключите дружбу');
  if (hasProp(G, pid, to, 'treaty')) return fail('Предложение уже отправлено');
  if (onCooldown(G, pid, to)) return fail('Недавно отклонено — подождите');
  G.dipl.props.push({ id: G.dipl.nextProp++, kind: 'treaty', from: pid, to, level, turns, round: G.round });
  ev(G, pname(G, pid) + ' предлагает ' + LVL_RU[level] + termTxt(turns) + ' → ' + pname(G, to));
  return ok('Предложение отправлено');
}

function actWar(G, pid, to, turns) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (!termOk(turns)) return fail('Срок — от ' + CFG.diplo.minTerm + ' до ' + CFG.diplo.maxTerm + ' ходов');
  turns = turns | 0;
  const was = relOf(G, pid, to);
  if (was === 'war') {                                       // уже воюем: можно назначить срок («война на N ходов, затем мир»)
    if (!turns) return fail('Вы уже воюете');
    setRel(G, pid, to, 'war', turns); dropProps(G, pid, to);
    ev(G, '⚔ ' + pname(G, pid) + ' и ' + pname(G, to) + ': война' + termTxt(turns) + ', затем мир');
    return ok('Срок войны назначен');
  }
  const left = lockLeft(G, pid, to);
  if (left > 0) return fail('Договор нельзя разорвать ещё ' + left + ' ход.');
  setRel(G, pid, to, 'war', turns); dropProps(G, pid, to);
  G.players[pid].betrayals += 1; addFav(G, to, pid, -4);
  ev(G, '⚔ ' + pname(G, pid) + ' объявил войну: ' + pname(G, to) + termTxt(turns) + (was === 'alliance' ? ' (предательство альянса!)' : ''));
  return ok('Война объявлена');
}

function actGift(G, pid, to, amount) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (!amountOk(G, amount, G.players[pid].money)) return fail('Недопустимая сумма');
  G.players[pid].money -= amount; G.players[to].money += amount;
  addFav(G, to, pid, Math.min(4, amount / 12));
  ev(G, '🎁 ' + pname(G, pid) + ' отправил ' + pname(G, to) + ' ' + amount + ' монет');
  return ok('Деньги отправлены');
}

function actAsk(G, pid, to, amount) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (!amountOk(G, amount)) return fail('Недопустимая сумма');
  if (hasProp(G, pid, to, 'ask')) return fail('Просьба уже отправлена');
  if (onCooldown(G, pid, to)) return fail('Недавно отклонено — подождите');
  G.dipl.props.push({ id: G.dipl.nextProp++, kind: 'ask', from: pid, to, amount, round: G.round });
  ev(G, pname(G, pid) + ' просит у ' + pname(G, to) + ' ' + amount + ' монет');
  return ok('Просьба отправлена');
}

// «Заказать войну»: pid платит `to`, если тот объявит войну `target`
function actHire(G, pid, to, target, amount) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (!isInt(target) || target < 0 || target >= G.players.length || target === pid || target === to || !G.players[target].alive) return fail('Нет такой цели');
  if (!amountOk(G, amount, G.players[pid].money)) return fail('Недопустимая сумма');
  if (relOf(G, to, target) === 'war') return fail('Они и так воюют');
  if (lockLeft(G, to, target) > 0) return fail('Они недавно заключили договор — рано');
  if (hasProp(G, pid, to, 'hire')) return fail('Заказ уже отправлен');
  if (onCooldown(G, pid, to)) return fail('Недавно отклонено — подождите');
  G.dipl.props.push({ id: G.dipl.nextProp++, kind: 'hire', from: pid, to, target, amount, round: G.round });
  ev(G, pname(G, pid) + ' предлагает ' + pname(G, to) + ' ' + amount + ' монет за войну с ' + pname(G, target));
  return ok('Предложение отправлено');
}

function actRespond(G, pid, id, accept) {
  const g = guard(G, pid); if (g) return g;
  if (!G.opts.diplomacy) return fail('Дипломатия отключена в этой партии');
  const pr = G.dipl.props.find(p => p.id === id && p.to === pid);
  if (!pr) return fail('Предложение не найдено');
  const from = pr.from, drop = () => { G.dipl.props = G.dipl.props.filter(p => p !== pr); };
  if (!accept) {
    drop(); G.dipl.cool[from + '>' + pid] = G.round + CFG.diplo.refuseCooldown; addFav(G, from, pid, -0.5);
    ev(G, pname(G, pid) + ' отказал: ' + pname(G, from));
    return ok('Отклонено');
  }
  if (!G.players[from].alive) { drop(); return fail('Предложение устарело'); }
  if (pr.kind === 'treaty') {
    if (!treatyUseful(G, pid, from, pr.level)) { dropProps(G, pid, from); return fail('Предложение устарело'); }
    setRel(G, pid, from, pr.level, pr.turns | 0); dropProps(G, pid, from);
    addFav(G, pid, from, 1); addFav(G, from, pid, 1);
    ev(G, pname(G, pid) + ' и ' + pname(G, from) + ': ' + (pr.level === 'peace' ? 'дружба 🕊️' : 'альянс 🤝') + termTxt(pr.turns | 0));
    updateStatus(G);
    return ok('Принято');
  }
  if (pr.kind === 'ask') {
    if (G.players[pid].money < pr.amount) { drop(); return fail('Не хватает монет'); }
    G.players[pid].money -= pr.amount; G.players[from].money += pr.amount; drop();
    addFav(G, from, pid, Math.min(4, pr.amount / 12));
    ev(G, '🎁 ' + pname(G, pid) + ' отправил ' + pname(G, from) + ' ' + pr.amount + ' монет');
    return ok('Деньги отправлены');
  }
  if (pr.kind === 'hire') {
    const t = pr.target;
    if (!G.players[t].alive || relOf(G, pid, t) === 'war') { drop(); return fail('Предложение устарело'); }
    if (lockLeft(G, pid, t) > 0) { drop(); return fail('Договор с целью ещё нельзя разорвать'); }
    if (G.players[from].money < pr.amount) { drop(); return fail('У заказчика не хватает монет'); }
    G.players[from].money -= pr.amount; G.players[pid].money += pr.amount;
    const was = relOf(G, pid, t);
    setRel(G, pid, t, 'war'); dropProps(G, pid, t); drop();
    if (was === 'alliance') G.players[pid].betrayals += 1;
    addFav(G, from, pid, 2); addFav(G, t, pid, -3);
    ev(G, '⚔ ' + pname(G, pid) + ' объявил войну ' + pname(G, t) + ' по заказу ' + pname(G, from) + ' (' + pr.amount + ' монет)');
    return ok('Война объявлена');
  }
  drop(); return fail('Неизвестное предложение');
}

// ---- 40-actions.js ----
// ============ Ходы, бой, корабли, постройки, смена хода ============
// Map<tile, 'move'|'merge'|'claim'|'attack'|'board'> — куда может сходить сухопутный юнит
function getMoves(G, from, unit) {
  unit = unit || from.unit;
  const p = unit.owner, U = CFG.units[unit.type];
  const res = new Map(), dist = new Map([[from, 0]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], d = dist.get(c);
    if (d >= CFG.moveRange) continue;
    for (const n of nbrs(G, c)) {
      if (n.owner === p) {
        if (dist.has(n)) continue;
        dist.set(n, d + 1); queue.push(n);
        if (!n.building) {
          if (!n.unit) res.set(n, 'move');
          else if (n.unit !== unit && n.unit.type === unit.type && unit.type < 4) res.set(n, 'merge');
        }
      } else if (!res.has(n) && (n.owner < 0 || relOf(G, p, n.owner) === 'war') && U.atk > tileDef(G, n)) {
        res.set(n, n.owner < 0 ? 'claim' : 'attack');
      }
    }
    for (const s of seaNbrs(G, c)) if (s.ship && s.ship.owner === p && !s.ship.cargo) res.set(s, 'board');
  }
  return res;
}

// куда может плыть корабль (через свободные морские клетки, не дальше CFG.ship.range)
function getShipMoves(G, sea) {
  const res = new Map(), dist = new Map([[sea, 0]]), queue = [sea];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], d = dist.get(c);
    if (d >= CFG.ship.range) continue;
    for (const n of seaNbrs(G, c)) { if (dist.has(n) || n.ship) continue; dist.set(n, d + 1); queue.push(n); res.set(n, 'sail'); }
  }
  return res;
}
// куда может высадиться солдат с корабля (только на соседние клетки суши)
function getUnloadMoves(G, sea) {
  const res = new Map(), sh = sea.ship;
  if (!sh || !sh.cargo) return res;
  const p = sh.owner, U = CFG.units[sh.cargo.type];
  for (const n of nbrs(G, sea)) {
    if (n.owner === p) { if (!n.unit && !n.building) res.set(n, 'move'); }
    else if ((n.owner < 0 || relOf(G, p, n.owner) === 'war') && U.atk > tileDef(G, n)) res.set(n, n.owner < 0 ? 'claim' : 'attack');
  }
  return res;
}

function guard(G, pid) {
  if (G.over) return fail('Партия окончена');
  if (!isInt(pid) || !G.players[pid] || !G.players[pid].alive) return fail('Вы выбыли из игры');
  if (G.cur !== pid) return fail('Сейчас ход другого игрока');
  return null;
}

function takeTile(G, pid, to, unit) {
  const old = to.owner;
  to.owner = pid; to.building = null; to.tree = false; to.treeTimer = 0;
  to.unit = unit;
  if (old >= 0 && G.opts.connectivity) cutOff(G, old);
  updateStatus(G);
}

function actMove(G, pid, fk, tk) {
  const g = guard(G, pid); if (g) return g;
  if (typeof fk !== 'string' || typeof tk !== 'string') return fail('Неверный запрос');
  const from = tileAt(G, fk), to = tileAt(G, tk);
  if (!from || !to) return fail('Нет такой клетки');

  if (from.sea) {                                     // корабль или солдат на корабле
    const sh = from.ship;
    if (!sh || sh.owner !== pid) return fail('Здесь нет вашего корабля');
    if (to.sea) {
      if (sh.moved) return fail('Корабль уже плавал в этом ходу');
      if (!getShipMoves(G, from).has(to)) return fail('Туда не доплыть');
      to.ship = sh; from.ship = null; sh.moved = true;
      return ok('Корабль плывёт', { kind: 'sail' });
    }
    if (!sh.cargo) return fail('На корабле нет солдата');
    if (sh.cargo.moved) return fail('Солдат уже действовал в этом ходу');
    const kind = getUnloadMoves(G, from).get(to);
    if (!kind) {
      if (to.owner >= 0 && to.owner !== pid && relOf(G, pid, to.owner) !== 'war') return fail('С этим игроком не воюете — сначала объявите войну');
      if (to.owner !== pid && CFG.units[sh.cargo.type].atk <= tileDef(G, to)) return fail('Недостаточная сила атаки (защита клетки ' + tileDef(G, to) + ')');
      return fail('Высадиться можно только на соседнюю свободную клетку');
    }
    const u = { id: sh.cargo.id, type: sh.cargo.type, owner: pid, moved: true };
    sh.cargo = null;
    if (kind === 'move') { to.unit = u; return ok('Высадка', { kind }); }
    takeTile(G, pid, to, u);
    return ok(kind === 'attack' ? 'Клетка захвачена с моря' : 'Земля занята с моря', { kind });
  }

  if (!from.unit) return fail('Здесь нет войска');
  const u = from.unit;
  if (u.owner !== pid) return fail('Это чужое войско');
  if (u.fresh) return fail('Войско только что нанято — оно сможет ходить со следующего хода');
  if (u.moved) return fail('Это войско уже действовало в этом ходу');
  const kind = getMoves(G, from).get(to);
  if (!kind) {
    if (to.sea) return fail(to.ship && to.ship.owner === pid ? 'Корабль занят или слишком далеко' : 'Туда нельзя дойти');
    if (to.owner >= 0 && to.owner !== pid && relOf(G, pid, to.owner) !== 'war') return fail('С этим игроком ' + (relOf(G, pid, to.owner) === 'alliance' ? 'альянс' : 'дружба') + ' — сначала объявите войну');
    if (to.owner !== pid && CFG.units[u.type].atk <= tileDef(G, to)) return fail('Недостаточная сила атаки (защита клетки ' + tileDef(G, to) + ')');
    if (to.owner === pid && to.building) return fail('Клетка занята постройкой');
    if (to.owner === pid && to.unit) return fail('Клетка занята войском');
    return fail('Туда нельзя дойти');
  }
  if (kind === 'board') { to.ship.cargo = { id: u.id, type: u.type, owner: pid, moved: true }; from.unit = null; return ok('Солдат на борту', { kind }); }
  if (kind === 'move') { to.unit = u; from.unit = null; u.moved = true; return ok('Перемещение', { kind }); }
  if (kind === 'merge') {
    from.unit = null;
    to.unit = { id: G.nextId++, type: u.type + 1, owner: pid, moved: true };
    return ok('Войска объединены: ' + CFG.units[u.type + 1].name, { kind });
  }
  from.unit = null; u.moved = true;
  takeTile(G, pid, to, u);
  return ok(kind === 'attack' ? 'Клетка захвачена' : 'Земля занята', { kind });
}

function ownFree(G, pid, tk) {
  if (typeof tk !== 'string') return [null, fail('Неверный запрос')];
  const t = G.tiles.get(tk);
  if (!t) return [null, fail('Нет такой клетки')];
  if (t.owner !== pid) return [null, fail('Это не ваша клетка')];
  if (t.unit) return [null, fail('Клетка занята войском')];
  if (t.building) return [null, fail('Клетка занята постройкой')];
  if (t.tree) return [null, fail('На клетке дерево')];
  return [t, null];
}
function actBuyUnit(G, pid, tk, type) {
  const g = guard(G, pid); if (g) return g;
  if (!isInt(type) || !has(CFG.units, type)) return fail('Неизвестный тип войска');
  const U = CFG.units[type];
  const [t, e] = ownFree(G, pid, tk); if (e) return e;
  const P = G.players[pid];
  if (P.money < U.cost) return fail('Недостаточно монет');
  P.money -= U.cost;
  const fresh = !!G.opts.fresh;                      // дуэль: нанятый солдат стоит на своей клетке и ходит только со следующего хода
  t.unit = { id: G.nextId++, type, owner: pid, moved: fresh, fresh };
  return ok('Нанят: ' + U.name);
}
function actBuild(G, pid, tk, kind) {
  const g = guard(G, pid); if (g) return g;
  if (typeof kind !== 'string' || !has(CFG.buildings, kind)) return fail('Неизвестная постройка');
  const B = CFG.buildings[kind];
  const [t, e] = ownFree(G, pid, tk); if (e) return e;
  if (t.res) return fail('На клетке месторождение — стройка невозможна');
  if (kind === 'farm' && !farmSpotOk(G, pid, t)) return fail('В дуэли ферму можно строить только рядом с другой своей фермой');
  const P = G.players[pid], cost = buildCost(G, pid, kind);
  if (P.money < cost) return fail('Недостаточно монет');
  P.money -= cost; t.building = kind;
  return ok('Построено: ' + B.name);
}
// спустить корабль на воду с береговой клетки
function actBuyShip(G, pid, lk, sk) {
  const g = guard(G, pid); if (g) return g;
  if (typeof lk !== 'string' || typeof sk !== 'string') return fail('Неверный запрос');
  const land = G.tiles.get(lk), sea = G.sea.get(sk);
  if (!land || land.owner !== pid) return fail('Это не ваша клетка');
  if (!sea) return fail('Корабль можно спустить только на воду');
  if (hexDist(land, sea) !== 1) return fail('Вода должна быть рядом с береговой клеткой');
  if (sea.ship) return fail('Там уже стоит корабль');
  const P = G.players[pid];
  if (P.money < CFG.ship.cost) return fail('Недостаточно монет');
  P.money -= CFG.ship.cost;
  sea.ship = { id: G.nextId++, owner: pid, moved: false, cargo: null };
  return ok('Корабль спущен на воду');
}
function actDisband(G, pid, tk) {
  const g = guard(G, pid); if (g) return g;
  if (typeof tk !== 'string') return fail('Неверный запрос');
  const t = tileAt(G, tk);
  if (t && t.sea) {
    if (!t.ship || t.ship.owner !== pid) return fail('Здесь нет вашего корабля');
    t.ship = null; return ok('Корабль списан');
  }
  if (!t || t.owner !== pid || !t.unit) return fail('Здесь нет вашего войска');
  if (t.unit.fresh) return fail('Нанятого солдата можно распустить только со следующего хода');
  t.unit = null;
  return ok('Войско распущено');
}

function cutOff(G, pid) {
  const own = [...G.tiles.values()].filter(t => t.owner === pid);
  const seen = new Set(), comps = [];
  for (const t of own) {
    if (seen.has(t)) continue;
    const comp = [t]; seen.add(t);
    for (let i = 0; i < comp.length; i++) for (const m of nbrs(G, comp[i])) if (m.owner === pid && !seen.has(m)) { seen.add(m); comp.push(m); }
    comps.push(comp);
  }
  if (comps.length < 2) return;
  comps.sort((a, b) => b.length - a.length);
  let lost = 0;
  for (let i = 1; i < comps.length; i++) for (const t of comps[i]) { t.owner = -1; t.unit = null; t.building = null; lost++; }
  ev(G, pname(G, pid) + ': отрезано клеток — ' + lost);
}

// ---- золотые жилы: не больше CFG.gold.max на карте, живут CFG.res.gold.life ходов, +10 монет владельцу клетки ----
function goldCount(G) { let c = 0; for (const t of G.tiles.values()) if (t.res && t.res.kind === 'gold') c++; return c; }
function trySpawnGold(G) {
  if (G.round < CFG.gold.firstRound || goldCount(G) >= CFG.gold.max || rnd(G) > CFG.gold.chance) return;
  if (G.maxRounds && G.maxRounds - G.round < 3) return;          // в блице под конец уже не успеют
  const free = [...G.tiles.values()].filter(t => t.owner < 0 && !t.res && !t.tree);
  if (!free.length) return;
  const own = G.players.filter(p => p.alive).map(p => [...G.tiles.values()].filter(t => t.owner === p.id));
  // справедливость: выбираем клетки, примерно равноудалённые от всех государств
  const scored = free.map(t => { const ds = own.map(l => l.length ? Math.min(...l.map(x => hexDist(x, t))) : 99); return { t, sc: Math.max(...ds) - Math.min(...ds) + rnd(G) * 0.5 }; });
  scored.sort((a, b) => a.sc - b.sc);
  const pick = scored[Math.floor(rnd(G) * Math.min(scored.length, Math.max(3, Math.ceil(scored.length * 0.15))))].t;
  pick.res = { kind: 'gold', left: CFG.res.gold.life };
  ev(G, '💰 Появилась золотая жила: +' + CFG.res.gold.income + ' монет в ход, ' + CFG.res.gold.life + ' ходов');
}
function tickGold(G) {
  for (const t of G.tiles.values()) if (t.res && t.res.kind === 'gold' && --t.res.left <= 0) { t.res = null; ev(G, '💰 Золотая жила иссякла'); }
  trySpawnGold(G);
}
// срочные договоры: по окончании срока дружба → война, союз → дружба, война → мир
function expireTreaties(G) {
  let changed = false;
  for (const pk of Object.keys(G.dipl.rel)) {
    const r = G.dipl.rel[pk]; if (!r.until || G.round < r.until) continue;
    const [a, b] = pk.split('-').map(Number), A = G.players[a], B = G.players[b];
    changed = true; dropProps(G, a, b);
    if (!A.alive || !B.alive) { delete G.dipl.rel[pk]; continue; }
    if (r.lvl === 'war') { G.dipl.rel[pk] = { lvl: 'peace', since: G.round, until: 0 }; ev(G, '🕊 Срок войны истёк: ' + A.name + ' и ' + B.name + ' заключили мир'); }
    else if (r.lvl === 'peace') { delete G.dipl.rel[pk]; ev(G, '⚔ Срок дружбы истёк: ' + A.name + ' и ' + B.name + ' снова воюют'); }
    else { G.dipl.rel[pk] = { lvl: 'peace', since: G.round, until: 0 }; ev(G, '🤝 Срок союза истёк: ' + A.name + ' и ' + B.name + ' остались друзьями'); }
  }
  if (changed) updateStatus(G);
}

function growTrees(G) {
  const trees = [...G.tiles.values()].filter(t => t.tree && t.owner < 0);
  for (const t of trees) {
    t.treeTimer--;
    if (t.treeTimer > 0) continue;
    t.treeTimer = rint(G, CFG.treeSpreadMin, CFG.treeSpreadMax);
    const c = nbrs(G, t).filter(n => n.owner < 0 && !n.tree && !n.res);
    if (c.length) { const n = c[Math.floor(rnd(G) * c.length)]; n.tree = true; n.treeTimer = rint(G, CFG.treeSpreadMin, CFG.treeSpreadMax); }
  }
}

function allyGroup(G, pid) { return G.players.filter(q => q.alive && (q.id === pid || relOf(G, pid, q.id) === 'alliance')); }

function finishGame(G, winners) { G.over = true; G.winners = winners.map(p => p.id); G.winner = winners.length ? winners[0].id : null; }

function updateStatus(G) {
  const cnt = new Array(G.players.length).fill(0);
  for (const t of G.tiles.values()) if (t.owner >= 0) cnt[t.owner]++;
  for (const p of G.players) {
    p.tiles = cnt[p.id];
    if (p.alive && cnt[p.id] === 0) {
      p.alive = false; ev(G, p.name + ' выбывает из игры');
      for (const s of G.sea.values()) if (s.ship && s.ship.owner === p.id) s.ship = null;     // флот без государства тонет
    }
  }
  if (G.over) return;
  const alive = G.players.filter(p => p.alive);
  if (alive.length <= 1) { finishGame(G, alive); return; }
  if (G.opts.allyWin && G.opts.diplomacy) {
    let all = true;
    for (let i = 0; i < alive.length && all; i++) for (let j = i + 1; j < alive.length; j++) if (relOf(G, alive[i].id, alive[j].id) !== 'alliance') { all = false; break; }
    if (all) { finishGame(G, alive); return; }
  }
  if (G.opts.winMode === 'domination') {
    for (const p of alive) {
      const grp = G.opts.allyWin && G.opts.diplomacy ? allyGroup(G, p.id) : [p];
      if (grp.reduce((s, q) => s + cnt[q.id], 0) >= CFG.dominationShare * G.tiles.size) { finishGame(G, grp); return; }
    }
  }
  const humans = G.players.filter(p => !p.ai);
  if (humans.length && !humans.some(p => p.alive)) { G.over = true; G.winners = []; G.winner = null; }
}

// Блиц: после последнего раунда побеждает тот, у кого больше клеток (при равенстве — больше денег)
function finishBlitz(G) {
  const alive = G.players.filter(p => p.alive);
  const score = p => p.tiles * 100000 + p.money;
  const top = Math.max(...alive.map(score));
  finishGame(G, alive.filter(p => score(p) === top));
  ev(G, 'Блиц окончен: ' + G.winners.map(i => G.players[i].name).join(', ') + ' — больше всех земли!');
}

function startTurn(G, pid) {
  const P = G.players[pid];
  for (const t of G.tiles.values()) if (t.owner === pid && t.unit) { t.unit.moved = false; t.unit.fresh = false; }
  for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid) { s.ship.moved = false; if (s.ship.cargo) s.ship.cargo.moved = false; }
  const e = econ(G, pid);
  P.money += e.net;
  for (const t of G.tiles.values()) if (t.owner === pid && t.res && t.res.kind !== 'gold' && --t.res.left <= 0) { t.res = null; ev(G, P.name + ': месторождение истощено'); }
  if (P.money < 0) {
    for (const t of G.tiles.values()) if (t.owner === pid && t.unit) t.unit = null;
    for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid) s.ship = null;
    P.money = 0;
    ev(G, P.name + ': банкротство — все войска и корабли потеряны!');
  }
}

function advanceTurn(G) {
  if (G.opts.connectivity) for (const p of G.players) if (p.alive) cutOff(G, p.id);
  updateStatus(G);
  if (G.over) return;
  const n = G.players.length;
  let idx = G.cur, wrapped = false;
  for (let k = 0; k < n; k++) { idx = (idx + 1) % n; if (idx === 0) wrapped = true; if (G.players[idx].alive) break; }
  if (wrapped) {
    G.round++; growTrees(G); expireTreaties(G); tickGold(G); recordHist(G);
    G.dipl.props = G.dipl.props.filter(p => G.round - p.round <= CFG.diplo.proposalTTL && G.players[p.from].alive && G.players[p.to].alive);
    if (G.maxRounds && G.round > G.maxRounds) { G.round = G.maxRounds; finishBlitz(G); return; }
  }
  G.cur = idx;
  startTurn(G, idx);
  updateStatus(G);
}

function actEndTurn(G, pid) {
  const g = guard(G, pid); if (g) return g;
  advanceTurn(G);
  return ok(G.over ? 'Игра окончена' : 'Ход передан');
}

function actResign(G, pid) {
  if (G.over) return fail('Партия окончена');
  const P = G.players[pid];
  if (!P || !P.alive) return fail('Вы уже выбыли');
  const wasCur = G.cur === pid;
  for (const t of G.tiles.values()) if (t.owner === pid) { t.owner = -1; t.unit = null; t.building = null; }
  for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid) s.ship = null;
  ev(G, P.name + ' сдался');
  G.dipl.props = G.dipl.props.filter(p => p.from !== pid && p.to !== pid);
  updateStatus(G);
  if (!G.over && wasCur) advanceTurn(G);
  return ok('Вы сдались');
}

function applyAction(G, pid, a) {
  if (!a || typeof a !== 'object') return fail('Пустое действие');
  switch (a.type) {
    case 'move': return actMove(G, pid, a.from, a.to);
    case 'buy': return actBuyUnit(G, pid, a.tile, a.unit);
    case 'build': return actBuild(G, pid, a.tile, a.kind);
    case 'ship': return actBuyShip(G, pid, a.tile, a.sea);
    case 'disband': return actDisband(G, pid, a.tile);
    case 'end': return actEndTurn(G, pid);
    case 'propose': return actPropose(G, pid, a.to, a.level, a.turns);
    case 'respond': return actRespond(G, pid, a.id, !!a.accept);
    case 'war': return actWar(G, pid, a.to, a.turns);
    case 'gift': return actGift(G, pid, a.to, a.amount);
    case 'ask': return actAsk(G, pid, a.to, a.amount);
    case 'hire': return actHire(G, pid, a.to, a.target, a.amount);
    case 'resign': return actResign(G, pid);
  }
  return fail('Неизвестное действие');
}

// ---- 50-ai.js ----
// ============ ИИ: сложный бот ============
// =====================================================================
//                              ИИ (сложный)
// =====================================================================
function tileValue(t) {
  let v = 1;
  if (t.building === 'farm') v += 6; else if (t.building) v += 2;
  if (t.unit) v += 0.6 * t.unit.type;
  return v;
}

function aiCtx(G, pid) {
  const c = { mine: [], foreign: [], enemyTiles: [], war: new Set(), targets: [], pot: {}, eUnits: [], cache: new Map(), splitCache: new Map() };
  for (const p of G.players) if (p.alive && p.id !== pid && relOf(G, pid, p.id) === 'war') c.war.add(p.id);
  for (const t of G.tiles.values()) {
    if (t.owner === pid) c.mine.push(t);
    else {
      c.foreign.push(t);
      if (t.owner >= 0 && c.war.has(t.owner)) { c.enemyTiles.push(t); c.targets.push(t); }
      else if (t.owner < 0) c.targets.push(t);
    }
  }
  c.e = econ(G, pid);
  c.maxEnemyTiles = 0;
  for (const e of c.war) { c.maxEnemyTiles = Math.max(c.maxEnemyTiles, G.players[e].tiles); }
  c.threat = new Map();
  for (const e of c.war) {
    const ep = G.players[e], ee = econ(G, e), money = ep.money + ee.net;
    let pot = 0;
    for (let k = 4; k >= 1; k--) if (money >= CFG.units[k].cost) { pot = k; break; }
    c.pot[e] = pot;
    for (const t of G.tiles.values()) {
      if (t.owner !== e) continue;
      if (t.unit) {
        const a = CFG.units[t.unit.type].atk;
        c.eUnits.push({ t, atk: a, owner: e });
        for (const [n, kind] of getMoves(G, t, t.unit)) if (n.owner === pid && kind === 'attack' && a > (c.threat.get(n) || 0)) c.threat.set(n, a);
      }
      if (pot) for (const n of nbrs(G, t)) if (n.owner === pid && pot > (c.threat.get(n) || 0)) c.threat.set(n, pot);
    }
  }
  return c;
}

function supportDef(G, pid, n) {
  let best = 0;
  for (const s of nbrs(G, n)) if (s.owner === pid) {
    if (s.unit) best = Math.max(best, CFG.units[s.unit.type].def);
    if (s.building) best = Math.max(best, CFG.buildings[s.building].def);
  }
  return best;
}
function riskAt(G, pid, n, c) {
  let th = 0;
  for (const e of c.war) {
    if (c.pot[e] && nbrs(G, n).some(x => x.owner === e)) th = Math.max(th, c.pot[e]);
  }
  for (const u of c.eUnits) if (hexDist(u.t, n) <= 5 && u.atk > th) th = u.atk;
  return th;
}
function splitGain(G, n, c) {
  const o = n.owner; if (o < 0) return 0;
  const k = n.q + ',' + n.r;
  if (c.splitCache.has(k)) return c.splitCache.get(k);
  const own = [...G.tiles.values()].filter(t => t.owner === o && t !== n);
  const seen = new Set(), sizes = [];
  for (const t of own) {
    if (seen.has(t)) continue;
    const comp = [t]; seen.add(t);
    for (let i = 0; i < comp.length; i++) for (const m of nbrs(G, comp[i])) if (m.owner === o && m !== n && !seen.has(m)) { seen.add(m); comp.push(m); }
    sizes.push(comp.length);
  }
  sizes.sort((a, b) => b - a);
  const gain = sizes.slice(1).reduce((s, x) => s + x, 0);
  c.splitCache.set(k, gain);
  return gain;
}

function captureValue(G, pid, n, kind, utype, c) {
  const ck = n.q + ',' + n.r + ',' + utype;
  if (c.cache.has(ck)) return c.cache.get(ck);
  const ns = nbrs(G, n);
  const adjMine = ns.filter(x => x.owner === pid).length;
  let val;
  if (kind === 'claim') {
    const neutralN = ns.filter(x => x.owner < 0).length;
    val = 1 + 0.18 * neutralN + 0.1 * adjMine + (n.tree ? 0.2 : 0);
    if (ns.some(x => c.war.has(x.owner))) val += 0.6;
  } else {
    val = 3 + 0.1 * adjMine;
    if (n.building === 'farm') val += 6; else if (n.building) val += 2;
    if (n.unit) val += 1.5 + 1.2 * n.unit.type;
    const ep = G.players[n.owner];
    if (ep.tiles <= 1) val += 12; else val += Math.max(0, c.maxEnemyTiles - ep.tiles) * 0.03;
    if (G.opts.connectivity) val += 0.8 * splitGain(G, n, c);
  }
  if (n.res) val += CFG.res[n.res.kind].income * Math.min(n.res.left, resLife(n.res.kind)) * 0.12;   // временная «ферма» (золото — самая ценная)
  const th = riskAt(G, pid, n, c);
  const newDef = Math.max(CFG.units[utype].def, supportDef(G, pid, n));
  if (th > newDef) val -= (kind === 'attack' ? 1.0 : 0.5) + CFG.units[utype].cost * 0.04;
  c.cache.set(ck, val);
  return val;
}

function protectedValue(G, c) {
  let s = 0;
  for (const [t, th] of c.threat) if (t.owner >= 0 && th > 0 && tileDef(G, t) >= th) s += tileValue(t);
  return s;
}

// хватит ли накоплений, чтобы тянуть расход ещё ~10 ходов
function affordable(G, P, e, cost, upkeep) {
  const net = e.net - upkeep, h = G.maxRounds ? Math.max(1, G.maxRounds - G.round + 1) : 10;   // в блице считаем только до конца игры
  return P.money >= cost && (net >= 0 || P.money - cost + net * h >= 0);
}

function aiDisband(G, pid, c) {
  const P = G.players[pid];
  if (c.e.units === 0 || P.money + 2 * c.e.net >= 0) return null;
  let worst = null;
  for (const t of c.mine) if (t.unit && !t.unit.fresh && (!worst || CFG.units[t.unit.type].upkeep > CFG.units[worst.unit.type].upkeep)) worst = t;
  return worst ? applyAction(G, pid, { type: 'disband', tile: key(worst.q, worst.r) }) : null;
}

function aiCapture(G, pid, c) {
  const byTarget = new Map();
  for (const t of c.mine) {
    if (!t.unit || t.unit.moved) continue;
    for (const [n, kind] of getMoves(G, t)) {
      if (kind !== 'claim' && kind !== 'attack') continue;
      if (!byTarget.has(n)) byTarget.set(n, []);
      byTarget.get(n).push({ from: t, kind });
    }
  }
  let best = null;
  for (const [n, list] of byTarget) {
    list.sort((a, b) => CFG.units[a.from.unit.type].atk - CFG.units[b.from.unit.type].atk || a.from.unit.id - b.from.unit.id);
    const pick = list[0];
    const val = captureValue(G, pid, n, pick.kind, pick.from.unit.type, c);
    if (val > 0.2 && (!best || val > best.val)) best = { val, from: pick.from, to: n };
  }
  return best ? applyAction(G, pid, { type: 'move', from: key(best.from.q, best.from.r), to: key(best.to.q, best.to.r) }) : null;
}

function aiDefend(G, pid, c) {
  if (G.maxRounds) return null;
  const P = G.players[pid], e = c.e;
  const vuln = [];
  for (const t of c.mine) {
    const th = c.threat.get(t) || 0;
    if (th > tileDef(G, t) && th <= 3) vuln.push({ t, th, v: tileValue(t) });
  }
  if (!vuln.length) return null;
  const free = c.mine.filter(t => !t.unit && !t.building && !t.tree);
  let best = null;
  for (const kind of ['tower', 'fort']) {
    const B = CFG.buildings[kind];
    if (!affordable(G, P, e, B.cost, B.upkeep)) continue;
    if (kind === 'tower' && e.towers >= e.farms + 2) continue;
    for (const s of free) {
      let cover = 0;
      for (const x of vuln) if ((x.t === s || nbrs(G, s).includes(x.t)) && B.def >= x.th) cover += x.v;
      const val = cover - B.cost * 0.15 - B.upkeep * 0.5;
      if (cover > 0 && (!best || val > best.val)) best = { val, s, kind };
    }
  }
  if (best && best.val > CFG.ai.defVal) return applyAction(G, pid, { type: 'build', tile: key(best.s.q, best.s.r), kind: best.kind });
  return null;
}

// укрепляем границу заранее: башня рядом с фермами, пока враг ещё только подтягивает войска
function aiFortify(G, pid, c) {
  if (G.maxRounds || !c.enemyTiles.length) return null;
  const P = G.players[pid], e = c.e, B = CFG.buildings.tower;
  const A = CFG.ai;
  if (e.towers >= e.farms + A.fortExtra || !affordable(G, P, e, B.cost + 20, B.upkeep) || e.net < A.fortNet) return null;
  let best = null;
  for (const t of c.mine) {
    if (t.unit || t.building || t.tree || t.res || tileDef(G, t) >= 2) continue;
    const ns = nbrs(G, t);
    if (!ns.some(x => c.war.has(x.owner)) && !ns.some(x => x.owner === pid && nbrs(G, x).some(y => c.war.has(y.owner)))) continue;
    let v = 0;
    for (const x of [t, ...ns]) if (x.owner === pid) v += tileValue(x) * (tileDef(G, x) < 2 ? 1 : 0.3);
    if (!best || v > best.v) best = { v, t };
  }
  if (best && best.v >= A.fortV) return applyAction(G, pid, { type: 'build', tile: key(best.t.q, best.t.r), kind: 'tower' });
  return null;
}

function aiFarm(G, pid, c) {
  if (G.maxRounds && G.maxRounds - G.round < 4) return null;   // в блице ферма не успеет окупиться
  const P = G.players[pid], e = c.e, cost = farmCost(G, pid);
  const A = CFG.ai, contact = c.enemyTiles.some(t => c.mine.some(m => hexDist(m, t) <= 1));
  let target = Math.min(Math.floor(e.tiles / (contact ? A.farmDiv : A.farmFree)) + 1, A.farmCap);
  if (contact && e.farms >= 3) target = Math.min(target, A.contactBase + Math.floor(e.tiles / A.contactDiv));
  if (e.farms >= target || P.money < cost) return null;
  const free = c.mine.filter(t => !t.unit && !t.building && !t.tree && !t.res && farmSpotOk(G, pid, t));
  if (!free.length) return null;
  let bt = null, bv = 1e9;
  for (const t of free) {
    const ns = nbrs(G, t);
    const v = ns.filter(x => x.owner !== pid).length + (c.threat.get(t) || 0) * 2 + ns.reduce((s, x) => s + (c.threat.get(x) || 0), 0) * 0.3 + rnd(G) * 0.5;
    if (v < bv) { bv = v; bt = t; }
  }
  return bt ? applyAction(G, pid, { type: 'build', tile: key(bt.q, bt.r), kind: 'farm' }) : null;
}

function aiBuy(G, pid, c) {
  const P = G.players[pid], e = c.e;
  const free = c.mine.filter(t => !t.unit && !t.building && !t.tree);
  if (!free.length) return null;
  // дуэль: свежие солдаты ходят только в следующем ходу — цели, которые они уже «держат», повторно не закупаем
  const covered = new Set();
  if (G.opts.fresh) for (const t of c.mine) if (t.unit && t.unit.fresh) for (const [n, kind] of getMoves(G, t)) if (kind === 'claim' || kind === 'attack') covered.add(n);
  let choice = null;
  for (let type = 1; type <= 4; type++) {
    const U = CFG.units[type];
    if (!affordable(G, P, e, U.cost, U.upkeep)) continue;
    for (const t of free) {
      const mv = getMoves(G, t, { id: 0, type, owner: pid, moved: false });
      for (const [n, kind] of mv) {
        if (kind !== 'claim' && kind !== 'attack') continue;
        if (covered.has(n)) continue;
        const val = captureValue(G, pid, n, kind, type, c) * (G.opts.fresh ? 0.85 : 1) - 0.03 * U.cost - 0.07 * U.upkeep;
        if (!choice || val > choice.val) choice = { val, t, type };
      }
    }
  }
  if (choice && choice.val > 0.3) return applyAction(G, pid, { type: 'buy', tile: key(choice.t.q, choice.t.r), unit: choice.type });
  return null;
}

function aiPosition(G, pid, c) {
  if (!c.targets.length) return null;
  const front = t => { let m = 99; for (const x of c.targets) { const d = hexDist(t, x); if (d < m) m = d; } return m; };
  const base = protectedValue(G, c);
  let best = null;
  for (const t of c.mine) {
    if (!t.unit || t.unit.moved) continue;
    const mv = getMoves(G, t), dCur = front(t), u = t.unit;
    for (const [n, kind] of mv) {
      if (kind !== 'move') continue;
      t.unit = null; n.unit = u;
      const pv = protectedValue(G, c) - base;
      n.unit = null; t.unit = u;
      const score = pv + 0.25 * (dCur - front(n));
      if (score > 0.15 && (!best || score > best.score)) best = { score, from: t, to: n };
    }
  }
  return best ? applyAction(G, pid, { type: 'move', from: key(best.from.q, best.from.r), to: key(best.to.q, best.to.r) }) : null;
}

function aiMerge(G, pid, c) {
  for (const t of c.mine) {
    if (!t.unit || t.unit.moved || t.unit.type > 2) continue;
    if (!c.enemyTiles.some(x => hexDist(x, t) <= 4)) continue;
    const a = t.unit.type, delta = CFG.units[a + 1].upkeep - 2 * CFG.units[a].upkeep;
    if (c.e.net - delta < 4) continue;
    for (const [n, kind] of getMoves(G, t)) if (kind === 'merge') return applyAction(G, pid, { type: 'move', from: key(t.q, t.r), to: key(n.q, n.r) });
  }
  return null;
}

// ---------- дипломатия бота ----------
function planDiplomacy(G, pid) {
  const q = [];
  if (!G.opts.diplomacy) return q;
  const others = G.players.filter(p => p.alive && p.id !== pid);
  if (!others.length) return q;
  const P = G.players[pid], e = econ(G, pid);
  const S = {};
  for (const p of G.players) if (p.alive) S[p.id] = strength(G, p.id);
  const mine = S[pid];
  const contact = {};
  for (const t of G.tiles.values()) {
    if (t.owner < 0) continue;
    for (const n of nbrs(G, t)) if (n.owner >= 0 && n.owner !== t.owner) { const k = t.owner + '-' + n.owner; contact[k] = (contact[k] || 0) + 1; }
  }
  // морской контакт: береговые клетки разных держав в пределах дальности корабля
  const coast = {};
  for (const t of G.tiles.values()) if (t.owner >= 0 && seaNbrs(G, t).length) (coast[t.owner] = coast[t.owner] || []).push(t);
  const near = {};
  for (const a of others.concat([P])) for (const b of others) {
    if (a.id === b.id || near[a.id + '-' + b.id] !== undefined) continue;
    let f = false;
    for (const x of coast[a.id] || []) { for (const y of coast[b.id] || []) if (hexDist(x, y) <= CFG.ship.range + 1) { f = true; break; } if (f) break; }
    near[a.id + '-' + b.id] = near[b.id + '-' + a.id] = f;
  }
  const touch = (a, b) => (contact[a + '-' + b] || 0) > 0 || !!near[a + '-' + b];
  const warList = others.filter(p => relOf(G, pid, p.id) === 'war');

  // коалиция против лидера: если кто-то заметно сильнее всех и сильнее нас — остальные мирятся, объединяются и давят его
  let leader = null;
  const aliveP = G.players.filter(p => p.alive);
  if (aliveP.length >= 3) {
    const srt = aliveP.slice().sort((a, b) => S[b.id] - S[a.id]);
    const avg = aliveP.reduce((t, p) => t + S[p.id], 0) / aliveP.length;
    if (S[srt[0].id] >= 1.3 * avg && S[srt[0].id] >= 1.15 * S[srt[1].id]) leader = srt[0];
  }
  const coal = leader && leader.id !== pid && S[leader.id] >= 1.2 * mine ? leader : null;

  // ответы на входящие предложения
  for (const pr of G.dipl.props.filter(p => p.to === pid)) {
    const f = pr.from;
    if (!G.players[f].alive) continue;
    const ratio = S[f] / Math.max(1, mine), betray = G.players[f].betrayals, fav = favOf(G, pid, f);
    const warOthers = warList.filter(p => p.id !== f).length;
    let score;
    const coalBonus = pr.kind === 'treaty' && coal ? (f === coal.id ? (S[f] > 2.2 * mine ? 0 : -1.5) : 2.2) : 0;
    if (pr.kind === 'treaty' && pr.level === 'peace') {
      score = (ratio - 0.75) * 2.2 + (ratio > 0.3 ? 0.5 * warOthers : 0) - 1.2 * betray + fav * 0.35;
      if (ratio < 0.6 && touch(pid, f)) score -= 1.5;
      score += rnd(G) * 0.5 - 0.25;
    } else if (pr.kind === 'treaty') {
      const common = others.some(p => p.id !== f && relOf(G, pid, p.id) === 'war' && relOf(G, f, p.id) === 'war');
      score = (common ? 1 : -1.5) - 1.5 * betray + ratio * 0.3 + (G.round - relSince(G, pid, f) >= 3 ? 0.5 : -0.5) + fav * 0.35;
    } else if (pr.kind === 'ask') {
      const rel = relOf(G, pid, f);
      score = (rel === 'alliance' ? 1.6 : rel === 'peace' ? 0.4 : -2) + fav * 0.35 - 3 * pr.amount / Math.max(10, P.money) - betray;
      if (pr.amount > P.money * 0.4) score -= 2;
    } else {
      const t = pr.target, tr = S[t] / Math.max(1, mine);
      score = (pr.amount - 20 - 25 * tr) / 20 + fav * 0.3 - (relOf(G, pid, t) === 'alliance' ? 3 : 0) - (mine < S[t] * 0.8 ? 2 : 0) - (relOf(G, pid, f) === 'war' ? 5 : 0);
    }
    q.push({ type: 'respond', id: pr.id, accept: score + coalBonus > 0 });
  }

  // предложить дружбу тем, с кем воюем и кого не можем быстро победить
  let sent = 0;
  if (coal) {                                    // с остальными — дружба, потом союз; лидеру мира не предлагаем
    for (const p of others) {
      if (p.id === coal.id || sent >= 3) continue;
      if (hasProp(G, pid, p.id, 'treaty') || onCooldown(G, pid, p.id)) continue;
      const rel = relOf(G, pid, p.id);
      if (rel === 'war') { q.push({ type: 'propose', to: p.id, level: 'peace' }); sent++; }
      else if (rel === 'peace' && G.round - relSince(G, pid, p.id) >= 1 && p.betrayals < 2 && !relUntil(G, pid, p.id)) { q.push({ type: 'propose', to: p.id, level: 'alliance' }); sent++; }
    }
  }
  const neigh = warList.filter(p => touch(pid, p.id)).sort((a, b) => S[a.id] - S[b.id]);
  const prey = neigh[0];
  for (const p of warList) {
    if (sent >= 2) break;
    if (coal && p.id === coal.id && S[p.id] < 2.2 * mine) continue;
    if (prey && p.id === prey.id && S[p.id] < mine * 0.9) continue;
    const need = S[p.id] > mine * 0.7 || warList.length >= 2 || !touch(pid, p.id);
    if (!need || hasProp(G, pid, p.id, 'treaty') || onCooldown(G, pid, p.id)) continue;
    // сильный бот предпочитает короткое перемирие (передышка), слабый — бессрочный мир
    const pt = S[p.id] < mine * 0.8 && rnd(G) < 0.5 ? rint(G, 3, 8) : 0;
    q.push(pt ? { type: 'propose', to: p.id, level: 'peace', turns: pt } : { type: 'propose', to: p.id, level: 'peace' }); sent++;
  }
  for (const p of others) {
    if (sent >= 3) break;
    if (relOf(G, pid, p.id) !== 'peace' || G.round - relSince(G, pid, p.id) < 3 || p.betrayals > 0) continue;
    if (hasProp(G, pid, p.id, 'treaty') || onCooldown(G, pid, p.id)) continue;
    const common = others.some(o => o.id !== p.id && relOf(G, pid, o.id) === 'war' && relOf(G, p.id, o.id) === 'war');
    if (!common) continue;
    q.push({ type: 'propose', to: p.id, level: 'alliance' }); sent++;
  }

  // деньги: просим у союзника, когда на мели; дарим союзнику в беде; нанимаем кого-то воевать с нашим врагом
  if (P.money < 8 && e.net < 0) {
    const donor = others.filter(p => relOf(G, pid, p.id) === 'alliance' && p.money >= 60 && !hasProp(G, pid, p.id, 'ask') && !onCooldown(G, pid, p.id))[0];
    if (donor) q.push({ type: 'ask', to: donor.id, amount: 20 });
  }
  if (P.money > 150) {
    const poor = others.filter(p => relOf(G, pid, p.id) === 'alliance' && p.money < 5)[0];
    if (poor) q.push({ type: 'gift', to: poor.id, amount: 30 });
  }
  if (warList.length && P.money >= 60 && rnd(G) < 0.35) {
    const target = warList.slice().sort((a, b) => S[b.id] - S[a.id])[0];
    const cand = others.filter(p => p.id !== target.id && relOf(G, pid, p.id) !== 'war' && relOf(G, p.id, target.id) !== 'war' && relOf(G, p.id, target.id) !== 'alliance' && !hasProp(G, pid, p.id, 'hire') && !onCooldown(G, pid, p.id))
      .sort((a, b) => S[b.id] - S[a.id])[0];
    if (cand) q.push({ type: 'hire', to: cand.id, target: target.id, amount: Math.min(40, Math.floor(P.money * 0.4)) });
  }

  // объявление войны: только если мы заметно сильнее и свободной земли почти не осталось
  const neutralCount = [...G.tiles.values()].filter(t => t.owner < 0).length;
  const preyAvailable = warList.some(w => touch(pid, w.id));
  const need = G.round > 80 ? 0.9 : G.round > 40 ? 1.1 : 1.5;
  for (const p of others) {
    const lvl = relOf(G, pid, p.id);
    if (lvl === 'war' || lockLeft(G, pid, p.id) > 0) continue;
    if (coal && p.id !== coal.id) continue;
    if (!touch(pid, p.id) || mine < need * S[p.id]) continue;
    if ((preyAvailable && G.round <= 60) || neutralCount > G.tiles.size * 0.15) continue;
    if (lvl === 'alliance' && mine < Math.max(need, 1.3) * S[p.id]) continue;
    q.push({ type: 'war', to: p.id }); break;
  }
  return q;
}

// ---------- флот: бот перевозит солдат, когда на своём острове места не осталось ----------
function ownShips(G, pid) { const out = []; for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid) out.push(s); return out; }
function hasLandFront(G, c) {
  if (c.landFront === undefined) c.landFront = c.mine.some(t => nbrs(G, t).some(n => n.owner < 0 || c.war.has(n.owner)));
  return c.landFront;
}
function landingTargets(G, c) {
  if (!c.landing) {
    c.landing = [];
    for (const t of G.tiles.values()) if ((t.owner < 0 || c.war.has(t.owner)) && !t.tree && seaNbrs(G, t).length > 0) c.landing.push(t);
  }
  return c.landing;
}
function neededType(G, c) {
  let minDef = 9;
  for (const t of landingTargets(G, c)) { if (t.owner < 0) { minDef = 0; break; } minDef = Math.min(minDef, tileDef(G, t)); }
  return Math.min(4, Math.max(1, (minDef === 9 ? 0 : minDef) + 1));
}
function seaBfs(G, sources) {
  const d = new Map(), q = [];
  for (const s of sources) if (!d.has(s)) { d.set(s, 0); q.push(s); }
  for (let i = 0; i < q.length; i++) for (const n of seaNbrs(G, q[i])) if (!d.has(n)) { d.set(n, d.get(q[i]) + 1); q.push(n); }
  return d;
}
function nearestLanding(G, c, st) {
  if (!c.landD) { const src = []; for (const t of landingTargets(G, c)) for (const s of seaNbrs(G, t)) src.push(s); c.landD = seaBfs(G, src); }
  const v = c.landD.get(st); return v === undefined ? 99 : v;
}
function homeDist(G, c, st) {
  if (!c.homeD) { const src = []; for (const t of c.mine) for (const s of seaNbrs(G, t)) src.push(s); c.homeD = seaBfs(G, src); }
  const v = c.homeD.get(st); return v === undefined ? 99 : v;
}

function aiNaval(G, pid, c) {
  const P = G.players[pid], e = c.e, ships = ownShips(G, pid), land = landingTargets(G, c);
  if (!(ships.length > 0 || (!hasLandFront(G, c) && land.length > 0))) return null;
  const mv = (from, to) => applyAction(G, pid, { type: 'move', from: key(from.q, from.r), to: key(to.q, to.r) });

  // 1) высадка с захватом
  for (const s of ships) {
    const sh = s.ship; if (!sh.cargo || sh.cargo.moved) continue;
    let best = null;
    for (const [n, kind] of getUnloadMoves(G, s)) {
      if (kind === 'move') continue;
      const v = captureValue(G, pid, n, kind, sh.cargo.type, c);
      if (v > 0.2 && (!best || v > best.v)) best = { v, n };
    }
    if (best) return mv(s, best.n);
  }
  // 2) плывём к лучшему месту высадки (или хотя бы ближе к цели)
  const seaScore = (st, type) => {
    const atk = CFG.units[type].atk; let v = -1e9;
    for (const n of nbrs(G, st)) {
      if (!(n.owner < 0 || c.war.has(n.owner)) || atk <= tileDef(G, n)) continue;
      v = Math.max(v, captureValue(G, pid, n, n.owner < 0 ? 'claim' : 'attack', type, c));
    }
    return v > 0.2 ? v : -nearestLanding(G, c, st) * 0.1 - 0.5;
  };
  for (const s of ships) {
    const sh = s.ship; if (!sh.cargo || sh.moved) continue;
    let best = null; const here = seaScore(s, sh.cargo.type);
    for (const [st] of getShipMoves(G, s)) { const v = seaScore(st, sh.cargo.type); if (!best || v > best.v) best = { v, st }; }
    if (best && best.v > here + 1e-9) return mv(s, best.st);
  }
  // 2a) застрявший слабый десант: распускаем корабль, чтобы снарядить сильнее
  for (const s of ships) {
    const sh = s.ship;
    if (sh.cargo && sh.cargo.type < localNeed(G, c, s) && applyDisbandOk(G, pid, s)) return applyAction(G, pid, { type: 'disband', tile: key(s.q, s.r) });
  }
  // 2b) пустой корабль возвращается к своему берегу
  const homeD = st => homeDist(G, c, st);
  for (const s of ships) {
    if (s.ship.cargo || s.ship.moved) continue;
    const here = homeD(s) * 10 - (nbrs(G, s).length ? 0 : 0);
    let best = null;
    for (const [st] of getShipMoves(G, s)) {
      const v = homeD(st) * 10 + nearestLanding(G, c, st) * 0.1;
      if (!best || v < best.v) best = { v, st };
    }
    if (best && homeD(s) > 0 && best.v < here) return mv(s, best.st);
  }
  // 3) садим подходящего солдата на пустой корабль
  const need = neededType(G, c);
  for (const s of ships) {
    if (s.ship.cargo || !land.length) continue;
    let pick = null;
    for (const t of c.mine) {
      if (!t.unit || t.unit.moved || t.unit.type < need || getMoves(G, t).get(s) !== 'board') continue;
      if (!pick || t.unit.type < pick.unit.type) pick = t;
    }
    if (pick) return mv(pick, s);
  }
  if (!land.length) return null;
  // 4) строим корабль у берега, ближайшего к цели
  const maxShips = 1 + (e.tiles >= 45 ? 1 : 0);
  if (ships.length < maxShips && affordable(G, P, e, CFG.ship.cost, CFG.ship.upkeep)) {
    let best = null;
    for (const t of c.mine) for (const s of seaNbrs(G, t)) {
      if (s.ship) continue;
      const v = nearestLanding(G, c, s) + rnd(G) * 0.3;
      if (!best || v < best.v) best = { v, t, s };
    }
    if (best) return applyAction(G, pid, { type: 'ship', tile: key(best.t.q, best.t.r), sea: key(best.s.q, best.s.r) });
  }
  // 5) нанимаем солдата рядом с пустым кораблём
  for (const s of ships) {
    if (s.ship.cargo) continue;
    if (c.mine.some(t => t.unit && getMoves(G, t).get(s) === 'board')) continue;   // солдат для этого корабля уже есть
    const U = CFG.units[need];
    if (!affordable(G, P, e, U.cost, U.upkeep)) continue;
    let bt = null, bd = 99;
    for (const t of c.mine) {
      if (t.unit || t.building || t.tree) continue;
      if (getMoves(G, t, { id: 0, type: need, owner: pid, moved: false }).get(s) !== 'board') continue;
      const d = hexDist(t, s); if (d < bd) { bd = d; bt = t; }
    }
    if (bt) return applyAction(G, pid, { type: 'buy', tile: key(bt.q, bt.r), unit: need });
  }
  return null;
}

// один шаг ИИ = одно действие; null = пора завершать ход
function aiStep(G, pid) {
  const P = G.players[pid];
  if (G.over || !P.alive) return null;
  if (P.dipRound !== G.round) { P.dipRound = G.round; P.dipQueue = planDiplomacy(G, pid); }
  while (P.dipQueue && P.dipQueue.length) {
    const r = applyAction(G, pid, P.dipQueue.shift());
    if (r.ok) return r;
  }
  const c = aiCtx(G, pid);
  for (const step of [aiDisband, aiCapture, aiNaval, aiDefend, aiFarm, aiFortify, aiBuy, aiPosition, aiMerge]) {
    const r = step(G, pid, c);
    if (r && r.ok) return r;
  }
  return null;
}


function applyDisbandOk(G, pid, s) { return s.ship.owner === pid; }

function localNeed(G, c, st) {
  let m = 9;
  for (const n of nbrs(G, st)) if (n.owner < 0 || c.war.has(n.owner)) m = Math.min(m, tileDef(G, n));
  return m === 9 ? 0 : Math.min(4, m + 1);
}

// ---- 99-export.js ----
return { CFG, SHAPES, resLife, relUntil, termLeft, lockLeft, DIRS, key, hexDist, nbrs, seaNbrs, tileAt, newGame, serialize, deserialize, tileDef, econ, farmCost, farmSpotOk, buildCost, getMoves, getShipMoves, getUnloadMoves,
  applyAction, aiStep, relOf, relSince, favOf, strength, allyGroup, RANK, botName, humanName, COLOR_ADJ, components };

})()
module.exports = HexCore;
