import type { Metadata } from 'next';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import ReqTags from '../../../components/ReqTags';
import PanelLink from '../../../components/board/PanelLink';
import { Page, PageHead, PanelHead, SrcLink, sub } from '../../../components/page';
import Drawer from '../../../components/projects/Drawer';
import PrintButton from '../../../components/projects/PrintButton';
import ProjectDetail, { DrawerHead } from '../../../components/projects/ProjectDetail';
import { Pipeline, PolicyCompare, Questions } from '../../../components/projects/Summary';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Chip, ChipBar, ChipGroup, ChipMenu, ChipSep, ClearChip, type Swatch } from '../../../components/ui/chips';
import { DataGrid } from '../../../components/ui/data-grid';
import { sidoName } from '../../../lib/board/calc';
import { getBoardData } from '../../../lib/board/data';
import { getPolicyProgress, getProjectDrawer, getProjectsIndex } from '../../../lib/board/projects-index';
import {
  AGENCY_NAME, AGENCY_TIP, BOARD_CIR, BOARD_COLOR, BOARD_INK, BOARD_NAMES, BOARD_OFFICIAL, EVENT_NAME, LONG_DELAY_MONTHS, STATUS_NAME, STATUS_ORDER, STATUS_TIP,
  agencyKey, applyFilters, compareLines, lateOf, listHref, listOrder, monthNo, parseFilters, pipelineOf, priorityOf, questionsOf, scopeOf, statusOf, summaryOf, ymText,
  type ProjectRow, type Status,
} from '../../../lib/board/projects-view';
import type { Cell, Col, Row } from '../../../lib/grid/spec';
import { cn } from 'cn';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/* 거르기: 렌즈 ?policy=97|129|813 또는 ?program=이름(하나만) · 지역 ?sido=NN·?sgg=NNNNN · 단계 ?stage=0~5(리본 칸, 옛 01~06 도 받는다) · 상태 ?status=ok|caution|delay|long|none|check · 기관 ?agency=lh|sh|gh|etc.
   서랍 ?id=PRJ-… · 월간 보고 보기 ?print=1. 맞지 않는 값은 거르지 않는다. */
async function load(searchParams: Props['searchParams']) {
  const [q, { molit }, idx] = await Promise.all([searchParams, getBoardData(), getProjectsIndex()]);
  const f = parseFilters(q, { policies: idx.policies, programs: idx.programs, sidoOk: (c) => !!sidoName(molit, c) });
  const lens = f.policy ? f.policy.short : f.program?.name;
  const region = f.sgg ? sggLabel(idx.sggNames[f.sgg] ?? f.sgg, sidoName(molit, f.sgg.slice(0, 2))) : f.sido ? sidoName(molit, f.sido) : undefined;
  const label = [lens, region, f.stage !== undefined && `${BOARD_CIR[f.stage]} ${BOARD_NAMES[f.stage]}`, f.status && (f.status === 'check' ? '점검 필요' : STATUS_NAME[f.status]), f.agency && AGENCY_NAME[f.agency]].filter(Boolean).join(' · ');
  return { f, idx, molit, label, lens, id: one(q.id) ?? null, print: one(q.print) === '1' };
}
/* '경기도 고양시 일산동구' → '경기 고양시 일산동구'(표가 전국이라 시도를 붙이되 짧게), drop 이면 시도를 뺀다 */
const sggLabel = (name: string, sido?: string, drop = false) => { const t = name.split(' '); return t.length < 2 ? name : drop ? t.slice(1).join(' ') : sido ? `${sido} ${t.slice(1).join(' ')}` : name; };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { label, id, print } = await load(searchParams);
  const d = id && !print ? await getProjectDrawer(id) : null;
  if (d) return { title: d.kind === 'detail' ? d.row.name : d.project.name };
  if (print) return { title: '월간 주택공급 보고' };
  return { title: label ? `${label} 사업` : '사업' };
}

