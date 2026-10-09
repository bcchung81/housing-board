// 상황판 셸(사이드바 메뉴·파생 상세 경로·지도 섬)이 설계 문서(docs/product/상황판-셸-설계.md)와 어긋나지 않는지 정적으로 확인한다.
// 화면에서의 실제 전환·접힘·드로어는 브라우저로 따로 본다. lib/shell/menu.ts 는 Node 가 타입 표기를 지우고 바로 읽는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { MENU, SECTIONS, DETAILS, activeMenuId } = require('../../lib/shell/menu.ts');

test('사이드바 메뉴는 설계 1절의 아홉 목적지이고 경로·식별자가 겹치지 않는다', () => {
  assert.deepEqual(MENU.map((m) => m.href), ['/', '/map', '/projects', '/area', '/stage', '/agency', '/sources', '/reports', '/my-area']);
  assert.equal(new Set(MENU.map((m) => m.id)).size, MENU.length);
  assert.deepEqual(MENU.filter((m) => m.soon).map((m) => m.id), ['reports', 'my-area']);   // 준비 중 표지
});

test('목록 구역은 모두 사이드바 메뉴이고, 지도·종합상황판은 목록 구역이 아니다', () => {
  const ids = new Set(MENU.map((m) => m.id));
  for (const k of Object.keys(SECTIONS)) assert.ok(ids.has(k), `${k} 는 사이드바 메뉴여야 한다`);
  assert.ok(!('map' in SECTIONS) && !('home' in SECTIONS));
});

test('파생 상세는 부모 메뉴를 강조한다: 월은 종합상황판, 사업은 사업, 지도는 지도', () => {
  assert.equal(activeMenuId('/'), 'home');
  assert.equal(activeMenuId('/month/2026-10'), 'home');
  assert.equal(activeMenuId('/project/PRJ-11290-0001'), 'projects');
  assert.equal(activeMenuId('/area/41450'), 'area');
  assert.equal(activeMenuId('/stage/04'), 'stage');
  assert.equal(activeMenuId('/map'), 'map');
  assert.equal(activeMenuId('/nope'), null);
});

test('상세 식별자는 새로 만들지 않는다: AreaRef 코드·PRJ id·6단계·기관·연월만 열리고 나머지는 거른다', () => {
  const ok = (s, id) => DETAILS[s].id.test(id);
  assert.ok(ok('area', '11') && ok('area', '41450') && !ok('area', '411') && !ok('area', '4145011400'));   // 시도 2·시군구 5자리(법정동은 지도가 연다)
  assert.ok(ok('project', 'PRJ-11290-0001') && !ok('project', 'PRJ-1129-0001') && !ok('project', '1009100003921'));   // 건축HUB 관리번호는 id 가 아니다(기획서 결정 5)
  assert.ok(ok('stage', '01') && ok('stage', '06') && !ok('stage', '00') && !ok('stage', '07'));
  assert.ok(ok('agency', 'lh') && ok('agency', 'mnd') && !ok('agency', 'etc'));
  assert.ok(ok('month', '2026-10') && !ok('month', '2026-13') && !ok('month', '202610'));
  for (const d of Object.values(DETAILS)) assert.ok(d.list === '/' || Object.keys(SECTIONS).includes(d.list.slice(1)), `${d.list} 는 올라갈 목록이어야 한다`);
});

test('지도 섬이 스크립트를 불러오는 순서는 index.html 의 기존 로더와 같다(index.html 이 지도 마크업의 정본이라 어긋나면 지도가 안 열린다)', () => {
  const island = read('components/MapIsland.tsx'), html = read('index.html');
  const js = (s) => [...new Set([...s.matchAll(/['"]\/?(assets\/[^'"]+\.js|config\.js)['"]/g)].map((m) => m[1].replace(/^\//, '')))];   // preload 링크의 같은 주소는 첫 등장만
  assert.deepEqual(js(island), js(html));
  assert.ok(js(island).length >= 8);
  assert.match(island, /if \(w\.__mapBooted\) return;/);   // app.js 는 최상위 const 를 선언해 문서당 한 번만 돌아야 한다
});

test('지도는 루트 레이아웃이 따로이고(들어갈 때·나올 때 새 문서), 지도로 가는 링크는 <Link> 가 아니라 <a> 다', () => {
  assert.match(read('app/(map)/layout.tsx'), /<html lang="ko" data-map-shell="" suppressHydrationWarning>/);   // 지도도 저장된 테마를 첫 화면 전에 복원한다
  assert.match(read('app/(dashboard)/layout.tsx'), /<html lang="ko" suppressHydrationWarning>/);   // 라이트가 기본, 저장된 테마가 다크일 때만 그리기 전에 class=dark
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/layout.tsx')), '최상위 layout.tsx 가 있으면 두 레이아웃이 하나로 합쳐진다');
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /compact \|\| m\.id === 'map'\s*\?\s*<a href=\{m\.href\}/);
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

test('옛 지도 주소(/?region=…)는 쿼리를 그대로 두고 /map 으로 보낸다', () => {
  const proxy = read('proxy.ts');
  assert.match(proxy, /const \{ search \} = request\.nextUrl;/);
  assert.match(proxy, /NextResponse\.redirect\(new URL\('\/map' \+ search, request\.url\)\)/);
  assert.match(proxy, /matcher: '\/'/);
});
