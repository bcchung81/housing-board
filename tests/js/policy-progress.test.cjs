'use strict';
// 9·7 정책 단계별 목표·확인(tools/ledger/policy-progress.js): HOME 운영 화면 계산 재현.
// 고정값 = HOME 운영 API(2026-10-14 20:45 KST GET /poc/home/api/policy-delivery?compact=true)의 yearly_comparisons.policy.metrics — 덤프 판(2026-10-14T10:25:06Z)으로 다시 계산한 6단계 목표·확인 점과 숫자가 같았다.
// 2026-10-14 판부터 담당자 입력(계획물량·단계 측정값·승인 일정)이 들어와 공급 목표·확인이 바뀌었다(2026-10-13 판: 목표 9,355 · 확인 7,606 · 같은 기간 확인 6,680).
// 2026-10-20 판(20261019T212247Z, 담당자 일정 execution_schedule 1,800건): HOME 운영 API(2026-10-20 09:30 KST GET, as_of 2026-10-20)와 6단계 목표·확인 점·연도 쌍이 모두 같았다.
//   공급(분양·모집) 2026 값은 10-14 판과 같고(8,049 대 8,742), 연결 사업 197→228 로 사업화·인허가·준공·입주 목표와 2031년 공급 목표 끝점이 늘었다.
// 2026-10-21 HOME 2038810 이식: 6단계 목표·확인 점·연도 쌍은 그대로였고(코호트가 바뀐 광교 A17 은 기간 안 점이 없다), basis 의 연결 사업·코호트 수만 바뀌었다.
//   PoC(as_of 10-20) 공급 2026 연간 목표 10,684 대 우리 10,676 의 8호 = 덤프 뒤 매핑된 연남동 공공임대주택 코호트(8호) — 덤프로는 맞출 수 없다.
// 2026-10-21 새 덤프(20261020T142230Z, 2026-10-20 23:22 KST, HOME 2038810): 덤프 뒤였던 담당자 입력·매핑(독산동·방화차고지·연남동)이 판에 들어와 PoC(as_of 10-20, 2026-10-21 11:27 KST 받은 /policy-delivery/view)와
//   6단계 목표·확인 점이 모두 같다. 연남동 공공임대주택(PRO_b8e9b07eb43ee60a807ec231) 근거 연결 사실(SH 2025-11 업무보고, reference_only — '당시 계획')의 2026-10 준공 8호는
//   2026-10-21 W5 사용자 결정 'HOME 기준'으로 일정에서 뺀다(policy-progress.js — 덤프의 reference_only PLAN 3건이 모두 PoC 에 없고 HOME project_profile.target_default 도 거른다.
//   2038810 policy_delivery 에는 없는 처리) → 준공 목표 누적도 PoC 와 같다.
// HOME 원본(jsonl.gz)은 저장소에 없다(gitignore, Storage) — 없으면 원본으로 다시 계산하는 시험은 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PP = require('../../tools/ledger/policy-progress');
const H = require('../../tools/ledger/home-source');
const M = require('../../tools/ledger/monthly');
const P = require('../../tools/ledger/paths');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'data/board/policy-progress.json');
const saved = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const HOME_DIR = H.latestHomeDir(P.ledgerDir('2026-10')), HAVE = !!HOME_DIR && H.homeAvailable(HOME_DIR);
const SKIP = !HAVE && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
const supply = saved.policies[0].stages.SUPPLY;

