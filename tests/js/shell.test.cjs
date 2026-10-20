// 상황판 셸(사이드바 메뉴·파생 상세 경로·지도 섬)이 설계 문서(docs/product/상황판-셸-설계.md)와 어긋나지 않는지 정적으로 확인한다.
// 화면에서의 실제 전환·접힘·드로어는 브라우저로 따로 본다. lib/shell/menu.ts 는 Node 가 타입 표기를 지우고 바로 읽는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { MENU, SECTIONS, DETAILS, activeMenuId } = require('../../lib/shell/menu.ts');

test('상단 메뉴는 관점마다 다섯·네 목적지이고 경로·식별자가 겹치지 않는다(2026-10-14: 보고자료·사업 상세 → 사업, 공급 실적·우리 동네 → 지역 공급 · 2026-10-19 일반사용자 사업 찾기·공급 일정)', () => {
  const admin = MENU.filter((m) => !m.publicOnly), pub = MENU.filter((m) => !m.adminOnly);
  assert.deepEqual(admin.map((m) => m.href), ['/', '/map', '/projects', '/region', '/sources']);
  assert.deepEqual(admin.map((m) => m.label), ['종합상황판', '지도', '사업', '지역 공급', '데이터 원본']);
  assert.deepEqual(pub.map((m) => m.href), ['/', '/map', '/citizen/projects', '/citizen/schedule'], "일반사용자 '종합상황판'은 TopNav 가 /citizen 으로 바꾼다");
  assert.deepEqual(pub.map((m) => m.label), ['종합상황판', '지도', '사업 찾기', '공급 일정']);
  assert.equal(new Set(MENU.map((m) => m.href)).size, MENU.length);
  assert.equal(new Set(MENU.map((m) => m.id)).size, MENU.length);
  assert.deepEqual(MENU.filter((m) => m.soon).map((m) => m.id), []);
});

test('목록 구역은 모두 사이드바 메뉴이고, 지도·종합상황판은 목록 구역이 아니다', () => {
  const ids = new Set(MENU.map((m) => m.id));
  for (const k of Object.keys(SECTIONS)) assert.ok(ids.has(k), `${k} 는 사이드바 메뉴여야 한다`);
  assert.ok(!('map' in SECTIONS) && !('home' in SECTIONS));
});

test('파생 상세는 부모 메뉴를 강조한다: 월·기관은 종합상황판(위젯에서 내려감), 지도는 지도. 넘기는 옛 주소는 메뉴가 없다', () => {
  assert.equal(activeMenuId('/'), 'home');
  assert.equal(activeMenuId('/month/2026-10'), 'home');
  assert.equal(activeMenuId('/projects'), 'projects');
  assert.equal(activeMenuId('/region'), 'region');
  assert.equal(activeMenuId('/agency/lh'), 'home');
  for (const p of ['/project/PRJ-11290-0001', '/reports', '/area', '/area/11', '/my-area', '/stage/04']) assert.equal(activeMenuId(p), null, p);   // 없앤 화면(next.config.ts 가 넘긴다)
  assert.equal(activeMenuId('/map'), 'map');
  assert.equal(activeMenuId('/nope'), null);
  assert.equal(activeMenuId('/citizen/projects'), 'find');
  assert.equal(activeMenuId('/citizen/schedule'), 'schedule');
  assert.equal(activeMenuId('/citizen/nope'), null);
});

test('상세 식별자는 새로 만들지 않는다: PRJ id·기관·연월만 열리고 나머지는 거른다. 지역 공급은 상세가 없다(?sido=)', () => {
  const ok = (s, id) => DETAILS[s].id.test(id);
  assert.ok(ok('project', 'PRJ-11290-0001') && !ok('project', 'PRJ-1129-0001') && !ok('project', '1009100003921'));   // 건축HUB 관리번호는 id 가 아니다(기획서 결정 5)
  assert.ok(ok('agency', 'lh') && ok('agency', 'mnd') && !ok('agency', 'etc'));
  assert.ok(ok('month', '2026-10') && !ok('month', '2026-13') && !ok('month', '202610'));
  assert.deepEqual(Object.keys(DETAILS).sort(), ['agency', 'month', 'project']);
  for (const d of Object.values(DETAILS)) assert.ok(d.list === '/' || Object.keys(SECTIONS).includes(activeMenuId(d.list)), `${d.list} 는 올라갈 목록(메뉴 구역 안)이어야 한다`);
  assert.ok(!('stage' in DETAILS), '단계 상세는 사업 목록의 거르기(/projects?stage=)다');
  assert.equal(DETAILS.project.list, '/projects', '사업 상세는 사업 목록의 서랍(?id=)');
});