const fmt = (n: number) => n.toLocaleString('en-US');
/* 상태 칸·칩 견본: 정상·주의는 색 면, 지연은 빨간 테두리, 장기 지연은 빨간 면, 일정 없음은 빗금 */
const STATUS_SW: Record<Status, Swatch> = { ok: { kind: 'fill', color: 'var(--ok)' }, caution: { kind: 'fill', color: 'var(--warn)' }, delay: { kind: 'outline', color: 'var(--bad)' }, long: { kind: 'fill', color: 'var(--bad)' }, none: { kind: 'hatch' } };
const STATUS_SORT: Record<Status, number> = { long: 0, delay: 1, caution: 2, none: 3, ok: 4 };
function statusCell(r: ProjectRow): Cell {
  const s = statusOf(r), w = STATUS_SW[s];
  const why = s === 'none' && r.why ? ` — ${r.why === 'LH 후보' ? 'LH 후보(판정 대상 아님)' : r.why}` : '';
  return { text: STATUS_NAME[s], sort: STATUS_SORT[s], title: `${STATUS_TIP[s]}${why}`, ...(w.kind === 'hatch' ? { mark: 'hatch' as const, muted: true } : w.kind === 'outline' ? { swatch: w.color, mark: 'outline' as const, tone: 'bad' as const } : { swatch: w.color, ...(s === 'long' ? { tone: 'bad' as const } : {}) }) };
}
/* 다음 일정: 지난 예정(주의·지연)은 그 달과 색, 아니면 다음 현재 예정, 끝난 사업은 실제 준공 달. 열이 좁아 모집공고는 '모집'(리본 ④와 같은 말) */
const NEXT_NAME: Record<string, string> = { ...EVENT_NAME, SUPPLY_NOTICE: '모집' };
function nextCell(r: ProjectRow): Cell {
  const late = lateOf(r);
  if (late !== null && r.overdue) return { text: `${ymText(r.overdue.planned)} ${NEXT_NAME[r.overdue.eventType]}`, tone: r.cls === 'caution' ? 'warn' : 'bad', sort: monthNo(r.overdue.planned), title: `${EVENT_NAME[r.overdue.eventType]} 현재 예정일 경과 ${r.overdue.months}개월 — ${STATUS_NAME[statusOf(r)]}` };
  if (r.next) return { text: `${ymText(r.next.planned)} ${NEXT_NAME[r.next.eventType]}`, sort: monthNo(r.next.planned), title: `${EVENT_NAME[r.next.eventType]} 현재 예정` };
  if (r.done) return { text: `${ymText(r.done)} 준공`, muted: true, sort: monthNo(r.done), title: '실제 준공' };
  return null;
}
/* 칸마다 title 을 붙이면 2,317행 목록의 화면 자료가 커진다 — 설명은 열 머리(칩·단계 칩 title)에 두고 칸에는 뜻이 다른 것(상태·다음 일정·지연)만 */
const stagePill = (r: ProjectRow): Cell => ({ text: `${BOARD_CIR[r.board]} ${BOARD_NAMES[r.board]}`, sort: r.board, pill: { color: BOARD_COLOR[r.board], ink: BOARD_INK[r.board] } });
const lateCell = (r: ProjectRow): Cell => {
  const late = lateOf(r);
  return late === null ? null : { text: `+${late}`, sort: late, tone: r.cls === 'caution' ? 'warn' : 'bad', strong: r.cls !== 'caution', title: `${EVENT_NAME[r.overdue!.eventType]} 예정 ${ymText(r.overdue!.planned)} 경과` };
};
const agencyCell = (r: ProjectRow): Cell => { const k = agencyKey(r.agency); return k === 'etc' ? { text: AGENCY_NAME[k], muted: true } : AGENCY_NAME[k]; };
const unitsCell = (r: ProjectRow): Cell => (r.units > 0 ? r.units : { na: '미확인' });

