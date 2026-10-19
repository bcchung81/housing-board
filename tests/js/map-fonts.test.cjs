/* 지도 글꼴·크기 체계(2026-10-17): 글꼴은 Noto Sans KR 하나(로컬), 크기 8단계, 굵기 400·700, 지도 라벨 최소 14px, 외부 글꼴 요청 0.
   대상: index.html(지도 마크업 정본) · assets/css/app.css · assets/js/*.js. maplibre 글리프(text-font)는 글리프 서버 글꼴이라 검사하지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const css = read('assets/css/app.css');
const cssBare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const jsFiles = fs.readdirSync(path.join(root, 'assets/js')).filter((f) => /^[\w-]+\.js$/.test(f));
const js = (f) => fs.readFileSync(path.join(root, 'assets/js', f), 'utf8');
const appJs = js('app.js');

const STEPS = [12, 14, 16, 18, 20, 24, 30, 38];

test('index.html: 외부 글꼴 서버 URL 0, Noto Sans KR 로컬 CSS 를 싣는다', () => {
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
  assert.ok(!/<link[^>]+(preconnect|stylesheet)[^>]+https?:\/\/[^"]*font/i.test(html));
  assert.ok(/<link rel="stylesheet" href="assets\/fonts\/noto-sans-kr\/noto-sans-kr\.css">/.test(html));
  assert.ok(!/do-?hyeon/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'index.html 에 Do Hyeon 불러오기가 없다');
  assert.ok(!/@import\s+url\(\s*['"]?https?:/.test(cssBare), 'app.css 에 외부 @import 0');
  assert.ok(fs.existsSync(path.join(root, 'assets/fonts/noto-sans-kr/noto-sans-kr.css')));
});

test('지도 CSS·JS: Do Hyeon 참조 0(주석 제외), 전역 글꼴은 Noto Sans KR 첫째', () => {
  assert.ok(!/do-?hyeon|font-disp/i.test(cssBare));
  // 글꼴 값은 app/globals.css 의 --font-sans 하나(2026-10-18), 지도 CSS 는 그것을 가리킨다
  assert.match(read('app/globals.css'), /--font-sans:\s*'Noto Sans KR',/);
  assert.match(cssBare, /font-family:var\(--font-sans\)/);
  assert.doesNotMatch(cssBare, /--font-body\s*:/);
  for (const f of jsFiles) {
    const bare = js(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/do-?hyeon/i.test(bare), `${f} 에 Do Hyeon 참조`);
  }
});

test('지도 CSS: font-size 는 8단계 px 이거나 토큰(var)·inherit, 소수 px 0', () => {
  const bad = [];
  for (const m of cssBare.matchAll(/font-size:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (v === 'inherit' || /^var\(--(fs|text)-[\w-]+\)$/.test(v)) continue;
    const px = /^(\d+)px$/.exec(v);
    if (!px || !STEPS.includes(+px[1])) bad.push(v);
  }
  assert.deepEqual(bad, []);
  assert.ok(!/font-size:\s*\d*\.\d+/.test(cssBare), '소수 크기 0');
  for (const m of cssBare.matchAll(/(?<![-\w])font:\s*([^;}]+)/g)) {
    const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
    if (px) assert.ok(STEPS.includes(+px[1]), `font 단축 ${m[1]}`);
  }
});

test('지도 CSS: 굵기는 400·700 만(500·600·800 0)', () => {
  const w = new Set([...cssBare.matchAll(/font-weight:\s*([^;}]+)/g)].map((m) => m[1].trim()));
  assert.deepEqual([...w].sort(), ['400', '700']);
});

test('역할 토큰: 크기 단계와 관점별 값(app/globals.css 와 같은 이름·값)', () => {
  // 값은 app/globals.css 한 곳(2026-10-18): 지도 CSS 는 지도 라벨(--fs-label-map)만 따로 두고 나머지는 globals 의 것을 쓴다
  const tw = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [n, v] of Object.entries({ xs: 12, sm: 14, base: 16, md: 18, lg: 20, xl: 24, '2xl': 30, '3xl': 38 })) assert.match(tw, new RegExp(`--text-${n}:\\s*${v}px`));
  for (const [n, v] of Object.entries({ body: 14, table: 14, meta: 14, legend: 14, kpi: 30, h1: 30, h2: 20 })) assert.match(tw, new RegExp(`--fs-${n}:\\s*${v}px`), `app/globals.css --fs-${n}`);
  assert.match(cssBare, /--fs-label-map:14px/);
  assert.match(tw, /html\[data-aud='public'\] \{\s*--fs-body: 16px;\s*--fs-table: 16px;/);
  assert.match(tw, /@media \(max-width: 900px\) \{\s*:root \{\s*--fs-h1: 24px;/);
});

test('지도 라벨: HTML 라벨 토큰과 maplibre text-size = 8단계 토큰(14 이상, 단계 밖 크기·font-scale 없음)', () => {
  // HTML 라벨(지도 위 단지 표지·미확보 표지)은 라벨 토큰(14)을 쓴다. 개요 이름표는 3D 공용 모양(assets/css/map3d.css — /citizen 과 같은 파일): 이름 14(--fs-legend) · 숫자 16(--text-base)
  for (const sel of ['\\.hudtag', '\\.lostpin']) assert.match(cssBare, new RegExp(`${sel}\\{[^}]*font-size:var\\(--fs-label-map\\)`), sel);
  const m3css = read('assets/css/map3d.css');
  assert.match(m3css, /\.map \.lbls text \{[^}]*font-size: var\(--text-base\);/); assert.match(m3css, /\.map \.lbls \.lb\.nm \{ font-size: var\(--fs-legend\);/);
  assert.doesNotMatch(cssBare, /\.ov-lb\b/, '개요 HTML 라벨(.ov-lb)은 없다');
  /* 2026-10-18: maplibre text-size 는 8단계 토큰(app/globals.css --text-*)에서 읽은 수(TXT)만 쓴다 — 리터럴 수·줌 보간(그 사이 줌에서 14.5px 같은 단계 밖 크기)은 없다.
     줌에 따라 크기를 바꾸면 계단(step) 식으로 단계 사이를 건너뛴다. 배경 OpenFreeMap 라벨(내장 OFM_LABELS·외부 스타일 층)은 snapTextSize 가 단계에 붙인다 */
  const tw = read('app/globals.css'), twVal = (k) => +new RegExp(`--text-${k}:\\s*(\\d+)px`).exec(tw)[1];
  const TXT_KEYS = /const TXT = \(\(\) => \{[^\n]*\[('sm'(?:, '[\w]+')*)\]\.map\(\(k\) => \[k, parseFloat\(cs\.getPropertyValue\(`--text-\$\{k\}`\)\)\]\)/.exec(appJs);
  assert.ok(TXT_KEYS, 'TXT 는 --text-* 토큰을 읽는다');
  const keys = TXT_KEYS[1].match(/[\w]+/g);
  assert.deepEqual(keys, ['sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'], '지도 라벨 단계는 14 이상(xs 12 제외)');
  for (const k of keys) assert.ok(STEPS.includes(twVal(k)) && twVal(k) >= 14, `--text-${k}`);
  const sizes = [];
  for (const f of jsFiles) {
    const src = js(f);
    for (const m of src.matchAll(/'text-size':\s*/g)) {
      let i = m.index + m[0].length, e;
      if (src[i] === '[') { let d = 0, j = i; for (; j < src.length; j++) { if (src[j] === '[') d++; else if (src[j] === ']' && --d === 0) break; } e = src.slice(i, j + 1); } else e = /^[\w.]+(?:\([^)]*\))?/.exec(src.slice(i))[0];
      sizes.push([f, e]);
    }
    if (f !== 'app.js') assert.doesNotMatch(src, /"text-size"/, `${f}: JSON 꼴 text-size 는 app.js 의 OFM_LABELS 에만`);
  }
  const ok = (e) => /^TXT\.(sm|base|md|lg|xl)$/.test(e) || /^\['step', \['zoom'\], TXT\.\w+(, \d+(?:\.\d+)?, TXT\.\w+)+\]$/.test(e) || e === "snapTextSize(l.layout['text-size'])";
  assert.ok(sizes.length >= 17, `text-size 선언 수 ${sizes.length}`);
  assert.deepEqual(sizes.filter(([, e]) => !ok(e)), [], 'text-size 는 TXT 토큰·계단 식·snapTextSize 만');
  assert.match(appJs, /layout: \{ \.\.\.l\.layout, 'text-size': snapTextSize\(l\.layout\['text-size'\]\),/, '내장 OFM_LABELS 의 크기도 단계에 붙인다');
  // 서식 식(format)의 부분 글자 비율(font-scale)은 쓰지 않는다: 14.56·15.68px 처럼 단계 밖 크기를 만든다. 위계는 굵기(text-font Bold)로
  for (const f of jsFiles) assert.doesNotMatch(js(f), /['"]font-scale['"]/, `${f}: font-scale`);
  // SVG 글자(font-size 속성)도 14 이상
  for (const m of appJs.matchAll(/font-size="([\d.]+)"/g)) assert.ok(+m[1] >= 14, `svg font-size ${m[1]}`);
});

test('서비스 이름: 화면에 보이는 index.html 의 이름은 The주택', () => {
  assert.ok(!/주택파동/.test(html));
  assert.match(html, /<title>The주택 지도<\/title>/);
});

test('지도 기본 배경(OpenFreeMap) 지명·도로명·교통 POI 라벨도 8단계 크기(14px 이상)에 붙인다(방패 아이콘 글자 제외)', () => {
  assert.match(appJs, /function snapTextSize\(v\)/);
  assert.match(appJs, /l\.type === 'symbol' && !\/shield\/\.test\(l\.id\)[^\n]*getLayoutProperty\(l\.id, 'text-field'\)/);
  assert.match(appJs, /setLayoutProperty\(l\.id, 'text-size', snapTextSize\(ts\)\)/);
  assert.doesNotMatch(appJs, /floorTextSize/);
  /* 실제 값: 수는 가까운 단계(14 밑은 14), 줌 보간은 이웃한 두 줌 가운데에서 넘어가는 계단, 계단 식은 값 자리만 */
  const src = /const TXT_STEPS = [^\n]*\n(?:\/\*[^\n]*\n)?const snapPx = [^\n]*\n(?:\/\*[\s\S]*?\*\/\n)?function snapTextSize\(v\) \{[\s\S]*?\n\}\n/.exec(appJs);
  assert.ok(src, 'TXT_STEPS·snapPx·snapTextSize');
  const snap = Function('TXT', `${src[0]}; return snapTextSize;`)({ sm: 14, base: 16, md: 18, lg: 20, xl: 24, '2xl': 30, '3xl': 38 });
  assert.deepEqual([10, 13, 14, 15, 17, 19.2].map(snap), [14, 14, 14, 14, 16, 20]);
  assert.deepEqual(snap(['interpolate', ['exponential', 1.2], ['zoom'], 7, 14, 11, 16]), ['step', ['zoom'], 14, 9, 16]);
  assert.deepEqual(snap(['interpolate', ['linear'], ['zoom'], 10, 11, 14, 13, 18, 17]), ['step', ['zoom'], 14, 12, 14, 16, 16]);
  assert.deepEqual(snap(['step', ['zoom'], 10, 15, 13]), ['step', ['zoom'], 14, 15, 14]);
  assert.deepEqual(snap({ stops: [[10, 12], [16, 15]] }), ['step', ['zoom'], 14, 13, 14]);
  const all = (e) => (typeof e === 'number' ? [e] : Array.isArray(e) ? e.slice(2).filter((_, i) => i % 2 === 0).flatMap(all) : []);
  for (const v of [snap(['interpolate', ['linear'], ['zoom'], 3, 9, 20, 33])]) for (const n of all(v)) assert.ok(STEPS.includes(n) && n >= 14, `단계 밖 ${n}`);
});
