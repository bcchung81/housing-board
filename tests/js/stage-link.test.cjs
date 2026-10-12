'use strict';
// 단계별 원천 → 원장 자동 연결 규칙(tools/ledger/stage-link.js addStage): 작은 가짜 입력으로 규칙마다 잇는 것·잇지 않는 것을 고정한다. 파일·네트워크를 쓰지 않는다.
// 실제 2026-10 원장의 효과 숫자는 ledger-2026-10.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { addStage, isStageSource, supplyKind, nameParts, nameEq, nameContain } = require('../../tools/ledger/stage-link');
const { boardFromLedger, mapIndexFromLedger } = require('../../tools/ledger/board');
const { makePnu } = require('../../lib/permits.js');

const mapper = { bjd: (c) => c, sgg: (c) => c };   // 가짜 코드 변환: 옛 코드 없음
const own = { source_owner: 'HOUSING_WAVE', source_url: null, data_as_of: null, collected_at: null, original_filename: null, notes: null, record_count: null, license: null, is_demo: false };
const BULK = 'hub-bulk-hs-2026-08';
const lot = (n) => makePnu('11110', '10100', String(n), '0', '0');   // 서울 종로구 청운동 n 번지
const rec = (pk, o) => ({ pk, sgg: '11110', bjd: '10100', plat_gb: '0', bun: '1', ji: '0', block: '', special: '', name: `사업 ${pk}`, complex: null, households: 100, apprv: '2020-01-01', site: null, ...o });
const blockRec = (pk, o) => rec(pk, { plat_gb: '2', bun: '', ji: '', block: 'A1', ...o });
const bld = (o) => ({ src: 'S', pk: 'B1', match: 'PARCEL', sgg: '11110', bjd: '1111010100', pnu: lot(1), plat_gb: '0', block: null, lot: null, name: '새 단지', use: '공동주택', households: 100, permit: '2020-01-01', start: '2021-03-01', use_date: '2024-05-01', ref_apprv: '2020-01-01', after_apprv: true, ...o });
const ah = (o) => ({ key: '2024000001|2024000001', kind: 'APT', type: '민영', name: '시험 단지', address: '서울특별시 종로구 청운동 1', address_kind: 'JIBUN', sgg: '11110', bjd: '1111010100', pnu: null, pnu_via: null, blocks: [], district: null, households: 100, announced: '2024-03-01', move_in: '2026-12', sponsor: null, public_district: false, large_site: false, presale: false, presale_basis: null, ...o });
const hug = (o) => ({ key: '11110|시험 단지|2024-02-01', sgg: '11110', area: '서울 종로구', name: '시험 단지', total: 100, general: 100, announced: '2024-02-01', sale_open: null, guarantee: '2024-01-15', developer: null, builder: null, ...o });

/* 사업마다 { id, recs: [기록], pnu?, events?: [[종류, 구분, 날짜]] } → 원장 표 · 건축HUB 기록 */
function ledger(projects) {
  const t = { projects: [], identifiers: [], project_locations: [], complexes: [], events: [], notices: [], notice_links: [], review_required: [], sources: [] };
  const recs = [];
  for (const p of projects) {
    t.projects.push({ local_project_id: p.id, project_name: p.name ?? null, project_unit: 'PROJECT', sgg_code: '11110', agency_id: null, public_scope: 'UNKNOWN', public_basis: null, stage_code: p.stage ?? '03', as_of: '2026-08-31', issued_at: p.issued ?? null, superseded_by: null, source_ref: p.source ?? BULK });
    for (const r of p.recs ?? []) { recs.push(r); t.identifiers.push({ local_project_id: p.id, id_type: 'HUB_HS_PK', id_value: r.pk, id_issuer: '국토교통부', as_of: '2026-08-31', source_ref: BULK, match_status: 'CONFIRMED', match_rule: null }); }
    if (p.pnu) t.project_locations.push({ local_project_id: p.id, bjd_code: p.pnu.slice(0, 10), pnu: p.pnu, pnu_scope: 'SITE', source_ref: BULK });
    for (const [event_type, date_type, d] of [['PERMIT', 'ACTUAL', p.apprv ?? '2020-01-01'], ...(p.events ?? [])]) t.events.push({ local_project_id: p.id, complex_id: null, event_type, date_type, plan_basis: date_type === 'PLANNED' ? 'CURRENT' : null, event_date: d, event_month: null, event_year: null, progress_pct: null, event_detail: null, change_reason: null, change_note: null, observed_month: '2026-10', source_ref: BULK, review_status: 'CONFIRMED' });
  }
  return { t, recs };
}
const STAGE0 = { dataMonth: '2026-08', bld: [], reb: [], kapt: [], myhome: [], applyhome: [], hug: [], lhDetail: [], lhSchedule: [] };
function run(projects, stage) {
  const { t, recs } = ledger(projects);
  const n = { events: t.events.length, identifiers: t.identifiers.length };
  const report = {};
  addStage(t, { stage: { ...STAGE0, ...stage }, hubRecords: recs, mapper, observedMonth: '2026-10', own, report });
  return { t, r: report.stage, added: { events: t.events.slice(n.events), identifiers: t.identifiers.slice(n.identifiers) } };
}
const ev = (t, type, dt) => t.events.filter((e) => e.event_type === type && e.date_type === dt && isStageSource(e.source_ref));

