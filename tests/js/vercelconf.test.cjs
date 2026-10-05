'use strict';
/* vercel.json: 지도를 iframe 에 넣지 못하게 막는 헤더, 함수가 읽는 번들 파일 포함, 캐시 규칙 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const headersOf = (source) => Object.fromEntries((conf.headers.find((h) => h.source === source) || { headers: [] }).headers.map((h) => [h.key, h.value]));

test('모든 경로에 iframe 차단 헤더(X-Frame-Options DENY, CSP frame-ancestors none)가 붙는다', () => {
  const h = headersOf('/(.*)');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Content-Security-Policy'], "frame-ancestors 'none'");
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
});

test('저장소에 iframe 으로 지도를 넣는 곳이 없다(팝업 연결만 허용)', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'vendor' || e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = ['index.html', ...walk(path.join(ROOT, 'assets', 'js')).map((f) => path.relative(ROOT, f))];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /<iframe/i, f);
});

test('함수 설정: resolve 는 색인과 지역 region.json 을, bus 는 infra.json 을 번들에 포함하고 실행 시간 상한이 있다', () => {
  const fn = conf.functions;
  assert.equal(fn['api/v1/resolve.js'].includeFiles, 'regions/{index.json,*/region.json}');
  assert.equal(fn['api/bus.js'].includeFiles, 'regions/*/infra.json');
  assert.equal(fn['api/v1/codes/search.js'].includeFiles, 'regions/{index.json,*/region.json}');   // 검색 후보의 번들 유무(tier)를 resolve 와 같은 표로 정한다
  assert.match(fn['api/v1/codes/search.js'].excludeFiles, /\.cache\/\*\*/); assert.ok(fn['api/v1/codes/search.js'].maxDuration > 0 && fn['api/v1/codes/search.js'].maxDuration <= 60); assert.ok(fs.existsSync(path.join(ROOT, 'api/v1/codes/search.js')));
  assert.ok(fn['api/v1/buildings.js'].maxDuration >= 20 && fn['api/v1/buildings.js'].maxDuration <= 60); assert.match(fn['api/v1/buildings.js'].excludeFiles, /regions\/\*\*/);   // 건물 API 는 번들 파일을 읽지 않는다
  assert.ok(fs.existsSync(path.join(ROOT, 'api/v1/buildings.js')));
  assert.ok(fn['api/v1/permits.js'].maxDuration >= 20 && fn['api/v1/permits.js'].maxDuration <= 60); assert.match(fn['api/v1/permits.js'].excludeFiles, /regions\/\*\*/);   // 인허가 API 도 번들 파일을 읽지 않는다
  assert.ok(fs.existsSync(path.join(ROOT, 'api/v1/permits.js')));
  assert.ok(fn['api/v1/infra.js'].maxDuration >= 20 && fn['api/v1/infra.js'].maxDuration <= 60); assert.match(fn['api/v1/infra.js'].excludeFiles, /regions\/\*\*/);   // 기반시설 API 도 번들 파일을 읽지 않는다
  assert.ok(fs.existsSync(path.join(ROOT, 'api/v1/infra.js')));
  assert.ok(fn['api/v1/notices.js'].maxDuration >= 20 && fn['api/v1/notices.js'].maxDuration <= 60); assert.match(fn['api/v1/notices.js'].excludeFiles, /regions\/\*\*/); assert.ok(fs.existsSync(path.join(ROOT, 'api/v1/notices.js')));   // 공고 API 도 번들 파일을 읽지 않는다
  assert.ok(fn['api/v1/notices.js'].maxDuration >= 20 && fn['api/v1/notices.js'].maxDuration <= 60); assert.match(fn['api/v1/notices.js'].excludeFiles, /regions\/\*\*/); assert.ok(fs.existsSync(path.join(ROOT, 'api/v1/notices.js')));   // 공고 API 도 번들 파일을 읽지 않는다
  for (const k of ['api/v1/resolve.js', 'api/bus.js']) { assert.ok(fn[k].maxDuration > 0 && fn[k].maxDuration <= 60, k); assert.ok(fs.existsSync(path.join(ROOT, k)), `${k} 파일이 있어야 한다`); }
  // 함수 묶음에 로컬 캐시(.cache)와 큰 번들(buildings 등)이 딸려 가지 않게 한다(vercel build 로 확인: resolve.func 8.9 MB → 44 KB)
  assert.match(fn['api/bus.js'].excludeFiles, /\.cache\/\*\*/);
  assert.match(fn['api/v1/resolve.js'].excludeFiles, /\.cache\/\*\*/);
  for (const f of ['buildings', 'projects', 'context', 'infra']) assert.ok(fn['api/v1/resolve.js'].excludeFiles.includes(f), f);
  assert.ok(fs.existsSync(path.join(ROOT, 'regions', 'index.json')));
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', 'index.json'), 'utf8'));
  for (const r of index.regions) assert.ok(fs.existsSync(path.join(ROOT, 'regions', r.slug, 'region.json')), r.slug);
});

test('함수는 서울(icn1)에서 돈다: 미국 지역에서는 V-World 호출이 연결 실패했다', () => {
  assert.deepEqual(conf.regions, ['icn1']);
});

test('.vercelignore 에 .cache 가 있어 로컬 캐시·사용량 파일이 배포로 올라가지 않는다', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8'), /^\.cache\/?$/m);
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^\.cache\/$/m);
});

test('지역 자료 캐시 규칙은 그대로다', () => {
  assert.match(headersOf('/regions/(.*)')['Cache-Control'], /max-age=300/);
});
