'use strict';
// tools/research/exa.js — Exa 요청 본문 모양만 확인한다(네트워크 호출 없음).
const test = require('node:test');
const assert = require('node:assert/strict');
const { searchBody, contentsBody } = require('../../tools/research/exa.js');

test('searchBody 는 질의와 auto 형식, highlights 만 담는다', () => {
  assert.deepEqual(searchBody('x'), { query: 'x', type: 'auto', contents: { highlights: true } });
  assert.deepEqual(searchBody('x', {}), { query: 'x', type: 'auto', contents: { highlights: true } });
});

test('searchBody 는 기간·스키마를 줄 때만 최상위 칸으로 더한다', () => {
  const schema = { type: 'object', properties: { a: { type: 'string' } } };
  assert.deepEqual(searchBody('x', { startDate: '2025-08-01', endDate: '2026-10-17', schema }), {
    query: 'x',
    type: 'auto',
    contents: { highlights: true },
    startPublishedDate: '2025-08-01',
    endPublishedDate: '2026-10-17',
    outputSchema: schema,
  });
  assert.deepEqual(searchBody('x', { startDate: '2025-08-01', endDate: null, schema: null }), {
    query: 'x',
    type: 'auto',
    contents: { highlights: true },
    startPublishedDate: '2025-08-01',
  });
});

test('contentsBody 는 urls 와 최상위 text 만 담는다', () => {
  const body = contentsBody(['https://a']);
  assert.deepEqual(body, { urls: ['https://a'], text: true });
  assert.equal('contents' in body, false);
});
