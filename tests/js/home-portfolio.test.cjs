'use strict';
// 9·7 포트폴리오(HOME portfolio_cohorts)와 범위별 tracking(portfolio_comparisons[범위].metrics[지표].tracking) — tools/ledger/policy-progress.js 의 HOME 2038810 이식.
// (a) 계산 층: PoC 응답(as_of 2026-10-20)의 portfolio_cohorts 를 넣으면 PoC 의 tracking 점과 완전히 같다(정책 전체·시도 3·시군구 42·프로그램 31 + 프로그램×시도 29·×시군구 96, 지표 6).
//     고정값 tests/fixtures/home-1020/portfolio-view.json = PoC GET /policy-delivery/view?as_of_date=2026-10-20&group=policy&scope=policy(+ 프로그램 화면 30개)에서
//     tracking·대조에 쓰는 칸만 잘라 넣은 것(담당자 이름·사유·배치 id·근거 글 칸은 뺐다). 점 목록은 {cols, rows}, evidence_urls 는 urls 번호로 접었다 — 여기서 다시 편다.
// (b) 덤프로 만든 포트폴리오(HOME 덤프 20261019T212247Z 가 있을 때만): PoC 와 같은 사업·같은 칸. 남는 차이는 아래 허용 목록(사업 id·까닭)뿐이어야 한다.
//     덤프 뒤 변경 판정: PoC 사건에 changed_at > 덤프 시각(2026-10-19T21:22:47Z)이 있는 사업은 사건·일정 대조에서 뺀다(담당자 입력 74건 등). 일정에는 changed_at 이 없어 일정 차이는 근거를 보고 허용 목록에 적었다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PP = require('../../tools/ledger/policy-progress');
const H = require('../../tools/ledger/home-source');
const P = require('../../tools/ledger/paths');

const FIX = path.join(__dirname, '..', 'fixtures', 'home-1020', 'portfolio-view.json');
const poc = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const unpack = ({ cols, rows }) => rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, c === 'evidence_urls' ? r[i].map((k) => poc.urls[k]) : r[i]])));
const expected = Object.fromEntries(Object.entries(poc.expected).map(([k, v]) => [k, { ...v,
  metrics: Object.fromEntries(Object.entries(v.metrics).map(([m, t]) => [m, { ...t, target_points: unpack(t.target_points), actual_points: unpack(t.actual_points) }])) }]));
const METRICS = ['CONSTRUCTION', 'SUPPLY', 'BUSINESS', 'APPROVAL', 'COMPLETION', 'MOVE_IN'];

test('(a) PoC 포트폴리오 → 범위별 tracking 이 PoC portfolio_comparisons 와 완전히 같다(202 범위 × 6 지표)', () => {
  const mine = PP.portfolioComparisons(poc.portfolio_cohorts, poc.as_of_date, { programs: poc.programs });
  assert.deepEqual(Object.keys(mine).sort(), Object.keys(expected).sort(), '범위 키가 같다(사업 없는 프로그램은 programs 로 들어온다)');
  const kinds = {};
  for (const [k, v] of Object.entries(expected)) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
  assert.deepEqual(kinds, { policy: 1, region: 3, city: 42, program: 31, program_region: 29, program_city: 96 });
  let n = 0;
  for (const [k, v] of Object.entries(expected)) {
    assert.deepEqual([mine[k].name, mine[k].kind], [v.name, v.kind], k);
    assert.deepEqual(Object.keys(mine[k].metrics), METRICS, k);
    for (const m of METRICS) { assert.deepStrictEqual(mine[k].metrics[m].tracking, v.metrics[m], `${k} ${m}`); n++; }
  }
  assert.equal(n, 1212);
  /* 정책 전체 공급: 누적 58,541호(2026-10-19) — 담당자 입력 53,160 · 추정 50,587 포함 */
  assert.deepEqual(PP.trackingOf(poc.portfolio_cohorts, 'SUPPLY', poc.as_of_date).actual_points.at(-1),
    { date: '2026-10-19', units: 58541, confirmed_units: 58541, policy_confirmed_units: 58541, review_units: 0, origin: 'SOURCE_OR_MANUAL', manual_units: 53160, inferred_units: 50587,
      evidence_urls: ['https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=10&ccrCnntSysDsCd=03&mi=1026&panId=2015122300020925&uppAisTpCd=06'] });
});

