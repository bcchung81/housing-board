#!/usr/bin/env node
/* 주택도시보증공사(HUG) 분양이력정보(지역별) OpenAPI 전국·전 기간 원본 수집(원장 변환 없음).
   호출 주소: https://www.khug.or.kr/infoDistributionHistory.do?API_KEY=..&STDD_YYM=연도&AREA_DCD=지역코드(01~16). 쪽 변수 없음, 응답은 JSON 배열.
   연도(기준연도)×지역 16곳을 모두 부른다(--from..--to, 기본 2000..올해). 자료 없음(ERROR_CODE 03 NO_DATA)은 행 0건.
   결과: <out>/infoDistributionHistory.json({operation, totalCount, rows}, 한 행 한 줄) + manifest.json. 키(HUG_SERVICE_KEY, 환경변수 또는 .env.local)는 어디에도 쓰지 않는다.
   사용: node tools/ledger/collect-hug.js [--out schemas/ledger-2026-10/raw/hug-sale-history] [--from 2000] [--to 2026]
   한도: 호출 사이 250 ms, 순차, 오류는 쉬었다 최대 3회 다시. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const URL_BASE = 'https://www.khug.or.kr/infoDistributionHistory.do';
const OPERATION = 'infoDistributionHistory';
const SOURCE = '주택도시보증공사(HUG) 분양이력정보(지역별) OpenAPI(HUG 빅데이터 개방 포털 HOUSTA, 사업장별 분양이력정보)';
const AREAS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16'];
const SPACING_MS = 250;
const RETRY_WAIT_MS = 5000;
const RETRIES = 3;

/* ---- 순수 함수 ---- */
const countBy = (rows, fn) => { const m = {}; for (const r of rows) { const k = fn(r) || '(없음)'; m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])); };
function dateRange(rows, field) {
  const ds = rows.map((r) => String(r[field] || '')).filter(Boolean).sort();
  return { earliest: ds[0] || null, latest: ds[ds.length - 1] || null };
}
const serialize = (operation, totalCount, rows) => `{"operation":${JSON.stringify(operation)},"totalCount":${totalCount},"rows":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;

/* ---- 실행부 ---- */
function loadKey() {   // 환경변수 먼저, 없으면 .env.local
  const file = path.join(ROOT, '.env.local');
  const t = process.env.HUG_SERVICE_KEY ?? (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(/^HUG_SERVICE_KEY=(.*)$/m)?.[1] : null);
  if (!t) throw new Error('HUG_SERVICE_KEY 없음');
  return t.replace(/^["']|["']$/g, '').trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeCaller(key) {
  const state = { calls: 0 };
  let last = 0;
  async function get(year, area) {
    const qs = new URLSearchParams({ API_KEY: key, STDD_YYM: String(year), AREA_DCD: area });
    for (let attempt = 1; ; attempt++) {
      const at = Math.max(Date.now(), last + SPACING_MS); last = at;
      if (at > Date.now()) await sleep(at - Date.now());
      state.calls++;
      try {
        const res = await fetch(`${URL_BASE}?${qs}`, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = JSON.parse(await res.text());
        if (!Array.isArray(body)) throw new Error('JSON 배열이 아님');
        const err = body.find((r) => r.ERROR_CODE);   // 자료 없는 연도·지역은 [{"ERROR_CODE":"03","ERROR_MSG":"NO_DATA"}] 한 줄 → 0건
        if (err) {
          if (err.ERROR_CODE === '03') return [];
          throw new Error(`${year}/${area}: ERROR_CODE ${err.ERROR_CODE} ${err.ERROR_MSG}`);
        }
        return body;
      } catch (e) {
        if (attempt > RETRIES) throw new Error(`${year}/${area}: ${String(e.message).split(key).join('<KEY>')}`);
        await sleep(RETRY_WAIT_MS * attempt);
      }
    }
  }
  return { state, get };
}

async function main() {
  const a = process.argv.slice(2), opt = (n, d) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : d; };
  const out = path.resolve(ROOT, opt('out', 'schemas/ledger-2026-10/raw/hug-sale-history'));
  const from = Number(opt('from', 2000)), to = Number(opt('to', new Date().getFullYear()));
  const { state, get } = makeCaller(loadKey());
  const rows = [], perYear = {};
  for (let y = from; y <= to; y++) {
    for (const area of AREAS) {
      const part = await get(y, area);
      for (const r of part) rows.push(r);
      perYear[y] = (perYear[y] || 0) + part.length;
    }
    console.log(`${y}: ${perYear[y]}건`);
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${OPERATION}.json`), serialize(OPERATION, rows.length, rows));
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
  const manifest = {
    source: SOURCE, fetched_at: new Date().toISOString(), endpoint: [URL_BASE],
    params: { STDD_YYM: `${from}..${to} (연도별)`, AREA_DCD: '01..16 (시·도별)', 쪽: '없음(연도×지역 1회에 전부)' },
    calls: state.calls, pages: state.calls, records: rows.length,
    notes: '연도(STDD_YYM)×지역(AREA_DCD 01~16) 조합마다 1회 호출한 응답 배열을 합쳤다(rows 는 원천 행 그대로, 값 변환 없음). 행에는 기준연도 필드가 없고, 여러 연도 응답에 같은 사업장이 겹쳐 들어올 수 있다(중복 제거 안 함). 자료 없음(NO_DATA) 응답은 행으로 세지 않았다.',
    operations: {
      [OPERATION]: {
        totalCount: rows.length, rows: rows.length, calls: state.calls, fields,
        COLL_ANNO_APVL_DT: dateRange(rows, 'COLL_ANNO_APVL_DT'), SILT_OPEN_DT: dateRange(rows, 'SILT_OPEN_DT'),
        byArea: countBy(rows, (r) => `${r.AREA_DCD}:${r.AREA_DCD_NM}`),
      },
    },
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(`완료: ${rows.length}건, 호출 ${state.calls}회`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
