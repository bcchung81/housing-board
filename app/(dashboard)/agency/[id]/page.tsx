import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import StageLegend from '@/components/charts/StageLegend';
import MonthLines from '@/components/charts/MonthLines';
import { ProvKey } from '@/components/charts/Legend';
import { METRIC_COLOR } from '@/components/charts/palette';
import { FactNote, MetricRow, Page, PageHead, PanelHead, SrcLink } from '@/components/page';
import PanelLink from '@/components/board/PanelLink';
import StageKpis from '@/components/StageKpis';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { Prov } from '@/components/ui';
import { NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, staleText, ymDot, ytd, ytdSpan } from '@/lib/board/calc';
import { AGENCIES } from '@/lib/board/agencies';
import { getBoardData } from '@/lib/board/data';
import { mapHref } from '@/lib/board/map-href';
import { getProjectsIndex } from '@/lib/board/projects-index';
import { dayText, isMetro, listOrder, sggOfAddress } from '@/lib/board/projects-view';
import { LIST_COLS, dropBlank, listRows } from '@/lib/board/projects-list';
import { sidoName } from '@/lib/board/calc';
import { metricBoardLabel } from '@/lib/board/stages';
import { DETAILS } from '@/lib/shell/menu';
import { dotDates, type Col } from '@/lib/grid/spec';

type Props = { params: Promise<{ id: string }> };
export const generateStaticParams = () => AGENCIES.map((a) => ({ id: a.id }));
const KS = [['permit', '인허가'], ['start', '착공'], ['complete', '준공']] as const;
const YEAR_COLS: Col[] = [{ key: 'y', label: '연도', kind: 'text' }, { key: 'n', label: '블록' }, { key: 'units', label: '호수' }];
const BLOCK_COLS: Col[] = [{ key: 'date', label: '준공예정일', kind: 'text' }, { key: 'district', label: '사업지구', kind: 'text', wrap: true }, { key: 'block', label: '블록', kind: 'text' }, { key: 'type', label: '공급유형', kind: 'text' }, { key: 'units', label: '호수' }, { key: 'location', label: '위치', kind: 'text', wrap: true },
  { key: 'map', label: '지도', kind: 'text', sort: false }];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: AGENCIES.find((a) => a.id === id)?.name };
}

/* 파일 한 행은 블록×공급유형이라 같은 블록이 여러 행이다 — 고유 블록(사업지구+블록)으로 센다 */
const blockCount = (bs: { district: string; block: string }[]) => new Set(bs.map((b) => `${b.district}|${b.block}`)).size;

