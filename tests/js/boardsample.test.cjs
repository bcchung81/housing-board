'use strict';
// lib/board/sample.ts — 종합상황판 시안의 SAMPLE 계산을 옮긴 것이 원본과 같은 숫자를 내는지, 시안을 실행해 뽑은 기준값
// (tests/fixtures/board-sample-golden.json)과 비교한다. 시안의 데이터·식을 일부러 그대로 두었으므로 한 글자도 다르면 안 된다.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../lib/board/sample.ts');
const G = require('../fixtures/board-sample-golden.json');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);
const nearAll = (a, b, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => near(v, b[i], `${msg}[${i}]`)); };

test('46개 시점의 단계별 호수·병목·지연·주의·총량·문구가 시안과 같다', () => {
  assert.equal(G.months.length, S.LAST + 1);
  for (const g of G.months) {
    const m = g.m;
    nearAll(S.vals(m), g.vals, `vals ${m}`);
    nearAll(S.dStage(m), g.dStage, `dStage ${m}`);
    nearAll(S.inv(m), g.inv, `inv ${m}`);
    near(S.ip(S.AD, m), g.ad, `지연 ${m}`);
    near(S.ip(S.AW, m), g.aw, `주의 ${m}`);
    assert.equal(S.tot(m), g.tot, `총량 ${m}`);
    assert.equal(S.argmax(S.dStage(m)), g.bottleneck, `병목 ${m}`);
    assert.equal(S.ml(m), g.label);
    assert.equal(S.kind(m), g.kind);
    assert.equal(S.txTrend(m), g.txTrend, `추이 문구 ${m}`);
    assert.equal(S.txSnap(m), g.txSnap);
  }
  nearAll(S.RT, G.rt, 'RT');
  assert.equal(S.PEAK, G.peak);
  nearAll(S.TOPM, G.topm, 'TOPM');
});

test('시도 17곳과 지시 6건: 숫자·문구가 시안과 같고(원천 N곳만 실데이터로 바뀜), 시도는 행정표준코드로 이어진다', () => {
  assert.equal(S.REG.length, 17);
  S.REG.forEach((r, i) => { const g = G.region[i]; assert.deepEqual([r.n, r.d, r.w, r.ok, r.big, r.tot], [g.n, g.d, g.w, g.ok, g.big, g.tot]); assert.equal(S.txRegion(r), g.tx); });
  const dir = S.makeDir(14);   // 시안의 원천 수 14 를 넣으면 시안과 똑같아야 한다
  dir.forEach((d, i) => { const g = G.dir[i]; assert.deepEqual([d.date, d.t, d.m, d.p, d.q], [g.date, g.t, g.m, g.p, g.q]); near(d.dv ?? 0, g.dv ?? 0, `dv ${i}`); });
  assert.equal(S.makeDir(19)[5].m, '원천 19곳');
  const codes = require('../../data/board/molit.json').sido.map((s) => s.code);
  for (const r of S.REG) assert.ok(codes.includes(r.code), `${r.n} → ${r.code}`);
  assert.equal(S.REGION_CODE['광주'], '12'); assert.equal(S.REGION_CODE['전남'], '12');   // 2026-07 통합
});

test('리본 차트 기하: 좌표 상수, 총량 이음, 경계 샘플, 층 경로 문자열이 시안과 같다', () => {
  assert.deepEqual([S.PX0, S.PW, S.TOP, S.PH, S.BOT].map(Number), [G.consts.PX0, G.consts.PW, G.consts.TOP, G.consts.PH, G.consts.BOT]);
  near(S.PITCH, G.consts.PITCH, 'PITCH'); near(S.Y0, G.consts.Y0, 'Y0'); near(S.S2, G.consts.S2, 'S2');
  G.x.forEach(([v, x, t]) => { near(S.X(v), x, `X(${v})`); near(S.Tx(v), t, `Tx(${v})`); });
  assert.equal(S.GEO.length, G.geo.count);
  for (const s of G.geo.samples) { const g = S.GEO[s.i]; near(g.x, s.x, 'x'); nearAll(g.lw, s.lw, `lw ${s.i}`); nearAll(g.up, s.up, `up ${s.i}`); nearAll(g.dl, s.dl, `dl ${s.i}`); }
  assert.equal(S.rp(0, 0, S.NOW + 1, false), G.paths.layer0);
  assert.equal(S.rp(5, S.NOW + 1, S.LAST + 1, false), G.paths.layer5future);
  assert.equal(S.rp(3, 0, S.LAST + 1, true), G.paths.band3);
});

