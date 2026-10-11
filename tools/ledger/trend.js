'use strict';
/* 월 판정 이력(data/board/judgment-history.json) — 종합상황판 '지연·주의 추이' 카드의 자료.
   - 소급(BACKFILL, 2025-01 … 관측 달 앞 달): 달 D 의 판정 = 그 달 판의 자료로, 그 달 말을 기준일로, 지금과 같은 파이프라인(hub-bulk → convert → boardFromLedger)을 돌린 judgment.
     판정 규칙은 board.js 하나뿐이다(여기서 새로 짜지 않는다).
     ① 판 고르기: 데이터 월이 D 이하인 판 중 가장 늦은 것. 판은 raw/hub-bulk-history/basic-YYYY-MM.zip(기본개요만)과 raw/hub-bulk(2026-08, zip 3개 — 같은 달이면 이쪽).
        안의 기본개요 파일 내용(sha256)이 바로 앞 판과 같은 판은 새 판으로 치지 않는다(2025-10 판 = 2025-09 판과 바이트까지 같다 → D 2025-10 은 2025-09 판).
     ② 진행 중 규칙의 a(사업승인일 하한)는 기준일 달의 60개월 전 1일(hub-bulk.js permitFloor), b·c·d·창은 고정. 과거 판은 기본개요만 있어
        단지명(행위개요)·대표 필지(대지위치)는 2026-08 판의 값을 관리번호로 붙인다(관리번호의 정적 속성).
     ③ 레지스트리 건축HUB 사업의 이벤트: 그 판 기본개요의 레지스트리 관리번호 행을 API 필드 이름으로 바꿔 snapshot.js eventsFromHub 에 넣는다(2026-10 API 값이 과거로 새지 않게).
     ④ convert: README 의 명령과 같은 입력(LH 매핑·법정동·후보 id 매핑(읽기만)·전국 공고·입주예정)에 hubBulk = 그 판, hubEvents = ③, observedMonth = D. validate 오류 0 이어야 한다.
     ⑤ 시간 되감기(rewind): 기간 끝이 기준일 뒤인 ACTUAL 이벤트를 모두 뺀다. 대용량 후보가 아닌 사업은 단계가 준공(06)·착공(04) 이상인데 그 근거가 기준일 뒤 실제뿐이면
        (기준일 이전 실제가 없고 뒤 실제가 있으면 — 근거는 표의 실제 이벤트와 2026-10 API 스냅샷의 실제 이벤트) 준공 → 04, 착공 → 03 으로 낮춘다. 근거 없는 단계는 그대로.
     ⑥ boardFromLedger(되감은 표, { referenceDate: 그 달 말, observedMonth: D }) 의 이번 달 행(trend 마지막 행)을 basis BACKFILL 로 싣는다.
   - 관측(OBSERVED, 2026-10 부터): 그 달 data/board/ledger-board.json 의 판정 행을 그대로 붙인다(--close). 관측 행이 있는 달은 소급으로 덮지 않는다.
   달마다 하는 일: 새 달 원장·보드를 만들기 전에 지난 달 보드로 `node tools/ledger/trend.js --close` → 새 달 원장 → `node tools/ledger/board.js`.
   실행: node tools/ledger/trend.js           → 폴더의 판으로 소급 행을 다시 계산해 이력 파일을 쓴다(관측 행은 남긴다, 약 1~2분)
         node tools/ledger/trend.js --close   → data/board/ledger-board.json 의 이번 달 판정을 OBSERVED 행으로 이력에 붙인다
   읽기만 하는 것: schemas/ledger-2026-10/raw·snapshot·mappings(후보 id 매핑을 쓰지 않는다). 시험: tests/js/trend.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const H = require('./hub-bulk');
const { convert, loadInputs, readNational } = require('./convert');
const { eventsFromHub } = require('./snapshot');
const { boardFromLedger, endOf, lastDay, addMonths, HISTORY } = require('./board');
const { validate } = require('./validate');
const { parseLegalDong } = require('./legal-dong');

const ROOT = path.join(__dirname, '..', '..');
const BASE = path.join(ROOT, 'schemas/ledger-2026-10');
const HISTORY_DIR = path.join(BASE, 'raw/hub-bulk-history');
const DONG = 'raw/legal-dong/국토교통부_법정동코드_20260929.csv';
const FIRST = '2025-01';
const RULE = '달 D 의 판정 = 데이터 월이 D 이하인 가장 늦은 건축HUB 대용량 판(기본개요 내용이 앞 판과 같으면 앞 판)으로 D 말일을 기준일로 hub-bulk → convert → boardFromLedger 를 돌린 judgment(기준일 뒤 실제 이벤트는 뺀다) — BACKFILL. 2026-10 부터는 그 달 종합상황판 판정 — OBSERVED.';
/* 되감을 단계: [이벤트, 이 단계 이상이면 이른 것, 낮출 단계] — 준공을 먼저 본다(낮춘 뒤 착공을 다시 본다) */
const LOWER = [['COMPLETION', '06', '04'], ['CONSTRUCTION_START', '04', '03']];
const BULK_PREFIX = 'hub-bulk-hs-';

