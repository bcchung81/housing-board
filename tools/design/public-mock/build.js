// template.html + search.js + assets/js/map3d.js·assets/css/map3d.css(3D 지도 공용) + data.json → 두 벌
//   (1) docs/design/대국민-모드-시안.html — 데모판(시안 상태 막대·흉내 추천·흉내 현 위치·이동 주소 출력)
//   (2) assets/citizen/index.html        — 운영판(/citizen): 실제 이동·IP 추천(/api/v1/geo)·현 위치(브라우저 안 판정)·주소 검색(/api/v1/codes/search)·모집 공고(/api/v1/notices). ?demo=1 이면 상태 막대
const fs = require('fs'), path = require('path');
const SP = __dirname, ROOT = path.join(__dirname, '..', '..', '..');
const OUT = { demo: path.join(ROOT, 'docs', 'design', '대국민-모드-시안.html'), ops: path.join(ROOT, 'assets', 'citizen', 'index.html') };
const D = JSON.parse(fs.readFileSync(path.join(SP, 'data.json'), 'utf8'));
const dot = (s) => s.replace(/-/g, '.');
const tpl = fs.readFileSync(path.join(SP, 'template.html'), 'utf8');
const search = fs.readFileSync(path.join(SP, 'search.js'), 'utf8').replace(/\nif \(typeof module[^\n]*\n?/, '\n');
/* 3D 지도 공용 모듈(/map 수도권 개요와 같은 구현): 스크립트는 첫 <script> 맨 앞(전역 Map3D), 모양은 <style> 의 자리표시에 그대로 넣는다 */
const map3d = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'map3d.js'), 'utf8').trim();
const map3dCss = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'map3d.css'), 'utf8').trim();
/* 진짜 3D 지도(assets/js/map3d-gl.js, 전역 MapGL — 2026-10-18): Map3D 바로 뒤에. maplibre 는 넣지 않고 페이지가 WebGL 판정 뒤 동적으로 부른다(데모판은 상대 경로, 운영판은 앱 자산 절대 경로) */
const map3dGl = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'map3d-gl.js'), 'utf8').trim();
const MAPLIBRE = { demo: '../../assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js', ops: '/assets/vendor/maplibre-gl/5.24.0/maplibre-gl.js' };
if (!fs.existsSync(path.join(ROOT, MAPLIBRE.ops.slice(1)))) throw new Error('maplibre vendor missing: ' + MAPLIBRE.ops);
/* 전국 시군구 판정(assets/js/sgg-locate.js, 전역 SggLocate) + 경계 자료 기준일(출처 ⓘ) */
const sggLocate = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'sgg-locate.js'), 'utf8').trim();
const geoRef = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'geo', 'korea-sgg.json'), 'utf8')).source.fetched;
if (sggLocate.includes('</script')) throw new Error('sgg-locate contains closing tag');
if (map3d.includes('</script') || map3dCss.includes('</style') || map3dGl.includes('</script')) throw new Error('map3d contains closing tag');
/* 화면 통일(2026-10-18): 모든 시각 값은 app/globals.css 한 곳. 그 내보내기 층(토큰·관점별 덮어쓰기·줄바꿈 규칙·.ui-* 부품, scripts/globals-export.js)을 <style> 맨 앞 자리표시에 넣는다 */
const { extractExport, GLOBALS } = require(path.join(ROOT, 'scripts', 'globals-export.js'));
const globalsCss = extractExport(fs.readFileSync(GLOBALS, 'utf8')).trim();
if (globalsCss.includes('</style')) throw new Error('globals export contains </style');
/* 아이콘 스프라이트(2026-10-18 사용자 피드백 'shadcn·react 오픈소스 반영'): shadcn 이 쓰는 lucide 의 원본 도형(node_modules/lucide-react 의 __iconData)으로
   <symbol id="i-…" viewBox="0 0 24 24"> 를 만들어 템플릿 자리표시(<!--__ICONS__-->)에 넣는다. React 는 불러오지 않는다 — 파일 글에서 __iconData 객체만 떼어 vm 으로 평가한다.
   왼쪽 = 마크업의 id(#i-…), 오른쪽 = lucide 이름 */
