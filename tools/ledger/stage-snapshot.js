'use strict';
/* 단계별 전국 원천(2026-10-12 수집, schemas/ledger-<달>/raw, docs/product/단계별-원천-수집.md) → 원장 변환기(convert.js)가 읽을 정제된 중간 스냅샷.
   hub-bulk.js 와 같은 꼴이다: 원본은 그대로 두고, 정제 규칙(tools/ledger/clean.js)을 거친 기록만 한 기록 한 줄로 쓰고, manifest 에 입력 해시·건수를 적는다.
   원장 표(tables/)는 읽지 않는다(순환 방지). '원장 사업 필지'는 변환기의 입력에서 만든다 —
     건축HUB 대용량 중간 스냅샷(snapshot/hub-refresh.json 이 있으면 그것, 없으면 snapshot/hub-bulk-<판>.json: monthly.js 가 convert.js 에 주는 것과 같은 규칙)의
     기록 위치·대표 필지(site) PNU(지금 코드) + registry/projects.json 의 pnus. 원장 사업 법정동은 같은 기록·레지스트리의 법정동.
   원천별로 담는 범위:
   - bld(건축물대장 총괄표제부 S · 표제부 T 의 주건축물, raw/hub-bulk-bld): 원장 사업 필지에 걸리는 행(PARCEL) + 블록 단위 허가(대지구분 2, PNU 없음)의
     (시군구, 총세대수)와 세대수가 같고 사용승인일 ≥ 그 블록 허가들의 가장 이른 승인일인 행(BLOCK). 같은 필지에 재건축 전 옛 건물 대장이 살아 있으므로
     ref_apprv(그 필지·블록 허가의 가장 이른 사업승인일)와 after_apprv(사용승인일 ≥ ref_apprv, 사용승인일이 없거나 ref_apprv 가 없으면 null)를 함께 둔다.
   - reb(부동산원 공동주택 단지 식별정보): 필지고유번호(지금 코드)가 원장 사업 필지인 단지.
   - kapt(K-apt 목록 kaptCode·bjdCode + 단지 기본정보 xlsx): 원장 사업 법정동에 있는 단지(같은 법정동 + 세대수 + 사용승인일로 대조할 후보) 중
     사용승인일이 그 법정동 원장 허가의 가장 이른 사업승인일보다 앞서지 않는 것(레지스트리 법정동은 승인일을 몰라 모두, 출력 10 MB 안쪽으로 줄이려고). xlsx 의 같은 단지코드 반복 행은 접는다.
     PNU 는 목록 bjdCode(지금 코드) + xlsx 법정동주소의 첫 번지.
   - myhome(마이홈 공공임대 단지): 단지×주택형 행을 hsmpSn 으로 접고(hshldCo 는 단지 총계의 반복이라 합하지 않는다) pnu(지금 코드)가 원장 사업 필지인 단지.
   - applyhome(청약홈 분양정보 Detail 5종) · hug(HUG 분양이력) · lhDetail(LH 공고 상세 dsSbd 단지 행) · lhSchedule(LH 공고 상세 dsSplScdl, 공고마다 하나): 전부.
   도로명 주소는 schemas/ledger-<달>/mappings/road-jibun.json(다른 도구가 만든다)이 있으면 그 지번으로 PNU 를 만든다. 없으면 PNU null(시군구·법정동만).
   큰 zip 은 시스템 unzip -p 를 한 줄씩 읽는다(새 npm 꾸러미 없음, xlsx 도 sheet XML 을 같은 방법으로). 같은 입력이면 같은 결과(배열마다 정렬 고정, manifest 에 실행 시각 없음).
   실행: node tools/ledger/stage-snapshot.js [--month YYYY-MM]  → schemas/ledger-<달>/snapshot/stage-<대용량 판>.json · .manifest.json (약 1분 — 표제부 806만 행)
   시험: tests/js/clean.test.cjs(정제 규칙) */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const P = require('./paths');
const C = require('./clean');
const { codeMapper, locate, eachLine } = require('./hub-bulk');
const { nameIndex } = require('./map-lh');
const { parseLegalDong } = require('./legal-dong');
const NL = require('./notice-link');
const { makePnu } = require('../../lib/permits.js');

const ROOT = P.ROOT;
const SCHEMA = 'stage/1';
const SOURCES = ['bld', 'reb', 'kapt', 'myhome', 'applyhome', 'hug', 'lhDetail', 'lhSchedule'];
/* 청약홈 Detail 오퍼레이션 → 종류 */
const APPLYHOME = { getAPTLttotPblancDetail: 'APT', getUrbtyOfctlLttotPblancDetail: 'OFFICETEL', getRemndrLttotPblancDetail: 'REMNDR', getPblPvtRentLttotPblancDetail: 'PBL_PVT_RENT', getOPTLttotPblancDetail: 'OPT' };

