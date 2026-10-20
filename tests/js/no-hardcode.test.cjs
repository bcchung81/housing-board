'use strict';
// 하드코딩 금지(2026-10-18 2라운드, 규칙 DESIGN.md):
// 모든 시각 값(색·글꼴·글자 크기·줄 높이·자간·반경·테두리·그림자·카드 여백)은 app/globals.css 한 곳에서 정의하고, 화면은 토큰 이름이 붙은 유틸리티·부품만 쓴다.
// 아직 2단계(ⓐ~ⓔ)가 남은 파일은 허용 목록(파일 → [남은 개수, 담당 단계])으로 받되 래칫이다: 늘면 실패, 줄면 '목록을 줄이라' 실패 — 고친 단계가 자기 줄을 낮추거나 지운다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { extractExport } = require('../../scripts/globals-export.js');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noBlock = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
/* 주석은 검사에서 뺀다(설명 글에는 옛 값을 적어 둘 수 있다) */
const code = (s) => noBlock(s).split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (rel === 'app/api') continue;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

/* ── 허용 목록(시작: 2026-10-18 1단계 직후 실측) ── */
const ALLOW_TSX = {
};
/* 지도 CSS: font-size(·font 줄임)·border-radius 값 중 var()·inherit·0 밖의 리터럴 */
const ALLOW_MAP_CSS = {};
/* /citizen 원본 템플릿의 <style>: 색 리터럴, font-size px, radius px */
const ALLOW_CITIZEN = {};   /* ⓓ 2026-10-18: 0 (토큰은 build.js 가 globals 내보내기 층을 넣어 준다) */

/* 래칫: 늘면 그 자리 목록과 함께 실패, 줄면 허용 개수를 낮추라는 실패 */
function ratchet(hits, allow, where) {
  const over = [], under = [];
  for (const k of new Set([...Object.keys(hits), ...Object.keys(allow)])) {
    const n = hits[k]?.length ?? 0, [a = 0, step = ''] = allow[k] ?? [];
    if (n > a) over.push(`${k}: 허용 ${a} 인데 ${n}${step ? ` (${step})` : ''}\n    ${hits[k].slice(0, 12).join('\n    ')}`);
    else if (n < a) under.push(`${k}: 허용 ${a} → 지금 ${n} — ${where} 의 허용 개수를 ${n} 으로 줄이라(0 이면 줄을 지운다)`);
  }
  assert.deepEqual(over, [], '하드코딩이 늘었다 — globals.css 토큰·유틸리티로 바꾼다');
  assert.deepEqual(under, [], '목록을 줄이라');
}

