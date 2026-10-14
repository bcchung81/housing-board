import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PanelLink from '../../../../components/board/PanelLink';
import { Page, PageHead, PanelHead, SrcLink, cardsGrid, sub } from '../../../../components/page';
import { buttonVariants } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Kpi } from '../../../../components/ui';
import { METRIC_COLOR } from '../../../../components/charts/palette';
import Legend from '../../../../components/charts/Legend';
import StockLines, { HOUSEHOLD_COLOR, STOCK_COLOR } from '../../../../components/charts/StockLines';
import areaFactsJson from '../../../../data/board/area-facts.json';
import { conditions, stockChart, type AreaFactsDoc } from '../../../../lib/board/area-facts';
import { NATION, addrText, fmt, foldEmptyMonths, lhCalendar, monthLabel, nextYm, sidoName, ymDot } from '../../../../lib/board/calc';
import { SGG, getBoardData } from '../../../../lib/board/data';
import { STAGES } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';

type Props = { params: Promise<{ sido: string }> };
export const generateStaticParams = async () => (await getBoardData()).molit.sido.filter((s) => s.code !== NATION).map((s) => ({ sido: s.code }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sido } = await params;
  const { molit } = await getBoardData();
  return { title: `${sidoName(molit, sido) ?? sido} 우리 동네` };
}

const areaFacts = areaFactsJson as AreaFactsDoc;
const COND_TIP = '숫자마다 기준연도가 다릅니다 · 재고−가구 차이는 공급 부족 확정치가 아님(공실·점유·실입주량은 이 자료에 없음) · KOSIS·SGIS(HOME 지역 지표)';
const day = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
/* 이어진 빈 달 한 칸의 이름: '2027년 3월 ~ 7월'(해가 바뀌면 '2026년 10월 ~ 2027년 1월') */
const spanName = (from: string, to: string) => (from === to ? monthLabel(from) : `${monthLabel(from)} ~ ${from.slice(0, 4) === to.slice(0, 4) ? `${Number(to.slice(5))}월` : monthLabel(to)}`);

