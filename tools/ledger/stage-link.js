'use strict';
/* 단계별 원천 중간 스냅샷(tools/ledger/stage-snapshot.js readStage, snapshot/stage-<판>.json)을 원장 표에 더한다 — convert.js 가 national 다음에 부른다(t 를 고친다).
   규칙은 2026-10-12 측정(표본 정밀도 ≥ 95%, docs/product/단계별-원천-수집.md '원장 반영')에서 자동으로 정한 것만 쓴다. 순수 함수 — 파일을 읽거나 쓰지 않는다.
   행을 더하기만 하고 이미 있는 행(사업·기관·단계 등)은 고치지 않는다 — 그래서 stage 원천(isStageSource)의 행을 빼면 stage 없이 만든 표와 같다(trend 소급 항등 시험).
   단, convert.js 마지막의 raiseStages 가 원천을 가리지 않고 실제 이벤트로 stage_code 를 올리므로, 표끼리 견줄 때는 stage 이벤트로만 올라간 단계를 빼고 본다.
   - ⑤준공·③착공(건축물대장 bld): K2_BLD_PARCEL 사업 위치 필지와 같은 대장(PARCEL) 중 사용승인일 ≥ 그 필지 허가 승인일(after_apprv)이고 세대 있는 것.
       K3_BLD_BLOCK 블록 허가 기록(필지 없음): 같은 시군구·세대수 같음·사용승인일 ≥ 승인일인 대장 단위가 정확히 하나이고 세대수 ≥ 30.
       사업에 실제가 없을 때만 COMPLETION ACTUAL = 가장 이른 사용승인일(자료 달 말일 이하), CONSTRUCTION_START ACTUAL = 승인일−30일 ≤ 착공일 ≤ 자료 달 말일 중 가장 이른 것.
   - ⑥단지 키(준공 실제가 있는 사업, 위치 필지 = 단지 필지): K4_REB_PNU 부동산원(사용승인일 ≥ 사업 승인일) · K6_KAPT_PNU K-apt(같은 조건) · K4_MYHOME_PNU 마이홈.
   - 대장·단지 id 하나가 두 사업에 걸리면 잇지 않고 LINK_CANDIDATE.
   - ④모집(청약홈): A1_PNU 공급위치 필지 = 사업 필지 · A2_BLOCK_DISTRICT 시군구 + 블록 + 지구 낱말 · A3_NAME_HH 이름 같음 + 세대수 ±10%(1:1) ·
       A4_NAME_CONTAIN_HH 이름 포함 + 세대수 ±10%(1:1). 모두 공고일 ≥ 사업 승인일. SUPPLY_NOTICE·MOVE_IN 은 EVENT_KINDS(사전청약 제외)만.
     HUG: H1_NAME_HH 시군구 + 사업명 같음 + 세대수 ±10% + 공고승인일 ≥ 사업 승인일 → SUPPLY_NOTICE(공고승인일).
   - ③ 착공 추정(ESTIMATED, plan_basis null — '이 날 이전에 착공했음'): 착공 실제가 없는 사업에 HUG 최초 보증발급일 · 청약홈 APT 최초 모집공고일 중 가장 이른 것. 판정에는 쓰지 않는다.
   - ⑥ LH 공고 상세: 이어진 LH 공고(비공급 제외)의 입주예정월(공고 단지가 여럿이면 블록이 맞는 단지, 모두 같은 달이면 그 달) → MOVE_IN 예정.
       L1_DETAIL_PNU 공고 상세 단지 필지 = 사업 필지(공고일 ≥ 승인일).
   - pnu_via ROAD_MAP(도로명 → 지번 매핑)으로 생긴 A1 과 L1 은 표본 30쌍 정밀도로 정한 AUTO 에 따라 자동 또는 LINK_CANDIDATE. */
const { normBlock, locate } = require('./hub-bulk');
const NL = require('./notice-link');

const SRC = {
  bld: (m) => `hub-bulk-bld-${m}`, reb: 'datagokr-15106861', kapt: 'datagokr-15073271', myhome: 'datagokr-15110581',
  applyhome: 'datagokr-15098547', hug: 'khug-sale-history', lhDetail: 'datagokr-15057999',
};
/* stage 원천의 source_ref(대장은 자료 달이 붙는다) */
const isStageSource = (ref) => /^hub-bulk-bld-\d{4}-\d{2}$/.test(ref) || Object.values(SRC).includes(ref);
/* stage 원천의 짧은 이름(화면 표지용, 보드 trend 의 addedSources). 순서 = SRC 순서 */
const NAME = { bld: '건축물대장', reb: '부동산원 단지', kapt: 'K-apt', myhome: '마이홈 단지', applyhome: '청약홈', hug: 'HUG', lhDetail: 'LH 공고 상세' };
const stageSourceKey = (ref) => (/^hub-bulk-bld-\d{4}-\d{2}$/.test(ref) ? 'bld' : Object.keys(SRC).find((k) => k !== 'bld' && SRC[k] === ref) ?? null);
const STAGE_NAMES = Object.keys(SRC).map((k) => NAME[k]);
const stageSourceName = (ref) => NAME[stageSourceKey(ref)] ?? null;
const RULE = {
  BLD_PARCEL: 'K2_BLD_PARCEL', BLD_BLOCK: 'K3_BLD_BLOCK', REB: 'K4_REB_PNU', KAPT: 'K6_KAPT_PNU', MYHOME: 'K4_MYHOME_PNU',
  A1: 'A1_PNU', A2: 'A2_BLOCK_DISTRICT', A3: 'A3_NAME_HH', A4: 'A4_NAME_CONTAIN_HH', H1: 'H1_NAME_HH', L1: 'L1_DETAIL_PNU',
};
/* 측정하지 않았던 경로의 자동 여부(2026-10-13 표본 30쌍, 스크립트 결과는 docs/product/단계별-원천-수집.md '원장 반영') */
const AUTO = { A1_ROAD_MAP: true, L1_DETAIL_PNU: true };   // A1 ROAD_MAP 30/30 · L1 29/30(96.7%) — 둘 다 자동
/* 공급 이벤트(SUPPLY_NOTICE·MOVE_IN)를 만드는 청약홈 종류: APT · 공공지원민간임대 · 오피스텔/도시형 중 도시형생활주택(주택법상 공동주택).
   오피스텔(업무시설)·생활형숙박시설·'민간임대'(오피스텔·아파트가 섞여 유형을 모름)는 연결만. 잔여세대(REMNDR)·임의공급(OPT)은 최초 모집이 아니라 연결만 */