const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* zip 안 파일 내용의 sha256 */
const memberSha = (zip, member) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256'), p = spawn('unzip', ['-p', zip, member]);
  p.stdout.on('data', (d) => h.update(d));
  p.on('error', reject);
  p.on('close', (code) => (code === 0 ? resolve(h.digest('hex')) : reject(new Error(`unzip ${zip} 실패(${code})`))));
});

/* 판 목록(데이터 월 순): { month, dir, zip, member, sha256(zip), collectedAt, files, contentSha }. 내용이 앞 판과 같은 판은 skipped 로 */
async function editionsOf(historyDir = HISTORY_DIR, rawDir = H.RAW) {
  const raw = json(path.join(rawDir, 'manifest.json'));
  const eds = new Map();
  const hm = fs.existsSync(path.join(historyDir, 'manifest.json')) ? json(path.join(historyDir, 'manifest.json')) : { files: [] };
  for (const f of fs.existsSync(historyDir) ? fs.readdirSync(historyDir).sort() : []) {
    const m = /^basic-(\d{4}-\d{2})\.zip$/.exec(f);
    if (!m) continue;
    const info = (hm.files || []).find((x) => x.zip === f) ?? {};
    eds.set(m[1], { month: m[1], dir: historyDir, zip: f, member: info.member ?? 'mart_jty_01.txt', collectedAt: info.fetched_at ? info.fetched_at.slice(0, 10) : null, files: [f] });
  }
  const b = raw.files.basic;
  eds.set(H.DATA_MONTH, { month: null, dir: rawDir, zip: b.zip, member: b.member, collectedAt: raw.fetched_at.slice(0, 10), files: Object.values(raw.files).map((f) => f.zip), full: true });
  const list = [...eds.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([month, e]) => ({ ...e, month }));
  const kept = [], skipped = [];
  for (const e of list) {
    e.sha256 = H.sha256(path.join(e.dir, e.zip));
    e.contentSha = await memberSha(path.join(e.dir, e.zip), e.member);
    if (kept.length && kept[kept.length - 1].contentSha === e.contentSha) skipped.push({ month: e.month, sameAs: kept[kept.length - 1].month }); else kept.push(e);
  }
  return { editions: kept, skipped };
}
const pickEdition = (editions, month) => editions.filter((e) => e.month <= month).pop() ?? null;

/* 레지스트리 건축HUB 사업의 관리번호(snapshot.js 와 같은 고르기) */
const registryPks = (registry) => new Set(registry.projects.filter((p) => !p.supersededBy).flatMap((p) => p.refs.filter((r) => r.system === 'hub-hs-basis').map((r) => String(r.value))));

/* 판 하나의 기본개요를 한 번 읽어 aMin(사업승인일 하한)마다 남긴 기록(관리번호 → 기록)과 레지스트리 관리번호 행(API 필드 이름)을 만든다 */
async function readBasic(ed, aMins, regPks) {
  const recs = Object.fromEntries(aMins.map((a) => [a, new Map()])), reg = [];
  const B = H.B, v = (c, k) => String(c[B[k]] ?? '').trim();
  await H.eachLine(path.join(ed.dir, ed.zip), ed.member, (c) => {
    for (const a of aMins) {
      const r = H.basicRecord(c, a);
      if (r.record) recs[a].set(r.record.pk, r.record);
    }
    if (regPks.has(v(c, 'pk'))) reg.push({ mgmHsrgstPk: v(c, 'pk'), apprvDay: v(c, 'apprv'), stcnsDay: v(c, 'stcns'), stcnsSchedDay: v(c, 'stcns_sched'), useInsptDay: v(c, 'insp'), useInsptSchedDay: v(c, 'insp_sched') });
  });
  return { recs, reg };
}

