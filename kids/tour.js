// 학급 토너먼트 — 여러 몬스터를 모아 대진표를 짜고, 경기를 보거나 결과만 빠르게 내서 우승자를 가림
// 참가자는 교실 대결 로비(lobby.js)에서 각자 기기로 그려 보낸 몬스터
// 경기는 물리가 결정적이라, 직접 보나 결과만 내나 승자가 같음
'use strict';
const TOUR_MAX = 32;
const TOUR_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f4511e', '#3949ab', '#7cb342', '#d81b60', '#6d4c41', '#00897b', '#fdd835', '#5e35b1', '#c0ca33', '#546e7a'];
// tour = { entries: [{ c: 설계 코드, n: 이름 }], rounds: [[{ a, b, w, res }]] | null, cur: { r, m } | null, champShown }
let tour = loadTour();
function loadTour() {
  let t = null; try { t = JSON.parse(lsGet('tour') || 'null'); } catch (e) {}
  if (!t || !Array.isArray(t.entries)) t = { entries: [], rounds: null, cur: null, champShown: false };
  t.entries = t.entries.filter(e => e && RB.decodeDesign(e.c)).slice(0, TOUR_MAX);
  return t;
}
function saveTour() { lsSet('tour', JSON.stringify(tour)); }
const tColor = i => TOUR_COLORS[i % TOUR_COLORS.length];
const tDesign = i => RB.decodeDesign(tour.entries[i].c);
const tName = i => tour.entries[i].n;

function roundName(r) {
  const k = tour.rounds[r].length;
  return k === 1 ? '결승' : k === 2 ? '4강' : k === 4 ? '8강' : k === 8 ? '16강' : '32강';
}
function addEntry(code, name) {
  if (tour.entries.length >= TOUR_MAX) return '참가자는 ' + TOUR_MAX + '마리까지야';
  if (!RB.decodeDesign(code)) return '몬스터 코드를 읽을 수 없어';
  name = cleanName(name) || '참가자 ' + (tour.entries.length + 1);
  let n = name, k = 2; while (tour.entries.some(e => e.n === n)) n = name.slice(0, 6) + k++;   // 같은 이름 구분
  tour.entries.push({ c: code, n });
  tour.rounds = null; tour.cur = null; tour.champShown = false; saveTour();
  return '';
}

