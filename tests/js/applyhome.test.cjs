'use strict';
/* lib/applyhome.js — 청약홈 분양정보(getAPTLttotPblancDetail) 민영 분양 공고 변환·지역 거르기. 행 모양은 schemas/ledger-2026-10/raw/applyhome 원본(2026-10)에서 옮겼다. 네트워크 없이 시험한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../lib/applyhome.js');

const row = (over) => ({ HOUSE_MANAGE_NO: '2026000492', PBLANC_NO: '2026000492', HOUSE_NM: '청주 가경 아이파크 8단지', HOUSE_DTL_SECD: '01', HOUSE_DTL_SECD_NM: '민영', HOUSE_SECD: '01', HOUSE_SECD_NM: 'APT',
  HSSPLY_ADRES: '충청북도 청주시 흥덕구 가경동 701번지 일원', BSNS_MBY_NM: '아이파크현대산업개발 주식회사', CNSTRCT_ENTRPS_NM: '아이파크현대산업개발 주식회사',
  PBLANC_URL: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2026000492&pblancNo=2026000492', RCRIT_PBLANC_DE: '2026-10-08',
  SPSPLY_RCEPT_BGNDE: '2026-10-19', SPSPLY_RCEPT_ENDDE: '2026-10-19', RCEPT_BGNDE: '2026-10-20', RCEPT_ENDDE: '2026-10-21', SUBSCRPT_AREA_CODE: '360', SUBSCRPT_AREA_CODE_NM: '충북', TOT_SUPLY_HSHLDCO: 1128, ...over });
const TODAY = '2026-10-17';

test('dateOf·safeUrl: 하이픈·8자리 날짜(달력에 없으면 null), 청약홈 주소만', () => {
  assert.equal(A.dateOf('2026-10-19'), '2026-10-19'); assert.equal(A.dateOf('20261019'), '2026-10-19');
  for (const bad of ['2026-02-30', '', null, '2026.10.19', '26-10-19']) assert.equal(A.dateOf(bad), null, String(bad));
  assert.equal(A.safeUrl(row().PBLANC_URL), row().PBLANC_URL);
  for (const bad of ['http://www.applyhome.co.kr/x', 'https://www.applyhome.co.kr.evil.example/x', 'https://www.i-park.com/x', 'javascript:alert(1)', '']) assert.equal(A.safeUrl(bad), '', bad);
});

test('notice: 민영 행 → 공고 한 건(분양가·건설사 없음, 접수 시작은 특별공급과 일반 중 이른 날, 전각 주소 정규화, 제목 대상)', () => {
  assert.deepEqual(A.notice(row(), TODAY), {
    id: 'applyhome-2026000492-2026000492', kind: 'sale', title: '청주 가경 아이파크 8단지', agency: null, status: null, housingType: 'APT', supplyType: '민영 분양', complex: null, units: 1128,
    address: '충청북도 청주시 흥덕구 가경동 701번지 일원', pnu: null, announcedAt: '2026-10-08', applyFrom: '2026-10-19', applyTo: '2026-10-21', url: row().PBLANC_URL, source: 'applyhome',
    deposit: null, monthlyRent: null, targets: [], sgg: null, sggName: null,
  });
  assert.equal(A.notice(row({ SPSPLY_RCEPT_BGNDE: null, RCEPT_BGNDE: '2026-10-19' }), TODAY).applyFrom, '2026-10-19');                     // 특별공급이 없으면 일반 접수
  assert.equal(A.notice(row({ SPSPLY_RCEPT_BGNDE: '2026-10-22', RCEPT_BGNDE: '2026-10-20' }), TODAY).applyFrom, '2026-10-20');
  assert.equal(A.notice(row({ HSSPLY_ADRES: '서울특별시　서초구　１６７５' }), TODAY).address, '서울특별시 서초구 1675');
  assert.equal(A.notice(row({ HSSPLY_ADRES: '' }), TODAY).address, null);
  assert.equal(A.notice(row({ PBLANC_URL: 'https://www.i-park.com/gagyeong' }), TODAY).url, null);
  assert.equal(A.notice(row({ TOT_SUPLY_HSHLDCO: '1,289' }), TODAY).units, 1289); assert.equal(A.notice(row({ TOT_SUPLY_HSHLDCO: 0 }), TODAY).units, null);
  assert.deepEqual(A.notice(row({ HOUSE_NM: '○○ 신혼희망타운 청년 특화' }), TODAY).targets, ['신혼부부', '청년']);
});

test('notice: 민영이 아니면(국민 = 공공분양, 마이홈·LH 와 중복) null, 접수 마감이 오늘 이전·마감일 없음·제목 없음도 null', () => {
  assert.equal(A.notice(row({ HOUSE_DTL_SECD_NM: '국민', HOUSE_DTL_SECD: '03' }), TODAY), null);
  assert.equal(A.notice(row({ RCEPT_ENDDE: '2026-10-16' }), TODAY), null);
  assert.ok(A.notice(row({ RCEPT_ENDDE: '2026-10-17' }), TODAY), '오늘 마감은 넣는다');
  assert.equal(A.notice(row({ RCEPT_ENDDE: null }), TODAY), null);
  assert.equal(A.notice(row({ HOUSE_NM: ' ' }), TODAY), null); assert.equal(A.notice(null, TODAY), null);
});

test('forRegion: 시군구는 주소 앞부분, 시도는 주소 앞부분 또는 청약 지역 이름으로 거르고 sgg·sggName 을 채운다, 공고일 최신 순·같은 id 한 번', () => {
  const regions = [{ code: '41570', name: '경기도 김포시' }, { code: '41590', name: '경기도 화성특례시' }, { code: '41597', name: '경기도 화성특례시 만세구' }];
  const rows = [
    row({ HOUSE_MANAGE_NO: '1', PBLANC_NO: '1', HSSPLY_ADRES: '경기도　김포시　김포한강８로　１５', SUBSCRPT_AREA_CODE_NM: '경기', RCRIT_PBLANC_DE: '2026-10-02' }),
    row({ HOUSE_MANAGE_NO: '2', PBLANC_NO: '2', HSSPLY_ADRES: '경기도 화성특례시 만세구 향남읍 하길리 404-2번지 일원', SUBSCRPT_AREA_CODE_NM: '경기', RCRIT_PBLANC_DE: '2026-10-08' }),
    row({ HOUSE_MANAGE_NO: '3', PBLANC_NO: '3', HSSPLY_ADRES: '김포 마산동 1', SUBSCRPT_AREA_CODE_NM: '경기', RCRIT_PBLANC_DE: '2026-10-05' }),             // 주소에 시도가 없음 → 시도는 청약 지역으로, 시군구는 모름
    row({ HOUSE_MANAGE_NO: '4', PBLANC_NO: '4', HSSPLY_ADRES: '서울특별시 강남구 1', SUBSCRPT_AREA_CODE_NM: '서울' }),
    row({ HOUSE_MANAGE_NO: '5', PBLANC_NO: '5', HSSPLY_ADRES: '경기도 김포시 1', SUBSCRPT_AREA_CODE_NM: '경기', HOUSE_DTL_SECD_NM: '국민' }),
    row({ HOUSE_MANAGE_NO: '1', PBLANC_NO: '1', HSSPLY_ADRES: '경기도 김포시 1', SUBSCRPT_AREA_CODE_NM: '경기', RCRIT_PBLANC_DE: '2026-10-02' }),
  ];
  const sido = A.forRegion(rows, { regionName: '경기도', sidoCode: '41', regions, today: TODAY });
  assert.deepEqual(sido.map((n) => [n.id, n.sgg, n.sggName]), [['applyhome-2-2', '41597', '경기도 화성특례시 만세구'], ['applyhome-3-3', null, null], ['applyhome-1-1', '41570', '경기도 김포시']]);
  const sgg = A.forRegion(rows, { regionName: '경기도 김포시', regions: [regions[0]], today: TODAY });
  assert.deepEqual(sgg.map((n) => [n.id, n.sgg]), [['applyhome-1-1', '41570']], '시군구는 주소로만(청약 지역 이름으로는 시군구를 알 수 없다)');
  assert.deepEqual(A.forRegion(rows, { regionName: '경기도 화성특례시', regions: [regions[1]], today: TODAY }).map((n) => n.sgg), ['41590'], '구가 있는 시는 구 공고를 포함');
  assert.deepEqual(A.forRegion([row({ HSSPLY_ADRES: '경기도 화성특례시 동탄구 반송동 95번지', SUBSCRPT_AREA_CODE_NM: '경기' })], { regionName: '경기도 화성시', regions: [{ code: '41590', name: '경기도 화성시' }], today: TODAY }).map((n) => n.sgg), ['41590'], '주소의 특례시는 표준코드의 시');
  assert.deepEqual(A.forRegion(null, { regionName: '경기도', sidoCode: '41', regions, today: TODAY }), []);
  assert.equal(A.AREA_SIDO['광주'], '12'); assert.equal(A.AREA_SIDO['전남'], '12'); assert.equal(A.AREA_SIDO['강원'], '51'); assert.equal(A.AREA_SIDO['전북'], '52');
});

test('listOf·fetchApplyhome: odcloud 응답(data·matchCount), 일시 오류 다시, 429 는 한도(e.quota), 4xx 는 바로 던짐, 오류 문구에 키 없음', async () => {
  assert.deepEqual(A.listOf({ totalCount: 2907, matchCount: 16, currentCount: 16, data: [1, 2] }), { rows: [1, 2], total: 16 });
  assert.deepEqual(A.listOf({ totalCount: 5, data: [] }), { rows: [], total: 5 }); assert.deepEqual(A.listOf(null), { rows: [], total: 0 });
  const ok = (j) => ({ ok: true, status: 200, text: async () => JSON.stringify(j) });
  const raw = (status, text) => ({ ok: status < 400, status, text: async () => text });
  const go = (fetchFn) => A.fetchApplyhome({ doFetch: fetchFn, sleep: async () => {}, url: A.LIST_URL, params: { serviceKey: 'SECRET-KEY', page: '1' } });
  const seen = [];
  const j = await go(async (url) => { seen.push(url); return ok({ data: [row()], matchCount: 1 }); });
  assert.equal(j.data.length, 1); assert.ok(seen[0].startsWith(`${A.LIST_URL}?`)); assert.equal(new URL(seen[0]).searchParams.get('serviceKey'), 'SECRET-KEY');
  let k = 0; assert.equal((await go(async () => (++k < 3 ? raw(503, '') : ok({ data: [] })))).data.length, 0); assert.equal(k, 3);
  k = 0; await go(async () => (++k < 2 ? raw(200, '<html>') : ok({ data: [] }))); assert.equal(k, 2);
  await assert.rejects(go(async () => raw(429, '')), (e) => e.quota === true);
  await assert.rejects(go(async () => raw(401, '{"code":-4,"msg":"등록되지 않은 인증키"}')), (e) => !e.quota && !String(e.message).includes('SECRET'));
  await assert.rejects(go(async () => { throw new Error('connect SECRET-KEY'); }), (e) => !String(e.message).includes('SECRET'));
});