test('(a) tracking 규칙: 후속 단계 사건도 그 단계 도달 · 목표는 1900-01-01 부터 · 사업 수는 범위 사업 수', () => {
  const c = { id: 'p', units: 100, mapping_status: 'CONFIRMED', events: [{ stage: 'SUPPLY', event_date: '2020-05-01', units: 60, origin: 'MANUAL', inferred: true }, { stage: 'MOVE_IN', event_date: '2021-01-01', units: null, status: 'ACTUAL' }],
    schedules: [{ stage: 'APPROVAL', due_date: '1999-12-31', units: 100, origin: 'SOURCE', source_object_id: 's' }] };
  const t = PP.trackingOf([c], 'APPROVAL', '2026-10-20');
  assert.deepEqual(t.actual_points.map((p) => [p.date, p.units, p.manual_units, p.inferred_units]), [['2020-05-01', 60, 60, 60], ['2021-01-01', 100, 60, 60]]);
  assert.deepEqual(t.target_points.map((p) => [p.date, p.units, p.origin]), [['1999-12-31', 100, 'SOURCE']]);
  assert.equal(t.project_count, 1);
  assert.deepEqual(PP.stageEvents([c], 'APPROVAL', '2026-10-20').points, [], '우리 문서용(같은 단계만)은 후속 단계를 세지 않는다');
});

/* ---------- (b) 덤프로 만든 포트폴리오 ---------- */
const HOME_DIR = H.latestHomeDir(P.ledgerDir('2026-10')), HAVE = !!HOME_DIR && H.homeAvailable(HOME_DIR);
const SKIP = !HAVE && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
/* PoC 에만 있는 사업 */
const ONLY_POC = {
  PRO_18141914462204e2be0e5796: '독산동 산업문화어울림센터 — 덤프 뒤 9·7 매핑',
  PRO_e925e787e29c13e42deafcda: '방화차고지 공공주택 건설사업 — 덤프 뒤 9·7 매핑',
  PRO_b8e9b07eb43ee60a807ec231: '연남동 공공임대주택(8호, 코호트) — 덤프 뒤 9·7 매핑',
};
/* 덤프 뒤 변경이 없는(PoC 사건 changed_at ≤ 덤프 시각) 공통 사업 중 사건이 다른 곳 */
const EVENT_DIFF = {
  PRO_afa121ebed699e8aab86cd60: '이천장호원 B2BL — 예비입주자 공고 300호 연결(2026-08-13)이 PoC 에 없다: 덤프 뒤 교차 원천 연결 갱신(PoC 일정 근거 DOC_fcaaadc… 가 덤프에 없다)',
  PRO_8afa3f6b5386e8b6e5f1eda2: '신림2재정비촉진 — PoC 착공 연결 2026-05-06(관악구·external_officer)이 덤프에 없다(덤프 뒤 연결 추가)',
  PRO_af0e615a920526eee9302fe0: '흑석11재정비촉진 — PoC 착공 연결 2026-02-06·2026-09-07 이 덤프에 없다(덤프 뒤 연결 추가, 관측일 2026-10-20)',
};
/* 같은 조건에서 일정이 다른 곳 — PoC 일정 근거(DOC_…)가 덤프에 없거나 담당자 일정이 덤프 뒤 바뀌었다(의왕초평 A4 는 2038810 block_key 이식으로 같아졌다, 2026-10-21) */
const SCHEDULE_DIFF = {
  PRO_4d29636ffa571ff2fdf7c72e: '고양창릉 S-03 — 입주 예정 근거 DOC_476a… 덤프에 없음(덤프 뒤 연결)',
  PRO_0a79310e612f5bc1215fcad3: '고양창릉 S-04 — DOC_d87e… 덤프에 없음',
  PRO_cd0ad7de7ca676c6f3981f1f: '고양창릉 S-5BL — DOC_d42c… 덤프에 없음',
  PRO_3e4fe820f1cb21379bbbe611: '성남신촌 A-1BL — DOC_3838… 덤프에 없음',
  PRO_9f9031c8f3a9ef0626b95757: '안산신길2 B1 — DOC_3969… 덤프에 없음',
  PRO_afa121ebed699e8aab86cd60: '이천장호원 B2BL — DOC_be08…·DOC_fcaa… 덤프에 없음',
  PRO_76abe08cb7c430960fb40f03: '인천검단 AA-21BL — 담당자 입주 일정 2026-10-31 → 2026-10-30(덤프 뒤 변경), 근거 DOC_f0fc…·DOC_f437… 덤프에 없음',
};
/* 시군구: PoC 운영 판은 2038810 원본에 없는 municipality_provenance(인천 행정구역 개편 표시 INCHON_DATED_ADMINISTRATIVE_NAME: 서구 → 서해구 등)를 쓴다 — /projects/<id> 응답에서 확인.
   2026-10-21 부터 policy-progress.js homeService 가 원장 시군구 규칙(home-source.js sggByPro)으로 대신해 9곳이 같아졌고, 남은 2곳은 원장도 시군구를 못 정한 인천서구 묶음(SGG_UNRESOLVED) */
