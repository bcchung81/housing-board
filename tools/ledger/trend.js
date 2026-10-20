'use strict';
/* 월 판정 이력(data/board/judgment-history.json) — 종합상황판 '지연·주의 추이' 카드의 자료.
   - 소급(BACKFILL, 2025-01 … 관측 달 앞 달): 달 D 의 판정 = 지금 원장 표(schemas/ledger-<달>/tables — 발급된 수도권 HOME 공공 공급 사업(board.js isShown, 2026-10-20 안2), 관측 달 판정과 같은 모집단)를
     D 말일로 되감아(rewind) boardFromLedger 를 돌린 이번 달 행. 판정 규칙은 board.js 하나뿐이다(여기서 새로 짜지 않는다).
     ① 시간 되감기(rewind): 기간 끝이 기준일 뒤인 ACTUAL 이벤트를 모두 뺀다. 대용량 후보가 아닌 사업은 단계가 준공(06)·착공(04) 이상인데 그 근거가 기준일 뒤 실제뿐이면
        (기준일 이전 실제가 없고 뒤 실제가 있으면 — 근거는 표의 실제 이벤트) 준공 → 04, 착공 → 03 으로 낮춘다. 근거 없는 단계는 그대로.
     ② boardFromLedger(되감은 표, { referenceDate: 그 달 말, observedMonth: D, stagesAt }) 의 이번 달 행(trend 마지막 행)을 basis BACKFILL 로 싣는다.
        단계별 지연·주의 호수(delayByStage·cautionByStage)의 칸은 지금 보드 리본의 그 달 칸(stagesAt — 리본 층과 같은 값)이라 붉은 띠가 층을 넘지 않는다.
        candidate 칸이 있다(번호 없는 후보 0 — 관측 달과 같은 범위, 화면의 '후보 포함 소급'이 아니다).
     2026-10-20 사용자 결정: 전에는 건축HUB 과거 판(raw/hub-bulk-history)으로 수도권 대용량 후보까지 판정해(withCandidates) 2025-01~2026-09 행이
     판정 1,189~1,574건·80만~104만 호로 지금 원장(383건)과 모집단이 달랐다.
   - 관측(OBSERVED, 2026-10 부터): 그 달 data/board/ledger-board.json 의 판정 행을 그대로 붙인다(--close). 관측 행이 있는 달은 소급으로 덮지 않는다.
   달마다 하는 일: 새 달 원장·보드를 만들기 전에 지난 달 보드로 `node tools/ledger/trend.js --close` → 새 달 원장 → `node tools/ledger/board.js`.
   실행: node tools/ledger/trend.js [--month YYYY-MM]           → 그 달 원장 표로 소급 행을 다시 계산해 이력 파일을 쓴다(관측 행은 남긴다)
         node tools/ledger/trend.js [--month YYYY-MM] --close   → data/board/ledger-board.json 의 이번 달 판정을 OBSERVED 행으로 이력에 붙인다
     --month 는 원장 폴더(schemas/ledger-<달>)이자 소급의 관측 달이다. 주지 않으면 가장 늦은 원장 폴더와 ledger-board.json 의 observedMonth.
     소급 뒤 node tools/ledger/board.js 를 다시 돌려 보드의 trend 를 이력과 맞춘다.
   읽기만 하는 것: schemas/ledger-<달>/tables·manifest.json·raw(--close 의 판 sha). 시험: tests/js/trend.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const H = require('./hub-bulk');
const { boardFromLedger, loadTables, endOf, lastDay, addMonths, HISTORY } = require('./board');
const P = require('./paths');

const ROOT = P.ROOT;
const BASE = P.ledgerDir(P.latestMonth());   // 기본 원장 폴더(가장 늦은 달)
const HISTORY_DIR = path.join(BASE, 'raw/hub-bulk-history');
const FIRST = '2025-01';
const RULE = '달 D 의 판정 = 지금 원장 표(발급된 수도권 HOME 공공 공급 사업 — 관측 달과 같은 모집단, 민간 정비·일반 민간 제외)를 D 말일로 되감아(기준일 뒤 실제 이벤트는 빼고 그 근거뿐인 단계는 낮춘다) boardFromLedger 를 돌린 judgment, 단계별 호수의 칸은 지금 보드 리본의 그 달 칸 — BACKFILL. 2026-10 부터는 그 달 종합상황판 판정 — OBSERVED.';
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
  eds.set(P.bulkDataMonth(rawDir), { month: null, dir: rawDir, zip: b.zip, member: b.member, collectedAt: raw.fetched_at.slice(0, 10), files: Object.values(raw.files).map((f) => f.zip), full: true });
  const list = [...eds.entries()].sort(([a], [c]) => a.localeCompare(c)).map(([month, e]) => ({ ...e, month }));
  const kept = [], skipped = [];
  for (const e of list) {
    e.sha256 = H.sha256(path.join(e.dir, e.zip));
    e.contentSha = await memberSha(path.join(e.dir, e.zip), e.member);
    if (kept.length && kept[kept.length - 1].contentSha === e.contentSha) skipped.push({ month: e.month, sameAs: kept[kept.length - 1].month }); else kept.push(e);
  }
  return { editions: kept, skipped };
}
/* 시간 되감기(머리 주석 ①). extraActual = 단계 근거로만 보는 실제 이벤트 */
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