/* 파일 해시(큰 zip 도 메모리에 다 올리지 않게 스트림으로) */
const sha256 = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
});
const fileInfo = async (base, file) => ({ path: path.relative(base, file), bytes: fs.statSync(file).size, sha256: await sha256(file) });
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* 원천 하나의 건수 장부: 날짜·글자를 정제하며 null 로 바꾼 값을 열·사유별로 세고, PNU 변환 성공률을 센다 */
function ledgerOf() {
  const nulls = {}, pnu = { tried: 0, ok: 0, old_code: 0, reasons: {}, via: {} };
  const bump = (field, reason) => { nulls[field] ??= {}; nulls[field][reason] = (nulls[field][reason] ?? 0) + 1; };
  return {
    nulls, pnu,
    date(field, s) { const r = C.parseDate(s); if (r.reason && r.reason !== 'EMPTY') bump(field, r.reason); return r.value; },
    month(field, s) { const r = C.parseMonth(s); if (r.reason && r.reason !== 'EMPTY') bump(field, r.reason); return r.value; },
    party(field, s) { const v = C.cleanParty(s); if (v == null && String(s ?? '').trim()) bump(field, 'PLACEHOLDER'); return v; },
    /* PNU 글자(pnuNow) 또는 주소 결과({ pnu, via }) 하나를 센다 */
    code(r) { pnu.tried++; if (r.pnu) { pnu.ok++; if (r.changed) pnu.old_code++; if (r.via) pnu.via[r.via] = (pnu.via[r.via] ?? 0) + 1; } else { const k = r.reason ?? r.kind ?? 'NONE'; pnu.reasons[k] = (pnu.reasons[k] ?? 0) + 1; } return r.pnu ?? null; },
    done(extra) { if (pnu.tried) pnu.rate = Math.round((pnu.ok / pnu.tried) * 10000) / 10000; return { ...extra, nulls, ...(pnu.tried ? { pnu } : {}) }; },
  };
}

/* ---------- 원장 사업 필지·법정동·블록 허가 ---------- */

/* 변환기 입력(건축HUB 대용량 중간 스냅샷 + 레지스트리)에서 { hubFile, parcels: PNU → 가장 이른 사업승인일|null, bjds: 법정동 → 가장 이른 사업승인일|null(레지스트리), blocks: '시군구|총세대수' → 가장 이른 승인일, blockSgg } */
function ledgerTargets(base, root, mapper) {
  const snap = path.join(base, 'snapshot'), refresh = path.join(snap, 'hub-refresh.json');
  const hubFile = fs.existsSync(refresh) ? refresh : path.join(snap, `hub-bulk-${P.bulkDataMonth(path.join(base, 'raw/hub-bulk'))}.json`);
  const records = readJson(hubFile).records;
  const parcels = new Map(), bjds = new Map(), blocks = new Map();
  const earliest = (prev, d) => (prev == null ? d ?? null : d && d < prev ? d : prev);
  const addParcel = (pnu, apprv) => { if (pnu) parcels.set(pnu, parcels.has(pnu) ? earliest(parcels.get(pnu), apprv) : apprv ?? null); };
  const addBjd = (bjd, apprv) => { if (bjd) bjds.set(bjd, bjds.has(bjd) ? (bjds.get(bjd) == null ? null : earliest(bjds.get(bjd), apprv)) : apprv ?? null); };   // 레지스트리(승인일 모름)는 null 이 이긴다
  for (const rec of records) {
    const at = locate(rec, mapper), site = rec.site ? locate(rec.site, mapper) : null;
    addParcel(at.pnu, rec.apprv); addParcel(site?.pnu, rec.apprv);
    for (const b of [at.bjd, site?.bjd]) addBjd(b, rec.apprv);
    if (!at.pnu && !site?.pnu && rec.plat_gb === '2' && at.sgg) { const k = `${at.sgg}|${rec.households}`; blocks.set(k, earliest(blocks.get(k), rec.apprv)); }
  }
  const registry = readJson(path.join(root, 'registry/projects.json'));
  for (const p of registry.projects) {
    for (const x of p.pnus ?? []) { const r = C.pnuNow(x, mapper); addParcel(r.pnu, null); if (r.pnu) addBjd(r.pnu.slice(0, 10), null); }
    for (const b of p.bjdCodes ?? []) addBjd(mapper.bjd(b), null);
  }
  return { hubFile, records: records.length, registry: registry.projects.length, parcels, bjds, blocks, blockSgg: new Set([...blocks.keys()].map((k) => k.split('|')[0])) };
}

