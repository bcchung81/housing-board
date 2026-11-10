'use strict';
/* map-golden 정답(tests/fixtures/map-golden-1021/golden.json 모양, 시험 MAP_GOLDEN)을 HOME 정답 폴더에서 다시 만든다.
   정답 폴더 = 정답 입력(S2-raw-map-dashboard{-js,}.json·S1-view-policy.json·S1-view-region-<시도>.json) + s1-policy.js·s2-projects.js 결과(golden-policy.json·golden-projects.json).
   옮겨 온 곳: 2026-11-09 세션 scratchpad mapgold/build.cjs(HOME-JSON-반영-계획 P3). 정책 응답은 deliv-<기준일>.json, 없으면 같은 응답 S1-view-policy.json.
   node map-golden.js <정답 폴더> <출력 json> [fetched_at(기본 S2-raw-map-dashboard.json 수정 시각)] */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const HV = require(path.join(ROOT, 'tools/ledger/home-view.js'));
const [dir, out, fetchedArg] = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const gp = read('golden-projects.json'), pol = read('golden-policy.json');
const dash97 = read('S2-raw-map-dashboard-js.json'), dashAll = read('S2-raw-map-dashboard.json');
const parts = (x) => x.stage_distribution?.parts ?? x.stage_distribution;
const regions = (d, notice) => d.groups.region.map((r) => ({ name: r.name, project_count: r.project_count, target_units: r.target_units, stage: parts(r), ...(notice ? { current_notice_units: r.current_notice_units } : {}) }));
const munis = (d) => d.municipalities.filter((m) => m.project_count > 0).sort((a, b) => (b.target_units ?? 0) - (a.target_units ?? 0)).map((m) => ({ region: m.region, name: m.name, project_count: m.project_count, target_units: m.target_units, stage: parts(m) }));
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const o97 = gp.poc_overview_97, oAll = gp.poc_overview_all;
/* '!' 지연 표시: 정책 응답(그 판에 시도·시군구 비교가 실려 있으면)의 region:/city: 비교에 home-view mapDelay */
const policyView = read('S1-view-policy.json');
const delivFile = `deliv-${policyView.as_of_date}.json`;
const view = fs.existsSync(path.join(dir, delivFile)) ? read(delivFile) : policyView;
const comps = { ...view.portfolio_comparisons };
for (const n of ['서울특별시', '경기도', '인천광역시']) {
  const f = `S1-view-region-${n}.json`;
  if (!comps[`region:${n}`] && fs.existsSync(path.join(dir, f))) comps[`region:${n}`] = read(f).portfolio_comparisons[`region:${n}`];
}
const marks = (prefix) => {
  const ks = Object.keys(comps).filter((k) => k.startsWith(prefix));
  if (!ks.length) return null;
  return Object.fromEntries(ks.map((k) => [k.slice(prefix.length), HV.mapDelay(comps[k].metrics, view.as_of_date)]).filter(([, d]) => d.delayed).map(([k, d]) => [k, d.delayNote]));
};
const doc = {
  _meta: {
    as_of: view.as_of_date,
    fetched_at: fetchedArg || fs.statSync(path.join(dir, 'S2-raw-map-dashboard.json')).mtime.toISOString(),
    made_from: [
      `${path.relative(ROOT, dir)}/golden-projects.json (S2-extract.js — PoC /map/dashboard 9·7·정책 전체)`,
      `${path.relative(ROOT, dir)}/${delivFile}(+ S1-view-region-<시도>.json) (PoC /policy-delivery/view portfolio_comparisons → home-view.js mapDelay = 정책 지도 !)`,
      `${path.relative(ROOT, dir)}/golden-policy.json (PoC 정책 화면 project_status·upcoming_12m)`,
      `${path.relative(ROOT, dir)}/S2-raw-map-dashboard{-js,}.json (PoC /map/dashboard 9·7·정책 전체 — 시군구·시도 stage_distribution.parts)`,
    ],
    note: 'PoC 공개 API 응답에서 수치만 옮김(담당자 이름·사유 글 없음). fetched_at = 정답 응답을 받은 시각(시험이 HOME 판 snapshot_at 과 비교 — tests/js/home-era.cjs). delay_marks.city 가 null 이면 그 판 응답에 시군구 비교가 없다(2026-10-22 22:35 HOME 앱부터 요청 범위만 싣는다).',
  },
  overview_97: { ...pick(o97, ['summary.project_count', 'summary.target_units', 'summary.target_counted_projects', 'summary.target_excluded_projects', 'summary.target_missing_projects', 'municipalities.with_projects', 'municipalities.target_sum', 'municipality_unlinked_ids', 'blocks.status']), regions: regions(dash97, true), municipalities: munis(dash97), stage: parts(dash97.summary), 'summary.current_notice_units': o97['summary.current_notice_units'] },
  overview_all: { ...pick(oAll, ['summary.project_count', 'summary.target_units', 'summary.target_counted_projects', 'summary.target_excluded_projects', 'summary.target_missing_projects']), stage: parts(dashAll.summary), regions: regions(dashAll, false), municipalities: munis(dashAll) },
  delay_marks: { region: marks('region:'), city: marks('city:') },
  policy_97: {
    project_status: Object.fromEntries(['DELAYED', 'WARNING', 'NORMAL', 'UNKNOWN'].map((k) => [k, pol[`policy.project_status.${k}.projects`]])),
    upcoming_12m: { total: pol['policy.statistics.upcoming_12m.total'], projects: pol['policy.statistics.upcoming_12m.projects'] },
  },
};
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log('wrote', out);
