import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import PanelLink from '../../../../components/board/PanelLink';
import { ACTOR_COLOR } from '../../../../components/charts/palette';
import { Dash, Page, PageHead, PanelHead, SrcLink, sub } from '../../../../components/page';
import StageKpis from '../../../../components/StageKpis';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { DataGrid } from '../../../../components/ui/data-grid';
import { ACTORS, METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, monthTable, neighborMonths, seriesOf, lhOfMonth, lhUnits, ymDot } from '../../../../lib/board/calc';
import { lh, molit } from '../../../../lib/board/data';
import { METRIC_STAGE } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';
import type { Col } from '../../../../lib/grid/spec';

const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' } as const;
const ACT_KS = ['permit', 'start', 'complete'] as const;
const LH_COLS: Col[] = [{ key: 'district', label: '사업지구', kind: 'text', wrap: true }, { key: 'block', label: '블록', kind: 'text' }, { key: 'type', label: '공급유형', kind: 'text' }, { key: 'units', label: '세대수' }, { key: 'date', label: '준공예정일', kind: 'text' }, { key: 'location', label: '위치', kind: 'text', wrap: true }];
type Props = { params: Promise<{ id: string }> };

/* 월 상세: 그 달의 인허가·착공·분양·준공(시도별·시행주체별, 통계누리 실적)과 LH 준공 예정 블록. 실적이 있는 달과 LH 예정 달만 열린다. */
const lhMonths = [...new Set(lh.blocks.map((b) => b.date.slice(0, 7)))].sort();
const allMonths = [...new Set([...molit.months, ...lhMonths])].sort();
export const dynamicParams = false;
export const generateStaticParams = () => allMonths.map((id) => ({ id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `${monthLabel(id)}` };
}

export default async function MonthPage({ params }: Props) {
  const { id: ym } = await params;
  if (!DETAILS.month.id.test(ym) || !allMonths.includes(ym)) notFound();
  const actual = molit.months.includes(ym);
  const blocks = lhOfMonth(lh, ym);
  const last = lastMonth(molit);
  const nb = actual ? neighborMonths(molit, ym) : { prev: allMonths[allMonths.indexOf(ym) - 1] ?? null, next: allMonths[allMonths.indexOf(ym) + 1] ?? null };
  const table = actual ? monthTable(molit, ym) : [];
  const nation = table.find((r) => r.code === NATION);
  const i = molit.months.indexOf(ym);
  const lhAge = Math.max(0, (Number(last.slice(0, 4)) - Number(lh.sourceAsOf.slice(0, 4))) * 12 + Number(last.slice(5)) - Number(lh.sourceAsOf.slice(5, 7)));
  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: monthLabel(ym) }]} title={monthLabel(ym)}
        tip={actual ? `전국·시도별 인허가·착공·분양·준공 호수와 시행주체별 호수${blocks.length ? ', 그 달에 준공 예정이던 LH 블록' : ''}.` : `실적 자료가 없는 달(자료는 ${ymDot(molit.months[0])}~${ymDot(last)})입니다. LH 준공 예정 블록만 있습니다.`}>
        {actual ? <Badge variant="ok" title="통계누리 실적이 있는 달">실적</Badge> : <Badge title="실적 자료가 없는 달 — LH 준공 예정만">예정</Badge>}
        {actual && isProvisional(molit, ym) ? <Badge variant="warn" title="통계누리가 잠정치로 낸 달입니다. 확정치는 2027년 9월 공표 예정">잠정</Badge> : null}
        <nav aria-label="이웃 달" className="ml-auto flex gap-4">
          {nb.prev ? <Link href={`/month/${nb.prev}`} title={`이전 달 ${monthLabel(nb.prev)}`} className="inline-flex items-center gap-px rounded-[4px] text-[14px] text-muted-foreground no-underline underline-offset-[3px] tabular-nums transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><ChevronLeft className="size-3.5" aria-hidden="true" />{ymDot(nb.prev)}</Link> : null}
          {nb.next ? <PanelLink href={`/month/${nb.next}`} full={`다음 달 ${monthLabel(nb.next)}`}>{ymDot(nb.next)}</PanelLink> : null}
        </nav>
      </PageHead>

      {actual && nation ? (
        <>
          <StageKpis when="전국" cells={Object.fromEntries(METRICS.map((k) => [k, { value: k === 'permit' && nation.values[k] === null ? <Dash why="자료가 이 달부터라 월 흐름을 알 수 없음" /> : fmt(nation.values[k]) }]))} />

          <Card render={<section aria-label="시도별" />}>
            <PanelHead title="시도별" tip="호 · 통계누리 주택건설실적통계. 2026-07부터 '전남광주'로 집계되고 이전 달은 광주+전남 합산입니다. 인허가는 연초 누계의 차분입니다."><SrcLink /></PanelHead>
            <DataGrid label={`${monthLabel(ym)} 시도별 호수`} cols={[{ key: 'name', label: '시도', kind: 'text' }, ...METRICS.map((k) => ({ key: k, label: `${METRIC_STAGE[k]} ${LABEL[k]}` }))]}
              rows={table.map((r) => ({ id: r.code, pin: r.code === NATION ? 'top' : undefined, c: { name: r.code === NATION ? '전국' : { text: r.name, href: `/area/${r.code}` }, ...r.values } }))} />
          </Card>

          <Card render={<section aria-label="시행주체별" />}>
            <PanelHead title="시행주체별" tip="전국 · 호 · 05 공급(분양)은 시행주체 구분이 없습니다. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다." />
            <DataGrid label={`${monthLabel(ym)} 시행주체별 호수`} cols={[{ key: 'actor', label: '시행주체', kind: 'text' }, ...ACT_KS.map((k) => ({ key: k, label: `${METRIC_STAGE[k]} ${LABEL[k]}` }))]}
              rows={[
                ...ACTORS.map((a) => ({ id: a, c: { actor: { text: a, swatch: ACTOR_COLOR[a] }, ...Object.fromEntries(ACT_KS.map((k) => [k, seriesOf(molit, k, NATION).actors![a][i]])) } })),
                { id: 'total', pin: 'bottom', c: { actor: '총계', ...Object.fromEntries(ACT_KS.map((k) => [k, seriesOf(molit, k, NATION).total[i]])) } },
              ]} />
          </Card>
        </>
      ) : null}

      <Card render={<section aria-label="LH 준공 예정" />}>
        <PanelHead title="LH 준공 예정" tip={`LH 공공주택 준공예정현황(공공데이터포털 15141761) · 파일 기준일 ${lh.sourceAsOf}로 ${lhAge}개월 묵었습니다. 예정일은 그 시점의 계획이며 이후 바뀌었을 수 있습니다.`}>
          <span className={`${sub} tabular-nums`}>{blocks.length}블록 · {fmt(lhUnits(blocks))}세대</span>
          {actual ? null : <SrcLink />}
        </PanelHead>
        {blocks.length > 0 ? (
          <DataGrid label={`${monthLabel(ym)} LH 준공 예정 블록`} cols={LH_COLS} rows={blocks.map((b, k) => ({ id: String(k), c: { district: b.district, block: b.block, type: b.type, units: b.units, date: b.date, location: b.location } }))} />
        ) : <p className={`${sub} m-0`}>이 달에 준공 예정인 LH 블록이 파일에 없습니다.</p>}
      </Card>
    </Page>
  );
}
