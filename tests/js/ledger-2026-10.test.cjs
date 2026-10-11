'use strict';
// 2026-10 기준 원장 한 벌(schemas/ledger-2026-10/tables): 저장된 표가 검증을 통과하고, 같은 입력으로 다시 만들면 똑같이 나온다.
// 건축HUB 전국 대용량(2026-08)은 중간 스냅샷(snapshot/hub-bulk-2026-08.json)과 후보 id 매핑(mappings/hub-candidate-ids.json)으로 넣는다.
// 전국 모집공고(마이홈·LH)와 한국부동산원 입주예정물량은 raw/ 의 원본(readNational)으로 넣는다: 공고 중복 제거(panId)·필지 일치 연결만·지번 주소 → 필지.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { convert, loadInputs, readHubBulk, readNational } = require('../../tools/ledger/convert');
const { nameIndex, jibunToPnu } = require('../../tools/ledger/map-lh');
const { validate } = require('../../tools/ledger/validate');
const { parseLegalDong } = require('../../tools/ledger/legal-dong');

const BASE = path.join(__dirname, '..', '..', 'schemas', 'ledger-2026-10');
const read = (p) => JSON.parse(fs.readFileSync(path.join(BASE, p), 'utf8'));
const DONG = 'raw/legal-dong/국토교통부_법정동코드_20260929.csv';
const legalDong = parseLegalDong(fs.readFileSync(path.join(BASE, DONG)), path.basename(DONG));
const national = readNational(path.join(BASE, 'raw'));
const saved = Object.fromEntries(fs.readdirSync(path.join(BASE, 'tables')).map((f) => { const j = read(`tables/${f}`); return [j.table, j.rows]; }));
const rebuilt = convert(loadInputs({
  observedMonth: '2026-10',
  lhSgg: read('mappings/lh-block-sgg.json'),
  hubEvents: read('snapshot/hub-events.json').rows,
  legalDong,
  hubBulk: readHubBulk(path.join(BASE, 'snapshot/hub-bulk-2026-08.json')),
  hubIds: read('mappings/hub-candidate-ids.json'),
  national,
}));
const BULK = 'hub-bulk-hs-2026-08', MYHOME = 'myhome-hwspr02', LH_NOTICE = 'datagokr-15058530', MOVE_IN = 'datagokr-15111714';

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
  assert.deepEqual([lh.length, bulk.length, candidates.length], [273, 3495, 3768]);
  assert.ok(lh.every((p) => p.agency_id === 'lh'));
  assert.ok(bulk.every((p) => p.as_of === '2026-08-31'));
  const inferred = bulk.filter((p) => p.agency_id);
  assert.ok(bulk.filter((p) => !p.agency_id).every((p) => p.public_scope === 'UNKNOWN' && p.public_basis === null));
  assert.equal(inferred.length, 3, '공고 필지 연결로 기관을 채운 후보');
  assert.ok(inferred.every((p) => p.agency_id === 'lh' && p.public_scope === 'PUBLIC' && p.public_basis.startsWith('마이홈 모집공고 공급기관 LH(')));
  assert.ok(inferred.every((p) => saved.notice_links.some((l) => l.local_project_id === p.local_project_id)));
  assert.equal(new Set(saved.projects.map((p) => p.sgg_code.slice(0, 2))).size, 16, '시도 16곳(전남광주 12 하나)');
  assert.ok(saved.events.every((e) => e.observed_month === '2026-10'));
  assert.equal(saved.events.filter((e) => e.source_ref === 'hub-hs-basis').length, read('snapshot/hub-events.json').rows.length);
  assert.deepEqual([...new Set(saved.review_required.map((r) => r.review_type))].sort(), ['LINK_CANDIDATE', 'PUBLIC_SCOPE_UNKNOWN', 'SGG_UNRESOLVED']);
  assert.ok(saved.review_required.filter((r) => r.review_type !== 'PUBLIC_SCOPE_UNKNOWN').every((r) => r.source_ref === BULK), '시군구 미해결·연결 후보는 건축HUB 대용량에서만(입주예정 주소는 시군구를 모두 찾았다)');
  assert.equal(saved.areas.filter((a) => a.source_ref === 'datagokr-15123287').length, 20560, '법정동코드 파일의 존재 행');
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

test('공고: 마이홈 panId 가 LH PAN_ID 와 같으면 한 공고(LH, PAN_ID · 값과 원천은 마이홈), 저장된 표는 LH 4,985 + 마이홈만 8 = 4,993', () => {
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
  assert.equal(saved.notices.length, 4993);
  assert.equal(new Set(saved.notices.map((n) => `${n.notice_system}|${n.notice_id}`)).size, 4993);
  assert.deepEqual([saved.notices.filter((n) => n.source_ref === MYHOME && n.notice_system === 'LH').length, saved.notices.filter((n) => n.notice_system === 'MYHOME').length], [107, 8]);
  assert.ok(saved.notices.filter((n) => n.source_ref === LH_NOTICE).every((n) => n.sgg_code === null && n.pnu === null && n.apply_start === null), 'LH 목록만 있는 공고는 시도뿐');
  for (const ref of [MYHOME, LH_NOTICE, MOVE_IN]) assert.ok(saved.sources.some((x) => x.source_ref === ref), ref);
});

test('공고 연결은 필지 일치만: 이름만 같은 공고는 잇지 않고, 필지가 사업 위치 필지와 같으면 notice_links + SUPPLY_NOTICE(실제, 공고일)', () => {
  const name = saved.projects.find((p) => p.local_project_id === regLoc.local_project_id).project_name;
  const { t, r } = small({ myhome: { ...national.myhome, rows: [
    myRow({ pblancId: '9101', hsmpNm: name }),
    myRow({ pblancId: '9102', pnu: regLoc.pnu, endDe: '20261031' }),
  ] } });
  assert.deepEqual(t.notice_links.map((l) => [l.notice_id, l.local_project_id, l.review_status]), [['9102', regLoc.local_project_id, 'REVIEW_REQUIRED']]);
  assert.equal(r.noticeNameOnly, 1, '이름만 같은 공고는 세기만 한다');
  const ev = t.events.filter((e) => e.source_ref === MYHOME);
  assert.deepEqual(ev.map((e) => [e.local_project_id, e.event_type, e.date_type, e.event_date, e.event_detail]), [[regLoc.local_project_id, 'SUPPLY_NOTICE', 'ACTUAL', '2026-10-01', '공고 MYHOME 9102 · 접수 2026-10-05 ~ 2026-10-31']]);
  /* 저장된 표: 연결 10 = 모두 필지 일치(evidence 의 필지 = 그 사업의 위치 필지), 연결마다 SUPPLY_NOTICE 하나 */
  const locs = new Set(saved.project_locations.filter((l) => l.pnu).map((l) => `${l.local_project_id}|${l.pnu}`));
  assert.equal(saved.notice_links.length, 10);
  for (const l of saved.notice_links) assert.ok(locs.has(`${l.local_project_id}|${/필지 (\d{19})/.exec(l.evidence)[1]}`), l.evidence);
  assert.equal(saved.events.filter((e) => e.event_type === 'SUPPLY_NOTICE' && e.source_ref === MYHOME).length, saved.notice_links.length);
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