/* ---------- 건축물대장 ---------- */

async function stageBld(base, T, mapper) {
  const raw = path.join(base, 'raw/hub-bulk-bld'), m = readJson(path.join(raw, 'manifest.json'));
  const out = [], files = {}, counts = {};
  const L = ledgerOf(), cache = new Map();
  const nowBjd = (code) => { if (!cache.has(code)) cache.set(code, /^\d{10}$/.test(code) ? mapper.bjd(code) : null); return cache.get(code); };
  for (const [kind, tag] of [['summary', 'S'], ['title', 'T']]) {
    const f = m.files[kind], zip = path.join(raw, f.zip);
    files[kind] = await fileInfo(base, zip);
    if (files[kind].sha256 !== f.zip_sha256) throw new Error(`${f.zip}: sha256 이 원본 manifest 와 다르다`);
    const I = Object.fromEntries(f.columns.map((c, i) => [c.name, i]));
    const col = (n) => { if (!(n in I)) throw new Error(`${f.zip}: 열 ${n} 이 없다`); return I[n]; };
    const X = { pk: col('관리_건축물대장_PK'), sgg: col('시군구_코드'), bjd: col('법정동_코드'), plat: col('대지_구분_코드'), bun: col('번'), ji: col('지'), block: col('블록'), lot: col('로트'),
      name: col('건물_명'), use: col('주_용도_코드_명'), hh: col('세대_수(세대)'), permit: col('허가_일'), start: col('착공_일'), done: col('사용승인_일'), ...(tag === 'T' ? { dong: col('동_명'), main: col('주_부속_구분_코드') } : {}) };
    const c0 = (counts[kind] = { rows: 0, parcel: 0, block: 0, ...(tag === 'T' ? { aux: 0 } : {}) });
    await eachLine(zip, f.member, (c) => {
      c0.rows++;
      const now = nowBjd(`${c[X.sgg].trim()}${c[X.bjd].trim()}`), plat = c[X.plat].trim();
      const pnu = now ? makePnu(now.slice(0, 5), now.slice(5), c[X.bun], c[X.ji], plat) : null;
      let match = null, ref = null;
      if (pnu && T.parcels.has(pnu)) { match = 'PARCEL'; ref = T.parcels.get(pnu); }
      else {
        const sgg = now ? now.slice(0, 5) : mapper.sgg(c[X.sgg].trim());
        if (!sgg || !T.blockSgg.has(sgg)) return;
        const k = `${sgg}|${C.toCount(c[X.hh])}`;
        if (!T.blocks.has(k)) return;
        ref = T.blocks.get(k);
        const d = C.cleanDate(c[X.done]);
        if (!(d && d.length === 10 && ref && d >= ref)) return;
        match = 'BLOCK';
      }
      if (tag === 'T' && c[X.main].trim() !== '0') { c0.aux++; return; }   // 부속 건축물(경비실·주차장 등)은 세대·사용승인 대조에 쓰지 않는다
      c0[match.toLowerCase()]++;
      const use_date = L.date('use_date', c[X.done]);
      out.push({ src: tag, pk: c[X.pk].trim(), match, sgg: now ? now.slice(0, 5) : mapper.sgg(c[X.sgg].trim()), bjd: now, pnu, plat_gb: plat, block: C.cleanText(c[X.block]), lot: C.cleanText(c[X.lot]),
        name: C.cleanText(c[X.name]), ...(tag === 'T' ? { dong: C.cleanText(c[X.dong]) } : {}), use: C.cleanText(c[X.use]), households: C.toCount(c[X.hh]),
        permit: L.date('permit', c[X.permit]), start: L.date('start', c[X.start]), use_date, ref_apprv: ref, after_apprv: use_date && use_date.length === 10 && ref ? use_date >= ref : null });
    });
  }
  out.sort((a, b) => byStr(a.pnu ?? `~${a.sgg}`, b.pnu ?? `~${b.sgg}`) || byStr(a.src, b.src) || byStr(a.pk, b.pk));
  return { rows: out, manifest: L.done({ files, rows_read: counts.summary.rows + counts.title.rows, rows_kept: out.length, by_file: counts }) };
}

/* ---------- 부동산원 단지 식별정보 ---------- */