export default async function AgencyDetail({ params }: Props) {
  const { id } = await params;
  const { lh, molit, sources } = await getBoardData();   // molit: 시도 짧은 이름(GH 표의 시군구 칸)
  const a = DETAILS.agency.id.test(id) ? AGENCIES.find((x) => x.id === id) : undefined;
  if (!a) notFound();
  const crumbs = [{ label: '종합상황판', href: '/' }, { label: a.name }];

  if (!a.actor) {   // gh · sh · ih · mnd: 화면에 쓸 데이터가 아직 없다. 받은 파일이 있으면 카탈로그를 보인다.
    const group = a.id === 'sh' ? '서울주택도시공사' : a.id === 'mnd' ? '국방부' : null;
    const files = group ? sources.items.filter((s) => s.group === group) : [];
    const ghRows = a.id === 'gh' || a.id === 'ih' ? listOrder((await getProjectsIndex()).rows.filter((r) => r.agency === a.id)) : [];   // 원장의 GH·iH 사업(종합상황판 기관 칩과 같은 기준) · 사업 목록과 같은 순서
    /* 표는 사업 목록과 같은 열·칸(①~⑥ 단계 색 알약·상태·현재 예정) — 행을 누르면 사업 화면 서랍(/projects?sido=all&agency=<기관>&id=…) */
    /* 상태 칸은 '일정 정보 없음': 머리 경고문대로 이 화면은 기관 신호(정상·주의·지연)를 판정하지 않는다(사업 화면의 판정은 서랍·사업 화면에서) — 2026-10-15 평가, 2026-10-16 '판정 밖'에서 바꿈 */
    const ghGridRows = listRows(ghRows, { agency: a.id }, null, (c) => sidoName(molit, c)).map((row) => ({ ...row, c: { ...row.c, status: { text: '일정 정보 없음', muted: true, title: '기관별 신호는 일정(당초·변경·현재 예정)이 없어 이 화면에서 판정하지 않음 — 사업 판정은 행을 눌러 사업 상세에서' } } }));
    const ghGrid = dropBlank(LIST_COLS, ghGridRows);
    return (
      <Page>
        <PageHead crumbs={crumbs} title={a.name} tip={`${a.summary}.`}><Badge title={`${a.summary}.`}>준비 중</Badge></PageHead>
        <FactNote className="ui-inset" tip={{ label: '판정하지 않는 까닭', children: <><p>기관별 신호(정상·주의·지연)는 일정(당초·변경·현재 예정)이 없어 판정하지 않습니다.</p>{a.id === 'mnd' ? <p>군인 특별공급(국방부)은 수작업 입력 대기 상태입니다.</p> : null}</> }}>일정이 없어 기관 신호를 판정하지 않습니다.</FactNote>
        {ghRows.length ? (
          <Card render={<section aria-label={`${a.name} 사업`} />}>
            <PanelHead title={`${a.name} 사업`} tip={`사업 원장에서 기관이 ${a.name} 인 사업 · 사업 화면의 기관 칩 ${a.name} 와 같은 목록·같은 열 · 행을 누르면 사업 상세${ghGrid.note}`}><PanelLink href={`/projects?sido=all&agency=${a.id}`} full={`사업 화면에서 ${a.name} 사업 목록 보기`}>사업 화면에서 보기</PanelLink></PanelHead>
            <MetricRow className="mb-2" label="계획" value={fmt(ghRows.reduce((n, r) => n + r.units, 0))} unit="호" items={[`${fmt(ghRows.length)}건`]} />
            <DataGrid label={`${a.name} 사업`} cols={ghGrid.cols} rows={ghGridRows} maxHeight={640} quietCount />
          </Card>
        ) : null}
        {files.length ? (
          <Card render={<section aria-label="받은 원천 파일" />}>
            <PanelHead title="받은 원천 파일" tip="아직 화면에서 쓰지 않음"><SrcLink /></PanelHead>
            <MetricRow className="mb-2" label="원천" value={files.length} unit="종" />
            <DataGrid label={`${a.name} 받은 원천 파일`} cols={[{ key: 'dataset', label: '데이터셋', kind: 'text', wrap: true }, { key: 'count', label: '건수' }, { key: 'asOf', label: '원천 기준일', kind: 'text' }]}
              rows={files.map((s) => ({ id: s.id, c: { dataset: { text: s.dataset, href: `/sources#${s.id}` }, count: s.count, asOf: s.sourceAsOf ? dotDates(s.sourceAsOf) : { na: '확인하지 못함' } } }))} />
          </Card>
        ) : null}
      </Page>
    );
  }

  const last = lastMonth(molit), year = last.slice(0, 4), area = sidoName(molit, NATION) ?? '전국';   // 범위 이름(통계누리 합계 자리 — 수도권, lib/board/data.ts)
  const lines = KS.map(([k, l]) => ({ key: k, label: l, color: METRIC_COLOR[k], values: seriesOf(molit, k, NATION).actors![a.actor] }));
  const i = molit.months.indexOf(last);
  /* LH 준공 예정은 이번 달(원장 관측 달)부터 — 지난 예정일 블록은 표에서 뺀다(개수는 title 에) */
  const { observedMonth, referenceDate: observedRef } = await getProjectsIndex();
  const lhStale = staleText(lh.sourceAsOf, observedRef);   // LH 파일 낡음 표지(원장 기준일과의 차이)
  const blocks = lh.blocks.filter((b) => b.date.slice(0, 7) >= observedMonth), past = lh.blocks.length - blocks.length;
  const byYear = [...new Set(blocks.map((b) => b.date.slice(0, 4)))].map((y) => ({ y, blocks: blocks.filter((b) => b.date.startsWith(y)) }));
  const blockTotal = blockCount(blocks);
  const recent = molit.months.slice(-12).reverse();
  const prov = isProvisional(molit, last);
  /* 블록 → 지도(수도권만): 원장에 같은 이름('지구 블록')의 사업이 있으면 그 사업, 없으면 주소의 시군구 */
  const idx = a.id === 'lh' ? await getProjectsIndex() : null;   // 블록 → 지도(아래)
  const byName = new Map((idx?.rows ?? []).filter((r) => isMetro(r.sgg)).map((r) => [`${r.sgg.slice(0, 2)}|${r.name}`, r.id]));
  const blockMap = (b: (typeof lh.blocks)[number]) => {
    if (!idx || !isMetro(b.sido)) return null;
    const project = byName.get(`${b.sido}|${b.district} ${b.block}`), sgg = project ? null : sggOfAddress(b.location, b.sido, idx.sggNames);
    return project || sgg ? { text: project ? '지도에서 이 블록 보기' : '지도에서 이 시군구 보기', href: mapHref({ project, sgg }), doc: true, icon: 'map' as const, title: project ? '지도에서 이 사업 위치 보기' : '사업 번호가 없어 지도에서 이 블록의 시군구를 보기' } : null;
  };
  return (
    <Page>
      <PageHead crumbs={crumbs} title={a.name} tip={`통계누리 시행주체 '${a.actor}'의 ${area} 월별 호수${a.id === 'lh' ? '와 LH 준공 예정 블록' : ''}.`}
        meta={`실적 ${ymDot(last)}`} metaTip={`통계누리 주택건설실적통계 · 자료 기간 ${ymDot(molit.months[0])} ~ ${ymDot(last)}${a.id === 'lh' ? ` · LH 준공예정 파일 기준일 ${dotDates(lh.sourceAsOf)}` : ''}`} />
      <StageKpis when={monthLabel(last)} notes={{ 3: '모집은 시행주체 구분이 없음' }} cells={Object.fromEntries(KS.map(([k]) => [k, { value: fmt(seriesOf(molit, k, NATION).actors![a.actor!][i]), sub: <>{ytdSpan(year, Number(last.slice(5)))} {fmt(ytd(molit, k, NATION, last, a.actor!))}호{prov ? <Prov /> : null}</> }]))} />
      <Card render={<section aria-label="월별 실적" />}>
        <PanelHead title="월별 실적" tip={`${area} · 호 · 빗금은 잠정치 · 통계누리 주택건설실적통계. 인허가는 연초 누계의 차분입니다. ④ 모집은 시행주체 구분이 없고, ①계획(정책·사업화)은 통계누리에 없습니다.`}>
          <StageLegend metrics={KS.map(([k]) => k)} names="board" compact />
          {molit.provisional.length ? <ProvKey /> : null}
          <SrcLink />
        </PanelHead>
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${a.name} ${area} 월별 인허가·착공·준공 호수`} />
      </Card>
      <Card render={<section aria-label="최근 12개월" />}>
        <PanelHead title="최근 12개월" tip="호" />
        <DataGrid label={`${a.name} 최근 12개월 호수`} cols={[{ key: 'ym', label: '월', kind: 'text' }, ...KS.map(([k]) => ({ key: k, label: metricBoardLabel(k) }))]}
          rows={recent.map((ym) => ({ id: ym, c: { ym: { text: ymDot(ym), href: `/month/${ym}`, sort: ym }, ...Object.fromEntries(KS.map(([k]) => [k, seriesOf(molit, k, NATION).actors![a.actor!][molit.months.indexOf(ym)]])) } }))} />
      </Card>
      {a.id === 'lh' ? (
        <Card render={<section aria-label="LH 준공 예정" />}>
          <PanelHead title="LH 준공 예정" tip={`이번 달(${ymDot(observedMonth)})부터 · 준공예정일 순 · LH 공공주택 준공예정현황(15141761) · 파일 기준일 ${dotDates(lh.sourceAsOf)}. 예정일은 그 시점의 계획입니다.${past ? ` · 예정일이 이번 달 전인 ${past}행은 뺌` : ''} · 지도 열은 수도권 블록만(사업이 있으면 그 사업, 없으면 시군구)`}>
          </PanelHead>
          <MetricRow className="mb-2" label="준공 예정" value={fmt(blocks.reduce((s, b) => s + b.units, 0))} unit="호"
            items={[`${ymDot(observedMonth)}부터`, `${fmt(blockTotal)}블록`, <span key="d">파일 기준 {dotDates(lh.sourceAsOf)}{lhStale ? <span className="ml-1.5 text-warn" title={`LH 파일 기준일 ${dotDates(lh.sourceAsOf)} — 원장 기준일 ${dotDates(observedRef)}보다 ${lhStale.replace(' 자료', '')}`}>{lhStale}</span> : null}</span>]} />
          <DataGrid label="LH 준공 예정 연도별" cols={YEAR_COLS} rows={byYear.map((r) => ({ id: r.y, c: { y: r.y, n: blockCount(r.blocks), units: r.blocks.reduce((s, b) => s + b.units, 0) } }))} />
          <DataGrid label="LH 준공 예정 블록" cols={BLOCK_COLS} maxHeight={520}
            rows={blocks.map((b, k) => ({ id: String(k), c: { date: { text: dayText(b.date), sort: b.date, href: `/month/${b.date.slice(0, 7)}` }, district: b.district, block: b.block, type: b.type, units: b.units, location: b.location, map: blockMap(b) } }))} />
        </Card>
      ) : null}
    </Page>
  );
}
