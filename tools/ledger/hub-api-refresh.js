'use strict';
/* 열린 달 API 덮어쓰기: 건축HUB 대용량 판(월 1회, 데이터 달 + 1달에 나온다) 사이의 착공·사용검사·예정일 변화를 주택인허가 기본개요 OpenAPI
   (getHpBasisOulnInfo, 법정동 단위 현재값)로 대용량 중간 스냅샷(hub-bulk.js)에 덮어써, convert.js 가 같은 모양으로 읽는 hub-refresh.json 을 만든다.
   - 법정동: 그 달 대용량 중간 스냅샷 기록의 시군구5 + 법정동5(10자리) 집합. 법정동마다 모든 쪽을 부른다(호출·키 풀·재시도·22자리 관리번호 = snapshot.js fetchBjd).
     원본은 schemas/<달>/raw/hub-refresh/<법정동10>.json(쪽별 items, 인증키 없음). git 이 무시하고(.gitignore, 기획서 결정 4 "원천 응답 재배포 안 함")
     Storage 에는 raw-store.js push --only raw/hub-refresh 로 올린다. 오늘(한국시간) 받은 원본이 있는 법정동은 다시 부르지 않는다(끊긴 뒤 이어 받기).
   - API 기록은 대용량 기본개요 열 배열로 옮겨 hub-bulk.js basicRecord 로 정리한다(날짜·세대수·범위·진행 중 규칙이 대용량과 한 벌). 열 대응은 API_COL.
   - 덮어쓰기: ① 대용량 관리번호가 API 에 있으면 일정·세대수(apprv·stcns_sched·stcns·insp_sched·insp·households)를 API 값으로, 위치·이름(site·complex·address·block …)은 대용량 값 그대로.
     ② API 에 없으면 대용량 그대로. ③ 불러온 법정동 안에서 API 에만 있는 기록은 범위·진행 중 규칙(기준일 = 그 달 manifest 기준일)을 통과하면 새 기록
     (대표 필지 = API 의 번·지, site_count 1, complex null). ④ 덮어쓴 뒤 범위·진행 중 규칙(철거·멸실 포함)에 걸리면 뺀다.
     한계: 대용량에 없는 법정동의 새 사업은 다음 대용량 판에서만 들어온다. 대지위치·행위개요(필지 수·단지명)는 API 로 고치지 않는다.
   - 안전장치(종료 코드 1, 출력 파일을 쓰지 않음): 법정동 호출 실패 > 5% · 불러온 법정동 안 대용량 관리번호의 API 일치율 < 90%.
   실행: node tools/ledger/hub-api-refresh.js --month YYYY-MM [--offline]   (그 달 = 가장 늦은 원장 폴더)
     → schemas/<달>/snapshot/hub-refresh.json(hub-bulk 중간 스냅샷과 같은 schema·data_month) · hub-refresh.manifest.json · hub-refresh.report.json
     --offline 은 저장된 원본만 읽어 같은 결과를 낸다. manifest 의 data_as_of 는 API 기록 생성일자(crtnDay) 최댓값(부른 날 이하), 부른 날(한국시간)은 note 로
     convert 의 sources 행 notes 끝에 드러난다.
   시험: tests/js/hub-api-refresh.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./paths');
const H = require('./hub-bulk');
const S = require('./snapshot');

const MAX_PAGES = 200;          // 쪽 100건 × 200 — 넘으면 truncated 로 센다
const CONCURRENCY = 2;
const GAP_MS = 250;            // 호출 사이 최소 간격(전체). 동시 4·간격 없음에서 초당 호출 한도(…PER_SECOND_EXCEEDS)에 바로 걸렸다(2026-10-12 실측)
const FAIL_MAX = 0.05, MATCH_MIN = 0.9;
const FIELDS = ['apprv', 'stcns_sched', 'stcns', 'insp_sched', 'insp', 'households'];
const DATE_FIELDS = FIELDS.slice(0, 5);
/* 대용량 기본개요 열(hub-bulk.js B, manifest columns) ↔ API 필드: 관리_주택대장_PK · 대지_위치 · 건물_명 · 시군구_코드 · 법정동_코드 · 대지_구분_코드 · 번 · 지 · 특수지_명 · 블록 ·
   용도_코드_명 · 총_세대_수 · 철거_멸실_구분_코드 · 철거_멸실_일 · 승인_일 · 착공_예정_일 · 착공_일 · 사용_검사_예정_일 · 사용_검사_일 */