async function stageReb(base, T, mapper) {
  const raw = path.join(base, 'raw/reb-complex-id'), f = readJson(path.join(raw, 'manifest.json')).files.main, file = path.join(raw, f.filename);
  const info = await fileInfo(base, file);
  if (info.sha256 !== f.sha256) throw new Error(`${f.filename}: sha256 이 원본 manifest 와 다르다`);
  const [head, ...rows] = C.parseCsv(new TextDecoder('euc-kr').decode(fs.readFileSync(file)));
  const I = Object.fromEntries(head.map((h, i) => [h.trim(), i])), v = (r, k) => (r[I[k]] ?? '').trim();
  const L = ledgerOf(), out = [];
  for (const r of rows) {
    const pnu = L.code(C.pnuNow(v(r, '필지고유번호'), mapper));
    if (!pnu || !T.parcels.has(pnu)) continue;
    out.push({ id: v(r, '단지고유번호'), pnu, address: C.cleanText(v(r, '주소')), name: C.cleanText(v(r, '단지명_공시가격')), name_bld: C.cleanText(v(r, '단지명_건축물대장')), name_road: C.cleanText(v(r, '단지명_도로명주소')),
      kind: C.cleanText(v(r, '단지종류')), buildings: C.toCount(v(r, '동수')), households: C.toCount(v(r, '세대수')), use_date: L.date('use_date', v(r, '사용승인일')), road: C.cleanText(v(r, '도로명주소')) });
  }
  out.sort((a, b) => byStr(a.pnu, b.pnu) || byStr(a.id, b.id));
  return { rows: out, manifest: L.done({ files: { main: info }, rows_read: rows.length, rows_kept: out.length, use_date_max: rows.map((r) => C.cleanDate(v(r, '사용승인일'))).filter(Boolean).sort().pop() ?? null }) };
}

/* ---------- K-apt ---------- */

/* xlsx 시트 XML(인라인 글자, 한 행이 여러 줄일 수 있다) → 행마다 onRow(칸 배열) */
const XML_ENT = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
const xmlText = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (_, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : XML_ENT[e]));
const colIndex = (ref) => [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
function eachXlsxRow(zip, member, onRow) {
  return new Promise((resolve, reject) => {
    const p = spawn('unzip', ['-p', zip, member]);
    let err = '', buf = null;
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (buf == null && /<row[\s>]/.test(line)) buf = '';
      if (buf == null) return;
      buf += `${line}\n`;
      if (!line.includes('</row>')) return;
      const cells = [];
      for (const m of buf.matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(m[2] ?? '') ?? /<v>([\s\S]*?)<\/v>/.exec(m[2] ?? '');
        cells[colIndex(m[1])] = t ? xmlText(t[1]) : '';
      }
      onRow(cells);
      buf = null;
    });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`unzip ${member} 실패(${code}): ${err}`))));
  });
}

/* 법정동주소('서울특별시 종로구 내수동 73- 경희궁의아침4단지', 여러 필지는 쉼표)의 첫 번지 → { bun, ji, san } 또는 null */
function firstLot(address) {
  const tok = String(address ?? '').split(',')[0].trim().split(/\s+/);
  for (let i = 1; i < tok.length; i++) {
    const m = /^(산)?(\d+)(?:-(\d*))?$/.exec(tok[i]);
    if (m) return { bun: m[2], ji: m[3] || '0', san: !!m[1] || tok[i - 1] === '산' };
  }
  return null;
}

