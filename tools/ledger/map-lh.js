'use strict';
/* LH 공공주택 준공예정현황(data/board/lh-completion.json)의 지구·블록 묶음마다 시군구(와 가능하면 법정동) 코드를 붙인다.
   위치 글자의 앞부분을 법정동코드 파일의 SGG 전체 이름과 정확히 대조하는 것이 바탕이고, 이름이 안 맞는 몇 가지(세종·옛 시도 이름·개편된 구)만 규칙으로 잇는다.
   mapLhBlocks 는 순수 함수다: 파일을 읽거나 쓰지 않고 네트워크도 부르지 않는다. 규칙으로 못 찾은 것(UNRESOLVED)만 CLI 의 --api 가 행정표준코드 이름 검색으로 채운다.
   결과(변환기 convert.js 의 lhSgg 입력): schemas/ledger-2026-10/mappings/lh-block-sgg.json
   실행: node tools/ledger/map-lh.js [--api]  → 파일을 쓰고 method 별 개수를 출력한다. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'schemas/ledger-2026-10/mappings/lh-block-sgg.json');
const LEGAL_DONG_FILE = path.join(ROOT, 'schemas/ledger-2026-10/raw/legal-dong/국토교통부_법정동코드_20260929.csv');

const SEJONG = { code: '36110', name: '세종특별자치시' };
/* 2026-07 광주·전남 통합으로 옛 이름이 폐지됐다 */
const MERGED_SIDO = { 광주광역시: '전남광주통합특별시', 전라남도: '전남광주통합특별시' };
/* 이름만 바뀐 시도 */
const RENAMED_SIDO = { 강원도: '강원특별자치도', 전라북도: '전북특별자치도', 제주도: '제주특별자치도' };
const GYEYANG_KEY = 'incheon-gyeyang';

const byKey = (a, b) => (a.district < b.district ? -1 : a.district > b.district ? 1 : a.block < b.block ? -1 : a.block > b.block ? 1 : 0);

/* 위치 글자 → { tokens(시도 이름을 바꾼 것), method, oldSido? } */
function normalize(location) {
  const t = String(location ?? '').trim().split(/\s+/);
  if (t[0] === SEJONG.name) return { tokens: t, method: 'RULE_SEJONG' };
  if (MERGED_SIDO[t[0]]) return { tokens: [MERGED_SIDO[t[0]], ...t.slice(1)], method: 'RULE_MERGED_SIDO', oldSido: t[0] };
  if (RENAMED_SIDO[t[0]]) return { tokens: [RENAMED_SIDO[t[0]], ...t.slice(1)], method: 'RULE_RENAMED_SIDO', oldSido: t[0] };
  return { tokens: t, method: 'NAME' };
}

/* 시군구 이름 후보: '시도 시 일반구'(시 다음 토큰이 구로 끝날 때)를 먼저, 그다음 '시도 시군구' */
function sggCandidates(tokens) {
  const out = [];
  if (tokens.length >= 3 && tokens[1].endsWith('시') && tokens[2].endsWith('구')) out.push({ name: tokens.slice(0, 3).join(' '), used: 3 });
  if (tokens.length >= 2) out.push({ name: tokens.slice(0, 2).join(' '), used: 2 });
  return out;
}

/* 계양 지구·블록 → 레지스트리의 번들 단지 참조(techno-A2 …) 사업 id */
function gyeyangProject(item, registry) {
  if (!item.district.startsWith('인천계양')) return null;
  return registry.projects.find((p) => p.refs.some((r) => r.system === 'bundle' && r.key === GYEYANG_KEY && r.value === `techno-${item.block}`))?.id ?? null;
}

/* 법정동코드 존재 행의 이름 색인: 시군구·법정동 전체 이름 → 행·코드, 시도 이름들, 개편된 구 찾기용 dongIndex */
function nameIndex(areaRows) {
  const sggByName = new Map(areaRows.filter((r) => r.level === 'SGG').map((r) => [r.area_name, r]));
  const bjdByName = new Map();
  for (const r of areaRows) if (r.level === 'BJD') bjdByName.set(r.area_name, bjdByName.has(r.area_name) ? null : r.area_code);   // 이름이 겹치면 못 쓴다
  /* 개편된 구 찾기용: '시도|동' → { 시군구 코드 → 법정동 코드 }. 법정동 이름이 '<시군구 전체 이름> <동>' 꼴(리 없는 동·읍·면)인 존재 행만 모은다 */
  const sggByCode = new Map(areaRows.filter((r) => r.level === 'SGG').map((r) => [r.area_code, r]));
  const sidoNames = new Set([...sggByCode.values()].map((r) => r.area_name.split(' ')[0]));
  const dongIndex = new Map();
  for (const r of areaRows) {
    const sgg = r.level === 'BJD' ? sggByCode.get(r.area_code.slice(0, 5)) : null;
    if (!sgg || !r.area_name.startsWith(`${sgg.area_name} `)) continue;
    const dong = r.area_name.slice(sgg.area_name.length + 1);
    if (dong.includes(' ')) continue;
    const key = `${sgg.area_name.split(' ')[0]}|${dong}`;
    if (!dongIndex.has(key)) dongIndex.set(key, new Map());
    dongIndex.get(key).set(sgg.area_code, dongIndex.get(key).has(sgg.area_code) ? null : r.area_code);   // 같은 구에 같은 이름이 둘이면 못 쓴다
  }
  return { sggByName, bjdByName, sggByCode, sidoNames, dongIndex };
}

