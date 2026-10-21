'use strict';
/* 종합상황판(/) 집계 — HOME 정책 추진현황(9·7) 규칙(2026-10-21 사용자 결정: HOME 과 같은 조건·같은 표기). data/board/home-board.json 을 만든다.
   모양은 원장 집계(ledger-board.json, LedgerBoard)와 같다 — Board 의 리본·판정·시도·추이·12개월·기관 패널이 그대로 그린다. 값은 HOME 화면 계산(home-view.js)으로 낸다:
   - 모집단 = 정책 승인 연결 포트폴리오(HOME portfolio_cohorts, 과거 착공 포함, 원천 중복 제외 PRO_ 사업 단위), 측정 = 담당자 입력·추정 포함
   - 월별 공급 파동(stageUnits) = 달 말 단계별 누적 도달(후속 단계 포함)의 차분 — 정책 잔여 · 사업화 · 인허가 · 건설(준공 포함) · 공급 · 입주. 기준일 뒤는 단계 목표 누적
   - 판정(judgment·regions·agencies) = 사업 판정(statusAt: 도래 일정 대비 같은 단계 실제 부족률 2% 이상 지연, 0~2% 주의, 기록 없으면 미확보)
   - 단계 지연(delayByStage·cautionByStage)·추이 max = 집계 판정(delayAt: 단계별 도래 목표 대비 누적 측정 부족량, 단계 간 합산 없이 최대)
   - 앞으로 12개월 = 공급(본 모집·분양) 일정 증가분, 월별 실적 흐름 = 사업 원장 사건의 월 증가분(인허가·착공·분양·모집·준공)
   입력은 HOME /policy-delivery/view 응답 모양(view: as_of_date·target_units·stages·plan·portfolio_cohorts·portfolio_comparisons). 덤프에서는 policy-progress.js 가 같은 모양을 만든다.
   덤프에서 만들 때는 home-projects.js 와 같은 원천 행 집합을 쓴다(덤프 우선 + 빈 것만 스냅샷, 2026-10-21): 덤프 뒤 생긴 9·7 집계 행의 PoC 정책 묶음(home-projects.js lateCohorts —
   raw/home-api/<기준일> 스냅샷)을 포트폴리오에 더하고(withLate) 그 범위로 portfolio_comparisons 를 다시 만든다. 덤프에 있는 행은 덤프 값 그대로(덤프 뒤 입력 차는 바꾸지 않는다).
   실행: node tools/ledger/home-board.js [--view <응답 JSON>] [--out <파일>](기본: HOME 덤프 + 스냅샷 → data/board/home-board.json) */
const fs = require('node:fs');
const path = require('node:path');
const HV = require('./home-view');
const PP = require('./policy-progress');

const ROOT = path.join(__dirname, '..', '..');
const OUT = 'data/board/home-board.json';
const FIRST_MONTH = '2025-01', SPAN = 46;   // 리본 시점: 원장 집계(board.js FIRST_MONTH·LAST)와 같은 46개월
/* 리본 6칸 ← HOME 단계(준공은 건설 칸 — HOME 지도 막대·누적 그래프와 같다) */
const STAGE_NAMES = ['정책', '사업화', '인허가', '건설', '공급', '입주'];
const SLOT = { BUSINESS: 1, APPROVAL: 2, CONSTRUCTION: 3, COMPLETION: 3, SUPPLY: 4, MOVE_IN: 5 };
const LABEL = { BUSINESS: '사업화', APPROVAL: '인허가', CONSTRUCTION: '건설', SUPPLY: '공급', COMPLETION: '준공', MOVE_IN: '입주 시작' };
const SIDO = [['11', '서울특별시'], ['28', '인천광역시'], ['41', '경기도']];
const AGENCY_ID = { LH: 'lh', GH: 'gh', SH: 'sh', '기관 미상': 'unknown' };

const pad2 = (n) => String(n).padStart(2, '0');
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number), k = y * 12 + (m - 1) + n; return `${Math.floor(k / 12)}-${pad2((k % 12) + 1)}`; };
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
const LADDER = ['MOVE_IN', 'SUPPLY', 'CONSTRUCTION', 'APPROVAL', 'BUSINESS'];   // home-view trackingPoints 의 쌓는 순서(위 단계부터)

