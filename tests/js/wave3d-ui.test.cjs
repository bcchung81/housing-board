'use strict';
// 종합상황판 '월별 공급 파동' 3D 차트 컴포넌트의 정적 검사(브라우저 없이 소스로):
// 지연 로딩(next/dynamic ssr:false — '/' 첫 화면 JS 에 three 가 들어가지 않음), 대체 경로(WebGL 없음·움직임 줄이기·900px 이하 → 지금 2D),
// 색은 CSS 토큰(--st-* 등)을 읽기만(색 리터럴 0), 키보드·aria, 값은 lib/board/wave3d.ts 에서(2D 리본과 같은 값 — tests/js/wave3d.test.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* 주석은 검사에서 뺀다 */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
const CHART = 'components/board/SupplyWaveChart.tsx', W3D = 'components/board/SupplyWave3D.tsx';
const chart = code(read(CHART)), w3d = code(read(W3D));
const THREE_IMPORT = /^\s*import\b[^;]*from\s+'(?:three|@react-three\/[\w-]+|d3-scale)'/m;

test('지연 로딩: SupplyWaveChart 가 3D 를 next/dynamic(ssr:false)으로만 부르고, three·R3F 를 정적으로 부르지 않는다', () => {
  assert.match(read(CHART), /^'use client';/);
  assert.match(chart, /import dynamic from 'next\/dynamic';/);
  assert.match(chart, /dynamic\(\(\) => import\('\.\/SupplyWave3D'\), \{[^}]*ssr: false/);
  assert.doesNotMatch(chart, THREE_IMPORT);
  assert.doesNotMatch(chart, /^\s*import(?!\s+type\b)\b[^;]*from\s+'\.\/SupplyWave3D'/m, 'SupplyWave3D 를 정적 import 하지 않는다(타입만 허용 — 빌드에서 지워진다)');
  /* SupplyWave3D 를 정적으로 부르는 파일은 없다(동적 import 하나뿐) */
  const users = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && p !== W3D && /SupplyWave3D/.test(code(read(p)))) users.push(p); } };
  walk('app'); walk('components'); walk('lib');
  assert.deepEqual(users, [CHART]);
  /* three·R3F 를 부르는 파일은 SupplyWave3D 하나(d3-scale 은 순수 계산 lib/board/wave3d.ts 만) */
  const importers = [];
  const walk2 = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk2(p); else if (/\.tsx?$/.test(e.name) && /from\s+'(?:three|@react-three\/[\w-]+)'/.test(read(p))) importers.push(p); } };
  walk2('app'); walk2('components'); walk2('lib');
  assert.deepEqual(importers, [W3D]);
});

