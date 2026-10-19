'use strict';
/* 3차 독립 평가(27/40) 고침 — 사업(/projects·서랍·인쇄)·지역 공급(/region)·데이터 원본(/sources)·공통 UI.
   1 정의를 title 밖 (i) 팝오버로 · 2 정책 전체 카드 아래 빈자리 · 3 숫자 형식(비율 소수 한 자리, 점 날짜) · 4 용어(공식 01~06·실데이터·HOME 주어)
   5 서랍 원천 날짜 다름은 일 단위 · 6 9·7 ①=② 3,560·⑤ 381/381 은 HOME 원천 값 그대로(검증 대기) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* 주석을 뺀 코드(보이는 글·title 검사용) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const V = require('../../lib/board/projects-view.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const DET = require('../../data/board/project-detail.json');
const PP = require('../../data/board/policy-progress.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };
/* InfoTip 블록들의 안쪽 글(여는 <InfoTip … > 부터 </InfoTip> 까지) */
const tips = (s) => [...s.matchAll(/<InfoTip\b[\s\S]*?<\/InfoTip>/g)].map((m) => m[0]);

test('1 정의는 (i) 팝오버로: 단계별 진행 누적 · 정책 목표 대비 범례·대상 · 목록 머리 · 서랍 단계·상태·공정률 · 달별 막대 · 데이터 원본 표 머리', () => {
  const sum = read('components/projects/Summary.tsx');
  const pipe = tips(sum.slice(sum.indexOf('export function Pipeline'), sum.indexOf('function TargetCell'))).join('');
  assert.match(pipe, /누적/, '단계별 진행 ⓘ: 누적의 뜻');
  assert.match(pipe, /종합상황판/, '단계별 진행 ⓘ: 종합상황판 단계표와 다름');
  const cmp = tips(sum.slice(sum.indexOf('export function PolicyCompare'), sum.indexOf('function Defs'))).join('');
  assert.match(cmp, /목표가 배정된 정책만/, '정책 목표 대비 ⓘ: 대상 정책');
  assert.match(cmp, /lg\.map\(\(x\) => <Fragment key=\{x\.label\}><dt>\{x\.label\}<\/dt><dd>\{x\.tip\}<\/dd><\/Fragment>\)/, '정책 목표 대비 ⓘ: 보이는 범례(확인·담당자 추정 포함·목표·실적 없음·목표 미달)의 뜻');
  const page = read('app/(dashboard)/projects/page.tsx');
  const list = tips(page.slice(page.indexOf('<InfoTip label="목록 읽는 법">'))).join('');
  assert.match(list, /<dt>계획 호수<\/dt>/, '목록 ⓘ: 머리의 계획 호수 합');
  /* 서랍: 단계 칸 정의 · 상태(판정 규칙) · 공정률 */
  const steps = read('components/projects/StageSteps.tsx');
  assert.match(steps, /import InfoTip from '@\/components\/ui\/info-tip'/);
  assert.match(tips(steps).join(''), /QUESTION\.map/, '서랍 단계 ⓘ: 여섯 단계 정의');
  const det = read('components/projects/ProjectDetail.tsx');
  const dt = tips(det).join('');
  assert.match(dt, /statusTip\(r\)/, '서랍 상태 ⓘ: 판정 규칙');
  assert.match(dt, /<dt>공정률<\/dt>/, '서랍 공정률 ⓘ');
  assert.match(dt, /당초 일정 없음/);
  /* 서랍 안 ⓘ 를 Esc 로 닫을 때 서랍까지 닫히지 않는다 */
  assert.match(read('components/projects/Drawer.tsx'), /\[data-popup-open\]/);
  /* 지역 공급: 종류 칩·달별 막대 */
  const reg = tips(read('app/(dashboard)/region/page.tsx')).join('');
  assert.match(reg, /<dt>달별 막대<\/dt>/);
  assert.match(reg, /aheadKindTip|AHEAD_KIND\.COMPLETION|AHEAD_COMPLETION/);
  /* 데이터 원본: 표 머리마다 */
  assert.ok(tips(read('components/sources/Requirements.tsx')).length >= 1, '요구사항 충족 ⓘ');
  assert.ok(tips(read('components/sources/Collect.tsx')).length >= 3, '수집 상태·연도 확보·연결 ⓘ');
  const src = read('app/(dashboard)/sources/page.tsx');
  assert.match(tips(src).join(''), /MARKS\.map/, '표지 뜻 ⓘ');
  /* 공개 인터페이스(props)는 그대로 — 종합상황판이 가져다 쓴다 */
  assert.match(read('components/ui/info-tip.tsx'), /export default function InfoTip\(\{ label, text, children, className \}: \{ label: string; text\?: string; children: ReactNode; className\?: string \}\)/);
});

