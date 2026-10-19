'use strict';
/* 화면 재평가(impeccable 2026-10-14, 27/40 → 3차 28/40) 고침을 고정한다: 용어 한 체계(쉬운 말) · 요약 범위·숫자 정합(지금 ≤ 이 단계까지 온, 앞으로 12개월) · 보이는 도움말(ⓘ) ·
   요구사항 칩은 데이터 원본에만 · 후보 사업의 간단 보기(?cand=) · 목록 → 서랍 이동은 스크롤 유지 · 서랍 머리·단계 칸.
   3차 고침의 나머지(날짜 열 이름·단계 '지금' 하나·CSV·SVG 초점·본문 바로가기·인쇄 전용 숨김·기관 메뉴)는 tests/js/screens-a3.test.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const R = require('../../lib/board/region.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const BOARD = require('../../data/board/ledger-board.json');
const MOLIT = require('../../data/board/molit.json');
const calendar = require('../../data/board/region-calendar.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const sidoName = (c) => MOLIT.sido.find((x) => x.code === c)?.name ?? c;
const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName, sggName: (c) => c };
const Q = (f) => Object.fromEntries(V.questionsOf(rows, f, ctx).map((q) => [q.q, q]));
const num = (t) => Number(String(t).replace(/,/g, ''));

/* 화면에 글자를 내는 파일(지도 제외). 주석을 빼고, 원천·자료 이름(고유 명칭)은 용어 검사에서 뺀다 */
const SCREENS = [
  'app/(dashboard)/projects/page.tsx', 'app/(dashboard)/region/page.tsx', 'app/(dashboard)/month/[id]/page.tsx', 'app/(dashboard)/agency/[id]/page.tsx',
  'components/projects/Summary.tsx', 'components/projects/ProjectDetail.tsx', 'components/projects/StageSteps.tsx', 'components/projects/StageTimeline.tsx',
  'components/projects/Drawer.tsx', 'components/projects/Candidate.tsx', 'components/region/Ahead.tsx', 'components/region/Annual.tsx', 'components/region/Cond.tsx',
  'components/board/Board.tsx', 'components/board/RealPanels.tsx', 'components/StageKpis.tsx',
];
const NAMES = /미분양|통계누리 분양 실적|청약홈 분양정보|분양임대|주택분양/g;
const visible = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(NAMES, '');

test("용어표: 화면 글자에 '공식 0'·'세대'·'분양'이 없다(단계는 ①~⑥ 리본 이름, 단위는 호 — 원천 이름은 예외)", () => {
  for (const f of SCREENS) {
    const s = visible(read(f));
    for (const bad of ['공식 0', '세대', '분양']) assert.ok(!s.includes(bad), `${f}: '${bad}'`);
  }
});

