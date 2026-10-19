'use strict';
/* 3D 단계 구분도 돌려 보기·높이 움직임(assets/js/map3d.js, 2026-10-18 선택형): 기본값 불변(바꾸기 전 출력 해시), 보기 회전·역회전, 보이는 벽·깊이 정렬,
   옆벽 명암 단계, 높이 보간 양 끝·배율 고정·거리순 늦춤, 움직임 줄이기, 다시 투영 = 그 보기로 새로 그린 것, 끌기 조작(문턱·두 손가락). 화면 사진은 찍지 않는다(가짜 DOM). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const M3 = require('../../assets/js/map3d.js');
const J = require('../../assets/js/overview.js');
const O = require('../../lib/board/metro-overview.ts');
const V = require('../../lib/board/projects-view.ts');
const RM = require('../../data/board/region-map.json');
const KS = require('../../data/board/korea-sido.json');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const CAL = require('../../data/board/region-calendar.json');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/* ---------- 가짜 DOM: 이 모듈이 만드는 svg 문자열을 읽는 작은 파서 + 모듈이 쓰는 만큼의 요소 API ---------- */
class El {
  constructor(tag, doc) {
    this.tagName = tag; this.attrs = new Map(); this.children = []; this.parentNode = null; this.ownerDocument = doc;
    const at = this.attrs, key = (k) => 'data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    this.dataset = new Proxy({}, { get: (_, k) => at.get(key(k)), set: (_, k, v) => (at.set(key(k), String(v)), true), deleteProperty: (_, k) => (at.delete(key(k)), true) });
    this.classList = { contains: (c) => this.cls().includes(c), add: (c) => { if (!this.classList.contains(c)) at.set('class', [...this.cls(), c].join(' ')); }, remove: (c) => at.set('class', this.cls().filter((x) => x !== c).join(' ')), toggle: (c, on) => (on ? this.classList.add(c) : this.classList.remove(c)) };
  }
  cls() { return (this.attrs.get('class') || '').split(/\s+/).filter(Boolean); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  get nextSibling() { const p = this.parentNode; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  insertBefore(n, ref) { n.remove(); n.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  appendChild(n) { return this.insertBefore(n, null); }
  set innerHTML(s) {
    this.children = []; const stack = [this];
    for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g)) {
      const top = stack[stack.length - 1];
      if (m[5] != null) { if (m[5].trim()) top.children.push({ text: m[5] }); continue; }
      if (m[1]) { stack.pop(); continue; }
      const e = new El(m[2], this.ownerDocument); for (const a of m[3].matchAll(/([\w:-]+)="([^"]*)"/g)) e.attrs.set(a[1], a[2]);
      top.appendChild(e); if (!m[4]) stack.push(e);
    }
  }
  /* 찾기: ':scope > .a' (바로 아래) · '.a.b' (안쪽 어디든), 쉼표 목록 */
  querySelectorAll(sel) {
    const out = [];
    for (const part of sel.split(',').map((x) => x.trim())) {
      const direct = part.startsWith(':scope >'), want = part.replace(':scope >', '').trim().split('.').filter(Boolean);
      const ok = (e) => e instanceof El && want.every((c) => e.cls().includes(c));
      const walk = (e) => { for (const c of e.children) { if (ok(c) && !out.includes(c)) out.push(c); if (!direct && c instanceof El) walk(c); } };
      walk(this);
    }
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
/* 직렬화(속성 이름순). 바다 둘레(.sea)는 면 고리를 그리는 순서대로 이어 붙인 한 경로라 높이 전환 중에는 고리 순서만 옛 것으로 남는다(모양 같음) — 고리 집합으로 비교 */
const attrOf = (e, k, v) => (k === 'd' && e.cls().includes('sea') ? (v.match(/M[^Z]*Z/g) || []).sort().join('') : v);
const ser = (e) => (e instanceof El ? `<${e.tagName}${[...e.attrs].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => ` ${k}="${attrOf(e, k, v)}"`).join('')}>${e.children.map(ser).join('')}</${e.tagName}>` : e.text.trim());
const fakeWin = (reduced) => {
  const q = new Map(); let now = 0, id = 0;
  return { q, matchMedia: (m) => ({ matches: !!reduced && /reduce/.test(m) }), requestAnimationFrame: (f) => (q.set(++id, f), id), cancelAnimationFrame: (i) => { q.delete(i); }, setTimeout: (f) => f && 0,
    /* rAF 를 ms 만큼 앞으로: 쌓인 콜백을 그 시각으로 부른다 */
    tick(ms) { now += ms; const fs2 = [...q.values()]; q.clear(); for (const f of fs2) f(now); } };
};
const svgOf = (win) => { const doc = { defaultView: win, createElementNS: (ns, tag) => new El(tag, doc) }; return new El('svg', doc); };
/* draw 가 쓰는 화소 판·글자 폭(전역 document): 빈 판(가림 맞춤은 그대로 Hmax0)과 글자 수 비례 폭 */
globalThis.Path2D = class { constructor(d) { this.d = d; } };
globalThis.getComputedStyle = () => ({ fontFamily: 'sans' });
globalThis.document = { body: {}, createElement: () => ({ width: 0, height: 0, getContext: () => ({ fill() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, set font(v) {}, measureText: (t) => ({ width: t.length * 13 }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) }) };

/* ---------- 입력: 자료 기하(region-map·korea-sido) + 합성 높이 값(원장 갱신과 무관 — 코드에서 정한다, 67곳 가운데 14곳이 0) ---------- */
const DOC = O.metroOverview(RM, { rows: V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg), sggNames: IDX.sgg, calendar: CAL, referenceDate: MAP.referenceDate });
const seed = J.seedOf(DOC.units), base = M3.prep(seed);
const nation = { view: KS.view, sido: KS.sido }, nat = M3.prep(nation.sido.map((x) => ({ code: x.s, s: x.s, n: x.n, d: x.d, lx: x.l[0], ly: x.l[1] })));
const uOf = Object.fromEntries(DOC.units.map((u) => { const n = Math.floor(+u.code / 10); return [u.code, n % 5 === 0 ? 0 : (n * 7919) % 20000 + 1]; }));
const cOf = (u) => (u ? 1 + Math.min(4, Math.floor(u / 4000)) : 0);
/* sido '' = 전국 무대(fit) 경우: 2026-10-18 /map 첫 화면이 수도권 보기로 바뀌어 개요는 더 쓰지 않지만, 공용 모듈의 fit 경로를 고정 해시로 지키려고 그때 옵션을 그대로 적는다 */
const NATION_FIT = { own: DOC.units.map((u) => u.code), isles: [], view: null, ctxBase: nat, ctxOmit: ['11', '28', '41'], fit: nation.view };
const geomOf = (sido, W, H, narrow, u = uOf) => M3.geom(base, { ...(sido ? J.scopeOf(DOC.units, sido, DOC.view) : NATION_FIT), W, H, narrow, uOf: u });
const optOf = (extra) => ({ units: DOC.units.map((u) => ({ key: u.code, name: u.name, u: uOf[u.code], c: cOf(uOf[u.code]) })), nameOf: () => '', hFloor: 8, aria: (x) => `${x.name} ${x.u}`, ...(extra || {}) });
const drawOf = (g, extra, win) => { const svg = svgOf(win || fakeWin(false)); const G = M3.draw(svg, g, optOf(extra)); return { svg, G }; };
/* 해시 대상: svg 속성·dataset·자식 문자열(가짜 DOM 이 받은 그대로) · G 가운데 라벨·키보드·칠하기가 쓰는 원래 열쇠 */
const GK = ['W', 'H', 'k', 's', 'ox', 'oy', 'T', 'Hmax', 'F', 'ctxL', 'ctxLs', 'ctxRings', 'narrow', 'inset', 'vis'];
const FK = ['x', 'u', 'h', 'R', 'G', 'd', 'isle', 'wall', 'outl', 'south', 'bx', 'by', 'area', 'vis', 'inset', 'tf'];
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));
const gHash = (G) => sha(JSON.stringify({ ...pick(G, GK), F: G.F.map((f) => pick(f, FK)) }));
const CASES = [['11', 1056, 811, false], ['28', 374, 360, true], ['28', 1056, 811, false], ['41', 1056, 811, false], ['', 1056, 811, false], ['', 374, 360, true]];

/* 바꾸기 전(2026-10-18, 돌려 보기 넣기 전 map3d.js) 출력: 입력 해시 · [geom JSON · draw 문자열 · G] 해시 */
const FROZEN_IN = '7a2bb18b051bda2e';
const FROZEN = {
  '11,1056,811,false': ['e6d4ef7a3e256d15', 'e6cb7ad688eab2ae', 'acd64441cbd4c019'],
  '28,374,360,true': ['c009b971f5ea55ad', '861cc4a1ebc49642', 'a75e9175e85c22c1'],
  '28,1056,811,false': ['059e6a6bed0fd7a3', 'dec92c5594589360', '4d9e451ceb92e11c'],
  '41,1056,811,false': ['7f5e90acb4e749de', '73f73bd643dd3f93', '401cb524e3c4b6c9'],
  ',1056,811,false': ['89724366f0a74731', 'bff2b3bc55e4bd88', 'b0f6a128d0f8feba'],
  ',374,360,true': ['c611246da981fe34', '9a29589d8ed791e8', '145215ce9f1a52cf'],
};
/* 바꾸기 전 하네스는 svg 를 { 속성 · dataset · innerHTML 문자열 } 로 떴다 — 같은 모양으로 다시 뜬다(가짜 DOM 을 거치지 않는 문자열 판) */
const legacyStr = (g, extra) => {
  const at = {}, svg = { dataset: {}, setAttribute(k, v) { at[k] = String(v); }, set innerHTML(s) { this.html = s; }, ownerDocument: { defaultView: null } };
  const G = M3.draw(svg, g, optOf(extra)); return { str: JSON.stringify(at) + JSON.stringify(svg.dataset) + svg.html, G };
};
const inputHash = sha(JSON.stringify(seed) + JSON.stringify(KS.sido) + JSON.stringify(DOC.view));

test('기본값 불변: 서울·인천(휴대폰·넓은 화면)·경기·전국 보기(넓은 화면·휴대폰)의 geom·draw 문자열·G 가 돌려 보기를 넣기 전과 바이트 단위로 같다 — view 없음 · { bearing: 0, k: geom 의 k } · shade 끔 모두', (t) => {
  if (inputHash !== FROZEN_IN) return t.skip(`경계 자료(region-map·korea-sido)가 바뀌어 고정 해시를 쓸 수 없다(입력 ${inputHash}) — 바꾸기 전 모듈로 다시 떠야 한다`);
  for (const c of CASES) {
    const g = geomOf(...c), [hg, hd, hG] = FROZEN[c.join()];
    assert.equal(sha(JSON.stringify(g)), hg, `${c} geom`);
    for (const extra of [undefined, { view: { bearing: 0, k: g.k } }, { view: null, shade: false }, { umax: 0 }]) {
      const { str, G } = legacyStr(g, extra);
      assert.equal(sha(str), hd, `${c} draw ${JSON.stringify(extra)}`); assert.equal(gHash(G), hG, `${c} G`);
      assert.ok(!('V' in G), '기본 보기에는 보기 변환이 없다');
    }
    assert.equal(M3.project(g, { bearing: 0, k: g.k }), g, '기본 보기 투영 = 기하 그대로(같은 객체)');
    assert.equal(M3.project(g, null), g);
  }
  /* 기존 함수 모양: faceH 는 배율을 주지 않으면 예전과 같다 */
  assert.deepEqual(M3.faceH([0, 5, 10], 4, 40), M3.faceH([0, 5, 10], 4, 40, undefined));
  assert.deepEqual(M3.faceH([0, 5, 10], 4, 40, 10), M3.faceH([0, 5, 10], 4, 40));
});

test('보기 회전: viewPt ∘ unviewPt = 항등(±30°·k .55~.85), 범위 밖은 자르고, 기본 보기는 null · 돌린 기하는 이웃 호를 같은 점으로 써서 틈이 없고 무대 상자 안에 든다', () => {
  const g = geomOf('41', 1056, 811, false);
  assert.equal(M3.viewOf(g, null), null); assert.equal(M3.viewOf(g, { bearing: 0, k: g.k }), null); assert.equal(M3.viewOf(g, { bearing: 0 }), null, 'k 를 빼면 geom 의 k');
  const Vc = M3.viewOf(g, { bearing: 99, k: 2 }); assert.equal(Vc.bearing, 30); assert.equal(Vc.k, .85);
  assert.equal(M3.viewOf(g, { bearing: -99, k: 0 }).bearing, -30); assert.equal(M3.viewOf(g, { bearing: 1, k: 0 }).k, .55);
  for (const b of [-30, -12.5, 7, 30]) for (const k of [.55, g.k, .85]) {
    const Vv = M3.viewOf(g, { bearing: b, k }); assert.ok(Vv && Vv.f > 0 && Vv.f <= 1, `줄임 비율 ${Vv && Vv.f}`);
    for (const p of [[0, 0], [500, 300], [Vv.cx, Vv.cy], [1056, 811]]) {
      const q = M3.unviewPt(Vv, M3.viewPt(Vv, p)); assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9, `${b}° ${k} 역회전`);
    }
    assert.ok(Math.abs(Vv.dx) < 200 && Math.abs(Vv.dy) < 200, '돌린 모양 상자 가운데를 처음 가운데로 옮기는 양');
  }
  /* +bearing = 화면에서 시계 방향: 축 오른쪽 점은 아래로 */
  const V1 = M3.viewOf(g, { bearing: 20, k: g.k }); assert.ok(M3.viewPt(V1, [V1.cx + 100, V1.cy])[1] > V1.cy);
  /* 돌린 기하: 판 면끼리 맞닿은 조각의 끝점이 양쪽에서 같다(틈 없음), 모든 점이 처음 땅 상자 안 */
  const gv = M3.project(g, { bearing: 25, k: .62 }), key = (p) => p.join();
  assert.equal(gv.V.bearing, 25); assert.equal(gv.k, .62); assert.equal(gv.inset, g.inset, '섬 삽입 지도는 돌리지 않는다');
  const ends = new Map();
  for (const q of gv.own) for (const r of q.rings) for (const pc of r.pieces) if (pc.nb) { const e = [key(pc.pts[0]), key(pc.pts[pc.pts.length - 1])].sort().join('|'); ends.set(e, (ends.get(e) || 0) + 1); }
  assert.ok([...ends.values()].filter((n) => n >= 2).length > 30, '맞닿은 조각 끝점이 양쪽에서 같은 값');
  const b0 = [Infinity, Infinity, -Infinity, -Infinity], b1 = b0.slice(), add = (b) => ([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
  for (const q of g.own) for (const r of q.rings) r.pts.forEach(add(b0)); for (const c of g.ctx) for (const r of c.rings) r.forEach(add(b0));
  for (const q of gv.own) for (const r of q.rings) r.pts.forEach(add(b1)); for (const c of gv.ctx) for (const r of c.rings) r.forEach(add(b1));
  assert.ok(b1[0] >= b0[0] - .1 && b1[1] >= b0[1] - .1 && b1[2] <= b0[2] + .1 && b1[3] <= b0[3] + .1, `돌린 땅 ${b1.map(Math.round)} ⊂ 처음 땅 ${b0.map(Math.round)}`);
  /* 사업 점(ptXY): 돌린 보기면 같은 변환을 따른다, 기본 보기는 예전 식 그대로 */
  const f = { h: 6 }, p = [2000, 600];
  assert.deepEqual(M3.ptXY(g, f, p), [g.ox + p[0] * g.s, g.oy + p[1] * g.k * g.s - 6]);
  const gw = { ...g, V: gv.V, k: gv.k }, base0 = [g.ox + p[0] * g.s, g.oy + p[1] * g.k * g.s], v = M3.viewPt(gv.V, base0);
  assert.deepEqual(M3.ptXY(gw, f, p), [v[0], v[1] - 6]);
});

test('보이는 벽: 기본 보기 faces = draw 의 벽 그대로, 돌리면 보는 쪽(화면 아래)을 향한 변이 바뀐다(정사각형: +30° 는 아래 변이 왼쪽 아래를 봐 밝은 벽 l1, −30° 는 어두운 l3) · 그리는 순서 = 높이 → 돌린 뒤 깊이', () => {
  const g = geomOf('41', 1056, 811, false), { G } = drawOf(g);
  const F0 = M3.faces(g, optOf(), { hs: G.st.hs });
  assert.deepEqual(F0.map((f) => [f.x.key, f.wall, f.d, f.outl]), G.F.filter((f) => !f.inset).map((f) => [f.x.key, f.wall, f.d, f.outl]), '기본 보기 벽 집합·윗면·둘레 = draw');
  /* 돌리면 벽 집합이 바뀐다(같은 높이에서) */
  const F30 = M3.faces(M3.project(g, { bearing: 30, k: g.k }), optOf(), { hs: G.st.hs });
  assert.ok(F30.filter((f) => f.wall).length > 10 && F30.some((f, i) => f.wall !== F0.find((q) => q.x.key === f.x.key).wall), '돌린 보기 벽이 다르다');
  /* 정사각형 한 면: 벽 넓이(단계별) */
  const sq = M3.prep([{ code: '11010', s: '11', n: '네모', d: 'M100 100l200 0 0 200 -200 0z', lx: 200, ly: 200 }]);
  const gs = M3.geom(sq, { own: ['11010'], W: 400, H: 400, narrow: false, uOf: { '11010': 5 } });
  const areaOf = (s) => { let a = 0; for (const m of s.matchAll(/M([^Z]+)Z/g)) a += Math.abs(M3.ringArea(m[1].split('L').map((q) => q.split(' ').map(Number)))); return a; };
  const tiers = (b) => M3.faces(M3.project(gs, { bearing: b, k: gs.k }), { units: [], shade: true }, { hs: [20] })[0].walls.slice(1).map(areaOf);
  const [a1, a2, a3] = tiers(0), [p1, , p3] = tiers(30), [m1, , m3] = tiers(-30);
  assert.ok(a2 > a1 * 2 && a2 > a3 * 2 && Math.abs(a1 - a3) < a1 * .05, `기본: 아래 변(보는 쪽) 벽이 대부분 l2 ${[a1, a2, a3].map(Math.round)}`);
  assert.ok(p1 > p3 && m3 > m1 && Math.abs(p1 - m3) < p1 * .05, `+30° 밝은 쪽 ${[p1, p3].map(Math.round)} · −30° 어두운 쪽 ${[m1, m3].map(Math.round)} (좌우 대칭)`);
  /* 그리는 순서: 높이가 같으면 화면 아래쪽 끝(south)이 작은 것 = 먼 것부터, 돌린 뒤 좌표로 */
  const same = g.own.map(() => 10);
  const ord = (b) => M3.faces(M3.project(g, { bearing: b, k: g.k }), optOf(), { hs: same });
  for (const b of [-30, 0, 30]) { const F = ord(b); for (let i = 1; i < F.length; i++) assert.ok(F[i - 1].south <= F[i].south, `${b}° 깊이 정렬`); }
  assert.notDeepEqual(ord(-30).map((f) => f.x.key), ord(30).map((f) => f.x.key), '돌리면 멀리·가까이 순서가 바뀐다');
  const mixed = M3.faces(g, optOf(), { hs: G.st.hs }); for (let i = 1; i < mixed.length; i++) assert.ok(mixed[i - 1].h < mixed[i].h || (mixed[i - 1].h === mixed[i].h && mixed[i - 1].south <= mixed[i].south), '높이 오름차순 먼저');
});

test('옆벽 명암 단계: 빛은 위 왼쪽 — 왼쪽을 향한 벽 1 · 보는 쪽 2 · 오른쪽을 향한 벽 3, 단계별 벽을 합치면 전체 벽 · 끄면(기본) 단계 없음 · CSS 는 --c·--map-shade 섞는 비율만(라이트·다크)', () => {
  assert.deepEqual([-1, -.41, -.4, 0, .4, .41, 1].map(M3.wallTier), [1, 1, 2, 2, 2, 3, 3]);
  const g = geomOf('41', 1056, 811, false), gv = M3.project(g, { bearing: 18, k: .7 }), hs = drawOf(g).G.st.hs;
  const segs = (s) => (s.match(/M[^Z]+Z/g) || []).sort();
  for (const f of M3.faces(gv, optOf({ shade: true }), { hs })) {
    assert.equal(f.walls.length, 4); assert.equal(f.walls[0], '');
    assert.deepEqual(segs(f.walls.join('')), segs(f.wall), `${f.x.key}: 단계별 벽 합 = 전체 벽`);
  }
  assert.ok(M3.faces(gv, optOf(), { hs }).every((f) => !('walls' in f)), '명암을 끄면 단계 없음');
  /* 명암을 켠 draw: 벽 경로는 단계마다(.w.lN), 그 밖은 기본과 같다 */
  const on = drawOf(g, { shade: true }), off = drawOf(g);
  const strip = (el) => ser(el).replace(/<path[^>]*class="w [^"]*"[^>]*><\/path>/g, '');
  assert.equal(strip(on.svg), strip(off.svg), '벽 말고는 같다');
  assert.match(ser(on.svg), /class="w c\d l1"/); assert.match(ser(on.svg), /class="w c\d l3"/); assert.doesNotMatch(ser(off.svg), /class="w c\d l\d"/);
  const css = read('assets/css/map3d.css');
  for (const t of ['l1', 'l3']) {
    assert.match(css, new RegExp(`\\n\\.map \\.w\\.${t} \\{ fill: color-mix\\(in srgb, var\\(--c\\) \\d+%, var\\(--map-shade\\)\\); \\}`), `라이트 ${t}`);
    assert.match(css, new RegExp(`\\n\\.dark \\.map \\.w\\.${t} \\{ fill: color-mix\\(in srgb, var\\(--c\\) \\d+%, var\\(--map-shade\\)\\); \\}`), `다크 ${t}`);
    assert.match(css, new RegExp(`\\.map \\.lift \\.up-w\\.${t} \\{ fill: color-mix\\(in srgb, var\\(--c\\) \\d+%, var\\(--map-shade\\)\\); \\}`), `띄운 사본 ${t}`);
  }
  /* 밝기 순서: l1 > 기본(l2) > l3 (면 색 비율) */
  const pct = (re) => +css.match(re)[1];
  assert.ok(pct(/\n\.map \.w\.l1 \{[^}]*var\(--c\) (\d+)%/) > pct(/\n\.map \.w \{ fill: color-mix\(in srgb, var\(--c\) (\d+)%/) && pct(/\n\.map \.w \{ fill: color-mix\(in srgb, var\(--c\) (\d+)%/) > pct(/\n\.map \.w\.l3 \{[^}]*var\(--c\) (\d+)%/));
  assert.ok(pct(/\.dark \.map \.w\.l1 \{[^}]*var\(--c\) (\d+)%/) > pct(/\.dark \.map \.w \{ fill: color-mix\(in srgb, var\(--c\) (\d+)%/) && pct(/\.dark \.map \.w \{ fill: color-mix\(in srgb, var\(--c\) (\d+)%/) > pct(/\.dark \.map \.w\.l3 \{[^}]*var\(--c\) (\d+)%/));
});

test('높이 보간: 계획의 양 끝(0ms = 시작 높이 · 끝 = 목표 높이, 정확히), 지수형 감속(단조), 배율 umax 고정(여러 상태를 한 배율로 · 넘는 값은 Hmax), 처음 솟음(from {} → 0 에서) · 거리순 늦춤', () => {
  assert.equal(M3.easeOutExpo(0), 0); assert.equal(M3.easeOutExpo(1), 1); assert.equal(M3.easeOutExpo(2), 1);
  for (let i = 1; i < 10; i++) assert.ok(M3.easeOutExpo(i / 10) > M3.easeOutExpo((i - 1) / 10) && M3.easeOutExpo(i / 10) > i / 10, '지수형 감속: 처음 빠르다');
  const g = geomOf('41', 1056, 811, false), { G } = drawOf(g), own = g.own;
  const next = Object.fromEntries(own.map((q, i) => [q.code, (i % 4) * 3000]));
  const P = M3.heightPlan(G, next, { duration: 500 });
  assert.deepEqual(P.h0, G.st.hs, '시작 = 지금 높이'); assert.equal(P.Hmax, G.Hmax); assert.equal(P.total, 500);
  assert.deepEqual(M3.heightsAt(P, 0), P.h0); assert.deepEqual(M3.heightsAt(P, 500), P.h1); assert.deepEqual(M3.heightsAt(P, Infinity), P.h1); assert.deepEqual(M3.heightsAt(P, -5), P.h0);
  assert.deepEqual(P.h1, M3.faceH(own.map((q) => next[q.code]), 4, G.Hmax), '배율을 주지 않으면 그 상태의 최댓값(그린 때와 같은 식)');
  const mid = M3.heightsAt(P, 250); mid.forEach((h, i) => assert.ok(h >= Math.min(P.h0[i], P.h1[i]) - 1e-9 && h <= Math.max(P.h0[i], P.h1[i]) + 1e-9));
  /* 배율 고정: 2027 → 2030 처럼 두 상태를 같은 umax 로 — 같은 값은 같은 높이, 배율보다 큰 값은 Hmax */
  const A = Object.fromEntries(own.map((q) => [q.code, 4000])), B = Object.fromEntries(own.map((q, i) => [q.code, i ? 4000 : 50000]));
  const PA = M3.heightPlan(G, A, { umax: 20000 }), PB = M3.heightPlan(G, B, { umax: 20000 });
  assert.equal(PA.h1[1], PB.h1[1], '같은 배율 · 같은 값 = 같은 높이'); assert.equal(PB.h1[0], G.Hmax, '배율을 넘는 값은 Hmax 에서 멈춘다');
  assert.ok(PA.h1[1] < M3.heightPlan(G, A, {}).h1[1], '배율을 고정하지 않으면 그 상태 최댓값이 Hmax(더 높다)');
  /* 처음 솟음: from {} → 모두 0 에서, 기준 면에서 멀수록 늦게 */
  const org = own[0].code, R = M3.heightPlan(G, uOf, { from: {}, duration: 400, stagger: { origin: org, msPerPx: 1.5 } });
  assert.ok(R.h0.every((h) => h === 0)); assert.equal(R.delay[0], 0, '기준 면은 바로');
  const far = R.delay.indexOf(Math.max(...R.delay)); assert.equal(R.total, 400 + R.delay[far]);
  assert.ok(Math.abs(R.delay[far] - Math.hypot(own[far].lp[0] - own[0].lp[0], own[far].lp[1] - own[0].lp[1]) * 1.5) < 1e-9, '늦춤 = 라벨 점 거리 × msPerPx');
  const at = M3.heightsAt(R, R.delay[far]); assert.equal(at[far], 0, '늦춤이 끝나기 전에는 시작 높이'); assert.equal(M3.heightsAt(R, 400)[0], R.h1[0], '기준 면은 400ms 에 끝');
  const pt = M3.heightPlan(G, uOf, { from: {}, stagger: { origin: [0, 0], msPerPx: 1 } }); assert.ok(pt.delay.every((d, i) => Math.abs(d - Math.hypot(...own[i].lp)) < 1e-9), '기준 = 화면 점');
});

test('움직임 줄이기: matchMedia(reduce) 면 바로 마지막 상태 + onEnd(같은 호출 안), 아니면 rAF 로 보간하고 끝에서 목표와 같은 그림 — 다시 투영(reproject)·높이 전환 결과 = 그 보기·그 값으로 새로 그린 것', () => {
  assert.equal(M3.reducedMotion(fakeWin(true)), true); assert.equal(M3.reducedMotion(fakeWin(false)), false);
  assert.equal(M3.reducedMotion(null), false); assert.equal(M3.reducedMotion({}), false);
  for (const c of [['41', 1056, 811, false], ['28', 374, 360, true], ['', 1056, 811, false]]) {
    const g = geomOf(...c);
    /* 다시 투영: 기본 → 돌린 보기 = 돌린 보기로 바로 그린 것, 다시 기본 = 처음 그림 */
    for (const extra of [{}, { shade: true }]) {
      const a = drawOf(g, extra), first = ser(a.svg), view = { bearing: -22, k: .78 };
      M3.reproject(a.svg, a.G, { bearing: 9, k: .6 }, { sea: false }); M3.reproject(a.svg, a.G, view, { sea: false });   // 끄는 동안(바다 둘레 건너뜀)
      assert.equal(ser(a.svg.querySelector('.sea')), ser(drawOf(g, extra).svg.querySelector('.sea')), 'sea: false 면 바다 둘레는 그대로');
      M3.reproject(a.svg, a.G, view);   // 놓을 때 한 번 전부
      const b = drawOf(g, { ...extra, view });
      assert.equal(ser(a.svg), ser(b.svg), `${c} ${JSON.stringify(extra)} 다시 투영 = 새로 그림`);
      assert.equal(gHash(a.G), gHash(b.G)); assert.deepEqual(a.G.V, b.G.V); assert.deepEqual([a.G.ctxL, a.G.ctxLs, a.G.ctxRings], [b.G.ctxL, b.G.ctxLs, b.G.ctxRings]);
      M3.reproject(a.svg, a.G, { bearing: 0, k: g.k });
      assert.equal(ser(a.svg), first, `${c} 기본 보기로 돌아오면 처음 그림`); assert.ok(!('V' in a.G));
    }
    /* 높이 전환: 줄이기면 즉시, 그림 = 그 값으로 그린 것 */
    const u2 = Object.fromEntries(Object.entries(uOf).map(([k, v]) => [k, v ? 20001 - v : 7000]));
    const target = ser(drawOf(geomOf(...c, u2)).svg);
    const r = drawOf(g, {}, fakeWin(true)); let ended = 0;
    const h = M3.animateHeights(r.svg, r.G, u2, { onEnd: () => ended++ });
    assert.equal(ended, 1, '줄이기: onEnd 를 바로'); assert.equal(ser(r.svg), target, `${c} 줄이기: 바로 마지막 상태`); assert.equal(r.svg.ownerDocument.defaultView.q.size, 0, 'rAF 없음');
    h.cancel(); h.finish(); assert.equal(ended, 1, '끝난 뒤 cancel·finish 는 아무것도 안 한다');
    /* rAF: 0ms 는 시작 상태, 끝나면 목표 그림, 진행률은 0~1 */
    const win = fakeWin(false), m = drawOf(g, {}, win), start = ser(m.svg), prog = []; let done = 0;
    M3.animateHeights(m.svg, m.G, u2, { duration: 300, onFrame: (p) => prog.push(p), onEnd: () => done++ });
    assert.equal(ser(m.svg), start, '시작 상태(첫 프레임 전)');
    win.tick(0); win.tick(150); assert.equal(done, 0); assert.notEqual(ser(m.svg), start); assert.notEqual(ser(m.svg), target);
    win.tick(200); assert.equal(done, 1); assert.equal(ser(m.svg), target, `${c} 끝 = 목표`); assert.equal(win.q.size, 0);
    assert.ok(prog.length >= 2 && prog.every((p, i) => p >= 0 && p <= 1 && (!i || p >= prog[i - 1])));
    /* 돌린 보기에서도 높이 전환 = 그 보기·그 값으로 그린 것 */
    const vw = { bearing: 14, k: .66 }, z = drawOf(g, { view: vw }, fakeWin(true));
    M3.animateHeights(z.svg, z.G, u2, {}); assert.equal(ser(z.svg), ser(drawOf(geomOf(...c, u2), { view: vw }).svg));
  }
  /* 처음 솟음은 같은 API: from {} 의 0ms = 모두 평평(옆벽 없음) */
  const win = fakeWin(false), s = drawOf(geomOf('11', 1056, 811, false), {}, win);
  M3.animateHeights(s.svg, s.G, uOf, { from: {}, stagger: { origin: s.G.st.gv.own[0].code, msPerPx: 1 } });
  const w0 = s.svg.querySelectorAll('.w').length; assert.ok(s.svg.querySelectorAll('.fg').every((e) => e.dataset.h === '0.00'), '0ms: 모두 평평(판 두께 둘레 벽만)');
  win.tick(0); win.tick(1e5); assert.ok(s.svg.querySelectorAll('.w').length > w0 + 5, `끝: 이웃보다 높은 면의 옆벽이 생긴다 ${w0} → ${s.svg.querySelectorAll('.w').length}`);
  /* 하던 전환 위에 새 전환: 앞 것은 그 자리에서 멈추고 거기서 이어 간다 */
  const w2 = fakeWin(false), q = drawOf(geomOf('11', 1056, 811, false), {}, w2); let e1 = 0;
  M3.animateHeights(q.svg, q.G, {}, { duration: 400, onEnd: () => e1++ }); w2.tick(0); w2.tick(100);
  const midH = q.G.st.hs.slice(), P2 = M3.heightPlan(q.G, uOf, {}); assert.deepEqual(P2.h0, midH);
  M3.animateHeights(q.svg, q.G, uOf, { duration: 400 }); w2.tick(1e5); assert.equal(e1, 0, '멈춘 전환의 onEnd 는 부르지 않는다');
});

test('끌기 조작: orbitStep(가로 = 돌기, 세로 = 기울기, 비틂 = 돌기, 범위 자름), attachOrbit — 4px 문턱 전에는 끌기 아님(click 그대로), 넘으면 onStart · rAF 로 set · 뗄 때 onEnd + 이어지는 click 하나 삼킴, 터치는 두 손가락만', () => {
  assert.deepEqual(M3.orbitStep({ bearing: 0, k: .7 }, 40, 0), { bearing: -10, k: .7 }, '오른쪽으로 40px = 반시계 10°');
  assert.ok(Math.abs(M3.orbitStep({ bearing: 0, k: .7 }, 0, 20).k - .73) < 1e-12, '아래로 끌면 더 내려다본다');
  assert.deepEqual(M3.orbitStep({ bearing: 25, k: .84 }, -400, 400), { bearing: 30, k: .85 }, '범위 자름');
  assert.deepEqual(M3.orbitStep({ bearing: 0, k: .7 }, 0, 0, { min: { bearing: -10 }, max: { bearing: 10 } }, 25), { bearing: 10, k: .7 }, '비틂 + 부르는 쪽 범위');
  /* 가짜 무대 */
  const L = {}, win = fakeWin(false), cls = new Set(), cap = [];
  const stage = { ownerDocument: { defaultView: win }, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) }, setPointerCapture: (id) => cap.push(id),
    addEventListener: (t, f, o) => (L[t] = L[t] || []).push([f, o]), removeEventListener: (t, f) => { L[t] = (L[t] || []).filter(([g]) => g !== f); } };
  const fire = (t, e) => { let stop = false, prevented = false; const ev = { ...e, type: t, stopImmediatePropagation: () => { stop = true; }, preventDefault: () => { prevented = true; } }; for (const [f, o] of (L[t] || []).slice()) { f(ev); if (o && o.once) L[t] = L[t].filter(([g]) => g !== f); if (stop) break; } return { stop, prevented }; };
  let view = { bearing: 0, k: .7 }; const log = [];
  const off = M3.attachOrbit(stage, { get: () => view, set: (v) => { view = v; log.push(['set', v]); }, onStart: (v) => log.push(['start', v]), onEnd: (v) => log.push(['end', v]) });
  const P = (x, y, extra) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...extra });
  /* 3px 이동 = 누름: 끌기 아님, click 그대로 */
  fire('pointerdown', P(100, 100)); fire('pointermove', P(103, 100)); fire('pointerup', P(103, 100));
  assert.deepEqual(log, []); assert.equal(fire('click', {}).stop, false, '누름은 click 그대로');
  /* 끌기 */
  fire('pointerdown', P(100, 100)); fire('pointermove', P(120, 100)); fire('pointermove', P(140, 110));
  assert.deepEqual(log.map((x) => x[0]), ['start'], 'set 은 rAF 에서(이동마다가 아니라 프레임마다 한 번)'); assert.ok(cls.has('orbiting')); assert.deepEqual(cap, [1]);
  win.tick(16); assert.equal(log.length, 2); assert.equal(log[1][1].bearing, -10); assert.ok(Math.abs(log[1][1].k - .715) < 1e-12);
  fire('pointermove', P(160, 110)); fire('pointerup', P(160, 110));
  assert.deepEqual(log.slice(2).map((x) => x[0]), ['set', 'end'], '뗄 때 남은 set 을 먼저'); assert.equal(log[3][1].bearing, -15); assert.ok(!cls.has('orbiting'));
  assert.equal(fire('click', {}).stop, true, '끈 뒤 click 하나 삼킴'); assert.equal(fire('click', {}).stop, false, '그다음 click 은 그대로');
  /* 터치: 한 손가락은 손대지 않는다(페이지 스크롤), 두 손가락은 기본 동작을 막고 비틂·세로로 */
  const T = (pts) => ({ touches: pts.map(([x, y]) => ({ clientX: x, clientY: y })) });
  assert.equal(fire('touchstart', T([[10, 10]])).prevented, false); assert.equal(fire('touchmove', T([[10, 60]])).prevented, false); fire('touchend', T([]));
  assert.equal(fire('pointerdown', P(0, 0, { pointerType: 'touch' })).prevented, false, '터치 포인터는 끌기로 보지 않는다');
  log.length = 0; view = { bearing: 0, k: .7 };
  assert.equal(fire('touchstart', T([[0, 0], [100, 0]])).prevented, true);
  assert.equal(fire('touchmove', T([[0, 0], [100, 100 * Math.tan(Math.PI / 18)]])).prevented, true);   // 10° 비틂
  win.tick(16); fire('touchend', T([[0, 0]]));
  assert.deepEqual(log.map((x) => x[0]), ['start', 'set', 'end']); assert.ok(Math.abs(log[1][1].bearing - 10) < 1e-9, '두 손가락 비틂 10° = 10° 돌기');
  off(); assert.ok(Object.values(L).every((a) => !a.length), '떼어 내면 사건 없음');
});

test('띄우기 전이·끌기 모양(map3d.css): 지수형 ease-out 짧은 전이, 새로 만든 사본은 @starting-style 바닥 자리에서, 줄이기 동작이면 전이·띄움 없음 · 끄는 동안 잡은 손 · 색 리터럴 없음', () => {
  const css = read('assets/css/map3d.css');
  assert.match(css, /\.map \.lift \.up, \.map \.lbls \.lb-g \{ transition: transform \.(1\d|2\d)s cubic-bezier\(\.16, 1, \.3, 1\); \}/);
  assert.match(css, /@starting-style \{ \.map \.lift \.up \{ transform: translateY\(0\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.map \.lift :is\(\.up, \.up-shd\), \.map \.lbls \.lb-g \{ transition: none; \} \}/);
  assert.match(css, /\.orbiting \.map, \.orbiting \.map :is\(\.f, \.w\) \{ cursor: grabbing; \}/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  /* 모듈: 프레임 안에서는 가림 맞춤(canvas)·라벨을 하지 않는다 */
  const m3 = read('assets/js/map3d.js'), body = (nm) => { const i = m3.indexOf(`  function ${nm}(`); return m3.slice(i, m3.indexOf('\n  }\n', i)); };
  for (const nm of ['sync', 'reproject', 'animateHeights', 'attachOrbit']) assert.doesNotMatch(body(nm), /getImageData|createElement\('canvas'\)|labels\(|innerHTML/, `${nm}: 화소 판·라벨·svg 다시 만들기 없음`);
});