async function stageKapt(base, T, mapper) {
  const listDir = path.join(base, 'raw/kapt-list'), fileDir = path.join(base, 'raw/molit-complex-file');
  const listFile = path.join(listDir, 'getTotalAptList4.json'), fm = readJson(path.join(fileDir, 'manifest.json')).files.main, xlsx = path.join(fileDir, fm.filename);
  const files = { list: await fileInfo(base, listFile), file: await fileInfo(base, xlsx) };
  if (files.file.sha256 !== fm.sha256) throw new Error(`${fm.filename}: sha256 이 원본 manifest 와 다르다`);
  const list = new Map(readJson(listFile).rows.map((r) => [r.kaptCode, r]));
  const rows = [];
  let header = null, n = 0;
  await eachXlsxRow(xlsx, 'xl/worksheets/sheet1.xml', (cells) => {
    n++;
    if (n === 1) return;                              // 1행 안내문
    if (n === 2) { header = cells.map((h) => String(h ?? '').trim()); return; }   // 2행 머리글
    rows.push(Object.fromEntries(header.map((h, i) => [h, String(cells[i] ?? '').trim()])));
  });
  for (const h of ['단지코드', '단지명', '법정동주소', '사용승인일', '세대수']) if (!header.includes(h)) throw new Error(`${fm.filename}: 머리글 ${h} 이 없다`);
  const folded = C.fold(rows, (r) => r['단지코드']);
  const L = ledgerOf(), out = [];
  let noList = 0, before = 0;
  for (const r of folded.rows) {
    const lr = list.get(r['단지코드']);
    if (!lr) noList++;
    const bjd = lr ? mapper.bjd(String(lr.bjdCode ?? '').trim()) : null;
    const lot = firstLot(r['법정동주소']);
    const pnu = L.code(bjd && lot ? { pnu: makePnu(bjd.slice(0, 5), bjd.slice(5), lot.bun, lot.ji, lot.san ? '1' : '0'), reason: 'LOT', changed: bjd !== lr.bjdCode } : { pnu: null, reason: bjd ? 'NO_LOT' : lr ? 'UNMAPPED' : 'NO_LIST' });
    if (!bjd || !T.bjds.has(bjd)) continue;
    const ref = T.bjds.get(bjd), use = C.cleanDate(r['사용승인일']);
    if (ref && use && use.length === 10 && use < ref) { before++; continue; }   // 그 법정동 원장 허가보다 먼저 사용승인한 단지는 대조 후보가 아니다(재건축 전 옛 단지 포함)
    out.push({ code: r['단지코드'], name: C.cleanText(r['단지명']), bjd, pnu, address: C.cleanText(r['법정동주소']), kind: C.cleanText(r['단지분류']), sale_type: C.cleanText(r['분양형태']),
      use_date: L.date('use_date', r['사용승인일']), households: C.toCount(r['세대수']), builder: L.party('builder', r['시공사']), developer: L.party('developer', r['시행사']) });
  }
  out.sort((a, b) => byStr(a.bjd, b.bjd) || byStr(a.code, b.code));
  return { rows: out, manifest: L.done({ files, rows_read: rows.length, folded_repeats: folded.repeats, complexes: folded.rows.length, not_in_list: noList, list_rows: list.size, before_permit: before, rows_kept: out.length }) };
}

/* ---------- 마이홈 공공임대 단지 ---------- */

async function stageMyhome(base, T, mapper) {
  const file = path.join(base, 'raw/myhome-complex/rentalHouseGwList.json');
  const info = await fileInfo(base, file), rows = readJson(file).rows;
  const folded = C.fold(rows, (r) => String(r.hsmpSn));
  const L = ledgerOf(), out = [];
  let varies = 0;
  for (const g of C.fold(rows, (r) => String(r.hsmpSn), (g) => g).rows) {
    const r = g[0], pnu = L.code(C.pnuNow(r.pnu, mapper));
    if (!pnu || !T.parcels.has(pnu)) continue;
    const hh = C.repeatedTotal(g.map((x) => C.toCount(x.hshldCo)));
    if (hh.varies) varies++;
    out.push({ id: String(r.hsmpSn), name: C.cleanText(r.hsmpNm), agency: C.cleanText(r.insttNm), pnu, address: C.cleanText(r.rnAdres), households: hh.value, households_varies: hh.varies,
      completed: L.date('completed', r.competDe), supply: [...new Set(g.map((x) => C.cleanText(x.suplyTyNm)).filter(Boolean))].sort() });
  }
  out.sort((a, b) => byStr(a.pnu, b.pnu) || byStr(a.id, b.id));
  return { rows: out, manifest: L.done({ files: { main: info }, rows_read: rows.length, complexes: folded.rows.length, folded_repeats: folded.repeats, rows_kept: out.length, households_varies_kept: varies }) };
}

/* ---------- 청약홈 분양정보 ---------- */

const roadUse = { applyhome: 0, lhDetail: 0 };
function blocksAndDistrict(...texts) {
  const blocks = new Set(texts.flatMap((t) => [...NL.blocksOf(t)]));
  const pair = texts.flatMap((t) => NL.pairsOf(t))[0];
  return { blocks: [...blocks].sort(), district: pair?.dist ?? null };
}

