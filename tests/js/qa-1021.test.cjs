'use strict';
/* 2026-10-21 화면 점검(ego lite, .cache/home-parity/qa/qa-report.md) 17건 중 3D 밖 항목과 사용자 결정 6가지:
   ① 3D 축은 정면 시점(wave3d-ui) ② 툴팁 두 열(wave3d-ui) ③ 병목 = '/' 정의(HOME 집계 단계 부족량)로 /projects 도 ④ #15 들어올 해 기준 유지 + 지난 들어올 날 따로(전제 정정 뒤 다시 정함 — 실제 기록 '이미 들어왔어요' · 예정만 '들어올 예정일이 지났어요') ⑤ 기관 원천 글자 번호 머리 떼기(원문은 title) ⑥ 'n블록 · m줄'. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* 주석은 검사에서 뺀다 */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const V = require('../../lib/board/projects-view.ts');
const CALC = require('../../lib/board/calc.ts');
const HA = require('../../lib/board/home-agency.ts');
const HP = require('../../data/board/home-projects.json');
const HB = require('../../data/board/home-board.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');

const rows = V.homeRowsOf(HP.rows, HP.residuals, HB.home.stageShort);
const hctx = { policies: IDX.policies, programs: V.homeProgramsOf(rows), sidoOk: () => true, home: { agencies: V.homeAgenciesOf(rows).map((a) => a.name) } };
const qctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };
const CIRCLED = /[①②③④⑤⑥]/;

test('#1 /projects 집계 건수 = 물량 있는 집계 행(지도와 같은 문구) — 전 정책 346건 · 물량 없음 41건', () => {
  const f = V.parseFilters({ policy: 'all' }, hctx), scope = V.scopeOf(rows, f), s = V.homeSummaryOf(scope, V.homeChartOf(f));
  assert.deepEqual([s.n, s.counted, s.excluded, s.missing], [443, 346, 56, 41]);
  const page = code(read('app/(dashboard)/projects/page.tsx'));
  assert.match(page, /`집계 \$\{fmt\(s\.counted\)\}건 · 중복·모호 제외 \$\{fmt\(s\.excluded\)\}\$\{s\.missing \? ` · 물량 없음 \$\{fmt\(s\.missing\)\}건` : ''\}`/);
  assert.doesNotMatch(page, /집계 \$\{fmt\(s\.chart\)\}건/);
});

test('#2 /sources 단계별 데이터 연계 탭 패널: 격자 칸이 내용만큼 넓어지지 않는다(minmax(0,1fr))', () => {
  assert.match(read('components/sources/StageLinks.tsx'), /role="tabpanel"[^>]*className="mt-3 grid grid-cols-\[minmax\(0,1fr\)\] gap-3"/);
});

test('#3 /citizen/schedule 시군구 펼침 목록은 오른쪽 기준(390 에서 화면 밖으로 나가지 않음)', () => {
  assert.match(read('app/(dashboard)/citizen/schedule/page.tsx'), /<ChipMenu label="시군구" fixed right on=\{!!sgg\}/);
});

