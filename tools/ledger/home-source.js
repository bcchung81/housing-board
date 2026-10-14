'use strict';
/* HOME PoC 덤프 판(schemas/ledger-<달>/raw/home/<덤프시각>, tools/ledger/home-dump.py)을 사업 원장 행으로 옮기고, 수도권(서울 11·인천 28·경기 41)의 원장 행을 HOME 행으로 갈아끼운다.
   계획: docs/product/데이터-정제-계획.md 3절(목표 구조)·4절 D4·5절(대응표)·6절(결정).
   - 사업: HOME 사업(home_project, HPR_) 하나 = 원천 사업후보(project, PRO_) 하나(SOURCE_ANCHOR). 같은 시도·정규화 지구·블록(HOME supply_dashboard.block_key 와 같은 규칙)의
     HOME 사업은 한 원장 사업으로 합친다(공급계획 행과 건설공사 행이 같은 블록에 따로 있다 — 원장의 사업 단위는 블록이다). 합친 사업의 호수는 겹치므로 더하지 않고 가장 큰 계획 호수 하나.
   - id: mappings/home-ids.json(누적, 지우지 않음) — 키 HPR:·PRO:·LH:·BLK:<시군구>|<지구>|<블록> 중 하나라도 맞으면 같은 PRJ id(키 순위 HPR > PRO > LH > BLK).
     새 사업은 시군구마다 레지스트리 카운터·기존 매핑(HOME·건축HUB 후보)·이번 표의 id 중 가장 큰 일련 다음 번호. 레지스트리 발급은 scripts/issue-projects.js --home.
   - 시군구: LH 준공예정 별칭의 지구·블록(mappings/lh-block-sgg.json) → LH 블록 위치점의 지구 코드(zonecode 앞 5자리) → 주소 → 시군구 이름 → 지구 이름. 못 정하면 사업을 만들지 않고
     review_required(SGG_UNRESOLVED). 시 단위 코드(예 41280 고양시)와 그 아래 구 코드가 함께 나오면 구 코드.
   - 일정: 원천 날짜 칸의 정밀도(일·월·연)를 그대로 둔다. 원천 칸 = CONFIRMED, HOME 자동 연결(LH 준공예정 별칭·청약 공고·건축HUB 허가 후보) = REVIEW_REQUIRED.
   - 정책·프로그램·연결: REVIEW → REVIEW_REQUIRED, CONFIRMED → CONFIRMED. 정책이 UNASSIGNED·MON_*·RELEASED 인 연결은 넣지 않는다. 재매칭본은 판마다 통째로 바뀐다(links).
   - 지역 지표(area_stat·unsold) → area_facts. 통계(statistic)는 싣지 않는다(통계누리 실적을 유지 — 6절 2, 대조 시험만).
   순수 함수(buildHome·assignHomeIds·homeRows·replaceSido)는 파일을 읽거나 쓰지 않는다. 읽기는 readHome, 쓰기는 convert.js --out(home-ids)·scripts/issue-projects.js --home(레지스트리). */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { normalize, nameIndex } = require('./map-lh');

const HOME_SIDO = ['11', '28', '41'];
const HOME_PREFIX = 'home-dump-';
const HOME_SYSTEM = 'home';   // 레지스트리 refs.system
/* HOME 단계 → 공급 6단계(참고 구현 PoC 12 import-home10.py STAGE 와 같음, 계획 단계는 모두 02). UNKNOWN 도 02 */
const STAGE = { CANDIDATE: '02', PROPOSED_DISTRICT: '02', DESIGNATED: '02', PLANNING: '02', PLANNED_SUPPLY: '02', UNKNOWN: '02', APPROVAL: '03', CONSTRUCTION: '04' };
const SOURCE_ALIAS = { lh_incheon_sale: 'lh_sale', lh_incheon_rent: 'lh_rent', lh_incheon_construction: 'lh_construction' };
const LH_SOURCES = new Set(['lh_sale', 'lh_rent', 'lh_construction', 'lh_history', 'lh_progress', 'lh_reit_progress']);
const PLAN_SOURCES = new Set(['lh_sale', 'lh_rent']);
const WORK_SOURCES = new Set(['lh_construction', 'lh_progress']);
const SIDO_NAME = { 11: '서울특별시', 28: '인천광역시', 41: '경기도' };
const AGENCY = [[/^(LH|한국토지주택공사)$/, 'lh'], [/^(SH|서울주택도시공사)$/, 'sh'], [/^(GH|경기주택도시공사)$/, 'gh']];
const KEY_ORDER = ['HPR', 'PRO', 'LH', 'BLK'];
const status = (s) => (s === 'CONFIRMED' ? 'CONFIRMED' : 'REVIEW_REQUIRED');
const skipPolicy = (id) => !id || id === 'UNASSIGNED' || /^MON_/.test(id);
const src = (s) => SOURCE_ALIAS[s] ?? s;
const pad2 = (n) => String(n).padStart(2, '0');
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* ---------- 읽기 ---------- */
/* 판 폴더 → { edition(폴더 이름 = 덤프 시각), snapshotAt, manifest, kinds: { 이름: 행 배열 } }. manifest 의 sha256 과 다르면 던진다(재덤프·복사 실수) */
function readHome(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const kinds = {};
  for (const [file, f] of Object.entries(manifest.files)) {
    const buf = fs.readFileSync(path.join(dir, file));
    if (f.sha256 && crypto.createHash('sha256').update(buf).digest('hex') !== f.sha256) throw new Error(`${dir}/${file} 의 sha256 이 manifest 와 다르다`);
    kinds[file.replace(/\.jsonl\.gz$/, '')] = zlib.gunzipSync(buf).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  return { edition: path.basename(dir), snapshotAt: manifest.snapshot_at, manifest, kinds };
}
/* 그 달 폴더의 가장 늦은 HOME 판(raw/home/<덤프시각>, manifest.json 이 있는 것), 없으면 null */
function latestHomeDir(monthDir) {
  const base = path.join(monthDir, 'raw/home');
  if (!fs.existsSync(base)) return null;
  const eds = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'manifest.json'))).sort();
  return eds.length ? path.join(base, eds[eds.length - 1]) : null;
}
/* 판의 원본 jsonl.gz 가 다 있는가(저장소에는 manifest 만 있고 원본은 Storage ledger-raw/<달>/home/<덤프시각>/ — 계획 D6) */
const homeAvailable = (dir) => !!dir && Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).files).every((f) => fs.existsSync(path.join(dir, f)));
const refsOf = (edition) => {
  const b = `${HOME_PREFIX}${edition}`;
  return { main: b, lhPlan: `${b}-lh-plan`, report: `${b}-report`, notice: `${b}-notice`, lhNotice: `${b}-lh-notice`, ghNotice: `${b}-gh-notice`, stage: `${b}-stage`, policy: `${b}-policy`, area: (g) => `${b}-area-${g.replace(/_/g, '-')}`, unsold: `${b}-unsold` };
};

/* ---------- 날짜 ---------- */
/* 원천 날짜 칸 → 이벤트 날짜 칸(정밀도 그대로): 'YYYY-MM-DD' → event_date, 'YYYY-MM'·'YYYY년MM월' → event_month, 'YYYY'·숫자 → event_year. 못 읽으면 null */
function dateParts(v) {
  const s = String(v ?? '').replace(/\s+/g, '');
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return { event_date: s, event_month: null, event_year: null };
  m = /^(\d{4})(?:-|년|\.)(\d{1,2})월?$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { event_date: null, event_month: `${m[1]}-${pad2(m[2])}`, event_year: null };
  m = /^(\d{4})(?:년)?$/.exec(s);
  return m ? { event_date: null, event_month: null, event_year: m[1] } : null;
}
/* 원천 예정 범위 글('2026년 5~6월 중(최초)'·'2027년 하반기 예정') → 범위의 마지막 달(월 범위) 또는 연(반기·분기는 달을 지어내지 않는다) */
function periodParts(v) {
  const s = String(v ?? '').replace(/\s+/g, '').replace(/예정|중|\(.*?\)/g, '');
  const m = /^(\d{4})년(\d{1,2})(?:~(\d{1,2}))?월/.exec(s);
  if (m) { const mo = +(m[3] ?? m[2]); return mo >= 1 && mo <= 12 ? { event_date: null, event_month: `${m[1]}-${pad2(mo)}`, event_year: null } : null; }
  const y = /^(\d{4})년(?:[상하]반기|[1-4]분기)?$/.exec(s);
  return y ? { event_date: null, event_month: null, event_year: y[1] } : null;
}

