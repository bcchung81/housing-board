'use strict';
/* 공통규격 v1.4 CSV 8종(+ review_required.csv) 검증. convert.js 가 끝에 부르고, 따로도 돌릴 수 있다.

     node tools/common_v1_4_raw/validate.js <출력 폴더> [--spec-zip "공통규격 양식.zip"]

   검사(이전 tools/common_v1_4/validate.py 와 같은 항목 + 줄바꿈): UTF-8 BOM·헤더 일치·CRLF, 필수 칸, 허용값, 날짜(YYYY-MM-DD·YYYY-MM)·숫자 형식,
   NULL 대용 글자, 앞뒤 공백, 인증키처럼 보이는 값, local_project_id 중복, 참조 무결성(사업·원천·정책·프로그램), DEMO 행, 행 중복,
   물량 키 중복, events 의 날짜·월 하나만, PROGRESS 범위. --spec-zip 이면 양식 ZIP 의 CSV 헤더와 대조한다(ZIP 안 이름이 CP949 라 _projects.csv 같은 영문 꼬리로 짝짓는다).
   오류가 있으면 종료 코드 1. 새 npm 꾸러미 없이 node 만 쓴다(ZIP 은 중앙 디렉터리를 직접 읽고 zlib 로 푼다). */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const spec = require('./spec');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const NULLISH = new Set(['null', 'none', 'nan', 'n/a', 'na', '-', 'undefined']);
const KEY_NAME = /servicekey|api[_-]?key|access[_-]?token|[?&][a-z_]*key=/i;
/* 인증키처럼 보이는 값: 키 이름, 또는 40자 넘는 [영숫자+/=%] 덩어리 중 '+'·'='·'%' 가 들었거나 '/' 로 나눈 조각 하나가 32자 이상인 것
   (파일 경로·API 주소는 조각이 짧아 걸리지 않는다) */
const looksSecret = (v) => KEY_NAME.test(v) || (v.match(/[A-Za-z0-9+/=%]{40,}/g) ?? []).some((run) => /[+=%]/.test(run) || run.split('/').some((seg) => seg.length >= 32));

/* RFC 4180 CSV(따옴표 안 쉼표·줄바꿈·"" 허용) → 행 배열 */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function readCsv(file) {
  const raw = fs.readFileSync(file);
  const bom = raw.subarray(0, 3).equals(BOM);
  const text = raw.subarray(bom ? 3 : 0).toString('utf8');
  const rows = parseCsv(text);
  const head = rows[0] ?? [];
  const lf = (text.match(/\n/g) ?? []).length, crlf = (text.match(/\r\n/g) ?? []).length;
  return { head, rows: rows.slice(1).map((r) => ({ cells: r, obj: Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])) })), bom, crlfOnly: lf === crlf };
}

function dateOk(v, kind) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v), mon = /^(\d{4})-(\d{2})$/.exec(v);
  if (day && (kind === 'day' || kind === 'either')) {
    const [y, m, d] = [+day[1], +day[2], +day[3]], dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  if (mon && (kind === 'month' || kind === 'either')) return +mon[2] >= 1 && +mon[2] <= 12;
  return false;
}

/* ZIP(저장·deflate)의 파일들 → [{ name(latin1 로 읽은 이름), data }] */
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(`${file}: ZIP 끝 레코드를 찾지 못함`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`${file}: 중앙 디렉터리 형식 오류`);
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('latin1');
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), body = buf.subarray(start, start + csize);
    if (!name.endsWith('/')) out.push({ name, data: method === 0 ? body : method === 8 ? zlib.inflateRawSync(body) : null });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/* 양식 ZIP 의 CSV 헤더: 파일 이름 끝의 영문 꼬리(_projects.csv 등)로 짝짓는다 */
function specZipHeaders(zipFile) {
  const out = {};
  for (const { name, data } of readZip(zipFile)) {
    if (!data) continue;
    for (const [key, [fname]] of Object.entries(spec.FILES)) {
      if (name.endsWith(fname.slice(fname.indexOf('_')))) out[key] = parseCsv(data.subarray(data.subarray(0, 3).equals(BOM) ? 3 : 0).toString('utf8'))[0] ?? [];
    }
  }
  return out;
}

