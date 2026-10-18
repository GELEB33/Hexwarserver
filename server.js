// Сервер сетевой игры «Гексвар»: комнаты по WebSocket. Запуск: npm install && npm start (порт из PORT, по умолчанию 8080).
const http = require('http'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const H = require('./hexcore.js');

const MAX_SLOTS = 10;
const rooms = new Map(), byToken = new Map();     // code -> room, token -> { room, seat }
const DEF_OPTS = () => ({ mode: 'classic', map: 'islands', size: 'medium', shape: 'random', diplomacy: false, winMode: 'last', allyWin: false, connectivity: false });

const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end('hexwar server ok · комнат: ' + rooms.size); });
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const code4 = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join(''); } while (rooms.has(c)); return c; };
const clean = (s, d) => String(s || d).replace(/[<>]/g, '').trim().slice(0, 16) || d;

function newRoom(hostName) {
  const room = { code: code4(), opts: DEF_OPTS(), slots: [], G: null, started: false, histLen: -1, aiTimer: null, idleTimer: null, last: Date.now(), skipTimer: null };
  room.slots.push({ kind: 'human', name: hostName, token: null, ws: null, connectedAt: Date.now() });
  room.slots.push({ kind: 'open' });
  rooms.set(room.code, room); return room;
}
const connected = (s) => s.kind === 'human' && s.ws && s.ws.readyState === 1;
const lobbyView = (room, seat) => ({ code: room.code, you: seat, opts: room.opts, slots: room.slots.map(s => ({ kind: s.kind, name: s.name || '', connected: s.kind === 'human' ? connected(s) : true })) });

function broadcast(room) {
  room.last = Date.now();
  room.slots.forEach((s, i) => {
    if (!connected(s)) return;
    if (!room.started) return send(s.ws, { t: 'lobby', room: lobbyView(room, i) });
    send(s.ws, stateMsg(room, i, false));
  });
}
function stateMsg(room, seat, full) {
  const st = H.serialize(room.G), hl = st.hist ? st.hist.length : 0;
  if (!full && hl === room.histLen) delete st.hist;            // график обновляем только при смене раунда
  return { t: 'state', st, seat, conn: room.slots.map(s => s.kind === 'human' ? connected(s) : true) };
}
function afterStateChange(room) {
  const hl = room.G.hist.length, changed = hl !== room.histLen; room.histLen = hl;
  room.slots.forEach((s, i) => { if (connected(s)) { const m = stateMsg(room, i, changed); send(s.ws, m); } });
  room.last = Date.now();
  scheduleAI(room); scheduleSkip(room);
}

// ---------- боты на сервере ----------
function scheduleAI(room) {
  clearTimeout(room.aiTimer);
  const G = room.G; if (!room.started || G.over) return;
  const cur = room.slots[G.cur]; if (!cur || cur.kind !== 'bot') return;
  room.aiTimer = setTimeout(() => {
    if (G.over || room.G !== G) return;
    const pid = G.cur, r = H.aiStep(G, pid);
    if (r && r.ok) afterStateChange(room); else { H.applyAction(G, pid, { type: 'end' }); afterStateChange(room); }
  }, 220);
}
// игрок отключился в свой ход — через 60 с ход передаётся дальше, чтобы остальные не ждали вечно
function scheduleSkip(room) {
  clearTimeout(room.skipTimer);
  const G = room.G; if (!room.started || G.over) return;
  const cur = room.slots[G.cur]; if (!cur || cur.kind !== 'human' || connected(cur)) return;
  room.skipTimer = setTimeout(() => { if (room.G !== G || G.over) return; const c = room.slots[G.cur]; if (c && c.kind === 'human' && !connected(c)) { H.applyAction(G, G.cur, { type: 'end' }); afterStateChange(room); } }, 60000);
}

