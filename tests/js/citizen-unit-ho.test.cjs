'use strict';
// 일반사용자 화면 주택 수 단위 '집' 금지(2026-10-18 사용자 지시 '집이라는 표기를 호로 전체 수정', 이름은 '공급 예정 호수').
// 숫자·`}` 바로 뒤의 '집'(단위), 낱말로 서 있는 '집', '들어올 집', '집 수'가 화면 문자열에 없다. 모집·집계·수집 같은 낱말은 걸리지 않는다.
// 대상: template.html·search.js(주석 제외), 빌드 결과 assets/citizen/index.html 의 보이는 글(자료 JSON 제외), /map 일반사용자 문구(page.tsx·overview.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[\s;,{}()])\/\/.*$/, '$1')).join('\n');
const BAD = /(?<=[\d}])집|(?<![가-힣])집(?![가-힣])|들어올 집|집 수/g;
const found = (s) => [...new Set(s.match(BAD) || [])];

test('템플릿·검색 스크립트의 화면 문자열에 단위 집이 없다', () => {
  for (const f of ['template.html', 'search.js']) assert.deepEqual(found(noComments(read('tools', 'design', 'public-mock', f))), [], f);
});

test('빌드 결과(/citizen)의 보이는 글에 단위 집이 없다(자료 JSON 제외)', () => {
  const h = read('assets', 'citizen', 'index.html');
  assert.deepEqual(found(noComments(h.replace(/<script[^>]*>[\s\S]*?<\/script>/g, (m) => (/const D\s*=/.test(m) ? '' : m)))), []);
});

test('/map 일반사용자 문구는 공급 예정 호수', () => {
  const page = read('app', '(map)', 'map', 'page.tsx');
  assert.deepEqual(found(noComments(page)), []);
  assert.match(page, /className="ov-aud-public">수도권 공급 예정 호수</);
  assert.deepEqual(found(noComments(read('assets', 'js', 'overview.js'))), []);
});
