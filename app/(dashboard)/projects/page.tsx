import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Printer } from 'lucide-react';
import { MetricRow, Page, PageHead, PanelHead, SrcLink, sub } from '@/components/page';
import PrintButton from '@/components/projects/PrintButton';
import WindowSeed from '@/components/windows/WindowSeed';
import { Pipeline, PolicyCompare, PrintDefs, Questions, ReadHelp } from '@/components/projects/Summary';
import { HOME_LIST_COLS, NO_LOC, SGG_MAP, dropBlank, gapCell, homeAgencyCell, homeListRows, homeStagePill, homeStatusCell, sggLabel, unitsCell } from '@/lib/board/projects-list';
import InfoTip from '@/components/ui/info-tip';
import { Badge } from '@/components/ui/badge';
import ScopeChip from '@/components/ui/scope-chip';
import SkipToList from '@/components/projects/SkipToList';
import { Card } from '@/components/ui/card';
import { Chip, ChipBar, ChipGroup, ChipMenu, ChipSep, ClearChip } from '@/components/ui/chips';
import { mapScopeHref } from '@/lib/board/map-href';
import { METRO_AREAS, SIDO_FULL, guOf } from '@/lib/board/metro-overview';
import MapLink from '@/components/board/MapLink';
import { DataGrid } from '@/components/ui/data-grid';
import { sidoName } from '@/lib/board/calc';
import { getBoardData } from '@/lib/board/data';
import { getHomeProjects, getPolicyProgress, getProjectDrawer, getProjectsIndex } from '@/lib/board/projects-index';
import { projectWindow } from '@/lib/board/project-window';
import {
  AGENCY_NAME, AHEAD_SUPPLY, BOARD_CIR, BOARD_COLOR, HOME_NAMES, HOME_STATUS_NAME, HOME_STATUS_ORDER, HOME_STATUS_TIP,
  applyFilters, candidateOf, compareLines, homeChartOf, homeListOrder, homePipelineOf, homePriorityOf, homeQuestionsOf, homeSummaryOf, listHref, mapLocOf, parseFilters, policyLabel, scopeOf, ymText,
  type Filters, type ProjectRow,
} from '@/lib/board/projects-view';
import type { Cell, Col, Row } from '@/lib/grid/spec';
import { cn } from 'cn';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/* 목록 = HOME 원천 행(PRO_ — 2026-10-21 사용자 결정: 셈 단위·범위·값 = HOME PoC, lib/board/projects-view homeRowsOf).
   거르기: 정책 ?policy=129|813|all(없으면 9·7 — PoC 기본, all = 전 정책) 또는 ?program=이름(하나만) · 지역 ?sido=NN|metro|all·?sgg=NNNNN(지역이 없으면 기본 수도권 — 자료가 수도권뿐이라 전국도 같음)
   · 단계 ?stage=0~5(HOME 6칸 정책·사업화·인허가·건설·공급·입주) · 상태 ?status=ok|caution|delay|none|check|late · 기관 ?agency=<PoC 기관 이름>(옛 lh·sh·gh·ih·etc 도 받는다).
   사업 창 ?id=PRO_…(원천 행 — 우리 원장 사업이 있으면 그 상세를 붙임) · ?id=PRJ-…(다른 화면이 거는 원장 사업 상세) · ?cand=<원장 id>(간단 보기 — 후보 사업) · 월간 보고 보기 ?print=1. 맞지 않는 값은 거르지 않는다.
   같은 거르기의 CSV 는 /projects/csv?…(route.ts — 열·값은 lib/board/projects-list.ts 하나). */
