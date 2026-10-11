'use strict';
// lib/board/sample.ts — 아직 SAMPLE 인 계산(지연·주의 추이)이 시안 원본과 같은 숫자를 내는지, 시안을 실행해 뽑은 기준값
// (tests/fixtures/board-sample-golden.json)과 비교한다. 시안의 데이터·식을 일부러 그대로 두었으므로 한 글자도 다르면 안 된다.
// 원장 집계(data/board/ledger-board.json)로 바꾼 리본 기하·판정 문구는 원장 값으로 다시 계산해 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../lib/board/sample.ts');
const G = require('../fixtures/board-sample-golden.json');
const L = require('../../data/board/ledger-board.json');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);
const nearAll = (a, b, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => near(v, b[i], `${msg}[${i}]`)); };

test('46개 시점의 지연·주의(추이 SAMPLE)·월 이름·구분·추이 문구가 시안과 같다', () => {
  assert.equal(G.months.length, S.LAST + 1);
  for (const g of G.months) {
    const m = g.m;
    near(S.ip(S.AD, m), g.ad, `지연 ${m}`);
    near(S.ip(S.AW, m), g.aw, `주의 ${m}`);
    assert.equal(S.ml(m), g.label);
    assert.equal(S.kind(m), g.kind);
    assert.equal(S.txTrend(m), g.txTrend, `추이 문구 ${m}`);
  }
});

test('지시 6건: 값은 모두 자료에서 센다(통계누리 착공 누계·원장 집계·원천 수), 날짜·제목·연결 패널·인용문은 시안 그대로이고, 원장 시도는 통계누리 시도 코드(짧은 이름·/area 링크)로 이어진다', () => {
  const { makeDirectives } = require('../../lib/board/directives.ts');
  const molit = require('../../data/board/molit.json'), C = require('../../lib/board/calc.ts');
  const last = C.lastMonth(molit), cum = C.ytd(molit, 'start', C.NATION, last), cumLy = C.ytd(molit, 'start', C.NATION, C.nextYm(last, -12));
  const start = { year: last.slice(0, 4), upto: Number(last.slice(5)), cum, cumLy };
  const dir = makeDirectives({ sourceCount: 19, stageNames: S.K, ledger: L, start });
  assert.deepEqual(dir.map((d) => [d.date, d.t, d.p]), [['08.14', '진척 관리', ['p-chart']], ['08.19', '사업장별 현황판', ['p-region']], ['09.03', '범부처 통합·병목', ['p-trend', 'p-agency']], ['09.04', '예측가능성', ['p-fut']], ['09.18', '일정 지연 관리', ['p-trend']], ['09.30', '국민 공개·공식 원천', ['p-flow']]]);
  dir.forEach((d, i) => { assert.ok(d.basis.length > 10, `표지 title ${i}`); });
  const yoy = (cum - cumLy) / cumLy * 100;
  assert.equal(dir[0].m, `착공 ${S.f(cum)}호`);
  assert.equal(dir[0].sub.text, `${yoy >= 0 ? '▲' : '▼'} ${Math.abs(yoy).toFixed(1)}%`);
  assert.match(dir[0].basis, /달성률은 내지 못합니다/);
  assert.equal(dir[1].m, `${S.f(L.scope.projects)} 사업`);
  assert.equal(L.scope.projects, L.scope.issued + L.scope.candidates);
  const b = L.scope.bySource;
  assert.match(dir[1].basis, new RegExp(`^원장 2026-10 기준 · 전국 · 사업 ${S.f(L.scope.projects)}건\\(발급 ${b.issued} · LH 후보 ${b.lhCandidates} · 건축HUB 후보 ${S.f(b.hubBulkCandidates)}\\)$`));
  assert.match(dir[4].basis, new RegExp(`^원장 2026-10 기준 · 전국 · 판정 ${S.f(L.scope.judged)}건\\(발급 사업은 착공·준공, 건축HUB 후보는 준공 예정 경과만 · 판정 밖: LH 후보 ${b.lhCandidates}건, 건축HUB 후보의 착공 예정 경과 ${S.f(L.judgment.excludedStartOverdue.pairs)}건\\) 중 지연·주의$`));
  assert.doesNotMatch(dir.map((d) => d.basis).join(' '), /전국 아님/);
  const bk = L.delayByStage.indexOf(Math.max(...L.delayByStage));
  assert.equal(dir[2].m, `병목 ${S.K[bk]} ${S.f(L.delayByStage[bk])}호`);
  assert.equal(dir[3].m, `준공 예정 ${S.f(L.upcoming.reduce((n, m) => n + m.units, 0))}호`);
  assert.equal(dir[4].m, `지연 ${L.judgment.delay.projects}사업`);
  assert.equal(dir[4].sub.text, `주의 ${L.judgment.caution.projects}사업`);
  assert.equal(makeDirectives({ sourceCount: 19, stageNames: S.K, ledger: L, start })[5].m, '원천 19곳');
  assert.equal(makeDirectives({ sourceCount: 14, stageNames: S.K, ledger: L, start: { ...start, cum: null } })[0].sub, undefined, '누계가 없으면 증감을 내지 않는다');
  const codes = require('../../data/board/molit.json').sido.map((s) => s.code);
  assert.equal(L.regions.length, 16);
  for (const r of L.regions) assert.ok(codes.includes(r.code), `${r.name} → ${r.code}`);
  assert.ok(L.regions.some((r) => r.code === '12'), '2026-07 통합: 광주·전남은 12(전남광주) 하나');
});

