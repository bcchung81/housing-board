'use strict';
/* 건축HUB 주택인허가 대용량 파일(기본개요·행위개요·대지위치, schemas/ledger-2026-10/raw/hub-bulk) → 원장 변환기(convert.js)가 읽는 중간 스냅샷.
   원본 zip 은 머리글 없는 '|' 텍스트(UTF-8)이고 열 이름은 같은 폴더 manifest.json 에 있다. 관리번호(관리_주택대장_PK)는 자릿수가 섞인 문자열로 다룬다.
   - 날짜: 'YYYYMMDD' 이고 달력에 있으며 1990-01-01 ~ 2040-12-31 인 값만 'YYYY-MM-DD' 로 받는다. 그 밖(' 2002 5'·'200512'·30000101 …)은 null 로 두고 열마다 센다.
   - 범위(기록 단위, 관리번호 기준): 사업승인일이 있고 · 총세대수 1 이상 · 철거·멸실 표시(구분 코드·멸실일)가 없고 · 사용검사 실제일이 비었거나 2025-01-01 이후.
   - 진행 중(2026-10-10 결정, 기준일 2026-10-10): 아래 넷 중 하나라도 맞아야 남긴다. 아니면 '장기 미갱신'(STALE)으로 뺀다 — 착공·준공 기록 없이 오래된 허가가
     종합상황판의 ②인허가·지연을 부풀렸다(2010년 전 허가인데 착공·준공 기록이 없는 것만 6,727건·450만 세대). 착공 실제일은 범위 안 기록의 약 7%만 채워져 있다.
     d) 사용검사 실제일 ≥ 2025-01-01 · a) 사업승인일 ≥ 2021-10-01(주택법 제16조: 사업계획승인을 받은 날부터 5년 안에 공사를 시작해야 한다) ·
     b) 착공 실제일 ≥ 2018-01-01 · c) 사용검사 예정일 ≥ 2025-01-01 이고 사업승인일 ≥ 2015-01-01. 남은 기록의 근거는 이 순서(d·a·b·c)로 처음 맞는 것 하나를 센다.
   - 남긴 관리번호만 행위개요의 단지명(처음 나온 빈칸 아닌 값)과 대지위치의 대표 필지(대표_여부 1, 필지 수는 따로 셈)를 붙인다.
     대지위치 전체(남긴 관리번호만 26만 행)는 원장 위치 표에 싣기에 너무 커서 대표 필지만 남긴다.
   원본 zip 은 시스템 unzip(-p)으로 한 줄씩 읽는다(새 npm 꾸러미 없음).
   실행: node tools/ledger/hub-bulk.js  → schemas/ledger-2026-10/snapshot/hub-bulk-2026-08.json · hub-bulk-2026-08.manifest.json
   시험: tests/js/hub-bulk.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const RAW = path.join(ROOT, 'schemas/ledger-2026-10/raw/hub-bulk');
const DATA_MONTH = '2026-08';
const OUT = path.join(ROOT, `schemas/ledger-2026-10/snapshot/hub-bulk-${DATA_MONTH}.json`);
const OUT_MANIFEST = path.join(ROOT, `schemas/ledger-2026-10/snapshot/hub-bulk-${DATA_MONTH}.manifest.json`);
const WINDOW_START = '2025-01-01';   // 상황판 시점 0(2025.01): 그 전에 준공(사용검사)한 기록은 뺀다
const DATE_MIN = '1990-01-01', DATE_MAX = '2040-12-31';
/* 진행 중 규칙(기준일 2026-10-10). 순서 = 근거를 세는 순서 */
const ACTIVE = [
  ['d', (d) => d.insp >= '2025-01-01'],
  ['a', (d) => d.apprv >= '2021-10-01'],   // 주택법 제16조 착공 의무 5년
  ['b', (d) => d.stcns >= '2018-01-01'],
  ['c', (d) => d.insp_sched >= '2025-01-01' && d.apprv >= '2015-01-01'],
];
/* 날짜(null 은 비교에서 거짓) → 맞은 근거 'a'~'d' 또는 null(장기 미갱신) */
const activeBasis = (d) => ACTIVE.find(([, ok]) => ok(Object.fromEntries(DATE_COLS.map((k) => [k, d[k] ?? '']))))?.[0] ?? null;
/* 기본개요 열 번호(manifest.json files.basic.columns 순서) */
const B = { pk: 0, address: 1, name: 2, sgg: 3, bjd: 4, plat_gb: 5, bun: 6, ji: 7, special: 8, block: 9, use: 12, households: 17, demolish_code: 18, demolish_day: 22, apprv: 23, stcns_sched: 24, stcns: 25, insp_sched: 26, insp: 27 };
const DATE_COLS = ['apprv', 'stcns_sched', 'stcns', 'insp_sched', 'insp'];
const A = { pk: 0, complex: 13 };                                               // 행위개요
const S = { pk: 0, rep: 1, sgg: 3, bjd: 5, plat_gb: 6, bun: 7, ji: 8 };        // 대지위치