// ---------- 대진표 ----------
function makeBracket() {
  const n = tour.entries.length; if (n < 2) return;
  const order = tour.entries.map((e, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let size = 2; while (size < n) size *= 2;
  const byes = size - n, first = [];
  let p = 0;
  for (let i = 0; i < size / 2; i++) {
    if (i < byes) { const a = order[p++]; first.push({ a, b: null, w: a, res: '부전승' }); }
    else { first.push({ a: order[p++], b: order[p++], w: null, res: '' }); }
  }
  // 부전승이 한쪽에 몰리지 않게 섞어서 배치
  const spread = []; const byeM = first.filter(m => m.b === null), realM = first.filter(m => m.b !== null);
  while (byeM.length || realM.length) { if (realM.length) spread.push(realM.shift()); if (byeM.length) spread.push(byeM.shift()); }
  tour.rounds = [spread];
  for (let k = size / 4; k >= 1; k /= 2) tour.rounds.push(Array.from({ length: k }, () => ({ a: null, b: null, w: null, res: '' })));
  tour.cur = null; tour.champShown = false;
  propagate(); saveTour();
}
function propagate() {
  for (let r = 1; r < tour.rounds.length; r++) {
    tour.rounds[r].forEach((m, j) => {
      m.a = tour.rounds[r - 1][2 * j].w; m.b = tour.rounds[r - 1][2 * j + 1].w;
    });
  }
}
function nextMatch() {
  if (!tour.rounds) return null;
  for (let r = 0; r < tour.rounds.length; r++) for (let m = 0; m < tour.rounds[r].length; m++) {
    const x = tour.rounds[r][m];
    if (x.w === null && x.a !== null && x.b !== null) return { r, m };
  }
  return null;
}
function champion() { if (!tour.rounds) return null; const f = tour.rounds[tour.rounds.length - 1][0]; return f.w; }

// 무승부(시간 끝·같은 HP)는 남은 HP 비율로 판정, 그래도 같으면 왼쪽 선수
function judge(st) {
  if (st.winner) return { side: st.winner, res: st.reason === 'ko' ? 'KO' : '판정승' };
  const ra = st.A.hp / st.A.maxHp, rb = st.B.hp / st.B.maxHp;
  return { side: rb > ra ? 'B' : 'A', res: '판정승' };
}
function record(at, st) {
  const x = tour.rounds[at.r][at.m], j = judge(st);
  x.w = j.side === 'A' ? x.a : x.b; x.res = j.res;
  propagate(); saveTour();
}
function simQuick(at) {
  const x = tour.rounds[at.r][at.m];
  const st = RB.create(tDesign(x.a), tDesign(x.b));
  let guard = 0; while (!st.over && guard++ < 1e6) { RB.step(st); st.fx.length = 0; }
  record(at, st);
}

// ---------- 경기 보기 ----------
function startTourMatch(at) {
  const x = tour.rounds[at.r][at.m];
  tour.cur = at;
  isFriend = true;
  pA = { name: tName(x.a), color: tColor(x.a) };
  opp = { name: tName(x.b), color: tColor(x.b), d: tDesign(x.b) };
  S = RB.create(tDesign(x.a), opp.d); S.stage = 0; S.side = 'tour'; S.crownA = false; S.crownB = false;
  S.label = roundName(at.r) + (tour.rounds[at.r].length > 1 ? ' ' + (at.m + 1) + '경기' : '');
  acc = 0; last = performance.now(); stop = 0; shake = 0; parts = []; pops = []; hurt = { A: 0, B: 0 }; endAt = 0; cam = null;
  mode = 'battle'; show('none'); beginBattleFx();
}
function tourResult() {
  const at = tour.cur, x = tour.rounds[at.r][at.m];
  if (x.w === null) record(at, S);
  const j = judge(S), wn = j.side === 'A' ? tName(x.a) : tName(x.b);
  $('rtitle').textContent = wn + ' 승리!'; $('rtitle').className = 'rtitle win';
  $('rsub').textContent = S.label + ' · ' + (S.reason === 'ko' ? TX('ko') + '(' + S.t.toFixed(1) + '초)' : '시간 끝 → ' + j.res) + '\n남은 ' + TX('hp') + '　' + tName(x.a) + ' ' + Math.ceil(S.A.hp) + '　' + tName(x.b) + ' ' + Math.ceil(S.B.hp);
  $('rprog').innerHTML = '';
  $('next').hidden = false; $('next').innerHTML = '대진표로'; $('next').classList.remove('ura');
  $('again').hidden = false; $('again').textContent = '이 경기 다시 보기'; $('again').className = 'sub';
  $('redraw').hidden = true; $('share').hidden = true; $('vstitle').hidden = true;
  SFX.play(champion() !== null ? 'clear' : 'win');
}

// ---------- 화면 ----------
let tourMsg = '';
function showTour(msg) {
  $('slots').hidden = false;
  mode = 'tour'; show('tourbox'); SFX.music('title');
  tourMsg = msg || '';
  renderTour();
}
function previewCanvas(i, size) {
  const c = document.createElement('canvas'); c.width = c.height = size * 2; c.className = 'tprev';
  drawPreview(c, tDesign(i), tColor(i)); return c;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text, fn, disabled) { const b = el('button', cls, text); b.disabled = !!disabled; b.addEventListener('click', e => { e.preventDefault(); fn(); }); return b; }

function renderTour() {
  const body = $('tourbody'); body.innerHTML = '';
  if (tourMsg) body.appendChild(el('div', 'tmsg', tourMsg));
  if (!tour.rounds) renderSetup(body); else renderBracket(body);
}
// 대진표가 없을 때: 학급 토너먼트는 로비(각자 기기로 그리기)에서 시작
function renderSetup(body) {
  body.appendChild(el('div', 'note', '학급 토너먼트는 「🏆 학급 토너먼트」 로비에서 방을 만들고, 아이들이 각자 기기로 그린 몬스터로 시작해요.'));
  const row = el('div', 'rbtns');
  row.appendChild(btn('main', '🏆 로비로 가기', () => showLobby()));
  row.appendChild(btn('sub', '처음 화면으로', showTitle));
  body.appendChild(row);
}
function renderBracket(body) {
  const ch = champion();
  if (ch !== null) {
    const box = el('div', 'tchamp');
    box.appendChild(el('div', 'tchamp-t', '🏆 우승'));
    box.appendChild(previewCanvas(ch, 70));
    box.appendChild(el('div', 'tchamp-n', tName(ch)));
    body.appendChild(box);
    if (!tour.champShown) { tour.champShown = true; saveTour(); SFX.play('fanfare'); }
  }
  const nx = nextMatch();
  const top = el('div', 'rbtns');
  if (nx) {
    const x = tour.rounds[nx.r][nx.m];
    top.appendChild(el('div', 'tnext', '다음: ' + roundName(nx.r) + ' — ' + tName(x.a) + ' vs ' + tName(x.b)));
    top.appendChild(btn('main', '▶ 경기 보기', () => startTourMatch(nx)));
    top.appendChild(btn('sub', '⚡ 결과만', () => { simQuick(nx); tourMsg = ''; renderTour(); SFX.play('tap'); }));
  }
  body.appendChild(top);
  const wrap = el('div', 'tbracket');
  tour.rounds.forEach((rd, r) => {
    wrap.appendChild(el('div', 'tround', roundName(r)));
    rd.forEach((x, m) => {
      const row = el('div', 'tmatch' + (nx && nx.r === r && nx.m === m ? ' now' : ''));
      const side = i => {
        const s = el('span', 'tside');
        if (i === null) { s.textContent = '?'; s.classList.add('tq'); return s; }   // 아직 안 정해진 자리
        s.appendChild(el('i', 'tdot')).style.background = tColor(i);
        s.appendChild(document.createTextNode(tName(i)));
        if (x.w !== null) s.classList.add(x.w === i ? 'twin' : 'tlose');
        return s;
      };
      if (x.b === null && x.res === '부전승') { row.appendChild(side(x.a)); row.appendChild(el('span', 'tres', '부전승')); }
      else {
        row.appendChild(side(x.a)); row.appendChild(el('span', 'tvs', 'vs')); row.appendChild(side(x.b));
        if (x.w !== null) {
          row.appendChild(el('span', 'tres', x.res));
          const at = { r, m };
          row.appendChild(btn('sub tx', '▶', () => startTourMatch(at)));   // 끝난 경기 다시 보기
        }
      }
      wrap.appendChild(row);
    });
  });
  body.appendChild(wrap);
  const etc = el('div', 'rbtns small');
  if (nx) etc.appendChild(btn('sub', '⚡ 남은 경기 모두 결과만', () => { let at; while ((at = nextMatch())) simQuick(at); tourMsg = ''; renderTour(); }));
  etc.appendChild(btn('sub', '🔀 대진 다시 섞기', () => { makeBracket(); tourMsg = '대진을 다시 섞었어'; renderTour(); }));
  etc.appendChild(btn('sub', '처음 화면으로', showTitle));
  body.appendChild(etc);
}