async function stageApplyhome(base, idx, roadMap) {
  const dir = path.join(base, 'raw/applyhome'), files = {}, out = [];
  const L = ledgerOf();
  let rowsRead = 0;
  for (const [op, kind] of Object.entries(APPLYHOME)) {
    const file = path.join(dir, `${op}.json`);
    files[op] = await fileInfo(base, file);
    for (const r of readJson(file).rows) {
      rowsRead++;
      const at = C.locateAddress(r.HSSPLY_ADRES, idx, roadMap);
      if (at.via === 'ROAD_MAP') roadUse.applyhome++;
      L.code(at);
      const name = C.cleanText(r.HOUSE_NM), presale = r.HOUSE_SECD_NM === '민간사전청약' ? 'HOUSE_SECD_NM' : /사전\s*청약/.test(name ?? '') ? 'HOUSE_NM' : null;
      out.push({ key: `${r.HOUSE_MANAGE_NO}|${r.PBLANC_NO}`, kind, type: C.cleanText(r.HOUSE_DTL_SECD_NM ?? r.HOUSE_DETAIL_SECD_NM ?? r.HOUSE_SECD_NM), name, address: C.cleanText(r.HSSPLY_ADRES),
        address_kind: at.kind, sgg: at.sgg, bjd: at.bjd, pnu: at.pnu, pnu_via: at.via, ...blocksAndDistrict(name, r.HSSPLY_ADRES),
        households: C.toCount(r.TOT_SUPLY_HSHLDCO), announced: L.date('announced', r.RCRIT_PBLANC_DE), move_in: L.month('move_in', r.MVN_PREARNGE_YM), sponsor: L.party('sponsor', r.BSNS_MBY_NM),
        public_district: C.yn(r.PUBLIC_HOUSE_EARTH_AT), large_site: C.yn(r.LRSCL_BLDLND_AT), presale: !!presale, presale_basis: presale });
    }
  }
  const keys = new Set(out.map((r) => r.key));
  out.sort((a, b) => byStr(a.key, b.key) || byStr(a.kind, b.kind));
  return { rows: out, manifest: L.done({ files, rows_read: rowsRead, rows_kept: out.length, duplicate_keys: out.length - keys.size, no_sgg: out.filter((r) => !r.sgg).length, road_map_used: roadUse.applyhome,
    pnu_jibun_form: rate(out.filter((r) => r.address_kind === 'JIBUN')), pnu_road_form: rate(out.filter((r) => r.address_kind === 'ROAD')) }) };
}
const rate = (rows) => ({ rows: rows.length, ok: rows.filter((r) => r.pnu).length, rate: rows.length ? Math.round((rows.filter((r) => r.pnu).length / rows.length) * 10000) / 10000 : null });

/* ---------- HUG 분양이력 ---------- */

async function stageHug(base, idx, areaRows) {
  const file = path.join(base, 'raw/hug-sale-history/infoDistributionHistory.json');
  const info = await fileInfo(base, file), rows = readJson(file).rows;
  const L = ledgerOf(), out = [], unresolved = {};
  for (const r of rows) {
    const name = C.cleanText(r.BSU_NM), sgg = C.sggOfAreaName(r.AREA_DTL_DCD_NM, idx, areaRows, name);
    if (!sgg) unresolved[r.AREA_DTL_DCD_NM] = (unresolved[r.AREA_DTL_DCD_NM] ?? 0) + 1;
    const announced = L.date('announced', r.COLL_ANNO_APVL_DT);
    out.push({ key: hugKey({ sgg, name, announced }), sgg, area: C.cleanText(r.AREA_DTL_DCD_NM), name, total: C.toCount(r.TOT_HOCO), general: C.toCount(r.GNRL_SILT_HOCO),
      announced, sale_open: L.date('sale_open', r.SILT_OPEN_DT), guarantee: L.date('guarantee', r.GUAR_FRST_ISSE_DT), developer: L.party('developer', r.OPRN_ETPR_NM), builder: L.party('builder', r.OWET_ETPR_NM) });
  }
  out.sort((a, b) => byStr(a.key, b.key) || byStr(JSON.stringify(a), JSON.stringify(b)));
  const keys = new Set(out.map((r) => r.key));
  return { rows: out, manifest: L.done({ files: { main: info }, rows_read: rows.length, rows_kept: out.length, duplicate_keys: out.length - keys.size, sgg_unresolved: unresolved }) };
}

/* ---------- LH 공고 상세 ---------- */