/* 달 말 머문 단계 호수(6칸): 기준일까지는 누적 측정, 뒤는 max(기준일 측정, 단계 목표) — 위 단계부터 단조로 쌓는다(trackingPoints 와 같은 식) */
function stageRow(m, units, when, asOf) {
  let reached = 0;
  const row = [0, 0, 0, 0, 0, 0];
  for (const k of LADDER) {
    const observed = HV.measuredAt(m, k, when <= asOf ? when : asOf)?.units ?? 0;
    const planned = when > asOf ? (HV.targetAt(m, k, when) ?? 0) : 0;
    const amount = Math.max(reached, observed, planned);
    row[SLOT[k]] = amount - reached; reached = amount;
  }
  row[0] = Math.max(0, units - reached);
  return row;
}
/* 사업이 그 날 머문 단계(칸 번호) — 링크 건수용. 기준일 뒤는 그 날까지 기한이 든 일정도 도달로 본다 */
const STAGE_RANK = { BUSINESS: 1, APPROVAL: 2, CONSTRUCTION: 3, COMPLETION: 3, SUPPLY: 4, MOVE_IN: 5 };
function slotOf(c, when, asOf) {
  let best = 0;
  for (const e of c.events || []) if ((e.status || 'ACTUAL') === 'ACTUAL' && e.event_date <= minDate(when, asOf) && STAGE_RANK[e.stage]) best = Math.max(best, STAGE_RANK[e.stage]);
  if (when > asOf) for (const s of c.schedules || []) if (s.due_date <= when && s.units != null && STAGE_RANK[s.stage]) best = Math.max(best, STAGE_RANK[s.stage]);
  return best;
}
const minDate = (a, b) => (a < b ? a : b);

/* 단계 집계 판정 → 6칸(같은 칸에 둘이면 큰 쪽 — 단계 간 합산 없음) */
function stageGaps(checks) {
  const delay = [0, 0, 0, 0, 0, 0], caution = [0, 0, 0, 0, 0, 0];
  for (const c of checks) {
    if (!(c.gap > 0) || !(c.stage in SLOT)) continue;
    const arr = c.status === 'DELAYED' ? delay : c.status === 'WARNING' ? caution : null;
    if (arr) arr[SLOT[c.stage]] = Math.max(arr[SLOT[c.stage]], c.gap);
  }
  return { delay, caution };
}
/* 사업 판정 묶음(건수·호수) */
function judgeOf(rows, day) {
  const out = { NORMAL: { projects: 0, units: 0 }, WARNING: { projects: 0, units: 0 }, DELAYED: { projects: 0, units: 0 }, UNKNOWN: { projects: 0, units: 0 } };
  for (const c of rows) { const s = HV.statusAt(c, day).status; out[s].projects++; out[s].units += c.units; }
  return out;
}
const pu = (x) => ({ projects: x.projects, units: x.units });
/* 단계 부족 사업(2026-10-21 사용자 결정 — 종합상황판 병목·일정 지연 카드의 목록 창): 단계 집계 판정에 부족량이 있는 단계마다, 기준일까지 도래한 그 단계 목표(사업 일정 최대)보다 측정이 모자란 사업과 부족 호수.
   단계 부족량 = 사업 부족 합 − 다른 사업의 초과 합(over) — 초과가 없으면 사업 부족 합이 카드 숫자와 같다. 사업 판정(statusAt)은 측정이 없는 단계를 판정하지 않아 '정상'인 사업도 들어간다 */
function stageShort(rows, gaps, asOf) {
  return Object.fromEntries(gaps.map((g) => {
    let over = 0;
    const list = [];
    for (const c of rows) {
      const goals = (c.schedules || []).filter((s) => s.stage === g.stage && s.units != null && s.due_date && s.due_date <= asOf);
      const due = goals.length ? Math.min(HV.capacity(c), Math.max(...goals.map((s) => s.units))) : 0, got = HV.measured(c, g.stage, asOf) ?? 0;
      if (due > got) list.push({ id: c.id, short: due - got }); else over += got - due;
    }
    return [g.stage, { rows: list.sort((a, b) => b.short - a.short || a.id.localeCompare(b.id)), over }];
  }));
}

