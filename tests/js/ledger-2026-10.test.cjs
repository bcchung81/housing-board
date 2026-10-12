'use strict';
// 2026-10 기준 원장 한 벌(schemas/ledger-2026-10/tables): 저장된 표가 검증을 통과하고, 같은 입력으로 다시 만들면 똑같이 나온다.
// 건축HUB 전국 대용량(2026-08)은 중간 스냅샷(snapshot/hub-bulk-2026-08.json, 열린 달 주 1회 갱신 뒤면 snapshot/hub-refresh.json)과 후보 id 매핑(mappings/hub-candidate-ids.json)으로 넣는다.
// 전국 모집공고(마이홈·LH)와 한국부동산원 입주예정물량은 raw/ 의 원본(readNational)으로 넣는다: 공고 중복 제거(panId)·필지 일치 연결만·지번 주소 → 필지.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { convert, loadInputs, readHubBulk, readNational } = require('../../tools/ledger/convert');
const NL = require('../../tools/ledger/notice-link');
const { nameIndex, jibunToPnu } = require('../../tools/ledger/map-lh');
const { validate } = require('../../tools/ledger/validate');
const { parseLegalDong } = require('../../tools/ledger/legal-dong');
const P = require('../../tools/ledger/paths');

const BASE = path.join(__dirname, '..', '..', 'schemas', 'ledger-2026-10');
const ED = P.bulkDataMonth(path.join(BASE, 'raw/hub-bulk'));   // 이 폴더가 쓰는 건축HUB 대용량 판(첫 판 2026-08, 같은 달 갱신이면 바뀐다)
const read = (p) => JSON.parse(fs.readFileSync(path.join(BASE, p), 'utf8'));
const DONG = `raw/legal-dong/${fs.readdirSync(path.join(BASE, 'raw/legal-dong')).filter((f) => f.endsWith('.csv')).sort().pop()}`;
const legalDong = parseLegalDong(fs.readFileSync(path.join(BASE, DONG)), path.basename(DONG));
const national = readNational(path.join(BASE, 'raw'));
const saved = Object.fromEntries(fs.readdirSync(path.join(BASE, 'tables')).map((f) => { const j = read(`tables/${f}`); return [j.table, j.rows]; }));
const rebuilt = convert(loadInputs({
  observedMonth: '2026-10',
  lhSgg: read('mappings/lh-block-sgg.json'),
  hubEvents: read('snapshot/hub-events.json').rows,
  legalDong,
  hubBulk: readHubBulk(path.join(BASE, fs.existsSync(path.join(BASE, 'snapshot/hub-refresh.json')) ? 'snapshot/hub-refresh.json' : `snapshot/hub-bulk-${ED}.json`)),   // 열린 달 API 덮어쓰기(hub-api-refresh.js)가 있으면 그것
  hubIds: read('mappings/hub-candidate-ids.json'),
  national,
}));
const BULK = `hub-bulk-hs-${ED}`, MYHOME = 'myhome-hwspr02', LH_NOTICE = 'datagokr-15058530', MOVE_IN = 'datagokr-15111714';

test('저장된 2026-10 기준 표 16개가 검증(스키마·키 중복·표 사이 참조)을 통과한다', () => {
  assert.equal(Object.keys(saved).length, 16);
  assert.deepEqual(validate(saved), []);
});

test('같은 입력(법정동코드·LH 매핑·건축HUB 스냅샷·건축HUB 대용량·후보 id 매핑·전국 공고·입주예정)으로 다시 만들면 저장된 표와 같다', () => {
  for (const [table, rows] of Object.entries(rebuilt)) {
    assert.equal(rows.length, saved[table].length, table);
    rows.forEach((r, i) => { if (JSON.stringify(r) !== JSON.stringify(saved[table][i])) assert.deepEqual(saved[table][i], r, `${table}[${i}]`); });   // 큰 표의 deepEqual 실패 출력이 느려 다른 행만 비교한다
  }
});