/* 의미 없는 열 버리기: 모든 칸이 빈칸(–)이거나 모두 '기타'인 열은 그리지 않고, 뺀 사실은 표 머리의 title 에 한 번만 */
const OPTIONAL: Record<string, string> = { agency: '기관(모두 기타)', notice: '공고 확인(모두 없음)', next: '다음 일정(모두 없음)', late: '지연(개월)(모두 경과 없음)' };
const blank = (v: Cell) => v == null || (typeof v === 'object' && (v.na !== undefined || (v.muted && v.text === AGENCY_NAME.etc)));
function dropBlank(cols: Col[], rows: Row[]) {
  const gone = cols.filter((c) => c.key in OPTIONAL && rows.length > 0 && rows.every((r) => blank(r.c[c.key])));
  return { cols: cols.filter((c) => !gone.includes(c)), note: gone.length ? ` · 이 조건에 값이 없어 뺀 열: ${gone.map((c) => OPTIONAL[c.key]).join(', ')}` : '' };
}

const BTN = 'btn-reset inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line2 bg-card px-3 text-[14px] font-bold whitespace-nowrap text-foreground no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/* 사업(목록·상세 서랍·월간 보고). 2026-10-14 시안(docs/design/home-concept/projects.html) — 칩 한 줄 → 요약(핵심 질문 5 · 단계 파이프라인 · 목표 대비) → 목록.
   목록은 사업 원장의 살아 있는 사업 전부(대체·숨김 제외, 전국). 행을 누르면 오른쪽 서랍에 사업 상세(?id=, 발급 사업만 — 발급 전 후보의 id 는 다음 원장에서 바뀔 수 있는 임시 번호라 열지 않는다).
   보고서 인쇄(?print=1 · @media print): 핵심 질문·파이프라인·목표 대비·우선 점검 상위 10·기준일·출처만(8.14 지시 '매월 진척상황 보고'). 옛 /reports·/project/:id 는 next.config.ts 가 넘긴다. */