/* 우리 동네 시도(L2): 앞으로 12개월 달력(달마다 LH 준공 예정 단지) + 그 시도의 등록 사업(지금 단계를 쉬운 말로) + 지도. 9.4·9.30 지시. */
export default async function MyAreaSido({ params }: Props) {
  const { sido } = await params;
  const { AHEAD_FROM, lh, molit, projects } = await getBoardData();
  if (!DETAILS['my-area'].id.test(sido) || !molit.sido.some((s) => s.code === sido && s.code !== NATION)) notFound();
  const name = sidoName(molit, sido)!, cal = lhCalendar(lh, sido, AHEAD_FROM, 12), list = projects.filter((p) => SGG[p.sgg]?.sido === sido);
  const total = cal.reduce((a, m) => ({ n: a.n + m.blocks.length, units: a.units + m.units }), { n: 0, units: 0 });
  const busy = cal.filter((m) => m.blocks.length).length;
  const until = nextYm(AHEAD_FROM, 11);
  const cond = conditions(areaFacts, sido), chart = stockChart(areaFacts, sido);
  const ymd = (p: string) => p.replace('-', '.');
  return (
    <Page>
      <PageHead crumbs={[{ label: '종합상황판', href: '/' }, { label: '우리 동네', href: '/my-area' }, { label: name }]} title={`${name} 우리 동네 공급 소식`}
        tip={`앞으로 1년(${monthLabel(AHEAD_FROM)} ~ ${monthLabel(until)}) 동안 ${name}에서 공사를 마칠 예정인 공공주택(LH)과, 상황판에 등록된 사업이 지금 어느 단계인지 알려 드립니다.`}
        meta={`${ymDot(AHEAD_FROM)} ~ ${ymDot(until)}`} metaTip={`앞으로 1년(${monthLabel(AHEAD_FROM)} ~ ${monthLabel(until)})`} />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-2.5">
        <Kpi label="1년 안 준공 예정" unit="세대" tone={METRIC_COLOR.complete} value={fmt(total.units)} sub={`${total.n}곳 · ${busy}개월에 걸쳐`} />
        <Kpi label="상황판 등록 사업" unit="건" value={fmt(list.length)} />
      </div>

      <Card render={<section aria-label="앞으로 12개월 공급 달력" />}>
        <PanelHead title="앞으로 12개월 공급 달력" tip={`LH 준공 예정 · 달마다 · LH 공공주택 준공예정현황(15141761) · 파일 기준일 ${lh.sourceAsOf}. 준공 예정일은 계획이라 바뀔 수 있고, 모집(청약) 일정과는 다릅니다.`} />
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] items-start gap-2.5 p-0">
          {foldEmptyMonths(cal).map((x) => x.kind === 'empty' ? (
            <li key={x.from} className="rounded-[10px] border border-dashed border-line2 bg-muted px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-[17px]">{spanName(x.from, x.to)}</b>
                <span className="text-[14px] text-muted-foreground">예정 없음</span>
              </div>
            </li>
          ) : (
            <li key={x.m.ym} className="rounded-[10px] border border-border px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-[17px]">{monthLabel(x.m.ym)}</b>
                <span className="text-[14px] text-muted-foreground tabular-nums">{`${x.m.blocks.length}곳 · ${fmt(x.m.units)}세대`}</span>
              </div>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                  {x.m.blocks.map((b, i) => (
                    <li key={i} className="border-t border-border pt-1.5 text-[14px] leading-[1.5] first:border-t-0 first:pt-0">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2"><b className="text-[15px]">{b.district}{b.block && b.block !== '1' ? ` ${b.block}블록` : ''}</b><span className="tabular-nums">{fmt(b.units)}세대</span></span>
                      <span className="block text-muted-foreground">{b.type} · {day(b.date)} 준공 예정</span>
                      <span className="block text-muted-foreground [overflow-wrap:anywhere]">{addrText(b.location)}</span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>

      <Card render={<section aria-label="동네 여건" />}>
        <PanelHead title="동네 여건" tip={cond ? `${name} · ${COND_TIP}` : `${name}은 동네 여건 자료가 없습니다. 지금은 서울·인천·경기만 있습니다.`}>
          {cond ? <SrcLink /> : <span className={`${sub} whitespace-nowrap`}>자료 없음</span>}
        </PanelHead>
        {cond ? (
          <>
            <div className={cardsGrid}>
              <Kpi label="인구" unit="명" value={cond.population ? fmt(cond.population.value) : '–'} sub={cond.population?.period} tip="인구총조사 기반 총인구 · 일반가구와 같은 연도 비교용(주민등록인구와 분모가 다름)" />
              <Kpi label="일반가구" unit="가구" value={cond.households ? fmt(cond.households.value) : '–'} sub={cond.households?.period} tip="KOSIS 일반가구 수" />
              <Kpi label="주택 재고" value={cond.housingUnits ? fmt(cond.housingUnits.value) : '–'} sub={cond.housingUnits?.period} tip="KOSIS 주택 수 · 같은 연도의 일반가구와 비교하는 값" />
              <Kpi label="미분양" value={cond.unsold ? fmt(cond.unsold.value) : '–'} sub={cond.unsold ? `${ymd(cond.unsold.period)}${cond.unsold.completed !== null ? ` · 준공 후 ${fmt(cond.unsold.completed)}` : ''}` : undefined} tip="미분양주택현황 월말 재고 · 신규 공급 실적 아님" />
            </div>
            {chart ? (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="m-0 text-[16px] font-normal text-muted-foreground" title={`${name} · ${chart.years[0]}~${chart.lastActual} 실적${chart.years.length > chart.years.indexOf(chart.lastActual) + 1 ? `, ${chart.lastActual + 1}~${chart.years[chart.years.length - 1]}은 장래가구 추계(점선)` : ''} · 재고−가구 차이는 공급 부족 확정치가 아님`}>주택 재고 · 일반가구</h3>
                  <span className="ml-auto"><Legend items={[{ label: '주택 재고', color: STOCK_COLOR }, { label: '일반가구', color: HOUSEHOLD_COLOR }, { label: '장래가구 추계(점선)', color: 'var(--line2)' }]} /></span>
                </div>
                <StockLines chart={chart} label={`${name} 주택 재고와 일반가구 ${chart.years[0]}~${chart.lastActual}, 장래가구 추계`} />
              </>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card render={<section aria-label="상황판 등록 사업" />}>
        <PanelHead title="진행 중인 사업" tip="상황판에 등록된 사업과 지금 단계 · 사업 id 레지스트리 기준. 단계는 6단계(01 정책 ~ 06 입주)이고, 단계마다 답하는 질문은 단계 표지에 마우스를 올리면 보입니다.">
          <PanelLink href="/projects" full="단계별 사업은 사업(현황표)">사업(현황표)</PanelLink>
        </PanelHead>
        {list.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {list.sort((a, b) => b.stageCode.localeCompare(a.stageCode) || a.name.localeCompare(b.name, 'ko')).map((p) => {
              const st = STAGES.find((s) => s.code === p.stageCode);
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <span className="min-w-0"><Link href={`/project/${p.id}`} className="text-foreground no-underline underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{p.name}</Link> <span className="text-[14px] text-muted-foreground">{SGG[p.sgg]?.name}{p.units ? ` · ${fmt(p.units)}세대` : ''}</span></span>
                  <b className={`text-[14px] whitespace-nowrap ${st?.scope === 'pub' ? 'text-[var(--scope-pub)]' : 'text-[var(--scope-gov)]'}`} title={st?.q}>{p.stageCode} {st?.name}</b>
                </li>
              );
            })}
          </ul>
        ) : <p className={`${sub} m-0`} title="사업 id 레지스트리는 지금 5개 시군구(서울 성북·인천 계양·경기 하남·전남광주 나주·광산)만 다룹니다.">이 지역은 아직 상황판에 등록된 사업이 없습니다.</p>}
        {Object.entries(SGG).some(([, s]) => s.sido === sido) ? (
          <p className="mt-4 mb-0 flex flex-wrap gap-2">
            {Object.entries(SGG).filter(([, s]) => s.sido === sido).map(([code, s]) => <a key={code} className={buttonVariants()} href={`/map?sgg=${code}`}>{s.name} 지도에서 보기</a>)}
          </p>
        ) : null}
      </Card>

      <p className={`${sub} m-0 text-[13px]`} title={`LH 공공주택 준공예정현황(15141761) · 파일 기준일 ${lh.sourceAsOf}. 준공 예정일은 계획이라 바뀔 수 있고, 모집(청약) 일정과는 다릅니다.`}>LH 준공예정 · 파일 기준일 {lh.sourceAsOf} · 일정은 바뀔 수 있습니다. 청약·입주 자격은 각 모집공고에서 직접 확인하세요.</p>
    </Page>
  );
}
