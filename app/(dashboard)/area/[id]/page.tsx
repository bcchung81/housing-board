import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import Legend from '../../../../components/charts/Legend';
import MonthLines from '../../../../components/charts/MonthLines';
import StackedMonths from '../../../../components/charts/StackedMonths';
import { ACTOR_COLOR, METRIC_COLOR } from '../../../../components/charts/palette';
import { Lede, Page, PageTitle, PanelTitle, SubTitle, cardsGrid, cols2, kpisGrid, na, sub } from '../../../../components/page';
import { Alert } from '../../../../components/ui/alert';
import { Badge } from '../../../../components/ui/badge';
import { buttonVariants } from '../../../../components/ui/button';
import { Card, cardVariants } from '../../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Basis, Kpi, Prov } from '../../../../components/ui';
import { ACTORS, METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, sidoName, valueAt, ymDot, ytd } from '../../../../lib/board/calc';
import { SGG, molit, projects } from '../../../../lib/board/data';
import { stageName } from '../../../../lib/board/stages';
import { DETAILS } from '../../../../lib/shell/menu';

const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' } as const;
type Props = { params: Promise<{ id: string }> };

/* 시도 2자리 16곳과 사업 자료가 있는 시군구는 미리 그린다. 그 밖의 시군구 5자리는 요청 때 그린다(지도는 어디든 열린다). */
export const generateStaticParams = () => [...molit.sido.filter((s) => s.code !== NATION).map((s) => ({ id: s.code })), ...Object.keys(SGG).map((id) => ({ id }))];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id.length === 2 ? sidoName(molit, id) : (SGG[id]?.name ?? id) };
}

export default async function AreaDetail({ params }: Props) {
  const { id } = await params;
  if (!DETAILS.area.id.test(id)) notFound();
  return id.length === 2 ? <SidoView code={id} /> : <SggView sgg={id} />;
}