test('원장 집계와 화면 시점이 같은 칸이다: 46개월(2025-01~2028-10), NOW = 2026-10, 단계 6칸', () => {
  assert.equal(L.schema, 'ledger-board/1');
  assert.equal(L.months.length, S.LAST + 1);
  assert.equal(L.now, S.NOW);
  L.months.forEach((ym, m) => assert.equal(ym, S.ymOf(m)));
  assert.equal(L.observedMonth, S.ymOf(S.NOW));
  for (const row of L.stageUnits) assert.equal(row.length, S.K.length);
  assert.equal(L.delayByStage.length, S.K.length);
});

test('리본 차트 기하(원장): 좌표 상수는 시안과 같고, 층 두께 = 그 달 단계별 호수, 층은 바닥(BOT)부터 빈틈없이 쌓인다', () => {
  assert.deepEqual([S.PX0, S.PW, S.TOP].map(Number), [G.consts.PX0, G.consts.PW, G.consts.TOP]);
  assert.deepEqual([S.PH, S.BOT], [304, 356], '세로는 시안보다 16 줄여 기준일 글자 줄을 비운다');
  near(S.PITCH, G.consts.PITCH, 'PITCH');
  G.x.forEach(([v, x]) => near(S.X(v), x, `X(${v})`));
  const R = S.ribbonOf(L.stageUnits, L.delayByStage);
  assert.ok(S.textBox(S.staticTexts(R).now).y >= S.BOT, '기준일 글자 상자가 플롯(BOT) 안으로 들어가지 않는다');
  R.total.forEach((t, m) => assert.equal(t, L.stageUnits[m].reduce((a, b) => a + b, 0), `총량 ${m}`));
  assert.equal(R.step, 500000); assert.equal(R.ymax, 2500000, '세로 축척은 가장 큰 총량을 눈금 간격 단위로 올린 값');
  assert.ok(R.ymax >= Math.max(...R.total) && R.ymax - Math.max(...R.total) < R.step);
  near(R.s2, S.PH / R.ymax, 's2');
  assert.equal(R.geo.length, 4 * (S.LAST + 1) + 1, '0.25개월 간격');
  for (let m = 0; m <= S.LAST; m++) {
    const g = R.geo[4 * m + 2];   // 칸 가운데(m + 0.5) = 그 달 값 그대로
    near(g.x, m + 0.5, 'x');
    for (let k = 0; k < 6; k++) near((g.lw[k] - g.up[k]) / R.s2, L.stageUnits[m][k], `층 두께 ${m}/${k}`);
    for (let k = 0; k < 5; k++) near(g.lw[k], g.up[k + 1], `층 이음 ${m}/${k}`);
    near(g.up[0], S.BOT - R.total[m] * R.s2, `위 ${m}`); near(g.lw[5], S.BOT, `아래 ${m}`);
  }
  const layer0 = S.rp(R, 0, 0, S.NOW + 1, false);
  assert.match(layer0, /^M46\.0,/);
  assert.equal(layer0.split(' L').length, 2 * (4 * (S.NOW + 1) + 1), '위·아래 경계 점');
  assert.match(S.rp(R, 5, S.NOW + 1, S.LAST + 1, false, 3), /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+ Z$/);
});