test('건축물대장(K2_BLD_PARCEL): 사용승인일 ≥ 허가 승인일(after_apprv)인 세대 있는 대장만 — 재건축 전 옛 대장(after_apprv false)·세대 없는 대장은 무시, 준공·착공 실제는 없을 때만', () => {
  const P = [{ id: 'PRJ-11110-0001', recs: [rec('R1')], pnu: lot(1) }];
  const old = bld({ pk: 'OLD', use_date: '1990-05-01', start: '1988-01-01', after_apprv: false });
  const shop = bld({ pk: 'SHOP', use: '제1종근린생활시설', households: 0 });
  const none = run(P, { bld: [old, shop] });
  assert.deepEqual([none.added.events.length, none.added.identifiers.length], [0, 0], '옛 대장·세대 없는 대장으로는 준공을 만들지 않는다');
  const { t, added } = run(P, { bld: [old, bld()] });
  assert.deepEqual(ev(t, 'COMPLETION', 'ACTUAL').map((e) => [e.event_date, e.source_ref, e.review_status]), [['2024-05-01', 'hub-bulk-bld-2026-08', 'REVIEW_REQUIRED']]);
  assert.deepEqual(ev(t, 'CONSTRUCTION_START', 'ACTUAL').map((e) => e.event_date), ['2021-03-01'], '착공일은 승인일 −30일 이후');
  assert.deepEqual(added.identifiers.map((i) => [i.id_type, i.id_value, i.match_rule]), [['BLDRGST_PK', 'B1', 'K2_BLD_PARCEL']]);
  const early = run(P, { bld: [bld({ start: '2019-11-01' })] });
  assert.equal(ev(early.t, 'CONSTRUCTION_START', 'ACTUAL').length, 0, '승인일보다 30일 넘게 앞선 착공일은 쓰지 않는다');
  const has = run([{ ...P[0], events: [['COMPLETION', 'ACTUAL', '2024-04-30'], ['CONSTRUCTION_START', 'ACTUAL', '2021-02-01']] }], { bld: [bld()] });
  assert.equal(ev(has.t, 'COMPLETION', 'ACTUAL').length + ev(has.t, 'CONSTRUCTION_START', 'ACTUAL').length, 0, '이미 실제가 있으면 더하지 않는다(식별자만)');
  assert.equal(has.added.identifiers.length, 1);
});

