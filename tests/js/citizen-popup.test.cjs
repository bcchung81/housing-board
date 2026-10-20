'use strict';
/* /citizen 팝업·청약 단지 표(2026-10-20 사용자 지시):
   ① 오른쪽 옆 시트 → 화면 가운데 모달리스 팝업 하나(휴대폰 599 이하는 아래 시트) + 뒤 화면 흐린 막(누름 통과)
   ② 청약 단지 표는 넓은 칸에서 한 단지 = 한 줄(줄바꿈을 만드는 display:block·세로 flex·2행 격자 없음), 머리 줄과 같은 9칸 트랙 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const TPL = read('tools/design/public-mock/template.html');
const OPS = read('assets/citizen/index.html');
const CSS = read('app/globals.css');
const { extractExport } = require('../../scripts/globals-export.js');
const EXPORT = extractExport(CSS);
const style = (src) => [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const ST = style(TPL);
const rule = (sel) => { const i = ST.indexOf(`\n${sel} {`); assert.ok(i >= 0, sel); return ST.slice(i, ST.indexOf('}', i)); };
const fnBody = (name) => { const i = TPL.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return TPL.slice(i, TPL.indexOf('\n}\n', i)); };
const script = [...TPL.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

test('① 팝업 마크업: role=dialog · aria-modal="false"(원본·운영판 모두), 막은 aria-hidden, 팝업 안 알림 영역 없음', () => {
  for (const [n, src] of [['원본', TPL], ['운영판', OPS]]) {
    assert.match(src, /<aside class="sheet" id="sheet" role="dialog" aria-modal="false" aria-labelledby="sheet-h" hidden>/, n);
    assert.match(src, /<div class="sheet-bg" id="sheet-bg" aria-hidden="true" hidden><\/div>/, n);
    assert.doesNotMatch(src, /aria-modal="true"|id="sheet-live"/, n);
  }
});

test('① 모달리스: inert·Tab 가둠·막 눌러 닫기 없음, Esc(검색 칸 밖)·닫기 단추로 닫고 연 단추로 초점, 알림은 바깥 영역 하나', () => {
  assert.doesNotMatch(script, /\.inert\b/, '뒤 화면을 inert 로 막지 않는다');
  assert.doesNotMatch(script, /\$\('#sheet'\)\.addEventListener\('keydown'/, 'Tab 가둠 없음');
  assert.doesNotMatch(script, /#sheet-bg'\)\.onclick|#sheet-bg'\)\.addEventListener/, '막은 누름을 통과시킨다');
  assert.match(script, /\$\('#sheet-x'\)\.onclick = closeSheet;/);
  assert.match(script, /e\.key === 'Escape' && !\$\('#sheet'\)\.hidden && !e\.target\.closest\?\.\('\.sbox'\)\) \{ e\.preventDefault\(\); closeSheet\(\); \}/);
  assert.match(fnBody('closeSheet'), /back\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(fnBody('say'), /\$\('#live'\)\.textContent = msg;/);
  /* 창은 하나: 열려 있으면 펼침 연출 없이 내용만 바꾸고 제목에 초점. 뒤 화면에서 누른 사업은 [목록] 되돌림 없이 바꿔 쓴다 */
  assert.match(fnBody('showSheet'), /^function showSheet\(from\) \{\n  if \(!\$\('#sheet'\)\.hidden\) \{ sheetFrom = from; focusSheetHead\(\); return; \}/);
  assert.match(fnBody('openProject'), /const inSheet = !\$\('#sheet'\)\.hidden && !!from && \$\('#sheet'\)\.contains\(from\);/);
});

test('① 넓은 화면 팝업 모양: 가운데 · 폭 min(560, 화면 − 32) · 높이 = 내용(화면 − 96 까지) · 카드 반경 · 팝오버 면 · 떠 있는 그림자, 끌어 옮기기는 화면 안', () => {
  const s = rule('.sheet');
  for (const d of ['position: fixed', 'inset: 0', 'margin: auto', 'width: min(560px, 100vw - 32px)', 'height: fit-content', 'max-height: calc(100dvh - 96px)', 'border-radius: var(--radius-card)', 'background: var(--popover)', 'box-shadow: var(--shadow-pop)']) assert.ok(s.includes(d), d);
  assert.doesNotMatch(s, /right: 0|translateX/, '오른쪽 옆 시트 아님');
  assert.match(rule('.sheet-b'), /flex: 1 1 auto; min-height: 0; overflow-y: auto;/, '안쪽 스크롤');
  assert.match(ST, /@media \(min-width: 600px\) \{ \.sheet-h \{ cursor: move; touch-action: none; user-select: none; \} \}/);
  assert.match(fnBody('placeSheet'), /Math\.min\(Math\.max\(0, x\), Math\.max\(0, innerWidth - w\)\)/);
  assert.match(fnBody('placeSheet'), /Math\.min\(Math\.max\(0, y\), Math\.max\(0, innerHeight - h\)\)/);
  assert.match(fnBody('closeSheet'), /resetSheetPos\(\)/, '닫으면 다시 가운데');
  /* 휴대폰(599 이하)은 아래 시트 그대로 */
  assert.match(ST, /@media \(max-width: 599px\) \{[\s\S]*?\.sheet, \.sheet\.moved \{ inset: auto 0 0 0; margin: 0; width: 100%; height: auto; max-height: 82dvh;[^}]*animation-name: sheet-up; \}/);
});

