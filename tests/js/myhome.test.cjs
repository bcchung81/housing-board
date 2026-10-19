'use strict';
/* lib/myhome.js — 마이홈 공공 모집공고 변환·시군구 거르기(순수 함수). 값은 2026-10-05 전국 공고(임대 244·분양 80)에서 골라 옮겼다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../lib/myhome.js');

const A7 = { pblancId: '21372', houseSn: 1, sttusNm: '일반공고', pblancNm: '하남시 신혼희망타운 행복주택 예비입주자 모집공고(2026.10.01)', suplyInsttNm: 'LH', houseTyNm: '아파트', suplyTyNm: '행복주택', hsmpNm: '하남감일A7BL', brtcNm: '경기도', signguNm: '하남시', fullAdres: '경기도 하남시 감일순환로 40', pnu: '4145011500104680000', suplyHoCo: '20', rcritPblancDe: '20261001', beginDe: '20261012', endDe: '20261014', pcUrl: 'https://www.myhome.go.kr/hws/portal/sch/selectRsdtRcritNtcDetailView.do?pblancId=21372', url: 'https://apply.lh.or.kr/x' };
const SEOUL = { pblancId: '21370', houseSn: 0, sttusNm: '일반공고', pblancNm: '[서울지역본부] 26년 2차 비분양전환형 든든전세주택 입주자 모집공고', suplyInsttNm: 'LH', houseTyNm: '다가구주택', suplyTyNm: '매입임대', hsmpNm: '', brtcNm: '서울특별시', signguNm: '성북구', fullAdres: '', pnu: '', suplyHoCo: '6', rcritPblancDe: '20261001', beginDe: '20261014', endDe: '20261016', pcUrl: 'https://www.myhome.go.kr/hws/portal/sch/selectRsdtRcritNtcDetailView.do?pblancId=21370' };
const JEONJU = { pblancId: '21354', houseSn: 1, pblancNm: '전주평화1 영구임대주택 입주자격완화 예비입주자 모집공고', suplyInsttNm: 'LH', houseTyNm: '아파트', suplyTyNm: '영구임대', hsmpNm: '전주평화1', brtcNm: '전북특별자치도', signguNm: '전주시 완산구', fullAdres: '전북특별자치도 전주시 완산구 덕적골2길 25', pnu: '5211113200104450006', suplyHoCo: '450', rcritPblancDe: '20260930', beginDe: '20261008', endDe: '20261008', pcUrl: 'https://www.myhome.go.kr/x' };
const SALE = { pblancId: '1488', houseSn: 1, sttusNm: '일반공고', pblancNm: '인천계양 A17블록 신혼희망타운(공공분양) 입주자모집공고', suplyInsttNm: 'LH', houseTyNm: '아파트', hsmpNm: '인천계양 A17블록', brtcNm: '인천광역시', signguNm: '계양구', fullAdres: '인천광역시 계양구 박촌동 277-1', pnu: '2824510900102770001', sumSuplyCo: '309', rcritPblancDe: '20260930', beginDe: '20261019', endDe: '20261027', pcUrl: 'https://www.myhome.go.kr/hws/portal/sch/selectLttotHouseDetailView.do?pblancId=1488&houseSn=1' };

test('dateOf·intOf·safeUrl: 8자리 날짜(달력에 없으면 null)·세대수·마이홈/LH 링크만', () => {
  assert.equal(M.dateOf('20261002'), '2026-10-02'); for (const bad of ['2026-10-02', '20261302', '20260231', '', null, '202610']) assert.equal(M.dateOf(bad), null, String(bad));
  assert.deepEqual([M.intOf('20'), M.intOf('1,931'), M.intOf(''), M.intOf('0'), M.intOf('abc'), M.intOf(309)], [20, 1931, null, null, null, 309]);
  assert.equal(M.safeUrl('https://www.myhome.go.kr/a'), 'https://www.myhome.go.kr/a'); assert.equal(M.safeUrl('https://apply.lh.or.kr/b'), 'https://apply.lh.or.kr/b');
  for (const bad of ['http://www.myhome.go.kr/a', 'https://evil.example/myhome.go.kr/', 'javascript:alert(1)', '//www.myhome.go.kr/', '']) assert.equal(M.safeUrl(bad), '', bad);
});

test('notice: 원천 한 행을 화면용 공고로(id 에 houseSn, 빈 값은 null, 날짜·세대수 정리, 링크는 안전한 것만)', () => {
  assert.deepEqual(M.notice(A7, 'rental'), { id: 'rental-21372-1', kind: 'rental', title: '하남시 신혼희망타운 행복주택 예비입주자 모집공고(2026.10.01)', agency: 'LH', status: '일반공고', housingType: '아파트', supplyType: '행복주택', complex: '하남감일A7BL', units: 20, address: '경기도 하남시 감일순환로 40', pnu: '4145011500104680000', announcedAt: '2026-10-01', applyFrom: '2026-10-12', applyTo: '2026-10-14', url: A7.pcUrl, source: 'myhome',
    deposit: null, monthlyRent: null, targets: ['신혼부부'], sgg: null, sggName: null });
  const s = M.notice(SEOUL, 'rental'); assert.equal(s.id, 'rental-21370'); assert.deepEqual([s.complex, s.address, s.pnu, s.units], [null, null, null, 6]);
  assert.equal(M.notice(SALE, 'sale').units, 309); assert.equal(M.notice({ ...A7, pnu: '123' }, 'rental').pnu, null);
  assert.equal(M.notice({ ...A7, pcUrl: 'http://evil', url: 'https://apply.lh.or.kr/x' }, 'rental').url, 'https://apply.lh.or.kr/x'); assert.equal(M.notice({ ...A7, pcUrl: 'x', url: 'y' }, 'rental').url, null);
  assert.equal(M.notice({ ...A7, pblancNm: ' ' }, 'rental'), null); assert.equal(M.notice(null, 'rental'), null); assert.equal(M.notice(A7, 'other'), null);
});

test('inRegion·forRegion: 주소나 시도·시군구 필드로 시군구를 거르고(시는 구 공고를 모두 포함, 구는 그 구만), 공고일 최신 순·같은 id 한 번', () => {
  const rental = [A7, SEOUL, JEONJU, { ...A7, pblancId: '21400', houseSn: 0, rcritPblancDe: '20261005' }, A7], sale = [SALE];
  assert.deepEqual(M.forRegion(rental, sale, '경기도 하남시').map((n) => n.id), ['rental-21400', 'rental-21372-1']);                                  // 최신 공고가 앞, 중복 제거
  assert.deepEqual(M.forRegion(rental, sale, '서울특별시 성북구').map((n) => n.id), ['rental-21370']);                                                // 주소가 비어도 시도·시군구 필드로
  assert.deepEqual(M.forRegion(rental, sale, '전북특별자치도 전주시').map((n) => n.id), ['rental-21354-1']);                                          // 시 전체 = 구 공고 포함
  assert.deepEqual(M.forRegion(rental, sale, '전북특별자치도 전주시 완산구').map((n) => n.id), ['rental-21354-1']);
  assert.deepEqual(M.forRegion(rental, sale, '전북특별자치도 전주시 덕진구'), []);                                                                     // 다른 구는 아님
  assert.deepEqual(M.forRegion(rental, sale, '인천광역시 계양구').map((n) => [n.kind, n.units]), [['sale', 309]]);
  assert.deepEqual(M.forRegion(rental, sale, '경기도 하'), []); assert.deepEqual(M.forRegion(rental, sale, ''), []); assert.deepEqual(M.forRegion(null, null, '경기도 하남시'), []);   // 이름 일부·빈 이름은 맞지 않는다
  assert.equal(M.inRegion({ fullAdres: '경기도 하남시', brtcNm: '', signguNm: '' }, '경기도 하남시'), true); assert.equal(M.inRegion({ fullAdres: '경기도 하남시청로', brtcNm: '', signguNm: '' }, '경기도 하남시'), false);
});

test('targetsOf: 제목의 대상 5가지만, 정해진 순서로(신혼희망타운은 신혼부부, 고령·어르신은 고령자), 없으면 []', () => {
  assert.deepEqual(M.targetsOf('하남시 신혼희망타운 행복주택'), ['신혼부부']);
  assert.deepEqual(M.targetsOf('청년·신혼부부 매입임대'), ['신혼부부', '청년']);
  assert.deepEqual(M.targetsOf('[경기] 고령자 복지주택 · 다자녀 · 신생아 특례 · 청년 · 신혼'), ['신혼부부', '신생아', '청년', '다자녀', '고령자']);
  assert.deepEqual(M.targetsOf('어르신 공공임대'), ['고령자']); assert.deepEqual(M.targetsOf('고령층 영구임대'), ['고령자']);
  assert.deepEqual(M.targetsOf('일반 매입임대주택 입주자 모집'), []); assert.deepEqual(M.targetsOf(''), []); assert.deepEqual(M.targetsOf(null), []);
});

test('notice: 임대 행은 보증금(rentGtn)·월세(mtRntchrg)를 원 단위 정수로, 값이 0·빈 값이면 null, 분양 행은 늘 null', () => {
  const r = M.notice({ ...SEOUL, rentGtn: 18551000, mtRntchrg: 114150 }, 'rental'); assert.deepEqual([r.deposit, r.monthlyRent], [18551000, 114150]);
  const s = M.notice({ ...SEOUL, rentGtn: '4,764,000', mtRntchrg: '54440' }, 'rental'); assert.deepEqual([s.deposit, s.monthlyRent], [4764000, 54440]);
  const z = M.notice({ ...SEOUL, rentGtn: 0, mtRntchrg: 0 }, 'rental'); assert.deepEqual([z.deposit, z.monthlyRent], [null, null]);          // 매입임대 묶음 공고는 0 = 값 없음
  const j = M.notice({ ...SEOUL, rentGtn: 30000000, mtRntchrg: 0 }, 'rental'); assert.deepEqual([j.deposit, j.monthlyRent], [30000000, 0]);  // 보증금이 있으면 월세 0 은 전세형 그대로
  const n = M.notice({ ...SEOUL, rentGtn: '', mtRntchrg: undefined }, 'rental'); assert.deepEqual([n.deposit, n.monthlyRent], [null, null]);
  const sale = M.notice({ ...SALE, rentGtn: 100, mtRntchrg: 100 }, 'sale'); assert.deepEqual([sale.deposit, sale.monthlyRent], [null, null]);
});

test('norm·placeOf: 전각 문자·공백 정규화, 주소 앞부분이 맞는 가장 긴 시군구 이름(구가 있으면 구), 없으면 null', () => {
  assert.equal(M.norm('서울특별시　서초구　１６７５'), '서울특별시 서초구 1675');
  assert.equal(M.norm('경기도　김포시　김포한강８로　１５（마산동，　한강센트럴블루힐）'), '경기도 김포시 김포한강8로 15(마산동, 한강센트럴블루힐)');
  const regions = [{ code: '41110', name: '경기도 수원시' }, { code: '41117', name: '경기도 수원시 영통구' }, { code: '41570', name: '경기도 김포시' }, { code: '41450', name: '경기도 하남시' }];
  assert.deepEqual(M.placeOf(['경기도 수원시 영통구 광교로 1'], regions), { sgg: '41117', sggName: '경기도 수원시 영통구' });
  assert.deepEqual(M.placeOf(['경기도 수원시 어딘가'], regions), { sgg: '41110', sggName: '경기도 수원시' });
  assert.deepEqual(M.placeOf(['경기도　김포시　김포한강８로'], regions), { sgg: '41570', sggName: '경기도 김포시' });
  assert.deepEqual(M.placeOf(['', '경기도 하남시'], regions), { sgg: '41450', sggName: '경기도 하남시' });                          // 주소가 비면 다음 후보(시도+시군구 필드)
  assert.deepEqual(M.placeOf(['경기도 하남시청로 1'], regions), { sgg: null, sggName: null });                                     // 이름 일부는 맞지 않는다
  assert.deepEqual(M.placeOf(['경기도 화성특례시 동탄구 반송동 95'], [{ code: '41590', name: '경기도 화성시' }, { code: '41597', name: '경기도 화성시 동탄구' }]), { sgg: '41597', sggName: '경기도 화성시 동탄구' });   // 청약홈은 '화성특례시', 표준코드는 '화성시'
  assert.equal(M.placeKey('경기도 화성특례시 동탄구'), '경기도 화성시 동탄구'); assert.equal(M.placeKey('경기도 특례시로 1'), '경기도 특례시로 1');
  assert.deepEqual(M.placeOf(['경기도 김포'], regions), { sgg: null, sggName: null }); assert.deepEqual(M.placeOf([null], []), { sgg: null, sggName: null });
});

test('forRegion(시도): 시도 이름으로 거르고 항목마다 sgg·sggName 을 주소·시도+시군구 필드로 채운다', () => {
  const regions = [{ code: '41450', name: '경기도 하남시' }, { code: '41570', name: '경기도 김포시' }];
  const out = M.forRegion([A7, SEOUL, { ...A7, pblancId: '5', houseSn: 0, fullAdres: '', signguNm: '김포시' }, { ...A7, pblancId: '6', houseSn: 0, fullAdres: '', signguNm: '없는시' }], [], '경기도', regions);
  assert.deepEqual(out.map((n) => [n.id, n.sgg, n.sggName]), [['rental-21372-1', '41450', '경기도 하남시'], ['rental-5', '41570', '경기도 김포시'], ['rental-6', null, null]]);
  assert.deepEqual(M.forRegion([A7], [], '경기도 하남시', [{ code: '41450', name: '경기도 하남시' }]).map((n) => n.sgg), ['41450']);
});