test('건축물대장 블록(K3_BLD_BLOCK): 같은 시군구·세대수 같음·사용승인일 ≥ 승인일인 대장 단위가 정확히 하나이고 세대수 ≥ 30 일 때만', () => {
  const unit = (pk, o) => bld({ pk, match: 'BLOCK', pnu: null, block: 'A1', households: 500, ref_apprv: '2019-01-01', ...o });
  const P = [{ id: 'PRJ-11110-0002', recs: [blockRec('R2', { households: 500, apprv: '2019-01-01' })], apprv: '2019-01-01' }];
  const one = run(P, { bld: [unit('U1'), unit('OLD', { use_date: '2018-12-31' })] });
  assert.deepEqual(ev(one.t, 'COMPLETION', 'ACTUAL').map((e) => e.event_date), ['2024-05-01'], '승인일 전 사용승인 대장은 후보가 아니다');
  assert.deepEqual(one.added.identifiers.map((i) => [i.id_value, i.match_rule]), [['U1', 'K3_BLD_BLOCK']]);
  const two = run(P, { bld: [unit('U1'), unit('U2', { pnu: lot(9), use_date: '2025-01-10' })] });
  assert.deepEqual([two.added.events.length, two.added.identifiers.length, two.r.blockRecords.many], [0, 0, 1], '후보가 둘이면 잇지 않는다');
  const small = run([{ id: 'PRJ-11110-0003', recs: [blockRec('R3', { households: 28 })] }], { bld: [unit('U3', { households: 28 })] });
  assert.deepEqual([small.added.events.length, small.r.blockRecords.small], [0, 1], '30세대 미만 블록은 잇지 않는다(28세대 단독 블록 오탐)');
});

test('청약홈 이름 규칙(A3_NAME_HH·A4_NAME_CONTAIN_HH)은 1:1 일 때만 — 같은 시군구에 이름·세대수가 맞는 사업이 둘이면 잇지 않는다', () => {
  const p = (id, pk, bun) => ({ id, recs: [rec(pk, { name: '시험 단지 신축공사', bun: String(bun), households: 98 })], pnu: lot(bun) });
  const one = run([p('PRJ-11110-0001', 'R1', 1)], { applyhome: [ah()] });
  assert.deepEqual(one.t.notice_links.map((l) => [l.notice_system, l.notice_id, l.local_project_id, l.evidence.split(':')[0]]), [['APPLYHOME', '2024000001-2024000001', 'PRJ-11110-0001', 'A3_NAME_HH']]);
  const many = run([p('PRJ-11110-0001', 'R1', 1), p('PRJ-11110-0002', 'R2', 2)], { applyhome: [ah()] });
  assert.equal(many.t.notice_links.length, 0);
  assert.equal(many.r.applyhome.oneToMany.A3_NAME_HH, 1);
  const late = run([p('PRJ-11110-0001', 'R1', 1)], { applyhome: [ah({ announced: '2019-12-31' })] });
  assert.equal(late.t.notice_links.length, 0, '공고일이 사업 승인일보다 앞서면 잇지 않는다');
  assert.ok(nameEq(nameParts('시험 단지(A1블록)'), nameParts('시험단지 아파트 신축공사')));
  assert.ok(nameContain(nameParts('힐스테이트 시험단지'), nameParts('시험 힐스테이트 시험단지 2차')));
});

test('청약홈 A1_PNU 연결 · 모집공고(실제)는 주택관리번호마다 가장 이른 공고 하나 · 사전청약은 잇되 모집공고·입주예정·착공 추정을 만들지 않는다 · 잔여세대·오피스텔은 연결만', () => {
  const P = [{ id: 'PRJ-11110-0001', recs: [rec('R1', { name: '다른 이름' })], pnu: lot(1) }];
  const at = { pnu: lot(1), pnu_via: 'JIBUN', name: '전혀 다른 이름' };
  const notices = [ah({ ...at }), ah({ ...at, key: '2024000001|2024000099', announced: '2024-04-01' }), ah({ ...at, key: '2024910001|2024910001', kind: 'REMNDR', type: '무순위', announced: '2024-06-01' }),
    ah({ ...at, key: '2024930001|2024930001', kind: 'OFFICETEL', type: '오피스텔', announced: '2024-02-01' })];
  const { t } = run(P, { applyhome: notices });
  assert.equal(t.notice_links.length, 4);
  assert.ok(t.notice_links.every((l) => l.evidence.startsWith('A1_PNU: ') && l.review_status === 'REVIEW_REQUIRED'));
  assert.deepEqual(ev(t, 'SUPPLY_NOTICE', 'ACTUAL').map((e) => e.event_date), ['2024-03-01'], '같은 주택관리번호의 정정·추가 공고와 잔여세대·오피스텔은 이벤트 없음');
  assert.deepEqual(ev(t, 'MOVE_IN', 'PLANNED').map((e) => [e.event_month, e.plan_basis]), [['2026-12', 'CURRENT']]);
  assert.deepEqual(ev(t, 'CONSTRUCTION_START', 'ESTIMATED').map((e) => [e.event_date, e.plan_basis]), [['2024-03-01', null]]);
  const pre = run(P, { applyhome: [ah({ ...at, presale: true, presale_basis: 'HOUSE_SECD_NM' })] });
  assert.equal(pre.t.notice_links.length, 1, '사전청약도 잇는다');
  assert.equal(pre.added.events.length, 0, '사전청약은 모집공고·입주예정·착공 추정 없음');
  assert.ok(supplyKind({ kind: 'OFFICETEL', type: '도시형생활주택' }) && !supplyKind({ kind: 'OFFICETEL', type: '민간임대' }) && supplyKind({ kind: 'PBL_PVT_RENT' }) && !supplyKind({ kind: 'OPT' }));
});