function validate(outDir, specZip = null) {
  const errors = [];
  const data = {};
  const all = { ...Object.fromEntries(Object.entries(spec.FILES)), review: spec.REVIEW_FILE };
  for (const [key, [fname, header]] of Object.entries(all)) {
    const file = path.join(outDir, fname);
    if (!fs.existsSync(file)) { errors.push(`${fname}: 파일 없음`); data[key] = []; continue; }
    const { head, rows, bom, crlfOnly } = readCsv(file);
    if (!bom) errors.push(`${fname}: UTF-8 BOM 없음`);
    if (!crlfOnly) errors.push(`${fname}: 줄바꿈이 CRLF 가 아님`);
    if (head.join(',') !== header.join(',')) errors.push(`${fname}: 헤더가 규격과 다름 ${JSON.stringify(head)}`);
    data[key] = rows.map((r) => r.obj);
    const seen = new Set();
    rows.forEach(({ cells, obj }, i) => {
      const where = `${fname}:${i + 2}`;
      if (cells.length !== header.length) errors.push(`${where}: 열 수 ${cells.length} ≠ ${header.length}`);
      const line = JSON.stringify(header.map((h) => obj[h]));
      if (seen.has(line)) errors.push(`${where}: 같은 행이 이미 있음`);
      seen.add(line);
      for (const [h, v] of Object.entries(obj)) {
        if (NULLISH.has(v.trim().toLowerCase())) errors.push(`${where}: ${h} 에 NULL 대용 글자 '${v}' (빈 칸으로 둔다)`);
        if (v !== v.trim()) errors.push(`${where}: ${h} 앞뒤 공백`);
        if (looksSecret(v)) errors.push(`${where}: ${h} 에 인증키처럼 보이는 값`);
      }
      for (const h of spec.REQUIRED[key] ?? []) if (!obj[h]) errors.push(`${where}: 필수 칸 ${h} 비어 있음`);
      for (const [h, allowed] of Object.entries(spec.ENUMS[key] ?? {})) if (obj[h] && !allowed.includes(obj[h])) errors.push(`${where}: ${h}='${obj[h]}' 허용값 아님`);
      for (const [h, kind] of Object.entries(spec.DATES[key] ?? {})) if (obj[h] && !dateOk(obj[h], kind)) errors.push(`${where}: ${h}='${obj[h]}' 날짜 형식 아님`);
    });
  }

  const projectIds = data.projects.map((r) => r.local_project_id);
  const projects = new Set(projectIds);
  if (projects.size !== projectIds.length) errors.push('사업_projects.csv: local_project_id 중복');
  if (data.projects.some((r) => r.is_demo !== 'false')) errors.push('사업_projects.csv: DEMO 행이 제출본에 있음');
  const sourceRefs = data.sources.map((r) => r.source_ref);
  const sources = new Set(sourceRefs);
  if (sources.size !== sourceRefs.length) errors.push('원천_sources.csv: source_ref 중복');
  for (const key of ['projects', 'identifiers', 'events', 'units', 'policies', 'programs', 'links', 'review']) {
    const fname = key === 'review' ? spec.REVIEW_FILE[0] : spec.FILES[key][0];
    data[key].forEach((r, i) => {
      if (r.source_ref && !sources.has(r.source_ref)) errors.push(`${fname}:${i + 2}: source_ref '${r.source_ref}' 가 원천_sources.csv 에 없음`);
      if (['identifiers', 'events', 'units'].includes(key) && !projects.has(r.local_project_id)) errors.push(`${fname}:${i + 2}: local_project_id '${r.local_project_id}' 가 사업_projects.csv 에 없음`);
    });
  }
  const known = new Set([...projects, ...data.policies.map((r) => r.local_policy_id), ...data.programs.map((r) => r.local_program_id)]);
  data.links.forEach((r, i) => {
    for (const h of ['from_local_id', 'to_local_id']) if (!known.has(r[h])) errors.push(`정책사업연결_links.csv:${i + 2}: ${h} '${r[h]}' 가 정책·프로그램·사업에 없음`);
  });
  data.events.forEach((r, i) => {
    const where = `진행이력_events.csv:${i + 2}`;
    if (!!r.event_date === !!r.event_month) errors.push(`${where}: event_date·event_month 중 하나만 채운다`);
    if (r.event_type === 'PROGRESS') {
      const v = Number(r.progress_pct);
      if (r.progress_pct === '' || !Number.isFinite(v)) errors.push(`${where}: PROGRESS 인데 progress_pct 가 숫자가 아님`);
      else if (v < 0 || v > 100) errors.push(`${where}: progress_pct 범위 밖`);
    } else if (r.progress_pct) errors.push(`${where}: PROGRESS 가 아닌데 progress_pct 가 있음`);
  });
  const unitKeys = new Set();
  data.units.forEach((r, i) => {
    const where = `공급물량_units.csv:${i + 2}`;
    if (!/^[1-9]\d*$/.test(r.unit_count)) errors.push(`${where}: unit_count='${r.unit_count}' 양의 정수 아님`);
    const k = [r.local_project_id, r.quantity_type, r.housing_type, r.reference_period, r.source_ref].join('\u0000');
    if (unitKeys.has(k)) errors.push(`${where}: 같은 사업·물량종류·유형·시기·원천의 물량이 두 번 있음`);
    unitKeys.add(k);
  });

  if (specZip) {
    const headers = specZipHeaders(specZip);
    for (const [key, [fname, header]] of Object.entries(spec.FILES)) {
      if ((headers[key] ?? []).join(',') !== header.join(',')) errors.push(`${fname}: 양식 ZIP 헤더와 다름 ${JSON.stringify(headers[key] ?? null)}`);
    }
  }
  const counts = Object.fromEntries(Object.entries(all).map(([key, [fname]]) => [fname, data[key].length]));
  return { errors, counts };
}

function main(argv) {
  let outDir = null, specZip = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--spec-zip') specZip = argv[++i];
    else if (!outDir) outDir = argv[i];
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  if (!outDir) throw new Error('출력 폴더를 주세요: node tools/common_v1_4_raw/validate.js <폴더> [--spec-zip 양식.zip]');
  const { errors, counts } = validate(outDir, specZip);
  for (const [name, n] of Object.entries(counts)) console.log(`${name}\t${n}`);
  for (const e of errors.slice(0, 200)) console.log('오류:', e);
  if (errors.length > 200) console.log(`… 오류 ${errors.length - 200}건 더`);
  console.log(errors.length ? `검증 실패 ${errors.length}건` : `검증 통과${specZip ? ' (양식 ZIP 헤더 대조 포함)' : ''}`);
  return errors.length ? 1 : 0;
}

module.exports = { validate, parseCsv, readZip, specZipHeaders, dateOk, looksSecret };

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`오류: ${e.message}`); process.exitCode = 2; }
}
