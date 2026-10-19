'use strict';
/* 2차 독립 평가(27/40) 고침 — 사업(/projects·서랍·인쇄)·지역 공급(/region)·데이터 원본(/sources)·공통 틀(components/page.tsx).
   1 서랍·목록 위치 판정 = 지도 기준 · 2 '예정일 지남(1개월 미만)' · 3 '일정 정보 없음'·'달성 n%' · 4 서랍 단계 칸은 정의, 목록은 따로 링크
   5 넘침·말줄임 · 6 빈 공간 · 7 넓은 화면 1760 · 8 점 날짜 · 9 '입주 예정' 정의 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const R = require('../../lib/board/region.ts');
const { ledgerJudged } = require('../../lib/board/directives.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const DET = require('../../data/board/project-detail.json');
const BOARD = require('../../data/board/ledger-board.json');
const PP = require('../../data/board/policy-progress.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const A2 = rows.find((r) => r.id === 'PRJ-28245-0055');

test('1 위치 확보 판정 = 지도 기준: 계양 A2(번들 블록·동)는 확보, 수도권 사업 전부가 지도(region.js homeToProjects)의 그림/미확보와 같다', () => {
  assert.ok(A2, '계양 A2 행');
  assert.equal(DET.projects[A2.id].loc ?? null, null, '상세 자료의 loc 은 비어 있다(그래서 전에는 미확보)');
  assert.equal(V.mapLocOf(A2, DET.projects[A2.id].loc), 'bundle', '번들 단지와 이어져 지도에 블록·동이 그려진다');
  /* 지도 규칙: 번들과 이어진 행은 번들 단지로, 아니면 HOME_DRAWN_M 의 위치 종류 + 좌표가 있어야 그린다 */
  const js = read('assets/js/region.js');
  const drawn = Object.keys(eval(`(${/const HOME_DRAWN_M = (\{[^}]+\})/.exec(js)[1]})`));
  assert.deepEqual([...V.MAP_DRAWN_LOC].sort(), drawn.sort(), '그리는 위치 종류가 지도와 같다');
  let n = 0;
  for (const f of fs.readdirSync(path.join(ROOT, 'data/board/home-map'))) {
    const doc = JSON.parse(read(`data/board/home-map/${f}`));
    for (const p of doc.projects) {
      const onMap = !!(p.bundles && p.bundles.length) || !!(p.loc && drawn.includes(p.loc.by) && Array.isArray(p.loc.at) && p.loc.at.length === 2);
      const row = rows.find((r) => r.id === p.id);
      if (!row || !DET.projects[p.id]) continue;
      assert.equal(!!V.mapLocOf(row, DET.projects[p.id].loc), onMap, `${p.id} ${p.name}`);
      n++;
    }
  }
  assert.ok(n > 200, `수도권 상세 사업 ${n}건 대조`);
  /* 서랍·목록이 같은 함수를 쓴다(상세 loc 만 보지 않는다) */
  assert.match(read('components/projects/ProjectDetail.tsx'), /mapLocOf\(r, x\.loc\)/);
  assert.match(read('app/(dashboard)/projects/page.tsx'), /mapLocOf\(/);
  /* 공정률 정본은 원장(서랍) 값 */
  assert.deepEqual(DET.projects[A2.id].progress.at(-1), ['2026-07-01', 93.12]);
});

test('2 상태 문구: 정상 · 예정일 지남(1개월 미만) — 경과 0개월은 쓰지 않는다', () => {
  assert.equal(V.statusText(A2), '정상 · 예정일 지남(1개월 미만)');
  assert.ok(!V.statusText(A2).includes('경과 0'));
  for (const f of ['components/projects/ProjectDetail.tsx', 'components/projects/Candidate.tsx']) assert.match(read(f), /PAST_DUE_UNDER|statusText/, f);
  /* 지연·주의 사업은 표지가 붙지 않는다 */
  const late = rows.find((r) => r.issued && r.cls === 'delay');
  assert.ok(!V.statusText(late).includes('예정일 지남'));
});

