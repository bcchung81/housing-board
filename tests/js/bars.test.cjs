'use strict';
// 막대 그래프는 모서리를 둥글리지 않는다(2026-10-10 사용자 요청 "막대 그래프들은 라운드 처리 없이 표기해", 계획서 11절).
// 범례 견본·단추·카드·HUD 라벨은 막대가 아니라 대상이 아니다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('대시보드 막대: 상태 비율 막대·기관별 막대(bar3)·12개월 막대와 선택 테두리·쌓은 막대·계단 칸(넓은 화면)', () => {
  const board = read('components/board/Board.tsx');
  assert.match(board, /<div className="q-grow-x flex h-3\.5 min-w-0 flex-auto gap-0\.5 overflow-hidden bg-pn2 rounded-full /);   // 판정 달 꼬리표와 한 줄이라 남는 폭을 채운다
  assert.match(read('components/board/styles.ts'), /export const bar3 = "flex gap-px overflow-hidden rounded-full";/);
  const fm = /<svg id="fmonths"[\s\S]*?<\/svg>/.exec(board)[0];
  assert.doesNotMatch(fm, /\brx=/, '12개월 막대·선택 테두리');
  const rg = /<span className="ui-region-bar"[^>]*>/.exec(board)[0];
  assert.doesNotMatch(rg, /rounded/, '시도 타일 3색 막대');
});

test('지도 막대: 상태 막대(.sbar)·공정 막대(.mini·.pg .bar2·.hudtag .ht-bar)', () => {
  const css = read('assets/css/app.css');
  for (const sel of ['.sbar{', '.mini{', '.pg .bar2{', '.hudtag .ht-bar{']) {
    const i = css.indexOf(sel); assert.ok(i >= 0, sel);
    assert.doesNotMatch(css.slice(i, css.indexOf('}', i)), /border-radius/, sel);
  }
  assert.doesNotMatch(css, /\.(sbar|mini|bar2|ht-bar)[^{]*\{[^}]*border-radius/);
});

test('카드 윤곽 통일(2026-10-18): 판정 3칸·추이 두 숫자·시도 타일은 안쪽 카드(ui-inset), 안쪽 카드 안에 카드 없음(2단까지), 막대 틀은 둥글게', () => {
  const board = read('components/board/Board.tsx');
  assert.match(board, /<div key=\{name\} className="ui-snap-stat">/, '판정 지연·주의·정상 3칸');
  assert.match(board, /<span key=\{name\} className="ui-inset flex items-baseline[^"]*">/, '추이 지연·주의 두 숫자');
  assert.match(board, /data-slot="board-region" className=\{cn\(btn, '[^']*\bui-inset ui-region ui-region-row'\)\}/, '시도 타일(면 = 지연율 의미색 부품 ui-region, 2026-10-19 임의값 bg-[var(--rc)] 대체)');
  assert.doesNotMatch(board, /data-slot="board-region" className=\{cn\(btn, '[^']*ui-tile-compact/, '시도 타일은 카드 안이라 compact 가 아니다');
  const cell = board.slice(board.indexOf('className="ui-snap-stat">'), board.indexOf("{/* 지연 두 숫자"));
  assert.doesNotMatch(cell.slice('className="ui-inset">'.length), /<Card\b|ui-(tile|inset|card)/, '안쪽 카드 안에 또 카드 금지');
  assert.match(read('components/board/styles.ts'), /export const bar3 = "[^"]*\brounded-full\b/);
});