/* 'YYYYMMDD' → 'YYYY-MM-DD'. 달력에 없거나 1990-01-01 ~ 2040-12-31 밖이거나 형식이 다르면 null */
function cleanDate(s) {
  const t = String(s == null ? '' : s).trim();
  if (!/^\d{8}$/.test(t)) return null;
  const y = +t.slice(0, 4), m = +t.slice(4, 6), d = +t.slice(6, 8), dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  return iso >= DATE_MIN && iso <= DATE_MAX ? iso : null;
}

/* 기본개요 한 줄(열 배열) → { record, active: 근거 } 또는 { drop: 사유 }. 사유: NO_PERMIT_DATE · NO_HOUSEHOLDS · DEMOLISHED · COMPLETED_BEFORE_WINDOW · STALE(장기 미갱신) */
function basicRecord(c) {
  const v = (k) => String(c[B[k]] ?? '').trim();
  const dates = Object.fromEntries(DATE_COLS.map((k) => [k, cleanDate(c[B[k]])]));
  if (!dates.apprv) return { drop: 'NO_PERMIT_DATE' };
  const households = Number(v('households'));
  if (!Number.isInteger(households) || households < 1) return { drop: 'NO_HOUSEHOLDS' };
  if (v('demolish_code') || cleanDate(c[B.demolish_day])) return { drop: 'DEMOLISHED' };
  if (dates.insp && dates.insp < WINDOW_START) return { drop: 'COMPLETED_BEFORE_WINDOW' };
  const active = activeBasis(dates);
  if (!active) return { drop: 'STALE' };
  return { active, record: { pk: v('pk'), sgg: v('sgg'), bjd: v('bjd'), plat_gb: v('plat_gb'), bun: v('bun'), ji: v('ji'), block: v('block'), special: v('special'), address: v('address'), name: v('name'), complex: null, use: v('use'), households, ...dates, site: null, site_count: 0 } };
}

