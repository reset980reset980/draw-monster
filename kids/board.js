// 전자칠판 대결 — 가로 화면을 왼쪽/오른쪽으로 나눠 두 명이 동시에 그리고 대결 (왕 지키기)
// · 선생님이 시작 전에 그리는 시간을 정함 (무제한 가능)
// · 이긴 몬스터는 👑 왕이 되어 자리를 지키고, 진 쪽 칸에 다음 도전자가 그림
// · 시간이 끝났을 때 팔·다리가 없으면 기본 팔·다리를 붙여 줌 (몸이 없으면 그 판은 짐)
// · 칸마다 첫 번째 손가락만 받아서, 두 아이가 동시에 그려도 선이 섞이지 않음
'use strict';
const BCOL = { L: '#1e88e5', R: '#e53935' };
const BLABEL = { L: '왼쪽', R: '오른쪽' };
const BHINT = { body: '몸을 동그랗게 그려!', arm: '노란 ● 어깨에서 팔!', leg: '노란 ● 허리에서 다리!' };
const BTIMES = [30, 45, 60, 90, 120, 180, 0];   // 0 = 무제한
let boardTime = (() => { const v = +(lsGet('board.time') || 60); return v >= 0 && v <= 600 ? v : 60; })();
let boardBest = (() => { try { return JSON.parse(lsGet('board.best') || 'null') || { n: 0, name: '' }; } catch (e) { return { n: 0, name: '' }; } })();
// board = { pads: {L, R}, king: 'L'|'R'|null, streak, round, endAt, lastTick, phase: 'draw'|'go', goAt }
let board = null;