test('2026-10 기준: 사업 = 발급 77 + LH 후보 273 + 건축HUB 대용량 후보 3,495(발급 전, 진행 중만), 이벤트는 모두 2026-10 관측', () => {
  const issued = saved.projects.filter((p) => p.issued_at), candidates = saved.projects.filter((p) => !p.issued_at);
  const lh = candidates.filter((p) => p.source_ref === 'datagokr-15141761'), bulk = candidates.filter((p) => p.source_ref === BULK);
  assert.equal(issued.length, 77);
  assert.equal(lh.length, 273);
  assert.equal(candidates.length, lh.length + bulk.length, '후보 = LH 후보 + 건축HUB 대용량 후보(첫 판 3,495)');
  assert.ok(bulk.length > 0);
  assert.ok(lh.every((p) => p.agency_id === 'lh'));
  assert.ok(bulk.every((p) => p.as_of === P.lastDay(ED)));
  const inferred = bulk.filter((p) => p.agency_id);
  assert.ok(bulk.filter((p) => !p.agency_id).every((p) => p.public_scope === 'UNKNOWN' && p.public_basis === null));
  const linkedBulk = new Set(saved.notice_links.map((l) => l.local_project_id).filter((id) => bulk.some((p) => p.local_project_id === id)));
  assert.deepEqual(inferred.map((p) => p.local_project_id).sort(), [...linkedBulk].sort(), '공고에 연결된 건축HUB 후보는 모두 공급기관(LH)으로 기관을 채웠다(첫 판 35)');
  assert.ok(inferred.every((p) => p.agency_id === 'lh' && p.public_scope === 'PUBLIC' && /^모집공고 공급기관 LH\(공고 (LH|MYHOME) \S+, (M1_PNU|T1_LH_DISTRICT_BLOCK|T2_NAME_DISTRICT_BLOCK) — 자동 연결, 확인 필요\)$/.test(p.public_basis)), '근거는 public_basis');
  assert.equal(new Set(saved.projects.map((p) => p.sgg_code.slice(0, 2))).size, 16, '시도 16곳(전남광주 12 하나)');
  assert.ok(saved.events.every((e) => e.observed_month === '2026-10'));
  assert.equal(saved.events.filter((e) => e.source_ref === 'hub-hs-basis').length, read('snapshot/hub-events.json').rows.length);
  assert.deepEqual([...new Set(saved.review_required.map((r) => r.review_type))].sort(), ['DUPLICATE_CANDIDATE', 'LINK_CANDIDATE', 'PUBLIC_SCOPE_UNKNOWN', 'SGG_UNRESOLVED']);
  assert.ok(saved.review_required.filter((r) => r.review_type === 'SGG_UNRESOLVED').every((r) => r.source_ref === BULK), '시군구 미해결은 건축HUB 대용량에서만(입주예정 주소는 시군구를 모두 찾았다)');
  assert.ok(saved.review_required.filter((r) => r.review_type === 'LINK_CANDIDATE').every((r) => r.source_ref === BULK || r.detail.startsWith(`${NL.RULE.T3}: `)), '연결 후보는 LH↔건축HUB 묶음 또는 공고 T3');
  assert.equal(saved.areas.filter((a) => a.source_ref === 'datagokr-15123287').length, legalDong.rows.length, '법정동코드 파일의 존재 행(20,560)');
});

test('예정일 경과(2026-10-10): 현재 예정의 기간 끝이 지났고, 같은 종류의 실제 기록이 없고, 사업 단계가 아직 그 단계 전인 건축HUB 사업 — 9개 사업 13쌍', () => {
  const stage = Object.fromEntries(saved.projects.map((p) => [p.local_project_id, p.stage_code]));
  const hub = saved.events.filter((e) => e.source_ref === 'hub-hs-basis');
  const actual = new Set(hub.filter((e) => e.date_type === 'ACTUAL').map((e) => `${e.local_project_id}|${e.event_type}`));
  const end = (e) => e.event_date ?? (e.event_month ? `${e.event_month}-31` : `${e.event_year}-12-31`);
  const reached = { CONSTRUCTION_START: '04', COMPLETION: '06' };
  const overdue = hub.filter((e) => e.date_type === 'PLANNED' && end(e) < '2026-10-10' && !actual.has(`${e.local_project_id}|${e.event_type}`) && stage[e.local_project_id] < reached[e.event_type]);
  assert.equal(overdue.length, 13);
  assert.equal(new Set(overdue.map((e) => e.local_project_id)).size, 9);
});