test('시도 타일 색 단계: 0 은 맨 앞, 경계값은 위 단계로 넘어간다', () => {
  assert.equal(S.rcls(0), 0); assert.equal(S.rcls(4.9), 1); assert.equal(S.rcls(5), 2); assert.equal(S.rcls(7), 3); assert.equal(S.rcls(8.5), 4); assert.equal(S.rcls(10), 5);
  assert.equal(S.RCOL.length, 6); assert.equal(S.RLAB.length, 6);
});

test('시점 → 월 문자열: 2025.01 이 0, 2026.10 이 NOW', () => {
  assert.equal(S.ymOf(0), '2025-01'); assert.equal(S.ymOf(S.NOW), '2026-10'); assert.equal(S.ymOf(S.LAST), '2028-10');
});

/* ── 종합상황판 이식: 위젯마다 SAMPLE 또는 실데이터 표지가 있다(가짜 수치가 실데이터처럼 보이지 않게) ── */
const fs = require('node:fs');
const path = require('node:path');
const board = fs.readFileSync(path.join(__dirname, '../../components/board/Board.tsx'), 'utf8');
const realRow = fs.readFileSync(path.join(__dirname, '../../components/board/RealPanels.tsx'), 'utf8');

function panel(src, id) {
  const i = src.indexOf(`id="${id}"`);
  assert.ok(i >= 0, `${id} 패널이 있어야 한다`);
  const j = src.indexOf('</section>', i);
  return src.slice(i, j);
}

test('SAMPLE 패널(월별 공급 파동·선택 시점·지연 추이·기관별 진행·시도)은 SAMPLE 표지가 있고, 실데이터 패널은 실데이터 표지가 있다', () => {
  for (const id of ['p-chart', 'p-snap', 'p-trend', 'p-agency', 'p-region']) assert.match(panel(board, id), /<Sample \/>/, `${id}`);
  for (const id of ['p-fut']) assert.match(panel(board, id), /<Real title=/, id);
  for (const id of ['p-actual', 'p-actors']) assert.match(panel(realRow, id), /<Real title=/, id);
  for (const id of ['p-fut']) assert.doesNotMatch(panel(board, id), /<Sample \/>/, `${id} 는 실데이터라 SAMPLE 표지가 없어야 한다`);
});

test('향후 12개월 패널은 LH 준공 예정(실데이터)만 그리고, 시안의 SAMPLE 계열(착공·모집·입주 예정)을 쓰지 않는다', () => {
  const fut = panel(board, 'p-fut');
  assert.match(fut, /real\.lh\.map/);
  assert.doesNotMatch(fut, /\bFS\b|FSC/);
  assert.doesNotMatch(board, /\bFS\b/, 'sample.ts 에서 FS(향후 12개월 SAMPLE)를 가져오지 않는다');
});

test('종합상황판은 실데이터를 data/board 에서만 읽는다: 월별 실적·시행주체별(molit), LH 준공 예정(lh), 원천 수(sources)', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../app/(dashboard)/page.tsx'), 'utf8');
  assert.match(page, /lhByMonth\(lh, '2026-10', 12\)/);
  assert.match(page, /sourceCount: sources\.items\.length/);
  assert.match(realRow, /seriesOf\(molit/); assert.match(realRow, /ytd\(molit/);
});