/* TSX·TS 클래스와 코드 문자열·style 안의 임의값·색 리터럴. 레이아웃 치수(w-[..]·grid-cols-[..]·min-h-[..]·위치)는 대상이 아니다 */
const TSX_RULES = [
  ['text-[..]', /\btext-\[/g],
  ['text-(..)(--fs-* 밖)', /\btext-\((?!length:--fs-[\w-]+\))/g],
  ['rounded-[..]', /\brounded(?:-[a-z]{1,2})?-\[/g],
  ['leading-[..]', /\bleading-\[/g],
  ['tracking-[..]', /\btracking-\[/g],
  ['shadow-[..]', /\bshadow-\[/g],
  ['border-[Npx]', /\bborder(?:-[a-z]{1,2})?-\[\d/g],
  ['p-[..]', /(?<![\w-])p[trblxyse]?-\[/g],
  ['#hex', /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g],
  ['rgb()·hsl()', /\b(?:rgba?|hsla?|oklch|oklab)\(/g],
];
function tsxHits() {
  const out = {};
  for (const f of [...walk('app'), ...walk('components')]) {
    const lines = code(read(f)).split('\n');
    lines.forEach((l, i) => { for (const [name, re] of TSX_RULES) for (const m of l.matchAll(re)) (out[f] ??= []).push(`${i + 1}: ${name} · ${l.slice(Math.max(0, m.index - 30), m.index + 50).trim()}`); });
  }
  return out;
}

test('TSX(app·components, api 제외): text-·rounded-·leading-·tracking-·shadow-·border-·p-[..] 임의값과 색 리터럴(#hex·rgb()) 0 — 남은 파일은 허용 목록(래칫)', () => {
  ratchet(tsxHits(), ALLOW_TSX, 'ALLOW_TSX');
});

test('1단계에서 바꾼 공용 부품(components/ui/*, components/ 최상위)은 허용 목록에 없고 0 이다', () => {
  const step1 = [...walk('components/ui'), ...fs.readdirSync(path.join(ROOT, 'components')).filter((n) => /\.tsx?$/.test(n)).map((n) => `components/${n}`)];
  assert.ok(step1.includes('components/ui/card.tsx') && step1.includes('components/TopNav.tsx'));
  const hits = tsxHits();
  for (const f of step1) {
    assert.equal(ALLOW_TSX[f], undefined, `${f} 는 허용 목록에 넣지 않는다`);
    assert.deepEqual(hits[f] ?? [], [], f);
  }
});

/* 종합상황판(2026-10-19 사용자 피드백): 고른 것·연결 패널을 두꺼운 외곽선·고리로 그리지 않는다 — 상태 표시는 globals 부품(.ui-dir·.ui-pick·.ui-press·.ui-region·.ui-linked).
   Board·RealPanels·styles 에 box-shadow·outline 임의값 0, 외곽선 유틸리티는 키보드 초점(focus-visible:)만, 시도 타일 면은 부품 .ui-region(bg-[var(--rc)] 없음) */
test('종합상황판 TSX(Board·RealPanels·styles): box-shadow·outline 임의값 0 · 외곽선은 focus-visible 만 · 고른 것 aria-pressed 임의값 0', () => {
  const bad = [];
  for (const f of ['components/board/Board.tsx', 'components/board/RealPanels.tsx', 'components/board/styles.ts']) {
    code(read(f)).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/\[(?:box-shadow|outline(?:-offset)?):|\b(?:shadow|outline(?:-offset)?)-[[(]|aria-pressed:\[|bg-\[var\(--rc\)\]|\bis-ringed\b/g)) bad.push(`${f}:${i + 1} ${m[0]}`);
      for (const m of l.matchAll(/(\S*)\boutline-(?:\d|offset|primary|ring|solid)/g)) if (!/focus-visible:$/.test(m[1])) bad.push(`${f}:${i + 1} ${m[0]}`);
    });
  }
  assert.deepEqual(bad, []);
  const css = read('app/globals.css');
  for (const c of ['ui-dir', 'ui-dir-face', 'ui-dir-cell', 'ui-pick', 'ui-press', 'ui-region', 'ui-linked', 'ui-focus-scope']) assert.match(css, new RegExp(`\\.${c}[\\s,:\\[{]`), c);
  assert.match(css, /--shadow-linked: 0 2px 12px color-mix\(in oklab, var\(--primary\) var\(--linked-glow\), transparent\);/, '연결 그림자는 오프셋·흐림이 있는 옅은 주색(0 오프셋 후광 아님)');
});

const literal = (v) => v.replace(/var\((?:[^()]|\([^()]*\))*\)/g, ' ').replace(/!important/g, ' ').split(/[\s,/]+/).filter(Boolean).some((t) => !/^(inherit|0)$/.test(t));
test('지도 CSS(assets/css/app.css): font-size·border-radius 는 var()·inherit·0 만(남은 리터럴은 허용 목록 ⓔ)', () => {
  const css = noBlock(read('assets/css/app.css'));
  const hits = { 'font-size': [], 'border-radius': [] };
  for (const m of css.matchAll(/(?<![\w-])(font-size|font|border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g)) {
    if (m[1] === 'font') { if (/\d(?:\.\d+)?(px|r?em)\b/.test(m[2])) hits['font-size'].push(`${m[1]}:${m[2]}`); }
    else if (literal(m[2])) hits[m[1] === 'font-size' ? 'font-size' : 'border-radius'].push(`${m[1]}:${m[2]}`);
  }
  ratchet(hits, ALLOW_MAP_CSS, 'ALLOW_MAP_CSS');
});

test('3D 지도 공용 모양(assets/css/map3d.css — /map 개요·/citizen): 색 리터럴 0, font-size·radius 는 var() 만', () => {
  const st = noBlock(read('assets/css/map3d.css'));
  assert.deepEqual([...st.matchAll(/(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/g)].map((m) => m[0]), []);
  const bad = [...st.matchAll(/(?<![\w-])(font-size|font|border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g)].filter((m) => (m[1] === 'font' ? /\d(?:\.\d+)?(px|r?em)\b/.test(m[2]) : literal(m[2]))).map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(bad, []);
});

test('/citizen 원본(tools/design/public-mock/template.html)의 <style>: 색 리터럴·font-size px·radius px 0(남은 것은 허용 목록 ⓓ)', () => {
  const st = noBlock([...read('tools/design/public-mock/template.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'));
  const hits = {
    color: [...st.matchAll(/(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/g)].map((m) => m[0]),
    'font-size': [], 'border-radius': [],
  };
  for (const m of st.matchAll(/(?<![\w-])(font-size|border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g)) if (/\d(?:\.\d+)?px/.test(m[2])) hits[m[1] === 'font-size' ? 'font-size' : 'border-radius'].push(`${m[1]}:${m[2]}`);
  ratchet(hits, ALLOW_CITIZEN, 'ALLOW_CITIZEN');
});

/* 지도 스크립트(assets/js/*.js, ⓕ 2026-10-18): 색 리터럴(#hex·rgb()·hsl())은 이름 붙은 표(const) 안에만 — 지도 색은 모두 globals 토큰(buildTheme 이 읽는다)이고, 표에 남는 것은 테마와 상관없는 렌더 상수. 표 밖은 0, 표 안 개수는 래칫(늘면 실패, 줄면 '목록을 줄이라'). 지도 칠하기 색은 buildTheme 이 토큰 이름으로 읽는다 */
const ALLOW_MAP_JS = {
  'assets/js/app.js RENDER': [3, '렌더 상수: 해의 흰빛·기존 건물 그림자·접지 음영(검정 + 투명도)'],
  'assets/js/bus.js GLASS_COLOR': [6, '렌더 상수: 3D 버스 모형(창·운전석·지붕·설비·범퍼·바퀴)'],
  'assets/js/map3d.js PIX': [3, '렌더 상수: 화면에 그리지 않는 화소 판 칠(면 번호·가리는 옆벽·맥락 면 자리) — 면 색은 map3d.css 토큰'],
};
const COLOR_RE = /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/g;
/* `const 이름 = …;` 문의 범위: 괄호 깊이 0 의 ';' 까지(따옴표 안은 건너뛴다). 리터럴은 그것을 감싼 가장 안쪽 const 의 이름으로 센다 */
function constSpans(src) {
  const out = [];
  for (const m of src.matchAll(/(?<![\w$.])const (\w+) = /g)) {
    let i = m.index + m[0].length, d = 0, q = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if ('([{'.includes(c)) d++;
      else if (')]}'.includes(c)) { if (--d < 0) break; }
      else if (c === ';' && d === 0) break;
    }
    out.push([m[1], m.index, i]);
  }
  return out;
}
function mapJsHits() {
  const out = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'assets/js')).filter((n) => /\.js$/.test(n))) {
    const rel = `assets/js/${f}`, src = code(read(rel)), spans = constSpans(src);
    for (const m of src.matchAll(COLOR_RE)) {
      const own = spans.filter(([, a, b]) => a < m.index && m.index < b).sort((x, y) => y[1] - x[1])[0];
      (out[`${rel} ${own ? own[0] : '(표 밖)'}`] ??= []).push(src.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, ' '));
    }
  }
  return out;
}

test('지도 스크립트(assets/js): 색 리터럴은 이름 붙은 표(렌더 상수)에만 — 표 밖 0, 표 안은 래칫', () => {
  ratchet(mapJsHits(), ALLOW_MAP_JS, 'ALLOW_MAP_JS');
});

test('지도 색 토큰(buildTheme 이 읽는 --map-*): 두 테마 모두 globals 에 값이 있다', () => {
  const { mapVars } = require('./map-tokens.cjs');
  const { themeTokens } = require('./map-js-theme.cjs');
  const missing = [];
  for (const theme of ['dark', 'light']) {
    mapVars({ theme });
    for (const [n, v] of themeTokens(theme)) if (!v) missing.push(`${n}(${theme}): 값 없음 — app/globals.css 의 지도 구역에 더한다`);
  }
  assert.deepEqual(missing, []);
});

/* ── 내보내기 층(정적 /citizen 이 그대로 넣는 순수 CSS) ── */
const GLOBALS = read('app/globals.css');
const EXPORT = extractExport(GLOBALS);
const UI = ['ui-card', 'ui-tile', 'ui-tile-compact', 'ui-inset', 'ui-row', 'ui-h1', 'ui-h2', 'ui-h3', 'ui-meta', 'ui-caption', 'ui-kpi', 'ui-chip', 'ui-btn', 'ui-btn-secondary', 'ui-btn-outline', 'ui-btn-ghost', 'ui-btn-sm', 'ui-btn-icon', 'ui-truncate', 'ui-card-head', 'ui-hud'];

test('내보내기 층은 Tailwind 지시어가 없는 순수 CSS 이고 node scripts/globals-export.js 가 같은 글을 낸다', () => {
  assert.doesNotMatch(EXPORT, /@apply|@theme|@custom-variant|@utility|@variant|@tailwind|@import|@source|@slot|\btheme\(|--theme\(/);
  assert.ok(GLOBALS.split('/* @export start */').length >= 3, '구간 둘 이상(토큰 · 부품)');
  assert.equal(execFileSync(process.execPath, [path.join(ROOT, 'scripts/globals-export.js')], { encoding: 'utf8' }), EXPORT);
  assert.throws(() => extractExport('a{}'), /구간이 없다/);
  assert.equal(extractExport('x/* @export start */a{}/* @export end */y/* @export start */b{}/* @export end */'), 'a{}\n\nb{}\n');
});

test('내보내기 층에 정적 화면이 쓸 토큰이 모두 있다: 팔레트(:root·.dark·관점별), 8단계 글자, 글꼴, 역할·줄 높이·반경·테두리·그림자·여백, 부품 클래스', () => {
  for (const sel of ['\n:root {', '\n.dark {', "\nhtml[data-aud='public'] {", '@media (max-width: 900px)', '@layer base {', '@layer components {']) assert.ok(EXPORT.includes(sel), sel);
  const defined = new Set([...noBlock(EXPORT).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const want = ['--background', '--foreground', '--card', '--border', '--primary', '--muted-foreground', '--shadow-card', '--shadow-pop', '--shadow-edge', '--font-sans',
    ...['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'].flatMap((k) => [`--text-${k}`, `--text-${k}--line-height`]),
    ...['h1', 'h2', 'h3', 'body', 'table', 'meta', 'legend', 'kpi', 'caption'].map((r) => `--fs-${r}`),
    '--lh-title', '--lh-sub', '--lh-body', '--radius-chip', '--radius-tile', '--radius-card', '--radius-full', '--border-w', '--border-w-on',
    '--pad-card', '--pad-tile-y', '--pad-tile-x', '--pad-compact-y', '--pad-compact-x', '--logo-h', '--logo-mark', '--fs-nav', '--map-ov-1'];
  for (const n of want) assert.ok(defined.has(n), n);
  /* 내보내기 층 안의 var() 는 모두 그 안에서 정의된다(정적 화면이 globals 의 다른 부분 없이 쓴다) */
  const used = [...new Set([...noBlock(EXPORT).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
  assert.deepEqual(used.filter((n) => !defined.has(n)), []);
  for (const c of UI) assert.match(EXPORT, new RegExp(`\\.${c}\\s*[{,:]`), c);
});

test('부품 클래스(.ui-*)는 토큰 var() 만 쓴다: 색 리터럴·px·em 값 없음', () => {
  const comp = noBlock(EXPORT.slice(EXPORT.indexOf('@layer components {')));
  const bad = [];
  for (const m of comp.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)) {
    if (m[1] === 'font-weight') continue;   // 굵기 400·700 은 값 그대로(tests/js/font-scale.test.cjs 가 지킨다)
    const v = m[2].replace(/var\((?:[^()]|\([^()]*\))*\)/g, ' ');
    if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(|\d(?:\.\d+)?(px|r?em|%)\b|\b[1-9]\d*(?:\.\d+)?\b/.test(v)) bad.push(`${m[1]}: ${m[2]}`);
  }
  assert.deepEqual(bad, []);
});

test('카드 머리 부품(2026-10-18): .ui-card-head 제목 줄(장식 아이콘 배지 없음) · 개수 단추 = 단추 부품 .ui-btn.ui-btn-secondary.ui-btn-sm(shadcn Button) · 떠 있는 판 .ui-hud · 틴트는 토큰끼리 섞기만(라이트 12% · 다크 14%)', () => {
  const rule = (sel) => (EXPORT.match(new RegExp(`\\n  \\${sel} \\{([^}]*)\\}`)) || [])[1] || '';
  const head = rule('.ui-card-head'), sec = rule('.ui-btn-secondary'), sm = rule('.ui-btn-sm'), hud = rule('.ui-hud');
  assert.match(head, /display: flex;[\s\S]*gap: var\(--head-gap\);[\s\S]*min-height: var\(--head-h\);/);
  assert.doesNotMatch(EXPORT, /ui-badge-icon|--badge-hue|--badge-size|--badge-icon/, '장식 아이콘 배지 부품은 없앴다');
  assert.match(sec, /background: var\(--secondary\);\s*color: var\(--secondary-foreground\);/);
  assert.match(sm, /height: var\(--btn-h-sm\);\s*gap: var\(--btn-gap-sm\);\s*font-size: var\(--fs-meta\);/);
  assert.match(EXPORT, /\.ui-btn:focus-visible \{\s*outline: var\(--border-w-on\) solid var\(--ring\);/);
  assert.match(hud, /background: var\(--hud-bg\);[\s\S]*backdrop-filter: var\(--hud-backdrop\);[\s\S]*box-shadow: var\(--shadow-hud\);/);
  assert.doesNotMatch(EXPORT, /\.ui-count\b|--count-h/, '옛 개수 알약은 단추 부품으로 바꿨다');
  for (const [n, v] of [['head-h', '44px'], ['head-gap', '8px'], ['btn-h', '36px'], ['btn-h-sm', '32px']]) assert.match(EXPORT, new RegExp(`--${n}: ${v};`), n);
  assert.match(EXPORT, /\n:root \{[^}]*--tint-mix: 12%;[^}]*--tint-mix-on: 20%;/);
  assert.match(EXPORT, /\n\.dark \{[^}]*--tint-mix: 14%;[^}]*--tint-mix-on: 22%;/);
  /* /citizen 이 부품을 쓴다: 카드 머리 3곳(배지 아이콘 없이, 2026-10-18 아래 줄은 사업 카드 한 장) · 개수 단추 */
  const tpl = read('tools/design/public-mock/template.html');
  for (const c of ['ap-h']) assert.match(tpl, new RegExp(`<div class="${c} ui-card-head">`), c);   // 2026-10-18 통합 요약 표: 지도 카드 머리 띠(mapc-h)는 없앴다
  assert.equal((tpl.match(/<div class="cell-h ui-card-head">/g) || []).length, 1);
  assert.match(tpl, /class="ui-btn ui-btn-secondary ui-btn-sm all"/);
});

test('Tailwind 유틸리티는 토큰을 가리킨다: text-h1~caption · rounded-chip/tile/card · shadow-card/pop/edge · leading-title/sub/body · p-card · px-tile-x 등, 기본 단계는 지운다', () => {
  for (const r of ['h1', 'h2', 'h3', 'body', 'table', 'meta', 'legend', 'kpi', 'caption']) assert.match(GLOBALS, new RegExp(`--text-${r}: var\\(--fs-${r}\\);`), r);
  for (const n of ['radius-chip', 'radius-tile', 'radius-card', 'shadow-card', 'shadow-pop', 'shadow-edge', 'font-sans', 'text-xs', 'text-3xl']) assert.match(GLOBALS, new RegExp(`--${n}: var\\(--${n}\\);`), n);
  for (const [u, t] of [['leading-title', 'lh-title'], ['leading-sub', 'lh-sub'], ['leading-body', 'lh-body'], ['spacing-card', 'pad-card'], ['spacing-tile-x', 'pad-tile-x'], ['spacing-tile-y', 'pad-tile-y'], ['spacing-compact-x', 'pad-compact-x'], ['spacing-compact-y', 'pad-compact-y']]) assert.match(GLOBALS, new RegExp(`--${u}: var\\(--${t}\\);`), u);
  for (const ns of ['text', 'radius', 'shadow', 'leading', 'tracking']) assert.match(GLOBALS, new RegExp(`--${ns}-\\*: initial;`), ns);
  assert.doesNotMatch(GLOBALS, /--radius: 0\.625rem|calc\(var\(--radius\)/, '옛 shadcn --radius 배수 체계는 없다');
});

test('shadcn Card 변형: 구역(section, 기본)·타일(tile)·촘촘(compact)·안쪽 면(inset)·줄(row)이 부품 클래스를 쓰고, 쓰이지 않던 link·source 는 없다', () => {
  const card = read('components/ui/card.tsx');
  for (const [v, c] of [['section', 'ui-card'], ['tile', 'ui-tile'], ['compact', 'ui-tile-compact'], ['inset', 'ui-inset'], ['row', 'ui-row']]) assert.match(card, new RegExp(`${v}: "${c}[ "]`), v);
  assert.match(card, /defaultVariants: \{ variant: "section" \}/);
  /* 안쪽 카드(inset)는 테두리형: 바깥 카드와 같은 1px 테두리·카드색 바탕·반경 tile·그림자 없음. 카드 모양 상자에 각진(0) 반경이 없다 */
  const inset = EXPORT.match(/\.ui-inset \{([^}]*)\}/)[1];
  assert.match(inset, /border: var\(--border-w\) solid var\(--border\);/);
  assert.match(inset, /border-radius: var\(--radius-tile\);/);
  assert.match(inset, /background: var\(--inset-bg\);/);
  assert.doesNotMatch(inset, /box-shadow/);
  assert.doesNotMatch(EXPORT.replace(/\.ui-tabs-line[^{}]*\{[^}]*\}/g, ''), /border-radius:\s*0\b/);   // 밑줄 탭(.ui-tabs-line, 2026-10-19)은 카드 모양 상자가 아니라 반경 0
  assert.doesNotMatch(read('components/ui/card.tsx'), /rounded-none|rounded-\[0/);
  assert.doesNotMatch(card, /\b(link|source): "/);
  assert.match(card, /data-slot="card-title" className=\{cn\("ui-h2"/);
  assert.match(card, /data-slot="card-description" className=\{cn\("ui-meta/);
});

test('머리 줄 토큰: --logo-h 32(900px 이하 25.6) · --logo-mark 28 · --fs-nav 16(1100px 이하 14), TopNav 는 토큰으로만 쓴다', () => {
  assert.match(EXPORT, /--logo-h: 32px;/);
  assert.match(EXPORT, /@media \(max-width: 900px\) \{\s*:root \{[^}]*--logo-h: 25\.6px;/);
  assert.match(EXPORT, /--logo-mark: 28px;/);
  assert.match(EXPORT, /--fs-nav: 16px;/);
  assert.match(EXPORT, /@media \(max-width: 1100px\) \{\s*:root \{\s*--fs-nav: 14px;/);
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /size-\(--logo-mark\)/);
  assert.match(nav, /h-\(--logo-h\)/);
  assert.match(nav, /text-\(length:--fs-nav\)/);
  assert.doesNotMatch(nav, /size-\[33px\]|min-\[1101px\]:text-md|mobile:text-sm|text-2xl/);
});

test('입체 단계(raised, 2026-10-18 /citizen 시범): 덮어쓰기는 [data-elev] 범위 안에만, 앱 레이아웃에는 data-elev 가 없고 /citizen 만 달았다', () => {
  assert.match(EXPORT, /html\[data-elev="raised"\] \{[^}]*--inset-bg: #FFFFFF;/);
  assert.match(EXPORT, /html\.dark\[data-elev="raised"\] \{[^}]*--card: #1A1A1B;[^}]*--inset-bg: #232325;/);
  // :root·.dark 의 기본값은 그대로(안쪽 카드 면 = 카드 면), raised 값은 속성 규칙 밖에 새지 않는다
  assert.match(EXPORT, /:root \{[\s\S]*?--inset-bg: var\(--card\);/);
  assert.doesNotMatch(EXPORT.replace(/html(?:\.dark)?\[data-elev="raised"\] \{[^}]*\}/g, ''), /#1A1A1B|#232325|#F4F5F7/);
  for (const f of ['app/layout.tsx', 'app/(dashboard)/layout.tsx', 'app/(map)/layout.tsx']) if (fs.existsSync(path.join(ROOT, f))) assert.doesNotMatch(read(f), /data-elev/, f);
  const tpl = read('tools/design/public-mock/template.html');
  assert.match(tpl, /<html lang="ko" data-elev="raised"[^>]*>/);
  const ops = read('assets/citizen/index.html');
  assert.match(ops, /<html lang="ko" data-elev="raised"[^>]*>/);
  assert.match(ops, /\.card-lift:hover \{ transform: translateY\(-2px\); box-shadow: var\(--shadow-hover\); \}/);
  // 카드 전체가 눌리는 것(공고 카드)만 card-lift
  assert.match(tpl, /<a class="ntc ui-inset card-lift"/);
});
