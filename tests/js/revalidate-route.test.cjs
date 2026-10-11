'use strict';
// app/api/revalidate/route.ts 와 적재 도구의 화면 캐시 비우기 호출(소스 검사)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const route = read('app/api/revalidate/route.ts');
const loader = read('tools/ledger/supabase-load.js');

test('route: POST 만, 비밀 머리 필수(상수 시간 비교), 환경변수 없으면 503, 없거나 틀리면 401', () => {
  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)/);
  assert.match(route, /x-revalidate-secret/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /status: 503/);
  assert.match(route, /status: 401/);
});

test('route: 허용 태그는 ledger-board 하나, 그 외는 400, revalidateTag 는 expire 0', () => {
  assert.match(route, /ALLOWED_TAGS = \['ledger-board'\]/);
  assert.match(route, /status: 400/);
  assert.equal((route.match(/revalidateTag\(/g) || []).length, 1);
  assert.match(route, /revalidateTag\(tag, \{ expire: 0 \}\)/);
  assert.match(route, /revalidated: true, tag, at/);
});

test('loader: BOARD_REVALIDATE_URL 이 있을 때만, 모의 실행이 아닐 때만 POST 하고 실패는 경고만', () => {
  const fn = loader.slice(loader.indexOf('async function revalidateBoard'));
  assert.match(fn, /if \(!env\.BOARD_REVALIDATE_URL\) return/);
  assert.match(fn, /'x-revalidate-secret': env\.REVALIDATE_SECRET/);
  assert.match(fn, /tag: 'ledger-board'/);
  assert.match(fn, /console\.warn/);
  const dry = loader.indexOf('if (dryRun) {');
  const call = loader.indexOf('await revalidateBoard(env, log)');
  assert.ok(dry > 0 && call > dry, '호출은 dry-run 반환 뒤에 있다');
  assert.equal((loader.match(/revalidateBoard\(env, log\)/g) || []).length, 1);
});
