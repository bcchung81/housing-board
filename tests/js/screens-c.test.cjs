'use strict';
/* 독립 디자인 평가(27/40) 화면 고침 C(2026-10-15) — clarify:
   1 리본 지연 띠 끊김(판정 기준 변경 2026.10 구분선·꼬리표, 그 앞 띠는 후보 포함이라 빗금) · 2 같은 이름 다른 숫자(③착공 정의 꼬리, 앞으로 12개월 대표 = 준공 예정)
   3 지도 → 서랍 맥락(?from=map&sgg=) · 4 제목 단계(h1 → h2) · 지역 공급 시군구 select 는 '보기'·Enter 로 이동 · 시도 타일 판정 대상 없음 · /agency/gh 표 · 인쇄 보기 조작 표지 · 1280 리본 가로 스크롤 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const S = require('../../lib/board/sample.ts');
const RB = require('../../components/board/ribbon.ts');
const V = require('../../lib/board/projects-view.ts');
const PL = require('../../lib/board/projects-list.ts');
const R = require('../../lib/board/region.ts');
const M = require('../../lib/board/metro-overview.ts');
const { makeDirectives } = require('../../lib/board/directives.ts');
const BOARD = require('../../data/board/ledger-board.json');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const CAL = require('../../data/board/region-calendar.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const fctx = { policies: IDX.policies, programs: IDX.programs, sidoOk: () => true, guOf: M.guOf };
const qctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };
const board = read('components/board/Board.tsx');
const num = (s) => Number(String(s).replace(/,/g, ''));
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

test('1 리본: 2026.10 판정 기준 변경 — 구분선·꼬리표, 그 앞 지연 띠는 빗금(후보 포함), 범례·aria·추이 카드가 같은 말', () => {
  const T = S.timelineOf(BOARD), J = S.judgmentsOf(BOARD), SF = S.scopeChangeOf(J);
  assert.equal(BOARD.months[SF], '2026-10', '변경 달 = candidate 가 처음 있는 판정 달');
  assert.ok(J[SF - 1].delay.units > 10000 && J[SF].delay.units === 1666, '2026.09 수만 호 → 2026.10 1,666호(다시 계산하지 않는다)');
  // 2026-10-19 수도권 한정: 2026-10 행의 addedSources(원천 추가) 5건은 모두 비수도권 사업 몫이라 사라졌다 → 변경 표지는 판정 기준 변경 하나뿐
  assert.equal(BOARD.trend.find((r) => r.month === '2026-10').addedSources, undefined, '같은 달에 원천 추가 없음');
  assert.equal(S.scopeChangeOf(S.judgmentsOf({ ...BOARD, trend: [] })), -1, '소급 이력이 없으면 변경 없음');
  const g = S.ribbonOf(T, BOARD.stageUnits, S.delaysOf(J), SF);
  assert.equal(S.staticTexts(g).scope.t, '판정 기준 변경 · 2026.10부터 번호 있는 사업만');
  const svg = RB.chartStatic(g, -1);
  assert.equal((svg.match(/data-band-old/g) || []).length, 6, '단계 6개의 앞 구간 띠');
  assert.match(svg, /<pattern id="band-old"/);
  assert.match(svg, /<g data-scope-change><line x1="([\d.]+)"/);
  assert.equal(Number(/<g data-scope-change><line x1="([\d.]+)"/.exec(svg)[1]), Number(g.X(SF).toFixed(1)), '구분선 = 2026.10 칸 왼쪽 끝');
  assert.match(svg, />판정 기준 변경 · 2026\.10부터 번호 있는 사업만</);
  assert.doesNotMatch(RB.chartStatic(S.ribbonOf(T, BOARD.stageUnits, S.delaysOf(J)), -1), /data-band-old|data-scope-change/, '변경 달이 없으면 그리지 않는다');
  assert.match(board, /ribbonOf\(T, L\.stageUnits, DL, SF\)/);
  assert.match(board, /data-slot="band-old-key"[\s\S]*?지연 · 후보 포함<\/span>/, '범례');
  assert.match(board, /const scopeAria = [^\n]*세로 구분선: \$\{SCOPE_TAG/, 'aria-label');
  assert.match(board, /그 앞 빗금 띠는 후보 포함/, '카드 제목 title');
  assert.match(board, /const amName = \(a: \{ m: number \}\) => \(a\.m === SF \? '기준 변경' : '원천 추가'\);/, '추이 표지 이름표');
  assert.match(board, /amSel\.m === SF \? '판정 기준 변경' : '원천 추가'\}으로 판정 대상이 바뀜/, "'비교 불가' 사유");
});

test('2 ③착공 세 숫자에 보이는 정의 꼬리: 종합상황판 단계표 = 지금 · 사업 화면 단계별 진행 = 누적 · 지시 카드 = 통계누리', () => {
  assert.match(board, /data-slot="stage-def"[^>]*>호수 <span[^>]*>· \{cursor === NOW \? '지금'/, '단계표 머리: 호수 · 지금');
  const sum_ = read('components/projects/Summary.tsx');
  assert.match(sum_, /<small data-slot="stage-def"[^>]*>누적<\/small>/, '단계별 진행 큰 숫자 곁: 누적');
  const D = makeDirectives({ sourceCount: 30, stageNames: [...V.BOARD_NAMES], ledger: BOARD, start: { year: '2026', upto: 8, cum: 156396, cumLy: 1 }, bottleneck: V.bottleneckOf });
  /* 지시 카드: 보이는 앞말 '착공 누계'(단계표 '③ 착공' = 지금 단계와 다른 말 — 2026-10-18 사용자 결정), 원천(통계누리)·기간은 (i) 기준 첫머리(줄1 꼬리는 뺐다) */
  assert.equal(D[0].tag, undefined);
  assert.equal(D[0].pre, '착공 누계');
  assert.match(D[0].basis, /^통계누리 수도권 착공 2026년 1~8월 누계/);
  assert.match(board, /<p>\{x\.basis\}<\/p>/, '기준은 카드 (i) 팝오버에 보인다');
  /* 세 값이 실제로 다른 정의임: 단계표(지금 ③) ≠ 단계별 진행(③까지 온 누적) */
  const now3 = BOARD.stageUnits[BOARD.now][2], pipe = V.pipelineOf(V.scopeOf(rows, {})).open.find((c) => c.i === 2);
  assert.ok(pipe.units > now3, `누적 ${pipe.units} > 지금 ${now3}`);
});