// ---------- 그리기 칸 ----------
class BPad {
  constructor(side) {
    this.side = side; this.color = BCOL[side];
    this.root = $('bp' + side); this.root.innerHTML = '';
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    // ① 이름 단계
    const ns = h('div', 'bnamestage');
    const chip = h('span', 'bside', BLABEL[side] + ' 도전자'); chip.style.background = this.color;
    this.nameEl = h('input', 'bname'); this.nameEl.maxLength = 8; this.nameEl.placeholder = '이름 (안 써도 돼)'; this.nameEl.autocomplete = 'off'; this.nameEl.enterKeyHint = 'go';
    this.nameEl.addEventListener('input', () => { this.name = cleanName(this.nameEl.value); });
    this.nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') { this.nameEl.blur(); this.goDraw(); } });
    const goBtn = h('button', 'main', '그리기 시작 ✏️'); goBtn.addEventListener('click', e => { e.preventDefault(); this.goDraw(); });
    ns.append(chip, h('div', 'bask', '이름을 적고 시작해!'), this.nameEl, goBtn);
    // ② 그리기 단계: [조작 기둥 | 그리기 판] (오른쪽 칸은 거꾸로 → 두 판이 가운데에 모임)
    const ds = h('div', 'bdrawstage');
    const ctrl = h('div', 'bctrl');
    const top = h('div', 'bctop');
    this.sideEl = h('span', 'bside', BLABEL[side]); this.sideEl.style.background = this.color;
    this.nameTx = h('span', 'bnametx'); this.kingEl = h('span', 'bking');
    top.append(this.sideEl, this.nameTx, this.kingEl);
    const tabs = h('div', 'btabs'); this.tabs = {};
    for (const p of ['body', 'arm', 'leg']) {
      const t = h('button', 'tab', PARTS[p]); t.addEventListener('click', e => { e.preventDefault(); this.setPart(p); });
      this.tabs[p] = t; tabs.appendChild(t);
    }
    this.hintEl = h('div', 'bhint');
    this.statsEl = h('div', 'bstats');
    this.clearBtn = h('button', 'sub', '지우기'); this.clearBtn.addEventListener('click', e => { e.preventDefault(); this.clearPart(); });
    this.readyBtn = h('button', 'main', '다 그렸다!'); this.readyBtn.addEventListener('click', e => { e.preventDefault(); this.toggleReady(); });
    this.abdicateBtn = h('button', 'sub', '왕 내려오기'); this.abdicateBtn.addEventListener('click', e => { e.preventDefault(); boardAbdicate(this.side); });
    ctrl.append(top, tabs, this.hintEl, this.statsEl, this.clearBtn, this.readyBtn, this.abdicateBtn);
    this.wrap = h('div', 'bpadwrap');
    this.cv = h('canvas', 'bpad'); this.g = this.cv.getContext('2d');
    this.lockEl = h('div', 'block');
    this.wrap.append(this.cv, this.lockEl);
    ds.append(ctrl, this.wrap);
    this.root.append(ns, ds);
    this.cv.addEventListener('pointerdown', e => this.down(e));
    this.cv.addEventListener('pointermove', e => this.move(e));
    this.cv.addEventListener('pointerup', e => this.up(e));
    this.cv.addEventListener('pointercancel', e => this.up(e));
    this.reset();
  }
  reset() {
    this.strokes = { body: null, arm: null, leg: null }; this.robot = null; this.raw = null; this.pid = null;
    this.part = 'body'; this.ready = false; this.king = false; this.name = ''; this.nameEl.value = '';
    this.stage = 'name';
    this.hint(''); this.update();
  }
  goDraw() {
    if (this.stage === 'draw') return;
    this.stage = 'draw'; this.update(); SFX.play('pop');
    requestAnimationFrame(() => this.layout());
    boardMaybeStartTimer();
  }
  hint(t) { this.hintEl.textContent = t || BHINT[this.part]; }
  setPart(p) { if (this.king || this.ready) return; this.part = p; this.hint(''); this.update(); }
  clearPart() { if (this.king || this.ready) return; this.strokes[this.part] = null; this.rebuild(); SFX.play('erase'); this.update(); }
  rebuild() {
    const s = this.strokes; this.robot = null;
    if (s.body && s.arm && s.leg) { const d = RB.design(s.body, s.arm, s.leg); if (RB.validDesign(d)) this.robot = d; }
  }
  // 캔버스 크기: 칸에 남은 공간에 맞춤 (비율 PW:PH)
  layout() {
    const r = this.wrap.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const w = Math.min(r.width, r.height * PW / PH), hh = w * PH / PW;
    this.cv.style.width = w + 'px'; this.cv.style.height = hh + 'px';
    this.cv.width = Math.round(w * DPR); this.cv.height = Math.round(hh * DPR); this.cw = w;
    this.draw();
  }
  // 오른쪽 칸은 좌우를 뒤집어 보여 주고 입력도 뒤집어 저장 → 가운데를 향해 그린 팔이 대결에서 상대 쪽을 향함
  toWorld(e) { const r = this.cv.getBoundingClientRect(), s = PW / r.width, x = (e.clientX - r.left) * s + RB.PAD.x0; return [this.side === 'R' ? -x : x, (e.clientY - r.top) * s + RB.PAD.y0]; }
  inside(e, m) { const r = this.cv.getBoundingClientRect(); return e.clientX > r.left - m && e.clientX < r.right + m && e.clientY > r.top - m && e.clientY < r.bottom + m; }
  down(e) {
    e.preventDefault();
    if (!board || board.phase !== 'draw') return;
    if (this.king) return;
    if (this.ready) { this.hint('고치려면 「다시 고치기」'); return; }
    if (this.pid !== null) return;   // 이미 그리는 손가락이 있으면 다른 터치(손바닥 등)는 무시
    this.pid = e.pointerId; try { this.cv.setPointerCapture(e.pointerId); } catch (er) {}
    this.raw = [this.toWorld(e)];
  }
  move(e) {
    if (e.pointerId !== this.pid || !this.raw) return;
    e.preventDefault();
    if (!this.inside(e, 40)) { this.up(e); return; }   // 칸 밖으로 멀리 나가면 선을 끝냄 (옆 칸 터치가 섞이지 않게)
    this.raw.push(this.toWorld(e));
  }
  up(e) {
    if (e.pointerId !== this.pid) return;
    this.pid = null;
    const raw = this.raw; this.raw = null; if (!raw) return;
    const part = this.part, pts = RB.cleanStroke(raw, RB.INK[part]);
    if (pts.length < 2 || RB.inkOf(pts) < (part === 'body' ? 80 : 20)) { this.hint('조금 더 크게 그려 줘'); this.update(); return; }
    this.strokes[part] = pts; this.rebuild();
    SFX.play(this.robot ? 'done' : 'pop');
    const s = this.strokes;
    this.part = !s.body ? 'body' : !s.arm ? 'arm' : !s.leg ? 'leg' : part;
    this.hint(this.robot ? '다 됐으면 「다 그렸다!」' : ''); this.update();
  }
  toggleReady() {
    if (!board || board.phase !== 'draw' || this.king) return;
    if (this.ready) { this.ready = false; this.hint(''); this.update(); return; }
    if (!this.robot) { this.hint('몸·팔·다리를 다 그려 줘'); SFX.play('erase'); return; }
    this.ready = true; this.hint('상대를 기다리는 중…'); SFX.play('done'); this.update();
    boardCheckGo();
  }
  // 시간 끝: 팔·다리가 없으면 기본으로 붙임. 몸이 없으면 false
  autoComplete() {
    if (this.robot) return true;
    const s = this.strokes;
    if (!s.body) return false;
    const d0 = RB.design(s.body, [], []);
    const line = (p, dx, dy) => Array.from({ length: 6 }, (_, i) => [p[0] + dx * i, p[1] + dy * i]);
    if (!s.arm) s.arm = RB.cleanStroke(line(d0.shoulder, 9, 0), RB.INK.arm);
    if (!s.leg) s.leg = RB.cleanStroke(line(d0.hip, 0, 11), RB.INK.leg);
    this.rebuild();
    return !!this.robot;
  }
  current() {
    const s = Object.assign({}, this.strokes);
    if (this.raw) s[this.part] = RB.cleanStroke(this.raw, RB.INK[this.part]);
    if (!s.body || s.body.length < 3) return { body: s.body, arm: null, leg: null };
    return RB.design(s.body, s.arm || [], s.leg || []);
  }
  draw() {
    if (!this.cw) return;
    const g = this.g, sc = this.cw / PW;
    g.setTransform(DPR * sc, 0, 0, DPR * sc, -RB.PAD.x0 * DPR * sc, -RB.PAD.y0 * DPR * sc);
    g.fillStyle = '#1f2250'; g.fillRect(RB.PAD.x0, RB.PAD.y0, PW, PH);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let x = -100; x <= 100; x += 20) { g.beginPath(); g.moveTo(x, RB.PAD.y0); g.lineTo(x, RB.PAD.y1); g.stroke(); }
    for (let y = -220; y <= 20; y += 20) { g.beginPath(); g.moveTo(RB.PAD.x0, y); g.lineTo(RB.PAD.x1, y); g.stroke(); }
    const d = this.current();
    if (this.king && this.robot) d.crown = true;
    if (this.side === 'R') g.scale(-1, 1);   // 판은 좌우 대칭(-110~110)
    if (d.body && d.body.length > 1) {
      const full = d.arm !== null;
      drawRobotLocal(g, d, this.color, full ? 1 : 0.9, this.raw && this.part === 'body');
      if (full && !this.king && !this.ready) {
        const blink = 0.55 + 0.45 * Math.sin(performance.now() / 250);
        for (const [k, jp] of [['arm', d.shoulder], ['leg', d.hip]]) {
          g.fillStyle = this.part === k ? 'rgba(255,214,0,' + blink + ')' : 'rgba(255,214,0,.35)';
          g.beginPath(); g.arc(jp[0], jp[1], this.part === k ? 7 : 4, 0, 7); g.fill();
        }
      }
    } else if (this.raw) { g.strokeStyle = this.color; g.lineWidth = 4; pline(g, RB.cleanStroke(this.raw, RB.INK.body)); g.stroke(); }
  }
  update() {
    for (const p in this.tabs) { this.tabs[p].classList.toggle('on', p === this.part && !this.king); this.tabs[p].classList.toggle('done', !!this.strokes[p]); }
    if (this.king) this.stage = 'draw';
    this.root.dataset.stage = this.stage;
    this.root.classList.toggle('isking', this.king); this.root.classList.toggle('isready', this.ready);
    this.nameTx.textContent = this.name;
    this.kingEl.textContent = this.king ? '👑 ' + board.streak + '연승' : '';
    this.lockEl.innerHTML = this.king ? '👑 왕' : this.ready ? '✓ 준비 완료' : '';
    this.lockEl.hidden = !(this.king || this.ready);
    this.clearBtn.hidden = this.king || this.ready; this.readyBtn.hidden = this.king; this.abdicateBtn.hidden = !this.king;
    this.readyBtn.textContent = this.ready ? '다시 고치기' : '다 그렸다!';
    this.readyBtn.disabled = !this.ready && !this.robot;
    const st = this.robot ? RB.robotStats(this.robot) : null;
    const bar = (lbl, v, max) => '<span>' + lbl + '</span><i><b style="width:' + (st ? Math.min(100, v / max * 100) : 0) + '%"></b></i>';
    this.statsEl.innerHTML = bar('튼튼', st && st.hp, 250) + bar('힘', st && st.punch, 22) + bar('리치', st && st.reach, 150) + bar('빠름', st && st.speed, 6);
    this.draw();
  }
  dispName() { return this.name || BLABEL[this.side]; }
}

