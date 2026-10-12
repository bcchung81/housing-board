'use strict';
/* 원장 달 폴더(schemas/ledger-YYYY-MM) 찾기 — hub-bulk.js·board.js·trend.js·monthly.js·raw-store.js 가 같이 쓴다.
   달 폴더의 기준일과 대용량 판(데이터 월)은 폴더 안 파일에서 읽는다(경로·달을 코드에 박지 않는다). */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
/* 2026-10 원장의 기준일(2026-10-10 결정). 달 기록(manifest.json, tools/ledger/monthly.js 가 쓴다)이 없는 폴더에 쓴다 */
const DEFAULT_REFERENCE_DATE = '2026-10-10';

/* 있는 원장 달(오래된 것부터) */
const ledgerMonths = (root = ROOT) => fs.readdirSync(path.join(root, 'schemas')).map((d) => /^ledger-(\d{4}-\d{2})$/.exec(d)?.[1]).filter(Boolean).sort();
function latestMonth(root = ROOT) {
  const all = ledgerMonths(root);
  if (!all.length) throw new Error('schemas/ledger-YYYY-MM 폴더가 없다');
  return all[all.length - 1];
}
const ledgerDir = (month, root = ROOT) => path.join(root, 'schemas', `ledger-${month}`);

/* 대용량 판의 데이터 월: raw/hub-bulk/manifest.json 의 data_month, 없으면 기본개요 zip 이름 끝(…_2026-08.zip) */
function bulkDataMonth(rawDir) {
  const m = JSON.parse(fs.readFileSync(path.join(rawDir, 'manifest.json'), 'utf8'));
  const dm = m.data_month ?? /_(\d{4}-\d{2})\.zip$/.exec(m.files?.basic?.zip ?? '')?.[1];
  if (!dm) throw new Error(`${rawDir}/manifest.json 에서 데이터 월을 찾지 못했다`);
  return dm;
}

/* 달 폴더의 기준일: manifest.json 의 reference_date, 없으면 DEFAULT_REFERENCE_DATE */
function referenceDateOf(dir) {
  const f = path.join(dir, 'manifest.json');
  return (fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).reference_date) || DEFAULT_REFERENCE_DATE;
}

/* 말일 'YYYY-MM-DD' */
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

module.exports = { ROOT, DEFAULT_REFERENCE_DATE, ledgerMonths, latestMonth, ledgerDir, bulkDataMonth, referenceDateOf, lastDay };