test('리본 지연 띠·병목: NOW 앞 달은 0(관측 기록 없음), NOW 와 그 뒤는 delayByStage, 띠는 층보다 두껍지 않다, 병목 = 지연 호수가 가장 큰 단계', () => {
  const R = S.ribbonOf(L.stageUnits, L.delayByStage);
  for (const g of R.geo) {
    if (g.x < S.NOW) assert.deepEqual(g.dl, [0, 0, 0, 0, 0, 0], `x=${g.x}`);
    else g.dl.forEach((d, k) => assert.ok(d <= g.lw[k] - g.up[k] + 1e-9, `x=${g.x} k=${k}`));
  }
  const at = R.geo[4 * S.NOW + 2];
  L.delayByStage.forEach((d, k) => near(at.dl[k], Math.min(d, L.stageUnits[S.NOW][k]) * R.s2, `NOW 띠 ${k}`));
  assert.deepEqual(S.delayAt(L.delayByStage, S.NOW - 1), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(S.delayAt(L.delayByStage, S.NOW), L.delayByStage);
  assert.deepEqual(S.delayAt(L.delayByStage, S.LAST), L.delayByStage);
  assert.equal(S.argmax(L.delayByStage), L.delayByStage.indexOf(Math.max(...L.delayByStage)));
  /* 띠가 층보다 두꺼우면 층 두께로 자른다 */
  const tiny = S.ribbonOf(L.stageUnits.map(() => [10, 10, 10, 10, 10, 10]), [100, 0, 0, 0, 0, 0]);
  near(tiny.geo[4 * S.NOW + 2].dl[0], 10 * tiny.s2, '잘린 띠');
  const band = S.rp(R, 1, 0, S.NOW - 0.25, true).slice(1, -2).split(' L'), half = band.length / 2;
  for (let i = 0; i < half; i++) assert.equal(band[i], band[band.length - 1 - i], 'NOW 앞 띠는 두께가 0');
});

test('리본 글자 자리: 46개 시점 모두 글자·HUD 라벨·핀이 서로 겹치지 않고 viewBox(960×400) 안에 있다(원장 = 총량 매달 같음, 총량이 해마다 다른 경우도)', () => {
  const R = S.ribbonOf(L.stageUnits, L.delayByStage);
  // 총량이 해마다 다른 경우: 전국 원장(총량 약 238만)에서 0.5배 → 1.5배
  const grow = S.ribbonOf(L.stageUnits.map((r, m) => r.map((v) => Math.round(v * (0.5 + m / 45)))), L.delayByStage);
  for (const [name, g] of [['원장', R], ['총량 증가', grow]]) {
    for (let cur = 0; cur <= S.LAST; cur++) {
      const o = S.ribbonLabels(g, cur);
      const B = [...o.statics, ...o.years.flat()].map((t) => [t.t, S.textBox(t)])
        .concat([[`핀 ${o.pin.text}`, o.pin], [`커서 ${o.total.text}`, o.total], ['핀 점', { x: o.pin.px - 9, y: o.pin.py - 9, w: 18, h: 18 }]]);
      for (let i = 0; i < B.length; i++) {
        assert.ok(S.inView(B[i][1]), `${name} ${cur}: '${B[i][0]}' 가 viewBox 밖`);
        for (let j = i + 1; j < B.length; j++) assert.ok(!S.hit(B[i][1], B[j][1]), `${name} ${cur}: '${B[i][0]}' ⟷ '${B[j][0]}' 겹침`);
      }
    }
  }
  /* 원장: 총량이 매달 같으니 연도 라벨은 연도만, 총량은 머리 줄 설명 한 번. 세로축 눈금은 0…ymax 만 단위 */
  assert.ok(S.flatTotal(R) && !S.flatTotal(grow));
  const o = S.ribbonLabels(R, S.NOW), T = S.staticTexts(R);
  assert.deepEqual(o.years.map((y) => y.map((t) => t.t)), [['2025년'], ['2026년'], ['2027년'], ['2028년']]);
  assert.equal(T.summary.t, `총량 매달 ${S.f(R.total[0])}호(같은 사업이 단계만 옮겨 감)`);
  assert.equal(T.legend.y, S.HY1);
  assert.deepEqual(T.ticks.map((t) => t.t), ['0', '50만', '100만', '150만', '200만', '250만']); assert.equal(T.unit.t, '(호)');
  const big = S.ribbonOf(L.stageUnits.map((r) => r.map((v) => v * 5)), L.delayByStage);   // ymax 1,000만 이상: '만' 을 빼 눈금이 왼쪽 여백에 들어가고 단위는 머리 글자로
  assert.ok(big.ymax >= 10000000); assert.ok(S.staticTexts(big).ticks.every((t) => !t.t.includes('만'))); assert.equal(S.staticTexts(big).unit.t, '(만 호)');
  T.ticks.forEach((t, i) => near(t.y, S.BOT - R.ticks[i] * R.s2 + 3, `눈금 y ${i}`));
  const small = S.ribbonOf(L.stageUnits.map(() => [10000, 20000, 30000, 20000, 5000, 4000]), L.delayByStage);   // 총량 89,000: 5만 간격이면 2칸이지만 더 잘게 5칸 이하 중 가장 작은 간격
  assert.equal(small.step, 20000); assert.equal(small.ymax, 100000); assert.deepEqual(S.staticTexts(small).ticks.map((t) => t.t), ['0', '2만', '4만', '6만', '8만', '10만']);
  const half = S.ribbonOf(L.stageUnits.map(() => [20000, 20000, 20000, 20000, 20000, 20000]), L.delayByStage);   // 총량 120,000 → 간격 25,000(2.5 × 10^4)
  assert.equal(half.step, 25000); assert.deepEqual(S.staticTexts(half).ticks.map((t) => t.t), ['0', '2.5만', '5만', '7.5만', '10만', '12.5만']);
  assert.equal(o.pin.text, `${S.K[1]} 지연 ${S.f(L.delayByStage[1])}호 · ${(L.delayByStage[1] / L.stageUnits[S.NOW][1] * 100).toFixed(1)}%`);
  assert.equal(S.ribbonLabels(grow, S.NOW).years[1].length, 2, '총량이 해마다 다르면 연도·총량과 증감 두 줄');
  /* 리본 SVG 는 이 자리를 그대로 그린다(글자 좌표를 따로 박아 두지 않는다) */
  const rb = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../components/board/ribbon.ts'), 'utf8');
  assert.match(rb, /ribbonLabels\(g, cur\)/); assert.match(rb, /staticTexts\(g\)/);
  assert.doesNotMatch(rb, /<text x="\$\{x\.toFixed/, '글자 자리 직접 계산 금지');
});

test('선택 시점 판정 문구: 2026.10 앞은 과거 판정 기록 없음, 뒤는 2026.10 판정 유지', () => {
  assert.equal(S.txJudge(0), '판정은 2026.10 관측부터(과거 판정 기록 없음)');
  assert.equal(S.txJudge(S.NOW - 1), S.txJudge(0));
  assert.equal(S.txJudge(S.NOW), '2026.10 관측 판정');
  assert.equal(S.txJudge(S.NOW + 1), '예정 구간은 2026.10 판정을 유지');
  assert.equal(S.txJudge(S.LAST), S.txJudge(S.NOW + 1));
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
  const j = src.indexOf('</Card>', i);   // 패널은 <Card variant="board" render={<section id=…/>}> … </Card>
  return src.slice(i, j);
}

test('SAMPLE 패널(지연 추이)은 SAMPLE 표지가 있고, 원장 패널 5개는 실데이터 표지에 원장 범위(전국 여부)를 보인다', () => {
  for (const id of ['p-trend']) assert.match(panel(board, id), /<Sample \/>/, `${id}`);
  for (const id of ['p-chart', 'p-snap', 'p-region', 'p-agency', 'p-fut']) {
    const p = panel(board, id);
    assert.match(p, /<Real title=\{`\$\{scope\} · /, `${id}: 실데이터 표지 title 에 원장 범위`);
    assert.doesNotMatch(p, /<Sample \/>/, `${id} 는 실데이터라 SAMPLE 표지가 없어야 한다`);
  }
  for (const id of ['p-chart', 'p-region', 'p-agency', 'p-fut']) assert.match(panel(board, id), /<small className=\{ptSmall(Block)?\}>[^<]*\{scopeShort\}/, `${id}: 작은 글자에 원장 범위`);
  assert.match(board, /const scope = `원장 \$\{L\.observedMonth\} 기준 · 사업 \$\{f\(L\.scope\.projects\)\}건\(\$\{ledgerMix\(L\)\}\) · \$\{nation\} · \$\{real\.ledgerOrigin === 'supabase' \? `출처 Supabase\(api\.board, \$\{real\.ledgerMonth\}\)` : '출처 JSON 대체'\}`;/);
  assert.match(board, /const scopeShort = `[^`]*\$\{nation\}`;/);
  assert.match(panel(board, 'p-trend'), /판정 이력은 \{L\.observedMonth\} 관측부터 쌓인다/);
  for (const id of ['p-actual']) assert.match(panel(realRow, id), /<Real title=/, id);
  assert.doesNotMatch(board, /\b(AG|REG|dStage|vals|txSnap)\b/, '시안 SAMPLE 계산(기관·시도·단계 호수)을 쓰지 않는다');
});

test('원장 패널은 원장 집계 값을 그린다: 판정·제외·단계 호수·증감·지연, 시도 판정 여부, 기관별 사업 수, 12개월 준공 예정', () => {
  const snap = panel(board, 'p-snap');
  assert.match(board, /const v = L\.stageUnits\[cursor\], nv = L\.stageUnits\[NOW\], past = cursor <= NOW, ds = L\.delayByStage, bk = argmax\(ds\);/);
  assert.match(board, /const J = L\.judgment, d = J\.delay\.units, w = J\.caution\.units, ok = J\.ok\.units/);
  assert.match(snap, /<Reserve live=\{txJudge\(cursor\)\}/);
  assert.match(snap, /판정 제외: [\s\S]*LH 후보 \{f\(J\.excluded\.projects\)\}건\(\{f\(J\.excluded\.units\)\}호\)/);
  assert.match(snap, /const dlt = v\[i\] - nv\[i\];/);
  const region = panel(board, 'p-region');
  assert.match(region, /\{L\.regions\.map\(/);
  assert.match(region, /rate = r\.judged \? r\.delay \/ r\.judged \* 100 : null/);
  assert.match(region, /rate === null \? 'var\(--card\)' : RCOL\[rcls\(rate\)\]/);
  assert.match(region, /판정 대상 없음/);
  assert.match(region, /href=\{`\/area\/\$\{curReg\.code\}`\}/);
  const agency = panel(board, 'p-agency');
  assert.match(agency, /\{L\.agencies\.filter\(\(a\) => a\.projects\)\.map\(/, '사업 있는 기관만 행으로');
  assert.match(agency, /emptyAgencies\.map\(\(a\) => a\.name\)\.join\(' · '\)[\s\S]*원장에 사업 없음/, '사업 없는 기관은 한 줄로 묶는다');
  assert.equal((agency.match(/cn\(ag, agRow\)/g) || []).length, 2, '모든 행(기관 행·묶음 줄)이 같은 높이·칸');
  assert.doesNotMatch(agency, /agName\}>[^\n]*판정 제외/, '이름 칸에 판정 제외를 넣지 않는다');
  assert.match(agency, /정상', '주의', '지연', '판정 밖'|\['bg-pn2', '판정 밖'\]/, '막대 아래 범례');
  assert.match(agency, /전체 지연 \{f\(J\.delay\.units\)\}호/);
  assert.match(agency, /\(판정 제외 \$\{f\(a\.excludedUnits\)\}호\)/, '판정 제외는 행 title 에');
  assert.match(agency, /원장에 사업 없음/);
  assert.match(agency, /pw\(a\.okUnits\)[\s\S]*pw\(a\.cautionUnits\)[\s\S]*pw\(a\.delayUnits\)/, '막대는 호수');
  assert.match(agency, /Math\.round\(a\.delayUnits \/ J\.delay\.units \* 100\)/, '지연 비중은 전체 지연 호수 중 비중');
});

test('시도 카드는 월별 실적 흐름(middle)과 같은 줄에 있고, 시행주체별 진행 현황·데이터 흐름 카드는 없다', () => {
  assert.match(board, /<div className=\{row2\}>\s*\{middle\}\s*<Card variant="board"[^>]*id="p-region"/);
  /* 시도 칸은 타일 6열(3줄)이 들어가는 폭이라 두 카드 높이가 비슷하다: 112×6 + 6×5 + 42 ≤ 시도 칸 폭 */
  const styles = fs.readFileSync(path.join(__dirname, '../../components/board/styles.ts'), 'utf8');
  const regionCol = Number(/export const row2 = "[^"]*grid-cols-\[minmax\(0,1fr\)_(\d+)px\]/.exec(styles)[1]);
  assert.ok(regionCol >= 112 * 6 + 6 * 5 + 42, `시도 칸 ${regionCol}px`);
  assert.match(board, /grid-cols-\[repeat\(auto-fill,minmax\(112px,1fr\)\)\][^"]*gap-1\.5/, '타일 최소 폭·간격이 바뀌면 시도 칸 폭도 다시 잰다');
  assert.doesNotMatch(board, /id="p-flow"/);
  assert.doesNotMatch(realRow, /id="p-actors"/);
});

test('향후 12개월 패널은 원장의 준공 예정(upcoming, 2026-10부터 12개월)만 그리고, 시안의 SAMPLE 계열(착공·모집·입주 예정)을 쓰지 않는다', () => {
  const fut = panel(board, 'p-fut');
  assert.match(board, /const up = L\.upcoming,/);
  assert.match(fut, /\{up\.map\(\(m, i\) =>/);
  assert.doesNotMatch(board, /real\.lh\b|lhByMonth/);
  assert.equal(L.upcoming.length, 12);
  assert.equal(L.upcoming[0].ym, L.observedMonth);
  assert.equal(L.upcoming[11].ym, S.ymOf(S.NOW + 11));
  assert.doesNotMatch(fut, /\bFS\b|FSC/);
  assert.doesNotMatch(board, /\bFS\b/, 'sample.ts 에서 FS(향후 12개월 SAMPLE)를 가져오지 않는다');
});

test('종합상황판은 실데이터를 data/board 에서만 읽는다: 월별 실적(molit), 원장 집계(ledger), 원천 수(sources)', () => {
  const page = fs.readFileSync(path.join(__dirname, '../../app/(dashboard)/page.tsx'), 'utf8');
  assert.match(fs.readFileSync(path.join(__dirname, '../../lib/board/data.ts'), 'utf8'), /import ledgerJson from '\.\.\/\.\.\/data\/board\/ledger-board\.json';/);
  assert.match(page, /^    ledger: src\.board,$/m);
  assert.match(page, /sido: Object\.fromEntries\(molit\.sido\.map/);
  assert.match(page, /sourceCount: sources\.items\.length/);
  assert.match(realRow, /seriesOf\(molit/);
});

test('카드의 이동 버튼은 아래 줄이 아니라 제목 줄 오른쪽(pacts)에 작은 채운 주색으로 있다(2026-10-10 사용자 지시)', () => {
  const head = (src) => src.slice(0, src.search(/<\/div>/));   // 패널의 첫 줄(제목 줄)
  for (const id of ['p-snap', 'p-region', 'p-fut', 'p-agency']) assert.match(head(panel(board, id)), /className=\{pacts\}><PanelLink/, id);
  assert.match(head(panel(realRow, 'p-actual')), /className=\{pacts\}><PanelLink/, 'p-actual');
  assert.doesNotMatch(board + realRow, /plink/, '카드 아래 링크 줄(plink)은 없다');
  const link = fs.readFileSync(path.join(__dirname, '../../components/board/PanelLink.tsx'), 'utf8');
  assert.match(link, /bg-primary [^"]*text-\[13px\][^"]*text-primary-foreground/);
  assert.match(link, /title=\{full\}/, '줄인 이름 대신 원래 이름은 title 로 보인다');
});
