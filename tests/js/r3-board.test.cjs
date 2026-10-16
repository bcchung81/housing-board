'use strict';
/* 3차 개선(2026-10-16, 독립 평가 27/40) — 종합상황판·기관·월 상세:
   1 핵심 숫자 정의는 (i) 팝오버(키보드·회의실 화면) — title 은 짧게 · 2 기간·단위 꼬리 · 3 시도 타일 지연율 = 호수 기준(판정 막대와 같음), 건수는 보조
   4 진척 관리 링크 = '원장 194건' · 5 용어('공식 0N'·'실데이터' 없음) · 6 LH 파일 낡음 표지 · 7 기관 단계 카드: 값 없는 단계는 칩 하나 · 8 날짜 점 표기 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');   // 주석 뺀 화면 글자
const C = require('../../lib/board/calc.ts');
const D = require('../../lib/board/directives.ts');
const V = require('../../lib/board/projects-view.ts');
const MAP = require('../../data/board/ledger-map.json');
const IDX = require('../../data/board/projects-index.json');
const BOARD = require('../../data/board/ledger-board.json');
const LH = require('../../data/board/lh-completion.json');

const board = read('components/board/Board.tsx'), real = read('components/board/RealPanels.tsx'), home = read('app/(dashboard)/page.tsx');
const month = read('app/(dashboard)/month/[id]/page.tsx'), agency = read('app/(dashboard)/agency/[id]/page.tsx'), kpis = read('components/StageKpis.tsx');
const panel = (id, s = board) => s.slice(s.indexOf(`id="${id}"`), s.indexOf('</Card>', s.indexOf(`id="${id}"`)));
const head = (id, s = board) => { const p = panel(id, s); return p.slice(0, p.indexOf('</h2>') + 400); };
const DIR = D.makeDirectives({ sourceCount: 40, stageNames: ['계획', '인허가', '착공', '모집', '준공', '입주'], ledger: BOARD, start: { year: '2026', upto: 8, cum: 156396, cumLy: 150000 }, bottleneck: V.bottleneckOf });

test('1 핵심 숫자 정의는 (i) 팝오버: 지시 카드 6장 · 월별 공급 파동 · 판정·병목 · 시도 · 월별 실적 흐름 · 추이 · 12개월 준공 · 기관별 — 제목 바로 옆', () => {
  assert.match(board, /import InfoTip from '\.\.\/ui\/info-tip';/);
  assert.match(real, /import InfoTip from '\.\.\/ui\/info-tip';/);
  for (const id of ['p-chart', 'p-snap', 'p-region', 'p-trend', 'p-fut', 'p-agency']) assert.match(head(id), /<\/h2>\s*<InfoTip label=/, `${id}: 제목 바로 옆 (i)`);
  assert.match(head('p-actual', real), /<\/h2>\s*<InfoTip label=/, 'p-actual');
  /* 지시 카드: 단추 밖(형제) 겹친 자리의 (i) — 정의(basis)를 팝오버 본문으로 */
  const dirs = board.slice(board.indexOf('id="board-dirs"'), board.indexOf('</section>', board.indexOf('id="board-dirs"')));
  assert.match(dirs, /<InfoTip label=\{`\$\{x\.t\} 기준`\}[^>]*>\s*<p>\{x\.basis\}<\/p>/);
  assert.ok(dirs.indexOf('<InfoTip') > dirs.indexOf('</button>'), '(i) 는 카드 단추 밖(단추 안에 단추를 넣지 않는다)');
  /* 제목 title 은 짧게(두세 줄): 식을 8자로 셈해 200자 이하 */
  for (const [f, s] of [['Board', board], ['RealPanels', real]]) {
    for (const m of s.matchAll(/<h2 [^>]*?title=\{`((?:[^`$]|\$\{(?:[^{}]|\{[^{}]*\})*\})*)`\}/g)) {
      const n = m[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, 'XXXXXXXX').length;
      assert.ok(n <= 200, `${f}: 제목 title ${n}자 — ${m[1].slice(0, 60)}…`);
    }
  }
});

test("2 기간·단위 꼬리: 진척 관리 '2026.01~08 누계'(값 줄 회색 꼬리), 월별 실적 흐름 '단위 호', 기관 KPI 누계 기간", () => {
  assert.equal(DIR[0].t, '진척 관리');
  assert.equal(DIR[0].note, '2026.01~08 누계');
  assert.equal(C.ytdSpan('2026', 8), '2026.01~08 누계');
  assert.match(board, /\[x\.tag, x\.note\]\.filter\(Boolean\)/, '기간 꼬리는 제목 아래 작은 줄(원천 꼬리와 한 줄)');
  assert.match(panel('p-actual', real), /data-slot="actual-unit"[^>]*>단위 호</);
  assert.match(agency, /sub: <>\{ytdSpan\(year, Number\(last\.slice\(5\)\)\)\} \{fmt\(ytd\(molit, k, NATION, last, a\.actor!\)\)\}호/);
  assert.doesNotMatch(code(agency), /\{year\}년 누계/);
});

test('3 지연 기준 하나: 시도 타일 지연율 = 지연 호수 ÷ 판정 호수(판정 막대와 같은 호수 기준), 건수는 보조', () => {
  const ok = C.okUnitsBySido(V.rowsOf(MAP.bySgg, IDX.projects, IDX.sgg));
  assert.equal(Object.values(ok).reduce((a, b) => a + b, 0), BOARD.judgment.ok.units, '시도별 정상 호수 합 = 판정 정상 호수');
  const inc = BOARD.regions.find((r) => r.code === '28');
  assert.equal((inc.delayUnits / (ok['28'] + inc.cautionUnits + inc.delayUnits) * 100).toFixed(1), '11.6', '인천 지연율(호수) 1,666 ÷ 14,310');
  assert.match(home, /regionOkUnits: okUnitsBySido\(\(await getProjectsIndex\(\)\)\.rows\)/);
  const reg = panel('p-region');
  assert.match(reg, />지연율 · 호수 기준</);
  assert.doesNotMatch(code(board), /건수 기준/);
  assert.match(board, /rate = tu \? r\.delayUnits \/ tu \* 100 : 0/);
  assert.match(reg, /지연 \{f\(r\.delayUnits\)\}호 · \{f\(r\.delay\)\}건/, "타일 아래 '지연 1,666호 · 2건'");
  assert.match(reg, /\[\[r\.delayUnits, 'bg-bad'\], \[r\.cautionUnits, 'bg-warn'\], \[ok, 'bg-ok'\]\]/, '막대도 호수');
  assert.match(board, /data-slot="basis-tag"[^>]*title="[^"]*시도 타일도 호수 기준[^"]*"/);
});

test("4 진척 관리 링크 글자 = 무엇이 열리는지('원장 194건 ›'): 원장 지금 ③착공 단계 사업 수", () => {
  assert.equal(BOARD.stageProjects[BOARD.now][2], 194);
  assert.equal(DIR[0].list.text, '원장 194건');
  assert.match(DIR[0].list.title, /원장 사업\(전국\) 194건/);
  assert.match(board, /\{x\.list\.text \?\? '목록'\}<ChevronRight/);
  assert.match(board, /aria-label=\{`\$\{x\.t\} \$\{x\.list\.text \?\? '목록'\}`\}/, '읽기 이름에 보이는 글자가 들어간다');
});

test("5 용어: 종합상황판·기관·월 화면 글자에 '공식 0N' 번호·'실데이터' 없음", () => {
  for (const [f, s] of [['Board', board], ['RealPanels', real], ['month', month], ['agency', agency], ['StageKpis', kpis], ['directives', read('lib/board/directives.ts')], ['home', home]]) {
    assert.doesNotMatch(code(s), /실데이터/, f);
    assert.doesNotMatch(code(s), /공식 ?0[1-6]/, f);
  }
});

test("6 LH 준공 예정 파일 낡음 표지: 원장 기준일과의 차이('8개월 전 자료') — 기관·월 화면의 날짜 옆", () => {
  assert.equal(C.staleText('2026-01-27', '2026-10-13'), '8개월 전 자료');
  assert.equal(C.staleText('2026-01-27', '2026-02-26'), null);
  assert.equal(C.staleText('2026-01-27', '2026-02-27'), '1개월 전 자료');
  assert.equal(C.staleText(LH.sourceAsOf, BOARD.referenceDate), '8개월 전 자료');
  assert.match(agency, /const lhStale = staleText\(lh\.sourceAsOf, observedRef\)/);
  assert.match(agency, /파일 기준 \{dotDates\(lh\.sourceAsOf\)\}\{lhStale \? <Badge variant="warn"[^>]*>\{lhStale\}<\/Badge> : null\}/);
  assert.match(month, /const lhStale = staleText\(lh\.sourceAsOf, calendar\.referenceDate\)/);
  assert.match(month, /파일 기준 \{dotDates\(lh\.sourceAsOf\)\}\{lhStale \? <Badge variant="warn"[^>]*>\{lhStale\}<\/Badge> : null\}/);
  assert.match(board, /staleText\(real\.lhAsOf, L\.referenceDate\)/, '종합상황판 (i) 도 같은 기준');
  assert.doesNotMatch(board + home, /lhAgeMonths/);
});

test("7 단계 카드: 값 없는 단계는 칩 하나('자료 없음 ①·④·⑥', 이유는 (i)), 값 있는 카드가 폭을 채운다", () => {
  const k = code(kpis);
  assert.match(k, /import InfoTip from '\.\/ui\/info-tip';/);
  assert.match(k, /const empty = K\.flatMap\(\(_, i\) => \(ks\.some\(\(m\) => METRIC_BOARD\[m\] === i\) \? \[\] : \[i\]\)\)/);
  assert.match(k, /text=\{`자료 없음 \$\{empty\.map\(\(i\) => CIR\[i\]\)\.join\('·'\)\}`\}/);
  assert.match(k, /grid-cols-\[repeat\(auto-fit,minmax\(min\(200px,100%\),1fr\)\)\]/, '값 카드는 auto-fit 으로 폭을 채운다');
  assert.doesNotMatch(k, /border-dashed/, '빈 단계 점선 칸을 늘어놓지 않는다');
  assert.match(k, /title=\{`공급 6단계별 실적 · \$\{when\}`\}/);
});

test('8 날짜는 점 표기: 원장 출처 달·월별 실적 읽기 이름', () => {
  assert.match(board, /출처 Supabase\(api\.board, \$\{ymDot\(real\.ledgerMonth\)\}\)/);
  assert.match(real, /label=\{`전국 월별 인허가·착공·모집·준공 호수, \$\{ymDot\(molit\.months\[0\]\)\}부터 \$\{ymDot\(last\)\}까지`\}/);
  for (const [f, s] of [['Board', board], ['RealPanels', real], ['month', month], ['agency', agency]]) {
    assert.doesNotMatch(code(s), /[^/]\$\{(real\.ledgerMonth|last|molit\.months\[0\]|lh\.sourceAsOf|calendar\.referenceDate|observedRef)\}/, `${f}: 날짜 값을 그대로 쓰지 않는다(주소 안은 괜찮다)`);
  }
});