/* 공고·입주예정 시험용 작은 입력: 대용량 없이(레지스트리·LH 후보만) 바꾼 원본으로 변환한다 */
const small = (nat) => { const report = {}; const t = convert({ ...loadInputs({ observedMonth: '2026-10', legalDong, national: { ...national, ...nat } }), report }); return { t, r: report.national }; };
const regLoc = saved.project_locations.find((l) => l.local_project_id === 'PRJ-11290-0001' && l.pnu);
const lhPan = national.lhNotice.notices[0].PAN_ID;
const myRow = (o) => ({ pblancId: '9001', houseSn: 1, pblancNm: '시험 공고', suplyInsttNm: 'LH', url: '', hsmpNm: '시험단지', brtcNm: '서울특별시', signguNm: '성북구', pnu: '', rcritPblancDe: '20261001', beginDe: '20261005', endDe: '20261010', ...o });

test('공고: 마이홈 panId 가 LH PAN_ID 와 같으면 한 공고(LH, PAN_ID · 값과 원천은 마이홈), 저장된 표는 LH 목록 + 마이홈만(첫 실행 4,985 + 8 = 4,993)', () => {
  const { t, r } = small({ myhome: { ...national.myhome, rows: [
    myRow({ pblancId: '9001', url: `https://apply.lh.or.kr/x?panId=${lhPan}&a=1` }), myRow({ pblancId: '9001', houseSn: 2, url: `https://apply.lh.or.kr/x?panId=${lhPan}&a=1` }),
    myRow({ pblancId: '9002', url: 'https://example.kr/board?id=1', suplyInsttNm: '부산도시공사' }),
  ] } });
  assert.equal(t.notices.length, national.lhNotice.notices.length + 1);
  const merged = t.notices.filter((n) => n.notice_system === 'LH' && n.notice_id === lhPan);
  assert.equal(merged.length, 1);
  assert.deepEqual([merged[0].source_ref, merged[0].notice_title, merged[0].announced_on, merged[0].apply_start, merged[0].apply_end, merged[0].sgg_code], [MYHOME, '시험 공고', '2026-10-01', '2026-10-05', '2026-10-10', '11290']);
  assert.ok(t.notices.some((n) => n.notice_system === 'MYHOME' && n.notice_id === '9002'));
  assert.equal(r.merged, 1);
  assert.equal(saved.notices.length, national.lhNotice.notices.length + saved.notices.filter((n) => n.notice_system === 'MYHOME').length, '공고 원본은 주 1회 갱신으로 바뀐다(첫 실행 4,993)');
  assert.equal(new Set(saved.notices.map((n) => `${n.notice_system}|${n.notice_id}`)).size, saved.notices.length);
  assert.deepEqual([saved.notices.filter((n) => n.source_ref === MYHOME && n.notice_system === 'LH').length, saved.notices.filter((n) => n.notice_system === 'MYHOME').length], [107, 8]);
  assert.ok(saved.notices.filter((n) => n.source_ref === LH_NOTICE).every((n) => n.sgg_code === null && n.pnu === null && n.apply_start === null), 'LH 목록만 있는 공고는 시도뿐');
  for (const ref of [MYHOME, LH_NOTICE, MOVE_IN]) assert.ok(saved.sources.some((x) => x.source_ref === ref), ref);
});

test('공고 연결(M1 필지): 이름만 같은 공고는 잇지 않고, 필지가 사업 위치 필지와 같으면 notice_links + 최초 모집이면 SUPPLY_NOTICE(실제, 공고일)', () => {
  const name = saved.projects.find((p) => p.local_project_id === regLoc.local_project_id).project_name;
  const { t, r } = small({ lhNotice: { ...national.lhNotice, notices: [], supply: [] }, myhome: { ...national.myhome, rows: [
    myRow({ pblancId: '9101', hsmpNm: name }),
    myRow({ pblancId: '9102', pblancNm: '시험 입주자모집공고', pnu: regLoc.pnu, endDe: '20261031' }),
    myRow({ pblancId: '9103', pblancNm: '시험 잔여세대 추가 입주자모집공고', pnu: regLoc.pnu }),
  ] } });
  assert.deepEqual(t.notice_links.map((l) => [l.notice_id, l.local_project_id, l.review_status]), [['9102', regLoc.local_project_id, 'REVIEW_REQUIRED'], ['9103', regLoc.local_project_id, 'REVIEW_REQUIRED']]);
  assert.match(t.notice_links[0].evidence, /^M1_PNU: 마이홈 공고 9102-1 시험단지 필지 \d{19} = 사업 위치 필지$/);
  assert.equal(r.noticeNameOnly, 1, '이름만 같은 공고는 세기만 한다');
  const ev = t.events.filter((e) => e.source_ref === MYHOME);
  assert.deepEqual(ev.map((e) => [e.local_project_id, e.event_type, e.date_type, e.event_date, e.event_detail]), [[regLoc.local_project_id, 'SUPPLY_NOTICE', 'ACTUAL', '2026-10-01', '공고 MYHOME 9102 · 접수 2026-10-05 ~ 2026-10-31']], '잔여세대 추가 모집은 연결만');
});

