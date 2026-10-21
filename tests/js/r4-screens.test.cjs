'use strict';
/* 4차 평가 고침 — 사업(/projects·인쇄)·지역 공급(/region)·데이터 원본(/sources)·공통 UI.
   1 목표 대비는 달성률 하나('부족 n%' 없음) + 막대에 100% 기준선(목표) · 2 패널 머리 범위 칩(ScopeChip 하나로)
   3 카드·패널 제목 말줄임 없음(두 줄 허용) · 4 '후보 계산' 정의 한 줄(목록 머리·상태 칩 ⓘ) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* 주석을 뺀 코드(보이는 글·title 검사용) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const tips = (s) => [...s.matchAll(/<InfoTip\b[\s\S]*?<\/InfoTip>/g)].map((m) => m[0]);
const V = require('../../lib/board/projects-view.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };

test('1 목표 대비는 달성률 하나: ① 달성 24.2%(3,560/14,694) · ② 달성 230.7%(3,560/1,543) · ④ 달성 58.8% · ⑤ 달성 100.0%', () => {
  const cells = V.policyStageCells(PP, 'POL_2025_0907');
  const pair = cells.filter((c) => c.target != null && c.actual != null);
  assert.deepEqual(pair.map((c) => `${c.actual}/${c.target} ${V.rateOf(c).word}`), ['18074/13914 달성 129.9%', '10403/8386 달성 124.1%', '4963/8049 달성 61.7%', '381/381 달성 100.0%']);   // 2026-10-22 새 덤프(20261021T212310Z): ①사업화 −780(병점복합타운 주복1 사업화가 2025년으로) · ④공급 확인 +231(추정 → 원천 확인 3건) · 2026-10-21 새 덤프(20261020T142230Z, PoC 운영 값과 같음): 9·7 ①사업화 확인 7,808→18,854(목표 14,694 넘음) · ②인허가 목표 3,658→8,386·확인 6,249→10,403 — 덤프 뒤였던 담당자 단계 측정값·승인 일정이 새 판에 들어옴 · 2026-10-20 HOME 판(HOME 운영 API 와 같음): 9·7 ①사업화 확인 3,560→7,808 · ②인허가 목표 1,543→3,658·확인 3,560→6,249
  for (const c of pair) assert.equal(V.rateOf(c).unit, '% 달성', c.key);
  /* 핵심 질문 첫 칸(9·7) 값도 달성률 */
  const q0 = V.questionsOf(rows, {}, ctx)[0];
  assert.deepEqual([q0.value, q0.unit], ['129.9', '% 달성']);   // 2026-10-22 새 덤프(20261021T212310Z): ①사업화 18,074/13,914 · 2026-10-21 새 덤프 · 2026-10-20 HOME 판
  /* '부족'은 보이는 글·title·ⓘ 어디에도 쓰지 않는다(요약·인쇄 보기 모두 Summary.tsx·page.tsx 가 그린다) */
  /* 2026-10-21: 사업 화면 목록·창은 PoC 사업 판정이라 '부족 호수' 열이 생겼다(page.tsx·projects-list.ts) — 목표 대비 요약(Summary.tsx)은 달성률만 */
  assert.doesNotMatch(code(read('components/projects/Summary.tsx')), /부족/, 'Summary.tsx');
  for (const c of cells) assert.doesNotMatch(V.stageCellTip(c, '9·7', cells), /부족/, c.key);
  for (const t of [q0.help, q0.tip, q0.note ?? '', q0.sub]) assert.doesNotMatch(t, /부족/);
  const lines = V.compareLines(PP, IDX.policies, rows, IDX.policies.map((p) => p.key));
  assert.equal(V.compareHead(lines[0]), '9·7 · 목표 있는 4단계 중 1단계 미달(공급)');   // 2026-10-21 새 덤프: 사업화 달성
});

