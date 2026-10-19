import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Printer } from 'lucide-react';
import { Page, PageHead, PanelHead, SrcLink, sub } from '@/components/page';
import Drawer from '@/components/projects/Drawer';
import PrintButton from '@/components/projects/PrintButton';
import Candidate, { CandidateHead } from '@/components/projects/Candidate';
import ProjectDetail, { DrawerHead } from '@/components/projects/ProjectDetail';
import { Pipeline, PolicyCompare, PrintDefs, Questions, ReadHelp } from '@/components/projects/Summary';
import { LIST_COLS, NO_LOC, SGG_MAP, dropBlank, lateCell, listRows, nextCell, sggLabel, stagePill, statusCell, agencyCell, unitsCell } from '@/lib/board/projects-list';
import InfoTip from '@/components/ui/info-tip';
import { Badge } from '@/components/ui/badge';
import ScopeChip from '@/components/ui/scope-chip';
import SkipToList from '@/components/projects/SkipToList';
import { Card } from '@/components/ui/card';
import { Chip, ChipBar, ChipGroup, ChipMenu, ChipSep, ClearChip } from '@/components/ui/chips';
import { mapHref, mapScopeHref } from '@/lib/board/map-href';
import { METRO_AREAS, SIDO_FULL, guOf } from '@/lib/board/metro-overview';
import MapLink from '@/components/board/MapLink';
import { DataGrid } from '@/components/ui/data-grid';
import { sidoName } from '@/lib/board/calc';
import { getBoardData } from '@/lib/board/data';
import { getPolicyProgress, getProjectDrawer, getProjectsIndex } from '@/lib/board/projects-index';
import {
  AGENCY_NAME, AGENCY_TIP, BOARD_CIR, BOARD_COLOR, BOARD_NAMES, CAND_NAME, DATE_ALT, DELAY_GROUP, LONG_DELAY_MONTHS, REVIEW_LATE, NONE_NAME, PAST_DUE, PLAN_COL, STATUS_NAME, STATUS_ORDER, STATUS_RANGE, STATUS_TIP,
  applyFilters, candidateOf, isMetro, mapLocOf, compareLines, editionText, listHref, listOrder, parseFilters, pipelineOf, policyLabel, priorityOf, questionsOf, scopeOf, summaryOf, ymText,
  type Filters, type ProjectRow,
} from '@/lib/board/projects-view';
import type { Cell, Col, Row } from '@/lib/grid/spec';
import { cn } from 'cn';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/* 거르기: 정책 ?policy=97|129|813 또는 ?program=이름(하나만) · 지역 ?sido=NN|metro|all·?sgg=NNNNN(지역이 없으면 기본 수도권, ?stage·?status·?agency 만 온 종합상황판 링크는 전국)
   · 단계 ?stage=0~5(리본 칸, 옛 01~06 도 받는다) · 상태 ?status=ok|caution|delay|long|none|check · 기관 ?agency=lh|sh|gh|etc. 서랍 ?id=PRJ-…(상세) · ?cand=<원장 id>(간단 보기 — 후보 사업) · 월간 보고 보기 ?print=1. 맞지 않는 값은 거르지 않는다.
   같은 거르기의 CSV 는 /projects/csv?…(route.ts — 열·값은 lib/board/projects-list.ts 하나). */
