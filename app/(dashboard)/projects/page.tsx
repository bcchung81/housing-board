import type { Metadata } from 'next';
import StageLadder from '../../../components/StageLadder';
import PanelLink from '../../../components/board/PanelLink';
import { Page, PageHead, PanelHead, SrcLink, sub } from '../../../components/page';
import { PolicyStageBars, StateLegend } from '../../../components/projects/PolicyStages';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { Chip, ChipBar, ChipGroup, ChipMenu, ChipSep, ClearChip } from '../../../components/ui/chips';
import { DataGrid } from '../../../components/ui/data-grid';
import { sidoName } from '../../../lib/board/calc';
import { getBoardData } from '../../../lib/board/data';
import { getPolicyProgress, getProjectsIndex } from '../../../lib/board/projects-index';
import { EVENT_NAME, STATUS_NAME, STATUS_TIP, applyFilters, listHref, monthNo, parseFilters, policyStageCells, stageColor, stageCounts, statusOf, summaryOf, ymText, type ProjectRow, type Status } from '../../../lib/board/projects-view';
import { STAGES, stageName } from '../../../lib/board/stages';
import type { Cell, Col, Row } from '../../../lib/grid/spec';
import { cn } from 'cn';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* 거르기: 렌즈 ?policy=97|129|813 또는 ?program=이름(하나만) · 지역 ?sido=NN·?sgg=NNNNN · 단계 ?stage=01~06 · 상태 ?status=ok|caution|delay|none.
   2026-10-10 단계별 메뉴(/stage/NN)와 시군구 상세(/area/{시군구5})를 이 화면의 거르기로 합쳤다(옛 주소는 next.config.ts 가 넘긴다). 맞지 않는 값은 거르지 않는다. */
async function load(searchParams: Props['searchParams']) {
  const [q, { molit }, idx] = await Promise.all([searchParams, getBoardData(), getProjectsIndex()]);
  const f = parseFilters(q, { policies: idx.policies, programs: idx.programs, sidoOk: (c) => !!sidoName(molit, c) });
  const lens = f.policy ? f.policy.short : f.program?.name;
  const region = f.sgg ? sggLabel(idx.sggNames[f.sgg] ?? f.sgg, sidoName(molit, f.sgg.slice(0, 2))) : f.sido ? sidoName(molit, f.sido) : undefined;
  const stage = STAGES.find((s) => s.code === f.stage);
  const label = [lens, region, stage && `${stage.code} ${stage.name}`, f.status && STATUS_NAME[f.status]].filter(Boolean).join(' · ');
  return { f, idx, molit, label, lens };
}
/* '경기도 고양시 일산동구' → '경기 고양시 일산동구'(표가 전국이라 시도를 붙이되 짧게) */
const sggLabel = (name: string, sido?: string) => { const t = name.split(' '); return sido && t.length > 1 ? `${sido} ${t.slice(1).join(' ')}` : name; };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { label } = await load(searchParams);
  return { title: label ? `${label} 사업` : '사업' };
}

/* 상태 칸: 정상·주의는 색 면, 지연은 빨간 테두리, 일정 미확보는 빗금 */
const STATUS_CELL: Record<Status, (r: ProjectRow) => Cell> = {
  ok: () => ({ text: STATUS_NAME.ok, swatch: 'var(--ok)', sort: 3, title: STATUS_TIP.ok }),
  caution: () => ({ text: STATUS_NAME.caution, swatch: 'var(--warn)', sort: 1, title: STATUS_TIP.caution }),
  delay: () => ({ text: STATUS_NAME.delay, swatch: 'var(--bad)', mark: 'outline', tone: 'bad', sort: 0, title: STATUS_TIP.delay }),
  none: (r) => ({ text: STATUS_NAME.none, mark: 'hatch', muted: true, sort: 2, title: `${STATUS_TIP.none}${r.why ? ` — ${r.why === 'LH 후보' ? 'LH 후보(판정 대상 아님)' : r.why}` : ''}` }),
};
/* 다음 일정: 지난 예정(주의·지연)은 경과 개월과 색, 아니면 다음 현재 예정, 끝난 사업은 실제 준공 달 */
function nextCell(r: ProjectRow): Cell {
  if (r.overdue && (r.cls === 'delay' || r.cls === 'caution')) {
    const o = r.overdue;
    return { text: `${ymText(o.planned)} ${EVENT_NAME[o.eventType]} +${o.months}개월`, tone: r.cls === 'delay' ? 'bad' : 'warn', sort: monthNo(o.planned), title: `현재 예정일 경과 ${o.months}개월 — ${STATUS_NAME[r.cls]}` };
  }
  if (r.next) return { text: `${ymText(r.next.planned)} ${EVENT_NAME[r.next.eventType]}`, sort: monthNo(r.next.planned), title: '현재 예정' };
  if (r.done) return { text: `${ymText(r.done)} 준공`, muted: true, sort: monthNo(r.done), title: '실제 준공' };
  return null;
}

