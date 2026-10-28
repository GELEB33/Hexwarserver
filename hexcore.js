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
    4: { name: 'Рыцарь',     cost: 40, upkeep: 36, atk: 4, def: 3 },
    5: { name: 'Пушка',      cost: 50, upkeep: 60, atk: 0, def: 1, cannon: true }          // только в Осадном режиме: не ходит, стреляет раз в ход
  },
  buildings: {
    farm:  { name: 'Ферма',    cost: 12, costStep: 2, income: 4, upkeep: 0, def: 0 },
    farm2: { name: 'Ферма II', cost: 30, income: 9, upkeep: 0, def: 0, upgrade: true },   // улучшение фермы (Осадный режим): cost — цена улучшения
    tower: { name: 'Башня',    cost: 15, costStep: 0, income: 0, upkeep: 1, def: 2 },
    fort:  { name: 'Усиленная башня', cost: 35, costStep: 0, income: 0, upkeep: 6, def: 3 }
  },
  ship: { name: 'Корабль', cost: 25, upkeep: 3, range: 5 },          // вмещает одного солдата
  res: { life: 5, density: 0.07, wood: { name: 'Лес', income: 3 }, stone: { name: 'Камень', income: 5 }, gold: { name: 'Золото', income: 10, life: 10 } },
  // золотая жила: одновременно не больше max на карте, живёт life ходов (считая от появления), +10 монет тому, кто владеет клеткой
  gold: { max: 2, chance: 0.45, firstRound: 2 },
  // дуэль: фермы только рядом с другими фермами (первая — где угодно) и дороже: каждая следующая дорожнее на farmStep (в обычном режиме — на 2)
  duel: { farmStep: 6 },
  // осадный режим = дуэль + пушки: не больше max на государство, бьют любого вражеского солдата или корабль на расстоянии до range клеток, один выстрел в ход
  cannon: { max: 3, range: 5 },
  // размер карты — число клеток суши (≈): малая 50, средняя 150, большая 300; число игроков карту больше не раздувает
  mapTiles: { small: 50, medium: 150, large: 300 },
  // настройки ИИ (подобраны симуляциями бот против бота)
  ai: { farmDiv: 4, farmCap: 14, farmFree: 4, contactBase: 3, contactDiv: 10, fortV: 9, fortExtra: 3, defVal: 0.5, fortNet: 5 },
  blitz: { rounds: 10, money: 300 },
  landIncome: 1, treeIncome: 0,
  moveRange: 4,
  startMoney: 25, startTiles: 2, startNeed: 18, minLandPer: 16,       // все государства стартуют с 2 клеток; startNeed/minLandPer — сколько земли нужно на игрока при генерации
  treeDensity: 0.1, treeSpreadMin: 2, treeSpreadMax: 6,
  dominationShare: 0.7,
  diplo: { minTreatyRounds: 2, minWarRounds: 2, proposalTTL: 3, refuseCooldown: 2, maxMoney: 500, minTerm: 2, maxTerm: 10, tradeIncome: 2, tradeMax: 3, loanTurns: 5, loanRate: 0.2, undoMax: 40 },
  disbandTurns: 3                       // распустить солдата можно только через столько ходов (кругов) после найма
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

// журнал нападений для стрелок на карте: кто (a) напал на кого (d), в каком раунде и на какую клетку (k)
function noteAttack(G, a, d, k) {
  if (a === d || a < 0 || d < 0) return;
  const L = G.attacks || (G.attacks = []);
  const last = L[L.length - 1];
  if (last && last.a === a && last.d === d && last.r === G.round && !k) return;
  L.push({ a, d, r: G.round, k: k || '' });
  if (L.length > 40) L.splice(0, L.length - 40);
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
  // ctx.scales — подогнанный под форму коэффициент размера: суша должна получиться ≈ CFG.mapTiles[size] клеток (не зависит от числа игроков).
  // Попытки, не прошедшие только по размеру, в счёт «неудач» не идут — иначе рано включались бы запасные упрощения.
  const ctx = { scales: {}, sizeBad: false };
  let attempt = 0;
  for (let tries = 0; tries < 320 && attempt < 140; tries++) {
    const G = tryGen(opts, base + tries * 7919, attempt, ctx);
    if (G) return G;
    if (!ctx.sizeBad) attempt++;
  }
  throw new Error('Не удалось сгенерировать карту');
}
const isFarm = b => b === 'farm' || b === 'farm2';
const isSiege = G => G.opts.mode === 'siege';
// убираем лишние береговые клетки, пока суши не станет ровно target; сушу не рвём (клетка снимается, только если её соседи-суша идут одной дугой)
function trimLand(G, target) {
  for (let guard = 0; G.tiles.size > target && guard < 4000; guard++) {
    const cand = [];
    let minLand = 7;
    for (const t of G.tiles.values()) {
      let land = 0, trans = 0, prev = G.tiles.has(key(t.q + DIRS[5][0], t.r + DIRS[5][1]));
      for (let i = 0; i < 6; i++) { const l = G.tiles.has(key(t.q + DIRS[i][0], t.r + DIRS[i][1])); if (l) land++; if (l !== prev) trans++; prev = l; }
      if (land >= 1 && land < 6 && trans === 2) { cand.push([t, land]); if (land < minLand) minLand = land; }
    }
    if (!cand.length) break;
    const pool = cand.filter(c => c[1] <= Math.max(2, minLand));       // сначала самые «торчащие» клетки — берег остаётся ровным
    const pick = pool[Math.floor(rnd(G) * pool.length)][0];
    G.tiles.delete(key(pick.q, pick.r));
  }
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

function tryGen(opts, seed, attempt, ctx) {
  const siege = opts.mode === 'siege';
  const duel = opts.mode === 'duel' || siege;          // осадный режим — дуэль с пушками: общие правила найма, ферм и дипломатии
  const plist = duel && opts.players.length < 2 ? [0, 1].map(i => opts.players[i] || { ai: true }) : opts.players;
  const n = plist.length;
  const blitz = opts.mode === 'blitz';
  const G = {
    seed: seed | 0, tiles: new Map(), sea: new Map(), players: [], cur: 0, round: 1, over: false, winner: null, winners: [],
    opts: {
      size: opts.size || 'medium', winMode: (blitz || duel) ? 'last' : (opts.winMode || 'last'), connectivity: !!opts.connectivity,
      allyWin: (blitz || duel) ? false : opts.allyWin !== false, turnSec: opts.turnSec | 0,
      mode: blitz ? 'blitz' : siege ? 'siege' : duel ? 'duel' : 'classic', map: opts.map === 'continent' ? 'continent' : 'islands', diplomacy: duel ? (n > 2 && opts.diplomacy !== false) : opts.diplomacy !== false,
      fresh: duel, shape: 'hex'
    },
    maxRounds: blitz ? CFG.blitz.rounds : 0,
    nextId: 1, evId: 0, events: [], hist: [],
    dipl: { rel: {}, props: [], cool: {}, nextProp: 1, fav: {}, alliances: [], nextAlly: 1, trade: [], debts: [], nextDebt: 1 }
  };
  let shape = opts.shape === 'random' ? SHAPES[Math.floor(rnd(G) * SHAPES.length)] : (SHAPES.indexOf(opts.shape) >= 0 ? opts.shape : 'hex');
  if (attempt >= 100) shape = 'hex';                // запасной вариант: форма не получилась — классический шестиугольник
  G.opts.shape = shape;
  if (!CFG.mapTiles[G.opts.size]) G.opts.size = 'medium';
  const T = CFG.mapTiles[G.opts.size];
  const sc0 = (ctx && ctx.scales[shape]) || 1;
  const R = Math.max(2.5, Math.sqrt(T / 2.4) * sc0), Ri = Math.max(2, Math.round(R));
  const disc = [];
  if (shape === 'hex') {
    for (let q = -Ri; q <= Ri; q++) for (let r = Math.max(-Ri, -q - Ri); r <= Math.min(Ri, -q + Ri); r++) {
      disc.push([q, r]);
      const dist = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      if (dist >= Ri - 1 && rnd(G) < 0.3) continue;
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
    const k = Math.max(2, Math.min(8, Math.round(n * 0.7) + 1, Math.floor(T / 25)));       // на маленькой карте островов меньше, чтобы им хватало суши
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
  const minIsl = T <= 60 ? 10 : 14;
  comps = comps.filter(c => c.length >= minIsl);
  G.tiles = new Map(comps.flat().map(t => [key(t.q, t.r), t]));
  // размер карты: целимся в ~1.15·T клеток, потом точно ужимаем до T. Не вышло по размеру — подгоняем коэффициент формы и пробуем снова
  const sz = G.tiles.size;
  if (ctx) ctx.sizeBad = false;
  if (sz < T || sz > T * 1.6) {
    if (ctx) { ctx.sizeBad = true; ctx.scales[shape] = Math.max(0.45, Math.min(2.2, sc0 * Math.sqrt(1.15 * T / Math.max(sz, 6)))); }
    return null;
  }
  trimLand(G, T);
  comps = components(G);
  if (G.opts.map === 'continent') comps = comps.slice(0, 1);
  comps = comps.filter(c => c.length >= minIsl);
  G.tiles = new Map(comps.flat().map(t => [key(t.q, t.r), t]));
  const islands = comps;
  const minPer = Math.max(3, Math.min(CFG.minLandPer, Math.floor(T / n * 0.6)));
  if (!islands.length || G.tiles.size < n * minPer) return null;
  if (shape === 'hex') { for (const [q, r] of disc) if (!G.tiles.has(key(q, r))) G.sea.set(key(q, r), { q, r, sea: true, ship: null }); }
  else seaAround(G);

  G.players = plist.map((p, i) => ({
    id: i, name: String(p.name || (p.ai ? botName(i) : humanName(i))).slice(0, 20), ai: p.ai ? 'hard' : null,
    color: i, money: blitz ? CFG.blitz.money : CFG.startMoney, alive: true, tiles: 0, betrayals: 0, lost: 0
  }));

  // распределяем игроков по островам (больше остров — больше игроков)
  const need = Math.max(3, Math.min(CFG.startNeed, Math.floor(0.7 * G.tiles.size / n)));      // сколько суши «нужно» игроку: на тесной карте с ботами — меньше
  const cap = islands.map(isl => Math.floor(isl.length / need)), used = islands.map(() => 0), assign = [];
  for (let p = 0; p < n; p++) {
    let bi = -1, bv = 0;
    islands.forEach((isl, i) => { const rem = cap[i] - used[i]; const v = rem - rnd(G) * 0.5; if (rem > 0 && v > bv) { bv = v; bi = i; } });
    if (bi < 0) return null;
    used[bi]++; assign.push(bi);
  }
  for (let i = 0; i < islands.length; i++) {
    const ps = assign.map((a, p) => a === i ? p : -1).filter(p => p >= 0), chosen = [];
    const minD = Math.max(2, Math.min(5, Math.floor(Math.sqrt(islands[i].length / Math.max(1, ps.length)) * 0.9)) - (attempt >= 60 ? 1 : 0));
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
    return { tiles: e.tiles, income: e.income, net: e.net, money: p.money, farms: e.farms, units: e.units, power: strength(G, p.id), lost: p.lost | 0 };
  }) });
  if (G.hist.length > 400) G.hist.shift();
}

// компактный формат: суша [q,r,owner,tree,treeTimer,building,unit,res], unit=[id,type,owner,moved,fresh], res=[kind,left]
// море [q,r] или [q,r,ship], ship=[id,owner,moved,cargo|0], cargo=[id,type,owner,moved]
function serialize(G) {
  const o = Object.assign({}, G);
  o.undoN = G._undo ? G._undo.length : 0;
  o.tiles = [...G.tiles.values()].map(t => [t.q, t.r, t.owner, t.tree ? 1 : 0, t.treeTimer, t.building,
    t.unit ? [t.unit.id, t.unit.type, t.unit.owner, t.unit.moved ? 1 : 0, t.unit.fresh ? 1 : 0, t.unit.born | 0] : null, t.res ? [t.res.kind, t.res.left] : null, t.f | 0]);
  o.sea = [...G.sea.values()].map(s => !s.ship ? [s.q, s.r] : [s.q, s.r, [s.ship.id, s.ship.owner, s.ship.moved ? 1 : 0,
    s.ship.cargo ? [s.ship.cargo.id, s.ship.cargo.type, s.ship.cargo.owner, s.ship.cargo.moved ? 1 : 0, s.ship.cargo.born | 0] : 0]]);
  return o;
}
function deserialize(o) {
  const G = Object.assign({}, o);
  G.tiles = new Map(o.tiles.map(a => [key(a[0], a[1]), { q: a[0], r: a[1], owner: a[2], tree: !!a[3], treeTimer: a[4], building: a[5],
    unit: a[6] ? { id: a[6][0], type: a[6][1], owner: a[6][2], moved: !!a[6][3], fresh: !!a[6][4], born: a[6][5] === undefined ? -99 : a[6][5] } : null, res: a[7] ? { kind: a[7][0], left: a[7][1] } : null, f: a[8] | 0 }]));
  G.sea = new Map(o.sea.map(a => [key(a[0], a[1]), { q: a[0], r: a[1], sea: true, ship: a[2] ? { id: a[2][0], owner: a[2][1], moved: !!a[2][2],
    cargo: a[2][3] ? { id: a[2][3][0], type: a[2][3][1], owner: a[2][3][2], moved: !!a[2][3][3], born: a[2][3][4] === undefined ? -99 : a[2][3][4] } : null } : null }]));
  if (!G.hist) G.hist = [];
  G.undoN = o.undoN | 0;
  migrateAlliances(G);
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

function econ(G, pid, part) {
  let land = 0, farmInc = 0, resInc = 0, upU = 0, upB = 0, farms = 0, towers = 0, tiles = 0, units = 0, ships = 0, res = 0;
  for (const t of G.tiles.values()) {
    if (t.owner !== pid || (part !== undefined && (t.f | 0) !== part)) continue;
    tiles++; land += t.tree ? CFG.treeIncome : CFG.landIncome;
    if (t.res) { res++; resInc += CFG.res[t.res.kind].income; }
    if (t.building) { const b = CFG.buildings[t.building]; farmInc += b.income; upB += b.upkeep; if (isFarm(t.building)) farms++; else towers++; }
    if (t.unit) { upU += CFG.units[t.unit.type].upkeep; units++; }
  }
  for (const s of (part ? [] : G.sea.values())) {
    if (!s.ship || s.ship.owner !== pid) continue;
    ships++; upU += CFG.ship.upkeep;
    if (s.ship.cargo) { upU += CFG.units[s.ship.cargo.type].upkeep; units++; }
  }
  const trade = part ? 0 : tradePartners(G, pid).length * CFG.diplo.tradeIncome;
  const income = land + farmInc + resInc + trade;
  return { land, farmInc, resInc, trade, upkeep: upU + upB, income, net: income - upU - upB, tiles, farms, towers, units, ships, res };
}
function farmCost(G, pid) { const b = CFG.buildings.farm; return b.cost + (G.opts.fresh ? CFG.duel.farmStep : b.costStep) * econ(G, pid).farms; }
// можно ли поставить ферму на клетку t (дуэль: рядом с другой своей фермой, если ферма уже есть)
function farmSpotOk(G, pid, t) {
  if (!G.opts.fresh) return true;
  if (econ(G, pid).farms === 0) return true;
  return nbrs(G, t).some(n => n.owner === pid && isFarm(n.building));
}
function buildCost(G, pid, kind) { return kind === 'farm' ? farmCost(G, pid) : CFG.buildings[kind].cost; }
function cannonCount(G, pid) { let n = 0; for (const t of G.tiles.values()) if (t.owner === pid && t.unit && CFG.units[t.unit.type].cannon) n++; return n; }

function strength(G, pid) {
  const e = econ(G, pid); let lv = 0;
  for (const t of G.tiles.values()) if (t.owner === pid && t.unit) lv += t.unit.type;
  for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid && s.ship.cargo) lv += s.ship.cargo.type;
  return e.tiles + 4 * e.farms + 2 * lv + e.ships;
}