test('3 용어: 목표를 넘으면 \'달성 n%\'(②인허가 3,560/1,543 = 달성 231%) · ①계획 = ②인허가 확인은 HOME 원천 값 · \'판정 밖\' → \'일정 정보 없음\'', () => {
  const cells = V.policyStageCells(PP, 'POL_2025_0907');
  const permit = cells.find((c) => c.key === 'APPROVAL');
  assert.equal(V.rateOf(permit).word, '달성 230.7%');   // 소수 한 자리(r3-screens 3)
  assert.deepEqual([V.rateOf(permit).value, V.rateOf(permit).unit], ['230.7', '% 달성']);
  const plan = cells.find((c) => c.key === 'BUSINESS');
  assert.equal(V.rateOf(plan).word, '달성 24.2%');   // r4-screens 1: 모든 칸 달성률
  for (const c of [plan, permit]) assert.match(V.stageCellTip(c, '', cells), /HOME\(정책 진행 자료\) 원천 값 그대로/);
  assert.match(V.stageCellTip(permit, '', cells), /①계획 확인과 같은 값/);
  assert.ok(!read('components/projects/Summary.tsx').includes("'초과'"));
  const judged = V.judgeOutText(ledgerJudged(BOARD));
  // 2026-10-19 수도권 한정: LH 후보·건축HUB 후보가 0건이라 ledgerJudged 문구에 '일정 정보 없음' 꼬리가 없다 → 치환 규칙은 옛 문구 '판정 밖'으로 확인
  assert.ok(!judged.includes('판정 밖') && !judged.includes('일정 정보 없음'), judged);
  assert.equal(V.judgeOutText('판정 밖: LH 후보 1건'), '일정 정보 없음: LH 후보 1건');
  assert.match(read('app/(dashboard)/sources/page.tsx'), /judgeOutText\(ledgerJudged\(ledger\)\)/);
  for (const f of ['app/(dashboard)/sources/page.tsx', 'app/(dashboard)/projects/page.tsx', 'app/(dashboard)/region/page.tsx', 'components/projects/Summary.tsx', 'components/projects/ProjectDetail.tsx']) assert.ok(!read(f).includes("'판정 밖'"), f);
});

test('4 서랍 단계 칸: 누르면 목록으로 넘어가지 않고 정의를 보이며, 목록은 \'같은 단계 사업 목록\' 링크 하나(지금 범위 유지)', () => {
  const s = read('components/projects/StageSteps.tsx');
  assert.ok(!/<Link href=\{href\(i\)\}/.test(s), '칸마다 목록 링크가 없다');
  assert.match(s, /같은 단계 사업 목록/);
  assert.match(s, /QUESTION\[current\]/, '지금 단계 정의를 보이는 글로');
  const p = read('app/(dashboard)/projects/page.tsx');
  assert.match(p, /listHref\(f, \{ stage: String\(i\) \}\)/, '목록 주소는 지금 거르기(f)를 유지');
});

