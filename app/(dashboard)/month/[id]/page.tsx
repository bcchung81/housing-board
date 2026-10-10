import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import { Swatch } from '../../../../components/charts/Legend';
import { ACTOR_COLOR } from '../../../../components/charts/palette';
import { Lede, Page, PageTitle, PanelTitle, sub } from '../../../../components/page';
import StageKpis from '../../../../components/StageKpis';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Basis } from '../../../../components/ui';
import { ACTORS, METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, monthTable, neighborMonths, seriesOf, lhOfMonth, lhUnits, ymDot } from '../../../../lib/board/calc';
import { lh, molit } from '../../../../lib/board/data';
import { METRIC_STAGE } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';

const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' } as const;
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
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: monthLabel(ym) }]} />
      <PageTitle>{monthLabel(ym)} <code>{ym}</code> {actual ? <Badge variant="ok">실적</Badge> : <Badge>예정</Badge>}{actual && isProvisional(molit, ym) ? <Badge variant="warn" className="ml-1.5">잠정</Badge> : null}</PageTitle>
      <Lede>{actual ? `전국·시도별 인허가·착공·분양·준공 호수와 시행주체별 호수${blocks.length ? ', 그 달에 준공 예정이던 LH 블록' : ''}.` : `실적 자료가 없는 달(자료는 ${ymDot(molit.months[0])}~${ymDot(last)})입니다. LH 준공 예정 블록만 있습니다.`}</Lede>
      <div className="mt-3.5 flex justify-between gap-2 text-[15px] [&_a]:text-primary [&_a]:no-underline">
        {nb.prev ? <Link href={`/month/${nb.prev}`}>‹ {ymDot(nb.prev)}</Link> : <span />}
        {nb.next ? <Link href={`/month/${nb.next}`}>{ymDot(nb.next)} ›</Link> : <span />}
      </div>

      {actual && nation ? (
        <>
          <StageKpis when="전국" cells={Object.fromEntries(METRICS.map((k) => [k, { value: fmt(nation.values[k]), sub: k === 'permit' && nation.values[k] === null ? '자료가 이 달부터라 월 흐름을 알 수 없음' : undefined }]))} />

          <Card render={<section aria-label="시도별" />}>
            <PanelTitle>시도별 <small className={sub}>· 호</small></PanelTitle>
            <Table>
              <TableHeader><tr><TableHead>시도</TableHead>{METRICS.map((k) => <TableHead key={k}>{METRIC_STAGE[k]} {LABEL[k]}</TableHead>)}</tr></TableHeader>
              <TableBody>
                {table.map((r) => (
                  <TableRow key={r.code} total={r.code === NATION}>
                    <TableCell>{r.code === NATION ? '전국' : <Link href={`/area/${r.code}`}>{r.name}</Link>}</TableCell>
                    {METRICS.map((k) => <TableCell key={k}>{fmt(r.values[k])}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Basis>통계누리 주택건설실적통계. 2026-07부터 &lsquo;전남광주&rsquo;로 집계되고 이전 달은 광주+전남 합산입니다. 인허가는 연초 누계의 차분입니다.</Basis>
          </Card>

          <Card render={<section aria-label="시행주체별" />}>
            <PanelTitle>시행주체별 <small className={sub}>· 전국 · 호</small></PanelTitle>
            <Table>
              <TableHeader><tr><TableHead>시행주체</TableHead>{(['permit', 'start', 'complete'] as const).map((k) => <TableHead key={k}>{METRIC_STAGE[k]} {LABEL[k]}</TableHead>)}</tr></TableHeader>
              <TableBody>
                {ACTORS.map((a) => <TableRow key={a}><TableCell><Swatch color={ACTOR_COLOR[a]} />{a}</TableCell>{(['permit', 'start', 'complete'] as const).map((k) => <TableCell key={k}>{fmt(seriesOf(molit, k, NATION).actors![a][i])}</TableCell>)}</TableRow>)}
                <TableRow total><TableCell>총계</TableCell>{(['permit', 'start', 'complete'] as const).map((k) => <TableCell key={k}>{fmt(seriesOf(molit, k, NATION).total[i])}</TableCell>)}</TableRow>
              </TableBody>
            </Table>
            <Basis>05 공급(분양)은 시행주체 구분이 없습니다. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다.</Basis>
          </Card>
        </>
      ) : null}

      <Card render={<section aria-label="LH 준공 예정" />}>
        <PanelTitle>LH 준공 예정 <small className={sub}>· {blocks.length}블록 · {fmt(lhUnits(blocks))}세대</small></PanelTitle>
        {blocks.length > 0 ? (
          <Table>
            <TableHeader><tr><TableHead>사업지구</TableHead><TableHead>블록</TableHead><TableHead>공급유형</TableHead><TableHead>세대수</TableHead><TableHead>준공예정일</TableHead><TableHead>위치</TableHead></tr></TableHeader>
            <TableBody>
              {blocks.map((b, k) => <TableRow key={k}><TableCell className="min-w-[180px] whitespace-normal">{b.district}</TableCell><TableCell>{b.block}</TableCell><TableCell>{b.type}</TableCell><TableCell>{fmt(b.units)}</TableCell><TableCell>{b.date}</TableCell><TableCell className="min-w-[180px] whitespace-normal">{b.location}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        ) : <p className={sub}>이 달에 준공 예정인 LH 블록이 파일에 없습니다.</p>}
        <Basis>LH 공공주택 준공예정현황(공공데이터포털 15141761) · 파일 기준일 {lh.sourceAsOf}로 {Math.max(0, (Number(last.slice(0, 4)) - Number(lh.sourceAsOf.slice(0, 4))) * 12 + Number(last.slice(5)) - Number(lh.sourceAsOf.slice(5, 7)))}개월 묵었습니다. 예정일은 그 시점의 계획이며 이후 바뀌었을 수 있습니다.</Basis>
      </Card>
    </Page>
  );
}