test('#8·#14 /citizen: 단계 탭 칸 수 14px(12px 금지) · 좁은 카드(600 미만)에서 청약 단지 위치는 이름 아래 줄 · 단계 칩은 줄지 않음', () => {
  const t = read('tools/design/public-mock/template.html');
  assert.match(t, /\.ui-tabs \.n \{ font-size: var\(--fs-meta\); \}/);
  assert.match(t, /@container pj \(max-width: 599px\) \{[^}]*#c-pj \.pjs \.ev \.nmw \{ flex-wrap: wrap;[^}]*\}\s*#c-pj \.pjs \.ev \.nmw \.pj-dg \{ flex: 1 0 100%; \}\s*#c-pj \.pjs \.ev \.pj-st \{ flex: none; \}/);
});

test('#9 /map 순위 숫자(12px)는 굵기 700', () => {
  assert.match(read('assets/css/app.css'), /\.ov-rn\{font-size:var\(--text-xs\);font-weight:700;/);
});

test("#10 /sources 수집 상태 이름 = 실패 · 조회 범위 일부 · 정상('경고' 없음)", () => {
  const c = code(read('components/sources/Collect.tsx'));
  assert.doesNotMatch(c, /경고/);
  assert.match(c, /text: '조회 범위 일부'/);
});

test("#11 '/' 판정 이름은 '정상'('목표 달성' 없음)", () => {
  assert.doesNotMatch(code(read('components/board/Board.tsx')), /목표 달성/);
});

test('#12 /projects 단계 이름에 원 숫자 없음(목록 단계 열·단계별 진행·핵심 질문·거르기 칩·정의)', () => {
  const r = rows.find((x) => x.board === 4);
  assert.doesNotMatch(require('../../lib/board/projects-list.ts').homeStagePill(r).text, CIRCLED);
  for (const q of [{}, { policy: 'all' }, { sido: '41' }]) for (const x of V.homeQuestionsOf(rows, V.parseFilters(q, hctx), qctx)) {
    assert.doesNotMatch(`${x.value} ${x.sub} ${x.tip ?? ''}`, CIRCLED, x.q);
  }
  assert.doesNotMatch(code(read('app/(dashboard)/projects/page.tsx')), /BOARD_CIR/);
  const sum = code(read('components/projects/Summary.tsx'));
  const pipe = sum.slice(sum.indexOf('export function Pipeline'), sum.indexOf('\n}\n', sum.indexOf('export function Pipeline')));
  assert.match(pipe, /const stageName = \(i: number\) => \(home \? NAMES\[i\] : /, '단계별 진행 칸 이름은 stageName(i) — HOME 이면 원 숫자 없음');
  assert.equal((pipe.match(/BOARD_CIR/g) ?? []).length, 1, 'BOARD_CIR 는 stageName 안에서만');
});

test("#13 병목 = '/' 정의: 행 묶음의 단계 부족량 max(0, Σ목표 − Σ누적 도달), 지연(2% 이상) 먼저 · 큰 순 — 9·7 기본은 '/' 카드와 같다", () => {
  const chart = rows.filter((r) => r.home.board);
  assert.equal(chart.length, HB.scope.projects);
  const g = V.homeStageGapsOf(chart);
  assert.deepEqual(g.gaps.map((x) => [x.stage, x.status, x.gap, x.rate]), HB.home.stageGaps.map((x) => [x.stage, x.status, x.gap, x.rate]), "'/' home.stageGaps 와 같다");
  assert.deepEqual([g.neck.stage, g.neck.gap], [HB.home.bottleneck.stage, HB.home.bottleneck.gap]);
  for (const [k, c] of Object.entries(HB.home.stageChecks)) if (c.due && k !== 'MOVE_IN') assert.equal(g.due[k], c.due.units, `${k} 도래 목표 합`);
  /* 핵심 질문 ② */
  const q = V.homeQuestionsOf(rows, V.parseFilters({}, hctx), qctx).find((x) => x.q === '어디서 막혀 있는가');
  assert.equal(q.value, '건설');
  assert.equal(q.sub, '병목 · 지연 1,988호');
  assert.match(q.href, /status=short-COMPLETION/);
  assert.match(q.tip, /도래 목표 대비 누적 부족량/);
  /* 시도로 좁혀도 같은 셈(그 시도 행만) — 부족량은 음수가 아니고, 단계 부족 목록 주소는 거르기를 유지 */
  for (const sido of ['11', '28', '41']) {
    const f = V.parseFilters({ sido }, hctx), sc = V.applyFilters(rows, { ...f, stage: undefined, status: undefined }).filter(V.homeChartOf(f));
    const gs = V.homeStageGapsOf(sc);
    assert.ok(gs.gaps.every((x) => x.gap > 0 && /^\d+\.\d%$/.test(x.rate)), sido);
    const qq = V.homeQuestionsOf(rows, f, qctx).find((x) => x.q === '어디서 막혀 있는가');
    if (gs.neck) assert.match(qq.href, new RegExp(`sido=${sido}.*status=short-${gs.neck.stage}|status=short-${gs.neck.stage}.*sido=${sido}`));
    else assert.equal(qq.value, '없음');
  }
});

test("#15 /citizen/projects 해 묶음: 들어올 해(입주 → 준공) 기준 유지, 지난 들어올 날은 따로(실제 = '이미 들어왔어요' · 예정 = '들어올 예정일이 지났어요')", () => {
  const PL = require('../../lib/board/public-labels.ts'), DET = require('../../data/board/project-detail.json'), today = '2026-10-21';
  /* 화면과 같은 길: HOME 9·7 집계 행 → 같은 현장 원장 사업의 네 고비(stepsOf) → publicItems → byYear */
  const xs = rows.filter((r) => r.home.chart.p97 && V.isMetro(r.sgg)).map((r) => ({ id: r.id, name: r.name, sgg: r.sgg, area: '', units: r.home.counted ?? 0, board: 0, issued: true, cls: r.cls, overdue: null, next: null,
    pastDue: false, steps: r.home.ourId && DET.projects[r.home.ourId] ? PL.stepsOf(DET.projects[r.home.ourId].stages) : [null, null, null, null], agency: '', progress: null }));
  const items = PL.publicItems(xs, today, (c) => c), g = PL.byYear(items, today);
  const past = g.find((x) => x.year === PL.PAST_YEAR);
  assert.ok(past && past.items.some((x) => /인천검단 AA-21BL/.test(x.full) && x.inDay === '2025-06'), '점검 예시(입주 예정 2025년 6월 — 기록 없음)는 예정일 지남 묶음');
  assert.equal(past.label, '들어올 예정일이 지났어요');
  assert.ok(past.items.every((x) => !x.inDone && PL.periodEnd(x.inDay) < today));
  for (const x of g.filter((y) => /^\d{4}$/.test(y.year))) {
    assert.equal(x.label, `${x.year}년 들어와요`);
    assert.ok(x.year >= '2026' && x.items.every((y) => !y.inDone && PL.periodEnd(y.inDay) >= today), `${x.label}: 아직 오지 않은 들어올 날만`);
  }
  assert.equal(g.reduce((n, x) => n + x.items.length, 0), items.length, '빠지는 사업 없음');
  /* 합성: 순서 = 해 → 예정일 지남 → 이미 들어옴 → 연도 미정, 올해 안의 지난 날도 따로 */
  const it = (inDay, inDone) => ({ inDay, year: inDay.slice(0, 4), inDone, units: 1 });
  assert.deepEqual(PL.byYear([it('2027-03', false), it('2025-06', false), it('2025-02-01', true), it('', false), it('2026-11', false), it('2026-03', false), it('2026', false)], today).map((x) => [x.label, x.items.length]),
    [['2026년 들어와요', 2], ['2027년 들어와요', 1], ['들어올 예정일이 지났어요', 2], ['이미 들어왔어요', 1], ['연도 미정', 1]]);
});

test("#16 LH 준공 예정: 위치는 되풀이 토막을 뺀 글(원문은 title) · 머리는 'n블록 · m줄'", () => {
  assert.equal(CALC.addrText('경기도 이천시 경기 이천시 경기 이천시'), '경기도 이천시');
  for (const p of ['app/(dashboard)/agency/[id]/page.tsx', 'app/(dashboard)/month/[id]/page.tsx']) {
    const s = code(read(p));
    assert.match(s, /location: lhLoc\(b\.location\)/, p);
    assert.match(s, /`\$\{fmt\(blockTotal\)\}블록 · \$\{fmt\(blocks\.length\)\}줄`/, p);
  }
});

test("#17 기관 원천 글자: 번호 머리를 떼고 쉼표는 가운뎃점('4)공공(LH,SH,GH)' → '공공(LH·SH·GH)'), 원문은 title", () => {
  assert.equal(HA.agencyShow('4)공공(LH,SH,GH)'), '공공(LH·SH·GH)');
  assert.equal(HA.agencyShow('1)조합'), '조합');
  assert.equal(HA.agencyShow('LH'), 'LH');
  const b = code(read('components/board/Board.tsx'));
  assert.match(b, /\{a\.id === 'unknown' \? AGENCY_NAME\.etc : agencyShow\(a\.name\)\}/);
  assert.match(code(read('lib/board/projects-list.ts')), /agencyShow\(r\.agency\)/);
});