async function load(searchParams: Props['searchParams']) {
  const [q, { molit }, idx] = await Promise.all([searchParams, getBoardData(), getProjectsIndex()]);
  const f = parseFilters(q, { policies: idx.policies, programs: idx.programs, sidoOk: (c) => !!sidoName(molit, c), guOf });
  const lens = f.policy ? policyLabel(f.policy) : f.program?.name;
  const region = f.sgg ? sggLabel(sggFullName(f.sgg, idx.sggNames), sidoName(molit, f.sgg.slice(0, 2))) : f.sido ? sidoName(molit, f.sido) ?? f.sido : '수도권';   // 원장이 수도권만이라 ?sido=all 도 수도권(2026-10-19 결정)
  const tail = [f.stage !== undefined && `${BOARD_CIR[f.stage]} ${BOARD_NAMES[f.stage]}`, f.status && (f.status === 'check' ? '점검 필요' : f.status === 'late' ? DELAY_GROUP : f.status === 'review-late' ? REVIEW_LATE : STATUS_NAME[f.status]), f.agency && AGENCY_NAME[f.agency]];
  const label = [lens, region, ...tail].filter(Boolean).join(' · ');
  /* 목록 제목: 지역은 머리의 범위 칩이 보이므로 뺀다 */
  const listLabel = [lens, ...tail].filter(Boolean).join(' · ');
  return { f, idx, molit, label, listLabel, lens, region, id: one(q.id) ?? null, cand: one(q.cand) ?? null, print: one(q.print) === '1' };
}
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { label, id, cand, idx, print } = await load(searchParams);
  const d = id && !print ? await getProjectDrawer(id) : null;
  if (d) return { title: d.kind === 'detail' ? d.row.name : d.project.name };
  const c = !id && !print ? candidateOf(idx.rows, cand) : null;
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
/* '후보 계산'(사용자 결정 용어 — 종합상황판)·'후보 · 지연 계산' 정의 한 줄: 목록 머리 ⓘ 와 상태 칩 ⓘ 에 같은 글(2026-10-16 4차 평가) */
const REVIEW_LATE_DEF = '사업 번호가 아직 없는 후보 사업을 같은 규칙으로 계산한 값';
/* 같은 거르기에서 빠진 하나를 풀면 몇 건인지(빈 결과의 대안) */
const count = (rows: ProjectRow[], f: Filters) => applyFilters(rows, f).length;

const MAPA = 'inline-flex flex-none items-center gap-1 rounded-chip text-sm leading-body whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const SwatchDot = ({ color }: { color: string }) => <i className="block size-2.5 flex-none rounded-chip" style={{ background: color }} aria-hidden="true" />;
const BTN = 'btn-reset inline-flex h-8 items-center gap-1.5 rounded-tile border border-line2 bg-card px-3 text-sm font-bold whitespace-nowrap text-foreground no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/* 사업(목록·상세 서랍·월간 보고). 2026-10-14 시안(docs/design/home-concept/projects.html) — 칩 한 줄 → 요약(핵심 질문 5 · 단계 파이프라인 · 목표 대비 · 읽는 법) → 목록.
   목록은 사업 원장의 살아 있는 사업(대체·숨김 제외) 중 지역 범위 — 처음 열면 수도권(서울·인천·경기, 원장 전체 — 2026-10-19 결정으로 전국 칩 없음). 기본 순서는 점검 필요 순(지연 개월 큰 순). 행을 누르면 오른쪽 서랍에 사업 상세(?id=, 발급 사업),
   번호 발급 전 사업(후보)은 간단 보기(?cand= — id 가 다음 원장에서 바뀔 수 있어 주소를 나눈다).
   요약 범위: 핵심 질문·파이프라인은 정책·지역·기관 거르기를 따르고, 단계·상태 거르기는 목록에만(요약 머리에 표지). 정책별 목표 대비와 핵심 질문 ①은 HOME 정책 진행 자료의 정책 전체 값(표지).
   보고서 인쇄(?print=1 · @media print): 핵심 질문·단계별 진행·정책 목표 대비(펼침)·점검 필요 사업(10줄 넘으면 상위 10)·기준일·출처만(8.14 지시 '매월 진척상황 보고'). 옛 /reports·/project/:id 는 next.config.ts 가 넘긴다. */
