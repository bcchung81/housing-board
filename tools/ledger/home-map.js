'use strict';
/* 수도권(서울 11·인천 28·경기 41) 지도 정적 자료: 시군구마다 사업 행 + 위치 한 파일(data/board/home-map/<시군구>.json).
   계획: docs/product/지도-개선-계획.md 3절·4절 S3·5절 M3. 지도는 수도권 시군구를 열 때 /api/v1/permits·/api/v1/ledger 대신 이 파일 하나를 받는다
   (scripts/build.js 가 public/assets/home-map/ 에 내용 해시 이름으로 복사 → CDN 장기 캐시).
   - 사업 행의 단계·판정·다음 일정·준공 달·호수는 tools/ledger/board.js mapIndexFromLedger 그대로다(지도 색인 ledger-map.json·api.map 과 같은 값 — 판정 규칙은 한 벌).
     더하는 것: label(지도 이름표), agency, moveIn·completion(현재 예정 입주·준공, 입주 경과 표지와 '입주' 칸), noticeUnits(공고 확인 호수), bjd, loc(위치), policy(정책 연결 상태).
   - 공고 확인 호수: 원장 units 의 NOTICE 물량이 있으면 그것, 없으면 실제 모집공고 이벤트(SUPPLY_NOTICE ACTUAL)의 설명 'NNN세대'를 공고 id 마다 한 번 더한다
     (HOME 변환이 공고 세대수를 물량 칸이 아니라 이벤트 설명에 싣는다 — tools/ledger/home-source.js). 없으면 null.
   - 위치(원장 project_locations 에는 좌표 칸이 없어 HOME 판 원본에서 읽는다): 사업마다 가장 구체적인 하나
       block    LH 블록 라벨점(block_location, 블록 키 = home-ids.json 의 BLK 키)
       address  대표 지번 근사(project_location APPROXIMATE_ADDRESS)
       district 지구 대표점(district.project_ids)
       area     시군구 대표점(project_location APPROXIMATE_AREA) — 지도는 그리지 않고 목록에만 둔다
     법정동 대표점은 원본에 좌표가 없어 쓰지 못한다(bjd 코드만 싣는다). 모두 근거 상태 REVIEW(경계·건물 아님).
   - 정책 연결: links PROGRAM_PROJECT(프로그램 → 사업)와 POLICY_PROGRAM(정책 → 프로그램). 하나라도 CONFIRMED 면 CONFIRMED, 아니면 REVIEW_REQUIRED, 연결이 없으면 null.
   순수 함수 homeMapFromLedger 는 파일을 읽거나 쓰지 않는다. 같은 입력 → 같은 바이트(행은 id 순, 좌표는 소수 6자리).
   실행: node tools/ledger/home-map.js [--month YYYY-MM]  → schemas/ledger-<달>/tables + 그 달의 가장 늦은 HOME 판(raw/home/<덤프시각>, 원본 jsonl.gz 필요)
     + mappings/home-ids.json 을 읽어 data/board/home-map/ 을 통째로 다시 쓴다(사업이 없어진 시군구 파일은 지운다). 시험: tests/js/home-map.test.cjs */
const fs = require('node:fs');
const path = require('node:path');

const P = require('./paths');
const { mapIndexFromLedger, loadTables } = require('./board');
const { readHome, latestHomeDir, homeAvailable, blockKey } = require('./home-source');

const HOME_SIDO = ['11', '28', '41'];
const OUT_DIR = 'data/board/home-map';
const SCHEMA = 'home-map/1';
const EXTRA_TABLES = ['links', 'policies'];
const SIDO_CODE = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
const LOC_RANK = { block: 0, address: 1, district: 2, area: 3 };
const LABEL_MAX = 18;
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const isHomeSgg = (sgg) => HOME_SIDO.includes(String(sgg).slice(0, 2));
const monthOf = (e) => (e.event_date ? e.event_date.slice(0, 7) : e.event_month ?? (e.event_year != null ? `${e.event_year}-12` : null));
const plannedText = (e) => e.event_date ?? e.event_month ?? String(e.event_year);

