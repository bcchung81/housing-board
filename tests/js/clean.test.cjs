'use strict';
// 단계별 원천 정제 규칙(tools/ledger/clean.js)과 중간 스냅샷 쓰기·읽기(tools/ledger/stage-snapshot.js render·readStage):
// 날짜 형식별 정밀도·자리표시값·범위, 옛 법정동코드·PNU, 따옴표 CSV, 행 접기, 경쟁률, 주소 다듬기·시군구 찾기(지금 법정동코드 파일). 네트워크는 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../../tools/ledger/clean');
const S = require('../../tools/ledger/stage-snapshot');
const P = require('../../tools/ledger/paths');
const { codeMapper } = require('../../tools/ledger/hub-bulk');
const { nameIndex } = require('../../tools/ledger/map-lh');
const { parseLegalDong } = require('../../tools/ledger/legal-dong');

const DONG_DIR = path.join(P.ledgerDir(P.latestMonth()), 'raw/legal-dong');
const DONG = path.join(DONG_DIR, fs.readdirSync(DONG_DIR).filter((f) => f.endsWith('.csv')).sort().pop());
const legal = parseLegalDong(fs.readFileSync(DONG), path.basename(DONG));
const idx = nameIndex(legal.rows), mapper = codeMapper(legal.rows, legal.abolished);

test('날짜: 형식마다 적힌 정밀도(일·월·연) 그대로', () => {
  const v = (s) => [C.parseDate(s).value, C.parseDate(s).precision];
  assert.deepEqual(v('2026-10-08'), ['2026-10-08', 'day']);
  assert.deepEqual(v('20260929'), ['2026-09-29', 'day']);
  assert.deepEqual(v('2026.10.26'), ['2026-10-26', 'day']);
  assert.deepEqual(v('2026. 10. 26.'), ['2026-10-26', 'day']);
  assert.deepEqual(v('2026.10.26 09:00'), ['2026-10-26', 'day']);
  assert.deepEqual(v('2026-10-12 16:00'), ['2026-10-12', 'day']);
  assert.deepEqual(v('202911'), ['2029-11', 'month']);
  assert.deepEqual(v('2017년 06월'), ['2017-06', 'month']);
  assert.deepEqual(v('2017.02'), ['2017-02', 'month']);
  assert.deepEqual(v('2026. 9'), ['2026-09', 'month']);
  assert.deepEqual(v('2026'), ['2026', 'year']);
  assert.deepEqual(v('2026.'), ['2026', 'year']);
  assert.equal(C.cleanDate(' 20260929 '), '2026-09-29');
});

test('날짜: 자리표시값·범위 밖·달력에 없는 날·형식 위반은 null 과 사유', () => {
  const why = (s) => [C.parseDate(s).value, C.parseDate(s).reason];
  for (const s of ['9999-12-31', '1111-11-11', '0000', '000001', '999912', '1900-01-01', '#VALUE!', '0000. 0', '19000101', '9999.99', '99991231']) assert.deepEqual(why(s), [null, 'PLACEHOLDER'], s);
  assert.deepEqual(why('1949-12-31'), [null, 'RANGE']);
  assert.deepEqual(why('2036-01-01'), [null, 'RANGE']);
  assert.deepEqual(why('3909.12'), [null, 'RANGE']);
  assert.deepEqual(why('1950-01-01'), ['1950-01-01', null]);
  assert.deepEqual(why('2035-12-31'), ['2035-12-31', null]);
  assert.deepEqual(why('20250230'), [null, 'CALENDAR']);
  assert.deepEqual(why('202513'), [null, 'CALENDAR']);
  assert.deepEqual(why('124.'), [null, 'FORMAT']);
  assert.deepEqual(why(' 2002 5'), [null, 'FORMAT']);
  assert.deepEqual(why(''), [null, 'EMPTY']);
  assert.deepEqual(why(null), [null, 'EMPTY']);
});

