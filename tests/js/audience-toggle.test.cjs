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
  for (const c of ['size-[22px]', 'top-0.5 left-0.5', 'bg-white', 'shadow-[0_1px_2px_rgb(0_0_0/25%)]', 'duration-150', '[&amp;_svg]:size-3.5', 'dark:text-[#10243D]']) assert.ok(off.includes(c), c);
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
  /* 600px 이상 양옆 글자(지금 관점 진하게), 600px 미만 지금 관점 글자 하나만 스위치 왼쪽 */
  assert.match(nav, /font-bold text-foreground \[html\[data-aud=admin\]_&\]:font-normal[^"]*max-\[599px\]:\[html\[data-aud=admin\]_&\]:hidden" onClick=\{\(\) => chooseAudience\('public'\)\}>일반사용자</);
  assert.match(nav, /\[html\[data-aud=admin\]_&\]:font-bold[^"]*max-\[599px\]:-order-1 max-\[599px\]:hidden max-\[599px\]:\[html\[data-aud=admin\]_&\]:inline" onClick=\{\(\) => chooseAudience\('admin'\)\}>정책담당자</);
});

test("TopNav: 로고·'종합상황판' 은 관점 첫 화면(일반사용자 /citizen, 정책담당자 '/'), 스위치를 바꾸면 저장하고 그 첫 화면으로", () => {
  const nav = read('components/TopNav.tsx');
  assert.match(nav, /const homeOf = \(a: Audience \| null\) => \(a === 'public' \? '\/citizen' : '\/'\);/);
  assert.match(nav, /const href = m\.id === 'home' \? home : m\.href;/);
  assert.match(nav, /href=\{home\} aria-label="주택파동 종합상황판 처음으로"/);
  assert.match(nav, /setAud\(document\.documentElement\.dataset\.aud === 'admin' \? 'admin' : 'public'\)/, '수화 뒤 html[data-aud] 로 맞춘다');
  assert.match(nav, /localStorage\.setItem\('audience', next\)/);
  assert.match(nav, /document\.documentElement\.dataset\.aud = next;/);
  assert.match(nav, /window\.location\.assign\(homeOf\(next\)\)/);
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
  assert.equal(run('/projects', 'public').aud, 'public');
  assert.equal(run('/projects', 'admin').aud, 'admin');
  assert.equal(run('/map', 'x').aud, 'public');
  assert.deepEqual(run('/', null, true), { calls: [], aud: 'public' }, '저장소를 못 쓰면 일반사용자로 보이되 넘기지 않는다');
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
    assert.match(layout, /import \{ AUDIENCE_INIT, THEME_INIT \} from '\.\.\/\.\.\/lib\/shell\/theme';/, f);
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

test('TopNav: 보기 대상 묶음과 테마 스위치 사이에 1×20px 구분선(--border), 600px 미만에서도 유지', () => {
  const src = read('components/TopNav.tsx');
  const i = src.indexOf('aria-label="정책담당자 화면"');
  const d = src.indexOf('data-role="switch-divider"');
  const th = src.indexOf('aria-label="다크 모드"');
  assert.ok(i > 0 && i < d && d < th);
  assert.match(src.slice(d - 40, d + 160), /h-5 w-px shrink-0 bg-border/);
  assert.doesNotMatch(src.slice(d, d + 160), /max-\[599px\]:hidden/);
  assert.match(src, /<div className="flex items-center gap-3">/);
});

test('TopNav: 사업·지역 공급·데이터 원본만 정책담당자 표지(adminOnly)이고 html[data-aud=public] 이면 CSS 로 숨긴다', () => {
  const menu = read('lib/shell/menu.ts');
  const flagged = [...menu.matchAll(/\{ id: '(\w+)'[^}]*adminOnly: true[^}]*\}/g)].map((m) => m[1]);
  assert.deepEqual(flagged, ['projects', 'region', 'sources']);
  assert.doesNotMatch(menu, /id: 'home'[^}]*adminOnly/);
  assert.doesNotMatch(menu, /id: 'map'[^}]*adminOnly/);
  const nav = read('components/TopNav.tsx');
  assert.ok(nav.includes("m.adminOnly && '[html[data-aud=public]_&]:hidden'"), '숨김 선택자');
  assert.ok(nav.includes("data-aud-only={m.adminOnly ? 'admin' : undefined}"), '표지');
  /* 가로 메뉴와 펼침 메뉴가 같은 items 를 쓰므로 둘 다 적용된다 */
  assert.equal((nav.match(/\{items\}/g) || []).length, 2);
  assert.match(nav, /m\.id === 'map' \|\| href === '\/citizen'/, '지도 <a> 규칙 그대로');
});
