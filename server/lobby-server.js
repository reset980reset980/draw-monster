// 그려라! 몬스터 — 교실 로비 서버 (미니PC, monster.xsw.kr)
// 역할: 사이트별 방 목록(로비) · 방 만들기/입장 · 접속자 표시 · 동시 그리기 시작/마감 · 몬스터 코드 모으기 · 경기 알림 전달
// 경기 계산은 하지 않음(같은 몬스터끼리는 결과가 항상 같아서, 선생님 화면이 계산함). 주고받는 건 짧은 글자뿐.
//
// 환경 변수
//   PORT             기본 8793
//   ALLOWED_ORIGINS  허용할 사이트 주소(쉼표로 구분). 비우면 모두 허용
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8793);
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_ROOMS = 60, MAX_PLAYERS = 40, MAX_MSG = 4096, HOST_GRACE = 120e3, PLAYER_GRACE = 60e3;
const SITES = new Set(['base', 'kids']);

const clean = (t, n) => String(t == null ? '' : t).replace(/[<>&"'\\\u0000-\u001f]/g, '').trim().slice(0, n);
const CODE_RE = /^[A-Za-z0-9_-]{8,600}$/;
const rid = () => crypto.randomBytes(4).toString('hex');
const tok = () => crypto.randomBytes(12).toString('hex');

// rooms: id -> { id, site, name, pin, time, hostName, hostToken, host(ws|null), hostGoneAt, phase: 'wait'|'draw'|'battle', endsAt,
//                players: Map(pid -> { pid, token, name, ws|null, goneAt, code, done }), announce: [], created }
const rooms = new Map();
const lobbies = { base: new Set(), kids: new Set() };   // 로비를 보고 있는 소켓

const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
function lobbyView(site) {
  return [...rooms.values()].filter(r => r.site === site).map(r => ({
    id: r.id, name: r.name, host: r.hostName, count: [...r.players.values()].filter(p => p.ws).length,
    phase: r.phase, locked: !!r.pin, hostOnline: !!r.host,
  })).sort((a, b) => (a.phase === 'wait' ? 0 : 1) - (b.phase === 'wait' ? 0 : 1) || a.name.localeCompare(b.name));
}
function pushLobby(site) { const m = { t: 'lobby', rooms: lobbyView(site) }; for (const ws of lobbies[site]) send(ws, m); }
function roomView(r) {
  return {
    id: r.id, name: r.name, phase: r.phase, time: r.time, endsAt: r.endsAt, hostName: r.hostName, hostOnline: !!r.host, now: Date.now(),
    players: [...r.players.values()].map(p => ({ pid: p.pid, name: p.name, online: !!p.ws, done: !!p.code })),
    announce: r.announce.slice(-6),
  };
}
function pushRoom(r) {
  const v = roomView(r);
  send(r.host, { t: 'room', room: v, you: 'host' });
  for (const p of r.players.values()) send(p.ws, { t: 'room', room: v, you: p.pid });
}
function closeRoom(r, why) {
  const m = { t: 'closed', why };
  send(r.host, m); for (const p of r.players.values()) { send(p.ws, m); if (p.ws) p.ws._room = null; }
  if (r.host) r.host._room = null;
  rooms.delete(r.id); pushLobby(r.site);
}
function leaveLobby(ws) { for (const s of SITES) lobbies[s].delete(ws); }

// 마감: 시간이 끝났거나 선생님이 「지금 마감」
// 마감은 두 단계: ① 'closing' — 학생 화면에 마감 신호(자동 제출할 시간 1.5초) ② 'battle' — 모은 몬스터를 선생님께
function finishDraw(r, fast) {
  if (r.phase !== 'draw') return;
  r.phase = 'closing'; r.endsAt = 0;
  for (const p of r.players.values()) if (!p.code) send(p.ws, { t: 'drawEnd' });
  pushRoom(r);
  setTimeout(() => finalizeDraw(r), fast ? 200 : 1500);
}
function finalizeDraw(r) {
  if (r.phase !== 'closing' || !rooms.has(r.id)) return;
  r.phase = 'battle';
  const entries = [...r.players.values()].filter(p => p.code).map(p => ({ c: p.code, n: p.name }));
  send(r.host, { t: 'entries', entries });
  pushRoom(r); pushLobby(r.site);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/ws/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, maxPayload: MAX_MSG, verifyClient: ({ origin }) => !ALLOWED.length || ALLOWED.includes(origin) });

wss.on('connection', ws => {
  ws._alive = true; ws._room = null; ws._role = null; ws._pid = null; ws._rate = { t: Date.now(), n: 0 };
  ws.on('pong', () => { ws._alive = true; });
  ws.on('message', raw => {
    const now = Date.now();
    if (now - ws._rate.t > 1000) ws._rate = { t: now, n: 0 };
    if (++ws._rate.n > 30) return;   // 1초에 30개 넘으면 무시
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const r = ws._room ? rooms.get(ws._room) : null;
    switch (m.t) {
      case 'lobby': {   // 로비 구독
        if (!SITES.has(m.site)) return;
        leaveLobby(ws); lobbies[m.site].add(ws); ws._site = m.site;
        send(ws, { t: 'lobby', rooms: lobbyView(m.site) }); break;
      }
      case 'create': {
        if (!SITES.has(m.site)) return;
        if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', msg: '방이 너무 많아. 잠시 뒤에 다시 해 줘' });
        const name = clean(m.name, 20) || '우리 반 대결';
        const pin = /^\d{4}$/.test(String(m.pin || '')) ? String(m.pin) : '';
        const time = Math.max(0, Math.min(600, Number(m.time) || 0));
        let id; do { id = rid(); } while (rooms.has(id));
        const room = { id, site: m.site, name, pin, time, hostName: clean(m.hostName, 10) || '선생님', hostToken: tok(), host: ws, hostGoneAt: 0, phase: 'wait', endsAt: 0, players: new Map(), announce: [], created: now };
        rooms.set(id, room); leaveLobby(ws); ws._room = id; ws._role = 'host';
        send(ws, { t: 'created', id, token: room.hostToken });
        pushRoom(room); pushLobby(m.site); break;
      }
      case 'rehost': {   // 선생님 새로고침 뒤 다시 연결
        const room = rooms.get(m.id);
        if (!room || room.hostToken !== m.token) return send(ws, { t: 'closed', why: '방이 없어졌어' });
        if (room.host && room.host !== ws) { room.host._room = null; send(room.host, { t: 'closed', why: '다른 화면에서 방을 열었어' }); }
        room.host = ws; room.hostGoneAt = 0; leaveLobby(ws); ws._room = room.id; ws._role = 'host';
        send(ws, { t: 'created', id: room.id, token: room.hostToken });
        if (room.phase === 'battle') send(ws, { t: 'entries', entries: [...room.players.values()].filter(p => p.code).map(p => ({ c: p.code, n: p.name })), resume: true });
        pushRoom(room); pushLobby(room.site); break;
      }
      case 'join': {
        const room = rooms.get(m.id);
        if (!room) return send(ws, { t: 'error', msg: '방이 없어졌어' });
        // 다시 연결(새로고침)
        if (m.token) {
          const p = [...room.players.values()].find(q => q.token === m.token);
          if (p) {
            if (p.ws && p.ws !== ws) { p.ws._room = null; send(p.ws, { t: 'closed', why: '다른 화면에서 들어왔어' }); }
            p.ws = ws; p.goneAt = 0; leaveLobby(ws); ws._room = room.id; ws._role = 'player'; ws._pid = p.pid;
            send(ws, { t: 'joined', id: room.id, pid: p.pid, token: p.token, name: p.name, done: !!p.code });
            pushRoom(room); pushLobby(room.site); return;
          }
        }
        if (room.pin && String(m.pin || '') !== room.pin) return send(ws, { t: 'error', msg: '비밀번호가 달라', pin: true });
        if (room.phase !== 'wait') return send(ws, { t: 'error', msg: '이미 시작한 방이야' });
        if (room.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: '방이 꽉 찼어' });
        let name = clean(m.name, 8) || '친구'; const base = name.slice(0, 6); let k = 2;
        while ([...room.players.values()].some(p => p.name === name)) name = base + k++;
        const pid = rid(), p = { pid, token: tok(), name, ws, goneAt: 0, code: '' };
        room.players.set(pid, p); leaveLobby(ws); ws._room = room.id; ws._role = 'player'; ws._pid = pid;
        send(ws, { t: 'joined', id: room.id, pid, token: p.token, name, done: false });
        pushRoom(room); pushLobby(room.site); break;
      }
      case 'leave': {
        if (!r) return;
        if (ws._role === 'host') closeRoom(r, '선생님이 방을 닫았어');
        else { r.players.delete(ws._pid); ws._room = null; pushRoom(r); pushLobby(r.site); }
        break;
      }
      // ---- 선생님만 ----
      case 'start': {
        if (!r || ws._role !== 'host' || r.phase === 'draw' || r.phase === 'closing') return;
        const time = m.time != null ? Math.max(0, Math.min(600, Number(m.time) || 0)) : r.time;
        r.time = time; r.phase = 'draw'; r.endsAt = time ? now + time * 1000 : 0; r.announce = [];
        for (const p of r.players.values()) p.code = '';
        for (const p of r.players.values()) send(p.ws, { t: 'drawStart', endsAt: r.endsAt, time, now });
        pushRoom(r); pushLobby(r.site); break;
      }
      case 'finish': { if (r && ws._role === 'host') finishDraw(r); break; }
      case 'reopen': {   // 다시 대기실로 (새 대결 준비, 새 친구 입장 가능)
        if (!r || ws._role !== 'host') return;
        r.phase = 'wait'; r.endsAt = 0; for (const p of r.players.values()) p.code = '';
        for (const p of r.players.values()) send(p.ws, { t: 'waitAgain' });
        pushRoom(r); pushLobby(r.site); break;
      }
      case 'kick': {
        if (!r || ws._role !== 'host') return;
        const p = r.players.get(m.pid); if (!p) return;
        send(p.ws, { t: 'closed', why: '선생님이 방에서 내보냈어' }); if (p.ws) p.ws._room = null;
        r.players.delete(m.pid); pushRoom(r); pushLobby(r.site); break;
      }
      case 'announce': {
        if (!r || ws._role !== 'host') return;
        const text = clean(m.text, 80); if (!text) return;
        r.announce.push({ text, at: now }); if (r.announce.length > 30) r.announce.shift();
        for (const p of r.players.values()) send(p.ws, { t: 'announce', text });
        break;
      }
      case 'close': { if (r && ws._role === 'host') closeRoom(r, '선생님이 방을 닫았어'); break; }
      // ---- 학생 ----
      case 'submit': {
        if (!r || ws._role !== 'player' || (r.phase !== 'draw' && r.phase !== 'closing')) return;
        const p = r.players.get(ws._pid); if (!p) return;
        if (!CODE_RE.test(String(m.code || ''))) return send(ws, { t: 'error', msg: '몬스터를 보낼 수 없어' });
        p.code = String(m.code); send(ws, { t: 'submitted' });
        pushRoom(r);
        if (r.phase === 'draw' && [...r.players.values()].every(q => q.code || !q.ws)) finishDraw(r, true);   // 모두 냈으면 바로 마감
        break;
      }
      case 'ping': send(ws, { t: 'pong', now }); break;
    }
  });
  ws.on('close', () => {
    leaveLobby(ws);
    const r = ws._room ? rooms.get(ws._room) : null; if (!r) return;
    if (ws._role === 'host' && r.host === ws) { r.host = null; r.hostGoneAt = Date.now(); }
    if (ws._role === 'player') { const p = r.players.get(ws._pid); if (p && p.ws === ws) { p.ws = null; p.goneAt = Date.now(); } }
    pushRoom(r); pushLobby(r.site);
  });
});

// 정리: 끊긴 연결 · 시간 끝난 그리기 · 오래 비운 방
setInterval(() => {
  for (const ws of wss.clients) { if (!ws._alive) { ws.terminate(); continue; } ws._alive = false; try { ws.ping(); } catch (e) {} }
}, 20e3);
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.phase === 'draw' && r.endsAt && now >= r.endsAt + 300) finishDraw(r);   // 시간 끝 → 마감(늦은 제출 1.5초 더 받음)
    if (!r.host && r.hostGoneAt && now - r.hostGoneAt > HOST_GRACE) { closeRoom(r, '선생님이 나가서 방이 닫혔어'); continue; }
    let changed = false;
    for (const [pid, p] of r.players) if (!p.ws && p.goneAt && now - p.goneAt > PLAYER_GRACE && r.phase === 'wait') { r.players.delete(pid); changed = true; }
    if (changed) { pushRoom(r); pushLobby(r.site); }
    if (now - r.created > 6 * 3600e3) closeRoom(r, '방이 오래되어 닫혔어');
  }
}, 1000);

server.listen(PORT, '127.0.0.1', () => console.log(new Date().toISOString(), 'monster lobby on', PORT, 'origins', ALLOWED.join(' ') || '*'));
