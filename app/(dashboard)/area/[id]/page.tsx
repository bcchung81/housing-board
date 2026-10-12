import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Legend, { ProvKey } from '../../../../components/charts/Legend';
import StageLegend from '../../../../components/charts/StageLegend';
import MonthLines from '../../../../components/charts/MonthLines';
import StackedMonths from '../../../../components/charts/StackedMonths';
import { ACTOR_COLOR, METRIC_COLOR } from '../../../../components/charts/palette';
import { Page, PageHead, PanelHead, SrcLink, SubTitle, cardsGrid, cols2 } from '../../../../components/page';
import StageKpis, { stageLabel } from '../../../../components/StageKpis';
import { Card, cardVariants } from '../../../../components/ui/card';
import { DataGrid } from '../../../../components/ui/data-grid';
import { Prov } from '../../../../components/ui';
import { ACTORS, METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, sidoName, valueAt, ymDot, ytd } from '../../../../lib/board/calc';
import { SGG, molit, projects } from '../../../../lib/board/data';
import { METRIC_STAGE } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';
import type { Col, Row } from '../../../../lib/grid/spec';

const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' } as const;
type Props = { params: Promise<{ id: string }> };

/* 시도 2자리 16곳을 미리 그린다. 시군구 5자리(/area/41450)는 2026-10-10 부터 사업 목록의 거르기(/projects?sgg=)로 넘긴다(next.config.ts). */
export const generateStaticParams = () => molit.sido.filter((s) => s.code !== NATION).map((s) => ({ id: s.code }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: sidoName(molit, id) ?? id };
}

export default async function AreaDetail({ params }: Props) {
  const { id } = await params;
  if (!DETAILS.area.id.test(id)) notFound();
  return <SidoView code={id} />;
}

function SidoView({ code }: { code: string }) {
  const name = sidoName(molit, code);
  if (!name || code === NATION) notFound();
  const last = lastMonth(molit);
  const lines = METRICS.map((k) => ({ key: k, label: LABEL[k], color: METRIC_COLOR[k], values: seriesOf(molit, k, code).total }));
  const actorStacks = (k: 'permit' | 'start' | 'complete') => ACTORS.map((a) => ({ key: a, label: a, color: ACTOR_COLOR[a], values: seriesOf(molit, k, code).actors![a] }));
  const recent = molit.months.slice(-12).reverse();
  const recentCols: Col[] = [{ key: 'ym', label: '월', kind: 'text' }, ...METRICS.map((k) => ({ key: k, label: `${METRIC_STAGE[k]} ${LABEL[k]}` }))];
  const recentRows: Row[] = recent.map((ym) => ({ id: ym, c: { ym: { text: ymDot(ym), href: `/month/${ym}`, prov: isProvisional(molit, ym), sort: ym }, ...Object.fromEntries(METRICS.map((k) => [k, valueAt(molit, k, code, ym)])) } }));
  const sggs = Object.entries(SGG).filter(([, s]) => s.sido === code);
  const prov = isProvisional(molit, last);
  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '공급 실적', href: '/area' }, { label: name }]} title={name}
        tip={`${name}의 인허가·착공·분양·준공 월별 호수(공급 6단계의 03~06)와 시행주체별 흐름. 그래프의 달을 누르면 그 달의 전국 현황으로 내려갑니다.`}
        meta={`실적 ${ymDot(last)}`} metaTip={`통계누리 주택건설실적통계 · 자료 기간 ${molit.months[0]} ~ ${last} · 인허가는 연초 누계의 차분입니다.`}>
        <code className="text-[14px] text-muted-foreground" title="시도 코드">{code}</code>
      </PageHead>
      {code === '12' ? <p className="m-0 text-[14px] text-warn">2026-07부터 광주·전남이 &lsquo;전남광주&rsquo; 하나로 집계됩니다. 그 이전 달은 광주+전남을 합산한 값입니다.</p> : null}

      <StageKpis when={monthLabel(last)} cells={Object.fromEntries(METRICS.map((k) => [k, { value: fmt(valueAt(molit, k, code, last)), sub: <>1~{Number(last.slice(5))}월 누계 {fmt(ytd(molit, k, code, last))}호{prov ? <Prov /> : null}</> }]))} />

      <Card render={<section aria-label="월별 실적" />}>
        <PanelHead title="월별 실적" tip="호 · 빗금은 잠정치 · 통계누리 주택건설실적통계 · 인허가는 연초 누계의 차분입니다.">
          <StageLegend metrics={METRICS} compact />
          {molit.provisional.length ? <ProvKey /> : null}
          <SrcLink />
        </PanelHead>
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${name} 월별 인허가·착공·분양·준공 호수`} />
      </Card>

      <Card render={<section aria-label="시행주체별 월별 호수" />}>
        <PanelHead title="시행주체별" tip="호 · 지자체·LH·주택업체는 공공, 민간은 민간부문 · 네 분류의 합이 총계와 같습니다(통계누리 시행주체 구분). 05 공급(분양)은 시행주체 구분이 없고, 01 정책·02 사업화는 통계누리에 없습니다.">
          <Legend items={ACTORS.map((a) => ({ label: a, color: ACTOR_COLOR[a] }))} />
        </PanelHead>
        <div className={cols2}>
          {(['permit', 'start', 'complete'] as const).map((k) => (
            <div key={k} className="min-w-0">
              <SubTitle className="mt-1 mb-0">{stageLabel(k)}</SubTitle>
              <StackedMonths months={molit.months} stacks={actorStacks(k)} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${name} 월별 ${LABEL[k]} 호수, 시행주체별`} />
            </div>
          ))}
        </div>
      </Card>

      <Card render={<section aria-label="최근 12개월" />}>
        <PanelHead title="최근 12개월" tip="호 · 통계누리 주택건설실적통계 · 인허가는 연초 누계의 차분입니다." />
        <DataGrid label={`${name} 최근 12개월 호수`} cols={recentCols} rows={recentRows} />
      </Card>

      {sggs.length > 0 ? (
        <Card render={<section aria-label="사업 자료가 있는 시군구" />}>
          <PanelHead title="이 시도의 시군구" tip="사업 자료가 있는 곳" />
          <div className={cardsGrid}>
            {sggs.map(([c, s]) => <Link key={c} className={cardVariants({ variant: 'link' })} href={`/projects?sgg=${c}`}><b>{s.name}</b><span>사업 {projects.filter((p) => p.sgg === c).length}건</span></Link>)}
          </div>
        </Card>
      ) : null}
    </Page>
  );
}
