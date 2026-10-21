'use strict';
/* 2026-10-21 사용자 결정: 종합상황판 상위 6개 카드 = HOME 기준 값(같은 날 HOME 6단계 카드로 — 건설 = HOME 착공(건설) 카드 현재 누적 측정량 + 아래 줄 '연말 계획까지 n호'),
   지역 탭 수도권 전체·서울·경기·인천(카드 위 · 시도 타일 연동 · 주소 ?area= — '/?sido=' 는 옛 지도 주소라 지도로 넘어간다)으로 카드와 아래 패널이 그 지역 HOME 집계(home-board.json byRegion)를 그린다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HB = require('../../data/board/home-board.json');
const { homeBoards } = require('../../tools/ledger/home-board');
const D = require('../../lib/board/directives.ts');
const V = require('../../lib/board/projects-view.ts');
const BL = require('../../lib/board/board-lists.ts');
const HP = require('../../data/board/home-projects.json');

const CODES = ['11', '41', '28'];
const regionOf = (c) => ({ ...HB.byRegion[c], regions: HB.regions });
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const dirOf = (L, sido) => D.makeDirectives({ sourceCount: 19, stageNames: HB.stageNames, ledger: L, start: { year: '2026', upto: 8, cum: 86739, cumLy: 85424 }, bottleneck: V.bottleneckOf, sido });

test('home-board.json: 시도 묶음 3개(서울·경기·인천), 시도 타일·묶음은 전체 집계에만, 사업·호수·착공 누적·12개월 공급은 시도 합 = 수도권', () => {
  assert.deepEqual(Object.keys(HB.byRegion).sort(), [...CODES].sort());
  for (const c of CODES) {
    const b = HB.byRegion[c];
    assert.equal(b.regions, undefined); assert.equal(b.byRegion, undefined);
    assert.equal(b.scope.areaName, { 11: '서울', 41: '경기', 28: '인천' }[c]);
    assert.equal(b.scope.projects, HB.regions.find((r) => r.code === c).projects, '시도 묶음 사업 수 = 시도 타일 사업 수');
  }
  const R = CODES.map((c) => HB.byRegion[c]);
  assert.equal(sum(R.map((b) => b.scope.projects)), HB.scope.projects);
  assert.equal(sum(R.map((b) => b.scope.units)), HB.scope.units);
  assert.equal(sum(R.map((b) => b.home.cards.CONSTRUCTION.current)), HB.home.cards.CONSTRUCTION.current, '단계 누적 측정은 사업 합이라 더해진다');
  assert.equal(sum(R.map((b) => b.home.supplyUpcoming.total)), HB.home.supplyUpcoming.total);
  for (let i = 0; i < 12; i++) assert.equal(sum(R.map((b) => b.upcoming[i].units)), HB.upcoming[i].units, `12개월 ${i}`);
  assert.deepEqual(R.map((b) => b.months), R.map(() => HB.months), '시점은 같다(달을 옮겨도 같은 칸)');
});

test('HOME 지역 범위(regionView): 응답의 region:<시도> 비교 묶음 · 그 시도 사업 — 2026-10-20 HOME 응답 서울 착공(건설) 9,172호(연말 예상 7,866 → 1,306호 초과), 경기 61,223 · 인천 9,489', () => {
  const view = require(path.join(__dirname, '..', 'fixtures', 'home-view-1020', 'policy-view.json'));
  const all = homeBoards(view);
  const c = (k) => all.byRegion[k].home.cards.CONSTRUCTION;
  assert.deepEqual([c('11').current, c('11').year_end_expected, c('11').remainder], [9172, 7866, -1306]);
  assert.deepEqual([c('41').current, c('28').current], [61223, 9489]);
  assert.equal(all.home.cards.CONSTRUCTION.current, 79884, '수도권 전체는 그대로');
  assert.deepEqual([all.byRegion['11'].home.bottleneck?.label, all.byRegion['11'].home.bottleneck?.gap], ['준공', 14], '서울 병목 = HOME 시도 집계 지연 문구(준공 14호 부족)와 같은 값');
  assert.equal(all.byRegion['41'].home.delayMax, 1974);
});

/* 같은 날 사용자 지시로 위 줄이 HOME 6단계 카드(정책~입주)가 됨 — 진척 관리 카드의 값·문구는 건설 카드로(tests/js/board-stage-cards-1021.test.cjs 가 6장 전부) */
test('건설 카드 = HOME 착공(건설) 카드(현재 누적 측정 + 연말 문구) — 통계누리 착공 누계(86,739)는 (i) 설명에만', () => {
  const c = dirOf(HB, 'all')[3];
  assert.deepEqual([c.t, c.big, c.u, c.pre, c.sub], ['건설', '82,968', '호', '연말 계획까지 16,917호', undefined], '아래 줄 = HOME 문구만(보조 값 없음 — 6열 카드 폭)');   // 2026-10-22 연말 예상 99,885(forecast_points — 옛 계획 누계 94,498 · 11,530) · 10-21 판 79,884 · 12,690
  assert.equal(c.m, '착공(건설) 현재 누적 82,968호 · 연말 계획까지 16,917호', '숫자 이름은 읽기 이름에');
  assert.match(c.basis, /HOME 착공\(건설\) 카드 — 현재 누적 측정량/);
  assert.match(c.basis, /통계누리 착공 통계\(민간 포함 모든 주택 · 수도권 2026년 1~8월 86,739호\)와 범위가 다릅니다/);
  const seoul = dirOf(regionOf('11'), '11')[3];
  assert.deepEqual([seoul.big, seoul.pre], [HB.byRegion['11'].home.cards.CONSTRUCTION.current.toLocaleString('en-US'), `연말 계획까지 ${HB.byRegion['11'].home.cards.CONSTRUCTION.remainder.toLocaleString('en-US')}호`]);   // 2026-10-22 서울 9,172 → 연말 예상 10,871(forecast_points)
  assert.doesNotMatch(seoul.basis, /86,739/, '시도면 수도권 통계누리 숫자를 적지 않는다');
});