export default async function ProjectsPage({ searchParams }: Props) {
  const { f, idx, molit, label, lens, id, print } = await load(searchParams);
  const [pp, drawer] = await Promise.all([getPolicyProgress(), id && !print ? getProjectDrawer(id) : null]);
  const rows = idx.rows;
  const scope = scopeOf(rows, f);
  const base = applyFilters(rows, f, 'stage');
  const list = listOrder(applyFilters(rows, f), f);
  const s = summaryOf(list);
  const at = (p: Parameters<typeof listHref>[1]) => listHref(f, p);
  const sidoOf = (r: ProjectRow) => r.sgg.slice(0, 2);
  const sidos = [...new Set(rows.map(sidoOf))].filter((c) => sidoName(molit, c)).sort();
  const ref = idx.referenceDate.replace(/-/g, '.');
  const sel = drawer ? (drawer.kind === 'detail' ? drawer.row.id : drawer.project.id) : null;

  /* 요약: 핵심 질문(렌즈·지역·기관 범위) · 파이프라인(+ 상태 거르기) · 목표 대비(렌즈 '전체'면 목표 있는 정책 모두, 정책 렌즈면 그 정책) */
  const questions = questionsOf(rows, f, { pp, policies: idx.policies, observedMonth: idx.observedMonth, sidoName: (c) => sidoName(molit, c) ?? c, sggName: (c) => sggLabel(idx.sggNames[c] ?? c, undefined, true) });
  const pipe = pipelineOf(base);
  const lensRows = scopeOf(rows, { policy: f.policy, program: f.program });
  const lensSidos = [...new Set(lensRows.map(sidoOf))].sort().map((c) => sidoName(molit, c) ?? c).join('·');
  const lensRev = summaryOf(lensRows);
  const badges = lens ? (
    <span className="flex items-center gap-1.5">
      <Badge title={`범위: 이 렌즈에 연결된 사업은 ${lensSidos}에만 있음`}>{lensSidos}</Badge>
      {lensRev.review ? <Badge title={`담당자 확인 전 제안 연결 ${lensRev.review}건 포함(확정 ${lensRev.confirmed}건) · 해제된 연결은 빠짐`}>검토 중 연결</Badge> : null}
    </span>
  ) : null;
  const lines = f.program ? [] : compareLines(pp, idx.policies, rows, f.policy ? [f.policy.key] : idx.policies.map((p) => p.key));
  const summary = (
    <Card render={<section aria-label="요약" />} className="print:break-inside-avoid">
      <Questions list={questions} />
      <div className="mt-5">
        <Pipeline open={pipe.open} shut={pipe.shut} total={pipe.total} on={f.stage} badges={badges} href={(i) => at({ stage: f.stage === i ? undefined : String(i) })} />
      </div>
      <PolicyCompare lines={lines} title={f.policy ? `${f.policy.short} 목표 대비` : '정책별 목표 대비'} href={(key) => at({ policy: key })} />
    </Card>
  );

  /* 월간 보고: 우선 점검 상위 10 · 기준일·출처 */
  const top = priorityOf(scope);
  const prioCols: Col[] = [{ key: 'name', label: '사업', kind: 'text' }, { key: 'sgg', label: '시군구', kind: 'text' }, { key: 'agency', label: '기관', kind: 'text' }, { key: 'stage', label: '단계', kind: 'text' },
    { key: 'units', label: '계획 호수' }, { key: 'ev', label: '지난 예정', kind: 'text' }, { key: 'late', label: '지연(개월)' }, { key: 'status', label: '상태', kind: 'text' }];
  const prioRows: Row[] = top.map((r) => ({ id: r.id, c: { name: r.name, sgg: sggLabel(r.sggName, sidoName(molit, sidoOf(r))), agency: agencyCell(r), stage: stagePill(r), units: unitsCell(r), ev: `${EVENT_NAME[r.overdue!.eventType]} ${ymText(r.overdue!.planned)}`, late: lateCell(r), status: statusCell(r) } }));
  const prio = dropBlank(prioCols, prioRows);
  const report = (
    <>
      <Card render={<section aria-label="우선 점검 사업" />} className={cn('print:break-inside-avoid print:shadow-none', !print && 'hidden print:block')}>
        <PanelHead title="우선 점검 사업 · 상위 10" tip={`현재 예정일 경과 개월이 큰 사업부터 최대 10건 · 판정: 주의 1~6개월, 지연 6개월 이상, 장기 지연 ${LONG_DELAY_MONTHS}개월 이상${prio.note}`} />
        {prioRows.length ? <DataGrid label="우선 점검 사업" cols={prio.cols} rows={prioRows} sortable={false} /> : <p className={cn(sub, 'm-0')}>예정일이 지난 사업이 없습니다</p>}
      </Card>
      <p className={cn('m-0 text-[13px] text-muted-foreground', !print && 'hidden print:block')}>
        범위 {label || '사업 원장 전체'}({fmt(scope.length)}건) · 기준일: 사업 원장 {ref} · HOME 덤프 {pp.source.edition} · 정책 목표·확인 {ymText(pp.referenceMonthEnd)}까지 · 출처: 사업 원장(건축HUB·LH·마이홈·청약홈·통계누리), HOME 덤프, 정책 진행(policy-progress) · 판정: 현재 예정일 경과 1~6개월 주의, 6개월 이상 지연, {LONG_DELAY_MONTHS}개월 이상 장기 지연 · 9·7 확인은 담당자 추정 입력을 뺀 값(추정 포함은 따로)
      </p>
    </>
  );
  const reportHead = (
    <header className={cn('pt-4 print:pt-0', !print && 'hidden print:block')}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h1 className="m-0 font-display text-[28px] leading-[1.2] font-normal tracking-[-0.03em]">월간 주택공급 보고</h1>
        <span className="text-[14px] text-muted-foreground tabular-nums" title={`사업 원장 ${idx.referenceDate} · 9·7 단계 목표·확인은 ${pp.referenceMonthEnd}까지(policy-progress samePeriod)`}>원장 {ref} · 정책 {ymText(pp.referenceMonthEnd)}{label ? ` · ${label}` : ''}</span>
      </div>
    </header>
  );

  if (print) {
    return (
      <Page>
        <div role="toolbar" aria-label="인쇄 미리보기" className="mt-4 flex items-center gap-2 rounded-[12px] border border-border bg-card px-4 py-2 text-[14px] text-muted-foreground print:hidden">
          <span className="mr-auto">인쇄 미리보기 · 월간 보고</span>
          <PrintButton className={BTN} />
          <Link href={listHref(f)} className={BTN}>닫기</Link>
        </div>
        {reportHead}
        {summary}
        {report}
      </Page>
    );
  }

  /* 목록: 1280~1440 폭에서 9열이 다 보이게 사업·시군구는 한 줄 말줄임(전체는 title) */
  const cols: Col[] = [{ key: 'name', label: '사업', kind: 'text', clip: 'clamp(180px, 100vw - 1120px, 380px)' }, { key: 'sgg', label: '시군구', kind: 'text', clip: 'clamp(120px, 100vw - 1180px, 200px)' }, { key: 'agency', label: '기관', kind: 'text' },
    { key: 'stage', label: '단계', kind: 'text' }, { key: 'units', label: '계획 호수' }, { key: 'notice', label: '공고 확인' }, { key: 'next', label: '다음 일정', kind: 'text' }, { key: 'late', label: '지연(개월)' }, { key: 'status', label: '상태', kind: 'text' }];
  const gridRows: Row[] = list.map((r) => {
    const href = r.issued ? listHref(f, { id: r.id }) : undefined;
    return {
      id: r.id, href, sel: r.id === sel,
      c: {
        name: href ? { text: r.name, href } : { text: r.name, title: `발급 전 후보 — 상세 없음 · ${r.name}` },
        sgg: sggLabel(r.sggName, sidoName(molit, sidoOf(r))),
        agency: agencyCell(r), stage: stagePill(r), units: unitsCell(r),
        notice: r.notice, next: nextCell(r), late: lateCell(r), status: statusCell(r),
      },
    };
  });
  const grid = dropBlank(cols, gridRows);
  const statusChip = (k: Status | 'check') => (
    <Chip key={k} href={at({ status: f.status === k ? undefined : k })} on={f.status === k} title={k === 'check' ? '미리 정한 거르기: 주의·지연·장기 지연 사업을 지연 개월이 큰 순으로' : STATUS_TIP[k]} swatch={k === 'check' ? undefined : STATUS_SW[k]}>
      {k === 'check' ? '점검 필요' : STATUS_NAME[k]}
    </Chip>
  );

  return (
    <Page>
      <div className="contents print:hidden">
        <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '사업' }]} title="사업"
          tip="사업 원장의 사업을 정책·프로그램 렌즈와 지역·단계·상태·기관으로 거른다 · 행을 누르면 오른쪽에 사업 상세 · 보고서 인쇄 = 월간 진척 보고(2026.08.14 지시)">
          <ReqTags screen="projects" />
          <span className={cn(sub, 'whitespace-nowrap tabular-nums mobile:text-[13px]')} title={`사업 원장 ${idx.observedMonth} · 기준일 ${idx.referenceDate}(대체·숨김 사업 제외) · 판정: 현재 예정일 경과 1~6개월 주의, 6개월 이상 지연, ${LONG_DELAY_MONTHS}개월 이상 장기 지연`}>원장 {ref}</span>
          <Link href={listHref(f, { print: '1' })} className={cn(BTN, 'self-center')} title="핵심 질문·단계 파이프라인·목표 대비·우선 점검 상위 10·기준일·출처만 담은 월간 보고 보기(인쇄 미리보기)">
            <Printer className="size-4 flex-none text-muted-foreground" aria-hidden="true" />보고서 인쇄
          </Link>
        </PageHead>
      </div>
      {reportHead}

      <ChipBar className="print:hidden">
        <ChipGroup label="렌즈" bare>
          <Chip href={at({ policy: undefined, program: undefined })} on={!lens}>전체</Chip>
          {idx.policies.map((p) => <Chip key={p.key} href={at({ policy: p.key })} on={f.policy?.key === p.key} title={`${p.name} · ${p.announced.replace(/-/g, '.')} 발표 · ${p.scope}`}>{p.short}</Chip>)}
          <ChipMenu label="프로그램" on={!!f.program} items={idx.programs.map((p) => ({ href: at({ program: p.name }), label: p.name, on: f.program?.name === p.name, title: `${idx.policies.filter((x) => p.policies.includes(x.key)).map((x) => x.short).join('·')} · 사업 ${p.projects}건` }))} />
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="지역" bare>
          <ChipMenu label="시도" on={!!(f.sido || f.sgg)} cols={2}
            items={[{ href: at({ sido: undefined }), label: '전체', on: false }, ...sidos.map((c) => ({ href: at({ sido: c }), label: sidoName(molit, c)!, on: (f.sido ?? f.sgg?.slice(0, 2)) === c }))]} />
          {f.sgg ? <ClearChip href={at({ sgg: undefined })} title="시군구 거르기 풀기">{sggLabel(idx.sggNames[f.sgg] ?? f.sgg, sidoName(molit, f.sgg.slice(0, 2)))}</ClearChip> : null}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="단계" bare>
          {BOARD_NAMES.map((n, i) => <Chip key={n} href={at({ stage: f.stage === i ? undefined : String(i) })} on={f.stage === i} title={`${BOARD_CIR[i]} ${n} — 공식 단계 ${BOARD_OFFICIAL[i]}(지금 단계)`} swatch={{ kind: 'fill', color: BOARD_COLOR[i] }}>{BOARD_CIR[i]}{n}</Chip>)}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="상태" bare>
          {statusChip('check')}
          {STATUS_ORDER.map(statusChip)}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="기관" bare>
          <ChipMenu label="기관" on={!!f.agency} items={[{ href: at({ agency: undefined }), label: '전체', on: false }, ...Object.entries(AGENCY_NAME).map(([k, n]) => ({ href: at({ agency: k }), label: n, on: f.agency === k, title: AGENCY_TIP[k] }))]} />
        </ChipGroup>
      </ChipBar>

      {summary}
      {report}

      <Card render={<section aria-label="사업 목록" />} className="print:hidden">
        <PanelHead title={<>{label ? `사업 목록 · ${label}` : '사업 목록'}<span className="ml-2 text-[14px] font-normal text-muted-foreground tabular-nums" title={`사업마다 원장의 첫 물량 합 · 호수 미확인 ${fmt(s.noUnits)}건은 0`}>{fmt(s.n)}건 · 계획 {fmt(s.units)}호</span></>}
          tip={`발급 사업은 행을 누르면 오른쪽에 사업 상세 · 지연(개월) = 현재 예정일 경과 개월(주의 1~6, 지연 6 이상, 장기 지연 12 이상) · 공고 확인 = 모집공고에서 확인한 호수${grid.note}`}>
          <PanelLink href={f.sgg ? `/map?sgg=${f.sgg}` : '/map'} full="지도에서 보기">지도</PanelLink>
          <SrcLink />
        </PanelHead>
        {list.length ? <DataGrid label="사업 목록" maxHeight={640} cols={grid.cols} rows={gridRows} /> : <p className={cn(sub, 'm-0')}>이 조건의 사업이 없습니다</p>}
      </Card>

      <Drawer id={drawer ? id : null} canonical={sel} closeHref={listHref(f)} title={drawer ? (drawer.kind === 'detail' ? drawer.row.name : drawer.project.name) : null} head={drawer ? <DrawerHead d={drawer} /> : null}>
        {drawer ? <ProjectDetail d={drawer} /> : null}
      </Drawer>
    </Page>
  );
}

