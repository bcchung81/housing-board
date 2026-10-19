import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import PanelLink from '@/components/board/PanelLink';
import { ACTOR_COLOR } from '@/components/charts/palette';
import { Dash, Page, PageHead, PanelHead, SrcLink, sub } from '@/components/page';
import StageKpis from '@/components/StageKpis';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { ACTORS, METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, monthTable, neighborMonths, seriesOf, sidoName, lhOfMonth, lhUnits, staleText, ymDot } from '@/lib/board/calc';
import { getBoardData } from '@/lib/board/data';
import { getProjectsIndex } from '@/lib/board/projects-index';
import { dateAltOf, dayText, isMetro, statusLabel } from '@/lib/board/projects-view';
import { mapCell, sggLabel } from '@/lib/board/projects-list';
import { pastDue, projectHref, type CalendarDoc } from '@/lib/board/region';
import { dueStatus, monthDue, monthIds } from '@/lib/board/month-ahead';
import { metricBoardLabel } from '@/lib/board/stages';
import { DETAILS } from '@/lib/shell/menu';
import { dotDates, type Col } from '@/lib/grid/spec';
import calendarJson from '@/data/board/region-calendar.json';

const ACT_KS = ['permit', 'start', 'complete'] as const;
const LH_COLS: Col[] = [{ key: 'district', label: '사업지구', kind: 'text', wrap: true }, { key: 'block', label: '블록', kind: 'text' }, { key: 'type', label: '공급유형', kind: 'text' }, { key: 'units', label: '호수' }, { key: 'date', label: '준공예정일', kind: 'text' }, { key: 'location', label: '위치', kind: 'text', wrap: true }];
/* 원장 그 달 준공 예정 표: 예정일(HOME 정본 — LH 파일 날짜가 다르면 꼬리표) · 사업(상세 서랍) · 시군구 · 호수 · 상태 · 지도(수도권) */
const DUE_COLS: Col[] = [{ key: 'day', label: '준공 예정일', kind: 'text' }, { key: 'name', label: '사업', kind: 'text', wrap: true }, { key: 'sgg', label: '시군구', kind: 'text' }, { key: 'units', label: '호수' }, { key: 'status', label: '상태', kind: 'text' }, { key: 'map', label: '지도', kind: 'text', sort: false }];
const calendar = calendarJson as unknown as CalendarDoc;
type Props = { params: Promise<{ id: string }> };

/* 월 상세: 그 달의 인허가·착공·모집·준공(시도별·시행주체별, 통계누리 실적), 원장 준공 예정(종합상황판 '앞으로 12개월'·지역 공급과 같은 자료)과 LH 준공 예정 블록.
   실적이 있는 달, 원장 준공 예정이 있는 달, LH 예정 달만 열린다(monthIds — 종합상황판의 월 링크도 같은 목록). */
export const generateStaticParams = async () => {
  const { molit, lh } = await getBoardData();
  return monthIds(molit.months, lh.blocks, calendar).map((id) => ({ id }));
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `${monthLabel(id)}` };
}