async function stageLh(base, idx, roadMap) {
  const file = path.join(base, 'raw/lh-notice-detail/details.json');
  const info = await fileInfo(base, file), notices = readJson(file).rows;
  const L = ledgerOf(), complexes = [], schedule = [];
  let sbdRows = 0, scdlRows = 0;
  const day = (field, s) => { const v = L.date(field, s); return v && v.length === 10 ? v : null; };
  for (const n of notices) {
    const blk = (name) => (n.response ?? []).flatMap((b) => b[name] ?? []);
    const sbd = blk('dsSbd');
    sbdRows += sbd.length;
    const picked = sbd.map((s) => ({ name: C.cleanText(s.LCC_NT_NM ?? s.BZDT_NM), address: C.cleanText(s.LGDN_ADR ?? s.LCT_ARA_ADR), address_detail: C.cleanText(s.LGDN_DTL_ADR ?? s.LCT_ARA_DTL_ADR),
      households: C.toCount(s.HSH_CNT ?? s.SUM_TOT_HSH_CNT), mvin: s.MVIN_XPC_YM, rawAddress: s.LGDN_ADR ?? s.LCT_ARA_ADR }));
    for (const s of C.fold(picked, (x) => JSON.stringify([x.name, x.address, x.address_detail, x.households, x.mvin])).rows) {
      const at = C.locateAddress(s.rawAddress, idx, roadMap);
      if (at.via === 'ROAD_MAP') roadUse.lhDetail++;
      L.code(at);
      complexes.push({ pan: n.PAN_ID, name: s.name, address: s.address, address_detail: s.address_detail, address_kind: at.kind, sgg: at.sgg, bjd: at.bjd, pnu: at.pnu, pnu_via: at.via,
        ...blocksAndDistrict(s.name, s.address_detail), households: s.households, move_in: L.month('move_in', s.mvin) });
    }
    const sc = blk('dsSplScdl');
    scdlRows += sc.length;
    if (!sc.length) continue;
    const starts = [], ends = [], wins = [];
    for (const s of sc) {
      const [a, b] = C.parseRange(s.ACP_DTTM);
      starts.push(day('apply_start', s.SBSC_ACP_ST_DT), day('apply_start', s.ACP_ST_DT), day('apply_start', s.UST_ACP_ST_DTTM), a.precision === 'day' ? a.value : null);
      ends.push(day('apply_end', s.SBSC_ACP_CLSG_DT), day('apply_end', s.ACP_ED_DT), day('apply_end', s.UST_ACP_CLSG_DTTM), b.precision === 'day' ? b.value : null);
      wins.push(day('winner_on', s.PZWR_ANC_DT));
    }
    const sorted = (xs) => xs.filter(Boolean).sort();
    schedule.push({ pan: n.PAN_ID, rows: sc.length, apply_start: sorted(starts)[0] ?? null, apply_end: sorted(ends).pop() ?? null, winner_on: sorted(wins)[0] ?? null });
  }
  complexes.sort((a, b) => byStr(a.pan, b.pan) || byStr(JSON.stringify(a), JSON.stringify(b)));
  schedule.sort((a, b) => byStr(a.pan, b.pan));
  const man = L.done({ files: { main: info }, notices: notices.length, rows_read: sbdRows, rows_kept: complexes.length, folded_repeats: sbdRows - complexes.length, road_map_used: roadUse.lhDetail,
    pnu_jibun_form: rate(complexes.filter((r) => r.address_kind === 'JIBUN')), pnu_road_form: rate(complexes.filter((r) => r.address_kind === 'ROAD')), no_sgg: complexes.filter((r) => !r.sgg).length });
  return { complexes, schedule, manifest: man, scheduleManifest: { rows_read: scdlRows, rows_kept: schedule.length, nulls: Object.fromEntries(Object.entries(L.nulls).filter(([k]) => ['apply_start', 'apply_end', 'winner_on'].includes(k))) } };
}

/* ---------- 묶기 ---------- */

/* 도로명 → 지번 매핑(있으면): 원문 주소(trim) → 지번 주소(OK 행만) */
function readRoadMap(base) {
  const file = path.join(base, 'mappings/road-jibun.json');
  if (!fs.existsSync(file)) return { map: null, file: null };
  const j = readJson(file);
  if (j.schema !== 'road-jibun/1') throw new Error(`${file}: schema 가 road-jibun/1 이 아니다`);
  return { file, rows: j.rows.length, map: new Map(j.rows.filter((r) => r.status === 'OK' && r.parcel).map((r) => [String(r.address).trim(), r.parcel])) };
}