test('5 넘침·말줄임: 사업·시군구 칸은 두 줄 후 말줄임(최소 폭이 글자 길이로 늘지 않음) · 지역 공급 목록 줄바꿈 · 데이터 원본 원천명 줄바꿈', () => {
  const g = read('components/ui/data-grid.tsx');
  assert.match(g, /c\.clip \? \(\s*longWord\([^)]*\)\s*\? <span className="block truncate"[\s\S]*?: <span className="line-clamp-2 whitespace-normal \[overflow-wrap:normal\]/, '말줄임 열은 두 줄, 칸보다 길 수 있는 낱말이 있으면 쪼개지 않고 한 줄 말줄임(2.5)');
  assert.ok(!/line-clamp-2[^"]*overflow-wrap:break-word/.test(g), '말줄임 열은 낱말 중간에서 끊지 않는다');
  const a = read('components/region/Ahead.tsx');
  assert.ok(!/w-\[96px\] flex-none truncate/.test(a), '시군구 96px 한 줄 말줄임 없음');
  assert.ok(!/min-w-0 flex-1 truncate font-bold/.test(a), '사업명 한 줄 말줄임 없음');
  assert.match(a, /line-clamp-2/);
  const c = read('components/sources/Collect.tsx');
  assert.ok(!/truncate/.test(c), '원천명 말줄임 없음');
  /* 연도 확보 격자의 최소 폭은 가로 스크롤 감싸개 안 */
  assert.match(c, /<div className="relative overflow-x-auto">\s*<div role="table"[^>]*min-w-\[680px\]/);
});

test('6 빈 공간: 수도권·전국 동네 여건은 카드 대신 한 줄 · 단계별 진행은 여섯 칸 같은 폭(⑤⑥ 없음 칸도 따로)', () => {
  const p = read('app/(dashboard)/region/page.tsx');
  assert.match(p, /data-slot="cond-note"/);
  assert.ok(!/<Card render=\{<section aria-label="동네 여건" \/>\}>/.test(p), '빈 카드 없음');
  const s = read('components/projects/Summary.tsx');
  assert.ok(!/shut\.length \* 0\.45/.test(s), '합친 칸 폭 계산 없음');
  assert.match(s, /repeat\(6,minmax\(0,1fr\)\)/);
});

test('7 넓은 화면: 공통 틀은 1600px 이상에서 1760px 까지', () => {
  const pg = read('components/page.tsx');
  assert.match(pg, /max-w-\[1440px\][^"]*min-\[1600px\]:max-w-\[1760px\]/);
  assert.match(read('components/region/Ahead.tsx'), /min-\[1600px\]:columns-3/, '넓은 화면 목록 세 단');
});

test('8 날짜: 지역 공급 예정일은 2026.10.11 · 날짜 없으면 2026.10', () => {
  assert.equal(R.aheadDay({ day: '2026-10-11', ym: '2026-10' }), '2026.10.11');
  assert.equal(R.aheadDay({ day: null, ym: '2026-11' }), '2026.11');
  const a = read('components/region/Ahead.tsx');
  assert.ok(!/월 \$\{Number\(e\.day/.test(a) && !/월 중/.test(a) && !/년 \$\{/.test(a), "'10월 11일'·'10월 중'·'2026년 10월' 없음");
  assert.ok(!/monthLabel\(calendar/.test(read('app/(dashboard)/region/page.tsx')));
});

test('9 입주 표기: 지역 공급 종류 칩은 \'입주 예정\'이고 정의(앞으로 12개월)·종합상황판 ⑥입주와의 차이가 title 에', () => {
  assert.equal(R.AHEAD_KIND.MOVE_IN, '입주 예정');
  assert.match(R.aheadKindTip('MOVE_IN'), /앞으로 12개월 입주 예정/);
  assert.match(R.aheadKindTip('MOVE_IN'), /⑥입주/);
  assert.match(read('app/(dashboard)/region/page.tsx'), /AHEAD_KIND\[t\]/);
});

test('후속 1 상단 메뉴 바: 대시보드는 1600px 이상에서 본문 틀과 같은 1760px 선, 지도(compact)도 같은 선(2026-10-18 통일)', () => {
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /mobile:px-3 min-\[1600px\]:ml-\[max\(0px,50vw_-_880px\)\] min-\[1600px\]:w-\[min\(1760px,100vw\)\]/);
  assert.match(nav, /ml-\[max\(0px,50vw_-_720px\)\] flex h-16 w-\[min\(1440px,100vw\)\]/, '1600px 아래·지도는 1440px 선');
  /* 1760 = 880 × 2, 본문 틀과 같은 값 */
  assert.match(read('components/page.tsx'), /min-\[1600px\]:max-w-\[1760px\]/);
  assert.match(read('app/(map)/layout.tsx'), /<TopNav compact \/>/);
  assert.match(read('assets/css/app.css'), /\.shell-map \.mhead\{padding-left:calc\(max\(0px,50vw - 720px\) \+ 28px\)/, '지도 머리 줄 1600px 아래는 1440px 선');
});

test('후속 2 후보 사업 지도 열: 수도권은 시군구 지도(구가 있는 시는 pick)·이름 \'시군구 지도\', 수도권 밖은 숨김, 번호 있는 사업은 사업 위치', () => {
  const L = require('../../lib/board/projects-list.ts');
  /* 지금 원장의 후보 2,039건은 모두 수도권 밖(→ 빈칸)이라 수도권 후보는 같은 행을 시군구만 바꿔 만든다(다음 원장에 생길 때의 규칙) */
  // 2026-10-19 수도권 한정: 원장에 후보(번호 없는 사업)가 0건이라 발급 사업 행을 issued:false 로 바꿔 후보 행을 만든다
  assert.ok(rows.every((r) => r.issued), '원장에 후보 행이 없다');
  const base = { ...rows[0], issued: false };
  for (const sgg of ['11680', '28245', '41281', '41280', '41135']) {
    const c = L.mapCell({ ...base, sgg });
    assert.equal(c.text, '시군구 지도', sgg);
    assert.ok(!c.href.includes('project='), sgg);
    assert.equal(c.href, GU.includes(sgg) ? `/map?sido=41&pick=${sgg}` : `/map?sgg=${sgg}`, sgg);
    assert.match(c.title, /후보 사업/);
    assert.equal(c.icon, undefined, '사업 위치 지도 표지와 구별');
  }
  assert.equal(L.mapCell({ ...base, sgg: '26110' }), null, '수도권 밖 후보는 빈칸(부산 중구로 바꾼 가상 행)');
  assert.match(L.mapCell(A2).href, /\/map\?project=PRJ-28245-0055/, '번호 있는 사업은 사업 위치');
  /* 간단 보기 서랍도 같은 규칙 */
  assert.match(read('components/projects/Candidate.tsx'), /mapScopeHref\(\{ sgg: r\.sgg \}\)[\s\S]*시군구 지도 ›/);
});
const GU = require('../../lib/board/map-href.ts').GU_CITY;