test('카드 6장: 시도를 고르면 그 시도 값과 그 시도 목록 주소', () => {
  const all = dirOf(HB, 'all');
  for (const c of CODES) {
    const L = regionOf(c), d = dirOf(L, c), H = L.home;
    assert.equal(D.nation(L), L.scope.areaName);
    assert.deepEqual(d.map((x) => x.t), all.map((x) => x.t), '6단계 틀 그대로');
    assert.equal(d[1].big, H.cards.BUSINESS.current.toLocaleString('en-US'));
    assert.equal(d[4].big, H.cards.SUPPLY.current.toLocaleString('en-US'));
    for (const x of d) assert.match(x.list.href, new RegExp(`sido=${c}(&|$)`), `${x.t} 목록 주소`);
  }
  assert.equal(D.atSido('/projects?sido=all&status=late', 'all'), '/projects?sido=all&status=late');
  assert.equal(D.atSido('/projects?sido=all&status=late', '41'), '/projects?sido=41&status=late');
});

test('목록 창: 시도 묶음 목록은 그 시도 사업만 — 연결 사업 n개 = 시도 사업 수, 병목 단계 부족 합 − 초과 = 시도 카드 숫자', () => {
  const rows = V.homeRowsOf(HP.rows, HP.residuals, HB.home.stageShort);
  for (const c of CODES) {
    const b = HB.byRegion[c], lists = BL.boardLists(V, rows, () => undefined, b.home.stageShort, c);
    assert.ok(Object.keys(lists).every((k) => k.includes(`sido=${c}`)), '열쇠는 그 시도 주소');
    assert.equal(lists[`/projects?sido=${c}`].rows.length, b.scope.projects);
    if (b.home.bottleneck) {
      const s = b.home.stageShort[b.home.bottleneck.stage];
      assert.equal(s.rows.reduce((n, r) => n + r.short, 0) - s.over, b.home.bottleneck.gap);
      assert.equal(lists[`/projects?sido=${c}&status=short-${b.home.bottleneck.stage}`].rows.length, s.rows.length);
    }
  }
  assert.match(read('app/(dashboard)/page.tsx'), /Object\.entries\(homeBoard\.byRegion \?\? \{\}\)\.map\(\(\[code, b\]\) => boardLists\(View, idx\.homeRows, sidoOf, b\.home\?\.stageShort, code\)\)/);
});