// ---- 30-diplomacy.js ----
// ============ Дипломатия: дружба, альянс, война, деньги, найм на войну ============
function pairKey(a, b) { return a < b ? a + '-' + b : b + '-' + a; }
// Союз — отдельный объект: { id, founder, members:[...] }. Государство состоит максимум в одном союзе.
// Члены одного союза — союзники друг другу (relOf === 'alliance'), остальные отношения (война/дружба) хранятся попарно в G.dipl.rel.
function allianceOf(G, pid) { const l = G.dipl.alliances; if (!l) return null; for (const a of l) if (a.members.indexOf(pid) >= 0) return a; return null; }
function relOf(G, a, b) {
  if (a === b) return 'self'; if (!G.opts.diplomacy) return 'war';
  const al = allianceOf(G, a); if (al && al.members.indexOf(b) >= 0) return 'alliance';
  const r = G.dipl.rel[pairKey(a, b)]; return r ? (r.lvl === 'alliance' ? 'peace' : r.lvl) : 'war';
}
function relSince(G, a, b) { const r = G.dipl.rel[pairKey(a, b)]; return r ? r.since : 0; }
// turns > 0 — срочный договор: действует turns ходов (until — номер раунда, когда он истекает).
// Срочная дружба по истечении превращается в войну, срочная война — в мир. Любая война помнит, когда началась (минимум minWarRounds ходов).
function setRel(G, a, b, lvl, turns) {
  G.dipl.rel[pairKey(a, b)] = { lvl, since: G.round, until: turns ? G.round + turns : 0 };
  if (lvl === 'war') dropTrade(G, a, b);                 // война разрывает торговлю
}
// ---- торговые договоры: оба государства получают +tradeIncome монет в ход, пока нет войны ----
function tradePartners(G, pid) {
  const out = [], l = G.dipl && G.dipl.trade; if (!l) return out;
  for (const t of l) { const o = t.a === pid ? t.b : t.b === pid ? t.a : -1; if (o >= 0 && G.players[o] && G.players[o].alive && relOf(G, pid, o) !== 'war') out.push(o); }
  return out;
}
const hasTrade = (G, a, b) => G.dipl.trade.some(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
function dropTrade(G, a, b) { G.dipl.trade = G.dipl.trade.filter(t => !((t.a === a && t.b === b) || (t.a === b && t.b === a))); }
const tradeCount = (G, pid) => G.dipl.trade.filter(t => t.a === pid || t.b === pid).length;
// ---- долги: заёмщик отдаёт по части каждый свой ход ----
const debtBetween = (G, lender, borrower) => G.dipl.debts.find(d => d.from === lender && d.to === borrower);
function payDebts(G, pid) {
  for (const d of G.dipl.debts.slice()) {
    if (d.to !== pid) continue;
    const B = G.players[pid], L = G.players[d.from];
    if (!L.alive) { G.dipl.debts.splice(G.dipl.debts.indexOf(d), 1); continue; }
    const due = Math.min(d.per, d.left), pay = Math.min(due, Math.max(0, B.money));
    B.money -= pay; L.money += pay; d.left -= pay;
    if (pay < due) { addFav(G, d.from, pid, -1); ev(G, '🏦 ' + B.name + ' не смог выплатить долг полностью: ' + L.name + ' (осталось ' + d.left + ')'); }
    if (d.left <= 0) { G.dipl.debts.splice(G.dipl.debts.indexOf(d), 1); ev(G, '🏦 ' + B.name + ' вернул долг: ' + L.name); addFav(G, d.from, pid, 1); }
  }
}
function relUntil(G, a, b) { const r = G.dipl.rel[pairKey(a, b)]; return r && r.until && r.lvl !== 'alliance' ? r.until : 0; }
// старые сохранения: попарные союзы превращаем в союзы-группы; основатель — государство с наименьшим номером
function migrateAlliances(G) {
  if (!G.dipl) G.dipl = { rel: {}, props: [], cool: {}, nextProp: 1, fav: {} };
  if (!G.dipl.trade) G.dipl.trade = [];
  if (!G.dipl.debts) { G.dipl.debts = []; G.dipl.nextDebt = 1; }
  if (G.dipl.alliances) return;
  G.dipl.alliances = []; G.dipl.nextAlly = 1;
  const par = {}, f = x => { if (par[x] === undefined) par[x] = x; return par[x] === x ? x : (par[x] = f(par[x])); };
  for (const pk of Object.keys(G.dipl.rel || {})) {
    const r = G.dipl.rel[pk]; if (r.lvl !== 'alliance') continue;
    const [a, b] = pk.split('-').map(Number); par[f(a)] = f(b); r.lvl = 'peace'; r.until = 0;
  }
  const groups = {};
  for (const k of Object.keys(par)) (groups[f(+k)] = groups[f(+k)] || []).push(+k);
  for (const g of Object.values(groups)) if (g.length > 1) { g.sort((x, y) => x - y); G.dipl.alliances.push({ id: G.dipl.nextAlly++, founder: g[0], members: g }); }
}
function dropFromAlliance(G, pid) {
  const l = G.dipl.alliances; if (!l) return;
  for (const al of l.slice()) {
    const i = al.members.indexOf(pid); if (i < 0) continue;
    al.members.splice(i, 1);
    if (al.founder === pid) al.founder = al.members[0];
    if (al.members.length < 2) l.splice(l.indexOf(al), 1);
  }
}
// Война по обязательству: a вступил в войну с b, потому что на союзника v напали (rel.aid = v).
// Пока v сам воюет с b, a не может заключить с b отдельный мир (кроме выхода из союза). Когда v мирится с b, все такие войны заканчиваются сами.
function aidVictim(G, a, b) {
  const r = G.dipl.rel[pairKey(a, b)]; if (!r || r.lvl !== 'war' || r.aid === undefined || r.aid === null) return -1;
  const al = allianceOf(G, a), v = r.aid;
  if (!al || v === a || al.members.indexOf(v) < 0 || !G.players[v].alive || al.members.indexOf(b) >= 0) return -1;
  return relOf(G, v, b) === 'war' ? v : -1;
}
function allyBound(G, a, b) { return aidVictim(G, a, b) >= 0; }
// victim заключил мир с attacker: союзники, вступившие в эту войну ради него, тоже прекращают её
function endAidWars(G, victim, attacker) {
  const al = allianceOf(G, victim); if (!al) return;
  for (const m of al.members) {
    if (m === victim || !G.players[m].alive) continue;
    const r = G.dipl.rel[pairKey(m, attacker)];
    if (!r || r.lvl !== 'war' || r.aid !== victim) continue;
    G.dipl.rel[pairKey(m, attacker)] = { lvl: 'peace', since: G.round, until: 0 }; dropProps(G, m, attacker);
    ev(G, '🕊 ' + G.players[m].name + ' прекращает войну с ' + G.players[attacker].name + ': союзник ' + G.players[victim].name + ' заключил мир');
  }
}
// сколько ещё ходов нельзя закончить войну (минимум 2 хода после объявления; срочная война — до конца срока)
function warLockLeft(G, a, b) {
  const r = G.dipl.rel[pairKey(a, b)]; if (!r || r.lvl !== 'war') return 0;
  return Math.max(0, CFG.diplo.minWarRounds - (G.round - r.since), r.until ? r.until - G.round : 0);
}
function peaceBlock(G, a, b) {
  const wl = warLockLeft(G, a, b);
  if (wl > 0) return 'Войну нельзя закончить ещё ' + wl + ' ход.';
  if (allyBound(G, a, b)) return pname(G, a) + ' воюет за союзника: мир возможен, когда ' + pname(G, aidVictim(G, a, b)) + ' закончит эту войну, либо при выходе из союза';
  if (allyBound(G, b, a)) return pname(G, b) + ' воюет за союзника: мир возможен, когда ' + pname(G, aidVictim(G, b, a)) + ' закончит эту войну';
  return '';
}
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
// сколько ходов ещё нельзя разорвать дружбу (минимум minTreatyRounds, срочную — до конца срока)
const lockLeft = (G, a, b) => {
  const r = G.dipl.rel[pairKey(a, b)]; if (!r || r.lvl !== 'peace') return 0;
  return Math.max(0, CFG.diplo.minTreatyRounds - (G.round - r.since), r.until ? r.until - G.round : 0);
};
const termTxt = t => t ? ' на ' + t + ' ход.' : '';
const hasProp = (G, from, to, kind) => G.dipl.props.some(p => p.from === from && p.to === to && p.kind === kind);
const onCooldown = (G, from, to) => (G.dipl.cool[from + '>' + to] || 0) > G.round;
function amountOk(G, amount, max) { return isInt(amount) && amount >= 1 && amount <= Math.min(CFG.diplo.maxMoney, max === undefined ? CFG.diplo.maxMoney : max); }

function actPropose(G, pid, to, level, turns, pay, mode) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (level !== 'peace' && level !== 'alliance') return fail('Неизвестное предложение');
  if (level === 'alliance') turns = 0;                  // союз бессрочный: из него выходят сами
  if (!termOk(turns)) return fail('Срок — от ' + CFG.diplo.minTerm + ' до ' + CFG.diplo.maxTerm + ' ходов');
  turns = turns | 0;
  const cur = relOf(G, pid, to);
  if (level === 'alliance') {
    if (cur === 'alliance') return fail('Вы уже в одном союзе');
    if (cur === 'war') return fail('Сначала заключите дружбу');
    const plan = mode === 'switch' ? switchPlan(G, pid, to) : joinPlan(G, pid, to); if (plan.err) return fail(plan.err);
  } else {
    if (!treatyUseful(G, pid, to, level)) return fail('Это уже действует');
    if (cur === 'war') { const b = peaceBlock(G, pid, to); if (b) return fail(b); }
  }
  pay = pay | 0;
  if (pay < 0 || (pay > 0 && (level !== 'peace' || cur !== 'war' || !amountOk(G, pay, G.players[pid].money)))) return fail('Недопустимая сумма');
  if (hasProp(G, pid, to, 'treaty')) return fail('Предложение уже отправлено');
  if (onCooldown(G, pid, to)) return fail('Недавно отклонено — подождите');
  G.dipl.props.push({ id: G.dipl.nextProp++, kind: 'treaty', from: pid, to, level, turns, pay, round: G.round, mode: level === 'alliance' && mode === 'switch' ? 'switch' : undefined });
  ev(G, pname(G, pid) + (mode === 'switch' && level === 'alliance' ? ' зовёт в свой союз (из прежнего) ' : ' предлагает ') + LVL_RU[level] + termTxt(turns) + (pay ? ' и платит ' + pay + ' монет' : '') + ' → ' + pname(G, to));
  return ok('Предложение отправлено');
}

