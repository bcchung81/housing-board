'use strict';
/* 사업 원장 2026-10 원천(raw) → 주택파동 공통규격 v1.4 CSV 8종 + review_required.csv · conversion_report.md · field_mapping.md · README.md

     node tools/common_v1_4_raw/convert.js [--out DIR] [--only ID|사업명,...]

   기본 출력 ~/Downloads/housing_wave_common_v1_4_raw. --only 는 시험 변환(전체를 만든 뒤 고른 사업과 그 행만 남긴다).
   범위(2026-10-12 사용자 승인 결정): 서울·경기·인천(시도 11·41·28)의 '공급 진행 사업'만 사업으로 올린다.
     사업을 만드는 원천(앞이 대표): P1 LH 공공주택 준공예정 블록 · P3 LH 공고 단지 · P4 마이홈 모집공고 단지 · P2 청약홈 APT 공공 공고.
     보강만 하는 원천(공공 사업에 확실한 키로 붙을 때만): E1 건축HUB 주택인허가 · E2 입주예정물량 · E3 단지 원천(마이홈·부동산원·국토부+K-apt) · E4 건축인허가·건축물대장.
   합치기: 확실한 키가 정확히 같을 때만 — 시도+지구명+블록(정규화 뒤 완전 일치) · PNU 19자리 · 마이홈 panId = LH PAN_ID(그 공고의 단지가 하나로 정해질 때) ·
     그다음 PNU 앞 15자리. 이름만 비슷하거나 블록만 같은 것은 합치지 않고 review_required.csv(DUPLICATE_CANDIDATE)에 남긴다.
   원천 파일은 읽기만 한다. 외부 호출 없음. 같은 입력이면 바이트까지 같은 결과(실행 시각을 쓰지 않고 모든 표를 정렬한다).
   다시 쓰는 함수: tools/ledger/hub-bulk.js · map-lh.js · notice-link.js · legal-dong.js · lib/permits.js (고치지 않고 require 만 한다).
   시험: tests/js/common-v1-4-raw.test.cjs */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn, execFileSync } = require('node:child_process');

const spec = require('./spec');
const { validate, parseCsv } = require('./validate');
const HB = require('../ledger/hub-bulk');
const ML = require('../ledger/map-lh');
const NL = require('../ledger/notice-link');
const { parseLegalDong } = require('../ledger/legal-dong');
const { makePnu, permitEvents } = require('../../lib/permits.js');

const ROOT = path.join(__dirname, '..', '..');
const LEDGER = path.join(ROOT, 'schemas/ledger-2026-10');
const RAW = path.join(LEDGER, 'raw');
const DEFAULT_OUT = path.join(os.homedir(), 'Downloads', 'housing_wave_common_v1_4_raw');
const LH_COMPLETION_FILE = 'data/raw/datagokr/15141761_한국토지주택공사_공공주택 준공예정현황_20260127.csv';
const LEGAL_DONG_FILE = 'schemas/ledger-2026-10/raw/legal-dong/국토교통부_법정동코드_20260929.csv';
const METRO = { 11: '서울', 28: '인천', 41: '경기' };
const SIDO_NAME = { 서울특별시: '11', 서울: '11', 인천광역시: '28', 인천: '28', 경기도: '41', 경기: '41' };
const KIND_RANK = { P1: 0, P3: 1, P4: 2, P2: 3 };
const STAGE_RANK = { 인허가: 3, 건설: 4, 공급: 5, 입주: 6 };
const STAGE_OF = { PERMIT: '인허가', CONSTRUCTION_START: '건설', PROGRESS: '건설', SUPPLY_NOTICE: '공급', COMPLETION: '입주', MOVE_IN: '입주' };
const HUB_BULK_FIELDS = [   // tools/ledger/convert.js 와 같음: 여러 기록 중 고르는 쪽
  ['PERMIT', 'ACTUAL', 'apprv', 'last', '사업계획승인일'],
  ['CONSTRUCTION_START', 'ACTUAL', 'stcns', 'first', '착공일'],
  ['CONSTRUCTION_START', 'PLANNED', 'stcns_sched', 'last', '착공예정일'],
  ['COMPLETION', 'ACTUAL', 'insp', 'last', '사용검사일'],
  ['COMPLETION', 'PLANNED', 'insp_sched', 'last', '사용검사예정일'],
];
const SUSPECT_FIELD = { permit_approved: 'apprv', construction_start: 'stcns', completion_inspection: 'insp' };
/* LH 공고 단지 이름의 공급유형 표지 */
const TYPE_MARK = /국민임대|영구임대|행복주택|공공분양|공분|신혼|국임|통합공공|공공임대|장기전세|분양주택|\d+년/;
/* 청약홈 회차·정기 모집(여러 재고 단지를 한 공고로 모집할 수 있음): '2020년 제1차 …', '2020년도 1차 …', '제38차 …' */
const ROUND_NOTICE = /\d{4}년도?\s*제?\s*\d+\s*차|제\s*\d+\s*차/;

/* ────────────────────────── 원천 목록(source_ref 고정 번호) ────────────────────────── */
const SOURCES = [
  { key: 'lhCompletion', ref: 1, name: 'LH 공공주택 준공예정현황' },
  { key: 'lhNotice', ref: 2, name: 'LH 분양임대공고문 목록' },
  { key: 'lhSupply', ref: 3, name: 'LH 분양임대공고 공급정보' },
  { key: 'lhDetail', ref: 4, name: 'LH 분양임대공고별 상세정보' },
  { key: 'myhome', ref: 5, name: '마이홈 공공주택 모집공고' },
  { key: 'applyhome', ref: 6, name: '청약홈 APT 분양정보' },
  { key: 'hubBulk', ref: 7, name: '건축HUB 주택인허가 대용량' },
  { key: 'moveIn', ref: 8, name: '부동산원 입주예정물량' },
  { key: 'myhomeComplex', ref: 9, name: '마이홈 공공임대 단지정보' },
  { key: 'reb', ref: 10, name: '부동산원 공동주택 단지 식별정보' },
  { key: 'molit', ref: 11, name: '국토부 공동주택 단지 기본정보' },
  { key: 'kapt', ref: 12, name: 'K-apt 단지 목록', reference: true },
  { key: 'hubAp', ref: 13, name: '건축HUB 건축인허가 기본개요' },
  { key: 'bldSummary', ref: 14, name: '건축HUB 건축물대장 총괄표제부' },
  { key: 'bldTitle', ref: 15, name: '건축HUB 건축물대장 표제부' },
  { key: 'legalDong', ref: 16, name: '법정동코드', reference: true },
  { key: 'lhMapping', ref: 17, name: 'LH 지구·블록 시군구 대응표', reference: true },
  { key: 'ledger', ref: 18, name: '사업 원장 사업번호 대응', reference: true },
];
const REF = Object.fromEntries(SOURCES.map((s) => [s.key, `WAVE-SRC-${String(s.ref).padStart(2, '0')}`]));

/* ────────────────────────── 순수 함수(시험 대상) ────────────────────────── */

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const compact = (v) => String(v ?? '').replace(/\s/g, '').toUpperCase();
const sha1x8 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8).toUpperCase();
/* 원천 키의 해시 로컬 ID. 다른 사업이 늘어도 바뀌지 않는다 */
const waveId = (kind, input) => `WAVE-${kind}-${sha1x8(input)}`;
/* LH 준공예정 블록 ID — 이전 변환기(tools/common_v1_4/convert.py temp_id)와 같은 값 */
const lhcId = (district, block) => waveId('LHC', `15141761|${district}|${block}`);

/* 날짜 → 'YYYY-MM-DD'. 'YYYYMMDD'·'YYYY-MM-DD'·'YYYY.MM.DD' 를 받고 달력에 있는 1990-01-01~2040-12-31 만(hub-bulk.js cleanDate). 그 밖은 null */
function cleanDay(s) {
  const t = String(s ?? '').trim();
  const m = /^(\d{4})[-.](\d{2})[-.](\d{2})\.?$/.exec(t);
  return HB.cleanDate(m ? m[1] + m[2] + m[3] : t);
}
/* 월 → 'YYYY-MM'. 'YYYYMM'·'YYYY-MM'·'YYYY.MM'·'YYYY. M'·'YYYY년 MM월' 을 받고 1990~2040 년, 1~12 월만. 그 밖('2027-00'·'2017.'·'0000')은 null */
function cleanMonth(s) {
  const t = String(s ?? '').trim();
  const m = /^(\d{4})(?:\s*[-.년/]\s*|)(\d{1,2})\s*월?\.?$/.exec(t);
  if (!m) return null;
  const y = +m[1], mo = +m[2];
  if (y < 1990 || y > 2040 || mo < 1 || mo > 12) return null;
  return `${m[1]}-${String(mo).padStart(2, '0')}`;
}
const monthOf = (d) => (d ? d.slice(0, 7) : null);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number), k = y * 12 + (m - 1) + n; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`; };

/* PNU 앞 15자리(법정동 10 + 대지구분 1 + 본번 4). 19자리 숫자가 아니면 null */
const pnu15 = (p) => (/^\d{19}$/.test(String(p ?? '')) ? String(p).slice(0, 15) : null);

/* 공공기관 이름 사전(사업주체 → 짧은 이름). 앞에서부터 처음 맞는 것 */
const ORG_RULES = [
  [/한국토지주택공사|대한주택공사|^LH$|^LH공사|^엘에이치공사$/, 'LH'],
  [/서울주택도시(개발)?공사|서울특별시도시개발공사|^SH(공사)?$|^에스에이치공사$/, 'SH'],
  [/경기주택도시공사|^경기도시공사$|^GH(공사)?$/, 'GH'],
  [/인천도시공사|인천광역시도시공사|^IH(공사)?$/, 'IH'],
];
const LOCAL_CORP = /^([가-힣]{2,})(도시개발공사|주택도시공사|도시관리공사|도시공사|개발공사|지방공사)$/;
/* 민간 표지: 이것이 든 사업주체는 공공 이름이 들어 있어도 공공기관이 아니다(조합·리츠·신탁·PFV) */
const PRIVATE_MARK = /조합|투자회사|리츠|REITS|신탁|피에프브이|PFV|프로젝트금융/i;
const PUBLIC_WORD = /한국토지주택공사|엘에이치|LH|주택도시공사|도시공사|개발공사|SH공사|GH|IH/i;

/* 사업주체 한 곳 → 짧은 이름 또는 null */
function orgShort(entity) {
  const e = clean(entity).replace(/\s/g, '').replace(/\(주\)|㈜|주식회사/g, '');
  if (!e || PRIVATE_MARK.test(e)) return null;
  for (const [re, short] of ORG_RULES) if (re.test(e)) return short;
  const base = e.replace(/(지역본부|본부|본사|사업단|사업본부)$/, '');
  const m = LOCAL_CORP.exec(base);
  return m ? base : null;
}
/* 사업주체(쉼표로 이은 공동 사업주체 포함) 판정: { public, joint, orgs(짧은 이름), publicWordOnly(공공 이름이 든 조합·PFV 등) } */
function classifyOperator(name) {
  const parts = String(name ?? '').split(/[,，]/).map(clean).filter(Boolean).map((e) => ({ e, org: orgShort(e) }));
  const orgs = [...new Set(parts.filter((p) => p.org).map((p) => p.org))];
  return {
    public: orgs.length > 0,
    joint: orgs.length > 0 && parts.some((p) => !p.org),
    orgs,
    publicWordOnly: !orgs.length && parts.some((p) => PUBLIC_WORD.test(p.e.replace(/\s/g, ''))),
  };
}

/* 지구 이름 정규화(합치기 키): 괄호와 그 안, 빈칸을 지우고 대문자, 끝의 '공공주택지구'·'택지개발(사업)지구'·'지구' 를 뗀다 */
const districtKey = (s) => compact(String(s ?? '').replace(/\([^()]*\)/g, ' ')).replace(/(공공주택지구|택지개발사업지구|택지개발지구|지구)$/, '');
const ADMIN_NAME = /^[가-힣]{1,3}(시|군|구|읍|면|동|리)$/;
/* 이름 글자 → { district, districtKey, block } — 괄호를 지운 글자에서 블록 코드가 정확히 하나(글자+숫자, notice-link.js blocksOf)이고 그 앞 낱말(titleDistrict)이 지구일 때만. 아니면 null */
function parseDistrictBlock(text) {
  const t = clean(String(text ?? '').replace(/\([^()]*\)/g, ' '));
  const blks = [...NL.blocksOf(t)].filter((b) => !b.startsWith('#'));
  if (blks.length !== 1) return null;
  const district = NL.titleDistrict(t);
  const key = districtKey(district);
  if (!district || key.length < 2 || ADMIN_NAME.test(district)) return null;   // '시흥시' 같은 행정구역 이름은 지구로 보지 않는다
  return { district, districtKey: key, block: blks[0] };
}
/* 합치기 키: 시도 + 지구 + 블록(정규화). 블록이 번호뿐이면(normBlock null) 키 없음 */
const abKey = (sido, district, block) => { const b = HB.normBlock(block), d = districtKey(district); return sido && b && d.length >= 2 ? `${sido}|${d}|${b}` : null; };

/* 주소 글자 → 시군구 코드(법정동코드 파일의 존재 시군구 이름과 정확히 일치: '시도 시 구' 를 먼저, 그다음 '시도 시군구'). 못 찾으면 null */
function sggOfAddress(addr, idx) {
  const n = ML.normalize(String(addr ?? '').replace(/[(),]/g, ' ')), t = n.tokens;
  if (n.method === 'RULE_SEJONG') return '36110';
  const cands = [];
  if (t.length >= 3 && t[1].endsWith('시') && t[2].endsWith('구')) cands.push(t.slice(0, 3).join(' '));
  if (t.length >= 2) cands.push(t.slice(0, 2).join(' '));
  for (const c of cands) { const hit = idx.sggByName.get(c); if (hit) return hit.area_code; }
  return null;
}
/* 시도 코드: 시군구 코드가 있으면 그 앞 2자리, 없으면 주소 첫 낱말의 시도 이름(서울·경기·인천만 안다) */
const sidoOf = (sgg, addr) => (sgg ? sgg.slice(0, 2) : SIDO_NAME[String(addr ?? '').trim().split(/\s+/)[0]] ?? null);

/* 단계(project_status): 기준일 이전 ACTUAL·CONFIRMED 이벤트 중 가장 늦은 단계. 없으면 '' */
function stageOf(events, refDate) {
  let best = '';
  for (const e of events) {
    if (e.date_type !== 'ACTUAL' || e.review_status !== 'CONFIRMED') continue;
    const when = e.event_date || e.event_month;
    if (!when || when > refDate.slice(0, when.length)) continue;
    const s = STAGE_OF[e.event_type];
    if (s && (!best || STAGE_RANK[s] > STAGE_RANK[best])) best = s;
  }
  return best;
}

/* CSV: UTF-8 BOM, CRLF, 쉼표·따옴표·줄바꿈이 든 칸만 따옴표 */
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (header, rows) => `﻿${[header, ...rows.map((r) => header.map((h) => r[h]))].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

const natural = (s) => String(s ?? '').match(/\d+|\D+/g)?.map((x) => (/^\d/.test(x) ? x.padStart(10, '0') : x)).join('') ?? '';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cmpBy = (...fs) => (a, b) => { for (const f of fs) { const c = cmp(f(a), f(b)); if (c) return c; } return 0; };

/* ────────────────────────── 읽기 도우미 ────────────────────────── */
const rel = (p) => path.join(ROOT, p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const decodeCp949 = (buf) => new TextDecoder('euc-kr').decode(buf);
const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const kstDate = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10) : '');
const intOf = (v) => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return Number.isInteger(n) && n > 0 ? n : null; };
const blockOf = (resp, name) => { for (const o of resp ?? []) if (o && Array.isArray(o[name])) return o[name]; return []; };

