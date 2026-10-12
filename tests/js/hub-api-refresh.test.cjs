'use strict';
// 열린 달 API 덮어쓰기(tools/ledger/hub-api-refresh.js): 가짜 건축HUB OpenAPI 쪽으로 덮어쓰기 ①~④, 22자리 관리번호 정밀도(JSON 숫자로 와도 문자열 그대로),
// 안전장치 두 경우(법정동 호출 실패 > 5% · 관리번호 일치율 < 90% → 출력 안 씀), --offline 이 같은 결과, 오늘 받은 원본은 다시 부르지 않음, 자료 기준일·convert 의 sources 메모. 네트워크를 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../../tools/ledger/hub-api-refresh');
const H = require('../../tools/ledger/hub-bulk');
const { createKeyPool, memoryStore } = require('../../lib/keys.js');
const { readHubBulk } = require('../../tools/ledger/convert');

const X = '1129013800', Y = '4145010800';
const NOW = Date.parse('2026-10-11T21:00:00Z');   // 한국시간 2026-10-12 06:00
const BIG = '1000000000000000339484', SMALL = '1009100004842';
const bulkRec = (pk, o = {}) => ({ pk, sgg: X.slice(0, 5), bjd: X.slice(5), plat_gb: '0', bun: '0008', ji: '0002', block: '', special: '', address: '서울특별시 성북구 장위동 8-2번지', name: `사업 ${pk.slice(-3)}`, complex: '대용량 단지', use: '공동주택',
  households: 100, apprv: '2023-01-01', stcns_sched: '2024-03-01', stcns: null, insp_sched: '2027-06-30', insp: null, site: { sgg: '11290', bjd: '13800', plat_gb: '0', bun: '0008', ji: '0002' }, site_count: 3, ...o });
/* 대용량 기록 → 같은 값의 API 기록(필드 이름은 실제 응답, 빈칸은 ' ') */
const ymd = (d) => (d ? d.replace(/-/g, '') : ' ');
const apiRec = (r, o = {}) => ({ platPlc: r.address, sigunguCd: r.sgg, bjdongCd: r.bjd, platGbCd: r.plat_gb, bun: r.bun, ji: r.ji, mgmHsrgstPk: r.pk, bldNm: r.name, splotNm: ' ', block: ' ', lot: ' ', purpsCd: '02000', purpsCdNm: r.use,
  mainBldCnt: 1, totArea: 1, totHhldCnt: r.households, demolExtngGbCd: ' ', demolExtngDay: ' ', apprvDay: ymd(r.apprv), stcnsSchedDay: ymd(r.stcns_sched), stcnsDay: ymd(r.stcns), useInsptSchedDay: ymd(r.insp_sched), useInsptDay: ymd(r.insp), crtnDay: '20260901', ...o });

/* 법정동 X: 덮어씀(바뀜) BIG · 그대로 SMALL · API 에 없음 C · API 에서 세대수 0 D · 채움 120건(같은 값) / Y: 채움 3건 / 시군구 빈 기록 F */
function data() {
  const fill = (b, n, from) => Array.from({ length: n }, (_, i) => bulkRec(`10000000000000006${String(from + i).padStart(5, '0')}`, { sgg: b.slice(0, 5), bjd: b.slice(5) }));
  const A = bulkRec(BIG), B = bulkRec(SMALL), C = bulkRec('1000000000000000400001'), D = bulkRec('1000000000000000400002');
  const F = bulkRec('1000000000000000400003', { sgg: '', bjd: '', site: null, site_count: 0 });
  const fx = fill(X, 120, 0), fy = fill(Y, 3, 500);
  const bulk = [A, B, C, D, F, ...fx, ...fy].sort((a, b) => (a.pk < b.pk ? -1 : 1));
  const G = apiRec(bulkRec('1000000000000000500001', { apprv: '2025-01-01', bun: '0011', ji: '0000' }), { block: ' ', bldNm: '새 허가' });
  const Hh = apiRec(bulkRec('1000000000000000500002'), { totHhldCnt: 0 });
  const api = {
    [X]: [apiRec(A, { stcnsDay: '20260915', apprvDay: '20220101', crtnDay: '20260930' }), apiRec(B), apiRec(D, { totHhldCnt: 0 }), ...fx.map((r) => apiRec(r)), G, Hh],
    [Y]: fy.map((r) => apiRec(r)),
  };
  return { bulk, api };
}

