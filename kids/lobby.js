// 🌐 교실 대결 로비 — 미니PC 서버(monster.xsw.kr)에 연결해서 각자 기기로 동시에 그리고 학급 토너먼트
//  선생님(전자칠판): 방 만들기 → 입장한 아이들 확인 → 「그리기 시작」 → 제출 현황 → 대진표·경기 (결과가 아이들 화면에 알림)
//  학생(태블릿·폰): 로비에서 방 고르기 → 이름 → 기다리기 → 그리기(타이머) → 보내기 → 칠판 보기
// 기본판·몬스터 놀이터 공용 파일 (사이트마다 방 목록이 따로)
'use strict';
const LOBBY_SITE = typeof THEMES !== 'undefined' ? 'kids' : 'base';
const LOBBY_URL = (() => {
  const q = new URLSearchParams(location.search).get('lobby');
  return q && /^wss?:\/\//.test(q) ? q : 'wss://monster.xsw.kr/ws';
})();
const LTIMES = [30, 45, 60, 90, 120, 180, 0];
const L = {
  ws: null, open: false, retry: 0, view: 'off', rooms: [], room: null, msg: '', err: '',
  host: null,        // { id, token }  — 선생님
  me: null,          // { id, token, pid, name } — 학생
  offset: 0, joinFor: null, focusRoom: new URLSearchParams(location.search).get('room'),
  entries: null, submitted: false, announce: [], timer: 0,
};
try { L.host = JSON.parse(sessionStorage.getItem('lobby.host') || 'null'); L.me = JSON.parse(sessionStorage.getItem('lobby.me') || 'null'); } catch (e) {}
const lsave = () => { try { sessionStorage.setItem('lobby.host', JSON.stringify(L.host)); sessionStorage.setItem('lobby.me', JSON.stringify(L.me)); } catch (e) {} };
let onlineDraw = null;

// ---------- 연결 ----------
function lconnect() {
  if (L.ws && (L.ws.readyState === 0 || L.ws.readyState === 1)) return;
  let ws; try { ws = new WebSocket(LOBBY_URL); } catch (e) { L.err = '서버 주소가 잘못됐어'; lrender(); return; }
  L.ws = ws;
  ws.onopen = () => {
    L.open = true; L.retry = 0; L.err = '';
    if (L.host) lsend({ t: 'rehost', id: L.host.id, token: L.host.token });
    else if (L.me) lsend({ t: 'join', id: L.me.id, token: L.me.token });
    else lsend({ t: 'lobby', site: LOBBY_SITE });
    lrender();
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } lhandle(m); };
  ws.onclose = () => {
    L.open = false; L.ws = null;
    if (L.view === 'off') return;
    L.err = '서버 연결이 끊겼어… 다시 연결하는 중'; lrender();
    const wait = Math.min(8000, 800 * Math.pow(1.6, L.retry++));
    setTimeout(() => { if (L.view !== 'off') lconnect(); }, wait);
  };
  ws.onerror = () => { if (!L.open) L.err = '서버(monster.xsw.kr)에 연결할 수 없어. 학교 인터넷이 막았을 수도 있어'; };
}
function lsend(m) { if (L.ws && L.ws.readyState === 1) L.ws.send(JSON.stringify(m)); }
const lnow = () => Date.now() + L.offset;