test('착공 추정(ESTIMATED): 착공 실제가 없을 때만, HUG 최초 보증발급일 · 청약홈 APT 모집공고일 중 가장 이른 것 하나, plan_basis null', () => {
  const P = [{ id: 'PRJ-11110-0001', recs: [rec('R1', { name: '시험 단지' })], pnu: lot(1) }];
  const { t } = run(P, { hug: [hug()], applyhome: [ah({ pnu: lot(1), pnu_via: 'JIBUN' })] });
  assert.deepEqual(t.notice_links.map((l) => [l.notice_system, l.evidence.split(':')[0]]).sort(), [['APPLYHOME', 'A1_PNU'], ['HUG', 'H1_NAME_HH']]);
  assert.deepEqual(ev(t, 'CONSTRUCTION_START', 'ESTIMATED').map((e) => [e.event_date, e.source_ref, e.plan_basis]), [['2024-01-15', 'khug-sale-history', null]]);
  assert.match(ev(t, 'CONSTRUCTION_START', 'ESTIMATED')[0].event_detail, /^착공 추정\(이 날 이전 착공\): HUG 최초 보증발급 2024-01-15/);
  assert.deepEqual(ev(t, 'SUPPLY_NOTICE', 'ACTUAL').map((e) => [e.event_date, e.source_ref]).sort(), [['2024-02-01', 'khug-sale-history'], ['2024-03-01', 'datagokr-15098547']]);
  const started = run([{ ...P[0], events: [['CONSTRUCTION_START', 'ACTUAL', '2023-06-01']] }], { hug: [hug()] });
  assert.equal(ev(started.t, 'CONSTRUCTION_START', 'ESTIMATED').length, 0, '실제 착공이 있으면 만들지 않는다');
  const fromBld = run(P, { hug: [hug()], bld: [bld()] });
  assert.equal(ev(fromBld.t, 'CONSTRUCTION_START', 'ESTIMATED').length, 0, '건축물대장으로 착공 실제를 보강한 사업도 만들지 않는다');
  const small = run(P, { hug: [hug({ total: 150 })] });
  assert.equal(small.t.notice_links.length, 0, 'HUG 세대수가 ±10% 밖이면 잇지 않는다');
});

