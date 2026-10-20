'use strict';
// 2026-10-19 배색 '웜 뉴트럴 + 딥 잉크 + 클레이'(2026-10-18 안 2 코발트 대체)가 비지도 화면의 기본값이다.
// 공통 값은 globals 의 html[data-design="warm"] 블록(대시보드 루트 레이아웃·정적 /citizen 이 단다), /citizen 전용 값(--cz-*)은 html[data-page="citizen"] 블록이 갖는다.
// 지도(app/(map)/layout.tsx)도 2026-10-19 사용자 지시로 웜 범위(data-design="warm")를 단다(/citizen 전용 data-page 는 없음). ?pal 시안 처리 코드는 없다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tpl = read('tools/design/public-mock/template.html');
const css = read('app/globals.css');
const block = (sel) => (css.match(new RegExp(sel.replace(/[.[\]"]/g, '\\$&') + ' \\{([^}]*)\\}')) || [])[1] || '';

test('범위 속성은 html 태그에 직접(스크립트로 켜지 않는다): template = warm + citizen, 대시보드 레이아웃 = warm, 지도 레이아웃 = warm(citizen 없음)', () => {
  assert.match(tpl, /<html lang="ko" data-elev="raised" data-design="warm" data-page="citizen">/);
  assert.doesNotMatch(tpl, /dataset\.(page|design) = /);
  assert.doesNotMatch(tpl, /data-pal|pal-css|pal-warm|[?&]pal=/);
  assert.match(read('app/(dashboard)/layout.tsx'), /<html lang="ko" data-design="warm" suppressHydrationWarning>/);
  assert.match(read('app/(map)/layout.tsx'), /<html lang="ko" data-map-shell="" data-design="warm" suppressHydrationWarning>/, '지도도 웜 범위(2026-10-19 사용자 지시 — 지도 제외 결정 대체)');
  assert.doesNotMatch(read('app/(map)/layout.tsx'), /data-page|data-elev|dataset\.design/, '/citizen 전용 범위·입체 단계는 지도에 없다');
});

test('웜 공통 라이트·다크 값이 globals 의 warm 블록에 고정돼 있다', () => {
  const L = block('html[data-design="warm"]'), D = block('html.dark[data-design="warm"]');
  /* 2026-10-19 웜 뉴트럴 + 클레이 주색 · 반경 tile 8 */
  for (const v of ['--page-bg: #F4F3EF', '--background: #FCFCFA', '--card: #FCFCFA', '--popover: #FCFCFA', '--inset-bg: #FCFCFA', '--border: #DEDED6', '--foreground: #252C38', '--secondary-foreground: #252C38', '--muted-foreground: #6B635A', '--muted: #EAE8E1', '--secondary: #EEECE6', '--accent: #F1EEE8', '--pn2: #F1EEE8', '--line2: #CBC6BC', '--input: #CBC6BC', '--ink2: #434A55', '--mute: #716A60', '--chartbg: #F8F7F3', '--primary: #A64B35', '--ring: #A64B35', '--radius-tile: 8px']) assert.ok(L.includes(v), v);
  for (const v of ['--primary: #E38A6E', '--ring: #E38A6E', '--primary-foreground: #111111']) assert.ok(D.includes(v), v);
  for (const v of ['--page-bg: #141311', '--background: #1D1C19', '--card: #1D1C19', '--popover: #1D1C19', '--inset-bg: #262420', '--border: #3A3731', '--foreground: #F2EFE8', '--secondary-foreground: #F2EFE8', '--muted-foreground: #B8B0A4', '--muted: #2A2824', '--secondary: #2E2C27', '--accent: #2A2824', '--pn2: #2A2824', '--line2: #5E5950', '--input: #5E5950', '--ink2: #D6D0C6', '--mute: #A89F92', '--chartbg: #171614']) assert.ok(D.includes(v), v);   // 다크도 웜 뉴트럴(2026-10-19, 10-17 중립 검정 대체)
  /* 남색 리터럴 중립 글자 토큰은 웜 글자를 따른다(남색 글자가 섞이지 않게) */
  for (const v of ['--card-foreground: var(--foreground)', '--popover-foreground: var(--foreground)', '--accent-foreground: var(--foreground)', '--rb-ink: var(--foreground)', '--rb-cur: var(--foreground)', '--rb-hover: var(--foreground)', '--rb-yr-on: var(--foreground)', '--rb-axis: var(--mute)', '--rb-yr-off: var(--mute)', '--rb-acc: var(--primary)']) assert.ok(L.includes(v), v);
  /* 순서: raised → warm → citizen(같은 특이도라 뒤가 이긴다), 모두 내보내기 구간 안 */
  const ix = (s) => { const i = css.indexOf(s + ' {'); assert.ok(i >= 0, s); return i; };
  assert.ok(ix('html.dark[data-elev="raised"]') < ix('html[data-design="warm"]') && ix('html.dark[data-design="warm"]') < ix('html[data-page="citizen"]'));
  const { extractExport } = require('../../scripts/globals-export.js'), exp = extractExport(css);
  for (const s of ['html[data-design="warm"] {', 'html.dark[data-design="warm"] {', 'html[data-page="citizen"] {']) assert.ok(exp.includes(s), `${s} 는 @export 구간 안`);
});

test('/citizen 전용 값(--cz-*·표·순위 치수)은 citizen 블록에만 있고, 공통 면·글자 값은 거기서 다시 정하지 않는다', () => {
  const L = block('html[data-page="citizen"]'), D = block('html.dark[data-page="citizen"]');
  for (const v of ['--cz-accent: #A64B35', '--cz-summary-bg: #252C38', '--cz-summary-bg-2: #252C38', '--cz-summary-num: #FFF8ED', '--cz-summary-muted: #DFE1EC', '--cz-summary-line: #7D8189', '--cz-summary-panel: #333A45', '--cz-apply-bg: #F4E7DE', '--cz-apply-line: #E8D3C5', '--pj-row-h: 44px', '--pj-st-w: 80px', '--rank-row-h: 56px', '--cz-map-sel: #C75036', '--cz-dim-op: .45']) assert.ok(L.includes(v), v);
  for (const v of ['--cz-accent: #E38A6E', '--cz-summary-bg: #2A313E', '--cz-summary-bg-2: #2A313E', '--cz-summary-muted: #E0E1EB', '--cz-summary-line: #848994', '--cz-summary-panel: #3E4657', '--cz-apply-bg: #33261F', '--cz-apply-line: #4A3A33']) assert.ok(D.includes(v), v);
  for (const [n, b] of [['라이트', L], ['다크', D]]) assert.doesNotMatch(b, /--(page-bg|background|card|popover|inset-bg|border|foreground|muted-foreground|muted|secondary|accent|pn2|line2|input|ink2|mute|chartbg|primary|ring|radius-tile):/, `${n} citizen 블록에 공통 토큰 없음`);
  for (const sel of ['html[data-design="warm"]', 'html.dark[data-design="warm"]']) assert.doesNotMatch(block(sel), /--(cz|pj|rank)-/, `${sel} 에 /citizen 전용 토큰 없음`);
  assert.match(css, /html\[data-page="citizen"\] \.smry \{ --sf: var\(--cz-summary-bg\); background: linear-gradient\(135deg, var\(--cz-summary-bg\), var\(--cz-summary-bg-2\)\); border-color: var\(--cz-summary-bg\);/, '135° 선형, 테두리 = 시작 색');
});

test('.ap-card 는 --cz-apply-bg 바탕·--cz-apply-line 테두리(2026-10-19 살구색)', () => {
  assert.match(css, /html\[data-page="citizen"\] \.ap-card \{ background: var\(--cz-apply-bg\); border-color: var\(--cz-apply-line\); \}/);
});

test('/citizen 형태: 시도 = seg·단계 = line·현 위치 = ghost·공고 더 보기 = link, 시간 띠에 산호 덮기 없음, 부품이 globals 에 있다', () => {
  for (const c of ['.ui-tabs-seg', '.ui-tabs-line', '.ui-btn-link']) assert.ok(css.includes(c + ' {') || css.includes(c + ','), c);
  assert.match(tpl, /class="ui-tabs ui-tabs-seg" role="group" aria-label="시도로 보기"/);
  assert.match(tpl, /class="ui-tabs ui-tabs-line" role="group" aria-label="단계로 보기"/);
  assert.match(tpl, /class="ui-btn ui-btn-ghost gps"/);
  assert.equal((tpl.match(/ui-btn-link ui-btn-sm all/g) || []).length, 2);
  assert.doesNotMatch(css, /#tband \{[^}]*--cz-accent/);
});

test('지도 램프(안 2)는 :root·.dark 기본값이라 /map 개요와 /citizen 이 같이 쓴다(2026-10-18) — 웜·/citizen 블록은 덮지 않는다', () => {
  for (const v of ['--map-ov-1: #C9E7E1', '--map-ov-2: #84CBC3', '--map-ov-3: #2E9AA0', '--map-ov-4: #1D6A93', '--map-ov-5: #1F3B66', '--map-ov-ink-3: #0B1A33']) assert.match(css, new RegExp(`\\n:root \\{[^}]*${v}`), `:root ${v}`);
  for (const v of ['--map-ov-1: #BFE5DE', '--map-ov-2: #6FCDC2', '--map-ov-3: #1FA6AA', '--map-ov-4: #2378B6', '--map-ov-5: #4053A8']) assert.match(css, new RegExp(`\\n\\.dark \\{[^}]*${v}`), `.dark ${v}`);
  for (const sel of ['html[data-design="warm"]', 'html.dark[data-design="warm"]', 'html[data-page="citizen"]', 'html.dark[data-page="citizen"]']) assert.doesNotMatch(block(sel), /--map-ov-/, `${sel} 에 지도 램프 없음`);
});

test(':root 주색은 그대로다(기본값 남색 — 지도·비지도 화면은 웜 범위가 클레이로 덮는다)', () => {
  assert.match(css, /:root \{[^}]*--primary: #23466D/);
  assert.match(css, /\n\.dark \{[^}]*--primary: #9DBCE9/);
});
