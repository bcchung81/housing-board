'use strict';
// 비지도 화면 웜 범위(html[data-design="warm"], 2026-10-19): 실제 면 위 대비, 인쇄 규칙, 지도에 번지지 않음.
// 값은 globals 를 겹쳐 푼다 — 라이트 = warm → :root, 다크 = warm 다크 → warm → .dark → :root(var() 는 같은 순서로 다시 푼다).
// 대비 계산은 tests/js/contrast.cjs(tailwind.test.cjs 와 같은 식).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ratio } = require('./contrast.cjs');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const css = read('app/globals.css');
const block = (sel) => { const i = css.indexOf(`\n${sel} {`); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('\n}\n', i)); };
const CHAIN = {
  라이트: [block('html[data-design="warm"]:not(.dark)'), block('html[data-design="warm"]'), block(':root')],
  다크: [block('html.dark[data-design="warm"]'), block('html[data-design="warm"]'), block('.dark'), block(':root')],
};
const resolve = (chain, n, depth = 0) => {
  assert.ok(depth < 8, `--${n} var() 순환`);
  for (const b of chain) {
    const m = new RegExp(`--${n}:\\s*([^;]+);`).exec(b);
    if (!m) continue;
    const v = m[1].trim(), r = /^var\(--([\w-]+)\)$/.exec(v);
    return r ? resolve(chain, r[1], depth + 1) : v.toUpperCase();
  }
  assert.fail(`--${n} 없음`);
};

const SURFACES = ['card', 'page-bg', 'muted', 'accent', 'inset-bg', 'secondary'];
const STAGES = ['plan', 'permit', 'build', 'sale', 'soon', 'move', 'priv'];
const TEXT = ['foreground', 'muted-foreground', 'primary', ...STAGES.map((s) => `st-${s}-ink`), 'ok', 'warn', 'bad'];
test('웜 범위 글자 토큰은 실제 면(카드·바탕·보조 면·선택 면·안쪽 면) 위 4.5:1 이상(라이트·다크)', () => {
  for (const [nm, chain] of Object.entries(CHAIN)) {
    const v = (n) => resolve(chain, n);
    for (const fg of TEXT) for (const bg of SURFACES) {
      const key = `${nm} --${fg} / --${bg}`;
      const r = ratio(v(fg), v(bg)); assert.ok(r >= 4.5, `${key}: ${r.toFixed(2)}`);
    }
    /* 채움 단추 글자, 차트 축·안 고른 해 글자(리본 --rb-axis·--rb-yr-off = --mute) */
    assert.ok(ratio(v('primary-foreground'), v('primary')) >= 4.5, `${nm} 채움 단추 글자`);
    for (const fg of ['mute', 'rb-axis', 'rb-yr-off', 'rb-ink']) for (const bg of ['card', 'chartbg']) { const r = ratio(v(fg), v(bg)); assert.ok(r >= 4.5, `${nm} --${fg} / --${bg}: ${r.toFixed(2)}`); }
  }
});

test('웜 범위 6단계 면(--st-*)은 차트 바탕 위 3:1, 초점 고리(--ring)는 카드 위 3:1 이상', () => {
  for (const [nm, chain] of Object.entries(CHAIN)) {
    const v = (n) => resolve(chain, n);
    for (const s of STAGES) {
      const key = `${nm} --st-${s} / --chartbg`;
      const r = ratio(v(`st-${s}`), v('chartbg')); assert.ok(r >= 3, `${key}: ${r.toFixed(2)}`);
    }
    for (const bg of ['card', 'page-bg', 'inset-bg']) { const r = ratio(v('ring'), v(bg)); assert.ok(r >= 3, `${nm} --ring / --${bg}: ${r.toFixed(2)}`); }
  }
});

test('웜 라이트 의미색 덮기는 다크(:not(.dark))에 닿지 않고, 단계 면·글자 쌍은 색상각을 지킨다', () => {
  const b = block('html[data-design="warm"]:not(.dark)');
  assert.deepEqual([...b.matchAll(/\n\s*--([\w-]+):/g)].map((m) => m[1]).sort(), ['bad', 'ok', 'rb-hud', 'st-permit-ink', 'st-priv']);
  for (const sel of ['html[data-design="warm"]', 'html.dark[data-design="warm"]']) assert.doesNotMatch(block(sel), /--(ok|bad|st-priv|st-permit-ink):/, sel);
});

