'use strict';
// 2026-10-18 /citizen 배색 안 2(색 카드)가 기본값이다: globals 의 html[data-page="citizen"] 블록이 값을 갖고, ?pal 시안 처리 코드는 없다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const tpl = fs.readFileSync(path.join(root, 'tools', 'design', 'public-mock', 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const block = (sel) => (css.match(new RegExp(sel.replace(/[.[\]"]/g, '\\$&') + ' \\{([^}]*)\\}')) || [])[1] || '';

test('template 은 data-page="citizen" 이고 시안 코드가 없다', () => {
  assert.match(tpl, /<html lang="ko" data-elev="raised" data-page="citizen">/, '범위 속성은 html 태그에 직접(스크립트로 켜지 않는다)');
  assert.doesNotMatch(tpl, /dataset\.page = /);
  assert.doesNotMatch(tpl, /data-pal|pal-css|pal-warm|[?&]pal=/);
});

test('안 2 라이트·다크 값이 globals 에 고정돼 있다', () => {
  const L = block('html[data-page="citizen"]'), D = block('html.dark[data-page="citizen"]');
  for (const v of ['--primary: #1F53B8', '--cz-accent: #B6351B', '--cz-summary-bg: #0E5E66']) assert.ok(L.includes(v), v);
  for (const v of ['--primary: #8BB4FE', '--cz-accent: #FD8965', '--cz-summary-bg: #0B4D54']) assert.ok(D.includes(v), v);
});

test('.ap-card 에 배경색 규칙이 없다(cz-apply 토큰 0) — 지금 신청 카드는 기본 카드(2026-10-19 사용자 결정)', () => {
  assert.doesNotMatch(tpl, /cz-apply/);
  assert.doesNotMatch(css, /cz-apply/);
});

test('지도 램프(안 2)는 :root·.dark 기본값이라 /map 개요와 /citizen 이 같이 쓴다(2026-10-18) — /citizen 블록은 덮지 않는다', () => {
  for (const v of ['--map-ov-1: #D5E88A', '--map-ov-2: #63D18F', '--map-ov-3: #0D9FA6', '--map-ov-4: #0168B4', '--map-ov-5: #3A2F8E', '--map-ov-ink-3: #0B1A33']) assert.match(css, new RegExp(`\\n:root \\{[^}]*${v}`), `:root ${v}`);
  for (const v of ['--map-ov-1: #E9F098', '--map-ov-2: #75DF8F', '--map-ov-3: #0AB8B9', '--map-ov-4: #0375C9', '--map-ov-5: #4D42C1']) assert.match(css, new RegExp(`\\n\\.dark \\{[^}]*${v}`), `.dark ${v}`);
  for (const sel of ['html[data-page="citizen"]', 'html.dark[data-page="citizen"]']) assert.doesNotMatch(block(sel), /--map-ov-/, `${sel} 에 지도 램프 없음`);
});

test('정책 화면 :root 주색은 그대로다', () => {
  assert.match(css, /:root \{[^}]*--primary: #23466D/);
});
