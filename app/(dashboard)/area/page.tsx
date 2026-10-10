import type { Metadata } from 'next';
import Crumbs from '../../../components/Crumbs';
import SupplyTabs from '../../../components/SupplyTabs';
import StageLegend from '../../../components/charts/StageLegend';
import MonthLines from '../../../components/charts/MonthLines';
import { METRIC_COLOR } from '../../../components/charts/palette';
import { Lede, Page, PageTitle, PanelTitle, sub } from '../../../components/page';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { DataGrid } from '../../../components/ui/data-grid';
import StageKpis from '../../../components/StageKpis';
import { Basis, Prov } from '../../../components/ui';
import { METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, valueAt, ytd } from '../../../lib/board/calc';
import { molit } from '../../../lib/board/data';
import { METRIC_STAGE } from '../../../lib/board/stages';
import type { Col, Row } from '../../../lib/grid/spec';

export const metadata: Metadata = { title: '공급 실적 · 시도별' };

const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' } as const;

/* 공급 실적 · 시도별(L1 목록, 2026-10-10 메뉴 통합 전 '지역별'): 시도 16곳의 최근 달과 연누계, 전국 월별 흐름. 시군구 단위 실적 통계는 없다(통계누리는 시도 단위) —
   사업 자료가 있는 시군구는 사업 목록의 거르기(/projects?sgg=)로 간다. */
export default function AreaIndex() {
  const last = lastMonth(molit), year = last.slice(0, 4);
  const lines = METRICS.map((k) => ({ key: k, label: LABEL[k], color: METRIC_COLOR[k], values: seriesOf(molit, k, NATION).total }));
  const upto = `${year}년 1~${Number(last.slice(5))}월 누계`;
  const cols: Col[] = [
    { key: 'name', label: '시도', kind: 'text' },
    ...METRICS.map((k) => ({ key: `m-${k}`, label: `${METRIC_STAGE[k]} ${LABEL[k]}`, group: monthLabel(last) })),
    ...METRICS.map((k) => ({ key: `y-${k}`, label: `${METRIC_STAGE[k]} ${LABEL[k]}`, group: upto })),
  ];
  const rows: Row[] = molit.sido.map((s) => ({
    id: s.code, pin: s.code === NATION ? 'top' : undefined,
    c: { name: s.code === NATION ? '전국' : { text: s.name, href: `/area/${s.code}` }, ...Object.fromEntries(METRICS.flatMap((k) => [[`m-${k}`, valueAt(molit, k, s.code, last)], [`y-${k}`, ytd(molit, k, s.code, last)]])) },
  }));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '공급 실적' }]} />
      <PageTitle>공급 실적 <Badge variant="ok">실데이터</Badge></PageTitle>
      <SupplyTabs current="/area" />
      <Lede>시도 16곳의 인허가·착공·분양·준공 호수(공급 6단계의 03~06, 01 정책·02 사업화는 통계누리에 없음). 시도 이름을 누르면 시행주체별 월 흐름으로, 그래프의 달을 누르면 그 달의 전국 현황으로 내려갑니다.</Lede>

      <StageKpis when={monthLabel(last)} cells={Object.fromEntries(METRICS.map((k) => [k, { value: fmt(valueAt(molit, k, NATION, last)), sub: <>{year}년 1~{Number(last.slice(5))}월 누계 {fmt(ytd(molit, k, NATION, last))}호{isProvisional(molit, last) ? <Prov /> : null}</> }]))} />

      <Card render={<section aria-label="전국 월별 실적" />}>
        <PanelTitle>전국 월별 실적 <small className={sub}>· 호 · 빗금은 잠정치</small></PanelTitle>
        <StageLegend metrics={METRICS} />
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`전국 월별 인허가·착공·분양·준공 호수, ${molit.months[0]}부터 ${last}까지`} />
        <Basis>통계누리 주택건설실적통계 · 자료 기간 {molit.months[0]} ~ {last}. 인허가는 연초 누계의 차분이라 첫 달({molit.months[0]})은 알 수 없습니다.</Basis>
      </Card>

      <Card render={<section aria-label="시도별 표" />}>
        <PanelTitle>시도별 <small className={sub}>· 호</small></PanelTitle>
        <DataGrid label="시도별 호수" cols={cols} rows={rows} />
        <Basis>2026-07부터 광주·전남이 &lsquo;전남광주&rsquo; 하나로 집계됩니다. 이전 달은 두 곳을 합산해 한 계열로 이었습니다. {isProvisional(molit, last) ? '2026-01~08은 잠정치입니다.' : ''}</Basis>
      </Card>
    </Page>
  );
}
