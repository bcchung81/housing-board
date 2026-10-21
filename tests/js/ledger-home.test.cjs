'use strict';
// 수도권 HOME 덤프 정본(tools/ledger/home-source.js, 계획 docs/product/데이터-정제-계획.md 4절 D4·D5): 재덤프 리허설.
// ① 같은 판 두 번 → 표 바이트 동일 ② 수도권 밖 사업·딸린 행 없음(2026-10-19 결정)·수도권 밖 지역·통계 행 없음(2026-10-20 결정), 사업과 무관한 비HOME 행은 변경 전(git HEAD 의 표)에서 수도권 밖만 빠진 그대로 ③ 수도권 = 시도 합 ④ 수도권 사업 = HOME 사업(시군구가 정해진 블록 묶음), 같은 블록 두 사업 0
// ⑤ 연결(home_mapping)만 바꾼 가짜 판 → links 만 바뀌고 사업 id 그대로(HPR_ 를 바꾼 판도 사업 id 그대로) ⑥ HOME statistic = 통계누리 stat_facts(서울·인천·경기 겹치는 기간)
// HOME 원본(jsonl.gz)은 저장소에 없다(gitignore, Storage) — 없으면 원본이 필요한 시험은 건너뛴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { convert, loadInputs, readHubBulk, readNational, readStageInput, stageFileOf, renderTable } = require('../../tools/ledger/convert');
const H = require('../../tools/ledger/home-source');
const { boardFromLedger, mapIndexFromLedger, loadTables, loadLhBlocks, isShown } = require('../../tools/ledger/board');
const { validate } = require('../../tools/ledger/validate');
const { parseLegalDong } = require('../../tools/ledger/legal-dong');
const P = require('../../tools/ledger/paths');