const supplyKind = (n) => n.kind === 'APT' || n.kind === 'PBL_PVT_RENT' || (n.kind === 'OFFICETEL' && n.type === '도시형생활주택');
const BLOCK_MIN_HH = 30;

/* ---------- 이름·지구 대조(측정 스크립트 linkname/common.js · n2.js 그대로) ---------- */
const nfkc = (s) => String(s ?? '').normalize('NFKC').replace(/　/g, ' ').trim();
const STOP = /(아파트|공동주택|및부대복리시설|부대복리시설|신축공사|신축사업|신축|건설사업|건설공사|주상복합|공사|사업|APT|도시형생활주택|오피스텔)/g;
function normName(s) {
  let t = nfkc(s).toUpperCase().replace(/\[[^\]]*\]/g, ' ');
  t = t.replace(/(\d+)\s*-?\s*(블록|블럭|BL)\b/g, '$1BL');
  t = t.replace(/([A-Z]{1,3})\s*-\s*(\d)/g, '$1$2').replace(/(블록|블럭|BLOCK)/g, 'BL');
  return t.replace(/[\s()[\]{}<>「」『』【】.,·ㆍ&'"_~-]/g, '').replace(STOP, '');
}
/* 이름 조각: 전체·괄호 밖·괄호 안 각각 정규화(두 글자 이상) */
function nameParts(s) {
  const raw = nfkc(s);
  const inside = [...raw.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  return [...new Set([raw, raw.replace(/\([^()]*\)/g, ' '), ...inside].map(normName).filter((x) => x.length >= 2))];
}
const nameEq = (a, b) => a.some((x) => b.includes(x));
const hangul3 = (x) => (x.match(/[가-힣]/g) ?? []).length >= 3;   // 블록 코드만('A18BL')은 이름으로 치지 않는다
/* 포함: 짧은 쪽이 5글자 이상·한글 3자 이상이고 긴 쪽 안에 있다 */
const nameContain = (a, b) => a.some((x) => b.some((y) => (x.length >= 5 && hangul3(x) && y.includes(x)) || (y.length >= 5 && hangul3(y) && x.includes(y))));
const hhNear = (a, b, r = 0.1) => a > 0 && b > 0 && Math.abs(a - b) <= r * Math.max(a, b);
const DIST_TAIL = /(공공주택지구|택지개발사업지구|택지개발지구|택지개발사업|도시개발사업지구|도시개발사업구역|도시개발구역|도시개발사업|국민임대주택단지|보금자리주택지구|공공지원민간임대주택공급촉진지구|지구단위계획구역|신도시|지구|구역|내)$/;
const distCore = (s) => { let t = nfkc(s).replace(/\([^()]*\)/g, '').replace(/\s/g, ''); for (let i = 0; i < 3; i++) t = t.replace(DIST_TAIL, ''); return t.length >= 2 ? t : null; };
const GEN_DIST = /^(공동|공동주택|공동주택용지|주상복합|단지|블록|일원|지구)$/;
/* 지구 낱말이 글자 안에 있다: 바로 뒤가 숫자가 아니고, 한글이면 지구 꼬리말로 이어질 때만 */
const hasDist = (text, core) => {
  if (!core || core.length < 2 || GEN_DIST.test(core)) return false;
  let i = text.indexOf(core);
  while (i >= 0) {
    const rest = text.slice(i + core.length);
    if (!/^\d/.test(rest) && (!/^[가-힣]/.test(rest) || /^(지구|택지|공공|도시|신도시|국제|일반|산업|생활권|역세권|구역|혁신|테크노|내|복합)/.test(rest))) return true;
    i = text.indexOf(core, i + 1);
  }
  return false;
};

/* ---------- 도움 ---------- */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const when = (d) => (DAY.test(d) ? { event_date: d, event_month: null } : { event_date: null, event_month: d.slice(0, 7) });

/* stage: readStage 결과 + { asOf: { 원천: 'YYYY-MM-DD' }, collectedAt: { 원천: 일시 }, files: { 원천: 파일 이름들 } }(convert.js readStageInput),
   hubRecords: 건축HUB 대용량 기록, mapper: hub-bulk.js codeMapper, own: 원천 행 기본값 */
function addStage(t, { stage, hubRecords = [], mapper, observedMonth, own, report = {} }) {
  const rep = (report.stage = { dataMonth: stage.dataMonth });
  const EVENT_BASE = { complex_id: null, event_year: null, progress_pct: null, change_reason: null, change_note: null };
  const bldRef = SRC.bld(stage.dataMonth), cap = lastDay(stage.dataMonth);
  const ref = { ...SRC, bld: bldRef };

  /* 원천 행 */
  const used = ['/'];
  const srcRow = (k, o) => t.sources.push({ ...own, source_ref: ref[k], data_as_of: stage.asOf?.[k] ?? null, collected_at: stage.collectedAt?.[k] ?? null, original_filename: stage.files?.[k] ?? null, record_count: stage[k].length, used_by: used, ...o });
  srcRow('bld', { provider: '국토교통부 건축HUB', dataset_name: `건축HUB 대용량 제공 건축물대장(총괄표제부·표제부) ${stage.dataMonth} 데이터`, source_url: 'https://www.hub.go.kr/portal/opn/lps/idx-lgcpt-pvsn-srvc-list.do', source_record_key: '관리_건축물대장_PK', notes: `원장 사업 필지에 걸리는 대장과 블록 허가와 세대수가 같은 대장(tools/ledger/stage-snapshot.js). 사용승인일 ≥ 허가 승인일인 세대 있는 대장으로 준공·착공 실제를 보강했다(${RULE.BLD_PARCEL} · ${RULE.BLD_BLOCK}).` });
  srcRow('reb', { provider: '한국부동산원(공공데이터포털)', dataset_name: '15106861 공동주택 단지 식별정보 기본정보', source_url: 'https://www.data.go.kr/data/15106861/fileData.do', source_record_key: '단지고유번호', notes: `필지고유번호가 원장 사업 필지인 단지. 준공 사업의 필지에 있고 사용승인일 ≥ 사업 승인일인 단지를 식별자로 붙였다(${RULE.REB}).` });
  srcRow('kapt', { provider: '국토교통부 K-apt(공공데이터포털)', dataset_name: '15073271 공동주택 단지 기본정보 + 15057332 단지 목록(법정동코드)', source_url: 'https://www.data.go.kr/data/15073271/fileData.do', source_record_key: '단지코드(kaptCode)', notes: `원장 사업 법정동의 단지(필지 = 목록 법정동 + 주소 첫 번지). 준공 사업의 필지에 있고 사용승인일 ≥ 사업 승인일인 단지를 식별자로 붙였다(${RULE.KAPT}).` });
  srcRow('myhome', { provider: '국토교통부 마이홈포털(공공데이터포털)', dataset_name: '15110581 공공임대주택 단지정보', source_url: 'https://www.data.go.kr/data/15110581/openapi.do', source_record_key: 'hsmpSn', notes: `pnu 가 원장 사업 필지인 단지. 준공 사업의 필지에 있는 단지를 식별자로 붙였다(${RULE.MYHOME}).` });
  srcRow('applyhome', { provider: '한국부동산원 청약홈(공공데이터포털)', dataset_name: '15098547 분양정보 상세(APT·오피스텔/도시형/민간임대·잔여세대·공공지원민간임대·임의공급)', source_url: 'https://www.data.go.kr/data/15098547/openapi.do', source_record_key: 'HOUSE_MANAGE_NO-PBLANC_NO', notes: `2020-02 이후 공고 전부(notices APPLYHOME). 사업 연결 ${[RULE.A1, RULE.A2, RULE.A3, RULE.A4].join(' · ')}, 모집공고·입주예정월·착공 추정(ESTIMATED)을 더했다.` });
  srcRow('hug', { provider: '주택도시보증공사(HUG)', dataset_name: 'HUG 분양이력정보(지역별) infoDistributionHistory', source_url: 'https://www.khug.or.kr/infoDistributionHistory.do', source_record_key: '시군구|사업명|공고승인일', notes: `1996 이후 분양보증 사업장 전부(notices HUG). 사업 연결 ${RULE.H1}, 공고승인일 = 모집공고(실제), 보증발급일 = 착공 추정(ESTIMATED).` });
  srcRow('lhDetail', { provider: '한국토지주택공사(공공데이터포털)', dataset_name: '15057999 분양임대공고별 상세정보(단지 dsSbd)', source_url: 'https://www.data.go.kr/data/15057999/openapi.do', source_record_key: 'PAN_ID', notes: `이어진 LH 공고의 단지 입주예정월(MOVE_IN 예정)과 단지 필지 = 사업 필지 연결(${RULE.L1}).` });

  /* 사업 정보: 위치 필지, 승인일(가장 이른 PERMIT 실제), 실제가 있는 종류, 건축HUB 기록 */
  const pnusOf = new Map(), pidsOfPnu = new Map();
  for (const l of t.project_locations) if (l.pnu) { push(pnusOf, l.local_project_id, l.pnu); push(pidsOfPnu, l.pnu, l.local_project_id); }
  const approval = new Map(), actual = new Set();
  for (const e of t.events) {
    if (e.date_type !== 'ACTUAL') continue;
    actual.add(`${e.local_project_id}|${e.event_type}`);
    if (e.event_type === 'PERMIT' && e.event_date && (!approval.has(e.local_project_id) || e.event_date < approval.get(e.local_project_id))) approval.set(e.local_project_id, e.event_date);
  }
  const pidOfPk = new Map(t.identifiers.filter((r) => r.id_type === 'HUB_HS_PK').map((r) => [r.id_value, r.local_project_id]));
  const recs = hubRecords.filter((r) => pidOfPk.has(r.pk)).map((r) => ({ r, pid: pidOfPk.get(r.pk), at: locate(r, mapper) }));

  const events = [], ids = [], reviews = [];
  const ev = (pid, event_type, date_type, d, detail, source_ref) => events.push({ ...EVENT_BASE, local_project_id: pid, event_type, date_type, plan_basis: date_type === 'PLANNED' ? 'CURRENT' : null, ...when(d), event_detail: detail, observed_month: observedMonth, source_ref, review_status: 'REVIEW_REQUIRED' });

  /* 식별자: id 하나가 두 사업에 걸리면 잇지 않고 검토 목록. cands = [{ pid, id_type, id_value, issuer, as_of, source_ref, rule, name, detail }] */
  const KEY_TYPES = {};
  const attach = (cands) => {
    const byKey = new Map();
    for (const c of cands) push(byKey, `${c.id_type}|${c.id_value}`, c);
    const ok = [];
    for (const cs of byKey.values()) {
      const pids = [...new Set(cs.map((c) => c.pid))].sort();
      if (pids.length === 1) { ok.push(cs[0]); continue; }
      for (const pid of pids) reviews.push({ review_type: 'LINK_CANDIDATE', local_project_id: pid, source_ref: cs[0].source_ref, record_key: `${cs[0].id_type} ${cs[0].id_value}`, record_name: cs[0].name ?? null, detail: `${cs[0].rule}: ${cs[0].id_type} ${cs[0].id_value} 가 사업 ${pids.length}개(${pids.join(', ')})에 맞는다`, reason: '같은 원천 레코드가 두 사업 이상에 맞아 자동으로 잇지 않았다(키 중복)' });
      KEY_TYPES[cs[0].id_type] = (KEY_TYPES[cs[0].id_type] ?? 0) + 1;
    }
    return ok;
  };

  /* ---------- ⑤준공·③착공: 건축물대장 ---------- */
  const bldOk = (b) => b.households > 0 && b.use_date && DAY.test(b.use_date) && b.use_date <= cap;
  const bldByPnu = new Map();
  for (const b of stage.bld) if (b.match === 'PARCEL' && b.after_apprv !== false && bldOk(b)) push(bldByPnu, b.pnu, b);
  /* 필지 허가 승인일 뒤에 사용승인한 대장(after_apprv). 레지스트리 사업만 있는 필지는 스냅샷이 승인일을 몰라(ref_apprv null) 사업의 승인일과 견준다 */
  const afterApprv = (b, pid) => b.after_apprv === true || (b.after_apprv === null && !b.ref_apprv && !!approval.get(pid) && b.use_date >= approval.get(pid));
  /* 블록 대장 단위(측정 K3): 총괄표제부 한 행 = 한 단위, 총괄이 없는 위치의 표제부는 (위치, 사용승인일)로 묶어 세대수를 더한다 */
  const blockBld = stage.bld.filter((b) => b.match === 'BLOCK' && bldOk(b));
  const locKey = (b) => b.pnu ?? `B${b.bjd ?? b.sgg}|${b.block ?? ''}`;
  const sLocs = new Set(blockBld.filter((b) => b.src === 'S').map(locKey));
  const units = [...blockBld.filter((b) => b.src === 'S').map((b) => ({ rows: [b], sgg: b.sgg, hh: b.households, use_date: b.use_date }))];
  const tGroups = new Map();
  for (const b of blockBld.filter((x) => x.src === 'T' && !sLocs.has(locKey(x)))) push(tGroups, `${locKey(b)}|${b.use_date}`, b);
  for (const rows of tGroups.values()) units.push({ rows, sgg: rows[0].sgg, hh: rows.reduce((s, b) => s + b.households, 0), use_date: rows[0].use_date });
  const unitsBySgg = new Map();
  for (const u of units) push(unitsBySgg, u.sgg, u);

  const bldHits = new Map();   // pid → [{ rows, rule, apprv }]
  for (const [pid, pnus] of pnusOf) {
    const rows = pnus.flatMap((x) => bldByPnu.get(x) ?? []).filter((b) => afterApprv(b, pid));
    if (rows.length) push(bldHits, pid, { rows, rule: RULE.BLD_PARCEL, apprv: approval.get(pid) ?? rows.map((b) => b.ref_apprv).filter(Boolean).sort()[0] ?? null });
  }
  rep.blockRecords = { records: 0, one: 0, many: 0, none: 0, small: 0 };
  for (const { r, pid, at } of recs) {
    if (at.pnu || !at.sgg || !r.apprv) continue;
    rep.blockRecords.records++;
    const cs = (unitsBySgg.get(at.sgg) ?? []).filter((u) => u.hh === r.households && u.use_date >= r.apprv);
    if (cs.length !== 1) { rep.blockRecords[cs.length ? 'many' : 'none']++; continue; }
    if (r.households < BLOCK_MIN_HH) { rep.blockRecords.small++; continue; }
    rep.blockRecords.one++;
    push(bldHits, pid, { rows: cs[0].rows, rule: RULE.BLD_BLOCK, apprv: r.apprv, pk: r.pk });
  }
  const bldCands = [];
  for (const [pid, hits] of bldHits) for (const h of hits) {
    const s = h.rows.filter((b) => b.src === 'S'), use = s.length ? s : h.rows;   // 대장 단위: 총괄표제부가 있으면 그것, 없으면 표제부 동들
    for (const b of use) bldCands.push({ pid, id_type: 'BLDRGST_PK', id_value: b.pk, issuer: '국토교통부', as_of: cap, source_ref: bldRef, rule: h.rule, name: b.name, hit: h, b });
  }
  const bldLinked = attach(bldCands);
  const bldOfPid = new Map();
  for (const c of bldLinked) push(bldOfPid, c.pid, c);
  rep.bld = { projects: bldOfPid.size, byRule: {}, completion: 0, start: 0, completionByRule: {}, startByRule: {} };
  for (const [pid, cs] of [...bldOfPid].sort(([a], [b]) => byStr(a, b))) {
    for (const c of cs) ids.push(idRow(c));
    for (const rule of new Set(cs.map((c) => c.rule))) rep.bld.byRule[rule] = (rep.bld.byRule[rule] ?? 0) + 1;
    const first = (xs, f) => xs.filter((c) => f(c) != null).sort((a, b) => byStr(f(a), f(b)) || byStr(a.b.pk, b.b.pk))[0];
    if (!actual.has(`${pid}|COMPLETION`)) {
      const c = first(cs, (x) => x.b.use_date);
      ev(pid, 'COMPLETION', 'ACTUAL', c.b.use_date, `${c.rule}: 건축물대장 ${c.b.src === 'S' ? '총괄표제부' : '표제부'} ${c.b.pk}${c.b.name ? ` ${c.b.name}` : ''}${c.b.dong ? ` ${c.b.dong}` : ''} 사용승인 ${c.b.use_date} · ${c.b.households}세대`, bldRef);
      actual.add(`${pid}|COMPLETION`); rep.bld.completion++; rep.bld.completionByRule[c.rule] = (rep.bld.completionByRule[c.rule] ?? 0) + 1;
    }
    if (!actual.has(`${pid}|CONSTRUCTION_START`)) {
      const okStart = (c) => (c.b.start && DAY.test(c.b.start) && c.b.start <= cap && (!c.hit.apprv || c.b.start >= addDays(c.hit.apprv, -30)) ? c.b.start : null);
      const c = first(cs, okStart);
      if (c) {
        ev(pid, 'CONSTRUCTION_START', 'ACTUAL', c.b.start, `${c.rule}: 건축물대장 ${c.b.src === 'S' ? '총괄표제부' : '표제부'} ${c.b.pk}${c.b.name ? ` ${c.b.name}` : ''}${c.b.dong ? ` ${c.b.dong}` : ''} 착공 ${c.b.start}`, bldRef);
        actual.add(`${pid}|CONSTRUCTION_START`); rep.bld.start++; rep.bld.startByRule[c.rule] = (rep.bld.startByRule[c.rule] ?? 0) + 1;
      }
    }
  }

  /* ---------- ⑥ 단지 키: 준공 실제가 있는 사업의 위치 필지 ---------- */
  const done = [...pnusOf.keys()].filter((pid) => actual.has(`${pid}|COMPLETION`)).sort();
  const cx = [];
  const byPnu = (rows) => { const m = new Map(); for (const x of rows) if (x.pnu) push(m, x.pnu, x); return m; };
  const rebBy = byPnu(stage.reb), kaptBy = byPnu(stage.kapt), myBy = byPnu(stage.myhome);
  for (const pid of done) {
    const ap = approval.get(pid), pnus = pnusOf.get(pid);
    const after = (x) => ap && x.use_date && DAY.test(x.use_date) && x.use_date >= ap;
    for (const x of pnus.flatMap((p) => rebBy.get(p) ?? [])) if (after(x)) cx.push({ pid, id_type: 'REB_COMPLEX_ID', id_value: x.id, issuer: '한국부동산원', as_of: stage.asOf?.reb ?? null, source_ref: ref.reb, rule: RULE.REB, name: x.name ?? x.name_bld });
    for (const x of pnus.flatMap((p) => kaptBy.get(p) ?? [])) if (after(x)) cx.push({ pid, id_type: 'KAPT_CODE', id_value: x.code, issuer: '국토교통부', as_of: stage.asOf?.kapt ?? null, source_ref: ref.kapt, rule: RULE.KAPT, name: x.name });
    for (const x of pnus.flatMap((p) => myBy.get(p) ?? [])) cx.push({ pid, id_type: 'MYHOME_HSMP_SN', id_value: x.id, issuer: '국토교통부', as_of: stage.asOf?.myhome ?? null, source_ref: ref.myhome, rule: RULE.MYHOME, name: x.name });
  }
  const cxLinked = attach(cx).sort((a, b) => byStr(a.pid, b.pid) || byStr(a.id_type, b.id_type) || byStr(a.id_value, b.id_value));
  for (const c of cxLinked) ids.push(idRow(c));
  rep.complex = { doneProjects: done.length, projectsWithKey: new Set(cxLinked.map((c) => c.pid)).size, byType: {} };
  for (const c of cxLinked) rep.complex.byType[c.id_type] = (rep.complex.byType[c.id_type] ?? 0) + 1;

  /* ---------- 공고: 청약홈 · HUG ---------- */
  const fetched = (k) => (stage.collectedAt?.[k] ?? '').slice(0, 10) || stage.asOf?.[k];
  const ahId = (n) => n.key.replace('|', '-');
  const ahNotices = [...stage.applyhome].sort((a, b) => byStr(ahId(a), ahId(b)));
  for (const n of ahNotices) t.notices.push({ notice_system: 'APPLYHOME', notice_id: ahId(n), notice_title: n.name ?? ahId(n), sgg_code: n.sgg ?? null, pnu: n.pnu ?? null, announced_on: n.announced && DAY.test(n.announced) ? n.announced : null, apply_start: null, apply_end: null, observed_on: fetched('applyhome'), source_ref: ref.applyhome });
  const seen = new Map();
  const hugRows = [...stage.hug].sort((a, b) => byStr(a.key, b.key)).map((h) => { const k = seen.get(h.key) ?? 0; seen.set(h.key, k + 1); return { ...h, id: k ? `${h.key}#${k + 1}` : h.key }; });   // 같은 키가 둘이면 '#2'
  for (const h of hugRows) t.notices.push({ notice_system: 'HUG', notice_id: h.id, notice_title: h.name ?? h.id, sgg_code: h.sgg ?? null, pnu: null, announced_on: h.announced && DAY.test(h.announced) ? h.announced : null, apply_start: null, apply_end: null, observed_on: fetched('hug'), source_ref: ref.hug });

  /* 사업 쪽 대조 자료(측정 n2·n3): 기록마다 시군구 앞 4자리·블록·지구 핵심어·대조 글자·이름 조각 */
  const hubPids = new Set(t.projects.filter((p) => /^hub-/.test(p.source_ref)).map((p) => p.local_project_id));
  const aPnu = new Map();   // A1: 건축HUB 사업 위치 필지 + 기록의 대지위치 필지
  for (const [pnu, pids] of pidsOfPnu) for (const pid of pids) if (hubPids.has(pid)) push(aPnu, pnu, pid);
  for (const { r, pid } of recs) { const s = r.site ? locate(r.site, mapper).pnu : null; if (s && !(aPnu.get(s) ?? []).includes(pid)) push(aPnu, s, pid); }
  const R = recs.map(({ r, pid, at }) => {
    const blocks = new Set([normBlock(r.block), ...NL.blocksOf(`${r.name} ${r.complex ?? ''}`)].filter(Boolean));
    return { r, pid, sgg: at.sgg?.slice(0, 4) ?? null, blocks, dist: distCore(r.special), text: NL.compact(`${r.name} ${r.complex ?? ''} ${r.special}`), parts: nameParts(r.name), partsHug: [...new Set([...nameParts(r.name), ...(r.complex ? nameParts(r.complex) : [])])], hh: r.households };
  });
  const recBySgg = new Map();
  for (const x of R) if (x.sgg) push(recBySgg, x.sgg, x);
  const dateOk = (pid, d) => !approval.get(pid) || !d || d >= approval.get(pid);
  const uniq = (xs) => [...new Map(xs.map((y) => [y.pid, y])).values()];

  const links = new Map();   // `${system}|${id}|${pid}` → { system, id, pid, rule, evidence, source_ref, n }
  const candidates = [];
  const addLink = (system, id, pid, rule, evidence, source_ref, n, auto = true) => {
    const k = `${system}|${id}|${pid}`;
    if (links.has(k)) return;
    if (!auto) { candidates.push({ system, id, pid, rule, evidence, source_ref, n }); return; }
    links.set(k, { system, id, pid, rule, evidence, source_ref, n });
  };
  rep.applyhome = { notices: ahNotices.length, byRule: {}, oneToMany: { [RULE.A3]: 0, [RULE.A4]: 0 }, roadMapCandidates: 0 };
  for (const n of ahNotices) {
    const id = ahId(n), sgg = n.sgg?.slice(0, 4), de = n.announced;
    const text = NL.compact(`${n.name ?? ''} ${n.address ?? ''}`), dists = [...new Set([n.name, n.address].flatMap((s) => NL.pairsOf(nfkc(s)).map((p) => NL.compact(p.dist))))];
    const parts = nameParts(n.name), blocks = new Set(n.blocks ?? []);
    const pool = sgg ? recBySgg.get(sgg) ?? [] : [];
    const done1 = new Set();
    for (const pid of (n.pnu ? aPnu.get(n.pnu) ?? [] : [])) if (dateOk(pid, de) && !done1.has(pid)) {
      done1.add(pid);
      const road = n.pnu_via === 'ROAD_MAP';
      addLink('APPLYHOME', id, pid, RULE.A1, `${RULE.A1}: 청약홈 ${id} 공급위치 ${n.address} → 필지 ${n.pnu}(${n.pnu_via}) = 사업 위치 필지`, ref.applyhome, n, !road || AUTO.A1_ROAD_MAP);
    }
    const b = uniq(pool.filter((y) => [...blocks].some((k) => y.blocks.has(k)) && (hasDist(text, NL.compact(y.dist ?? '')) || dists.some((d) => hasDist(y.text, d))))).filter((y) => dateOk(y.pid, de));
    for (const y of b) addLink('APPLYHOME', id, y.pid, RULE.A2, `${RULE.A2}: 청약홈 ${id} "${n.name}" 블록 ${[...blocks].filter((k) => y.blocks.has(k)).join(',')} · 지구 낱말 = 건축HUB ${y.r.pk} ${y.r.name}${y.r.special ? `(${y.r.special})` : ''}`, ref.applyhome, n);
    for (const [rule, f] of [[RULE.A3, (y) => nameEq(parts, y.parts)], [RULE.A4, (y) => nameContain(parts, y.parts)]]) {
      const ok = uniq(pool.filter((y) => f(y) && hhNear(n.households, y.hh))).filter((y) => dateOk(y.pid, de));
      if (ok.length > 1) { rep.applyhome.oneToMany[rule]++; continue; }
      for (const y of ok) addLink('APPLYHOME', id, y.pid, rule, `${rule}: 청약홈 ${id} "${n.name}" ${n.households}세대 ↔ 건축HUB ${y.r.pk} "${y.r.name}" ${y.hh}세대`, ref.applyhome, n);
    }
  }
  rep.hug = { rows: hugRows.length, matchedRows: 0 };
  for (const h of hugRows) {
    const sgg = h.sgg?.slice(0, 4), parts = nameParts(h.name);
    if (!sgg) continue;
    const ok = uniq((recBySgg.get(sgg) ?? []).filter((x) => hhNear(h.total, x.hh) && nameEq(parts, x.partsHug))).filter((x) => dateOk(x.pid, h.announced));
    if (ok.length) rep.hug.matchedRows++;
    for (const x of ok) addLink('HUG', h.id, x.pid, RULE.H1, `${RULE.H1}: HUG "${h.name}" 총 ${h.total}세대 · 공고승인 ${h.announced ?? '?'} ↔ 건축HUB ${x.r.pk} "${x.r.name}" ${x.hh}세대`, ref.hug, h);
  }

  /* ---------- LH 공고 상세: L1 연결 · 입주예정월 ---------- */
  const lhNotice = new Map(t.notices.filter((n) => n.notice_system === 'LH').map((n) => [n.notice_id, n]));
  const detailByPan = new Map();
  for (const d of stage.lhDetail) push(detailByPan, d.pan, d);
  const kindOfLh = (pan) => NL.noticeKind(lhNotice.get(pan)?.notice_title ?? '');
  const lhLinked = new Set(t.notice_links.filter((l) => l.notice_system === 'LH').map((l) => `${l.notice_id}|${l.local_project_id}`));
  for (const d of stage.lhDetail) {
    if (!d.pnu || !lhNotice.has(d.pan) || kindOfLh(d.pan) === 'CANCEL') continue;
    for (const pid of pidsOfPnu.get(d.pnu) ?? []) {
      if (lhLinked.has(`${d.pan}|${pid}`)) continue;
      if (!dateOk(pid, lhNotice.get(d.pan).announced_on)) continue;
      addLink('LH', d.pan, pid, RULE.L1, `${RULE.L1}: LH 공고 상세 단지 ${d.name ?? '(이름 없음)'} ${d.address ?? ''} → 필지 ${d.pnu}(${d.pnu_via}) = 사업 위치 필지`, ref.lhDetail, d, AUTO.L1_DETAIL_PNU);
    }
  }

  /* 연결 행(그 전에, 이미 이어진 LH·마이홈 공고의 정정·재공고 묶음을 사업마다 — L1 모집공고가 겹치지 않게) */
  const existingGroups = new Map();
  const noticeOf = new Map(t.notices.map((n) => [`${n.notice_system}|${n.notice_id}`, n]));
  for (const l of t.notice_links) {
    const n = noticeOf.get(`${l.notice_system}|${l.notice_id}`);
    if (n && (l.notice_system === 'LH' || l.notice_system === 'MYHOME')) push(existingGroups, l.local_project_id, NL.noticeGroup(n.notice_title));
  }
  const linkRows = [...links.values()].sort((a, b) => byStr(a.system, b.system) || byStr(a.id, b.id) || byStr(a.pid, b.pid));
  for (const l of linkRows) t.notice_links.push({ notice_system: l.system, notice_id: l.id, local_project_id: l.pid, evidence: l.evidence, review_status: 'REVIEW_REQUIRED', source_ref: l.source_ref });
  for (const c of candidates.sort((a, b) => byStr(a.system, b.system) || byStr(a.id, b.id) || byStr(a.pid, b.pid))) {
    reviews.push({ review_type: 'LINK_CANDIDATE', local_project_id: c.pid, source_ref: c.source_ref, record_key: `${c.system} ${c.id}`, record_name: c.n.name ?? null, detail: c.evidence, reason: '도로명 → 지번 매핑(ROAD_MAP)으로 만든 필지라 표본 정밀도가 자동 기준(95%)에 못 미쳐 잇지 않았다' });
    if (c.rule === RULE.A1) rep.applyhome.roadMapCandidates++;
  }
  rep.links = { byRule: {}, projectsByRule: {}, projects: new Set(linkRows.map((l) => l.pid)).size, candidates: candidates.length };
  for (const l of linkRows) { rep.links.byRule[l.rule] = (rep.links.byRule[l.rule] ?? 0) + 1; (rep.links.projectsByRule[l.rule] ??= new Set()).add(l.pid); }
  rep.links.projectsByRule = Object.fromEntries(Object.entries(rep.links.projectsByRule).map(([k, v]) => [k, v.size]));
  rep.links.roadMapAuto = linkRows.filter((l) => l.rule === RULE.A1 && l.n.pnu_via === 'ROAD_MAP').length;

  /* ---------- 공급 이벤트 ---------- */
  const linksOf = new Map();
  for (const l of linkRows) push(linksOf, l.pid, l);
  rep.events = { supply: { APPLYHOME: 0, HUG: 0, LH: 0 }, moveIn: { APPLYHOME: 0, LH: 0 }, estimated: { HUG: 0, APPLYHOME: 0 } };
  const moveIn = new Map();   // `${pid}|${month}|${system}` → [근거]
  for (const [pid, ls] of [...linksOf].sort(([a], [b]) => byStr(a, b))) {
    /* 청약홈: 주택관리번호마다 가장 이른 공고 하나(사전청약 제외) */
    const ah = ls.filter((l) => l.system === 'APPLYHOME' && supplyKind(l.n) && !l.n.presale && DAY.test(l.n.announced ?? ''));
    const byHouse = new Map();
    for (const l of ah) push(byHouse, l.n.key.split('|')[0], l);
    for (const [house, xs] of [...byHouse].sort(([a], [b]) => byStr(a, b))) {
      const [m, ...rest] = xs.sort((a, b) => byStr(a.n.announced, b.n.announced) || byStr(a.id, b.id));
      ev(pid, 'SUPPLY_NOTICE', 'ACTUAL', m.n.announced, `공고 APPLYHOME ${m.id}(${m.n.kind}${m.n.type ? `·${m.n.type}` : ''}, 주택관리번호 ${house}) · ${m.rule}${rest.length ? ` · 같은 주택 공고 ${rest.map((r) => r.id).join(', ')}` : ''}`, ref.applyhome);
      rep.events.supply.APPLYHOME++;
    }
    for (const l of ah) if (/^\d{4}-\d{2}$/.test(l.n.move_in ?? '')) push(moveIn, `${pid}|${l.n.move_in}|APPLYHOME`, `청약홈 ${l.id} ${l.n.name}`);
    /* HUG: 이어진 행마다 공고승인일 */
    for (const l of ls.filter((x) => x.system === 'HUG' && DAY.test(x.n.announced ?? ''))) {
      ev(pid, 'SUPPLY_NOTICE', 'ACTUAL', l.n.announced, `공고 HUG ${l.id}(공고승인) · ${l.rule}`, ref.hug);
      rep.events.supply.HUG++;
    }
    /* L1 으로 새로 이은 LH 공고: 최초 모집만, 이미 이어진 같은 묶음이 없을 때 정정·재공고 묶음마다 하나 */
    const lh = new Map();
    for (const l of ls.filter((x) => x.system === 'LH')) {
      const n = lhNotice.get(l.id);
      if (NL.noticeKind(n.notice_title) !== 'INITIAL' || !n.announced_on) continue;
      const g = NL.noticeGroup(n.notice_title);
      if (!(existingGroups.get(pid) ?? []).includes(g)) push(lh, g, n);
    }
    for (const rs of lh.values()) {
      const [m, ...rest] = rs.sort((a, b) => byStr(a.announced_on, b.announced_on) || byStr(a.notice_id, b.notice_id));
      ev(pid, 'SUPPLY_NOTICE', 'ACTUAL', m.announced_on, `공고 LH ${m.notice_id} · ${RULE.L1}${rest.length ? ` · 정정·재공고 ${rest.map((r) => `LH ${r.notice_id}`).join(', ')}` : ''}`, ref.lhDetail);
      rep.events.supply.LH++;
    }
  }
  /* LH 입주예정월: 이어진 LH 공고(비공급 제외)마다 공고 단지 중 사업의 단지 — 하나면 그것, 여럿이면 블록이 맞는 것(L1 은 필지가 맞는 것), 모두 같은 달이면 그 달 */
  const pIndex = NL.projectIndex({ projects: t.projects, identifiers: t.identifiers, complexes: t.complexes, hubRecords }, 'datagokr-15141761');
  const blocksOfPid = new Map();
  for (const [blk, xs] of pIndex.byBlock) for (const x of xs) push(blocksOfPid, x.p.local_project_id, blk);
  const lhLinks = [...t.notice_links.filter((l) => l.notice_system === 'LH' && !/주택 공급 공고 아님/.test(l.evidence ?? '')).map((l) => ({ pan: l.notice_id, pid: l.local_project_id, l1: false })),
    ...linkRows.filter((l) => l.system === 'LH').map((l) => ({ pan: l.id, pid: l.pid, l1: true, pnu: l.n.pnu }))];
  rep.lhMoveIn = { links: lhLinks.length, single: 0, byBlock: 0, sameMonth: 0, byPnu: 0, unresolved: 0, noDetail: 0 };
  for (const { pan, pid, l1, pnu } of lhLinks) {
    const ds = (detailByPan.get(pan) ?? []).filter((d) => /^\d{4}-\d{2}$/.test(d.move_in ?? ''));
    if (!ds.length) { rep.lhMoveIn.noDetail++; continue; }
    let pick = null, how = null;
    if (l1) { pick = ds.filter((d) => d.pnu === pnu); how = 'byPnu'; }
    else if (ds.length === 1) { pick = ds; how = 'single'; }
    else {
      const mine = new Set(blocksOfPid.get(pid) ?? []);
      const hit = ds.filter((d) => (d.blocks ?? []).some((b) => mine.has(b)));
      if (hit.length) { pick = hit; how = 'byBlock'; } else if (new Set(ds.map((d) => d.move_in)).size === 1) { pick = ds; how = 'sameMonth'; }
    }
    if (!pick?.length) { rep.lhMoveIn.unresolved++; continue; }
    rep.lhMoveIn[how]++;
    for (const d of pick) push(moveIn, `${pid}|${d.move_in}|LH`, `LH 공고 ${pan} ${d.name ?? ''}${d.households ? ` ${d.households}세대` : ''}`.trim());
  }
  for (const [k, why] of [...moveIn].sort(([a], [b]) => byStr(a, b))) {
    const [pid, month, sys] = k.split('|');
    ev(pid, 'MOVE_IN', 'PLANNED', month, [...new Set(why)].join(' · '), sys === 'LH' ? ref.lhDetail : ref.applyhome);
    rep.events.moveIn[sys]++;
  }

  /* ---------- ③ 착공 추정(ESTIMATED): 착공 실제가 없는 사업, HUG 보증발급일 · 청약홈 APT 최초 모집공고일(사전청약 제외) 중 가장 이른 것 ---------- */
  for (const [pid, ls] of [...linksOf].sort(([a], [b]) => byStr(a, b))) {
    if (actual.has(`${pid}|CONSTRUCTION_START`)) continue;
    const basis = [
      ...ls.filter((l) => l.system === 'HUG' && DAY.test(l.n.guarantee ?? '')).map((l) => ({ d: l.n.guarantee, sys: 'HUG', text: `HUG 최초 보증발급 ${l.n.guarantee}(HUG ${l.id}, ${l.rule})`, src: ref.hug })),
      ...ls.filter((l) => l.system === 'APPLYHOME' && l.n.kind === 'APT' && !l.n.presale && DAY.test(l.n.announced ?? '')).map((l) => ({ d: l.n.announced, sys: 'APPLYHOME', text: `청약홈 APT 모집공고 ${l.n.announced}(APPLYHOME ${l.id}, ${l.rule})`, src: ref.applyhome })),
    ].sort((a, b) => byStr(a.d, b.d) || byStr(a.text, b.text));
    if (!basis.length) continue;
    ev(pid, 'CONSTRUCTION_START', 'ESTIMATED', basis[0].d, `착공 추정(이 날 이전 착공): ${basis[0].text}`, basis[0].src);
    rep.events.estimated[basis[0].sys]++;
  }

  t.events.push(...events);
  t.identifiers.push(...ids);
  t.review_required.push(...reviews);
  rep.identifiers = ids.reduce((o, r) => ((o[r.id_type] = (o[r.id_type] ?? 0) + 1), o), {});
  rep.keyDuplicates = KEY_TYPES;
  rep.reviews = reviews.length;
}
const idRow = (c) => ({ local_project_id: c.pid, id_type: c.id_type, id_value: c.id_value, id_issuer: c.issuer, as_of: c.as_of, source_ref: c.source_ref, match_status: 'REVIEW_REQUIRED', match_rule: c.rule });

module.exports = { addStage, isStageSource, stageSourceName, STAGE_NAMES, SRC, RULE, AUTO, supplyKind, normName, nameParts, nameEq, nameContain, hhNear, distCore, hasDist };