/* 지번 주소('시도 시군구 [일반구] 읍면동 [리] [산 ]본번[-부번]', 한국부동산원 입주예정물량 등) → { sgg, bjd, pnu } 또는 { error: SGG·BJD·LOT }.
   시도 이름은 normalize(통합·개명)로 바꾸고, 세종은 시군구 없이 읽는다. 시군구 이름이 없으면 개편된 구(동 이름이 맞는 새 구가 하나)로 잇는다(mapLhBlocks 와 같은 규칙).
   법정동은 '<시군구 전체 이름> <나머지>' 가 정확히 맞아야 한다(행정동 이름은 맞지 않는다). 산은 대지구분 1(PNU 11번째 자리 2), 본번 0 은 필지가 아니다(LOT) */
function jibunToPnu(address, idx) {
  const { makePnu } = require('../../lib/permits.js');
  const m = /^(.*?)\s+(산\s*)?(\d+)(?:-(\d+))?$/.exec(String(address ?? '').replace(/\s*\([^()]*\)\s*$/, '').trim());   // 끝의 괄호 설명('(당수지구 C3BL)')은 뗀다
  if (!m) return { error: 'LOT' };
  const n = normalize(m[1]), t = n.tokens;
  let sgg = null, bjd = null;
  const cands = n.method === 'RULE_SEJONG' ? [{ name: SEJONG.name, used: 1 }] : sggCandidates(t);
  for (const c of cands) {
    const hit = idx.sggByName.get(c.name);
    if (hit) { sgg = hit; bjd = idx.bjdByName.get(`${hit.area_name} ${t.slice(c.used).join(' ')}`) ?? null; break; }
  }
  if (!sgg && idx.sidoNames.has(t[0])) {
    for (let k = 2; k < t.length && !sgg; k++) {
      const hits = idx.dongIndex.get(`${t[0]}|${t[k]}`);
      if (!hits || hits.size !== 1) continue;
      const s = idx.sggByCode.get([...hits.keys()][0]), code = idx.bjdByName.get(`${s.area_name} ${t.slice(k).join(' ')}`);
      if (code) { sgg = s; bjd = code; }
    }
  }
  if (!sgg) return { error: 'SGG' };
  if (!bjd) return { error: 'BJD', sgg: sgg.area_code };
  const pnu = makePnu(bjd.slice(0, 5), bjd.slice(5), m[3], m[4] ?? '0', m[2] ? '1' : '0');
  return pnu ? { sgg: sgg.area_code, bjd, pnu } : { error: 'LOT', sgg: sgg.area_code };
}