function homeBoard(view, { months } = {}) {
  const asOf = view.as_of_date, nowYm = asOf.slice(0, 7), year = Number(asOf.slice(0, 4));
  months = months || Array.from({ length: SPAN }, (_, i) => addMonths(FIRST_MONTH, i));
  const now = months.indexOf(nowYm);
  if (now < 0) throw new Error(`기준 달 ${nowYm} 이 시점 목록에 없다`);
  const rows = view.portfolio_cohorts, metrics = view.portfolio_comparisons.policy.metrics, comparisons = HV.withTracking(metrics);
  const m = { comparisons, asOf, stages: view.stages };
  const units = sum(rows, (c) => c.units);
  const screen = HV.policyScreen(view, { asOf, year });
  const st = HV.statistics(rows, asOf, year, metrics);

  const at = (i) => (i === now ? asOf : monthEnd(months[i]));
  const stageUnits = months.map((_, i) => stageRow(m, units, at(i), asOf));
  const stageProjects = months.map((_, i) => { const r = [0, 0, 0, 0, 0, 0]; for (const c of rows) r[slotOf(c, at(i), asOf)]++; return r; });

  /* 판정: 기준 달 + 그 앞 달(HOME 통계와 같은 24개월 중 리본 시점 안의 달) — 사업 판정 건수·호수와 집계 판정 최대(max) */
  const trendMonths = months.slice(0, now + 1);
  const trend = trendMonths.map((ym, i) => {
    const day = at(i), j = judgeOf(rows, day), d = HV.delayAt(metrics, day), g = stageGaps(d.checks);
    return { month: ym, referenceDate: day, edition: null, basis: 'BACKFILL', ok: pu(j.NORMAL), caution: pu(j.WARNING), delay: pu(j.DELAYED), delayByStage: g.delay, cautionByStage: g.caution,
      judged: j.NORMAL.projects + j.WARNING.projects + j.DELAYED.projects, max: { d: d.DELAYED ?? 0, w: d.WARNING ?? 0 } };
  });
  trend[now].basis = 'OBSERVED';
  const J = judgeOf(rows, asOf), gNow = stageGaps(HV.delayAt(metrics, asOf).checks);

  const regions = SIDO.map(([code, name]) => {
    const cs = rows.filter((c) => c.region === name), j = judgeOf(cs, asOf), mp = screen.map_supply[name];
    return { code, name, projects: cs.length, units: sum(cs, (c) => c.units), judged: j.NORMAL.projects + j.WARNING.projects + j.DELAYED.projects, ok: j.NORMAL.projects, caution: j.WARNING.projects, delay: j.DELAYED.projects,
      delayUnits: j.DELAYED.units, cautionUnits: j.WARNING.units, okUnits: j.NORMAL.units, supplyReached: mp?.supply_reached ?? 0, homeDelay: mp?.delay_note || null };
  });

  const agencies = st.agencies.map((r, i) => {
    const cs = rows.filter((c) => HV.agencyName(c.developer) === r.name), j = judgeOf(cs, asOf);
    return { id: AGENCY_ID[r.name] ?? `src-${i}`, name: r.name, projects: r.count, units: r.total, ok: j.NORMAL.projects, caution: j.WARNING.projects, delay: j.DELAYED.projects,
      okUnits: r.NORMAL, cautionUnits: r.WARNING, delayUnits: r.DELAYED, excludedUnits: r.UNKNOWN, candidateUnits: 0, note: null, delayedSharePct: r.total ? Number((100 * r.DELAYED / r.total).toFixed(1)) : 0 };
  });

  /* 앞으로 12개월 공급 예정: HOME statistics.upcoming 과 같은 식에 달별 사업 수를 더한다 */
  const upIds = new Map(st.upcoming.map((r) => [r.month, new Set()]));
  for (const c of rows) {
    let allocated = 0;
    for (const e of c.events || []) if (e.stage === 'SUPPLY' && e.status !== 'DELAYED' && e.origin !== 'PLANNED' && e.event_date <= asOf) allocated = Math.max(allocated, Math.min(c.units, e.units ?? c.units));
    for (const s of [...(c.schedules || [])].filter((s) => s.stage === 'SUPPLY' && s.units != null && s.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date))) {
      const target = Math.min(c.units, s.units), inc = Math.max(0, target - allocated); allocated = Math.max(allocated, target);
      if (s.due_date <= asOf || !inc) continue;
      upIds.get(s.due_date.slice(0, 7))?.add(c.id);
    }
  }
  const upcoming = st.upcoming.map((r) => ({ ym: r.month, units: r.units, projects: upIds.get(r.month).size }));

  const latest = st.delays.at(-1);
  const gaps = (latest.checks || []).filter((c) => c.gap > 0).map((c) => ({ stage: c.stage, label: LABEL[c.stage], status: c.status, gap: c.gap, rate: HV.formatGapRate(c.rate) }));
  const neck = [...gaps].sort((a, b) => (a.status === b.status ? b.gap - a.gap : a.status === 'DELAYED' ? -1 : 1))[0] ?? null;

  return {
    schema: 'home-board/1', observedMonth: nowYm, referenceDate: asOf,
    source: view.source ?? null,
    stageNames: STAGE_NAMES,
    judge: { cautionMonths: 0, delayMonths: 0, rule: 'HOME 부족률 — 도래 목표 대비 측정 부족률 2% 이상 지연, 0% 초과~2% 미만 주의, 측정 없으면 판정 미확보(0호로 보지 않음)' },
    scope: { projects: rows.length, issued: rows.length, candidates: 0, judged: J.NORMAL.projects + J.WARNING.projects + J.DELAYED.projects, units, coverage: 'CAPITAL', bySource: { issued: 0, lhCandidates: 0, hubBulkCandidates: 0, home: rows.length } },
    months, now, actualThrough: nowYm, actualIndex: now, actualSource: 'HOME',
    stageUnits, stageProjects,
    judgment: { ok: pu(J.NORMAL), caution: pu(J.WARNING), delay: pu(J.DELAYED), excluded: { ...pu(J.UNKNOWN), reason: '판정 미확보 — 기준일까지 도래한 일정이 없거나 같은 단계 측정이 없음' } },
    delayByStage: gNow.delay, cautionByStage: gNow.caution,
    regions, agencies, upcoming, overdue: [], overdueTotal: 0, trend,
    home: {
      policyId: view.policy_id ?? 'POL_2025_0907', targetUnits: view.target_units,
      cards: screen.stage_cards, callouts: screen.callouts, axisMax: screen.axis.y_max,
      /* 단계별 기준일 판정(HOME comparisonStatus — 도래 목표·최근 측정·부족률): /projects 정책 목표 대비 칸이 쓴다 */
      stageChecks: Object.fromEntries(['BUSINESS', 'APPROVAL', 'CONSTRUCTION', 'SUPPLY', 'COMPLETION', 'MOVE_IN'].map((k) => {
        const c = HV.comparisonStatus(m, k), card = screen.stage_cards[k];
        return [k, { status: c.status, due: c.due ? { date: c.due.date, units: c.due.units } : null, actual: c.actual ? { date: c.actual.date, units: c.actual.units, manual: c.actual.manual_units ?? null, inferred: c.actual.inferred_units ?? null } : null,
          gap: c.gap, rate: c.rate == null ? null : Number(c.rate.toFixed(1)), rateText: HV.formatGapRate(c.rate), next: c.next ? { date: c.next.date, units: c.next.units } : null,
          yearEnd: card?.year_end_expected != null ? { date: card.plan_date, units: card.year_end_expected } : null }];
      })),
      delayMax: latest.DELAYED ?? 0, warningMax: latest.WARNING ?? 0, stageGaps: gaps, bottleneck: neck,
      stageShort: stageShort(rows, gaps, asOf),
      supplyUpcoming: { total: st.total, projects: st.projects, from: st.upcoming[0].month, to: st.upcoming.at(-1).month },
      monthly: st.monthly, projectStatus: screen.project_status, stageExclusive: screen.stage_exclusive, mapSupply: Object.fromEntries(Object.entries(screen.map_supply).map(([k, v]) => [k, { supplyReached: v.supply_reached, delayed: v.delayed, delayNote: v.delay_note }])),
    },
  };
}

