// 몬스터 놀이터: 겨루기 방식(테마) 고르기 + 다른 놀이 두 가지
//  🔍 숨은 몬스터 찾기 — 풀숲·나무·구름 그림 속에 작게 숨은 몬스터를 제한 시간 안에 모두 찾기 (단계가 오를수록 작고 많아짐)
//  🧩 몬스터 퍼즐 — 몬스터 그림을 조각내 섞고, 끌어다 제자리에 맞추기 (3×3 · 4×4 · 5×5)
'use strict';

// ---------- 겨루기 방식 고르기 ----------
function renderThemeChips() {
  const box = $('themechips'); box.innerHTML = '';
  for (const k of ['pong', 'balloon', 'fight']) {
    const b = document.createElement('button');
    b.className = 'sub chip' + (THEME === k ? ' on' : '');
    b.textContent = THEMES[k].icon + ' ' + THEMES[k].label;
    b.addEventListener('click', e => { e.preventDefault(); setTheme(k); renderThemeChips(); drawTitleBg(); });
    box.appendChild(b);
  }
}
renderThemeChips();

// ---------- 공용 ----------
function playCanvas(cv) {   // 캔버스를 화면 크기에 맞춤 (선명하게)
  const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d));
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  return { g, w: r.width, h: r.height };
}
function designBox(d) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const k of ['body', 'arm', 'leg']) for (const p of d[k]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  y1 = Math.max(y1, d.hip ? d.hip[1] + (d.hip[1] - y0) * 0 : y1);
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
// 몬스터를 (x, y) 가운데, 높이/너비 size 안에 맞춰 그림
function drawMonsterAt(g, d, color, x, y, size, rot) {
  const b = designBox(d), s = size / Math.max(b.w + 30, b.h + 30);
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(s, s); g.translate(-b.cx, -b.cy);
  drawRobotLocal(g, d, color, 1, false);
  g.restore();
}
// 놀이에 쓸 몬스터들: 내 몬스터 + 받은 친구 몬스터 + CPU 10마리
function playMonsters() {
  const list = [];
  if (myRobot) list.push({ d: myRobot, name: myName || '내 몬스터', color: ME.color });
  if (friendRobot) list.push({ d: friendRobot, name: FRIEND.name, color: FRIEND.color });
  for (const c of RB.CPU.concat(RB.URA)) list.push({ d: c, name: c.name, color: c.color === '#111111' ? '#5c6bc0' : c.color });
  return list;
}
function pel(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function pbtn(cls, text, fn) { const b = pel('button', cls, text); b.addEventListener('click', e => { e.preventDefault(); fn(); }); return b; }
let playRaf = 0;
function playLeave() { cancelAnimationFrame(playRaf); playRaf = 0; $('playbox').hidden = true; $('playbox').innerHTML = ''; showTitle(); }
function playOpen(title) {
  mode = 'play'; show('play'); SFX.music('title');
  const box = $('playbox'); box.innerHTML = ''; box.hidden = false;
  const top = pel('div', 'ptop');
  top.appendChild(pbtn('sub pback', '← 처음으로', playLeave));
  const tt = pel('div', 'ptitle', title); top.appendChild(tt);
  const info = pel('div', 'pinfo'); top.appendChild(info);
  box.appendChild(top);
  return { box, top, tt, info };
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// =====================================================================
// 🔍 숨은 몬스터 찾기
// =====================================================================
let hide = null;
function hideStart(level) {
  const ui = playOpen('🔍 숨은 몬스터 찾기');
  const bar = pel('div', 'hbar'); ui.box.appendChild(bar);
  const wrap = pel('div', 'hwrap'); ui.box.appendChild(wrap);
  const cv = pel('canvas', 'hcv'); wrap.appendChild(cv);
  const msg = pel('div', 'hmsg'); msg.hidden = true; wrap.appendChild(msg);
  const lv = level || 1, R = rng(Date.now() + lv * 977);
  const pool = playMonsters();
  const nT = Math.min(8, 2 + lv), size = Math.max(0.075, 0.15 - lv * 0.012);   // 몬스터 크기(화면 짧은 변 기준)
  // 찾을 몬스터: 내 몬스터가 있으면 꼭 넣고, 나머지는 섞어서
  const picks = []; const rest = pool.slice(myRobot ? 1 : 0);
  if (myRobot) picks.push(pool[0]);
  while (picks.length < nT && rest.length) picks.push(rest.splice(Math.floor(R() * rest.length), 1)[0]);
  // 장면: 모든 좌표는 0~1 (가로·세로 비율로), 크기는 짧은 변 기준
  const items = [];
  const nDecor = 40 + lv * 14;
  const kinds = ['tree', 'bush', 'bush', 'flower', 'flower', 'rock', 'mush', 'cloud'];
  for (let i = 0; i < nDecor; i++) {
    const k = kinds[Math.floor(R() * kinds.length)];
    const y = k === 'cloud' ? R() * 0.25 : 0.22 + R() * 0.78;
    items.push({ k, x: R(), y, s: (k === 'tree' ? 0.16 : k === 'cloud' ? 0.14 : k === 'bush' ? 0.09 : 0.05) * (0.7 + R() * 0.6), hue: R(), z: y + R() * 0.05 });
  }
  const targets = picks.map((m, i) => {
    let x, y, tries = 0;
    do { x = 0.06 + R() * 0.88; y = 0.3 + R() * 0.62; tries++; } while (tries < 40 && picks.slice(0, i).some((_, j) => Math.hypot(targetsTmp[j].x - x, targetsTmp[j].y - y) < 0.12));
    const t = { m, x, y, s: size * (0.85 + R() * 0.3), rot: (R() - 0.5) * 0.9, flip: R() < 0.5, found: false, z: y + 0.01 };
    targetsTmp.push(t); return t;
  });
  targetsTmp.length = 0;
  // 앞쪽 수풀 몇 개는 몬스터 일부를 살짝 가림
  for (const t of targets) if (R() < 0.6) items.push({ k: 'bush', x: t.x + (R() - 0.5) * t.s * 0.8, y: t.y + t.s * 0.35, s: t.s * 0.7, hue: R(), z: t.z + 0.02, front: true });
  hide = { lv, targets, items, cv, msg, bar, ui, t0: performance.now(), limit: 60 + lv * 5, hints: 3, hintT: 0, hintI: -1, wrong: [], marks: [], over: false, pen: 0, stars: [] };
  renderHideBar();
  const resize = () => { hide.view = playCanvas(cv); };
  resize(); hide.onResize = resize;
  cv.addEventListener('pointerdown', hideTap);
  loopHide();
}
const targetsTmp = [];
function renderHideBar() {
  const h = hide, bar = h.bar; bar.innerHTML = '';
  h.targets.forEach((t, i) => {
    const c = pel('canvas', 'htgt' + (t.found ? ' found' : '')); c.width = c.height = 96;
    const g = c.getContext('2d'); drawMonsterAt(g, t.m.d, t.m.color, 48, 48, 88, 0);
    const w = pel('div', 'hitem'); w.appendChild(c); w.appendChild(pel('span', '', t.m.name)); bar.appendChild(w);
  });
  const hb = pbtn('sub hhint', '💡 힌트 ' + h.hints, () => {
    if (h.over || h.hints <= 0) return;
    const left = h.targets.map((t, i) => t.found ? -1 : i).filter(i => i >= 0); if (!left.length) return;
    h.hints--; h.hintI = left[Math.floor(Math.random() * left.length)]; h.hintT = performance.now(); SFX.play('pop'); renderHideBar();
  });
  hb.disabled = h.hints <= 0; bar.appendChild(hb);
  h.ui.tt.textContent = '🔍 숨은 몬스터 찾기 · ' + h.lv + '단계';
}
function hidePos(t, v) { const u = Math.min(v.w, v.h); return { x: t.x * v.w, y: t.y * v.h, s: t.s * u }; }
function hideTap(e) {
  const h = hide; if (!h || h.over) return;
  const r = h.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = -1, bd = Infinity;
  h.targets.forEach((t, i) => { if (t.found) return; const p = hidePos(t, h.view), d = Math.hypot(p.x - x, p.y - y); if (d < p.s * 0.62 && d < bd) { bd = d; best = i; } });
  if (best >= 0) {
    const t = h.targets[best]; t.found = true; const p = hidePos(t, h.view);
    h.marks.push({ x: p.x, y: p.y, r: p.s * 0.6, t: performance.now() });
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, v = 60 + Math.random() * 140; h.stars.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: PASTEL[i % 5], life: 1 }); }
    SFX.play('done'); renderHideBar();
    if (h.targets.every(t => t.found)) hideEnd(true);
  } else {
    h.wrong.push({ x, y, t: performance.now() }); h.pen += 2; SFX.play('erase');
  }
}
function hideEnd(ok) {
  const h = hide; h.over = true;
  const used = (performance.now() - h.t0) / 1000 + h.pen;
  h.msg.hidden = false; h.msg.innerHTML = '';
  if (ok) {
    SFX.play('clear');
    const best = +(lsGet('hide.best') || 0); if (h.lv > best) lsSet('hide.best', String(h.lv));
    h.msg.appendChild(pel('div', 'hmt', '다 찾았다! 🎉'));
    h.msg.appendChild(pel('div', 'hms', h.lv + '단계 · ' + Math.round(used) + '초' + (h.lv > best ? ' · 최고 단계!' : '')));
    const row = pel('div', 'rbtns'); row.appendChild(pbtn('main', '다음 단계 ▶', () => hideStart(h.lv + 1))); row.appendChild(pbtn('sub', '이 단계 다시', () => hideStart(h.lv)));
    h.msg.appendChild(row);
  } else {
    SFX.play('lose');
    h.msg.appendChild(pel('div', 'hmt', '시간 끝!'));
    h.msg.appendChild(pel('div', 'hms', '못 찾은 몬스터가 깜빡이고 있어'));
    const row = pel('div', 'rbtns'); row.appendChild(pbtn('main', '다시 하기', () => hideStart(h.lv))); if (h.lv > 1) row.appendChild(pbtn('sub', '1단계부터', () => hideStart(1)));
    h.msg.appendChild(row);
  }
}
function drawDecor(g, it, v) {
  const u = Math.min(v.w, v.h), x = it.x * v.w, y = it.y * v.h, s = it.s * u;
  g.save(); g.translate(x, y);
  const hsl = (hh, sat, l) => 'hsl(' + hh + ',' + sat + '%,' + l + '%)';
  if (it.k === 'tree') {
    g.fillStyle = '#8d6e63'; g.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.5);
    for (const [dx, dy, rr] of [[0, -0.75, 0.32], [-0.22, -0.6, 0.25], [0.22, -0.6, 0.25], [0, -0.5, 0.22]]) { g.fillStyle = hsl(95 + it.hue * 50, 45, 32 + dy * -8); g.beginPath(); g.arc(dx * s, dy * s, rr * s, 0, 7); g.fill(); }
  } else if (it.k === 'bush') {
    g.globalAlpha = it.front ? 0.93 : 1;
    for (const [dx, rr] of [[-0.3, 0.3], [0, 0.4], [0.3, 0.3]]) { g.fillStyle = hsl(90 + it.hue * 60, 50, 30 + it.hue * 14); g.beginPath(); g.arc(dx * s, -rr * s * 0.6, rr * s, 0, 7); g.fill(); }
  } else if (it.k === 'flower') {
    g.strokeStyle = '#4caf50'; g.lineWidth = Math.max(1, s * 0.08); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.6); g.stroke();
    g.fillStyle = hsl(it.hue * 360, 80, 70); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; g.beginPath(); g.arc(Math.cos(a) * s * 0.2, -s * 0.6 + Math.sin(a) * s * 0.2, s * 0.14, 0, 7); g.fill(); }
    g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(0, -s * 0.6, s * 0.1, 0, 7); g.fill();
  } else if (it.k === 'rock') {
    g.fillStyle = hsl(220, 8, 50 + it.hue * 20); g.beginPath(); g.ellipse(0, -s * 0.2, s * 0.45, s * 0.3, 0, 0, 7); g.fill();
  } else if (it.k === 'mush') {
    g.fillStyle = '#fff3e0'; g.fillRect(-s * 0.1, -s * 0.4, s * 0.2, s * 0.4);
    g.fillStyle = hsl(it.hue < 0.5 ? 0 : 30, 75, 55); g.beginPath(); g.arc(0, -s * 0.4, s * 0.32, Math.PI, 0); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-s * 0.12, -s * 0.52, s * 0.06, 0, 7); g.arc(s * 0.1, -s * 0.5, s * 0.05, 0, 7); g.fill();
  } else if (it.k === 'cloud') {
    g.fillStyle = 'rgba(255,255,255,.9)'; for (const [dx, dy, rr] of [[-0.3, 0, 0.25], [0, -0.1, 0.32], [0.3, 0, 0.25]]) { g.beginPath(); g.arc(dx * s, dy * s, rr * s, 0, 7); g.fill(); }
  }
  g.restore();
}
function loopHide() {
  const h = hide; if (!h || !h.cv.isConnected) return;
  const { g, w, h: hh } = h.view, now = performance.now();
  // 배경
  const sky = g.createLinearGradient(0, 0, 0, hh); sky.addColorStop(0, '#9be7ff'); sky.addColorStop(0.3, '#d6f5ff'); sky.addColorStop(0.31, '#a5d66f'); sky.addColorStop(1, '#6fb34a');
  g.fillStyle = sky; g.fillRect(0, 0, w, hh);
  const all = h.items.map(it => ({ z: it.z, it })).concat(h.targets.map(t => ({ z: t.z, t }))).sort((a, b) => a.z - b.z);
  for (const o of all) {
    if (o.it) { drawDecor(g, o.it, h.view); continue; }
    const t = o.t, p = hidePos(t, h.view);
    g.save(); if (t.flip) { g.translate(p.x, 0); g.scale(-1, 1); g.translate(-p.x, 0); }
    drawMonsterAt(g, t.m.d, t.m.color, p.x, p.y, p.s, t.rot); g.restore();
  }
  // 찾은 표시 · 힌트 · 틀린 곳
  for (const m of h.marks) { g.strokeStyle = '#ff3d71'; g.lineWidth = 4; g.beginPath(); g.arc(m.x, m.y, m.r * Math.min(1, (now - m.t) / 150), 0, 7); g.stroke(); }
  if (h.hintI >= 0 && now - h.hintT < 2200) { const p = hidePos(h.targets[h.hintI], h.view), k = (now - h.hintT) / 2200; g.strokeStyle = 'rgba(255,214,0,' + (1 - k) + ')'; g.lineWidth = 5; g.beginPath(); g.arc(p.x, p.y, p.s * (2.2 - 1.4 * k), 0, 7); g.stroke(); }
  h.wrong = h.wrong.filter(x => now - x.t < 600);
  for (const x of h.wrong) { g.globalAlpha = 1 - (now - x.t) / 600; g.font = '900 22px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e53935'; g.fillText('✕', x.x, x.y + 8); g.globalAlpha = 1; }
  for (const s of h.stars) { s.x += s.vx / 60; s.y += s.vy / 60; s.vy += 4; s.life -= 0.02; g.globalAlpha = Math.max(0, s.life); g.fillStyle = s.c; g.save(); g.translate(s.x, s.y); starPath(g, 7, 3); g.fill(); g.restore(); }
  g.globalAlpha = 1; h.stars = h.stars.filter(s => s.life > 0);
  // 못 찾고 끝났으면 깜빡임
  if (h.over && !h.targets.every(t => t.found)) for (const t of h.targets) if (!t.found) { const p = hidePos(t, h.view); g.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * Math.sin(now / 150)) + ')'; g.lineWidth = 4; g.beginPath(); g.arc(p.x, p.y, p.s * 0.7, 0, 7); g.stroke(); }
  // 시간
  if (!h.over) {
    const left = Math.max(0, h.limit - (now - h.t0) / 1000 - h.pen);
    h.ui.info.textContent = '⏱ ' + Math.ceil(left) + ' · ' + h.targets.filter(t => t.found).length + '/' + h.targets.length;
    h.ui.info.classList.toggle('hurry', left <= 10);
    if (left <= 0) hideEnd(false);
  }
  playRaf = requestAnimationFrame(loopHide);
}

