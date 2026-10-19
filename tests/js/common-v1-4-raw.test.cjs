'use strict';
/* tools/common_v1_4_raw — 원천(raw) → 공통규격 v1.4 변환기의 순수 함수와 검증기. 작은 고정 입력만 쓴다(원천 파일을 읽지 않는다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const C = require('../../tools/common_v1_4_raw/convert.js');
const V = require('../../tools/common_v1_4_raw/validate.js');
const spec = require('../../tools/common_v1_4_raw/spec.js');

test('공공기관 판정: LH 지역본부·지방공사는 공공, 조합·PFV·신탁은 아님, 공동 사업주체는 joint', () => {
  assert.equal(C.orgShort('한국토지주택공사 경기남부지역본부'), 'LH');
  assert.equal(C.orgShort('한국토지주택공사인천'), 'LH');
  assert.equal(C.orgShort('서울주택도시개발공사'), 'SH');
  assert.equal(C.orgShort('경기주택도시공사'), 'GH');
  assert.equal(C.orgShort('인천도시공사'), 'IH');
  assert.equal(C.orgShort('평택도시공사'), '평택도시공사');
  assert.equal(C.orgShort('(주)대우건설'), null);
  assert.equal(C.orgShort('인천석정 엘에이치참여형 가로주택정비사업조합'), null);
  assert.equal(C.orgShort('성남복정1피에프브이(주)'), null);
  assert.equal(C.orgShort('대한토지신탁(주)'), null);

  const joint = C.classifyOperator('인천도시공사,디엘이앤씨㈜,신동아건설㈜');
  assert.deepEqual([joint.public, joint.joint, joint.orgs], [true, true, ['IH']]);
  const lh = C.classifyOperator('한국토지주택공사 서울지역본부');
  assert.deepEqual([lh.public, lh.joint], [true, false]);
  const coop = C.classifyOperator('부천원종 LH참여형 가로주택정비사업조합');
  assert.deepEqual([coop.public, coop.publicWordOnly], [false, true]);
  const priv = C.classifyOperator('코리아신탁(주)');
  assert.deepEqual([priv.public, priv.publicWordOnly], [false, false]);
});

test('지구·블록 정규화와 합치기 키', () => {
  assert.equal(C.districtKey('인천계양(공공주택)'), '인천계양');
  assert.equal(C.districtKey('인천가정2지구'), '인천가정2');
  assert.equal(C.districtKey('성남복정1 공공주택지구'), '성남복정1');
  assert.deepEqual(C.parseDistrictBlock('남양주왕숙 A-02'), { district: '남양주왕숙', districtKey: '남양주왕숙', block: 'A2' });
  assert.deepEqual(C.parseDistrictBlock('인천계양(공공주택) A3'), { district: '인천계양', districtKey: '인천계양', block: 'A3' });
  assert.equal(C.parseDistrictBlock('인천가정2 A2블록 행복주택').block, 'A2');
  assert.equal(C.parseDistrictBlock('부천대장 A5·A6블록 신혼희망타운'), null);   // 블록 둘 → 키 없음
  assert.equal(C.parseDistrictBlock('시흥정왕 1블록 행복주택'), null);        // 번호뿐인 블록 → 키 없음
  assert.equal(C.parseDistrictBlock('파주법원'), null);
  assert.equal(C.parseDistrictBlock('경기도 시흥시 B-10블록'), null);        // 행정구역 이름은 지구가 아니다
  // 표기만 다른 같은 블록은 같은 키, 지구가 다르면 다른 키
  assert.equal(C.abKey('28', '인천계양(공공주택)', 'A-3'), C.abKey('28', '인천계양', 'A3BL'));
  assert.equal(C.abKey('28', '인천계양', 'A3'), '28|인천계양|A3');
  assert.notEqual(C.abKey('41', '남양주왕숙', 'A1'), C.abKey('41', '남양주왕숙2', 'A1'));
  assert.equal(C.abKey('11', '서울노원(행복주택)', '01'), null);
});

test('PNU 앞 15자리', () => {
  assert.equal(C.pnu15('4111314100103880019'), '411131410010388');
  assert.equal(C.pnu15('4111314100103880000'), C.pnu15('4111314100103880019'));
  assert.equal(C.pnu15('41113141001038800'), null);
  assert.equal(C.pnu15(null), null);
});

test('날짜 정리: 형식 3가지, 달력·범위 밖·자리 채우기는 null, 월만 있는 값', () => {
  assert.equal(C.cleanDay('20240115'), '2024-01-15');
  assert.equal(C.cleanDay('2024-01-15'), '2024-01-15');
  assert.equal(C.cleanDay('2024.01.15'), '2024-01-15');
  for (const bad of ['19000101', '99991231', '11111111', '20230230', '#VALUE!', '', ' 2002 5', '2024.01.15 09:00']) assert.equal(C.cleanDay(bad), null, bad);
  assert.equal(C.cleanMonth('202402'), '2024-02');
  assert.equal(C.cleanMonth('2028년 08월'), '2028-08');
  assert.equal(C.cleanMonth('2026.05'), '2026-05');
  assert.equal(C.cleanMonth('2026. 5'), '2026-05');
  assert.equal(C.cleanMonth('2027-03'), '2027-03');
  for (const bad of ['2027-00', '2017', '0000', '999912', '2026.13']) assert.equal(C.cleanMonth(bad), null, bad);
});

test('해시 ID: 이전 변환기와 같은 LH 블록 ID, 입력이 같으면 같은 값', () => {
  assert.equal(C.lhcId('강서염창(가로주택)', '01'), 'WAVE-LHC-B570EE19');   // exports/housing_wave_common_v1_4 의 값
  assert.equal(C.lhcId('마포연남(가로주택)', '01'), 'WAVE-LHC-1A310669');
  assert.match(C.waveId('APH', '15098547|2024820016'), /^WAVE-APH-[0-9A-F]{8}$/);
  assert.equal(C.waveId('APH', '15098547|2024820016'), C.waveId('APH', '15098547|2024820016'));
  assert.notEqual(C.waveId('APH', '15098547|2024820016'), C.waveId('APH', '15098547|2024820017'));
});

test('단계: 기준일 이전 ACTUAL·CONFIRMED 중 가장 늦은 단계', () => {
  const ev = (event_type, date_type, d, review_status = 'CONFIRMED') => ({ event_type, date_type, event_date: d.length === 10 ? d : '', event_month: d.length === 7 ? d : '', review_status });
  assert.equal(C.stageOf([ev('PERMIT', 'ACTUAL', '2023-03-06'), ev('SUPPLY_NOTICE', 'ACTUAL', '2023-12-29'), ev('COMPLETION', 'PLANNED', '2026-02-28')], '2026-10-12'), '공급');
  assert.equal(C.stageOf([ev('COMPLETION', 'ACTUAL', '2021-02-15'), ev('SUPPLY_NOTICE', 'ACTUAL', '2020-02-26')], '2026-10-12'), '입주');
  assert.equal(C.stageOf([ev('COMPLETION', 'ACTUAL', '2023-03-31', 'REVIEW_REQUIRED'), ev('PERMIT', 'ACTUAL', '2020-06-30')], '2026-10-12'), '인허가');
  assert.equal(C.stageOf([ev('CONSTRUCTION_START', 'ACTUAL', '2026-11-01')], '2026-10-12'), '');   // 기준일 뒤
  assert.equal(C.stageOf([ev('CONSTRUCTION_START', 'ACTUAL', '2026-10')], '2026-10-12'), '건설');
  assert.equal(C.stageOf([], '2026-10-12'), '');
});

test('CSV 쓰기: BOM·CRLF·따옴표', () => {
  const text = C.toCsv(['a', 'b', 'c'], [{ a: '서울, 강남', b: '그는 "예" 라고', c: '' }, { a: 1, b: null, c: '줄\n바꿈' }]);
  assert.ok(text.startsWith('﻿a,b,c\r\n'));
  assert.ok(text.endsWith('\r\n'));
  assert.ok(text.includes('"서울, 강남","그는 ""예"" 라고",\r\n'));
  assert.deepEqual(V.parseCsv(text.slice(1)), [['a', 'b', 'c'], ['서울, 강남', '그는 "예" 라고', ''], ['1', '', '줄\n바꿈']]);
  assert.equal(C.toCsv(['x'], []), '﻿x\r\n');
});

/* 검증기: 깨끗한 최소 묶음은 통과, 일부러 넣은 오류는 잡는다 */
function writeSet(dir, rows) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [key, [fname, header]] of Object.entries(spec.FILES)) fs.writeFileSync(path.join(dir, fname), C.toCsv(header, rows[key] ?? []));
  fs.writeFileSync(path.join(dir, spec.REVIEW_FILE[0]), C.toCsv(spec.REVIEW_FILE[1], rows.review ?? []));
}
const base = () => ({
  sources: [{ source_ref: 'WAVE-SRC-01', source_owner: 'HOUSING_WAVE', provider: 'LH', dataset_name: '준공예정', source_url: 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1', data_as_of: '2026-01-27', notes: 'schemas/ledger-2026-10/raw/applyhome/getAPTLttotPblancDetail.json' }],
  projects: [{ local_project_id: 'WAVE-LHC-00000001', project_name: '인천계양 A2', project_unit: 'BLOCK', region: '인천', organization: 'LH', public_scope: 'PUBLIC', project_status: '공급', is_demo: 'false', source_ref: 'WAVE-SRC-01' }],
  identifiers: [{ local_project_id: 'WAVE-LHC-00000001', id_type: 'HUB_HS_PK', id_value: '1000000000000000199763', id_issuer: '국토교통부', source_ref: 'WAVE-SRC-01', match_status: 'CONFIRMED' }],
  events: [{ local_project_id: 'WAVE-LHC-00000001', event_type: 'MOVE_IN', date_type: 'PLANNED', event_month: '2027-06', source_ref: 'WAVE-SRC-01', review_status: 'CONFIRMED' }],
  units: [{ local_project_id: 'WAVE-LHC-00000001', quantity_type: 'PUBLIC_PLAN', housing_type: '공공분양', unit_count: '484', reference_period: '2027-01', unit_scope: 'SUBTYPE', source_ref: 'WAVE-SRC-01', review_status: 'CONFIRMED' }],
  review: [{ review_type: 'DATE_CONFLICT', local_project_id: 'WAVE-LHC-00000001', reason: '예시' }],
});

test('검증기: 깨끗한 묶음은 통과', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv14raw-ok-'));
  writeSet(dir, base());
  const { errors, counts } = V.validate(dir);
  assert.deepEqual(errors, []);
  assert.equal(counts['사업_projects.csv'], 1);
});

test('검증기: 일부러 넣은 오류를 잡는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv14raw-bad-'));
  const r = base();
  r.projects.push({ ...r.projects[0] });                                                   // ID 중복 + 행 중복
  r.projects.push({ ...r.projects[0], local_project_id: 'X2', is_demo: 'true', region: '부산' }); // DEMO·허용값
  r.identifiers.push({ ...r.identifiers[0], local_project_id: 'NOPE', id_type: 'FOO' });      // 참조 무결성·허용값
  r.events.push({ ...r.events[0], event_date: '2027-06-31' });                                // 날짜·월 둘 다 + 달력 밖
  r.events.push({ ...r.events[0], event_type: 'PROGRESS', progress_pct: '120' });             // 범위 밖
  r.units.push({ ...r.units[0] });                                                            // 물량 키 중복
  r.units.push({ ...r.units[0], housing_type: '행복주택', unit_count: '0', source_ref: 'WAVE-SRC-99' }); // 0·없는 원천
  r.units.push({ ...r.units[0], housing_type: 'null', reference_period: ' 2027-01' });        // NULL 대용·공백
  r.sources.push({ ...r.sources[0], source_ref: 'WAVE-SRC-02', source_url: 'https://x.kr/api?serviceKey=abc' });
  r.sources.push({ ...r.sources[0], source_ref: 'WAVE-SRC-03', notes: 'a'.repeat(20) + '%2B' + 'b'.repeat(30) });
  r.review.push({ review_type: 'WHATEVER', reason: 'x' });
  writeSet(dir, r);
  const projects = path.join(dir, spec.FILES.projects[0]);
  fs.writeFileSync(projects, fs.readFileSync(projects).subarray(3));                         // BOM 지움
  const { errors } = V.validate(dir);
  const has = (re) => assert.ok(errors.some((e) => re.test(e)), `${re} 를 못 잡음:\n${errors.join('\n')}`);
  has(/사업_projects\.csv: UTF-8 BOM 없음/);
  has(/local_project_id 중복/);
  has(/같은 행이 이미 있음/);
  has(/DEMO 행/);
  has(/region='부산' 허용값 아님/);
  has(/id_type='FOO' 허용값 아님/);
  has(/local_project_id 'NOPE' 가 사업_projects\.csv 에 없음/);
  has(/event_date·event_month 중 하나만/);
  has(/event_date='2027-06-31' 날짜 형식 아님/);
  has(/progress_pct 범위 밖/);
  has(/물량이 두 번 있음/);
  has(/unit_count='0' 양의 정수 아님/);
  has(/source_ref 'WAVE-SRC-99' 가 원천_sources\.csv 에 없음/);
  has(/NULL 대용 글자 'null'/);
  has(/reference_period 앞뒤 공백/);
  has(/source_url 에 인증키처럼 보이는 값/);
  has(/notes 에 인증키처럼 보이는 값/);
  has(/review_type='WHATEVER' 허용값 아님/);
  assert.ok(!errors.some((e) => /원천_sources\.csv:2: notes/.test(e)), '파일 경로를 인증키로 보면 안 된다');
});