/* HOME 판 원본 → 사업 id 별 위치 후보. homeIds: mappings/home-ids.json(키 → PRJ id). 돌려주는 것: Map(PRJ id → [{ by, at, basis, status, key }]) */
function homeLocations(kinds, homeIds) {
  const out = new Map();
  const put = (id, c) => { if (!id || !Number.isFinite(c.at[0]) || !Number.isFinite(c.at[1])) return; (out.get(id) || out.set(id, []).get(id)).push(c); };
  /* BLK:<시군구>|<지구>|<블록> → 시도·지구·블록으로 찾는다(블록 위치점의 지구 코드는 시 단위일 수 있다 — 41280 고양시 → 사업은 41281 덕양구) */
  const blk = new Map();
  for (const [k, id] of Object.entries(homeIds)) {
    if (!k.startsWith('BLK:')) continue;
    const [sgg, term, block] = k.slice(4).split('|');
    const kk = `${sgg.slice(0, 2)}|${term}|${block}`;
    (blk.get(kk) || blk.set(kk, new Set()).get(kk)).add(id);
  }
  for (const r of kinds.block_location ?? []) {
    const p = r.payload, k = blockKey({ source_id: 'lh_construction', region: p.region, district: p.district_name, block: p.block, name: '' });
    const ids = k && blk.get(`${SIDO_CODE[p.region]}|${k.term}|${k.block}`);
    for (const id of ids ?? []) put(id, { by: 'block', at: [r6(p.longitude), r6(p.latitude)], basis: p.coordinate_basis ?? null, status: p.status ?? 'REVIEW', key: r.entity_id });
  }
  for (const r of kinds.project_location ?? []) {
    const p = r.payload, by = p.coordinate_basis === 'APPROXIMATE_ADDRESS' ? 'address' : p.coordinate_basis === 'APPROXIMATE_AREA' ? 'area' : null;
    if (by) put(homeIds[`PRO:${p.project_id}`], { by, at: [r6(p.longitude), r6(p.latitude)], basis: p.coordinate_basis, status: p.status ?? 'REVIEW', key: r.entity_id });
  }
  for (const r of kinds.district ?? []) {
    const p = r.payload;
    for (const pid of p.project_ids ?? []) put(homeIds[`PRO:${pid}`] ?? homeIds[`HPR:${pid}`], { by: 'district', at: [r6(p.longitude), r6(p.latitude)], basis: 'DISTRICT_REPRESENTATIVE_POINT', status: p.link_status ?? 'REVIEW', key: r.entity_id });
  }
  /* 사업마다 가장 구체적인 하나(같은 종류면 원천 행 id 순 첫 것) */
  const best = new Map();
  for (const [id, cs] of out) {
    const c = [...cs].sort((a, b) => LOC_RANK[a.by] - LOC_RANK[b.by] || byStr(a.key, b.key))[0];
    best.set(id, { by: c.by, at: c.at, basis: c.basis, status: c.status === 'CONFIRMED' ? 'CONFIRMED' : 'REVIEW' });
  }
  return best;
}

