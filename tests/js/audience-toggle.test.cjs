/* 보기 대상 스위치(TopNav)와 관점 규칙(AUDIENCE_INIT), 스위치 부품(components/ui/switch.tsx) — header-unify-spec 1·2절 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* switch.tsx 를 CJS 로 옮겨 실제로 그려 본다(같은 폴더 기준으로 'cn'·react 를 찾는다) */
function loadSwitch() {
  const file = path.join(ROOT, 'components/ui/switch.tsx');
  const out = ts.transpileModule(read('components/ui/switch.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(out, file);
  return m.exports.Switch;
}

test('스위치 부품: <button type="button" role="switch" aria-checked>, 48×28 트랙·22px 손잡이·20px 이동·44px 누름 영역', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Switch = loadSwitch();
  const draw = (checked, on) => renderToStaticMarkup(React.createElement(Switch, { checked, on, onCheckedChange() {}, 'aria-label': '다크 모드', offIcon: React.createElement('i', null, 'off'), onIcon: React.createElement('i', null, 'on') }));
  const off = draw(false, 'dark');
  assert.match(off, /^<button type="button" role="switch" aria-checked="false"/);
  assert.match(off, /aria-label="다크 모드"/);
  assert.match(draw(true, 'admin'), /role="switch" aria-checked="true"/);
  for (const c of ['h-7 w-12', 'rounded-full', 'border-line2 bg-muted', 'before:-inset-y-2', 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground', 'motion-reduce:transition-none']) assert.ok(off.includes(c), c);
  for (const c of ['size-[22px]', 'top-0.5 left-0.5', 'bg-white', 'shadow-card', 'duration-150', '[&amp;_svg]:size-3.5', 'dark:text-primary-foreground']) assert.ok(off.includes(c), c);
  /* 켜짐 모양은 첫 그림 전 표시(html.dark / html[data-aud=admin])를 보는 CSS 로 그린다 */
  assert.ok(off.includes('dark:translate-x-5') && off.includes('dark:bg-primary'));
  const adm = draw(false, 'admin');
  for (const c of ['[html[data-aud=admin]_&amp;]:translate-x-5', '[html[data-aud=admin]_&amp;]:bg-foreground', 'dark:[html[data-aud=admin]_&amp;]:bg-primary']) assert.ok(adm.includes(c), c);
});

test('TopNav: 보기 대상 스위치(사람/서류가방)와 테마 스위치(해/달), 오른쪽 묶음 순서·간격', () => {
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /<Switch on="admin" checked=\{aud === 'admin'\}[^\n]*aria-label="정책담당자 화면" offIcon=\{<User [^>]*\/>\} onIcon=\{<BriefcaseBusiness [^>]*\/>\} \/>/);
  assert.match(nav, /<Switch on="dark" checked=\{dark\}[^>]*aria-label="다크 모드"[^>]*offIcon=\{<Sun [^>]*\/>\} onIcon=\{<Moon [^>]*\/>\} \/>/);
  assert.ok(nav.includes('title="일반사용자 ↔ 정책담당자 화면 바꾸기"'));
  assert.doesNotMatch(nav, /role="group" aria-label="보기 대상"/, '옛 분절 토글은 없다');
  assert.doesNotMatch(nav, /aria-pressed=\{dark\}/, '옛 테마 단추는 없다');
  const a = nav.indexOf('<Switch on="admin"'), t = nav.indexOf('<Switch on="dark"'), m = nav.indexOf('aria-label="메뉴"');
  assert.ok(a > 0 && a < t && t < m, '보기 대상 → 테마 → 메뉴 단추');
  assert.match(nav, /<div className="flex items-center gap-3">/, '스위치끼리 12px');
  assert.match(nav, /className="ml-1 hidden size-9/, '메뉴 단추 앞 4px');
  /* 양옆 글자는 모든 폭에서 14px 로 둘 다 보인다(지금 관점 진하게) */
  assert.match(nav, /font-sans text-sm" title=/);
  assert.doesNotMatch(nav, /text-\[13px\]/);
  assert.match(nav, /font-bold text-foreground \[html\[data-aud=admin\]_&\]:font-normal[^"]*" onClick=\{\(\) => chooseAudience\('public'\)\}>일반사용자</);
  assert.match(nav, /\[html\[data-aud=admin\]_&\]:font-bold[^"]*" onClick=\{\(\) => chooseAudience\('admin'\)\}>정책담당자</);
  assert.doesNotMatch(nav.slice(nav.indexOf('onClick={() => chooseAudience(\'public\')}')-200, nav.indexOf('>정책담당자</span>')), /max-\[599px\]/);
});

test("TopNav: 로고·'종합상황판' 은 관점 첫 화면(일반사용자 /citizen, 정책담당자 '/'), 스위치를 바꾸면 저장하고 그 첫 화면으로", () => {
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /const homeOf = \(a: Audience \| null\) => \(a === 'public' \? '\/citizen' : '\/'\);/);
  assert.match(nav, /const href = m\.id === 'home' \? home : m\.id === 'map' \? mapTo : m\.href;/);
  assert.match(nav, /href=\{home\} aria-label="The주택 종합상황판 처음으로"/);
  assert.match(nav, /setAud\(next\)/, '수화 뒤 경로 규칙으로 맞춘다');
  assert.match(nav, /localStorage\.setItem\('audience', next\)/);
  assert.match(nav, /document\.documentElement\.dataset\.aud = next;/);
  assert.match(nav, /window\.location\.assign\(peerHref\(pathname, window\.location\.search, next\) \?\? homeOf\(next\)\)/, '짝 화면이 있으면 그리로, 없으면 관점 첫 화면');
  /* homeOf 를 실제로 돌려 본다 */
  const homeOf = new Function(`return ${nav.match(/const homeOf = (\(a: Audience \| null\) => [^;]*);/)[1].replace(': Audience | null', '')}`)();
  assert.equal(homeOf('public'), '/citizen');
  assert.equal(homeOf('admin'), '/');
  assert.equal(homeOf(null), '/', "수화 전에는 '/'(AUDIENCE_INIT 이 일반사용자를 /citizen 으로 넘긴다)");
});

function run(pathname, saved, throws = false) {
  const src = read('lib/shell/theme.ts').match(/AUDIENCE_INIT = "(.*)";/)[1].replace(/\\"/g, '"');
  const calls = [];
  const location = { pathname, replace: (u) => calls.push(u) };
  const localStorage = { getItem: () => { if (throws) throw new Error('막힘'); return saved; } };
  const document = { documentElement: { dataset: {} } };
  new Function('location', 'localStorage', 'document', src)(location, localStorage, document);
  return { calls, aud: document.documentElement.dataset.aud };
}

test("AUDIENCE_INIT: html[data-aud] 를 정한다(없음·public → 'public', admin → 'admin')", () => {
  assert.equal(run('/map', null).aud, 'public');
  assert.equal(run('/projects', 'public').aud, 'admin', '정책담당자 전용 화면은 저장값과 상관없이 admin');
  for (const p of ['/', '/region', '/sources', '/month/2026-09', '/agency/lh']) assert.equal(run(p, 'public').aud, 'admin', p);
  for (const p of ['/citizen/projects', '/citizen/schedule']) for (const v of [null, 'public', 'admin']) assert.equal(run(p, v).aud, 'public', `${p} 는 저장값과 상관없이 일반사용자(${v})`);
  assert.deepEqual(run('/citizen/projects', null, true), { calls: [], aud: 'public' }, '일반사용자 화면은 저장소를 못 써도 public');
  assert.equal(run('/projects', 'admin').aud, 'admin');
  assert.equal(run('/map', 'x').aud, 'public');
  assert.equal(run('/map', 'public').aud, 'public');
  assert.equal(run('/map', 'admin').aud, 'admin');
  assert.deepEqual(run('/', null, true), { calls: [], aud: 'admin' }, '저장소를 못 쓰면 넘기지 않는다(전용 화면은 admin)');
  assert.deepEqual(run('/map', null, true), { calls: [], aud: 'public' }, '/map 은 저장값을 못 읽으면 일반사용자');
});

test("AUDIENCE_INIT: '/' 에서만, 정책담당자가 아니면(없음·public) /citizen 으로 보낸다", () => {
  assert.deepEqual(run('/', null).calls, ['/citizen']);
  assert.deepEqual(run('/', 'public').calls, ['/citizen']);
  assert.deepEqual(run('/', 'admin').calls, []);
  assert.deepEqual(run('/map', null).calls, []);
  assert.deepEqual(run('/projects', 'public').calls, []);
});

test('두 레이아웃((dashboard)·(map))이 THEME_INIT 뒤에 AUDIENCE_INIT 을 넣는다', () => {
  for (const f of ['app/(dashboard)/layout.tsx', 'app/(map)/layout.tsx']) {
    const layout = read(f);
    assert.match(layout, /import \{ AUDIENCE_INIT, THEME_INIT \} from '@\/lib\/shell\/theme';/, f);
    const a = layout.indexOf('<script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />');
    const b = layout.indexOf('<script dangerouslySetInnerHTML={{ __html: AUDIENCE_INIT }} />');
    assert.ok(a > 0 && b > a, f);
  }
});

/* proxy.ts 의 추적용 쿼리 판별(순수 함수)과 머리 줄 구분선 */
test('isTrackingOnly: 추적 키만이면 true, 하나라도 다른 키가 있으면 false, 빈 쿼리는 false', () => {
  const out = ts.transpileModule(read('proxy.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const file = path.join(ROOT, 'proxy.ts');
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(ROOT);
  m._compile(out, file);
  const t = (q) => m.exports.isTrackingOnly(new URLSearchParams(q));
  assert.equal(t('fbclid=a'), true);
  assert.equal(t('utm_source=x&utm_medium=y'), true);
  assert.equal(t('gclid=1&ref=kakao&_ga=2'), true);
  assert.equal(t('region=서울'), false);
  assert.equal(t('fbclid=a&code=1'), false);
  assert.equal(t('utm_source=x&pnu=1'), false);
  assert.equal(t(''), false);
  assert.match(read('proxy.ts'), /search && !isTrackingOnly\(searchParams\)/);
});

test('TopNav: 보기 대상 묶음과 테마 스위치 사이에 1×20px 구분선(--border), 599px 이하에서는 없고 테마는 펼침 메뉴 맨 아래 줄', () => {
  const src = read('components/TopNav.tsx');
  const i = src.indexOf('aria-label="정책담당자 화면"');
  const d = src.indexOf('data-role="switch-divider"');
  const th = src.indexOf('aria-label="다크 모드"');
  assert.ok(i > 0 && i < d && d < th);
  assert.match(src.slice(d - 40, d + 160), /h-5 w-px shrink-0 bg-border max-\[599px\]:hidden/);
  assert.match(src.slice(th, th + 120), /className="max-\[599px\]:hidden"/, '머리 줄 테마 스위치는 599 이하에서 숨김');
  const row = src.indexOf('max-[599px]:flex font-normal"><span aria-hidden="true">다크 모드</span>');
  assert.ok(row > src.indexOf('{items}</ul>') && src.indexOf('<Switch on="dark"', row) > row, '펼침 메뉴 목록 아래 줄에 테마 스위치');
  assert.match(src, /<div className="flex items-center gap-3">/);
});

test('TopNav: 앱 안 이동으로 경로가 바뀌면 usePathname 변화에 맞춰 html[data-aud] 를 다시 정한다', () => {
  const src = read('components/TopNav.tsx');
  assert.match(src, /const next = displayAudience\(pathname, saved\);\s*document\.documentElement\.dataset\.aud = next;\s*setAud\(next\);[\s\S]*?setMapTo\(next === 'public' \? mapHref\(myAreaScope\(area\)\) : '\/map'\);\s*\}, \[pathname\]\);/);
  const theme = read('lib/shell/theme.ts');
  const out = ts.transpileModule(theme, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', out)(m, m.exports);
  const { displayAudience } = m.exports;
  assert.equal(displayAudience('/projects', 'public'), 'admin');
  assert.equal(displayAudience('/', 'public'), 'admin');
  assert.equal(displayAudience('/map', 'public'), 'public');
  assert.equal(displayAudience('/map', 'admin'), 'admin');
  assert.equal(displayAudience('/citizen/projects', 'admin'), 'public');
  assert.equal(displayAudience('/citizen/schedule', 'public'), 'public');
});

test('TopNav: 사업·지역 공급·데이터 원본만 정책담당자 표지(adminOnly)이고 html[data-aud=public] 이면 CSS 로 숨긴다', () => {
  const menu = read('lib/shell/menu.ts');
  const flagged = [...menu.matchAll(/\{ id: '(\w+)'[^}]*adminOnly: true[^}]*\}/g)].map((m) => m[1]);
  assert.deepEqual(flagged, ['projects', 'region', 'sources']);
  assert.deepEqual([...menu.matchAll(/\{ id: '(\w+)'[^}]*publicOnly: true[^}]*\}/g)].map((m) => m[1]), ['find', 'schedule'], '일반사용자 전용: 사업 찾기·공급 일정');
  assert.doesNotMatch(menu, /id: 'home'[^}]*adminOnly/);
  assert.doesNotMatch(menu, /id: 'map'[^}]*adminOnly/);
  const nav = read('components/TopNav.tsx');
  assert.ok(nav.includes("m.adminOnly && '[html[data-aud=public]_&]:hidden'"), '숨김 선택자');
  assert.ok(nav.includes("m.publicOnly && '[html[data-aud=admin]_&]:hidden'"), '일반사용자 전용 숨김 선택자');
  assert.ok(nav.includes("data-aud-only={m.adminOnly ? 'admin' : m.publicOnly ? 'public' : undefined}"), '표지');
  /* 가로 메뉴와 펼침 메뉴가 같은 items 를 쓰므로 둘 다 적용된다 */
  assert.equal((nav.match(/\{items\}/g) || []).length, 2);
  assert.match(nav, /m\.id === 'map' \|\| href === '\/citizen'/, '지도 <a> 규칙 그대로');
});

test("peerHref: 보기 대상 스위치는 짝 화면(사업 ↔ 사업 찾기 · 지역 공급 ↔ 공급 일정)으로, 지역·사업 쿼리만 넘긴다", () => {
  const { peerHref } = require('../../lib/shell/menu.ts');
  assert.equal(peerHref('/citizen/projects', '?sgg=28245&stage=build&q=a&id=PRJ-28245-0052', 'admin'), '/projects?sgg=28245&id=PRJ-28245-0052', '단계·검색은 두 화면의 값이 달라 버린다');
  assert.equal(peerHref('/citizen/projects', '?sido=metro', 'admin'), '/projects', '정책 화면 기본이 수도권');
  assert.equal(peerHref('/projects', '?sido=11&status=check', 'public'), '/citizen/projects?sido=11');
  assert.equal(peerHref('/projects', '?sido=26&id=PRJ-26110-0001', 'public'), '/citizen/projects?id=PRJ-26110-0001', '수도권 밖 지역은 넘기지 않는다');
  assert.equal(peerHref('/region', '?sido=41', 'public'), '/citizen/schedule?sido=41');
  assert.equal(peerHref('/citizen/schedule', '', 'admin'), '/region');
  for (const [p, n] of [['/', 'public'], ['/map', 'admin'], ['/sources', 'public'], ['/projects', 'admin'], ['/citizen/projects', 'public']]) assert.equal(peerHref(p, '', n), null, `${p} → ${n}: 관점 첫 화면`);
});