test('날짜: 월 값은 일을 버리고, 접수 일시 범위는 둘로', () => {
  assert.deepEqual([C.parseMonth('2026-10-08').value, C.parseMonth('2026-10-08').precision], ['2026-10', 'month']);
  assert.equal(C.parseMonth('2026').value, '2026');
  const [a, b] = C.parseRange('2026.10.26 09:00 ~ 2026.10.27 16:00');
  assert.deepEqual([a.value, b.value], ['2026-10-26', '2026-10-27']);
  assert.deepEqual(C.parseRange('~').map((r) => r.reason), ['EMPTY', 'EMPTY']);
});

test('글자·수·경쟁률', () => {
  assert.equal(C.cleanText(' 의정부　민락１차  청구 '), '의정부 민락1차 청구');
  assert.equal(C.cleanText('   '), null);
  assert.equal(C.cleanParty(','), null);
  assert.equal(C.cleanParty(' 두산건설(주), '), '두산건설(주)');
  assert.equal(C.cleanParty('㈜우방,(주)제일건설'), '(주)우방,(주)제일건설');
  assert.equal(C.toCount('150.0'), 150);
  assert.equal(C.toCount('1,128'), 1128);
  assert.equal(C.toCount('12.5'), null);
  assert.equal(C.toCount(''), null);
  assert.equal(C.yn('Y'), true);
  assert.equal(C.yn(null), null);
  assert.deepEqual(C.parseCompetition('-'), { rate: null, shortfall: null });
  assert.deepEqual(C.parseCompetition('(△17)'), { rate: null, shortfall: 17 });
  assert.deepEqual(C.parseCompetition('1,234.5'), { rate: 1234.5, shortfall: null });
  assert.deepEqual(C.parseCompetition('3.25'), { rate: 3.25, shortfall: null });
  assert.deepEqual(C.parseCompetition(null), { rate: null, shortfall: null });
});