const ROOT = path.join(__dirname, '..', '..');
const BASE = P.ledgerDir('2026-10');
const read = (p) => JSON.parse(fs.readFileSync(path.join(BASE, p), 'utf8'));
const HOME_DIR = H.latestHomeDir(BASE), HAVE = H.homeAvailable(HOME_DIR);
const SKIP = !HAVE && 'HOME 원본(jsonl.gz) 없음 — Storage 에서 받거나 tools/ledger/home-dump.py';
const CAP = ['11', '28', '41'];
const isCap = (sgg) => CAP.includes(String(sgg).slice(0, 2));
const TABLES = fs.readdirSync(path.join(BASE, 'tables')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const saved = Object.fromEntries(TABLES.map((t) => [t, read(`tables/${t}.json`).rows]));
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry/projects.json'), 'utf8'));
const homeIds = read('mappings/home-ids.json');

/* 월 갱신(monthly.js convertArgs)과 같은 입력 */
let base = null;
const inputs = () => {
  if (base) return base;
  const DONG = fs.readdirSync(path.join(BASE, 'raw/legal-dong')).filter((f) => f.endsWith('.csv')).sort().pop();
  const ED = P.bulkDataMonth(path.join(BASE, 'raw/hub-bulk'));
  base = loadInputs({ observedMonth: '2026-10', lhSgg: read('mappings/lh-block-sgg.json'), hubEvents: read('snapshot/hub-events.json').rows,
    legalDong: parseLegalDong(fs.readFileSync(path.join(BASE, 'raw/legal-dong', DONG)), DONG),
    hubBulk: readHubBulk(path.join(BASE, fs.existsSync(path.join(BASE, 'snapshot/hub-refresh.json')) ? 'snapshot/hub-refresh.json' : `snapshot/hub-bulk-${ED}.json`)),
    hubIds: read('mappings/hub-candidate-ids.json'), national: readNational(path.join(BASE, 'raw')), stage: readStageInput(stageFileOf(BASE)) });
  return base;
};
const run = (homeDir = HOME_DIR) => { const report = {}; const t = convert({ ...inputs(), home: H.readHome(homeDir), homeIds, sidos: H.HOME_SIDO, report }); return { t, report }; };   // 2026-10-19 수도권 한정: monthly.js convertArgs 처럼 --sidos 11,28,41
const files = (t) => Object.fromEntries(Object.entries(t).map(([k, rows]) => [k, renderTable(k, rows)]));

/* 판 폴더를 복사하고 kind 하나를 고친 가짜 판(manifest 의 sha256·행 수도 맞춘다 — readHome 이 확인한다) */
function fakeEdition(edits) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'home-fake-')), path.basename(HOME_DIR));
  fs.mkdirSync(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(HOME_DIR, 'manifest.json'), 'utf8'));
  for (const file of Object.keys(manifest.files)) {
    const kind = file.replace(/\.jsonl\.gz$/, '');
    if (!edits[kind]) { fs.copyFileSync(path.join(HOME_DIR, file), path.join(dir, file)); continue; }
    const rows = edits[kind](zlib.gunzipSync(fs.readFileSync(path.join(HOME_DIR, file))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    const buf = zlib.gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
    fs.writeFileSync(path.join(dir, file), buf);
    manifest.files[file] = { ...manifest.files[file], bytes: buf.length, rows: rows.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

test('① 같은 판 두 번 → 표 18개 바이트 동일(저장된 표 파일과도), 매핑에 새 id 없음', { skip: SKIP }, () => {
  const a = run(), b = run(), fa = files(a.t), fb = files(b.t);
  assert.deepEqual(Object.keys(fa).sort(), TABLES);
  for (const t of TABLES) {
    assert.equal(fa[t], fb[t], t);
    assert.ok(fa[t] === fs.readFileSync(path.join(BASE, 'tables', `${t}.json`), 'utf8'), `${t}: 저장된 표와 같다`);
  }
  assert.deepEqual(validate(a.t), []);
  assert.equal(a.report.home.ids.fresh, 0, '저장된 매핑(mappings/home-ids.json)으로 모든 HOME 사업 id 가 정해진다');
  assert.deepEqual(a.report.homeIds, homeIds, '매핑 파일은 그대로(키를 더하기만 하는데 더할 것이 없다)');
});

test('GH 공고(gh_notice) 전부 notice_system=GH 로 실린다(공고번호 = source_object_id, 중복 0) · HOME 별칭(HPR_·PRO_·LH_)은 id_type=HOME, MANUAL 에는 남지 않는다', { skip: SKIP }, () => {
  const { t, report } = run(), gh = H.readHome(HOME_DIR).kinds.gh_notice;
  const rows = t.notices.filter((n) => n.notice_system === 'GH');
  assert.equal(rows.length, gh.length);
  assert.deepEqual(report.home.notices.gh, gh.length);
  assert.equal(report.home.notices.ghDup, 0);
  assert.deepEqual(new Set(rows.map((n) => n.notice_id)), new Set(gh.map((r) => String(r.payload.source_object_id))));
  assert.ok(t.sources.some((s) => s.source_ref === H.refsOf(H.readHome(HOME_DIR).edition).ghNotice));
  assert.deepEqual(validate(t), []);
  const alias = /^(HPR_|PRO_|LH_)/;
  assert.ok(t.identifiers.filter((i) => i.id_type === 'HOME').length > 0);
  assert.ok(t.identifiers.filter((i) => i.id_type === 'HOME').every((i) => alias.test(i.id_value)));
  assert.equal(t.identifiers.filter((i) => i.id_type === 'MANUAL' && alias.test(i.id_value)).length, 0);
});

test('저장된 표: GH 공고·HOME 식별자 종류가 표 계약(schemas/ledger)의 enum 안에 있다', () => {
  const enumOf = (file, col) => JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/ledger', file), 'utf8')).properties?.rows?.items?.properties?.[col]?.enum
    ?? JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/ledger', file), 'utf8'))).match(new RegExp(`"${col}":\\{"enum":\\[([^\\]]*)\\]`))[1].replace(/"/g, '').split(',');
  assert.ok(enumOf('notices.schema.json', 'notice_system').includes('GH'));
  assert.ok(enumOf('notice_links.schema.json', 'notice_system').includes('GH'));
  assert.ok(enumOf('identifiers.schema.json', 'id_type').includes('HOME'));
  assert.ok(saved.notices.some((n) => n.notice_system === 'GH'));
  assert.equal(saved.identifiers.filter((i) => i.id_type === 'MANUAL' && /^(HPR_|PRO_|LH_)/.test(i.id_value)).length, 0);
});

test('② 수도권 밖 사업과 딸린 행(식별자·위치·단지·이벤트·호수·공고 연결·검토)·지역·통계 행은 없다(2026-10-19·20 결정 — 원장은 HOME 수도권만) · 공고·지역·통계의 비HOME 행은 HEAD 행에서 수도권 밖만 빠진 그대로, 원천·기관은 통째로', (t) => {
  let head;
  try { head = Object.fromEntries(TABLES.map((x) => { try { return [x, JSON.parse(execFileSync('git', ['show', `HEAD:schemas/ledger-2026-10/tables/${x}.json`], { cwd: ROOT, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).rows]; } catch { return [x, null]; } })); } catch { return t.skip('git 없음'); }
  /* 2026-10-19 수도권 한정: 비수도권 행은 '변경 전과 같다'가 아니라 '없다'(convert --sidos, home-source.js keepSido) */
  assert.ok(saved.projects.length > 0 && saved.projects.every((p) => isCap(p.sgg_code)), 'projects: 모두 수도권');
  const cap = new Set(saved.projects.map((p) => p.local_project_id));
  for (const x of ['identifiers', 'project_locations', 'complexes', 'events', 'units', 'notice_links']) assert.ok(saved[x].every((r) => cap.has(r.local_project_id)), `${x}: 수도권 사업 몫만`);
  assert.ok(saved.review_required.every((r) => (r.local_project_id ? cap.has(r.local_project_id) : r.source_ref.startsWith(H.HOME_PREFIX)) && String(r.record_key).split('|').every((k) => !/^PRJ-/.test(k) || cap.has(k))), 'review_required: 수도권 사업 또는 HOME 원천 행만');
  const lines = (rows) => rows.map((r) => JSON.stringify(r));
  const reg = (rows) => rows.map((r) => (r.source_ref === 'housing-wave-registry' ? { ...r, data_as_of: null } : r));   // 레지스트리 원천의 기준일 = registry.updatedAt(HOME 발급으로 바뀐다)
  /* HOME 행(source_ref home-dump-<판>)은 판마다 갈아끼우므로 빼고 본다 — 새 판이면 판 이름이 바뀐다 */
  const notHome = (rows) => rows.filter((r) => !String(r.source_ref).startsWith(H.HOME_PREFIX));
  const kept = (n) => !n.sgg_code || isCap(n.sgg_code);   // 수도권 밖 시군구 공고는 뺀다(시군구 없는 공고는 남긴다)
  assert.deepEqual(lines(notHome(saved.notices)), lines(notHome(head.notices).filter(kept)), 'notices: HEAD 의 비HOME 공고 중 수도권 밖 시군구만 빠진 그대로');
  /* 2026-10-20 수도권 밖 번들(광산·나주) 제거: 싣지 않은 번들의 원천 행만 빠진다(regions/index.json 에 있는 번들만) */
  const slugs = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'regions/index.json'), 'utf8')).regions.map((r) => r.slug));
  const loaded = (rows) => rows.filter((r) => !r.source_ref.startsWith('bundle-') || slugs.has(r.source_ref.slice('bundle-'.length)));
  assert.deepEqual(lines(reg(notHome(saved.sources))), lines(reg(loaded(notHome(head.sources)))), 'sources: HEAD 행 그대로(원천 메타는 사업이 아니다 — 싣지 않은 번들 원천만 빠진다)');
  /* 2026-10-20 수도권 한정: 지역·통계도 수도권 밖 행(전국 합계 '00' 포함)이 0, 수도권 행은 HEAD 그대로(HEAD 가 이미 수도권만이면 통째로 같다) */
  assert.ok(saved.areas.every((a) => isCap(a.area_code)) && saved.stat_facts.every((r) => isCap(r.sido_code)), 'areas·stat_facts: 수도권 밖 행 0');
  assert.deepEqual([...new Set(saved.stat_facts.map((r) => r.sido_code))].sort(), CAP, '통계는 세 시도 모두');
  assert.equal(lines(saved.areas).join('\n'), lines(head.areas.filter((a) => isCap(a.area_code))).join('\n'), 'areas');
  assert.equal(lines(saved.stat_facts).join('\n'), lines(head.stat_facts.filter((r) => isCap(r.sido_code))).join('\n'), 'stat_facts');
  /* 2026-10-20 iH(인천도시공사) 추가(lib/board/agencies.ts) — HEAD 에 없으면 그 행만 더해진다 */
  const ih = (rows) => rows.filter((r) => r.agency_id !== 'ih');
  assert.equal(lines(ih(saved.agencies)).join('\n'), lines(ih(head.agencies)).join('\n'), 'agencies');
  assert.deepEqual(saved.agencies.find((r) => r.agency_id === 'ih'), { agency_id: 'ih', agency_name: 'iH', stat_actor: null, source_ref: 'housing-wave-manual' });
});

test('③ 수도권 = 시도 합(종합상황판 ledger-board.json 과 지도 색인): 사업·호수·판정·정상·주의·지연', () => {
  const L = require('../../data/board/ledger-board.json');
  const sum = (f) => L.regions.reduce((s, r) => s + f(r), 0);
  assert.equal(sum((r) => r.projects), L.scope.projects);
  assert.equal(sum((r) => r.units), L.scope.units);
  assert.equal(sum((r) => r.judged), L.scope.judged);
  assert.deepEqual([sum((r) => r.ok), sum((r) => r.caution), sum((r) => r.delay)], [L.judgment.ok.projects, L.judgment.caution.projects, L.judgment.delay.projects]);
  assert.deepEqual([sum((r) => r.delayUnits), sum((r) => r.cautionUnits)], [L.judgment.delay.units, L.judgment.caution.units]);
  const M = require('../../data/board/ledger-map.json'), rows = Object.values(M.bySgg).flat();
  assert.equal(rows.length, L.scope.projects, '지도 색인 사업 수 = 보드 사업 수(대체된 사업 제외)');
  for (const r of L.regions) assert.equal(rows.filter((x) => Object.keys(M.bySgg).find((k) => M.bySgg[k].includes(x)).slice(0, 2) === r.code).length, r.projects, r.code);
  const live = saved.projects.filter(isShown);   // 2026-10-20 공공 분류 안2: 보드는 공공 공급만 — 민간 정비는 scope.renewal, 일반 민간은 화면 밖
  assert.equal(L.scope.projects, live.length);
  const all = saved.projects.filter((p) => !p.superseded_by), of = (s) => all.filter((p) => p.public_scope === s).length;
  assert.deepEqual([L.scope.projects + L.scope.renewal.projects + of('PRIVATE'), L.scope.renewal.projects], [all.length, of('PRIVATE_RENEWAL')], '공공 공급 + 민간 정비 + 일반 민간 = 원장 살아 있는 사업');
  assert.ok(L.scope.bySource.home > 0 && L.scope.coverage === 'CAPITAL');   // 2026-10-19 수도권 한정: 사업이 모두 수도권 HOME → coverage CAPITAL(전엔 건축HUB 전국 후보가 있어 NATIONWIDE)
  assert.deepEqual(L.regions.map((r) => r.code), CAP, '시도는 사업이 있는 서울·인천·경기만');
});

test('④ 수도권 사업 수 = HOME 사업 중 시군구가 정해진 것(같은 시도·지구·블록은 한 사업), 같은 블록 두 사업 0, 시군구 미정은 검토 목록', { skip: SKIP }, () => {
  const home = H.readHome(HOME_DIR), build = H.buildHome(home, { areaRows: inputs().legalDong.rows, lhSgg: read('mappings/lh-block-sgg.json'), homeIds });
  const cap = saved.projects.filter((p) => isCap(p.sgg_code) && !p.superseded_by);
  assert.ok(cap.every((p) => p.source_ref === `${H.HOME_PREFIX}${home.edition}`), '수도권 사업은 모두 HOME');
  assert.equal(cap.length, build.groups.length);
  /* 묶음 행 = 원천 사업후보(PRO) 하나. 2026-10-20 판부터 원천 사업후보가 둘인 HOME 사업 7곳(multiAnchor) — HPR 수는 행 수에서 그만큼 뺀다 */
  const members = build.groups.reduce((n, g) => n + g.members.length, 0), unresolved = build.unresolved.reduce((n, g) => n + g.members.length, 0);
  const hprs = new Set([...build.groups, ...build.unresolved].flatMap((g) => g.members.map((m) => m.hpr)));
  assert.equal(hprs.size + (build.report.noAnchor ?? 0), home.kinds.home_project.length, 'HOME 사업(HPR) = 묶음에 든 것 + 시군구 미정 + 원천 사업후보(PRO) 없는 것');
  assert.equal(members + unresolved - hprs.size, build.report.multiAnchor);
  assert.equal(build.report.multiAnchor, 7, '원천 사업후보가 둘인 HOME 사업 7곳(계양 A6·A9·A10·A17, 가정2 B2, 영종 A24, 검단 AA19)');
  for (const g of build.groups) assert.equal(new Set(g.keys).size, g.keys.length, '키는 한 번씩');
  /* 2026-10-20 판(20261019T212247Z): HPR 2,011 중 1,575 는 원천 사업후보(project, PRO_) 연결이 없다(정비사업 목록 REN_ 885·건축 일반 인허가 GEN_ 681 등 HOME 후보 — 원장 사업이 되지 않는다).
     PRO 가 있는 HPR 436(원천 사업후보 행 443 — 둘인 HPR 7) → 블록 병합·같은 현장·같은 HPR 합침 행 56 → 시군구 미정 4 → 사업 383(10-14 판: 311 → 47 → 2 → 262) */
  /* 2026-10-21 새 덤프(20261020T142230Z): HPR 2,014(+3 독산동·연남동·방화차고지 — 새 사업) · 시군구 미정 4행(인천서구 석남어울림·거북이기지의 공급계획·공사 진행)이 지구 이름 규칙(districtOnlyKey)으로 서해구가 되어
     같은 현장 병합으로 기존 PRJ-28275-0037·0034 에 합쳐짐(합침 행 62 → 66, 미정 4 → 0) → 사업 377 → 380 */
  assert.deepEqual([home.kinds.home_project.length, build.report.noAnchor, build.groups.length, members - build.groups.length, unresolved], [2014, 1575, 380, 66, 0], '2026-10-21 새 덤프 · 인천서구 4행 편입(10-20 판: 2,011 · 1,575 · 377 · 62 · 4)');
  /* 인천서구 4행 = LH 지구 '인천서구(석남어울림)'·'인천서구(거북이기지)'(괄호 뗀 지구 '인천서구' → lh-block-sgg 의 두 지구 모두 서해구 28275, HOME PoC /mappings 도 넷 다 서해구).
     공사 진행 행의 LH 지구 코드(105409|01·105410|01)가 기존 사업의 공사 계약 '[(105409)인천서구(석남어울림)]…'·'[(105410)인천서구(거북이기지)]…' 와 같고 계획 호수도 같다(110·58) */
  const into = { PRO_1c2a1be12daff06cef52f8c6: 'PRJ-28275-0037', PRO_4e534476d1d747285e612f85: 'PRJ-28275-0037', PRO_85998117430f9302232be12d: 'PRJ-28275-0034', PRO_a9e2bffb100945377e90ef33: 'PRJ-28275-0034' };
  for (const [pro, id] of Object.entries(into)) {
    const g = build.groups.find((x) => x.members.some((m) => m.pro === pro));
    assert.ok(g && g.sgg === '28275' && homeIds[g.keys[0]] === id, `${pro} → ${id}(서해구)`);
  }
  const blk = new Map();
  for (const g of build.groups) for (const k of g.keys.filter((x) => x.startsWith('BLK:'))) { assert.ok(!blk.has(k), `${k} 가 두 사업에`); blk.set(k, g); }
  const block = new Set();
  for (const r of saved.identifiers.filter((i) => i.id_type === 'AREA_BLOCK' && cap.some((p) => p.local_project_id === i.local_project_id))) { assert.ok(!block.has(r.id_value), r.id_value); block.add(r.id_value); }
  const sgg = saved.review_required.filter((r) => r.review_type === 'SGG_UNRESOLVED' && r.source_ref.startsWith(H.HOME_PREFIX));
  assert.equal(sgg.length, build.unresolved.length);
  assert.ok(sgg.every((r) => r.local_project_id === null && /^HPR_/.test(r.record_key)));
  const ids = new Set(cap.map((p) => p.local_project_id));
  for (const g of build.groups) assert.ok(ids.has(homeIds[g.keys[0]]), `${g.keys[0]} 의 id 가 원장에 있다`);
});

test('⑤ 연결(home_mapping)만 바꾼 가짜 판 → links 만 바뀌고 사업 id·다른 표는 그대로 · HPR_ 를 모두 바꾼 판도 사업 id 그대로(PRO·LH·블록 키로 잇는다)', { skip: SKIP }, () => {
  const base = run().t, before = files(base);
  const progs = [...new Set(saved.links.filter((l) => l.link_type === 'PROGRAM_PROJECT').map((l) => l.from_local_id))].sort();
  const remap = fakeEdition({ home_mapping: (rows) => rows.map((r, i) => (i % 15 === 0 ? { ...r, program_id: progs[(progs.indexOf(r.program_id) + 1) % progs.length] } : i % 41 === 1 ? { ...r, status: 'CONFIRMED' } : i % 53 === 2 ? { ...r, policy_id: 'UNASSIGNED' } : r)) });
  const after = run(remap);
  assert.deepEqual(validate(after.t), []);
  const changed = Object.keys(before).filter((t) => before[t] !== files(after.t)[t]);
  /* 2026-10-20 공공 분류 안2: 공공 공급 분류가 연결의 프로그램 id 로 정해져(home-source.js PUBLIC_TIER) 사업의 공개 범위·근거와 검토 목록의 '공개 범위 미상'도 따라 바뀔 수 있다 — 그 밖은 그대로 */
  assert.deepEqual(changed.filter((t) => t !== 'projects' && t !== 'review_required'), ['links'], '연결(과 연결로 정하는 공공 분류)만 바뀐다');
  /* 2026-10-20 iH 기관: 시행 값이 없는 사업의 기관은 iH 프로그램 연결로도 정해진다(home-source.js IH_PROGRAM) — 그 근거('HOME 프로그램 연결: iH …')인 사업만 기관이 연결 따라 바뀔 수 있다.
     2026-10-21 새 덤프(연결 행 451): 가짜 판이 강서 군부지(PRJ-11500-0104) 연결을 iH 프로그램으로 옮겨 기관 미상 → ih */
  const viaIh = (p) => /^HOME 프로그램 연결: iH /.test(p.public_basis ?? '');
  const ihLinked = new Set([...base.projects, ...after.t.projects].filter(viaIh).map((p) => p.local_project_id));
  const byId = new Map(base.projects.map((p) => [p.local_project_id, p]));
  for (const p of after.t.projects) if (byId.get(p.local_project_id)?.agency_id !== p.agency_id) assert.ok(ihLinked.has(p.local_project_id) && [p.agency_id, byId.get(p.local_project_id)?.agency_id].includes('ih'), `${p.local_project_id} 기관 변화는 iH 프로그램 연결로만`);
  const keep = ({ public_scope: _s, public_basis: _b, ...p }) => (ihLinked.has(p.local_project_id) ? { ...p, agency_id: null } : p), other = (t) => t.review_required.filter((r) => r.review_type !== 'PUBLIC_SCOPE_UNKNOWN');
  assert.deepEqual(after.t.projects.map(keep), base.projects.map(keep), '사업 행(id·이름·단계·기관)은 그대로');
  assert.deepEqual(other(after.t), other(base), '공개 범위 미상 밖의 검토 목록은 그대로');
  assert.equal(after.report.home.ids.fresh, 0);
  assert.notEqual(before.links, files(after.t).links);

  const rename = (id) => `HPR_${crypto.createHash('sha256').update(id).digest('hex').slice(0, 24)}`;
  const renamed = fakeEdition({
    home_project: (rows) => rows.map((r) => ({ ...r, id: rename(r.id) })),
    home_identity_alias: (rows) => rows.map((r) => ({ ...r, project_id: rename(r.project_id) })),
    home_project_evidence: (rows) => rows.map((r) => ({ ...r, project_id: rename(r.project_id) })),
  });
  const r2 = run(renamed), f2 = files(r2.t);
  assert.equal(r2.report.home.ids.fresh, 0, '새 id 없음');
  assert.equal(f2.projects, before.projects, '사업 행(id·이름·단계) 그대로');
  /* 2026-10-21 새 덤프: 시군구 미정이 0이라 검토 목록에 HPR_ 를 담은 행이 없다 — 그때는 식별자만 바뀐다 */
  const sggReview = saved.review_required.some((r) => r.review_type === 'SGG_UNRESOLVED');
  assert.deepEqual(Object.keys(before).filter((t) => before[t] !== f2[t]), ['identifiers', ...(sggReview ? ['review_required'] : [])], 'HPR_ 값을 담은 식별자·검토(시군구 미정의 record_key)만 바뀐다');
  const hpr = (rows) => rows.filter((i) => i.id_type === 'HOME' && i.id_value.startsWith('HPR_'));
  assert.deepEqual(hpr(r2.t.identifiers).map((i) => i.local_project_id), hpr(saved.identifiers).map((i) => i.local_project_id));
  for (const d of [remap, renamed]) fs.rmSync(path.dirname(d), { recursive: true, force: true });
});

test('⑥ HOME statistic(적재하지 않음) = 통계누리 stat_facts: 서울·인천·경기 겹치는 달의 착공·준공·분양승인 540칸, 인허가 연간 = 월 합 12칸 모두 같다', { skip: SKIP }, () => {
  const st = H.readHome(HOME_DIR).kinds.statistic.map((r) => r.payload);
  const sido = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' }, metric = { 착공: 'start', 준공: 'complete', 분양승인: 'sale' };
  const ours = new Map(saved.stat_facts.filter((r) => r.actor === 'TOTAL').map((r) => [`${r.metric}|${r.sido_code}|${r.ym}`, r.value]));
  let monthly = 0, annual = 0;
  for (const p of st) {
    if (!sido[p.region]) continue;
    if (p.statistic_frequency === 'MONTH' && metric[p.statistic_metric]) {
      const v = ours.get(`${metric[p.statistic_metric]}|${sido[p.region]}|${p.statistic_period.slice(0, 4)}-${p.statistic_period.slice(4)}`);
      if (v == null) continue;
      assert.equal(v, Number(p.units), `${p.statistic_metric} ${p.region} ${p.statistic_period}`);
      monthly++;
    } else if (p.statistic_metric === '인허가') {
      const months = saved.stat_facts.filter((r) => r.actor === 'TOTAL' && r.metric === 'permit' && r.sido_code === sido[p.region] && r.ym.startsWith(p.statistic_period));
      if (months.length !== 12) continue;
      assert.equal(months.reduce((s, r) => s + r.value, 0), Number(p.units), `인허가 ${p.region} ${p.statistic_period}`);
      annual++;
    }
  }
  assert.deepEqual([monthly, annual], [540, 12]);
  assert.ok(!saved.sources.some((s) => /statistic/.test(s.dataset_name)) && saved.stat_facts.every((r) => r.source_ref.startsWith('molit-')), 'statistic 은 싣지 않는다(6절 2)');
});

test('정책 목표(policy_targets): 9·7 공급 계획표 — 2026~2030 착공(04) 수도권 1,350,000 · 서울 배분 334,000 · 경기·인천 합 1,015,000 · 2026년 269,000(서울 68,000) · 프로그램 5개 합 = 표 합계 1,349,000 · 입주 전망(06)은 관리목표 2025·2026', () => {
  const T = saved.policy_targets.filter((r) => r.local_policy_id === 'POL_2025_0907');
  const one = (f) => { const xs = T.filter(f); assert.equal(xs.length, 1, JSON.stringify(xs)); return xs[0].target_units; };
  const whole = (r) => r.period_start === '2026-01-01' && r.period_end === '2030-12-31';
  assert.equal(one((r) => whole(r) && !r.local_program_id && r.stage_code === '04' && r.area_codes.join() === '11,28,41'), 1350000);
  assert.equal(one((r) => whole(r) && !r.local_program_id && r.area_codes.join() === '11'), 334000);
  assert.equal(one((r) => whole(r) && !r.local_program_id && r.area_codes.join() === '28,41'), 1015000);
  assert.equal(one((r) => r.period_start === '2026-01-01' && r.period_end === '2026-12-31' && !r.local_program_id && r.stage_code === '04' && r.area_codes.join() === '11,28,41'), 269000);
  assert.equal(one((r) => r.period_start === '2026-01-01' && r.period_end === '2026-12-31' && !r.local_program_id && r.stage_code === '04' && r.area_codes.join() === '11'), 68000);
  const progs = T.filter((r) => whole(r) && r.local_program_id);
  assert.equal(progs.length, 5);
  assert.equal(progs.reduce((s, r) => s + r.target_units, 0), 1349000, '반올림으로 배분 안 된 1,000호(rounding_unallocated_units)');
  assert.ok(progs.every((r) => saved.programs.some((p) => p.local_program_id === r.local_program_id) && saved.links.some((l) => l.link_type === 'POLICY_PROGRAM' && l.to_local_id === r.local_program_id)));
  assert.deepEqual(T.filter((r) => r.stage_code === '06').map((r) => `${r.period_start.slice(0, 4)} ${r.area_codes.join()} ${r.target_units}`).sort(), ['2025 11 48000', '2025 11,28,41 161000', '2026 11 29000', '2026 11,28,41 112000']);
  assert.ok(saved.policy_targets.every((r) => r.local_policy_id === 'POL_2025_0907'), '8·13·1·29 는 기간이 없어 목표 행을 만들지 않는다(정책 행만)');
  assert.deepEqual(saved.policies.map((p) => p.local_policy_id), ['POL_2025_0907', 'POL_2026_0129', 'POL_2026_0813']);
});

test('연결: 정책–프로그램·프로그램–사업, REVIEW → REVIEW_REQUIRED, UNASSIGNED·MON_* 연결은 넣지 않고, 사업 끝은 HOME 사업 id', () => {
  const pp = saved.links.filter((l) => l.link_type === 'PROGRAM_PROJECT');
  const home = new Set(saved.projects.filter((p) => p.source_ref.startsWith(H.HOME_PREFIX)).map((p) => p.local_project_id));
  assert.ok(pp.length > 200 && pp.every((l) => home.has(l.to_local_id)));
  assert.ok(saved.links.every((l) => !/UNASSIGNED|MON_/.test(`${l.from_local_id} ${l.to_local_id}`)));
  assert.deepEqual([...new Set(saved.links.map((l) => l.link_type))].sort(), ['POLICY_PROGRAM', 'PROGRAM_PROJECT']);
  assert.equal(new Set(saved.links.map((l) => `${l.link_type}|${l.from_local_id}|${l.to_local_id}`)).size, saved.links.length, '연결은 한 번씩');
  assert.equal(pp.filter((l) => l.review_status === 'CONFIRMED').length, 205, '2026-10-21 새 덤프: home_mapping CONFIRMED 283건 → 사업 묶음당 한 행 205(새 사업 3 + 인천서구 공급계획 행이 합쳐진 0037·0034 의 건설형 공공임대 연결 2) · 2026-10-20 판 200(2026-10-14 판 174, 2026-10-13 판 1)');
});

test('지역 지표(area_facts): 원천 묶음마다 원천 행 하나, 지역 코드는 원장 지역, 미분양은 전체·준공 후', () => {
  assert.ok(saved.area_facts.length > 10000);
  const areas = new Set(saved.areas.map((a) => a.area_code));
  assert.ok(saved.area_facts.every((r) => areas.has(r.area_code) && /^(11|28|41)/.test(r.area_code)));
  const unsold = saved.area_facts.filter((r) => r.metric === 'unsold');
  assert.deepEqual([...new Set(unsold.map((r) => r.breakdown))].sort(), ['COMPLETED', 'TOTAL']);
  assert.ok(unsold.every((r) => /^\d{4}-\d{2}$/.test(r.period) && r.unit === '호'));
  assert.ok(saved.area_facts.filter((r) => r.metric === 'employment_rate').every((r) => /^\d{4}-H[12]$/.test(r.period) && r.unit === '%'));
});

test('레지스트리: 수도권 옛 발급 사업 61 = HOME 사업으로 대체 6(계양 번들 단지 — 번들 참조·필지를 새 사업이 넘겨받음) + 숨김 55(성북 13 · 하남 42, 대응 없음). /project/<옛 id> 는 새 사업으로 넘긴다', () => {
  const old = registry.projects.filter((p) => isCap(p.sgg) && !p.refs.some((r) => r.system === 'home'));
  assert.equal(old.length, 61);
  const sup = old.filter((p) => p.supersededBy), hid = old.filter((p) => p.hiddenAt);
  assert.deepEqual([sup.length, hid.length], [6, 55]);
  assert.ok(sup.every((p) => p.sgg === '28245' && registry.projects.find((x) => x.id === p.supersededBy).refs.some((r) => r.system === 'bundle' && p.refs.some((q) => q.value === r.value))));
  assert.deepEqual([...new Set(hid.map((p) => p.sgg))].sort(), ['11290', '41450']);
  const match = read('mappings/home-registry-match.json');
  assert.deepEqual(match.superseded.filter((m) => m.rule !== 'HOME_SAME_SITE').map((m) => m.from).sort(), sup.map((p) => p.id).sort());
  for (const p of sup) assert.equal(saved.projects.find((x) => x.local_project_id === p.id).superseded_by, p.supersededBy, `${p.id}: 원장에도 대체`);
  assert.ok(hid.every((p) => !saved.projects.some((x) => x.local_project_id === p.id)), '숨긴 사업은 원장에 없다');
  /* /project/<옛 id> → /projects?id=<옛 id>(next.config.ts) → 서랍이 대표 사업을 연다(lib/board/projects-view.ts drawerTarget) */
  const V = require('../../lib/board/projects-view.ts');
  for (const p of sup) assert.equal(V.drawerTarget(p.id, registry.projects, () => true).id, p.supersededBy, p.id);
  assert.match(fs.readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8'), /\{ source: '\/project\/:id', destination: '\/projects\?id=:id', permanent: false \}/);
  assert.match(fs.readFileSync(path.join(ROOT, 'lib/board/data.ts'), 'utf8'), /projects: s\.projects\.filter\(\(p\) => !p\.supersededBy && !p\.hiddenAt\), allProjects: s\.projects/);
});

test('지도 계약: 사업 행의 done = 실제 준공(ACTUAL COMPLETION) 중 가장 늦은 달, 없으면 칸 없음', () => {
  const M = require('../../data/board/ledger-map.json'), rows = Object.values(M.bySgg).flat();
  const last = new Map();
  for (const e of saved.events.filter((x) => x.event_type === 'COMPLETION' && x.date_type === 'ACTUAL')) {
    const m = e.event_date ? e.event_date.slice(0, 7) : e.event_month ?? `${e.event_year}-12`;
    if (!last.has(e.local_project_id) || last.get(e.local_project_id) < m) last.set(e.local_project_id, m);
  }
  assert.equal(rows.filter((r) => 'done' in r).length, rows.filter((r) => last.has(r.id)).length);   // 2026-10-19 수도권 한정: HOME 사업에는 준공 실제가 없어 0행(전엔 건축HUB 후보 100건 넘게)
  for (const r of rows) assert.equal(r.done, last.get(r.id), r.id);
  const t = loadTables(), m = mapIndexFromLedger(t, { referenceDate: M.referenceDate, observedMonth: M.observedMonth, lhBlocks: loadLhBlocks() });
  assert.deepEqual(m, M);
  assert.ok(boardFromLedger(t, { referenceDate: M.referenceDate, observedMonth: M.observedMonth }).scope.projects === rows.length);
});

test('담당자 실명·입력 사유는 원장 표에 들어가지 않는다: 판의 actor·reason 값을 근거 문구에서 지운다(2026-10-14 판부터 덤프에 업무 이력)', { skip: SKIP }, () => {
  const K = { home_mapping: [{ basis: '사용자 입력 · 홍길 · 자동 확인', reason: '자동 확인' }], x: [{ payload: { actor: '홍길', selected: { basis: '담당자 확인 · 홍길 · 자동 확인 · 동일 블록' } } }] };
  const s = H.scrubKinds(K);
  assert.deepEqual([s.home_mapping[0].basis, s.x[0].payload.selected.basis], ['사용자 입력', '담당자 확인 · 동일 블록']);
  assert.equal(H.scrubKinds({ a: [{ basis: '그대로' }] }).a[0].basis, '그대로', '담당자 입력이 없는 판은 그대로');
  const { names } = H.officerTerms(H.readHome(HOME_DIR).kinds);
  assert.ok(names.length > 0, '2026-10-14 판에는 담당자 이름이 있다');
  for (const t of TABLES) { const text = JSON.stringify(saved[t]); for (const n of names) assert.ok(!text.includes(n), `${t} 에 담당자 이름`); }
});

test('대표 고르기(HOME supply_dashboard.inventory)는 한 벌: 원장 변환(home-source)과 9·7 진행(policy-progress)이 같은 함수를 쓴다', () => {
  const PP = require('../../tools/ledger/policy-progress');
  assert.equal(PP.inventory, H.inventory);
  const r = { source_id: 'lh_sale', region: '경기도', name: '고양창릉 S-03', block: 'S-03' };
  assert.deepEqual(PP.blockKey(r), Object.values(H.blockKey(r)));
  assert.equal(H.inventoryDropped({ source_id: 'lh_construction', warnings: [], region: '서울특별시', district: '서울공릉', block: '1', name: '서울공릉 1' }), true, '블록 키 없는 건설공사 계약');
  assert.equal(H.inventoryDropped({ source_id: 'lh_progress', warnings: ['MULTI_SITE_CONTRACT'], region: '경기도', district: '부천대장', block: 'A7', name: '부천대장 A7' }), true, '복수 현장 계약');
  assert.equal(H.inventoryDropped({ source_id: 'lh_progress', warnings: [], region: '서울특별시', district: '서울공릉', block: '1', name: '서울공릉 1' }), false);
  /* 현장 키: 괄호·숫자 블록을 받고, 복수 현장 계약은 이름의 블록 표기를 쓰지 않는다 */
  assert.equal(H.siteKey({ region: '서울특별시', district: '서울공릉(복합개발)', block: '1', name: '[(105228)서울공릉(복합개발)]위례A2-7BL…', warnings: ['MULTI_SITE_CONTRACT'] }), '서울특별시|서울공릉|1');
  assert.equal(H.siteKey({ region: '서울특별시', district: '서울공릉', block: '1', name: '서울공릉 1' }), '서울특별시|서울공릉|1');
  assert.equal(H.siteKey({ region: '경기도', district: '의왕초평(뉴스테이)', block: '04', name: '의왕초평 A4BL 민간참여 공공주택 건설사업' }), '경기도|의왕초평|A4');
  assert.equal(H.siteKey({ region: '인천광역시', district: null, block: null, name: '인천부평(도시재생뉴딜) A' }), '인천광역시|인천부평|A');
});

test('중복 사업 정리(2026-10-13 덤프): 대표가 될 수 없는 행만 있는 사업 4건을 같은 현장·같은 호수 사업에 합치고, 옛 id 는 대표로 넘긴다', () => {
  const MERGED = { 'PRJ-11350-0097': 'PRJ-11350-0096', 'PRJ-11560-0146': 'PRJ-11560-0143', 'PRJ-28237-0064': 'PRJ-28237-0065', 'PRJ-41430-0044': 'PRJ-41430-0048' };
  const byId = new Map(saved.projects.map((p) => [p.local_project_id, p])), reg = new Map(registry.projects.map((p) => [p.id, p]));
  for (const [from, into] of Object.entries(MERGED)) {
    assert.equal(byId.get(from)?.superseded_by, into, `${from}: 원장 superseded_by`);
    assert.equal(reg.get(from)?.supersededBy, into, `${from}: 레지스트리 supersededBy(/project/${from} → ${into})`);
    assert.ok(!byId.get(into).superseded_by && !reg.get(into).supersededBy && !reg.get(into).hiddenAt, `${into} 는 살아 있다`);
    const refs = reg.get(from).refs.filter((r) => r.system === 'home');
    for (const r of refs) assert.equal(homeIds[`${r.key}:${r.value}`], into, `home-ids ${r.key}:${r.value} → 대표 id`);
    const pro = refs.find((r) => r.key === 'PRO').value, hpr = refs.find((r) => r.key === 'HPR').value;
    assert.ok(saved.identifiers.some((i) => i.local_project_id === into && i.id_type === 'HOME' && i.id_value === pro), `${into} 에 ${pro} 별칭`);
    /* 2026-10-20 같은 현장 병합: 인천부평 0065 묶음에 0068(LH 공사진행현황)까지 합쳐져 0064 의 공사 계약 행이 묶음 첫 행(원천 사업후보 순)이 됐다 — 첫 행의 HPR 별칭은 규칙 칸이 비어 있다 */
    /* 2026-10-21 HOME 2038810 block_key 이식: 의왕초평 A4BL 공사 계약 행(이름의 'A4BL')이 블록 키로 0048 묶음에 들어가 묶음 첫 행이 됐다 — 같은 현장 흡수(SAME_SITE_UNITS)가 아니다 */
    const rule = ['PRJ-28237-0064', 'PRJ-41430-0044'].includes(from) ? null : 'SAME_SITE_UNITS';
    assert.ok(saved.identifiers.some((i) => i.local_project_id === into && i.id_value === hpr && i.match_rule === rule), `${into} 에 ${hpr}(${rule})`);
    assert.ok(!saved.identifiers.some((i) => i.local_project_id === from) && !saved.events.some((e) => e.local_project_id === from) && !saved.units.some((u) => u.local_project_id === from), `${from} 에는 사업 행만 남는다`);
  }
  const M = require('../../data/board/ledger-map.json'), mapIds = new Set(Object.values(M.bySgg).flat().map((r) => r.id));
  assert.ok(Object.keys(MERGED).every((id) => !mapIds.has(id)) && Object.values(MERGED).every((id) => mapIds.has(id)), '지도에는 대표만');
  /* 2026-10-20 판: 따로 발급된 두 사업이 HOME 이 대표 행을 바로잡아 한 블록 묶음이 됨(인천검단 AA19 — 0054 의 대표가 A13-1 로 잘못 적힌 공사계약에서 AA19 공정 행으로).
     블록 키(BLK:28290|인천검단|AA19)를 가진 0055 가 대표, 0054 는 대체(HOME_SAME_SITE) — home-source.js assignHomeIds merged */
  const BLOCK_MERGED = { 'PRJ-28290-0054': 'PRJ-28290-0055' };
  for (const [from, into] of Object.entries(BLOCK_MERGED)) {
    assert.equal(byId.get(from)?.superseded_by, into, `${from}: 원장 superseded_by`);
    assert.equal(reg.get(from)?.supersededBy, into, `${from}: 레지스트리 supersededBy`);
    assert.equal(homeIds['BLK:28290|인천검단|AA19'], into, '블록 키는 대표 id');
    assert.ok(reg.get(from).refs.some((r) => r.system === 'home' && homeIds[`${r.key}:${r.value}`] === into), `${from} 의 HOME 별칭이 대표 id 로 다시 가리킨다`);
    assert.ok(!mapIds.has(from) && mapIds.has(into), '지도에는 대표만');
  }
  /* 2026-10-20 사용자 결정 — 같은 현장 병합(home-source.js siteKeys): 같은 시군구 · 같은 계획 호수 · 같은 현장 키(시도|지구|블록, 하위 블록 'AA13-1' 을 살리고 '국제화계획'을 뺀다 /
     LH 블록 코드 지구 코드|블록 코드)인 두 묶음을 합친다. 대표 = 블록 키를 가진 기존 id, 없으면 앞 번호 */
  const SITE_MERGED = { 'PRJ-28290-0064': 'PRJ-28290-0058', 'PRJ-28290-0065': 'PRJ-28290-0056', 'PRJ-28237-0068': 'PRJ-28237-0065', 'PRJ-41220-0179': 'PRJ-41220-0176', 'PRJ-41220-0184': 'PRJ-41220-0180', 'PRJ-41220-0188': 'PRJ-41220-0183' };
  for (const [from, into] of Object.entries(SITE_MERGED)) {
    assert.equal(byId.get(from)?.superseded_by, into, `${from}: 원장 superseded_by`);
    assert.equal(reg.get(from)?.supersededBy, into, `${from}: 레지스트리 supersededBy`);
    assert.ok(reg.get(from).refs.filter((r) => r.system === 'home').every((r) => homeIds[`${r.key}:${r.value}`] === into), `${from} 의 HOME 별칭이 대표 id 로 다시 가리킨다`);
    assert.ok(!mapIds.has(from) && mapIds.has(into), '지도에는 대표만');
  }
  for (const b of ['A31', 'A34', 'A35']) assert.equal(homeIds[`BLK:41220|평택고덕|${b}`], SITE_MERGED[`PRJ-41220-0${{ A31: 188, A34: 184, A35: 179 }[b]}`], `평택고덕 ${b}: 블록 키를 가진 기존 id 가 대표`);
  assert.equal(H.siteKeys({ region: '인천광역시', district: '인천검단', block: 'AA13-1', name: '[(100585)인천검단]인천검단AA13-1BL5공구,AA13-2BL6공구…', warnings: ['MULTI_SITE_CONTRACT'] }, 'lh_construction')[0], '인천광역시|인천검단|AA13-1', '하위 블록을 살린다');
  assert.deepEqual(H.siteKeys({ region: '인천광역시', district: '인천검단', block: '35', name: '[(100585)인천검단]…', warnings: ['MULTI_SITE_CONTRACT'] }, 'lh_construction'), ['인천광역시|인천검단|35', 'LHC:100585|35'], '공사 계약의 숫자 블록 = LH 블록 코드');
  assert.deepEqual(H.siteKeys({ region: '인천광역시', district: '인천검단', block: 'AA13-2', name: '인천검단 AA13-2', source_object_id: '100585|35' }, 'lh_progress'), ['인천광역시|인천검단|AA13-2', 'LHC:100585|35']);
  assert.equal(H.siteKeys({ region: '경기도', district: '평택고덕국제화계획', block: 'Ab35', name: '평택고덕 A-35BL 민간참여 공공주택건설사업' }, 'lh_construction')[0], '경기도|평택고덕|A35', "'국제화계획'을 빼고 이름의 블록 하나를 쓴다");
  assert.deepEqual(read('mappings/home-registry-match.json').superseded.filter((m) => m.rule === 'HOME_SAME_SITE').map((m) => [m.from, m.into]).sort(), Object.entries({ ...MERGED, ...BLOCK_MERGED, ...SITE_MERGED }).sort());
});

test('사업 이름: 공사 계약 코드형 이름([(105228)…]) 0건, 수도권 HOME 사업의 대표 원천은 복수 현장 계약·블록 키 없는 계약이 아니다(그것뿐인 사업 9건 제외)', { skip: SKIP }, () => {
  const code = /^\s*\[\(\d+\)/;
  assert.equal(saved.projects.filter((p) => code.test(p.project_name ?? '')).length, 0, '원장(대체된 행 포함)');
  assert.equal(registry.projects.filter((p) => !p.supersededBy && !p.hiddenAt && code.test(p.name ?? '')).length, 0, '살아 있는 레지스트리');
  const home = H.readHome(HOME_DIR), build = H.buildHome(home, { areaRows: inputs().legalDong.rows, lhSgg: read('mappings/lh-block-sgg.json'), homeIds });
  const drop = (m) => H.inventoryDropped({ ...m.p, source_id: { lh_incheon_construction: 'lh_construction' }[m.p.source_id] ?? m.p.source_id });
  const lone = build.groups.filter((g) => g.members.every(drop));
  assert.equal(lone.length, 3, '대표 없이 남는 사업(같은 현장 사업이 없거나 시군구가 다름) — 인천계양 A2·A3, 양평공흥(2026-10-21 새 덤프: 인천서구(거북이기지)·(석남어울림)은 시군구가 정해진 공급계획 행이 합쳐져 대표가 생겨 빠짐 · 2026-10-20 판: 인천검단 AA19BL·인천송림4 는 새 공정 행이 대표가 되어 빠짐 · 같은 현장 병합으로 인천검단 35·AA13-1 이 LH 공사진행현황 행과 합쳐져 빠짐)');
  for (const g of build.groups.filter((x) => !lone.includes(x))) assert.ok(!drop(g.main), `${g.main.pro}: 대표가 대표가 될 수 없는 행`);
  const names = new Map(saved.projects.map((p) => [p.local_project_id, p.project_name]));
  assert.ok(!saved.projects.filter((p) => isCap(p.sgg_code) && !p.superseded_by).some((p) => /및|,\s*\S+BL/.test(p.project_name ?? '') && /BL.*BL/.test(p.project_name ?? '')), '여러 블록을 묶은 계약 이름이 사업 이름이 아니다');
  assert.equal(names.get('PRJ-28245-0055'), '인천계양(공공주택) A2');
  assert.equal(names.get('PRJ-41196-0099'), '부천대장 A7');
});

test('프로그램 표기 합치기: 같은 정책 안에서 띄어쓰기·가운뎃점만 다른 프로그램은 하나(26 → 24), 정책이 다르면 id 는 둘이고 이름 표기만 같다', () => {
  assert.equal(H.programKey('도심 공공주택  복합사업'), H.programKey('도심공공주택복합사업'));
  assert.equal(H.programKey('노후청사ㆍ공공부지'), H.programKey('노후청사·공공부지'));
  assert.notEqual(H.programKey('공공택지 공급 조기화'), H.programKey('공공택지 공급 확대·조기화'), '표기가 아니라 낱말이 다르면 다른 프로그램');
  const polOf = new Map(saved.links.filter((l) => l.link_type === 'POLICY_PROGRAM').map((l) => [l.to_local_id, l.from_local_id]));
  const keys = saved.programs.map((p) => `${polOf.get(p.local_program_id)}|${H.programKey(p.program_name)}`);
  assert.equal(new Set(keys).size, keys.length, '같은 정책·같은 키의 프로그램이 둘 없다');
  assert.equal(saved.programs.length, 48, '2026-10-20 판: HOME 프로그램 연결(home_program_mapping) 35→45 로 48(2026-10-14 판 38: 9·7 원문 보완 +14, 해제 별칭 2 제외 · 2026-10-13 판 24)');
  for (const name of ['3기 신도시', '공공주택 건설']) assert.equal(saved.programs.filter((p) => p.program_name === name).length, 1, name);
  const dosim = saved.programs.filter((p) => H.programKey(p.program_name) === H.programKey('도심 공공주택 복합사업'));
  assert.deepEqual(dosim.map((p) => [p.local_program_id, p.program_name]), [['PRG_1391a48ea998e31820ad2643', '도심 공공주택 복합사업'], ['PRG_7fd0420ba721f1a0ca43fbe7', '도심 공공주택 복합사업']], '8·13 과 9·7 의 프로그램은 따로(사업의 정책이 섞이지 않게), 표기는 사업 연결이 많은 쪽');
  assert.ok(saved.links.every((l) => l.link_type !== 'PROGRAM_PROJECT' || saved.programs.some((p) => p.local_program_id === l.from_local_id)));
});

test('프로그램 합치기는 프로그램·연결·목표만 바꾼다: 9·7 계획표 프로그램이 같은 표기의 HOME 프로그램이면 목표가 그 프로그램에 붙고, 사업 id·다른 표는 그대로', { skip: SKIP }, () => {
  const before = files(run().t);
  const fake = fakeEdition({ policy_delivery_plan: (rows) => rows.map((r) => ({ ...r, payload: { ...r.payload, programs: (r.payload.programs ?? []).map((pr) => (pr.id === 'URBAN' ? { ...pr, name: '도심공공주택  복합사업' } : pr)) } })) });
  const after = run(fake), fa = files(after.t);
  assert.deepEqual(validate(after.t), []);
  assert.deepEqual(Object.keys(before).filter((t) => before[t] !== fa[t]), ['programs', 'links', 'policy_targets'], '사업·식별자·사건 등 다른 표는 바이트 그대로');
  assert.ok(!after.t.programs.some((p) => p.local_program_id === 'POL_2025_0907.URBAN'), '계획표 프로그램 행은 따로 싣지 않는다');
  const T = (rows, id) => rows.filter((r) => r.local_program_id === id).map((r) => `${r.stage_code} ${r.period_start} ${r.target_units}`);
  assert.deepEqual(T(after.t.policy_targets, 'PRG_7fd0420ba721f1a0ca43fbe7'), T(saved.policy_targets, 'POL_2025_0907.URBAN'), '같은 정책(9·7)의 HOME 프로그램에 목표가 모인다');
  assert.ok(after.t.links.some((l) => l.link_type === 'POLICY_PROGRAM' && l.from_local_id === 'POL_2025_0907' && l.to_local_id === 'PRG_7fd0420ba721f1a0ca43fbe7' && /공급 계획표/.test(l.evidence)));
  assert.equal(after.report.home.ids.fresh, 0);
  fs.rmSync(path.dirname(fake), { recursive: true, force: true });
});

test('병합(2026-10-20): 새 판의 한 묶음이 기존 발급 id 둘을 가리키면 블록 키를 가진 id 가 대표(없으면 앞 번호), 나머지는 숨김이 아니라 대체(HOME_SAME_SITE) · 충돌 0', () => {
  const g = { sgg: '28290', keys: ['HPR:HPR_a', 'HPR:HPR_b', 'PRO:PRO_a', 'PRO:PRO_b', 'BLK:28290|인천검단|AA19'], members: [] };
  const prev = { 'HPR:HPR_a': 'PRJ-28290-0054', 'PRO:PRO_old': 'PRJ-28290-0054', 'HPR:HPR_b': 'PRJ-28290-0055', 'PRO:PRO_b': 'PRJ-28290-0055', 'BLK:28290|인천검단|AA19': 'PRJ-28290-0055', 'HPR:HPR_x': 'PRJ-11110-0001' };
  const r = H.assignHomeIds([g], { homeIds: prev });
  assert.deepEqual([r.ids.get(g), r.conflicts, r.fresh, r.merged], ['PRJ-28290-0055', 0, 0, [{ from: 'PRJ-28290-0054', into: 'PRJ-28290-0055' }]], '블록 키를 가진 0055 가 대표');
  const noBlk = { ...g, keys: g.keys.filter((k) => !k.startsWith('BLK:')) };
  assert.deepEqual([H.assignHomeIds([noBlk], { homeIds: prev }).ids.get(noBlk), H.assignHomeIds([noBlk], { homeIds: prev }).merged], ['PRJ-28290-0054', [{ from: 'PRJ-28290-0055', into: 'PRJ-28290-0054' }]], '블록 키가 없으면 앞 번호');
  const ids = H.mergeHomeIds(prev, [g], r.ids, r.merged);
  assert.deepEqual(Object.entries(ids).filter(([k, v]) => prev[k] !== v), [['HPR:HPR_a', 'PRJ-28290-0055'], ['PRO:PRO_a', 'PRJ-28290-0055']], '대표가 바뀐 묶음의 키만 다시 가리키고(새 키는 더하고), 묶음 밖 옛 키(PRO_old)·다른 사업 키는 그대로');
  assert.equal(ids['PRO:PRO_old'], 'PRJ-28290-0054');
  const reg = { counters: { 28290: 55 }, projects: [
    { id: 'PRJ-28290-0054', sgg: '28290', stageCode: '04', name: '인천검단 AA19BL', bjdCodes: [], pnus: [], refs: [{ system: 'home', key: 'HPR', value: 'HPR_a' }, { system: 'home', key: 'PRO', value: 'PRO_old' }], issuedAt: '2026-10-14' },
    { id: 'PRJ-28290-0055', sgg: '28290', stageCode: '04', name: '인천검단 AA19', bjdCodes: [], pnus: [], refs: [{ system: 'home', key: 'HPR', value: 'HPR_b' }], issuedAt: '2026-10-14' }] };
  const tables = { projects: [{ local_project_id: 'PRJ-28290-0055', sgg_code: '28290', stage_code: '04', as_of: '2026-10-20', project_name: '인천검단 AA19', source_ref: `${H.HOME_PREFIX}E`, superseded_by: null }], identifiers: [], project_locations: [], units: [] };
  const out = H.issueHome(reg, { tables, homeIds: ids, today: '2026-10-20', edition: 'E' });
  const p = out.registry.projects.find((x) => x.id === 'PRJ-28290-0054');
  assert.deepEqual([p.supersededBy, p.hiddenAt, out.superseded.map((s) => [s.from, s.into, s.rule])], ['PRJ-28290-0055', undefined, [['PRJ-28290-0054', 'PRJ-28290-0055', 'HOME_SAME_SITE']]]);
  assert.deepEqual(out.hidden.map((h) => h.id), [], '숨기지 않는다');
});