test('ESTIMATED 는 판정·실제·단계에 쓰지 않는다: 같은 사업에 실제(ACTUAL)였다면 착공 예정 경과가 지워지지만, 추정이면 지연 그대로이고 NOW 칸도 오르지 않는다', () => {
  const base = { local_project_id: 'PRJ-11110-0001', complex_id: null, event_month: null, event_year: null, progress_pct: null, event_detail: null, change_reason: null, change_note: null, observed_month: '2026-10', source_ref: 'hub-hs-basis', review_status: 'CONFIRMED' };
  const tables = (dt) => ({
    projects: [{ local_project_id: 'PRJ-11110-0001', project_name: '시험', sgg_code: '11110', agency_id: null, public_scope: 'UNKNOWN', stage_code: '03', issued_at: '2026-10-06', source_ref: 'hub-hs-basis' }],
    events: [{ ...base, event_type: 'PERMIT', date_type: 'ACTUAL', plan_basis: null, event_date: '2020-01-01' }, { ...base, event_type: 'CONSTRUCTION_START', date_type: 'PLANNED', plan_basis: 'CURRENT', event_date: '2025-01-01' },
      { ...base, event_type: 'CONSTRUCTION_START', date_type: dt, plan_basis: null, event_date: '2024-12-01', source_ref: 'khug-sale-history' }],
    units: [{ local_project_id: 'PRJ-11110-0001', quantity_type: 'PERMIT', unit_count: 100, unit_scope: 'TOTAL', source_ref: 'hub-hs-basis' }],
    sources: [{ source_ref: 'hub-hs-basis', data_as_of: null }, { source_ref: 'khug-sale-history', data_as_of: '2026-10-12' }],
    areas: [{ area_code: '11', level: 'SIDO', area_name: '서울특별시' }], agencies: [], identifiers: [], project_locations: [],
  });
  const est = boardFromLedger(tables('ESTIMATED')), act = boardFromLedger(tables('ACTUAL'));
  assert.deepEqual([est.judgment.delay.projects, est.overdueTotal, est.overdue[0].eventType], [1, 1, 'CONSTRUCTION_START'], '추정은 실제가 아니다 — 착공 예정 경과(지연)가 남는다');
  assert.deepEqual([act.judgment.ok.projects, act.overdueTotal], [1, 0]);
  assert.equal(est.stageProjects[est.now].indexOf(1), 1, 'NOW 칸은 stage_code 03 → ②인허가(추정 착공으로 ③에 올리지 않는다)');
  assert.equal(act.stageProjects[act.now].indexOf(1), 2);
  assert.equal(est.actualSource, 'hub-hs-basis', '실제 날짜 원천을 고를 때도 추정은 세지 않는다');
  const row = Object.values(mapIndexFromLedger(tables('ESTIMATED')).bySgg).flat()[0];
  assert.deepEqual([row.cls, row.overdue.eventType], ['delay', 'CONSTRUCTION_START']);
});

test('단지 키(⑥): 준공 실제가 있는 사업의 필지 — 부동산원·K-apt 는 사용승인일 ≥ 사업 승인일, 마이홈은 필지만. 한 단지 id 가 두 사업에 걸리면 잇지 않고 LINK_CANDIDATE', () => {
  const done = [['COMPLETION', 'ACTUAL', '2024-05-01']];
  const reb = (o) => ({ id: 'REB1', pnu: lot(1), address: null, name: '새 단지', name_bld: null, name_road: null, kind: '1', buildings: 5, households: 100, use_date: '2024-05-01', road: null, ...o });
  const kapt = { code: 'A1', name: '새 단지', bjd: '1111010100', pnu: lot(1), address: null, kind: '아파트', sale_type: '분양', use_date: '2024-05-01', households: 100, builder: null, developer: null };
  const my = { id: '777', name: '새 단지 행복주택', agency: 'LH', pnu: lot(1), address: null, households: 30, households_varies: false, completed: null, supply: ['행복주택'] };
  const one = run([{ id: 'PRJ-11110-0001', recs: [rec('R1')], pnu: lot(1), events: done }], { reb: [reb(), reb({ id: 'OLD', use_date: '1990-01-01' })], kapt: [kapt], myhome: [my] });
  assert.deepEqual(one.added.identifiers.map((i) => [i.id_type, i.id_value, i.id_issuer, i.match_rule]), [['KAPT_CODE', 'A1', '국토교통부', 'K6_KAPT_PNU'], ['MYHOME_HSMP_SN', '777', '국토교통부', 'K4_MYHOME_PNU'], ['REB_COMPLEX_ID', 'REB1', '한국부동산원', 'K4_REB_PNU']], '재건축 전 옛 단지(승인일 전 사용승인)는 잇지 않는다');
  const notDone = run([{ id: 'PRJ-11110-0001', recs: [rec('R1')], pnu: lot(1) }], { reb: [reb()] });
  assert.equal(notDone.added.identifiers.length, 0, '준공 실제가 없는 사업은 단지 키를 잇지 않는다');
  const two = run([{ id: 'PRJ-11110-0001', recs: [rec('R1')], pnu: lot(1), events: done }, { id: 'PRJ-11110-0002', recs: [rec('R2')], pnu: lot(1), events: done }], { reb: [reb()] });
  assert.equal(two.added.identifiers.length, 0);
  assert.deepEqual(two.t.review_required.map((r) => [r.review_type, r.local_project_id, r.record_key]), [['LINK_CANDIDATE', 'PRJ-11110-0001', 'REB_COMPLEX_ID REB1'], ['LINK_CANDIDATE', 'PRJ-11110-0002', 'REB_COMPLEX_ID REB1']]);
});

