'use strict';
// lib/board/ledger-source.ts — 원장 집계를 Supabase(api.board)에서 읽고, 안 되면 JSON 으로 대체한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = read('lib/board/ledger-source.ts');
const json = require('../../data/board/ledger-board.json');

test('공개용 키와 api 스키마로 읽고, 1시간 재검증이며, 비밀 키는 쓰지 않는다', () => {
  assert.match(src, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(src, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(src, /'Accept-Profile': 'api'/);
  assert.match(src, /revalidate: 3600/);
  assert.match(src, /AbortSignal\.timeout\(4000\)/);
  assert.doesNotMatch(src, /SUPABASE_SECRET_KEY|SUPABASE_DB_URL|SERVICE_ROLE/);
  assert.match(src, /import \{ ledger as ledgerJson \} from '\.\/data'/);
});

test('page.tsx 는 data.ts 의 ledger 를 직접 가져오지 않고 loadLedgerBoard 를 쓴다', () => {
  const page = read('app/(dashboard)/page.tsx');
  const imp = page.match(/import \{([^}]*)\} from '\.\.\/\.\.\/lib\/board\/data'/)[1];
  assert.doesNotMatch(imp, /\bledger\b/);
  assert.match(page, /await loadLedgerBoard\(\)/);
});

test('대체 경로: 환경변수 없음·HTTP 오류·빈 결과·모양 불량·예외 모두 JSON 으로 돌아가며 한 줄만 경고한다', () => {
  for (const m of [/환경변수 없음/, /HTTP \$\{res\.status\}/, /결과 없음/, /모양 검사 실패/, /catch \(e\)/]) assert.match(src, m);
  assert.match(src, /origin: 'json'/);
  assert.equal(json.schema, 'ledger-board/1');
});

test('캐시: fetch 는 no-store, 성공한 결과만 unstable_cache(ledger-board, 3600)에 남고 실패는 던지며 바깥에서 JSON 으로 대체', () => {
  assert.match(src, /cache: 'no-store'/);
  assert.doesNotMatch(src, /next: \{ revalidate/);
  assert.match(src, /unstable_cache\(fetchSupabase, \['ledger-board'\], \{ revalidate: 3600, tags: \['ledger-board'\] \}\)/);
  const inner = src.slice(src.indexOf('const fetchSupabase'), src.indexOf('const cachedSupabase'));
  for (const m of [/throw new Error\(`HTTP/, /throw new Error\('결과 없음'\)/, /throw new Error\('모양 검사 실패'\)/]) assert.match(inner, m);
  assert.doesNotMatch(inner, /fallback|ledgerJson/);
  const outer = src.slice(src.indexOf('export async function loadLedgerBoard'));
  assert.match(outer, /await cachedSupabase\(url, key\)/);
  assert.match(outer, /catch \(e\)[\s\S]*fallback\(/);
});
