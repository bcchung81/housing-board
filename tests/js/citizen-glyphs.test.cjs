'use strict';
// /citizen 글자 기호·장식 아이콘 금지(2026-10-18 사용자 결정 '기호 + 장식 아이콘'):
// 화면에 보이는 글·title·aria·CSS content 에 이모지, 원 숫자·둘러싼 문자, 화살표, 도형, 꺾쇠(› ‹)를 쓰지 않는다. 방향·열림은 lucide 선 아이콘으로 그린다.
// 빼기로 한 장식 아이콘(카드 머리 배지·지도 제목·트로피·층·건물·확성기·달력·연필·집)은 스프라이트에도 마크업에도 없다.
// 검사 대상: template.html·search.js(주석 /* */ // <!-- --> 제외) + 빌드 결과 assets/citizen/index.html 의 보이는 텍스트·속성.
// 제외: 빌드 결과의 자료 JSON(공고 원문 이름 같은 외부 자료 문자열은 우리가 고치는 글이 아니다).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'tools', 'design', 'public-mock');
const read = (p) => fs.readFileSync(p, 'utf8');
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[\s;,{}()])\/\/.*$/, '$1')).join('\n');
const BAD = /[\u{1F000}-\u{1FFFF}☀-➿①-⓿←-⇿■-◿›‹]/gu;
const found = (s) => [...new Set(s.match(BAD) || [])];
const ids = (s) => [...s.matchAll(/#i-([a-z0-9-]+)/g)].map((m) => m[1]);
/* 장식 아이콘 id: 쓰지 않는다. (map = 큰 지도 단추, home = 내 동네로 정하기 같은 기능 아이콘은 남긴다) */
const DECOR = ['cal', 'bldg', 'mega', 'trophy', 'layers', 'pencil', 'chart', 'list'];

test('템플릿·검색 스크립트의 화면 문자열에 이모지·원 숫자·화살표·도형·꺾쇠 글자가 없다', () => {
  for (const f of ['template.html', 'search.js']) assert.deepEqual(found(noComments(read(path.join(SRC, f)))), [], f);
});

test('빌드 결과(/citizen)의 보이는 글·속성에도 없다(자료 JSON 제외)', () => {
  const h = read(path.join(ROOT, 'assets', 'citizen', 'index.html'));
  const body = noComments(h.replace(/<script[^>]*>[\s\S]*?<\/script>/g, (m) => (/const D\s*=/.test(m) ? '' : m)));
  assert.deepEqual(found(body.replace(/<style[\s\S]*?<\/style>/g, (m) => m)), []);
});

test('장식 아이콘(카드 머리 배지·트로피·층·연필 등)은 스프라이트와 마크업에 없다', () => {
  const t = noComments(read(path.join(SRC, 'template.html')));
  assert.ok(!/badgeIcon|ui-badge-icon/.test(t), '배지 아이콘 부품');
  const used = new Set(ids(t));
  for (const d of DECOR) assert.ok(!used.has(d), `#i-${d} 사용`);
  const b = read(path.join(SRC, 'build.js'));
  const m = b.match(/const ICONS = \{([\s\S]*?)\n\};/);
  for (const d of DECOR) assert.ok(!new RegExp(`\\b${d}:`).test(m[1]), `스프라이트 ${d}`);
});