/* zip 안 파일을 한 줄씩 읽어 onLine(열 배열)을 부른다 */
function eachLine(zip, member, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn('unzip', ['-p', zip, member]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => { if (line) onLine(line.split('|')); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`unzip ${member} 실패(${code}): ${err}`))));
  });
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/* 원본 3개를 읽어 { records(관리번호 순), manifest } */
async function build(rawDir = RAW) {
  const src = JSON.parse(fs.readFileSync(path.join(rawDir, 'manifest.json'), 'utf8'));
  const zips = {};
  for (const [k, f] of Object.entries(src.files)) {
    const hash = sha256(path.join(rawDir, f.zip));
    if (hash !== f.zip_sha256) throw new Error(`${f.zip}: sha256 이 원본 manifest 와 다르다`);
    zips[k] = { zip: f.zip, member: f.member, sha256: hash };
  }
  const dates = Object.fromEntries(DATE_COLS.map((k) => [k, { valid: 0, empty: 0, invalid: 0 }]));
  const funnel = { rows: 0, NO_PERMIT_DATE: 0, NO_HOUSEHOLDS: 0, DEMOLISHED: 0, COMPLETED_BEFORE_WINDOW: 0, STALE: 0, kept: 0 };
  const active = { d: 0, a: 0, b: 0, c: 0 };
  const byPk = new Map();
  await eachLine(path.join(rawDir, zips.basic.zip), zips.basic.member, (c) => {
    funnel.rows++;
    for (const k of DATE_COLS) { const t = String(c[B[k]] ?? '').trim(); dates[k][!t ? 'empty' : cleanDate(t) ? 'valid' : 'invalid']++; }
    const r = basicRecord(c);
    if (r.drop) { funnel[r.drop]++; return; }
    if (byPk.has(r.record.pk)) throw new Error(`기본개요 관리번호 중복: ${r.record.pk}`);
    byPk.set(r.record.pk, r.record);
    funnel.kept++;
    active[r.active]++;
  });
  let actRows = 0, siteRows = 0;
  await eachLine(path.join(rawDir, zips.act.zip), zips.act.member, (c) => {
    const r = byPk.get(String(c[A.pk]).trim());
    if (!r) return;
    actRows++;
    const name = String(c[A.complex] ?? '').trim();
    if (name && !r.complex) r.complex = name;
  });
  await eachLine(path.join(rawDir, zips.site.zip), zips.site.member, (c) => {
    const r = byPk.get(String(c[S.pk]).trim());
    if (!r) return;
    siteRows++;
    r.site_count++;
    if (String(c[S.rep]).trim() === '1' && !r.site) r.site = { sgg: c[S.sgg].trim(), bjd: c[S.bjd].trim(), plat_gb: c[S.plat_gb].trim(), bun: c[S.bun].trim(), ji: c[S.ji].trim() };
  });
  const records = [...byPk.values()].sort((a, b) => (a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : 0));
  const manifest = {
    source: src.source, data_month: DATA_MONTH, data_as_of: `${DATA_MONTH}-31`, fetched_at: src.fetched_at, files: zips,
    rules: { date: `YYYYMMDD, 달력에 있는 ${DATE_MIN}~${DATE_MAX} 만(그 밖은 null)`, scope: `사업승인일 있음 · 총세대수 ≥ 1 · 철거·멸실 표시 없음 · 사용검사일 없음 또는 ≥ ${WINDOW_START}`,
      active: '진행 중(기준일 2026-10-10) 중 하나: d 사용검사일 ≥ 2025-01-01 · a 사업승인일 ≥ 2021-10-01(주택법 제16조 착공 의무 5년) · b 착공일 ≥ 2018-01-01 · c 사용검사 예정일 ≥ 2025-01-01 이고 사업승인일 ≥ 2015-01-01. 아니면 STALE(장기 미갱신)', site: '대지위치는 대표 필지(대표_여부 1)만, 필지 수는 site_count' },
    funnel, active, dates, act_rows_matched: actRows, site_rows_matched: siteRows, records: records.length,
  };
  return { records, manifest };
}

/* ---------- 변환기(convert.js)가 쓰는 순수 함수 ---------- */

/* 옛 코드 → 지금 코드. 법정동코드 파일의 폐지 행 이름에서 시군구 부분을 떼고, 시도 이름을 지금 이름으로 바꿔(map-lh.js normalize: 통합·개명)
   끝 이름(동·읍면 리)이 같은 존재 법정동이 하나일 때만 잇는다. 여럿이면 옛 시 이름(예 화성시)이 든 것으로 좁힌다. 시군구만 알면 이름이 같은 존재 시군구 */
function codeMapper(areaRows, abolished) {
  const { normalize } = require('./map-lh');
  const exist = new Map(areaRows.map((r) => [r.area_code, r]));
  const old = new Map(abolished.map((r) => [r.code, r.name]));
  const sggByName = new Map(areaRows.filter((r) => r.level === 'SGG').map((r) => [r.area_name, r.area_code]));
  const bySuffix = new Map();
  for (const r of areaRows) {
    if (r.level !== 'BJD') continue;
    const t = r.area_name.split(' ');
    for (let k = 1; k <= 2 && k < t.length; k++) { const key = `${t[0]}|${t.slice(-k).join(' ')}`; (bySuffix.get(key) || bySuffix.set(key, []).get(key)).push(r); }
  }
  const sggName = (code5) => exist.get(code5)?.area_name ?? old.get(`${code5}00000`) ?? null;
  const bjd = (code10) => {
    if (exist.get(code10)?.level === 'BJD') return code10;
    const name = old.get(code10), base = sggName(code10.slice(0, 5));
    if (!name || !base || !name.startsWith(`${base} `)) return null;
    let hits = bySuffix.get(`${normalize(name).tokens[0]}|${name.slice(base.length + 1)}`) ?? [];
    if (hits.length > 1) { const city = base.split(' ')[1]; hits = hits.filter((r) => r.area_name.split(' ').includes(city)); }
    return hits.length === 1 ? hits[0].area_code : null;
  };
  const sgg = (code5) => {
    if (exist.get(code5)?.level === 'SGG') return code5;
    const name = old.get(`${code5}00000`);
    return name ? sggByName.get(normalize(name).tokens.join(' ')) ?? null : null;
  };
  return { bjd, sgg };
}

