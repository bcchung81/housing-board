import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Crumbs from '../../../../components/Crumbs';
import StageLegend from '../../../../components/charts/StageLegend';
import MonthLines from '../../../../components/charts/MonthLines';
import { METRIC_COLOR } from '../../../../components/charts/palette';
import { Lede, Page, PageTitle, PanelTitle, sub } from '../../../../components/page';
import StageKpis from '../../../../components/StageKpis';
import { Alert } from '../../../../components/ui/alert';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { DataGrid } from '../../../../components/ui/data-grid';
import { Basis, Prov } from '../../../../components/ui';
import { NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, ymDot, ytd } from '../../../../lib/board/calc';
import { AGENCIES } from '../../../../lib/board/agencies';
import { lh, molit, sources } from '../../../../lib/board/data';
import { METRIC_STAGE } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';
import type { Col } from '../../../../lib/grid/spec';

type Props = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => AGENCIES.map((a) => ({ id: a.id }));
const KS = [['permit', '인허가'], ['start', '착공'], ['complete', '준공']] as const;
const YEAR_COLS: Col[] = [{ key: 'y', label: '연도', kind: 'text' }, { key: 'n', label: '블록' }, { key: 'units', label: '세대수' }];
const BLOCK_COLS: Col[] = [{ key: 'date', label: '준공예정일', kind: 'text' }, { key: 'district', label: '사업지구', kind: 'text', wrap: true }, { key: 'block', label: '블록', kind: 'text' }, { key: 'type', label: '공급유형', kind: 'text' }, { key: 'units', label: '세대수' }, { key: 'location', label: '위치', kind: 'text', wrap: true }];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: AGENCIES.find((a) => a.id === id)?.name };
}

export default async function AgencyDetail({ params }: Props) {
  const { id } = await params;
  const a = DETAILS.agency.id.test(id) ? AGENCIES.find((x) => x.id === id) : undefined;
  if (!a) notFound();
  const crumbs = [{ label: '종합상황판', href: '/' }, { label: '공급 실적', href: '/area' }, { label: '시행주체별', href: '/agency' }, { label: a.name }];

  if (!a.actor) {   // gh · sh · mnd: 화면에 쓸 데이터가 아직 없다. 받은 파일이 있으면 카탈로그를 보인다.
    const group = a.id === 'sh' ? '서울주택도시공사' : a.id === 'mnd' ? '국방부' : null;
    const files = group ? sources.items.filter((s) => s.group === group) : [];
    return (
      <Page>
        <Crumbs items={crumbs} />
        <PageTitle>{a.name} <Badge>준비 중</Badge></PageTitle>
        <Lede>{a.summary}.</Lede>
        <Alert><b>기관별 신호(정상·주의·지연)는 일정(당초·변경·현재 예정)이 없어 판정하지 않습니다.</b> {a.id === 'mnd' ? '군인 특별공급(국방부)은 수작업 입력 대기 상태입니다.' : null}</Alert>
        {files.length ? (
          <Card render={<section aria-label="받은 원천 파일" />}>
            <PanelTitle>받은 원천 파일 <small className={sub}>· {files.length}종 · 아직 화면에서 쓰지 않음</small></PanelTitle>
            <DataGrid label={`${a.name} 받은 원천 파일`} cols={[{ key: 'dataset', label: '데이터셋', kind: 'text', wrap: true }, { key: 'count', label: '건수' }, { key: 'asOf', label: '원천 기준일', kind: 'text' }]}
              rows={files.map((s) => ({ id: s.id, c: { dataset: { text: s.dataset, href: `/sources#${s.id}` }, count: s.count, asOf: s.sourceAsOf ?? { na: '확인하지 못함' } } }))} />
          </Card>
        ) : null}
      </Page>
    );
  }

  const last = lastMonth(molit), year = last.slice(0, 4);
  const lines = KS.map(([k, l]) => ({ key: k, label: l, color: METRIC_COLOR[k], values: seriesOf(molit, k, NATION).actors![a.actor] }));
  const i = molit.months.indexOf(last);
  const byYear = [...new Set(lh.blocks.map((b) => b.date.slice(0, 4)))].map((y) => ({ y, blocks: lh.blocks.filter((b) => b.date.startsWith(y)) }));
  const recent = molit.months.slice(-12).reverse();
  return (
    <Page>
      <Crumbs items={crumbs} />
      <PageTitle>{a.name} <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>통계누리 시행주체 `{a.actor}`의 전국 월별 호수{a.id === 'lh' ? '와 LH 준공 예정 블록' : ''}.</Lede>
      <StageKpis when={monthLabel(last)} notes={{ '05': '분양은 시행주체 구분이 없음' }} cells={Object.fromEntries(KS.map(([k]) => [k, { value: fmt(seriesOf(molit, k, NATION).actors![a.actor!][i]), sub: <>{year}년 누계 {fmt(ytd(molit, k, NATION, last, a.actor!))}호{isProvisional(molit, last) ? <Prov /> : null}</> }]))} />
      <Card render={<section aria-label="월별 실적" />}>
        <PanelTitle>월별 실적 <small className={sub}>· 전국 · 호 · 빗금은 잠정치</small></PanelTitle>
        <StageLegend metrics={KS.map(([k]) => k)} />
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${a.name} 전국 월별 인허가·착공·준공 호수`} />
        <Basis>통계누리 주택건설실적통계. 인허가는 연초 누계의 차분입니다. 05 공급(분양)은 시행주체 구분이 없고, 01 정책·02 사업화는 통계누리에 없습니다.</Basis>
      </Card>
      <Card render={<section aria-label="최근 12개월" />}>
        <PanelTitle>최근 12개월 <small className={sub}>· 호</small></PanelTitle>
        <DataGrid label={`${a.name} 최근 12개월 호수`} cols={[{ key: 'ym', label: '월', kind: 'text' }, ...KS.map(([k, l]) => ({ key: k, label: `${METRIC_STAGE[k]} ${l}` }))]}
          rows={recent.map((ym) => ({ id: ym, c: { ym: { text: ymDot(ym), href: `/month/${ym}`, sort: ym }, ...Object.fromEntries(KS.map(([k]) => [k, seriesOf(molit, k, NATION).actors![a.actor!][molit.months.indexOf(ym)]])) } }))} />
      </Card>
      {a.id === 'lh' ? (
        <Card render={<section aria-label="LH 준공 예정" />}>
          <PanelTitle>LH 준공 예정 <small className={sub}>· {lh.count}블록 · {fmt(lh.units)}세대 · 준공예정일 순</small></PanelTitle>
          <DataGrid label="LH 준공 예정 연도별" cols={YEAR_COLS} rows={byYear.map((r) => ({ id: r.y, c: { y: r.y, n: r.blocks.length, units: r.blocks.reduce((s, b) => s + b.units, 0) } }))} />
          <DataGrid label="LH 준공 예정 블록" cols={BLOCK_COLS} maxHeight={520}
            rows={lh.blocks.map((b, k) => ({ id: String(k), c: { date: { text: b.date, href: `/month/${b.date.slice(0, 7)}` }, district: b.district, block: b.block, type: b.type, units: b.units, location: b.location } }))} />
          <Basis>LH 공공주택 준공예정현황(15141761) · 파일 기준일 {lh.sourceAsOf}. 예정일은 그 시점의 계획입니다.</Basis>
        </Card>
      ) : null}
    </Page>
  );
}