const INCHEON_DISPLAY = ['PRO_85998117430f9302232be12d', 'PRO_1c2a1be12daff06cef52f8c6'];

test('(b) 덤프 포트폴리오 = PoC 포트폴리오(덤프 뒤 변경·인천서구 시군구 미정만 다르다)', { skip: SKIP }, () => {
  const home = H.readHome(HOME_DIR), dump = home.snapshotAt.slice(0, 19);
  const v = PP.homeView(home);
  assert.equal(v.as_of_date, poc.as_of_date);
  const T = new Map(poc.portfolio_cohorts.map((c) => [c.id, c])), O = new Map(v.portfolio_cohorts.map((c) => [c.id, c]));
  assert.equal(v.portfolio_cohorts.length, 172, 'PoC 175 − ONLY_POC 3(인천검단 AA19 두 임대 유형은 2038810 inventory 이식으로 같아졌다, 2026-10-21)');
  assert.deepEqual([...T.keys()].filter((id) => !O.has(id)).sort(), Object.keys(ONLY_POC).sort());
  assert.deepEqual([...O.keys()].filter((id) => !T.has(id)), [], '우리에만 있는 사업 없음(광교 A17 은 참조 사업 매핑 규칙으로 빠진다)');
  assert.deepEqual([v.cohorts.length, v.cohorts.reduce((a, c) => a + c.units, 0)], [75, 90852], 'PoC 코호트 76·90,860호 − 연남동 8호');
  const post = (t) => t.events.some((e) => e.changed_at && e.changed_at.slice(0, 19) > dump);
  const ek = (e) => [e.stage, e.event_date, e.units, e.origin, e.status ?? '-', e.review_status ?? '-', e.inferred ?? '-', e.input_rule ?? '-', e.evidence_url ?? '-', e.source_id ?? '-'].join('|');
  const sk = (s) => [s.stage, s.due_date, s.units, s.origin, s.precision, !!s.managed_schedule, s.source_object_id ?? '-', s.source_base_date ?? '-', s.evidence_url ?? '-'].join('|');
  const same = (a, b, key) => JSON.stringify(a.map(key).sort()) === JSON.stringify(b.map(key).sort());
  const evDiff = [], scDiff = [], fieldDiff = {};
  let compared = 0;
  for (const c of v.portfolio_cohorts) {
    const t = T.get(c.id);
    for (const f of ['source_ids', 'name', 'units', 'planned_units', 'quantity_basis', 'region', 'municipality', 'municipality_id', 'program_id', 'program', 'block', 'developer', 'mapping_status', 'eligibility_status', 'evidence_url']) {
      if (JSON.stringify(c[f]) !== JSON.stringify(t[f]) && !(post(t) && ['eligibility_status', 'source_ids'].includes(f))) (fieldDiff[f] ??= []).push(c.id);
    }
    if (post(t)) continue;
    compared++;
    if (!same(c.events, t.events, ek)) evDiff.push(c.id);
    if (!same(c.schedules, t.schedules, sk)) scDiff.push(c.id);
  }
  assert.equal(compared, 125, '공통 172 − 덤프 뒤 변경 47');
  assert.deepEqual(evDiff.sort(), Object.keys(EVENT_DIFF).sort());
  assert.deepEqual(scDiff.sort(), Object.keys(SCHEDULE_DIFF).sort());
  for (const k of Object.keys(fieldDiff)) fieldDiff[k].sort();
  assert.deepEqual(fieldDiff, { municipality: INCHEON_DISPLAY.slice().sort(), municipality_id: INCHEON_DISPLAY.slice().sort() }, '인천서구 시군구 미정 2곳 밖은 칸이 모두 같다(의왕초평 A4 묶음은 2038810 block_key 이식으로 같아졌다)');
  /* 담당자 이름은 고정값에 없다 */
  const text = fs.readFileSync(FIX, 'utf8');
  for (const n of H.officerTerms(home.kinds).names) assert.ok(!text.includes(n), '고정값에 담당자 이름');
});
