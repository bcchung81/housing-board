#!/usr/bin/env node
/* 계약 시험용 골든 픽스처 갱신: 운영 API 의 실제 응답을 tests/fixtures/api/ 에 줄여서 저장한다(건물·사업 목록은 앞 몇 개만, 경계 점은 그대로).
   tests/js/contract.test.cjs 가 이 파일들이 schemas/api/openapi.json 을 지키는지 확인한다. 응답이 바뀌었거나 스키마를 고쳤으면 다시 받아 확인한다.
   사용: node scripts/capture-fixtures.js [기본주소]   호출 사이 1.2초(행정표준코드·건물대장 초당 한도). 키·원천 URL 은 응답에 없다. */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://housing-board.vercel.app').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'api');
const q = encodeURIComponent;
const head = (n) => (b) => { b.features = b.features.slice(0, n); return b; };
const items = (n) => (b) => { b.items = b.items.slice(0, n); return b; };
const LIST = [
  ['resolve-sgg.json', '/api/v1/resolve?sgg=41450&geometry=1'],
  ['resolve-bjd.json', '/api/v1/resolve?bjd=4145011400&geometry=1'],
  ['resolve-pnu.json', '/api/v1/resolve?pnu=4145010600105200000&geometry=1'],
  ['resolve-bundle.json', '/api/v1/resolve?bjd=2824510900&geometry=1'],
  ['resolve-ri.json', '/api/v1/resolve?bjd=4373035027&geometry=1'],
  ['resolve-8digit.json', '/api/v1/resolve?bjd=41450114&geometry=1'],
  ['search-name.json', `/api/v1/codes/search?q=${q('감일')}`],
  ['search-jibun.json', `/api/v1/codes/search?q=${q('장위동 68-37')}`],
  ['search-place.json', `/api/v1/codes/search?q=${q('시청')}&near=127.15,37.50`],
  ['resolve-sgg-districts.json', '/api/v1/resolve?sgg=41590&geometry=1', (b) => { if (b.geometry && b.geometry.type === 'MultiPolygon') b.geometry.coordinates = b.geometry.coordinates.slice(0, 2).map((poly) => poly.map((ring) => ring.slice(0, 6))); return b; }],
  ['notices-hanam.json', '/api/v1/notices?sgg=41450', items(2)],
  ['notices-none.json', '/api/v1/notices?sgg=11110'],
  ['search-code-bad.json', `/api/v1/codes/search?q=${q('12345')}`],
  ['buildings-cell.json', '/api/v1/buildings?cell=12721,3753', head(3)],
  ['permits-deokpung.json', '/api/v1/permits?bjd=4145010800', head(3)],
  ['permits-gamil-ledger.json', '/api/v1/permits?bjd=4145011400', head(3)],
  ['infra-deokpung.json', '/api/v1/infra?bjd=4145010800', (b) => { b.schools = b.schools.slice(0, 2); b.stops = b.stops.slice(0, 3); return b; }],
  ['infra-seoul.json', '/api/v1/infra?bjd=1129013800', (b) => { b.stops = b.stops.slice(0, 3); return b; }],   // TAGO 밖(서울): OpenStreetMap 정류장
  ['infra-seoul-nobus.json', '/api/v1/infra?bjd=1150010500'],   // 마곡동: OpenStreetMap 공개 서버가 실패해 noBus + stopsError(받을 때마다 다를 수 있음)
  ['bus-gyeyang.json', '/api/bus?region=incheon-gyeyang', (b) => { b.buses = b.buses.slice(0, 3); return b; }],
];
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [file, url, trim] of LIST) {
    const res = await fetch(BASE + url, { signal: AbortSignal.timeout(90000) });
    if (!res.ok) { console.log(`건너뜀 ${file}: HTTP ${res.status}`); continue; }
    let body = await res.json();
    if (trim) body = trim(body);
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(body, null, 1) + '\n');
    console.log(`저장 ${file} (${JSON.stringify(body).length} 바이트)`);
    await new Promise((r) => setTimeout(r, 1200));
  }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