const API_COL = { pk: 'mgmHsrgstPk', address: 'platPlc', name: 'bldNm', sgg: 'sigunguCd', bjd: 'bjdongCd', plat_gb: 'platGbCd', bun: 'bun', ji: 'ji', special: 'splotNm', block: 'block',
  use: 'purpsCdNm', households: 'totHhldCnt', demolish_code: 'demolExtngGbCd', demolish_day: 'demolExtngDay', apprv: 'apprvDay', stcns_sched: 'stcnsSchedDay', stcns: 'stcnsDay', insp_sched: 'useInsptSchedDay', insp: 'useInsptDay' };

const kstDate = (iso) => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);
const pkOf = (item) => String(item.mgmHsrgstPk ?? '').trim();
const bjdOf = (r) => (/^\d{5}$/.test(r.sgg) && /^\d{5}$/.test(r.bjd) ? r.sgg + r.bjd : null);
/* API 기록 → 대용량 기본개요 열 배열(29열) */
function toColumns(item) {
  const c = Array(29).fill('');
  for (const [k, f] of Object.entries(API_COL)) c[H.B[k]] = item[f] == null ? '' : String(item[f]);
  return c;
}
/* 비교용 API 값(규칙과 상관없이 정리만) */
const apiValues = (item) => {
  const c = toColumns(item), n = Number(String(c[H.B.households]).trim());
  return { ...Object.fromEntries(DATE_FIELDS.map((k) => [k, H.cleanDate(c[H.B[k]])])), households: Number.isInteger(n) && n >= 1 ? n : null };
};

/* bulk = 대용량 중간 스냅샷 기록, api = { 법정동10: [API 기록…] | null(실패) }, referenceDate = 진행 중 규칙 기준일, bulkAsOf = 대용량 자료 기준일(의심 판정)
   → { records(관리번호 순), report } */