/* 소급: FIRST … observedMonth 앞 달 중 관측 행이 없는 달. 원장 표 = base/tables, 지금 기준일 = base/manifest.json 의 reference_date */
async function backfill({ observedMonth, base = BASE, log = console.log } = {}) {
  const hist = readHistory(), observed = new Set(hist.rows.filter((r) => r.basis === 'OBSERVED').map((r) => r.month));
  const tables = loadTables(path.join(base, 'tables'));
  const { months, stagesOf } = boardFromLedger(tables, { referenceDate: P.referenceDateOf(base), observedMonth });
  const rows = [];
  for (let m = FIRST; m < observedMonth; m = addMonths(m, 1)) {
    if (observed.has(m)) continue;
    const ref = lastDay(m), i = months.indexOf(m);
    const stagesAt = new Map([...stagesOf].map(([id, s]) => [id, s[i]]));
    const board = boardFromLedger(rewind(tables, ref), { referenceDate: ref, observedMonth: m, stagesAt });
    const row = { ...board.trend[board.trend.length - 1], basis: 'BACKFILL' };
    rows.push(row);
    log(`${m} 기준일 ${ref}: 지연 ${row.delay.projects}/${row.delay.units} · 주의 ${row.caution.projects}/${row.caution.units} · 정상 ${row.ok.projects}/${row.ok.units} (판정 ${row.judged})`);
  }
  const keep = hist.rows.filter((r) => r.basis === 'OBSERVED'), all = [...keep, ...rows];
  writeHistory({ editions: Object.fromEntries(Object.entries(hist.editions).filter(([k]) => all.some((r) => r.edition === k))), rows: all });
  return { rows };
}

/* 관측: ledger-board.json 의 이번 달 판정 행을 OBSERVED 로 붙인다(같은 달 행은 바꾼다) */
async function close({ base = BASE, log = console.log } = {}) {
  const board = json(path.join(ROOT, 'data/board/ledger-board.json'));
  const row = board.trend?.find((r) => r.month === board.observedMonth);
  if (!row || row.basis !== 'OBSERVED') throw new Error('ledger-board.json 에 이번 달 판정 행(trend)이 없다 — node tools/ledger/board.js 로 다시 만든다');
  const hist = readHistory(), { editions } = await editionsOf(path.join(base, 'raw/hub-bulk-history'), path.join(base, 'raw/hub-bulk'));
  const ed = editions.find((e) => e.month === row.edition);
  writeHistory({ editions: { ...hist.editions, ...(ed ? { [ed.month]: { zip: ed.zip, sha256: ed.sha256 } } : {}) }, rows: [...hist.rows.filter((r) => r.month !== row.month), row] });
  log(`${row.month} OBSERVED 행을 ${HISTORY} 에 붙였다: 지연 ${row.delay.projects}/${row.delay.units} · 주의 ${row.caution.projects}/${row.caution.units}`);
}

module.exports = { editionsOf, rewind, renderHistory, backfill, RULE };

if (require.main === module) {
  const i = process.argv.indexOf('--month'), month = i > 0 ? process.argv[i + 1] : null;
  const base = month ? P.ledgerDir(month) : BASE, observedMonth = month ?? json(path.join(ROOT, 'data/board/ledger-board.json')).observedMonth;
  (process.argv.includes('--close') ? close({ base }) : backfill({ observedMonth, base }))
    .catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
