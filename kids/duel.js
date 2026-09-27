// 둘이서 놀이 (전자칠판·가로 화면용): 화면을 반씩 나눠 두 명이 동시에
//  👫🔍 틀린 그림 찾기 대결 — 왼쪽·오른쪽에 거의 같은 그림. 다른 곳을 먼저 누른 사람이 점수
//  👫🧩 퍼즐 대결 — 양쪽에 각자 퍼즐판, 가운데에 두 세트(서로 다른 몬스터) 조각이 섞여 있음. 먼저 완성하면 승리
'use strict';
const DCOL = { L: '#1e88e5', R: '#e53935' }, DNAME = { L: '왼쪽', R: '오른쪽' };
function duelResult(box, title, sub, again) {
  const m = pel('div', 'hmsg'); box.appendChild(m);
  m.appendChild(pel('div', 'hmt', title)); m.appendChild(pel('div', 'hms', sub));
  const row = pel('div', 'rbtns'); row.appendChild(pbtn('main', '한 판 더 ▶', again)); row.appendChild(pbtn('sub', '🏠 처음으로', playLeave)); m.appendChild(row);
  SFX.play('clear');
}
function duelScore(info, a, b, suffix) {
  info.innerHTML = '<b style="color:' + DCOL.L + '">왼쪽 ' + a + '</b> : <b style="color:' + DCOL.R + '">' + b + ' 오른쪽</b>' + (suffix || '');
}