function lhandle(m) {
  if (m.now) L.offset = m.now - Date.now();
  switch (m.t) {
    case 'lobby': L.rooms = m.rooms; if (L.view === 'list') lrender(); break;
    case 'created': L.host = { id: m.id, token: m.token }; L.me = null; lsave(); L.view = 'host'; lrender(); break;
    case 'joined': L.me = { id: m.id, token: m.token, pid: m.pid, name: m.name }; L.host = null; lsave(); L.submitted = m.done; if (L.view !== 'draw') L.view = 'wait'; lrender(); break;
    case 'room': L.room = m.room; if (m.room.now) L.offset = m.room.now - Date.now(); if (L.view === 'host' || L.view === 'wait' || L.view === 'done') lrender(); if (onlineDraw) onlineTimer(); break;
    case 'error':
      L.err = m.msg; if (m.pin && L.joinFor) L.joinFor.pinWrong = true;
      if (L.me && !L.room) { L.me = null; lsave(); L.view = 'list'; lsend({ t: 'lobby', site: LOBBY_SITE }); }
      SFX.play('erase'); lrender(); break;
    case 'closed':
      if (onlineDraw) onlineEndDraw(false);
      L.host = null; L.me = null; L.room = null; lsave();
      L.msg = m.why || '방이 닫혔어'; L.view = 'list'; showLobby(); lsend({ t: 'lobby', site: LOBBY_SITE }); break;
    case 'drawStart': onlineStartDraw(m.endsAt); break;
    case 'submitted': L.submitted = true; L.sending = false; if (L.view === 'done') lrender(); break;
    case 'drawEnd': if (onlineDraw) onlineAutoSubmit(true); break;
    case 'waitAgain': L.submitted = false; L.announce = []; if (onlineDraw) onlineEndDraw(false); L.view = 'wait'; showLobby(); break;
    case 'announce': L.announce.push(m.text); if (L.announce.length > 8) L.announce.shift(); SFX.play('pop'); if (L.view === 'done' || L.view === 'wait') lrender(); break;
    case 'entries': L.entries = m.entries; if (L.view === 'host' || m.resume) lrender(); if (!m.resume) SFX.play('done'); break;
  }
}

