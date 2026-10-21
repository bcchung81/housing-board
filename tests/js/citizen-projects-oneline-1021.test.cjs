'use strict';
/* 사업 찾기(/citizen/projects) 표 한 줄 행(2026-10-21 사용자 지시 '2줄 줄바꿈으로 표기 되지 않도록 리스트 row를 수정해'):
   900px 초과에서 이름 칸·지금 칸이 flex-col 이 아니고, 글 칸은 truncate, 실제 자료(수도권 9·7 집계 175곳)의 가장 긴 글이 1697px 에서 칸 폭 안에 들어간다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const page = fs.readFileSync(path.join(ROOT, 'app/(dashboard)/citizen/projects/page.tsx'), 'utf8');
const code = page.replace(/\/\*[\s\S]*?\*\//g, '');
const PV = require('../../lib/board/projects-view.ts');
const PL = require('../../lib/board/public-labels.ts');
const home = require('../../data/board/home-projects.json');
const idxJson = require('../../data/board/projects-index.json');
const mapJson = require('../../data/board/ledger-map.json');
const detJson = require('../../data/board/project-detail.json');
const { METRO_AREAS, SIDO_SHORT } = require('../../lib/board/metro-overview.ts');

/* 번들 Noto Sans KR 글자 너비(em) — board-dir-fit.test.cjs 와 같은 어림 */
const ADV = { 400: { d: 0.555, p: 0.278, pct: 0.921, sp: 0.224 }, 700: { d: 0.59, p: 0.325, pct: 0.963, sp: 0.227 } };
const tw = (t, px, wt = 400) => [...String(t)].reduce((w, c) => w + px * (/[가-힣]/.test(c) ? 0.92 : /[0-9+−]/.test(c) ? ADV[wt].d : /[,.]/.test(c) ? ADV[wt].p : c === '%' ? ADV[wt].pct : c === ' ' ? ADV[wt].sp : 0.6), 0);

/* page.tsx 의 목록 만들기(load·CitizenProjectsPage)를 그대로 따른다 — 수도권 전체, 겹친 행 제외 */
function items() {
  const rn = idxJson.renewal, hasRows = (m, p, s) => PV.rowsOf(m, p, s);
  const ours = new Map([...hasRows(mapJson.bySgg, idxJson.projects, idxJson.sgg), ...(rn ? hasRows(rn.bySgg, rn.projects, rn.sgg) : [])].map((r) => [r.id, r]));
  const details = {};
  for (const [id, x] of Object.entries(detJson.projects)) details[id] = { steps: PL.stepsOf(x.stages) };
  const sgg = (c) => { const n = idxJson.sgg[c]; return n ? n.slice(n.indexOf(' ') + 1) : METRO_AREAS[c] ?? c; };
  const rows = PV.homeRowsOf(home.rows).filter((r) => PV.isMetro(r.sgg) && r.home.p97 && r.home.chart.p97);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return PL.publicItems(rows.map((r) => {
    const h = r.home, o = h.ourId ? ours.get(h.ourId) : undefined, x = h.ourId ? details[h.ourId] : undefined;
    return { id: r.id, name: r.name, sgg: r.sgg, area: `${SIDO_SHORT[r.sgg.slice(0, 2)]} ${sgg(r.sgg)}`, units: h.counted ?? 0, board: PL.PUBLIC_OF_HOME[r.board] ?? 0, issued: true, cls: r.cls,
      overdue: o?.overdue ?? null, next: o?.next ?? null, pastDue: false, steps: x?.steps ?? [null, null, null, null], agency: r.agency === '기관 미상' ? '' : r.agency ?? '',
      progress: h.progress ? Math.round(h.progress.pct) : null, fact: PL.homeFact(r.cls, h.gap), dup: false, link: null };
  }), today, sgg);
}

/* COLS 에서 열 정의를 뽑는다: [이름, 호, 지금, 다음 일정, 들어올 때, 예정 대비, 시행] */
const cols = /const COLS = 'grid grid-cols-\[([^\]]+)\]/.exec(code)[1].split('_');
const em = (t) => Number(/(\d+(?:\.\d+)?)em/.exec(t)[1]);
/* 안쪽 폭 = 창 − 스크롤바 − 좌우 56(본문) − 카드 안여백 40. 고정 칸(em × 16) 합을 빼고 이름 2fr : 예정 대비 1.7fr 로 나눈다 */
function widths(vw, sb = 0) {
  const inner = Math.min(vw - sb, 1760) - 56 - 40;
  const fixed = [1, 2, 3, 4, 6].map((i) => em(cols[i]) * 16);
  const rest = inner - fixed.reduce((a, b) => a + b, 0);
  const nameW = Math.max(em(cols[0]) * 16, rest * (2 / 3.7)), factW = Math.max(0, rest - nameW);
  return { name: nameW, units: fixed[0], now: fixed[1], next: fixed[2], inn: fixed[3], fact: factW, agency: fixed[4] };
}
const CELL_PAD = 25; /* px-3 좌우 24 + 세로선 1 */

