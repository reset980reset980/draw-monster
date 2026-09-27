// 놀이 방식(테마): 🔨 뿅망치(기본) · 🎈 풍선 터뜨리기 · 🥊 격투
// 물리·승부는 똑같고, 보이는 것·소리·말만 바뀜
'use strict';
const THEMES = {
  pong: {
    icon: '🔨', label: '뿅망치', start: '시작!', ko: '뿅 아웃!', big1: '좋아!', big2: '굉장해!',
    combo: '연속 뿅!', comboUnit: '번', down: '어질어질~', lose: '아쉽다!', hp: '기운', hitPop: '뿅!', hitWord: '뿅', timeup: '시간 끝',
  },
  balloon: {
    icon: '🎈', label: '풍선 터뜨리기', start: '시작!', ko: '풍선 끝!', big1: '좋아!', big2: '굉장해!',
    combo: '연속 톡톡!', comboUnit: '번', down: '어질어질~', lose: '아쉽다!', hp: '풍선', hitPop: '톡!', hitWord: '톡', timeup: '시간 끝',
  },
  fight: {
    icon: '🥊', label: '격투', start: '파이트!', ko: 'K.O.', big1: '강타!', big2: '필살!',
    combo: '콤보!', comboUnit: ' HIT', down: '다운!', lose: '졌다…', hp: 'HP', hitPop: null, hitWord: '펀치', timeup: '시간 끝',
  },
};
let THEME = (() => { try { const t = localStorage.getItem('drawrobot.theme'); return THEMES[t] ? t : 'pong'; } catch (e) { return 'pong'; } })();
const TX = k => THEMES[THEME][k];
const gentle = () => THEME !== 'fight';
function setTheme(t) { if (!THEMES[t]) return; THEME = t; try { localStorage.setItem('drawrobot.theme', t); } catch (e) {} }
// 풍선 테마: 몬스터마다 풍선 5개 (남은 기운에 따라 줄어듦)
const BALLOONS = 5;
const BALLOON_COLS = ['#ff5c8a', '#ffd54f', '#4fc3f7', '#81c784', '#ba68c8'];
function balloonsLeft(b) { return b.hp <= 0 ? 0 : Math.max(1, Math.ceil(b.hp / b.maxHp * BALLOONS)); }
const PASTEL = ['#ff8fb1', '#ffd54f', '#80deea', '#a5d6a7', '#ce93d8', '#ffffff'];
