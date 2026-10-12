import type { Metadata } from 'next';
import Link from 'next/link';
import { cn } from 'cn';
import SupplyTabs from '../../../components/SupplyTabs';
import Legend from '../../../components/charts/Legend';
import StageLegend from '../../../components/charts/StageLegend';
import { stageLabel } from '../../../components/StageKpis';
import StackedMonths from '../../../components/charts/StackedMonths';
import { ACTOR_COLOR, METRIC_COLOR } from '../../../components/charts/palette';
import { Page, PageHead, PanelHead, SrcLink, SubTitle, cardsGrid, cols2, sub } from '../../../components/page';
import { Badge } from '../../../components/ui/badge';
import { Card, cardVariants } from '../../../components/ui/card';
import { DataGrid } from '../../../components/ui/data-grid';
import { Prov } from '../../../components/ui';
import { ACTORS, NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, ytd, valueAt, ymDot } from '../../../lib/board/calc';
import { lh, molit } from '../../../lib/board/data';
import { AGENCIES } from '../../../lib/board/agencies';
import { METRIC_STAGE } from '../../../lib/board/stages';
import type { Col, Row } from '../../../lib/grid/spec';

export const metadata: Metadata = { title: '공급 실적 · 시행주체별' };
const KS = [['permit', '인허가'], ['start', '착공'], ['complete', '준공']] as const;

/* 공급 실적 · 시행주체별(L1 목록, 2026-10-10 메뉴 통합 전 '기관별'): 통계누리 시행주체 4분류의 호수와 LH 준공 예정 요약. 기관별 지연·주의·정상 신호는 일정이 없어 아직 판정하지 않는다. */
export default function AgencyIndex() {
  const last = lastMonth(molit), year = last.slice(0, 4);
  const byYear = [...new Set(lh.blocks.map((b) => b.date.slice(0, 4)))].map((y) => ({ y, blocks: lh.blocks.filter((b) => b.date.startsWith(y)) }));
  const mo = Number(last.slice(5)), at = molit.months.indexOf(last);
  const actorCols: Col[] = [{ key: 'actor', label: '시행주체', kind: 'text' }, ...KS.flatMap(([k, l]) => [
    { key: `m-${k}`, label: `${mo}월`, group: `${METRIC_STAGE[k]} ${l}`, groupSwatch: METRIC_COLOR[k] },
    { key: `y-${k}`, label: `1~${mo}월 누계`, group: `${METRIC_STAGE[k]} ${l}`, groupSwatch: METRIC_COLOR[k] },
  ])];
  const actorRows: Row[] = [
    ...ACTORS.map((a) => ({ id: a, c: { actor: { text: a, swatch: ACTOR_COLOR[a] }, ...Object.fromEntries(KS.flatMap(([k]) => [[`m-${k}`, seriesOf(molit, k, NATION).actors![a][at]], [`y-${k}`, ytd(molit, k, NATION, last, a)]])) } })),
    { id: 'total', pin: 'bottom', c: { actor: '총계', ...Object.fromEntries(KS.flatMap(([k]) => [[`m-${k}`, valueAt(molit, k, NATION, last)], [`y-${k}`, ytd(molit, k, NATION, last)]])) } },
  ];
  const prov = isProvisional(molit, last);
  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '공급 실적' }]} title="공급 실적"
        tip="통계누리 시행주체(지자체·LH·주택업체·민간)별 호수와 LH 준공 예정. 기관을 누르면 그 기관의 월 흐름과 예정 블록으로 내려갑니다."
        meta={`실적 ${ymDot(last)}`} metaTip={`통계누리 주택건설실적통계 · ${year}년 누계 · LH 준공예정 파일 기준일 ${lh.sourceAsOf}`}>
        <SupplyTabs current="/agency" />
      </PageHead>

      <div className={cardsGrid}>
        {AGENCIES.map((a) => <Link key={a.id} className={cardVariants({ variant: 'link' })} href={`/agency/${a.id}`}><b>{a.name} {a.ready ? null : <Badge>준비 중</Badge>}</b><span>{a.summary}</span></Link>)}
      </div>

      <Card render={<section aria-label="시행주체별 호수" />}>
        <PanelHead title={<>시행주체별{prov ? <Prov /> : null}</>} tip={`전국 · 호 · ${monthLabel(last)} · 통계누리 주택건설실적통계 · ${year}년 누계. 네 분류의 합이 총계입니다. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다. 05 공급(분양)은 시행주체 구분이 없고, 01 정책·02 사업화는 통계누리에 없습니다.`}>
          <StageLegend metrics={KS.map(([k]) => k)} compact />
          <SrcLink />
        </PanelHead>
        <DataGrid label="시행주체별 호수" cols={actorCols} rows={actorRows} />
        <div className="mt-5 flex justify-end"><Legend items={ACTORS.map((a) => ({ label: a, color: ACTOR_COLOR[a] }))} /></div>
        <div className={cols2}>
          {KS.map(([k, l]) => (
            <div key={k} className="min-w-0">
              <SubTitle className="mt-1 mb-0" title="전국, 월별">{stageLabel(k)}</SubTitle>
              <StackedMonths months={molit.months} stacks={ACTORS.map((a) => ({ key: a, label: a, color: ACTOR_COLOR[a], values: seriesOf(molit, k, NATION).actors![a] }))} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`전국 월별 ${l} 호수, 시행주체별`} />
            </div>
          ))}
        </div>
      </Card>

      <Card render={<section aria-label="LH 준공 예정" />}>
        <PanelHead title="LH 준공 예정" tip={`LH 공공주택 준공예정현황(15141761) · 파일 기준일 ${lh.sourceAsOf}.`}>
          <span className={cn(sub, 'tabular-nums')}>{lh.count}블록 · {fmt(lh.units)}세대</span>
        </PanelHead>
        <DataGrid label="LH 준공 예정 연도별" cols={[{ key: 'y', label: '연도', kind: 'text' }, { key: 'n', label: '블록' }, { key: 'units', label: '세대수' }]}
          rows={byYear.map((r) => ({ id: r.y, c: { y: r.y, n: r.blocks.length, units: r.blocks.reduce((a, b) => a + b.units, 0) } }))} />
      </Card>
    </Page>
  );
}