test('데스크톱 이름 칸·지금 칸은 가로 한 줄(flex-col 아님), mobile 변형만 감싸기', () => {
  const row = code.slice(code.indexOf('function Row('));
  assert.doesNotMatch(code.slice(code.indexOf('function Progress('), code.indexOf('function Row(')).replace(/mobile:[^\s"`]+/g, ''), /flex-col/, '지금 칸');
  assert.doesNotMatch(row.replace(/mobile:[^\s"`]+/g, ''), /flex-col/, '이름 칸');
  assert.match(row, /\$\{CELL\} flex items-baseline gap-x-2 gap-y-1 mobile:flex-wrap/);
  assert.match(code, /<span className="flex items-center gap-x-2 gap-y-1 mobile:flex-wrap">/);
  assert.match(row, /flex-col|mobile:/, '900px 이하 변형은 그대로');
});

test('글 칸(이름·다음 일정·들어올 때·예정 대비·시행)은 한 줄 말줄임(truncate) + 전체 글 title', () => {
  assert.match(code, /const ONE = 'truncate mobile:overflow-visible mobile:whitespace-normal mobile:text-clip'/);
  const row = code.slice(code.indexOf('function Row('));
  assert.ok((row.match(/\$\{ONE\}/g) ?? []).length >= 4, '다음 일정·들어올 때·예정 대비·시행');
  assert.match(row, /title=\{x\.nextText\}/); assert.match(row, /title=\{x\.inText\}/); assert.match(row, /title=\{x\.fact \|\| undefined\}/); assert.match(row, /title=\{x\.agency \|\| undefined\}/);
  assert.match(row, /const tip = \[x\.name, /, '말줄임 이름의 전체 글은 title');
  assert.match(row, /after:absolute after:inset-0/, '줄 전체 링크 유지');
});

test('1697px(스크롤바 0·17)에서 다음 일정·들어올 때·지금·시행(대부분)·호는 실제 자료 최대 글이 칸 안에 들어간다', () => {
  const xs = items();
  assert.ok(xs.length >= 170, `목록 ${xs.length}곳`);
  const max = (f) => Math.max(...xs.map(f));
  for (const sb of [0, 17]) {
    const w = widths(1697, sb);
    const next = max((x) => tw(x.nextText.replace(/ /g, ' '), 16)), inn = max((x) => tw(x.inText, 16));
    const now = max((x) => 94 + 8 + tw(x.stage, 16, 700) + (x.pct != null ? tw(` · 공사 ${x.pct}%`, 16) : 0));
    const units = max((x) => tw(`${(x.units || 0).toLocaleString('ko-KR')}호`, 16));
    console.log(`  1697px(스크롤바 ${sb}) 칸 폭 → 최대 글: 다음 일정 ${w.next}→${next.toFixed(0)}+25 · 들어올 때 ${w.inn}→${inn.toFixed(0)}+25 · 지금 ${w.now}→${now.toFixed(0)}+25 · 호 ${w.units}→${units.toFixed(0)}+25 · 이름 ${w.name.toFixed(0)} · 예정 대비 ${w.fact.toFixed(0)}`);
    assert.ok(next + CELL_PAD <= w.next, `다음 일정 ${next.toFixed(0)}`);
    assert.ok(inn + CELL_PAD <= w.inn, `들어올 때 ${inn.toFixed(0)}`);
    assert.ok(now + CELL_PAD <= w.now, `지금 ${now.toFixed(0)}`);
    assert.ok(units + CELL_PAD <= w.units, `호 ${units.toFixed(0)}`);
    /* 사람 이름 시행 기관(LH·SH·GH·iH·인천도시공사)은 들어간다 — 자료의 이상한 값('4)공공(LH,SH,GH)' 등)만 말줄임 */
    const ok = new Set(['LH', 'SH', 'GH', 'iH', '인천도시공사', '']);
    assert.ok(max((x) => (ok.has(x.agency) ? tw(x.agency || '미정', 16) : 0)) + CELL_PAD <= w.agency, '시행');
    /* 예정 대비의 가장 긴 문장도 1697px 에서는 들어간다 */
    assert.ok(max((x) => tw(x.fact || '', 16)) + CELL_PAD <= w.fact, `예정 대비 ${max((x) => tw(x.fact || '', 16)).toFixed(0)} > ${w.fact.toFixed(0)}`);
    /* 이름 + 지역 칩 + 보조: 대부분(95%)은 말줄임 없이 */
    const nm = xs.map((x) => tw(x.name, 16, 700) + 8 + tw(x.area, 14) + 16 + (x.sub ? 8 + tw(x.sub, 14) : 0)).sort((a, b) => a - b);
    assert.ok(nm[Math.floor(nm.length * 0.9)] + CELL_PAD <= w.name, `이름 90% ${nm[Math.floor(nm.length * 0.9)].toFixed(0)} > ${w.name.toFixed(0)}`);
  }
});

test('1280px 에서도 칸 폭이 음수가 아니고 고정 칸은 그대로(넘치는 글만 말줄임)', () => {
  const w = widths(1280, 17);
  assert.ok(w.name >= 15 * 16 || cols[0].includes('12em'), '이름 최소 폭');
  assert.ok(w.fact >= 0);
  console.log(`  1280px(스크롤바 17) 이름 ${w.name.toFixed(0)} · 예정 대비 ${w.fact.toFixed(0)}`);
});
