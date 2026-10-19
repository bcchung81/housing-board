'use strict';
// <title>(SVG 툴팁 포함)의 자식은 글자 하나여야 한다. React 서버 렌더(Fizz)는 자식이 둘 이상인 <title>(예: <title>{n} — 설명</title>)을
// 빈 <title></title> 로 내보내고, 브라우저는 글자를 채워 그려 수화(hydration)가 어긋난다. 그러면 React 가 루트(<html>)를 클라이언트에서 다시 그리며
// 첫 그림 전 스크립트(THEME_INIT)가 붙인 html.dark 를 지워 다크 테마가 풀린다(2026-10-18 /region 지도 시군구 면 툴팁에서 실측).
// 바른 꼴: <title>{`${n} — 설명`}</title> 또는 <title>{n}</title> 또는 글자만.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DIRS = ['app', 'components', 'lib'];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : /\.(tsx|jsx)$/.test(d.name) ? [p] : [];
});

/* 자식이 글자뿐이거나({ 없음) 처음부터 끝까지 {…} 표현식 하나인지 */
const single = (s) => {
  const t = s.trim();
  if (!t.includes('{')) return true;
  if (t[0] !== '{') return false;
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '{') depth++;
    else if (t[i] === '}' && --depth === 0) return i === t.length - 1;
  }
  return false;
};

test('JSX <title> 의 자식은 글자 하나다(서버가 빈 title 을 내보내 수화가 어긋나지 않게)', () => {
  const bad = [];
  for (const f of DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/g)) {
      if (!single(m[1])) bad.push(`${path.relative(ROOT, f)}:${src.slice(0, m.index).split('\n').length}  ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('검사 함수: 섞인 자식은 잡고 글자·표현식 하나는 통과', () => {
  assert.equal(single('{g.n} — 누르면 고르기'), false);
  assert.equal(single('{a}{b}'), false);
  assert.equal(single('{`${g.n} — 누르면 고르기`}'), true);
  assert.equal(single('{x.n}'), true);
  assert.equal(single('종로구'), true);
});