test('공고 연결(T1 제목): 정정공고는 한 묶음(이벤트 하나, 가장 이른 공고일), 잔여세대·비공급(가정어린이집)은 연결만, 취소공고·다른 시도·블록만 같은 공고는 잇지 않는다', () => {
  const report = {};
  const lhN = (PAN_ID, PAN_NM, o = {}) => ({ PAN_ID, PAN_NM, CNP_CD_NM: '경기도', PAN_NT_ST_DT: '2026.03.02', CLSG_DT: '2026.03.20', AIS_TP_CD_NM: '분양주택', ...o });
  const t = convert({ ...loadInputs({ observedMonth: '2026-10', legalDong, lhSgg: read('mappings/lh-block-sgg.json'), national: { ...national, myhome: { ...national.myhome, rows: [] }, lhNotice: { ...national.lhNotice, supply: [], notices: [
    lhN('T901', '부천대장 A7블록 공공분양주택 입주자모집공고'),
    lhN('T902', '[정정공고]부천대장 A7블록 공공분양주택 입주자모집공고', { PAN_NT_ST_DT: '2026.03.05' }),
    lhN('T903', '부천대장 A7블록 공공분양주택 잔여세대 추가 입주자모집공고', { PAN_NT_ST_DT: '2026.06.01' }),
    lhN('T904', '부천대장 A7블록 가정어린이집 운영예정자 모집공고', { AIS_TP_CD_NM: '가정어린이집' }),
    lhN('T905', '[취소공고]부천대장 A7블록 공공분양주택 잔여세대 추가 입주자모집공고'),
    lhN('T906', '부천대장 A7블록 공공분양주택 입주자모집공고', { CNP_CD_NM: '인천광역시' }),
    lhN('T907', 'A7블록 공공분양주택 입주자모집공고'),
  ] } } }), report });
  const pid = t.identifiers.find((x) => x.id_type === 'AREA_BLOCK' && x.id_value === '부천대장|A7').local_project_id;
  assert.deepEqual(t.notice_links.map((l) => [l.notice_id, l.local_project_id, l.source_ref]), ['T901', 'T902', 'T903', 'T904'].map((id) => [id, pid, LH_NOTICE]));
  assert.ok(t.notice_links.every((l) => l.evidence.startsWith(`${NL.RULE.T1}: `) && l.review_status === 'REVIEW_REQUIRED'));
  assert.match(t.notice_links[3].evidence, /주택 공급 공고 아님/);
  const ev = t.events.filter((e) => e.event_type === 'SUPPLY_NOTICE' && e.source_ref === LH_NOTICE);
  assert.deepEqual(ev.map((e) => [e.local_project_id, e.date_type, e.event_date, e.event_detail, e.review_status]), [[pid, 'ACTUAL', '2026-03-02', '공고 LH T901 · 접수 ? ~ 2026-03-20 · 정정·재공고 LH T902', 'REVIEW_REQUIRED']]);
  assert.equal(report.national.cancelled, 1);
});