test('2 앞으로 12개월 대표 = 준공 예정: 지역 공급 기본(준공만)·사업 화면·종합상황판·지도 계산 규칙이 같은 값(수도권 13,372호)', () => {
  assert.deepEqual(R.parseKinds(undefined), ['COMPLETION']);
  const completion = (sido) => sum(R.aheadAll(CAL, sido, (c) => c).filter((e) => R.parseKinds(undefined).includes(e.type)), (e) => e.units);
  const q5 = (f) => num(V.questionsOf(rows, f, qctx).find((x) => x.q === '앞으로 얼마나 공급되는가').value);
  /* 지도 개요와 맞출 규칙: region-calendar.json 의 COMPLETION 항목(서울·인천·경기)의 units 합 */
  const mapRule = sum(['11', '28', '41'].flatMap((c) => CAL.sido[c] ?? []).filter((e) => e.type === 'COMPLETION'), (e) => e.units);
  assert.equal(completion('metro'), 13372, '수도권 대표(준공 예정)');
  assert.equal(q5({ metro: true }), 13372, '사업 화면 수도권');
  assert.equal(mapRule, 13372, '지도 개요 규칙');
  // 2026-10-19 수도권 한정: 전국 214,975호 → 수도권과 같은 13,372호 (캘린더·원장이 수도권뿐이라 '전국'(필터 없음)도 같은 값)
  assert.equal(completion(''), 13372);
  assert.equal(q5({}), 13372);
  assert.equal(sum(BOARD.upcoming, (m) => m.units), 13372, '종합상황판(수도권)');
  const region = read('app/(dashboard)/region/page.tsx');
  assert.match(region, /isDefaultKinds\(kinds\) \? AHEAD_COMPLETION/, '기본 제목 = 앞으로 12개월 · 준공 예정');
  assert.match(region, /if \(!isDefaultKinds\(ks\)\) s\.set\('kind'/, '주소는 기본(준공)과 다를 때만');
  assert.match(region, /\{fmt\(xs\.length\)\}건 · \{fmt\(xs\.reduce\(\(s, e\) => s \+ e\.units, 0\)\)\}호/, '모집·입주는 칩의 건수·호수로 분해');
  assert.match(board, />\{AHEAD_COMPLETION\}<\/h2>/);
  assert.equal(V.AHEAD_COMPLETION, '앞으로 12개월 · 준공 예정');
});

test('3 지도 → 서랍: ?from=map&sgg= 는 그 시군구 목록 위에 서랍, 머리에 지도로 돌아가기, 닫으면 그 시군구 목록', () => {
  const id = Object.keys(IDX.projects).find((k) => k.startsWith('PRJ-41281-'));
  const f = V.parseFilters({ id, from: 'map', sgg: '41281' }, fctx);
  assert.equal(f.from, 'map'); assert.equal(f.sgg, '41281');
  assert.equal(V.listHref(f), '/projects?sgg=41281', '닫기 주소 = 그 시군구 목록(from 은 다시 적지 않는다)');
  assert.ok(V.applyFilters(rows, f).every((r) => r.sgg === '41281') && V.applyFilters(rows, f).some((r) => r.id === id));
  assert.equal(V.parseFilters({ id, from: 'map' }, fctx).sgg, '41281', 'sgg 가 없으면 사업 id 의 시군구');
  assert.equal(V.parseFilters({ id, sgg: '41281' }, fctx).from, undefined);
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /back=\{f\.from === 'map' && sel \? \{ href: mapHref\(\{ project: sel \}\), label: '지도로 돌아가기'/);
  assert.match(read('components/projects/Drawer.tsx'), /<a href=\{back\.href\} data-slot="drawer-back"[\s\S]*?\{back\.label\}<ChevronRight/);
});

test('4 제목 단계·select·시도 타일·GH 표·인쇄 표지·1280 리본', () => {
  /* 제목: 사업 화면(h1 사업 / 인쇄 h1 월간 주택공급 보고) 아래 카드 소제목은 h2 — h3 로 건너뛰지 않는다 */
  const sum_ = read('components/projects/Summary.tsx');
  assert.equal((sum_.match(/<h3 className="ui-h3"/g) || []).length, 1, '단계별 진행은 소제목 h3 역할(16/700 — 2026-10-18 제목 역할 통일)');
  assert.equal((sum_.match(/<h2 className=\{h3\}/g) || []).length, 1, '정책 목표 대비');
  assert.doesNotMatch(read('app/(dashboard)/projects/page.tsx'), /<h3/);
  /* 시군구 select: 바꾸면 고르기만(setDraft), 이동은 form 제출('보기'·Enter) */
  const ahead = read('components/region/Ahead.tsx');
  assert.match(ahead, /<select [^>]*onChange=\{\(ev\) => setDraft\(ev\.target\.value\)\}/);
  assert.doesNotMatch(ahead, /onChange=\{\(ev\) => pickSgg/);
  assert.match(ahead, /<form data-slot="sgg-pick"[^>]*onSubmit=\{\(ev\) => \{ ev\.preventDefault\(\); if \(draft !== \(cur\?\.code \?\? ''\)\) pickSgg\(draft \|\| null, true\); \}\}/);
  assert.match(ahead, /if \(ev\.key === 'Enter'\) \{ ev\.preventDefault\(\); ev\.currentTarget\.form\?\.requestSubmit\(\); \}/);
  assert.match(ahead, /<button type="submit"[^>]*>보기<\/button>/);
  /* 시도 타일: 판정 대상 없음(번호 있는 사업 없음) 13곳은 '—' 대신 이유와 확인 필요 건수 — 2026-10-16 4차부터 다시 16칸 타일마다(r4-board 1) */
  // 2026-10-19 수도권 한정: 판정 대상 없는 시도 13 → 0 (시도 타일이 서울·인천·경기 3곳뿐이고 모두 번호 있는 사업이 있다)
  assert.equal(BOARD.regions.length, 3);
  assert.equal(BOARD.regions.filter((r) => !r.judged).length, 0);
  assert.match(board, /data-slot="region-none"[^>]*>판정 대상 없음\{r\.candidate\?\.judged \? <> · 확인 필요 \{f\(r\.candidate\.judged\)\}건<\/> : null\}/);
  assert.doesNotMatch(board, /\{rate === null \? '—'/);
  /* /agency/gh: 사업 목록과 같은 열·칸(①~⑥ 알약), 행 → 서랍 */
  const ag = read('app/(dashboard)/agency/[id]/page.tsx');
  assert.match(ag, /listRows\(ghRows, \{ agency: 'gh' \}/);
  assert.match(ag, /dropBlank\(LIST_COLS, ghGridRows\)/);
  assert.match(ag, /<PanelLink href="\/projects\?sido=all&agency=gh"/, '기본 파란 밑줄 링크 대신 패널 링크');
  const gh = rows.filter((r) => r.agency === 'gh'), gr = PL.listRows(gh, { agency: 'gh' }, null, () => undefined);
  assert.equal(gr.length, 4);
  for (const r of gr.filter((x) => IDX.projects[x.id])) { assert.match(r.href, /^\/projects\?sido=all&agency=gh&id=PRJ-/); assert.ok(r.c.stage.pill, '단계 색 알약'); assert.match(r.c.stage.text, /^[①-⑥] /); }
  /* 인쇄 보기: ⓘ(InfoTip)·'›' 는 data-ctl, 인쇄 미리보기 묶음이 숨기고 인쇄용 정의를 펼친다 */
  assert.match(read('components/ui/info-tip.tsx'), /<Popover\.Trigger aria-label=\{`\$\{label\} 설명`\} data-ctl/);
  assert.match(sum_, /<span data-ctl className="[^"]*print:hidden" aria-hidden="true">›<\/span>/);
  assert.match(read('app/(dashboard)/projects/page.tsx'), /<div className="contents \[&_\[data-ctl\]\]:hidden! \[&_\[data-print-defs\]\]:block!">\s*\{reportHead\}\s*\{summary\}\s*\{report\}/);
  /* 1280 폭(스크롤바 15px 포함): 리본 칸 = 1265 − 좌우 여백 56 − 오른쪽 칸 clamp(340,30vw,400) − 간격 14 − 카드 안 여백 42 ≥ 리본 최소 폭 */
  assert.match(board, /grid-cols-\[minmax\(0,1fr\)_clamp\(340px,30vw,400px\)\]/);
  const minW = Number(/relative min-w-\[(\d+)px\] cursor-pointer/.exec(board)[1]);
  for (const vw of [1101, 1280, 1440]) {
    const w = vw - 15, right = Math.min(400, Math.max(340, 0.3 * w)), left = Math.min(1440, w) - 56 - right - 14 - 42;
    assert.ok(left >= minW, `${vw}px: 리본 칸 ${left.toFixed(0)}px ≥ ${minW}px`);
  }
});

test('불변식: 지연 2건 · 후보 0건 · 앞으로 12개월 수도권 13,372호', () => {
  const j = BOARD.judgment, c = j.candidate;
  assert.equal(j.delay.projects, 2);
  // 2026-10-19 수도권 한정: 후보 1,839 → 0, 앞으로 12개월 214,975 → 13,372호
  assert.equal(c.ok.projects + c.caution.projects + c.delay.projects, 0);
  assert.equal(sum(BOARD.upcoming, (m) => m.units), 13372);
});