test('HOME 화면 공급(분양·모집) 값 재현: 목표 점·확인 점·연도 쌍이 HOME 운영 API 와 같다', () => {
  assert.equal(saved.asOf, '2026-10-22');   // 2026-10-22 판 덤프 시각(KST) — 10-20 판·10-21 판(20261020T142230Z)은 2026-10-20
  assert.deepEqual(supply.targetPoints.slice(0, 9).map((p) => [p.date, p.units, p.annual_units]), [
    ['2026-02-28', 206, 206], ['2026-05-29', 1139, 933], ['2026-06-30', 3506, 2367], ['2026-07-31', 4640, 1134], ['2026-08-31', 7082, 2442],
    ['2026-09-30', 8049, 967], ['2026-10-30', 8649, 600], ['2026-10-31', 9579, 930], ['2026-11-30', 10273, 694]]);   // 2026-10-22 새 덤프: 광교 A17BL 공급 일정 2027-09-16 → 2026-10-30·2026-12-31(600호, HOME 담당자 입력)으로 2026-10-30 점 +600 · 2026-10-21 새 덤프: 연남동 8호 코호트(2026년4분기 공급)
  assert.deepEqual([supply.targetPoints.length, supply.targetPoints.at(-1).date, supply.targetPoints.at(-1).units], [22, '2031-11-16', 83626], '승인 일정(담당자 산정)은 2031년까지');   // 2026-10-22 새 덤프 −780(병점복합타운 주복1 — 착공 2025-12-31 로 바뀌어 정책기간 전 착공, 코호트 밖) · 2026-10-21 새 덤프 +8(연남동)
  assert.deepEqual(supply.actualPoints.map((p) => [p.date, p.units, p.confirmed_units, p.policy_confirmed_units, p.review_units]), [
    ['2026-02-27', 381, 381, 381, 0], ['2026-05-28', 899, 899, 899, 0], ['2026-05-29', 1832, 1832, 1832, 0], ['2026-06-29', 1893, 1893, 1893, 0], ['2026-06-30', 4199, 4199, 4199, 0],
    ['2026-07-29', 4259, 4259, 4259, 0], ['2026-07-31', 4739, 4739, 4739, 0], ['2026-08-10', 5333, 5333, 5333, 0], ['2026-08-31', 7775, 7775, 7775, 0], ['2026-09-30', 8742, 8742, 8742, 0]], '담당자 측정값이 확인 필요 연결을 대신한다');   // 2026-10-22 새 덤프: 서울대방 61·서울공릉 60 공급 측정일 06-30·07-31 → 06-29·07-29(담당자 확인 원천 날짜)로 점 2개 더(달 말 누적은 그대로)
  const y = (n) => supply.annual.find((a) => a.year === n);
  assert.deepEqual(y(2025), { year: 2025, target_units: null, target_cumulative_units: null, management_cumulative_units: null, actual_units: null, actual_cumulative_units: null, actual_through: null, actual_status: 'NOT_ACQUIRED' });
  assert.deepEqual(y(2026), { year: 2026, target_units: 11284, target_cumulative_units: 11284, management_cumulative_units: null, actual_units: 8742, actual_cumulative_units: 8742, actual_through: '2026-09-30', actual_status: 'PARTIAL' });   // 2026-10-22 새 덤프: 광교 A17BL 공급 600호가 2027 → 2026 일정(10,684 → 11,284)
  assert.deepEqual(supply.homeRule, { target: { date: '2026-09-30', units: 8049 }, actual: { date: '2026-09-30', units: 8742, reviewUnits: 0, confirmedUnits: 8742 }, status: 'REACHED', gap: 0, shortfallPct: 0 });
});

test('같은 기간 비교(우리 기본): 2026-01~09 목표 8,049 대 확인 4,963(추정 포함 8,742) → 부족 3,086(38.3%) — 확인과 담당자 추정을 섞지 않는다', () => {
  assert.equal(saved.referenceMonthEnd, '2026-09-30');
  const s = supply.samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([s.from, s.through, s.target, s.actual, s.actualWithEstimates, s.gap, s.shortfallPct, s.status], ['2026-01-01', '2026-09-30', 8049, 4963, 8742, 3086, 38.3, 'GAP']);   // 2026-10-22 새 덤프: 확인 4,732 → 4,963(+231 = 서울공릉 60·서울대방 61·인천서구(석남어울림) 110 의 담당자 공급 측정값이 추정 → 원천 확인 OFFICER_VERIFIED_SOURCE)
  assert.equal(s.actualWithEstimates, supply.homeRule.actual.units, '추정 포함 = HOME 화면 확인 누적(같은 해 1월 전 확인 없음)');
  assert.deepEqual(supply.monthly.find((m) => m.month === '2026-09'), { month: '2026-09', target: 8049, actual: 8742, targetYtd: 8049, actualYtd: 8742 }, '월말 시계열은 HOME 과 같다(추정 포함)');
});