export default async function MonthPage({ params }: Props) {
  const { id: ym } = await params;
  const { molit, lh } = await getBoardData();
  const allMonths = monthIds(molit.months, lh.blocks, calendar);
  if (!DETAILS.month.id.test(ym) || !allMonths.includes(ym)) notFound();
  const actual = molit.months.includes(ym);
  const blocks = lhOfMonth(lh, ym);
  const blockTotal = new Set(blocks.map((b) => `${b.district}|${b.block}`)).size;   // 파일 한 행은 블록×공급유형 — 고유 블록으로 센다
  const idx = await getProjectsIndex();
  const past = ym < idx.observedMonth;   // 지난 달의 예정은 실제로 준공했는지 모른다
  /* 원장 그 달 준공 예정(원장 범위 — 수도권): 종합상황판 '앞으로 12개월' 그 달 막대·지역 공급 준공 예정과 같은 건수·호수 */
  const due = monthDue(calendar, ym), dueUnits = due.reduce((n, e) => n + e.units, 0);
  const byId = new Map(idx.rows.map((r) => [r.id, r]));
  const sidoShort = (c: string) => molit.sido.find((x) => x.code === c)?.name;
  const dueRows = due.map((e) => {
    const r = byId.get(e.id), alt = r ? dateAltOf(r) : null, href = projectHref(e, '');
    const status = r ? dueStatus(statusLabel(r), pastDue(e, calendar.referenceDate)) : null;
    return { id: e.id, c: {
      day: { text: e.day ? dayText(e.day) : ymDot(e.ym), sort: e.day ?? `${e.ym}-99`, ...(alt ? { tag: alt.text, title: alt.title } : {}) },
      name: { text: e.name, href }, sgg: sggLabel(e.sgg, sidoShort(e.sd)), units: e.units,
      status: status ? { text: status, ...(status !== statusLabel(r!) ? { title: `준공 예정일 ${dayText(e.day!)}이 원장 기준일(${dotDates(calendar.referenceDate)})보다 앞섰는데 실제 기록이 아직 없음 — 경과 1개월 미만이라 상태는 그대로` } : {}) } : null,
      map: r && isMetro(r.sgg) ? mapCell(r) : null,
    } };
  });
  const last = lastMonth(molit);
  const nb = actual ? neighborMonths(molit, ym) : { prev: allMonths[allMonths.indexOf(ym) - 1] ?? null, next: allMonths[allMonths.indexOf(ym) + 1] ?? null };
  const table = actual ? monthTable(molit, ym) : [];
  const nation = table.find((r) => r.code === NATION), area = sidoName(molit, NATION) ?? '전국';   // 범위 이름(통계누리 합계 자리 — 수도권, lib/board/data.ts)
  const i = molit.months.indexOf(ym);
  const lhStale = staleText(lh.sourceAsOf, calendar.referenceDate);   // LH 파일 낡음 표지(원장 기준일과의 차이 — 기관 화면과 같은 기준)
  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: monthLabel(ym) }]} title={monthLabel(ym)}
        tip={actual ? `${area}·시도별 인허가·착공·모집·준공 호수와 시행주체별 호수${due.length ? ', 원장 준공 예정 사업' : ''}${blocks.length ? ', 그 달에 준공 예정이던 LH 블록' : ''}.` : `실적 자료가 없는 달(자료는 ${ymDot(molit.months[0])}~${ymDot(last)})입니다. ${due.length ? '원장 준공 예정 사업' : ''}${due.length && blocks.length ? '과 ' : ''}${blocks.length ? 'LH 준공 예정 블록' : ''}만 있습니다.`}>
        {actual ? <Badge variant="ok" title="통계누리 실적이 있는 달">실적</Badge> : <Badge title="실적 자료가 없는 달 — 준공 예정만">예정</Badge>}
        {actual && isProvisional(molit, ym) ? <Badge variant="warn" title="통계누리가 잠정치로 낸 달입니다. 확정치는 2027년 9월 공표 예정">잠정</Badge> : null}
        <nav aria-label="이웃 달" className="ml-auto flex gap-4">
          {nb.prev ? <Link href={`/month/${nb.prev}`} title={`이전 달 ${monthLabel(nb.prev)}`} className="inline-flex items-center gap-px rounded-chip text-sm text-muted-foreground no-underline underline-offset-[3px] tabular-nums transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><ChevronLeft className="size-3.5" aria-hidden="true" />{ymDot(nb.prev)}</Link> : null}
          {nb.next ? <PanelLink href={`/month/${nb.next}`} full={`다음 달 ${monthLabel(nb.next)}`}>{ymDot(nb.next)}</PanelLink> : null}
        </nav>
      </PageHead>

      {actual && nation ? (
        <>
          <StageKpis when={area} cells={Object.fromEntries(METRICS.map((k) => [k, { value: k === 'permit' && nation.values[k] === null ? <Dash why="자료가 이 달부터라 월 흐름을 알 수 없음" /> : fmt(nation.values[k]) }]))} />

          <Card render={<section aria-label="시도별" />}>
            <PanelHead title="시도별" tip="호 · 통계누리 주택건설실적통계. 인허가는 연초 누계의 차분입니다."><SrcLink /></PanelHead>
            <DataGrid label={`${monthLabel(ym)} 시도별 호수`} cols={[{ key: 'name', label: '시도', kind: 'text' }, ...METRICS.map((k) => ({ key: k, label: metricBoardLabel(k) }))]}
              rows={table.map((r) => ({ id: r.code, pin: r.code === NATION ? 'top' : undefined, c: { name: r.code === NATION ? area : { text: r.name, href: `/region?sido=${r.code}` }, ...r.values } }))} />
          </Card>

          <Card render={<section aria-label="시행주체별" />}>
            <PanelHead title="시행주체별" tip={`${area} · 호 · ④ 모집은 시행주체 구분이 없습니다. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다.`} />
            <DataGrid label={`${monthLabel(ym)} 시행주체별 호수`} cols={[{ key: 'actor', label: '시행주체', kind: 'text' }, ...ACT_KS.map((k) => ({ key: k, label: metricBoardLabel(k) }))]}
              rows={[
                ...ACTORS.map((a) => ({ id: a, c: { actor: { text: a, swatch: ACTOR_COLOR[a] }, ...Object.fromEntries(ACT_KS.map((k) => [k, seriesOf(molit, k, NATION).actors![a][i]])) } })),
                { id: 'total', pin: 'bottom', c: { actor: '총계', ...Object.fromEntries(ACT_KS.map((k) => [k, seriesOf(molit, k, NATION).total[i]])) } },
              ]} />
          </Card>
        </>
      ) : null}

      {due.length ? (
        <Card render={<section aria-label="준공 예정 사업" />}>
          <PanelHead title="준공 예정 사업" tip={`사업 원장 ${ymDot(calendar.observedMonth)} · 준공 실제가 없는 사업의 준공 현재 예정(사업당 하나) · ${area} · 종합상황판 '앞으로 12개월'·지역 공급의 준공 예정과 같은 자료·같은 값 · 날짜는 HOME 정본, LH 파일 날짜가 다르면 '원천 날짜 다름' · 예정일 지남 = 원장 기준일(${dotDates(calendar.referenceDate)})보다 앞섰는데 실제 기록 없음(합계에 포함)`}>
            <span className={`${sub} tabular-nums`}>{fmt(due.length)}건 · {fmt(dueUnits)}호 · 원장 {dotDates(calendar.referenceDate)}</span>
            <PanelLink href={`/region?sido=all&m=${ym}`} full={`지역 공급에서 ${monthLabel(ym)} 준공 예정 보기(${area})`}>지역 공급</PanelLink>
          </PanelHead>
          <DataGrid label={`${monthLabel(ym)} 준공 예정 사업`} cols={DUE_COLS} rows={dueRows} quietCount />
        </Card>
      ) : null}

      <Card render={<section aria-label="LH 준공 예정" />}>
        <PanelHead title="LH 준공 예정" tip={`LH 공공주택 준공예정현황(공공데이터포털 15141761) · 파일 기준일 ${dotDates(lh.sourceAsOf)}${lhStale ? `(원장 기준일 ${dotDates(calendar.referenceDate)}보다 ${lhStale.replace(' 자료', '')})` : ''}. 예정일은 그 시점의 계획이며 이후 바뀌었을 수 있습니다.${due.length ? ' · 날짜는 파일 값 그대로(위 준공 예정 사업은 HOME 날짜 — 다르면 원천 날짜 다름 표지)' : ''}`}>
          <span className={`${sub} tabular-nums`}>{blockTotal}블록 · {fmt(lhUnits(blocks))}호{past && blocks.length ? <span title="파일상 예정일 — 실제 준공 여부 미확인"> · 예정(미확인)</span> : null} · 파일 기준 {dotDates(lh.sourceAsOf)}{lhStale ? <Badge variant="warn" className="ml-1.5" title={`LH 파일 기준일 ${dotDates(lh.sourceAsOf)} — 원장 기준일 ${dotDates(calendar.referenceDate)}보다 ${lhStale.replace(' 자료', '')}`}>{lhStale}</Badge> : null}</span>
          {actual ? null : <SrcLink />}
        </PanelHead>
        {blocks.length > 0 ? (
          <DataGrid label={`${monthLabel(ym)} LH 준공 예정 블록`} cols={LH_COLS} rows={blocks.map((b, k) => ({ id: String(k), c: { district: b.district, block: b.block, type: b.type, units: b.units, date: dayText(b.date), location: b.location } }))} />
        ) : <p className={`${sub} m-0`}>이 달에 준공 예정인 LH 블록이 파일에 없습니다.</p>}
      </Card>
    </Page>
  );
}
