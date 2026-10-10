import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import { Lede, Page, PageTitle, PanelTitle, kpisGrid, sub } from '../../../../components/page';
import { Alert } from '../../../../components/ui/alert';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { Basis, Kpi } from '../../../../components/ui';
import { METRIC_COLOR } from '../../../../components/charts/palette';
import { AHEAD_FROM, NATION, fmt, lhCalendar, monthLabel, nextYm, sidoName } from '../../../../lib/board/calc';
import { SGG, lh, molit, projects } from '../../../../lib/board/data';
import { STAGES } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';

type Props = { params: Promise<{ sido: string }> };
export const dynamicParams = false;
const SIDO = molit.sido.filter((s) => s.code !== NATION);
export const generateStaticParams = () => SIDO.map((s) => ({ sido: s.code }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sido } = await params;
  return { title: `${sidoName(molit, sido) ?? sido} 우리 동네` };
}

const day = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/* 우리 동네 시도(L2): 앞으로 12개월 달력(달마다 LH 준공 예정 단지) + 그 시도의 등록 사업(지금 단계를 쉬운 말로) + 지도. 9.4·9.30 지시. */
export default async function MyAreaSido({ params }: Props) {
  const { sido } = await params;
  if (!DETAILS['my-area'].id.test(sido) || !SIDO.some((s) => s.code === sido)) notFound();
  const name = sidoName(molit, sido)!, cal = lhCalendar(lh, sido, AHEAD_FROM, 12), list = projects.filter((p) => SGG[p.sgg]?.sido === sido);
  const total = cal.reduce((a, m) => ({ n: a.n + m.blocks.length, units: a.units + m.units }), { n: 0, units: 0 });
  const busy = cal.filter((m) => m.blocks.length).length;
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '우리 동네', href: '/my-area' }, { label: name }]} />
      <PageTitle>{name} 우리 동네 공급 소식 <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>앞으로 1년({monthLabel(AHEAD_FROM)} ~ {monthLabel(nextYm(AHEAD_FROM, 11))}) 동안 {name}에서 공사를 마칠 예정인 공공주택(LH)과, 상황판에 등록된 사업이 지금 어느 단계인지 알려 드립니다.</Lede>

      <div className={kpisGrid}>
        <Kpi label="1년 안 준공 예정" unit="세대" tone={METRIC_COLOR.complete} value={fmt(total.units)} sub={`${total.n}곳 · ${busy}개월에 걸쳐`} />
        <Kpi label="상황판 등록 사업" unit="건" value={fmt(list.length)} sub={list.length ? '아래에서 지금 단계를 볼 수 있습니다' : '이 지역은 아직 등록된 사업이 없습니다'} />
      </div>

      <Card render={<section aria-label="앞으로 12개월 공급 달력" />}>
        <PanelTitle>앞으로 12개월 공급 달력 <small className={sub}>· LH 준공 예정 · 달마다</small></PanelTitle>
        <ol className="m-0 mt-1 grid list-none grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] items-start gap-2.5 p-0">
          {cal.map((m) => (
            <li key={m.ym} className={m.blocks.length ? 'card-soft rounded-[12px] border border-border bg-card px-3.5 py-3' : 'rounded-[12px] border border-dashed border-line2 bg-muted px-3.5 py-3'}>
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-[17px]">{monthLabel(m.ym)}</b>
                <span className="text-[14px] text-muted-foreground tabular-nums">{m.blocks.length ? `${m.blocks.length}곳 · ${fmt(m.units)}세대` : '예정 없음'}</span>
              </div>
              {m.blocks.length ? (
                <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                  {m.blocks.map((b, i) => (
                    <li key={i} className="border-t border-border pt-1.5 text-[14px] leading-[1.5] first:border-t-0 first:pt-0">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2"><b className="text-[15px]">{b.district}{b.block && b.block !== '1' ? ` ${b.block}블록` : ''}</b><span className="tabular-nums">{fmt(b.units)}세대</span></span>
                      <span className="block text-muted-foreground">{b.type} · {day(b.date)} 준공 예정</span>
                      <span className="block text-muted-foreground [overflow-wrap:anywhere]">{b.location}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
        <Basis>LH 공공주택 준공예정현황(15141761) · 파일 기준일 {lh.sourceAsOf}. 준공 예정일은 계획이라 바뀔 수 있고, 모집(청약) 일정과는 다릅니다. 청약·입주 자격은 각 모집공고에서 직접 확인하세요.</Basis>
      </Card>

      <Card render={<section aria-label="상황판 등록 사업" />}>
        <PanelTitle>진행 중인 사업 <small className={sub}>· 상황판에 등록된 사업과 지금 단계</small></PanelTitle>
        {list.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {list.sort((a, b) => b.stageCode.localeCompare(a.stageCode) || a.name.localeCompare(b.name, 'ko')).map((p) => {
              const st = STAGES.find((s) => s.code === p.stageCode);
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <span className="min-w-0"><Link href={`/project/${p.id}`}>{p.name}</Link> <span className="text-[14px] text-muted-foreground">{SGG[p.sgg]?.name}{p.units ? ` · ${fmt(p.units)}세대` : ''}</span></span>
                  <span className="text-[14px]"><b className={st?.scope === 'pub' ? 'text-[var(--scope-pub)]' : 'text-[var(--scope-gov)]'}>{p.stageCode} {st?.name}</b> <span className="text-muted-foreground">— {st?.q}</span></span>
                </li>
              );
            })}
          </ul>
        ) : <Alert className="mt-0">이 지역은 아직 상황판에 등록된 사업이 없습니다. 사업 id 레지스트리는 지금 5개 시군구(서울 성북·인천 계양·경기 하남·전남광주 나주·광산)만 다룹니다.</Alert>}
        {Object.entries(SGG).some(([, s]) => s.sido === sido) ? (
          <p className="mt-3 mb-0 flex flex-wrap gap-2 text-[15px]">
            {Object.entries(SGG).filter(([, s]) => s.sido === sido).map(([code, s]) => <a key={code} className="card-lift rounded-[8px] border border-border px-3 py-1.5 no-underline hover:bg-pn2" href={`/map?sgg=${code}`}>{s.name} 지도에서 보기</a>)}
          </p>
        ) : null}
        <Basis>사업 id 레지스트리 기준. 단계는 6단계(01 정책 ~ 06 입주)이고, 단계마다 답하는 질문을 함께 적었습니다. 단계 설명은 <Link href="/stage">단계별</Link>.</Basis>
      </Card>
    </Page>
  );
}