async function load(searchParams: Props['searchParams']) {
  const [q, { molit }, ledgerIdx, idx] = await Promise.all([searchParams, getBoardData(), getProjectsIndex(), getHomeProjects()]);
  const f = parseFilters(q, { policies: idx.policies, programs: idx.programs, sidoOk: (c) => !!sidoName(molit, c), guOf, home: { agencies: idx.agencies.map((a) => a.name) } });
  const lens = f.policy ? policyLabel(f.policy) : f.program?.name ?? ALL_POLICIES;
  const region = f.sgg ? sggLabel(sggFullName(f.sgg, idx.sggNames), sidoName(molit, f.sgg.slice(0, 2))) : f.sido ? sidoName(molit, f.sido) ?? f.sido : '수도권';   // 자료가 수도권만이라 ?sido=all 도 수도권(2026-10-19 결정)
  const tail = [f.stage !== undefined && `${BOARD_CIR[f.stage]} ${HOME_NAMES[f.stage]}`, f.status && (f.status === 'check' ? '점검 필요' : f.status === 'late' ? HOME_STATUS_NAME.delay : HOME_STATUS_NAME[f.status as keyof typeof HOME_STATUS_NAME] ?? f.status), f.agency];
  const label = [lens, region, ...tail].filter(Boolean).join(' · ');
  /* 목록 범위 칩: 지역은 원장 칩이 보이므로 뺀 나머지 거르기 */
  const listLabel = [lens, ...tail].filter(Boolean).join(' · ');
  /* 받은 쿼리 글자(첫 창의 '같은 단계' 링크가 지금 거르기를 지키게 — WindowSeed) */
  const search = new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString();
  return { f, idx, ledgerIdx, molit, label, listLabel, lens, region, search, id: one(q.id) ?? null, cand: one(q.cand) ?? null, print: one(q.print) === '1' };
}
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { label, id, cand, idx, ledgerIdx, print } = await load(searchParams);
  const h = id && !print ? idx.rows.find((r) => r.id === id) : undefined;
  if (h) return { title: h.name };
  const d = id && !print ? await getProjectDrawer(id) : null;
  if (d) return { title: d.kind === 'detail' ? d.row.name : d.project.name };
  const c = !id && !print ? candidateOf(ledgerIdx.rows, cand) : null;
  if (c) return { title: c.row.name };
  if (print) return { title: '월간 주택공급 보고' };
  return { title: label ? `${label} 사업` : '사업' };
}

const fmt = (n: number) => n.toLocaleString('en-US');
/* 원천 이름 HOME 은 보이는 글 대신 title 에(보이는 이름은 '정책 진행 자료') */
/* 시군구 이름(시도 포함 — sggLabel 이 앞 낱말을 줄인다): 구가 있는 경기 시의 시 코드는 그 구를 합친 이름 '경기도 고양시(덕양구·일산동구·일산서구)' */
function sggFullName(code: string, names: Record<string, string | null>): string {
  const gu = guOf(code);
  return gu.length ? `${SIDO_FULL[code.slice(0, 2)]} ${METRO_AREAS[code]}(${gu.map((c) => METRO_AREAS[c].slice(METRO_AREAS[code].length).trim()).join('·')})` : names[code] ?? code;
}
const HOME_TIP = 'HOME — 국토교통부 정책·LH·SH·GH 원천을 모은 팀 자료(정책별 단계 목표·확인 포함)';
const ALL_POLICIES = '전 정책';
/* 셈 단위의 보이는 이름(내부 이름 HOME 은 title 에만 — HOME_TIP) */
const UNIT_TEXT = '원천 행';
/* 판정 정의(목록 머리·상태 칩 ⓘ·인쇄 각주에 같은 글) */
const JUDGE_DEF = '기준일까지 도래한 단계 목표 대비 측정(담당자 입력 포함) 부족률 2% 이상 지연, 0% 초과~2% 미만 주의, 목표·측정이 없으면 판정 미확보';
/* 같은 거르기에서 빠진 하나를 풀면 몇 건인지(빈 결과의 대안) */
const count = (rows: ProjectRow[], f: Filters) => applyFilters(rows, f).length;

const MAPA = 'inline-flex flex-none items-center gap-1 rounded-chip text-sm leading-body whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const SwatchDot = ({ color }: { color: string }) => <i className="block size-2.5 flex-none rounded-chip" style={{ background: color }} aria-hidden="true" />;
const BTN = 'btn-reset inline-flex h-8 items-center gap-1.5 rounded-tile border border-line2 bg-card px-3 text-sm font-bold whitespace-nowrap text-foreground no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/* 사업(목록·사업 창·월간 보고). 2026-10-14 시안(docs/design/home-concept/projects.html) — 칩 한 줄 → 요약(정책 목표 대비 · 핵심 질문 · 단계별 진행 · 읽는 법) → 목록.
   2026-10-21(사용자 결정 — HOME PoC 와 같은 수치): 목록 = HOME 원천 행(PRO_ 하나 = 사업 하나), 기본 = 9·7 포트폴리오(확정 연결 230행 · 물량 집계 175행), 전 정책은 거르기(443행),
   같은 현장을 합친 사업 원장 사업 수는 보조 표기. 단계 = PoC 누적 도달(정책 화면 PoC 이름), 상태 = PoC 사업 판정(부족률 2%), 기관 = PoC 기관 이름, 12개월 = 향후 12개월 공급 예정.
   처음 열면 수도권 · 지연 → 주의 → 정상 순. 행을 누르면 그 자리에 떠 있는 사업 창(?id=PRO_… — 우리 원장 사업이 있으면 그 상세를 붙임).
   요약 범위: 핵심 질문·단계별 진행은 정책·지역·기관 거르기를 따르고, 단계·상태 거르기는 목록에만. 정책 목표 대비와 핵심 질문 ①은 HOME 정책 진행 자료의 정책 전체 값(S1 — 표지).
   보고서 인쇄(?print=1 · @media print): 핵심 질문·단계별 진행·정책 목표 대비(펼침)·점검 필요 사업(10줄 넘으면 상위 10)·기준일·출처만(8.14 지시 '매월 진척상황 보고'). 옛 /reports·/project/:id 는 next.config.ts 가 넘긴다. */