// «Перекупить союзника»: to выходит из своего союза и вступает в союз from (или создаёт новый с from). Решает сам to — принять или остаться.
function switchPlan(G, from, to) {
  const B = allianceOf(G, to), A = allianceOf(G, from);
  if (!B) return { err: 'Это государство не состоит в союзе' };
  if (A && A === B) return { err: 'Вы уже в одном союзе' };
  if (A) for (const m of A.members) if (relOf(G, to, m) === 'war') return { err: 'Есть война с участником союза: ' + pname(G, m) + ' — сначала заключите мир' };
  return { A, B };
}
// кто в чей союз вступает при принятии предложения from → to
function joinPlan(G, from, to) {
  const A = allianceOf(G, from), B = allianceOf(G, to);
  if (A && B) return { err: 'Оба государства уже состоят в разных союзах' };
  if (!A && !B) return { fresh: true, founder: from, members: [from, to] };
  const al = A || B, joiner = A ? to : from;
  for (const m of al.members) if (relOf(G, joiner, m) === 'war') return { err: 'Есть война с участником союза: ' + pname(G, m) + ' — сначала заключите мир' };
  return { al, joiner };
}
// нападение на члена союза: все остальные члены вступают в войну с агрессором
function callToArms(G, attacker, victim) {
  const al = allianceOf(G, victim); if (!al) return;
  for (const m of al.members.slice()) {
    if (m === victim || m === attacker || !G.players[m].alive || relOf(G, m, attacker) === 'war') continue;
    setRel(G, m, attacker, 'war', 0); G.dipl.rel[pairKey(m, attacker)].aid = victim; dropProps(G, m, attacker);
    addFav(G, attacker, m, -2);
    ev(G, '🤝⚔ ' + pname(G, m) + ' вступает в войну против ' + pname(G, attacker) + ': союзник ' + pname(G, victim) + ' подвергся нападению');
  }
}

function actWar(G, pid, to, turns) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (!termOk(turns)) return fail('Срок — от ' + CFG.diplo.minTerm + ' до ' + CFG.diplo.maxTerm + ' ходов');
  turns = turns | 0;
  const was = relOf(G, pid, to);
  if (was === 'alliance') return fail('Нельзя воевать с союзником — сначала выйдите из союза');
  if (was === 'war') {                                       // уже воюем: можно назначить срок («война на N ходов, затем мир»)
    if (!turns) return fail('Вы уже воюете');
    const prev = G.dipl.rel[pairKey(pid, to)], since = prev ? prev.since : 0;
    setRel(G, pid, to, 'war', turns); G.dipl.rel[pairKey(pid, to)].since = since; dropProps(G, pid, to);       // прямая война: обязательство перед союзником снимается
    ev(G, '⚔ ' + pname(G, pid) + ' и ' + pname(G, to) + ': война' + termTxt(turns) + ', затем мир');
    return ok('Срок войны назначен');
  }
  const left = lockLeft(G, pid, to);
  if (left > 0) return fail('Договор нельзя разорвать ещё ' + left + ' ход.');
  setRel(G, pid, to, 'war', turns); dropProps(G, pid, to);
  G.players[pid].betrayals += 1; addFav(G, to, pid, -4);
  ev(G, '⚔ ' + pname(G, pid) + ' объявил войну: ' + pname(G, to) + termTxt(turns) + ' (мин. ' + CFG.diplo.minWarRounds + ' хода)');
  noteAttack(G, pid, to, '');
  callToArms(G, pid, to);
  updateStatus(G);
  return ok('Война объявлена');
}

// выйти из союза: можно в свой ход; с бывшими союзниками остаётся дружба, снимается обязанность воевать вместе
function actLeave(G, pid) {
  const g = guard(G, pid); if (g) return g;
  if (!G.opts.diplomacy) return fail('Дипломатия отключена в этой партии');
  const al = allianceOf(G, pid); if (!al) return fail('Вы не состоите в союзе');
  const bound = G.players.some(e => e.alive && e.id !== pid && al.members.indexOf(e.id) < 0 && allyBound(G, pid, e.id));
  const others = al.members.filter(m => m !== pid);
  dropFromAlliance(G, pid);
  for (const m of others) {
    setRel(G, pid, m, 'peace', 0); dropProps(G, pid, m);
    addFav(G, m, pid, bound ? -3 : -1.5);
    G.dipl.cool[pid + '>' + m] = G.round + 6; G.dipl.cool[m + '>' + pid] = G.round + 6;
  }
  if (bound) G.players[pid].betrayals += 1;
  ev(G, '🚪 ' + pname(G, pid) + ' вышел из союза' + (bound ? ' (бросив союзников посреди войны!)' : ''));
  updateStatus(G);
  return ok('Вы вышли из союза');
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
  if (relOf(G, to, target) === 'alliance') return fail('Они союзники — воевать друг с другом не могут');
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
    if (pr.level === 'alliance') {
      if (relOf(G, pid, from) === 'alliance' || relOf(G, pid, from) === 'war') { dropProps(G, pid, from); return fail('Предложение устарело'); }
      if (pr.mode === 'switch') {
        const sp = switchPlan(G, from, pid); if (sp.err) { drop(); return fail(sp.err); }
        dropProps(G, pid, from);
        const bound = G.players.some(e => e.alive && e.id !== pid && sp.B.members.indexOf(e.id) < 0 && allyBound(G, pid, e.id));
        const mates = sp.B.members.filter(m => m !== pid);
        dropFromAlliance(G, pid);
        for (const m of mates) { setRel(G, pid, m, 'peace', 0); dropProps(G, pid, m); addFav(G, m, pid, bound ? -3 : -1.5); }
        if (bound) G.players[pid].betrayals += 1;
        const A2 = allianceOf(G, from);
        if (A2) A2.members.push(pid); else G.dipl.alliances.push({ id: G.dipl.nextAlly++, founder: from, members: [from, pid] });
        ev(G, '🔀 ' + pname(G, pid) + ' покинул прежний союз и вступил в союз с ' + pname(G, from));
        addFav(G, pid, from, 1.5); addFav(G, from, pid, 1.5);
        updateStatus(G);
        return ok('Принято');
      }
      const plan = joinPlan(G, from, pid); if (plan.err) { drop(); return fail(plan.err); }
      dropProps(G, pid, from);
      if (plan.fresh) { G.dipl.alliances.push({ id: G.dipl.nextAlly++, founder: from, members: [from, pid] }); ev(G, '🤝 ' + pname(G, from) + ' и ' + pname(G, pid) + ' создали союз'); }
      else { plan.al.members.push(plan.joiner); ev(G, '🤝 ' + pname(G, plan.joiner) + ' вступил в союз (основатель — ' + pname(G, plan.al.founder) + ')'); }
      addFav(G, pid, from, 1); addFav(G, from, pid, 1);
      updateStatus(G);
      return ok('Принято');
    }
    if (!treatyUseful(G, pid, from, pr.level)) { dropProps(G, pid, from); return fail('Предложение устарело'); }
    if (relOf(G, pid, from) === 'war') { const b = peaceBlock(G, pid, from); if (b) { drop(); return fail(b); } }
    const wasWar = relOf(G, pid, from) === 'war';
    setRel(G, pid, from, pr.level, pr.turns | 0); dropProps(G, pid, from);
    if (pr.pay > 0 && G.players[from].money >= pr.pay) { G.players[from].money -= pr.pay; G.players[pid].money += pr.pay; addFav(G, pid, from, Math.min(3, pr.pay / 15)); }
    addFav(G, pid, from, 1); addFav(G, from, pid, 1);
    ev(G, pname(G, pid) + ' и ' + pname(G, from) + ': дружба 🕊️' + termTxt(pr.turns | 0) + (pr.pay > 0 ? ' (выкуп ' + pr.pay + ' монет)' : ''));
    if (wasWar) { endAidWars(G, pid, from); endAidWars(G, from, pid); }
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
    if (relOf(G, pid, t) === 'alliance') { drop(); return fail('Нельзя воевать с союзником — сначала выйдите из союза'); }
    if (lockLeft(G, pid, t) > 0) { drop(); return fail('Договор с целью ещё нельзя разорвать'); }
    if (G.players[from].money < pr.amount) { drop(); return fail('У заказчика не хватает монет'); }
    G.players[from].money -= pr.amount; G.players[pid].money += pr.amount;
    setRel(G, pid, t, 'war'); dropProps(G, pid, t); drop();
    addFav(G, from, pid, 2); addFav(G, t, pid, -3);
    ev(G, '⚔ ' + pname(G, pid) + ' объявил войну ' + pname(G, t) + ' по заказу ' + pname(G, from) + ' (' + pr.amount + ' монет)');
    callToArms(G, pid, t);
    updateStatus(G);
    return ok('Война объявлена');
  }
  if (pr.kind === 'trade') {
    if (relOf(G, pid, from) === 'war') { drop(); return fail('Предложение устарело'); }
    if (hasTrade(G, pid, from) || tradeCount(G, pid) >= CFG.diplo.tradeMax || tradeCount(G, from) >= CFG.diplo.tradeMax) { drop(); return fail('Торговый договор невозможен'); }
    G.dipl.trade.push({ a: from, b: pid, since: G.round }); drop();
    addFav(G, pid, from, 1); addFav(G, from, pid, 1);
    ev(G, '📦 ' + pname(G, pid) + ' и ' + pname(G, from) + ': торговый договор (+' + CFG.diplo.tradeIncome + ' монет в ход каждому)');
    return ok('Принято');
  }
  if (pr.kind === 'loan' || pr.kind === 'borrow') {
    const lender = pr.kind === 'loan' ? from : pid, borrower = pr.kind === 'loan' ? pid : from;
    if (relOf(G, pid, from) === 'war' || debtBetween(G, lender, borrower)) { drop(); return fail('Предложение устарело'); }
    if (G.players[lender].money < pr.amount) { drop(); return fail('У кредитора не хватает монет'); }
    drop(); openLoan(G, lender, borrower, pr.amount);
    return ok('Займ выдан');
  }
  if (pr.kind === 'help') {
    const t = pr.target;
    if (!G.players[t].alive || relOf(G, pid, t) === 'war' || relOf(G, from, t) !== 'war') { drop(); return fail('Предложение устарело'); }
    if (relOf(G, pid, t) === 'alliance') { drop(); return fail('Нельзя воевать с союзником — сначала выйдите из союза'); }
    if (lockLeft(G, pid, t) > 0) { drop(); return fail('Договор с целью ещё нельзя разорвать'); }
    setRel(G, pid, t, 'war'); dropProps(G, pid, t); drop();
    addFav(G, from, pid, 2); addFav(G, t, pid, -3);
    ev(G, '⚔ ' + pname(G, pid) + ' объявил войну ' + pname(G, t) + ' по просьбе ' + pname(G, from));
    callToArms(G, pid, t);
    updateStatus(G);
    return ok('Война объявлена');
  }
  drop(); return fail('Неизвестное предложение');
}

// ---- торговля, займы, просьбы о помощи, управление союзом ----
function actTrade(G, pid, to) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (relOf(G, pid, to) === 'war') return fail('С врагом торговать нельзя');
  if (hasTrade(G, pid, to)) return fail('Торговый договор уже действует');
  if (tradeCount(G, pid) >= CFG.diplo.tradeMax || tradeCount(G, to) >= CFG.diplo.tradeMax) return fail('Не больше ' + CFG.diplo.tradeMax + ' торговых договоров у государства');
  if (hasProp(G, pid, to, 'trade')) return fail('Предложение уже отправлено');
  if (onCooldown(G, pid, to)) return fail('Недавно отклонено — подождите');
  G.dipl.props.push({ id: G.dipl.nextProp++, kind: 'trade', from: pid, to, round: G.round });
  ev(G, pname(G, pid) + ' предлагает торговый договор → ' + pname(G, to));
  return ok('Предложение отправлено');
}
function actCancelTrade(G, pid, to) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (!hasTrade(G, pid, to)) return fail('Торгового договора нет');
  dropTrade(G, pid, to); addFav(G, to, pid, -0.5); G.dipl.cool[pid + '>' + to] = G.round + 3;
  ev(G, '📦 ' + pname(G, pid) + ' расторг торговый договор с ' + pname(G, to));
  return ok('Договор расторгнут');
}
// займ: kind 'loan' — pid даёт в долг, 'borrow' — pid просит в долг
function actLoan(G, pid, to, amount, kind) {
  const g = dipGuard(G, pid, to); if (g) return g;
  const lender = kind === 'loan' ? pid : to, borrower = kind === 'loan' ? to : pid;
  if (!amountOk(G, amount, kind === 'loan' ? G.players[pid].money : undefined)) return fail('Недопустимая сумма');
  if (relOf(G, pid, to) === 'war') return fail('Во время войны в долг не дают');
  if (debtBetween(G, lender, borrower)) return fail('Прошлый долг ещё не возвращён');
  if (hasProp(G, pid, to, kind)) return fail('Предложение уже отправлено');
  if (onCooldown(G, pid, to)) return fail('Недавно отклонено — подождите');
  G.dipl.props.push({ id: G.dipl.nextProp++, kind, from: pid, to, amount, round: G.round });
  ev(G, kind === 'loan' ? pname(G, pid) + ' предлагает ' + pname(G, to) + ' займ ' + amount + ' монет' : pname(G, pid) + ' просит у ' + pname(G, to) + ' в долг ' + amount + ' монет');
  return ok('Предложение отправлено');
}
function openLoan(G, lender, borrower, amount) {
  const total = Math.ceil(amount * (1 + CFG.diplo.loanRate));
  G.players[lender].money -= amount; G.players[borrower].money += amount;
  G.dipl.debts.push({ id: G.dipl.nextDebt++, from: lender, to: borrower, left: total, per: Math.ceil(total / CFG.diplo.loanTurns) });
  addFav(G, lender, borrower, 0.5); addFav(G, borrower, lender, 1);
  ev(G, '🏦 ' + pname(G, lender) + ' дал в долг ' + pname(G, borrower) + ' ' + amount + ' монет (вернуть ' + total + ')');
}
// просьба о помощи: pid просит `to` объявить войну `target` (бесплатно)
function actHelp(G, pid, to, target) {
  const g = dipGuard(G, pid, to); if (g) return g;
  if (!isInt(target) || target < 0 || target >= G.players.length || target === pid || target === to || !G.players[target].alive) return fail('Нет такой цели');
  if (relOf(G, pid, to) === 'war') return fail('Сначала заключите мир');
  if (relOf(G, pid, target) !== 'war') return fail('Просить о помощи можно в войне, которую вы уже ведёте');
  if (relOf(G, to, target) === 'war') return fail('Они и так воюют');
  if (relOf(G, to, target) === 'alliance') return fail('Они союзники — воевать друг с другом не могут');
  if (lockLeft(G, to, target) > 0) return fail('Они недавно заключили договор — рано');
  if (hasProp(G, pid, to, 'help')) return fail('Просьба уже отправлена');
  if (onCooldown(G, pid, to)) return fail('Недавно отклонено — подождите');
  G.dipl.props.push({ id: G.dipl.nextProp++, kind: 'help', from: pid, to, target, round: G.round });
  ev(G, pname(G, pid) + ' просит ' + pname(G, to) + ' помочь в войне с ' + pname(G, target));
  return ok('Просьба отправлена');
}
// управление союзом: основатель исключает участника или распускает союз
function actKick(G, pid, target) {
  const g = guard(G, pid); if (g) return g;
  if (!G.opts.diplomacy) return fail('Дипломатия отключена в этой партии');
  const al = allianceOf(G, pid); if (!al || al.founder !== pid) return fail('Только основатель союза может исключать');
  if (target === pid || al.members.indexOf(target) < 0) return fail('Этого государства нет в вашем союзе');
  dropFromAlliance(G, target);
  setRel(G, pid, target, 'peace', 0); dropProps(G, pid, target);
  for (const m of al.members) if (m !== target && G.players[m] && m !== pid) { setRel(G, m, target, 'peace', 0); }
  addFav(G, target, pid, -2); G.dipl.cool[pid + '>' + target] = G.round + 4; G.dipl.cool[target + '>' + pid] = G.round + 4;
  ev(G, '🚪 ' + pname(G, pid) + ' исключил из союза: ' + pname(G, target));
  updateStatus(G);
  return ok('Участник исключён');
}
function actDissolve(G, pid) {
  const g = guard(G, pid); if (g) return g;
  if (!G.opts.diplomacy) return fail('Дипломатия отключена в этой партии');
  const al = allianceOf(G, pid); if (!al || al.founder !== pid) return fail('Только основатель союза может его распустить');
  const ms = al.members.slice();
  G.dipl.alliances.splice(G.dipl.alliances.indexOf(al), 1);
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) { setRel(G, ms[i], ms[j], 'peace', 0); dropProps(G, ms[i], ms[j]); }
  ev(G, '🚪 ' + pname(G, pid) + ' распустил союз');
  updateStatus(G);
  return ok('Союз распущен');
}