test('LH 공고 상세: 이어진 LH 공고의 입주예정월(단지가 여럿이면 블록이 맞는 단지, 못 고르면 넣지 않음) · L1_DETAIL_PNU 새 연결', () => {
  const P = [{ id: 'PRJ-11110-0001', recs: [rec('R1', { block: 'A2' })], pnu: lot(1) }, { id: 'PRJ-11110-0002', recs: [rec('R2', { bun: '5' })], pnu: lot(5) }];
  const { t: t0, recs } = ledger(P);
  const lhNotice = (id, title) => ({ notice_system: 'LH', notice_id: id, notice_title: title, sgg_code: null, pnu: null, announced_on: '2024-05-01', apply_start: null, apply_end: null, observed_on: '2026-10-12', source_ref: 'datagokr-15058530' });
  t0.notices.push(lhNotice('P1', '시험지구 A2블록 행복주택 입주자모집'), lhNotice('P2', '시험지구 B1·B2블록 입주자모집'), lhNotice('P3', '시험 행복주택 입주자모집'));
  t0.notice_links.push({ notice_system: 'LH', notice_id: 'P1', local_project_id: 'PRJ-11110-0001', evidence: 'T1_LH_DISTRICT_BLOCK: …', review_status: 'REVIEW_REQUIRED', source_ref: 'datagokr-15058530' },
    { notice_system: 'LH', notice_id: 'P2', local_project_id: 'PRJ-11110-0001', evidence: 'T1_LH_DISTRICT_BLOCK: …', review_status: 'REVIEW_REQUIRED', source_ref: 'datagokr-15058530' });
  const d = (pan, name, blocks, move_in, o) => ({ pan, name, address: null, address_detail: null, address_kind: null, sgg: '11110', bjd: null, pnu: null, pnu_via: null, blocks, district: null, households: 100, move_in, ...o });
  addStage(t0, { stage: { ...STAGE0, lhDetail: [d('P1', '시험지구 A1', ['A1'], '2027-01'), d('P1', '시험지구 A2', ['A2'], '2027-03'), d('P2', '시험지구 B1', ['B1'], '2027-05'), d('P2', '시험지구 B2', ['B2'], '2027-06'),
    d('P3', '시험 행복주택', [], '2026-11', { pnu: lot(5), pnu_via: 'ROAD_MAP' })] }, hubRecords: recs, mapper, observedMonth: '2026-10', own, report: {} });
  assert.deepEqual(ev(t0, 'MOVE_IN', 'PLANNED').map((e) => [e.local_project_id, e.event_month]), [['PRJ-11110-0001', '2027-03'], ['PRJ-11110-0002', '2026-11']], 'P1 은 블록 A2 단지, P2 는 블록이 맞는 단지가 없어 넣지 않는다, P3 는 L1 필지 단지');
  assert.deepEqual(t0.notice_links.slice(2).map((l) => [l.notice_id, l.local_project_id, l.evidence.split(':')[0], l.source_ref]), [['P3', 'PRJ-11110-0002', 'L1_DETAIL_PNU', 'datagokr-15057999']]);
  assert.deepEqual(ev(t0, 'SUPPLY_NOTICE', 'ACTUAL').map((e) => [e.local_project_id, e.event_date]), [['PRJ-11110-0002', '2024-05-01']], 'L1 로 새로 이은 최초 모집공고');
});