function joinSeat(room, seat, ws) {
  const s = room.slots[seat];
  if (!s.token) s.token = crypto.randomBytes(12).toString('hex');
  s.ws = ws; ws.ctx = { room, seat, token: s.token }; byToken.set(s.token, { room, seat });
  send(ws, { t: 'joined', token: s.token, code: room.code, seat });
}
function dropSeat(room, seat, why) {                       // освободить место человека
  const s = room.slots[seat]; if (!s) return;
  if (s.token) byToken.delete(s.token);
  if (s.ws) { send(s.ws, { t: 'kicked', msg: why || 'Вы покинули мир' }); s.ws.ctx = null; }
}
function closeRoom(room, msg) {
  clearTimeout(room.aiTimer); clearTimeout(room.skipTimer);
  room.slots.forEach((s, i) => { if (s.kind === 'human') dropSeat(room, i, msg); });
  rooms.delete(room.code);
}

const publicRooms = () => [...rooms.values()].filter(r => !r.started && r.slots.some(s => s.kind === 'open')).map(r => ({
  code: r.code, host: r.slots[0].name, filled: r.slots.filter(s => s.kind !== 'open').length, total: r.slots.length, size: r.opts.size, mode: r.opts.mode }));

const OPT_KEYS = { mode: ['classic', 'blitz', 'duel'], map: ['islands', 'continent'], size: ['small', 'medium', 'large'], winMode: ['last', 'domination'] };
function setOpts(room, o) {
  if (!o || typeof o !== 'object') return;
  for (const k of Object.keys(OPT_KEYS)) if (OPT_KEYS[k].includes(o[k])) room.opts[k] = o[k];
  if (o.shape === 'random' || H.SHAPES.includes(o.shape)) room.opts.shape = o.shape;
  for (const k of ['diplomacy', 'allyWin', 'connectivity']) if (typeof o[k] === 'boolean') room.opts[k] = o[k];
  if (room.opts.mode === 'duel') room.opts.diplomacy = false;
}

wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    try { handle(ws, m); } catch (e) { console.error('ошибка обработчика', e); send(ws, { t: 'err', msg: 'Ошибка сервера' }); }
  });
  ws.on('close', () => {
    const c = ws.ctx; if (!c) return;
    const s = c.room.slots[c.seat]; if (s && s.ws === ws) { s.ws = null; broadcast(c.room); scheduleSkip(c.room); }
  });
});