test('검증기: 줄바꿈 LF·헤더 바뀜을 잡고, 양식 ZIP 헤더와 대조한다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv14raw-zip-'));
  writeSet(dir, base());
  const f = path.join(dir, spec.FILES.units[0]);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace('unit_scope', 'scope'));
  const { errors } = V.validate(dir);
  assert.ok(errors.some((e) => /공급물량_units\.csv: 줄바꿈이 CRLF 가 아님/.test(e)));
  assert.ok(errors.some((e) => /공급물량_units\.csv: 헤더가 규격과 다름/.test(e)));

  // 저장 방식(무압축) ZIP 을 직접 만들어 헤더 대조를 시험한다(이름은 한글 CP949 대신 영문 꼬리만 맞춘다)
  const entries = Object.entries(spec.FILES).map(([k, [fname, header]]) => ({ name: Buffer.from(`x${fname.slice(fname.indexOf('_'))}`, 'latin1'), data: Buffer.from(`﻿${(k === 'events' ? header.slice(0, -1) : header).join(',')}\r\n`) }));
  const parts = [], central = [];
  let off = 0;
  for (const e of entries) {
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt32LE(e.data.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(e.name.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(e.data.length, 20); cd.writeUInt32LE(e.data.length, 24); cd.writeUInt16LE(e.name.length, 28); cd.writeUInt32LE(off, 42);
    parts.push(local, e.name, e.data); central.push(cd, e.name);
    off += 30 + e.name.length + e.data.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
  const zip = path.join(dir, 'spec.zip');
  fs.writeFileSync(zip, Buffer.concat([...parts, cdBuf, end]));
  const headers = V.specZipHeaders(zip);
  assert.deepEqual(headers.projects, spec.FILES.projects[1]);
  const ok = fs.mkdtempSync(path.join(os.tmpdir(), 'cv14raw-zip2-'));
  writeSet(ok, base());
  const res = V.validate(ok, zip);
  assert.deepEqual(res.errors.map((e) => e.replace(/ \[.*$/, '')), ['진행이력_events.csv: 양식 ZIP 헤더와 다름']);
});