// ---- отмена действия: снимки состояния только для людей, стек живёт до конца хода ----
const UNDOABLE = { move: 1, buy: 1, build: 1, ship: 1, disband: 1, upgrade: 1, fire: 1 };
function undoStack(G) { if (!G._undo) Object.defineProperty(G, '_undo', { value: [], writable: true, enumerable: false }); return G._undo; }
function undoSnap(G) { const o = serialize(G); o.hist = []; o.events = []; return JSON.stringify(o); }     // глубокая копия: живое состояние потом меняется
function undoClear(G) { if (G._undo && G._undo.length) G._undo.length = 0; }
function actUndo(G, pid) {
  const g = guard(G, pid); if (g) return g;
  const st = G._undo; if (!st || !st.length) return fail('Нечего отменять');
  const back = deserialize(JSON.parse(st.pop()));
  const keep = { events: G.events, evId: G.evId, hist: G.hist, _undo: G._undo };
  for (const k of Object.keys(back)) G[k] = back[k];
  G.events = keep.events; G.evId = keep.evId; G.hist = keep.hist;
  G.undoN = st.length;
  return ok('Действие отменено', { kind: 'undo' });
}

// ---- 40-actions.js ----
// ============ Ходы, бой, корабли, постройки, смена хода ============
// Map<tile, 'move'|'merge'|'claim'|'attack'|'board'> — куда может сходить сухопутный юнит
function getMoves(G, from, unit) {
  unit = unit || from.unit;
  const p = unit.owner, U = CFG.units[unit.type];
  const res = new Map(), dist = new Map([[from, 0]]), queue = [from];
  if (U.cannon) return res;                              // пушка не двигается
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
  if (old >= 0 && old !== pid) noteAttack(G, pid, old, key(to.q, to.r));
  if (to.unit && to.unit.owner !== pid) addLost(G, to.unit.owner, 1);           // защитник погиб
  to.owner = pid; to.building = null; to.tree = false; to.treeTimer = 0; to.f = 0;
  to.unit = unit;
  if (old >= 0) { if (G.opts.connectivity) cutOff(G, old); else relabel(G, old); }
  if (!G.opts.connectivity) relabel(G, pid);
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
    const u = { id: sh.cargo.id, type: sh.cargo.type, owner: pid, moved: true, born: sh.cargo.born | 0 };
    sh.cargo = null;
    if (kind === 'move') { to.unit = u; if (to.tree) { to.tree = false; to.treeTimer = 0; } return ok('Высадка', { kind }); }
    takeTile(G, pid, to, u);
    return ok(kind === 'attack' ? 'Клетка захвачена с моря' : 'Земля занята с моря', { kind });
  }

  if (!from.unit) return fail('Здесь нет войска');
  const u = from.unit;
  if (u.owner !== pid) return fail('Это чужое войско');
  if (CFG.units[u.type].cannon) return fail('Пушка не двигается — она только стреляет');
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
  if (kind === 'board') { to.ship.cargo = { id: u.id, type: u.type, owner: pid, moved: true, born: u.born | 0 }; from.unit = null; return ok('Солдат на борту', { kind }); }
  if (kind === 'move') { to.unit = u; from.unit = null; u.moved = true; if (to.tree) { to.tree = false; to.treeTimer = 0; return ok('Дерево расчищено', { kind }); } return ok('Перемещение', { kind }); }
  if (kind === 'merge') {
    const other = to.unit;
    from.unit = null;
    to.unit = { id: G.nextId++, type: u.type + 1, owner: pid, moved: true, born: Math.max(u.born | 0, other.born | 0) };   // срок до роспуска — по более «свежему» солдату
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
// куда можно «выставить» нанятого солдата с клетки-постройки: на соседнюю нейтральную или вражескую (воюете) клетку, если его атака больше её защиты
function outpostTargets(G, pid, from, type) {
  const res = new Map(), U = CFG.units[type];
  if (!U || U.cannon || !from || from.owner !== pid) return res;
  for (const n of nbrs(G, from)) {
    if (n.owner === pid) continue;
    if (n.owner >= 0 && relOf(G, pid, n.owner) !== 'war') continue;
    if (U.atk > tileDef(G, n)) res.set(n, n.owner < 0 ? 'claim' : 'attack');
  }
  return res;
}
function actBuyUnit(G, pid, tk, type, toKey) {
  const g = guard(G, pid); if (g) return g;
  if (!isInt(type) || !has(CFG.units, type)) return fail('Неизвестный тип войска');
  const U = CFG.units[type];
  if (U.cannon) {
    if (!isSiege(G)) return fail('Пушки есть только в осадном режиме');
    if (toKey) return fail('Пушку можно поставить только на свою клетку');
    if (cannonCount(G, pid) >= CFG.cannon.max) return fail('Пушек не больше ' + CFG.cannon.max);
  }
  const fresh = !!G.opts.fresh;                      // дуэль: нанятый солдат ходит только со следующего хода
  if (toKey !== undefined && toKey !== null) {       // найм «через границу»: с клетки-постройки сразу на соседнюю клетку
    if (typeof tk !== 'string' || typeof toKey !== 'string') return fail('Неверный запрос');
    const from = G.tiles.get(tk), to = G.tiles.get(toKey);
    if (!from || !to) return fail('Нет такой клетки');
    if (from.owner !== pid) return fail('Это не ваша клетка');
    if (!from.building) return fail('Нанимать через границу можно с клетки с постройкой');
    if (hexDist(from, to) !== 1) return fail('Только на соседнюю клетку');
    if (to.owner === pid) return fail('Это ваша клетка — наймите солдата на свободную клетку');
    if (to.owner >= 0 && relOf(G, pid, to.owner) !== 'war') return fail('С этим игроком ' + (relOf(G, pid, to.owner) === 'alliance' ? 'альянс' : 'дружба') + ' — сначала объявите войну');
    if (U.atk <= tileDef(G, to)) return fail('Недостаточная сила атаки (защита клетки ' + tileDef(G, to) + ')');
    if (fundsAt(G, from) < U.cost) return fail('Недостаточно монет');
    spendAt(G, from, U.cost);
    const old = to.owner;
    takeTile(G, pid, to, { id: G.nextId++, type, owner: pid, moved: true, fresh, born: G.round });
    return ok(old >= 0 ? 'Клетка захвачена' : 'Земля занята', { kind: old >= 0 ? 'attack' : 'claim' });
  }
  const [t, e] = ownFree(G, pid, tk); if (e) return e;
  if (fundsAt(G, t) < U.cost) return fail('Недостаточно монет');
  spendAt(G, t, U.cost);
  t.unit = { id: G.nextId++, type, owner: pid, moved: fresh, fresh, born: G.round };
  return ok('Нанят: ' + U.name);
}
// улучшение фермы до II уровня (только в осадном режиме)
function actUpgrade(G, pid, tk) {
  const g = guard(G, pid); if (g) return g;
  if (!isSiege(G)) return fail('Улучшать фермы можно только в осадном режиме');
  const t = typeof tk === 'string' ? G.tiles.get(tk) : null;
  if (!t) return fail('Нет такой клетки');
  if (t.owner !== pid) return fail('Это не ваша клетка');
  if (t.building === 'farm2') return fail('Ферма уже улучшена');
  if (t.building !== 'farm') return fail('Улучшать можно только ферму');
  const B = CFG.buildings.farm2;
  if (fundsAt(G, t) < B.cost) return fail('Недостаточно монет');
  spendAt(G, t, B.cost); t.building = 'farm2';
  return ok('Ферма улучшена до II уровня');
}
// цели пушки: вражеские солдаты и корабли (с кем воюем) в радиусе CFG.cannon.range
function getFireTargets(G, from) {
  const res = new Map(), u = from && from.unit;
  if (!u || !CFG.units[u.type].cannon) return res;
  const p = u.owner, R = CFG.cannon.range;
  for (const t of G.tiles.values()) if (t.unit && t.unit.owner !== p && hexDist(from, t) <= R && relOf(G, p, t.unit.owner) === 'war') res.set(t, 'fire');
  for (const s of G.sea.values()) if (s.ship && s.ship.owner !== p && hexDist(from, s) <= R && relOf(G, p, s.ship.owner) === 'war') res.set(s, 'fire');
  return res;
}
function actFire(G, pid, fk, tk) {
  const g = guard(G, pid); if (g) return g;
  if (!isSiege(G)) return fail('Пушки есть только в осадном режиме');
  if (typeof fk !== 'string' || typeof tk !== 'string') return fail('Неверный запрос');
  const from = G.tiles.get(fk), to = tileAt(G, tk);
  if (!from || !to) return fail('Нет такой клетки');
  const u = from.unit;
  if (!u || u.owner !== pid || !CFG.units[u.type].cannon) return fail('Здесь нет вашей пушки');
  if (u.fresh) return fail('Пушка только что куплена — стрелять будет со следующего хода');
  if (u.moved) return fail('Пушка уже стреляла в этом ходу');
  if (hexDist(from, to) > CFG.cannon.range) return fail('Слишком далеко: пушка бьёт на ' + CFG.cannon.range + ' клеток');
  const victim = to.sea ? (to.ship ? to.ship.owner : -1) : (to.unit ? to.unit.owner : -1);
  if (victim < 0 || victim === pid) return fail('Там нет вражеского солдата или корабля');
  if (relOf(G, pid, victim) !== 'war') return fail('С этим игроком ' + (relOf(G, pid, victim) === 'alliance' ? 'альянс' : 'дружба') + ' — сначала объявите войну');
  let what;
  if (to.sea) { what = to.ship.cargo ? 'корабль с солдатом' : 'корабль'; if (to.ship.cargo) addLost(G, victim, 1); to.ship = null; }
  else { what = CFG.units[to.unit.type].cannon ? 'пушку' : 'солдата'; addLost(G, victim, 1); to.unit = null; }
  u.moved = true;
  noteAttack(G, pid, victim, key(to.q, to.r));
  G.shotId = (G.shotId | 0) + 1;
  G.shots = (G.shots || []).concat([{ id: G.shotId, a: [from.q, from.r], b: [to.q, to.r], sea: !!to.sea }]).slice(-6);
  ev(G, '💥 ' + pname(G, pid) + ': пушка уничтожила ' + what + ' (' + pname(G, victim) + ')');
  return ok('Выстрел: уничтожен(а) ' + what, { kind: 'fire' });
}
function actBuild(G, pid, tk, kind) {
  const g = guard(G, pid); if (g) return g;
  if (typeof kind !== 'string' || !has(CFG.buildings, kind)) return fail('Неизвестная постройка');
  const B = CFG.buildings[kind];
  if (B.upgrade) return fail('Это улучшение фермы — нажмите «Улучшить» на ферме');
  let t, e;
  const raw = typeof tk === 'string' ? G.tiles.get(tk) : null;
  if (raw && raw.owner === pid && !raw.unit && (raw.building === 'tower' || raw.building === 'fort') && (kind === 'tower' || kind === 'fort')) {
    if (raw.building === kind) return fail('Здесь уже стоит ' + B.name.toLowerCase());
    t = raw;                                          // башню можно заменить на другую: прежняя исчезает сама
  } else [t, e] = ownFree(G, pid, tk);
  if (e) return e;
  if (t.res) return fail('На клетке месторождение — стройка невозможна');
  if (kind === 'farm' && !farmSpotOk(G, pid, t)) return fail('В дуэли ферму можно строить только рядом с другой своей фермой');
  const cost = buildCost(G, pid, kind);
  if (fundsAt(G, t) < cost) return fail('Недостаточно монет');
  const replaced = t.building; spendAt(G, t, cost); t.building = kind;
  return ok(replaced ? 'Заменено: ' + CFG.buildings[replaced].name + ' → ' + B.name : 'Построено: ' + B.name);
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
  if (fundsAt(G, land) < CFG.ship.cost) return fail('Недостаточно монет');
  spendAt(G, land, CFG.ship.cost);
  sea.ship = { id: G.nextId++, owner: pid, moved: false, cargo: null };
  return ok('Корабль спущен на воду');
}
// сколько ходов (кругов) ещё нельзя распустить солдата: роспуск — только через CFG.disbandTurns ходов после найма
function disbandLeft(G, u) { return Math.max(0, (u.born === undefined ? -99 : u.born) + CFG.disbandTurns - G.round); }
function actDisband(G, pid, tk) {
  const g = guard(G, pid); if (g) return g;
  if (typeof tk !== 'string') return fail('Неверный запрос');
  const t = tileAt(G, tk);
  if (t && t.sea) {
    if (!t.ship || t.ship.owner !== pid) return fail('Здесь нет вашего корабля');
    t.ship = null; return ok('Корабль списан');
  }
  if (!t || t.owner !== pid || !t.unit) return fail('Здесь нет вашего войска');
  const left = disbandLeft(G, t.unit);
  if (left > 0) return fail('Солдата можно распустить только через ' + left + ' ход. после найма');
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
  for (let i = 1; i < comps.length; i++) for (const t of comps[i]) { if (t.unit) addLost(G, pid, 1); t.owner = -1; t.unit = null; t.building = null; t.f = 0; lost++; }
  ev(G, pname(G, pid) + ': отрезано клеток — ' + lost);
}

// ---- отрезанные куски страны (как в Antiyoy): земля остаётся, но у куска своя казна и своя экономика ----
function fragsOf(G) { return G.frags || (G.frags = {}); }
function addLost(G, pid, n) { const P = G.players[pid]; if (P) P.lost = (P.lost | 0) + (n | 0); }
function fundsAt(G, t) { if (t.f) { const F = fragsOf(G)[t.f]; if (F && F.owner === t.owner) return F.money; } return G.players[t.owner].money; }
function spendAt(G, t, amt) { if (t.f) { const F = fragsOf(G)[t.f]; if (F && F.owner === t.owner) { F.money -= amt; return; } } G.players[t.owner].money -= amt; }
function fragCount(G, pid) { let n = 0; const fr = fragsOf(G); for (const k in fr) if (fr[k].owner === pid) n++; return n; }
function relabel(G, pid) {
  const P = G.players[pid], fr = fragsOf(G);
  const own = [...G.tiles.values()].filter(t => t.owner === pid);
  const seen = new Set(), comps = [];
  for (const t of own) {
    if (seen.has(t)) continue;
    const comp = [t]; seen.add(t);
    for (let i = 0; i < comp.length; i++) for (const m of nbrs(G, comp[i])) if (m.owner === pid && !seen.has(m)) { seen.add(m); comp.push(m); }
    comps.push(comp);
  }
  const mine = id => fr[id] && fr[id].owner === pid;
  if (comps.length < 2 && !own.some(t => t.f) && !Object.keys(fr).some(k => mine(k))) return;
  comps.sort((a, b) => b.length - a.length);
  const kept = new Set();
  comps.forEach((comp, i) => {
    const ids = {};
    for (const t of comp) if (t.f && mine(t.f)) ids[t.f] = (ids[t.f] || 0) + 1;
    const list = Object.keys(ids).map(Number).filter(id => !kept.has(id)).sort((a, b) => ids[b] - ids[a]);
    if (i === 0) {                                     // основная часть: казны вернувшихся кусков вливаются в общую
      for (const id of list) { P.money += fr[id].money; delete fr[id]; }
      for (const t of comp) t.f = 0;
      return;
    }
    let id;
    if (list.length) {
      id = list[0];
      for (const o of list.slice(1)) { fr[id].money += fr[o].money; delete fr[o]; }
    } else {
      id = G.nextFrag = (G.nextFrag | 0) + 1;
      fr[id] = { owner: pid, money: 0 };
      ev(G, pname(G, pid) + ': часть земли отрезана, клеток — ' + comp.length + ', у неё своя казна');
    }
    kept.add(id);
    for (const t of comp) t.f = id;
  });
  for (const k of Object.keys(fr)) if (mine(k) && !kept.has(+k)) delete fr[k];   // кусок исчез целиком
}
// ход отрезанных кусков: свой доход и содержание; не хватает денег — войска распускаются
function tickFrags(G, pid) {
  const fr = fragsOf(G);
  for (const k of Object.keys(fr)) {
    const F = fr[k]; if (F.owner !== pid) continue;
    const tiles = [...G.tiles.values()].filter(t => t.owner === pid && t.f === +k);
    F.money += econ(G, pid, +k).net;
    let n = 0;
    while (F.money < 0) {
      let w = null;
      for (const t of tiles) if (t.unit && (!w || CFG.units[t.unit.type].upkeep > CFG.units[w.unit.type].upkeep)) w = t;
      if (!w) break;
      F.money += CFG.units[w.unit.type].upkeep; w.unit = null; n++;
    }
    if (F.money < 0) F.money = 0;
    if (n) { addLost(G, pid, n); ev(G, pname(G, pid) + ': отрезанному куску нечем платить — солдат распалось: ' + n); }
  }
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
// срочные договоры: по окончании срока дружба → война, война → мир (если союз не держит стороны в войне)
function expireTreaties(G) {
  let changed = false;
  for (const pk of Object.keys(G.dipl.rel)) {
    const r = G.dipl.rel[pk]; if (!r.until || G.round < r.until) continue;
    const [a, b] = pk.split('-').map(Number), A = G.players[a], B = G.players[b];
    changed = true; dropProps(G, a, b);
    if (!A.alive || !B.alive) { delete G.dipl.rel[pk]; continue; }
    if (r.lvl === 'war') {
      if (allyBound(G, a, b) || allyBound(G, b, a)) { G.dipl.rel[pk] = { lvl: 'war', since: r.since, until: 0, aid: r.aid }; ev(G, '⚔ Срок войны истёк, но союз не даёт ' + A.name + ' и ' + B.name + ' помириться'); continue; }
      G.dipl.rel[pk] = { lvl: 'peace', since: G.round, until: 0 }; ev(G, '🕊 Срок войны истёк: ' + A.name + ' и ' + B.name + ' заключили мир'); endAidWars(G, a, b); endAidWars(G, b, a);
    } else if (r.lvl === 'peace') { G.dipl.rel[pk] = { lvl: 'war', since: G.round, until: 0 }; ev(G, '⚔ Срок дружбы истёк: ' + A.name + ' и ' + B.name + ' снова воюют'); }
    else delete G.dipl.rel[pk];
  }
  if (changed) updateStatus(G);
}

function growTrees(G) {
  // деревья разрастаются и на нейтральной, и на чужой/своей земле (если там нет войска, постройки и месторождения); дерево на территории государства съедает доход клетки (+1)
  const trees = [...G.tiles.values()].filter(t => t.tree);
  for (const t of trees) {
    t.treeTimer--;
    if (t.treeTimer > 0) continue;
    t.treeTimer = rint(G, CFG.treeSpreadMin, CFG.treeSpreadMax);
    const c = nbrs(G, t).filter(n => !n.tree && !n.res && !n.unit && !n.building);
    if (!c.length) continue;
    const n = c[Math.floor(rnd(G) * c.length)];
    if (n.owner >= 0 && rnd(G) < 0.45) continue;                  // на населённую землю лес наступает медленнее
    n.tree = true; n.treeTimer = rint(G, CFG.treeSpreadMin, CFG.treeSpreadMax);
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
      p.alive = false; ev(G, p.name + ' выбывает из игры'); dropFromAlliance(G, p.id);
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
  undoClear(G); G.undoN = 0;
  if (!G.opts.connectivity) relabel(G, pid);
  const e = econ(G, pid, G.opts.connectivity ? undefined : 0);
  P.money += e.net;
  payDebts(G, pid);
  for (const t of G.tiles.values()) if (t.owner === pid && t.res && t.res.kind !== 'gold' && --t.res.left <= 0) { t.res = null; ev(G, P.name + ': месторождение истощено'); }
  if (P.money < 0) {
    for (const t of G.tiles.values()) if (t.owner === pid && t.unit && !t.f) { t.unit = null; addLost(G, pid, 1); }
    for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid) { if (s.ship.cargo) addLost(G, pid, 1); s.ship = null; }
    P.money = 0;
    ev(G, P.name + ': банкротство — все войска и корабли потеряны!');
  }
  if (!G.opts.connectivity) tickFrags(G, pid);
}

function advanceTurn(G) {
  for (const p of G.players) if (p.alive) { if (G.opts.connectivity) cutOff(G, p.id); else relabel(G, p.id); }
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
  const wasCur = G.cur === pid; undoClear(G); G.undoN = 0;
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
  if (a.type === 'undo') return actUndo(G, pid);
  const human = G.players[pid] && !G.players[pid].ai && !G.over && G.cur === pid;
  const snap = human && UNDOABLE[a.type] ? undoSnap(G) : null;
  const r = applyRaw(G, pid, a);
  if (r.ok) {
    if (snap) { const st = undoStack(G); st.push(snap); if (st.length > CFG.undoMax) st.shift(); G.undoN = st.length; }
    else if (a.type !== 'undo') { undoClear(G); G.undoN = 0; }       // конец хода, дипломатия и пр. — дальше назад не откатиться
  }
  return r;
}
function applyRaw(G, pid, a) {
  switch (a.type) {
    case 'move': return actMove(G, pid, a.from, a.to);
    case 'buy': return actBuyUnit(G, pid, a.tile, a.unit, a.to);
    case 'upgrade': return actUpgrade(G, pid, a.tile);
    case 'fire': return actFire(G, pid, a.from, a.to);
    case 'build': return actBuild(G, pid, a.tile, a.kind);
    case 'ship': return actBuyShip(G, pid, a.tile, a.sea);
    case 'disband': return actDisband(G, pid, a.tile);
    case 'end': return actEndTurn(G, pid);
    case 'propose': return actPropose(G, pid, a.to, a.level, a.turns, a.pay, a.mode);
    case 'respond': return actRespond(G, pid, a.id, !!a.accept);
    case 'war': return actWar(G, pid, a.to, a.turns);
    case 'leave': return actLeave(G, pid);
    case 'gift': return actGift(G, pid, a.to, a.amount);
    case 'ask': return actAsk(G, pid, a.to, a.amount);
    case 'hire': return actHire(G, pid, a.to, a.target, a.amount);
    case 'trade': return actTrade(G, pid, a.to);
    case 'untrade': return actCancelTrade(G, pid, a.to);
    case 'loan': return actLoan(G, pid, a.to, a.amount, 'loan');
    case 'borrow': return actLoan(G, pid, a.to, a.amount, 'borrow');
    case 'help': return actHelp(G, pid, a.to, a.target);
    case 'kick': return actKick(G, pid, a.target);
    case 'dissolve': return actDissolve(G, pid);
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
  if (t.building === 'farm') v += 6; else if (t.building === 'farm2') v += 9; else if (t.building) v += 2;
  if (t.unit) v += t.unit.type === 5 ? 3 : 0.6 * t.unit.type;
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
  c.cannons = [];                                                    // вражеские пушки (осадный режим): их радиус поражения — опасная зона
  if (isSiege(G)) for (const t of c.enemyTiles) if (t.unit && CFG.units[t.unit.type].cannon) c.cannons.push(t);
  c.e = econ(G, pid, G.opts.connectivity ? undefined : 0);
  { const mny = G.players[pid].money; c.bold = mny > 400 ? 0.2 : mny > 200 ? 0.5 : 1; }     // богатому боту не страшно потерять солдата — он смелее идёт на риск
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
    for (const s of G.sea.values()) {                              // вражеские корабли с десантом: берег в радиусе плавания + высадка под угрозой
      if (!s.ship || s.ship.owner !== e || !s.ship.cargo) continue;
      const a = CFG.units[s.ship.cargo.type].atk;
      for (const t of c.mine) if (hexDist(t, s) <= CFG.ship.range + 1 && a > (c.threat.get(t) || 0)) c.threat.set(t, a);
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
function cannonDanger(n, c) {
  if (!c.cannons || !c.cannons.length) return 0;
  let d = 0; for (const t of c.cannons) if (hexDist(t, n) <= CFG.cannon.range) d++;
  return Math.min(2, d);
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
    if (n.building === 'farm') val += 6; else if (n.building === 'farm2') val += 9; else if (n.building) val += 2;
    if (n.unit) val += 1.5 + (n.unit.type === 5 ? 3 : 1.2 * n.unit.type);
    const ep = G.players[n.owner];
    if (ep.tiles <= 1) val += 12; else val += Math.max(0, c.maxEnemyTiles - ep.tiles) * 0.03;
    if (G.opts.connectivity) val += 0.8 * splitGain(G, n, c);
  }
  if (n.res) val += CFG.res[n.res.kind].income * Math.min(n.res.left, resLife(n.res.kind)) * 0.12;   // временная «ферма» (золото — самая ценная)
  const th = riskAt(G, pid, n, c);
  const newDef = Math.max(CFG.units[utype].def, supportDef(G, pid, n));
  if (th > newDef) val -= ((kind === 'attack' ? 1.0 : 0.5) + CFG.units[utype].cost * 0.04) * (c.bold === undefined ? 1 : c.bold);
  const cd = cannonDanger(n, c);                                      // под прицелом вражеской пушки солдат погибнет, не защитив клетку
  if (cd) val -= cd * (0.9 + CFG.units[utype].cost * 0.04) * (c.bold === undefined ? 1 : c.bold);
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
  for (const t of c.mine) if (t.unit && disbandLeft(G, t.unit) === 0 && (!worst || CFG.units[t.unit.type].upkeep > CFG.units[worst.unit.type].upkeep)) worst = t;
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
  const free = c.mine.filter(t => !t.unit && !t.building && !t.tree && !t.f);
  if (free.length < 3 && !c.threat.size) return null;
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
  if (c.mine.filter(t => !t.unit && !t.building && !t.tree && !t.f).length < 5 || e.towers >= Math.max(3, Math.floor(e.tiles / 6))) return null;      // не застраиваем всю землю башнями
  let best = null;
  for (const t of c.mine) {
    if (t.unit || t.building || t.tree || t.res || t.f || tileDef(G, t) >= 2) continue;
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
  const P = G.players[pid], e = c.e, cost = farmCost(G, pid), B = CFG.buildings.farm;
  const left = G.maxRounds ? G.maxRounds - G.round + 1 : 60;         // сколько ходов ещё играть
  if (cost / B.income + 1 > left || P.money < cost) return null;    // ферма не успеет окупиться
  const threatened = c.threat.size > 0;
  if (threatened && P.money - cost < CFG.units[2].cost) return null; // держим запас на экстренный найм
  const contact = c.enemyTiles.some(t => c.mine.some(m => hexDist(m, t) <= 1));
  // «план» ферм растёт вместе с землёй; всё, что сверх плана, строим, когда копятся лишние деньги — казна не должна лежать мёртвым грузом
  const want = Math.floor(e.tiles / (contact ? CFG.ai.farmDiv - 1 : 2.5)) + 2;
  if (e.farms >= want && P.money < cost + 45) return null;
  if (e.farms >= 0.55 * e.tiles) return null;
  if (e.tiles < 5) return null;                                       // с маленькой землёй сначала расширяемся: ферма не должна занять последнюю клетку под найм
  const room = c.mine.filter(t => !t.unit && !t.building && !t.tree && !t.f).length;
  if (room < 4) return null;                                          // оставляем клетки для найма войск и посадки десанта
  const free = c.mine.filter(t => !t.unit && !t.building && !t.tree && !t.f && !t.res && farmSpotOk(G, pid, t));
  if (!free.length) return null;
  let bt = null, bv = 1e9;
  for (const t of free) {
    const ns = nbrs(G, t);
    // ферму прячем вглубь: подальше от чужих, от угроз и от моря (десант), рядом с другими своими фермами
    const v = ns.filter(x => x.owner !== pid).length + (c.threat.get(t) || 0) * 2 + ns.reduce((s, x) => s + (c.threat.get(x) || 0), 0) * 0.3
      - ns.filter(x => x.owner === pid && isFarm(x.building)).length * 0.25 + rnd(G) * 0.5;
    if (v < bv) { bv = v; bt = t; }
  }
  return bt ? applyAction(G, pid, { type: 'build', tile: key(bt.q, bt.r), kind: 'farm' }) : null;
}

// ---------- осадный режим: пушки и улучшение ферм ----------
// выстрел: самая дорогая цель в радиусе (дорогой солдат, корабль с десантом, вражеская пушка)
function aiFire(G, pid, c) {
  if (!isSiege(G)) return null;
  let best = null;
  for (const t of c.mine) {
    const u = t.unit; if (!u || !CFG.units[u.type].cannon || u.moved || u.fresh) continue;
    for (const [n] of getFireTargets(G, t)) {
      const val = n.sea ? CFG.ship.cost + (n.ship.cargo ? CFG.units[n.ship.cargo.type].cost : 0) : CFG.units[n.unit.type].cost + CFG.units[n.unit.type].upkeep * 0.3;
      if (!best || val > best.val) best = { val, t, n };
    }
  }
  return best ? applyAction(G, pid, { type: 'fire', from: key(best.t.q, best.t.r), to: key(best.n.q, best.n.r) }) : null;
}
// покупка пушки: только если казна её тянет (−60/ход!) и в радиусе поражения есть что бить
function aiCannon(G, pid, c) {
  if (!isSiege(G) || G.maxRounds) return null;
  const P = G.players[pid], e = c.e, U = CFG.units[5];
  if (cannonCount(G, pid) >= CFG.cannon.max) return null;
  if (!affordable(G, P, e, U.cost + 30, U.upkeep) || e.net - U.upkeep < 6) return null;
  const foes = [];
  for (const t of G.tiles.values()) if (t.unit && c.war.has(t.unit.owner)) foes.push(t);
  for (const s of G.sea.values()) if (s.ship && c.war.has(s.ship.owner)) foes.push(s);
  if (foes.length < 2) return null;
  let best = null;
  for (const t of c.mine) {
    if (t.unit || t.building || t.tree || t.f || t.res) continue;
    let v = 0;
    for (const f of foes) if (hexDist(t, f) <= CFG.cannon.range) v += f.sea ? 2 : 1 + f.unit.type * 0.6;
    if ((c.threat.get(t) || 0) > Math.max(tileDef(G, t), U.def)) v -= 3;     // на самой границе пушку тут же захватят
    if (!best || v > best.v) best = { v, t };
  }
  return best && best.v >= 4 ? applyAction(G, pid, { type: 'buy', tile: key(best.t.q, best.t.r), unit: 5 }) : null;
}
function aiUpgrade(G, pid, c) {
  if (!isSiege(G)) return null;
  const P = G.players[pid], B = CFG.buildings.farm2, gain = B.income - CFG.buildings.farm.income;
  const left = G.maxRounds ? G.maxRounds - G.round + 1 : 60;
  if (P.money < B.cost + 10 || B.cost / gain + 1 > left) return null;
  if (c.threat.size > 0 && P.money - B.cost < CFG.units[2].cost) return null;
  let bt = null, bv = 1e9;
  for (const t of c.mine) {
    if (t.building !== 'farm' || t.f) continue;
    const v = (c.threat.get(t) || 0) * 2 + nbrs(G, t).filter(x => x.owner !== pid).length + rnd(G) * 0.5;      // прячем вглубь: сперва улучшаем самые безопасные фермы
    if (v < bv) { bv = v; bt = t; }
  }
  return bt ? applyAction(G, pid, { type: 'upgrade', tile: key(bt.q, bt.r) }) : null;
}

// Экономия: лишних солдат, которым нечего захватывать и некого защищать, распускаем — содержание Барона/Рыцаря съедает прибыль.
// Оставляем гарнизон ~1 солдат на 14 клеток, чтобы соседи не сочли нас лёгкой добычей. Распускать можно только через 3 хода после найма.
function aiTrim(G, pid, c) {
  if (G.maxRounds) return null;
  const e = c.e;
  if (e.units === 0) return null;
  const keep = Math.max(1, Math.floor(e.tiles / 14));
  const poor = e.net < 3 + 0.04 * e.income;                      // прибыль слабая — режем и в гарнизоне
  if (e.units <= keep && !poor) return null;
  const myShips = ownShips(G, pid);
  let worst = null;
  for (const t of c.mine) {
    const u = t.unit; if (!u || disbandLeft(G, u) > 0) continue;
    if (e.units <= keep && CFG.units[u.type].upkeep <= 2) continue;
    if (c.enemyTiles.some(x => hexDist(x, t) <= 8)) continue;    // рядом враг — солдат нужен
    if ((c.threat.get(t) || 0) > 0 || nbrs(G, t).some(n => n.owner === pid && (c.threat.get(n) || 0) > 0)) continue;
    let useful = false;
    for (const [n, kind] of getMoves(G, t)) if (kind === 'claim' || kind === 'attack' || (kind === 'board' && myShips.length)) { useful = true; break; }
    if (useful) continue;
    if (!worst || CFG.units[u.type].upkeep > CFG.units[worst.unit.type].upkeep) worst = t;
  }
  if (!worst || (CFG.units[worst.unit.type].upkeep < 6 && !poor)) return null;
  return applyAction(G, pid, { type: 'disband', tile: key(worst.q, worst.r) });
}

function aiBuy(G, pid, c) {
  const P = G.players[pid], e = c.e;
  const free = c.mine.filter(t => !t.unit && !t.building && !t.tree && !t.f);
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

// расчищаем деревья на своей земле: достаточно поставить на клетку войско, дерево съедает доход
function aiClear(G, pid, c) {
  let best = null;
  for (const t of c.mine) {
    if (!t.unit || t.unit.moved) continue;
    for (const [n, kind] of getMoves(G, t)) if (kind === 'move' && n.tree && !n.f === !t.f) { const d = hexDist(t, n); if (!best || d < best.d) best = { d, t, n }; }
  }
  if (best) return applyAction(G, pid, { type: 'move', from: key(best.t.q, best.t.r), to: key(best.n.q, best.n.r) });
  // свободных войск нет — нанимаем крестьянина рядом с деревом
  const P = G.players[pid];
  if (P.money < CFG.units[1].cost + 15 || c.e.net < 3) return null;
  const trees = c.mine.filter(t => t.tree && !t.f);
  if (!trees.length) return null;
  for (const f of c.mine) {
    if (f.unit || f.building || f.tree || f.f) continue;
    const mv = getMoves(G, f, { id: 0, type: 1, owner: pid, moved: false });
    if (trees.some(t => mv.get(t) === 'move')) return applyAction(G, pid, { type: 'buy', tile: key(f.q, f.r), unit: 1 });
  }
  return null;
}
function aiMerge(G, pid, c) {
  // «осада»: враг за башнями/фортом, а сильнее барона у нас никого нет — сливаем двух баронов в рыцаря (содержание то же, атака 4 пробивает любую защиту)
  let maxAtk = 0; for (const t of c.mine) if (t.unit && !CFG.units[t.unit.type].cannon) maxAtk = Math.max(maxAtk, CFG.units[t.unit.type].atk);
  let blocked = false;
  if (maxAtk && maxAtk < 4) for (const x of c.enemyTiles) if (tileDef(G, x) >= maxAtk && c.mine.some(m => hexDist(m, x) <= 3)) { blocked = true; break; }
  for (const t of c.mine) {
    if (!t.unit || t.unit.moved || t.unit.type > (blocked ? 3 : 2) || CFG.units[t.unit.type].cannon) continue;
    if (!c.enemyTiles.some(x => hexDist(x, t) <= (blocked ? 8 : 4))) continue;
    const a = t.unit.type, delta = CFG.units[a + 1].upkeep - 2 * CFG.units[a].upkeep;
    if (blocked && a !== maxAtk) continue;
    if (c.e.net - delta < (blocked ? 0 : 4)) continue;
    for (const [n, kind] of getMoves(G, t)) if (kind === 'merge') return applyAction(G, pid, { type: 'move', from: key(t.q, t.r), to: key(n.q, n.r) });
  }
  return null;
}

// ---------- дипломатия бота ----------
// Бот ведёт дипломатию со всеми: мирится с теми, кого не хочет/не может бить, создаёт и вступает в союзы,
// объединяется против лидера, дарит деньги, нанимает на войну — и при этом сам стремится захватить всё,
// нападая на слабейшего достижимого соседа, когда имеет перевес (с учётом денег и союзников жертвы).
function planDiplomacy(G, pid) {
  const q = [];
  if (!G.opts.diplomacy) return q;
  const others = G.players.filter(p => p.alive && p.id !== pid);
  if (!others.length) return q;
  const P = G.players[pid], e = econ(G, pid);
  const S = {};                                                  // «мощь»: сила + запас денег, которые можно превратить в армию
  for (const p of G.players) if (p.alive) S[p.id] = strength(G, p.id) + 0.08 * p.money + 0.3 * Math.max(0, econ(G, p.id).net);
  const mine = S[pid];
  const myAl = allianceOf(G, pid);
  const isMember = id => !!myAl && myAl.members.indexOf(id) >= 0;
  const teamPower = id => { const al = allianceOf(G, id); return S[id] + (al ? 0.6 * al.members.filter(m => m !== id && G.players[m].alive).reduce((s, m) => s + S[m], 0) : 0); };
  const contact = {};
  for (const t of G.tiles.values()) {
    if (t.owner < 0) continue;
    for (const n of nbrs(G, t)) if (n.owner >= 0 && n.owner !== t.owner) { const k = t.owner + '-' + n.owner; contact[k] = (contact[k] || 0) + 1; }
  }
  // морской контакт: береговые клетки разных держав в пределах дальности корабля; mind — расстояние между ближайшими землями
  const coast = {}, lands = {};
  for (const t of G.tiles.values()) if (t.owner >= 0) { (lands[t.owner] = lands[t.owner] || []).push(t); if (seaNbrs(G, t).length) (coast[t.owner] = coast[t.owner] || []).push(t); }
  const near = {}, mind = {};
  for (const b of others) {
    let f = false, md = 99;
    for (const x of coast[pid] || []) for (const y of coast[b.id] || []) { const d = hexDist(x, y); if (d <= CFG.ship.range + 1) f = true; }
    for (const x of lands[pid] || []) for (const y of lands[b.id] || []) { const d = hexDist(x, y); if (d < md) md = d; }
    near[b.id] = f; mind[b.id] = md;
  }
  const touch = b => (contact[pid + '-' + b] || 0) > 0 || !!near[b];
  const reach = b => touch(b) || (P.money >= 90 && (mind[b] <= 2 * CFG.ship.range + 3 || G.round > 25));   // далёкий противник достижим флотом, если есть деньги
  const warList = others.filter(p => relOf(G, pid, p.id) === 'war');
  const aliveN = G.players.filter(p => p.alive).length;
  const avg = G.players.filter(p => p.alive).reduce((t, p) => t + S[p.id], 0) / aliveN;
  const canPeace = b => !peaceBlock(G, pid, b);
  // «копилка»: денег в казне больше, чем нужно на развитие — значит, пора воевать. Цель бота — захватить весь мир, а не копить монеты.
  const hoardNow = P.money > 120 + 1.5 * Math.max(10, e.net);
  const maxAlSize = Math.max(2, Math.floor((aliveN + 1) / 3));       // огромные союзы всех со всеми запрещены: иначе воевать становится не с кем
  const weakReach = id => reach(id) && teamPower(id) < 0.9 * mine;      // слабый достижимый сосед — будущая добыча

  // коалиция против лидера: если кто-то заметно сильнее всех — остальные мирятся, объединяются и давят его
  let leader = null;
  const aliveP = G.players.filter(p => p.alive);
  if (aliveP.length >= 3) {
    const srt = aliveP.slice().sort((a, b) => S[b.id] - S[a.id]);
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
      if (!canPeace(f)) continue;                                // союз или минимальный срок войны не дают помириться — предложение просто истечёт
      score = (ratio - 0.75) * 2.2 + (ratio > 0.3 ? 0.5 * warOthers : 0) - 1.2 * betray + fav * 0.35;
      if (ratio < 0.6 && touch(f)) score -= 1.2;                 // сосед слабее нас — он лакомая добыча
      score += rnd(G) * 0.5 - 0.25 + (pr.pay || 0) / 18;
      if (P.money >= 120 && weakReach(f) && !(pr.pay > 40)) score -= 1.8;          // слабого достижимого соседа мы собираемся покорить, а не мириться с ним
    } else if (pr.kind === 'treaty') {                           // предложение союза: либо в наш союз, либо в его, либо новый
      const isSw = pr.mode === 'switch';
      const plan = isSw ? switchPlan(G, f, pid) : joinPlan(G, f, pid);
      if (plan.err) continue;
      const common = others.some(p => p.id !== f && relOf(G, pid, p.id) === 'war' && relOf(G, f, p.id) === 'war');
      const exposed = warList.some(w => touch(w.id) && S[w.id] > 0.8 * mine);
      let pull = 0;                                              // союз тянет нас в войны: смотрим на сильных врагов будущих союзников
      const team = isSw ? (plan.A ? plan.A.members : [f]) : (plan.al ? plan.al.members : [f]);
      for (const m of team) for (const w of others) if (m !== w.id && relOf(G, m, w.id) === 'war' && relOf(G, pid, w.id) !== 'war' && S[w.id] > 1.1 * mine && touch(w.id)) pull += 1;
      score = (common ? 1 : -0.4) + (exposed ? 0.9 : 0) + (teamPower(f) > mine * 1.1 ? 0.7 : 0) - 0.8 * pull - 1.5 * betray + fav * 0.35 + rnd(G) * 0.6 - 0.3;
      if ((isSw ? (plan.A ? plan.A.members.length + 1 : 2) : (plan.al ? plan.al.members.length + 1 : 2)) > maxAlSize) score -= 9;         // союз уже достаточно большой
      if (isSw) score += (teamPower(f) > 1.25 * teamPower(pid) ? 1.5 : -1.2) - 0.5;       // уходить из своего союза бот согласен, только если новый заметно сильнее
      if (hoardNow && !exposed) score -= 2;
    } else if (pr.kind === 'ask') {
      const rel = relOf(G, pid, f);
      score = (rel === 'alliance' ? 1.6 : rel === 'peace' ? 0.4 : -2) + fav * 0.35 - 3 * pr.amount / Math.max(10, P.money) - betray;
      if (pr.amount > P.money * 0.4) score -= 2;
    } else if (pr.kind === 'trade') {
      score = 1.4 + fav * 0.3 - 0.9 * betray - (tradeCount(G, pid) >= CFG.diplo.tradeMax ? 9 : 0) + rnd(G) * 0.4 - 0.2;
    } else if (pr.kind === 'loan') {                                // нам предлагают займ: берём, когда деньги нужны (проценты 20%)
      score = (P.money < 60 ? 1.5 : P.money < 120 ? 0.2 : -1.5) + fav * 0.2 - (debtBetween(G, f, pid) ? 9 : 0);
    } else if (pr.kind === 'borrow') {                              // нас просят в долг
      const rel = relOf(G, pid, f);
      score = (rel === 'alliance' ? 1.2 : 0.2) + fav * 0.4 - betray - (pr.amount > P.money * 0.35 ? 3 : 0) - (P.money - pr.amount < 40 ? 3 : 0) - (debtBetween(G, pid, f) ? 9 : 0);
    } else if (pr.kind === 'help') {                                // просят вступить в войну
      const t = pr.target, tr = S[t] / Math.max(1, mine), rel = relOf(G, pid, f);
      score = (rel === 'alliance' ? 1.2 : 0) + fav * 0.4 - 1.6 * tr - (relOf(G, pid, t) === 'alliance' ? 9 : 0) - (lockLeft(G, pid, t) > 0 ? 9 : 0) - (favOf(G, pid, t) > 2 ? 1.5 : 0) + (touch(t) ? 0.6 : -0.6);
    } else {
      const t = pr.target, tr = S[t] / Math.max(1, mine);
      score = (pr.amount - 20 - 25 * tr) / 20 + fav * 0.3 - (relOf(G, pid, t) === 'alliance' ? 9 : 0) - (mine < S[t] * 0.8 ? 2 : 0) - (relOf(G, pid, f) === 'war' ? 5 : 0);
    }
    q.push({ type: 'respond', id: pr.id, accept: score + coalBonus > 0 });
  }

  // выход из союза: основатель воюет с сильным врагом, который нам не по зубам (мы связаны войной), либо
  // мы сильнейший, а идти не на кого, кроме союзников — тогда уходим, чтобы заняться ими
  if (myAl) {
    const bad = others.find(w => allyBound(G, pid, w.id) && touch(w.id) && S[w.id] > 1.4 * mine);
    let stab = false;
    if (!bad && G.round > 30 && !G.opts.allyWin) {
      const prey = others.some(p => !isMember(p.id) && reach(p.id) && teamPower(p.id) < 0.9 * mine);
      const ally = others.filter(p => isMember(p.id) && S[p.id] * 1.5 < mine);
      const onlyAllies = others.every(p => isMember(p.id));          // кроме союзников никого не осталось — победить можно, только выйдя из союза
      if (!prey && ((ally.length && rnd(G) < 0.25) || (onlyAllies && rnd(G) < 0.12))) stab = true;
    }
    if (!bad && !stab && hoardNow && !warList.length && (!G.opts.allyWin || G.round > 40)) {       // копим казну, а воевать не с кем (все вокруг — союзники): выходим из союза и идём покорять
      const preyOut = others.some(p => !isMember(p.id) && relOf(G, pid, p.id) !== 'alliance' && reach(p.id) && mine >= 0.7 * teamPower(p.id));
      if (!preyOut && rnd(G) < 0.5) stab = true;
    }
    if (bad || stab) q.push({ type: 'leave' });
  }

  let sent = 0;
  const mayPropose = (p, kind) => !hasProp(G, pid, p.id, 'treaty') && !onCooldown(G, pid, p.id);
  // 1) коалиция: с остальными — дружба, потом союз; лидеру мира не предлагаем
  if (coal) {
    for (const p of others) {
      if (p.id === coal.id || sent >= 3 || !mayPropose(p)) continue;
      const rel = relOf(G, pid, p.id);
      if (rel === 'war' && canPeace(p.id)) { q.push({ type: 'propose', to: p.id, level: 'peace' }); sent++; }
      else if (rel === 'peace' && G.round - relSince(G, pid, p.id) >= 1 && p.betrayals < 2 && !relUntil(G, pid, p.id) && !(allianceOf(G, p.id) && myAl)) { q.push({ type: 'propose', to: p.id, level: 'alliance' }); sent++; }
    }
  }
  // 2) мир со всеми, кого не собираемся бить: далёким — сразу, соседям — если они не слабее нас
  const neigh = warList.filter(p => touch(p.id)).sort((a, b) => S[a.id] - S[b.id]);
  const prey = neigh[0];
  for (const p of warList) {
    if (sent >= 3) break;
    if (coal && p.id === coal.id && S[p.id] < 2.2 * mine) continue;
    if (!canPeace(p.id)) continue;
    if (prey && p.id === prey.id && teamPower(p.id) < mine * 0.85) continue;          // слабого соседа держим как цель
    if (P.money >= 120 && weakReach(p.id)) continue;                                  // и любого слабого, до кого можем дотянуться флотом
    const need = S[p.id] > mine * 0.7 || warList.length >= 2 || !touch(p.id);
    if (!need || !mayPropose(p)) continue;
    // сильный бот предпочитает короткое перемирие (передышка), слабый — бессрочный мир
    const pt = S[p.id] < mine * 0.8 && rnd(G) < 0.5 ? rint(G, 3, 8) : 0;
    q.push(pt ? { type: 'propose', to: p.id, level: 'peace', turns: pt } : { type: 'propose', to: p.id, level: 'peace' }); sent++;
  }
  // 3) союзы: оборонительный пакт с надёжным другом (общий враг, сильный сосед, лидер на горизонте) — бот создаёт союз или зовёт в свой
  const maxAl = maxAlSize;
  if (sent < 3 && (!myAl || myAl.members.length < maxAl) && rnd(G) < 0.6) {
    const cands = others.filter(p => relOf(G, pid, p.id) === 'peace' && G.round - relSince(G, pid, p.id) >= 2 && p.betrayals === 0 && mayPropose(p)
      && !relUntil(G, pid, p.id) && !(myAl && allianceOf(G, p.id)) && !(allianceOf(G, p.id) && allianceOf(G, p.id).members.some(m => m !== pid && relOf(G, pid, m) === 'war')));
    let best = null;
    for (const p of cands) {
      const common = others.some(o => o.id !== p.id && relOf(G, pid, o.id) === 'war' && relOf(G, p.id, o.id) === 'war');
      const v = (common ? 2 : 0) + (touch(p.id) ? 0.8 : 0) + (leader && leader.id !== p.id && leader.id !== pid ? 1.2 : 0) + Math.min(2, S[p.id] / Math.max(1, mine)) + favOf(G, pid, p.id) * 0.2;
      if (v > 1.6 && (!best || v > best.v)) best = { v, p };
    }
    if (best) { q.push({ type: 'propose', to: best.p.id, level: 'alliance' }); sent++; }
  }

  // 4) деньги: просим у союзника, когда на мели; дарим союзнику в беде; задабриваем сильного соседа; нанимаем кого-то воевать с нашим врагом
  if (P.money < 8 && e.net < 0) {
    const donor = others.filter(p => relOf(G, pid, p.id) === 'alliance' && p.money >= 60 && !hasProp(G, pid, p.id, 'ask') && !onCooldown(G, pid, p.id))[0];
    if (donor) q.push({ type: 'ask', to: donor.id, amount: 20 });
  }
  if (P.money > 150) {
    const poor = others.filter(p => relOf(G, pid, p.id) === 'alliance' && p.money < 5)[0];
    if (poor) q.push({ type: 'gift', to: poor.id, amount: 30 });
    else if (P.money > 260 && rnd(G) < 0.25) {
      const strong = others.filter(p => relOf(G, pid, p.id) === 'peace' && touch(p.id) && S[p.id] > 1.2 * mine && favOf(G, p.id, pid) < 3)[0];
      if (strong) q.push({ type: 'gift', to: strong.id, amount: 25 });
    }
  }
  // торговля: договор с мирным соседом даёт доход обоим
  if (sent < 4 && tradeCount(G, pid) < CFG.diplo.tradeMax && rnd(G) < 0.5) {
    const tp = others.find(p => relOf(G, pid, p.id) !== 'war' && !hasTrade(G, pid, p.id) && tradeCount(G, p.id) < CFG.diplo.tradeMax && !hasProp(G, pid, p.id, 'trade') && !onCooldown(G, pid, p.id) && favOf(G, p.id, pid) > -2);
    if (tp) { q.push({ type: 'trade', to: tp.id }); sent++; }
  }
  // займ: на мели — просим у богатого друга; при избытке денег — предлагаем бедному союзнику
  if (P.money < 12 && e.net <= 2 && !G.dipl.debts.some(d => d.to === pid)) {
    const rich = others.filter(p => relOf(G, pid, p.id) !== 'war' && p.money >= 80 && !debtBetween(G, p.id, pid) && !hasProp(G, pid, p.id, 'borrow') && !onCooldown(G, pid, p.id)).sort((a, b) => b.money - a.money)[0];
    if (rich) q.push({ type: 'borrow', to: rich.id, amount: 25 });
  }
  // выкуп мира: проигрываем соседу — платим за мир
  if (warList.length && P.money >= 40 && sent < 4) {
    const foe = warList.filter(w => touch(w.id) && S[w.id] > 1.25 * mine && canPeace(w.id) && !hasProp(G, pid, w.id, 'treaty') && !onCooldown(G, pid, w.id))[0];
    if (foe && rnd(G) < 0.5) { q.push({ type: 'propose', to: foe.id, level: 'peace', pay: Math.min(60, Math.floor(P.money * 0.4)) }); sent++; }
  }
  // просьба о помощи: у нас война с сильным врагом, а друзья с ним в мире
  if (warList.length && rnd(G) < 0.4) {
    const target = warList.slice().sort((a, b) => S[b.id] - S[a.id])[0];
    if (S[target.id] > 0.8 * mine) {
      const hp = others.filter(p => p.id !== target.id && relOf(G, pid, p.id) !== 'war' && relOf(G, p.id, target.id) === 'peace' && lockLeft(G, p.id, target.id) === 0 && !hasProp(G, pid, p.id, 'help') && !onCooldown(G, pid, p.id)).sort((a, b) => favOf(G, b.id, pid) - favOf(G, a.id, pid))[0];
      if (hp && (relOf(G, pid, hp.id) === 'alliance' || favOf(G, hp.id, pid) > 1)) q.push({ type: 'help', to: hp.id, target: target.id });
    }
  }
  if (warList.length && P.money >= 60 && rnd(G) < 0.35) {
    const target = warList.slice().sort((a, b) => S[b.id] - S[a.id])[0];
    const cand = others.filter(p => p.id !== target.id && relOf(G, pid, p.id) !== 'war' && relOf(G, p.id, target.id) === 'peace' && !hasProp(G, pid, p.id, 'hire') && !onCooldown(G, pid, p.id) && lockLeft(G, p.id, target.id) === 0)
      .sort((a, b) => S[b.id] - S[a.id])[0];
    if (cand) q.push({ type: 'hire', to: cand.id, target: target.id, amount: Math.min(40, Math.floor(P.money * 0.4)) });
  }

  // 5) объявление войны. Бот стремится захватить всё: выбирает слабейшего достижимого противника, когда перевес есть
  //    (мощь = клетки, фермы, войска, деньги в казне). Союзники жертвы вступят в войну — учитываем их 60% мощи.
  const activeWars = warList.filter(w => touch(w.id) || reach(w.id));
  const threatened = warList.some(w => touch(w.id) && S[w.id] > 0.9 * mine);
  const maxWars = 1 + (mine > 1.6 * avg || hoardNow ? 1 : 0);
  if (!threatened && activeWars.length < maxWars) {
    const neutralNear = [...G.tiles.values()].filter(t => t.owner < 0 && !t.tree && nbrs(G, t).some(n => n.owner === pid)).length;
    // «зуд» войны: чем больше накопленной казны, тем смелее бот — деньги превращаются в армию в день объявления войны
    const itch = Math.min(4, P.money / Math.max(40, 5 * Math.max(10, e.net)));
    const need = Math.max(0.5, (G.round > 70 ? 1.0 : G.round > 35 ? 1.15 : 1.4) - 0.22 * itch);
    const teamMine = mine + 0.5 * (myAl ? myAl.members.filter(m => m !== pid && G.players[m].alive).reduce((s, m) => s + S[m], 0) : 0);
    const cands = others.filter(p => relOf(G, pid, p.id) === 'peace' && lockLeft(G, pid, p.id) === 0 && reach(p.id) && teamMine >= need * teamPower(p.id))
      .sort((a, b) => teamPower(a.id) - teamPower(b.id));
    const pick = cands.find(p => (touch(p.id) || P.money >= 90) && !(neutralNear > 6 && G.round < 25));
    if (pick && rnd(G) < (hoardNow ? 0.9 : G.round > 40 ? 0.55 : 0.3)) q.push({ type: 'war', to: pick.id });
    else if (myAl && !pick) {                                    // помощь союзнику: он воюет с X, а мы с X в мире — присоединяемся (по желанию)
      const helpFor = others.find(p => relOf(G, pid, p.id) === 'peace' && lockLeft(G, pid, p.id) === 0 && !isMember(p.id) && reach(p.id)
        && myAl.members.some(m => m !== pid && relOf(G, m, p.id) === 'war') && teamMine >= 0.8 * teamPower(p.id));
      if (helpFor && rnd(G) < 0.5) q.push({ type: 'war', to: helpFor.id });
    }
  }
  return q;
}

// ---------- флот: бот перевозит солдат, когда на своём острове места не осталось ----------
function ownShips(G, pid) { const out = []; for (const s of G.sea.values()) if (s.ship && s.ship.owner === pid) out.push(s); return out; }
function hasLandFront(G, c) {
  // фронт считается только на основной территории: в отрезанных кусках своя (часто пустая) казна, нанять там войско на деньги страны нельзя — а значит, нужен флот
  if (c.landFront === undefined) c.landFront = c.mine.some(t => !t.f && nbrs(G, t).some(n => n.owner < 0 || c.war.has(n.owner)));
  return c.landFront;
}
function landingTargets(G, c) {
  if (!c.landing) {
    c.landing = [];
    homeDist(G, c, null);                                           // строим карту «нашего» моря: берег чужого озера, куда корабль не доплывёт, целью не считается
    for (const t of G.tiles.values()) if ((t.owner < 0 || c.war.has(t.owner)) && !t.tree && seaNbrs(G, t).some(x => c.homeD.has(x))) c.landing.push(t);
  }
  return c.landing;
}
function neededType(G, c, rich) {
  const defs = landingTargets(G, c).map(t => t.owner < 0 ? 0 : tileDef(G, t)).sort((a, b) => a - b);
  if (!defs.length) return 1;
  const k = Math.min(4, Math.max(1, defs[Math.floor((defs.length - 1) * 0.35)] + 1));      // берём такого солдата, который пробьёт защиту хотя бы трети берега (а не одной случайной клетки)
  return rich ? Math.max(k, 3) : k;            // богатый бот возит сразу Барона/Рыцаря: слабого десанта под башнями хватает ненадолго
}
function seaBfs(G, sources) {
  const d = new Map(), q = [];
  for (const s of sources) if (!d.has(s)) { d.set(s, 0); q.push(s); }
  for (let i = 0; i < q.length; i++) for (const n of seaNbrs(G, q[i])) if (!d.has(n)) { d.set(n, d.get(q[i]) + 1); q.push(n); }
  return d;
}
// расстояние по воде до ближайшего места высадки, где солдат с атакой atk действительно сможет захватить клетку
function nearestLanding(G, c, st, atk) {
  atk = atk || 1;
  if (!c.landDk) c.landDk = {};
  if (!c.landDk[atk]) { const src = []; for (const t of landingTargets(G, c)) if (CFG.units[atk] ? CFG.units[atk].atk > tileDef(G, t) : true) for (const s of seaNbrs(G, t)) if (!s.ship) src.push(s); c.landDk[atk] = seaBfs(G, src); }     // занятые кораблями клетки у берега не считаем — туда не встать
  const v = c.landDk[atk].get(st); return v === undefined ? 99 : v;
}
function homeDist(G, c, st) {
  if (!c.homeD) { const src = []; for (const t of c.mine) for (const s of seaNbrs(G, t)) src.push(s); c.homeD = seaBfs(G, src); }
  const v = c.homeD.get(st); return v === undefined ? 99 : v;
}

// свои клетки не дальше 3 шагов по своей земле от свободной клетки: оттуда нанятый солдат дойдёт до корабля
function hireZone(G, c) {
  if (c.hz) return c.hz;
  const z = new Set(), dist = new Map(), q = [];
  for (const t of c.mine) if (!t.unit && !t.building && !t.tree && !t.f) { dist.set(t, 0); q.push(t); z.add(t); }
  for (let i = 0; i < q.length; i++) {
    const t = q[i], d = dist.get(t); if (d >= 3) continue;
    for (const n of nbrs(G, t)) if (n.owner === t.owner && !dist.has(n)) { dist.set(n, d + 1); z.add(n); q.push(n); }
  }
  return (c.hz = z);
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
    return v > 0.2 ? v : -nearestLanding(G, c, st, type) * 0.1 - 0.5;
  };
  for (const s of ships) {
    const sh = s.ship; if (!sh.cargo || sh.moved) continue;
    let best = null; const here = seaScore(s, sh.cargo.type);
    for (const [st] of getShipMoves(G, s)) { const v = seaScore(st, sh.cargo.type); if (!best || v > best.v) best = { v, st }; }
    if (best && best.v > here + 1e-9) return mv(s, best.st);
  }
  // 2a) застрявший слабый десант: распускаем корабль, чтобы снарядить сильнее
  for (const s of ships) {                                          // десант, который не пробьёт защиту ни одной цели, — корабль списываем (лишнее содержание)
    const sh = s.ship;
    if (sh.cargo && land.every(t => CFG.units[sh.cargo.type].atk <= tileDef(G, t)) && applyDisbandOk(G, pid, s)) return applyAction(G, pid, { type: 'disband', tile: key(s.q, s.r) });
  }
  // 2b) пустой корабль возвращается к своему берегу — к такому месту, где рядом со свободными клетками (там можно нанять и посадить солдата)
  const homeD = st => homeDist(G, c, st);
  const zone = hireZone(G, c), spot = st => nbrs(G, st).some(n => zone.has(n)) ? 0 : 1;
  const needNow = neededType(G, c, P.money > 400);
  for (const s of ships) {
    if (s.ship.cargo || s.ship.moved) continue;
    if (c.mine.some(t => t.unit && !t.unit.moved && t.unit.type >= needNow && t.unit.type < 5 && getMoves(G, t).get(s) === 'board')) continue;       // солдат уже готов к посадке
    const score = st => spot(st) * 100 + homeD(st) * 10 + nearestLanding(G, c, st, 3) * 0.1;
    const here = score(s);
    let best = null;
    for (const [st] of getShipMoves(G, s)) { const v = score(st); if (!best || v < best.v) best = { v, st }; }
    if (best && best.v < here - 1e-9) return mv(s, best.st);
  }
  // 3) садим подходящего солдата на пустой корабль
  const need = neededType(G, c, P.money > 400);
  if (land.length && ships.some(s => !s.ship.cargo) && !c.mine.some(t => !t.f && t.unit && t.unit.type >= need && t.unit.type < 5)) {         // сильных солдат нет — сливаем двух слабых в одного сильного
    for (const t of c.mine) {
      if (!t.unit || t.unit.moved || t.unit.type >= need || t.unit.type >= 4) continue;
      const a = t.unit.type, delta = CFG.units[a + 1].upkeep - 2 * CFG.units[a].upkeep;
      if (c.e.net - delta < 4 && P.money < 600) continue;
      for (const [n, kind] of getMoves(G, t)) if (kind === 'merge') return mv(t, n);
    }
  }
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
  const maxShips = 1 + (e.tiles >= 45 ? 1 : 0) + (P.money > 250 + 8 * Math.max(0, e.net) ? 1 : 0) + (P.money > 900 ? 1 : 0) + (P.money > 900 ? Math.min(4, Math.floor((P.money - 900) / 500)) : 0);   // богатый бот строит флот побольше: деньги должны превращаться в десанты
  if (ships.length < maxShips && affordable(G, P, e, CFG.ship.cost, CFG.ship.upkeep)) {
    let best = null;
    for (const t of c.mine) for (const s of seaNbrs(G, t)) {
      if (s.ship) continue;
      const v = nearestLanding(G, c, s, neededType(G, c, P.money > 400)) + rnd(G) * 0.3;
      if (!best || v < best.v) best = { v, t, s };
    }
    if (best) return applyAction(G, pid, { type: 'ship', tile: key(best.t.q, best.t.r), sea: key(best.s.q, best.s.r) });
  }
  // 4b) сильный солдат есть, но стоит далеко от корабля — ведём его к берегу
  if (P.money > 150) for (const s of ships) {
    if (s.ship.cargo) continue;
    if (c.mine.some(t => t.unit && t.unit.type >= need && t.unit.type < 5 && getMoves(G, t).get(s) === 'board')) continue;
    let best = null;
    for (const t of c.mine) {
      if (!t.unit || t.unit.moved || t.unit.fresh || t.unit.type < need) continue;
      const d0 = hexDist(t, s);
      for (const [n, kind] of getMoves(G, t)) if (kind === 'move') { const d = hexDist(n, s); if (d < d0 && (!best || d < best.d)) best = { d, t, n }; }
    }
    if (best) return mv(best.t, best.n);
  }
  // 5) нанимаем солдата рядом с пустым кораблём (если рядом нет свободных клеток — на ближайшей свободной, дальше он дойдёт пешком)
  for (const s of ships) {
    if (s.ship.cargo) continue;
    if (c.mine.some(t => t.unit && t.unit.type >= need && t.unit.type < 5 && getMoves(G, t).get(s) === 'board')) continue;   // подходящий солдат для этого корабля уже есть (слабый не считается — нужен тот, кто пробьёт защиту)
    const U = CFG.units[need];
    if (!affordable(G, P, e, U.cost, U.upkeep)) continue;
    let bt = null, bd = 99, direct = false;
    for (const t of c.mine) {
      if (t.unit || t.building || t.tree || t.f) continue;
      const board = getMoves(G, t, { id: 0, type: need, owner: pid, moved: false }).get(s) === 'board';
      const d = hexDist(t, s) + (board ? 0 : 30);
      if (d < bd) { bd = d; bt = t; direct = board; }
    }
    if (!bt) continue;
    if (!direct && c.mine.some(t => !t.f && t.unit && t.unit.type >= need && t.unit.type < 5)) continue;   // нужный солдат уже идёт к берегу
    return applyAction(G, pid, { type: 'buy', tile: key(bt.q, bt.r), unit: need });
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
  for (const step of [aiDisband, aiFire, aiCapture, aiNaval, aiDefend, aiFarm, aiUpgrade, aiTrim, aiFortify, aiCannon, aiBuy, aiClear, aiPosition, aiMerge]) {
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
return { CFG, SHAPES, resLife, relUntil, termLeft, lockLeft, DIRS, key, hexDist, nbrs, seaNbrs, tileAt, newGame, serialize, deserialize, tileDef, econ, fundsAt, fragCount, fragsOf, farmCost, farmSpotOk, buildCost, cannonCount, outpostTargets, getFireTargets, isFarm, getMoves, getShipMoves, getUnloadMoves,
  applyAction, aiStep, relOf, relSince, favOf, strength, allyGroup, RANK, botName, humanName, COLOR_ADJ, components,
  allianceOf, switchPlan, disbandLeft, warLockLeft, allyBound, aidVictim, peaceBlock, joinPlan, tradePartners, hasTrade, tradeCount, debtBetween };

})()
module.exports = HexCore;
