'use strict';
// 지도 화면 배색·표시 개선(DESIGN.md Colors > 지도 색 · 화면별 규칙 > 지도)을 정적으로 고정한다.
// 색은 대시보드 토큰(app/globals.css)과 한 곳에서 맞추고, 숨긴 구역·무늬 해상도·모바일 머리 줄 같은 표시 결함이 되살아나지 않게 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const css = read('assets/css/app.css'), app = read('assets/js/app.js'), tw = read('app/globals.css');
const twLight = tw.slice(tw.indexOf('\n:root {'), tw.indexOf('\n}\n', tw.indexOf('\n:root {')));
const { mapVars } = require('./map-tokens.cjs');   // 지도 변수의 실제 값(별칭을 app/globals.css 까지 따라간다, 2026-10-18)
const twVar = (n) => { const m = new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`).exec(twLight); assert.ok(m, `--${n}`); return m[1].toUpperCase(); };
const { mapTheme } = require('./map-js-theme.cjs');   // 지도 칠하기 색표(app.js buildTheme)를 테마별 실제 값으로(2026-10-18)

test('Next 지도의 강조색은 대시보드 주색이고, 6단계 색은 대시보드 토큰(--st-*-ink)을 가리킨다', () => {
  const shell = /html\[data-map-shell\]\{([^}]*)\}/.exec(css);
  assert.ok(shell, 'html[data-map-shell] 공통 규칙');
  assert.match(shell[1], /--acc:var\(--primary\)/);
  assert.match(shell[1], /--acc-ink:var\(--primary-foreground\)/);
  for (const k of ['sale', 'build', 'soon', 'move', 'plan', 'permit', 'priv']) assert.match(shell[1], new RegExp(`--${k}:var\\(--st-${k}-ink\\)`), k);
  const light = /html\[data-map-shell\]:not\(\.dark\)\{([^}]*)\}/.exec(css)[1];
  assert.doesNotMatch(light, /--(acc|sale|build|soon|move|plan|permit|priv):/, '라이트 덮어쓰기에 단계색·강조색을 따로 두지 않는다');
  assert.equal(mapVars({ theme: 'light' })['--warn'].toUpperCase(), twVar('warn'), '라이트 지도 주의색 = 대시보드 --warn');
});

test('지도 스크립트는 단계색을 CSS 토큰(--st-*-ink)으로 읽고, 라이트 3D 동 색의 높은 층 끝은 차트 면 색(--st-*)이다', () => {
  // 2026-10-18: 지도 칠하기 색은 모두 토큰(buildTheme). 테마 전환 때 readTheme 이 다시 읽는다
  assert.match(app, /color\[k\] = tok\(`--st-\$\{TOKEN\[k\] \|\| k\}-ink`\)/);
  assert.match(app, /tok\(light \? `--st-\$\{k\}` : `--st-\$\{k\}-ink`\)/);
  assert.match(app, /readTheme\(\);   \/\/ 클래스가 바뀐 뒤라 새 테마의 토큰 값을 읽는다/);
  assert.doesNotMatch(app, /LIGHT_COLOR|LIGHT_THEME|applyStageInk/, '라이트 색 사본을 따로 두지 않는다');
  const tone = mapTheme('light').tone;
  for (const [k, st] of [['sale', 'sale'], ['build', 'build'], ['near', 'build'], ['soon', 'soon'], ['move', 'move'], ['plan', 'plan'], ['permit', 'permit'], ['priv', 'priv']]) {
    assert.match(tone[k][0], /^#[0-9A-Fa-f]{6}$/, `tone.${k} 낮은 층 끝`);
    assert.equal(tone[k][1].toUpperCase(), twVar(`st-${st}`), `tone.${k} 높은 층 끝 = --st-${st}`);
  }
});

test("`?base=vworld` 일 때 라이트 배경은 V-World 백지도('white'): 장소 글자가 그림에 박히지 않아 기울여도 번지지 않고 벡터 지명과 겹치지 않는다", () => {
  const L = mapTheme('light');
  assert.deepEqual([L.vw, L.ofm, L.raster], ['white', 'liberty', { 'raster-saturation': -0.35, 'raster-contrast': -0.05 }], '백지도의 공원 무늬는 채도로 누르고, 대비는 조금만 낮춘다(−0.12 는 뭉개져 보였다: 같은 화면 가장자리 선명도 15.71→16.43, 2026-10-10 계획서 14절 T4)');
  assert.match(app, /\{ id: 'vworld', type: 'raster', source: 'vworld', paint: TH\(\)\.raster \|\| \{\} \}/);
  /* 라이트 지도 글자·후광·보조 글자는 대시보드 라이트 토큰(--foreground·--background·--map-mute) 값이다(2026-10-09 다크 값으로 그려진 결함의 재발 방지) */
  assert.deepEqual([L.text, L.halo, L.sub].map((v) => v.toUpperCase()), ['#172B4D', '#FFFFFF', '#526176']);
});

test('블록 면은 무늬 없이 현재 단계색 단색이다(2026-10-15 요구 5: 무늬는 멀리서 옅어져 단계가 안 보였다 — tests/js/map-stage-view.test.cjs)', () => {
  assert.doesNotMatch(app, /patternImage|'fill-pattern'|PAT_OP/);
  for (const id of ['blk-sale', 'blk-build', 'blk-soon', 'blk-move', 'blk-plan']) assert.match(app, new RegExp(`add\\(\\{ id: '${id}', type: 'fill', [^\\n]*'fill-color': kindExpr\\(T\\.color\\), 'fill-opacity': areaOp\\(\\)`), id);
});

test('숨긴 패널 구역은 실제로 숨는다(.sec 의 display:flex 가 hidden 을 덮지 않게). 오른쪽 점 레일·쪽수 표시는 없다(2026-10-13)', () => {
  assert.match(css, /\.sec\[hidden\]\{display:none\}/);
  assert.match(app, /\$\('#h-next'\)\.parentElement\.hidden = !rows\.length;/);
  assert.match(app, /\$\('#h-tl'\)\.closest\('section'\)\.hidden = !items\.length;/);
  const html = read('index.html');
  assert.doesNotMatch(html + app + css, /prail|pcur/);
});

test('패널 그림(합계 막대·입주 타임라인·기반시설 타임라인)은 고정 다크 색 대신 테마 변수를 쓴다', () => {
  for (const bad of ['fill="#9AA8D6"', 'stroke="#3A4C8C"', "'#0A1030' : INK", 'fill="#FFD66E"', '#7BA7FF 0 4px,#0A1030']) assert.ok(!app.includes(bad), bad);
  assert.match(app, /const INK = \{ move: 'var\(--mute\)', edu: 'var\(--edu\)', transit: 'var\(--ink\)' \}/);
});

test('떠 있는 상자의 그림자는 테마 변수다: 다크는 짙게, 라이트는 남색으로 옅게', () => {
  assert.doesNotMatch(css.replace(/:root\{[^}]*\}/, ''), /box-shadow:0 10px 26px rgba\(0,0,0,\.42\)/);
  for (const v of ['--hud-shadow', '--tag-shadow', '--sheet-shadow', '--stuck-shadow']) {
    assert.match(css, new RegExp(`${v}:var\\(--map-${v.slice(2)}\\)`), `${v} 는 테마 변수(app/globals.css 의 --map-*)`);
    assert.match(mapVars({ theme: 'dark' })[v], /^0 [^;]*rgba\(0,0,0,/, `${v} 다크 값`);
    assert.match(mapVars({ theme: 'light' })[v], /^0 [^;]*rgba\(15,23,42,/, `${v} 라이트 값`);
  }
});

test('축척·출처 컨트롤은 라이브러리 기본 흰 상자 대신 지도 유리와 같은 바탕·글자를 쓴다', () => {
  assert.match(css, /\.maplibregl-ctrl\.maplibregl-ctrl-scale\{background:var\(--glass-sum\);border-color:var\(--ink2\);color:var\(--ink\)/);
  assert.match(css, /\.maplibregl-ctrl\.maplibregl-ctrl-attrib\{background:var\(--glass-sum\)/);
});

test('900px 이하에서 지도 머리 줄과 지도는 상단 메뉴 바 높이만큼 내려온다(첫 줄이 메뉴 바에 가려 누를 수 없던 문제)', () => {
  const m = /@media \(max-width:900px\)\{\n  \.shell-map\{--nav-h:49px\}\n  \.shell-map \.mhead\{top:var\(--nav-h\)\}\n  \.shell-map \.mapwrap\{top:calc\(var\(--nav-h\) \+ var\(--mh\)\)\}\n\}/.exec(css);
  assert.ok(m, '.shell-map 모바일 머리 줄 내림 규칙');
  assert.match(read('components/TopNav.tsx'), /mobile:h-12/, '메뉴 바 높이(48px + 아래 선 1px)와 --nav-h 가 맞아야 한다');
});

test('지도 ①~⑥ 색 = 화면(종합상황판 리본·사업·지역 공급)의 같은 번호 색 변수', () => {
  const sample = read('lib/board/sample.ts');
  const ribbon = [...(/export const C = \[([^\]]*)\]/.exec(sample)[1]).matchAll(/var\(--st-(\w+)\)/g)].map((x) => x[1]);
  assert.deepEqual(ribbon, ['plan', 'permit', 'build', 'sale', 'soon', 'move'], '리본 ①~⑥ 변수');
  const stageKind = /const STAGE_KIND = \[([^\]]*)\]/.exec(app)[1].match(/'(\w+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(stageKind, ribbon, '지도 ①~⑥ 칸 색 종류 = 리본 변수 이름');
  assert.match(app, /const TOKEN = \{ near: 'build' \}/, '준공 임박은 ③착공 안의 상태라 ③ 색');
  const KIND = Object.fromEntries([...(/const KIND = \{([^}]*)\}/.exec(app)[1]).matchAll(/'([^']+)': '(\w+)'/g)].map((x) => [x[1], x[2]]));
  assert.deepEqual(KIND, { '분양중': 'sale', '건설 단계': 'build', '준공 임박': 'near', '입주 단계': 'soon', '계획': 'permit', '사업화': 'plan' }, '단지 상태 → 색 종류(①사업화 ②계획 ③건설·임박 ④분양중 ⑤입주 단계)');
  // 다크 지도의 단계색 = 다크 --st-*-ink(2026-10-18: 리터럴 대체값 없이 토큰에서 읽는다)
  const twDark = tw.slice(tw.indexOf('\n.dark'));
  const darkInk = (n) => new RegExp(`--st-${n}-ink:\\s*(#[0-9A-Fa-f]{6})`).exec(twDark)[1].toUpperCase();
  const COLOR = Object.fromEntries(Object.entries(mapTheme('dark').color).map(([k, v]) => [k, v.toUpperCase()]));
  for (const k of ['plan', 'permit', 'build', 'sale', 'soon', 'move', 'priv']) assert.equal(COLOR[k], darkInk(k), `COLOR.${k} = 다크 --st-${k}-ink`);
  assert.equal(COLOR.near, COLOR.build);
});