test('추정 분리: 공급 측정값 158건 중 담당자 추정(OFFICER_CURRENT_ESTIMATE) 92건(2026-10-22 새 덤프, 10-21 새 덤프 158·98, 10-20 판 156·101, 10-14 판 125·70) · 확인 ≤ 추정 포함, 추정 입력이 없는 단계(착공 통계·준공)는 같다', { skip: SKIP }, () => {
  const svc = PP.homeService(H.readHome(HOME_DIR), saved.asOf);
  const sup = [...svc.profiles.values()].map((p) => p.progress?.SUPPLY).filter(Boolean);
  assert.deepEqual([sup.length, sup.filter((v) => PP.ESTIMATE_RULES.has(v.input_rule)).length], [158, 92]);   // 2026-10-22 새 덤프: 추정 6건이 원천 확인(OFFICER_VERIFIED_SOURCE)으로 — 성남금토 A2 438→219·A4 384→187, 강서염창 14, 서울공릉 60, 서울대방 61, 인천서구(석남어울림) 110 · 2026-10-21 새 덤프: 담당자 측정값 입력 변경(project_profile 300 → 322)
  const b = PP.buildCohorts(svc, saved.asOf, PP.POLICY_ID);
  const est = b.cohorts.flatMap((c) => c.events).filter((e) => e.estimate);
  assert.ok(est.length > 0 && est.every((e) => e.origin === 'MANUAL'), '추정 표지는 담당자 측정값에만');
});

test('추정 분리는 모든 단계·연도에서 확인 ≤ 추정 포함이고, 다르면 gap·status 는 확인 기준이다', () => {
  for (const [k, st] of Object.entries(saved.policies[0].stages)) for (const y of st.samePeriod) {
    assert.ok('actualWithEstimates' in y, `${k} ${y.year}`);
    if (y.actual != null) assert.ok(y.actualWithEstimates >= y.actual, `${k} ${y.year}`);
    if (y.target != null && y.actual != null) assert.equal(y.gap, Math.max(0, y.target - y.actual), `${k} ${y.year}`);
  }
  const y26 = (k) => saved.policies[0].stages[k].samePeriod.find((y) => y.year === 2026);
  assert.deepEqual(['CONSTRUCTION', 'COMPLETION'].map((k) => y26(k).actual === y26(k).actualWithEstimates), [true, true]);
  assert.ok(saved.notes.some((n) => n.includes('actualWithEstimates')));
  /* 순수 함수: withEstimates 를 주면 칸을 덧붙이고, 비교는 확인 점으로만 */
  const t = [{ date: '2026-09-30', units: 100 }], a = [{ date: '2026-03-31', units: 40 }], w = [{ date: '2026-03-31', units: 40 }, { date: '2026-08-31', units: 120 }];
  const [r] = PP.samePeriod(t, a, '2026-09-30', 2026, w);
  assert.deepEqual([r.actual, r.actualWithEstimates, r.gap, r.status], [40, 120, 60, 'GAP']);
  assert.equal('actualWithEstimates' in PP.samePeriod(t, a, '2026-09-30', 2026)[0], false);
});

