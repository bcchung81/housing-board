'use strict';
/* 정책 진행 자료(HOME)의 LH 준공 예정 data/board/home-lh-plan.json — 월 상세(/month)·기관 LH(/agency/lh)·종합상황판 월 링크가 쓴다(2026-10-21 W6: 공공데이터포털 파일 대신 HOME 덤프).
   실행: node tools/ledger/home-lh-plan.js [--month YYYY-MM] [--home <HOME 판 폴더>] [--out <파일>]   (home-projects.js 다음에 돌린다 — 그 출력을 읽는다)
   원천
   - HOME 덤프 lh_completion_plan(LH 공공주택 준공예정현황 15141761 을 HOME 이 받은 블록×공급유형 행, 수도권만)
   - HOME 덤프 evidence_bridge(원천 사업 행 PRO_ ↔ LH 행 연결, 해제 RELEASED 뺀 CONFIRMED·REVIEW) — PoC 서버가 사업 공급 근거를 묶는 표와 같다
   - data/board/home-projects.json(9·7 포트폴리오 행 p97·통계 포함 stats, 우리 원장 사업 id ourId)
   범위: 9·7 포트폴리오 행에 이어진 LH 행만(이어지지 않은 블록은 뺀다).
   출력 모양(LhData 와 같은 칸 + HOME 칸, 같은 입력 → 같은 바이트)
   - schema · asOf(HOME 기준일) · source{ dump{edition·snapshotAt·sourceCommit}, dataset, rule } · sourceAsOf(LH 파일 기준일) · count(행) · units(호수 합)
   - blocks[](준공예정일·지구·블록·공급유형 순): district · block · location(주소 글자) · type(공급유형) · units · date(준공예정일) · sido(시도 코드) · id(HOME LH 행 id)
       · pro(이어진 9·7 원천 사업 행 id 들) · ourId(그 행들의 우리 원장 사업 id — 여럿이면 id 순 첫째, 없으면 null)
   담당자 이름·사유 글(evidence_bridge actor·basis·reason)은 읽지 않는다. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const P = require('./paths');
const HOME = require('./home-source');

const OUT = 'data/board/home-lh-plan.json';
const SIDO = { 서울특별시: '11', 인천광역시: '28', 경기도: '41' };
const LINKED = new Set(['CONFIRMED', 'REVIEW']);
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* 덤프 판에서 두 종류만 읽는다(sha256 은 manifest 와 대조) */
function readKinds(dir, kinds) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const out = {};
  for (const k of kinds) {
    const file = `${k}.jsonl.gz`, buf = fs.readFileSync(path.join(dir, file)), sha = manifest.files[file]?.sha256;
    if (sha && crypto.createHash('sha256').update(buf).digest('hex') !== sha) throw new Error(`${dir}/${file} 의 sha256 이 manifest 와 다르다`);
    out[k] = zlib.gunzipSync(buf).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  return { edition: path.basename(dir), snapshotAt: manifest.snapshot_at, sourceCommit: manifest.source_commit ?? null, kinds: out };
}

function build(dump, homeProjects) {
  const rows = new Map(homeProjects.rows.filter((r) => r.p97 && r.stats).map((r) => [r.id, r]));
  const plan = new Map(dump.kinds.lh_completion_plan.map((r) => [r.entity_id, r.payload]));
  const pros = new Map();   // LH 행 id → 이어진 9·7 원천 행 id
  for (const { payload: b } of dump.kinds.evidence_bridge) {
    if (!plan.has(b.source_entity_id) || !LINKED.has(b.status) || !rows.has(b.project_id)) continue;
    (pros.get(b.source_entity_id) || pros.set(b.source_entity_id, new Set()).get(b.source_entity_id)).add(b.project_id);
  }
  const blocks = [...pros].map(([id, set]) => {
    const p = plan.get(id), pro = [...set].sort(byStr), ours = [...new Set(pro.map((x) => rows.get(x).ourId).filter(Boolean))].sort(byStr);
    if (!SIDO[p.region]) throw new Error(`${id}: 모르는 시도 ${p.region}`);
    return { district: p.district, block: p.block, location: p.address, type: p.tenure, units: p.units, date: p.completion_plan_date, sido: SIDO[p.region], id, pro, ourId: ours[0] ?? null };
  }).sort((a, b) => byStr(a.date, b.date) || byStr(a.district, b.district) || byStr(a.block, b.block) || byStr(a.type, b.type) || byStr(a.id, b.id));
  const dates = [...new Set(dump.kinds.lh_completion_plan.map((r) => r.payload.source_date))].sort();
  return {
    schema: 'home-lh-plan/1', asOf: homeProjects.asOf,
    source: { dump: { edition: dump.edition, snapshotAt: dump.snapshotAt, sourceCommit: dump.sourceCommit }, dataset: 'LH 공공주택 준공예정현황(공공데이터포털 15141761) — 정책 진행 자료(HOME) 경유',
      rule: '9·7 포트폴리오 원천 사업 행에 이어진(evidence_bridge CONFIRMED·REVIEW) LH 블록×공급유형 행만' },
    sourceAsOf: dates[dates.length - 1] ?? null, count: blocks.length, units: blocks.reduce((n, b) => n + b.units, 0), blocks,
  };
}

/* 블록 행은 한 줄에 하나(diff 보기 쉽게), 나머지는 키마다 한 줄 */
function render(doc) {
  const lines = Object.entries(doc).map(([k, v]) => (k === 'blocks' ? `${JSON.stringify(k)}:[\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]` : `${JSON.stringify(k)}:${JSON.stringify(v)}`));
  return `{\n${lines.join(',\n')}\n}\n`;
}

module.exports = { build, render, readKinds };

if (require.main === module) {
  try {
    const o = {}, argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
      if (['--month', '--home', '--out'].includes(argv[i])) o[argv[i].slice(2)] = argv[++i];
      else throw new Error(`모르는 인자 ${argv[i]}`);
    }
    const monthDir = P.ledgerDir(o.month ?? P.latestMonth());
    const dir = o.home ? path.resolve(o.home) : HOME.latestHomeDir(monthDir);
    if (!dir || !HOME.homeAvailable(dir)) throw new Error('HOME 판(raw/home/<덤프시각>)의 원본(jsonl.gz)이 없다 — raw-store.js pull 또는 home-dump.py');
    const doc = build(readKinds(dir, ['lh_completion_plan', 'evidence_bridge']), JSON.parse(fs.readFileSync(path.join(P.ROOT, 'data/board/home-projects.json'), 'utf8')));
    const out = o.out ? path.resolve(o.out) : path.join(P.ROOT, OUT);
    fs.writeFileSync(out, render(doc));
    console.log(`${path.relative(P.ROOT, out)}: 기준일 ${doc.asOf} · LH 파일 ${doc.sourceAsOf} · ${doc.count}행 ${doc.units}호 · 블록 ${new Set(doc.blocks.map((b) => `${b.district}|${b.block}`)).size}`);
  } catch (e) { console.error(`오류: ${e.message}`); process.exit(1); }
}