// ---------- 화면 ----------
function showBoardSetup() {
  mode = 'boardsetup'; show('boardsetup'); SFX.music('title');
  const body = $('bsetbody'); body.innerHTML = '';
  let h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; body.appendChild(e); return e; };
  const colL = document.createElement('div'); colL.className = 'bscol'; const colR = document.createElement('div'); colR.className = 'bscol';
  body.classList.add('bsgrid'); body.append(colL, colR);
  let into = colL;
  const h0 = h; h = (tag, cls, html) => { const e = h0(tag, cls, html); into.appendChild(e); return e; };
  h('div', 'howto', '<p>① <b>왼쪽·오른쪽</b>에서 동시에 몬스터를 그려요</p><p>② 둘 다 「다 그렸다!」를 누르거나 시간이 끝나면 대결!</p><p>③ 이긴 몬스터는 <b>👑 왕</b>이 되어 자리를 지키고, 진 쪽 칸에 <b>다음 도전자</b>가 그려요</p><p>④ 시간 안에 팔·다리를 못 그리면 기본 팔·다리가 붙어요 (몸을 못 그리면 그 판은 져요)</p>');
  into = colR;
  h('h3', 'bseth', '그리는 시간');
  const val = h('div', 'btimeval');
  const chips = h('div', 'bchips');
  const adj = h('div', 'bchips');
  const render = () => {
    val.textContent = boardTime ? boardTime + '초' : '무제한';
    chips.innerHTML = '';
    for (const t of BTIMES) {
      const b = document.createElement('button'); b.className = 'sub chip' + (t === boardTime ? ' on' : ''); b.textContent = t ? t + '초' : '무제한';
      b.addEventListener('click', e => { e.preventDefault(); boardTime = t; lsSet('board.time', String(t)); render(); });
      chips.appendChild(b);
    }
  };
  for (const [lbl, dv] of [['−10초', -10], ['−5초', -5], ['+5초', 5], ['+10초', 10]]) {
    const b = document.createElement('button'); b.className = 'sub chip'; b.textContent = lbl;
    b.addEventListener('click', e => { e.preventDefault(); boardTime = Math.max(10, Math.min(600, (boardTime || 60) + dv)); lsSet('board.time', String(boardTime)); render(); });
    adj.appendChild(b);
  }
  render();
  h('div', 'note bsnote', '학생 수준에 맞게 골라 주세요. ±버튼으로 5초 단위 조절 (10초~10분)');
  const rec = h('div', 'bbest', boardBest.n ? '🏆 최고 기록: ' + esc(boardBest.name) + ' ' + boardBest.n + '연승' : '');
  const go = h('div', 'rbtns');
  const start = document.createElement('button'); start.className = 'main'; start.textContent = '시작!';
  start.addEventListener('click', e => { e.preventDefault(); goFull(); boardStart(); }); go.appendChild(start);
  const etc = h('div', 'rbtns small');
  if (boardBest.n) { const b = document.createElement('button'); b.className = 'sub'; b.textContent = '최고 기록 지우기'; b.addEventListener('click', e => { e.preventDefault(); boardBest = { n: 0, name: '' }; lsSet('board.best', JSON.stringify(boardBest)); rec.textContent = ''; b.remove(); }); etc.appendChild(b); }
  const back = document.createElement('button'); back.className = 'sub'; back.textContent = '처음 화면으로'; back.addEventListener('click', e => { e.preventDefault(); showTitle(); }); go.appendChild(back);
}
function boardStart() {
  board = { pads: { L: new BPad('L'), R: new BPad('R') }, king: null, streak: 0, round: 0, endAt: 0, lastTick: 0, phase: 'draw' };
  boardRound();
}
// 새 판: 왕이 아닌 쪽 칸을 비우고 타이머 시작
function boardRound() {
  board.round++; board.phase = 'draw';
  for (const k of ['L', 'R']) {
    const p = board.pads[k];
    if (board.king === k) { p.king = true; p.ready = true; p.update(); }
    else { p.reset(); }
  }
  board.endAt = 0; board.timerOn = false; board.lastTick = 0;
  showBoard();
  $('bmsg').textContent = board.king ? '👑 ' + board.pads[board.king].dispName() + '에게 도전! 이름을 적고 「그리기 시작」' : '이름을 적고 「그리기 시작」을 눌러 줘';
}
function boardMaybeStartTimer() {
  if (!board || board.timerOn || board.phase !== 'draw') return;
  if (board.pads.L.stage !== 'draw' || board.pads.R.stage !== 'draw') return;
  board.timerOn = true; board.lastTick = 0;
  board.endAt = boardTime ? performance.now() + boardTime * 1000 : 0;
  $('bmsg').textContent = board.king ? '👑 ' + board.pads[board.king].dispName() + '을(를) 이겨라!' : '그려라!';
  SFX.play('round');
}
function showBoard() {
  mode = 'board'; show('board'); SFX.music('title');
  requestAnimationFrame(() => { board.pads.L.layout(); board.pads.R.layout(); });
  boardTimerText();
}
function boardTimerText() {
  const el = $('btimer');
  if (!boardTime) { el.textContent = '⏱ 무제한'; el.className = ''; return; }
  if (!board.endAt) { el.textContent = '⏱ ' + boardTime; el.className = ''; return; }
  const left = Math.max(0, Math.ceil((board.endAt - performance.now()) / 1000));
  el.textContent = '⏱ ' + left; el.className = left <= 10 ? 'hurry' : '';
}
// 매 프레임 (game.js 의 frame 에서 부름)
function boardFrame(now) {
  if (!board) return;
  board.pads.L.draw(); board.pads.R.draw();
  if (board.phase === 'draw' && board.endAt) {
    boardTimerText();
    const left = Math.ceil((board.endAt - now) / 1000);
    if (left <= 5 && left > 0 && left !== board.lastTick) { board.lastTick = left; SFX.play('tick'); }
    if (now >= board.endAt) boardTimeUp();
  }
  if (board.phase === 'go' && now >= board.goAt) startBoardBattle();
}
function boardCheckGo() {
  if (board.pads.L.ready && board.pads.R.ready && board.phase === 'draw') {
    board.phase = 'go'; board.goAt = performance.now() + 700; $('bmsg').textContent = '대결 시작!';
  }
}
function boardTimeUp() {
  board.phase = 'wait'; SFX.play('timeup');
  const ok = {};
  for (const k of ['L', 'R']) { const p = board.pads[k]; if (p.pid !== null) p.up({ pointerId: p.pid }); ok[k] = p.king || p.autoComplete(); if (ok[k]) { p.ready = true; p.update(); } }
  if (ok.L && ok.R) { board.phase = 'go'; board.goAt = performance.now() + 1200; $('bmsg').textContent = '시간 끝! 대결 시작!'; return; }
  if (!ok.L && !ok.R) {   // 둘 다 몸을 못 그림 → 다시
    $('bmsg').textContent = '둘 다 몸을 못 그렸어! 다시 해 보자';
    for (const k of ['L', 'R']) { const p = board.pads[k], n = p.name; p.reset(); p.name = n; p.nameEl.value = n; p.stage = 'draw'; p.update(); p.layout(); }
    board.phase = 'draw'; board.timerOn = false; boardMaybeStartTimer();
    return;
  }
  boardFinish(ok.L ? 'L' : 'R', '상대가 시간 안에 몸을 못 그림', null);
}
function startBoardBattle() {
  board.phase = 'battle';
  const L = board.pads.L, R = board.pads.R;
  isFriend = true;
  pA = { name: L.dispName(), color: L.color };
  opp = { name: R.dispName(), color: R.color, d: R.robot };
  S = RB.create(L.robot, R.robot); S.stage = 0; S.side = 'board'; S.crownA = board.king === 'L'; S.crownB = board.king === 'R';
  S.label = board.king ? '👑 도전 ' + board.round + '판' : '첫 대결';
  acc = 0; last = performance.now(); stop = 0; shake = 0; parts = []; pops = []; hurt = { A: 0, B: 0 }; endAt = 0; cam = null;
  mode = 'battle'; show('none'); beginBattleFx();
}
// 결과: judge (tour.js) 로 무승부도 판정
function boardResult() {
  const j = judge(S), w = j.side === 'A' ? 'L' : 'R';
  boardFinish(w, (S.reason === 'ko' ? TX('ko') + '(' + S.t.toFixed(1) + '초)' : '시간 끝 → ' + j.res) + '\n남은 ' + TX('hp') + '　' + board.pads.L.dispName() + ' ' + Math.ceil(S.A.hp) + '　' + board.pads.R.dispName() + ' ' + Math.ceil(S.B.hp), S);
}
function boardFinish(w, why, st) {
  board.phase = 'result';
  if (!st) S = { side: 'board', forfeit: true };   // 대결 없이 끝난 판 (결과 화면 버튼이 전자칠판으로 돌아오게)
  const wasKing = board.king === w;
  board.streak = wasKing ? board.streak + 1 : 1;
  board.king = w;
  const wp = board.pads[w], name = wp.dispName();
  let rec = false;
  if (board.streak > boardBest.n) { boardBest = { n: board.streak, name }; lsSet('board.best', JSON.stringify(boardBest)); rec = board.streak >= 2; }
  mode = 'result'; show('result');
  $('rtitle').textContent = name + ' 승리!'; $('rtitle').className = 'rtitle win';
  $('rsub').textContent = why + '\n' + (wasKing ? '👑 ' + board.streak + '연승 중!' : board.round === 1 ? '👑 첫 번째 왕 탄생!' : '👑 새로운 왕 탄생!') + (rec ? '\n🏆 최고 기록!' : '') + (boardBest.n ? '\n최고 기록: ' + boardBest.name + ' ' + boardBest.n + '연승' : '');
  $('rprog').innerHTML = '';
  $('next').hidden = false; $('next').innerHTML = '다음 도전자 ▶<small>' + BLABEL[w === 'L' ? 'R' : 'L'] + ' 칸에 새로 그려요</small>'; $('next').classList.remove('ura');
  $('again').hidden = !st; $('again').textContent = '이 경기 다시 보기'; $('again').className = 'sub';
  $('redraw').hidden = true; $('share').hidden = true;
  $('vstitle').hidden = false; $('vstitle').textContent = '시간 설정 · 처음부터';
  SFX.play(rec || board.streak >= 3 ? 'clear' : 'win');
}
function boardAbdicate(k) {
  if (board.king !== k) return;
  board.king = null; board.streak = 0;
  const p = board.pads[k]; p.reset(); board.timerOn = false; board.endAt = 0;
  $('bmsg').textContent = '왕이 내려왔어! ' + BLABEL[k] + ' 칸에도 새로 그려 줘';
  p.update();
}
function boardReplay() {   // 방금 경기 다시 보기 (결정적이라 결과 같음)
  const L = board.pads.L, R = board.pads.R;
  pA = { name: L.dispName(), color: L.color }; opp = { name: R.dispName(), color: R.color, d: R.robot };
  isFriend = true;
  S = RB.create(L.robot, R.robot); S.stage = 0; S.side = 'board'; S.replay = true; S.label = '다시 보기';
  S.crownA = board.king === 'L'; S.crownB = board.king === 'R';
  acc = 0; last = performance.now(); stop = 0; shake = 0; parts = []; pops = []; hurt = { A: 0, B: 0 }; endAt = 0; cam = null;
  mode = 'battle'; show('none'); beginBattleFx();
}
function boardAfterReplay() { mode = 'result'; show('result'); }