// ---------- 화면 ----------
function showLobby(view) {
  if (view) L.view = view;
  if (L.view === 'off') L.view = L.host ? 'host' : L.me ? 'wait' : 'list';
  mode = 'lobby'; show('lobbybox'); SFX.music('title');
  lconnect(); lrender();
}
function lleave() {
  if (L.host) lsend({ t: 'close' });
  else if (L.me) lsend({ t: 'leave' });
  L.host = null; L.me = null; L.room = null; lsave();
  L.view = 'off'; if (L.ws) { try { L.ws.close(); } catch (e) {} }
  showTitle();
}
const lel = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const lbtn = (cls, text, fn, dis) => { const b = lel('button', cls); b.textContent = text; b.disabled = !!dis; b.addEventListener('click', e => { e.preventDefault(); fn(); }); return b; };
function lrender() {
  if (mode !== 'lobby') return;
  const body = $('lobbybody'); body.innerHTML = '';
  const st = lel('div', 'lstat ' + (L.open ? 'on' : 'off'), L.open ? '🟢 서버 연결됨' : L.err ? '🔴 ' + esc(L.err) : '🟡 연결하는 중…');
  body.appendChild(st);
  if (L.msg) { body.appendChild(lel('div', 'tmsg', esc(L.msg))); }
  if (L.err && L.open) body.appendChild(lel('div', 'tmsg lerr', esc(L.err)));
  ({ list: lviewList, create: lviewCreate, host: lviewHost, wait: lviewWait, done: lviewDone }[L.view] || lviewList)(body);
}
function roomState(r) { return r.phase === 'wait' ? (r.hostOnline ? '들어갈 수 있어' : '선생님 연결 기다리는 중') : r.phase === 'draw' || r.phase === 'closing' ? '✏️ 그리는 중' : '⚔️ 대결 중'; }
function lviewList(body) {
  $('lobbytitle').textContent = '🏆 학급 토너먼트 로비';
  body.appendChild(lel('div', 'note', '우리 반 방 이름을 누르고, 이름을 쓰면 들어가! (방은 선생님이 만들어)'));
  const list = lel('div', 'lrooms');
  if (!L.rooms.length) list.appendChild(lel('div', 'tempty', L.open ? '지금 열린 방이 없어' : '…'));
  for (const r of L.rooms) {
    const open = L.joinFor && L.joinFor.id === r.id, canJoin = r.phase === 'wait';
    const card = lel('div', 'lroom' + (open ? ' focus' : '') + (canJoin ? ' can' : ' shut'));
    card.appendChild(lel('div', 'lrname', esc(r.name) + (r.locked ? ' 🔒' : '') + ' <span class="lsite ' + (r.site || '') + '">' + (r.site === 'kids' ? '🔨 놀이터' : '🥊 배틀') + '</span>'));
    card.appendChild(lel('div', 'lrinfo', '👩‍🏫 ' + esc(r.host) + ' · 👥 ' + r.count + '명 · ' + roomState(r)));
    if (!open) {
      card.appendChild(lel('div', 'lrtap', canJoin ? '👆 눌러서 들어가기' : '지금은 들어갈 수 없어'));
      if (canJoin) card.addEventListener('click', () => { L.joinFor = { id: r.id, locked: r.locked }; L.err = ''; L.msg = ''; SFX.play('tap'); lrender(); setTimeout(() => { const i = $('ljname'); if (i) i.focus(); }, 50); });
    } else {
      const f = lel('div', 'ljoin');
      const nm = lel('input', 'bname'); nm.id = 'ljname'; nm.maxLength = 8; nm.placeholder = '내 이름'; nm.value = myName || ''; f.appendChild(nm);
      let pin = null;
      if (r.locked) { pin = lel('input', 'bname lpin'); pin.maxLength = 4; pin.inputMode = 'numeric'; pin.placeholder = '비밀번호 4자리'; f.appendChild(pin); }
      const go = () => {
        const n = cleanName(nm.value); if (!n) { nm.focus(); return; }
        myName = n; lsSet('name', n); L.err = '';
        lsend({ t: 'join', id: r.id, name: n, pin: pin ? pin.value : '' });
      };
      nm.addEventListener('keydown', e => { if (e.key === 'Enter') { if (pin) pin.focus(); else go(); } });
      if (pin) pin.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      f.appendChild(lbtn('main', '입장!', go));
      f.appendChild(lbtn('sub', '취소', () => { L.joinFor = null; lrender(); }));
      card.appendChild(f);
    }
    list.appendChild(card);
  }
  body.appendChild(list);
  const row = lel('div', 'rbtns');
  row.appendChild(lbtn('sub', '👩‍🏫 방 만들기 (선생님)', () => { L.view = 'create'; L.msg = ''; L.err = ''; lrender(); }));
  row.appendChild(lbtn('sub', '🏠 처음 화면으로', lleave));
  body.appendChild(row);
}
let lcreateTime = +(lsGet('lobby.time') || 90);
function lviewCreate(body) {
  $('lobbytitle').textContent = '👩‍🏫 방 만들기';
  const f = lel('div', 'lform');
  const row = (label, el) => { const r = lel('label', 'lrow'); r.appendChild(lel('span', '', label)); r.appendChild(el); f.appendChild(r); return el; };
  const nm = row('방 이름', lel('input', 'bname')); nm.maxLength = 20; nm.value = lsGet('lobby.roomName') || '우리 반 몬스터 대결';
  const hn = row('선생님 이름', lel('input', 'bname')); hn.maxLength = 10; hn.value = lsGet('lobby.hostName') || '선생님';
  const pin = row('비밀번호', lel('input', 'bname')); pin.maxLength = 4; pin.inputMode = 'numeric'; pin.placeholder = '숫자 4자리 (비우면 없음)';
  f.appendChild(lel('div', 'bseth', '그리는 시간'));
  const chips = lel('div', 'bchips'); f.appendChild(chips);
  const draw = () => { chips.innerHTML = ''; for (const t of LTIMES) chips.appendChild(lbtn('sub chip' + (t === lcreateTime ? ' on' : ''), t ? t + '초' : '무제한', () => { lcreateTime = t; lsSet('lobby.time', String(t)); draw(); })); };
  draw();
  body.appendChild(f);
  const b = lel('div', 'rbtns');
  b.appendChild(lbtn('main', '방 만들기', () => {
    if (pin.value && !/^\d{4}$/.test(pin.value)) { L.err = '비밀번호는 숫자 4자리'; lrender(); return; }
    lsSet('lobby.roomName', nm.value); lsSet('lobby.hostName', hn.value);
    if (typeof goFull === 'function') goFull();
    lsend({ t: 'create', site: LOBBY_SITE, name: nm.value, hostName: hn.value, pin: pin.value, time: lcreateTime });
  }, !L.open));
  b.appendChild(lbtn('sub', '← 로비로', () => { L.view = 'list'; L.err = ''; lrender(); }));
  body.appendChild(b);
}
function lroomUrl() { return SITE_URL + '?room=' + (L.host ? L.host.id : ''); }
function lviewHost(body) {
  const r = L.room;
  $('lobbytitle').textContent = '👩‍🏫 ' + (r ? r.name : '방');
  if (!r) { body.appendChild(lel('div', 'note', '방 정보를 받는 중…')); return; }
  const wrap = lel('div', 'lhost');
  // 왼쪽: 입장 안내(QR)
  const left = lel('div', 'lhleft');
  left.appendChild(lel('div', 'lhowbox', '<div class="lhstep">① 게임 주소 열기</div><div class="lhurl">' + esc(SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</div>'
    + '<div class="lhstep">② 🏆 학급 토너먼트</div><div class="lhstep">③ <b>' + esc(r.name) + '</b> 누르기</div><div class="lhstep">④ 이름 쓰고 입장!</div>'));
  wrap.appendChild(left);
  // 오른쪽: 명단·진행
  const right = lel('div', 'lhright');
  const on = r.players.filter(p => p.online).length, done = r.players.filter(p => p.done).length;
  const head = lel('div', 'lphead');
  if (r.phase === 'wait') head.innerHTML = '👥 들어온 친구 <b>' + on + '</b>명';
  else if (r.phase === 'closing') head.innerHTML = '⏳ 마감 중… 마지막 몬스터를 받는 중';
  else if (r.phase === 'draw') head.innerHTML = '✏️ 그리는 중 · 보낸 친구 <b>' + done + '</b> / ' + r.players.length + (r.endsAt ? ' · ⏱ <b id="lhtimer">' + Math.max(0, Math.ceil((r.endsAt - lnow()) / 1000)) + '</b>초' : '');
  else head.innerHTML = '⚔️ 대결 · 참가 <b>' + (L.entries ? L.entries.length : done) + '</b>명';
  right.appendChild(head);
  const grid = lel('div', 'lplayers');
  if (!r.players.length) grid.appendChild(lel('div', 'tempty', '아직 아무도 없어'));
  for (const p of r.players) {
    const c = lel('div', 'lp' + (p.online ? '' : ' off') + (p.done ? ' done' : ''));
    c.appendChild(lel('span', '', (p.done ? '✅ ' : p.online ? '🙂 ' : '💤 ') + esc(p.name)));
    if (r.phase === 'wait') c.appendChild(lbtn('lx', '✕', () => lsend({ t: 'kick', pid: p.pid })));
    grid.appendChild(c);
  }
  right.appendChild(grid);
  const btns = lel('div', 'rbtns');
  if (r.phase === 'wait') {
    const chips = lel('div', 'bchips');
    for (const t of LTIMES) chips.appendChild(lbtn('sub chip' + (t === r.time ? ' on' : ''), t ? t + '초' : '무제한', () => { r.time = t; lcreateTime = t; lsSet('lobby.time', String(t)); lrender(); }));
    right.appendChild(chips);
    btns.appendChild(lbtn('main', '▶ 그리기 시작! (' + on + '명)', () => { L.entries = null; lsend({ t: 'start', time: r.time }); SFX.play('round'); }, on < 1));
  } else if (r.phase === 'closing') {
  } else if (r.phase === 'draw') {
    btns.appendChild(lbtn('main', '⏹ 지금 마감하기', () => lsend({ t: 'finish' })));
  } else {
    const n = L.entries ? L.entries.length : 0;
    btns.appendChild(lbtn('main', '🏆 대진표로! (' + n + '명)', lstartTour, n < 1));
    btns.appendChild(lbtn('sub', '🔁 새로 그리기', () => { L.entries = null; lsend({ t: 'reopen' }); }));
  }
  btns.appendChild(lbtn('sub', '방 닫기', () => { lsend({ t: 'close' }); }));
  right.appendChild(btns);
  if (r.phase === 'battle' && L.entries && L.entries.length === 1) right.appendChild(lel('div', 'note', '1마리뿐이라 CPU 몬스터와 겨뤄요'));
  if (r.phase === 'battle' && L.entries && !L.entries.length) right.appendChild(lel('div', 'note', '보낸 몬스터가 없어. 「새로 그리기」로 다시 해 줘'));
  wrap.appendChild(right);
  body.appendChild(wrap);
}
function lviewWait(body) {
  const r = L.room;
  $('lobbytitle').textContent = '🌐 ' + (r ? r.name : '방');
  body.appendChild(lel('div', 'lbig', '🙌 <b>' + esc(L.me ? L.me.name : '') + '</b>, 들어왔어!'));
  body.appendChild(lel('div', 'note', '선생님이 「그리기 시작」을 누르면 그리기 화면이 열려. 조금만 기다려 줘!'));
  if (r) {
    const grid = lel('div', 'lplayers');
    for (const p of r.players) grid.appendChild(lel('div', 'lp' + (p.online ? '' : ' off') + (L.me && p.pid === L.me.pid ? ' mine' : ''), '<span>' + esc(p.name) + '</span>'));
    body.appendChild(grid);
  }
  lannounceBox(body);
  const b = lel('div', 'rbtns'); b.appendChild(lbtn('sub', '방에서 나가기', lleave)); body.appendChild(b);
}
function lviewDone(body) {
  $('lobbytitle').textContent = '🌐 ' + (L.room ? L.room.name : '방');
  body.appendChild(lel('div', 'lbig', L.submitted ? '📮 보냈어! 칠판을 봐 👀' : L.sending ? '📨 보내는 중…' : '⏰ 시간이 끝났어'));
  if ((L.submitted || L.sending) && myRobot) { const c = lel('canvas', 'lmine'); c.width = c.height = 240; body.appendChild(c); drawPreview(c, myRobot, ME.color); }
  else if (!L.submitted && !L.sending) body.appendChild(lel('div', 'note', '이번엔 몬스터를 못 보냈어. 다음 판에 다시 해 보자!'));
  lannounceBox(body);
  const b = lel('div', 'rbtns'); b.appendChild(lbtn('sub', '방에서 나가기', lleave)); body.appendChild(b);
}
function lannounceBox(body) {
  if (!L.announce.length) return;
  const box = lel('div', 'lann'); box.appendChild(lel('div', 'lannh', '📢 칠판 소식'));
  for (const t of L.announce.slice().reverse()) box.appendChild(lel('div', 'lannl', esc(t)));
  body.appendChild(box);
}

// ---------- 학생: 그리기 ----------
function onlineStartDraw(endsAt) {
  L.submitted = false; L.announce = [];
  onlineDraw = { endsAt: endsAt ? endsAt - L.offset : 0 };
  L.view = 'draw';
  loadInto(null);
  showDraw();
  setHint('다 그리면 「보내기!」를 눌러 줘');
  SFX.play('round');
  clearInterval(L.timer); L.timer = setInterval(onlineTimer, 250); onlineTimer();
}
function applyOnlineUi() {
  const t = $('otimer'); if (!t) return;
  t.hidden = !onlineDraw || mode !== 'draw';
  if (!onlineDraw) return;
  $('sidebtn').hidden = true; $('fightfriend').hidden = true; $('send').hidden = true; $('slots').hidden = true; $('back').hidden = true;
  $('fight').classList.remove('ura');
  $('fight').innerHTML = '보내기!<small>선생님께 제출</small>';
}
function onlineTimer() {
  if (!onlineDraw) { clearInterval(L.timer); return; }
  const t = $('otimer'); t.hidden = mode !== 'draw';
  if (!onlineDraw.endsAt) { t.textContent = '⏱ 무제한'; return; }
  const left = Math.max(0, Math.ceil((onlineDraw.endsAt - Date.now()) / 1000));
  t.textContent = '⏱ ' + left; t.classList.toggle('hurry', left <= 10);
  if (left <= 5 && left > 0 && left !== onlineDraw.tick) { onlineDraw.tick = left; SFX.play('tick'); }
  if (left <= 0 && !onlineDraw.sent) onlineAutoSubmit(false);
}
// 시간 끝: 팔·다리가 없으면 기본 팔·다리를 붙여서 보냄 (몸이 없으면 못 보냄)
function onlineAutoSubmit(serverEnded) {
  if (!onlineDraw) return;
  if (!myRobot && strokes.body) {
    const d0 = RB.design(strokes.body, [], []);
    const line = (p, dx, dy) => Array.from({ length: 6 }, (_, i) => [p[0] + dx * i, p[1] + dy * i]);
    if (!strokes.arm) strokes.arm = RB.cleanStroke(line(d0.shoulder, 9, 0), RB.INK.arm);
    if (!strokes.leg) strokes.leg = RB.cleanStroke(line(d0.hip, 0, 11), RB.INK.leg);
    saveRobot();
  }
  if (myRobot && !serverEnded) { lsubmit(); return; }
  if (myRobot && serverEnded && !onlineDraw.sent) { lsubmit(); return; }
  onlineEndDraw(true);
}
function lsubmit() {
  if (!onlineDraw || !myRobot) { setHint('몸·팔·다리를 다 그려 줘'); return; }
  onlineDraw.sent = true;
  lsend({ t: 'submit', code: plainCode(myRobot) });
  L.sending = true; SFX.play('done');
  onlineEndDraw(true);
}
function onlineEndDraw(toDone) {
  onlineDraw = null; clearInterval(L.timer);
  if (L.sending) setTimeout(() => { if (L.sending) { L.sending = false; if (L.view === 'done') lrender(); } }, 4000);
  const t = $('otimer'); if (t) t.hidden = true;
  $('back').hidden = false; updateSideUi();
  if (toDone) { L.view = 'done'; showLobby(); }
}

// ---------- 선생님: 대진표로 ----------
function lstartTour() {
  const list = (L.entries || []).filter(e => RB.decodeDesign(e.c)).slice(0, TOUR_MAX);
  if (list.length === 1) { const c = RB.CPU[Math.floor(Math.random() * RB.CPU.length)]; list.push({ c: RB.encodeDesign(c), n: 'CPU ' + c.name }); }   // 혼자면 CPU와
  tour = { entries: list.map(e => ({ c: e.c, n: e.n })), rounds: null, cur: null, champShown: false, lobby: true };
  makeBracket(); saveTour();
  lsend({ t: 'announce', text: '🏆 대진표가 나왔어! ' + list.length + '명 토너먼트 시작' });
  showTour();
}
// 경기 결과를 아이들 화면에 알림
const _lrecord = record;
record = function (at, st) {
  const x = tour.rounds[at.r][at.m], was = x.w;
  _lrecord(at, st);
  if (!tour.lobby || !L.host || was !== null || x.w === null) return;
  const w = tName(x.w), l = tName(x.w === x.a ? x.b : x.a);
  lsend({ t: 'announce', text: roundName(at.r) + ': ' + w + ' 승리! (vs ' + l + ')' });
  if (champion() !== null) lsend({ t: 'announce', text: '👑 우승: ' + tName(champion()) + '! 축하해!' });
};
const _lrenderTour = renderTour;
renderTour = function (a) {
  _lrenderTour(a);
  if (tour.lobby && L.host) { const b = lbtn('sub', '🌐 로비 방으로', () => showLobby('host')); b.style.marginTop = '8px'; $('tourbody').appendChild(b); }
};

setInterval(() => {
  if (mode !== 'lobby' || L.view !== 'host' || !L.room || L.room.phase !== 'draw' || !L.room.endsAt) return;
  const e = $('lhtimer'); if (e) e.textContent = Math.max(0, Math.ceil((L.room.endsAt - lnow()) / 1000));
}, 500);
onTap($('lobbybtn'), () => { L.msg = ''; showLobby(); });
// QR로 들어온 경우 (?room=방아이디) 바로 로비를 열고 그 방 입장 칸을 펼침
if (L.focusRoom && !L.host) { L.joinFor = { id: L.focusRoom }; setTimeout(() => showLobby(L.me ? 'wait' : 'list'), 0); }
else if (L.host || L.me) setTimeout(() => showLobby(), 0);   // 새로고침해도 방으로 돌아옴