async function build(base) {
  const dong = path.join(base, 'raw/legal-dong'), dongFile = path.join(dong, fs.readdirSync(dong).filter((f) => f.endsWith('.csv')).sort().pop());
  const legal = parseLegalDong(fs.readFileSync(dongFile), path.basename(dongFile));
  const mapper = codeMapper(legal.rows, legal.abolished), idx = nameIndex(legal.rows);
  const dataMonth = P.bulkDataMonth(path.join(base, 'raw/hub-bulk'));
  const T = ledgerTargets(base, ROOT, mapper);
  const road = readRoadMap(base);
  roadUse.applyhome = 0; roadUse.lhDetail = 0;
  const bld = await stageBld(base, T, mapper), reb = await stageReb(base, T, mapper), kapt = await stageKapt(base, T, mapper), myhome = await stageMyhome(base, T, mapper);
  const applyhome = await stageApplyhome(base, idx, road.map), hug = await stageHug(base, idx, legal.rows), lh = await stageLh(base, idx, road.map);
  const data = { bld: bld.rows, reb: reb.rows, kapt: kapt.rows, myhome: myhome.rows, applyhome: applyhome.rows, hug: hug.rows, lhDetail: lh.complexes, lhSchedule: lh.schedule };
  const manifest = {
    schema: `${SCHEMA}-manifest`, data_month: dataMonth, tool: 'tools/ledger/stage-snapshot.js', rules: 'tools/ledger/clean.js',
    date_rule: `형식 YYYY-MM-DD · YYYYMMDD · YYYY.MM.DD · YYYYMM · YYYY · 'YYYY년 MM월' · 'YYYY.MM' 을 적힌 정밀도(일·월·연)대로. 자리표시값과 ${C.DATE_FLOOR} 전·${C.DATE_CEIL} 뒤는 null(nulls 에 열·사유별 수: PLACEHOLDER · RANGE · FORMAT · CALENDAR)`,
    legal_dong: await fileInfo(base, dongFile),
    ledger: { hub_snapshot: await fileInfo(base, T.hubFile), records: T.records, registry_projects: T.registry, parcels: T.parcels.size, bjds: T.bjds.size, block_keys: T.blocks.size },
    road_jibun: road.file ? { ...(await fileInfo(base, road.file)), rows: road.rows, ok: road.map.size } : null,
    sources: { bld: bld.manifest, reb: reb.manifest, kapt: kapt.manifest, myhome: myhome.manifest, applyhome: applyhome.manifest, hug: hug.manifest, lhDetail: lh.manifest, lhSchedule: { files: lh.manifest.files, ...lh.scheduleManifest } },
  };
  return { data, manifest, dataMonth };
}

/* 원천마다 { columns, rows: 기록마다 값 배열 }, 한 기록 한 줄(변경을 줄 단위로 보려고). 열 이름을 기록마다 되풀이하지 않아 출력이 10 MB 안쪽이 된다
   (객체로 쓰면 13 MB). 열은 그 원천 기록들에 처음 나온 순서, 없는 열은 null. 읽기는 readStage */
function render(data, dataMonth) {
  const part = (k) => {
    const cols = [...new Set(data[k].flatMap((r) => Object.keys(r)))];
    return `"${k}":{"columns":${JSON.stringify(cols)},"rows":[\n${data[k].map((r) => JSON.stringify(cols.map((c) => r[c] ?? null))).join(',\n')}\n]}`;
  };
  return `{"schema":"${SCHEMA}","data_month":"${dataMonth}",\n${SOURCES.map(part).join(',\n')}\n}\n`;
}
/* 스냅샷 파일 → { dataMonth, bld: [기록 객체], … } */
function readStage(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (j.schema !== SCHEMA) throw new Error(`${file}: schema 가 ${SCHEMA} 가 아니다`);
  return { dataMonth: j.data_month, ...Object.fromEntries(SOURCES.map((k) => [k, j[k].rows.map((r) => Object.fromEntries(j[k].columns.map((c, i) => [c, r[i]])))])) };
}
/* HUG 기록의 안정 키(시군구코드|사업명|공고승인일, 모르는 칸은 '-'): 같은 키가 둘 이상이면 manifest sources.hug.duplicate_keys 에 센다 */
const hugKey = (r) => `${r.sgg ?? '-'}|${r.name}|${r.announced ?? '-'}`;
const outFiles = (base, dataMonth) => ({ out: path.join(base, `snapshot/stage-${dataMonth}.json`), manifest: path.join(base, `snapshot/stage-${dataMonth}.manifest.json`) });

module.exports = { build, render, readStage, hugKey, outFiles, ledgerTargets, firstLot, eachXlsxRow, xmlText, SOURCES };

if (require.main === module) {
  const i = process.argv.indexOf('--month'), base = P.ledgerDir(i > 0 ? process.argv[i + 1] : P.latestMonth());
  build(base).then(({ data, manifest, dataMonth }) => {
    const { out, manifest: mf } = outFiles(base, dataMonth);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, render(data, dataMonth));
    for (const [k, s] of Object.entries(manifest.sources)) {
      const p = s.pnu ? ` · PNU ${s.pnu.ok}/${s.pnu.tried}` : '';
      manifest.sources[k] = s;
      console.log(`${k.padEnd(10)} 읽음 ${s.rows_read} · 남김 ${s.rows_kept}${p}`);
    }
    fs.writeFileSync(mf, `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(`${path.relative(ROOT, out)} (${fs.statSync(out).size} 바이트)`);
  }).catch((e) => { console.error(`오류: ${e.stack}`); process.exit(1); });
}