test('CSV: 따옴표 칸 안의 쉼표·줄바꿈·"" 를 받고 끝 공백은 둔다', () => {
  const text = '﻿단지고유번호,단지명,세대수\r\n11110100000012 ,"도렴제6,7지구",48\r\n2,"상원 ""A"" 주택\n(101동)",\r\n';
  assert.deepEqual(C.parseCsv(text), [['단지고유번호', '단지명', '세대수'], ['11110100000012 ', '도렴제6,7지구', '48'], ['2', '상원 "A" 주택\n(101동)', '']]);
  assert.deepEqual(C.parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
});

test('행 접기: 첫 행 기본, 반복 총계는 합하지 않는다', () => {
  const rows = [{ id: 1, hh: 20, t: '36' }, { id: 1, hh: 20, t: '46' }, { id: 2, hh: 5, t: '26' }];
  const f = C.fold(rows, (r) => r.id);
  assert.equal(f.repeats, 1);
  assert.deepEqual(f.rows.map((r) => r.t), ['36', '26']);
  const g = C.fold(rows, (r) => r.id, (grp) => ({ id: grp[0].id, hh: C.repeatedTotal(grp.map((r) => r.hh)).value, n: grp.length }));
  assert.deepEqual(g.rows, [{ id: 1, hh: 20, n: 2 }, { id: 2, hh: 5, n: 1 }]);
  assert.deepEqual(C.repeatedTotal([140, 16, 9]), { value: 140, varies: true });
  assert.deepEqual(C.repeatedTotal([null, null]), { value: null, varies: false });
});

test('PNU: 끝 공백·대지구분·본번 0·옛 법정동코드', () => {
  const fake = { bjd: (c) => ({ '1111010100': '1111010100', 2826010100: '2829010100' })[c] ?? null };
  assert.deepEqual(C.pnuNow('1111010100100010000 ', fake), { pnu: '1111010100100010000', reason: null, changed: false });
  assert.deepEqual(C.pnuNow('2826010100100010002', fake), { pnu: '2829010100100010002', reason: null, changed: true });
  assert.equal(C.pnuNow('1111010100300010000', fake).reason, 'LAND');   // 대지구분 3(가지번)
  assert.equal(C.pnuNow('1111010100100000000', fake).reason, 'LOT');
  assert.equal(C.pnuNow('9999999999100010000', fake).reason, 'UNMAPPED');
  assert.equal(C.pnuNow('11110101001', fake).reason, 'FORMAT');
  assert.equal(C.pnuNow('', fake).reason, 'EMPTY');
  // 지금 법정동코드 파일: 옛 인천 서구(28260) 법정동은 검단구·서해구로 간다
  const old = legal.abolished.find((r) => r.code.startsWith('28260') && /당하동$/.test(r.name));
  assert.ok(old, '폐지 행에 인천 서구 당하동이 있다');
  assert.equal(C.pnuNow(`${old.code}100010000`, mapper).pnu.slice(0, 5), '28290');
});

test('주소 다듬기: 괄호·번지·일원·외 N필지·블록·로트를 떼고 첫 필지', () => {
  assert.deepEqual(C.tidyJibun('충청북도 청주시 흥덕구 가경동 701번지 일원'), { main: '충청북도 청주시 흥덕구 가경동 701', lot: true, parens: [] });
  assert.equal(C.tidyJibun('경기도 양주시 옥정동 962-9, 962-8번지(옥정지구 중상1, 복합1블록)').main, '경기도 양주시 옥정동 962-9');
  assert.equal(C.tidyJibun('경기도 김포시 고촌읍 신곡리 1062-1번지 외 2필지').main, '경기도 김포시 고촌읍 신곡리 1062-1');
  assert.equal(C.tidyJibun('경기도 평택시 현덕면 화양리 9블록 1로트').lot, false);   // 블록·로트 숫자는 번지가 아니다
  assert.equal(C.tidyJibun('경기도 화성시 동탄면 영천리 A-9블록').lot, false);
  assert.equal(C.tidyJibun('강원도 원주시 신림면 산 12-3').main, '강원도 원주시 신림면 산 12-3');
  assert.equal(C.tidyJibun('대구광역시 수성구 수성동 4가 996번지 일원').main, '대구광역시 수성구 수성동4가 996');
  assert.equal(C.tidyJibun('경기도 화성특례시 봉담읍 상리 1').main, '경기도 화성시 봉담읍 상리 1');
});

test('주소 → PNU: 지번형·괄호 안 지번·일반구 신설 시·옛 인천 서구·도로명 매핑', () => {
  const a = C.parcelPnu('충청북도 청주시 흥덕구 가경동 701번지 일원', idx);
  assert.equal(a.via, 'JIBUN');
  assert.match(a.pnu, /^43113\d{5}107010000$/);
  const b = C.parcelPnu('충청남도 아산시 둔포면 아산테크노밸리 Ab4BL (아산시 둔포면 석곡리 1818번지 일원)', idx);
  assert.equal(b.via, 'PAREN');
  assert.match(b.pnu, /^44200\d{5}118180000$/);
  const c = C.parcelPnu('김포 풍무역세권 B4블록 (경기도 김포시 사우동 458번지 일원)', idx);
  assert.match(c.pnu ?? '', /^41570\d{5}104580000$/);
  const h = C.parcelPnu('경기도 화성시 봉담읍 상리 1', idx);   // 화성시에 구가 생겨 '화성시 봉담읍' 법정동은 없다 → 구를 찾는다
  assert.ok(['41591', '41593', '41595', '41597'].includes(h.sgg), h.sgg);
  assert.ok(h.pnu);
  assert.equal(C.parcelPnu('인천광역시 서구 당하동 1', idx).sgg, '28290');
  const lotless = C.parcelPnu('인천광역시 서해구 가정동', idx);
  assert.deepEqual([lotless.sgg, lotless.pnu], ['28275', null]);
  assert.ok(lotless.bjd);

  const road = '전북특별자치도 익산시 무왕로22길 28(부송동,익산부송 3 주공아파트)';
  assert.equal(C.isRoad(road), true);
  assert.equal(C.isRoad('경기도 의왕시 고천동 61-6'), false);
  const noMap = C.locateAddress(road, idx);
  assert.deepEqual([noMap.kind, noMap.pnu, noMap.via], ['ROAD', null, null]);
  assert.equal(noMap.sgg, '52140');
  assert.ok(noMap.bjd?.startsWith('52140'));   // 괄호의 법정동(부송동)
  const mapped = C.locateAddress(` ${road} `, idx, new Map([[road, '전북특별자치도 익산시 부송동 1004']]));
  assert.equal(mapped.via, 'ROAD_MAP');
  assert.match(mapped.pnu, /^52140\d{5}110040000$/);
});

test('지역 이름(HUG) → 지금 시군구', () => {
  const f = (n, text) => C.sggOfAreaName(n, idx, legal.rows, text);
  assert.equal(f('서울 강남구'), '11680');
  assert.equal(f('충남 연기군'), '36110');
  assert.equal(f('세종 세종시'), '36110');
  assert.equal(f('경남 진해시'), '48129');
  assert.equal(f('경남 마산시'), '48120');
  assert.equal(f('경기 고양시 일산구'), '41280');
  assert.equal(f('경기 화성시'), '41590');   // 구를 모르면 시 단위
  assert.equal(f('강원 원주시'), idx.sggByName.get('강원특별자치도 원주시').area_code);
  assert.equal(f('광주 광산구'), idx.sggByName.get('전남광주통합특별시 광산구').area_code);
  assert.equal(f('인천 동구'), '28125');
  assert.equal(f('인천 서구', '인천 검단2지구 대림아파트 신축공사'), '28290');
  assert.equal(f('인천 서구', '청라 자이아파트'), '28275');
  assert.equal(f('인천 중구', '영종도 동원 베네스트 타운하우스'), '28155');
  assert.equal(f('인천 서구', '이지화인프라자 신축공사'), null);   // 동 이름이 없으면 고르지 않는다
});

test('스냅샷 쓰기·읽기: 열 배열로 쓰고 객체로 되읽는다, 엑셀 번지', () => {
  const data = Object.fromEntries(S.SOURCES.map((k) => [k, []]));
  data.bld = [{ src: 'S', pk: '1', pnu: null }, { src: 'T', pk: '2', pnu: '1111010100100010000', dong: '101동' }];
  data.hug = [{ key: S.hugKey({ sgg: null, name: '가', announced: '2020-01-02' }), sgg: null, name: '가', announced: '2020-01-02' }];
  const text = S.render(data, '2026-08');
  assert.equal(text.split('\n').filter((l) => l.startsWith('["')).length, 3);   // 한 기록 한 줄
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stage-')), 'stage.json');
  fs.writeFileSync(file, text);
  const back = S.readStage(file);
  assert.equal(back.dataMonth, '2026-08');
  assert.deepEqual(back.bld, [{ src: 'S', pk: '1', pnu: null, dong: null }, { src: 'T', pk: '2', pnu: '1111010100100010000', dong: '101동' }]);
  assert.equal(back.hug[0].key, '-|가|2020-01-02');
  assert.deepEqual(back.lhSchedule, []);
  assert.deepEqual(S.firstLot('서울특별시 종로구 내수동 73- 경희궁의아침4단지'), { bun: '73', ji: '0', san: false });
  assert.deepEqual(S.firstLot('서울특별시 종로구 신문로2가 1-434,서울특별시 종로구 신문로2가 1-435 광화문스페이스본'), { bun: '1', ji: '434', san: false });
  assert.equal(S.firstLot('세종특별자치시 반곡동 해들마을'), null);
  assert.equal(S.xmlText('&#54644;&amp;&lt;'), '해&<');
});
