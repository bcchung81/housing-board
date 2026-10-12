'use strict';
// 건축HUB 대용량 내려받기 도구(tools/ledger/fetch-hub-bulk.js)의 순수 부분: 목록 응답 해석·파일 식별자 고르기·이름 규칙. 가짜 응답만 쓰고 네트워크는 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../tools/ledger/fetch-hub-bulk');

const row = (group, task, name, ym, prov, id) => `<li>
 <div class="block"><p class="tagset primary">주택인허가</p></div>
 <div class="block flex-1"><p class="tit">${name} (${ym.slice(0, 4)}년 ${ym.slice(5)}월)</p>
 <div class="position"><span>데이터제공년월</span>
 <span class="detail">${prov}</span></div></div>
 <button onclick="fnDownloadPop('${group}','${task}','${id}')">전체</button></li>`;
const PAGE = `<meta name="_csrf_parameter" content="_csrf" /><meta name="_csrf_header" content="X-CSRF-TOKEN" /><meta name="_csrf" content="tok-123" />
<span class="title-count">총 <em>4</em>건</span><ul>
${row('02', '0211', '행위개요', '2026-08', '2026-09', 'OPN_ACT_08')}
${row('02', '0201', '기본개요', '2026-08', '2026-09', 'OPN_BASIC_08')}
${row('02', '0201', '기본개요', '2026-07', '2026-08', 'OPN_BASIC_07')}
${row('01', '0101', '기본개요', '2026-08', '2026-09', 'OPN_OTHER')}
</ul>`;

test('_csrf 메타를 읽는다(없으면 null)', () => {
  assert.equal(F.parseCsrf(PAGE), 'tok-123');
  assert.equal(F.parseCsrf('<html></html>'), null);
});

test('목록 HTML 을 총건수·항목으로 해석한다', () => {
  const p = F.parseListHtml(PAGE);
  assert.equal(p.total, 4);
  assert.equal(p.items.length, 4);
  assert.deepEqual(p.items[1], { name: '기본개요', dataMonth: '2026-08', providedMonth: '2026-09', group: '02', task: '0201', fileId: 'OPN_BASIC_08' });
  assert.equal(F.parseListHtml('<html>없음</html>').items.length, 0);
});

test('종류·데이터 월로 파일 식별자를 고른다(구분 01 은 제외)', () => {
  const { items } = F.parseListHtml(PAGE);
  assert.equal(F.pickFile(items, 'basic', '2026-08').fileId, 'OPN_BASIC_08');
  assert.equal(F.pickFile(items, 'basic', '2026-07').fileId, 'OPN_BASIC_07');
  assert.equal(F.pickFile(items, 'act', '2026-08').fileId, 'OPN_ACT_08');
  assert.equal(F.pickFile(items, 'site', '2026-08'), null);
  assert.equal(F.pickFile(items, 'basic', '2026-09'), null);
  assert.throws(() => F.pickFile(items, 'nope', '2026-08'), /알 수 없는 종류/);
  assert.throws(() => F.pickFile([...items, items[1]], 'basic', '2026-08'), /고를 수 없다/);
});

test('파일 이름 규칙: 기본은 주택인허가_종류_월, history 는 basic-월(기본개요만)', () => {
  assert.equal(F.zipName('basic', '2026-08'), '주택인허가_기본개요_2026-08.zip');
  assert.equal(F.zipName('act', '2026-08', 'bulk'), '주택인허가_행위개요_2026-08.zip');
  assert.equal(F.zipName('site', '2026-08'), '주택인허가_대지위치_2026-08.zip');
  assert.equal(F.zipName('basic', '2025-01', 'history'), 'basic-2025-01.zip');
  assert.throws(() => F.zipName('act', '2025-01', 'history'), /basic/);
});

test('열 수·다음 달 계산', () => {
  assert.equal(F.countPipes('a|b|c'), 3);
  assert.equal(F.countPipes('a'), 1);
  assert.equal(F.nextMonth('2026-08'), '2026-09');
  assert.equal(F.nextMonth('2025-12'), '2026-01');
  assert.equal(F.KINDS.basic.cols, 29);
  assert.equal(F.KINDS.act.cols, 42);
  assert.equal(F.KINDS.site.cols, 21);
});
