// 저장된 선택(localStorage 'theme')이 없으면 세 진입점(앱 THEME_INIT·/citizen 템플릿·지도 레이아웃) 모두 라이트, 'dark' 저장값이면 다크.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function run(code, store, throws) {
  const cls = new Set();
  const ctx = {
    document: { documentElement: { classList: { add: (c) => cls.add(c) }, dataset: {} } },
    localStorage: { getItem: (k) => { if (throws) throw new Error('blocked'); return store[k] ?? null; } },
    location: { pathname: '/citizen/', replace() {} },
    matchMedia: () => ({ matches: true }), // 시스템이 다크여도 따르지 않는다
  };
  vm.runInNewContext(code, ctx);
  return cls.has('dark');
}

const THEME_INIT = (() => { const m = read('lib/shell/theme.ts').match(/export const THEME_INIT = "(.*)";/); return JSON.parse(`"${m[1]}"`); })();
const TPL = (() => { const m = read('tools/design/public-mock/template.html').match(/<script>(\(function \(\) \{ var h = document\.documentElement, a = 'public';[\s\S]*?)<\/script>/); return m[1].replace(/\bh\b = document/, 'h = document'); })();

for (const [name, code] of [['THEME_INIT', THEME_INIT], ['/citizen 템플릿', TPL]]) {
  test(`${name}: 저장값 없음 → 라이트(시스템 다크 무시), 'dark' → 다크, 'light' → 라이트, 저장소 예외 → 라이트`, () => {
    assert.equal(run(code, {}), false);
    assert.equal(run(code, { theme: 'dark' }), true);
    assert.equal(run(code, { theme: 'light' }), false);
    assert.equal(run(code, {}, true), false);
  });
}

test('지도 레이아웃은 THEME_INIT 를 쓰고 지도 스크립트·두 레이아웃은 시스템 설정을 읽지 않는다', () => {
  assert.match(read('app/(map)/layout.tsx'), /__html: THEME_INIT/);
  for (const f of ['lib/shell/theme.ts', 'components/TopNav.tsx', 'assets/js/app.js', 'assets/js/overview.js', 'app/(map)/layout.tsx', 'app/(dashboard)/layout.tsx'])
    if (fs.existsSync(path.join(root, f))) assert.doesNotMatch(read(f), /prefers-color-scheme/, f);
  assert.doesNotMatch(read('app/(map)/layout.tsx'), /<html[^>]*className="dark"/);
});