// =====================================================================
// 👫🔍 틀린 그림 찾기 대결
// =====================================================================
let spot = null;
let spotN = +(lsGet('spot.n') || 7);
function spotStart() {
  const ui = playOpen('👫🔍 틀린 그림 찾기');
  const ctrl = pel('div', 'pzctrl');
  for (const n of [5, 7, 10]) ctrl.appendChild(pbtn('sub chip' + (spotN === n ? ' on' : ''), '다른 곳 ' + n + '개', () => { spotN = n; lsSet('spot.n', String(n)); spotStart(); }));
  ctrl.appendChild(pbtn('sub chip', '🔄 새 그림', spotStart));
  ui.box.appendChild(ctrl);
  const wrap = pel('div', 'dwrap'); ui.box.appendChild(wrap);
  const panes = {};
  for (const k of ['L', 'R']) {
    const p = pel('div', 'dpane'); p.style.borderColor = DCOL[k];
    const tag = pel('div', 'dtag', DNAME[k]); tag.style.background = DCOL[k]; p.appendChild(tag);
    const cv = pel('canvas', 'dcv'); p.appendChild(cv);
    wrap.appendChild(p); panes[k] = { p, cv, lockUntil: 0, wrong: [] };
    cv.addEventListener('pointerdown', e => spotTap(k, e));
  }
  const R = rng(Date.now());
  // ---- 장면 (좌표 0~1, 크기는 짧은 변 기준) ----
  const kinds = ['tree', 'tree', 'bush', 'bush', 'bush', 'flower', 'flower', 'flower', 'rock', 'mush', 'mush', 'cloud'];
  const items = [];
  for (let i = 0; i < 34; i++) {
    const k = kinds[Math.floor(R() * kinds.length)];
    const y = k === 'cloud' ? 0.04 + R() * 0.2 : 0.3 + R() * 0.68;
    items.push({ k, x: 0.04 + R() * 0.92, y, s: (k === 'tree' ? 0.2 : k === 'cloud' ? 0.17 : k === 'bush' ? 0.12 : k === 'rock' ? 0.09 : 0.08) * (0.8 + R() * 0.4), hue: R(), z: y });
  }
  const mons = playMonsters().sort(() => R() - 0.5).slice(0, 4);
  mons.forEach(m => { const y = 0.45 + R() * 0.45; items.push({ k: 'mon', m, color: m.color, x: 0.1 + R() * 0.8, y, s: 0.2 + R() * 0.06, flip: R() < 0.5, z: y + 0.001 }); });
  // ---- 다른 곳 고르기: 서로 떨어져 있고, 너무 작지 않은 것 ----
  const diffs = [], used = new Set();
  const far = (x, y) => diffs.every(d => Math.hypot(d.x - x, d.y - y) > 0.14);
  const order = items.map((_, i) => i).sort(() => R() - 0.5);
  for (const i of order) {
    if (diffs.length >= spotN) break;
    const it = items[i]; if (!far(it.x, it.y - it.s * 0.3)) continue;
    const opts = it.k === 'mon' ? ['monColor', 'monFlip', 'remove'] : it.k === 'flower' || it.k === 'mush' ? ['hue', 'remove', 'big'] : it.k === 'cloud' ? ['remove'] : ['remove', 'big'];
    const type = opts[Math.floor(R() * opts.length)];
    used.add(i); diffs.push({ i, type, x: it.x, y: it.y - it.s * (it.k === 'tree' ? 0.55 : it.k === 'cloud' ? 0 : 0.3), r: Math.max(0.05, it.s * (it.k === 'tree' ? 0.5 : 0.55)), who: null });
  }
  // 빈 곳에 새로 생긴 것 (별·꽃)으로 모자란 개수 채우기
  let guard = 0;
  while (diffs.length < spotN && guard++ < 200) {
    const x = 0.06 + R() * 0.88, y = 0.35 + R() * 0.6; if (!far(x, y)) continue;
    diffs.push({ type: 'add', add: { k: R() < 0.5 ? 'flower' : 'mush', x, y: y + 0.03, s: 0.08, hue: R(), z: y }, x, y: y - 0.01, r: 0.06, who: null });
  }
  // 오른쪽 그림 = 왼쪽 그림 + 바뀐 곳
  const right = [];
  items.forEach((it, i) => {
    const d = diffs.find(d => d.i === i);
    if (!d) { right.push(it); return; }
    if (d.type === 'remove') return;
    const c = Object.assign({}, it);
    if (d.type === 'hue') c.hue = (it.hue + 0.5) % 1;
    if (d.type === 'big') c.s = it.s * 1.45;
    if (d.type === 'monFlip') c.flip = !it.flip;
    if (d.type === 'monColor') c.color = ['#ff8fb1', '#ffd54f', '#26c6da', '#9ccc65', '#ab47bc', '#ff7043'].find(x => x !== it.color);
    right.push(c);
  });
  for (const d of diffs) if (d.type === 'add') right.push(d.add);
  // 왼쪽이 원본인지 오른쪽이 원본인지 섞기 (어느 쪽이 유리하지 않게)
  const swap = R() < 0.5;
  spot = { ui, panes, diffs, scenes: { L: swap ? right : items, R: swap ? items : right }, score: { L: 0, R: 0 }, over: false, marks: [] };
  const lay = () => spotLayout();
  spot.onResize = lay;
  requestAnimationFrame(() => { lay(); spotLoop(); });
  duelScore(ui.info, 0, 0);
}
// 칸마다 4:3 그림을 가운데에
function spotLayout() {
  for (const k of ['L', 'R']) {
    const P = spot.panes[k], r = P.p.getBoundingClientRect(), aw = r.width - 8, ah = r.height - 30;
    const w = Math.max(50, Math.min(aw, ah * 4 / 3)), h = w * 3 / 4;
    P.cv.style.width = w + 'px'; P.cv.style.height = h + 'px';
    P.view = playCanvas(P.cv);
  }
}
function spotTap(k, e) {
  e.preventDefault();
  const s = spot; if (!s || s.over) return;
  const P = s.panes[k], now = performance.now();
  if (now < P.lockUntil) return;
  const r = P.cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  const v = P.view, u = Math.min(v.w, v.h) / v.w;   // 반지름(짧은 변 기준)을 가로 비율로
  let hit = null;
  for (const d of s.diffs) {
    const dx = (x - d.x), dy = (y - d.y) * v.h / v.w;
    if (Math.hypot(dx, dy) < Math.max(d.r * u, 0.05) * 1.15) { hit = d; break; }
  }
  if (hit && !hit.who) {
    hit.who = k; hit.t = now; s.score[k]++;
    SFX.play('done'); duelScore(s.ui.info, s.score.L, s.score.R);
    if (s.diffs.every(d => d.who)) {
      s.over = true;
      const w = s.score.L === s.score.R ? null : s.score.L > s.score.R ? 'L' : 'R';
      setTimeout(() => duelResult(s.ui.box, w ? DNAME[w] + ' 승리! 🎉' : '무승부! 🤝', '왼쪽 ' + s.score.L + ' : ' + s.score.R + ' 오른쪽', spotStart), 500);
    }
  } else if (!hit) {
    P.lockUntil = now + 1000; P.wrong.push({ x, y, t: now }); SFX.play('erase');   // 틀리면 1초 쉬기
  }
}
function spotDraw(k) {
  const s = spot, P = s.panes[k], { g, w, h } = P.view, now = performance.now(), v = { w, h };
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#9be7ff'); sky.addColorStop(0.28, '#d6f5ff'); sky.addColorStop(0.29, '#a5d66f'); sky.addColorStop(1, '#6fb34a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const list = s.scenes[k].slice().sort((a, b) => a.z - b.z);
  for (const it of list) {
    if (it.k !== 'mon') { drawDecor(g, it, v); continue; }
    const u = Math.min(w, h), x = it.x * w, y = it.y * h, sz = it.s * u;
    g.save(); if (it.flip) { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
    drawMonsterAt(g, it.m.d, it.color, x, y - sz * 0.45, sz, 0); g.restore();
  }
  // 찾은 곳: 찾은 사람 색 동그라미 (양쪽 그림 모두)
  const u = Math.min(w, h);
  for (const d of s.diffs) if (d.who) {
    const rr = Math.max(d.r * u, 0.05 * w) * Math.min(1, (now - d.t) / 160);
    g.lineWidth = 5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(d.x * w, d.y * h, rr + 2, 0, 7); g.stroke();
    g.lineWidth = 4; g.strokeStyle = DCOL[d.who]; g.beginPath(); g.arc(d.x * w, d.y * h, rr, 0, 7); g.stroke();
  }
  P.wrong = P.wrong.filter(q => now - q.t < 1000);
  for (const q of P.wrong) { g.globalAlpha = 1 - (now - q.t) / 1000; g.font = '900 28px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e53935'; g.fillText('✕', q.x * w, q.y * h + 10); g.globalAlpha = 1; }
  if (now < P.lockUntil) { g.fillStyle = 'rgba(21,23,58,.25)'; g.fillRect(0, 0, w, h); }
}
function spotLoop() {
  if (!spot || !spot.panes.L.cv.isConnected) return;
  spotDraw('L'); spotDraw('R');
  playRaf = requestAnimationFrame(spotLoop);
}

// =====================================================================
// 👫🧩 퍼즐 대결
// =====================================================================
let pd = null;
let pdN = +(lsGet('pduel.n') || 3), pdGhost = lsGet('pduel.ghost') !== '0';
function pduelStart() {
  const ui = playOpen('👫🧩 퍼즐 대결');
  const ctrl = pel('div', 'pzctrl');
  for (const n of [3, 4, 5]) ctrl.appendChild(pbtn('sub chip' + (pdN === n ? ' on' : ''), n + '×' + n, () => { pdN = n; lsSet('pduel.n', String(n)); pduelStart(); }));
  const gb = pbtn('sub chip' + (pdGhost ? ' on' : ''), '👻 밑그림', () => { pdGhost = !pdGhost; lsSet('pduel.ghost', pdGhost ? '1' : '0'); gb.classList.toggle('on', pdGhost); });
  ctrl.appendChild(gb); ctrl.appendChild(pbtn('sub chip', '🔄 새 몬스터', pduelStart));
  ui.box.appendChild(ctrl);
  const wrap = pel('div', 'pzwrap'); ui.box.appendChild(wrap);
  const cv = pel('canvas', 'pzcv'); wrap.appendChild(cv);
  const mons = playMonsters().sort(() => Math.random() - 0.5);
  pd = { ui, wrap, cv, n: pdN, mons: { L: mons[0], R: mons[1] }, pieces: [], drags: new Map(), done: { L: 0, R: 0 }, over: false, t0: performance.now(), bounce: [] };
  cv.addEventListener('pointerdown', pdDown); cv.addEventListener('pointermove', pdMove); cv.addEventListener('pointerup', pdUp); cv.addEventListener('pointercancel', pdUp);
  pd.onResize = () => pduelLayout(false);
  requestAnimationFrame(() => { pduelLayout(true); pduelLoop(); });
}
function duelImage(m, side, seed) {
  const c = document.createElement('canvas'), d = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(side * d); const g = c.getContext('2d'); g.scale(d, d);
  const bg = g.createLinearGradient(0, 0, 0, side); bg.addColorStop(0, '#ffe0f0'); bg.addColorStop(0.55, '#e0f2ff'); bg.addColorStop(0.56, '#c8e6a0'); bg.addColorStop(1, '#9ccc65');
  g.fillStyle = bg; g.fillRect(0, 0, side, side);
  const R = rng(seed);
  for (let i = 0; i < 12; i++) { g.fillStyle = PASTEL[i % 5]; g.save(); g.translate(R() * side, R() * side * 0.5); starPath(g, side * 0.03, side * 0.013); g.fill(); g.restore(); }
  for (let i = 0; i < 9; i++) { g.fillStyle = 'hsl(' + R() * 360 + ',80%,72%)'; g.beginPath(); g.arc(R() * side, side * (0.62 + R() * 0.35), side * 0.02, 0, 7); g.fill(); }
  drawMonsterAt(g, m.d, m.color, side / 2, side * 0.5, side * 0.9, 0);
  return c;
}
function pduelLayout(first) {
  const p = pd; p.view = playCanvas(p.cv);
  const { w, h } = p.view, land = w >= h;
  let s;
  if (land) { s = Math.floor(Math.min(h - 40, w * 0.33)); p.boards = { L: { x: 8, y: (h - s) / 2 + 12, s }, R: { x: w - s - 8, y: (h - s) / 2 + 12, s } }; p.tray = { x: s + 20, y: 8, w: w - 2 * s - 40, h: h - 16 }; }
  else { s = Math.floor(Math.min(w - 16, h * 0.3)); p.boards = { L: { x: (w - s) / 2, y: 26, s }, R: { x: (w - s) / 2, y: h - s - 8, s } }; p.tray = { x: 8, y: s + 38, w: w - 16, h: h - 2 * s - 54 }; }
  p.cell = s / p.n;
  p.imgs = { L: duelImage(p.mons.L, s, 11), R: duelImage(p.mons.R, s, 23) };
  const old = p.pieces; p.pieces = [];
  for (const k of ['L', 'R']) for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) {
    const o = !first && old.find(q => q.set === k && q.r === r && q.c === c);
    const q = { set: k, r, c, placed: o ? o.placed : false };
    if (q.placed) { q.x = p.boards[k].x + c * p.cell; q.y = p.boards[k].y + r * p.cell; } else pdScatter(q);
    p.pieces.push(q);
  }
  p.pieces.sort(() => Math.random() - 0.5);
  p.drags.clear();
}
function pdScatter(q) { const t = pd.tray; q.x = t.x + Math.random() * Math.max(1, t.w - pd.cell); q.y = t.y + Math.random() * Math.max(1, t.h - pd.cell); }
function pdPt(e) { const r = pd.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function pdDown(e) {
  if (!pd || pd.over) return; e.preventDefault();
  const [x, y] = pdPt(e);
  for (let i = pd.pieces.length - 1; i >= 0; i--) {
    const q = pd.pieces[i];
    if (q.placed || [...pd.drags.values()].some(d => d.q === q)) continue;
    if (x >= q.x && x <= q.x + pd.cell && y >= q.y && y <= q.y + pd.cell) {
      pd.pieces.splice(i, 1); pd.pieces.push(q);
      pd.drags.set(e.pointerId, { q, dx: x - q.x, dy: y - q.y }); try { pd.cv.setPointerCapture(e.pointerId); } catch (er) {}
      SFX.play('tap'); return;
    }
  }
}
function pdMove(e) { const d = pd && pd.drags.get(e.pointerId); if (!d) return; e.preventDefault(); const [x, y] = pdPt(e); d.q.x = x - d.dx; d.q.y = y - d.dy; }
function pdUp(e) {
  const d = pd && pd.drags.get(e.pointerId); if (!d) return;
  pd.drags.delete(e.pointerId);
  const q = d.q, cx = q.x + pd.cell / 2, cy = q.y + pd.cell / 2;
  const B = pd.boards[q.set], tx = B.x + q.c * pd.cell, ty = B.y + q.r * pd.cell;
  if (Math.hypot(q.x - tx, q.y - ty) < pd.cell * 0.38) {   // 내 판 제자리 → 딱
    q.x = tx; q.y = ty; q.placed = true; pd.done[q.set]++; SFX.play('pop');
    const all = pd.n * pd.n;
    duelScore(pd.ui.info, pd.done.L + '/' + all, pd.done.R + '/' + all);
    if (pd.done[q.set] === all && !pd.over) {
      pd.over = true;
      const sec = Math.round((performance.now() - pd.t0) / 1000);
      pd.confetti = Array.from({ length: 100 }, (_, i) => ({ x: B.x + B.s / 2, y: B.y + B.s / 2, vx: (Math.random() - 0.5) * 9, vy: -3 - Math.random() * 7, c: PASTEL[i % 5], life: 1 }));
      setTimeout(() => duelResult(pd.wrap, DNAME[q.set] + ' 승리! 🎉', pd.mons[q.set].name + ' 퍼즐 완성 · ' + sec + '초 (상대 ' + pd.done[q.set === 'L' ? 'R' : 'L'] + '/' + all + ')', pduelStart), 400);
    }
    return;
  }
  // 상대 판 위에 놓았으면 "내 조각이 아니야" → 가운데로 돌려보냄
  const other = pd.boards[q.set === 'L' ? 'R' : 'L'];
  if (cx > other.x && cx < other.x + other.s && cy > other.y && cy < other.y + other.s) {
    pd.bounce.push({ x: cx, y: cy, t: performance.now() }); SFX.play('erase'); pdScatter(q);
  }
}
function pduelLoop() {
  const p = pd; if (!p || !p.cv.isConnected) return;
  const { g, w, h } = p.view, now = performance.now();
  g.fillStyle = '#2a2d6b'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.06)'; roundRect(g, p.tray.x, p.tray.y, p.tray.w, p.tray.h, 14); g.fill();
  for (const k of ['L', 'R']) {
    const b = p.boards[k];
    g.font = '900 15px sans-serif'; g.textAlign = 'center'; g.fillStyle = DCOL[k];
    g.fillText(DNAME[k] + ' · ' + p.mons[k].name, b.x + b.s / 2, b.y - 8);
    g.fillStyle = '#1b1d3a'; g.fillRect(b.x, b.y, b.s, b.s);
    if (pdGhost) { g.globalAlpha = 0.25; g.drawImage(p.imgs[k], b.x, b.y, b.s, b.s); g.globalAlpha = 1; }
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
    for (let i = 1; i < p.n; i++) { g.beginPath(); g.moveTo(b.x + i * p.cell, b.y); g.lineTo(b.x + i * p.cell, b.y + b.s); g.moveTo(b.x, b.y + i * p.cell); g.lineTo(b.x + b.s, b.y + i * p.cell); g.stroke(); }
    g.strokeStyle = DCOL[k]; g.lineWidth = 4; g.strokeRect(b.x - 2, b.y - 2, b.s + 4, b.s + 4);
  }
  const lifted = new Set([...p.drags.values()].map(d => d.q));
  const piece = q => {
    const s = p.cell, img = p.imgs[q.set], iw = img.width / p.n, lift = lifted.has(q);
    g.save(); if (lift) { g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 14; g.shadowOffsetY = 5; }
    roundRect(g, q.x, q.y, s, s, Math.min(8, s * 0.08)); g.fillStyle = '#fff'; g.fill(); g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.clip(); g.drawImage(img, q.c * iw, q.r * iw, iw, iw, q.x, q.y, s, s); g.restore();
    g.strokeStyle = q.placed ? 'rgba(255,255,255,.3)' : '#1b1d3a'; g.lineWidth = q.placed ? 1 : 2.5; roundRect(g, q.x, q.y, s, s, Math.min(8, s * 0.08)); g.stroke();
  };
  for (const q of p.pieces) if (q.placed) piece(q);
  for (const q of p.pieces) if (!q.placed) piece(q);
  p.bounce = p.bounce.filter(b => now - b.t < 900);
  for (const b of p.bounce) { g.globalAlpha = 1 - (now - b.t) / 900; g.font = '900 18px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#15173a'; g.lineWidth = 5; g.strokeText('내 조각이 아니야!', b.x, b.y); g.fillText('내 조각이 아니야!', b.x, b.y); g.globalAlpha = 1; }
  if (p.confetti) for (const c of p.confetti) { c.x += c.vx; c.y += c.vy; c.vy += 0.25; c.life -= 0.008; g.globalAlpha = Math.max(0, c.life); g.fillStyle = c.c; g.fillRect(c.x, c.y, 7, 7); g.globalAlpha = 1; }
  if (!p.over) { const all = p.n * p.n; duelScore(p.ui.info, p.done.L + '/' + all, p.done.R + '/' + all, ' · ⏱ ' + Math.round((now - p.t0) / 1000)); }
  playRaf = requestAnimationFrame(pduelLoop);
}

onTap($('spotbtn'), () => { if (typeof goFull === 'function') goFull(); spotStart(); });
onTap($('pduelbtn'), () => { if (typeof goFull === 'function') goFull(); pduelStart(); });
window.addEventListener('resize', () => {
  if (mode !== 'play') return;
  setTimeout(() => { if (spot && spot.panes.L.cv.isConnected) spot.onResize(); if (pd && pd.cv.isConnected) pd.onResize(); }, 80);
});