/* 기록의 위치: 기본개요에 시군구가 없으면 대지위치 대표 필지. { sgg, bjd(10자리|null), pnu(19자리|null) } — sgg 가 null 이면 시군구를 못 찾은 것 */
function locate(rec, mapper) {
  const { makePnu } = require('../../lib/permits.js');
  const loc = rec.sgg ? rec : rec.site ?? rec;
  const five = (v) => /^\d{5}$/.test(v ?? '');
  const bjd = five(loc.sgg) && five(loc.bjd) ? mapper.bjd(loc.sgg + loc.bjd) : null;
  const sgg = bjd ? bjd.slice(0, 5) : five(loc.sgg) ? mapper.sgg(loc.sgg) : null;
  return { sgg, bjd, pnu: bjd ? makePnu(bjd.slice(0, 5), bjd.slice(5), loc.bun, loc.ji, loc.plat_gb) : null };
}

/* 사업으로 모으는 키(lib/permits.js aggregate 와 같음): 필지(PNU) · 블록 단위 허가(대지구분 2)는 법정동 + 블록(없으면 건물명) · 그 밖은 관리번호 하나 */
function groupKey(rec, at) {
  if (at.pnu) return `P${at.pnu}`;
  const blk = (rec.block || rec.name).replace(/[\s-]/g, '').toUpperCase();
  return rec.plat_gb === '2' && blk ? `B${at.bjd ?? at.sgg}|${blk}` : `K${rec.pk}`;
}

/* LH 블록 대조용 블록 코드: 대문자, 공백·하이픈 등 제거, 끝의 BL·블록·블럭 제거, 숫자 앞 0 제거('A-2'≈'A2'≈'A2BL'≈'A02'). 글자가 없는(번호뿐) 블록은 대조하지 않는다(null) */
function normBlock(s) {
  const t = String(s ?? '').toUpperCase().replace(/[\s\-_.·]/g, '').replace(/(BL|BLOCK|블록|블럭)$/, '').replace(/(^|\D)0+(\d)/g, '$1$2');
  return /[A-Z가-힣]/.test(t) && /\d/.test(t) ? t : null;
}
/* LH 지구 이름의 대조 낱말: 괄호와 그 안을 빼고 첫 낱말, 끝에 붙은 블록 코드(위례A2-7BL → 위례)를 뗀다. 두 글자 미만이면 null */
function districtToken(district) {
  const t = String(district ?? '').replace(/\(.*?\)/g, ' ').trim().split(/\s+/)[0].replace(/[A-Za-z][A-Za-z0-9-]*$/, '');
  return t.length >= 2 ? t : null;
}

/* 한 기록 한 줄(변경을 줄 단위로 보려고) */
const renderRecords = (records) => `{"schema":"hub-bulk/1","data_month":"${DATA_MONTH}","records":[\n${records.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
const loadRecords = (file = OUT) => JSON.parse(fs.readFileSync(file, 'utf8')).records;

module.exports = { cleanDate, basicRecord, activeBasis, build, codeMapper, locate, groupKey, normBlock, districtToken, renderRecords, loadRecords, OUT, OUT_MANIFEST, RAW, DATA_MONTH };

if (require.main === module) {
  build().then(({ records, manifest }) => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, renderRecords(records));
    fs.writeFileSync(OUT_MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(manifest.funnel, manifest.active, `행위개요 ${manifest.act_rows_matched}행 · 대지위치 ${manifest.site_rows_matched}행`);
    console.log(`${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} 바이트)`);
  }).catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
