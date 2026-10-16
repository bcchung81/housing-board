'use strict';
/* 4차 화면 재평가(impeccable 2026-10-15, 34/40 → 목표 36) A4 지적 고침을 고정한다:
   1·A 정책 목표 대비 첫 칸은 '요약 범위' 줄 밖, ①~⑥ 단계마다 확인/목표·비율(접힌 정책 목표 대비 9·7 행과 같은 값), 접힌 머리 줄은 부족률 숫자 없이 ·
   2 보이는 글의 내부 용어(HOME·번들·확정)와 ⓘ 정의 · 3 날짜 점 표기 · 4 목록·인쇄의 현재 예정은 '경과' 꼬리표 없이 · 5 대비 4.5:1(토큰 계산) ·
   6 서랍 닫을 때 돌아갈 행이 없으면 main · 7 CSV 첫 열 사업 id·수식 주입 방어 · 8 넘침 없는 움직임 · B 기본 정렬은 번호 있는 사업 먼저. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const V = require('../../lib/board/projects-view.ts');
const L = require('../../lib/board/projects-list.ts');
const G = require('../../lib/grid/spec.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const PP = require('../../data/board/policy-progress.json');
const MOLIT = require('../../data/board/molit.json');

const rows = V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg);
const ctx = { pp: PP, policies: IDX.policies, observedMonth: IDX.observedMonth, sidoName: (c) => c, sggName: (c) => c };
const sido = (c) => MOLIT.sido.find((x) => x.code === c)?.name;
/* 주석을 뺀 소스(보이는 글 검사용) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

test('1·A 첫 칸: 원장 요약 밖 정책 목표 카드에 따로, ①~⑥ 단계 6줄 — 값은 정책 목표 대비 9·7 행과 같다', () => {
  for (const f of [{}, { metro: true }]) {
    const q0 = V.questionsOf(rows, f, ctx)[0];
    assert.equal(q0.q, '9·7 대책 목표 대비');
    assert.equal(q0.stages.length, 6, '단계 6개');
    assert.deepEqual(q0.stages.map((c) => c.board), [0, 1, 2, 3, 4, 5]);
    const line = V.compareLines(PP, IDX.policies, rows, ['97'])[0];
    assert.deepEqual(q0.stages, line.cells, '정책 목표 대비 9·7 행과 같은 원천·계산');
  }
  const q0 = V.questionsOf(rows, {}, ctx)[0];
  const words = q0.stages.map((c) => (c.target != null && c.actual != null ? `${c.actual}/${c.target} ${V.rateOf(c).word}` : c.target != null ? '실적 없음' : '목표 없음'));
  assert.deepEqual(words, ['3560/14694 달성 24.2%', '3560/1543 달성 230.7%', '목표 없음', '4732/8049 달성 58.8%', '381/381 달성 100.0%', '목표 없음']);
  assert.match(q0.tip, /담당자 추정 포함\(확인과 따로\): ①계획 5,789호/, '추정 포함은 title 에만');
  assert.match(q0.help, /단계마다/); assert.match(q0.help, /'목표 없음'/);
  /* 목표가 없는 렌즈(1·29)는 단계 줄 없이 범위 줄 안 */
  const q129 = V.questionsOf(rows, { policy: IDX.policies.find((p) => p.key === '129') }, ctx)[0];
  assert.equal(q129.stages, undefined);

  const sum = read('components/projects/Summary.tsx');
  assert.match(sum, /\{x\.stages \? <StageRates cells=\{x\.stages\} \/> : <>/);
  assert.match(sum, /\{cells\.map\(\(c\) => \{/);
  assert.match(sum, /style=\{both \? \{ color: BOARD_INK\[c\.board\] \} : undefined\}>\{BOARD_CIR\[c\.board\]\}\{BOARD_NAMES\[c\.board\]\}/, '기존 ①~⑥ 번호·단계 글자색');
  assert.match(sum, /: <span>목표 없음<\/span>\}/);
  assert.match(sum, /!both && 'text-muted-foreground'/, '목표 없음은 옅게');
  assert.match(sum, /whitespace-nowrap tabular-nums/, '줄바꿈 없음');
  const page = read('app/(dashboard)/projects/page.tsx');
  assert.match(page, /const \[whole, scoped\] = questions\[0\]\?\.stages \? \[questions\[0\], questions\.slice\(1\)\] : \[null, questions\];/);
  const pc = page.slice(page.indexOf('const policyCard'), page.indexOf('const ledgerCard')), lc = page.slice(page.indexOf('const ledgerCard'), page.indexOf('const summary'));
  assert.match(pc, /\{whole \? <Questions list=\{\[whole\]\} \/> : null\}/, '첫 칸은 정책 목표 카드(원장 요약 카드 밖)');
  assert.match(lc, /\{scopeLine\}\n\s*<Questions list=\{scoped\} \/>/, '원장 범위 줄은 나머지 질문 위');
  /* 인쇄도 같은 요약(summary)을 쓴다 */
  assert.match(page, /\{reportHead\}\n\s*\{summary\}\n\s*\{report\}/);
});

test('A 접힌 정책 목표 대비 머리 줄: 이름표 없는 부족률 숫자 없이 단계 이름', () => {
  const lines = V.compareLines(PP, IDX.policies, rows, IDX.policies.map((p) => p.key));
  for (const l of lines) assert.doesNotMatch(V.compareHead(l), /\d%/, l.policy.key);
  assert.equal(V.compareHead(lines[0]), '9·7 · 목표 있는 4단계 중 2단계 미달(①계획·④모집)');
});

test('2 보이는 글의 내부 용어: HOME·번들·확정 전/확정은 title 로, ⓘ 정의는 쉬운 말', () => {
  const page = code(read('app/(dashboard)/projects/page.tsx'));
  assert.doesNotMatch(page, /HOME 자료 \{|, HOME 자료,/, '인쇄 꼬리말');
  assert.match(page, /<span title=\{HOME_TIP\}>정책 진행 자료<\/span> \{editionText\(pp\.source\.edition\)\}/);
  assert.doesNotMatch(code(read('components/region/Annual.tsx')), /년은 HOME 통계/);
  /* 데이터 원본: 보이는 문자열 값(따옴표·템플릿)에 '번들' 없음 */
  const strs = (s) => [...code(s).matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2]);
  for (const f of ['app/(dashboard)/sources/page.tsx', 'components/sources/Overview.tsx', 'components/sources/StageLinks.tsx', 'lib/board/collection.ts', 'lib/board/stage-links.ts']) {
    assert.deepEqual(strs(read(f)).filter((t) => t.includes('번들')), [], f);
  }
  assert.ok(!require('../../lib/board/screen-usage.ts').SCREEN_USAGE['hub-ap'].map.includes('번들'));
  const col = code(read('components/sources/Collect.tsx'));
  assert.doesNotMatch(col, />확정<|>확정 전<|확정 전 <b|· 확정 <b/);
  assert.match(col, /aria-hidden="true" \/>담당자 확인<\/li>/); assert.match(col, /aria-hidden="true" \/>담당자 확인 전<\/li>/);
  assert.match(col, /\{OWNER\.HOME\}/); assert.doesNotMatch(col, />HOME</);
  /* ⓘ 정의: 전문용어 없이 */
  const sum = read('components/projects/Summary.tsx');
  const defs = sum.slice(sum.indexOf('function Defs()'), sum.indexOf('export const ReadHelp'));
  assert.doesNotMatch(defs, /원장 관측 달|현재 예정 달|준공 실제|경과 6개월/);
  for (const f of [{}, { metro: true }]) for (const x of V.questionsOf(rows, f, ctx)) assert.doesNotMatch(x.help, /원장|관측|현재 예정 달|HOME/, x.q);
  const list = page.slice(page.indexOf('<InfoTip label="목록 읽는 법">'), page.indexOf('</InfoTip>', page.indexOf('<InfoTip label="목록 읽는 법">')));
  assert.doesNotMatch(list, /경과 개월|≠/);
});

test('3 날짜 점 표기: 그리드 칸·설명 줄은 하이픈 날짜를 점으로(CSV·정렬값은 그대로)', () => {
  assert.equal(G.dotDates('2026-10-31'), '2026.10.31');
  assert.equal(G.dotDates('2021-09~2026-08 · 기준 2026-08-31'), '2021.09~2026.08 · 기준 2026.08.31');
  assert.equal(G.dotDates('15124798 · 16구역 · 2023-11'), '15124798 · 16구역 · 2023.11');
  assert.equal(G.dotDates('61-79번지 · A2-7블록 · 1-2'), '61-79번지 · A2-7블록 · 1-2', '날짜가 아니면 그대로');
  const grid = read('components/ui/data-grid.tsx');
  assert.match(grid, /const keepWords = \(raw: string\): React\.ReactNode => \{ const t = dotDates\(raw\);/); assert.match(grid, /\{dotDates\(r\.note\)\}/);
  assert.equal(G.toCsv([{ key: 'd', label: '날짜', kind: 'text' }], [{ id: '1', c: { d: '2026-10-31' } }]), '﻿날짜\r\n2026-10-31\r\n', 'CSV 값은 그대로');
  assert.doesNotMatch(code(read('lib/board/stage-links.ts')), /'[^'\n]*\b20\d\d-\d\d[^'\n]*'/);
});

test("4 지연 세 번 표시: 목록·인쇄의 현재 예정은 '경과' 꼬리표 없이 옅게(경과는 title), 간단 보기는 꼬리표 유지", () => {
  /* 경과 개월은 번호 있는 사업(지연 열 판정 색)과 후보(지연 열 옅게, D3) 모두 같은 계산 overdueMonthsOf */
  const late = rows.filter((r) => V.overdueMonthsOf(r) !== null);
  assert.ok(late.length > 300);
  for (const r of late) {
    const c = L.nextCell(r);
    assert.equal(c.tag, V.dateAltOf(r)?.text, r.id); assert.equal(c.muted, true); assert.match(c.title, /경과 \d+개월/);   // 꼬리표는 원천 날짜 다름(D2)만
    assert.equal(V.nextOf(r).tag, `경과 ${r.overdue.months}개월`, '간단 보기(지연 열 없음)는 꼬리표');
  }
  const done = rows.find((r) => r.done && V.lateOf(r) === null && !r.next);
  if (done) assert.equal(L.nextCell(done).tag, '실제');
  assert.match(read('app/(dashboard)/projects/page.tsx'), /ev: nextCell\(r\), late: lateCell\(r\)/, '인쇄 표에도 지연 열이 있어 같은 칸');
  assert.match(read('components/projects/Candidate.tsx'), /next = nextOf\(r\)/);
});

/* ---------- 5 대비: app/tailwind.css 토큰 값으로 계산 ---------- */
const css = read('app/tailwind.css');
const block = (sel) => { const i = css.indexOf(`\n${sel} {`); return css.slice(i, css.indexOf('\n}\n', i)); };
const tok = (b, n) => { const m = new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(b); assert.ok(m, `--${n}`); return m[1]; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, p) => a.map((v, i) => Math.round(v * p + b[i] * (1 - p)));   // color-mix(in srgb, a p, b)
const THEMES = [['라이트', block(':root')], ['다크', block('.dark')]];

test('5 대비: 빨간 글자는 카드·얼룩 행·강조 면 위 4.5:1, 흐린 0·단위 호는 opacity 없이 4.5:1 이상(라이트·다크)', () => {
  for (const [name, b] of THEMES) {
    const t = (n) => rgb(tok(b, n));
    const zebra = mix(t('pn2'), t('card'), 0.45);   // data-grid zebra: color-mix(pn2 45%, card)
    for (const [bg, c] of [['card', t('card')], ['얼룩 행', zebra], ['강조 면(accent)', t('accent')]]) {
      assert.ok(ratio(t('bad'), c) >= 4.5, `${name} --bad 위 ${bg}: ${ratio(t('bad'), c).toFixed(2)}`);
      assert.ok(ratio(t('muted-foreground'), c) >= 4.5, `${name} --muted-foreground 위 ${bg}: ${ratio(t('muted-foreground'), c).toFixed(2)}`);
    }
    for (const n of ['ok', 'warn', 'bad']) assert.ok(ratio(t(n), t('card')) >= 4.5, `${name} 단위 '호'(--${n}, 13px) ${ratio(t(n), t('card')).toFixed(2)}`);
  }
  const board = read('components/board/Board.tsx');
  assert.doesNotMatch(board, /opacity-(70|85)/, '흐린 0·호를 opacity 로 흐리지 않는다');
  assert.match(board, /!v\[i\] && 'text-muted-foreground'/);
  assert.match(board, /judged && ds\[i\] \? 'text-bad' : judged \? 'text-muted-foreground' : 'text-mute'/);
  assert.match(board, /text-\[13px\] font-normal">호<\/small>/);
  /* 연도 확보: 칠한 칸 안에 숨긴 글자를 두지 않는다(글자는 칠한 칸 밖 sr-only) */
  const col = read('components/sources/Collect.tsx');
  assert.match(col, /<span aria-hidden="true" className=\{`block h-\[18px\][^>]*\n?[^>]*\/>\n\s*<span className="sr-only">\{MARK\[c\]\}<\/span>/);
});

test('6 서랍: Esc 로 닫을 때 돌아갈 행이 없으면 본문(main)으로 초점', () => {
  const d = read('components/projects/Drawer.tsx');
  assert.match(d, /\(row \?\? document\.getElementById\('main'\)\)\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(read('app/(dashboard)/layout.tsx'), /<main id="main" tabIndex=\{-1\}/);
});

test('7 CSV: 첫 열 사업 id(화면 표는 그대로), 수식 주입 방어(숫자는 그대로)', () => {
  const f = {};   // 전국(parseFilters 의 ?sido=all)
  const list = V.listOrder(V.applyFilters(rows, f));
  const grid = L.listRows(list, f, null, sido);
  const shown = L.dropBlank(L.LIST_COLS, grid).cols;
  assert.ok(!shown.some((c) => c.key === 'id'), '화면 표에는 id 열 없음');
  const cols = L.csvCols(shown);
  assert.deepEqual([cols[0].key, cols[0].label], ['id', '사업 id']);
  const lines = G.toCsv(cols, L.csvRows(grid)).slice(1).split('\r\n');
  assert.ok(lines[0].startsWith('사업 id,사업,'));
  assert.ok(lines[1].startsWith(`${list[0].id},`));
  assert.ok(lines.slice(1, -1).every((l, i) => l.startsWith(`${list[i].id},`)), 'id 순서 = 화면 기본 순서');
  assert.match(read('app/(dashboard)/projects/csv/route.ts'), /toCsv\(csvCols\(dropBlank\(LIST_COLS, rows\)\.cols\), csvRows\(rows\)\)/);
  const one = (v) => G.toCsv([{ key: 'a', label: 'a', kind: 'text' }], [{ id: '1', c: { a: v } }]).slice(1).split('\r\n')[1];
  assert.equal(one('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(one('@cmd'), "'@cmd");
  assert.equal(one('+cmd'), "'+cmd");
  assert.equal(one('-1+2'), "'-1+2");
  assert.equal(one('\tx'), "'\tx");
  assert.equal(one('=A1,B1'), '"\'=A1,B1"');
  assert.equal(one('-3'), '-3', '음수는 그대로');
  assert.equal(one('+19'), '+19');
  assert.equal(one('-1.5'), '-1.5');
  assert.equal(G.toCsv([{ key: 'n', label: '증감' }], [{ id: '1', c: { n: -12 } }]).slice(1).split('\r\n')[1], '-12');
});

test('8 움직임: rb-drop·rb-pop 은 넘침 없는 ease-out(길이·지연 그대로)', () => {
  assert.doesNotMatch(css, /cubic-bezier\([^)]*,\s*1\.(2|3)\d*\)/, '끝 값이 1 을 넘는 곡선 없음');
  assert.doesNotMatch(css, /scale\(1\.1/);
  assert.match(css, /@keyframes rb-pop \{ from \{ opacity: 0; transform: scale\(\.5\); \} to \{ opacity: 1; transform: scale\(1\); \} \}/);
  assert.match(css, /animation: rb-drop \.5s cubic-bezier\(\.22, 1, \.36, 1\) both; animation-delay: calc\(\.15s \+ var\(--i\) \* \.17s\);/);
  assert.match(css, /animation: rb-pop \.55s cubic-bezier\(\.22, 1, \.36, 1\) both;/);
});

test('B 기본 정렬: 번호 있는 사업 먼저, 후보 사업은 모두 뒤(후보끼리는 지연순) — 판정·지연 건수는 그대로', () => {
  const all = V.listOrder(V.applyFilters(rows, {}));
  assert.equal(all.length, V.applyFilters(rows, {}).length);
  assert.ok(all[0].issued, '첫 행은 번호 있는 사업');
  const firstCand = all.findIndex((r) => !r.issued);
  assert.ok(firstCand > 0);
  assert.ok(all.slice(firstCand).every((r) => !r.issued), '후보 행은 모든 번호 있는 사업 뒤');
  const cands = all.slice(firstCand);
  assert.ok(cands.every((r, i) => i === 0 || (V.overdueMonthsOf(cands[i - 1]) ?? -1) >= (V.overdueMonthsOf(r) ?? -1)), '후보끼리는 기존 순서(같은 계산의 경과순)');
  assert.ok(cands.some((r) => V.overdueMonthsOf(r) !== null), '원천 예정일이 지난 후보가 있다');
  assert.ok(cands.every((r) => V.lateOf(r) === null), '후보는 지연 개월(판정)이 없다 — 확인 필요(D3)');
  const q = Object.fromEntries(V.questionsOf(rows, {}, ctx).map((x) => [x.q, x]));
  assert.equal(q['어떤 사업이 늦어지는가'].value, '2', '지연 건수 = 번호 있는 사업만(D3)');
  assert.equal(rows.filter((r) => ['delay', 'long'].includes(V.statusOf(r))).length, 2);
  assert.equal(rows.filter((r) => V.statusOf(r) === 'review' && r.cls === 'delay').length, 313, '옛 315 = 2 + 확인 필요(후보) 313');
  /* 열 머리 정렬은 그리드가 따로(listOrder 는 기본 순서만) · CSV 는 같은 순서 */
  assert.match(read('app/(dashboard)/projects/csv/route.ts'), /listOrder\(applyFilters\(idx\.rows, f\)\)/);
});