test('다른 단계 고정값(덤프 판 = HOME 운영 API): 착공은 원문 연간 목표·지역 통계, 사업화·인허가·준공은 승인 일정이 목표, 입주는 실적 없음', () => {
  const st = saved.policies[0].stages;
  assert.deepEqual(Object.keys(st), ['CONSTRUCTION', 'SUPPLY', 'BUSINESS', 'APPROVAL', 'COMPLETION', 'MOVE_IN']);
  const y26 = (k) => st[k].samePeriod.find((y) => y.year === 2026);
  assert.deepEqual([y26('CONSTRUCTION').target, y26('CONSTRUCTION').actual, y26('CONSTRUCTION').status], [null, 86739, 'NOT_DUE']);
  /* 2026-10-20 판(HOME 운영 API 와 같음): 사업화 확인 3,560→7,808(추정 포함 5,789→10,037), 인허가 목표 1,543→3,658·확인 3,560→6,249(추정 포함 8,478) */
  /* 2026-10-21 새 덤프(PoC 운영 값과 같음): 사업화 확인 7,808→18,854(추정 포함 10,037→21,083, 목표 도달), 인허가 목표 3,658→8,386·확인 6,249→10,403(추정 포함 8,478→12,632) */
  /* 2026-10-22 새 덤프: 병점복합타운 주복1 사업화 2026-02-12 780호 → 2025-12-31 726호(HOME 담당자 입력 — 사업화·인허가·착공 모두 2025-12-31, 정책기간 전 착공이라 코호트 밖)로 2026 사업화 목표·확인·추정 포함이 모두 −780 */
  assert.deepEqual([y26('BUSINESS').target, y26('BUSINESS').actual, y26('BUSINESS').actualWithEstimates, y26('BUSINESS').status], [13914, 18074, 20303, 'REACHED']);
  assert.deepEqual([y26('APPROVAL').target, y26('APPROVAL').actual, y26('APPROVAL').actualWithEstimates, y26('APPROVAL').status, y26('COMPLETION').actual, y26('COMPLETION').status], [8386, 10403, 12632, 'REACHED', 381, 'REACHED']);
  assert.deepEqual([y26('MOVE_IN').target, y26('MOVE_IN').actual, y26('MOVE_IN').status], [null, null, 'NOT_DUE']);
  assert.deepEqual(st.CONSTRUCTION.targetPoints.map((p) => p.units), [269000, 515000, 765000, 1014000, 1349000]);
  assert.deepEqual(st.APPROVAL.annual.find((a) => a.year === 2026), { year: 2026, target_units: 14184, target_cumulative_units: 14184, management_cumulative_units: null, actual_units: 12632, actual_cumulative_units: 38120, actual_through: '2026-09-01', actual_status: 'PARTIAL' });   // 2026-10-22 새 덤프: 누적 +1,160(부천역곡 A1 새 사업 — 2025-12-30 인허가, 정책기간 전이라 2026 증가분은 그대로) · 2026-10-21 새 덤프
  assert.deepEqual(st.COMPLETION.annual.find((a) => a.year === 2029).target_cumulative_units, 21605);   // 2026-10-21 W5 reference_only 제외로 PoC 21,605 와 같다(W4 새 덤프 직후 21,613 = 연남동 8호) · 2026-10-20 판 21,605(10-14 판 17,386)
  assert.deepEqual(st.MOVE_IN.annual.find((a) => a.year === 2031).target_cumulative_units, 28416);   // 2026-10-22 새 덤프 +1,006(검단 공공임대 AA7BL 입주 일정 2032-07-02 → 2031-12-31, HOME 담당자 입력) · 2026-10-20 판 27,410(10-14 판 19,460)
  const b = saved.policies[0].basis;
  /* HOME 2038810 이식(2026-10-21): 원천 목록 참조 사업(source_reference_id)은 사업 매핑이 확정되지 않았으면 프로그램이 정책을 줘도 미배정 — 광교 A17BL(600호)이 빠져 228→227·76→75·91,452→90,852.
     PoC(as_of 10-20) 관리 230·코호트 76·90,860 에서 덤프 뒤 매핑 3곳(독산동·방화차고지·연남동 8호 코호트)을 빼면 227·75·90,852 로 같다(21c60b1 이식 값 228·76·91,452 보다 가깝다) */
  /* 2026-10-21 2038810 inventory 이식: 인천검단 AA19 두 임대 유형(국민임대 991·영구임대 332, 정책기간 전 착공)이 중복 제외 → 포트폴리오로 — 중복 57→55·과거 착공 95→97, 코호트는 그대로 */
  /* 2026-10-21 새 덤프: 덤프 뒤 매핑 3곳(독산동·방화차고지·연남동 8호 코호트)이 판에 들어와 PoC(as_of 10-20) 관리 230·코호트 76·90,860 과 같다 */
  /* 2026-10-22 새 덤프: 9·7 연결 +2(부천역곡 A1 새 사업 1,160호 — 정책기간 코호트, 인천송림4 1 검토 → 확정 1,198호 — 2024-07-10 착공이라 정책기간 전) · 병점복합타운 주복1 착공 2025-12-31 로 정책기간 전(코호트 −780) → 232·55·0·101·76·91,240(PoC as_of 10-22 관리 232) */
  assert.deepEqual([b.linkedProjects, b.duplicateExcluded, b.missingQuantity, b.prePolicyStart, b.cohorts, b.cohortUnits], [232, 55, 0, 101, 76, 91240], '2026-10-22 새 덤프(10-21 새 덤프 230·55·0·99·76·90,860 · 10-20 판 227·55·0·97·75·90,852, 10-14 판: 담당자 계획물량 입력으로 물량 미확보 0)');
});