test('1b 막대는 100% 기준선(목표)을 보인다: 미달은 오른쪽 끝, 초과는 목표 자리(② 1,543/3,560 = 43.3%)', () => {
  const cells = V.policyStageCells(PP, 'POL_2025_0907');
  assert.deepEqual(cells.map((c) => (c.target != null && c.actual != null ? Math.round(c.mark * 10) / 10 : null)), [77, 80.6, null, 100, 100, null]);   // 2026-10-22 새 덤프(20261021T212310Z): ① 13,914/18,074 = 77.0% · 2026-10-21 새 덤프: ① 14,694/18,854 = 77.9% · ② 8,386/10,403 = 80.6% · 2026-10-20 HOME 판: ② 3,658/6,249 = 58.5%(10-19 판 1,543/3,560 = 43.3%)
  assert.deepEqual(cells.map((c) => Math.round(c.fill * 10) / 10), [100, 100, 0, 61.7, 100, 0], '확인 막대(초과는 끝까지)');   // 2026-10-22 새 덤프(20261021T212310Z): ④공급 4,963/8,049 = 61.7% · 2026-10-21 새 덤프: ①사업화 확인이 목표를 넘어 끝까지
  const sum = read('components/projects/Summary.tsx');
  const mini = sum.slice(sum.indexOf('function MiniBar'), sum.indexOf('function StageRates'));
  const cell = sum.slice(sum.indexOf('function TargetCell'), sum.indexOf('export function PolicyCompare'));
  for (const [n, s] of [['MiniBar', mini], ['TargetCell', cell]]) assert.match(s, /<TargetLine at=\{c\.mark\} \/>/, `${n}: 목표 기준선`);
  assert.match(sum, /data-slot="target-line"/);
  /* 범례: 목표 = 100% 기준선 */
  assert.match(sum, /label: '목표\(100%\)'/);
});