const ICONS = {
  search: 'search', info: 'info', pin: 'map-pin', home: 'house', gps: 'locate-fixed', run: 'loader-circle', warn: 'triangle-alert', x: 'x',
  arrow: 'arrow-right', chev: 'chevron-right', map: 'map', key: 'keyboard', moon: 'moon', user: 'user', brief: 'briefcase-business',
  sun: 'sun', menu: 'menu', eye: 'eye', ext: 'external-link', down: 'chevron-down', left: 'arrow-left', copy: 'copy',
  check: 'check', undo: 'undo-2', play: 'play', pause: 'pause', rotl: 'rotate-ccw', rotr: 'rotate-cw', compass: 'compass',   // 해마다 재생·멈춤 · 지도 돌리기·원래 방향(2026-10-18)   // 장식 아이콘(카드 머리 배지·달력·건물·확성기·트로피·층·막대·목록·연필)은 두지 않는다(2026-10-18, tests/js/citizen-glyphs.test.cjs)
};
const LUCIDE = path.join(ROOT, 'node_modules', 'lucide-react');
const lucideNode = (name) => {
  const src = fs.readFileSync(path.join(LUCIDE, 'dist', 'esm', 'icons', `${name}.mjs`), 'utf8'), m = src.match(/const __iconData = (\{[\s\S]*?\n\});/);
  if (!m) throw new Error(`lucide __iconData not found: ${name} (별칭이면 원래 이름을 쓴다: ${(src.match(/from '\.\/([\w-]+)\.mjs'/) || [])[1] || '?'})`);
  const d = require('vm').runInNewContext(`(${m[1]})`);
  if (d.name !== name || d.size !== 24 || !Array.isArray(d.node) || !d.node.length) throw new Error('lucide icon shape: ' + name);
  return d.node;
};
const svgAttr = (a) => Object.entries(a).filter(([k]) => k !== 'key').map(([k, v]) => ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
const ICON_SPRITE = `<!-- 아이콘: lucide ${JSON.parse(fs.readFileSync(path.join(LUCIDE, 'package.json'), 'utf8')).version} (ISC License, https://lucide.dev) — tools/design/public-mock/build.js 가 lucide-react 원본 도형으로 만든다 -->\n`
  + Object.entries(ICONS).map(([id, n]) => `  <symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="${n}">${lucideNode(n).map(([tag, a]) => `<${tag}${svgAttr(a)}/>`).join('')}</symbol>`).join('\n');
const LOGO = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='4 4 64 60'><path fill='%23132543' d='M9 25.7 32.9 6.4Q36 3.9 39.1 6.4L63 25.7V55Q63 59 59 59H51.8V30.1L37.3 18.3Q36 17.2 34.7 18.3L20.2 30.1V52.6H26.2V59H13Q9 59 9 55Z'/><path fill='%23C75036' fill-rule='evenodd' d='M29.4 28.7 48.2 21.1V51.4L29.4 59V28.7ZM41.4 34.9A2.65 2.65 0 1 0 41.4 40.2A2.65 2.65 0 1 0 41.4 34.9Z'/></svg>`;
for (const mode of ['demo', 'ops']) {
  let h = tpl;
  const rep = {
    '/*__GLOBALS__*/': `/* ── app/globals.css 내보내기 층(빌드가 넣음, 고치지 말 것) ── */\n${globalsCss}\n/* ── 내보내기 층 끝 ── */`,
    '/*__MAP3D__*/': map3d,
    '/*__MAP3D_GL__*/': map3dGl,
    '/*MAPLIBRE_SRC*/': MAPLIBRE[mode],
    '/*__MAP3D_CSS__*/': map3dCss,
    '/*__SGGLOCATE__*/': sggLocate,
    '/*GEO_REF*/': geoRef,
    '/*__SEARCH__*/': search.trim(),
    '/*__DATA__*/': JSON.stringify(mode === 'ops' ? { ...D, notices: undefined } : D).replace(/</g, '\\u003c'),   // 공고 표본은 데모판만(운영판은 /api/v1/notices)
    '/*__MODE__*/': mode,
    '<!--__ICONS__-->': ICON_SPRITE,
    '/*LEDGER_DOT*/': dot(D.meta.ledgerRef), '/*LEDGER_REF*/': dot(D.meta.ledgerRef),
    '/*CAL_RANGE*/': `${dot(D.meta.calFrom)}~${dot(D.meta.calTo)}`, '/*CAL_REF*/': dot(D.meta.calRef),
    '/*SAMPLE_REF*/': dot(D.meta.sampleRef),
  };
  for (const [k, v] of Object.entries(rep)) { if (!h.includes(k)) throw new Error('missing ' + k); h = h.split(k).join(v); }
  if (mode === 'ops') {
    /* 운영판: 제목·설명·og·파비콘(로고 그림), 글꼴(Noto Sans KR css)은 앱 자산 절대 경로 */
    h = h.replace(/<title>[^<]*<\/title>/, `<title>The주택 — 내 동네 공공 주택 공급</title>
<meta name="description" content="내 동네에 앞으로 들어올 공공 주택이 얼마나, 언제 들어오는지 한 화면에서 봅니다. 모집 공고·착공·준공 일정과 시군구별 지도를 함께 보여 줍니다.">
<meta property="og:type" content="website"><meta property="og:title" content="The주택 — 내 동네 공공 주택 공급"><meta property="og:description" content="내 동네에 앞으로 들어올 공공 주택과 다가오는 모집 공고·준공 일정"><meta property="og:locale" content="ko_KR">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${LOGO.replace(/"/g, "'")}">`);
    h = h.split('href="../../assets/fonts/').join('href="/assets/fonts/');   // Noto Sans KR(앱과 같은 로컬 파일)
    if (h.includes('../../assets/')) throw new Error('relative asset path left in ops build');
  }
  fs.mkdirSync(path.dirname(OUT[mode]), { recursive: true });
  fs.writeFileSync(OUT[mode], h);
  console.log(mode, OUT[mode], fs.statSync(OUT[mode]).size);
}