/* 가짜 OpenAPI: 법정동·쪽 → JSON 본문. 관리번호는 실제처럼 JSON 숫자(22자리는 따옴표 없이) */
function fakeApi(api, { fail = new Set(), empty = new Set() } = {}) {
  const calls = [];
  const doFetch = async (url) => {
    const q = new URL(url).searchParams, b = q.get('sigunguCd') + q.get('bjdongCd'), page = +q.get('pageNo'), rows = +q.get('numOfRows');
    calls.push(`${b}#${page}`);
    if (fail.has(b)) return { ok: false, status: 400, text: async () => '' };
    const all = empty.has(b) ? [] : api[b] ?? [], items = all.slice((page - 1) * rows, page * rows);
    const body = JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { items: { item: items }, numOfRows: rows, pageNo: page, totalCount: all.length } } })
      .replace(/"mgmHsrgstPk":"(\d+)"/g, '"mgmHsrgstPk":$1');
    return { ok: true, status: 200, text: async () => body };
  };
  return { doFetch, calls };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-refresh-'));
  const dir = path.join(root, 'schemas/ledger-2026-10');
  const w = (rel, v) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' ? v : `${JSON.stringify(v, null, 1)}\n`); };
  const { bulk, api } = data();
  w('raw/hub-bulk/manifest.json', { data_month: '2026-08', files: {} });
  w('manifest.json', { month: '2026-10', reference_date: '2026-10-12' });
  w('snapshot/hub-bulk-2026-08.json', H.renderRecords(bulk, '2026-08'));
  w('snapshot/hub-bulk-2026-08.manifest.json', { data_month: '2026-08', data_as_of: '2026-08-31', fetched_at: '2026-10-11T01:37:31Z', files: { basic: { zip: '기본개요_2026-08.zip' } }, rules: { active: '진행 중' } });
  return { root, dir, bulk, api };
}
const pool = () => createKeyPool({ env: { DATA_GO_KR_KEY: 'test-key' }, store: memoryStore() });
const OUTS = ['hub-refresh.json', 'hub-refresh.manifest.json', 'hub-refresh.report.json'];
const outputs = (dir) => OUTS.map((f) => { const p = path.join(dir, 'snapshot', f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; });
const quiet = { log: () => {}, sleep: async () => {}, clock: () => NOW };

test('덮어쓰기 ①~④: 일정·세대수만 API 값으로(위치는 대용량), API 에 없으면 그대로, API 에만 있고 규칙을 통과하면 더하고, 덮어쓴 뒤 규칙에 걸리면 뺀다', () => {
  const { bulk, api } = data();
  const { records, report } = R.merge(bulk, api, { referenceDate: '2026-10-12', bulkAsOf: '2026-08-31' });
  const by = new Map(records.map((r) => [r.pk, r]));
  const a = by.get(BIG);
  assert.deepEqual([a.stcns, a.apprv, a.complex, a.site_count, a.address], ['2026-09-15', '2022-01-01', '대용량 단지', 3, '서울특별시 성북구 장위동 8-2번지'], '① 일정은 API, 위치·단지명은 대용량');
  assert.deepEqual(by.get(SMALL), bulk.find((r) => r.pk === SMALL), '① 값이 같으면 그대로');
  assert.ok(by.has('1000000000000000400001') && by.has('1000000000000000400003'), '② API 에 없음 · 조회 안 된 법정동(시군구 빈칸)은 그대로');
  assert.ok(!by.has('1000000000000000400002'), '④ API 세대수 0 → 범위 밖');
  const g = by.get('1000000000000000500001');
  assert.deepEqual([g.site, g.site_count, g.complex, g.name], [{ sgg: '11290', bjd: '13800', plat_gb: '0', bun: '0011', ji: '0000' }, 1, null, '새 허가'], '③ 대표 필지 = API 번·지');
  assert.ok(!by.has('1000000000000000500002'), 'API 에만 있어도 규칙에 걸리면 더하지 않는다');
  assert.deepEqual(records.map((r) => r.pk), [...records.map((r) => r.pk)].sort(), '관리번호 순');
  const o = report.overwrite;
  assert.deepEqual([o.overwritten, o.overwritten_changed, o.kept_not_in_api, o.kept_not_queried, o.added, o.dropped], [125, 1, 1, 1, 1, 1]);
  assert.deepEqual([o.dropped_reasons, o.api_only_skipped], [{ NO_HOUSEHOLDS: 1 }, { NO_HOUSEHOLDS: 1 }]);
  assert.deepEqual([report.match.queried, report.match.matched], [127, 126]);
  assert.deepEqual(report.fields.stcns, { same: 0, changed: 0, api_only: 1, bulk_only: 0 }, 'D 는 비교에는 든다(세대수만 다름)');
  assert.deepEqual(report.fields.apprv.changed, 1);
  assert.deepEqual(report.fields.households, { same: 125, changed: 0, api_only: 0, bulk_only: 1 });
  assert.deepEqual(report.suspect.sample, [{ pk: BIG, field: 'apprv', bulk: '2023-01-01', api: '2022-01-01' }], '대용량 기준일 전으로 바뀐 날짜만 의심(2026-09-15 착공은 아님)');
});

test('실행: 법정동마다 모든 쪽을 부르고 원본(키 없음)을 남기며, 22자리 관리번호가 JSON 숫자로 와도 정밀도를 잃지 않는다. 출력은 hub-bulk 와 같은 schema·data_month', async () => {
  const f = fixture(), fake = fakeApi(f.api);
  const r = await R.run({ root: f.root, month: '2026-10', pool: pool(), doFetch: fake.doFetch, ...quiet });
  assert.deepEqual(fake.calls.sort(), [`${X}#1`, `${X}#2`, `${Y}#1`], '125건 법정동은 두 쪽');
  const raw = fs.readFileSync(path.join(f.dir, 'raw/hub-refresh', `${X}.json`), 'utf8');
  assert.ok(!raw.includes('test-key') && !raw.includes('serviceKey'), '원본에 인증키 없음');
  assert.ok(raw.includes(`"mgmHsrgstPk": "${BIG}"`), '22자리는 문자열로 저장');
  assert.equal(r.records.find((x) => x.pk === BIG).stcns, '2026-09-15');
  assert.equal(r.report.match.rate, 0.9921);
  const [out, man] = outputs(f.dir);
  assert.match(out, /^\{"schema":"hub-bulk\/1","data_month":"2026-08","records":\[\n/);
  const m = JSON.parse(man);
  assert.deepEqual([m.data_month, m.data_as_of, m.bjds, m.failed, m.calls, m.records], ['2026-08', '2026-09-30', 2, 0, 3, r.records.length], 'data_as_of = API 기록 생성일 최댓값(부른 날 2026-10-12 이하)');
  const hb = readHubBulk(path.join(f.dir, 'snapshot/hub-refresh.json'));
  assert.deepEqual([hb.dataMonth, hb.dataAsOf, hb.files], ['2026-08', '2026-09-30', ['기본개요_2026-08.zip']], 'convert 의 source_ref(hub-bulk-hs-2026-08) 그대로');
  assert.match(hb.note, /건축HUB OpenAPI\(2026-10-12 호출, 기록 생성일 최대 2026-09-30\) 값으로 일정·세대수를 덮어씀/, '부른 날은 sources 행 notes 로');
});

test('--offline 은 저장된 원본만 읽어 같은 결과, 오늘 받은 원본이 있는 법정동은 다시 부르지 않는다', async () => {
  const f = fixture(), fake = fakeApi(f.api);
  await R.run({ root: f.root, month: '2026-10', pool: pool(), doFetch: fake.doFetch, ...quiet });
  const online = outputs(f.dir);
  for (const x of OUTS) fs.rmSync(path.join(f.dir, 'snapshot', x));
  await R.run({ root: f.root, month: '2026-10', offline: true, ...quiet, doFetch: () => { throw new Error('호출하면 안 된다'); } });
  assert.deepEqual(outputs(f.dir), online);
  const again = fakeApi(f.api);
  await R.run({ root: f.root, month: '2026-10', pool: pool(), doFetch: again.doFetch, ...quiet });
  assert.deepEqual([again.calls, outputs(f.dir)], [[], online], '같은 날 다시 돌리면 호출 0');
});

test('안전장치: 법정동 호출 실패 > 5% 또는 관리번호 일치율 < 90% 면 오류(e.safety)이고 출력 파일을 쓰지 않는다', async () => {
  const f = fixture();
  await assert.rejects(R.run({ root: f.root, month: '2026-10', pool: pool(), doFetch: fakeApi(f.api, { fail: new Set([Y]) }).doFetch, ...quiet }), (e) => e.safety && /법정동 호출 실패 1\/2/.test(e.message));
  assert.deepEqual(outputs(f.dir), [null, null, null]);
  const g = fixture();
  await assert.rejects(R.run({ root: g.root, month: '2026-10', pool: pool(), doFetch: fakeApi(g.api, { empty: new Set([X]) }).doFetch, ...quiet }), (e) => e.safety && /일치율 2\.36%/.test(e.message));
  assert.deepEqual(outputs(g.dir), [null, null, null]);
  await assert.rejects(R.run({ root: g.root, month: '2026-09', ...quiet }), /가장 늦은 원장 폴더\(2026-10\)가 아니다/);
});