test('HOME 원본으로 다시 계산: 저장된 파일과 바이트 같고, 같은 판 두 번도 같다', { skip: SKIP }, () => {
  const a = PP.render(PP.policyProgress(H.readHome(HOME_DIR))), b = PP.render(PP.policyProgress(H.readHome(HOME_DIR)));
  assert.equal(a, b);
  assert.equal(a, fs.readFileSync(OUT, 'utf8'));
});

test('일정 글 → 기간(HOME schedule_period): 달·날짜·분기·반기·월 범위·연, 미정은 없음', () => {
  const f = (v) => { const p = PP.schedulePeriod(v); return p && [p.due_date, p.precision, p.conversion]; };
  assert.deepEqual(f('2026-06'), ['2026-06-30', 'MONTH', 'MONTH_END']);
  assert.deepEqual(f('2026.6.15'), ['2026-06-15', 'DAY', 'EXACT']);
  assert.deepEqual(f('2028년 09월'), ['2028-09-30', 'MONTH', 'MONTH_END']);
  assert.deepEqual(f("'27년 3분기"), ['2027-09-30', 'QUARTER', 'PERIOD_END']);
  assert.deepEqual(f('2027년 하반기 예정'), ['2027-12-31', 'HALF_YEAR', 'PERIOD_END']);
  assert.deepEqual(f('2026년 5~6월'), ['2026-06-30', 'MONTH_RANGE', 'PERIOD_END']);
  assert.deepEqual(f('2029~2030년'), ['2030-12-31', 'YEAR_RANGE', 'PERIOD_END']);
  assert.deepEqual(f(2026), ['2026-12-31', 'YEAR', 'PERIOD_END']);
  for (const v of ['미정', '2026년 이후', '2026-13', '2026-02-30', '', null, '3분기']) assert.equal(PP.schedulePeriod(v), null, String(v));
});

test('지구·블록 중복 제외(HOME inventory): 같은 블록 LH 공급계획 하나만 남고, 계획 없는 여러 원천·복합 계약은 뺀다', () => {
  const r = (id, source_id, name, extra = {}) => ({ id, source_id, name, region: '경기도', planned_units: null, warnings: [], ...extra });
  assert.deepEqual(PP.blockKey(r('x', 'lh_sale', '고양창릉 S-03(공공분양)', { block: 'S-03' })), ['경기도', '고양창릉', 'S3']);
  assert.equal(PP.blockKey(r('x', 'policy_907', '고양창릉 S-03')), null, 'LH 원천이 아니면 지구 키 없음');
  const { chosen, excluded } = PP.inventory([
    r('a', 'lh_sale', '고양창릉 S-03', { block: 'S-03' }), r('b', 'lh_construction', '고양창릉 S3BL 건설공사', { district: '고양창릉', block: 'S3', planned_units: 1282 }),
    r('c', 'lh_construction', '남양주왕숙 A-1', { district: '남양주왕숙', block: 'A1' }), r('d', 'lh_progress', '남양주왕숙 A-1', { district: '남양주왕숙', block: 'A-1' }),
    r('e', 'lh_construction', '이름만'), r('f', 'policy_907', '복합', { warnings: ['MULTI_SITE_CONTRACT'] })]);
  assert.deepEqual(chosen.map((c) => [c.id, c.planned_units]), [['a', 1282]], '계획물량은 같은 블록 원천의 하나뿐인 값');
  assert.deepEqual(excluded.sort(), ['b', 'c', 'd', 'e', 'f']);
});