/* 기록들에 2026-08 판의 단지명·대표 필지를 붙인다(한 번 읽기). byPkList = [관리번호 → 기록 Map …] */
async function attachStatic2608(byPkList, rawDir = H.RAW) {
  const stub = new Map();
  for (const m of byPkList) for (const pk of m.keys()) if (!stub.has(pk)) stub.set(pk, { complex: null, site: null, site_count: 0 });
  const f = json(path.join(rawDir, 'manifest.json')).files;
  await H.attachStatic(rawDir, { act: f.act, site: f.site }, stub);
  for (const m of byPkList) for (const [pk, r] of m) Object.assign(r, stub.get(pk));
}
const sortedRecords = (m) => [...m.values()].sort((a, b) => (a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : 0));

/* 고정 입력(README 의 convert 명령과 같은 것). 후보 id 매핑은 읽기만 */
function loadContext() {
  const legalDong = parseLegalDong(fs.readFileSync(path.join(BASE, DONG)), path.basename(DONG));
  const base = loadInputs({ lhSgg: json(path.join(BASE, 'mappings/lh-block-sgg.json')), legalDong, hubIds: json(path.join(BASE, 'mappings/hub-candidate-ids.json')), national: readNational(path.join(BASE, 'raw')) });
  return { base, apiEvents: json(path.join(BASE, 'snapshot/hub-events.json')).rows };
}

/* 판 ed 의 기록으로 달 month 의 원장 표. hubEvents 를 주지 않으면 그 판 기본개요의 레지스트리 행에서 만든다 */
function tablesFor(ctx, { ed, records, reg, month, hubEvents }) {
  const hubBulk = { dataMonth: ed.month, dataAsOf: ed.full ? `${ed.month}-31` : lastDay(ed.month), collectedAt: ed.collectedAt, files: ed.files, records };
  const events = hubEvents ?? eventsFromHub({ bulk: reg }, ctx.base.registry, month);
  return convert({ ...ctx.base, observedMonth: month, hubBulk, hubEvents: events, report: {} });
}

/* 시간 되감기(머리 주석 ⑤). extraActual = 단계 근거로만 보는 실제 이벤트(2026-10 API 스냅샷) */
function rewind(t, ref, extraActual = []) {
  const after = (e) => e.date_type === 'ACTUAL' && endOf(e) != null && endOf(e) > ref;
  const ends = new Map();
  for (const e of [...t.events, ...extraActual]) {
    if (e.date_type !== 'ACTUAL' || endOf(e) == null) continue;
    const k = `${e.local_project_id}|${e.event_type}`;
    (ends.get(k) || ends.set(k, []).get(k)).push(endOf(e));
  }
  const projects = t.projects.map((p) => {
    if (p.source_ref.startsWith(BULK_PREFIX)) return p;   // 대용량 후보의 단계는 convert 가 그 판 날짜로 이미 계산했다
    let stage = p.stage_code;
    for (const [type, reached, below] of LOWER) {
      const es = ends.get(`${p.local_project_id}|${type}`) ?? [];
      if (stage >= reached && es.length && es.every((d) => d > ref)) stage = below;
    }
    return stage === p.stage_code ? p : { ...p, stage_code: stage };
  });
  return { ...t, projects, events: t.events.filter((e) => !after(e)) };
}

/* 이력 파일: 판·행은 한 줄에 하나(변경을 줄 단위로 보려고) */
const renderHistory = (h) => `{\n"schema": ${JSON.stringify(h.schema)},\n"rule": ${JSON.stringify(h.rule)},\n"editions": {\n${Object.entries(h.editions).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n},\n"rows": [\n${h.rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n}\n`;
const readHistory = (file = path.join(ROOT, HISTORY)) => (fs.existsSync(file) ? json(file) : { schema: 'judgment-history/1', rule: RULE, editions: {}, rows: [] });
const writeHistory = (h, file = path.join(ROOT, HISTORY)) => {
  const editions = Object.fromEntries(Object.keys(h.editions).sort().map((k) => [k, h.editions[k]]));
  fs.writeFileSync(file, renderHistory({ schema: 'judgment-history/1', rule: RULE, editions, rows: [...h.rows].sort((a, b) => a.month.localeCompare(b.month)) }));
};

