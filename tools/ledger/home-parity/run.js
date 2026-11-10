#!/usr/bin/env node
'use strict';
/* HOME 정답 값 한 번에 만들기(2026-11-09 HOME-JSON-반영-계획 P3 — 정답 대조 시험 6종의 HOME_GOLDEN_DIR·MAP_GOLDEN).
   입력: HOME 패키지 golden/(HOME API 응답) · web/(HOME 프런트 JS). 출력 폴더 = 입력 응답 복사 + 계산한 정답.
     golden-policy.json(s1-policy.js) · golden-projects.json·S2-project-map.csv(s2-projects.js) · S3-snapshot.json·golden-sources.json(s3-sources.js) · map-golden.json(map-golden.js)
   S2·S3 의 '우리' 값은 --repo 저장소(원장 표·data/board·가장 늦은 HOME 판)에서 센다 — 변환·생성기를 다 돌린 뒤에 부른다.
   쓰임: node tools/ledger/home-parity/run.js --golden <폴더> --web <폴더> --out <폴더> [--repo <저장소>] [--as-of YYYY-MM-DD] [--fetched-at <ISO>]
         [--check <옛 정답 폴더>] [--check-map <옛 map 정답 json>]   → 계산 결과를 옛 정답과 비교(다르면 종료 코드 1)
   --fetched-at: 정답 응답을 받은 시각(map-golden _meta.fetched_at·S3 원본에서 만든 스냅샷의 meta.fetchedAt). 없으면 S2-raw-map-dashboard.json 수정 시각. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

/* JSON 두 값의 다른 경로(앞 limit 개) */
function jsonDiff(a, b, p = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) jsonDiff(a[k], b[k], `${p}.${k}`, out);
    return out;
  }
  out.push(`${p}: ${JSON.stringify(a)?.slice(0, 120)} → ${JSON.stringify(b)?.slice(0, 120)}`);
  return out;
}

/* 옛 정답과 비교. 무시: golden-policy 의 _source.view(입력 파일 이름), golden-sources 의 meta.generatedAt, map-golden 의 _meta.made_from(폴더 경로) */
function compare(file, oldFile) {
  if (!fs.existsSync(oldFile)) return [`비교할 파일 없음: ${oldFile}`];
  if (file.endsWith('.csv')) {
    const a = fs.readFileSync(oldFile, 'utf8').split('\n'), b = fs.readFileSync(file, 'utf8').split('\n');
    return a.flatMap((l, i) => (l === b[i] ? [] : [`${i + 1}행: ${l.slice(0, 120)} → ${(b[i] ?? '(없음)').slice(0, 120)}`])).concat(b.length > a.length ? [`행 수 ${a.length} → ${b.length}`] : []);
  }
  const a = JSON.parse(fs.readFileSync(oldFile, 'utf8')), b = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const x of [a, b]) { delete x['_source.view']; if (x.meta) delete x.meta.generatedAt; if (x._meta) delete x._meta.made_from; }
  return jsonDiff(a, b);
}

function node(script, args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`${script} 실패(종료 ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(-5).join(' / ')}`);
  return r.stdout;
}

function main() {
  const gin = arg('--golden'), web = arg('--web'), out = arg('--out');
  if (!gin || !web || !out) { console.error('쓰임: run.js --golden <폴더> --web <폴더> --out <폴더> [--repo <저장소>] [--as-of] [--fetched-at] [--check <폴더>] [--check-map <파일>]'); process.exit(2); }
  const repo = path.resolve(arg('--repo') || path.join(__dirname, '..', '..', '..'));
  fs.mkdirSync(out, { recursive: true });
  if (path.resolve(gin) !== path.resolve(out)) {
    for (const f of fs.readdirSync(gin)) if (fs.statSync(path.join(gin, f)).isFile()) fs.copyFileSync(path.join(gin, f), path.join(out, f));
    // 입력에 S3-snapshot.json 이 없으면(S3 원본 응답 판) 출력 폴더에 남은 지난 실행의 스냅샷을 지워 원본에서 다시 줄이게 한다
    if (!fs.existsSync(path.join(gin, 'S3-snapshot.json'))) fs.rmSync(path.join(out, 'S3-snapshot.json'), { force: true });
  }
  const asOf = arg('--as-of') || JSON.parse(fs.readFileSync(path.join(out, 'S1-view-policy.json'), 'utf8')).as_of_date;
  const fetchedAt = arg('--fetched-at') || fs.statSync(path.join(gin, 'S2-raw-map-dashboard.json')).mtime.toISOString();
  node('s1-policy.js', ['--golden', out, '--web', web, '--out', path.join(out, 'golden-policy.json')]);
  node('s2-projects.js', ['--golden', out, '--out', out, '--repo', repo, '--as-of', asOf]);
  node('s3-sources.js', ['--golden', out, '--web', web, '--out', out, '--repo', repo, '--as-of', asOf, '--fetched-at', fetchedAt]);
  node('map-golden.js', [out, path.join(out, 'map-golden.json'), fetchedAt]);
  const made = ['golden-policy.json', 'golden-projects.json', 'S2-project-map.csv', 'golden-sources.json', 'map-golden.json'];
  console.log(`정답 ${made.length}개: ${out} (기준일 ${asOf}, 받은 시각 ${fetchedAt})`);
  const check = arg('--check'), checkMap = arg('--check-map');
  if (!check && !checkMap) return;
  let bad = 0;
  const pairs = [...(check ? made.filter((f) => f !== 'map-golden.json').map((f) => [f, path.join(check, f)]) : []), ...(checkMap ? [['map-golden.json', checkMap]] : [])];
  for (const [f, old] of pairs) {
    const d = compare(path.join(out, f), old);
    console.log(d.length ? `다름 ${f}: ${d.length}곳` : `같음 ${f}`);
    for (const x of d.slice(0, 30)) console.log(`  ${x}`);
    bad += d.length ? 1 : 0;
  }
  process.exit(bad ? 1 : 0);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error(e.message); process.exit(2); }
}
module.exports = { jsonDiff, compare };