test('메뉴 통합으로 없앤 화면의 옛 주소는 사업 목록의 거르기로 넘긴다(임시 넘김, 2026-10-10)', () => {
  const cfg = read('next.config.ts');
  assert.match(cfg, /\{ source: '\/stage', destination: '\/projects', permanent: false \}/);
  assert.match(cfg, /\{ source: '\/stage\/:id\(0\[1-6\]\)', destination: '\/projects\?stage=:id', permanent: false \}/);
  assert.match(cfg, /\{ source: '\/area\/:sgg\(\\\\d\{5\}\)', destination: '\/projects\?sgg=:sgg', permanent: false \}/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/(dashboard)/stage')), '단계별 화면 폴더는 없다');
});

test('공급 실적·시행주체별·우리 동네 목록 화면은 지역 공급(/region)으로 합쳐 없고, 종합상황판 위젯이 쓰는 기관 상세·월 상세는 남는다(2026-10-14)', () => {
  for (const f of ['area', 'my-area', 'agency/page.tsx']) assert.ok(!fs.existsSync(path.join(ROOT, 'app/(dashboard)', f)), f);
  for (const f of ['agency/[id]/page.tsx', 'month/[id]/page.tsx', 'region/page.tsx']) assert.ok(fs.existsSync(path.join(ROOT, 'app/(dashboard)', f)), f);
  const s = read('app/(dashboard)/region/page.tsx');
  assert.match(s, /<PageHead [^>]*title="지역 공급"/);
  assert.doesNotMatch(s, /<ReqTags/, '요구사항 칩은 데이터 원본에만(screens-terms)');
  assert.doesNotMatch(s, /실데이터<\/Badge>/, '실데이터 표지는 쓰지 않는다(2026-10-13 화면 규칙)');
});

test('지도 섬이 스크립트를 불러오는 순서는 index.html 의 기존 로더와 같다(index.html 이 지도 마크업의 정본이라 어긋나면 지도가 안 열린다)', () => {
  const island = read('components/MapIsland.tsx'), html = read('index.html');
  const js = (s) => [...new Set([...s.matchAll(/['"]\/?(assets\/[^'"]+\.js|config\.js)['"]/g)].map((m) => m[1].replace(/^\//, '')))];   // preload 링크의 같은 주소는 첫 등장만
  assert.deepEqual(js(island), js(html));
  assert.ok(js(island).length >= 8);
  assert.match(island, /if \(w\.__mapBooted\) return;/);   // app.js 는 최상위 const 를 선언해 문서당 한 번만 돌아야 한다
});

test('지도는 루트 레이아웃이 따로이고(들어갈 때·나올 때 새 문서), 지도로 가는 링크는 <Link> 가 아니라 <a> 다', () => {
  assert.match(read('app/(map)/layout.tsx'), /<html lang="ko" data-map-shell="" data-design="warm" suppressHydrationWarning>/);   // 지도도 저장된 테마를 첫 화면 전에 복원한다
  assert.match(read('app/(dashboard)/layout.tsx'), /<html lang="ko" data-design="warm" suppressHydrationWarning>/);   // 비지도 웜 배색 범위(2026-10-19). 라이트가 기본, 저장된 테마가 다크일 때만 그리기 전에 class=dark
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/layout.tsx')), '최상위 layout.tsx 가 있으면 두 레이아웃이 하나로 합쳐진다');
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /compact \|\| m\.id === 'map' \|\| href === '\/citizen'\s*\?\s*<a href=\{href\}/);   // 일반사용자의 '종합상황판'(/citizen)도 정적 문서라 <a>
  assert.match(read('app/(map)/layout.tsx'), /<TopNav compact \/>/);
  assert.match(read('app/(dashboard)/layout.tsx'), /<TopNav \/>/);
});

test('지도 화면: 지도 앱(.app)이 상단 바 아래 남은 폭·높이를 모두 쓴다 — 마크업이 display:contents 래퍼 안이라 자손 선택자여야 한다', () => {
  assert.match(read('app/(map)/map/page.tsx'), /style=\{\{ display: 'contents' \}\}/, '지도 마크업은 display:contents 래퍼 안에 들어간다');
  const appCss = read('assets/css/app.css');
  assert.match(appCss, /\.shell-map \.app\{flex:1;min-width:0;min-height:0;height:auto\}/);
  assert.doesNotMatch(appCss, /\.shell-map>\.app/, '직계 자식 선택자는 래퍼 때문에 닿지 않는다(2026-10-09: 지도가 화면 폭을 다 쓰지 못함)');
  assert.match(read('app/(map)/layout.tsx'), /<div className="shell-map flex h-screen flex-col overflow-hidden">/);   // 세로 flex: 위 상단 바, 아래 .app
});

test('상단 메뉴 바는 화면 폭(100vw) 기준으로 자리·폭을 정해, 문서 스크롤바가 있는 화면과 없는 화면에서 같은 자리다(1470px 보다 좁아도)', () => {
  const nav = read('components/TopNav.tsx');
  /* 2026-10-16: 1600px 이상 대시보드는 본문 틀과 같은 1760px 선(같은 100vw 기준), 지도(compact)는 1440px 그대로 — r2-screens 후속 1 */
  assert.match(nav, /<div className=\{cn\('ml-\[max\(0px,50vw_-_720px\)\] flex h-16 w-\[min\(1440px,100vw\)\] items-center gap-2 px-7 mobile:ml-0 mobile:h-12 mobile:w-auto mobile:px-3 min-\[1600px\]:ml-\[max\(0px,50vw_-_880px\)\] min-\[1600px\]:w-\[min\(1760px,100vw\)\]'\)\}>/);
  assert.match(nav, /<header className="sticky top-0 z-40 shrink-0 overflow-x-clip /, '스크롤바 밑으로 들어간 몫은 잘라 가로 스크롤이 생기지 않는다');
  assert.doesNotMatch(nav, /max-w-\[1440px\]/, '남은 폭(스크롤바를 뺀 폭)을 따르면 1470px 보다 좁은 화면에서 메뉴 7px·단추 14px 이 움직였다(2026-10-10)');
  assert.doesNotMatch(nav, /mx-auto flex h-16/, 'mx-auto 는 스크롤바를 뺀 폭 기준이라 종합상황판에서만 스크롤바 폭의 절반만큼 왼쪽으로 간다(2026-10-09: 7px)');
});

test('지도 머리 줄(.mhead)의 바탕·아래 선·지역 글자는 상단 메뉴 바와 같은 Tailwind 토큰을 쓴다', () => {
  const appCss = read('assets/css/app.css');
  assert.match(appCss, /html\[data-map-shell\] \.mhead\{background:var\(--card\);border-bottom-color:var\(--border\)\}/);
  assert.match(appCss, /html\[data-map-shell\] \.hd-region,html\[data-map-shell\] \.regionbox select\{color:var\(--muted-foreground\)\}/);
  assert.doesNotMatch(appCss, /html\[data-map-shell\]:not\(\.dark\) \.mhead\{/, '다크에서도 같은 토큰을 쓰므로 라이트 전용 바탕 규칙은 없다');
});

test('옛 지도 주소(/?region=…)는 쿼리를 그대로 두고 /map 으로 보낸다', () => {
  const proxy = read('proxy.ts');
  assert.match(proxy, /const \{ search, searchParams \} = request\.nextUrl;/);
  assert.match(proxy, /NextResponse\.redirect\(new URL\('\/map' \+ search, request\.url\)\)/);
  assert.match(proxy, /matcher: '\/'/);
});

test('지도 머리 줄: compact 도 1600px 이상 1760px 선이고 지도 카드 틀도 같은 선, 탭 제목은 더주택', () => {
  const fs = require('node:fs');
  const nav = fs.readFileSync('components/TopNav.tsx', 'utf8');
  assert.ok(!/!compact\s*&&\s*'min-\[1600px\]/.test(nav), 'compact 가 1760 선에서 빠져 있다');
  assert.match(nav, /mobile:px-3 min-\[1600px\]:ml-\[max\(0px,50vw_-_880px\)\] min-\[1600px\]:w-\[min\(1760px,100vw\)\]/);
  const css = fs.readFileSync('assets/css/app.css', 'utf8');
  assert.match(css, /@media \(min-width:1600px\)\{\.shell-map \.app,html\[data-map-mode="overview"\] \.shell-map \.ov\{width:calc\(min\(1760px,100%\) - 56px\)\}\}/);   // 머리 줄은 지도 카드(1760 선) 안
  // TopNav 요소(header·nav·ul·li·a·button·svg·input)를 바꾸는 전역 요소 선택자가 없다
  assert.ok(!/(^|\n)(header|nav|ul|li|a|button|svg|input)\s*[,{]/.test(css));
  assert.match(fs.readFileSync('app/(map)/layout.tsx', 'utf8'), /title: '더주택 지도'/);
  assert.match(fs.readFileSync('app/(dashboard)/layout.tsx', 'utf8'), /template: '%s · 더주택'/);
});