function mapLhBlocks({ blocks, areaRows, registry }) {
  const { sggByName, bjdByName, sggByCode, sidoNames, dongIndex } = nameIndex(areaRows);
  const bundleProjects = registry.projects.filter((p) => p.refs.some((r) => r.system === 'bundle'));

  const groups = new Map();
  for (const b of blocks) {
    const k = `${b.district}\u0000${b.block}`;
    if (!groups.has(k)) groups.set(k, { district: b.district, block: b.block, location: b.location });
  }
  const items = [];
  for (const g of [...groups.values()].sort(byKey)) {
    const n = normalize(g.location);
    const item = { district: g.district, block: g.block, location: g.location, sgg_code: null, sgg_name: null, bjd_code: null, method: 'UNRESOLVED' };
    let rest = [];
    if (n.method === 'RULE_SEJONG') {
      item.sgg_code = SEJONG.code; item.sgg_name = SEJONG.name; item.method = n.method; rest = n.tokens.slice(1);
    } else {
      for (const c of sggCandidates(n.tokens)) {
        const hit = sggByName.get(c.name);
        if (hit) { item.sgg_code = hit.area_code; item.sgg_name = hit.area_name; item.method = n.method; rest = n.tokens.slice(c.used); break; }
      }
    }
    if (!item.sgg_code && sidoNames.has(n.tokens[0]) && n.tokens[2]) {   // 시도는 있는데 시군구가 없다 = 구가 개편됐을 수 있다: 동 이름이 맞는 새 구가 정확히 하나일 때만 잇는다
      const hits = dongIndex.get(`${n.tokens[0]}|${n.tokens[2]}`);
      if (hits && hits.size === 1) {
        const [code, bjd] = [...hits][0];
        item.sgg_code = code; item.sgg_name = sggByCode.get(code).area_name; item.bjd_code = bjd; item.method = 'RULE_REORGANIZED_SGG';
      }
    }
    if (item.sgg_code && !item.bjd_code && rest[0]) {   // 법정동: 동·읍·면, 그다음이 '리'면 리까지. 리 이름이 안 맞으면 동·읍·면까지만
      const base = item.sgg_name;
      const tries = rest[1] && rest[1].endsWith('리') ? [`${base} ${rest[0]} ${rest[1]}`, `${base} ${rest[0]}`] : [`${base} ${rest[0]}`];
      for (const name of tries) { const code = bjdByName.get(name); if (code) { item.bjd_code = code; break; } }
    }
    if (item.sgg_code) {
      const local = gyeyangProject(item, registry);
      if (local) item.local_project_id = local;
      else {   // 다른 번들 사업과 같은 시군구·법정동이면 자동으로 잇지 않고 후보로만 남긴다
        const near = item.bjd_code ? bundleProjects.filter((p) => p.sgg === item.sgg_code && (p.bjdCodes ?? []).some((c) => c.startsWith(item.bjd_code.slice(0, 8)))) : [];
        if (near.length) { item.candidate_project_id = near.map((p) => p.id); item.candidate_basis = `같은 법정동(${item.bjd_code.slice(0, 8)}) 번들 사업`; }
      }
    }
    items.push(item);
  }
  return items;
}

/* API 결과(행정표준코드 이름 검색 행) → 시군구 코드. 이름이 정확히 같은 시군구 행(읍면동 000)만 쓴다 */
function pickStan(rows, name) {
  const hit = (rows ?? []).find((r) => r && r.locatadd_nm === name && r.umd_cd === '000');
  return hit ? { sgg_code: `${hit.sido_cd}${hit.sgg_cd}`, sgg_name: hit.locatadd_nm } : null;
}

async function main() {
  const { parseLegalDong } = require('./legal-dong');
  const lh = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/board/lh-completion.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry/projects.json'), 'utf8'));
  const areaRows = parseLegalDong(fs.readFileSync(LEGAL_DONG_FILE), path.basename(LEGAL_DONG_FILE)).rows;
  const items = mapLhBlocks({ blocks: lh.blocks, areaRows, registry });

  let calls = 0;
  const left = items.filter((i) => i.method === 'UNRESOLVED');
  if (left.length && process.argv.includes('--api')) {
    const { loadEnv } = require('../../scripts/dev.js');
    const { createKeyPool, fileStore } = require('../../lib/keys.js');
    const { createCache, defaultDir } = require('../../lib/cache.js');
    const { createStan } = require('../../lib/stan.js');
    const env = Object.assign({}, loadEnv(path.join(ROOT, '.env.local')), process.env);
    const dir = defaultDir(env);
    const stan = createStan({ doFetch: (...a) => fetch(...a), pool: createKeyPool({ env, now: () => Date.now(), store: fileStore(path.join(dir, 'key-usage.json')) }), cache: createCache({ dir, now: () => Date.now() }) });
    const found = new Map();
    for (const it of left) {
      for (const c of sggCandidates(normalize(it.location).tokens)) {
        if (!found.has(c.name)) { calls++; found.set(c.name, pickStan(await stan.search(c.name), c.name)); }
        const hit = found.get(c.name);
        if (hit) { Object.assign(it, hit, { method: 'API' }); break; }
      }
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `[\n${items.map((i) => JSON.stringify(i)).join(',\n')}\n]\n`);   // 한 항목 한 줄
  const count = {};
  for (const i of items) count[i.method] = (count[i.method] ?? 0) + 1;
  console.log(count, `법정동 ${items.filter((i) => i.bjd_code).length}`, `API 호출 ${calls}`);
}

module.exports = { mapLhBlocks, normalize, nameIndex, jibunToPnu, pickStan, OUT, LEGAL_DONG_FILE };

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
