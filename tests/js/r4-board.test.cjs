'use strict';
/* 4차 개선(2026-10-16) — 종합상황판:
   1 시도를 다시 지리 격자로(전국 16칸 — 2026-10-19 수도권 한정으로 3칸 한 줄)(사용자 지시 — 2차의 '판정 시도만 크게 + 13곳 한 줄 묶음'을 되돌림, 3차의 호수 기준 지연율·'지연 n호 · n건'·(i) 는 유지)
   2 판정 비율 모수('판정 169건 · 168,152호 · 전체의 73.8%') · 3 패널 머리 범위 칩 · 4 카드 제목 말줄임 없음(두 줄 허용, 원천 꼬리는 아래 작은 줄)
   5 기관별 진행 % = '(범위) 지연 중 몫' */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('node:module').registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (/^\.\.?\//.test(s)) return n(`${s}.ts`, c); throw e; } } });
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');   // 주석 뺀 화면 글자
const D = require('../../lib/board/directives.ts');
const S = require('../../lib/board/sample.ts');
const BOARD = require('../../data/board/ledger-board.json');

const board = read('components/board/Board.tsx'), real = read('components/board/RealPanels.tsx');
const panel = (id, s = board) => s.slice(s.indexOf(`id="${id}"`), s.indexOf('</Card>', s.indexOf(`id="${id}"`)));
const headOf = (id, s = board) => { const p = panel(id, s); return p.slice(0, p.indexOf('</div>')); };   // 패널 첫 줄(제목 줄)

test('1 시도 3곳: 서울·인천·경기 한 줄(열 = 시도 수) + 아래 요약 칸, 지리 격자(REGION_POS)는 쓰지 않음, 판정 대상 없는 칸은 흰 바탕 + 판정 대상 없음 · 확인 필요 n건', () => {
  // 2026-10-19 수도권 한정: 전국 16칸 지리 격자(4열) → 시도 3칸 한 줄(시도가 4곳 이하면 geo 끔). 타일 모양·3차 유지 항목은 그대로
  assert.equal(BOARD.regions.length, 3);
  assert.deepEqual(BOARD.regions.map((r) => r.code), ['11', '28', '41']);
  const reg = panel('p-region');
  assert.match(reg, />시도 \{L\.regions\.length\}곳<\/h2>/, "제목 '시도 3곳'");
  assert.match(reg, /\{L\.regions\.map\(\(r, ri\) =>/, '시도 모두 타일');
  assert.match(board, /const geo = L\.regions\.length > 4;/, '4곳 이하면 지리 격자 끔');
  assert.match(reg, /geo \? 'grid-cols-4' : 'grid-rows-\[minmax\(68px,1fr\)_auto\]'/, '한 줄이면 4열 격자 대신 행 하나 + 아래 요약 줄');
  assert.match(reg, /gridTemplateColumns: `repeat\(\$\{L\.regions\.length\}, minmax\(0, 1fr\)\)`/, '열 = 시도 수');
  assert.match(reg, /pos && geo \? \{ gridArea: `\$\{pos\[0\]\} \/ \$\{pos\[1\]\}` \} : \{\}/, '지리 자리(REGION_POS)는 격자일 때만');
  assert.match(reg, /geo \? '\[grid-area:5\/2\/6\/5\]' : 'col-span-full'/, '선택 시도 요약은 한 줄이면 아래 전체 폭');
  assert.match(reg, /\['--rc' as string\]: none \? 'var\(--card\)' : RCOL\[rcls\(rate\)\]/, '판정 대상 없는 칸은 흰(카드) 바탕');
  assert.match(reg, /data-slot="region-none"[^>]*>판정 대상 없음\{r\.candidate\?\.judged \? <> · 확인 필요 \{f\(r\.candidate\.judged\)\}건<\/> : null\}<\/span>/, "'판정 대상 없음 · 확인 필요 n건'");
  /* 2차 묶음은 없어진다 */
  for (const s of ['region-fold', 'board-region-rest', 'foldOpen', 'restRegions', 'judgedRegions']) assert.doesNotMatch(board, new RegExp(s), s);
  /* 3차 유지: 호수 기준 지연율 · 타일 아래 '지연 n호 · n건' · 범례 · (i) */
  assert.match(reg, /rate = tu \? r\.delayUnits \/ tu \* 100 : 0/);
  assert.match(reg, /(?:지연 <\/span>)?\{f\(r\.delayUnits\)\}호(?:<span className="@max-\[105px\]:hidden">)? · \{f\(r\.delay\)\}건/);
  assert.match(reg, />지연율 · 호수 기준</);
  assert.match(reg, /<\/h2>\s*<InfoTip label="시도 지연율 기준"/);
  assert.doesNotMatch(code(reg), /아래 한 줄 묶음/, '(i) 설명도 타일에 맞춘다');
  /* 서울·인천·경기 모두 판정 대상이 있다 */
  assert.ok(BOARD.regions.every((r) => r.judged), '세 시도 모두 판정 대상 있음');
});

test("2 판정 비율 모수: '판정 169건 · 168,152호 · 전체의 73.8%'(전체 = 리본 총량 227,976호) — 선택 시점 카드에 보이고 (i) 에 무엇의 % 인지", () => {
  const JS = S.judgmentsOf(BOARD), T = S.timelineOf(BOARD);
  const SJ = JS[BOARD.now];
  const rib = S.ribbonOf(T, BOARD.stageUnits, S.delaysOf(JS), S.scopeChangeOf(JS));
  // 2026-10-19 수도권 한정: 리본 총량 1,424,872호 → 227,976호(수도권 HOME), 판정 비율 11.8% → 73.8%(판정 호수 168,152는 그대로)
  assert.equal(rib.total[BOARD.now], 227976);
  assert.equal(rib.total[BOARD.now], BOARD.scope.units, '리본 총량 = 원장 전체 호수');
  assert.equal(D.judgeBase(SJ, rib.total[BOARD.now]), '판정 169건 · 168,152호 · 전체의 73.8%');
  assert.equal(D.judgeBase(BOARD.judgment, BOARD.scope.units), '판정 169건 · 168,152호 · 전체의 73.8%');
  const snap = panel('p-snap');
  assert.match(snap, /data-slot="judge-base"[^>]*>\{judgeBase\(SJ, jTot\)\}</, '판정 막대 아래 모수 줄');
  assert.match(board, /jTot = rib\.total\[judged \? jm : NOW\]/);
  assert.match(snap, /전체의 % = 원장 전체 \{f\(jTot\)\}호/, '(i): 무엇의 % 인지');
});

test('3 범위 칩: 종합상황판 패널 머리마다(선택 시점 카드 포함) — 원장 위젯 수도권 · 사업 원장, 월별 실적 흐름 수도권 · 통계누리', () => {
  for (const id of ['p-chart', 'p-snap', 'p-region', 'p-trend', 'p-fut', 'p-agency']) assert.match(headOf(id), /<\/InfoTip>\s*\{ledgerChip\}/, id);
  // 2026-10-19 수도권 한정: 칩 글 '전국' → 수도권(원장 칩 = nation(L), 통계누리 칩 = 합계 자리 이름 area)
  assert.equal(D.nation(BOARD), '수도권');
  assert.match(board, /ledgerChip = <ScopeChip scope=\{nation === '전국 아님' \? '일부 지역' : nation\} source="사업 원장"/);
  assert.match(headOf('p-actual', real), /<ScopeChip scope=\{area\} source="통계누리"/);
  assert.match(real, /area = sidoName\(molit, NATION\) \?\? '전국'/, 'area = 합계 자리 이름(수도권)');
  assert.match(board, /import ScopeChip from '@\/components\/ui\/scope-chip';/);
});

test("4 지시 카드 두 줄 고정(2026-10-18 통일 규격): 줄1 = 지시 이름(길면 말줄임, 꼬리 없음), 줄2 = 값 — 단추와 겹친 층이 같은 두 줄 틀, 카드는 내용만큼 자란다", () => {
  assert.match(board, /const dirTitle = /);
  assert.doesNotMatch(board, /data-slot="dir-tag"/, "원천 꼬리('통계누리')는 줄1에 없다 — (i) 기준에");
  assert.match(board, /data-slot="board-dir"[^>]*className=\{cn\(btn, dirFrame, '[^']*\bmin-h-16 /, '카드 높이 64px 이상');
  assert.doesNotMatch(board, /data-slot="board-dir"[^>]*className=\{cn\(btn, dirFrame, '[^']* h-16 /, '고정 높이 h-16 없음');
  const dirs = board.slice(board.indexOf('id="board-dirs"'), board.indexOf('</section>', board.indexOf('id="board-dirs"')));
  assert.equal((dirs.match(/\{dirTitle\(x(, true)?\)\}/g) || []).length, 2, '단추와 겹친 층이 같은 제목 틀');
  const DIR = D.makeDirectives({ sourceCount: 40, stageNames: ['계획', '인허가', '착공', '모집', '준공', '입주'], ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: () => null });
  assert.deepEqual([DIR[0].t, DIR[0].tag, DIR[0].pre, DIR[5].t], ['진척 관리', undefined, '착공 누계', '국민 공개·공식 원천']);
  assert.match(DIR[0].basis, /^통계누리 /, '원천은 (i) 기준 첫머리');
});

test("5 기관별 진행 % = '수도권 지연 중 몫'(whole = 범위 이름, 열 머리·값·title)", () => {
  const ag = panel('p-agency');
  assert.match(ag, /data-slot="agency-head"[^\n]*>지연 · \{whole\} 지연 중 몫</, '열 머리');
  // 2026-10-19 수도권 한정: whole 은 '전국'만 따로 두지 않고 nation(수도권) 그대로, '전국 아님'만 '원장 전체'
  assert.match(board, /whole = nation === '전국 아님' \? '원장 전체' : nation/);
  assert.match(ag, />몫 \{\(J\.delay\.units \? a\.delayUnits \/ J\.delay\.units \* 100 : 0\)\.toFixed\(1\)\}%</, "값 '몫 100.0%'");
  assert.match(ag, /title=\{`[^`]*\$\{whole\} 지연 \$\{f\(J\.delay\.units\)\}호 중 \$\{a\.name\} 몫/, 'title');
  assert.doesNotMatch(code(board), /지연 중 비중/);
  const lh = BOARD.agencies.find((a) => a.id === 'lh');
  assert.equal((lh.delayUnits / BOARD.judgment.delay.units * 100).toFixed(1), '100.0');
});