test('화면: 카드 위 지역 탭(채움 탭 · 눌림 단추) 수도권 전체·서울·경기·인천, 시도 타일 누름 = 같은 선택(다시 누르면 전체), 주소 ?area=', () => {
  const b = read('components/board/Board.tsx');
  assert.match(b, /const AREAS = \['all', '11', '41', '28'\];/);
  assert.match(b, /<div data-slot="board-area" className="ui-tabs ui-tabs-seg" role="group" aria-label="지역">/);
  assert.match(b, /<button key=\{c\} type="button" aria-pressed=\{c === area\} onClick=\{\(\) => pickArea\(c\)\}>\{c === 'all' \? `\$\{nationOf\(L0\)\} 전체` : sidoName\(c\)\}<\/button>/);
  assert.ok(b.indexOf('data-slot="board-area"') < b.indexOf('id="board-dirs"'), '탭은 카드 줄 위');
  assert.match(b, /aria-pressed=\{r\.code === area\} onClick=\{\(\) => pickArea\(r\.code === area \? 'all' : r\.code\)\}/);
  assert.match(b, /if \(code === 'all'\) u\.searchParams\.delete\('area'\); else u\.searchParams\.set\('area', code\);\n\s*window\.history\.replaceState\(/);
  assert.match(b, /new URLSearchParams\(window\.location\.search\)\.get\('area'\)/);
  assert.match(b, /const L: LedgerBoard = useMemo\(\(\) => \{ const b = area !== 'all' \? L0\.byRegion\?\.\[area\] : undefined; return b \? \{ \.\.\.b, regions: L0\.regions \} : L0; \}, \[L0, area\]\);/);
  assert.match(b, /makeDirectives\(\{ sourceCount: real\.sourceCount, stageNames: K, ledger: L, start: real\.start, bottleneck: bottleneckOf, sido: area \}\)/);
  assert.match(b, /<HomeActual monthly=\{H\.monthly\} refDate=\{L\.referenceDate\} scope=\{nation\} sido=\{area\} \/>/);
  assert.doesNotMatch(b, /useState\('11'\)/, '옛 시도 타일 따로 선택(기본 서울) 없음');
  assert.match(read('app/(dashboard)/page.tsx'), /middle=\{homeBoard\.home \? null : <RealPanels \/>\}/);
});

test("주소: '/?area=NN' 은 종합상황판에 남고(추적 쿼리와 섞여도), 옛 지도 주소('/?sido=' 등)는 그대로 지도로", () => {
  const ts = require('typescript');
  const out = ts.transpileModule(read('proxy.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out)(m, m.exports, (id) => (id === 'next/server' ? { NextResponse: {} } : require(id)));
  const { isBoardOnly } = m.exports, q = (s) => new URLSearchParams(s);
  assert.equal(isBoardOnly(q('area=11')), true);
  assert.equal(isBoardOnly(q('area=41&utm_source=x')), true);
  assert.equal(isBoardOnly(q('sido=41')), false);
  assert.equal(isBoardOnly(q('area=11&code=1168010100')), false, '지도 쿼리가 섞이면 지도');
  assert.equal(isBoardOnly(q('utm_source=x')), false, '추적만이면 isTrackingOnly 가 맡는다');
  assert.match(read('proxy.ts'), /if \(search && !isTrackingOnly\(searchParams\) && !isBoardOnly\(searchParams\)\) return NextResponse\.redirect/);
});

test('지시 카드 두 숫자(일정 지연 관리): 카드 안쪽 폭 211px 미만 24 · 179px 미만 20, 두 숫자 같은 크기(.ui-dir @container)', () => {
  const css = read('app/globals.css');
  assert.match(css, /@container \(max-width: 210px\) \{ \.ui-dir-values:has\(> \.ui-dir-stat \+ \.ui-dir-stat\) \.ui-dir-num \{ font-size: var\(--text-xl\); \} \}/);
  assert.match(css, /@container \(max-width: 178px\) \{ \.ui-dir-values:has\(> \.ui-dir-stat \+ \.ui-dir-stat\) \.ui-dir-num \{ font-size: var\(--text-lg\); \} \}/);
  assert.match(read('components/board/Board.tsx'), /const dirFrame = 'ui-dir @container';/, '컨테이너 = 지시 카드 틀');
  /* 경계: 네 자리 두 숫자(번들 글꼴 폭 — 숫자 0.59em·쉼표 0.325em, 단위 '호' 14px 0.92em + 4, 두 숫자 사이 16) */
  const w = (px) => 2 * (4 * 0.59 * px + 0.325 * px + 4 + 14 * 0.92) + 16;
  assert.ok(w(30) <= 211 && w(30) > 210 - 1, `30px ${w(30).toFixed(1)}`); assert.ok(w(24) <= 179, `24px ${w(24).toFixed(1)}`); assert.ok(w(20) <= 171, `20px ${w(20).toFixed(1)} — 1440px 6열 안쪽 171`);
});