test('행을 더하기만 한다: 단계별 원천 행(isStageSource)을 빼면 넣기 전 표와 같고, 사업·기관은 고치지 않는다', () => {
  const P = [{ id: 'PRJ-11110-0001', recs: [rec('R1', { name: '시험 단지' })], pnu: lot(1) }];
  const before = JSON.stringify(ledger(P).t);
  const { t } = run(P, { bld: [bld()], hug: [hug()], applyhome: [ah({ pnu: lot(1), pnu_via: 'JIBUN' })] });
  const strip = Object.fromEntries(Object.entries(t).map(([k, rows]) => [k, rows.filter((r) => !isStageSource(r.source_ref ?? ''))]));
  assert.equal(JSON.stringify(strip), before);
  assert.deepEqual(t.sources.map((s) => s.source_ref), ['hub-bulk-bld-2026-08', 'datagokr-15106861', 'datagokr-15073271', 'datagokr-15110581', 'datagokr-15098547', 'khug-sale-history', 'datagokr-15057999']);
});

/* ---------- 2026-10-13 후속: 사업 단계 올리기(convert.js raiseStages) · 입주예정 원천 순위 · 추이 원천 추가 표지(board.js) ---------- */
const { raiseStages } = require('../../tools/ledger/convert');
const evRow = (pid, event_type, date_type, d, source_ref) => ({ local_project_id: pid, complex_id: null, event_type, date_type, plan_basis: date_type === 'PLANNED' ? 'CURRENT' : null, event_date: d.length === 10 ? d : null, event_month: d.length === 7 ? d : null, event_year: null, source_ref });

test('단계 올리기: 기준 달 이하의 실제(ACTUAL) 이벤트가 뜻하는 단계(인허가 03 · 착공 04 · 모집 05 · 준공 06)보다 낮으면 올리고 내리지 않는다 — 추정·예정·기준 달 뒤 실제는 쓰지 않는다, 원천을 가리지 않는다', () => {
  const pr = (id, stage) => ({ local_project_id: id, stage_code: stage });
  const t = {
    projects: [pr('A', '01'), pr('B', '03'), pr('C', '04'), pr('D', '06'), pr('E', '03'), pr('F', '03')],
    events: [evRow('A', 'PERMIT', 'ACTUAL', '2020-01-01', 'hub-hs-basis'),
      evRow('B', 'SUPPLY_NOTICE', 'ACTUAL', '2026-03', 'datagokr-15098547'), evRow('B', 'CONSTRUCTION_START', 'ACTUAL', '2025-01-01', 'hub-bulk-hs-2026-08'),
      evRow('C', 'COMPLETION', 'ACTUAL', '2024-05-01', 'hub-bulk-bld-2026-08'), evRow('C', 'SUPPLY_NOTICE', 'ACTUAL', '2023-01-01', 'datagokr-15058530'),
      evRow('D', 'PERMIT', 'ACTUAL', '2020-01-01', 'hub-hs-basis'),
      evRow('E', 'CONSTRUCTION_START', 'ESTIMATED', '2024-01-01', 'khug-sale-history'), evRow('E', 'COMPLETION', 'PLANNED', '2025-01-01', 'hub-hs-basis'), evRow('E', 'MOVE_IN', 'ACTUAL', '2025-01', 'x'),
      evRow('F', 'SUPPLY_NOTICE', 'ACTUAL', '2026-11-02', 'khug-sale-history')],
  };
  const report = {};
  raiseStages(t, '2026-10', report);
  assert.deepEqual(t.projects.map((p) => p.stage_code), ['03', '05', '06', '06', '03', '03'], 'D 는 내리지 않는다 · E 는 추정·예정·입주(단계 없음)만 · F 는 기준 달 뒤 공고');
  assert.deepEqual(report.stageRaise, { projects: 3, by: { 'PERMIT hub-hs-basis': 1, 'SUPPLY_NOTICE datagokr-15098547': 1, 'COMPLETION hub-bulk-bld-2026-08': 1 }, byChange: { '01→03': 1, '03→05': 1, '04→06': 1 } }, '사업마다 가장 높은 단계의 이벤트 하나로 센다');
});