/* 지도 이름표: 블록 사업은 '지구 블록'(BLK 키), 아니면 사업 이름(길면 줄임) */
function labelsOf(homeIds) {
  const m = new Map();
  for (const k of Object.keys(homeIds).sort()) {
    if (!k.startsWith('BLK:')) continue;
    const [, term, block] = k.slice(4).split('|');
    if (!m.has(homeIds[k])) m.set(homeIds[k], `${term} ${block}`);
  }
  return m;
}
const shortName = (s) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1)}…` : t; };

/* 공고 확인 호수: NOTICE 물량(TOTAL 이 있으면 TOTAL, 아니면 SUBTYPE 합) → 없으면 실제 모집공고 이벤트 설명의 세대수(공고 id 마다 한 번) */
function noticeUnitsOf(tables) {
  const units = new Map(), ev = new Map();
  for (const u of tables.units) if (u.quantity_type === 'NOTICE') (units.get(u.local_project_id) || units.set(u.local_project_id, []).get(u.local_project_id)).push(u);
  for (const e of tables.events) {
    if (e.event_type !== 'SUPPLY_NOTICE' || e.date_type !== 'ACTUAL') continue;
    const n = /(\d[\d,]*)\s*세대/.exec(e.event_detail ?? ''), id = /(?:APPLYHOME|LH|MYHOME)\s+(\S+)/.exec(e.event_detail ?? '')?.[1] ?? `${e.source_ref}|${e.event_date ?? e.event_month}`;
    if (!n) continue;
    const m = ev.get(e.local_project_id) || ev.set(e.local_project_id, new Map()).get(e.local_project_id);
    if (!m.has(id)) m.set(id, Number(n[1].replace(/,/g, '')));
  }
  return (pid) => {
    const rows = units.get(pid);
    if (rows) { const t = rows.filter((r) => r.unit_scope === 'TOTAL'); return (t.length ? t : rows).reduce((s, r) => s + r.unit_count, 0); }
    const m = ev.get(pid);
    return m ? [...m.values()].reduce((s, n) => s + n, 0) : null;
  };
}

/* 종류별 현재 예정 하나 — 입주·준공 칸에 적는 값. 원천 순위는 board.js SOURCE_RANK 와 같다(그 파일은 내보내지 않아 옮겨 적는다,
   시험이 board.js 의 다음 일정과 맞는지 본다). 순위가 같으면 원천 이름 순 → 날짜 순 첫 것 */
const SOURCE_RANK = {
  MOVE_IN: ['datagokr-15111714', 'datagokr-15057999', 'datagokr-15098547', /^home-dump-.+-notice$/, /^home-dump-[^-]+$/],
  COMPLETION: [/^home-dump-[^-]+$/, /^home-dump-.+-lh-plan$/],
};
const rankOf = (e) => { const i = SOURCE_RANK[e.event_type].findIndex((x) => (typeof x === 'string' ? x === e.source_ref : x.test(e.source_ref))); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
function currentPlan(tables, type) {
  const m = new Map();
  const evs = tables.events.filter((e) => e.event_type === type && e.date_type === 'PLANNED' && e.plan_basis === 'CURRENT' && monthOf(e))
    .sort((a, b) => rankOf(a) - rankOf(b) || byStr(a.source_ref, b.source_ref) || byStr(plannedText(a), plannedText(b)));
  for (const e of evs) if (!m.has(e.local_project_id)) m.set(e.local_project_id, plannedText(e));
  return m;
}

/* 정책 연결: 사업 → { status, names(정책 이름, 이름 순) } */
function policyOf(tables) {
  const polName = new Map((tables.policies ?? []).map((p) => [p.local_policy_id, p.policy_name]));
  const prgPol = new Map();
  for (const l of tables.links ?? []) if (l.link_type === 'POLICY_PROGRAM') (prgPol.get(l.to_local_id) || prgPol.set(l.to_local_id, new Set()).get(l.to_local_id)).add(l.from_local_id);
  const out = new Map();
  for (const l of tables.links ?? []) {
    if (l.link_type !== 'PROGRAM_PROJECT') continue;
    const x = out.get(l.to_local_id) || out.set(l.to_local_id, { confirmed: false, names: new Set() }).get(l.to_local_id);
    if (l.review_status === 'CONFIRMED') x.confirmed = true;
    for (const pol of prgPol.get(l.from_local_id) ?? []) if (polName.has(pol)) x.names.add(polName.get(pol));
  }
  return (pid) => { const x = out.get(pid); return x ? { status: x.confirmed ? 'CONFIRMED' : 'REVIEW_REQUIRED', names: [...x.names].sort() } : null; };
}

/* tables: 원장 표(board.js NEEDED + links·policies), locations: homeLocations 결과, homeIds: 대응표.
   돌려주는 것: { 시군구: 파일 객체 } (수도권 시군구만, 사업이 있는 시군구만) */
function homeMapFromLedger(tables, { referenceDate, observedMonth, edition = null, locations = new Map(), homeIds = {} } = {}) {
  const index = mapIndexFromLedger(tables, { referenceDate, observedMonth });
  const project = new Map(tables.projects.map((p) => [p.local_project_id, p]));
  const bjds = new Map();
  for (const l of [...tables.project_locations].sort((a, b) => byStr(a.bjd_code ?? '', b.bjd_code ?? ''))) if (l.bjd_code && !bjds.has(l.local_project_id)) bjds.set(l.local_project_id, l.bjd_code);
  const labels = labelsOf(homeIds), notice = noticeUnitsOf(tables), policy = policyOf(tables);
  const moveIn = currentPlan(tables, 'MOVE_IN'), completion = currentPlan(tables, 'COMPLETION');
  const out = {};
  for (const sgg of Object.keys(index.bySgg).filter(isHomeSgg).sort()) {
    const projects = index.bySgg[sgg].map((r) => {
      const p = project.get(r.id);
      return {
        ...r, label: labels.get(r.id) ?? shortName(r.name), agency: p?.agency_id ?? null,
        moveIn: moveIn.get(r.id) ?? null, completion: completion.get(r.id) ?? null, noticeUnits: notice(r.id),
        bjd: bjds.get(r.id) ?? null, loc: locations.get(r.id) ?? null, policy: policy(r.id),
      };
    });
    out[sgg] = { schema: SCHEMA, sgg, observedMonth: index.observedMonth, referenceDate: index.referenceDate, edition, projects };
  }
  return out;
}

/* 파일 글: 머리 칸 한 줄씩, 사업 한 줄씩(diff 가 사업 단위로 보이게) */
function renderHomeMap(doc) {
  const head = Object.entries(doc).filter(([k]) => k !== 'projects').map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return `{\n${head.join('\n')}\n  "projects": [\n${doc.projects.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
}

module.exports = { HOME_SIDO, OUT_DIR, SCHEMA, isHomeSgg, homeLocations, homeMapFromLedger, renderHomeMap };

if (require.main === module) {
  const i = process.argv.indexOf('--month'), month = i > 0 ? process.argv[i + 1] : P.latestMonth();
  const dir = P.ledgerDir(month), tablesDir = path.join(dir, 'tables');
  const tables = { ...loadTables(tablesDir), ...Object.fromEntries(EXTRA_TABLES.map((t) => [t, JSON.parse(fs.readFileSync(path.join(tablesDir, `${t}.json`), 'utf8')).rows])) };
  const homeDir = latestHomeDir(dir);
  if (!homeAvailable(homeDir)) throw new Error(`HOME 판 원본(jsonl.gz)이 없다: ${homeDir ?? `${dir}/raw/home`} — raw-store.js 로 받아 온 뒤 다시 실행`);
  const home = readHome(homeDir);
  const homeIds = JSON.parse(fs.readFileSync(path.join(dir, 'mappings/home-ids.json'), 'utf8'));
  const docs = homeMapFromLedger(tables, { referenceDate: P.referenceDateOf(dir), observedMonth: month, edition: home.edition, locations: homeLocations(home.kinds, homeIds), homeIds });
  const out = path.join(P.ROOT, OUT_DIR);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^\d{5}\.json$/.test(f) && !docs[f.slice(0, 5)]) fs.rmSync(path.join(out, f));
  let bytes = 0;
  const by = {};
  for (const [sgg, doc] of Object.entries(docs)) {
    const text = renderHomeMap(doc);
    fs.writeFileSync(path.join(out, `${sgg}.json`), text);
    bytes += Buffer.byteLength(text);
    for (const r of doc.projects) { const k = r.loc ? r.loc.by : 'none'; by[k] = (by[k] ?? 0) + 1; }
  }
  const n = Object.values(docs).reduce((s, d) => s + d.projects.length, 0);
  console.log(`${OUT_DIR}/ 를 썼다 (시군구 ${Object.keys(docs).length} · 사업 ${n} · ${bytes} 바이트, HOME 판 ${home.edition})`);
  console.log(`위치: ${Object.entries(by).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}`);
}
