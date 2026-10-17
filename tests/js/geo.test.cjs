'use strict';
/* IP 시도 추천: 대응표(lib/board/ip-sido.ts), /api/v1/geo 라우트, /citizen rewrite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ipSido } = require('../../lib/board/ip-sido.ts');
const config = require('../../next.config.ts').default;
const ROOT = path.join(__dirname, '..', '..');

test('ISO 하위 코드를 행정 시도 코드로 바꾼다(강원 42→51, 전북 45→52, 세종 50→36, 나머지 같음)', () => {
  assert.equal(ipSido('KR', '11'), '11');
  assert.equal(ipSido('KR', '41'), '41');
  assert.equal(ipSido('KR', '42'), '51');
  assert.equal(ipSido('KR', '45'), '52');
  assert.equal(ipSido('KR', '50'), '36');
});

test('모르는 지역·한국 아닌 국가·빈 헤더는 null', () => {
  assert.equal(ipSido('KR', 'XX'), null);
  assert.equal(ipSido('US', '11'), null);
  assert.equal(ipSido(null, '11'), null);
  assert.equal(ipSido('KR', null), null);
  assert.equal(ipSido(undefined, undefined), null);
});

test('/api/v1/geo 는 헤더에서 시도를 읽어 no-store 로 답하고 기록하지 않는다', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/api/v1/geo/route.ts'), 'utf8');
  assert.match(src, /no-store/);
  assert.doesNotMatch(src, /console\./);
  assert.doesNotMatch(src, /runtime\s*=\s*'edge'/);
});

test('/citizen 은 정적 페이지로 rewrite 된다', async () => {
  const r = await config.rewrites();
  assert.deepEqual(r.find((x) => x.source === '/citizen'), { source: '/citizen', destination: '/assets/citizen/index.html' });
});