test('1b 팝오버 글은 짧게: 한 덩이(p·dd) 200자 이하', () => {
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\{[^{}]*\}/g, 'xx').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
  for (const f of ['components/projects/Summary.tsx', 'app/(dashboard)/projects/page.tsx', 'components/projects/ProjectDetail.tsx', 'components/projects/StageSteps.tsx', 'app/(dashboard)/region/page.tsx', 'components/sources/Collect.tsx', 'components/sources/Requirements.tsx', 'app/(dashboard)/sources/page.tsx']) {
    for (const t of tips(read(f))) for (const m of t.matchAll(/<(p|dd)>([\s\S]*?)<\/\1>/g)) assert.ok(strip(m[2]).length <= 200, `${f}: ${strip(m[2]).slice(0, 60)}… ${strip(m[2]).length}자`);
  }
  const help = V.questionsOf(rows, {}, ctx).flatMap((q) => [q.help, q.note ?? '']);
  for (const h of help) assert.ok(h.length <= 200, `${h.slice(0, 40)}… ${h.length}자`);
});

test('2 정책 전체 카드 빈자리 없음: 요약은 두 카드를 위아래로(나란한 격자 없음), 9·7 단계는 여섯 칸 가로 + 미니 막대', () => {
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.doesNotMatch(page, /grid-cols-\[minmax\(0,1\.3fr\)_minmax\(0,4fr\)\]/, '정책 카드 | 원장 카드 나란히(높이 차이가 빈자리) 없음');
  assert.match(page, /const summary = policyCard \? <>\{policyCard\}\{ledgerCard\}<\/> : ledgerCard;/);
  const sum = read('components/projects/Summary.tsx');
  const sr = sum.slice(sum.indexOf('function StageRates'), sum.indexOf('const QA'));
  assert.match(sr, /repeat\(6,minmax\(0,1fr\)\)/, '단계별 진행과 같은 여섯 칸');
  assert.match(sr, /<MiniBar c=\{c\} \/>/, '단계마다 미니 막대');
  assert.match(sum, /function MiniBar\(/);
});

test('3 숫자 형식: 비율·공정률은 소수 한 자리, 날짜는 점', () => {
  const cells = V.policyStageCells(PP, 'POL_2025_0907');
  assert.deepEqual(cells.map((c) => (c.target != null && c.actual != null ? V.rateOf(c).word : null)), ['달성 24.2%', '달성 230.7%', null, '달성 58.8%', '달성 100.0%', null]);
  assert.equal(V.pct1(93.12), '93.1');
  assert.equal(V.pct1(33), '33.0');
  /* 서랍 공정률·타임라인 */
  const id = 'PRJ-28245-0055', t = V.timelineOf(DET.projects[id], DET.referenceDate);
  assert.equal(t.progress.at(-1).text, '2026.07.01 보고 93.1%');
  const det = read('components/projects/ProjectDetail.tsx');
  assert.match(det, /value=\{pct1\(last\[1\]\)\}/);
  assert.match(det, /계획의 \$\{pct1\(r\.notice \/ r\.units \* 100\)\}%/);
  assert.match(read('components/projects/StageTimeline.tsx'), /\{pct1\(last\.pct\)\}%/);
  assert.doesNotMatch(read('components/projects/Summary.tsx'), /share\.toFixed\(0\)/);
  /* 목표 없는 렌즈의 '% 정상'도 한 자리 */
  const q129 = V.questionsOf(rows, { policy: IDX.policies.find((p) => p.key === '129') }, ctx)[0];
  assert.match(q129.value, /^\d+\.\d$/);
  /* 보이는 글에 하이픈 날짜를 그대로 내지 않는다: 단계별 데이터 연계 도식(SVG — 표처럼 dotDates 를 거치지 않는다)의 '2018-01~2026-08'·LH 기준일 */
  const sl = read('components/sources/StageLinks.tsx');
  for (const t of ['{dotDates(it.sub)}', '{dotDates(s.side.sub)}', '{dotDates(t)}']) assert.ok(sl.includes(t), t);
});

test('4 용어: 공식 01~06 번호 없음 · 실데이터 없음 · HOME 은 무엇인지 붙여서', () => {
  for (const f of ['components/projects/StageSteps.tsx', 'components/projects/StageTimeline.tsx', 'components/projects/Summary.tsx', 'components/sources/StageLinks.tsx']) {
    assert.doesNotMatch(code(read(f)), /공식 단계|BOARD_OFFICIAL|st\.official/, f);
  }
  assert.doesNotMatch(code(read('app/(dashboard)/sources/page.tsx')), /실데이터/);
  /* 'HOME 자료'·'HOME 원천 값' 같은 주어는 '사업 원장(HOME)'·'정책 진행 자료(HOME)' 로 */
  for (const f of ['components/projects/ProjectDetail.tsx', 'components/projects/Summary.tsx', 'app/(dashboard)/projects/page.tsx']) {
    const s = code(read(f));
    assert.doesNotMatch(s, /HOME 자료|HOME 원천 값|HOME과 LH|HOME 날짜/, f);
  }
  assert.match(read('components/projects/ProjectDetail.tsx'), /사업 원장\(HOME\) \$\{edition\[1\]\}\.\$\{edition\[2\]\}\.\$\{edition\[3\]\} 받음/);
});

test('5 서랍 원천 날짜 다름은 일 단위(LH 2026.10.31 · 2028.12.31), 목록 칸은 그대로 달', () => {
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const alts = rows.filter((r) => r.dateAlt);
  assert.equal(alts.length, 71);
  for (const r of alts) assert.match(V.dateAltOf(r, true).text, /\d{4}\.\d{2}\.\d{2}\)$/, r.id);
  assert.equal(V.dateAltOf(byId['PRJ-28290-0058'], true).text, '원천 날짜 다름(LH 2028.12.31)');
  assert.equal(V.dateAltOf(byId['PRJ-28290-0058']).text, '원천 날짜 다름(LH 2028.12)', '목록 칸(좁은 열)은 달');
  assert.match(read('components/projects/ProjectDetail.tsx'), /const alt = dateAltOf\(r, true\)/);
});

test('6 9·7 ①계획 = ②인허가 3,560 · ⑤준공 381/381 은 숫자 그대로, ⓘ 에 원천 값 그대로(검증 대기)', () => {
  const q0 = V.questionsOf(rows, {}, ctx)[0];
  const st = q0.stages;
  assert.deepEqual([st[0].actual, st[1].actual, st[4].actual, st[4].target], [3560, 3560, 381, 381], '숫자는 바꾸지 않는다');
  assert.match(q0.note, /원천 값 그대로\(검증 대기\)/);
  assert.match(q0.note, /①계획·②인허가 3,560호/);
  assert.match(q0.note, /⑤준공 381\/381/);
  /* ⓘ 둘째 문단으로 그린다 */
  assert.match(read('components/projects/Summary.tsx'), /\{x\.note \? <p>\{x\.note\}<\/p> : null\}/);
});