/* 사업(L2 목록): 사업 원장의 살아 있는 사업 전부(대체·숨김 제외). 렌즈(정책·프로그램)·지역·단계·상태 칩으로 거르고, 요약 카드는 렌즈마다 오른쪽이 바뀐다:
   렌즈 없음 → 단계별 사업 수(계단), 9·7 → 6단계 목표 대비 확인(policy-progress samePeriod), 비교 자료가 없는 정책·프로그램 → 단계별 사업 수 + '비교 자료 없음'.
   행은 발급 사업만 상세로 연다(발급 전 후보의 id 는 다음 원장에서 바뀔 수 있는 임시 번호라 링크하지 않는다 — 지도 카드와 같은 규칙). */
export default async function ProjectsPage({ searchParams }: Props) {
  const { f, idx, molit, label, lens } = await load(searchParams);
  const pp = await getPolicyProgress();
  const rows = idx.rows;
  const list = applyFilters(rows, f);
  const lensRows = applyFilters(rows, { policy: f.policy, program: f.program });
  const s = summaryOf(list);
  const cells = f.policy ? policyStageCells(pp, f.policy.id) : null;
  const sidoOf = (r: ProjectRow) => r.sgg.slice(0, 2);
  const sidos = [...new Set(rows.map(sidoOf))].filter((c) => sidoName(molit, c)).sort();
  const scope = [...new Set(lensRows.map(sidoOf))].sort().map((c) => sidoName(molit, c) ?? c);
  const lensRev = summaryOf(lensRows);
  const lensTitle = f.policy ? f.policy.name : f.program ? `프로그램 ${f.program.name}` : '';
  const ref = idx.referenceDate.replace(/-/g, '.');
  const at = (p: Parameters<typeof listHref>[1]) => listHref(f, p);

  const cols: Col[] = [{ key: 'name', label: '사업', kind: 'text', wrap: true }, { key: 'sgg', label: '시군구', kind: 'text' }, { key: 'prog', label: '프로그램', kind: 'text' }, { key: 'stage', label: '단계', kind: 'text' },
    { key: 'units', label: '계획 호수' }, { key: 'notice', label: '공고 확인' }, { key: 'next', label: '다음 일정', kind: 'text' }, { key: 'status', label: '상태', kind: 'text' }];
  const gridRows: Row[] = list.map((r) => ({
    id: r.id,
    c: {
      name: r.issued ? { text: r.name, href: `/project/${r.id}` } : { text: r.name, title: `발급 전 후보(임시 번호 ${r.id}) — 사업 상세 없음` },
      sgg: { text: sggLabel(r.sggName, sidoName(molit, sidoOf(r))), href: at({ sgg: r.sgg }) },
      prog: r.programs.length ? { text: r.programs.join(' · '), title: r.link === 'CONFIRMED' ? '정책 연결 확정' : '정책 연결 검토 중(담당자 확인 전 제안)' } : null,
      stage: { text: `${r.stage} ${stageName(r.stage)}`, swatch: stageColor(r.stage) },
      units: r.units > 0 ? r.units : { na: '미확인' },
      notice: r.notice,
      next: nextCell(r),
      status: STATUS_CELL[statusOf(r)](r),
    },
  }));

  const Kpi = ({ label: l, value, unit = '호', sub: sb, tone, tip }: { label: string; value: string; unit?: string; sub?: string; tone?: string; tip?: string }) => (
    <div className="@container flex min-w-0 flex-col gap-1 py-3 first:pt-0 last:pb-0" title={tip}>
      <span className="flex min-w-0 items-center gap-1.5 truncate text-[14px] text-muted-foreground"><i className="block size-[9px] flex-none rounded-[3px] bg-line2" style={tone ? { background: tone } : undefined} aria-hidden="true" />{l}</span>
      <b className="font-display text-[min(30px,15cqi)] leading-[1.2] font-normal whitespace-nowrap tabular-nums">{value}<small className="ml-[3px] font-sans text-[14px] font-normal text-muted-foreground">{unit}</small></b>
      {sb ? <span className="text-[13px] text-muted-foreground tabular-nums">{sb}</span> : null}
    </div>
  );
  const fmt = (n: number) => n.toLocaleString('en-US');
  const third = lens && s.notice > 0
    ? <Kpi label="공고 확인" value={fmt(s.notice)} tone="var(--st-sale)" sub={s.noticeRatio !== null ? `계획의 ${s.noticeRatio.toFixed(1)}% · ${s.noticeProjects}건` : undefined} tip="모집공고에서 확인한 호수(공고 확인 ≠ 준공) · 비율은 공고 확인 ÷ 계획 호수이며 착공·준공 달성률이 아닙니다" />
    : <Kpi label="지연" value={fmt(s.delay)} unit="건" tone="var(--bad)" tip="현재 예정일 경과 6개월 이상" />;
  const ladder = (
    <StageLadder className="mt-1" current={f.stage} counts={stageCounts(applyFilters(rows, f, 'stage'))}
      href={(code) => at({ stage: code === f.stage ? undefined : code })} />
  );

  return (
    <Page>
      <PageHead crumbs={label ? [{ label: '종합상황판', href: '/' }, { label: '사업', href: '/projects' }, { label }] : [{ label: '종합상황판', href: '/' }, { label: '사업' }]}
        title="사업" tip="사업 원장의 사업을 정책·프로그램 렌즈와 지역·단계·상태로 거릅니다. 발급 사업은 행을 누르면 사업 상세"
        meta={`원장 ${ref}`} metaTip={`사업 원장 ${idx.observedMonth} · 기준일 ${idx.referenceDate}(대체·숨김 사업 제외) · 판정: 현재 예정일 경과 1~6개월 주의, 6개월 이상 지연`} />

      <ChipBar>
        <ChipGroup label="렌즈">
          <Chip href={at({ policy: undefined, program: undefined })} on={!lens}>전체</Chip>
          {idx.policies.map((p) => <Chip key={p.key} href={at({ policy: p.key })} on={f.policy?.key === p.key} title={`${p.name} · ${p.announced.replace(/-/g, '.')} 발표`}>{p.short}</Chip>)}
          <ChipMenu label="프로그램" on={!!f.program} items={idx.programs.map((p) => ({ href: at({ program: p.name }), label: p.name, on: f.program?.name === p.name, title: `${idx.policies.filter((x) => p.policies.includes(x.key)).map((x) => x.short).join('·')} · 사업 ${p.projects}건` }))} />
          {lens ? (
            <span className="ml-1.5 flex items-center gap-1.5">
              <Badge title={`범위: ${f.policy?.scope ?? '정책 연결 범위'} — 이 렌즈에 연결된 사업은 ${scope.join('·')}에만 있습니다`}>{scope.join('·')}</Badge>
              {lensRev.review ? <Badge title={`담당자 확인 전 제안 연결 ${lensRev.review}건 포함(확정 ${lensRev.confirmed}건) · 해제된 연결은 제외`}>검토 중 연결</Badge> : null}
            </span>
          ) : null}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="지역">
          <ChipMenu label="시도" on={!!(f.sido || f.sgg)} cols={2}
            items={[{ href: at({ sido: undefined }), label: '전체', on: false }, ...sidos.map((c) => ({ href: at({ sido: c }), label: sidoName(molit, c)!, on: (f.sido ?? f.sgg?.slice(0, 2)) === c }))]} />
          {f.sgg ? <ClearChip href={at({ sgg: undefined })} title="시군구 거르기 풀기">{sggLabel(idx.sggNames[f.sgg] ?? f.sgg, sidoName(molit, f.sgg.slice(0, 2)))}</ClearChip> : null}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="단계">
          {STAGES.map((st) => <Chip key={st.code} href={at({ stage: f.stage === st.code ? undefined : st.code })} on={f.stage === st.code} title={`${st.code} ${st.name} — ${st.q}`} swatch={{ kind: 'fill', color: stageColor(st.code) }}>{st.code} {st.name}</Chip>)}
        </ChipGroup>
        <ChipSep />
        <ChipGroup label="상태">
          {(['ok', 'caution', 'delay', 'none'] as Status[]).map((k) => (
            <Chip key={k} href={at({ status: f.status === k ? undefined : k })} on={f.status === k} title={STATUS_TIP[k]}
              swatch={k === 'delay' ? { kind: 'outline', color: 'var(--bad)' } : k === 'none' ? { kind: 'hatch' } : { kind: 'fill', color: k === 'ok' ? 'var(--ok)' : 'var(--warn)' }}>{STATUS_NAME[k]}</Chip>
          ))}
        </ChipGroup>
      </ChipBar>

      <Card render={<section aria-label="요약" />}>
        <div className="grid grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-x-10 gap-y-5 narrow:grid-cols-1">
          <div className="flex flex-col divide-y divide-border">
            <Kpi label="사업" value={fmt(s.n)} unit="건" tip={lens ? `${lensTitle}에 연결된 사업(검토 중 연결 포함)` : `사업 원장의 사업(발급 ${rows.filter((r) => r.issued).length}건 · 발급 전 후보 ${rows.filter((r) => !r.issued).length}건)`} />
            <Kpi label="계획 호수" value={fmt(s.units)} tip="사업마다 원장의 첫 물량(공공 공급계획 → 인허가 → 공고 → 사업계획) 합 · 호수 미확인 사업은 0" />
            {third}
          </div>
          <div className="min-w-0">
            {cells ? <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="m-0 text-[16px] font-normal text-muted-foreground" title={`${f.policy!.name} · 같은 해 1월~기준 달 누적 · 목표 = 연결 사업 원천의 같은 단계 예정 물량(착공은 원문 연도별 목표), 확인 = 같은 범위 단계 도달량(검토 중 연결 포함) · HOME 계산(판 ${pp.source.edition})`}>6단계 목표 대비 확인</h3>
                <span className={cn(sub, 'tabular-nums')}>{`${cells[0].from.slice(0, 7).replace('-', '.')}~${pp.referenceMonthEnd.slice(5, 7)}`}</span>
                <div className="ml-auto"><StateLegend /></div>
              </div>
              <PolicyStageBars cells={cells} />
            </> : <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="m-0 text-[16px] font-normal text-muted-foreground" title="지금 단계별 사업 수 · 칸을 누르면 그 단계만 거름(다시 누르면 풀림)">단계별 사업 수</h3>
                {lens ? <Badge title={`단계 목표 계산은 9·7 정책 전체 범위만 있습니다(HOME policy_delivery) — ${lensTitle}는 비교할 목표 자료가 없습니다`}>비교 자료 없음</Badge> : null}
              </div>
              {ladder}
            </>}
          </div>
        </div>
      </Card>

      <Card render={<section aria-label="사업 목록" />}>
        <PanelHead title={label ? `사업 목록 · ${label}` : '사업 목록'} tip="발급 사업은 이름을 누르면 사업 상세 · 시군구를 누르면 그 시군구로 거름 · 상태: 지연 = 현재 예정일 경과 6개월 이상, 주의 = 1~6개월">
          <PanelLink href={f.sgg ? `/map?sgg=${f.sgg}` : '/map'} full="지도에서 보기">지도</PanelLink>
          {label ? <PanelLink href="/projects" full="거르기를 모두 풀고 전체 보기">전체 보기</PanelLink> : null}
          <SrcLink />
        </PanelHead>
        {list.length ? <DataGrid label="사업 목록" maxHeight={640} cols={cols} rows={gridRows} />
          : <p className={cn(sub, 'm-0')}>이 조건의 사업이 없습니다</p>}
      </Card>
    </Page>
  );
}

