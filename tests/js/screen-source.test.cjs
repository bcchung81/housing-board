'use strict';
// lib/board/screen-source.ts — 화면 자료 4종(molit·lh·sources·registry)을 Supabase(api.screens)에서 읽고, 안 되면 번들 JSON 4개를 모두 쓴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = read('lib/board/screen-source.ts');

test('공개용 키와 api 스키마로 api.screens 를 읽고, 1시간 재검증이며, 비밀 키는 쓰지 않는다', () => {
  assert.match(src, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(src, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(src, /\/rest\/v1\/screens\?select=key,month,reference_date,run_id,payload/);
  assert.match(src, /'Accept-Profile': 'api'/);
  assert.match(src, /AbortSignal\.timeout\(4000\)/);
  assert.doesNotMatch(src, /SUPABASE_SECRET_KEY|SUPABASE_DB_URL|SERVICE_ROLE/);
});

test('캐시: fetch 는 no-store, 성공한 결과만 unstable_cache(screens, 3600, 태그 ledger-board)에 남고 실패는 던진다', () => {
  assert.match(src, /cache: 'no-store'/);
  assert.match(src, /unstable_cache\(fetchSupabase, \['screens'\], \{ revalidate: 3600, tags: \['ledger-board'\] \}\)/);
  const inner = src.slice(src.indexOf('const fetchSupabase'), src.indexOf('const cachedSupabase'));
  for (const m of [/throw new Error\(`HTTP/, /throw new Error\('결과 없음'\)/, /throw new Error\(`키 없음/, /throw new Error\(`모양 검사 실패/]) assert.match(inner, m);
  assert.doesNotMatch(inner, /fallback|Json/);
  for (const k of ['molit', 'lh', 'sources', 'registry']) assert.match(inner, new RegExp(`${k}: \\(p\\)|p\\('${k}'\\)`), k);
});

test('대체 경로: 환경변수 없음·HTTP 오류·키 누락·모양 불량·예외 모두 번들 JSON 4개 전체로 돌아가며 한 줄만 경고한다', () => {
  const outer = src.slice(src.indexOf('export async function loadScreens'));
  assert.match(outer, /fallback\('환경변수 없음'\)/);
  assert.match(outer, /catch \(e\)[\s\S]*fallback\(/);
  assert.match(outer, /console\.warn/);
  for (const j of ['molitJson', 'lhJson', 'sourcesJson', 'registryJson']) assert.match(outer, new RegExp(`\\b${j}\\b`), j);
  assert.match(outer, /origin: 'json'/);
});

// 모양 검사는 소스에서 CHECKS 만 떼어 실제로 돌려 본다(키 누락·모양 불량은 던진다 = 캐시되지 않고 전부 JSON 으로).
test('모양 검사: 번들 JSON 4개는 통과하고, 비어 있거나 모양이 다르면 거절한다', () => {
  const block = /const isObj[\s\S]*?\n\};\n/.exec(src)[0].replace(/: Record<string, \(p: unknown\) => boolean>/, '').replace(/\(v: unknown\): v is Record<string, unknown>/, '(v)').replace(/\(p\)/g, '(p)');
  const CHECKS = Function(`${block.replace(/ as const/g, '')}; return CHECKS;`)();
  const ok = { molit: require('../../data/board/molit.json'), lh: require('../../data/board/lh-completion.json'), sources: require('../../data/board/sources.json'), registry: require('../../registry/projects.json') };
  for (const k of Object.keys(ok)) { assert.ok(CHECKS[k](ok[k]), k); assert.ok(!CHECKS[k]({}), `${k} 빈 객체`); assert.ok(!CHECKS[k](null), `${k} null`); }
  assert.deepEqual(Object.keys(CHECKS).sort(), ['lh', 'molit', 'registry', 'sources']);
});

test('data.ts 는 getBoardData 하나로 원장(loadLedgerBoard)과 화면 자료(loadScreens)를 묶고 요청마다 한 번만 읽는다', () => {
  const data = read('lib/board/data.ts');
  assert.match(data, /export const getBoardData = cache\(/);
  assert.match(data, /loadScreens\(\)/);
  assert.match(data, /loadLedgerBoard\(\)/);
  assert.doesNotMatch(data, /\.json'/);
});

test('대시보드 화면은 번들 JSON 을 직접 가져오지 않고 getBoardData 로 읽는다', () => {
  const files = ['app/(dashboard)/page.tsx', 'app/(dashboard)/region/page.tsx', 'components/board/RealPanels.tsx', 'components/sources/Overview.tsx', 'components/sources/Summary.tsx'];
  for (const f of files) { const s = read(f); assert.match(s, /getBoardData/, f); assert.doesNotMatch(s, /board\/(molit|lh-completion|sources)\.json|registry\/projects\.json/, f); }
  for (const f of ['month/[id]', 'agency/[id]']) assert.doesNotMatch(read(`app/(dashboard)/${f}/page.tsx`), /dynamicParams/, f);
  assert.match(read('app/(dashboard)/layout.tsx'), /name="board-source"/);
});