function SidoView({ code }: { code: string }) {
  const name = sidoName(molit, code);
  if (!name || code === NATION) notFound();
  const last = lastMonth(molit), year = last.slice(0, 4);
  const lines = METRICS.map((k) => ({ key: k, label: LABEL[k], color: METRIC_COLOR[k], values: seriesOf(molit, k, code).total }));
  const actorStacks = (k: 'permit' | 'start' | 'complete') => ACTORS.map((a) => ({ key: a, label: a, color: ACTOR_COLOR[a], values: seriesOf(molit, k, code).actors![a] }));
  const recent = molit.months.slice(-12).reverse();
  const sggs = Object.entries(SGG).filter(([, s]) => s.sido === code);
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '지역별', href: '/area' }, { label: name }]} />
      <PageTitle>{name} <code>{code}</code> <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>{name}의 인허가·착공·준공·분양 월별 호수와 시행주체별 흐름. 그래프의 달을 누르면 그 달의 전국 현황으로 내려갑니다.</Lede>
      {code === '12' ? <p className="mt-2.5 mb-0 text-[12px] text-warn">2026-07부터 광주·전남이 &lsquo;전남광주&rsquo; 하나로 집계됩니다. 그 이전 달은 광주+전남을 합산한 값입니다.</p> : null}

      <div className={kpisGrid}>
        {METRICS.map((k) => (
          <Kpi key={k} label={`${LABEL[k]} · ${monthLabel(last)}`} tone={METRIC_COLOR[k]} value={fmt(valueAt(molit, k, code, last))} sub={<>{year}년 1~{Number(last.slice(5))}월 누계 {fmt(ytd(molit, k, code, last))}호{isProvisional(molit, last) ? <Prov /> : null}</>} />
        ))}
      </div>

      <Card render={<section aria-label="월별 실적" />}>
        <PanelTitle>월별 실적 <small className={sub}>· 호 · 빗금은 잠정치</small></PanelTitle>
        <Legend items={lines.map((l) => ({ label: l.label, color: l.color }))} />
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${name} 월별 인허가·착공·준공·분양 호수`} />
      </Card>

      <Card render={<section aria-label="시행주체별 월별 호수" />}>
        <PanelTitle>시행주체별 <small className={sub}>· 호 · 지자체·LH·주택업체는 공공, 민간은 민간부문</small></PanelTitle>
        <Legend items={ACTORS.map((a) => ({ label: a, color: ACTOR_COLOR[a] }))} />
        <div className={cols2}>
          {(['permit', 'start', 'complete'] as const).map((k) => (
            <div key={k}>
              <SubTitle>{LABEL[k]}</SubTitle>
              <StackedMonths months={molit.months} stacks={actorStacks(k)} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${name} 월별 ${LABEL[k]} 호수, 시행주체별`} />
            </div>
          ))}
        </div>
        <Basis>네 분류의 합이 총계와 같습니다(통계누리 시행주체 구분). 분양은 시행주체 구분이 없습니다.</Basis>
      </Card>

      <Card render={<section aria-label="최근 12개월" />}>
        <PanelTitle>최근 12개월 <small className={sub}>· 호</small></PanelTitle>
        <Table>
          <TableHeader><tr><TableHead>월</TableHead>{METRICS.map((k) => <TableHead key={k}>{LABEL[k]}</TableHead>)}</tr></TableHeader>
          <TableBody>
            {recent.map((ym) => (
              <TableRow key={ym}>
                <TableCell><Link href={`/month/${ym}`}>{ymDot(ym)}</Link>{isProvisional(molit, ym) ? <Prov /> : null}</TableCell>
                {METRICS.map((k) => <TableCell key={k}>{fmt(valueAt(molit, k, code, ym))}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Basis>통계누리 주택건설실적통계 · 인허가는 연초 누계의 차분입니다.</Basis>
      </Card>

      {sggs.length > 0 ? (
        <Card render={<section aria-label="사업 자료가 있는 시군구" />}>
          <PanelTitle>이 시도의 시군구 <small className={sub}>· 사업 자료가 있는 곳</small></PanelTitle>
          <div className={`${cardsGrid} mt-2.5`}>
            {sggs.map(([c, s]) => <Link key={c} className={cardVariants({ variant: 'link' })} href={`/area/${c}`}><b>{s.name}</b><span>사업 {projects.filter((p) => p.sgg === c).length}건</span><code>/area/{c}</code></Link>)}
          </div>
        </Card>
      ) : null}
    </Page>
  );
}

function SggView({ sgg }: { sgg: string }) {
  const sido = sgg.slice(0, 2), sidoLabel = sidoName(molit, sido);
  if (!sidoLabel) notFound();   // 행정표준코드에 없는 시도
  const info = SGG[sgg];
  const list = projects.filter((p) => p.sgg === sgg).sort((a, b) => b.stageCode.localeCompare(a.stageCode) || a.name.localeCompare(b.name, 'ko'));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '지역별', href: '/area' }, { label: sidoLabel, href: `/area/${sido}` }, { label: info?.name ?? sgg }]} />
      <PageTitle>{info?.name ?? '시군구'} <code>{sgg}</code></PageTitle>
      <Lede>{list.length > 0 ? `사업 id 레지스트리에 연결된 사업 ${list.length}건.` : '이 시군구의 사업 자료는 아직 적재되지 않았습니다.'} 시군구 단위 실적 통계는 없고(통계누리는 시도 단위), 시도 실적은 {sidoLabel} 화면에서 봅니다.</Lede>
      <p className="flex flex-wrap gap-2.5">
        <a className={buttonVariants({ className: 'mt-3' })} href={`/map?sgg=${sgg}`}>이 동네 지도</a>
        <Link className={buttonVariants({ variant: 'outline', className: 'mt-3' })} href={`/area/${sido}`}>{sidoLabel} 실적</Link>
      </p>

      {list.length > 0 ? (
        <Card render={<section aria-label="사업 목록" />}>
          <PanelTitle>사업 <small className={sub}>· {list.length}건 · 행을 누르면 사업 상세</small></PanelTitle>
          <Table>
            <TableHeader><tr><TableHead>사업</TableHead><TableHead>단계</TableHead><TableHead>세대수</TableHead><TableHead>위치</TableHead></tr></TableHeader>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="min-w-[180px] whitespace-normal"><Link href={`/project/${p.id}`}>{p.name}</Link></TableCell>
                  <TableCell>{p.stageCode} {stageName(p.stageCode)}</TableCell>
                  <TableCell>{p.units ? fmt(p.units) : <span className={na}>미확인</span>}</TableCell>
                  <TableCell>{p.pnus && p.pnus.length ? `필지 ${p.pnus.length}` : <span className={na}>위치 미연결</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Basis>사업 id 레지스트리({list[0].asOf} 기준). 사업 단계는 건축HUB 인허가 기록과 지도 번들 상태를 6단계로 옮긴 제안 매핑(스펙 9.2)의 값입니다.</Basis>
        </Card>
      ) : (
        <Alert><b>사업 자료 없음</b> — 사업 id 레지스트리가 다루는 시군구는 5곳입니다. 지도는 번들이 없는 지역도 경계·건물·건축HUB 인허가 사업을 요청 시 조회해 엽니다.</Alert>
      )}
    </Page>
  );
}