/* 용어표(3차 재평가 H2 — 국민이 바로 이해하는 말): 옛 말 → 새 말. 옛 말은 화면 글자(주석 밖)에 남지 않는다 */
const TERMS = [
  ['거쳐 간 사업', '이 단계까지 온 사업'],
  ['번호 발급 전 사업(후보)', '후보 사업'],
  ['HOME 정책 진행(보이는 표지)', '정책 목표 대비'],
  ['정책별 목표 대비', '정책 목표 대비'],
  ['계획대로 가고 있는가(정책 칸)', '9·7 대책 목표 대비(범위는 칩)'],
  ['단계 파이프라인', '단계별 진행'],
  ['다음 일정 · 지난 예정(열)', '현재 예정'],
  ['목표 미배정', '목표 없음'],
  ['연결 확정 · 확정 전(보이는 글)', '정책 이름만(연결 상태는 title)'],
  ['곳(사업 수)', '건'],
];
test(`용어표: ${TERMS.map(([a, b]) => `${a} → ${b}`).join(' · ')}`, () => {
  const all = SCREENS.map((f) => visible(read(f))).join('\n');
  assert.doesNotMatch(all, /도달/);
  assert.doesNotMatch(all, /발급 전 후보|번호 발급 전|거쳐 간|목표 미배정/);
  assert.doesNotMatch(all, /'다음 일정'|'지난 예정'|>다음 일정<|>단계 파이프라인<|>HOME 정책 진행|'정책별 목표 대비'/);
  /* 연결 상태는 보이는 글이 아니라 title 에만: 글자 마디·문자열 값으로 '연결 확정'·'확정 전'을 내지 않는다 */
  assert.doesNotMatch(all, /'연결 확정'|'확정 전'|>[^<{]*(연결 확정|확정 전)[^<{]*</);
  assert.doesNotMatch(all, /[}\d]곳\b|\}곳 /, "사업 수 단위는 '건'");
  assert.doesNotMatch(all.replace(/담당자 추정 포함/g, ''), /추정 포함/);
  const sum = read('components/projects/Summary.tsx');
  assert.match(sum, /이 단계까지 온 사업 \{fmt\(c\.n\)\}/);
  assert.match(sum, /지금 이 단계 <b>\{fmt\(c\.now\)\}<\/b>/);
  assert.match(sum, />단계별 진행<\/h3>/);   // 소제목 h3 역할 16/700(2026-10-18 제목 역할 통일)
  assert.match(read('app/(dashboard)/projects/page.tsx'), /: '다른 정책 목표 대비'\} open=\{print\}/);
  assert.equal(V.CAND_NAME, '후보 사업');
  assert.equal(V.PLAN_COL, '현재 예정');
  assert.equal(V.CAND_PLAN, '원천 예정(확인 필요)');
  assert.equal(V.DELAY_GROUP, '지연(장기 포함)');
  assert.deepEqual([V.STATUS_RANGE.caution, V.STATUS_RANGE.delay, V.STATUS_RANGE.long], ['주의 1~6개월', '지연 6~12개월', '장기 12개월+']);
  for (const f of [{}, { metro: true }, { sido: '26' }]) {
    const q = Q(f);
    assert.match(q['어떤 사업이 늦어지는가'].sub, /^지연 6~12개월 [\d,]+ · 장기 12개월\+ [\d,]+(?: · 확인 필요\(후보\) [\d,]+)?$/);
    if (q['어디서 막혀 있는가'].sub !== '지연 사업 없음') assert.match(q['어디서 막혀 있는가'].sub, /^병목 · 지연\(장기 포함\) [\d,]+호$/);
  }
  /* 서랍 단계 줄: 공식 번호는 보이는 글에 없고 title 에만, ⑤ 준공 질문은 ③ 착공 질문을 베끼지 않는다 */
  const steps = read('components/projects/StageSteps.tsx');
  assert.doesNotMatch(steps, /BOARD_OFFICIAL_SHORT/);
  const qs = [...steps.slice(steps.indexOf('export const QUESTION'), steps.indexOf('] as const')).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(qs.length, 6); assert.equal(new Set(qs).size, 6, '칸마다 다른 질문');
  assert.match(qs[4], /사용검사/);
});

test('파이프라인 불변식: 칸마다 지금 이 단계 ≤ 거쳐 간 사업 — 수도권 전체·시도·정책·기관 범위 모두', () => {
  const scopes = [{}, { metro: true }, ...MOLIT.sido.map((s) => ({ sido: s.code })), ...IDX.policies.map((p) => ({ policy: p })), { agency: 'lh' }, { agency: 'etc' }];
  for (const f of scopes) {
    const p = V.pipelineOf(V.scopeOf(rows, f));
    for (const c of p.open) assert.ok(c.now <= c.n, `${JSON.stringify(f.sido ?? f.policy?.key ?? f.agency ?? f)} ${c.i}: 지금 ${c.now} > 거쳐 간 ${c.n}`);
  }
  /* 재평가에서 깨졌던 칸: 전국 ⑤ 준공, 수도권 ② 인허가 */
  // 2026-10-19 수도권 한정: 원장이 수도권 HOME 뿐이라 ⑤ 준공·⑥ 입주는 거쳐 간 사업이 없어 닫힌 칸(shut) — 열린 ④ 모집 칸으로 같은 불변식을 본다
  const pall = V.pipelineOf(rows);
  assert.deepEqual(pall.shut, [4, 5]);
  assert.equal(pall.open.find((c) => c.i === 4), undefined);
  const all = pall.open.find((c) => c.i === 3);
  assert.ok(all.now <= all.n);
  /* 요약 범위: 단계별 진행은 상태·단계 거르기를 따르지 않는다(목록에만) */
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /const pipe = pipelineOf\(scope\);/);
  assert.match(page, /단계·상태 거르기는 목록에만/);
  /* 범위가 다른 블록은 카드를 나누고 머리에 범위 칩: 정책 목표 대비(정책 전체 · 정책 진행 자료), 원장 요약(거르기 범위 · 사업 원장) — screens-b */
  assert.match(page, /<ScopeChip scope="정책 전체" source="정책 진행 자료"/);
  assert.match(page, /<ScopeChip scope=\{region\} source="사업 원장"/);
  const q1 = V.questionsOf(rows, { metro: true }, ctx)[0];
  assert.equal(q1.q, '9·7 대책 목표 대비');
});