/* 덤프 포트폴리오 + 덤프 뒤 생긴 행의 PoC 묶음(이미 있는 id 는 덤프 그대로) → 같은 범위의 portfolio_comparisons */
function withLate(view, late) {
  const have = new Set(view.portfolio_cohorts.map((c) => c.id));
  const portfolio = [...view.portfolio_cohorts, ...late.filter((c) => !have.has(c.id))];
  return { ...view, portfolio_cohorts: portfolio, portfolio_comparisons: PP.portfolioComparisons(portfolio, view.as_of_date) };
}
/* HOME 덤프(최신 달 폴더의 최신 판) + 같은 기준일 PoC 스냅샷 → view */
function dumpView() {
  const HOME = require('./home-source'), HP = require('./home-projects'), P = require('./paths');
  const monthDir = P.ledgerDir(P.latestMonth()), dir = HOME.latestHomeDir(monthDir);
  if (!dir || !HOME.homeAvailable(dir)) throw new Error('HOME 판(raw/home/<덤프시각>)의 원본(jsonl.gz)이 없다');
  const home = HOME.readHome(dir), asOf = PP.asOfOf(home.snapshotAt);
  return withLate(PP.homeView(home), HP.lateCohorts(home, HP.readPoc(path.join(monthDir, 'raw', 'home-api', asOf))));
}

const render = (v) => JSON.stringify(v, null, 1) + '\n';

if (require.main === module) {
  try {
    const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
    let view;
    if (opt('--view')) view = JSON.parse(fs.readFileSync(path.resolve(opt('--view')), 'utf8'));
    else view = dumpView();
    const out = path.resolve(opt('--out') ?? path.join(ROOT, OUT));
    const doc = homeBoard(view);
    fs.writeFileSync(out, render(doc));
    const h = doc.home;
    console.log(`${path.relative(ROOT, out)}: 기준일 ${doc.referenceDate} · 연결 사업 ${doc.scope.projects} · 카드 사업화 ${h.cards.BUSINESS.current} 착공 ${h.cards.CONSTRUCTION.current} 공급 ${h.cards.SUPPLY.current} · 지연 최대 ${h.delayMax} 주의 최대 ${h.warningMax} · 12개월 공급 ${h.supplyUpcoming.total}/${h.supplyUpcoming.projects}`);
  } catch (e) { console.error(`오류: ${e.message}`); process.exit(1); }
}

module.exports = { homeBoard, withLate, dumpView, STAGE_NAMES, render };