function merge(bulk, api, { referenceDate, bulkAsOf }) {
  const aMin = H.permitFloor(referenceDate);
  const loaded = new Set(Object.keys(api).filter((b) => api[b]));
  const byPk = new Map();
  let duplicates = 0;
  for (const b of [...loaded].sort()) for (const item of api[b]) { const pk = pkOf(item); if (!pk) continue; if (byPk.has(pk)) duplicates++; else byPk.set(pk, item); }
  const bulkPks = new Set(bulk.map((r) => r.pk));
  const fields = Object.fromEntries(FIELDS.map((k) => [k, { same: 0, changed: 0, api_only: 0, bulk_only: 0 }]));
  const ow = { overwritten: 0, overwritten_changed: 0, kept_not_in_api: 0, kept_not_queried: 0, added: 0, dropped: 0, dropped_reasons: {}, api_only_skipped: {} };
  const suspects = [], dropped = [], out = [];
  let queried = 0, matched = 0;
  for (const r of bulk) {
    const b = bjdOf(r);
    if (!b || !loaded.has(b)) { ow.kept_not_queried++; out.push(r); continue; }
    queried++;
    const item = byPk.get(r.pk);
    if (!item) { ow.kept_not_in_api++; out.push(r); continue; }
    matched++;
    const v = apiValues(item);
    for (const k of FIELDS) {
      const a = r[k] ?? null, n = v[k];
      const kind = a === n ? (a == null ? null : 'same') : a == null ? 'api_only' : n == null ? 'bulk_only' : 'changed';
      if (kind) fields[k][kind]++;
      if ((kind === 'changed' || kind === 'api_only') && DATE_FIELDS.includes(k) && n <= bulkAsOf) suspects.push({ pk: r.pk, field: k, bulk: a, api: n });
    }
    const res = H.basicRecord(toColumns(item), aMin);
    if (res.drop) { ow.dropped++; ow.dropped_reasons[res.drop] = (ow.dropped_reasons[res.drop] ?? 0) + 1; if (dropped.length < 10) dropped.push({ pk: r.pk, reason: res.drop }); continue; }
    const next = { ...r, ...Object.fromEntries(FIELDS.map((k) => [k, res.record[k]])) };
    ow.overwritten++;
    if (FIELDS.some((k) => next[k] !== r[k])) ow.overwritten_changed++;
    out.push(next);
  }
  for (const [pk, item] of byPk) {
    if (bulkPks.has(pk)) continue;
    const res = H.basicRecord(toColumns(item), aMin);
    if (res.drop) { ow.api_only_skipped[res.drop] = (ow.api_only_skipped[res.drop] ?? 0) + 1; continue; }
    const x = res.record;
    out.push({ ...x, site: { sgg: x.sgg, bjd: x.bjd, plat_gb: x.plat_gb, bun: x.bun, ji: x.ji }, site_count: 1 });
    ow.added++;
  }
  out.sort((a, b) => (a.pk < b.pk ? -1 : a.pk > b.pk ? 1 : 0));
  const rate = queried ? matched / queried : 0;
  return {
    records: out,
    report: {
      match: { bulk_records: bulk.length, queried, matched, rate: Math.round(rate * 10000) / 10000, not_queried: bulk.length - queried, api_records: byPk.size, api_duplicates: duplicates },
      fields, suspect: { rule: `바뀐(또는 API 에서 새로 채워진) 날짜가 대용량 자료 기준일 ${bulkAsOf} 이전`, count: suspects.length, sample: suspects.slice(0, 10) },
      overwrite: ow, dropped_sample: dropped, records: out.length,
    },
  };
}

/* 법정동 목록을 limit 개씩 함께 */
async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; await fn(items[i]); } }));
}