/* zip 안 파일을 grep 으로 먼저 거른 뒤 한 줄씩(열 배열) onLine 에 준다. 맞는 줄이 없으면(grep 종료 1) 그냥 끝난다 */
function eachFilteredLine(zip, member, needle, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn('sh', ['-c', 'unzip -p "$1" "$2" | grep -F -- "$3"; s=$?; [ $s -le 1 ] && exit 0 || exit $s', 'sh', zip, member, needle]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => { if (line) onLine(line.split('|')); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${member} 읽기 실패(${code}): ${err}`))));
  });
}

/* xlsx 첫 시트(인라인 문자열) → 행 배열(열 글자 → 값). 시스템 unzip 으로 XML 을 읽는다(새 npm 꾸러미 없음) */
function readXlsxRows(file) {
  const xml = execFileSync('unzip', ['-p', file, 'xl/worksheets/sheet1.xml'], { maxBuffer: 600 * 1024 * 1024 }).toString('utf8');
  const ent = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = {};
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const inner = cm[2] ?? '', t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner) ?? /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (t) row[cm[1]] = ent(t[1]);
    }
    rows.push(row);
  }
  return rows;
}

/* ────────────────────────── 변환 ────────────────────────── */

async function build() {
  const manifest = readJson(path.join(LEDGER, 'manifest.json'));
  const refDate = manifest.reference_date;
  const stats = {};
  const bump = (src, label, n = 1) => { stats[src] ??= {}; stats[src][label] = (stats[src][label] ?? 0) + n; };
  const review = [];   // { review_type, cluster?|local_project_id, source, record_key, record_name, detail, reason }
  const inputs = [];   // { path, sha256, note }
  const addInput = (p, sha = null, note = '') => inputs.push({ path: path.relative(ROOT, p), sha256: sha ?? sha256File(p), note });

  /* 법정동코드 */
  const legalBuf = fs.readFileSync(rel(LEGAL_DONG_FILE));
  addInput(rel(LEGAL_DONG_FILE));
  const legal = parseLegalDong(legalBuf, path.basename(LEGAL_DONG_FILE));
  const idx = ML.nameIndex(legal.rows);
  const mapper = HB.codeMapper(legal.rows, legal.abolished);
  const sggName = new Map(legal.rows.filter((r) => r.level === 'SGG').map((r) => [r.area_code, r.area_name]));
  const sigunguOf = (code) => (code && sggName.get(code) ? sggName.get(code).split(' ').slice(1).join(' ') : '');
  /* PNU 의 법정동 10자리를 지금 코드로(옛 시군구 코드·인천 개편 등). 못 이으면 원래 값 */
  const fixPnu = (p) => { if (!/^\d{19}$/.test(String(p ?? ''))) return null; const b = mapper.bjd(p.slice(0, 10)); return b ? b + p.slice(10) : p; };

  const parts = [];
  const newPart = (kind, key, idInput, o) => { const p = { kind, key, idInput, pnus: new Set(), ids: [], events: [], units: [], reviews: [], ...o }; parts.push(p); return p; };
  const idRow = (id_type, id_value, id_issuer, src, match_status = 'CONFIRMED') => ({ id_type, id_value: String(id_value), id_issuer, src, match_status });
  const evRow = (event_type, date_type, when, detail, src, review_status = 'CONFIRMED') => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(when);
    return { event_type, date_type, event_date: day ? when : '', event_month: day ? '' : when, progress_pct: '', event_detail: clean(detail), src, review_status };
  };
  const unitRow = (quantity_type, housing_type, unit_count, reference_period, unit_scope, src, review_status = 'CONFIRMED') => ({ quantity_type, housing_type: clean(housing_type), unit_count: String(unit_count), reference_period: reference_period ?? '', unit_scope, src, review_status });
  const actualOrPlanned = (d) => (d <= refDate.slice(0, d.length) ? 'ACTUAL' : 'PLANNED');

  /* ── P1 LH 공공주택 준공예정 ── */
  {
    const src = 'lhCompletion';
    addInput(rel(LH_COMPLETION_FILE));
    const mapFile = path.join(LEDGER, 'mappings/lh-block-sgg.json');
    addInput(mapFile);
    const mapping = new Map(readJson(mapFile).map((m) => [`${m.district}|${m.block}`, m]));
    const rows = parseCsv(decodeCp949(fs.readFileSync(rel(LH_COMPLETION_FILE)))).filter((r) => r.length > 1);
    const head = rows.shift();
    const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
    const groups = new Map();
    for (const r of rows) {
      bump(src, '입력 행(블록×공급유형)');
      const row = { district: clean(r[col['사업지구명']]), block: clean(r[col['블록명']]), location: clean(r[col['위치']]), type: clean(r[col['공급유형']]), units: intOf(r[col['세대수']]), date: cleanDay(r[col['준공예정일']]) };
      const m = mapping.get(`${row.district}|${row.block}`);
      const sido = m?.sgg_code?.slice(0, 2) ?? null;
      if (!METRO[sido]) { bump(src, '제외: 대상 지역 밖(행)'); continue; }
      const k = `${row.district}|${row.block}`;
      if (!groups.has(k)) groups.set(k, { m, rows: [] });
      groups.get(k).rows.push(row);
    }
    for (const [k, { m, rows: rs }] of groups) {
      const [district, block] = k.split('|');
      const numeric = /^\d+$/.test(block);
      const p = newPart('P1', k, null, { id: lhcId(district, block), name: `${district} ${block}`, district, block, numericBlock: numeric, sgg: m.sgg_code, sido: m.sgg_code.slice(0, 2), org: 'LH', areaBlock: k, location: rs[0].location });
      p.ids.push(idRow('AREA_BLOCK', k, 'LH', src));
      if (m.bjd_code) p.ids.push(idRow('BJD_CODE', m.bjd_code, '행정안전부', 'lhMapping'));
      for (const r of rs) {
        if (!r.units) { bump(src, '세대수 없음·0(물량 행 안 만듦)'); continue; }
        p.units.push(unitRow('PUBLIC_PLAN', r.type, r.units, monthOf(r.date), 'SUBTYPE', src));
        bump(src, '변환: 공공 계획 물량 행(유형별)');
      }
      for (const d of [...new Set(rs.map((r) => r.date))].sort()) {
        if (!d) { bump(src, '준공예정일 오염(이력 안 만듦)'); continue; }
        p.events.push(evRow('COMPLETION', 'PLANNED', d, `준공예정(${rs.filter((r) => r.date === d).map((r) => r.type).join('·')})`, src));
      }
      bump(src, '변환: 사업(지구·블록)');
    }
  }

  /* ── P3 LH 공고(목록·공급정보·상세) ── */
  const p3ByKey = new Map(), p3ByPan = new Map();
  {
    const nFile = path.join(RAW, 'lh-notice/notices.json'), sFile = path.join(RAW, 'lh-notice/supply.json'), dFile = path.join(RAW, 'lh-notice-detail/details.json');
    for (const f of [nFile, sFile, dFile]) addInput(f);
    const notices = readJson(nFile).items;
    const details = new Map(readJson(dFile).rows.map((r) => [r.PAN_ID, r.response]));
    const supply = new Map();   // PAN_ID → [{ name, count }]
    for (const it of readJson(sFile).items) {
      const rows = [];
      for (const o of it.response ?? []) for (const [k, v] of Object.entries(o)) if (/^dsList0\d$/.test(k) && Array.isArray(v)) rows.push(...v);
      supply.set(it.PAN_ID, rows.map((r) => ({ name: compact(r.SBD_LGO_NM ?? r.BZDT_NM), count: Number(String(r.NOW_HSH_CNT ?? r.SIL_HSH_CNT ?? '').replace(/,/g, '')) || 0 })));
    }
    const src = 'lhNotice';
    for (const n of notices) {
      bump(src, '입력 공고');
      const kind = NL.noticeKind(n.PAN_NM, n.AIS_TP_CD_NM);
      if (kind === 'CANCEL') { bump(src, '제외: 취소 공고'); continue; }
      if (kind === 'NON_SUPPLY') { bump(src, '제외: 비주택 공고(가정어린이집·오피스텔·상가 등)'); continue; }
      if (kind === 'FOLLOW_UP') { bump(src, '제외: 후속 공고(잔여세대·추가·예비입주자·선착순·매각·재공급 등, 사업 안 만듦)'); continue; }
      const sbd = blockOf(details.get(n.PAN_ID), 'dsSbd');
      if (!sbd.length) { bump(src, `제외: 단지 정보 없는 최초 공고(${n.AIS_TP_CD_NM})`); continue; }
      bump(src, '최초 입주자모집 공고(단지 있음)');
      const date = cleanDay(n.PAN_NT_ST_DT) ?? cleanDay(n.PAN_DT);
      const sched = blockOf(details.get(n.PAN_ID), 'dsSplScdl');
      const starts = sched.map((s) => cleanDay(s.SBSC_ACP_ST_DT)).filter(Boolean).sort(), ends = sched.map((s) => cleanDay(s.SBSC_ACP_CLSG_DT)).filter(Boolean).sort();
      const sup = supply.get(n.PAN_ID) ?? [];
      for (const s of sbd) {
        bump('lhDetail', '최초 공고의 단지 행');
        const name = clean(s.LCC_NT_NM || s.BZDT_NM), addr = clean(s.LGDN_ADR || s.LCT_ARA_ADR), dtl = clean(s.LGDN_DTL_ADR || s.LCT_ARA_DTL_ADR);
        if (!name && !addr) { bump('lhDetail', '제외: 단지 이름·주소 없음'); continue; }
        const sgg = sggOfAddress(addr, idx), sido = sidoOf(sgg, addr);
        if (!METRO[sido]) { bump('lhDetail', sido ? '제외: 대상 지역 밖(단지 행)' : '제외: 주소로 시도를 정하지 못함(단지 행)'); continue; }
        const key = `${compact(name)}|${compact(addr)}`;
        let p = p3ByKey.get(key);
        if (!p) {
          const db = parseDistrictBlock(name);
          p = newPart('P3', key, null, { id: waveId('LHN', `15057999|${name}|${addr}`), name: name || addr, district: db?.district ?? null, block: db?.block ?? null, sgg, sido, org: 'LH', notices: [] });
          p3ByKey.set(key, p);
          if (/^(산\s*)?\d+(-\d+)?$/.test(dtl) && !/\d/.test(addr)) {   // 신형 주소(법정동까지) + 상세가 지번뿐이면 필지를 만든다
            const r = ML.jibunToPnu(`${addr} ${dtl}`, idx);
            if (r.pnu) { p.pnus.add(r.pnu); p.ids.push(idRow('PNU', r.pnu, '국토교통부', 'lhDetail')); bump('lhDetail', '단지 주소로 PNU 만듦(단지)'); }
          }
        }
        const total = intOf(s.HSH_CNT ?? s.SUM_TOT_HSH_CNT);
        const mvRaw = clean(s.MVIN_XPC_YM), mv = cleanMonth(mvRaw.replace(/\.$/, ''));
        if (mvRaw && !mv) bump('lhDetail', '입주예정월 오염(이력 안 만듦)');
        const own = sbd.length === 1 ? sup : sup.filter((x) => x.name === compact(name));
        const nowCount = own.reduce((a, x) => a + x.count, 0);
        p.notices.push({ panId: n.PAN_ID, date, title: n.PAN_NM, type: clean(n.AIS_TP_CD_NM), total, mv, start: starts[0] ?? null, end: ends[ends.length - 1] ?? null, supplyRows: own.length, nowCount });
        (p3ByPan.get(n.PAN_ID) || p3ByPan.set(n.PAN_ID, []).get(n.PAN_ID)).push(p);
      }
    }
    for (const p of p3ByKey.values()) {
      const ns = p.notices.sort(cmpBy((x) => x.date ?? '', (x) => x.panId));
      for (const id of [...new Set(ns.map((x) => x.panId))].sort()) p.ids.push(idRow('LH_PAN_ID', id, 'LH', 'lhNotice'));
      const groups = new Map();
      for (const x of ns) { const g = NL.noticeGroup(x.title); (groups.get(g) || groups.set(g, []).get(g)).push(x); }
      for (const gs of groups.values()) {
        const dated = gs.filter((x) => x.date);
        if (!dated.length) { bump('lhNotice', '공고일 오염(공급 공고 이력 안 만듦)'); continue; }
        const [main, ...rest] = dated;
        p.events.push(evRow('SUPPLY_NOTICE', actualOrPlanned(main.date), main.date, `LH 공고 ${main.panId}(${main.type})${main.start || main.end ? ` · 접수 ${main.start ?? '?'} ~ ${main.end ?? '?'}` : ''}${rest.length ? ` · 정정·재공고 ${[...new Set(rest.map((r) => r.panId))].join(', ')}` : ''}`, 'lhNotice'));
        const withSup = gs.filter((x) => x.supplyRows && x.nowCount > 0);
        if (withSup.length) {
          const last = withSup[withSup.length - 1];
          p.units.push(unitRow('NOTICE', last.type, last.nowCount, monthOf(main.date), 'SUBTYPE', 'lhSupply'));
          bump('lhSupply', '변환: 공고 물량 행(금회공급 합)');
        }
      }
      /* 단지 총세대수: 단지 이름에 공급유형이 붙어 있으면('… 국민임대주택'·'C1(공분)') 그 값이 유형 몫인지 블록 전체인지 공고마다 달라(실측) 유형 몫(SUBTYPE)·검토로 둔다 */
      const latestTotal = [...ns].reverse().find((x) => x.total);
      if (latestTotal) {
        const typed = TYPE_MARK.test(p.name);
        p.units.push(unitRow('PROJECT_PLAN', typed ? latestTotal.type : '', latestTotal.total, monthOf(latestTotal.date), typed ? 'SUBTYPE' : 'TOTAL', 'lhDetail', typed ? 'REVIEW_REQUIRED' : 'CONFIRMED'));
        if (typed) bump('lhDetail', '단지 이름에 공급유형이 붙어 총세대수를 유형 몫·검토로 둠');
      }
      if (new Set(ns.filter((x) => x.total).map((x) => x.total)).size > 1) bump('lhDetail', '단지 총세대수가 공고마다 다름(가장 늦은 공고 값)');
      const latestMv = [...ns].reverse().find((x) => x.mv);
      if (latestMv) {
        p.events.push(evRow('MOVE_IN', 'PLANNED', latestMv.mv, `입주예정월(LH 공고 ${latestMv.panId})`, 'lhDetail'));
        const first = ns.find((x) => x.date);
        if (first && latestMv.mv < addMonths(monthOf(first.date), -12)) {
          p.reviews.push({ review_type: 'STOCK_COMPLEX_NOTICE', source: 'lhDetail', record_key: `PAN_ID ${latestMv.panId}`, record_name: p.name, detail: `입주예정월 ${latestMv.mv} · 첫 최초 모집공고 ${first.date}(${first.panId}) · 공급유형 ${first.type}`, reason: '입주예정월이 공고보다 1년 넘게 앞서 이미 입주한 재고 단지의 모집일 수 있음(notice-link.js 규칙상 최초 모집이라 사업으로 올렸음)' });
        }
      }
      if (new Set(ns.filter((x) => x.mv).map((x) => x.mv)).size > 1) bump('lhDetail', '입주예정월이 공고마다 다름(가장 늦은 공고 값)');
      bump('lhDetail', '변환: 사업(단지)');
    }
  }

  /* ── P4 마이홈 모집공고 ── */
  const p4Links = [];   // [part, p3 part, how]
  {
    const src = 'myhome';
    const rFile = path.join(RAW, 'myhome/rental.json'), sFile = path.join(RAW, 'myhome/sale.json');
    addInput(rFile); addInput(sFile);
    const rows = [...readJson(rFile).items.map((x) => ({ ...x, kind: '임대' })), ...readJson(sFile).items.map((x) => ({ ...x, kind: '분양' }))];
    const before = new Map(rows.filter((r) => r.beforePblancId).map((r) => [String(r.pblancId), String(r.beforePblancId)]));
    const ids = new Set(rows.map((r) => String(r.pblancId)));
    const rootOf = (id) => { let x = String(id); const seen = new Set(); while (before.has(x) && ids.has(before.get(x)) && !seen.has(x)) { seen.add(x); x = before.get(x); } return x; };
    const byKey = new Map();
    for (const r of rows) {
      bump(src, '입력 행(공고×단지)');
      if (String(r.houseSn) === '0' || (!clean(r.hsmpNm) && !r.pnu)) { bump(src, '제외: 단지 없는 행(매입·전세임대 등)'); continue; }
      const kind = NL.noticeKind(r.pblancNm, r.suplyTyNm);
      if (kind !== 'INITIAL') { bump(src, kind === 'FOLLOW_UP' ? '제외: 후속 공고(잔여세대·추가·예비입주자 등)' : kind === 'CANCEL' ? '제외: 취소 공고' : '제외: 비주택 공고'); continue; }
      if (clean(r.houseTyNm) === '오피스텔') { bump(src, '제외: 비주택(오피스텔)'); continue; }
      const pnu = fixPnu(r.pnu);
      const sgg = pnu ? pnu.slice(0, 5) : sggOfAddress(r.fullAdres, idx);
      const sido = pnu ? pnu.slice(0, 2) : SIDO_NAME[clean(r.brtcNm)] ?? sidoOf(sgg, r.fullAdres);
      if (!METRO[sido]) { bump(src, '제외: 대상 지역 밖'); continue; }
      const org = orgShort(r.suplyInsttNm) ?? (clean(r.suplyInsttNm) === 'LH' ? 'LH' : null);
      if (!org) { bump(src, '제외: 공급기관이 공공기관 사전에 없음'); continue; }
      const key = r.pnu ? String(r.pnu) : `${rootOf(r.pblancId)}-${r.houseSn}`;
      let p = byKey.get(key);
      if (!p) {
        const db = parseDistrictBlock(r.hsmpNm);
        p = newPart('P4', key, null, { id: waveId('MYH', `HWSPR02|${key}`), name: clean(r.hsmpNm) || clean(r.fullAdres), district: db?.district ?? null, block: db?.block ?? null, sgg, sido, org, notices: [], panIds: new Set() });
        byKey.set(key, p);
        if (pnu) { p.pnus.add(pnu); p.ids.push(idRow('PNU', pnu, '국토교통부', src)); }
      }
      const panId = (/panId=([0-9A-Za-z]+)/.exec(r.url ?? '') ?? [])[1] ?? null;
      if (panId) p.panIds.add(panId);
      p.notices.push({ id: String(r.pblancId), root: rootOf(r.pblancId), date: cleanDay(r.rcritPblancDe), start: cleanDay(r.beginDe), end: cleanDay(r.endDe), sup: intOf(r.sumSuplyCo), total: intOf(r.totHshldCo), type: clean(r.suplyTyNm) || r.kind, panId });
    }
    for (const p of byKey.values()) {
      const ns = p.notices.sort(cmpBy((x) => x.date ?? '', (x) => x.id));
      for (const id of [...new Set(ns.map((x) => x.id))].sort()) p.ids.push(idRow('MYHOME_PBLANC_ID', id, '국토교통부', src));
      for (const id of [...p.panIds].sort()) p.ids.push(idRow('LH_PAN_ID', id, 'LH', src));
      const groups = new Map();
      for (const x of ns) (groups.get(x.root) || groups.set(x.root, []).get(x.root)).push(x);
      for (const gs of groups.values()) {
        const dated = gs.filter((x) => x.date);
        if (!dated.length) { bump(src, '공고일 오염(공급 공고 이력 안 만듦)'); continue; }
        const [main, ...rest] = dated;
        p.events.push(evRow('SUPPLY_NOTICE', actualOrPlanned(main.date), main.date, `마이홈 공고 ${main.id}${main.start || main.end ? ` · 접수 ${main.start ?? '?'} ~ ${main.end ?? '?'}` : ''}${rest.length ? ` · 정정공고 ${[...new Set(rest.map((r) => r.id))].join(', ')}` : ''}`, src));
        const last = [...gs].reverse().find((x) => x.sup);
        if (last) p.units.push(unitRow('NOTICE', last.type, last.sup, monthOf(main.date), 'SUBTYPE', src));
      }
      const tot = [...ns].reverse().find((x) => x.total);
      if (tot) p.units.push(unitRow('PROJECT_PLAN', '', tot.total, monthOf(tot.date), 'TOTAL', src));
      bump(src, '변환: 마이홈 단지(합치기 전)');
      /* panId 로 LH 공고의 단지를 찾는다: 그 공고 단지가 하나이거나 PNU 앞 15자리·단지 이름이 맞는 단지가 하나일 때만 */
      for (const pan of [...p.panIds].sort()) {
        const cands = [...new Set(p3ByPan.get(pan) ?? [])];
        if (!cands.length) continue;
        let hit = cands.length === 1 ? cands : cands.filter((c) => [...c.pnus].some((x) => [...p.pnus].some((y) => pnu15(x) === pnu15(y))) || compact(c.name) === compact(p.name));
        if (hit.length === 1) p4Links.push([p, hit[0], `panId ${pan}`]);
        else p.reviews.push({ review_type: 'LINK_CANDIDATE', source: src, record_key: `panId ${pan}`, record_name: p.name, detail: `LH 공고 ${pan} 의 단지 ${cands.length}개(${cands.map((c) => c.name).join(' · ')}) 중 하나로 정하지 못함`, reason: '마이홈 공고의 LH 공고번호는 같지만 그 공고 단지가 여럿이고 PNU·단지 이름으로 하나를 고르지 못해 합치지 않았다' });
      }
    }
  }

  /* ── P2 청약홈 APT 분양정보 ── */
  {
    const src = 'applyhome';
    const dir = path.join(RAW, 'applyhome');
    const ops = ['getAPTLttotPblancDetail', 'getAPTLttotPblancMdl', 'getUrbtyOfctlLttotPblancDetail', 'getRemndrLttotPblancDetail', 'getPblPvtRentLttotPblancDetail', 'getOPTLttotPblancDetail'];
    for (const op of ops) addInput(path.join(dir, `${op}.json`));
    const metroOf = (r) => { const sgg = sggOfAddress(r.HSSPLY_ADRES, idx); return sidoOf(sgg, r.HSSPLY_ADRES) ?? SIDO_NAME[clean(r.SUBSCRPT_AREA_CODE_NM)] ?? null; };
    const why = {
      getUrbtyOfctlLttotPblancDetail: '오피스텔·도시형생활주택·민간임대·생활숙박(비주택·민간)',
      getRemndrLttotPblancDetail: '무순위·불법행위 재공급(같은 사업의 후속 공고)',
      getPblPvtRentLttotPblancDetail: '공공지원민간임대(민간 시행)',
      getOPTLttotPblancDetail: '임의공급(같은 사업의 후속 공고)',
    };
    for (const [op, reason] of Object.entries(why)) {
      const rows = readJson(path.join(dir, `${op}.json`)).rows;
      bump(src, `제외 오퍼레이션 ${op}: 행(사업 안 만듦 — ${reason})`, rows.length);
      bump(src, `제외 오퍼레이션 ${op}: 그중 수도권`, rows.filter((r) => METRO[metroOf(r)]).length);
      bump(src, `제외 오퍼레이션 ${op}: 그중 수도권·공공 사업주체`, rows.filter((r) => METRO[metroOf(r)] && classifyOperator(r.BSNS_MBY_NM).public).length);
    }
    const mdl = new Map();
    for (const m of readJson(path.join(dir, 'getAPTLttotPblancMdl.json')).rows) mdl.set(m.HOUSE_MANAGE_NO, (mdl.get(m.HOUSE_MANAGE_NO) ?? 0) + (Number(m.SUPLY_HSHLDCO) || 0) + (Number(m.SPSPLY_HSHLDCO) || 0));
    const FOLLOW = /잔여|추가|예비|선착순|매각|재공급|무순위|해약|계약취소/;
    for (const r of readJson(path.join(dir, 'getAPTLttotPblancDetail.json')).rows) {
      bump(src, 'APT 입력 공고');
      const sgg = sggOfAddress(r.HSSPLY_ADRES, idx), sido = metroOf(r);
      if (!METRO[sido]) { bump(src, 'APT 제외: 대상 지역 밖'); continue; }
      const no = String(r.HOUSE_MANAGE_NO).trim(), name = clean(r.HOUSE_NM);
      if (FOLLOW.test(name)) { bump(src, 'APT 제외: 후속 공고(잔여세대·추가모집 등, 이름 기준)'); continue; }
      const op = classifyOperator(r.BSNS_MBY_NM);
      const base = { source: src, record_key: `HOUSE_MANAGE_NO ${no}`, record_name: name };
      if (!op.public) {
        if (op.publicWordOnly) { bump(src, 'APT 제외: 공공 이름이 든 조합·PFV 등(검토 목록)'); review.push({ ...base, review_type: 'PUBLIC_SCOPE_UNKNOWN', detail: `사업주체 ${clean(r.BSNS_MBY_NM)} · 공고일 ${cleanDay(r.RCRIT_PBLANC_DE) ?? '?'} · 공공택지 ${r.PUBLIC_HOUSE_EARTH_AT || '?'}`, reason: '사업주체 이름에 공공기관 이름이 있으나 조합·PFV·리츠 등 민간 주체라 공공으로 보지 않았다(결정 4)' }); }
        else if (r.PUBLIC_HOUSE_EARTH_AT === 'Y') { bump(src, 'APT 제외: 공공택지 민간 사업주체(검토 목록)'); review.push({ ...base, review_type: 'PRIVATE_ON_PUBLIC_LAND', detail: `사업주체 ${clean(r.BSNS_MBY_NM)} · 공고일 ${cleanDay(r.RCRIT_PBLANC_DE) ?? '?'} · 공급 ${r.TOT_SUPLY_HSHLDCO}세대`, reason: '공공택지(PUBLIC_HOUSE_EARTH_AT=Y) 공고지만 사업주체가 민간이라 제외했다(결정 4)' }); }
        else bump(src, 'APT 제외: 공공 아님(민간 사업주체)');
        continue;
      }
      const pnuR = ML.jibunToPnu(r.HSSPLY_ADRES, idx);
      const db = parseDistrictBlock(name) ?? parseDistrictBlock(r.HSSPLY_ADRES);
      const p = newPart('P2', no, null, { id: waveId('APH', `15098547|${no}`), name, district: db?.district ?? null, block: db?.block ?? null, sgg: pnuR.pnu ? pnuR.pnu.slice(0, 5) : sgg, sido, org: op.orgs.join('·') });
      p.ids.push(idRow('APPLYHOME_HOUSE_MANAGE_NO', no, '한국부동산원', src));
      if (pnuR.pnu) { p.pnus.add(pnuR.pnu); p.ids.push(idRow('PNU', pnuR.pnu, '국토교통부', src)); bump(src, 'APT 공급위치로 PNU 만듦'); }
      if (op.joint) p.reviews.push({ ...base, review_type: 'PUBLIC_PRIVATE_JOINT', detail: `사업주체 ${clean(r.BSNS_MBY_NM)} · 공급 ${r.TOT_SUPLY_HSHLDCO}세대`, reason: '공공기관과 민간의 공동 사업주체라 포함했으나 공공 몫을 원천에서 나눌 수 없다(결정 4)' });
      const d = cleanDay(r.RCRIT_PBLANC_DE);
      if (d) p.events.push(evRow('SUPPLY_NOTICE', actualOrPlanned(d), d, `청약홈 공고 ${no} · 접수 ${cleanDay(r.RCEPT_BGNDE) ?? '?'} ~ ${cleanDay(r.RCEPT_ENDDE) ?? '?'}`, src));
      else bump(src, 'APT 모집공고일 오염(이력 안 만듦)');
      const mv = cleanMonth(r.MVN_PREARNGE_YM);
      if (mv) p.events.push(evRow('MOVE_IN', 'PLANNED', mv, `입주예정월(청약홈 공고 ${no})`, src));
      const old = mv && d && mv < addMonths(monthOf(d), -12);
      if (old || ROUND_NOTICE.test(name)) {
        p.reviews.push({ ...base, review_type: 'STOCK_COMPLEX_NOTICE', detail: `${old ? `입주예정월 ${mv} · 공고일 ${d}` : `회차 모집 공고 이름 · 공고일 ${d ?? '?'} · 공급위치 ${clean(r.HSSPLY_ADRES)}`} · 공급 ${r.TOT_SUPLY_HSHLDCO}세대`, reason: old ? '입주예정월이 공고보다 1년 넘게 앞서 이미 입주한 재고 단지의 모집일 수 있음(사업으로 올렸음)' : '회차·정기 모집 공고라 여러 재고 단지를 한 공고로 모집했을 수 있음 — 공급위치는 대표 단지일 수 있다(사업으로 올렸음)' });
        bump(src, 'APT 재고 단지 모집 의심(검토 목록, 사업은 올림)');
      }
      else if (clean(r.MVN_PREARNGE_YM)) bump(src, 'APT 입주예정월 오염(이력 안 만듦)');
      const n = intOf(r.TOT_SUPLY_HSHLDCO);
      const htype = `${clean(r.HOUSE_SECD_NM) === '신혼희망타운' ? '신혼희망타운' : clean(r.RENT_SECD_NM) || clean(r.HOUSE_SECD_NM)}${clean(r.HOUSE_DTL_SECD_NM) ? `(${clean(r.HOUSE_DTL_SECD_NM)})` : ''}`;
      if (n) p.units.push(unitRow('NOTICE', htype, n, monthOf(d), 'SUBTYPE', src));
      if (n && mdl.has(no) && mdl.get(no) !== n) bump(src, 'APT 공고 공급호수 ≠ 주택형별(Mdl) 일반+특별 합(공고 값 사용)');
      if (op.joint) bump(src, 'APT 공공+민간 공동 사업주체(포함, 검토 목록)');
      bump(src, 'APT 변환: 사업(공고)');
    }
  }

  /* ── 합치기: 정확한 키(시도+지구+블록 · PNU 19자리 · 마이홈↔LH 공고 단지) → PNU 앞 15자리 ── */
  for (const p of parts) {
    p.ab = p.kind === 'P1' ? abKey(p.sido, p.district, p.block) : p.district ? abKey(p.sido, p.district, p.block) : null;
    p.rank = KIND_RANK[p.kind];
  }
  const parent = parts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const x = find(a), y = find(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y); };
  const index = new Map(parts.map((p, i) => [p, i]));
  const byKeyUnion = (keyOf) => { const first = new Map(); parts.forEach((p, i) => { for (const k of keyOf(p)) { if (first.has(k)) union(first.get(k), i); else first.set(k, i); } }); };
  byKeyUnion((p) => (p.ab ? [`AB|${p.ab}`] : []));
  byKeyUnion((p) => [...p.pnus].map((x) => `P19|${x}`));
  for (const [a, b] of p4Links) union(index.get(a), index.get(b));
  const exactRoot = parts.map((_, i) => find(i));
  byKeyUnion((p) => [...p.pnus].map((x) => `P15|${pnu15(x)}`));
  const clusterMap = new Map();
  parts.forEach((p, i) => { const r = find(i); (clusterMap.get(r) || clusterMap.set(r, []).get(r)).push(p); p.exactRoot = exactRoot[i]; });
  const clusters = [...clusterMap.values()].map((ps) => {
    ps.sort(cmpBy((p) => p.rank, (p) => p.key));
    const rep = ps[0];
    for (const p of ps) p.status = p.exactRoot === rep.exactRoot ? 'CONFIRMED' : 'REVIEW_REQUIRED';   // PNU 앞 15자리로만 이어진 부분은 검토
    const withDb = ps.find((p) => p.district && p.block);
    const c = { parts: ps, rep, pnus: new Set(ps.flatMap((p) => [...p.pnus])), sido: rep.sido, sgg: ps.find((p) => p.sgg)?.sgg ?? null, ids: [], events: [], units: [], reviews: [], hub: [], ledgerKeys: [] };
    c.district = rep.kind === 'P1' ? rep.district : withDb?.district ?? null;
    c.block = rep.kind === 'P1' ? rep.block : withDb?.block ?? null;
    for (const p of ps) {
      const st = (s) => (p.status === 'CONFIRMED' ? s : 'REVIEW_REQUIRED');
      c.ids.push(...p.ids.map((r) => ({ ...r, match_status: st(r.match_status) })));
      c.events.push(...p.events.map((r) => ({ ...r, review_status: st(r.review_status) })));
      c.units.push(...p.units.map((r) => ({ ...r, review_status: st(r.review_status) })));
      c.reviews.push(...p.reviews);
    }
    return c;
  }).sort(cmpBy((c) => c.rep.rank, (c) => c.rep.key));
  for (const k of ['P1', 'P3', 'P4', 'P2']) {
    const src = { P1: 'lhCompletion', P3: 'lhDetail', P4: 'myhome', P2: 'applyhome' }[k];
    const merged = clusters.filter((c) => c.rep.kind !== k && c.parts.some((p) => p.kind === k));
    const viaP15 = parts.filter((p) => p.kind === k && p.status === 'REVIEW_REQUIRED').length;
    bump(src, `합침: 다른 원천 사업에 합쳐진 사업(대표 아님) ${k}`, merged.reduce((a, c) => a + c.parts.filter((p) => p.kind === k).length, 0));
    if (viaP15) bump(src, `합침: 그중 PNU 앞 15자리로만 이어짐(행은 REVIEW_REQUIRED) ${k}`, viaP15);
  }

  /* 보강 대상 색인: PNU 앞 15자리 → 사업(합치기 뒤라 하나뿐), 시군구+블록 → 사업(지구 낱말) */
  const byP15 = new Map();
  for (const c of clusters) for (const x of c.pnus) byP15.set(pnu15(x), c);
  const byBlock = new Map();
  for (const c of clusters) {
    for (const p of c.parts) {
      if (!p.district || !p.block || !p.sgg) continue;
      const blk = HB.normBlock(p.block), token = HB.districtToken(String(p.district).replace(/(공공주택지구|택지개발사업지구|택지개발지구|지구)$/, ''));
      if (!blk || !token) continue;
      const k = `${p.sgg}|${blk}`;
      const arr = byBlock.get(k) || byBlock.set(k, []).get(k);
      if (!arr.some((x) => x.c === c && x.token === compact(token))) arr.push({ c, token: compact(token) });
    }
  }
  const p15Status = (c, pnu) => (c.pnus.has(pnu) ? 'CONFIRMED' : 'REVIEW_REQUIRED');

  /* ── E1 건축HUB 주택인허가 대용량(진행 중 기록) ── */
  const ledgerIds = readJson(path.join(LEDGER, 'tables/identifiers.json')).rows;
  const ledgerProjects = new Map(readJson(path.join(LEDGER, 'tables/projects.json')).rows.map((r) => [r.local_project_id, r]));
  addInput(path.join(LEDGER, 'tables/identifiers.json')); addInput(path.join(LEDGER, 'tables/projects.json')); addInput(path.join(LEDGER, 'manifest.json'));
  const ledgerByHub = new Map(ledgerIds.filter((r) => r.id_type === 'HUB_HS_PK').map((r) => [String(r.id_value), r.local_project_id]));
  const ledgerByArea = new Map(ledgerIds.filter((r) => r.id_type === 'AREA_BLOCK').map((r) => [String(r.id_value), r.local_project_id]));
  {
    const src = 'hubBulk';
    const rawDir = path.join(RAW, 'hub-bulk');
    const hm = readJson(path.join(rawDir, 'manifest.json'));
    for (const f of Object.values(hm.files)) addInput(path.join(rawDir, f.zip), f.zip_sha256, 'sha256 은 hub-bulk.js build() 가 manifest 값과 대조');
    const dataMonth = '2026-08';
    const { records, manifest: bm } = await HB.build(rawDir, { dataMonth, referenceDate: refDate });
    bump(src, '입력 기록(기본개요 행)', bm.funnel.rows);
    for (const [k, v] of Object.entries(bm.funnel)) if (k !== 'rows' && k !== 'kept') bump(src, `제외(hub-bulk.js 거르기): ${k}`, v);
    bump(src, '진행 중 기록(전국)', bm.funnel.kept);
    for (const [k, v] of Object.entries(bm.dates)) if (v.invalid) bump(src, `날짜 오염(${k}, 전체 행)`, v.invalid);
    const now = Date.parse(`${P_lastDay(dataMonth)}T00:00:00Z`);
    for (const rec of records) {
      const at = HB.locate(rec, mapper);
      if (!at.sgg) { bump(src, '제외: 시군구를 못 찾음'); continue; }
      if (!METRO[at.sgg.slice(0, 2)]) { bump(src, '제외: 대상 지역 밖'); continue; }
      bump(src, '수도권 진행 중 기록');
      const cands = new Map();
      if (at.pnu && byP15.has(pnu15(at.pnu))) { const c = byP15.get(pnu15(at.pnu)); cands.set(c, p15Status(c, at.pnu)); }
      const blk = HB.normBlock(rec.block), text = compact(`${rec.name}${rec.complex ?? ''}${rec.special}${rec.address}`);
      if (blk) for (const x of byBlock.get(`${at.sgg}|${blk}`) ?? []) if (NL.hasTok(text, x.token) && !cands.has(x.c)) cands.set(x.c, 'REVIEW_REQUIRED');
      const ledgerPid = ledgerByHub.get(rec.pk) ?? null;
      if (cands.size === 1) {
        const [[c, status]] = [...cands];
        c.hub.push({ rec, status, at });
        bump(src, status === 'CONFIRMED' ? '보강: 공공 사업에 붙음(PNU 19자리 일치)' : '보강: 공공 사업에 붙음(PNU 앞 15자리 또는 시군구+블록+지구 낱말, 행은 REVIEW_REQUIRED)');
        continue;
      }
      const mark = /LH|엘에이치|토지주택|SH공사|에스에이치|GH|행복주택|공공주택|국민임대|영구임대|공공임대|통합공공|공공분양|신혼희망|도시공사/.exec(`${rec.name} ${rec.complex ?? ''} ${rec.special}`);
      const nm = rec.households >= 30 ? clean(rec.name || rec.complex) : '';
      if (cands.size > 1) {
        bump(src, '검토: 붙을 사업이 둘 이상(LINK_CANDIDATE)');
        for (const c of cands.keys()) c.reviews.push({ review_type: 'LINK_CANDIDATE', source: src, record_key: `관리번호 ${rec.pk}`, record_name: nm, detail: `시군구 ${at.sgg} · 블록 ${rec.block || '-'} · 맞는 사업 ${cands.size}개`, reason: 'PNU·블록·지구 낱말로 맞는 공공 사업이 둘 이상이라 붙이지 않았다' });
        continue;
      }
      bump(src, '검토: 공공 근거 없음(PUBLIC_SCOPE_UNKNOWN)');
      review.push({ review_type: 'PUBLIC_SCOPE_UNKNOWN', source: src, record_key: `관리번호 ${rec.pk}`, record_name: nm,
        detail: `시군구 ${at.sgg} ${sigunguOf(at.sgg)} · 승인 ${rec.apprv ?? '?'} · 착공 ${rec.stcns ?? '-'} · 사용검사 ${rec.insp ?? '-'} · 총세대수 ${rec.households}(사업 전체) · PNU ${at.pnu ?? '없음(블록 단위)'} · 원장 ${ledgerPid ?? '없음'}${ledgerPid && ledgerProjects.get(ledgerPid)?.issued_at ? '(발급)' : ledgerPid ? '(미발급 후보)' : ''} · 이름의 공공 표지 ${mark ? mark[0] : '없음'}`,
        reason: '건축HUB 주택인허가에 공공·민간 구분이 없고 공공 사업에 확실한 키로 붙지 않아 사업으로 올리지 않았다. 이름의 공공 표지는 참고용' });
    }
    for (const c of clusters) {
      if (!c.hub.length) continue;
      const recs = c.hub.slice().sort((a, b) => cmp(a.rec.pk, b.rec.pk));
      for (const h of recs) c.ids.push(idRow('HUB_HS_PK', h.rec.pk, '국토교통부', src, h.status));
      const pe = recs.map((h) => permitEvents({ mgmHsrgstPk: h.rec.pk, apprvDay: h.rec.apprv?.replace(/-/g, ''), stcnsDay: h.rec.stcns?.replace(/-/g, ''), useInsptDay: h.rec.insp?.replace(/-/g, ''), totHhldCnt: h.rec.households }, now));
      const suspect = new Set(pe.flat().filter((e) => e.suspect).map((e) => `${e.ref}|${SUSPECT_FIELD[e.type]}`));
      for (const [type, dtype, field, pick, label] of HUB_BULK_FIELDS) {
        const vals = recs.filter((h) => h.rec[field] && !suspect.has(`${h.rec.pk}|${field}`)).sort((a, b) => cmp(a.rec[field], b.rec[field]));
        if (!vals.length) continue;
        const h = pick === 'first' ? vals[0] : vals[vals.length - 1];
        c.events.push(evRow(type, dtype, h.rec[field], `${label}(관리번호 ${h.rec.pk})`, src, h.status));
      }
      if (suspect.size) bump(src, '의심 날짜 뺌(기준일 뒤·순서 모순, lib/permits.js)', suspect.size);
      const latest = recs.reduce((b, h) => (!b || h.rec.apprv > b.rec.apprv || (h.rec.apprv === b.rec.apprv && h.rec.households > b.rec.households) ? h : b), null);
      c.units.push(unitRow('PROJECT_PLAN', '', latest.rec.households, monthOf(latest.rec.apprv), 'TOTAL', src, latest.status));
      for (const h of recs) { const lp = ledgerByHub.get(h.rec.pk); if (lp) c.ledgerKeys.push({ pid: lp, via: `HUB_HS_PK ${h.rec.pk}`, status: h.status }); }
    }
  }

  /* ── E2 입주예정물량 ── */
  {
    const src = 'moveIn';
    const f = path.join(RAW, 'move-in/move-in.utf8.csv');
    addInput(f, null, '원본 한국부동산원_주택공급정보_입주예정물량정보_20260630.csv 의 BOM 제거본(manifest)');
    const rows = parseCsv(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')).filter((r) => r.length > 1);
    const head = rows.shift(), col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
    const seen = new Set();
    for (const r of rows) {
      bump(src, '입력 행');
      if (!METRO[SIDO_NAME[clean(r[col['지역']])]]) { bump(src, '제외: 대상 지역 밖'); continue; }
      const mv = cleanMonth(r[col['입주예정월']]);
      if (!mv) { bump(src, '제외: 입주예정월 오염'); continue; }
      const loc = ML.jibunToPnu(clean(r[col['주소']]), idx);
      if (!loc.pnu) { bump(src, '제외: 지번 주소로 PNU 를 못 만듦'); continue; }
      const c = byP15.get(pnu15(loc.pnu));
      if (!c) { bump(src, '제외: 맞는 공공 사업 없음(PNU 앞 15자리)'); continue; }
      const status = p15Status(c, loc.pnu), n = intOf(r[col['세대수']]);
      c.events.push(evRow('MOVE_IN', 'PLANNED', mv, `입주예정물량 ${clean(r[col['아파트명']])}(${clean(r[col['사업유형']])})`, src, status));
      if (n && !seen.has(c)) { seen.add(c); c.units.push(unitRow('PROJECT_PLAN', '', n, '2026-06', 'TOTAL', src, status)); }
      else if (n) bump(src, '같은 사업에 둘째 행(물량 행은 첫 행만)');
      bump(src, status === 'CONFIRMED' ? '보강: PNU 19자리 일치' : '보강: PNU 앞 15자리 일치(행은 REVIEW_REQUIRED)');
    }
  }

  /* ── E3 단지: 마이홈 공공임대 단지 · 부동산원 단지 식별정보 · 국토부 단지 기본정보 + K-apt 목록 ── */
  const attachComplex = (src, idType, idIssuer, items, label) => {
    /* items: [{ id, pnu(19), date(실제 준공·사용승인일 원문) }] */
    const byC = new Map();
    for (const it of items) {
      const c = byP15.get(pnu15(it.pnu));
      if (!c) continue;
      const status = p15Status(c, it.pnu);
      (byC.get(c) || byC.set(c, []).get(c)).push({ ...it, status });
      bump(src, status === 'CONFIRMED' ? '보강: 단지가 공공 사업에 붙음(PNU 19자리)' : '보강: 단지가 공공 사업에 붙음(PNU 앞 15자리, 행은 REVIEW_REQUIRED)');
    }
    for (const [c, its] of byC) {
      its.sort((a, b) => cmp(a.id, b.id));
      for (const it of its) c.ids.push(idRow(idType, it.id, idIssuer, src, it.status));
      const byDate = new Map();
      for (const it of its) {
        const d = cleanDay(it.date);
        if (!d) { if (clean(it.date)) bump(src, '준공·사용승인일 오염(이력 안 만듦)'); continue; }
        if (d > refDate) { bump(src, '준공·사용승인일이 기준일 뒤(실제 칸이라 이력 안 만듦)'); continue; }
        const k = `${d}|${it.status}`;
        (byDate.get(k) || byDate.set(k, []).get(k)).push(it.id);
      }
      for (const [k, list] of [...byDate].sort(([a], [b]) => cmp(a, b))) {
        const [d, status] = k.split('|');
        c.events.push(evRow('COMPLETION', 'ACTUAL', d, `${label}(${idType} ${list.length}건: ${list.slice(0, 3).join(', ')}${list.length > 3 ? ' 등' : ''})`, src, status));
      }
    }
  };
  {
    const f = path.join(RAW, 'myhome-complex/rentalHouseGwList.json');
    addInput(f);
    const byId = new Map();
    for (const r of readJson(f).rows) {
      const id = String(r.hsmpSn);
      if (!byId.has(id)) byId.set(id, { id, pnu: fixPnu(r.pnu), date: '' });
      const x = byId.get(id);
      if (!x.date && clean(r.competDe)) x.date = clean(r.competDe);
    }
    bump('myhomeComplex', '입력 단지(hsmpSn)', byId.size);
    const items = [...byId.values()].filter((x) => x.pnu && METRO[x.pnu.slice(0, 2)]);
    bump('myhomeComplex', '수도권 단지', items.length);
    attachComplex('myhomeComplex', 'MYHOME_COMPLEX_ID', '국토교통부', items, '마이홈 단지 준공일');
  }
  {
    const f = path.join(RAW, 'reb-complex-id/한국부동산원_공동주택 단지 식별정보_기본정보_20260831.csv');
    addInput(f, readJson(path.join(RAW, 'reb-complex-id/manifest.json')).files.main.sha256, 'sha256 은 manifest 값');
    const rows = parseCsv(decodeCp949(fs.readFileSync(f))).filter((r) => r.length > 1);
    const head = rows.shift().map((h) => h.trim()), col = Object.fromEntries(head.map((h, i) => [h, i]));
    bump('reb', '입력 행(단지)', rows.length);
    const items = [];
    for (const r of rows) {
      const pnu = fixPnu(clean(r[col['필지고유번호']]));
      if (!pnu || !METRO[pnu.slice(0, 2)]) continue;
      items.push({ id: clean(r[col['단지고유번호']]), pnu, date: clean(r[col['사용승인일']]) });
    }
    bump('reb', '수도권 행', items.length);
    attachComplex('reb', 'REB_COMPLEX_ID', '한국부동산원', items, '부동산원 단지 사용승인일');
  }
  {
    const kf = path.join(RAW, 'kapt-list/getTotalAptList4.json'), mf = path.join(RAW, 'molit-complex-file/20261009_단지_기본정보.xlsx');
    addInput(kf); addInput(mf, readJson(path.join(RAW, 'molit-complex-file/manifest.json')).files.main.sha256, 'sha256 은 manifest 값');
    const bjdOf = new Map(readJson(kf).rows.map((r) => [r.kaptCode, String(r.bjdCode ?? '')]));
    bump('kapt', '입력 단지(kaptCode)', bjdOf.size);
    const xr = readXlsxRows(mf);
    const hi = xr.findIndex((r) => Object.values(r).includes('단지코드'));
    const colOf = Object.fromEntries(Object.entries(xr[hi]).map(([k, v]) => [v, k]));
    const seen = new Set(), items = [];
    let rowsN = 0, noBjd = 0, noLot = 0;
    for (const r of xr.slice(hi + 1)) {
      const code = clean(r[colOf['단지코드']]);
      if (!code) continue;
      rowsN++;
      if (seen.has(code)) continue;
      seen.add(code);
      const b0 = bjdOf.get(code);
      const bjd = b0 && /^\d{10}$/.test(b0) ? mapper.bjd(b0) ?? b0 : null;
      if (!bjd) { noBjd++; continue; }
      if (!METRO[bjd.slice(0, 2)]) continue;
      const t = clean(r[colOf['법정동주소']]).split(/[\s,]+/);
      const i = t.findIndex((w) => /^(산)?\d+(-\d+)?$/.test(w));
      const lot = i >= 0 ? /^(산)?(\d+)(?:-(\d+))?$/.exec(t[i]) : null;
      const san = lot && (lot[1] || t[i - 1] === '산');
      const pnu = lot ? makePnu(bjd.slice(0, 5), bjd.slice(5), lot[2], lot[3] ?? '0', san ? '1' : '0') : null;
      if (!pnu) { noLot++; continue; }
      items.push({ id: code, pnu, date: clean(r[colOf['사용승인일']]) });
    }
    bump('molit', '입력 행', rowsN);
    bump('molit', '입력 단지(단지코드)', seen.size);
    bump('molit', '제외: K-apt 목록에 법정동코드 없음', noBjd);
    bump('molit', '수도권 단지 중 법정동주소에서 지번을 못 읽음', noLot);
    bump('molit', '수도권 단지 PNU 만듦(K-apt bjdCode + 지번)', items.length);
    attachComplex('molit', 'KAPT_CODE', '국토교통부', items, '국토부 단지 사용승인일');
  }

  /* ── E4 건축인허가 · 건축물대장(총괄표제부·표제부) — grep 으로 '공동주택' 행만 흘려 읽는다. 건물_명은 어디에도 내보내지 않는다 ── */
  const e4 = [
    { key: 'hubAp', dir: 'hub-bulk-ap', file: 'basic', idType: 'HUB_AP_PK', use: 30, loc: [3, 4, 5, 6, 7],
      dates: [['PERMIT', 'ACTUAL', 38, '건축허가일'], ['CONSTRUCTION_START', 'ACTUAL', 37, '실제착공일'], ['CONSTRUCTION_START', 'PLANNED', 35, '착공예정일'], ['COMPLETION', 'ACTUAL', 39, '사용승인일']] },
    { key: 'bldSummary', dir: 'hub-bulk-bld', file: 'summary', idType: 'HUB_BLD_PK', use: 31, loc: [10, 11, 12, 13, 14],
      dates: [['PERMIT', 'ACTUAL', 47, '허가일'], ['CONSTRUCTION_START', 'ACTUAL', 48, '착공일'], ['COMPLETION', 'ACTUAL', 49, '사용승인일']] },
    { key: 'bldTitle', dir: 'hub-bulk-bld', file: 'title', idType: 'HUB_BLD_PK', use: 35, loc: [8, 9, 10, 11, 12],
      dates: [['PERMIT', 'ACTUAL', 58, '허가일'], ['CONSTRUCTION_START', 'ACTUAL', 59, '착공일'], ['COMPLETION', 'ACTUAL', 60, '사용승인일']] },
  ];
  for (const s of e4) {
    const m = readJson(path.join(RAW, s.dir, 'manifest.json')).files[s.file];
    const zip = path.join(RAW, s.dir, m.zip);
    addInput(zip, m.zip_sha256, 'sha256 은 manifest 값(큰 zip)');
    bump(s.key, '입력 행(manifest)', m.rows);
    const hits = new Map();   // cluster → { pks: Map(pk → status), ev: Map(key → [pk]) }
    let used = 0;
    await eachFilteredLine(zip, m.member, '|공동주택|', (c) => {
      if (String(c[s.use] ?? '').trim() !== '공동주택') return;
      used++;
      const [sg, bj, plat, bun, ji] = s.loc.map((k) => String(c[k] ?? '').trim());
      if (!/^\d{5}$/.test(sg) || !/^\d{5}$/.test(bj)) return;
      const code = mapper.bjd(sg + bj) ?? sg + bj;
      if (!METRO[code.slice(0, 2)]) return;
      const pnu = makePnu(code.slice(0, 5), code.slice(5), bun, ji, plat);
      const cl = pnu && byP15.get(pnu15(pnu));
      if (!cl) return;
      const pk = String(c[0]).trim(), status = p15Status(cl, pnu);
      if (!hits.has(cl)) hits.set(cl, { pks: new Map(), ev: new Map() });
      const h = hits.get(cl);
      if (h.pks.get(pk) !== 'CONFIRMED') h.pks.set(pk, status);
      for (const [type, dtype, i, label] of s.dates) {
        const raw = String(c[i] ?? '').trim();
        if (!raw) continue;
        const d = HB.cleanDate(raw);
        if (!d) { bump(s.key, `날짜 오염(${label}, 붙은 행)`); continue; }
        if (dtype === 'ACTUAL' && d > refDate) { bump(s.key, `실제 날짜가 기준일 뒤(${label}, 이력 안 만듦)`); continue; }
        const k = `${type}|${dtype}|${d}|${status}|${label}`;
        (h.ev.get(k) || h.ev.set(k, []).get(k)).push(pk);
      }
    });
    bump(s.key, '공동주택 행(전국)', used);
    for (const [cl, h] of hits) {
      bump(s.key, '보강: 붙은 공공 사업', 1);
      bump(s.key, '보강: 붙은 관리번호', h.pks.size);
      for (const [pk, st] of [...h.pks].sort(([a], [b]) => cmp(a, b))) cl.ids.push(idRow(s.idType, pk, '국토교통부', s.key, st));
      for (const [k, pks] of [...h.ev].sort(([a], [b]) => cmp(a, b))) {
        const [type, dtype, d, status, label] = k.split('|');
        const u = [...new Set(pks)].sort();
        cl.events.push(evRow(type, dtype, d, `${label}(관리번호 ${u.length}건: ${u.slice(0, 3).join(', ')}${u.length > 3 ? ' 등' : ''})`, s.key, status));
      }
    }
  }

  /* ── 실제 준공 ↔ 예정 모순: 사업 원천(P)이 기준일 뒤 준공·입주 예정인데 보강 원천(E)에 실제 준공(사용승인)이 있으면 다른 건물이 붙었을 수 있다.
     그 보강 원천의 행을 REVIEW_REQUIRED 로 내려 단계에 쓰지 않고 DATE_CONFLICT 로 남긴다 ── */
  const P_SRC = new Set(['lhCompletion', 'lhNotice', 'lhSupply', 'lhDetail', 'myhome', 'applyhome']);
  const whenOf = (e) => e.event_date || e.event_month;
  for (const c of clusters) {
    const late = c.events.filter((e) => P_SRC.has(e.src) && e.date_type === 'PLANNED' && (e.event_type === 'COMPLETION' || e.event_type === 'MOVE_IN') && whenOf(e) > refDate.slice(0, whenOf(e).length));
    if (!late.length) continue;
    const done = c.events.filter((e) => !P_SRC.has(e.src) && e.event_type === 'COMPLETION' && e.date_type === 'ACTUAL');
    const bad = new Set(done.map((e) => e.src));
    if (!bad.size) continue;
    for (const r of c.ids) if (bad.has(r.src)) r.match_status = 'REVIEW_REQUIRED';
    for (const r of [...c.events, ...c.units]) if (bad.has(r.src)) r.review_status = 'REVIEW_REQUIRED';
    const fmt = (es) => { const l = [...new Set(es.map((e) => `${whenOf(e)}(${REF[e.src]})`))].sort(); return l.slice(0, 8).join(' · ') + (l.length > 8 ? ` 외 ${l.length - 8}` : ''); };
    c.reviews.push({ review_type: 'DATE_CONFLICT', source: '', record_key: 'COMPLETION ACTUAL↔PLANNED', record_name: c.rep.name, detail: `실제 준공 ${fmt(done)} ↔ 사업 원천 예정 ${fmt(late)}`, reason: '보강 원천에 실제 준공(사용승인) 기록이 있으나 사업 원천은 기준일 뒤 준공·입주 예정이라 다른 건물이 붙었을 수 있다. 그 보강 원천의 행을 REVIEW_REQUIRED 로 두고 단계에 쓰지 않았다' });
    for (const k of bad) bump(k, '실제 준공이 사업 원천의 예정과 어긋나 이 사업의 행을 REVIEW_REQUIRED 로 내림(사업 수)');
  }

  /* ── 원장 사업번호 대응 → local_project_id ── */
  const usedIds = new Map();
  for (const c of clusters) {
    for (const p of c.parts) if (p.kind === 'P1' && ledgerByArea.has(p.areaBlock)) c.ledgerKeys.unshift({ pid: ledgerByArea.get(p.areaBlock), via: `AREA_BLOCK ${p.areaBlock}`, status: p.status });
    const seenL = new Set();
    c.ledger = c.ledgerKeys.filter((k) => !seenL.has(k.pid) && seenL.add(k.pid));
    const issued = c.ledger.filter((k) => ledgerProjects.get(k.pid)?.issued_at);
    c.id = c.rep.id;
    if (issued.length) {
      const pick = issued[0].pid;
      if (usedIds.has(pick)) c.reviews.push({ review_type: 'DUPLICATE_CANDIDATE', source: 'ledger', record_key: pick, record_name: c.rep.name, detail: `원장 발급 사업 ${pick} 이 이미 다른 사업(${usedIds.get(pick).rep.name})의 번호로 쓰였다(${issued[0].via})`, reason: '원장의 같은 발급 사업에 대응하는 사업이 둘이라 이 사업은 해시 ID 로 두었다(합치지 않음)' });
      else { c.id = pick; usedIds.set(pick, c); }
      if (issued.length > 1) c.reviews.push({ review_type: 'LEDGER_ID_CONFLICT', source: 'ledger', record_key: issued.map((k) => k.pid).join(','), record_name: c.rep.name, detail: issued.map((k) => `${k.pid}(${k.via})`).join(' · '), reason: '원장 발급 사업 둘 이상에 대응해 첫째(AREA_BLOCK 우선, 다음 관리번호 순)를 썼다' });
    }
    for (const k of c.ledger) {
      const isIssued = !!ledgerProjects.get(k.pid)?.issued_at;
      c.ids.push(idRow(isIssued ? 'INTERNAL_PROJECT_ID' : 'LEDGER_CANDIDATE_ID', k.pid, 'HOUSING_WAVE', 'ledger', k.status));
    }
    bump('ledger', c.id.startsWith('PRJ-') ? '사업: 원장 발급 번호를 local_project_id 로' : c.ledger.length ? '사업: 원장 미발급 후보만 대응(식별자만)' : '사업: 원장 대응 없음', 1);
  }
  const allIds = clusters.map((c) => c.id);
  if (new Set(allIds).size !== allIds.length) throw new Error('local_project_id 가 겹친다(해시 충돌 또는 원장 번호 중복)');

  /* ── 사업 행·단계·검토 목록 ── */
  const projects = [];
  for (const c of clusters) {
    const rep = c.rep;
    const hasBlock = c.parts.some((p) => HB.normBlock(p.block));
    projects.push({ local_project_id: c.id, project_name: clean(rep.name), project_unit: hasBlock ? 'BLOCK' : 'AREA_UNKNOWN', parent_area_name: clean(c.district ?? ''),
      block_name: clean(c.block ?? ''), region: METRO[c.sido], sigungu: sigunguOf(c.sgg), organization: [...new Set(c.parts.map((p) => p.org))].join('·'), public_scope: 'PUBLIC',
      project_status: stageOf(c.events, refDate), is_demo: 'false', source_ref: REF[{ P1: 'lhCompletion', P3: 'lhDetail', P4: 'myhome', P2: 'applyhome' }[rep.kind]] });
    if (rep.kind === 'P1' && rep.numericBlock && !hasBlock) c.reviews.push({ review_type: 'BLOCK_NAME_NUMERIC', source: 'lhCompletion', record_key: rep.areaBlock, record_name: rep.name, detail: rep.location, reason: '블록명이 번호뿐이라 지구 안 블록인지 독립 사업인지 원천으로 알 수 없음(project_unit=AREA_UNKNOWN)' });
    /* 날짜 충돌: 같은 종류(이벤트·날짜 구분)의 값이 원천마다 다름. 공급 공고·공정은 공고·시점마다 여럿이라 보지 않는다 */
    const groups = new Map();
    for (const e of c.events) {
      if (e.event_type === 'SUPPLY_NOTICE' || e.event_type === 'PROGRESS') continue;
      const k = `${e.event_type}|${e.date_type}`;
      (groups.get(k) || groups.set(k, []).get(k)).push(e);
    }
    for (const [k, es] of groups) {
      const srcs = new Set(es.map((e) => e.src));
      if (srcs.size < 2) continue;
      const monthOnly = es.some((e) => !e.event_date);
      const vals = new Set(es.map((e) => (monthOnly ? (e.event_date || e.event_month).slice(0, 7) : e.event_date)));
      if (vals.size < 2) continue;
      const list = [...new Set(es.map((e) => `${e.event_date || e.event_month}(${REF[e.src]})`))].sort();
      c.reviews.push({ review_type: 'DATE_CONFLICT', source: '', record_key: k, record_name: c.rep.name, detail: list.slice(0, 12).join(' · ') + (list.length > 12 ? ` 외 ${list.length - 12}` : ''), reason: '같은 종류 날짜가 원천마다 다름. 원천별로 따로 기록했다' });
    }
  }
  /* 중복 사업 후보: (가) 같은 시도·블록이고 지구 이름 하나가 다른 하나를 품음 (나) 같은 시군구·같은 정규화 이름. 합치지 않는다 */
  const GENERIC_NAME = /신혼희망타운|공공분양주택|공공분양|분양주택|행복주택|국민임대주택|국민임대|영구임대주택|영구임대|통합공공임대주택|통합공공임대|공공임대주택|공공임대|본청약|사전청약|이익공유형|입주자모집공고|블록|블럭|BL|아파트|주택/g;
  const nameKey = (s) => compact(String(s ?? '').replace(/\([^()]*\)/g, '')).replace(GENERIC_NAME, '').replace(/[-·,.]/g, '');
  const pairs = new Map();
  const addPair = (a, b, why) => { const [x, y] = [a, b].sort((u, v) => cmp(u.id, v.id)); const k = `${x.id}|${y.id}`; if (x !== y && !pairs.has(k)) pairs.set(k, { x, y, why }); };
  const blockGroups = new Map(), nameGroups = new Map();
  for (const c of clusters) {
    for (const p of c.parts) {
      const blk = HB.normBlock(p.block);
      if (blk && p.district) { const k = `${c.sido}|${blk}`; const arr = blockGroups.get(k) || blockGroups.set(k, []).get(k); arr.push({ c, d: districtKey(p.district) }); }
      const nk = nameKey(p.name);
      if (nk.length >= 3 && c.sgg) { const k = `${c.sgg}|${nk}`; const arr = nameGroups.get(k) || nameGroups.set(k, []).get(k); if (!arr.includes(c)) arr.push(c); }
    }
  }
  for (const [k, arr] of blockGroups) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j];
    if (a.c !== b.c && a.d !== b.d && (a.d.includes(b.d) || b.d.includes(a.d))) addPair(a.c, b.c, `같은 시도·블록 ${k.split('|')[1]} · 지구 '${a.d}' ↔ '${b.d}'`);
  }
  for (const [k, arr] of nameGroups) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) addPair(arr[i], arr[j], `같은 시군구 ${k.split('|')[0]} · 정규화 이름 '${k.split('|')[1]}'`);
  for (const { x, y, why } of pairs.values()) {
    x.reviews.push({ review_type: 'DUPLICATE_CANDIDATE', source: '', record_key: `${x.id}|${y.id}`, record_name: `${clean(x.rep.name)} · ${clean(y.rep.name)}`, detail: `${why} · ${x.parts.map((p) => p.kind).join('+')} ↔ ${y.parts.map((p) => p.kind).join('+')}`, reason: '확실한 키(시도+지구+블록·PNU·공고번호)가 달라 합치지 않았다. 같은 사업인지 확인 필요' });
  }

  /* ── 행 모으기 ── */
  const out = { policies: [], programs: [], links: [], projects, identifiers: [], events: [], units: [], sources: [] };
  const dupUnits = [];
  for (const c of clusters) {
    const seenId = new Set();
    for (const r of c.ids) {
      const k = `${r.id_type}|${r.id_value}|${r.src}`;
      if (seenId.has(k)) continue;
      seenId.add(k);
      out.identifiers.push({ local_project_id: c.id, id_type: r.id_type, id_value: r.id_value, id_issuer: r.id_issuer, source_ref: REF[r.src], match_status: r.match_status });
    }
    for (const e of c.events) out.events.push({ local_project_id: c.id, event_type: e.event_type, date_type: e.date_type, event_date: e.event_date, event_month: e.event_month, progress_pct: '', event_detail: e.event_detail, source_ref: REF[e.src], review_status: e.review_status });
    const seenU = new Set();
    for (const u of c.units) {
      const k = [u.quantity_type, u.housing_type, u.reference_period, u.src].join('|');
      if (seenU.has(k)) { dupUnits.push({ c, u }); continue; }
      seenU.add(k);
      out.units.push({ local_project_id: c.id, quantity_type: u.quantity_type, housing_type: u.housing_type, unit_count: u.unit_count, reference_period: u.reference_period, unit_scope: u.unit_scope, source_ref: REF[u.src], review_status: u.review_status });
    }
    for (const r of c.reviews) review.push({ ...r, local_project_id: c.id });
  }
  if (dupUnits.length) bump('ledger', '물량 키가 겹쳐 뺀 행(같은 사업·종류·유형·시기·원천)', dupUnits.length);
  const reviewRows = review.map((r) => ({ review_type: r.review_type, local_project_id: r.local_project_id ?? '', source_ref: r.source ? REF[r.source] : '', record_key: clean(r.record_key), record_name: clean(r.record_name), detail: clean(r.detail), reason: clean(r.reason) }));
  return { out, review: reviewRows, stats, inputs, manifest, refDate, clusters, sourceMeta: sourceMeta(manifest) };
}

const P_lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

/* 원천 행(sources.csv) 값: 판·기준일·수집일은 manifest 에서. 없으면 빈칸(수집일로 대신 채우지 않는다) */
function sourceMeta(ledgerManifest) {
  const mf = (dir) => readJson(path.join(RAW, dir, 'manifest.json'));
  const catalog = readJson(rel('data/board/sources.json')).items.find((s) => s.id === 'datagokr-15141761');
  const lhN = mf('lh-notice'), lhD = mf('lh-notice-detail'), my = mf('myhome'), ah = mf('applyhome'), hb = mf('hub-bulk'), mv = mf('move-in');
  const mc = mf('myhome-complex'), reb = mf('reb-complex-id'), mo = mf('molit-complex-file'), ka = mf('kapt-list'), ap = mf('hub-bulk-ap'), bl = mf('hub-bulk-bld');
  const ep = (e) => (Array.isArray(e) ? e : [e]).map((u) => String(u).split(' ')[0]);
  return {
    lhCompletion: { provider: '한국토지주택공사(공공데이터포털)', dataset_name: '공공주택 준공예정현황(15141761)', source_url: 'https://www.data.go.kr/data/15141761/fileData.do', source_record_key: '사업지구명+블록명+공급유형', data_as_of: catalog.sourceAsOf, collected_at: kstDate(catalog.collectedAt), original_filename: path.basename(LH_COMPLETION_FILE), notes: `${LH_COMPLETION_FILE} (CP949). 원장 원천 id datagokr-15141761. schemas/ledger-2026-10/raw/lh-completion/ 은 비어 있어 이 파일이 원장 원천. 수집일은 data/board/sources.json 카탈로그` },
    lhNotice: { provider: '한국토지주택공사(공공데이터포털)', dataset_name: 'LH 분양임대공고문 조회(15058530)', source_url: ep(lhN.endpoint)[0], source_record_key: 'PAN_ID', data_as_of: '', collected_at: kstDate(lhN.fetched_at), original_filename: '', notes: `schemas/ledger-2026-10/raw/lh-notice/notices.json (공고일 ${lhN.params.PAN_ST_DT}~${lhN.params.PAN_ED_DT} 창). 원장 원천 id datagokr-15058530. 원천 기준일 칸 없음` },
    lhSupply: { provider: '한국토지주택공사(공공데이터포털)', dataset_name: 'LH 분양임대공고 공급정보 조회(15056765)', source_url: ep(lhN.endpoint)[1], source_record_key: 'PAN_ID+단지명+주택형', data_as_of: '', collected_at: kstDate(lhN.fetched_at), original_filename: '', notes: `schemas/ledger-2026-10/raw/lh-notice/supply.json (건설형 최신 ${lhN.supply_targets}공고만). 금회공급 세대수(NOW_HSH_CNT·SIL_HSH_CNT). 원천 기준일 칸 없음` },
    lhDetail: { provider: '한국토지주택공사(공공데이터포털)', dataset_name: 'LH 분양임대공고별 상세정보 조회(15057999)', source_url: ep(lhD.endpoint)[0], source_record_key: 'PAN_ID+단지명+단지주소', data_as_of: '', collected_at: kstDate(lhD.fetched_at), original_filename: '', notes: 'schemas/ledger-2026-10/raw/lh-notice-detail/details.json (단지 dsSbd·일정 dsSplScdl). 공고 본문·첨부·접수처 전화는 싣지 않음. 원천 기준일 칸 없음' },
    myhome: { provider: '국토교통부 마이홈포털(공공데이터포털)', dataset_name: '마이홈포털 공공주택 모집공고(HWSPR02)', source_url: ep(my.endpoint).join(' · '), source_record_key: 'pblancId+houseSn', data_as_of: '', collected_at: kstDate(my.fetched_at), original_filename: '', notes: `schemas/ledger-2026-10/raw/myhome/rental.json·sale.json (그날 현재 공고, observed_month ${my.params.observed_month}). 원장 원천 id myhome-hwspr02. 문의처(refrnc)는 싣지 않음` },
    applyhome: { provider: '한국부동산원 청약홈(공공데이터포털)', dataset_name: '청약홈 분양정보 조회(15098547) APT 분양정보', source_url: ep(ah.endpoint)[0], source_record_key: 'HOUSE_MANAGE_NO', data_as_of: '', collected_at: kstDate(ah.fetched_at), original_filename: '', notes: 'schemas/ledger-2026-10/raw/applyhome/getAPTLttotPblancDetail.json(+Mdl 대조). 다른 오퍼레이션 4종은 사업을 만들지 않음. 모델하우스 전화(MDHS_TELNO)는 싣지 않음. 원천 기준일 칸 없음' },
    hubBulk: { provider: '국토교통부 건축HUB', dataset_name: `건축HUB 대용량 제공 주택인허가(기본개요·행위개요·대지위치) ${'2026-08'} 데이터`, source_url: ep(hb.endpoint)[0], source_record_key: '관리_주택대장_PK', data_as_of: P_lastDay('2026-08'), collected_at: kstDate(hb.fetched_at), original_filename: Object.values(hb.files).map((f) => f.zip).join(' · '), notes: 'schemas/ledger-2026-10/raw/hub-bulk/ (tools/ledger/hub-bulk.js 날짜 정리·진행 중 규칙). 원장 원천 id hub-bulk-hs-2026-08. raw/hub·raw/hub-refresh 는 값이 같아 쓰지 않음' },
    moveIn: { provider: '한국부동산원(공공데이터포털)', dataset_name: '주택공급정보 입주예정물량정보(15111714)', source_url: 'https://www.data.go.kr/data/15111714/fileData.do', source_record_key: '주소+아파트명', data_as_of: '2026-06-30', collected_at: kstDate(mv.fetched_at), original_filename: mv.files.original.name, notes: 'schemas/ledger-2026-10/raw/move-in/move-in.utf8.csv (BOM 제거본). 원장 원천 id datagokr-15111714. 기준일은 파일 이름' },
    myhomeComplex: { provider: '국토교통부 마이홈포털(공공데이터포털)', dataset_name: '마이홈포털 공공임대주택 단지정보(15110581)', source_url: ep(mc.endpoint)[0], source_record_key: 'hsmpSn', data_as_of: '', collected_at: kstDate(mc.fetched_at), original_filename: '', notes: 'schemas/ledger-2026-10/raw/myhome-complex/rentalHouseGwList.json. 원천 기준일 칸 없음' },
    reb: { provider: '한국부동산원(공공데이터포털)', dataset_name: '공동주택 단지 식별정보 기본정보(15106861)', source_url: ep(reb.endpoint)[0], source_record_key: '단지고유번호', data_as_of: '2026-08-31', collected_at: kstDate(reb.fetched_at), original_filename: reb.files.main.filename, notes: 'schemas/ledger-2026-10/raw/reb-complex-id/ (CP949). 필지고유번호 부번이 모두 0000 이라 PNU 앞 15자리로만 잇는다' },
    molit: { provider: '국토교통부 K-apt(공공데이터포털 15073271)', dataset_name: '공동주택 단지 기본정보(관리비 공개 의무단지)', source_url: ep(mo.endpoint)[0], source_record_key: '단지코드', data_as_of: '2026-10-09', collected_at: kstDate(mo.fetched_at), original_filename: mo.files.main.filename, notes: 'schemas/ledger-2026-10/raw/molit-complex-file/ (xlsx, 2026-10-09 추출). PNU 는 K-apt 목록 bjdCode + 법정동주소의 지번. 시행사·관리사무소 연락처는 싣지 않음' },
    kapt: { provider: '국토교통부 K-apt(공공데이터포털)', dataset_name: '공동주택 단지 목록(15057332 getTotalAptList4)', source_url: ep(ka.endpoint)[0], source_record_key: 'kaptCode', data_as_of: '', collected_at: kstDate(ka.fetched_at), original_filename: '', notes: 'schemas/ledger-2026-10/raw/kapt-list/ (단지코드 → 법정동코드 다리). 원천 기준일 칸 없음' },
    hubAp: { provider: '국토교통부 건축HUB', dataset_name: '건축HUB 대용량 건축인허가 기본개요 2026-08 데이터', source_url: ep(ap.endpoint)[0], source_record_key: '관리_허가대장_PK', data_as_of: P_lastDay('2026-08'), collected_at: kstDate(ap.fetched_at), original_filename: ap.files.basic.zip, notes: 'schemas/ledger-2026-10/raw/hub-bulk-ap/ (주_용도 공동주택 행만, 스트리밍). 건물_명은 개인 이름이 섞여 싣지 않음' },
    bldSummary: { provider: '국토교통부 건축HUB', dataset_name: '건축HUB 대용량 건축물대장 총괄표제부 2026-08 데이터', source_url: ep(bl.endpoint)[0], source_record_key: '관리_건축물대장_PK', data_as_of: P_lastDay('2026-08'), collected_at: kstDate(bl.fetched_at), original_filename: bl.files.summary.zip, notes: 'schemas/ledger-2026-10/raw/hub-bulk-bld/ (주_용도 공동주택 행만). 건물_명은 싣지 않음' },
    bldTitle: { provider: '국토교통부 건축HUB', dataset_name: '건축HUB 대용량 건축물대장 표제부 2026-08 데이터', source_url: ep(bl.endpoint)[0], source_record_key: '관리_건축물대장_PK', data_as_of: P_lastDay('2026-08'), collected_at: kstDate(bl.fetched_at), original_filename: bl.files.title.zip, notes: 'schemas/ledger-2026-10/raw/hub-bulk-bld/ (동 단위, 주_용도 공동주택 행만). 건물_명은 싣지 않음' },
    legalDong: { provider: '국토교통부(공공데이터포털)', dataset_name: '법정동코드(15123287)', source_url: 'https://www.data.go.kr/data/15123287/fileData.do', source_record_key: '법정동코드', data_as_of: '2026-09-29', collected_at: '', original_filename: path.basename(LEGAL_DONG_FILE), notes: `${LEGAL_DONG_FILE} (CP949). 참조 원천: 주소 → 시군구·법정동·PNU, 옛 코드 → 지금 코드. 수집 manifest 가 없어 수집일 빈칸` },
    lhMapping: { provider: '주택파동', dataset_name: 'LH 준공예정 지구·블록 → 시군구·법정동 대응표', source_url: '', source_record_key: 'district+block', data_as_of: '', collected_at: '', original_filename: 'lh-block-sgg.json', notes: 'schemas/ledger-2026-10/mappings/lh-block-sgg.json (tools/ledger/map-lh.js, 법정동코드 2026-09-29 판). 참조 원천' },
    ledger: { provider: '주택파동', dataset_name: '사업 원장 2026-10 사업번호 대응(identifiers·projects 표)', source_url: '', source_record_key: 'AREA_BLOCK·HUB_HS_PK → local_project_id', data_as_of: ledgerManifest.reference_date, collected_at: '', original_filename: 'identifiers.json · projects.json', notes: 'schemas/ledger-2026-10/tables/ 의 사업번호 대응만 쓴다(원장 값은 쓰지 않음). 발급 사업(issued_at)은 local_project_id·INTERNAL_PROJECT_ID, 미발급 후보는 LEDGER_CANDIDATE_ID 식별자로만' },
  };
}

/* 시험 변환: 고른 사업(로컬 ID 또는 사업명)과 그 행만 */
function select(result, only) {
  const { out } = result;
  const keep = new Set(out.projects.filter((p) => only.includes(p.local_project_id) || only.includes(p.project_name)).map((p) => p.local_project_id));
  const missing = only.filter((x) => !out.projects.some((p) => p.local_project_id === x || p.project_name === x));
  if (missing.length) throw new Error(`사업을 찾지 못함: ${missing.join(', ')}`);
  for (const k of ['projects', 'identifiers', 'events', 'units']) out[k] = out[k].filter((r) => keep.has(r.local_project_id));
  result.review = result.review.filter((r) => keep.has(r.local_project_id));
}

function finish(result) {
  const { out } = result;
  /* 원천 행: 어느 행(검토 목록 포함)이 가리키는 원천 + 참조 원천 */
  const used = new Set([...['identifiers', 'events', 'units', 'projects'].flatMap((k) => out[k].map((r) => r.source_ref)), ...result.review.map((r) => r.source_ref)].filter(Boolean));
  out.sources = SOURCES.filter((s) => s.reference || used.has(REF[s.key])).map((s) => ({ source_ref: REF[s.key], source_owner: 'HOUSING_WAVE', ...Object.fromEntries(spec.FILES.sources[1].slice(2).map((h) => [h, clean(result.sourceMeta[s.key][h] ?? '')])) }));
  /* 정렬 */
  out.projects.sort(cmpBy((p) => Object.keys(METRO).find((k) => METRO[k] === p.region), (p) => p.parent_area_name, (p) => natural(p.block_name), (p) => p.project_name, (p) => p.local_project_id));
  const order = new Map(out.projects.map((p, i) => [p.local_project_id, String(i).padStart(6, '0')]));
  for (const k of ['identifiers', 'units']) out[k].sort(cmpBy((r) => order.get(r.local_project_id), ...spec.FILES[k][1].slice(1).map((h) => (r) => r[h])));
  out.events.sort(cmpBy((r) => order.get(r.local_project_id), (r) => r.event_date || r.event_month, (r) => r.event_type, (r) => r.date_type, (r) => r.source_ref, (r) => r.event_detail, (r) => r.review_status));
  const kinds = Object.keys(spec.REVIEW_TYPES);
  result.review.sort(cmpBy((r) => String(kinds.indexOf(r.review_type)).padStart(2, '0'), (r) => order.get(r.local_project_id) ?? '~', (r) => r.source_ref, (r) => r.record_key, (r) => r.detail));
}

/* ────────────────────────── 문서 ────────────────────────── */

function report(result, counts, errors, trial, outDir) {
  const { stats, inputs } = result;
  const L = ['# 변환 보고서 — 원천(raw) → 주택파동 공통규격 v1.4', '',
    `이 파일은 \`tools/common_v1_4_raw/convert.js\` 가 만든다. 같은 입력이면 같은 내용이 나온다(실행 시각을 적지 않는다). 기준일 ${result.refDate}(schemas/ledger-2026-10/manifest.json reference_date).${trial ? ' **시험 변환(--only, 고른 사업과 그 행만)** — 아래 원천별 건수는 전체 변환 기준이다.' : ''}`, '',
    '## 1. 입력 파일', '', '| 파일 | SHA-256 | 비고 |', '|---|---|---|'];
  L.push(...inputs.map((i) => `| \`${i.path}\` | \`${i.sha256}\` | ${i.note} |`));
  L.push('', '## 2. 출력 파일', '', '| 파일 | 행 수 |', '|---|---:|', ...Object.entries(counts).map(([n, c]) => `| \`${n}\` | ${c.toLocaleString('en-US')} |`));
  const status = {};
  for (const k of ['identifiers', 'events', 'units']) for (const r of result.out[k]) { const s = r.match_status || r.review_status; status[`${k}|${s}`] = (status[`${k}|${s}`] ?? 0) + 1; }
  L.push('', '행 상태(CONFIRMED / REVIEW_REQUIRED): ' + ['identifiers', 'events', 'units'].map((k) => `${k} ${(status[`${k}|CONFIRMED`] ?? 0).toLocaleString('en-US')} / ${(status[`${k}|REVIEW_REQUIRED`] ?? 0).toLocaleString('en-US')}`).join(' · '));
  const pst = {};
  for (const p of result.out.projects) pst[p.project_status || '(빈칸)'] = (pst[p.project_status || '(빈칸)'] ?? 0) + 1;
  const reg = {};
  for (const p of result.out.projects) reg[p.region] = (reg[p.region] ?? 0) + 1;
  L.push('', `사업 ${result.out.projects.length.toLocaleString('en-US')}건 — 지역 ${Object.entries(reg).map(([k, v]) => `${k} ${v}`).join(' · ')} · 단계 ${Object.entries(pst).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const repKinds = {};
  for (const c of result.clusters) { const k = c.parts.map((p) => p.kind).filter((x, i, a) => a.indexOf(x) === i).join('+'); repKinds[k] = (repKinds[k] ?? 0) + 1; }
  L.push(`사업을 만든 원천 조합(P1 LH 준공예정 · P3 LH 공고 단지 · P4 마이홈 · P2 청약홈): ${Object.entries(repKinds).sort(([a], [b]) => cmp(a, b)).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  L.push('', '## 3. 원천별 입력·제외·변환·합침 건수', '', '| source_ref | 원천 | 항목 | 건수 |', '|---|---|---|---:|');
  for (const s of SOURCES) for (const [k, v] of Object.entries(stats[s.key] ?? {})) L.push(`| ${REF[s.key]} | ${s.name} | ${k} | ${v.toLocaleString('en-US')} |`);
  L.push('', '## 4. 쓰지 않은 원천', '', '| 원천(raw 폴더) | 행 수 | 이유 |', '|---|---:|---|');
  for (const x of result.excluded) L.push(`| ${x.name} | ${x.rows} | ${x.why} |`);
  L.push('', '## 5. 검토 필요 항목(`review_required.csv`)', '', '| 유형 | 건수 | 뜻 |', '|---|---:|---|');
  const rc = {};
  for (const r of result.review) rc[r.review_type] = (rc[r.review_type] ?? 0) + 1;
  for (const [k, m] of Object.entries(spec.REVIEW_TYPES)) L.push(`| \`${k}\` | ${(rc[k] ?? 0).toLocaleString('en-US')} | ${m} |`);
  const marked = result.review.filter((r) => r.review_type === 'PUBLIC_SCOPE_UNKNOWN' && r.source_ref === REF.hubBulk && !/공공 표지 없음$/.test(r.detail)).length;
  L.push('', `\`PUBLIC_SCOPE_UNKNOWN\` 의 건축HUB 기록 중 이름에 공공 표지(LH·SH·행복주택·공공주택·국민임대 등)가 있는 것은 ${marked.toLocaleString('en-US')}건이다. 표지는 참고용이고 확정 근거가 아니다. 총세대수 30 미만 기록은 개인 이름이 섞일 수 있어 record_name 을 비웠다.`);
  L.push('', '## 6. 원천에 없어 비워 둔 값', '',
    '- `정책_policies.csv`·`프로그램_programs.csv`·`정책사업연결_links.csv`: raw 원천에 정책·프로그램과 사업을 잇는 근거가 없어 헤더만 냈다(V-World 지구 이름 등으로 추정해 만들지 않음).',
    '- `MOVE_IN_ACTUAL`·`SUPPLY_PLAN` 물량, `PROGRESS` 이력: 원천 없음.',
    '- `project_status`: 기준일 이전 ACTUAL·CONFIRMED 이벤트가 없는 사업은 빈칸(field_mapping.md 4절).',
    '- `parent_area_name`·`block_name`: LH 준공예정 외 원천은 이름에서 블록 코드가 하나로 읽힐 때만 채웠다. 못 읽으면 빈칸이고 project_unit 은 AREA_UNKNOWN.',
    '- `sigungu`: 주소의 시군구 이름이 법정동코드 파일과 맞지 않으면 빈칸.',
    '- 원천 `data_as_of`: 원천 기준일 칸이 없는 API 원천(LH 공고·공급정보·상세, 마이홈, 청약홈, 마이홈 단지, K-apt 목록)은 빈칸이다(수집일로 대신 채우지 않았다). `collected_at`: 수집 manifest 가 없는 법정동코드·대응표·원장은 빈칸.',
    '- 청약홈 `PBLANC_NO` 는 모든 행에서 `HOUSE_MANAGE_NO` 와 같아 식별자로 따로 싣지 않았다.',
    '', '## 7. 검증', '');
  L.push(errors.length ? `검증 실패 ${errors.length}건` : '검증 통과 (UTF-8 BOM·헤더·CRLF·필수 칸·허용값·날짜·숫자·NULL·앞뒤 공백·인증키·ID 중복·참조 무결성·DEMO·행 중복·물량 키 중복·날짜/월 하나만·PROGRESS 범위)');
  if (errors.length) L.push('', ...errors.slice(0, 100).map((e) => `- ${e}`));
  L.push('', '양식 ZIP 헤더 대조는 `--spec-zip` 으로 따로 돌린다(README.md).', '', '## 8. 다시 만들기', '', '```',
    `node tools/common_v1_4_raw/convert.js --out ${outDir === DEFAULT_OUT ? '~/Downloads/housing_wave_common_v1_4_raw' : outDir}`,
    `node tools/common_v1_4_raw/validate.js ${outDir === DEFAULT_OUT ? '~/Downloads/housing_wave_common_v1_4_raw' : outDir} --spec-zip "/Users/bcchung81/Downloads/공통규격 양식.zip"`, '```', '');
  return L.join('\n');
}

function excludedSources() {
  const mf = (dir) => { const f = path.join(RAW, dir, 'manifest.json'); return fs.existsSync(f) ? readJson(f) : null; };
  const countHub = (dir) => {
    let n = 0, files = 0;
    for (const f of fs.readdirSync(path.join(RAW, dir)).filter((x) => /^\d+\.json$/.test(x)).sort()) {
      files++;
      for (const pg of readJson(path.join(RAW, dir, f)).pages ?? []) n += (pg.items ?? []).length;
    }
    return `${n.toLocaleString('en-US')} (${files}파일)`;
  };
  const vw = mf('vworld-district');
  const histFiles = fs.readdirSync(path.join(RAW, 'hub-bulk-history')).filter((x) => x.endsWith('.zip')).length;
  const demo = path.join(LEDGER, 'agency/demo');
  const demoRows = fs.readdirSync(demo).filter((x) => x.endsWith('.csv')).sort().reduce((a, f) => a + Math.max(0, parseCsv(fs.readFileSync(path.join(demo, f), 'utf8').replace(/^﻿/, '')).filter((r) => r.length > 1).length - 1), 0);
  return [
    { name: 'HUG 분양이력(`hug-sale-history`)', rows: (mf('hug-sale-history').records).toLocaleString('en-US'), why: '사업주체·시행사에 공공 근거가 없고(민간 분양 중심) 사업번호·필지가 없어 확실한 키로 붙일 수 없음' },
    { name: 'HUG 분양보증 발급현황(`hug-guarantee`)', rows: mf('hug-guarantee').files.main.rows.toLocaleString('en-US'), why: '연도(분기)×시도 합계 통계라 사업 단위가 아님' },
    { name: '청약홈 경쟁률·특별공급 신청(`applyhome-cmpet`)', rows: mf('applyhome-cmpet').records.toLocaleString('en-US'), why: '접수 건수·경쟁률·가점을 담을 칸이 규격에 없음' },
    { name: 'V-World 지구·블록·국민임대·보금자리 경계(`vworld-district`)', rows: vw.records.toLocaleString('en-US'), why: '블록 이름(A1 등)이 없어 블록 사업에 잇지 못하고, 지구 경계만으로 사업을 만들지 않음' },
    { name: '건축HUB 주택인허가 과거 판(`hub-bulk-history`)', rows: `${histFiles}판`, why: '이번 변환은 2026-08 판 하나(원장 대용량 판)를 쓴다. 월별 상태 소급은 규격 밖' },
    { name: '택지정보 6종(`jigu-file`)', rows: '0', why: '원본 사이트 점검 중으로 받지 못해 파일이 없음(manifest 만)' },
    { name: '행복도시 준공계획(`sejong-completion`)', rows: mf('sejong-completion').files.main.rows.toLocaleString('en-US'), why: '세종시라 대상 지역(서울·경기·인천) 밖' },
    { name: 'LH 임대주택단지 조회(`lh-lease-complex`)', rows: mf('lh-lease-complex').records.toLocaleString('en-US'), why: 'PNU·단지코드·주소가 없고 지역+이름만 있어 확실한 키가 없음' },
    { name: 'LH 임대주택단지정보_건설(`lh-rental-complex`)', rows: mf('lh-rental-complex').files.main.rows.toLocaleString('en-US'), why: 'PNU 가 없고 주소·이름 대조만 가능해 확실한 키가 없음(2025-09 판)' },
    { name: '건축HUB 주택인허가 OpenAPI(`hub`)', rows: countHub('hub'), why: '2026-08 대용량 판과 관리번호·값이 같아 중복' },
    { name: '건축HUB 주택인허가 OpenAPI 갱신(`hub-refresh`)', rows: countHub('hub-refresh'), why: '2026-08 대용량 판과 관리번호·날짜·세대수가 같아(값 차이 0) 중복' },
    { name: '기관 입력 예시(`agency/demo`)', rows: demoRows.toLocaleString('en-US'), why: "'[가상]' DEMO 자료라 실데이터 제출본에서 뺌" },
    { name: '원장 표(`tables/`) 값', rows: '—', why: '원천에서 다시 만든다. 사업번호 대응(identifiers·projects)만 참조(WAVE-SRC-18)' },
  ];
}

function fieldMapping() {
  const P = spec.PROPOSED;
  return `# 필드 대응표 — 원천(raw) → 공통규격 v1.4

기준: \`공통규격 양식.zip\`(README_제출안내.md, CSV 8종 헤더). 변환 코드 \`tools/common_v1_4_raw/convert.js\`. 이전 변환기(\`tools/common_v1_4\`, 화면 자료 기준)의 제안 코드·검토 유형·LH 블록 임시 ID 를 이어 쓴다.

## 1. 범위 (2026-10-12 사용자 승인 결정)

1. 대상 지역: 서울·경기·인천(시도 코드 11·41·28). 다른 시도 행은 제외 건수로만 보고.
2. 사업 범위: '공급 진행 사업'만 사업으로 올린다 — LH 공공주택 준공예정 블록(P1) + 공공 모집공고의 단지(LH 공고 P3 · 마이홈 P4 · 청약홈 APT P2). 단지 원천·인허가·준공 원천·입주예정물량은 위 사업에 확실한 키로 붙을 때만 식별자·이력·물량을 보강한다(E1~E4).
3. 합치기: 확실한 키가 정확히 같을 때만(3절).
4. 청약홈 공공 판단: 사업주체가 공공기관 사전(5절)에 있을 때만 공공. 공공택지(Y)인데 민간이면 제외하고 \`PRIVATE_ON_PUBLIC_LAND\`, 공공+민간 공동이면 포함하고 \`PUBLIC_PRIVATE_JOINT\`.
5. LH 준공예정 물량 = \`PUBLIC_PLAN\`. 공공 사업에 안 붙은 수도권 진행 중 건축HUB 주택인허가는 \`PUBLIC_SCOPE_UNKNOWN\` 검토 행으로만. 정책·프로그램·연결은 헤더만.

## 2. 원천 → 칸

| source_ref | 원천 | 쓰는 칸 → 규격 |
|---|---|---|
| ${REF.lhCompletion} | LH 공공주택 준공예정(15141761) CSV | (사업지구명, 블록명) → 사업 1건 · \`AREA_BLOCK\`=지구\\|블록 · 공급유형별 세대수 → units \`PUBLIC_PLAN\`/SUBTYPE(reference_period = 준공예정월) · 준공예정일 → events \`COMPLETION\` PLANNED |
| ${REF.lhMapping} | lh-block-sgg.json | 지구·블록 → 시도·시군구(region·sigungu)·\`BJD_CODE\` |
| ${REF.lhNotice} | LH 분양임대공고문 목록 | 최초 입주자모집 공고(notice-link.js noticeKind=INITIAL)만. \`LH_PAN_ID\` · 공고일(PAN_NT_ST_DT, 없으면 PAN_DT) → \`SUPPLY_NOTICE\` ACTUAL(정정·재공고 묶음마다 하나, 가장 이른 공고일, 정정 공고번호·접수 기간은 event_detail). \`ALL_CNT\` 는 세대수가 아니라 쓰지 않음 |
| ${REF.lhDetail} | LH 공고 상세 dsSbd·dsSplScdl | 단지(이름+주소)마다 사업 · 단지 총세대수(HSH_CNT/SUM_TOT_HSH_CNT) → \`PROJECT_PLAN\`/TOTAL(가장 늦은 공고 값, 기준월 = 그 공고월) · 입주예정월(MVIN_XPC_YM) → \`MOVE_IN\` PLANNED event_month(가장 늦은 공고 값) · 신형 주소(법정동까지)+상세가 지번뿐이면 \`PNU\`(map-lh.js jibunToPnu) · 접수 기간(SBSC_ACP_ST/CLSG_DT) → event_detail |
| ${REF.lhSupply} | LH 공급정보 dsList0N | 같은 공고·같은 단지의 금회공급(NOW_HSH_CNT/SIL_HSH_CNT) 합 → \`NOTICE\`/SUBTYPE(housing_type = 공고 공급유형, 묶음의 가장 늦은 공급정보) |
| ${REF.myhome} | 마이홈 모집공고(HWSPR02) | 단지 있는 최초 모집 행만(houseSn≠0, 오피스텔 제외). 단지 키 = PNU(없으면 정정 묶음 첫 공고+houseSn) · \`PNU\` · \`MYHOME_PBLANC_ID\` · \`LH_PAN_ID\`(url 의 panId) · rcritPblancDe → \`SUPPLY_NOTICE\` ACTUAL(beforePblancId 정정 묶음마다) · sumSuplyCo → \`NOTICE\` · totHshldCo → \`PROJECT_PLAN\` |
| ${REF.applyhome} | 청약홈 APT 분양정보 Detail(+Mdl) | HOUSE_MANAGE_NO 마다 사업 · \`APPLYHOME_HOUSE_MANAGE_NO\` · RCRIT_PBLANC_DE → \`SUPPLY_NOTICE\` ACTUAL · MVN_PREARNGE_YM → \`MOVE_IN\` PLANNED · TOT_SUPLY_HSHLDCO → \`NOTICE\`/SUBTYPE(housing_type = 신혼희망타운 또는 RENT_SECD_NM) · 공급위치가 깨끗한 지번 주소면 \`PNU\`. Mdl 은 공급호수 대조에만 |
| ${REF.hubBulk} | 건축HUB 주택인허가 대용량 2026-08 | hub-bulk.js build()(날짜 1990~2040 달력 유효만, 진행 중 규칙). 붙은 기록: \`HUB_HS_PK\` · 승인일 → \`PERMIT\` ACTUAL · 착공일/착공예정일 → \`CONSTRUCTION_START\` ACTUAL/PLANNED · 사용검사일/예정일 → \`COMPLETION\` ACTUAL/PLANNED(여러 기록이면 원장 convert.js 와 같은 first/last, lib/permits.js 의심 값 뺌) · 가장 늦은 승인 기록의 총세대수 → \`PROJECT_PLAN\`/TOTAL(기준월 = 승인월) |
| ${REF.moveIn} | 입주예정물량(15111714) | 지번 주소 → PNU(jibunToPnu) 앞 15자리가 공공 사업과 같을 때만 · 입주예정월 → \`MOVE_IN\` PLANNED · 세대수 → \`PROJECT_PLAN\`/TOTAL(기준월 2026-06 = 파일 기준일) |
| ${REF.myhomeComplex} | 마이홈 공공임대 단지 | PNU 앞 15자리 일치 → \`MYHOME_COMPLEX_ID\`(hsmpSn) · 준공일(competDe) → \`COMPLETION\` ACTUAL |
| ${REF.reb} | 부동산원 단지 식별정보 | 필지고유번호 앞 15자리 일치 → \`REB_COMPLEX_ID\` · 사용승인일 → \`COMPLETION\` ACTUAL |
| ${REF.molit} · ${REF.kapt} | 국토부 단지 기본정보 + K-apt 목록 | K-apt bjdCode + 법정동주소의 첫 지번 → PNU, 앞 15자리 일치 → \`KAPT_CODE\` · 사용승인일 → \`COMPLETION\` ACTUAL |
| ${REF.hubAp} | 건축인허가 기본개요 | 주_용도 공동주택이고 PNU 앞 15자리 일치 → \`HUB_AP_PK\` · 건축허가일 → \`PERMIT\` ACTUAL · 실제착공일 → \`CONSTRUCTION_START\` ACTUAL · 착공예정일 → PLANNED · 사용승인일 → \`COMPLETION\` ACTUAL |
| ${REF.bldSummary} · ${REF.bldTitle} | 건축물대장 총괄표제부 · 표제부 | 주_용도 공동주택이고 PNU 앞 15자리 일치 → \`HUB_BLD_PK\` · 허가일 → \`PERMIT\` · 착공일 → \`CONSTRUCTION_START\` · 사용승인일 → \`COMPLETION\`(모두 ACTUAL). 같은 날짜의 여러 관리번호는 이벤트 한 행(event_detail 에 건수·앞 3개) |
| ${REF.legalDong} | 법정동코드 | 주소 → 시군구(sigungu)·법정동·PNU, 옛 코드(인천 개편 등) → 지금 코드(hub-bulk.js codeMapper) |
| ${REF.ledger} | 원장 사업번호 대응 | 같은 AREA_BLOCK·HUB_HS_PK 의 원장 사업: 발급(issued_at) → local_project_id·\`INTERNAL_PROJECT_ID\`, 미발급 → \`LEDGER_CANDIDATE_ID\` 만 |

### 사업_projects.csv

| 칸 | 값 |
|---|---|
| local_project_id | 원장 발급 번호(PRJ-…)가 있으면 그것. 없으면 대표 원천 키의 해시: LH 블록 \`WAVE-LHC-\`+SHA-1(\`15141761\\|지구\\|블록\`) 앞 8자리(이전 변환기와 같음) · LH 공고 단지 \`WAVE-LHN-\`+SHA-1(\`15057999\\|단지명\\|단지주소\`) · 마이홈 \`WAVE-MYH-\`+SHA-1(\`HWSPR02\\|PNU 또는 공고-houseSn\`) · 청약홈 \`WAVE-APH-\`+SHA-1(\`15098547\\|HOUSE_MANAGE_NO\`), 대문자 |
| project_name | 대표 원천 이름(LH 블록 '지구 블록', LH 단지명, 마이홈 단지명, 청약홈 주택명) |
| project_unit | 블록 코드(글자+숫자)가 있으면 \`BLOCK\`, 아니면 \`AREA_UNKNOWN\`(번호뿐인 LH 블록은 \`BLOCK_NAME_NUMERIC\` 검토). \`INDEPENDENT\` 는 원천으로 확인할 수 없어 쓰지 않음 |
| parent_area_name · block_name | LH 블록은 원문 그대로. 나머지는 이름에서 읽은 지구 낱말과 정규화한 블록 코드(예 \`A2\`) |
| region · sigungu | 시도 코드 → 서울·경기·인천 · 법정동코드 파일의 시군구 이름에서 시도를 뗀 것('성남시 수정구', '서해구') |
| organization | 공공기관 짧은 이름(5절). 합쳐진 사업은 원천별 기관을 '·' 로 이음 |
| public_scope · is_demo | \`PUBLIC\` · \`false\` |
| project_status | 4절 |
| source_ref | 대표 원천 |

## 3. 합치기 규칙

- 정확한 키(같으면 한 사업, 행은 CONFIRMED): ① 시도 + 지구 이름(괄호·빈칸·끝의 '지구' 지움, 대문자) + 블록 코드(hub-bulk.js normBlock: 'A-2'≈'A2'≈'A02BL', 번호뿐인 블록은 키 없음)가 완전 일치. LH 블록 외 원천의 지구·블록은 이름(없으면 청약홈 공급위치)에서 블록 코드가 정확히 하나로 읽히고 그 앞 낱말이 있을 때만(notice-link.js blocksOf·titleDistrict, '시흥시'·'○○구' 같은 짧은 행정구역 이름은 지구로 보지 않음) ② PNU 19자리 일치 ③ 마이홈 행의 LH 공고번호(panId) = LH PAN_ID 이고 그 LH 공고 단지가 하나이거나 PNU 앞 15자리·단지명으로 하나가 정해질 때(못 정하면 \`LINK_CANDIDATE\`) ④ 청약홈 HOUSE_MANAGE_NO(공고마다 사업 1건이라 그 자체로는 합칠 일 없음).
- PNU 앞 15자리(필지 본번까지) 일치: 합친다. 단, 대표 원천과 정확한 키로 이어지지 않고 앞 15자리로만 이어진 원천의 행은 \`REVIEW_REQUIRED\`.
- 대표(이름·source_ref): P1 LH 준공예정 > P3 LH 공고 단지 > P4 마이홈 > P2 청약홈.
- 보강 원천(E1~E4)은 합친 뒤의 사업에 붙는다. PNU 19자리가 같으면 CONFIRMED, 앞 15자리만 같으면 REVIEW_REQUIRED. 건축HUB 주택인허가는 원장의 LH 후보 붙이기 규칙(시군구 + 블록 코드 + 지구 낱말이 건물명·단지명·특수지명·주소에 있음)으로도 붙고 이것은 REVIEW_REQUIRED. 붙을 사업이 둘 이상이면 \`LINK_CANDIDATE\`.
- 합치지 않는 것: 이름만 비슷하거나(같은 시군구·같은 정규화 이름) 블록만 같고 지구 이름이 한쪽을 품는 것 → \`DUPLICATE_CANDIDATE\`.
- 원장 발급 번호: AREA_BLOCK 을 먼저, 다음 붙은 HUB_HS_PK 순으로 첫 발급 사업. 둘 이상이면 \`LEDGER_ID_CONFLICT\`, 이미 다른 사업이 쓴 번호면 해시 ID 를 두고 \`DUPLICATE_CANDIDATE\`.

## 4. 단계(project_status)·날짜 규칙

- project_status: 기준일(2026-10-12) 이전 날짜의 ACTUAL·CONFIRMED 이벤트 중 가장 늦은 단계. 인허가(PERMIT) < 건설(CONSTRUCTION_START·PROGRESS) < 공급(SUPPLY_NOTICE) < 입주(COMPLETION·MOVE_IN ACTUAL). 증거가 없으면 빈칸. REVIEW_REQUIRED 이벤트(PNU 앞 15자리로만 붙은 것 등)는 단계에 쓰지 않는다.
- 날짜: \`YYYY-MM-DD\`(event_date) 또는 \`YYYY-MM\`(event_month), 월만 있으면 날짜를 만들지 않는다. 1990-01-01~2040-12-31 달력 유효값만(자리 채우기 19000101·99991231·11111111·#VALUE!·2027-00 등은 빈칸 + 보고서 건수). 날짜가 없으면 이력 행을 만들지 않는다.
- 공고일이 기준일 뒤면 PLANNED. 준공·사용승인 같은 실제 칸의 날짜가 기준일 뒤면 이력을 만들지 않고 센다.
- 실제 준공 ↔ 예정 모순: 사업을 만든 원천(LH 준공예정·LH 공고·마이홈·청약홈)이 기준일 뒤 준공·입주 예정인데 보강 원천에 실제 준공(사용승인·사용검사)이 있으면, 같은 필지 번호에 다른 건물이 붙었을 수 있어 그 보강 원천의 이 사업 행(식별자·이력·물량)을 모두 REVIEW_REQUIRED 로 내리고 \`DATE_CONFLICT\`(record_key \`COMPLETION ACTUAL↔PLANNED\`)로 남긴다(예: LH 상세의 지번이 이미 준공된 옆 단지와 같은 경우).
- 같은 사업의 같은 종류(event_type+date_type) 날짜가 원천마다 다르면 원천별로 각각 두고 \`DATE_CONFLICT\`(공급 공고·공정은 제외 — 공고마다 여럿이다). 한쪽이 월만 있으면 월로 비교.
- 세대수: 사업 전체(PROJECT_PLAN) · 공공 계획(PUBLIC_PLAN) · 공고(NOTICE)를 구분하고 합산하지 않는다. 0 은 넣지 않는다.

## 5. 공공기관 이름 사전(청약홈 사업주체·마이홈 공급기관)

| 이름(빈칸·(주) 지운 뒤) | 짧은 이름 |
|---|---|
| 한국토지주택공사…(지역본부 포함) · 대한주택공사 · LH · LH공사 · 엘에이치공사 | LH |
| 서울주택도시공사 · 서울주택도시개발공사 · 서울특별시도시개발공사 · SH공사 · 에스에이치공사 | SH |
| 경기주택도시공사 · 경기도시공사 · GH공사 | GH |
| 인천도시공사 · 인천광역시도시공사 · IH공사 | IH |
| ○○도시공사 · ○○도시개발공사 · ○○개발공사 · ○○주택도시공사 · ○○도시관리공사 · ○○지방공사 | 이름 그대로(예 평택도시공사) |

- 쉼표로 이은 공동 사업주체는 하나씩 판정한다. 공공기관이 하나라도 있으면 공공(나머지가 민간이면 \`PUBLIC_PRIVATE_JOINT\`).
- 조합·투자회사·리츠·신탁·PFV(피에프브이)·프로젝트금융이 든 이름은 공공 이름이 있어도 공공이 아니다(LH 참여형 가로주택정비사업조합·○○피에프브이 등 → 공공 이름이 있으면 \`PUBLIC_SCOPE_UNKNOWN\`, 공공택지면 \`PRIVATE_ON_PUBLIC_LAND\`).

## 6. 제외 규칙(공고)

- LH 공고·마이홈: notice-link.js noticeKind — 취소(CANCEL)·비주택(가정어린이집·오피스텔·상가·운영예정자)·후속(잔여·추가·예비·선착순·매각·재공급·무순위·완화·해약·상시 또는 '모집' 없는 제목)은 사업을 만들지 않는다. 단지 정보(dsSbd)가 없는 최초 공고(매입·전세임대 등)도 제외.
- 청약홈: APT 분양정보만 사업을 만든다. 주택명에 잔여·추가·예비·선착순·매각·재공급·무순위·해약·계약취소가 들면 후속 공고로 제외. 오피스텔·도시형·민간임대(Urbty)·무순위(Remndr)·공공지원민간임대(PblPvtRent)·임의공급(OPT) 오퍼레이션은 사업을 만들지 않는다(건수만).

## 7. 규격에 없어 정한 값 (제안 코드)

| 칸 | 쓴 값 |
|---|---|
| source_owner | ${P.source_owner.join(' · ')} |
| public_scope | ${P.public_scope.join(' · ')} |
| project_status | ${P.project_status.join(' · ')} |
| is_demo | ${P.is_demo.join(' · ')} |
| event_type | ${P.event_type.join(' · ')} |
| date_type | ${P.date_type.join(' · ')} |
| id_type | ${P.id_type.join(' · ')} |
| id_issuer | LH · 한국부동산원 · 국토교통부 · 행정안전부(BJD_CODE) · HOUSING_WAVE(원장 번호) |
| match_status | CONFIRMED · REVIEW_REQUIRED (review_status 와 같은 뜻) |
| unit_scope | ${P.unit_scope.join(' · ')} (TOTAL = 사업 전체, SUBTYPE = 공급유형·공고 몫) |
| region | ${P.region.join(' · ')} |
| review_required.csv | 열 \`review_type, local_project_id, source_ref, record_key, record_name, detail, reason\`, 유형 ${Object.keys(spec.REVIEW_TYPES).join(' · ')} |

## 8. 싣지 않는 값

전화번호·문의처·담당자·개인 이름 칸(청약홈 MDHS_TELNO, LH 접수처 SIL_OFC_TLNO, 마이홈 refrnc, 국토부 관리사무소 연락처·주택관리업자), 공고 본문 전문(dsEtcInfo 등), 건축인허가·건축물대장의 건물_명(개인 이름이 섞임), 총세대수 30 미만 주택인허가 기록의 건물명. 인증키는 어느 파일에도 없다(manifest 의 키 없는 주소만 source_url 에 씀).

## 9. 공통규격 보완 제안

1. 4·7절의 제안 코드를 팀 공통 허용값으로 확정.
2. LH 준공예정처럼 '준공예정 물량'에 맞는 quantity_type 이 없어 PUBLIC_PLAN 에 넣었다.
3. 시도·시군구 코드 칸(region·sigungu 는 글자뿐), 공공 판정 근거 칸, 물량 기준일 칸, 식별자의 범위(대표 필지 여부) 칸이 있으면 통합이 쉽다.
4. review_required.csv 열을 팀 공통으로.
`;
}

function readme() {
  return `# 주택파동 공통규격 v1.4 — 원천(raw) 재가공본

사업 원장 2026-10 의 원천 파일(\`schemas/ledger-2026-10/raw/\` 등)을 공통규격 CSV 8종으로 바꾼 결과다. 대상은 서울·경기·인천의 공급 진행 공공주택 사업이다.

## 파일

- 공통규격 CSV 8종(양식 ZIP 과 같은 이름·헤더, UTF-8 BOM, CRLF). 정책·프로그램·연결은 원천 근거가 없어 헤더만 있다.
- \`review_required.csv\`: 검토 필요 항목(유형별 뜻은 conversion_report.md 5절).
- \`conversion_report.md\`: 입력 파일·sha256, 출력 행 수, 원천별 건수, 제외 원천, 검증 결과.
- \`field_mapping.md\`: 원천 칸 → 규격 칸, 합치기·단계·ID 규칙, 공공기관 이름 사전, 제안 코드.

## 다시 만들기

저장소 루트에서(node 만 필요, 시스템 \`unzip\`·\`grep\` 을 쓴다. 외부 호출 없음, 약 1~2분):

\`\`\`
node tools/common_v1_4_raw/convert.js --out ~/Downloads/housing_wave_common_v1_4_raw
\`\`\`

시험 변환(고른 사업과 그 행만): \`node tools/common_v1_4_raw/convert.js --out <폴더> --only <local_project_id 또는 사업명>,...\`

## 검증

\`\`\`
node tools/common_v1_4_raw/validate.js ~/Downloads/housing_wave_common_v1_4_raw --spec-zip "/Users/bcchung81/Downloads/공통규격 양식.zip"
node --test tests/js/common-v1-4-raw.test.cjs
\`\`\`

같은 입력이면 모든 파일이 바이트까지 같다(실행 시각을 쓰지 않는다).
`;
}

/* ────────────────────────── 실행 ────────────────────────── */

async function main(argv) {
  let outDir = DEFAULT_OUT, only = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outDir = path.resolve(argv[++i].replace(/^~(?=$|\/)/, os.homedir()));
    else if (argv[i] === '--only') only = argv[++i].split(',').map((x) => x.trim()).filter(Boolean);
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  const result = await build();
  result.excluded = excludedSources();
  if (only) select(result, only);
  finish(result);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [key, [fname, header]] of Object.entries(spec.FILES)) fs.writeFileSync(path.join(outDir, fname), toCsv(header, result.out[key]));
  fs.writeFileSync(path.join(outDir, spec.REVIEW_FILE[0]), toCsv(spec.REVIEW_FILE[1], result.review));
  const { errors, counts } = validate(outDir);
  fs.writeFileSync(path.join(outDir, 'conversion_report.md'), report(result, counts, errors, !!only, outDir));
  fs.writeFileSync(path.join(outDir, 'field_mapping.md'), fieldMapping());
  fs.writeFileSync(path.join(outDir, 'README.md'), readme());
  for (const [n, c] of Object.entries(counts)) console.log(`${n}\t${c}`);
  for (const e of errors.slice(0, 50)) console.log('오류:', e);
  console.log(errors.length ? `검증 실패 ${errors.length}건` : '검증 통과');
  return errors.length ? 1 : 0;
}

module.exports = { clean, compact, waveId, lhcId, cleanDay, cleanMonth, pnu15, orgShort, classifyOperator, districtKey, parseDistrictBlock, abKey, sggOfAddress, sidoOf, stageOf, csvCell, toCsv, REF, SOURCES };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => { console.error(`오류: ${e.stack || e.message}`); process.exitCode = 2; });
}
