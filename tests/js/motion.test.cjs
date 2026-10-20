'use strict';
// 그래프 첫 화면 동작(DESIGN.md Components > Motion): 리본은 화려한 연출, 나머지는 조용한 등장.
// 움직임 줄이기 설정을 존중하는지(그리고 화면 비교 하네스가 결정적인지), 사용자가 누르면 연출이 바로 끝나는지, 연출이 붙을 묶음이 있는지 정적으로 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const css = read('app/globals.css'), board = read('components/board/Board.tsx'), ribbon = read('components/board/ribbon.ts');

/* @media (prefers-reduced-motion: no-preference) { … } 블록 본문(중괄호 짝 맞춤) */
function motionBlock() {
  const i = css.indexOf('@media (prefers-reduced-motion: no-preference) {');
  assert.ok(i >= 0, '움직임 허용 미디어 블록');
  let depth = 0, j = css.indexOf('{', i);
  for (let k = j; k < css.length; k++) { if (css[k] === '{') depth++; else if (css[k] === '}' && --depth === 0) return { body: css.slice(j + 1, k), start: i, end: k }; }
  throw new Error('블록이 닫히지 않음');
}

test('모든 등장 동작은 움직임 줄이기가 아닐 때만 걸린다(미디어 블록 밖에는 animation 규칙이 없다)', () => {
  const { body, start, end } = motionBlock();
  for (const sel of ['[data-intro="sweep"] .rb-layers', '[data-intro="sweep"] .rb-scan', '[data-intro="sweep"] .rb-yr', '[data-intro="landed"] .rb-pin', '.q-rise', '.q-grow-y', '.q-grow-x', '.q-sweep', '.q-pulse']) assert.ok(body.includes(sel), sel);
  const outside = css.slice(0, start) + css.slice(end);
  assert.doesNotMatch(outside, /\.(rb|q)-[a-z-]+[^{]*\{[^}]*animation:/, '미디어 블록 밖의 등장 동작');
  for (const k of ['rb-sweep', 'rb-scan', 'rb-drop', 'rb-pop', 'q-rise', 'q-grow-y', 'q-grow-x', 'q-sweep', 'q-pulse']) assert.match(css, new RegExp(`@keyframes ${k} \\{`), k);
  assert.doesNotMatch(body, /\b(width|height|top|left|margin|padding):/, '레이아웃 속성을 움직이지 않는다(transform·opacity·clip-path 만)');
});

test('리본 연출: 서버 렌더부터 쓸기(sweep) → 착지(landed) → 끝, 기준 시점은 처음부터 NOW(지난 달을 훑지 않는다 — 2026-10-15 평가). 움직임 줄이기면 건너뛰고, 누르거나 키·휠을 쓰면 바로 끝낸다', () => {
  assert.match(board, /useState<'sweep' \| 'landed' \| ''>\('sweep'\)/);
  assert.match(board, /if \(window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) \{ setIntro\(''\); return; \}/);
  assert.match(board, /const EV = \['pointerdown', 'keydown', 'wheel'\] as const/);
  assert.match(board, /const \[cursor, setCursor\] = useState\(NOW\);/);
  assert.doesNotMatch(board, /setCursor\(0\)|'travel'/, '연출이 기준 시점을 지난 달로 옮기지 않는다');
  assert.match(board, /setIntro\('landed'\);/);
  assert.match(board, /return end;/, '화면을 떠나면 타이머·듣기를 정리한다');
  assert.match(board, /data-intro=\{intro \|\| undefined\}/);
  assert.match(board, /className="rb-cur"/);
  assert.match(board, /<rect className="rb-scan"[^>]*fill="url\(#rb-scan-g\)" opacity="0"/);
});

test('리본 SVG 는 연출 단계별로 묶여 있다: 축·층·기준일·연도 머리글(차례 --i)·표시(굵기 괄호·라벨). 병목 핀은 차트에 없다(툴팁에)', () => {
  for (const g of ['<g class="rb-axes">', '<g class="rb-layers">', '<g class="rb-now">', '<g class="rb-marks">']) assert.ok(ribbon.includes(g), g);
  assert.ok(!ribbon.includes('rb-pin'), '병목 핀 없음');
  assert.match(ribbon, /<g class="rb-yr" style="--i:\$\{i\}">/);
  assert.match(ribbon, /<linearGradient id="rb-scan-g" x1="0" y1="0" x2="1" y2="0">/);
});

test('조용한 등장: 종합상황판의 다른 그래프와 개별 화면 그래프·계단식 6단계', () => {
  for (const c of ["'ui-dir-face ui-pick q-rise relative", 'q-grow-x flex h-3.5', "'q-rise ui-press min-w-0", '<g className="q-sweep">', 'className="q-grow-y"', "cn(bar3, 'q-grow-x h-3"]) assert.ok(board.includes(c), c);
  assert.match(read('components/charts/MonthLines.tsx'), /<g className="q-sweep">/);
});

test('화면 비교 하네스는 움직임 줄이기로 찍는다(연출이 꺼져 결정적)', () => {
  assert.match(read('scripts/visual/shoot.js'), /Emulation\.setEmulatedMedia", \{ features: \[\{ name: "prefers-reduced-motion", value: "reduce" \}\] \}/);
});

/* ---------- 카드 호버(2026-10-10) ---------- */
test('카드 호버: 누를 수 있는 카드는 떠오름(card-lift), 누를 수 없는 카드는 테두리·그림자만(card-soft). 손가락 기기 제외, 움직임 줄이기면 떠오르지 않고, 눌린 카드의 고리를 지킨다', () => {
  assert.match(css, /@media \(hover: hover\) \{\n    \.card-lift:hover \{ transform: translateY\(-2px\); box-shadow: var\(--shadow-hover\); \}/);
  assert.match(css, /\.card-lift\[aria-pressed="true"\]:hover \{ box-shadow: 0 0 0 1px var\(--primary\), var\(--shadow-hover\); \}/);
  assert.match(css, /\.card-lift\[aria-current="step"\]:hover \{ box-shadow: 0 0 0 2px var\(--primary\), var\(--shadow-hover\); \}/);
  assert.match(css, /\.card-soft:hover:not\(\.ui-linked\) \{ box-shadow: var\(--shadow-hover-soft\); border-color: var\(--line2\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n    \.card-lift:hover, \.card-lift:focus-visible, \.card-lift:active \{ transform: none; \}/);
  for (const sel of ['\n:root {', '\n.dark {']) { const i = css.indexOf(sel), blk = css.slice(i, css.indexOf('\n}\n', i)); assert.match(blk, /--shadow-hover: /); assert.match(blk, /--shadow-hover-soft: /); }
  const card = read('components/ui/card.tsx');
  /* 2026-10-18 2라운드: 카드 모양은 부품 클래스(ui-card·ui-tile), 누를 수 없는 카드 변형은 모두 card-soft. 임시 별칭 panel·board·kpi 는 2.5 에서 지웠다. 쓰이지 않던 링크 카드(link)·원천 카드(source) 변형은 지웠다 */
  for (const v of ['section: "ui-card card-soft', 'tile: "ui-tile card-soft']) assert.ok(card.includes(v), v);
  /* 2026-10-19 종합상황판: 지시 카드는 칸째 떠오르는 .ui-dir-cell + 면 .ui-dir-face, 시도 타일은 .ui-press, 연결 패널은 .ui-linked(고리 없음) — 고른 것에 바깥 고리(0 0 0 1px)를 더하지 않는다 */
  for (const c of ["'ui-dir-face ui-pick q-rise relative", "className=\"ui-dir-cell relative min-w-0\"", "'q-rise ui-press min-w-0", "on && 'ui-linked'"]) assert.ok(board.includes(c), c);
  assert.match(css, /@media \(hover: hover\) \{\n    \.ui-dir-cell:hover \{ translate: 0 var\(--lift-y\); \}/);
  assert.match(css, /\.ui-dir-cell:has\(> \.ui-dir-face:active\) \{ translate: none; transition-duration: var\(--dur-press\); \}/);
  assert.match(css, /\.ui-press:active \{ transform: none; box-shadow: var\(--shadow-card\); transition-duration: var\(--dur-press\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n    \.ui-dir-cell, \.ui-dir-cell:hover,[^}]*\{ translate: none; \}\n    \.ui-press:hover, \.ui-press:focus-visible, \.ui-press:active \{ transform: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\n    \.ui-linked, \.ui-linked-actual > #p-actual \{ animation: ui-linked-in var\(--dur-linked\) var\(--ease-out\) 1 backwards; \}/, '연결 순간 한 번 밝아짐은 움직임 허용일 때만');
  /* 2026-10-16 2차 평가: 서랍 단계 칸은 누르는 카드가 아니다(정의만 — 목록은 따로 링크, r2-screens 4) → 떠오르지 않는다 */
  assert.match(read('components/projects/StageSteps.tsx'), /className=\{cn\('flex h-full min-h-\[64px\]/, '서랍 단계 칸은 누를 수 없는 칸(떠오름 없음)');
  assert.match(css, /\.card-lift:hover:not\(\[aria-pressed="true"\]\):not\(\[aria-current="step"\]\):not\(\.keep-border\) \{ border-color:/);
});

test('등장 동작은 끝나면 원래 스타일로 돌아간다(backwards): both 면 끝난 뒤에도 transform 이 남아 호버의 떠오름을 막는다', () => {
  for (const k of ['q-rise', 'q-grow-y', 'q-grow-x', 'q-sweep', 'q-pulse']) assert.match(css, new RegExp(`animation: ${k} [^;]* backwards;`), k);
});

test('지도 패널 카드도 같은 결로 떠오른다(머리 줄 점검 단추는 조용한 링크라 제외)', () => {
  const map = read('assets/css/app.css');
  assert.match(map, /@media \(hover:hover\)\{\n  \.card:hover,\.next \.nx:hover\{transform:translateY\(-1px\);box-shadow:var\(--card-hover-shadow\);border-color:var\(--line2\)\}/);
  assert.doesNotMatch(map, /\.isum:hover\{transform:translateY/);
  const { mapVars } = require('./map-tokens.cjs');   // 그림자 값은 app/globals.css 의 --map-card-hover-shadow(2026-10-18)
  assert.equal(mapVars({ theme: 'dark' })['--card-hover-shadow'], '0 6px 16px rgba(0,0,0,.38)');
  assert.equal(mapVars({ theme: 'light' })['--card-hover-shadow'], '0 6px 16px rgba(44,36,26,.12)');   // 웜 중립 그림자(2026-10-19 지도 웜 덮기)
});

/* ---------- 시점 조작 줄 제거(2026-10-10, 디자인 피드백) ---------- */
test('월별 공급 파동 카드에 시점 조작 줄(재생·시간 막대·바로가기·지시 순환 스위치)이 없고, 시점은 차트를 눌러 고른다', () => {
  assert.doesNotMatch(board, /board-transport|tl-range|board-jumps|JUMP_LABEL|playing|role="switch"/);
  assert.doesNotMatch(css, /\.tl-range/, '슬라이더 모양 CSS 도 남지 않는다');
  assert.match(board, /onClick=\{\(e\) => \{ const m = monthAt\(e\.clientX\); if \(m >= 0\) goto\(m\); \}\}/, '차트 클릭으로 시점 선택');
  assert.match(board, /aria-label=\{`[^`]*차트를 누르면 그 달을 고릅니다\.`\}/);
  assert.match(board, /onClick=\{\(\) => pick\(i\)\}/, '지시 카드를 누르면 그 카드를 고른다');
  assert.match(board, /const pick = \(i: number\) => \{\n    setFocus\(i \+ 1\);\n    document\.getElementById\(DIR\[i\]\.p\[0\]\)\?\.scrollIntoView\(\{ block: 'nearest', behavior: window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches \? 'auto' : 'smooth' \}\);/, '연결 패널이 화면 밖이면 가장 가까운 끝까지 내린다(움직임 줄이기면 바로)');
});