test('저장된 표의 공고 연결: 규칙 M1·T1·T2(evidence 앞머리)만, 모두 REVIEW_REQUIRED, 취소공고 없음 · SUPPLY_NOTICE = 연결된 최초 입주자모집 공고의 사업 × 정정·재공고 묶음', () => {
  const locs = new Set(saved.project_locations.filter((l) => l.pnu).map((l) => `${l.local_project_id}|${l.pnu}`));
  const notice = new Map(saved.notices.map((n) => [`${n.notice_system}|${n.notice_id}`, n]));
  const lhType = new Map(national.lhNotice.notices.map((n) => [n.PAN_ID, n.AIS_TP_CD_NM]));
  const kind = (l) => NL.noticeKind(notice.get(`${l.notice_system}|${l.notice_id}`).notice_title, l.notice_system === 'LH' ? lhType.get(l.notice_id) : undefined);
  const rules = new Set();
  for (const l of saved.notice_links) {
    const rule = /^(M1_PNU|T1_LH_DISTRICT_BLOCK|T2_NAME_DISTRICT_BLOCK): /.exec(l.evidence)?.[1];
    assert.ok(rule, l.evidence);
    rules.add(rule);
    if (rule === 'M1_PNU') assert.ok(locs.has(`${l.local_project_id}|${/필지 (\d{19})/.exec(l.evidence)[1]}`), l.evidence);
    assert.equal(l.review_status, 'REVIEW_REQUIRED');
    assert.notEqual(kind(l), 'CANCEL');
  }
  assert.deepEqual([...rules].sort(), ['M1_PNU', 'T1_LH_DISTRICT_BLOCK', 'T2_NAME_DISTRICT_BLOCK']);
  const expected = new Set(saved.notice_links.filter((l) => kind(l) === 'INITIAL' && notice.get(`${l.notice_system}|${l.notice_id}`).announced_on)
    .map((l) => `${l.local_project_id}|${NL.noticeGroup(notice.get(`${l.notice_system}|${l.notice_id}`).notice_title)}`));
  const ev = saved.events.filter((e) => e.event_type === 'SUPPLY_NOTICE' && [MYHOME, LH_NOTICE].includes(e.source_ref));
  const got = ev.map((e) => { const [, sys, id] = /^공고 (\w+) (\S+) · /.exec(e.event_detail); return `${e.local_project_id}|${NL.noticeGroup(notice.get(`${sys}|${id}`).notice_title)}`; });
  assert.equal(new Set(got).size, got.length, '사업 × 묶음마다 이벤트 하나');
  assert.deepEqual(got.sort(), [...expected].sort());
  assert.ok(ev.every((e) => e.date_type === 'ACTUAL' && e.review_status === 'REVIEW_REQUIRED'));
});

test('검토 목록: T3 는 잇지 않고 LINK_CANDIDATE(공고 원천), 같은 공고·같은 블록에 자동 연결된 두 사업은 DUPLICATE_CANDIDATE 로만(병합하지 않음)', () => {
  const linked = new Set(saved.notice_links.map((l) => `${l.local_project_id}|${l.notice_system} ${l.notice_id}`));
  const t3 = saved.review_required.filter((r) => r.review_type === 'LINK_CANDIDATE' && r.source_ref !== BULK);
  assert.ok(t3.length > 0);
  assert.ok(t3.every((r) => [MYHOME, LH_NOTICE].includes(r.source_ref) && !linked.has(`${r.local_project_id}|${r.record_key}`)));
  const dup = saved.review_required.filter((r) => r.review_type === 'DUPLICATE_CANDIDATE');
  assert.ok(dup.length > 0);
  assert.equal(new Set(dup.map((r) => r.record_key)).size, dup.length, '두 사업 쌍마다 한 행');
  const ids = new Set(saved.projects.map((p) => p.local_project_id));
  for (const r of dup) {
    const [a, b] = r.record_key.split('|');
    assert.equal(r.local_project_id, a);
    assert.ok(ids.has(a) && ids.has(b), '두 사업 모두 원장에 남아 있다');
    const of = (pid) => new Set(saved.notice_links.filter((l) => l.local_project_id === pid).map((l) => `${l.notice_system} ${l.notice_id}`));
    const nb = of(b);
    assert.ok([...of(a)].some((n) => nb.has(n)), `${r.record_key}: 같은 공고에 연결`);
  }
});

test('지번 주소 → 필지: 보통 · 산(대지구분 1 → PNU 2) · 시도 통합(광주광역시 → 12) · 인천 서구 개편 · 세종 · 끝 괄호, 본번 0·행정동은 실패', () => {
  const idx = nameIndex(legalDong.rows);
  const code = (name) => legalDong.rows.find((r) => r.area_name === name).area_code;
  assert.deepEqual(jibunToPnu('강원특별자치도 강릉시 견소동 219-0', idx), { sgg: '51150', bjd: code('강원특별자치도 강릉시 견소동'), pnu: `${code('강원특별자치도 강릉시 견소동')}102190000` });
  assert.equal(jibunToPnu('강원특별자치도 강릉시 송정동 산 77-3', idx).pnu, `${code('강원특별자치도 강릉시 송정동')}200770003`);
  assert.equal(jibunToPnu('광주광역시 동구 산수동 산67-23', idx).pnu, `${code('전남광주통합특별시 동구 산수동')}200670023`, '산 뒤 빈칸 없음 · 옛 시도 이름');
  assert.match(jibunToPnu('광주광역시 광산구 운수동 546-0', idx).pnu, /^12\d{8}105460000$/);
  assert.equal(jibunToPnu('인천광역시 서구 가정동 100-1', idx).bjd, '2827510600', '2026-07 개편: 서구 가정동 → 서해구 가정동(동 이름이 맞는 새 구)');
  assert.equal(jibunToPnu('세종특별자치시 합강동 22-28', idx).pnu, `${code('세종특별자치시 합강동')}100220028`);
  assert.equal(jibunToPnu('경기도 수원시 장안구 이목동 511-1 (이목지구 A4BL)', idx).pnu, `${code('경기도 수원시 장안구 이목동')}105110001`);
  assert.deepEqual(jibunToPnu('광주광역시 북구 월출동 0-0', idx), { error: 'LOT', sgg: code('전남광주통합특별시 북구').slice(0, 5) });
  assert.equal(jibunToPnu('서울특별시 중랑구 중화2동 296-44', idx).error, 'BJD', '행정동 이름');
  assert.equal(jibunToPnu('경상남도 김해시 진례면 진례지구B-1BL', idx).error, 'LOT');
  assert.equal(jibunToPnu('어딘가 없는시 없는동 1-1', idx).error, 'SGG');
});