test('입주예정 현재 예정 고르기: 부동산원 입주예정물량 → LH 공고 상세 → 청약홈 순(자료 기준일과 무관), 목록 밖 원천(번들)은 그 뒤 — 지도 next 도 같은 규칙', () => {
  const pid = 'PRJ-11110-0001';
  const tables = (refs) => ({
    projects: [{ local_project_id: pid, project_name: '시험', sgg_code: '11110', agency_id: null, public_scope: 'UNKNOWN', stage_code: '05', issued_at: null, source_ref: BULK }],
    events: [['datagokr-15098547', '2027-01'], ['datagokr-15057999', '2027-02'], ['datagokr-15111714', '2027-03'], ['bundle-t', '2027-04']].filter(([r]) => refs.includes(r)).map(([r, m]) => evRow(pid, 'MOVE_IN', 'PLANNED', m, r)),
    units: [], areas: [], agencies: [], identifiers: [], project_locations: [],
    sources: [{ source_ref: 'datagokr-15098547', data_as_of: '2026-10-12' }, { source_ref: 'datagokr-15057999', data_as_of: '2026-10-12' }, { source_ref: 'datagokr-15111714', data_as_of: '2026-06-30' }, { source_ref: 'bundle-t', data_as_of: '2026-10-03' }, { source_ref: BULK, data_as_of: '2026-08-31' }],
  });
  const next = (refs) => Object.values(mapIndexFromLedger(tables(refs)).bySgg).flat()[0].next.planned;
  assert.equal(next(['datagokr-15098547', 'datagokr-15057999', 'datagokr-15111714', 'bundle-t']), '2027-03', '부동산원(기준일 2026-06-30)이 받은 날이 최근인 청약홈·LH 보다 먼저');
  assert.equal(next(['datagokr-15098547', 'datagokr-15057999', 'bundle-t']), '2027-02', 'LH 공고 상세가 청약홈보다 먼저');
  assert.equal(next(['datagokr-15098547', 'bundle-t']), '2027-01', '번들(목록 밖)은 목록 원천 뒤');
  assert.equal(next(['bundle-t']), '2027-04');
});

test('추이 원천 추가 표지: 이번 달 판정 사업의 실제 이벤트가 쓴 단계별 원천 중 앞 달 이력 행의 addedSources 에 없던 것 → 이번 달 행 addedSources(짧은 이름, 고정 순서), 없으면 필드 없음', () => {
  const pid = 'PRJ-11110-0001';
  const tables = (extra) => ({
    projects: [{ local_project_id: pid, project_name: '시험', sgg_code: '11110', agency_id: null, public_scope: 'UNKNOWN', stage_code: '06', issued_at: '2026-10-06', source_ref: 'hub-hs-basis' }],
    events: [evRow(pid, 'PERMIT', 'ACTUAL', '2020-01-01', 'hub-hs-basis'), evRow(pid, 'COMPLETION', 'PLANNED', '2024-06-30', 'hub-hs-basis'), ...extra],
    units: [], areas: [], agencies: [], identifiers: [], project_locations: [], sources: [],
  });
  const stage = [evRow(pid, 'SUPPLY_NOTICE', 'ACTUAL', '2023-03-01', 'khug-sale-history'), evRow(pid, 'COMPLETION', 'ACTUAL', '2024-05-01', 'hub-bulk-bld-2026-08'), evRow(pid, 'MOVE_IN', 'PLANNED', '2024-07', 'datagokr-15098547')];
  const own = (extra, history = []) => boardFromLedger(tables(extra), { history }).trend.at(-1);
  assert.deepEqual(own(stage, [{ month: '2026-09', basis: 'BACKFILL' }]).addedSources, ['건축물대장', 'HUG'], '예정(청약홈 입주예정)은 판정에 쓰지 않아 넣지 않는다');
  assert.deepEqual(own(stage, [{ month: '2026-09', basis: 'OBSERVED', addedSources: ['건축물대장'] }]).addedSources, ['HUG'], '앞 달 관측 행(trend.js --close 로 붙은 것)에 있던 원천은 다시 달지 않는다');
  assert.equal('addedSources' in own(stage, [{ month: '2026-08', addedSources: ['HUG'] }, { month: '2026-09', addedSources: ['건축물대장'] }]), false);
  assert.equal('addedSources' in own([]), false, '단계별 원천이 없으면 필드가 없다');
  assert.deepEqual(own(stage, [{ month: '2026-10', addedSources: ['HUG', '건축물대장'] }]).addedSources, ['건축물대장', 'HUG'], '같은 달 이력 행(다시 만들 때)은 보지 않는다');
});