test("앞으로 12개월: 같은 범위(원장 관측 달부터 12개월) — 사업 '준공 예정' = 지역 공급 '준공' 칩 = 종합상황판 준공 예정, 이름은 종류로 구분", () => {
  const months = V.aheadMonths(IDX.observedMonth);
  assert.deepEqual(months, calendar.months, '사업과 지역 공급의 12개월이 같은 달');
  assert.deepEqual(BOARD.upcoming.map((u) => u.ym), months, '종합상황판도 같은 달');
  for (const [f, sd] of [[{}, ''], [{ metro: true }, 'metro'], [{ sido: '41' }, '41'], [{ sido: '26' }, '26']]) {
    const q = Q(f)['앞으로 얼마나 공급되는가'];
    const comp = R.aheadAll(calendar, sd, sidoName).filter((e) => e.type === 'COMPLETION');
    assert.equal(num(q.value), comp.reduce((s, e) => s + e.units, 0), `${sd || '전국'} 호수`);
    assert.equal(q.sub, `${V.AHEAD_COMPLETION} · ${comp.length.toLocaleString('en-US')}건`, `${sd || '전국'} 건수`);
  }
  assert.equal(num(Q({})['앞으로 얼마나 공급되는가'].value), BOARD.upcoming.reduce((s, u) => s + u.units, 0));
  assert.equal(V.AHEAD_COMPLETION, '앞으로 12개월 · 준공 예정');
  assert.equal(V.AHEAD_ALL, '앞으로 12개월 · 모집·준공·입주 예정');
  assert.match(read('components/board/Board.tsx'), />\{AHEAD_COMPLETION\}<\/h2>/);
  assert.match(read('app/(dashboard)/region/page.tsx'), /isDefaultKinds\(kinds\) \? AHEAD_COMPLETION : kinds\.length === CAL_KINDS\.length \? AHEAD_ALL/);   // 기본 대표 = 준공(2026-10-15 결정)
  for (const f of SCREENS) assert.doesNotMatch(visible(read(f)), /향후 12개월|>앞으로 12개월</, f);
});

test('요구사항 칩(ReqTags)은 데이터 원본(/sources)에만', () => {
  const users = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && p !== 'components/ReqTags.tsx' && /<ReqTags\b/.test(read(p))) users.push(p); } };
  walk('app'); walk('components');
  assert.deepEqual(users, ['app/(dashboard)/sources/page.tsx']);
});

test('보이는 도움말: 핵심 정의는 눌러서 여는 ⓘ(Base UI Popover — 포커스·Esc·터치), 요약의 읽는 법은 ⓘ 하나로 접고 인쇄에는 펼친다', () => {
  const tip = read('components/ui/info-tip.tsx');
  assert.match(tip, /from '@base-ui\/react\/popover'/);
  assert.match(tip, /<Popover\.Trigger aria-label=\{`\$\{label\} 설명`\}/);
  assert.match(tip, /focus-visible:outline-2/);
  const sum = read('components/projects/Summary.tsx'), page = read('app/(dashboard)/projects/page.tsx');
  assert.match(sum, /export const ReadHelp = \(\) => <InfoTip label="읽는 법"/);
  assert.doesNotMatch(sum, /export function ReadGuide/, '읽는 법 두 줄을 화면에 늘어놓지 않는다');
  assert.match(page, /<ReadHelp \/>/); assert.match(page, /<PrintDefs \/>/);
  assert.match(page, /<InfoTip label="목록 읽는 법">/);
  assert.match(read('app/(dashboard)/region/page.tsx'), /<InfoTip label="앞으로 12개월 읽는 법">/);
});