test('웜 범위 HUD 판(--rb-hud)은 딥 잉크 반투명이고 가장 밝은 뒤(흰색) 위에서도 흰 글자 5.5:1 이상', () => {
  const m = /--rb-hud: rgb\((\d+) (\d+) (\d+) \/ (\d+)%\);/.exec(block('html[data-design="warm"]:not(.dark)')); assert.ok(m, '--rb-hud');
  assert.deepEqual([+m[1], +m[2], +m[3]], [37, 44, 56], '딥 잉크 #252C38');
  const a = +m[4] / 100, bg = '#' + [m[1], m[2], m[3]].map((x) => Math.round(+x * a + 255 * (1 - a)).toString(16).padStart(2, '0')).join('');
  assert.ok(ratio('#FFFFFF', bg) >= 5.5, `HUD ${ratio('#FFFFFF', bg).toFixed(2)}`);
});

test('웜 라이트 그림자: 남색 rgb(15 23 42) 없이 웜 색, /citizen raised 는 두 겹을 유지한 채 같은 웜 색, 다크 그림자는 그대로', () => {
  const warm = block('html[data-design="warm"]:not(.dark):not([data-elev="raised"])'), raised = block('html[data-elev="raised"]');
  for (const n of ['shadow-card', 'shadow-pop', 'shadow-hud', 'shadow-hover', 'shadow-hover-soft']) assert.match(warm, new RegExp(`--${n}: [^;]*rgb\\(44 36 26 /`), n);
  assert.doesNotMatch(warm + raised, /15 23 42/);
  assert.match(raised, /--shadow-card: 0 1px 2px rgb\(44 36 26 \/ 6%\), 0 4px 12px rgb\(44 36 26 \/ 6%\);/);
  assert.match(raised, /--shadow-hover: 0 2px 4px rgb\(44 36 26 \/ 8%\), 0 10px 24px rgb\(44 36 26 \/ 12%\);/);
  assert.doesNotMatch(block('html.dark[data-design="warm"]'), /--shadow-/);
  assert.match(block('.dark'), /--shadow-card: inset 0 1px 0 rgb\(255 255 255 \/ 4%\);/);
});

test('의미색(단계·판정·시행주체·지연율·차트·지도)은 웜 범위가 덮지 않는다', () => {
  for (const sel of ['html[data-design="warm"]', 'html.dark[data-design="warm"]']) {
    assert.doesNotMatch(block(sel), /\n\s*--(st-[\w-]+|ok|warn|bad|destructive|actor-[\w-]+|region-\d|chart-\d|map-[\w-]+|ramp-[\w-]+|out|out-line|real-bg):/, sel);
  }
});

test('인쇄: 대시보드는 인쇄 직전 다크를 풀고(대시보드 레이아웃 전용 스크립트, 공유 THEME_INIT 는 그대로), 웜 범위 바탕·카드·안쪽 면은 흰색·그림자 없음', () => {
  const dash = read('app/(dashboard)/layout.tsx');
  assert.match(dash, /addEventListener\('beforeprint',function\(\)\{d=c\.contains\('dark'\);c\.remove\('dark'\)\}\);addEventListener\('afterprint',function\(\)\{if\(d\)c\.add\('dark'\)\}\)/);
  assert.match(dash, /<script dangerouslySetInnerHTML=\{\{ __html: PRINT_LIGHT \}\} \/>/);
  assert.doesNotMatch(read('lib/shell/theme.ts'), /print/, 'THEME_INIT·AUDIENCE_INIT 은 인쇄를 모른다(지도까지 퍼지지 않게)');
  assert.doesNotMatch(read('app/(map)/layout.tsx'), /beforeprint|PRINT_LIGHT/);
  const m = /@media print \{\n  html\[data-design="warm"\] \{([^}]*)\}/.exec(css); assert.ok(m, '@media print 웜 범위 규칙');
  for (const n of ['page-bg', 'background', 'card', 'popover', 'inset-bg']) assert.match(m[1], new RegExp(`--${n}: #FFFFFF;`), n);
  for (const n of ['shadow-card', 'shadow-pop']) assert.match(m[1], new RegExp(`--${n}: none;`), n);
  assert.ok(css.indexOf('@media print {\n  html[data-design="warm"]') > css.indexOf('\nhtml.dark[data-design="warm"] {'), '인쇄 규칙이 웜 블록보다 뒤(같은 특이도라 이긴다)');
});

