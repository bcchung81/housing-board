import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import Crumbs from '../../../components/Crumbs';
import Legend from '../../../components/charts/Legend';
import StackedMonths from '../../../components/charts/StackedMonths';
import { ACTOR_COLOR } from '../../../components/charts/palette';
import { Lede, Page, PageTitle, PanelTitle, SubTitle, cardsGrid, cols2, sub } from '../../../components/page';
import { Badge } from '../../../components/ui/badge';
import { Card, cardVariants } from '../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Basis, Prov } from '../../../components/ui';
import { ACTORS, NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, ytd, valueAt } from '../../../lib/board/calc';
import { lh, molit } from '../../../lib/board/data';
import { AGENCIES } from '../../../lib/board/agencies';

export const metadata: Metadata = { title: '기관별' };
const KS = [['permit', '인허가'], ['start', '착공'], ['complete', '준공']] as const;

/* 기관별(L1 목록): 통계누리 시행주체 4분류의 호수와 LH 준공 예정 요약. 기관별 지연·주의·정상 신호는 일정이 없어 아직 판정하지 않는다. */
export default function AgencyIndex() {
  const last = lastMonth(molit), year = last.slice(0, 4);
  const byYear = [...new Set(lh.blocks.map((b) => b.date.slice(0, 4)))].map((y) => ({ y, blocks: lh.blocks.filter((b) => b.date.startsWith(y)) }));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '기관별' }]} />
      <PageTitle>기관별 <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>통계누리 시행주체(지자체·LH·주택업체·민간)별 호수와 LH 준공 예정. 기관을 누르면 그 기관의 월 흐름과 예정 블록으로 내려갑니다.</Lede>

      <div className={`${cardsGrid} mt-3`}>
        {AGENCIES.map((a) => <Link key={a.id} className={cardVariants({ variant: 'link' })} href={`/agency/${a.id}`}><b>{a.name} {a.ready ? null : <Badge>준비 중</Badge>}</b><span>{a.summary}</span><code>/agency/{a.id}</code></Link>)}
      </div>

      <Card render={<section aria-label="시행주체별 호수" />}>
        <PanelTitle>시행주체별 <small className={sub}>· 전국 · 호 · {monthLabel(last)}{isProvisional(molit, last) ? <Prov /> : null}</small></PanelTitle>
        <Table>
          <TableHeader>
            <tr><TableHead rowSpan={2}>시행주체</TableHead>{KS.map(([, l]) => <TableHead key={l} colSpan={2} style={{ textAlign: 'center' }}>{l}</TableHead>)}</tr>
            <tr>{KS.map(([k]) => <Fragment key={k}><TableHead>{Number(last.slice(5))}월</TableHead><TableHead>1~{Number(last.slice(5))}월 누계</TableHead></Fragment>)}</tr>
          </TableHeader>
          <TableBody>
            {ACTORS.map((a) => (
              <TableRow key={a}><TableCell>{a}</TableCell>{KS.map(([k]) => <Fragment key={k}><TableCell>{fmt(seriesOf(molit, k, NATION).actors![a][molit.months.indexOf(last)])}</TableCell><TableCell>{fmt(ytd(molit, k, NATION, last, a))}</TableCell></Fragment>)}</TableRow>
            ))}
            <TableRow total><TableCell>총계</TableCell>{KS.map(([k]) => <Fragment key={k}><TableCell>{fmt(valueAt(molit, k, NATION, last))}</TableCell><TableCell>{fmt(ytd(molit, k, NATION, last))}</TableCell></Fragment>)}</TableRow>
          </TableBody>
        </Table>
        <Legend items={ACTORS.map((a) => ({ label: a, color: ACTOR_COLOR[a] }))} />
        <div className={cols2}>
          {KS.map(([k, l]) => (
            <div key={k}>
              <SubTitle>{l}(전국, 월별)</SubTitle>
              <StackedMonths months={molit.months} stacks={ACTORS.map((a) => ({ key: a, label: a, color: ACTOR_COLOR[a], values: seriesOf(molit, k, NATION).actors![a] }))} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`전국 월별 ${l} 호수, 시행주체별`} />
            </div>
          ))}
        </div>
        <Basis>통계누리 주택건설실적통계 · {year}년 누계. 네 분류의 합이 총계입니다. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다.</Basis>
      </Card>

      <Card render={<section aria-label="LH 준공 예정" />}>
        <PanelTitle>LH 준공 예정 <small className={sub}>· {lh.count}블록 · {fmt(lh.units)}세대</small></PanelTitle>
        <Table>
          <TableHeader><tr><TableHead>연도</TableHead><TableHead>블록</TableHead><TableHead>세대수</TableHead></tr></TableHeader>
          <TableBody>{byYear.map((r) => <TableRow key={r.y}><TableCell>{r.y}</TableCell><TableCell>{r.blocks.length}</TableCell><TableCell>{fmt(r.blocks.reduce((a, b) => a + b.units, 0))}</TableCell></TableRow>)}</TableBody>
        </Table>
        <Basis>LH 공공주택 준공예정현황(15141761) · 파일 기준일 {lh.sourceAsOf}.</Basis>
      </Card>
    </Page>
  );
}
