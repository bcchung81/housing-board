/* 보기 대상 토글(TopNav)과 첫 방문 기본 화면(AUDIENCE_INIT) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('TopNav 에 보기 대상 그룹과 두 칸이 있다', () => {
  const nav = read('components/TopNav.tsx');
  for (const s of ['role="group" aria-label="보기 대상"', 'href="/citizen"', '일반사용자', '정책담당자', "localStorage.setItem('audience', 'public')"]) {
    assert.ok(nav.includes(s), s);
  }
});

function run(pathname, saved) {
  const src = read('lib/shell/theme.ts').match(/AUDIENCE_INIT = "(.*)";/)[1].replace(/\\"/g, '"');
  const calls = [];
  const location = { pathname, replace: (u) => calls.push(u) };
  const localStorage = { getItem: () => saved };
  new Function('location', 'localStorage', src)(location, localStorage);
  return calls;
}

test("AUDIENCE_INIT: '/' 에서 정책담당자를 고른 적이 없으면(없음·public) /citizen 으로 보낸다", () => {
  assert.deepEqual(run('/', null), ['/citizen']);
  assert.deepEqual(run('/', 'public'), ['/citizen']);
  assert.deepEqual(run('/', 'admin'), []);
  assert.deepEqual(run('/map', null), []);
  assert.deepEqual(run('/projects', 'public'), []);
});

test('(dashboard) layout 은 THEME_INIT 바로 뒤에 AUDIENCE_INIT 을 넣는다', () => {
  const layout = read('app/(dashboard)/layout.tsx');
  const a = layout.indexOf('THEME_INIT }}');
  const b = layout.indexOf('AUDIENCE_INIT }}');
  assert.ok(a > 0 && b > a);
});
