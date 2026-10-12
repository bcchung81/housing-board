'use strict';
// 공고 ↔ 사업 연결 규칙(tools/ledger/notice-link.js): 블록·지구 낱말 읽기, T1·T2(자동)·T3(검토), 시도 거르기, 공고 종류(취소·비공급·후속·최초), 정정·재공고 묶음. 네트워크·파일 없음.
const test = require('node:test');
const assert = require('node:assert/strict');
const NL = require('../../tools/ledger/notice-link');

const LH = 'datagokr-15141761', BULK = 'hub-bulk-hs-2026-08';
const sorted = (s) => [...s].sort();

test('블록 코드: 하이픈·BL·블록·0 채움을 normBlock 으로, 쉼표·및·가운뎃점 나열, 세종식, 숫자뿐인 블록은 #n, 기관 약자는 블록 아님', () => {
  assert.deepEqual(sorted(NL.blocksOf('인천영종 A-24블록 공공분양')), ['A24']);
  assert.deepEqual(sorted(NL.blocksOf('파주운정3 A16, A17, A22, A23블록')), ['A16', 'A17', 'A22', 'A23']);
  assert.deepEqual(sorted(NL.blocksOf('인천영종 A33·37·60블록')), ['#60', 'A33', 'A37', 'A60'], "끝 '60블록' 은 숫자 블록으로도 읽는다(지구 낱말이 함께 맞아야 잇는다)");
  assert.deepEqual(sorted(NL.blocksOf('의왕월암 A-1 및 A-3블록')), ['A1', 'A3']);
  assert.deepEqual(sorted(NL.blocksOf('행정중심복합도시 5-1L1BL 공공분양')), ['51L1']);
  assert.deepEqual(sorted(NL.blocksOf('부산문현2지구 1블록 공공임대')), ['#1']);
  assert.deepEqual(sorted(NL.blocksOf('고양창릉 S-06')), ['S6']);
  assert.deepEqual(sorted(NL.blocksOf('광주전남혁신 빛가람LH1단지')), []);
});

test('지구 낱말: 첫 블록 바로 앞 낱말(주택 유형 낱말은 건너뜀), 괄호 조각에 없으면 앞 조각의 끝 낱말', () => {
  assert.equal(NL.titleDistrict('인천영종 A24블록 공공분양주택 입주자모집공고'), '인천영종');
  assert.equal(NL.titleDistrict('평택고덕 신혼희망타운 A-53블록'), '평택고덕');
  assert.equal(NL.titleDistrict('공공분양 입주자모집공고'), null);
  const p = NL.pairsOf('e편한세상 대장 퍼스티움(부천대장 A-5BL) 신혼희망타운(공공분양) 입주자모집공고');
  assert.deepEqual(p.map((x) => [x.text, x.dist, [...x.blks]]), [['부천대장 A-5BL', '부천대장', ['A5']]]);
  assert.deepEqual(NL.pairsOf('공주월송2단지(A2블록) 행복주택').map((x) => x.dist), ['공주월송2단지']);
});

test('공고 종류: 취소 → CANCEL, 가정어린이집·오피스텔 → NON_SUPPLY, 잔여세대·추가·예비·완화·선착순·매각 → FOLLOW_UP, 그 밖의 모집 → INITIAL', () => {
  assert.equal(NL.noticeKind('[취소공고]청주지북A4 행복주택 입주자격완화 입주자 추가모집 공고'), 'CANCEL');
  assert.equal(NL.noticeKind('성남신촌 A1블록 가정어린이집 운영예정자 모집공고', '가정어린이집'), 'NON_SUPPLY');
  assert.equal(NL.noticeKind('행정중심복합도시 5-1L1BL 단지내 오피스텔 분양광고', '분양주택'), 'NON_SUPPLY');
  for (const t of ['인천영종 A24블록 공공분양주택 잔여세대 추가입주자모집공고', '구리갈매 S1블록 10년 공공임대주택 예비입주자 모집 공고', '[입주자격완화] 평택고덕 A-58블록 영구임대주택 입주자 추가모집',
    '광주선운2 A-1,3블록 신혼희망타운 공공분양 선착순계약', '광주전남혁신 빛가람LH1단지 잔여세대 일반매각 공고(상시, 선착순 동호지정)']) assert.equal(NL.noticeKind(t), 'FOLLOW_UP', t);
  for (const t of ['[신규모집]인천산곡 A1블록 행복주택 입주자모집', '부산문현2지구 1블록 10년 분양전환 공공임대주택 입주자모집공고', '울산다운2 A-4블록 국민임대 입주자 최초모집',
    '[정정공고]인천영종 A24블록 공공분양주택 입주자모집공고']) assert.equal(NL.noticeKind(t), 'INITIAL', t);
});

test('정정·재공고 묶음: 앞머리 괄호·날짜 괄호(곧은·굽은 따옴표)·회차·빈칸을 지우면 같은 키, 다른 블록·다른 유형은 다른 키', () => {
  const g = NL.noticeGroup('인천영종 A24블록 공공분양주택 입주자모집공고');
  assert.equal(NL.noticeGroup('[정정공고][정정공고]인천영종 A24블록 공공분양주택 입주자모집공고'), g);
  assert.equal(NL.noticeGroup('(재게시)인천영종  A24블록 공공분양주택 입주자모집공고'), g);
  assert.equal(NL.noticeGroup("[정정공고]울산다운2 A-7블록 영구임대주택 입주자 최초모집('25.10.01. 공고)"), NL.noticeGroup('울산다운2 A-7블록 영구임대주택 입주자 최초모집'));
  assert.equal(NL.noticeGroup('대전천동3 5블록 예비입주자 모집공고(‘26.09.29)'), NL.noticeGroup("대전천동3 5블록 예비입주자 모집공고('25.03.21)"));
  assert.equal(NL.noticeGroup('루원시티(인천가정2 A-2블록) 가정어린이집 운영예정자 모집공고(1회차)'), NL.noticeGroup('루원시티(인천가정2 A-2블록) 가정어린이집 운영예정자 모집공고'));
  assert.notEqual(NL.noticeGroup('인천영종 A25블록 공공분양주택 입주자모집공고'), g);
  assert.notEqual(NL.noticeGroup('인천영종 A24블록 행복주택 입주자모집공고'), g);
});