// =====================================================================
// 🧩 몬스터 퍼즐
// =====================================================================
let pz = null;
let pzN = +(lsGet('puzzle.n') || 3), pzIdx = 0;
function puzzleStart() {
  const ui = playOpen('🧩 몬스터 퍼즐');
  const ctrl = pel('div', 'pzctrl'); ui.box.appendChild(ctrl);
  for (const n of [3, 4, 5]) ctrl.appendChild(pbtn('sub chip' + (pzN === n ? ' on' : ''), n + '×' + n, () => { pzN = n; lsSet('puzzle.n', String(n)); puzzleStart(); }));
  const mons = playMonsters(); pzIdx = pzIdx % mons.length;
  ctrl.appendChild(pbtn('sub chip', '🔄 다른 몬스터', () => { pzIdx = (pzIdx + 1) % mons.length; puzzleStart(); }));
  const ghostBtn = pbtn('sub chip', '👻 밑그림', () => { pz.ghost = !pz.ghost; ghostBtn.classList.toggle('on', pz.ghost); });
  ctrl.appendChild(ghostBtn);
  const wrap = pel('div', 'pzwrap'); ui.box.appendChild(wrap);
  const cv = pel('canvas', 'pzcv'); wrap.appendChild(cv);
  const msg = pel('div', 'hmsg'); msg.hidden = true; wrap.appendChild(msg);
  const m = mons[pzIdx];
  pz = { n: pzN, m, cv, msg, ui, pieces: [], drag: null, moves: 0, t0: performance.now(), done: false, ghost: pzN >= 4, img: null };
  ghostBtn.classList.toggle('on', pz.ghost);
  ui.tt.textContent = '🧩 몬스터 퍼즐 · ' + m.name;
  puzzleLayout(true);
  cv.addEventListener('pointerdown', pzDown); cv.addEventListener('pointermove', pzMove); cv.addEventListener('pointerup', pzUp); cv.addEventListener('pointercancel', pzUp);
  loopPuzzle();
}
// 그림 만들기(정사각형): 파스텔 배경 + 땅 + 몬스터
function puzzleImage(side) {
  const c = document.createElement('canvas'), d = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(side * d); const g = c.getContext('2d'); g.scale(d, d);
  const bg = g.createLinearGradient(0, 0, 0, side); bg.addColorStop(0, '#ffe0f0'); bg.addColorStop(0.55, '#e0f2ff'); bg.addColorStop(0.56, '#c8e6a0'); bg.addColorStop(1, '#9ccc65');
  g.fillStyle = bg; g.fillRect(0, 0, side, side);
  const R = rng(pzIdx * 31 + 7);
  for (let i = 0; i < 14; i++) { g.fillStyle = PASTEL[i % 5]; g.save(); g.translate(R() * side, R() * side * 0.5); starPath(g, side * 0.025, side * 0.011); g.fill(); g.restore(); }
  for (let i = 0; i < 10; i++) { g.fillStyle = 'hsl(' + R() * 360 + ',80%,72%)'; g.beginPath(); g.arc(R() * side, side * (0.62 + R() * 0.35), side * 0.018, 0, 7); g.fill(); }
  drawMonsterAt(g, pz.m.d, pz.m.color, side / 2, side * 0.5, side * 0.9, 0);
  return c;
}
function puzzleLayout(first) {
  const p = pz; p.view = playCanvas(p.cv);
  const { w, h } = p.view, land = w > h;
  // 판: 가로 화면이면 왼쪽, 세로면 위쪽 / 조각 쟁반: 나머지
  const side = Math.floor(land ? Math.min(h - 16, w * 0.52) : Math.min(w - 16, h * 0.55));
  p.board = land ? { x: 8, y: (h - side) / 2, s: side } : { x: (w - side) / 2, y: 8, s: side };
  p.tray = land ? { x: p.board.x + side + 12, y: 8, w: w - side - 28, h: h - 16 } : { x: 8, y: p.board.y + side + 12, w: w - 16, h: h - side - 28 };
  p.img = puzzleImage(side); p.cell = side / p.n;
  const oldPieces = p.pieces;
  p.pieces = [];
  const R = rng(Date.now());
  for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) {
    const old = !first && oldPieces.find(q => q.r === r && q.c === c);
    const piece = { r, c, placed: old ? old.placed : false, x: 0, y: 0 };
    if (piece.placed) { piece.x = p.board.x + c * p.cell; piece.y = p.board.y + r * p.cell; }
    else { piece.x = p.tray.x + R() * Math.max(1, p.tray.w - p.cell); piece.y = p.tray.y + R() * Math.max(1, p.tray.h - p.cell); }
    p.pieces.push(piece);
  }
  p.pieces.sort(() => R() - 0.5);
}
function pzAt(x, y) { for (let i = pz.pieces.length - 1; i >= 0; i--) { const q = pz.pieces[i]; if (q.placed) continue; if (x >= q.x && x <= q.x + pz.cell && y >= q.y && y <= q.y + pz.cell) return i; } return -1; }
function pzPt(e) { const r = pz.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function pzDown(e) {
  if (!pz || pz.done || pz.drag) return; e.preventDefault();
  const [x, y] = pzPt(e), i = pzAt(x, y); if (i < 0) return;
  const q = pz.pieces.splice(i, 1)[0]; pz.pieces.push(q);   // 맨 위로
  pz.drag = { q, dx: x - q.x, dy: y - q.y, id: e.pointerId }; try { pz.cv.setPointerCapture(e.pointerId); } catch (er) {}
  SFX.play('tap');
}
function pzMove(e) { const d = pz && pz.drag; if (!d || e.pointerId !== d.id) return; e.preventDefault(); const [x, y] = pzPt(e); d.q.x = x - d.dx; d.q.y = y - d.dy; }
function pzUp(e) {
  const d = pz && pz.drag; if (!d || e.pointerId !== d.id) return;
  pz.drag = null; pz.moves++;
  const q = d.q, tx = pz.board.x + q.c * pz.cell, ty = pz.board.y + q.r * pz.cell;
  if (Math.hypot(q.x - tx, q.y - ty) < pz.cell * 0.35) {   // 제자리 가까이 → 딱 붙음
    q.x = tx; q.y = ty; q.placed = true; SFX.play('pop');
    if (pz.pieces.every(p => p.placed)) puzzleDone();
  }
}
function puzzleDone() {
  const p = pz; p.done = true; SFX.play('clear');
  const sec = Math.round((performance.now() - p.t0) / 1000), key = 'puzzle.best' + p.n, best = +(lsGet(key) || 0);
  if (!best || sec < best) lsSet(key, String(sec));
  p.msg.hidden = false; p.msg.innerHTML = '';
  p.msg.appendChild(pel('div', 'hmt', '완성! 🎉'));
  p.msg.appendChild(pel('div', 'hms', p.n + '×' + p.n + ' · ' + sec + '초 · ' + p.moves + '번 옮김' + (!best || sec < best ? ' · 최고 기록!' : ' (최고 ' + best + '초)')));
  const row = pel('div', 'rbtns');
  row.appendChild(pbtn('main', p.n < 5 ? '더 어렵게 ▶' : '다른 몬스터 ▶', () => { if (p.n < 5) { pzN = p.n + 1; lsSet('puzzle.n', String(pzN)); } else pzIdx++; puzzleStart(); }));
  row.appendChild(pbtn('sub', '다시 섞기', puzzleStart));
  p.msg.appendChild(row);
  p.confetti = Array.from({ length: 90 }, (_, i) => ({ x: p.board.x + p.board.s / 2, y: p.board.y + p.board.s / 2, vx: (Math.random() - 0.5) * 9, vy: -3 - Math.random() * 7, c: PASTEL[i % 5], life: 1 }));
}
function drawPiece(g, q, x, y, lift) {
  const p = pz, s = p.cell, iw = p.img.width / p.n;
  g.save();
  if (lift) { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 12; g.shadowOffsetY = 4; }
  roundRect(g, x, y, s, s, Math.min(8, s * 0.08)); g.fillStyle = '#fff'; g.fill(); g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.clip(); g.drawImage(p.img, q.c * iw, q.r * iw, iw, iw, x, y, s, s);
  g.restore();
  g.strokeStyle = q.placed ? 'rgba(255,255,255,.35)' : '#1b1d3a'; g.lineWidth = q.placed ? 1 : 2.5; roundRect(g, x, y, s, s, Math.min(8, s * 0.08)); g.stroke();
}
function loopPuzzle() {
  const p = pz; if (!p || !p.cv.isConnected) return;
  const { g, w, h } = p.view;
  g.fillStyle = '#2a2d6b'; g.fillRect(0, 0, w, h);
  // 쟁반
  g.fillStyle = 'rgba(255,255,255,.06)'; roundRect(g, p.tray.x, p.tray.y, p.tray.w, p.tray.h, 14); g.fill();
  // 판 + 밑그림 + 칸
  const b = p.board;
  g.fillStyle = '#1b1d3a'; g.fillRect(b.x, b.y, b.s, b.s);
  if (p.ghost) { g.globalAlpha = 0.25; g.drawImage(p.img, b.x, b.y, b.s, b.s); g.globalAlpha = 1; }
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
  for (let i = 1; i < p.n; i++) { g.beginPath(); g.moveTo(b.x + i * p.cell, b.y); g.lineTo(b.x + i * p.cell, b.y + b.s); g.moveTo(b.x, b.y + i * p.cell); g.lineTo(b.x + b.s, b.y + i * p.cell); g.stroke(); }
  g.strokeStyle = '#ffd54f'; g.lineWidth = 3; g.strokeRect(b.x - 1.5, b.y - 1.5, b.s + 3, b.s + 3);
  for (const q of p.pieces) if (q.placed) drawPiece(g, q, q.x, q.y, false);
  for (const q of p.pieces) if (!q.placed) drawPiece(g, q, q.x, q.y, p.drag && p.drag.q === q);
  if (p.confetti) for (const c of p.confetti) { c.x += c.vx; c.y += c.vy; c.vy += 0.25; c.life -= 0.008; g.globalAlpha = Math.max(0, c.life); g.fillStyle = c.c; g.fillRect(c.x, c.y, 7, 7); g.globalAlpha = 1; }
  if (!p.done) p.ui.info.textContent = '⏱ ' + Math.round((performance.now() - p.t0) / 1000) + '초 · ' + p.pieces.filter(q => q.placed).length + '/' + p.pieces.length;
  playRaf = requestAnimationFrame(loopPuzzle);
}

onTap($('hidebtn'), () => hideStart(1));
onTap($('puzzlebtn'), puzzleStart);
window.addEventListener('resize', () => {
  if (mode !== 'play') return;
  setTimeout(() => { if (hide && hide.cv.isConnected) hide.onResize(); if (pz && pz.cv.isConnected) puzzleLayout(false); }, 80);
});
