'use strict';
// 서비스 이름 '더주택'(2026-10-19 사용자 지시, 이전 'The주택'): 소스·빌드 결과에 옛 이름이 없고 로고 벡터에 'The' 손그림이 없다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FILES = ['app/(dashboard)/layout.tsx', 'app/(map)/layout.tsx', 'index.html', 'components/TopNav.tsx', 'tools/design/public-mock/template.html', 'tools/design/public-mock/build.js', 'assets/citizen/index.html', 'docs/design/대국민-모드-시안.html', 'docs/design/the-jutaek-logo/the-jutaek-refined.svg'];

test('옛 이름 The주택 이 화면·탭 제목·접근 이름에 없다', () => {
  for (const f of FILES) assert.ok(!read(f).includes('The주택'), `${f}: The주택`);
  assert.match(read('components/TopNav.tsx'), /aria-label="더주택 종합상황판 처음으로"/);
});

test('로고 벡터에 The 손그림(translate(80 9.1) scale(2.275))이 없고 viewBox 202×64', () => {
  for (const f of ['components/TopNav.tsx', 'tools/design/public-mock/template.html', 'docs/design/the-jutaek-logo/the-jutaek-refined.svg']) {
    const s = read(f);
    assert.ok(!s.includes('translate(80 9.1) scale(2.275)'), f);
    assert.ok(s.includes('viewBox="0 0 202 64"'), f);
  }
});