test('입주예정: 필지가 사업 위치와 같은 행만 MOVE_IN 예정(CURRENT, 월) — 월이 2027-00 이면 싣지 않고, 맞는 사업이 없으면 사업을 만들지 않는다', () => {
  const { t, r } = small({ moveIn: { ...national.moveIn, rows: [
    { month: '2027-03', region: '서울', type: '분양', address: 'x', name: '맞음', units: 100 },
    { month: '2027-00', region: '서울', type: '분양', address: 'x', name: '월 오류', units: 50 },
    { month: '2027-04', region: '서울', type: '분양', address: '서울특별시 성북구 장위동 99999-1', name: '사업 없음', units: 30 },
  ].map((x, i) => (i < 2 ? { ...x, address: null } : x)) } });
  assert.equal(t.events.filter((e) => e.source_ref === MOVE_IN).length, 0, '주소가 없거나 월이 틀리거나 사업이 없으면 이벤트 없음');
  assert.deepEqual([r.moveIn.badMonth, r.moveIn.parseFailed.LOT, r.moveIn.noProject, r.moveIn.events], [1, 1, 1, 0]);
  const reg = legalDong.rows.find((x) => x.area_code === regLoc.bjd_code).area_name;
  const addr = `${reg} ${+regLoc.pnu.slice(11, 15)}-${+regLoc.pnu.slice(15)}`;
  const two = small({ moveIn: { ...national.moveIn, rows: [{ month: '2027-03', region: '서울', type: '분양', address: addr, name: '맞음', units: 100 }, { month: '2027-00', region: '서울', type: '분양', address: addr, name: '월 오류', units: 50 }] } });
  assert.deepEqual(two.t.events.filter((e) => e.source_ref === MOVE_IN).map((e) => [e.local_project_id, e.event_type, e.date_type, e.plan_basis, e.event_month, e.event_detail]), [[regLoc.local_project_id, 'MOVE_IN', 'PLANNED', 'CURRENT', '2027-03', '맞음 100세대(분양)']]);
  assert.equal(two.t.projects.length, t.projects.length, '사업을 만들지 않는다');
  /* 저장된 표: 703행 = 월 오류 2 · 주소 실패 80(본번 0 등 77 · 법정동 3) · 사업 없음 250 · 맞음 371 → 이벤트 370(사업 370) */
  const ev = saved.events.filter((e) => e.source_ref === MOVE_IN);
  assert.equal(national.moveIn.rows.length, 703);
  assert.equal(ev.length, 370);
  assert.ok(ev.every((e) => e.event_type === 'MOVE_IN' && e.date_type === 'PLANNED' && e.plan_basis === 'CURRENT' && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.event_month)));
  const idx = nameIndex(legalDong.rows), pnus = new Set(national.moveIn.rows.filter((x) => /^\d{4}-(0[1-9]|1[0-2])$/.test(x.month)).map((x) => jibunToPnu(x.address, idx).pnu).filter(Boolean));
  const located = new Set(saved.project_locations.filter((l) => pnus.has(l.pnu)).map((l) => l.local_project_id));
  assert.deepEqual([...new Set(ev.map((e) => e.local_project_id))].sort(), [...located].sort(), '이벤트가 있는 사업 = 입주예정 필지가 위치 필지인 사업');
});