// 전체 화면(+안드로이드는 가로 고정). 누른 순간에만 허용되므로 버튼 누를 때 부름
const canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function goFull() {
  const d = document.documentElement;
  if (!canFull || document.fullscreenElement || document.webkitFullscreenElement) return;
  const p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen();
  if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
}
function toggleFull() {
  if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
  else goFull();
}
$('bfull').hidden = !canFull;
onTap($('bfull'), toggleFull);
onTap($('boardbtn'), () => { goFull(); showBoardSetup(); });
onTap($('bquit'), () => { board.phase = 'paused'; showBoardSetup(); });
// 대결 도중 「돌아가기」: 그리던 칸으로 돌아가서 다시 준비
function boardBackFromBattle() {
  for (const k of ['L', 'R']) { const p = board.pads[k]; if (!p.king) { p.ready = false; p.update(); } }
  board.phase = 'draw'; board.timerOn = false; board.endAt = 0; boardMaybeStartTimer();
  showBoard(); $('bmsg').textContent = '다 고쳤으면 다시 「다 그렸다!」를 눌러 줘';
}
window.addEventListener('resize', () => { if (mode === 'board' && board) setTimeout(() => { board.pads.L.layout(); board.pads.R.layout(); }, 60); });
if (/[?&]board(=|&|$)/.test(location.search)) showBoardSetup();   // 즐겨찾기용: 주소 끝에 ?board