/* 소급: FIRST … observedMonth 앞 달 중 관측 행이 없는 달 */
async function backfill({ observedMonth, log = console.log } = {}) {
  const hist = readHistory(), observed = new Set(hist.rows.filter((r) => r.basis === 'OBSERVED').map((r) => r.month));
  const { editions, skipped } = await editionsOf();
  for (const s of skipped) log(`판 ${s.month}: 기본개요 내용이 ${s.sameAs} 판과 같아 건너뜀`);
  const months = [];
  for (let m = FIRST; m < observedMonth; m = addMonths(m, 1)) if (!observed.has(m)) months.push(m);
  const plan = months.map((m) => ({ month: m, ref: lastDay(m), ed: pickEdition(editions, m) }));
  for (const p of plan.filter((x) => !x.ed)) log(`${p.month}: 쓸 판이 없다(건너뜀)`);
  const todo = plan.filter((x) => x.ed);
  const ctx = loadContext(), regPks = registryPks(ctx.base.registry);
  const parsed = new Map();
  for (const ed of [...new Set(todo.map((x) => x.ed))]) {
    const aMins = [...new Set(todo.filter((x) => x.ed === ed).map((x) => H.permitFloor(x.ref)))];
    parsed.set(ed, await readBasic(ed, aMins, regPks));
  }
  await attachStatic2608([...parsed.values()].flatMap((p) => Object.values(p.recs)));
  const rows = [], editionsUsed = {};
  for (const { month, ref, ed } of todo) {
    const { recs, reg } = parsed.get(ed);
    const tables = tablesFor(ctx, { ed, records: sortedRecords(recs[H.permitFloor(ref)]), reg, month });
    const errors = validate(tables);
    if (errors.length) throw new Error(`${month}: validate 오류 ${errors.length}건 — ${errors.slice(0, 3).join(' / ')}`);
    const board = boardFromLedger(rewind(tables, ref, ctx.apiEvents), { referenceDate: ref, observedMonth: month });
    const row = { ...board.trend[board.trend.length - 1], basis: 'BACKFILL' };
    rows.push(row);
    editionsUsed[ed.month] = { zip: ed.zip, sha256: ed.sha256 };
    log(`${month} 판 ${ed.month} 기준일 ${ref}: 지연 ${row.delay.projects}/${row.delay.units} · 주의 ${row.caution.projects}/${row.caution.units} · 정상 ${row.ok.projects}/${row.ok.units} (판정 ${row.judged})`);
  }
  const keep = hist.rows.filter((r) => r.basis === 'OBSERVED');
  const keepEd = Object.fromEntries(Object.entries(hist.editions).filter(([k]) => keep.some((r) => r.edition === k)));
  writeHistory({ editions: { ...keepEd, ...editionsUsed }, rows: [...keep, ...rows] });
  return { rows, skipped, missing: plan.filter((x) => !x.ed).map((x) => x.month) };
}

/* 관측: ledger-board.json 의 이번 달 판정 행을 OBSERVED 로 붙인다(같은 달 행은 바꾼다) */
async function close({ log = console.log } = {}) {
  const board = json(path.join(ROOT, 'data/board/ledger-board.json'));
  const row = board.trend?.find((r) => r.month === board.observedMonth);
  if (!row || row.basis !== 'OBSERVED') throw new Error('ledger-board.json 에 이번 달 판정 행(trend)이 없다 — node tools/ledger/board.js 로 다시 만든다');
  const hist = readHistory(), { editions } = await editionsOf();
  const ed = editions.find((e) => e.month === row.edition);
  writeHistory({ editions: { ...hist.editions, ...(ed ? { [ed.month]: { zip: ed.zip, sha256: ed.sha256 } } : {}) }, rows: [...hist.rows.filter((r) => r.month !== row.month), row] });
  log(`${row.month} OBSERVED 행을 ${HISTORY} 에 붙였다: 지연 ${row.delay.projects}/${row.delay.units} · 주의 ${row.caution.projects}/${row.caution.units}`);
}

module.exports = { editionsOf, pickEdition, readBasic, attachStatic2608, sortedRecords, registryPks, loadContext, tablesFor, rewind, renderHistory, RULE };

if (require.main === module) {
  const observedMonth = json(path.join(ROOT, 'data/board/ledger-board.json')).observedMonth;
  (process.argv.includes('--close') ? close() : backfill({ observedMonth }))
    .catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