/* 2026-10-19 사용자 지시(지도 제외 결정 대체): /map 도 웜 범위 + 지도 전용 웜 덮기(html[data-map-shell][data-design="warm"]). /citizen 내장 지도(data-map-shell 없음)의 --map-* 는 그대로 */
test('지도 전용 웜 덮기: /map 에만 걸리고(/citizen 내장 지도 값 그대로·내보내기 구간 밖), 다크 블록이 같은 이름을 모두 다시 정하며, 자료색은 덮지 않는다', () => {
  const { mapVars } = require('./map-tokens.cjs');
  const { extractExport } = require('../../scripts/globals-export.js');
  const L = block('html[data-map-shell][data-design="warm"]'), D = block('html.dark[data-map-shell][data-design="warm"]');
  const names = (b) => [...b.matchAll(/\n\s*(--[\w-]+):/g)].map((m) => m[1]);
  assert.ok(names(L).length >= 30, '지도 중립 토큰을 덮는다');
  for (const n of names(L)) if (n !== '--mute') assert.ok(names(D).includes(n), `${n}: 라이트 블록은 다크에도 걸리므로 다크 블록이 다시 정한다`);
  for (const b of [L, D]) assert.doesNotMatch(b, /\n\s*--(map-ov-[\w-]+|map-sel|map-shade|map-ctx|map-sido-[\w-]+|map-edge-[\w-]+|map-dim-mix|ramp-[\w-]+|st-[\w-]+|ok|warn|bad|map-warn|map-edu|map-power|map-transit|map-fac-[\w-]+|map-bus-[\w-]+|map-ramp-[\w-]+|map-flat|map-ghost-[\w-]+|map-tone-[\w-]+|map-other[\w-]*|map-[\w-]+-ink|map-late-bad|map-pop-(plan|permit|edu|power)):/, '자료·판정·시설·교통·개요 판 색은 그대로');
  assert.doesNotMatch(extractExport(css), /\n\s*html(\.dark)?\[data-map-shell\]\[data-design="warm"\] \{/, '지도 덮기는 /citizen 빌드(내보내기 구간)에 들어가지 않는다');
  /* /citizen 문서(warm + citizen + raised, data-map-shell 없음)에서 풀린 --map-* = :root·.dark 의 값 */
  for (const theme of ['light', 'dark']) {
    const every = (sel) => css.split(`\n${sel} {`).slice(1).map((x) => x.slice(0, x.indexOf('\n}\n'))).join('\n');   // 그 선택자의 최상위 블록 전부(팔레트·지도 전용 둘)
    const C = mapVars({ theme, citizen: true }), M = mapVars({ theme }), base = [theme === 'dark' ? every('.dark') : '', every(':root')];
    for (const n of names(L).filter((x) => x.startsWith('--map-'))) {
      const own = base.map((b) => new RegExp(`\\n\\s*${n}:\\s*([^;]+);`).exec(b)).find(Boolean);
      assert.ok(own, `${n} 기본값`);
      assert.equal(C[n], own[1].trim().replace(/var\(--primary\)/, C['--primary']), `/citizen ${theme} ${n} 그대로`);
    }
    for (const n of ['--map-shade', '--map-ctx', '--map-ov-0', '--map-ov-3', '--map-ov-line', '--map-sido-line', '--map-ov-ink-0']) assert.equal(M[n], C[n], `/map 개요 판 ${n} = /citizen 지도 무대`);
    assert.equal(M['--ov-bg'], C['--card'], `/map 개요 판 바탕 = /citizen 지도 무대(카드) 면 (${theme})`);
  }
});
