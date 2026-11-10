'use strict';
/* 시험이 HOME 응답(정답)과 대조할 때 '정답 판 = 원장 판'인지 가린다(2026-11-09 HOME-JSON-반영-계획 P2 — 판마다 손으로 고치던 숫자를 판과 무관한 시험으로).
   원장 판 = 가장 늦은 HOME 덤프(schemas/ledger-<달>/raw/home/<판>/manifest.json 의 snapshot_at — manifest 는 커밋돼 있다).
   정답 받은 시각 = 파일 안 기록(meta.pocFetchedAt·meta.fetchedAt·_meta.fetched_at, raw/home-api 는 manifest.json 의 fetched_at) → 없으면 파일 수정 시각.
   받은 시각 ≥ 원장 판 snapshot_at 이면 같은 판으로 본다(덤프 뒤에 받은 응답). 그보다 이르면 옛 판 정답이라 그 대조는 건너뛴다.
   한계: 덤프보다 늦게 받기만 하면 같은 판으로 본다 — 원장을 옛 판으로 되돌려 시험할 때는 HOME_GOLDEN_DIR 로 그 판의 정답 폴더를 준다.
   정답 폴더: HOME_GOLDEN_DIR(기본 .cache/home-parity/golden — git 무시, 개발 PC 에만). */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const P = require('../../tools/ledger/paths');
const H = require('../../tools/ledger/home-source');

const ROOT = path.join(__dirname, '..', '..');
const GOLDEN_DIR = path.resolve(ROOT, process.env.HOME_GOLDEN_DIR || '.cache/home-parity/golden');
const MONTH_DIR = P.ledgerDir(P.latestMonth());
const HOME_DIR = H.latestHomeDir(MONTH_DIR);
const snapshotAt = HOME_DIR ? JSON.parse(fs.readFileSync(path.join(HOME_DIR, 'manifest.json'), 'utf8')).snapshot_at : null;
const API_DIR = path.join(MONTH_DIR, 'raw', 'home-api', P.referenceDateOf(MONTH_DIR));
const rel = (f) => path.relative(ROOT, f);

/* 받은 시각 → 건너뛸 까닭(같은 판이면 null) */
function staleWhy(fetchedAt, label) {
  if (!snapshotAt) return 'HOME 덤프 manifest 없음';
  if (!fetchedAt) return `정답 받은 시각 모름: ${label}`;
  return Date.parse(fetchedAt) < Date.parse(snapshotAt) ? `정답 판 ≠ 원장 판: ${label} 받은 시각 ${fetchedAt} < HOME 판 snapshot_at ${snapshotAt}` : null;
}

/* 정답 폴더의 JSON → { doc, skip }. 없거나 옛 판이면 doc = null, skip = 까닭(node:test 의 skip 에 그대로) */
function golden(name, dir = GOLDEN_DIR) {
  const file = path.isAbsolute(name) ? name : path.join(dir, name);
  if (!fs.existsSync(file)) return { doc: null, skip: `정답 파일 없음: ${rel(file)}` };
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = doc.meta || doc._meta || {};
  const why = staleWhy(m.pocFetchedAt || m.fetchedAt || m.fetched_at || fs.statSync(file).mtime.toISOString(), rel(file));
  return why ? { doc: null, skip: why } : { doc, skip: false };
}

/* raw/home-api/<기준일>/ 의 HOME 응답 → { rows(manifest 행 수 — 커밋돼 있어 늘 있음), doc(압축 원본 — git 무시, 있을 때만), skip } */
function homeApi(name) {
  const mf = path.join(API_DIR, 'manifest.json');
  const e = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')).files[name] : null;
  if (!e) return { rows: null, doc: null, skip: `HOME 응답 manifest 에 없음: ${rel(path.join(API_DIR, name))}` };
  const why = staleWhy(e.fetched_at, rel(path.join(API_DIR, name)));
  if (why) return { rows: null, doc: null, skip: why };
  const gz = path.join(API_DIR, name);
  return { rows: e.rows, doc: fs.existsSync(gz) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8')) : null, skip: false };
}

/* HOME 정책 화면 응답(/policy-delivery/view, scope=policy)의 연도 비교 지표 하나 → 기간 [from, through] 증가분.
   점은 정책 시작부터의 누적이라 '기간 끝까지 마지막 점 − 기간 앞 마지막 점'이 그 기간 값이다(우리 samePeriod 와 같은 셈) */
function homePeriod(view, metric, from, through) {
  const m = view.yearly_comparisons.policy.metrics[metric];
  const at = (pts, d) => pts.filter((p) => p.date <= d).at(-1)?.units ?? 0;
  const before = (pts) => pts.filter((p) => p.date < from).at(-1)?.units ?? 0;
  const span = (pts) => (pts.some((p) => p.date >= from && p.date <= through) ? at(pts, through) - before(pts) : null);
  return { target: span(m.target_points), actual: span(m.actual_points) };
}

module.exports = { ROOT, GOLDEN_DIR, HOME_DIR, snapshotAt, API_DIR, staleWhy, golden, homeApi, homePeriod };