test('대체 경로: WebGL 판정·움직임 줄이기·폭(900px 이하)을 보고 viewMode 로 3D 또는 기존 2D(fallback)를 그린다', () => {
  /* 판정은 d3-scale 을 부르지 않는 작은 모듈에서(wave3d.ts 를 부르면 d3-scale 이 '/' 첫 화면 JS 에 딸려 온다) */
  assert.match(chart, /import \{ viewMode \} from '@\/lib\/board\/wave3d-mode';/);
  assert.doesNotMatch(chart, /from '@\/lib\/board\/wave3d';/);
  assert.doesNotMatch(code(read('lib/board/wave3d-mode.ts')), /^\s*import\b/m, 'wave3d-mode 는 아무것도 부르지 않는다');
  assert.match(chart, /getContext\('webgl2'\)/);
  assert.match(chart, /getContext\('webgl'\)/);
  assert.match(chart, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(chart, /addEventListener\('change'/, '움직임 줄이기 설정이 바뀌면 다시 판정');
  assert.match(chart, /addEventListener\('resize'/, '폭이 바뀌면 다시 판정');
  assert.match(chart, /\bfallback\b/);
  assert.match(chart, /mode !== '3d'[^\n]*fallback/, '3D 가 아닐 때(서버 렌더·판정 전 포함)는 2D 그대로');
  /* WebGL 만들기에 실패하면 R3F Canvas 의 fallback 으로 2D */
  assert.match(w3d, /<Canvas[^>]*fallback=\{fallback\}/);
});

test('SupplyWave3D: 클라이언트 전용 · 요청 때만 그림(frameloop demand) · 정사영 정면 고정(기울기·회전·이동·확대 없음) · 선·글자는 Canvas 밖 판 여백 안', () => {
  assert.match(read(W3D), /^'use client';/);
  assert.match(w3d, /frameloop="demand"/);
  /* 2026-10-21 사용자 지시 '기울기 없이 정면으로': 정사영 카메라를 판 가운데 앞에(세계 1 = CSS 1px), 원근·기울기 값 없음 */
  assert.match(w3d, /<Canvas orthographic /);
  assert.match(w3d, /camera\.position\.set\(size\.width \/ 2, size\.height \/ 2, 10\)/);
  assert.doesNotMatch(w3d, /PerspectiveCamera|setFromSphericalCoords|\bfov\b|\btilt\b|\bturn\b|fitDistance|toScreen/, '옛 원근·기울기 시점 없음');
  /* 축 글자·툴팁은 drei Html(글자마다 React 루트 — React 19 에서 렌더 중 떼어 내기 오류)이 아니라 Canvas 밖 층 */
  assert.doesNotMatch(w3d, /@react-three\/drei/, 'drei 를 부르지 않는다');
  assert.doesNotMatch(w3d, /<Html\b/, 'Html 없음');
  assert.match(w3d, /<svg data-slot="wave3d-back" className="pointer-events-none absolute inset-0 size-full"[\s\S]*?<Canvas /, '뒤 층(연도 구분선)은 Canvas 앞 형제');
  assert.match(w3d, /<\/Canvas>\s*\) : null\}\s*\{toks && ready && L \? \(\s*<div data-slot="wave3d-labels" className="pointer-events-none absolute inset-0">/, '앞 층은 Canvas 다음 형제, 가리킴·누름을 막지 않는다');
  assert.match(w3d, /onCreated=\{\(\) => setReady\(true\)\}/, 'WebGL 문맥을 만든 뒤에만 선·글자 층(2D 대체 위에 겹치지 않게)');
  assert.match(w3d, /new ResizeObserver\(/, '판 크기를 재서 배치');
  assert.match(w3d, /layoutOf\(size\.w, size\.h, n\)/, '판 배치(축 글자 여백·깊이)는 wave3d.ts');
  assert.match(w3d, /tipPlace\(/); assert.match(w3d, /totalPlace\(/, '툴팁·총량 라벨은 판 안으로');
  assert.match(w3d, /data-slot="board-tip" className="dark pointer-events-none absolute /);
  assert.match(w3d, /data-slot="wave3d-total"/, '고른 달 총량 라벨(2D 리본과 같은 HUD)');
  /* 컨트롤·확대/이동 상태 없음 */
  assert.doesNotMatch(w3d, /OrbitControls|MapControls|TrackballControls|CameraControls|<\w*Controls\b/, '카메라 컨트롤 없음');
  assert.doesNotMatch(w3d, /\b(?:zoomWin|panWin|panPx|clampWin|setWin)\b/, '확대·이동 상태 없음');
  assert.doesNotMatch(w3d, /\bonWheel\b|['"]wheel['"]|\bpreventDefault\(\)[^\n]*wheel/, '휠 처리 없음 — 페이지 스크롤로 넘어간다');
  assert.doesNotMatch(w3d, /\bonPointerDown\b|\bonPointerUp\b|\bonTouch\w+|\bsetPointerCapture\b|\bonContextMenu\b/, '끌기·터치 처리 없음');
  assert.doesNotMatch(w3d, /\buseState<Win>/, '보이는 범위는 상태가 아니다');
  assert.match(w3d, /fullWin\(n\)/, '보이는 범위 = 전체 기간');
  /* 키는 ←→ 만(확대 키 없음) */
  assert.doesNotMatch(w3d, /['"](?:Home|End|\+|=|-|_)['"]/);
  /* 값·기하는 wave3d.ts 에서 */
  for (const fn of ['stackOf', 'colsOf', 'cut', 'frontOf', 'lidOf', 'capOf', 'bandOf', 'seamOf', 'faceColors', 'yAxis', 'xTicks', 'nowMark', 'keyStep', 'monthAt', 'layoutOf']) assert.match(w3d, new RegExp(`\\b${fn}\\(`), fn);
  assert.match(w3d, /from '@\/lib\/board\/wave3d';/);
  /* 가리킴 툴팁 · 누름 = 달 고르기(판 px → 달, 레이 캐스팅 없음), 쌓은 판은 가리킴이 바뀌어도 다시 그리지 않는다 */
  assert.match(w3d, /onPointerMove=\{\(e\) => setHover\(at\(e\)\)\}/); assert.match(w3d, /onClick=\{/);
  assert.match(w3d, /const Ribbon = memo\(function Ribbon/);
});

test('색: CSS 토큰을 화면에서 읽어 테마(라이트·다크)를 따른다 — 색 리터럴 0 · 토큰 불투명도 보존', () => {
  const both = chart + w3d;
  assert.doesNotMatch(both, /(?<![\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/, '#hex');
  assert.doesNotMatch(both, /\b(?:rgba?|hsla?|oklch|oklab)\(/, 'rgb()·hsl()');
  assert.doesNotMatch(both, /\b0x[0-9a-fA-F]{3,8}\b/, '0x 색 숫자');
  assert.doesNotMatch(both, /\bcolor="[^"{]/, '색 이름 글자 속성');
  assert.doesNotMatch(both, /new (?:THREE\.)?Color\(['"]/, '색 이름 글자로 Color 만들기');
  /* 단계색은 sample.ts 의 C(var(--st-*)) 그대로, 캔버스는 지연 띠·층 경계·빗금·하이라이트·그늘·카드 바탕 토큰을 읽고, 선·글자는 리본 토큰을 var() 로 */
  assert.match(w3d, /\bC\b[^\n]*from '@\/lib\/board\/sample';/);
  for (const t of ['--rb-band', '--rb-seam', '--rb-hatch', '--rb-hi', '--rb-lo', '--card']) assert.ok(w3d.includes(`'var(${t})'`), t);
  for (const t of ['--rb-acc', '--rb-ink', '--rb-mid', '--rb-axis', '--rb-cur', '--rb-hover', '--rb-sep', '--rb-hud', '--rb-hud-line', '--rb-hud-txt']) assert.ok(w3d.includes(`var(${t})`), t);
  assert.match(w3d, /const \[r, g, b, a\] = ctx\.getImageData\(0, 0, 1, 1\)\.data;/, '토큰 불투명도(알파)까지 읽는다');
  /* 바뀌는 테마(<html> class·data-*)를 지켜보고 다시 읽는다 */
  assert.match(w3d, /new MutationObserver\(/);
  assert.match(w3d, /attributeFilter: \['class'/);
  assert.match(w3d, /getComputedStyle\(/);
  assert.match(w3d, /<Canvas[^>]*\bflat\b/, '톤 매핑 없음(토큰 색 그대로)');
});

test('접근성: 초점 받는 판 · aria-label · 키보드(keyStep) · 고른 달 알림(aria-live) · 툴팁 한글', () => {
  assert.match(w3d, /tabIndex=\{0\}/);
  assert.match(w3d, /aria-label=\{/);
  assert.match(w3d, /aria-roledescription="3D 차트"/);
  assert.match(w3d, /onKeyDown=\{/);
  assert.match(w3d, /aria-live="polite"/);
  assert.match(w3d, /preventDefault\(\)/);
  assert.equal((w3d.match(/preventDefault\(\)/g) ?? []).length, 1, 'preventDefault 는 키 처리 한 곳뿐(휠·끌기 아님)');
  assert.match(w3d, /'기준 '|nowMark\(/);
  /* 툴팁 내용은 부르는 쪽(Board)이 2D 와 같은 것을 넘긴다 */
  assert.match(w3d, /tip: \(m: number\) => ReactNode/);
});

test('Board 연결: 2D SVG 블록을 그대로 SupplyWaveChart 의 fallback 으로 두고, 툴팁 내용(tipBody)을 2D·3D 가 같이 쓴다', () => {
  const b = code(read('components/board/Board.tsx'));
  assert.match(b, /^import SupplyWaveChart from '\.\/SupplyWaveChart';$/m);
  assert.doesNotMatch(b, THREE_IMPORT, 'Board 는 three·R3F 를 부르지 않는다');
  assert.match(b, /<SupplyWaveChart T=\{T\} su=\{L\.stageUnits\} delays=\{DL\} cursor=\{cursor\} onPick=\{goto\} hl=\{hl\} tip=\{tipBody\}/);
  assert.match(b, /fallback=\{\s*<div className="mt-3 overflow-x-auto overflow-y-hidden">/, '2D 블록 그대로가 대체');
  assert.match(b, /<svg id="chart"/, '2D 리본은 남는다');
  assert.match(b, /\{tipView \? tipBody\(tipView\.m\) : null\}/, '2D 툴팁도 같은 내용');
  assert.match(b, /function tipBody\(m: number\)/);
  /* 툴팁 2열(2026-10-21 사용자 결정 — 판을 가리지 않게 낮게): 6단계·지연/주의를 두 열로, 2D·3D 같은 tipBody */
  assert.match(read('components/board/Board.tsx'), /const tipCols = 'grid grid-cols-2 gap-x-4';/);
  assert.match(b, /<div className=\{tipCols\}>\{K\.map\(\(k, i\) =>/);
  /* 3D 안내에 없는 조작(확대·축소·끌기·회전)을 적지 않는다 */
  const lab = /tip=\{tipBody\}\s*label=\{`([^`]*)`\}/.exec(b)?.[1] ?? '';
  assert.ok(lab.includes('화살표'), lab);
  assert.doesNotMatch(lab, /확대|축소|끌어|회전/);
});