function handle(ws, m) {
  if (m.t === 'list') return send(ws, { t: 'rooms', rooms: publicRooms() });
  if (m.t === 'rejoin') {
    const e = byToken.get(String(m.token));
    if (!e || !rooms.has(e.room.code) || e.room.slots[e.seat].token !== m.token) return send(ws, { t: 'err', code: 'norejoin', msg: 'Мир закрыт' });
    if (e.room.slots[e.seat].ws && e.room.slots[e.seat].ws !== ws) { try { e.room.slots[e.seat].ws.ctx = null; e.room.slots[e.seat].ws.close(); } catch (x) {} }
    joinSeat(e.room, e.seat, ws);
    if (e.room.started) { send(ws, stateMsg(e.room, e.seat, true)); broadcastConn(e.room); } else broadcast(e.room);
    return;
  }
  if (m.t === 'create') {
    if (ws.ctx) leave(ws);
    const room = newRoom(clean(m.name, 'Игрок')); joinSeat(room, 0, ws); broadcast(room); return;
  }
  if (m.t === 'join') {
    if (ws.ctx) leave(ws);
    const room = rooms.get(String(m.code || '').toUpperCase());
    if (!room) return send(ws, { t: 'err', msg: 'Мир с таким кодом не найден' });
    if (room.started) return send(ws, { t: 'err', msg: 'Игра уже началась' });
    const i = room.slots.findIndex(s => s.kind === 'open');
    if (i < 0) return send(ws, { t: 'err', msg: 'В этом мире нет свободных мест' });
    room.slots[i] = { kind: 'human', name: clean(m.name, 'Игрок'), token: null, ws: null };
    joinSeat(room, i, ws); broadcast(room); return;
  }
  const c = ws.ctx; if (!c) return send(ws, { t: 'err', msg: 'Вы не в мире' });
  const room = c.room, seat = c.seat, host = seat === 0;
  switch (m.t) {
    case 'leave': return leave(ws);
    case 'slot': {
      if (!host || room.started) return;
      const i = m.i | 0; if (i < 1 || i >= room.slots.length) return;
      const kind = m.kind; if (!['open', 'bot'].includes(kind)) return;
      if (room.slots[i].kind === 'human') dropSeat(room, i, 'Хозяин освободил ваше место');
      room.slots[i] = { kind }; return broadcast(room);
    }
    case 'resize': {
      if (!host || room.started) return;
      const n = m.n | 0; if (n < 2 || n > MAX_SLOTS) return send(ws, { t: 'err', msg: 'От 2 до ' + MAX_SLOTS + ' мест' });
      if (n < room.slots.length) { if (room.slots.slice(n).some(s => s.kind === 'human')) return send(ws, { t: 'err', msg: 'Сначала освободите лишние места' }); room.slots.length = n; }
      while (room.slots.length < n) room.slots.push({ kind: 'open' });
      if (n !== 2 && room.opts.mode === 'duel') room.opts.mode = 'classic';
      return broadcast(room);
    }
    case 'opts': {
      if (!host || room.started) return;
      setOpts(room, m.opts);
      if (room.opts.mode === 'duel' && room.slots.length !== 2) { if (room.slots.slice(2).some(s => s.kind === 'human')) { room.opts.mode = 'classic'; send(ws, { t: 'err', msg: 'Для дуэли нужно ровно 2 места' }); } else room.slots.length = 2; }
      return broadcast(room);
    }
    case 'start': {
      if (!host || room.started) return;
      if (room.slots.some(s => s.kind === 'open')) return send(ws, { t: 'err', msg: 'Есть пустые места' });
      if (room.opts.mode === 'duel' && room.slots.length !== 2) return send(ws, { t: 'err', msg: 'Дуэль — ровно 2 игрока' });
      const players = room.slots.map((s, i) => s.kind === 'bot' ? { ai: true } : { name: s.name });
      let G; try { G = H.newGame(Object.assign({}, room.opts, { players })); } catch (e) { return send(ws, { t: 'err', msg: 'Не удалось создать карту — измените форму или размер' }); }
      room.G = G; room.started = true; room.histLen = -1;
      return afterStateChange(room);
    }
    case 'act': {
      if (!room.started || !room.G) return;
      const r = H.applyAction(room.G, seat, m.a);
      send(ws, { t: 'res', ok: r.ok, msg: r.msg });
      if (r.ok) afterStateChange(room);
      return;
    }
  }
}
function broadcastConn(room) { room.slots.forEach((s, i) => { if (connected(s)) send(s.ws, stateMsg(room, i, false)); }); }
function leave(ws) {
  const c = ws.ctx; if (!c) return; const { room, seat } = c; ws.ctx = null;
  const s = room.slots[seat]; if (s && s.token) byToken.delete(s.token);
  if (!room.started) {
    if (seat === 0) return closeRoom(room, 'Хозяин закрыл мир');
    room.slots[seat] = { kind: 'open' }; return broadcast(room);
  }
  if (room.G && !room.G.over) { H.applyAction(room.G, seat, { type: 'resign' }); }
  room.slots[seat] = { kind: 'bot' };               // ушедший — «сдался»; место занимает бот-пустышка (игрок уже выбыл)
  if (!room.slots.some(x => x.kind === 'human')) return closeRoom(room);
  afterStateChange(room);
}

setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) {} } }, 25000);
setInterval(() => { for (const r of rooms.values()) if (Date.now() - r.last > 30 * 60 * 1000 && !r.slots.some(connected)) closeRoom(r); }, 60000);
server.listen(process.env.PORT || 8080, () => console.log('hexwar server слушает порт ' + (process.env.PORT || 8080)));