export default async function ProjectsPage({ searchParams }: Props) {
  const { f, idx, molit, label, listLabel, lens, region, id, cand: candId, print } = await load(searchParams);
  const [pp, drawer] = await Promise.all([getPolicyProgress(), id && !print ? getProjectDrawer(id) : null]);
  const cand = !drawer && !print ? candidateOf(idx.rows, candId) : null;
  const rows = idx.rows;
  const scope = scopeOf(rows, f);
  const list = listOrder(applyFilters(rows, f));
  const s = summaryOf(list);
  const at = (p: Parameters<typeof listHref>[1]) => listHref(f, p);
  const sidoOf = (r: ProjectRow) => r.sgg.slice(0, 2);
  const sidos = [...new Set(rows.map(sidoOf))].filter((c) => sidoName(molit, c)).sort();
  const ref = idx.referenceDate.replace(/-/g, '.');
  const sel = drawer ? (drawer.kind === 'detail' ? drawer.row.id : drawer.project.id) : cand ? cand.row.id : null;
  /* 서랍 '같은 단계 사업 목록' 링크: 지금 거르기를 유지한 채 그 단계(서랍은 닫는다 — 단계 칸 자체는 링크가 아니다) */
  const stageHref = (i: number) => listHref(f, { stage: String(i) });

  /* 요약: 핵심 질문·파이프라인(렌즈·지역·기관 범위 — 단계·상태 거르기는 목록에만) · 목표 대비(렌즈 '전체'면 목표 있는 정책 모두, 정책 렌즈면 그 정책 — HOME 정책 진행, 정책 전체) */
  const questions = questionsOf(rows, f, { pp, policies: idx.policies, observedMonth: idx.observedMonth, sidoName: (c) => sidoName(molit, c) ?? c, sggName: (c) => sggLabel(idx.sggNames[c] ?? c, undefined, true) });
  const pipe = pipelineOf(scope);
  const lensRows = scopeOf(rows, { policy: f.policy, program: f.program });
  const lensSidos = [...new Set(lensRows.map(sidoOf))].sort().map((c) => sidoName(molit, c) ?? c).join('·');
  const lensRev = summaryOf(lensRows);
  const badges = lens ? (
    <span className="flex items-center gap-1.5">
      <Badge title={`범위: 이 정책·프로그램에 연결된 사업은 ${lensSidos}에만 있음${lensRev.review ? ` · 담당자가 아직 확정하지 않은 제안 연결 ${lensRev.review}건 포함(연결 확정 ${lensRev.confirmed}건) · 해제된 연결은 빠짐` : ''}`}>{lensSidos}</Badge>
    </span>
  ) : null;
  const lines = f.program ? [] : compareLines(pp, idx.policies, rows, f.policy ? [f.policy.key] : idx.policies.map((p) => p.key));
  const listOnly = f.stage !== undefined || !!f.status;
  const lensText = [lens, f.agency && AGENCY_NAME[f.agency]].filter(Boolean).join(' · ');
  /* 범위가 다른 두 숫자 묶음은 카드를 나누고 머리에 범위 칩을 단다: 정책 목표 대비(정책 전체 · 정책 진행 자료 — 거르기와 상관없음) | 원장 요약(거르기 범위 · 사업 원장) */
  const [whole, scoped] = questions[0]?.stages ? [questions[0], questions.slice(1)] : [null, questions];
  const scopeLine = (
    <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <ScopeChip scope={region} source="사업 원장" title={`핵심 질문·단계별 진행의 범위: 사업 원장 · ${[region, lensText].filter(Boolean).join(' · ')}(위 거르기에 따라 바뀜)`} />
      {lensText ? <span className="tabular-nums text-foreground">{lensText}</span> : null}
      <span className={cn(listOnly && 'font-bold text-foreground')} title="핵심 질문·단계별 진행은 정책·지역·기관 거르기를 따르고, 단계·상태 거르기는 아래 목록에만 적용">단계·상태 거르기는 목록에만</span>
      <span className="ml-auto"><ReadHelp /></span>
    </div>
  );
  /* 정책 목표 대비: 첫 칸(그 정책의 ①~⑥)과 같은 정책 행은 접힘에서 뺀다 — 한 정책 행이 두 번 나오지 않게(다른 정책 줄만 접힘에 남는다) */
  const cmpLines = whole?.stages ? lines.filter((l) => l.policy.key !== (f.policy ? f.policy.key : '97')) : lines;
  const policyCard = whole || cmpLines.length ? (
    <Card render={<section aria-label="정책 목표 대비" />} className="min-w-0 print:break-inside-avoid">
      <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <ScopeChip scope="정책 전체" source="정책 진행 자료" title={`정책 전체 숫자(호) — 정책에 연결된 사업 전체(세 정책 모두 수도권 정책) · ${HOME_TIP} · 위 지역·기관·단계·상태 거르기와 상관없음`} />
        {whole ? <span title="같은 해 1월~기준 달 누적 · 확인 / 목표(호)">{ymText(whole.stages![0].from)}~{ymText(whole.stages![0].through)} · 확인 / 목표</span> : null}
      </div>
      {whole ? <Questions list={[whole]} /> : null}
      <PolicyCompare lines={cmpLines} title={f.policy ? `${policyLabel(f.policy)} 목표 대비` : '다른 정책 목표 대비'} open={print} href={(key) => at({ policy: key })} />
    </Card>
  ) : null;
  const ledgerCard = (
    <Card render={<section aria-label="요약" />} className="min-w-0 print:break-inside-avoid">
      {scopeLine}
      <Questions list={scoped} />
      <div className="mt-5">
        <Pipeline open={pipe.open} total={pipe.total} on={f.stage} badges={badges} href={(i) => at({ stage: f.stage === i ? undefined : String(i) })} />
      </div>
      <PrintDefs />
    </Card>
  );
  /* 두 카드는 위아래로(2026-10-16 3차 평가: 나란히 두면 정책 카드가 원장 카드보다 짧아 아래가 165px·인쇄 보기 414px 비었다 — 정책 카드는 단계 여섯 칸을 가로로 편다) */
  const summary = policyCard ? <>{policyCard}{ledgerCard}</> : ledgerCard;

  /* 월간 보고: 점검 필요 사업(10줄 이하면 전부, 넘으면 상위 10) · 기준일·출처 */
  const prioAll = priorityOf(scope, Infinity), top = prioAll.slice(0, 10);
  const prioN = prioAll.reduce((n, r) => n + r.count, 0);
  const prioTitle = prioAll.length > 10 ? `점검 필요 ${fmt(prioN)}건 중 상위 10` : `점검 필요 ${fmt(prioN)}건 전부`;
  const prioCols: Col[] = [{ key: 'name', label: '사업', kind: 'text' }, { key: 'sgg', label: '시군구', kind: 'text' }, { key: 'agency', label: '기관', kind: 'text' }, { key: 'stage', label: '단계', kind: 'text' },
    { key: 'units', label: '계획 호수' }, { key: 'ev', label: PLAN_COL, kind: 'text' }, { key: 'late', label: '지연(개월)' }, { key: 'status', label: '상태', kind: 'text' }];
  const prioRows: Row[] = top.map((r) => ({ id: r.id, c: { name: r.count > 1 ? { text: `${r.name} (${r.count}건 합침)`, title: `같은 시군구·같은 이름의 사업 ${r.count}건(한 단지의 동·공구가 따로 잡힌 기록)을 한 줄로 — 호수는 합, 지연은 가장 큰 값` } : r.name, sgg: sggLabel(r.sggName, sidoName(molit, sidoOf(r))), agency: agencyCell(r), stage: stagePill(r), units: unitsCell(r), ev: nextCell(r), late: lateCell(r), status: statusCell(r) } }));
  const prio = dropBlank(prioCols, prioRows);
  const report = (
    <>
      <Card render={<section aria-label="우선 점검 사업" />} className={cn('print:break-inside-avoid print:shadow-none', !print && 'hidden print:block')}>
        <PanelHead title={prioTitle} scope={<ScopeChip scope={region} source="사업 원장" title={`우선 점검 사업의 범위: 사업 원장 · ${label}(위 거르기에 따라 바뀜)`} />} tip={`현재 예정일 경과 개월이 큰 사업부터(10줄이 넘으면 상위 10줄) · 같은 시군구·같은 이름의 사업은 한 줄로 합침 · 판정: 주의 1~6개월, 지연 6개월 이상, 장기 지연 ${LONG_DELAY_MONTHS}개월 이상${prio.note}`} />
        {prioRows.length ? <DataGrid label="우선 점검 사업" cols={prio.cols} rows={prioRows} sortable={false} /> : <p className={cn(sub, 'm-0')}>예정일이 지난 사업이 없습니다</p>}
      </Card>
      <p className={cn('m-0 text-sm text-muted-foreground', !print && 'hidden print:block')}>
        범위 {label}({fmt(scope.length)}건) · 자료 기준: 사업 원장 {ref} · <span title={HOME_TIP}>정책 진행 자료</span> {editionText(pp.source.edition)} · 정책 목표·확인 {ymText(pp.referenceMonthEnd)}까지 · 출처: 사업 원장(건축HUB·LH·마이홈·청약홈·통계누리), <span title={HOME_TIP}>정책 진행 자료</span> · 판정: 현재 예정일 경과 1~6개월 주의, 6개월 이상 지연, {LONG_DELAY_MONTHS}개월 이상 장기 지연 · 9·7 대책 확인은 담당자 추정 입력을 뺀 값(담당자 추정 포함은 따로)
      </p>
    </>
  );
  const reportHead = (
    <header className={cn('pt-4 print:pt-0', !print && 'hidden print:block')}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="m-0 text-h1 leading-title font-bold">월간 주택공급 보고</h1>
        <span className="text-sm text-muted-foreground tabular-nums" title={`사업 원장 ${idx.referenceDate.replace(/-/g, '.')} · 9·7 대책 단계 목표·확인은 ${pp.referenceMonthEnd.replace(/-/g, '.')}까지`}>자료 기준 {ref} · 정책 목표 {ymText(pp.referenceMonthEnd)}까지 · {label}</span>
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
  /* 위치 미확보: 지도와 같은 판정(mapLocOf — 번들 블록·동 윤곽이나 지도에 그리는 위치가 없음)인 수도권 사업, 상세 서랍과 같은 값 — 목록 지도 열 표지(지도 열은 수도권 사업만) */
  const noLoc = new Set((await Promise.all(list.filter((r) => r.issued && isMetro(r.sgg)).map(async (r) => { const d = await getProjectDrawer(r.id); return d?.kind === 'detail' && !mapLocOf(d.row, d.detail.loc) ? r.id : null; }))).filter((x): x is string => !!x));
  const gridRows: Row[] = listRows(list, f, sel, (c) => sidoName(molit, c), (id) => noLoc.has(id));
  const grid = dropBlank(LIST_COLS, gridRows);
  /* 시군구 칸은 한 줄(지역 이름이 둘로 접히지 않게 말줄임 열의 두 줄 상자를 쓰지 않는다 — 칸 폭은 글자에 맞는다) */
  const listCols = grid.cols.map((c) => (c.key === 'sgg' ? { key: c.key, label: c.label, kind: c.kind } : c));
  const csvHref = listHref(f).replace(/^\/projects/, '/projects/csv');
  const issued = list.filter((r) => r.issued).length;
  const reset = listHref(f) !== '/projects';
  /* 지도 연결점: 이 목록의 범위로 — 시군구 하나 ?sgg= · 시도 하나(수도권) ?sido= · 수도권(기본) 지도 첫 화면. 수도권 밖·전국이면 숨긴다 */
  const scopeMap = f.sgg || f.sido ? mapScopeHref({ sgg: f.sgg, sido: f.sido }) : f.metro ? mapScopeHref() : null;
  const mapLink = scopeMap ? <MapLink href={scopeMap} full="이 범위를 지도에서 보기">이 범위 지도에서</MapLink> : null;
  /* 빈 결과: 푸는 동작과 가까운 대안(건수가 있는 것만) */
  const alts = !list.length ? [
    ...(f.status || f.stage !== undefined ? [{ label: '상태·단계 거르기 풀기', href: at({ status: undefined, stage: undefined }), n: count(rows, { ...f, status: undefined, stage: undefined }) }] : []),
    ...(f.metro || f.sido || f.sgg ? [{ label: '수도권 전체 보기', href: listHref({ ...f, metro: false, sido: undefined, sgg: undefined }), n: count(rows, { ...f, metro: false, sido: undefined, sgg: undefined }) }] : []),
    ...(f.policy || f.program || f.agency ? [{ label: '정책·기관 거르기 풀기', href: at({ policy: undefined, program: undefined, agency: undefined }), n: count(rows, { ...f, policy: undefined, program: undefined, agency: undefined }) }] : []),
  ].filter((a) => a.n > 0) : [];

  return (
    <Page>
      {list.length ? <SkipToList /> : null}
      <div className="contents print:hidden">
        <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '사업' }]} title="사업"
          tip="사업 원장의 사업을 정책·프로그램과 지역·상태·기관으로 거른다(처음은 수도권) · 행을 누르면 오른쪽에 사업 상세 · 보고서 인쇄 = 월간 진척 보고(2026.08.14 지시)">
          <span className={cn(sub, 'ml-auto whitespace-nowrap tabular-nums mobile:text-sm')} title={`사업 원장 ${ymText(idx.observedMonth)} · 기준일 ${ref}(대체·숨김 사업 제외) · 판정: 현재 예정일 경과 1~6개월 주의, 6개월 이상 지연, ${LONG_DELAY_MONTHS}개월 이상 장기 지연`}>자료 기준 {ref}</span>
          <Link href={listHref(f, { print: '1' })} className={cn(BTN, 'self-center')} title="핵심 질문·단계별 진행·정책 목표 대비·점검 필요 사업·기준일·출처만 담은 월간 보고 보기(인쇄 미리보기)">
            <Printer className="size-4 flex-none text-muted-foreground" aria-hidden="true" />보고서 인쇄
          </Link>
        </PageHead>
      </div>
      {reportHead}

      <ChipBar className="print:hidden min-[901px]:max-[1439px]:gap-x-2">
        <ChipGroup label="정책" bare>
          <Chip href={at({ policy: undefined, program: undefined })} on={!lens}>전체</Chip>
          {idx.policies.map((p) => <Chip key={p.key} href={at({ policy: p.key })} on={f.policy?.key === p.key} title={`${p.name} · ${p.announced.replace(/-/g, '.')} 발표 · ${p.scope}`}>{policyLabel(p)}</Chip>)}
          <ChipMenu label="프로그램" on={!!f.program} items={idx.programs.map((p) => ({ href: at({ program: p.name }), label: p.name, on: f.program?.name === p.name, title: `${idx.policies.filter((x) => p.policies.includes(x.key)).map(policyLabel).join('·')} · 사업 ${p.projects}건` }))} />
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="지역" bare>
          <Chip href={at({ sido: 'metro' })} on={!!f.metro} title="서울·인천·경기(처음 열 때 범위)">수도권</Chip>
          <ChipMenu label="시도" on={!!(f.sido || f.sgg)} cols={2}
            items={sidos.map((c) => ({ href: at({ sido: c }), label: sidoName(molit, c)!, on: (f.sido ?? f.sgg?.slice(0, 2)) === c }))} />
          {f.sgg ? <ClearChip href={at({ sgg: undefined })} title="시군구 거르기 풀기(수도권으로)">{sggLabel(sggFullName(f.sgg, idx.sggNames), sidoName(molit, f.sgg.slice(0, 2)))}</ClearChip> : null}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="상태" bare>
          <Chip href={at({ status: f.status === 'check' ? undefined : 'check' })} on={f.status === 'check'} title="주의·지연·장기 지연 사업만(지연 개월 큰 순)">점검 필요</Chip>
          <ChipMenu label="상태" on={!!f.status && f.status !== 'check'}
            items={[{ href: at({ status: undefined }), label: '전체', on: false }, ...STATUS_ORDER.map((k) => ({ href: at({ status: k }), label: k === 'long' ? `장기 지연 ${LONG_DELAY_MONTHS}개월+` : STATUS_RANGE[k], on: f.status === k, title: STATUS_TIP[k] })),
              { href: at({ status: 'late' }), label: DELAY_GROUP, on: f.status === 'late', title: '지연 6~12개월 + 장기 지연(사업 번호가 있는 사업 — 종합상황판 지연 카드와 같은 범위)' },
              { href: at({ status: 'review-late' }), label: REVIEW_LATE, on: f.status === 'review-late', title: '사업 번호가 없는 후보 중 원천 예정일로 계산하면 지연(경과 6개월 이상)인 사업 — 종합상황판 \'후보 계산\'과 같은 범위(판정 지연에 넣지 않음)' }]} />
          <InfoTip label="상태 칩"><p>{STATUS_RANGE.review} · {REVIEW_LATE}(종합상황판 &apos;후보 계산&apos;) = {REVIEW_LATE_DEF}입니다. 판정 지연에는 넣지 않습니다.</p></InfoTip>
          {f.stage !== undefined ? <ClearChip href={at({ stage: undefined })} title="단계 거르기 풀기(단계는 아래 단계별 진행 칸으로 고른다)"><SwatchDot color={BOARD_COLOR[f.stage]} />{`${BOARD_CIR[f.stage]} ${BOARD_NAMES[f.stage]}`}</ClearChip> : null}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="기관" bare>
          <ChipMenu label="기관" on={!!f.agency} items={[{ href: at({ agency: undefined }), label: '전체', on: false }, ...Object.entries(AGENCY_NAME).map(([k, n]) => ({ href: at({ agency: k }), label: n, on: f.agency === k, title: AGENCY_TIP[k] }))]} />
        </ChipGroup>
        {reset ? <><ChipSep /><Chip href="/projects" title="모든 거르기를 풀고 처음 화면(수도권 · 점검 필요 순)으로">모두 풀기</Chip></> : null}
      </ChipBar>

      {summary}
      {report}

      <Card render={<section id="projects-list" aria-label="사업 목록" />} className="scroll-mt-4 print:hidden">
        <PanelHead title={<>{listLabel ? `사업 목록 · ${listLabel}` : '사업 목록'}<span className="ml-2 font-sans text-sm font-normal text-muted-foreground tabular-nums" title={`사업마다 원장의 첫 물량 합 · 호수 미확인 ${fmt(s.noUnits)}건은 0`}>{fmt(s.n)}건 · 계획 {fmt(s.units)}호</span></>}
          scope={<ScopeChip scope={region} source="사업 원장" title={`사업 목록의 범위: 사업 원장 · ${label}(위 거르기에 따라 바뀜)`} />}
          tip={`기본 순서 = 점검 필요 순(지연 개월 큰 순)${grid.note}`}>
          <InfoTip label="목록 읽는 법">
            <dl>
              <dt>계획 호수</dt><dd>머리의 &apos;계획 n호&apos; = 사업마다 원장의 첫 물량을 더한 값(호수 미확인 {fmt(s.noUnits)}건은 0)</dd>
              <dt>기본 순서</dt><dd>점검 필요 순 — 예정일을 오래 넘긴 사업부터 · {CAND_NAME}은 번호가 있는 사업 뒤에(열 머리를 누르면 그 순서로)</dd>
              <dt>{PLAN_COL}</dt><dd>지금 잡혀 있는 다음 예정일 · 이미 지난 날짜는 옅게(넘긴 개월은 지연 열), 기준일보다 앞섰지만 1개월이 안 된 날짜는 &apos;{PAST_DUE}&apos;(상태는 그대로), 공사를 마친 사업은 &apos;실제&apos; · &apos;{DATE_ALT}&apos; = 준공 예정이 사업 원장(HOME)과 LH 준공 예정 파일에서 다름(판정은 사업 원장 날짜)</dd>
              <dt>상태</dt><dd>{STATUS_NAME.ok} · {STATUS_NAME.caution} · {STATUS_NAME.delay} · {STATUS_NAME.long}(사업 번호가 있는 사업만) · {STATUS_NAME.review}({CAND_NAME} — 같은 계산이지만 판정에 넣지 않음) · {STATUS_NAME.none}({NONE_NAME.done} · {NONE_NAME.plan} — 입주·모집 예정만 · {NONE_NAME.none})</dd>
              <dt>지연(개월)</dt><dd>예정일을 넘긴 개월 수 · {STATUS_RANGE.caution} · {STATUS_RANGE.delay} · {STATUS_RANGE.long}({DELAY_GROUP} = 6개월 이상) · {CAND_NAME}은 옅게</dd>
              <dt>공고 확인</dt><dd>모집공고에서 확인한 호수(공고가 났다고 공사를 마친 것은 아님)</dd>
              <dt>{CAND_NAME}</dt><dd>사업 번호가 아직 없어 상세 일정이 없는 사업 — 누르면 간단 보기</dd>
              <dt>{REVIEW_LATE}</dt><dd>{REVIEW_LATE_DEF} — 지연(6개월 이상)이면 이 묶음(판정 지연에 넣지 않음, 종합상황판 &apos;후보 계산&apos;과 같은 범위)</dd>
              <dt>{SGG_MAP}</dt><dd>지도 열 표지 — {CAND_NAME}은 지도 자료에 위치가 없어 그 시군구 지도로 감(수도권 밖은 빈칸)</dd>
              <dt>{NO_LOC}</dt><dd>지도 열 표지 — 지도에 그릴 위치(블록·동 윤곽·대표점)가 없어 지도에서는 시군구로 보이는 사업(지도의 &apos;위치 미확보&apos;와 같은 사업)</dd>
            </dl>
          </InfoTip>
          {list.length ? <a href={csvHref} download className={MAPA} title={`지금 거르기 그대로 ${fmt(list.length)}건 · 화면과 같은 열(지도 표지 제외) · CSV(UTF-8, 엑셀에서 열림)`}><Download className="size-3.5" aria-hidden="true" />CSV 내려받기</a> : null}
          {mapLink}
          <SrcLink />
        </PanelHead>
        {list.length ? (
          <>
            <p className={cn(sub, 'm-0 mb-1')} title={`행을 누르면 사업 상세${list.length > issued ? ` · ${CAND_NAME}은 간단 보기(번호가 있는 사업 뒤)` : ''}`}>점검 필요 순{list.length > issued ? ` · ${CAND_NAME} ${fmt(list.length - issued)}건 뒤쪽` : ''}
              {/* ③착공 목록은 종합상황판 '진척 관리' 착공(통계누리 누계)에서 오는 목록 — 숫자 차이를 툴팁이 아닌 보이는 글로(2026-10-15 평가) */}
              {f.stage === 2 ? <InfoTip label="착공 목록 범위" className="align-middle"><p data-slot="start-basis">목록은 사업 원장 기준(통계누리 착공 통계와 범위 다름) — 종합상황판 &apos;진척 관리&apos;의 착공 호수는 통계누리 주택건설실적(수도권 착공 누계)이고, 이 목록은 사업 원장에서 지금 ③착공 단계인 사업이라 건수·호수가 다릅니다</p></InfoTip> : null}</p>
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

      {cand ? (
        <Drawer id={cand.row.id} canonical={null} closeHref={listHref(f)} title={cand.row.name} head={<CandidateHead row={cand.row} />}>
          <Candidate row={cand.row} sggName={sggLabel(cand.row.sggName, sidoName(molit, sidoOf(cand.row)))} sources={cand.sources} stageHref={stageHref} />
        </Drawer>
      ) : (
        <Drawer id={drawer ? id : null} canonical={sel} closeHref={listHref(f)} title={drawer ? (drawer.kind === 'detail' ? drawer.label ?? drawer.row.name : drawer.project.name) : null} head={drawer ? <DrawerHead d={drawer} /> : null}
          back={f.from === 'map' && sel ? { href: mapHref({ project: sel }), label: '지도로 돌아가기', title: '지도에서 이 사업 위치로 돌아가기' } : null}>
          {drawer ? <ProjectDetail d={drawer} stageHref={stageHref} /> : null}
        </Drawer>
      )}
    </Page>
  );
}