/* 작은 원장: LH 후보 부천대장 A7 · 같은 블록의 건축HUB 후보(이름에 지구 낱말) · 주소에만 지구 낱말이 있는 후보 · 특수지명에 '영종'만 있는 인천 영종구 후보 */
const projects = [
  { local_project_id: 'PRJ-41196-0003', project_name: '부천대장 A7', sgg_code: '41196', source_ref: LH },
  { local_project_id: 'PRJ-41196-0100', project_name: '부천대장 A-7BL 공동주택', sgg_code: '41196', source_ref: BULK },
  { local_project_id: 'PRJ-41196-0101', project_name: '공동주택', sgg_code: '41196', source_ref: BULK },
  { local_project_id: 'PRJ-28155-0021', project_name: 'LH 아파트', sgg_code: '28155', source_ref: BULK },
];
const identifiers = [
  { local_project_id: 'PRJ-41196-0003', id_type: 'AREA_BLOCK', id_value: '부천대장|A7' },
  { local_project_id: 'PRJ-41196-0100', id_type: 'HUB_HS_PK', id_value: '1' },
  { local_project_id: 'PRJ-41196-0101', id_type: 'HUB_HS_PK', id_value: '2' },
  { local_project_id: 'PRJ-28155-0021', id_type: 'HUB_HS_PK', id_value: '3' },
];
const hubRecords = [
  { pk: '1', name: '부천대장 A-7BL 공동주택', complex: null, special: '', block: 'A-7BL', address: '' },
  { pk: '2', name: '공동주택', complex: null, special: '', block: 'A7', address: '경기도 부천시 대장동 부천대장 A7블록' },
  { pk: '3', name: 'LH 아파트', complex: null, special: '영종하늘도시', block: 'A37', address: '' },
];
const index = NL.projectIndex({ projects, identifiers, complexes: [], hubRecords }, LH);
const sido = NL.sidoIndex([{ level: 'SIDO', area_name: '경기도', area_code: '41' }, { level: 'SIDO', area_name: '인천광역시', area_code: '28' }]);
const sggName = (c) => ({ 41196: '경기도 부천시 원미구', 28155: '인천광역시 영종구' })[c] ?? '';
const match = (title, s) => NL.matchTitle({ texts: [title], sido: sido(s) }, index, sggName).map((h) => [h.pid, h.rule, h.block, h.others]);

test('T1·T2: 같은 블록에서 LH 지구 낱말이 제목에 있으면 T1, 제목 지구 낱말이 사업 이름에 있으면 T2(같은 블록의 두 사업은 서로 others), 주소에만 있으면 잇지 않는다', () => {
  assert.deepEqual(match('부천대장 A7블록 공공분양주택 입주자모집공고', '경기도'), [
    ['PRJ-41196-0003', NL.RULE.T1, 'A7', ['PRJ-41196-0100']],
    ['PRJ-41196-0100', NL.RULE.T2, 'A7', ['PRJ-41196-0003']],
  ]);
  assert.deepEqual(match('부천대장2 A7블록 공공분양주택', '경기도'), [], "'부천대장2' 는 '부천대장' 이 아니다(뒤가 숫자)");
  assert.deepEqual(match('A7블록 공공분양주택 입주자모집공고', '경기도'), [], '블록만 같으면 잇지 않는다');
});

test('시도: 공고 시도와 사업 시도가 다르면 잇지 않고, "X 외"·"전국"은 다른 시도도 받는다', () => {
  assert.deepEqual(match('부천대장 A7블록 공공분양', '인천광역시'), []);
  assert.equal(match('부천대장 A7블록 공공분양', '인천광역시 외').length, 2);
  assert.equal(match('부천대장 A7블록 공공분양', '전국').length, 2);
});

test('T3: 지구 낱말에서 시도·시군구 줄임말을 떼야 맞으면 T3(검토 목록용), 근거 글자에 규칙 이름과 뗀 줄임말', () => {
  const [h] = NL.matchTitle({ texts: ['인천영종 A33·37·60블록 공공분양 잔여세대 입주자모집공고'], sido: sido('인천광역시') }, index, sggName);
  assert.deepEqual([h.pid, h.rule, h.block, h.short], ['PRJ-28155-0021', NL.RULE.T3, 'A37', '인천']);
  assert.match(NL.titleEvidence(h, 'LH 아파트'), /^T3_NAME_SUBDISTRICT_BLOCK: "인천영종 A33·37·60블록 .*" 블록 A37 · 지구 낱말 '인천영종' 에서 '인천' 를 떼면 .* = 사업 LH 아파트$/);
  const [t1] = NL.matchTitle({ texts: ['부천대장 A7블록 공공분양'], sido: sido('경기도') }, index, sggName);
  assert.match(NL.titleEvidence(t1, '부천대장 A7'), /^T1_LH_DISTRICT_BLOCK: .* LH 지구 낱말 '부천대장' 이 제목에 있음 = 사업 부천대장 A7 · 같은 블록 다른 사업 PRJ-41196-0100\(중복 의심\)$/);
});