test('목표·확인 점(HOME _schedule_targets·_events): 가장 늦은 원천 하나·사업 물량 상한, 사업별 최대 도달량 누적과 확인 필요 분리', () => {
  const c1 = { id: 'p1', units: 100, mapping_status: 'REVIEW', schedules: [
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-03-31', units: 80, source_base_date: '2026-01-01', source_object_id: 'old' },
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-05-31', units: 70, source_base_date: '2026-07-01', source_object_id: 'new' },
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-06-30', units: 70, source_base_date: '2026-07-01', source_object_id: 'new' },
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2025-12-31', units: 10, source_base_date: '2026-09-01', source_object_id: 'before' }],
  events: [{ stage: 'SUPPLY', event_date: '2026-02-01', units: 40 }, { stage: 'SUPPLY', event_date: '2026-04-01', units: 90, review_status: 'REVIEW' }, { stage: 'SUPPLY', event_date: '2026-11-01', units: 100 }] };
  const c2 = { id: 'p2', units: 50, mapping_status: 'CONFIRMED', schedules: [], events: [{ stage: 'SUPPLY', event_date: '2026-04-01', units: null }, { stage: 'BUSINESS', event_date: '2026-01-01', status: 'STATE' }] };
  const t = PP.scheduleTargets([c1, c2], 'SUPPLY', '2026-01-01');
  assert.deepEqual(t.points.map((p) => [p.date, p.units]), [['2026-05-31', 70], ['2026-06-30', 100]]);
  const a = PP.stageEvents([c1, c2], 'SUPPLY', '2026-10-13');
  assert.deepEqual(a.points.map((p) => [p.date, p.units, p.confirmed_units, p.policy_confirmed_units, p.review_units]), [['2026-02-01', 40, 40, 0, 0], ['2026-04-01', 140, 90, 50, 50]]);
  assert.equal(PP.stageEvents([c2], 'BUSINESS', '2026-10-13').points.length, 0, '상태 추정(STATE)은 실적이 아니다');
});

test('승인 일정(managed_schedule)이 있으면 그 묶음의 목표 점은 승인 일정만 쓴다(HOME _schedule_targets)', () => {
  const c = { id: 'p', units: 100, schedules: [
    { stage: 'SUPPLY', origin: 'SOURCE', due_date: '2026-03-31', units: 100, source_base_date: '2026-01-01', source_object_id: 'src' },
    { stage: 'SUPPLY', origin: 'MANUAL', managed_schedule: true, due_date: '2026-08-31', units: 60 },
    { stage: 'SUPPLY', origin: 'MANUAL', managed_schedule: true, due_date: '2026-08-31', units: 60 },
    { stage: 'SUPPLY', origin: 'MANUAL', managed_schedule: true, due_date: '2027-02-28', units: 70 }], events: [] };
  assert.deepEqual(PP.scheduleTargets([c], 'SUPPLY', '2026-01-01').points.map((p) => [p.date, p.units]), [['2026-08-31', 60], ['2027-02-28', 100]], '같은 (날짜·호수)는 한 번, 사업 물량 상한');
  assert.deepEqual(PP.scheduleTargets([{ ...c, schedules: c.schedules.slice(0, 1) }], 'SUPPLY', '2026-01-01').points.map((p) => [p.date, p.units]), [['2026-03-31', 100]]);
});

test('HOME 방식 대 같은 기간: 확인 누적이 앞 해부터 쌓여 있으면 HOME 방식 부족률이 작게 나온다', () => {
  const targets = [{ date: '2026-09-30', units: 9355 }, { date: '2026-12-31', units: 12408 }];
  const actual = [{ date: '2025-07-31', units: 926, review_units: 316 }, { date: '2026-09-30', units: 7606, review_units: 2187 }];
  assert.deepEqual([PP.homeRule(targets, actual, '2026-10-13').gap, PP.homeRule(targets, actual, '2026-10-13').shortfallPct], [1749, 18.7]);
  const s = PP.samePeriod(targets, actual, '2026-09-30', 2025);
  assert.deepEqual(s.map((y) => [y.year, y.target, y.actual, y.gap, y.shortfallPct, y.status]), [[2025, null, 926, null, null, 'NOT_DUE'], [2026, 9355, 6680, 2675, 28.6, 'GAP']]);
  assert.equal(PP.homeRule([{ date: '2026-12-31', units: 1 }], actual, '2026-10-13').status, 'NOT_DUE');
  assert.equal(PP.asOfOf('2026-10-13T14:02:41.323977+00:00'), '2026-10-13');
  assert.equal(PP.asOfOf('2026-10-13T15:00:00+00:00'), '2026-10-14', '한국 날짜');
});

test('월 갱신: 그 달 폴더에 HOME 판이 있으면 보드 다음에 policy-progress.js --month 를 돈다', () => {
  assert.deepEqual(M.policyProgressArgs(P.ledgerDir('2026-10'), '2026-10'), HOME_DIR ? ['--month', '2026-10'] : null);
  assert.equal(M.policyProgressArgs(path.join(ROOT, 'tests'), '2026-10'), null);
});