test('2 범위 칩: 사업·지역 공급·데이터 원본 패널 머리마다 ScopeChip(범위가 바뀌면 칩도)', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  /* 2026-10-21 사업 화면 = HOME 원천 행: 요약·목록·인쇄 머리의 범위 칩 출처는 정책 진행 자료(거르기 범위 region 은 그대로) */
  assert.match(page, /<ScopeChip scope=\{region\} source="정책 진행 자료" title=\{`핵심 질문·단계별 진행의 범위/, '요약');
  assert.doesNotMatch(page, /source="사업 원장"/);
  assert.match(page, /<ScopeChip scope="정책 전체" source="정책 진행 자료"/, '정책 목표 대비(기존)');
  const list = page.slice(page.indexOf('<Card render={<section id="projects-list"'));
  assert.match(list.slice(0, list.indexOf('<InfoTip')), /scope=\{(<>)?<ScopeChip scope=\{region\} source="정책 진행 자료"/, '사업 목록 머리');
  const prio = page.slice(page.indexOf('aria-label="우선 점검 사업"'));
  assert.match(prio.slice(0, prio.indexOf('</Card>')), /scope=\{<ScopeChip scope=\{region\} source="정책 진행 자료"/, '인쇄 보기 우선 점검 사업 머리');
  /* 지역 공급(기존 세 패널) */
  assert.match(read('app/(dashboard)/region/page.tsx'), /scope=\{<ScopeChip scope=\{`\$\{HOME_POLICY\[policy\]\} · \$\{scopeName\}`\} source="정책 진행 자료"/);   // 2026-10-21: 정책 칩이 바뀌면 칩도
  assert.match(read('components/region/Annual.tsx'), /scope=\{<ScopeChip scope=\{rname\}/);
  assert.match(read('components/region/Cond.tsx'), /scope=\{<ScopeChip scope=\{name\}/);
  /* 데이터 원본: 요구사항(수도권 정책 진행 자료 사업 기준) · 수집 상태·연도 확보(원천 전체) · 연결(정책 전체) · 단계별 데이터 연계(원천 전체) */
  assert.match(read('components/sources/Requirements.tsx'), /scope=\{<ScopeChip scope="9·7 정책" source="정책 진행 자료"/);
  const col = read('components/sources/Collect.tsx');
  for (const [name, re] of [['수집 상태', /<PanelHead title=(?:\{<>|")수집 상태[\s\S]*?scope=\{<ScopeChip scope="원천 전체"/], ['연도 확보', /<PanelHead title="연도 확보"[^\n]*\n?\s*scope=\{<ScopeChip scope="원천 전체"/], ['연결', /<PanelHead title="연결"[^\n]*\n?\s*scope=\{<ScopeChip scope="정책 전체" source="정책 진행 자료"/]]) assert.match(col, re, name);
  assert.match(read('app/(dashboard)/sources/page.tsx'), /<PanelHead id="h-stage" title="단계별 데이터 연계" scope=\{<ScopeChip scope="원천 전체"/);
  /* 공개 props 는 그대로(종합상황판이 가져다 씀) */
  assert.match(read('components/ui/scope-chip.tsx'), /export default function ScopeChip\(\{ scope, source, title, clearHref, note, className \}: \{ scope: string; source\?: ScopeSource; title\?: string; clearHref\?: string; note\?: \{ text: string; title: string \}; className\?: string \}\)/);
});

test('3 제목 말줄임 없음: 핵심 질문 칸 제목 · 동네 여건 칸 이름은 두 줄까지 줄바꿈', () => {
  const sum = read('components/projects/Summary.tsx');
  const q = sum.slice(sum.indexOf('export function Questions'), sum.indexOf('export function Pipeline'));
  assert.doesNotMatch(q, /truncate/);
  assert.match(q, /<span className="line-clamp-2 \[word-break:keep-all\]" title=\{x\.q\}>\{x\.q\}<\/span>/);
  const cond = read('components/region/Cond.tsx');
  assert.doesNotMatch(cond, /truncate/);
});

test("4 판정 정의 한 줄(2026-10-21: '후보 계산'은 사업 화면에서 없어짐): 목록 머리 ⓘ · 상태 칩 ⓘ", () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.doesNotMatch(page, /REVIEW_LATE|후보 계산/, '사업 화면은 HOME 원천 행 — 후보 계산 상태·정의가 없다');
  assert.match(page, /const JUDGE_DEF = '기준일까지 도래한 단계 목표 대비 측정/, '정의 한 줄(두 ⓘ 가 같은 글)');
  const list = tips(page.slice(page.indexOf('<InfoTip label="목록 읽는 법">'))).join('');
  assert.match(list, /<dt>상태 · 부족 호수<\/dt><dd>\{JUDGE_DEF\}/, '목록 머리 ⓘ');
  const bar = page.slice(page.indexOf('<ChipGroup label="상태" bare>'), page.indexOf('<ChipGroup label="기관" bare>'));
  assert.ok(tips(bar).some((t) => t.includes('{JUDGE_DEF}')), '상태 칩 ⓘ');
});

test('카드 안의 카드(2026-10-18): 핵심 질문 칸·정책 줄은 inset, 서랍 구역은 구역 카드(row 아님)+안쪽 inset, 막대 틀은 둥글게', () => {
  const sum = read('components/projects/Summary.tsx');
  const q = sum.slice(sum.indexOf('export function Questions'), sum.indexOf('export function Pipeline'));
  assert.doesNotMatch(q, /divide-x/, '핵심 질문 칸 사이 세로 구분선 없음');
  assert.match(q, /<li key=\{x\.q\} className=\{cn\(cardVariants\(\{ variant: 'inset' \}\)/, '질문 칸마다 안쪽 카드');
  assert.match(sum, /<Card variant="inset" key=\{l\.policy\.key\}/, '정책별 줄도 안쪽 카드');
  assert.doesNotMatch(sum, /block h-\[[68]px\](?!\s*rounded-full)["']/, '막대 틀(6·8px)은 rounded-full');
  for (const f of ['ProjectDetail', 'Candidate']) {
    const s = read(`components/projects/${f}.tsx`);
    assert.doesNotMatch(s, /variant="row"/, `${f}: 서랍 구역은 구분선 줄이 아니라 구역 카드`);
    assert.match(s, /<Card render=\{<section aria-label="(개요|간단 보기)"/, `${f}: 구역 카드`);
  }
  const det = read('components/projects/ProjectDetail.tsx');
  assert.match(det, /<Card render=\{<section aria-label="단계와 핵심 수치" \/>\}[\s\S]*<StageSteps[\s\S]*<Kpi variant="inset"/, '단계 6칸·핵심 수치는 구역 카드 안의 inset');
  assert.match(read('components/projects/StageTimeline.tsx'), /rounded-tile border border-border bg-chartbg/, '타임라인 차트 면도 테두리 둥근 카드');
});