test("후보 사업도 행을 누르면 간단 보기 서랍(?cand=<원장 id>) — 이름·시군구·단계·호수·원천 예정(확인 필요)·판정·출처, 안내 글은 예정 유무에 맞춘다", () => {
  // 2026-10-19 수도권 한정: 원장에 번호 없는 후보 행이 없다(전엔 건축HUB 후보 1,839·LH 후보) → 번호 있는 지연 사업을 issued=false 로 바꾼 합성 후보 행을 rows 에 더해 같은 동작을 본다
  assert.equal(rows.filter((r) => !r.issued).length, 0);
  const base = rows.find((r) => r.issued && r.cls === 'delay');
  const cand = { ...base, id: 'PRJ-99999-0001', issued: false, pks: undefined, why: null };
  const lhc = { ...base, id: 'PRJ-99999-0002', issued: false, pks: undefined, why: 'LH 후보' };
  const rowsC = [...rows, cand, lhc];
  const c = V.candidateOf(rowsC, cand.id);
  assert.equal(c.row.id, cand.id);
  assert.ok(c.sources.length >= 1);
  assert.ok(!c.sources.some((s) => /\d{10,}/.test(s)), '관리번호 값은 보이지 않는다');
  assert.equal(V.candidateOf(rowsC, 'PRJ-00000-0000'), null);
  assert.equal(V.candidateOf(rowsC, null), null);
  assert.ok(V.candidateOf(rowsC, lhc.id).sources.includes('LH 준공 예정 파일'));
  assert.match(V.nextOf(cand).tag, /^경과 \d+개월$/, "지난 예정은 빨강 대신 '경과 n개월' 꼬리표");
  assert.equal(V.nextOf(cand).tone, undefined);
  /* 주소: 상세(?id=)와 나눈다 */
  assert.equal(V.listHref({ metro: true }, { cand: cand.id }), `/projects?cand=${cand.id}`);
  assert.equal(V.listHref({}, { cand: cand.id }), `/projects?sido=all&cand=${cand.id}`);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(read('lib/board/projects-list.ts'), /const href = r\.issued \? listHref\(f, \{ id: r\.id \}\) : listHref\(f, \{ cand: r\.id \}\);/, '모든 행이 눌린다');
  assert.match(page, /<Candidate row=\{cand\.row\}/);
  const comp = read('components/projects/Candidate.tsx');
  assert.doesNotMatch(comp, /상세 일정 없음/, "'일정 없음'과 예정 표시가 함께 나오지 않는다");
  assert.match(comp, /: next \? '사업 번호가 아직 없는 후보 사업입니다 · 예정일은 원천 자료에 적힌 값이라 확인이 필요합니다'/);
  assert.match(comp, /<dt>\{r\.issued \? PLAN_COL : CAND_PLAN\}<\/dt>/);
  for (const t of ['시군구', '단계', '계획 호수', '판정', '출처']) assert.ok(comp.includes(`<dt>${t}</dt>`), t);
  /* 지역 공급 목록의 후보 행도 막다른 줄이 아니다 */
  const ahead = read('components/region/Ahead.tsx');
  assert.equal(R.projectHref({ id: 'X1', drawer: false, sd: '26' }, ''), '/projects?sido=26&cand=X1');   // 후보는 간단 보기(?cand=), 범위 붙임(data-audit-1016 결함 3)
  assert.match(ahead, /\{' '\}<span[^>]*>\{W\.cand\}<\/span>/, "이름과 '(후보)' 사이에 글자 띄어쓰기");
});

test('서랍: 목록 링크는 스크롤 유지(scroll=false), 머리는 두 열 격자(× 오른쪽 고정), 단계 칸은 지금 거르기 유지', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(read('lib/board/projects-list.ts'), /name: r\.issued \? \{ text: r\.name, href, stay: true \}/);
  assert.match(read('components/ui/data-grid.tsx'), /<Link href=\{o\.href\} scroll=\{o\.stay \? false : undefined\}/);
  const drawer = read('components/projects/Drawer.tsx');
  assert.match(drawer, /grid grid-cols-\[minmax\(0,1fr\)_auto\] items-start/);
  assert.match(drawer, /a\[href\$="=\$\{n\.last\}"\]/, '닫으면 ?id=·?cand= 행 링크로 초점');
  assert.match(page, /const stageHref = \(i: number\) => listHref\(f, \{ stage: String\(i\) \}\);/);
  assert.match(read('components/projects/ProjectDetail.tsx'), /<StageSteps current=\{r\.board\} reached=\{r\.reached\} listHref=\{stageHref\(r\.board\)\} \/>/);
  assert.equal(V.listHref({ sido: '26', status: 'check' }, { stage: '2' }), '/projects?sido=26&stage=2&status=check');
});

test('회의실 투사: 보조 글자색(라이트 --muted-foreground)은 카드·바탕·강조 면 위 6:1 이상', () => {
  const css = read('app/globals.css');
  const light = css.slice(css.indexOf('\n:root {'), css.indexOf('\n}\n', css.indexOf('\n:root {')));
  const t = (n) => new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(light)[1];
  const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const bg of ['card', 'background', 'muted', 'accent', 'pn2']) assert.ok(ratio(t('muted-foreground'), t(bg)) >= 6, `${bg} ${ratio(t('muted-foreground'), t(bg)).toFixed(2)}`);
});