/* ---------- 블록 키(HOME supply_dashboard.block_key) ---------- */
function districtTerm(row) {
  if (!LH_SOURCES.has(src(row.source_id))) return null;
  let v = row.district || row.name || '';
  v = v.replace(/\([^)]*(?:\)|$)/g, '');
  v = v.split(/\s*[A-Za-z]{1,3}\s*-?\s*\d|\s+주복\d|\s+0\d/)[0];
  return v.trim() || null;
}
/* (시도 이름, 정규화 지구, 블록) 또는 null */
function blockKey(row) {
  const term = districtTerm(row);
  let block = row.block;
  if (!block) { const m = /\s+([A-Za-z]{1,3})\s*-?\s*(\d+)(?:BL)?(?:\s|\(|$)/i.exec(row.name ?? ''); block = m ? m[1] + m[2] : null; }
  const m = /^([A-Za-z]{1,3})\s*-?\s*0*(\d+)(?:BL)?$/i.exec(block ?? '');
  if (!term || !m) return null;
  const t = term.replace(/\s+/g, '').replaceAll('국제화계획', '').replace(/(?:공공주택지구|택지개발사업|택지개발지구|지구)+$/, '');
  return t ? { region: row.region, term: t, block: `${m[1].toUpperCase()}${+m[2]}` } : null;
}
const keyText = (k) => `${k.region}|${k.term}|${k.block}`;

/* ---------- 대표 고르기(HOME supply_dashboard.inventory — policy-progress.js 도 이것을 쓴다) ---------- */
/* 대표가 될 수 없는 행: 복수 현장 계약(MULTI_SITE_CONTRACT), 블록 키 없는 건설공사 계약. rows 의 source_id 는 별칭을 푼 값(lh_incheon_* → lh_*) */
const inventoryDropped = (row) => (row.warnings || []).includes('MULTI_SITE_CONTRACT') || (row.source_id === 'lh_construction' && blockKey(row) === null);
/* 지구·블록 중복 제외 → { chosen, excluded }(id). 같은 블록(blockKey)에 공급계획(lh_sale·lh_rent)이 하나면 그것, 계획 없이 한 행이면 그 행이 대표.
   계획이 둘 이상이거나 계획 없이 여러 행이면 묶음째 뺀다. 대표의 계획 호수가 없고 같은 블록 원천의 양수 호수가 한 값이면 그 값(SAME_BLOCK_SOURCE) */
function inventory(rows) {
  const grouped = new Map(), excluded = [];
  for (const row of rows) {
    if (inventoryDropped(row)) { excluded.push(row.id); continue; }
    const key = blockKey(row);
    const k = key ? `K${keyText(key)}` : `S${row.source_id}\u0000${row.id}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(row);
  }
  const chosen = [];
  for (const group of grouped.values()) {
    const plans = group.filter((r) => PLAN_SOURCES.has(r.source_id));
    if (plans.length > 1 || (!plans.length && group.length > 1)) { excluded.push(...group.map((r) => r.id)); continue; }
    let winner = plans.length ? plans[0] : group[0];
    if (winner.planned_units == null) {
      const caps = new Set(group.filter((r) => r.planned_units != null && r.planned_units > 0).map((r) => r.planned_units));
      if (caps.size === 1) winner = { ...winner, planned_units: [...caps][0], quantity_basis: 'SAME_BLOCK_SOURCE', quantity_source_ids: group.filter((r) => r.planned_units != null).map((r) => r.id) };
    }
    chosen.push(winner);
    excluded.push(...group.filter((r) => r.id !== winner.id).map((r) => r.id));
  }
  return { chosen, excluded };
}

/* 현장 키(원장만의 규칙 — 대표가 될 수 없는 행만 있는 묶음을 다른 사업에 붙일 때): 시도|지구(괄호·지구 꼬리 뺌)|블록(숫자 블록도 받는다).
   지구가 없으면 이름의 마지막 낱말이 블록. 복수 현장 계약이 아니면 이름에 블록 표기가 하나뿐일 때 그 블록(HOME evidence_bridge.match_key 와 같은 생각) */
function siteKey(p) {
  const noParen = (s) => String(s ?? '').replace(/\([^)]*(?:\)|$)/g, ' ').trim();
  let term = noParen(p.district), block = p.block;
  if (!term) { const w = noParen(p.name).split(/\s+/); if (w.length < 2) return null; block = w.pop(); term = w.join(''); }
  if (!(p.warnings ?? []).includes('MULTI_SITE_CONTRACT')) {
    const hits = new Set([...String(p.name ?? '').toUpperCase().matchAll(/(?<![A-Z0-9])([A-Z]{1,3})\s*-?\s*0*(\d+)(?:BL|블록)?(?![0-9])/g)].map((m) => `${m[1]}${m[2]}`));
    if (hits.size === 1) block = [...hits][0];
  }
  const m = /^([A-Za-z]{0,3})\s*-?\s*0*(\d+)(?:BL)?$/i.exec(String(block ?? '').trim());
  const b = m ? `${m[1].toUpperCase()}${m[2]}` : String(block ?? '').replace(/\s+/g, '').toUpperCase();
  const t = term.replace(/\s+/g, '').replace(/(?:공공주택지구|택지개발사업|택지개발지구|지구)+$/, '');
  return t && b ? `${p.region}|${t}|${b}` : null;
}
/* 공사 계약 코드형 이름('[(105228)서울공릉(복합개발)]…') */
const CODE_NAME = /^\s*\[\(\d+\)/;
/* 지구+블록 이름(대표 원천이 없을 때, LH 공급계획 이름 꼴): '인천서구(거북이기지)'·'1' → '인천서구(거북이기지) 1'. 원천 지구 칸 끝의 닫히지 않은 '(' 는 뺀다 */
const siteName = (p) => { const d = String(p.district ?? '').replace(/\s*\($/, '').trim(); return d ? [d, String(p.block ?? '').trim()].filter(Boolean).join(' ') : null; };

/* ---------- 시군구 ---------- */
const sggCandidates = (t) => [...(t.length >= 3 && t[1].endsWith('시') && t[2].endsWith('구') ? [{ name: t.slice(0, 3).join(' '), used: 3 }] : []), ...(t.length >= 2 ? [{ name: t.slice(0, 2).join(' '), used: 2 }] : [])];
/* 주소 글 → { sgg, bjd } (못 찾으면 null). 시군구 이름이 없으면 개편된 구(동 이름이 맞는 구가 하나)로 잇는다(map-lh.js 와 같은 규칙). 필지는 만들지 않는다(HOME: NO_PNU_INFERENCE) */
function addressArea(address, idx) {
  const t = normalize(String(address ?? '').replace(/[(),]/g, ' ').trim()).tokens.filter(Boolean);
  let sgg = null, rest = [];
  for (const c of sggCandidates(t)) { const hit = idx.sggByName.get(c.name); if (hit) { sgg = hit; rest = t.slice(c.used); break; } }
  if (!sgg && idx.sidoNames.has(t[0])) {
    for (let k = 1; k < Math.min(t.length, 4) && !sgg; k++) {
      const hits = idx.dongIndex.get(`${t[0]}|${t[k]}`);
      if (hits && hits.size === 1) { const [code, bjd] = [...hits][0]; if (bjd) return { sgg: code, bjd }; }
    }
  }
  if (!sgg) return null;
  let bjd = null;
  if (rest[0]) for (const n of rest[1] && rest[1].endsWith('리') ? [`${sgg.area_name} ${rest[0]} ${rest[1]}`, `${sgg.area_name} ${rest[0]}`] : [`${sgg.area_name} ${rest[0]}`]) { const c = idx.bjdByName.get(n); if (c) { bjd = c; break; } }
  return { sgg: sgg.area_code, bjd };
}
/* 시군구 이름 글('남양주'·'부천시'·'노원구') → 시군구 코드. '확인 필요' 같은 자리 표시는 null */
function muniSgg(region, muni, idx) {
  const m = String(muni ?? '').replace(/\(.*?\)/g, '').trim();
  if (!m || /확인|상세|미상/.test(m) || !region) return null;
  for (const n of [`${region} ${m}`, `${region} ${m}시`, `${region} ${m}군`, `${region} ${m}구`]) { const hit = idx.sggByName.get(n); if (hit) return hit.area_code; }
  return null;
}
/* 이름 글의 지역 낱말(마지막 수단): 지구 이름 앞머리의 시군구 짧은 이름('인천계양' → 계양구, '안산신길2' → 안산시, '병점복합타운' → 화성시 병점구)과
   '…동' 낱말(개편된 구는 동 이름이 맞는 구가 하나일 때) */
const SIDO_SHORT = /^(서울|인천|경기)/;
function nameSgg(p, idx) {
  const out = [], region = p.region;
  if (!region) return out;
  idx.shortSgg ??= (() => {
    const m = new Map();
    for (const r of idx.sggByName.values()) {
      const [sido, ...rest] = r.area_name.split(' '), last = rest[rest.length - 1] ?? '', short = last.replace(/(시|군|구)$/, '');
      if (short.length < 2) continue;
      const k = `${sido}|${short}`;
      m.set(k, m.has(k) && m.get(k) !== r.area_code ? null : r.area_code);
    }
    return m;
  })();
  const text = [p.district, p.name].filter(Boolean).join(' ').replace(/\(.*?\)/g, ' ');
  for (const w of text.split(/[\s,\[\]()]+/).filter(Boolean)) {
    const word = w.replace(SIDO_SHORT, '');
    for (let n = Math.min(4, word.length); n >= 2; n--) {
      const c = idx.shortSgg.get(`${region}|${word.slice(0, n)}`);
      if (c) { out.push({ code: c, method: 'NAME_SGG' }); break; }
    }
    const d = /^([가-힣]+동)\d*(?:가)?$/.exec(word)?.[1];
    for (const dong of d ? [d] : [2, 3].map((n) => `${word.slice(0, n)}동`)) {
      const hits = /^[가-힣]{2,3}동$/.test(dong) && idx.dongIndex.get(`${region}|${dong}`);
      if (hits && hits.size === 1) { out.push({ code: [...hits.keys()][0], method: 'NAME_DONG' }); break; }
    }
  }
  return out;
}
/* 후보(순위 순) → 하나. 시도가 맞지 않는 후보는 버리고, 첫 후보가 시 단위(끝자리 0)인데 같은 시의 구 후보가 뒤에 있으면 구로 좁힌다. 서로 다른 시군구면 첫 후보(conflict 표시) */
function pickSgg(cands, sido, idx) {
  const ok = cands.filter((c) => c.code && c.code.slice(0, 2) === sido && idx.sggByCode.has(c.code));
  if (!ok.length) return null;
  let best = ok[0];
  const child = ok.find((c) => c.code !== best.code && best.code.endsWith('0') && c.code.slice(0, 4) === best.code.slice(0, 4));
  if (child) best = { ...child, method: `${best.method}+${child.method}` };
  const conflict = ok.some((c) => !/^NAME_/.test(c.method) && c.code.slice(0, 4) !== best.code.slice(0, 4));
  return { code: best.code, method: best.method, conflict };
}

/* ---------- 덤프 → 사업 묶음 ---------- */
/* home: readHome 결과, areaRows: 법정동코드 존재 행(convert 의 legalDong.rows), lhSgg: mappings/lh-block-sgg.json.
   돌려주는 것: { edition, asOf(덤프 날짜), refs, groups(사업 묶음 — sgg 있는 것), unresolved(시군구 못 정한 묶음), kinds, idx, report } */
function buildHome(home, { areaRows, lhSgg = [] }) {
  const K = home.kinds, edition = home.edition, asOf = home.snapshotAt.slice(0, 10), refs = refsOf(edition);
  const idx = nameIndex(areaRows);
  const report = { homeProjects: K.home_project.length };
  const pro = new Map(K.project.map((r) => [r.entity_id, { id: r.entity_id, source_id: r.source_id, ...r.payload }]));
  const lhPlan = new Map(K.lh_completion_plan.map((r) => [r.entity_id, r.payload]));
  const anchors = new Map(), lhAlias = new Map();   // HPR → PRO, HPR → [LH 별칭]
  for (const a of K.home_identity_alias) {
    if (a.match_rule === 'SOURCE_ANCHOR') anchors.set(a.project_id, a);
    else if (a.match_rule === 'REGION_DISTRICT_BLOCK' && lhPlan.has(a.source_entity_id)) (lhAlias.get(a.project_id) || lhAlias.set(a.project_id, []).get(a.project_id)).push(a);
  }
  const lhByKey = new Map(lhSgg.map((m) => [`${m.district}|${m.block}`, m]));
  /* LH 블록 위치점(지구 코드 앞 5자리 = 시군구) — 블록 키별, 지구별 */
  const zoneByBlock = new Map(), zoneByTerm = new Map();
  for (const r of K.block_location) {
    const p = r.payload, k = blockKey({ source_id: 'lh_construction', region: p.region, district: p.district_name, block: p.block, name: '' }), code = String(p.zonecode ?? '').slice(0, 5);
    if (!k || !/^\d{5}$/.test(code)) continue;
    (zoneByBlock.get(keyText(k)) || zoneByBlock.set(keyText(k), new Set()).get(keyText(k))).add(code);
    const tk = `${k.region}|${k.term}`;
    (zoneByTerm.get(tk) || zoneByTerm.set(tk, new Set()).get(tk)).add(code);
  }
  /* 지구 이름 → 시군구(HOME municipality 의 district_names) */
  const muniByDistrict = new Map();
  for (const r of K.municipality) for (const d of r.payload.district_names ?? []) {
    const t = d.replace(/\s+/g, '').replace(/(?:공공주택지구|택지개발사업|택지개발지구|지구)+$/, '');
    if ((r.payload.admin_codes ?? []).length === 1) (muniByDistrict.get(`${r.payload.region}|${t}`) || muniByDistrict.set(`${r.payload.region}|${t}`, new Set()).get(`${r.payload.region}|${t}`)).add(r.payload.admin_codes[0]);
  }
  const location = new Map(K.project_location.map((r) => [r.payload.project_id, r.payload]));
  /* 지구 이름 → 시군구: LH 준공예정 매핑의 지구(정규화) 중 시군구가 하나인 것 */
  const lhByTerm = new Map();
  for (const e of lhSgg) {
    const k = e.sgg_code && blockKey({ source_id: 'lh_construction', region: SIDO_NAME[e.sgg_code.slice(0, 2)] ?? null, district: e.district, block: 'A1', name: '' });
    if (k?.region) (lhByTerm.get(`${k.region}|${k.term}`) || lhByTerm.set(`${k.region}|${k.term}`, new Set()).get(`${k.region}|${k.term}`)).add(e.sgg_code);
  }

  /* HOME 사업 하나(HPR) = 원천 사업후보 하나(PRO). 순서는 원천 사업후보(PRO) 순 — 재매칭으로 HPR_ 가 바뀌어도 묶음의 대표·행 순서가 그대로이게 */
  const members = [];
  for (const h of K.home_project) {
    const a = anchors.get(h.id), p = a && pro.get(a.source_entity_id);
    if (!p) { report.noAnchor = (report.noAnchor ?? 0) + 1; continue; }
    members.push({ hpr: h.id, hprName: h.name, pro: p.id, p, lh: (lhAlias.get(h.id) ?? []).map((x) => ({ alias: x, id: x.source_entity_id, row: lhPlan.get(x.source_entity_id) })).sort((x, y) => byStr(x.id, y.id)), key: blockKey(p) });
  }
  members.sort((a, b) => byStr(a.pro, b.pro));
  /* 같은 (시도, 지구, 블록) = 한 사업 */
  const groupsByKey = new Map(), groups = [];
  for (const m of members) {
    const k = m.key && keyText(m.key);
    if (k && groupsByKey.has(k)) { groupsByKey.get(k).members.push(m); continue; }
    const g = { members: [m] };
    groups.push(g);
    if (k) groupsByKey.set(k, g);
  }
  report.merged = groups.filter((g) => g.members.length > 1).length;

  /* 시군구·법정동 */
  const out = [], unresolved = [];
  for (const g of groups) {
    const sido = Object.entries(SIDO_NAME).find(([, n]) => n === g.members[0].p.region)?.[0];
    const cands = [], bjds = new Set();
    for (const m of g.members) for (const l of m.lh) { const e = lhByKey.get(`${l.row.district}|${l.row.block}`); if (e?.sgg_code) cands.push({ code: e.sgg_code, method: 'LH_BLOCK_SGG' }); if (e?.bjd_code) bjds.add(e.bjd_code); }
    for (const m of g.members) if (m.key) for (const c of zoneByBlock.get(keyText(m.key)) ?? []) cands.push({ code: c, method: 'LH_ZONECODE' });
    for (const m of g.members) for (const a of [m.p.address, location.get(m.pro)?.address_query, location.get(m.pro)?.address_original, ...m.lh.map((l) => l.row.address)]) {
      const at = a ? addressArea(a, idx) : null;
      if (at) { cands.push({ code: at.sgg, method: 'ADDRESS' }); if (at.bjd) bjds.add(at.bjd); }
    }
    for (const m of g.members) for (const muni of [m.p.municipality, location.get(m.pro)?.municipality]) { const c = muniSgg(m.p.region, muni, idx); if (c) cands.push({ code: c, method: 'MUNICIPALITY' }); }
    for (const m of g.members) if (m.key) {
      for (const [map, method] of [[zoneByTerm, 'DISTRICT_ZONECODE'], [lhByTerm, 'DISTRICT_LH'], [muniByDistrict, 'DISTRICT_MUNICIPALITY']]) {
        const set = map.get(`${m.key.region}|${m.key.term}`);
        if (set?.size === 1) cands.push({ code: [...set][0], method });
      }
    }
    for (const m of g.members) for (const c of nameSgg(m.p, idx)) cands.push(c);
    const pick = sido ? pickSgg(cands, sido, idx) : null;
    if (!pick) { unresolved.push({ ...g, sido }); continue; }
    g.sgg = pick.code; g.sggMethod = pick.method; g.sggConflict = pick.conflict;
    /* 시 단위 코드인데 법정동이 모두 한 구에 있으면 그 구로 좁힌다 */
    const inCity = [...bjds].filter((b) => b.slice(0, 5) === g.sgg || (g.sgg.endsWith('0') && b.slice(0, 4) === g.sgg.slice(0, 4)));
    const gus = new Set(inCity.map((b) => b.slice(0, 5)));
    if (g.sgg.endsWith('0') && gus.size === 1 && !gus.has(g.sgg) && idx.sggByCode.has([...gus][0])) { g.sgg = [...gus][0]; g.sggMethod += '+BJD'; }
    g.bjds = inCity.filter((b) => b.startsWith(g.sgg)).sort();
    out.push(g);
  }
  /* 대표 원천 행(HOME inventory 규칙 그대로): 복수 현장 계약·블록 키 없는 건설공사 계약은 대표가 되지 못한다. 같은 블록에 공급계획이 하나면 그것,
     계획 없이 한 행이면 그 행. 계획이 둘 이상이거나 계획 없이 여러 행이면(HOME 은 묶음째 집계에서 뺀다) 남는 행 중 원천 사업후보 순 첫 행.
     대표가 될 행이 없는 묶음은 같은 시군구·같은 현장(siteKey)·같은 계획 호수의 사업이 하나뿐이면 그 사업에 별칭으로 합친다(absorbed — 옛 id 는 대표 id 로 넘어간다) */
  const rowOf = (m) => ({ ...m.p, id: m.pro, source_id: src(m.p.source_id) });
  const winners = new Set(inventory(members.map(rowOf)).chosen.map((r) => r.id));
  const lone = (g) => g.members.every((m) => inventoryDropped(rowOf(m)));
  const sameSite = (x, y) => Number.isInteger(x.p.planned_units) && x.p.planned_units > 0 && x.p.planned_units === y.p.planned_units && siteKey(x.p) !== null && siteKey(x.p) === siteKey(y.p);
  const absorbedInto = new Map();
  for (const g of out.filter(lone)) {
    const targets = out.filter((h) => h !== g && h.sgg === g.sgg && !lone(h) && h.members.some((y) => !inventoryDropped(rowOf(y)) && g.members.some((x) => sameSite(x, y))));
    if (targets.length !== 1) continue;
    const h = targets[0];
    h.members.push(...g.members);
    h.absorbed = [...(h.absorbed ?? []), ...g.members];
    h.bjds = [...new Set([...h.bjds, ...g.bjds.filter((b) => b.startsWith(h.sgg))])].sort();
    absorbedInto.set(g, h);
  }
  out.splice(0, out.length, ...out.filter((g) => !absorbedInto.has(g)));
  report.inventory = { dropped: members.filter((m) => inventoryDropped(rowOf(m))).length, absorbed: absorbedInto.size, lone: out.filter(lone).length, ambiguous: 0 };
  for (const g of [...out, ...unresolved]) {
    for (const m of g.members) m.dropped = inventoryDropped(rowOf(m));
    const live = g.members.filter((m) => !m.dropped);
    const won = g.members.find((m) => winners.has(m.pro));
    g.main = won ?? live[0] ?? g.members[0];
    g.lone = !live.length;
    if (live.length && !won) report.inventory.ambiguous++;
    g.keys = groupKeys(g);
  }
  report.groups = out.length;
  report.sggUnresolved = unresolved.length;
  report.sggUnresolvedProjects = unresolved.reduce((n, g) => n + g.members.length, 0);
  report.sggConflict = out.filter((g) => g.sggConflict).length;
  report.bySggMethod = {};
  for (const g of out) report.bySggMethod[g.sggMethod] = (report.bySggMethod[g.sggMethod] ?? 0) + 1;
  return { edition, asOf, refs, groups: out, unresolved, kinds: K, idx, home, report };
}
/* 묶음의 id 키(종류 순 HPR·PRO·LH·BLK, 종류 안은 원천 사업후보 순). BLK 는 시군구가 정해진 묶음만 */
function groupKeys(g) {
  const keys = [];
  for (const m of g.members) keys.push(`HPR:${m.hpr}`);
  for (const m of g.members) keys.push(`PRO:${m.pro}`);
  for (const m of g.members) for (const l of m.lh) keys.push(`LH:${l.id}`);
  if (g.sgg) for (const k of new Set(g.members.filter((m) => m.key).map((m) => `BLK:${g.sgg}|${m.key.term}|${m.key.block}`))) keys.push(k);
  g.absorbedKeys = new Set((g.absorbed ?? []).flatMap((m) => [`HPR:${m.hpr}`, `PRO:${m.pro}`, ...m.lh.map((l) => `LH:${l.id}`)]));
  return keys;
}

/* ---------- id ---------- */
const serialOf = (id) => { const m = /^PRJ-(\d{5})-(\d{4})$/.exec(id ?? ''); return m ? { sgg: m[1], n: +m[2] } : null; };
/* 묶음 → PRJ id. homeIds: 누적 매핑(키 → id), counters: 레지스트리 카운터, taken: 이미 쓰인 id 들(이번 표의 다른 사업·건축HUB 후보 매핑 — 일련을 다시 쓰지 않으려고).
   돌려주는 것: { ids: Map(묶음 → id), fresh(새 id 수), conflicts(한 묶음의 키가 서로 다른 id 를 가리킨 수) } */
function assignHomeIds(groups, { homeIds = {}, counters = {}, taken = [] } = {}) {
  const ids = new Map(), used = new Set();
  const proKey = (g) => g.keys.find((k) => k.startsWith('PRO:'));
  const order = [...groups].sort((a, b) => byStr(a.sgg, b.sgg) || byStr(proKey(a), proKey(b)));
  let conflicts = 0;
  for (const type of KEY_ORDER) {
    for (const g of order) {
      if (ids.has(g)) continue;
      const ids_ = (keys) => [...new Set(keys.filter((k) => k.startsWith(`${type}:`)).map((k) => homeIds[k]).filter(Boolean))].sort();
      const hit = ids_(g.keys);
      if (hit.length > 1) conflicts++;
      /* 합친 사업(absorbed)은 대표 쪽 키의 id 를 먼저 — 옛 id 는 대표 id 로 넘어간다(scripts/issue-projects.js --home 이 supersededBy) */
      const id = [...ids_(g.keys.filter((k) => !g.absorbedKeys?.has(k))), ...hit].find((x) => !used.has(x) && serialOf(x));
      if (id) { ids.set(g, id); used.add(id); }
    }
  }
  const seq = {};
  const bump = (id) => { const s = serialOf(id); if (s) seq[s.sgg] = Math.max(seq[s.sgg] ?? 0, s.n); };
  for (const [sgg, n] of Object.entries(counters)) seq[sgg] = Math.max(seq[sgg] ?? 0, n);
  for (const id of [...Object.values(homeIds), ...taken]) bump(id);
  let fresh = 0;
  for (const g of order) {
    if (ids.has(g)) continue;
    const n = (seq[g.sgg] ?? 0) + 1;
    if (n > 9999) throw new Error(`시군구 ${g.sgg} 의 일련이 9999 를 넘는다`);
    seq[g.sgg] = n; ids.set(g, `PRJ-${g.sgg}-${String(n).padStart(4, '0')}`); fresh++;
  }
  return { ids, fresh, conflicts };
}
/* 매핑 파일: 이전 매핑에 이번 묶음의 키를 더한다(있는 키는 바꾸지 않는다 — 다른 사업에 합친 행(absorbed)의 키만 대표 id 로 다시 가리킨다). 키 순, 한 항목 한 줄 */
function mergeHomeIds(prev, groups, ids) {
  const out = { ...prev };
  for (const g of groups) for (const k of g.keys) { if (g.absorbedKeys?.has(k)) out[k] = ids.get(g); else out[k] ??= ids.get(g); }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}
const renderHomeIds = (ids) => `{\n${Object.entries(ids).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;

/* ---------- 원장 행 ---------- */
const EVENT = { complex_id: null, event_date: null, event_month: null, event_year: null, progress_pct: null, event_detail: null, change_reason: null, change_note: null };
const agencyOf = (dev) => AGENCY.find(([re]) => re.test(String(dev ?? '').trim()))?.[1] ?? null;
/* 사업 이름: 원천 이름. 대표가 없는 묶음(lone — 복수 현장 계약·블록 키 없는 계약뿐)의 복수 현장 계약이거나 공사 계약 코드형 이름이면 지구+블록 */
const projectName = (p, lone) => ((lone && (p.warnings ?? []).includes('MULTI_SITE_CONTRACT')) || CODE_NAME.test(p.name ?? '') ? siteName(p) ?? trim(p.name, 200) : trim(p.name, 200));
const trim = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null; };

/* build(buildHome) + ids(assignHomeIds) → 원장 표 조각 { projects, identifiers, project_locations, events, units, notices, notice_links, review_required, policies, programs, links, policy_targets, area_facts, sources } 과 report.
   registry: 레지스트리(HOME 발급 사업의 issuedAt, 수도권 대체 사업의 번들 단지 식별자), notices: 이번 표에 이미 있는 공고(공고번호로 중복을 거른다) */
function homeRows(build, ids, { registry, observedMonth, notices = [] }) {
  const { kinds: K, refs, asOf, idx, edition } = build, R = { ...build.report };
  const t = { projects: [], identifiers: [], project_locations: [], events: [], units: [], notices: [], notice_links: [], review_required: [], policies: [], programs: [], links: [], policy_targets: [], area_facts: [], sources: [] };
  const regById = new Map(registry.projects.map((p) => [p.id, p]));
  const pidOfPro = new Map(), pidOfHpr = new Map();
  for (const g of build.groups) for (const m of g.members) { pidOfPro.set(m.pro, ids.get(g)); pidOfHpr.set(m.hpr, ids.get(g)); }
  const dumpNotice = new Map(K.notice.map((r) => [r.entity_id, r.payload]));
  const noticeId = (p) => String(p.source_object_id ?? '').replace(':', '-');

  /* 원천 */
  const own = { source_owner: 'HOME', source_url: null, collected_at: build.home.snapshotAt.replace(' ', 'T'), original_filename: null, license: null, used_by: ['/', '/map'], is_demo: false };
  const note = `HOME PoC 덤프 판 ${edition}(덤프 sha256 ${build.home.manifest.dump_sha256.slice(0, 12)}…, HOME 커밋 ${String(build.home.manifest.source_commit ?? '').slice(0, 12)}) — tools/ledger/home-dump.py · home-source.js.`;
  const addSource = (source_ref, provider, dataset_name, data_as_of, record_count, notes, source_record_key = null) => t.sources.push({ ...own, source_ref, provider, dataset_name, source_record_key, data_as_of, record_count, notes: `${notes} ${note}` });

  /* 사업 */
  const sorted = [...build.groups].sort((a, b) => byStr(ids.get(a), ids.get(b)));
  const projectStage = new Map();
  const bundleOf = new Map();   // HOME id → 대체된 레지스트리 사업의 번들 단지 refs
  const movedPnus = new Map();   // HOME id → 대체된 레지스트리 사업의 필지(번들 단지 위치 — scripts/issue-projects.js --link-pnu)
  for (const p of registry.projects) if (p.supersededBy && HOME_SIDO.includes(p.sgg.slice(0, 2))) {
    for (const r of p.refs) if (r.system === 'bundle') (bundleOf.get(p.supersededBy) || bundleOf.set(p.supersededBy, []).get(p.supersededBy)).push({ r, from: p.id });
    const b = p.refs.find((r) => r.system === 'bundle');
    for (const pnu of p.pnus ?? []) (movedPnus.get(p.supersededBy) || movedPnus.set(p.supersededBy, []).get(p.supersededBy)).push({ pnu, src: b ? `bundle-${b.key}` : 'housing-wave-registry' });
  }
  const areaBlocks = new Set(), lhCodes = new Set();
  R.duplicateAreaBlock = 0;
  for (const g of sorted) {
    const pid = ids.get(g), main = g.main.p, ps = g.members.map((m) => m.p);
    const stage = ps.map((p) => STAGE[p.stage] ?? '02').sort().pop();
    projectStage.set(pid, stage);
    const agencies = [...new Set(ps.map((p) => agencyOf(p.developer)).filter(Boolean))];
    const agency = agencies.length === 1 ? agencies[0] : null;
    const program = ps.map((p) => p.program).find((x) => /공공/.test(x ?? ''));
    const scope = agency ? 'PUBLIC' : program ? 'PUBLIC' : 'UNKNOWN';
    const block = g.members.find((m) => m.key)?.key.block ?? main.block;
    t.projects.push({
      local_project_id: pid, project_name: projectName(main, g.lone) ?? trim(g.main.hprName, 200), project_unit: g.members.some((m) => m.key) ? 'BLOCK' : /^\d+$/.test(String(block ?? '').trim()) ? 'AREA_UNKNOWN' : 'PROJECT',
      sgg_code: g.sgg, agency_id: agency, public_scope: scope,
      public_basis: agency ? `HOME 원천 시행: ${ps.map((p) => p.developer).find((d) => agencyOf(d) === agency)}` : program ? `HOME 프로그램: ${program}` : null,
      stage_code: stage, as_of: ps.map((p) => p.base_date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && d <= asOf).sort().pop() ?? asOf,
      issued_at: regById.get(pid)?.issuedAt ?? null, superseded_by: null, source_ref: refs.main,
    });
    if (scope === 'UNKNOWN') t.review_required.push({ review_type: 'PUBLIC_SCOPE_UNKNOWN', local_project_id: pid, source_ref: refs.main, record_key: g.members.map((m) => m.hpr).join(','), record_name: trim(main.name, 200), detail: `시행 ${ps.map((p) => p.developer).join(' · ')} · 프로그램 ${ps.map((p) => p.program ?? '-').join(' · ')}`, reason: 'HOME 원천에 시행기관이 없고 프로그램 이름으로도 공공 여부를 정하지 못했다' });

    /* 식별자: HPR·PRO(HOME), LH 준공예정 별칭(HOME LH_ + AREA_BLOCK 지구|블록), LH 공사현황 지구·블록 코드, 대체된 레지스트리 사업의 번들 단지 */
    const ident = (id_type, id_value, id_issuer, source_ref, match_status, match_rule) => t.identifiers.push({ local_project_id: pid, id_type, id_value, id_issuer, as_of: asOf, source_ref, match_status, match_rule });
    for (const m of g.members) {
      ident('HOME', m.hpr, 'HOUSING_WAVE', refs.main, 'REVIEW_REQUIRED', m === g.members[0] ? null : g.absorbed?.includes(m) ? 'SAME_SITE_UNITS' : 'SGG_DISTRICT_BLOCK');
      ident('HOME', m.pro, 'HOUSING_WAVE', refs.main, 'REVIEW_REQUIRED', 'SOURCE_ANCHOR');
    }
    for (const m of g.members) for (const l of m.lh) {
      ident('HOME', l.id, 'HOUSING_WAVE', refs.lhPlan, 'REVIEW_REQUIRED', 'REGION_DISTRICT_BLOCK');
      const ab = `${l.row.district}|${l.row.block}`;
      if (areaBlocks.has(ab)) { if (!t.identifiers.some((r) => r.id_type === 'AREA_BLOCK' && r.id_value === ab && r.local_project_id === pid)) R.duplicateAreaBlock++; continue; }
      areaBlocks.add(ab);
      ident('AREA_BLOCK', ab, 'LH', refs.lhPlan, 'REVIEW_REQUIRED', 'REGION_DISTRICT_BLOCK');
    }
    for (const m of g.members) {
      const code = String(m.p.source_object_id ?? '');
      if (!WORK_SOURCES.has(src(m.p.source_id)) || !/^\d+\|\d+$/.test(code) || lhCodes.has(code)) continue;
      lhCodes.add(code);
      ident('LH_AREA_BLOCK_CODE', code, 'LH', refs.main, 'CONFIRMED', null);
    }
    for (const { r, from } of (bundleOf.get(pid) ?? []).sort((a, b) => byStr(a.r.value, b.r.value))) ident('BUNDLE_ID', `${r.key}/${r.value}`, 'HOUSING_WAVE', `bundle-${r.key}`, 'REVIEW_REQUIRED', `REGISTRY_SUPERSEDED_${from.replace(/-/g, '_')}`);

    const moved = (movedPnus.get(pid) ?? []).filter((x) => x.pnu.startsWith(g.sgg)).sort((a, b) => byStr(a.pnu, b.pnu));
    for (const x of moved) t.project_locations.push({ local_project_id: pid, bjd_code: x.pnu.slice(0, 10), pnu: x.pnu, pnu_scope: 'REPRESENTATIVE', source_ref: x.src });
    for (const bjd of g.bjds) if (!moved.some((x) => x.pnu.startsWith(bjd))) t.project_locations.push({ local_project_id: pid, bjd_code: bjd, pnu: null, pnu_scope: null, source_ref: refs.main });

    /* 호수: 묶음의 계획 호수 중 가장 큰 값 하나(겹치는 행을 더하지 않는다). 대표가 될 수 없는 행(복수 현장 계약·블록 키 없는 계약)의 호수는 다른 행에 호수가 없을 때만 */
    const hasUnits = (m) => Number.isInteger(m.p.planned_units) && m.p.planned_units >= 0, all = g.members.filter(hasUnits), pool = all.filter((m) => !m.dropped);
    const withUnits = (pool.length ? pool : all).sort((a, b) => b.p.planned_units - a.p.planned_units || byStr(a.pro, b.pro));
    if (withUnits.length) {
      const u = withUnits[0].p, differs = new Set(all.map((m) => m.p.planned_units)).size > 1;
      t.units.push({ local_project_id: pid, complex_id: null, quantity_type: 'PROJECT_PLAN', housing_type: u.tenure && !/확인/.test(u.tenure) ? u.tenure : null, unit_count: u.planned_units, reference_period: null, unit_scope: 'TOTAL', source_ref: refs.main,
        review_status: differs || (u.warnings ?? []).some((w) => /MULTI_SITE|QUANTITY|CONFLICT/.test(w)) ? 'REVIEW_REQUIRED' : 'CONFIRMED' });
    }
  }

  /* 다른 사업에 합친 HOME 발급 사업(레지스트리 supersededBy — scripts/issue-projects.js --home): 사업 행만 남기고 superseded_by 로 대표를 가리킨다(옛 주소가 대표로 넘어간다) */
  const live = new Set(t.projects.map((p) => p.local_project_id)), absorbedByPro = new Map(sorted.flatMap((g) => (g.absorbed ?? []).map((m) => [m.pro, m.p])));
  R.supersededHome = 0;
  for (const p of registry.projects) {
    if (!p.supersededBy || !live.has(p.supersededBy) || live.has(p.id) || !p.refs.some((r) => r.system === HOME_SYSTEM)) continue;
    const into = t.projects.find((x) => x.local_project_id === p.supersededBy), src_ = absorbedByPro.get(p.refs.find((r) => r.key === 'PRO')?.value);
    t.projects.push({ ...into, local_project_id: p.id, project_name: (src_ && projectName(src_, true)) ?? into.project_name, stage_code: p.stageCode, as_of: p.asOf, issued_at: p.issuedAt ?? null, superseded_by: p.supersededBy });
    R.supersededHome++;
  }
  t.projects.sort((a, b) => byStr(a.local_project_id, b.local_project_id));

  /* 일정 */
  const ev = (pid, e) => t.events.push({ ...EVENT, local_project_id: pid, observed_month: observedMonth, review_status: 'CONFIRMED', ...e });
  for (const g of sorted) {
    const pid = ids.get(g);
    for (const m of g.members) {
      const p = m.p, tag = `HOME ${m.pro}`;
      const at = (v, f = dateParts) => (v == null || v === '' ? null : f(v));
      const sa = at(p.start_actual_date);
      if (sa) ev(pid, { event_type: 'CONSTRUCTION_START', date_type: 'ACTUAL', plan_basis: null, ...sa, event_detail: `${tag} 원천 착공일`, source_ref: refs.main });
      else {
        const sp = at(p.start_plan_date) ?? at(p.start_plan_month) ?? at(p.start_plan_year) ?? (/착공/.test(p.schedule_basis ?? '') ? at(p.schedule_month) : null);
        if (sp) ev(pid, { event_type: 'CONSTRUCTION_START', date_type: 'PLANNED', plan_basis: 'CURRENT', ...sp, event_detail: trim(`${tag} ${p.schedule_basis ?? '원천 착공 예정'}`), source_ref: refs.main });
      }
      const cp = at(p.completion_plan_date) ?? (/공사기간 종료|준공/.test(p.schedule_basis ?? '') ? at(p.schedule_month) : null);
      if (cp) ev(pid, { event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', ...cp, event_detail: trim(`${tag} ${p.schedule_basis ?? '원천 준공 예정'}`), source_ref: refs.main });
      /* 모집·공급 예정: 면적별 행의 공급월(같은 달은 하나), 없으면 공급 예정 범위 글, 없으면 '모집/공급 예정월' 일정 */
      const supply = new Map();
      for (const d of p.rows ?? []) { const x = at(d.supply_raw, periodParts) ?? at(d.supply_month); if (x) supply.set(JSON.stringify(x), { x, units: (supply.get(JSON.stringify(x))?.units ?? 0) + (d.units ?? 0) }); }
      if (!supply.size) { const x = at(p.source_supply_label, periodParts) ?? (/모집|공급 예정/.test(p.schedule_basis ?? '') ? at(p.schedule_month) : null); if (x) supply.set(JSON.stringify(x), { x, units: null }); }
      for (const { x, units } of [...supply.values()].sort((a, b) => byStr(JSON.stringify(a.x), JSON.stringify(b.x)))) ev(pid, { event_type: 'SUPPLY_NOTICE', date_type: 'PLANNED', plan_basis: 'CURRENT', ...x, event_detail: trim(`${tag} 원천 공급계획${units ? ` ${units}세대` : ''}${p.source_supply_label ? ` · ${p.source_supply_label}` : ''}`), source_ref: refs.main });
      /* 입주 예정: 면적별 행의 가장 이른 입주월, 없으면 입주 예정 범위 글 */
      const moveIns = (p.rows ?? []).map((d) => at(d.move_in_raw, periodParts) ?? at(d.move_in_month)).filter(Boolean).sort((a, b) => byStr(JSON.stringify(a), JSON.stringify(b)));
      const mi = moveIns[0] ?? at(p.source_move_in_label, periodParts);
      if (mi) ev(pid, { event_type: 'MOVE_IN', date_type: 'PLANNED', plan_basis: 'CURRENT', ...mi, event_detail: trim(`${tag} 원천 입주 시작 예정${p.source_move_in_label ? ` · ${p.source_move_in_label}` : ''}`), source_ref: refs.main });
      const pd = at(p.progress_date) ?? (WORK_SOURCES.has(src(p.source_id)) ? at(p.base_date) : null);
      if (typeof p.progress_pct === 'number' && p.progress_pct >= 0 && p.progress_pct <= 100 && pd) ev(pid, { event_type: 'PROGRESS', date_type: 'ACTUAL', plan_basis: null, ...pd, progress_pct: p.progress_pct, event_detail: trim(`${tag} 원천 공정률${p.progress_date_basis ? ` · ${p.progress_date_basis}` : ''}`), source_ref: refs.main });
      for (const l of m.lh) { const x = at(l.row.completion_plan_date); if (x) ev(pid, { event_type: 'COMPLETION', date_type: 'PLANNED', plan_basis: 'CURRENT', ...x, event_detail: trim(`HOME ${l.id} LH 준공예정 ${l.row.district} ${l.row.block} ${l.row.tenure ?? ''} ${l.row.units ?? ''}세대 · 별칭 ${l.alias.unit_comparison ?? '-'}`), source_ref: refs.lhPlan, review_status: 'REVIEW_REQUIRED' }); }
    }
  }
  /* 공정 보고(project_report, 지금 사업에 이어진 것만 — current_project_id) */
  R.reports = { rows: K.project_report.length, linked: 0, unlinked: 0 };
  const seenProgress = new Set(t.events.filter((e) => e.event_type === 'PROGRESS').map((e) => `${e.local_project_id}|${e.event_date ?? e.event_month}|${e.progress_pct}`));
  for (const r of [...K.project_report].sort((a, b) => byStr(a.payload.report_date ?? '', b.payload.report_date ?? '') || byStr(a.entity_id, b.entity_id))) {
    const p = r.payload, pid = p.current_project_id && pidOfPro.get(p.current_project_id);
    if (!pid) { R.reports.unlinked++; continue; }
    R.reports.linked++;
    const x = p.date_precision === 'MONTH' ? dateParts(String(p.report_date).slice(0, 7)) : dateParts(p.report_date);
    if (!x || typeof p.progress_pct !== 'number' || p.progress_pct < 0 || p.progress_pct > 100) continue;
    const k = `${pid}|${x.event_date ?? x.event_month}|${p.progress_pct}`;
    if (seenProgress.has(k)) continue;
    seenProgress.add(k);
    ev(pid, { event_type: 'PROGRESS', date_type: 'ACTUAL', plan_basis: null, ...x, progress_pct: p.progress_pct, event_detail: trim(`HOME ${r.entity_id} 공정 보고${p.construction_description ? ` · ${p.construction_description}` : ''}`), source_ref: refs.report });
  }
  /* 건축HUB 허가 후보(stage_evidence APPROVAL 에서 고른 것, 사건일이 있는 것) → 인허가 실제(자동 연결) */
  R.permits = 0;
  for (const r of [...K.stage_evidence].sort((a, b) => byStr(a.entity_id, b.entity_id))) {
    const p = r.payload, s = p.selected, pid = pidOfPro.get(p.project_id), x = s?.event_date && dateParts(s.event_date);
    if (p.stage !== 'APPROVAL' || !pid || !x || s.event_type !== 'PERMIT') continue;
    R.permits++;
    ev(pid, { event_type: 'PERMIT', date_type: 'ACTUAL', plan_basis: null, ...x, event_detail: trim(`HOME ${r.entity_id} ${s.method ?? ''} ${s.source_name ?? ''} · ${s.basis ?? ''}`), source_ref: refs.stage, review_status: 'REVIEW_REQUIRED' });
  }
  /* 청약 공고 연결(collection_link): 본 모집공고 = 모집공고 실제, 공고의 입주 예정월 = 입주 예정 */
  R.noticeLinks = 0;
  const linkSeen = new Set();
  for (const r of [...K.collection_link].sort((a, b) => byStr(a.entity_id, b.entity_id))) {
    const p = r.payload, pid = pidOfPro.get(p.project_id);
    if (!pid) continue;
    for (const l of p.links ?? []) {
      const n = dumpNotice.get(l.source_entity_id), x = dateParts(l.date);
      if (!n || !x) continue;
      const nid = noticeId(n);
      if (p.stage === 'SUPPLY' && l.kind === 'ACTUAL') ev(pid, { event_type: 'SUPPLY_NOTICE', date_type: 'ACTUAL', plan_basis: null, ...x, event_detail: trim(`공고 APPLYHOME ${nid} ${n.name ?? ''} ${n.units ?? ''}세대 · ${l.basis ?? ''}`), source_ref: refs.notice, review_status: 'REVIEW_REQUIRED' });
      else if (p.stage === 'MOVE_IN' && l.kind === 'PLAN') ev(pid, { event_type: 'MOVE_IN', date_type: 'PLANNED', plan_basis: 'CURRENT', ...x, event_detail: trim(`공고 APPLYHOME ${nid} ${n.name ?? ''} · ${l.basis ?? ''}`), source_ref: refs.notice, review_status: 'REVIEW_REQUIRED' });
      else continue;
      if (linkSeen.has(`${nid}|${pid}`)) continue;
      linkSeen.add(`${nid}|${pid}`);
      t.notice_links.push({ notice_system: 'APPLYHOME', notice_id: nid, local_project_id: pid, evidence: trim(`HOME ${r.entity_id} ${p.stage}: ${l.basis ?? ''}(${l.review_status ?? 'REVIEW'})`, 300), review_status: status(l.review_status), source_ref: refs.notice });
      R.noticeLinks++;
    }
  }

  /* 공고: 청약홈(notice)·LH(lh_notice). 이미 표에 있는 공고번호는 거른다. GH 공고(gh_notice)는 notice_system='GH', 공고번호 = 원천 개체 번호(source_object_id) */
  const have = new Set(notices.map((n) => `${n.notice_system}|${n.notice_id}`));
  const addNotice = (row) => { const k = `${row.notice_system}|${row.notice_id}`; if (have.has(k)) return false; have.add(k); t.notices.push(row); return true; };
  R.notices = { applyhome: 0, applyhomeDup: 0, lh: 0, lhDup: 0, gh: 0, ghDup: 0 };
  const dayOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : null);
  for (const r of [...K.notice].sort((a, b) => byStr(noticeId(a.payload), noticeId(b.payload)))) {
    const p = r.payload, a = p.address ? addressArea(p.address, idx) : null, d = p.dates ?? {};
    const ok = addNotice({ notice_system: 'APPLYHOME', notice_id: noticeId(p), notice_title: trim(p.name, 300) ?? noticeId(p), sgg_code: a?.sgg ?? null, pnu: null, announced_on: dayOf(p.source_date), apply_start: dayOf(d['청약 시작일']), apply_end: dayOf(d['청약 종료일']), observed_on: p.base_date, source_ref: refs.notice });
    R.notices[ok ? 'applyhome' : 'applyhomeDup']++;
  }
  for (const r of [...K.lh_notice].sort((a, b) => byStr(a.payload.notice_no, b.payload.notice_no))) {
    const p = r.payload, d = p.dates ?? {};
    const ok = addNotice({ notice_system: 'LH', notice_id: p.notice_no, notice_title: trim(p.name, 300) ?? p.notice_no, sgg_code: null, pnu: null, announced_on: dayOf(p.source_date), apply_start: null, apply_end: dayOf(d['공고 마감일']), observed_on: p.base_date, source_ref: refs.lhNotice });
    R.notices[ok ? 'lh' : 'lhDup']++;
  }
  for (const r of [...K.gh_notice].sort((a, b) => byStr(String(a.payload.source_object_id), String(b.payload.source_object_id)))) {
    const p = r.payload, id = String(p.source_object_id ?? '');
    if (!id) continue;
    const ok = addNotice({ notice_system: 'GH', notice_id: id, notice_title: trim(p.name, 300) ?? id, sgg_code: null, pnu: null, announced_on: dayOf(p.source_date), apply_start: null, apply_end: null, observed_on: p.base_date, source_ref: refs.ghNotice });
    R.notices[ok ? 'gh' : 'ghDup']++;
  }
  /* 연결된 공고가 표에 없으면(청약홈 공고 행이 덤프에 없는 경우) 연결을 뺀다 */
  t.notice_links = t.notice_links.filter((l) => have.has(`${l.notice_system}|${l.notice_id}`));

  /* 시군구 못 정한 HOME 사업 */
  for (const g of build.unresolved) t.review_required.push({ review_type: 'SGG_UNRESOLVED', local_project_id: null, source_ref: refs.main, record_key: g.members.map((m) => m.hpr).join(','), record_name: trim(g.main.p.name, 200),
    detail: trim(`${g.main.p.region ?? '시도 미상'} · 시군구 ${g.members.map((m) => m.p.municipality ?? '-').join('/')} · 지구 ${g.main.p.district ?? '-'} · 블록 ${g.main.p.block ?? '-'} · ${g.members.map((m) => m.pro).join(',')}`, 300),
    reason: 'HOME 사업의 주소·시군구 이름·LH 지구 블록으로 시군구 코드를 정하지 못했다(사업을 만들지 않았다)' });

  /* 정책·프로그램·연결·목표 */
  const policy = new Map(K.policy.map((r) => [r.payload.id, r.payload]));
  for (const [id, p] of [...policy].sort(([a], [b]) => byStr(a, b))) t.policies.push({ local_policy_id: id, policy_name: p.name, announcement_date: dayOf(p.announced_at), scope_region: p.target_scope ?? null, source_ref: refs.policy, review_status: status(p.lifecycle_status) });
  const programs = new Map();
  for (const r of [...K.home_program_mapping].sort((a, b) => byStr(a.id, b.id))) {
    programs.set(r.id, r);
    t.programs.push({ local_program_id: r.id, program_name: r.name, program_definition: null, source_ref: refs.policy, review_status: status(r.status) });
    if (!skipPolicy(r.policy_id) && policy.has(r.policy_id)) t.links.push({ link_type: 'POLICY_PROGRAM', from_local_id: r.policy_id, to_local_id: r.id, evidence: trim(`${r.basis ?? ''} ${r.evidence_url ?? ''}`, 400), review_status: status(r.status), source_ref: refs.policy });
  }
  const plan = K.policy_delivery_plan.map((r) => r.payload).filter((p) => policy.has(p.policy_id));
  for (const p of plan) for (const pr of p.programs ?? []) {
    const id = `${p.policy_id}.${pr.id}`;
    t.programs.push({ local_program_id: id, program_name: pr.name, program_definition: `${policy.get(p.policy_id).name} 공급 계획표의 프로그램(원문 ${p.pdf_page ?? '-'}쪽)`, source_ref: refs.policy, review_status: status(policy.get(p.policy_id).lifecycle_status) });
    t.links.push({ link_type: 'POLICY_PROGRAM', from_local_id: p.policy_id, to_local_id: id, evidence: trim(`공급 계획표 ${p.evidence_url ?? ''} ${p.pdf_page ? `PDF ${p.pdf_page}쪽` : ''}`, 400), review_status: status(policy.get(p.policy_id).lifecycle_status), source_ref: refs.policy });
  }
  /* 사업–프로그램(home_mapping): 정책이 UNASSIGNED·MON_* 이거나 RELEASED 면 넣지 않는다. 합친 사업에 같은 프로그램이 둘이면 한 행(모두 CONFIRMED 일 때만 CONFIRMED) */
  R.mapping = { rows: K.home_mapping.length, skipped: 0, noProject: 0, noProgram: 0 };
  const pp = new Map();
  for (const r of [...K.home_mapping].sort((a, b) => byStr(a.id, b.id))) {
    if (skipPolicy(r.policy_id) || r.status === 'RELEASED') { R.mapping.skipped++; continue; }
    const pid = pidOfPro.get(r.project_id);
    if (!pid) { R.mapping.noProject++; continue; }
    if (!programs.has(r.program_id)) { R.mapping.noProgram++; continue; }
    const k = `${r.program_id}|${pid}`, prev = pp.get(k);
    pp.set(k, { link_type: 'PROGRAM_PROJECT', from_local_id: r.program_id, to_local_id: pid, evidence: trim(`${prev ? `${prev.evidence} / ` : ''}${r.project_id} ${r.policy_id} ${r.basis ?? ''} ${r.evidence_url ?? ''}`, 600), review_status: prev && prev.review_status !== 'CONFIRMED' ? prev.review_status : status(r.status), source_ref: refs.policy });
  }
  t.links.push(...[...pp.values()].sort((a, b) => byStr(a.from_local_id, b.from_local_id) || byStr(a.to_local_id, b.to_local_id)));
  t.policy_targets.push(...policyTargets(policy, plan, refs));

  /* 지역 지표 */
  t.area_facts.push(...areaFacts(K, idx, refs, R));

  /* 원천 행 */
  const cnt = (rows, f) => rows.filter(f).length;
  addSource(refs.main, 'HOME PoC(국토교통부 정책·LH·SH·GH 원천을 모은 팀 자료)', 'HOME 사업(home_project·project·식별 별칭·위치) — 수도권 사업 원장의 정본', asOf, K.home_project.length, '서울·인천·경기 사업. 같은 시도·지구·블록의 HOME 사업은 한 원장 사업으로 합쳤다(tools/ledger/home-source.js).', 'HPR_ · PRO_');
  addSource(refs.lhPlan, '한국토지주택공사(HOME 덤프 경유)', 'LH 공공주택 준공예정현황(15141761) — HOME 지역·지구·블록 별칭(REGION_DISTRICT_BLOCK)', [...new Set(K.lh_completion_plan.map((r) => r.payload.source_date))].sort().pop() ?? null, K.lh_completion_plan.length, '준공 예정일은 실제 준공·입주가 아니다. HOME 사업에 별칭으로 이어진 블록만 일정으로 실었다.', 'LH_');
  addSource(refs.report, '한국토지주택공사(HOME 덤프 경유)', 'LH 공사진행현황·건설공사 현황 보고(project_report)', asOf, K.project_report.length, '지금 HOME 사업에 이어진(current_project_id) 보고만 공정률 이력으로 실었다.', 'PRO_');
  addSource(refs.stage, 'HOME PoC(건축HUB 허가 후보 대조)', 'HOME 단계 근거(stage_evidence) — 인허가 사건일 후보', asOf, cnt(K.stage_evidence, (r) => r.payload.stage === 'APPROVAL'), '자동 대조(EXACT·SIMILAR)로 고른 건축HUB 허가일. 담당자 검토 전.', 'STA_');
  addSource(refs.notice, '한국부동산원 청약홈(HOME 덤프 경유)', '청약홈 분양정보(15098547) 공고 표본과 HOME 공고 연결(collection_link)', [...new Set(K.notice.map((r) => r.payload.base_date))].sort().pop() ?? null, K.notice.length, '공고번호(주택관리번호-공고번호)로 기존 공고와 중복을 걸렀다. 연결은 검토 전(REVIEW).', 'house_manage_no');
  addSource(refs.lhNotice, '한국토지주택공사(HOME 덤프 경유)', 'LH 분양임대공고 목록(HOME lh_notice)', [...new Set(K.lh_notice.map((r) => r.payload.base_date))].sort().pop() ?? null, K.lh_notice.length, '공고번호(PAN_ID)로 기존 LH 공고와 중복을 걸렀다.', 'PAN_ID');
  addSource(refs.ghNotice, '경기주택도시공사(HOME 덤프 경유)', 'GH 공고 목록(HOME gh_notice)', [...new Set(K.gh_notice.map((r) => r.payload.base_date))].sort().pop() ?? null, K.gh_notice.length, '공고번호(source_object_id)로 기존 공고와 중복을 걸렀다. 시군구·접수 기간은 원천에 없어 비웠다.', 'source_object_id');
  addSource(refs.policy, 'HOME PoC(정부 발표 원문)', 'HOME 정책·공급 계획표·프로그램·사업 연결(policy·policy_delivery_plan·home_program_mapping·home_mapping)', asOf, K.policy.length + K.home_program_mapping.length + K.home_mapping.length, '연결은 판마다 통째로 바뀐다(팀원 재매칭). REVIEW → REVIEW_REQUIRED.', 'POL_ · PRG_');
  for (const g of [...new Set(K.area_stat.map((r) => r.payload.metric_group))].sort()) addSource(refs.area(g), 'HOME PoC(KOSIS·SGIS 경유)', `HOME 지역 지표 ${g}`, null, cnt(K.area_stat, (r) => r.payload.metric_group === g), trim(K.area_stat.find((r) => r.payload.metric_group === g).payload.definition, 300), null);
  addSource(refs.unsold, '국토교통부 통계누리(HOME 덤프 경유)', '미분양주택 현황(시군구, 전체·준공 후)', null, K.unsold.length, '월말 미분양 재고 — 공급 실적 아님.', null);
  const used = new Set(Object.entries(t).filter(([k]) => k !== 'sources').flatMap(([, rows]) => rows.map((r) => r.source_ref)));
  t.sources = t.sources.filter((s) => used.has(s.source_ref) || s.source_ref === refs.main);
  return { tables: t, report: R };
}

/* 정책 목표 행: 정책 전체(policy.target_units, 기간은 공급 계획표에 있을 때만), 공급 계획표의 연도별·프로그램별·시도 배분·경기인천 합·입주 전망(관리목표로 채택한 FORECAST_TARGET) */
function policyTargets(policy, plan, refs) {
  const out = [], seen = new Set(), CAP = ['11', '28', '41'];
  const STAGE_OF_METRIC = { CONSTRUCTION: '04', MOVE_IN: '06', SUPPLY: '05', COMPLETION: '06' };
  const sidoOf = (name) => Object.entries(SIDO_NAME).find(([, n]) => n === name)?.[0];
  const push = (r) => { const k = [r.local_policy_id, r.local_program_id, r.stage_code, r.area_codes.join(','), r.period_start, r.period_end].join('|'); if (seen.has(k)) return; seen.add(k); out.push(r); };
  for (const p of plan) {
    const pol = policy.get(p.policy_id), stage = STAGE_OF_METRIC[p.metric] ?? null, rs = status(pol.lifecycle_status);
    const area = (p.geography ?? []).map(sidoOf).filter(Boolean).sort();
    const ev = (extra) => [p.evidence_url, p.pdf_page ? `PDF ${p.pdf_page}쪽` : null, extra].filter(Boolean).join(' · ');
    const row = (local_program_id, area_codes, period_start, period_end, target_units, evidence, stage_code = stage, review_status = rs) => push({ local_policy_id: p.policy_id, local_program_id, stage_code, area_codes, period_start, period_end, target_units, evidence, source_ref: refs.policy, review_status });
    if (Number.isInteger(p.target_units) && area.length) row(null, area, p.period_start, p.period_end, p.target_units, ev(`${pol.metric ?? ''} ${pol.target_scope ?? ''}`.trim()));
    for (const a of p.annual ?? []) {
      if (Number.isInteger(a.units) && area.length) row(null, area, `${a.year}-01-01`, `${a.year}-12-31`, a.units, ev(`${a.year}년`));
      if (Number.isInteger(a.seoul_units)) row(null, ['11'], `${a.year}-01-01`, `${a.year}-12-31`, a.seoul_units, ev(`${a.year}년 서울`));
    }
    for (const pr of p.programs ?? []) {
      const id = `${p.policy_id}.${pr.id}`;
      if (Number.isInteger(pr.target_units) && area.length) row(id, area, p.period_start, p.period_end, pr.target_units, ev(pr.name));
      for (const a of pr.annual ?? []) if (Number.isInteger(a.units) && area.length) row(id, area, `${a.year}-01-01`, `${a.year}-12-31`, a.units, ev(`${pr.name} ${a.year}년`));
    }
    for (const [name, units] of Object.entries(p.region_allocations ?? {})) { const c = sidoOf(name); if (c && Number.isInteger(units)) row(null, [c], p.period_start, p.period_end, units, ev(`${name} 배분`)); }
    if (Number.isInteger(p.joint_region_units)) row(null, area.filter((c) => c !== '11'), p.period_start, p.period_end, p.joint_region_units, ev('경기·인천 합(개별 배분 없음)'));
    const o = p.occupancy_outlook;
    if (o && o.adoption === 'MANAGEMENT_TARGET') for (const a of o.annual ?? []) {
      if (a.role !== 'FORECAST_TARGET') continue;
      const e = [o.evidence_url, o.pdf_page ? `PDF ${o.pdf_page}쪽` : null, `${o.scope ?? ''} 입주 전망 ${a.year}년 · ${o.adoption_basis ?? ''}`].filter(Boolean).join(' · ');
      if (Number.isInteger(a.units)) row(null, CAP, `${a.year}-01-01`, `${a.year}-12-31`, a.units, e, STAGE_OF_METRIC[o.metric] ?? null, 'REVIEW_REQUIRED');
      if (Number.isInteger(a.seoul_units)) row(null, ['11'], `${a.year}-01-01`, `${a.year}-12-31`, a.seoul_units, `${e} · 서울`, STAGE_OF_METRIC[o.metric] ?? null, 'REVIEW_REQUIRED');
    }
  }
  return out;
}

/* 지역 지표: area_stat(묶음 metric_group 마다 원천 행 하나) · unsold. 지역 = 시군구 이름(시도 안) 또는 시도. 지금 코드에 없는 지역(2026-07 개편 전 인천 중구·동구·서구 등)은 싣지 않고 센다 */
function areaFacts(K, idx, refs, R) {
  const out = [], seen = new Set();
  R.areaFacts = { unresolved: 0, unresolvedNames: {} };
  const sidoCode = (name) => Object.entries(SIDO_NAME).find(([, n]) => n === name)?.[0] ?? null;
  const areaOf = (p) => {
    if (p.region_code && (idx.sggByCode.has(p.region_code) || p.region_code === sidoCode(p.region))) return p.region_code;
    return p.municipality ? muniSgg(p.region, p.municipality, idx) : sidoCode(p.region);
  };
  const push = (area_code, metric, breakdown, period, value, unit, definition, source_ref) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const k = [area_code, metric, breakdown, period, source_ref].join('|');
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ area_code, metric, breakdown, period, value, unit, definition, source_ref, review_status: 'CONFIRMED' });
  };
  for (const r of [...K.area_stat].sort((a, b) => byStr(a.entity_id, b.entity_id))) {
    const p = r.payload, area = areaOf(p), g = p.metric_group, s = refs.area(g), def = trim([p.definition, p.unit_basis].filter(Boolean).join(' · '), 300);
    if (!area) { R.areaFacts.unresolved++; const n = `${p.region} ${p.municipality ?? ''}`.trim(); R.areaFacts.unresolvedNames[n] = (R.areaFacts.unresolvedNames[n] ?? 0) + 1; continue; }
    const y = String(p.year);
    if (g === 'sgis_census') {
      push(area, 'population', null, y, p.population, '명', def, s); push(area, 'households', null, y, p.households, '가구', def, s);
      push(area, 'workplace_workers', null, y, p.workplace_workers, '명', def, s); push(area, 'businesses', null, y, p.businesses, '개', def, s);
      for (const [k, v] of Object.entries(p.industry_workers ?? {})) push(area, 'industry_workers', k, y, v, '명', def, s);
    } else if (g === 'kosis_household_size') {
      push(area, 'households', null, y, p.household_total, '가구', def, s);
      for (const [k, v] of Object.entries(p.sizes ?? {})) push(area, 'households_by_size', k, y, v, '가구', def, s);
    } else if (g === 'kosis_employment') {
      const per = `${y}-H${p.half}`;
      push(area, 'employment_rate', null, per, p.employment_rate, '%', def, s); push(area, 'labor_force', null, per, p.labor_force, '명', def, s); push(area, 'resident_employed', null, per, p.resident_employed, '명', def, s);
    } else if (g === 'kosis_age') {
      const per = /^\d{4}-\d{2}$/.test(p.period ?? '') ? p.period : y;
      push(area, 'population', null, per, p.population_total, '명', def, s);
      for (const [k, v] of Object.entries(p.age_bands ?? {})) push(area, 'population_by_age', k, per, v, '명', def, s);
    } else if (g === 'kosis_housing') {
      push(area, 'housing_units', null, y, p.housing_units, '호', def, s); push(area, 'census_housing_units', null, y, p.census_housing_units, '호', def, s);
      push(area, 'households', null, y, p.households, '가구', def, s); push(area, 'population', null, y, p.population, '명', def, s); push(area, 'housing_supply_ratio', null, y, p.official_ratio, '%', def, s);
    } else if (g === 'kosis_household_forecast') push(area, 'forecast_households', null, y, p.forecast_households, '가구', def, s);
    else R.areaFacts[`unknownGroup ${g}`] = (R.areaFacts[`unknownGroup ${g}`] ?? 0) + 1;
  }
  for (const r of [...K.unsold].sort((a, b) => byStr(a.entity_id, b.entity_id))) {
    const p = r.payload, area = areaOf(p);
    if (!area) { R.areaFacts.unresolved++; const n = `${p.region} ${p.municipality ?? ''}`.trim(); R.areaFacts.unresolvedNames[n] = (R.areaFacts.unresolvedNames[n] ?? 0) + 1; continue; }
    push(area, 'unsold', p.metric, p.period, p.units, '호', trim(p.unit_basis, 300), refs.unsold);
  }
  return out;
}

/* ---------- 수도권 교체 ---------- */
/* t(convert 의 표, 고친다): 시도 sidos 의 사업 행과 그 사업의 단지·식별자·위치·이벤트·호수·공고 연결·검토 행을 걷고 home(homeRows 의 tables)을 넣는다.
   레지스트리에서 HOME 사업으로 대체된 사업(supersededBy 가 HOME 묶음 id)은 사업 행만 남기고 superseded_by 를 채운다. 공고(notices) 자체는 남긴다.
   검토 행은 local_project_id 나 record_key(중복 후보 'a|b')가 걷은 사업을 가리키면 걷는다. 비수도권 행은 그대로(순서도) 둔다 */
function replaceSido(t, home, { sidos = HOME_SIDO, registry } = {}) {
  const homeIds = new Set(home.projects.map((p) => p.local_project_id));
  const sup = new Map(registry.projects.filter((p) => p.supersededBy && homeIds.has(p.supersededBy)).map((p) => [p.id, p.supersededBy]));
  const isCap = (p) => sidos.includes(p.sgg_code.slice(0, 2));
  const gone = new Set(t.projects.filter(isCap).map((p) => p.local_project_id));
  const report = { removedProjects: gone.size - [...gone].filter((id) => sup.has(id)).length, superseded: [...gone].filter((id) => sup.has(id)).length, bySource: {} };
  for (const p of t.projects.filter(isCap)) report.bySource[p.source_ref] = (report.bySource[p.source_ref] ?? 0) + 1;
  t.projects = t.projects.filter((p) => !gone.has(p.local_project_id) || sup.has(p.local_project_id)).map((p) => (sup.has(p.local_project_id) ? { ...p, superseded_by: sup.get(p.local_project_id) } : p));
  for (const name of ['complexes', 'identifiers', 'project_locations', 'events', 'units', 'notice_links']) t[name] = t[name].filter((r) => !gone.has(r.local_project_id));
  t.review_required = t.review_required.filter((r) => !gone.has(r.local_project_id) && !String(r.record_key).split('|').some((k) => gone.has(k)));
  for (const [name, rows] of Object.entries(home)) {
    if (!t[name]) throw new Error(`HOME 표 ${name} 이 원장에 없다`);
    t[name].push(...rows);
  }
  return report;
}

/* ---------- 레지스트리 발급(scripts/issue-projects.js --home) ---------- */
/* 원장 표(convert --home --out 의 결과)의 HOME 사업을 레지스트리에 발급·갱신하고, 수도권의 다른 발급 사업을 HOME 사업으로 대체(supersededBy)하거나 숨긴다(hiddenAt).
   대응 규칙(근거 rule): LH_BLOCK — LH 준공예정 매핑(lh-block-sgg.json)이 그 레지스트리 사업에 붙인 지구·블록의 BLK 키가 HOME 매핑에 있음,
     NAME_BLOCK — 사업 이름(통째 또는 첫 낱말을 지구로)에서 읽은 지구·블록의 BLK 키가 HOME 매핑에 있음. 대응이 없으면 숨김(id 는 남겨 /project/<id> 가 안내로 열린다 — 정제 계획 6절 3).
   이번 판에 없는 HOME 발급 사업도 숨긴다. 레지스트리를 바꾸지 않고 { registry, issued, updated, superseded, hidden } 을 돌려준다 */
function issueHome(registry, { tables, homeIds, lhSgg = [], today, edition }) {
  const reg = JSON.parse(JSON.stringify(registry));
  reg.counters ??= {};
  const ref = `${HOME_PREFIX}${edition}`;
  const rows = tables.projects.filter((p) => p.source_ref === ref && !p.superseded_by);
  const by = (list, f) => { const m = new Map(); for (const r of list) { const k = f(r); if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(r); } return m; };
  const idents = by(tables.identifiers.filter((r) => r.id_type === 'HOME' && /^(HPR_|PRO_|LH__)/.test(r.id_value)), (r) => r.local_project_id);
  const locs = by(tables.project_locations, (r) => r.local_project_id), units = by(tables.units.filter((u) => u.unit_scope === 'TOTAL'), (u) => u.local_project_id);
  const byId = new Map(reg.projects.map((p) => [p.id, p]));
  const isHomeEntry = (p) => p.refs.some((r) => r.system === HOME_SYSTEM);
  const out = { issued: [], updated: [], superseded: [], hidden: [] };
  const current = new Set();
  for (const r of rows) {
    current.add(r.local_project_id);
    const refs = (idents.get(r.local_project_id) ?? []).map((x) => ({ system: HOME_SYSTEM, key: x.id_value.slice(0, 3).replace('LH_', 'LH'), value: x.id_value }));
    const fields = { sgg: r.sgg_code, stageCode: r.stage_code, source: { provider: 'HOME PoC(팀 공유 덤프)', dataset: `HOME 사업(home_project) 덤프 ${edition}` }, asOf: r.as_of, name: r.project_name ?? r.local_project_id };
    const bjds = (locs.get(r.local_project_id) ?? []).map((l) => l.bjd_code), u = units.get(r.local_project_id)?.[0]?.unit_count;
    let p = byId.get(r.local_project_id);
    if (!p) {
      p = { id: r.local_project_id, ...fields, bjdCodes: [...new Set(bjds)].sort(), pnus: [], refs, issuedAt: today, ...(Number.isInteger(u) ? { units: u } : {}) };
      reg.projects.push(p); byId.set(p.id, p); out.issued.push(p.id);
    } else {
      const seen = new Set(p.refs.map((x) => `${x.system}|${x.key}|${x.value}`));
      Object.assign(p, fields, { bjdCodes: [...new Set([...(p.bjdCodes ?? []), ...bjds])].sort(), refs: [...p.refs, ...refs.filter((x) => !seen.has(`${x.system}|${x.key}|${x.value}`))] });
      if (Number.isInteger(u)) p.units = u; else delete p.units;
      delete p.hiddenAt; delete p.hiddenReason;
      out.updated.push(p.id);
    }
    const s = serialOf(p.id);
    reg.counters[s.sgg] = Math.max(reg.counters[s.sgg] ?? 0, s.n);
  }
  const hide = (p, reason) => { if (!p.hiddenAt) { p.hiddenAt = today; p.hiddenReason = reason; } out.hidden.push({ id: p.id, name: p.name ?? null, sgg: p.sgg, reason: p.hiddenReason }); };
  /* 이번 판에 없는 HOME 발급 사업: 그 HOME 별칭(HPR·PRO·LH)이 매핑에서 이번 판의 다른 사업 하나를 가리키면(다른 사업에 합쳤다 — buildHome absorbed) 그 사업으로 대체, 아니면 숨긴다 */
  for (const p of reg.projects) {
    if (!isHomeEntry(p) || current.has(p.id)) continue;
    const into = [...new Set(p.refs.filter((r) => r.system === HOME_SYSTEM).map((r) => homeIds[`${r.key}:${r.value}`]).filter((id) => id && id !== p.id && current.has(id)))];
    if (into.length === 1) {
      p.supersededBy = into[0];
      delete p.hiddenAt; delete p.hiddenReason;
      out.superseded.push({ from: p.id, name: p.name ?? null, into: into[0], rule: 'HOME_SAME_SITE', key: p.refs.filter((r) => r.system === HOME_SYSTEM).map((r) => `${r.key}:${r.value}`).join(' ') });
    } else if (!p.supersededBy) hide(p, `HOME 덤프 ${edition} 에 없다`);
  }
  /* 수도권의 다른 발급 사업: HOME 사업으로 대체하거나 숨긴다 */
  const lhOf = by(lhSgg.filter((e) => e.local_project_id), (e) => e.local_project_id);
  for (const p of reg.projects.filter((x) => !isHomeEntry(x) && HOME_SIDO.includes(x.sgg.slice(0, 2)))) {
    const region = SIDO_NAME[p.sgg.slice(0, 2)];
    const cands = [
      ...(lhOf.get(p.id) ?? []).map((e) => ({ rule: 'LH_BLOCK', k: blockKey({ source_id: 'lh_construction', region, district: e.district, block: e.block, name: '' }) })),
      { rule: 'NAME_BLOCK', k: blockKey({ source_id: 'lh_construction', region, district: null, block: null, name: p.name ?? '' }) },
      { rule: 'NAME_BLOCK', k: blockKey({ source_id: 'lh_construction', region, district: String(p.name ?? '').trim().split(/\s+/)[0], block: null, name: p.name ?? '' }) },
    ].filter((c) => c.k).map((c) => ({ ...c, key: `BLK:${p.sgg}|${c.k.term}|${c.k.block}` }));
    const hit = cands.find((c) => homeIds[c.key] && current.has(homeIds[c.key]));
    if (hit) {
      p.supersededBy = homeIds[hit.key];
      delete p.hiddenAt; delete p.hiddenReason;
      /* 옛 사업의 번들 단지 참조와 위치(필지·법정동)는 새 사업으로 넘긴다 — 지도(resolve·permits)가 번들 단지·필지로 사업 id 를 찾는다 */
      const to = byId.get(p.supersededBy), seen = new Set(to.refs.map((x) => `${x.system}|${x.key}|${x.value}`));
      to.refs.push(...p.refs.filter((x) => x.system === 'bundle' && !seen.has(`${x.system}|${x.key}|${x.value}`)));
      to.pnus = [...new Set([...(to.pnus ?? []), ...(p.pnus ?? []).filter((x) => x.startsWith(to.sgg))])].sort();
      to.bjdCodes = [...new Set([...(to.bjdCodes ?? []), ...(p.bjdCodes ?? []).filter((x) => x.startsWith(to.sgg)), ...to.pnus.map((x) => x.slice(0, 10))])].sort();
      out.superseded.push({ from: p.id, name: p.name ?? null, into: p.supersededBy, rule: hit.rule, key: hit.key });
    } else if (p.supersededBy) out.superseded.push({ from: p.id, name: p.name ?? null, into: p.supersededBy, rule: 'KEPT', key: null });
    else hide(p, `HOME 덤프 ${edition} 에 대응 사업이 없다(수도권은 HOME 이 정본 — 데이터-정제-계획 6절 3)`);
  }
  reg.projects.sort((a, b) => byStr(a.id, b.id));
  reg.updatedAt = today;
  return { registry: reg, ...out };
}

module.exports = { HOME_SIDO, HOME_PREFIX, HOME_SYSTEM, STAGE, readHome, latestHomeDir, homeAvailable, refsOf, dateParts, periodParts, blockKey, inventory, inventoryDropped, siteKey, CODE_NAME, addressArea, buildHome, assignHomeIds, mergeHomeIds, renderHomeIds, homeRows, replaceSido, issueHome, serialOf };
