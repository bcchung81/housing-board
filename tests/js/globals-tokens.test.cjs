'use strict';
// 글꼴·색 정의는 전역 CSS 하나(app/globals.css)에 둔다(2026-10-18, 1단계): 지도 CSS(assets/css/app.css)는 globals 토큰을 var() 로 가리키기만 하고 색 값을 스스로 갖지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const app = noComments(read('assets/css/app.css')), globals = noComments(read('app/globals.css'));

/* 지도 스크립트가 요소에 직접 넣는 변수(런타임): 단계색(--c·--cd)·층수 색(--tone)·노선 색(--rc)·진행률(--p)·옵션 창 자리(--ox·--oy)·아래 시트 높이(--sh)·하단 바 높이(--botbar-h) */
const RUNTIME = ['--botbar-h', '--c', '--cd', '--ox', '--oy', '--p', '--rc', '--sh', '--tone'];
/* CSS 이름 색(값으로 쓰면 색 리터럴). transparent·currentColor·inherit 는 허용 */
const NAMED = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');

/* 규칙 본문의 선언 값만 꺼낸다(선택자·@규칙 머리는 빼서 .ichip.교통 같은 이름에 걸리지 않게) */
const values = (src) => [...src.matchAll(/\{([^{}]*)\}/g)].flatMap((m) => m[1].split(';')).map((d) => d.slice(d.indexOf(':') + 1).trim()).filter(Boolean);

test('전역 CSS 는 app/globals.css 하나(app/tailwind.css 없음)이고, 두 루트 레이아웃이 그것을 가져온다', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'app/globals.css')), 'app/globals.css');
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/tailwind.css')), 'app/tailwind.css 는 없어야 한다');
  for (const f of ['app/(dashboard)/layout.tsx', 'app/(map)/layout.tsx']) assert.match(read(f), /^import '@\/app\/globals\.css';$/m, f);
});

test('지도 CSS 에 색 리터럴 0(#hex · rgb/hsl/oklch 등 · 이름 색) — 값은 globals 토큰을 var() 로 가리킨다', () => {
  const bad = [];
  for (const v of values(app)) {
    if (/#[0-9A-Fa-f]{3,8}\b/.test(v) || /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i.test(v)) bad.push(v);
    else for (const w of v.toLowerCase().split(/[^a-z]+/)) if (NAMED.includes(w)) bad.push(v);
  }
  assert.deepEqual(bad, []);
});

test('지도 CSS 가 쓰는 var(--x) 는 모두 app.css 나 globals 에 정의되어 있다(지도 스크립트가 넣는 런타임 변수만 예외)', () => {
  const defined = new Set([...(app + globals).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...app.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((n) => !defined.has(n) && !RUNTIME.includes(n)).sort();
  assert.deepEqual(missing, []);
  for (const n of RUNTIME) assert.ok(!defined.has(n), `${n} 은 CSS 가 정의하지 않는 런타임 변수다(정의가 생기면 허용 목록에서 뺀다)`);
});

test('지도 CSS 는 글꼴 변수를 따로 두지 않고(--font-body 없음) globals 의 --font-sans 를 쓴다', () => {
  assert.doesNotMatch(app, /--font-body/);
  assert.match(app, /font-family:var\(--font-sans\)/);
  assert.match(globals, /--font-sans:\s*'Noto Sans KR',/);
});