export default async function ProjectsPage({ searchParams }: Props) {
  const { f, idx, molit, label, listLabel, lens, region, search, id, cand: candId, print } = await load(searchParams);
  /* 첫 창(?id= 상세 — 없으면 ?cand= 간단 보기): 창 props 는 projectWindow 결과만(허용 목록 — RSC 페이로드에 공개된다). 인쇄 보기에는 만들지 않는다 */
  const [pp, win] = await Promise.all([getPolicyProgress(), print ? null : (async () => (id ? await projectWindow(id, 'admin') : null) ?? (candId ? await projectWindow(candId, 'admin', { cand: true }) : null))()]);
  const rows = idx.rows;
  const chartOf = homeChartOf(f);
  const scope = scopeOf(rows, f);
  const list = homeListOrder(applyFilters(rows, f));
  const s = homeSummaryOf(list, chartOf);
  const at = (p: Parameters<typeof listHref>[1]) => listHref(f, p);
  const sidoOf = (r: ProjectRow) => r.sgg.slice(0, 2);
  const sidos = [...new Set(rows.map(sidoOf))].filter((c) => sidoName(molit, c)).sort();
  const ref = idx.referenceDate.replace(/-/g, '.');
  /* 첫 그림의 선택 행(창 관리자 장착 뒤에는 열린 창을 따른다 — components/ui/data-grid.tsx useOpenIds) */
  const sel = win ? win.canonical : null;

  /* 요약: 핵심 질문·단계별 진행(렌즈·지역·기관 범위 — 단계·상태 거르기는 목록에만) · 목표 대비(렌즈가 9·7·전 정책이면 목표 있는 정책 모두, 다른 정책이면 그 정책 — HOME 정책 진행, 정책 전체) */
  const questions = homeQuestionsOf(rows, f, { pp, policies: idx.policies, observedMonth: idx.observedMonth, sidoName: (c) => sidoName(molit, c) ?? c, sggName: (c) => sggLabel(sggFullName(c, idx.sggNames), undefined, true) });
  const pipe = homePipelineOf(scope, chartOf);
  const lensRows = scopeOf(rows, { home: true, policy: f.policy, program: f.program });
  const lensSidos = [...new Set(lensRows.map(sidoOf))].sort().map((c) => sidoName(molit, c) ?? c).join('·');
  const lensRev = homeSummaryOf(lensRows, chartOf);
  const lensReview = lensRows.filter((r) => r.link === 'REVIEW_REQUIRED').length;
  const badges = (
    <span className="flex items-center gap-1.5">
      <Badge title={`범위: 이 정책·프로그램에 연결된 원천 행은 ${lensSidos}에만 있음 · 원천 행 ${fmt(lensRev.n)} · 같은 현장을 합친 사업 원장 사업 ${fmt(lensRev.sites)}곳${lensReview ? ` · 담당자 검토 중인 연결 ${fmt(lensReview)}행 포함` : ''} · 해제된 연결은 빠짐`}>{lensSidos}</Badge>
    </span>
  );
  /* 목표 대비 줄의 사업 수·호수는 원천 행·집계 호수(정책마다 PoC 집계 기준) */
  const lines = (f.program ? [] : compareLines(pp, idx.policies, rows, f.policy && f.policy.key !== '97' ? [f.policy.key] : idx.policies.map((p) => p.key))).map((l) => {
    const set = rows.filter((r) => r.policies.includes(l.policy.key)), hs = homeSummaryOf(set, homeChartOf({ home: true, policy: l.policy }));
    return { ...l, n: hs.n, units: hs.units };
  });
  const listOnly = f.stage !== undefined || !!f.status;
  const lensText = [lens, f.agency].filter(Boolean).join(' · ');
  /* 범위가 다른 두 숫자 묶음은 카드를 나누고 머리에 범위 칩을 단다: 정책 목표 대비(정책 전체 · 정책 진행 자료 — 거르기와 상관없음) | 원천 행 요약(거르기 범위 · 정책 진행 자료) */
  const [whole, scoped] = questions[0]?.stages ? [questions[0], questions.slice(1)] : [null, questions];
  const scopeLine = (
    <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <ScopeChip scope={region} source="정책 진행 자료" title={`핵심 질문·단계별 진행의 범위: 정책 진행 자료(HOME) 원천 행 · ${[region, lensText].filter(Boolean).join(' · ')}(위 거르기에 따라 바뀜) · ${HOME_TIP}`} />
      {lensText ? <span className="tabular-nums text-foreground">{lensText}</span> : null}
      <span className={cn(listOnly && 'font-bold text-foreground')} title="핵심 질문·단계별 진행은 정책·지역·기관 거르기를 따르고, 단계·상태 거르기는 아래 목록에만 적용">단계·상태 거르기는 목록에만</span>
      <span className="ml-auto"><ReadHelp home /></span>
    </div>
  );
  /* 정책 목표 대비: 첫 칸(9·7 의 단계 칸)과 같은 정책 행은 접힘에서 뺀다 — 한 정책 행이 두 번 나오지 않게(다른 정책 줄만 접힘에 남는다) */
  const cmpLines = whole?.stages ? lines.filter((l) => l.policy.key !== (f.policy && f.policy.key !== '97' ? f.policy.key : '97')) : lines;
  const policyCard = whole || cmpLines.length ? (
    <Card render={<section aria-label="정책 목표 대비" />} className="min-w-0 print:break-inside-avoid">
      <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <ScopeChip scope="정책 전체" source="정책 진행 자료" title={`정책 전체 숫자(호) — 정책에 연결된 사업 전체(세 정책 모두 수도권 정책) · ${HOME_TIP} · 위 지역·기관·단계·상태 거르기와 상관없음`} />
        {whole ? <span title="같은 해 1월~기준 달 누적 · 확인 / 목표(호)">{ymText(whole.stages![0].from)}~{ymText(whole.stages![0].through)} · 확인 / 목표</span> : null}
      </div>
      {whole ? <Questions list={[whole]} /> : null}
      <PolicyCompare lines={cmpLines} title={f.policy && f.policy.key !== '97' ? `${policyLabel(f.policy)} 목표 대비` : '다른 정책 목표 대비'} open={print} href={(key) => at({ policy: key })} />
    </Card>
  ) : null;
  const ledgerCard = (
    <Card render={<section aria-label="요약" />} className="min-w-0 print:break-inside-avoid">
      {scopeLine}
      <Questions list={scoped} />
      <div className="mt-5">
        <Pipeline home open={pipe.open} total={pipe.total} on={f.stage} badges={badges} href={(i) => at({ stage: f.stage === i ? undefined : String(i) })} />
      </div>
      <PrintDefs home />
    </Card>
  );
  /* 두 카드는 위아래로(2026-10-16 3차 평가: 나란히 두면 정책 카드가 원장 카드보다 짧아 아래가 165px·인쇄 보기 414px 비었다 — 정책 카드는 단계 여섯 칸을 가로로 편다) */
  const summary = policyCard ? <>{policyCard}{ledgerCard}</> : ledgerCard;

  /* 월간 보고: 점검 필요(지연·주의) 원천 행(10줄 이하면 전부, 넘으면 상위 10 — 부족 호수 큰 순) · 기준일·출처 */
  const prioAll = homePriorityOf(scope), top = prioAll.slice(0, 10);
  const prioTitle = prioAll.length > 10 ? `점검 필요 ${fmt(prioAll.length)}건 중 상위 10` : `점검 필요 ${fmt(prioAll.length)}건 전부`;
  const prioCols: Col[] = [{ key: 'name', label: '사업', kind: 'text' }, { key: 'sgg', label: '시군구', kind: 'text' }, { key: 'agency', label: '기관', kind: 'text' }, { key: 'stage', label: '단계', kind: 'text' },
    { key: 'units', label: '계획 호수' }, { key: 'gap', label: '부족 호수' }, { key: 'status', label: '상태', kind: 'text' }];
  const prioRows: Row[] = top.map((r) => ({ id: r.id, c: { name: r.name, sgg: sggLabel(r.sggName, sidoName(molit, sidoOf(r))), agency: homeAgencyCell(r), stage: homeStagePill(r), units: unitsCell(r), gap: gapCell(r), status: homeStatusCell(r) } }));
  const prio = dropBlank(prioCols, prioRows);
  const report = (
    <>
      <Card render={<section aria-label="우선 점검 사업" />} className={cn('print:break-inside-avoid print:shadow-none', !print && 'hidden print:block')}>
        <PanelHead title={prioTitle} scope={<ScopeChip scope={region} source="정책 진행 자료" title={`우선 점검 사업의 범위: 정책 진행 자료(HOME) 원천 행 · ${label}(위 거르기에 따라 바뀜)`} />} tip={`부족 호수가 큰 사업부터(10줄이 넘으면 상위 10줄) · 판정: ${JUDGE_DEF}${prio.note}`} />
        {prioRows.length ? <DataGrid label="우선 점검 사업" cols={prio.cols} rows={prioRows} sortable={false} /> : <p className={cn(sub, 'm-0')}>단계 목표보다 모자란 사업이 없습니다</p>}
      </Card>
      <p className={cn('m-0 text-sm text-muted-foreground', !print && 'hidden print:block')}>
        범위 {label}({fmt(scope.length)}행) · 자료 기준: <span title={HOME_TIP}>정책 진행 자료</span> {ref} · 정책 목표·확인 {ymText(pp.referenceMonthEnd)}까지 · 셈 단위: {UNIT_TEXT}(같은 현장을 합친 사업 원장 사업은 보조) · 판정: {JUDGE_DEF}
      </p>
    </>
  );
  const reportHead = (
    <header className={cn('pt-4 print:pt-0', !print && 'hidden print:block')}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="m-0 text-h1 leading-title font-bold">월간 주택공급 보고</h1>
        <span className="text-sm text-muted-foreground tabular-nums" title={`정책 진행 자료(HOME) ${ref} · 9·7 대책 단계 목표·확인은 ${pp.referenceMonthEnd.replace(/-/g, '.')}까지`}>자료 기준 {ref} · 정책 목표 {ymText(pp.referenceMonthEnd)}까지 · {label}</span>
      </div>
    </header>
  );

  if (print) {
    return (
      <Page>
        <Card variant="compact" render={<div role="toolbar" aria-label="인쇄 미리보기" />} className="mt-4 flex items-center gap-2 text-sm text-muted-foreground print:hidden">
          <span className="mr-auto">인쇄 미리보기 · 월간 보고</span>
          <PrintButton className={BTN} />
          <Link href={listHref(f)} className={BTN}>닫기</Link>
        </Card>
        {/* 인쇄 미리보기: 조작 표지(ⓘ 읽는 법·› 등 data-ctl)를 숨기고 인쇄용 정의(data-print-defs)를 펼친다 — 실제 인쇄(@media print)와 같은 모양 */}
        <div className="contents [&_[data-ctl]]:hidden! [&_[data-print-defs]]:block!">
          {reportHead}
          {summary}
          {report}
        </div>
      </Page>
    );
  }

  /* 목록: 열·칸은 lib/board/projects-list.ts(CSV 내려받기와 같은 열) */
  /* 위치 미확보: 지도와 같은 판정(mapLocOf)인 사업 원장 사업(원천 행의 ourId) — 목록 지도 열 표지 */
  const ours = [...new Set(list.map((r) => r.home?.ourId).filter((x): x is string => !!x && isMetroId(x)))];
  const noLoc = new Set((await Promise.all(ours.map(async (oid) => { const d = await getProjectDrawer(oid); return d?.kind === 'detail' && !mapLocOf(d.row, d.detail.loc) ? oid : null; }))).filter((x): x is string => !!x));
  const gridRows: Row[] = homeListRows(list, f, sel, (c) => sidoName(molit, c), chartOf, (oid) => noLoc.has(oid));
  const grid = dropBlank(HOME_LIST_COLS, gridRows);
  /* 시군구 칸은 한 줄(지역 이름이 둘로 접히지 않게 말줄임 열의 두 줄 상자를 쓰지 않는다 — 칸 폭은 글자에 맞는다) */
  const listCols = grid.cols.map((c) => (c.key === 'sgg' ? { key: c.key, label: c.label, kind: c.kind } : c));
  const csvHref = listHref(f).replace(/^\/projects/, '/projects/csv');
  const reset = listHref(f) !== '/projects';
  /* 지도 연결점: 이 목록의 범위로 — 시군구 하나 ?sgg= · 시도 하나(수도권) ?sido= · 수도권(기본) 지도 첫 화면 */
  const scopeMap = f.sgg || f.sido ? mapScopeHref({ sgg: f.sgg, sido: f.sido }) : f.metro ? mapScopeHref() : null;
  const mapLink = scopeMap ? <MapLink href={scopeMap} full="이 범위를 지도에서 보기">이 범위 지도에서</MapLink> : null;
  /* 빈 결과: 푸는 동작과 가까운 대안(건수가 있는 것만) */
  const alts = !list.length ? [
    ...(f.status || f.stage !== undefined ? [{ label: '상태·단계 거르기 풀기', href: at({ status: undefined, stage: undefined }), n: count(rows, { ...f, status: undefined, stage: undefined }) }] : []),
    ...(f.metro || f.sido || f.sgg ? [{ label: '수도권 전체 보기', href: listHref({ ...f, metro: false, sido: undefined, sgg: undefined }), n: count(rows, { ...f, metro: false, sido: undefined, sgg: undefined }) }] : []),
    ...(f.policy?.key !== '97' || f.program || f.agency ? [{ label: '정책·기관 거르기 풀기', href: at({ policy: undefined, program: undefined, agency: undefined }), n: count(rows, { ...f, policy: idx.policies.find((p) => p.key === '97'), program: undefined, agency: undefined }) }] : []),
  ].filter((a) => a.n > 0) : [];
  const unitTip = `셈 단위 = ${UNIT_TEXT}(정책 진행 자료의 원천 사업 한 줄 = 한 건) · 집계 호수 = 같은 블록의 중복·모호 행(공사 계약 행 등 ${fmt(s.excluded)}행)을 뺀 집계 행의 대표 호수 합${s.missing ? `(물량 없음 ${fmt(s.missing)}행)` : ''} · 같은 현장을 합친 사업 원장 사업 ${fmt(s.sites)}곳(원장에 없는 원천 행 ${fmt(s.unlinked)} — 덤프 뒤 생긴 행·변환 제외)`;

  return (
    <Page>
      {list.length ? <SkipToList /> : null}
      <div className="contents print:hidden">
        <PageHead title="사업"
          tip="정책 진행 자료(HOME)의 원천 사업을 정책·프로그램과 지역·상태·기관으로 거른다(처음은 9·7 대책 · 수도권) · 행을 누르면 사업 창 · 보고서 인쇄 = 월간 진척 보고(2026.08.14 지시)">
          <span className={cn(sub, 'ml-auto whitespace-nowrap tabular-nums mobile:text-sm')} title={`정책 진행 자료(HOME) 기준일 ${ref}(해제된 연결 제외) · 판정: ${JUDGE_DEF}`}>자료 기준 {ref}</span>
          <Link href={listHref(f, { print: '1' })} className={cn(BTN, 'self-center')} title="핵심 질문·단계별 진행·정책 목표 대비·점검 필요 사업·기준일·출처만 담은 월간 보고 보기(인쇄 미리보기)">
            <Printer className="size-4 flex-none text-muted-foreground" aria-hidden="true" />보고서 인쇄
          </Link>
        </PageHead>
      </div>
      {reportHead}

      <ChipBar className="print:hidden min-[901px]:max-[1439px]:gap-x-2 [--btn-h:var(--ctl-h)] [&_summary]:min-h-(--ctl-h) [&_[role=group]:not(.ui-tabs)>a]:min-h-(--ctl-h)">
        <ChipGroup label="정책" bare>
          {idx.policies.map((p) => <Chip key={p.key} href={at({ policy: p.key === '97' ? undefined : p.key, program: undefined })} on={f.policy?.key === p.key} title={`${p.name} · ${p.announced.replace(/-/g, '.')} 발표 · ${p.scope}${p.key === '97' ? ' · 처음 열 때 범위(정책 진행 자료 기본)' : ''}`}>{policyLabel(p)}</Chip>)}
          <Chip href={at({ policy: 'all', program: undefined })} on={!f.policy && !f.program} title="세 정책과 정책 미귀속(일반 주택 건설·민간 정비 등)까지 해제되지 않은 모든 원천 행">{ALL_POLICIES}</Chip>
          <ChipMenu label="프로그램" on={!!f.program} items={idx.programs.map((p) => ({ href: at({ program: p.name }), label: p.name, on: f.program?.name === p.name, title: `${idx.policies.filter((x) => p.policies.includes(x.key)).map(policyLabel).join('·') || '정책 미귀속'} · 원천 행 ${p.projects}` }))} />
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="지역" bare>
          {sidos.length <= 4 ? (
            <div className="ui-tabs ui-tabs-seg" role="group" aria-label="지역">
              <Link href={at({ sido: 'metro' })} scroll={false} aria-current={f.metro ? 'true' : undefined} title="서울·인천·경기(처음 열 때 범위)">수도권</Link>
              {sidos.map((c) => <Link key={c} href={at({ sido: c })} scroll={false} aria-current={(f.sido ?? f.sgg?.slice(0, 2)) === c ? 'true' : undefined}>{sidoName(molit, c)}</Link>)}
            </div>
          ) : (
            <>
              <Chip href={at({ sido: 'metro' })} on={!!f.metro} title="서울·인천·경기(처음 열 때 범위)">수도권</Chip>
              <ChipMenu label="시도" on={!!(f.sido || f.sgg)} cols={2}
                items={sidos.map((c) => ({ href: at({ sido: c }), label: sidoName(molit, c)!, on: (f.sido ?? f.sgg?.slice(0, 2)) === c }))} />
            </>
          )}
          {f.sgg ? <ClearChip href={at({ sgg: undefined })} title="시군구 거르기 풀기(수도권으로)">{sggLabel(sggFullName(f.sgg, idx.sggNames), sidoName(molit, f.sgg.slice(0, 2)))}</ClearChip> : null}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="상태" bare>
          <Chip href={at({ status: f.status === 'check' ? undefined : 'check' })} on={f.status === 'check'} title="지연·주의 사업만(부족 호수 큰 순)">점검 필요</Chip>
          <ChipMenu label="상태" on={!!f.status && f.status !== 'check'}
            items={[{ href: at({ status: undefined }), label: '전체', on: false }, ...HOME_STATUS_ORDER.map((k) => ({ href: at({ status: k }), label: HOME_STATUS_NAME[k]!, on: f.status === k || (k === 'delay' && f.status === 'late'), title: HOME_STATUS_TIP[k] }))]} />
          <InfoTip label="상태 칩"><p>판정: {JUDGE_DEF}입니다.</p></InfoTip>
          {f.stage !== undefined ? <ClearChip href={at({ stage: undefined })} title="단계 거르기 풀기(단계는 아래 단계별 진행 칸으로 고른다)"><SwatchDot color={BOARD_COLOR[f.stage]} />{`${BOARD_CIR[f.stage]} ${HOME_NAMES[f.stage]}`}</ClearChip> : null}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="기관" bare>
          <ChipMenu label="기관" on={!!f.agency} items={[{ href: at({ agency: undefined }), label: '전체', on: false }, ...idx.agencies.map((a) => ({ href: at({ agency: a.name }), label: a.name, on: f.agency === a.name, title: `정책 진행 자료의 기관 이름(원천 글자 — LH·GH·SH 는 줄임) · 원천 행 ${fmt(a.n)}` }))]} />
        </ChipGroup>
        {reset ? <><ChipSep /><Chip href="/projects" title="모든 거르기를 풀고 처음 화면(9·7 대책 · 수도권 · 지연 순)으로">모두 풀기</Chip></> : null}
      </ChipBar>

      {summary}
      {report}

      <Card render={<section id="projects-list" aria-label="사업 목록" />} className="scroll-mt-4 print:hidden">
        <PanelHead title="사업 목록"
          scope={<><ScopeChip scope={region} source="정책 진행 자료" title={`사업 목록의 범위: 정책 진행 자료(HOME) 원천 행 · ${label}(위 거르기에 따라 바뀜)`} />{listLabel ? <ScopeChip scope={listLabel} title="목록에 적용 중인 정책·상태·기관 거르기" /> : null}</>}
          tip={`기본 순서 = 지연 → 주의 → 정상 → 판정 미확보(그 안에서 부족 호수 큰 순)${grid.note}`}>
          <InfoTip label="목록 읽는 법">
            <dl>
              <dt>건 · 집계</dt><dd>{unitTip}</dd>
              <dt>계획 호수 · 집계 호수</dt><dd>계획 호수 = 원천 행의 사업 호수 · 집계 호수 = 집계 행의 대표 호수(같은 블록 원천 값 보충 포함), &apos;제외&apos; = 중복·모호해 집계에서 뺀 행</dd>
              <dt>단계</dt><dd>{HOME_NAMES.map((n, i) => `${BOARD_CIR[i]}${n}`).join(' · ')} — 그 단계나 뒤 단계의 실제 기록(담당자 입력 포함)이 있는 가장 뒤 단계(건설은 준공 포함)</dd>
              <dt>상태 · 부족 호수</dt><dd>{JUDGE_DEF} · 부족 호수 = 도래 목표 대비 모자란 호수</dd>
              <dt>12개월 공급</dt><dd>{AHEAD_SUPPLY} — 공급(본 분양·모집) 일정 중 {ymText(idx.observedMonth)}부터 12개월 안의 증가분</dd>
              <dt>기관</dt><dd>정책 진행 자료의 기관 이름(원천 글자 — {AGENCY_NAME.lh}·GH·SH 는 줄임, 없으면 {AGENCY_NAME.etc})</dd>
              <dt>{SGG_MAP}</dt><dd>지도 열 표지 — 사업 원장에 같은 사업이 없는 원천 행(덤프 뒤 생긴 행·변환 제외)은 그 시군구 지도로 감</dd>
              <dt>{NO_LOC}</dt><dd>지도 열 표지 — 지도에 그릴 위치(블록·동 윤곽·대표점)가 없어 지도에서는 시군구로 보이는 사업(지도의 &apos;위치 미확보&apos;와 같은 사업)</dd>
            </dl>
          </InfoTip>
          {list.length ? <a href={csvHref} download className={MAPA} title={`지금 거르기 그대로 ${fmt(list.length)}행 · 화면과 같은 열(지도 표지 제외) + 사업 원장 id · CSV(UTF-8, 엑셀에서 열림)`}><Download className="size-3.5" aria-hidden="true" />CSV 내려받기</a> : null}
          {mapLink}
          <SrcLink />
        </PanelHead>
        <div title={unitTip}><MetricRow label="집계" value={fmt(s.units)} unit="호" items={[`${fmt(s.n)}건`, `집계 ${fmt(s.chart)}건 · 중복·모호 제외 ${fmt(s.excluded)}`, `사업 원장 ${fmt(s.sites)}곳`]} className="mb-2" /></div>
        {list.length ? (
          <>
            <p className={cn(sub, 'm-0 mb-1')} title="행을 누르면 사업 창(우리 사업 원장에 같은 사업이 있으면 일정·공정률·공고를 붙여 보임)">지연 → 주의 → 정상 순 · 지연 {fmt(s.delay)} · 주의 {fmt(s.caution)}
              {f.stage === 3 ? <InfoTip label="착공 목록 범위" className="align-middle"><p data-slot="start-basis">목록은 정책 진행 자료 원천 행 기준(통계누리 착공 통계와 범위 다름) — 종합상황판 &apos;진척 관리&apos;의 착공 호수는 통계누리 주택건설실적(수도권 착공 누계)이고, 이 목록은 실제 기록이 있는 가장 뒤 단계가 {BOARD_CIR[3]} {HOME_NAMES[3]}(착공·준공)인 원천 행이라 건수·호수가 다릅니다</p></InfoTip> : null}</p>
            <DataGrid label="사업 목록" maxHeight={640} cols={listCols} rows={gridRows} quietCount />
          </>
        ) : (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tile bg-muted px-tile-x py-tile-y">
            <span className="text-base text-muted-foreground">이 조건의 사업이 없습니다</span>
            {alts.map((a) => <Link key={a.label} href={a.href} scroll={false} className={BTN}>{a.label} <span className="font-normal text-muted-foreground tabular-nums">{fmt(a.n)}건</span></Link>)}
            <Link href="/projects" scroll={false} className={BTN}>모두 풀기</Link>
          </div>
        )}
      </Card>

      {/* 사업 창: 행을 누르면 그 자리에 떠 있는 창(창 관리자 components/windows — 링크 가로채기). 주소로 연 첫 창은 서버가 만든 props 로 깜박임 없이 */}
      <WindowSeed win={win} path="/projects" search={search} fromMap={f.from === 'map'} />
    </Page>
  );
}
/* 수도권 원장 사업 id(PRJ-{시군구5}-…) — 지도 자료가 있는 사업 */
const isMetroId = (id: string) => /^PRJ-(11|28|41)\d{3}-/.test(id);
