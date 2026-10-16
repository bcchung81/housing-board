'use strict';
/* 4차 개선(2026-10-16) — 종합상황판:
   1 시도 16곳을 다시 전국 16칸 지리 격자로(사용자 지시 — 2차의 '판정 시도만 크게 + 13곳 한 줄 묶음'을 되돌림, 3차의 호수 기준 지연율·'지연 n호 · n건'·(i) 는 유지)
   2 판정 비율 모수('판정 169건 · 168,152호 · 전체의 11.8%') · 3 패널 머리 범위 칩 · 4 카드 제목 말줄임 없음(두 줄 허용, 원천 꼬리는 아래 작은 줄)
   5 기관별 진행 % = '전국 지연 중 몫' */
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

test('1 시도 16곳: 전국 16칸 지리 격자(4열, REGION_POS 자리), 판정 대상 없는 칸은 흰 바탕 + 판정 대상 없음 · 확인 필요 n건', () => {
  assert.equal(BOARD.regions.length, 16);
  const reg = panel('p-region');
  assert.match(reg, />시도 \{L\.regions\.length\}곳<\/h2>/, "제목 '시도 16곳'");
  assert.match(reg, /\{L\.regions\.map\(\(r, ri\) =>/, '16곳 모두 타일');
  assert.match(reg, /grid-cols-4/, '4열 지리 격자');
  assert.match(reg, /pos \? \{ gridArea: `\$\{pos\[0\]\} \/ \$\{pos\[1\]\}` \} : \{\}/, '지리 자리(REGION_POS)');
  assert.match(reg, /\[grid-area:5\/2\/6\/5\]/, '선택 시도 요약은 격자 5줄 2~4열');
  assert.match(reg, /\['--rc' as string\]: none \? 'var\(--card\)' : RCOL\[rcls\(rate\)\]/, '판정 대상 없는 칸은 흰(카드) 바탕');
  assert.match(reg, /data-slot="region-none"[^>]*>판정 대상 없음\{r\.candidate\?\.judged \? <> · 확인 필요 \{f\(r\.candidate\.judged\)\}건<\/> : null\}<\/span>/, "'판정 대상 없음 · 확인 필요 n건'");
  /* 2차 묶음은 없어진다 */
  for (const s of ['region-fold', 'board-region-rest', 'foldOpen', 'restRegions', 'judgedRegions']) assert.doesNotMatch(board, new RegExp(s), s);
  /* 3차 유지: 호수 기준 지연율 · 타일 아래 '지연 n호 · n건' · 범례 · (i) */
  assert.match(reg, /rate = tu \? r\.delayUnits \/ tu \* 100 : 0/);
  assert.match(reg, /지연 \{f\(r\.delayUnits\)\}호 · \{f\(r\.delay\)\}건/);
  assert.match(reg, />지연율 · 호수 기준</);
  assert.match(reg, /<\/h2>\s*<InfoTip label="시도 지연율 기준"/);
  assert.doesNotMatch(code(reg), /아래 한 줄 묶음/, '(i) 설명도 격자에 맞춘다');
  /* 지리 자리: 16곳 모두 자리가 있고 겹치지 않는다(요약 칸 5/2~4 비움) */
  const cells = BOARD.regions.map((r) => S.REGION_POS[r.code].join('/'));
  assert.equal(new Set(cells).size, 16);
});

test("2 판정 비율 모수: '판정 169건 · 168,152호 · 전체의 11.8%'(전체 = 리본 총량 1,424,872호) — 선택 시점 카드에 보이고 (i) 에 무엇의 % 인지", () => {
  const JS = S.judgmentsOf(BOARD), T = S.timelineOf(BOARD);
  const SJ = JS[BOARD.now];
  const rib = S.ribbonOf(T, BOARD.stageUnits, S.delaysOf(JS), S.scopeChangeOf(JS));
  assert.equal(rib.total[BOARD.now], 1424872);
  assert.equal(rib.total[BOARD.now], BOARD.scope.units, '리본 총량 = 원장 전체 호수');
  assert.equal(D.judgeBase(SJ, rib.total[BOARD.now]), '판정 169건 · 168,152호 · 전체의 11.8%');
  assert.equal(D.judgeBase(BOARD.judgment, BOARD.scope.units), '판정 169건 · 168,152호 · 전체의 11.8%');
  const snap = panel('p-snap');
  assert.match(snap, /data-slot="judge-base"[^>]*>\{judgeBase\(SJ, jTot\)\}</, '판정 막대 아래 모수 줄');
  assert.match(board, /jTot = rib\.total\[judged \? jm : NOW\]/);
  assert.match(snap, /전체의 % = 원장 전체 \{f\(jTot\)\}호/, '(i): 무엇의 % 인지');
});

test('3 범위 칩: 종합상황판 패널 머리마다(선택 시점 카드 포함) — 원장 위젯 전국 · 사업 원장, 월별 실적 흐름 전국 · 통계누리', () => {
  for (const id of ['p-chart', 'p-snap', 'p-region', 'p-trend', 'p-fut', 'p-agency']) assert.match(headOf(id), /<\/InfoTip>\s*\{ledgerChip\}/, id);
  assert.match(headOf('p-actual', real), /<ScopeChip scope="전국" source="통계누리"/);
  assert.match(board, /import ScopeChip from '\.\.\/ui\/scope-chip';/);
});

test("4 카드 제목은 말줄임 없음: 지시 카드 제목은 두 줄까지 줄바꿈(낱말 단위), 원천 꼬리('통계누리')는 제목 아래 작은 회색 줄, 카드는 내용만큼 자란다", () => {
  assert.doesNotMatch(code(board), /\btruncate\b/, '종합상황판에 말줄임 없음');
  assert.match(board, /const dirTitle = /);
  assert.match(board, /\[word-break:keep-all\]/);
  assert.match(board, /<span data-slot="dir-tag" className="block [^"]*text-\[min\(12px,7\.5cqi\)\][^"]*">\{small\.map/, '꼬리는 제목 아래 작은 줄');
  assert.match(board, /data-slot="board-dir"[^>]*className=\{cn\(btn, '[^']*\bmin-h-20 [^']*justify-between[^']*\bpy-2\.5/, '카드 높이 80px 이상');
  assert.doesNotMatch(board, /data-slot="board-dir"[^>]*className=\{cn\(btn, '[^']* h-20 /, '고정 높이 h-20 없음');
  const dirs = board.slice(board.indexOf('id="board-dirs"'), board.indexOf('</section>', board.indexOf('id="board-dirs"')));
  assert.equal((dirs.match(/\{dirTitle\(x(, true)?\)\}/g) || []).length, 2, '단추와 두 숫자 겹친 층이 같은 제목 틀');
  const DIR = D.makeDirectives({ sourceCount: 40, stageNames: ['계획', '인허가', '착공', '모집', '준공', '입주'], ledger: BOARD, start: { year: '2026', upto: 8, cum: 1, cumLy: 1 }, bottleneck: () => null });
  assert.deepEqual([DIR[0].t, DIR[0].tag, DIR[5].t], ['진척 관리', '통계누리', '국민 공개·공식 원천']);
});

test("5 기관별 진행 % = '전국 지연 중 몫'(열 머리·값·title)", () => {
  const ag = panel('p-agency');
  assert.match(ag, /data-slot="agency-head"[^\n]*>지연 · \{whole\} 지연 중 몫</, '열 머리');
  assert.match(board, /whole = nation === '전국' \? '전국' : '원장 전체'/);
  assert.match(ag, />몫 \{\(J\.delay\.units \? a\.delayUnits \/ J\.delay\.units \* 100 : 0\)\.toFixed\(1\)\}%</, "값 '몫 100.0%'");
  assert.match(ag, /title=\{`[^`]*\$\{whole\} 지연 \$\{f\(J\.delay\.units\)\}호 중 \$\{a\.name\} 몫/, 'title');
  assert.doesNotMatch(code(board), /지연 중 비중/);
  const lh = BOARD.agencies.find((a) => a.id === 'lh');
  assert.equal((lh.delayUnits / BOARD.judgment.delay.units * 100).toFixed(1), '100.0');
});