test('① 흐린 막: 화면 전체(머리 줄 위 z) · --win-scrim 색 · --win-blur 흐림(-webkit- 포함) · 누름 통과, 토큰은 globals 내보내기 구간에', () => {
  const b = rule('.sheet-bg');
  for (const d of ['position: fixed', 'inset: 0', 'z-index: 80', 'background: var(--win-scrim)', '-webkit-backdrop-filter: blur(var(--win-blur))', ' backdrop-filter: blur(var(--win-blur))', 'pointer-events: none']) assert.ok(b.includes(d), d);
  assert.match(ST, /header\.top \{[^}]*z-index: 40;/, '머리 줄(40)도 막(80) 아래라 흐려진다');
  assert.match(rule('.sheet'), /z-index: 81;/);
  assert.match(EXPORT, /\n:root \{[^}]*--win-scrim: [^;]+;[^}]*--win-blur: [^;]+;/);
  assert.match(EXPORT, /\n\.dark \{[^}]*--win-scrim: [^;]+;/);
  assert.doesNotMatch(b, /#[0-9a-fA-F]{3,8}\b|rgba?\(|color-mix/, '색은 토큰만');
});

/* ---------- ② 청약 단지 표 ---------- */
const PJ = ST.slice(ST.indexOf('/* 청약 단지 표(아래 줄 한 장'), ST.indexOf('/* 출처 한 줄'));
const WIDE = PJ.slice(PJ.indexOf('#c-pj {'), PJ.indexOf('@container pj'));
const tracks = (v) => { const out = []; let d = 0, cur = ''; for (const c of v.trim()) { if (c === '(') d++; if (c === ')') d--; if (c === ' ' && !d) { if (cur) out.push(cur); cur = ''; } else cur += c; } if (cur) out.push(cur); return out; };

test('② 넓은 칸 청약 단지 표는 한 줄: 9칸 영역 한 행, 줄바꿈을 만드는 display:block·세로 flex·2행 격자 없음', () => {
  const areas = [...WIDE.matchAll(/grid-template-areas: ([^;]+);/g)].map((m) => m[1]);
  assert.deepEqual(areas, ["'ty nm dg u sp ar nx when ag'"], '넓은 칸 영역은 한 행(구분 · 이름 · 위치 · 세대 · 특별공급 · 주택형 · 일정 · 입주 · 시공·시행)');
  assert.doesNotMatch(WIDE, /flex-direction: column|grid-row: 2|\.pj-pc \{ display: block/);
  assert.doesNotMatch(WIDE.replace(/\.pj-st \.ui-chip \{[^}]*\}/, ''), /display: block/, '칩 안 말줄임(.pj-st .ui-chip) 말고 block 없음');
  assert.match(WIDE, /\.pjs \.ev \{[^}]*min-height: var\(--pj-row-h\);[^}]*white-space: nowrap; \}/);
  assert.match(WIDE, /\.pjs \.ev \.nmw \{ display: contents; \}/, '칩·이름·위치가 각자 열');
  assert.match(WIDE, /\.pjs \.ev \.pj-nx \{[^}]*grid-template-columns: var\(--pj-st-w\) minmax\(0, 1fr\);/, '일정 = 칩 칸 | 날짜 한 줄');
  assert.match(WIDE, /\.pj-th :is\(\.u, \.pj-sp, \.pj-ar, \.when\) \{ text-align: right; \}/, '숫자 열 오른쪽');
  /* 좁은 칸(안쪽 1200 미만)만 두 줄 */
  assert.match(PJ, /@container pj \(max-width: 1199px\) \{[\s\S]*?grid-template-areas: 'nm nm u' 'sp nx when';/);
});

test('② 머리 줄 9칸 = 행 9칸 = --pj-cols 9트랙, 줄 높이 44(한 줄 누름 칸), 행 전체가 청약홈 링크', () => {
  const th = TPL.match(/<div class="pj-th" aria-hidden="true">([\s\S]*?)<\/div>/)[1];
  assert.deepEqual([...th.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map((m) => m[1]), ['구분', '이름', '위치', '세대', '특별공급', '주택형', '일정', '입주', '시공·시행']);
  const cols = CSS.match(/html\[data-page="citizen"\] \{[^}]*--pj-cols: ([^;]+);/)[1];
  assert.equal(tracks(cols).length, 9, cols);
  assert.match(CSS, /html\[data-page="citizen"\] \{[^}]*--pj-row-h: 44px;/);
  assert.match(fnBody('ahRow'), /<li><a class="ev" href="\$\{esc\(ahUrl\(x\[14\]\)\)\}" target="_blank" rel="noopener" title="\$\{esc\(full\)\}" aria-label="\$\{esc\(full\)\}">/);
  assert.match(WIDE, /\.pjs > li:has\(> \.ev:focus-visible\)::before \{[^}]*box-shadow: inset 0 0 0 var\(--border-w-on\) var\(--ring\);/, '초점 표시');
  assert.match(fnBody('ahRow'), /세대\$\{x\[1\] \? `<span class="pj-pc">\$\{pc\}%<\/span>` : ''\}/, '특별공급 세대 · 비율 같은 칸');
});