/* root·month 의 원본을 받거나(online) 읽고(offline) 덮어써 출력 파일을 쓴다. clock = 지금 시각(시험용). 안전장치에 걸리면 Error(e.safety = true)를 던지고 출력은 쓰지 않는다 */
async function run({ root = P.ROOT, month, offline = false, clock = Date.now, pool, doFetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log } = {}) {
  if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new Error('--month YYYY-MM 이 필요하다');
  const latest = P.latestMonth(root);
  if (month !== latest) throw new Error(`${month} 는 가장 늦은 원장 폴더(${latest})가 아니다(열린 달만 덮어쓴다)`);
  const dir = P.ledgerDir(month, root), dataMonth = P.bulkDataMonth(path.join(dir, 'raw/hub-bulk'));
  const { out: bulkFile, manifest: bulkManifestFile } = H.outFiles(dir, dataMonth);
  const bulk = H.loadRecords(bulkFile), bm = JSON.parse(fs.readFileSync(bulkManifestFile, 'utf8'));
  const referenceDate = P.referenceDateOf(dir), today = kstDate(new Date(clock()).toISOString());
  const bjds = [...new Set(bulk.map(bjdOf).filter(Boolean))].sort();
  const rawFile = (b) => path.join(dir, 'raw/hub-refresh', `${b}.json`);
  const files = {};
  let reused = 0;
  if (offline) {
    for (const b of bjds) if (fs.existsSync(rawFile(b))) files[b] = JSON.parse(fs.readFileSync(rawFile(b), 'utf8'));
  } else {
    if (!pool) {
      const { createKeyPool, fileStore } = require('../../lib/keys.js');
      const { defaultDir } = require('../../lib/cache.js');
      const { loadEnv } = require('../../scripts/dev.js');
      const env = Object.assign({}, loadEnv(path.join(root, '.env.local')), process.env);
      pool = createKeyPool({ env, store: fileStore(path.join(defaultDir(env), 'key-usage.json')) });
    }
    fs.mkdirSync(path.join(dir, 'raw/hub-refresh'), { recursive: true });
    let slot = 0;
    const paced = async (...a) => { const t = clock(), at = Math.max(t, slot); slot = at + GAP_MS; if (at > t) await sleep(at - t); return (doFetch ?? fetch)(...a); };
    let done = 0, failed = 0;
    const one = async (b) => {
      if (fs.existsSync(rawFile(b))) {
        const f = JSON.parse(fs.readFileSync(rawFile(b), 'utf8'));
        if (kstDate(f.fetched_at) === today) { files[b] = f; reused++; done++; return; }
      }
      let calls = 0;
      const counted = (...a) => { calls++; return paced(...a); };
      const fetched_at = new Date(clock()).toISOString();
      try {
        const { pages } = await S.fetchBjd(b, { pool, doFetch: counted, sleep, maxPages: MAX_PAGES });
        // 인증키가 든 요청 주소는 남기지 않는다: 엔드포인트와 키를 뺀 조회 조건만
        files[b] = { source_ref: S.SOURCE_REF, endpoint: S.HUB_URL, params: { sigunguCd: b.slice(0, 5), bjdongCd: b.slice(5, 10), numOfRows: String(S.PAGE_ROWS), _type: 'json' }, fetched_at, calls, pages };
        fs.writeFileSync(rawFile(b), `${JSON.stringify(files[b], null, 1)}\n`);
      } catch (e) {
        failed++;
        if (failed <= 5) log(`${b}: 실패 — ${(e && e.name) || 'Error'}: ${String((e && e.message) || e).slice(0, 80)}`);
      }
      if (++done % 200 === 0) log(`법정동 ${done}/${bjds.length} (실패 ${failed}, 오늘 받은 원본 다시 씀 ${reused})`);
    };
    await mapLimit(bjds, CONCURRENCY, one);
    const again = bjds.filter((b) => !files[b]);   // 실패한 법정동은 잠시 쉬었다가 하나씩 한 번 더
    if (again.length) { log(`실패 ${again.length}곳을 하나씩 다시 부른다`); await sleep(10000); failed = 0; await mapLimit(again, 1, one); }
  }

  const api = Object.fromEntries(bjds.map((b) => [b, files[b] ? files[b].pages.flatMap((p) => p.items) : null]));
  const failedBjds = bjds.filter((b) => !files[b]);
  const truncated = bjds.filter((b) => files[b] && files[b].pages.length && files[b].pages[files[b].pages.length - 1].items.length && files[b].pages.reduce((a, p) => a + p.items.length, 0) < files[b].pages[0].total_count);
  const { records, report } = merge(bulk, api, { referenceDate, bulkAsOf: bm.data_as_of });
  const stamps = Object.values(files).map((f) => f.fetched_at).sort();
  const calls = Object.values(files).reduce((a, f) => a + f.calls, 0), pages = Object.values(files).reduce((a, f) => a + f.pages.length, 0);
  const summary = { bjds: bjds.length, loaded: bjds.length - failedBjds.length, failed: failedBjds.length, truncated: truncated.length, calls, pages };
  log(`법정동 ${summary.bjds} · 불러옴 ${summary.loaded} · 실패 ${summary.failed} · 호출 ${calls} · 쪽 ${pages}${offline ? ' (--offline)' : ` · 오늘 받은 원본 다시 씀 ${reused}`}`);
  log(`관리번호 일치 ${report.match.matched}/${report.match.queried} (${(report.match.rate * 100).toFixed(2)}%) · ①덮어씀 ${report.overwrite.overwritten}(바뀜 ${report.overwrite.overwritten_changed}) · ②그대로 ${report.overwrite.kept_not_in_api}+조회 안 됨 ${report.overwrite.kept_not_queried} · ③더함 ${report.overwrite.added} · ④뺌 ${report.overwrite.dropped}`);
  const why = [];
  if (failedBjds.length / (bjds.length || 1) > FAIL_MAX) why.push(`법정동 호출 실패 ${failedBjds.length}/${bjds.length} 가 ${FAIL_MAX * 100}% 를 넘는다`);
  if (report.match.rate < MATCH_MIN) why.push(`대용량 관리번호의 API 일치율 ${(report.match.rate * 100).toFixed(2)}% 가 ${MATCH_MIN * 100}% 보다 낮다`);
  if (why.length) { const e = new Error(`안전장치: ${why.join(' · ')} — 출력 파일을 쓰지 않았다`); e.safety = true; throw e; }

  const fetchedOn = stamps.length ? kstDate(stamps[0]) : today;
  /* 자료 기준일 = API 기록 생성일자(crtnDay)의 최댓값(부른 날을 넘지 않게). 2026-10-12 실측: OpenAPI 도 대용량 2026-08 판과 같은 자료(최대 2026-08-31)라
     부른 날을 data_as_of 로 두면 보드가 '실제 날짜 2026-10까지'로 잘못 보인다. 부른 날은 note·fetched_at 에 남긴다 */
  const created = Object.values(api).flat().filter(Boolean).map((it) => H.cleanDate(it.crtnDay)).filter(Boolean).sort().pop() ?? null;
  const dataAsOf = created && created < fetchedOn ? created : fetchedOn;
  const base = path.relative(dir, bulkFile).split(path.sep).join('/');
  const manifest = {
    source: `건축HUB 대용량 ${dataMonth} 판 중간 스냅샷(${base})을 주택인허가 기본개요 OpenAPI(getHpBasisOulnInfo) 현재값으로 덮어씀`,
    data_month: dataMonth, data_as_of: dataAsOf, fetched_at: stamps[0] ?? null, fetched_until: stamps[stamps.length - 1] ?? null, endpoint: S.HUB_URL,
    note: `건축HUB OpenAPI(${fetchedOn} 호출, 기록 생성일 최대 ${created ?? '없음'}) 값으로 일정·세대수를 덮어씀(대용량 ${dataMonth} 판 기준 ${bm.data_as_of}, tools/ledger/hub-api-refresh.js)`,
    base: { file: base, data_month: dataMonth, data_as_of: bm.data_as_of, fetched_at: bm.fetched_at, records: bulk.length }, files: bm.files, reference_date: referenceDate,
    rules: { overwrite: '① 관리번호가 API 에 있으면 일정·세대수를 API 값으로(위치·이름은 대용량) ② 없으면 대용량 그대로 ③ 불러온 법정동에서 API 에만 있고 범위·진행 중 규칙을 통과하면 더함 ④ 덮어쓴 뒤 규칙에 걸리면 뺌', active: bm.rules?.active ?? null,
      safety: `법정동 호출 실패 ≤ ${FAIL_MAX * 100}% · 관리번호 일치율 ≥ ${MATCH_MIN * 100}%`, limit: '대용량에 없는 법정동의 새 사업은 다음 대용량 판에서만 들어온다' },
    ...summary, failed_bjds: failedBjds, truncated_bjds: truncated, api_records: report.match.api_records, records: records.length, overwrite: report.overwrite,
  };
  const snap = path.join(dir, 'snapshot');
  fs.writeFileSync(path.join(snap, 'hub-refresh.json'), H.renderRecords(records, dataMonth));
  fs.writeFileSync(path.join(snap, 'hub-refresh.manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  fs.writeFileSync(path.join(snap, 'hub-refresh.report.json'), `${JSON.stringify({ month, reference_date: referenceDate, base_data_as_of: bm.data_as_of, api_date: fetchedOn, api_created_max: created, bjds: summary, ...report }, null, 1)}\n`);
  log(`${path.relative(root, path.join(snap, 'hub-refresh.json'))} (기록 ${records.length})`);
  return { records, manifest, report };
}

module.exports = { merge, toColumns, run, API_COL, FAIL_MAX, MATCH_MIN };

if (require.main === module) {
  const i = process.argv.indexOf('--month');
  run({ month: i > 0 ? process.argv[i + 1] : null, offline: process.argv.includes('--offline') })
    .catch((e) => { console.error(`오류: ${e.message}`); process.exit(1); });
}
