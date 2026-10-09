import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import Legend from '../../../../components/charts/Legend';
import MonthLines from '../../../../components/charts/MonthLines';
import { METRIC_COLOR } from '../../../../components/charts/palette';
import { Lede, Page, PageTitle, PanelTitle, kpisGrid, na, sub } from '../../../../components/page';
import { Alert } from '../../../../components/ui/alert';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Basis, Kpi, Prov } from '../../../../components/ui';
import { NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, ymDot, ytd } from '../../../../lib/board/calc';
import { AGENCIES } from '../../../../lib/board/agencies';
import { lh, molit, sources } from '../../../../lib/board/data';
import { DETAILS } from '../../../../lib/shell/menu';

type Props = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => AGENCIES.map((a) => ({ id: a.id }));
const KS = [['permit', '인허가'], ['start', '착공'], ['complete', '준공']] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: AGENCIES.find((a) => a.id === id)?.name };
}

export default async function AgencyDetail({ params }: Props) {
  const { id } = await params;
  const a = DETAILS.agency.id.test(id) ? AGENCIES.find((x) => x.id === id) : undefined;
  if (!a) notFound();
  const crumbs = [{ label: '종합상황판', href: '/' }, { label: '기관별', href: '/agency' }, { label: a.name }];

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
            <Table>
              <TableHeader><tr><TableHead>데이터셋</TableHead><TableHead>건수</TableHead><TableHead>원천 기준일</TableHead></tr></TableHeader>
              <TableBody>{files.map((s) => <TableRow key={s.id}><TableCell className="min-w-[180px] whitespace-normal"><Link href={`/sources#${s.id}`}>{s.dataset}</Link></TableCell><TableCell>{fmt(s.count)}</TableCell><TableCell>{s.sourceAsOf ?? <span className={na}>확인하지 못함</span>}</TableCell></TableRow>)}</TableBody>
            </Table>
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
      <div className={kpisGrid}>
        {KS.map(([k, l]) => <Kpi key={k} label={`${l} · ${monthLabel(last)}`} tone={METRIC_COLOR[k]} value={fmt(seriesOf(molit, k, NATION).actors![a.actor][i])} sub={<>{year}년 누계 {fmt(ytd(molit, k, NATION, last, a.actor))}호{isProvisional(molit, last) ? <Prov /> : null}</>} />)}
      </div>
      <Card render={<section aria-label="월별 실적" />}>
        <PanelTitle>월별 실적 <small className={sub}>· 전국 · 호 · 빗금은 잠정치</small></PanelTitle>
        <Legend items={lines.map((l) => ({ label: l.label, color: l.color }))} />
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${a.name} 전국 월별 인허가·착공·준공 호수`} />
        <Basis>통계누리 주택건설실적통계. 인허가는 연초 누계의 차분입니다.</Basis>
      </Card>
      <Card render={<section aria-label="최근 12개월" />}>
        <PanelTitle>최근 12개월 <small className={sub}>· 호</small></PanelTitle>
        <Table>
          <TableHeader><tr><TableHead>월</TableHead>{KS.map(([, l]) => <TableHead key={l}>{l}</TableHead>)}</tr></TableHeader>
          <TableBody>{recent.map((ym) => <TableRow key={ym}><TableCell><Link href={`/month/${ym}`}>{ymDot(ym)}</Link></TableCell>{KS.map(([k]) => <TableCell key={k}>{fmt(seriesOf(molit, k, NATION).actors![a.actor!][molit.months.indexOf(ym)])}</TableCell>)}</TableRow>)}</TableBody>
        </Table>
      </Card>
      {a.id === 'lh' ? (
        <Card render={<section aria-label="LH 준공 예정" />}>
          <PanelTitle>LH 준공 예정 <small className={sub}>· {lh.count}블록 · {fmt(lh.units)}세대 · 준공예정일 순</small></PanelTitle>
          <Table>
            <TableHeader><tr><TableHead>연도</TableHead><TableHead>블록</TableHead><TableHead>세대수</TableHead></tr></TableHeader>
            <TableBody>{byYear.map((r) => <TableRow key={r.y}><TableCell>{r.y}</TableCell><TableCell>{r.blocks.length}</TableCell><TableCell>{fmt(r.blocks.reduce((s, b) => s + b.units, 0))}</TableCell></TableRow>)}</TableBody>
          </Table>
          <Table containerClassName="max-h-[520px] overflow-y-auto">
            <TableHeader><tr><TableHead>준공예정일</TableHead><TableHead>사업지구</TableHead><TableHead>블록</TableHead><TableHead>공급유형</TableHead><TableHead>세대수</TableHead><TableHead>위치</TableHead></tr></TableHeader>
            <TableBody>{lh.blocks.map((b, k) => <TableRow key={k}><TableCell><Link href={`/month/${b.date.slice(0, 7)}`}>{b.date}</Link></TableCell><TableCell className="min-w-[180px] whitespace-normal">{b.district}</TableCell><TableCell>{b.block}</TableCell><TableCell>{b.type}</TableCell><TableCell>{fmt(b.units)}</TableCell><TableCell className="min-w-[180px] whitespace-normal">{b.location}</TableCell></TableRow>)}</TableBody>
          </Table>
          <Basis>LH 공공주택 준공예정현황(15141761) · 파일 기준일 {lh.sourceAsOf}. 예정일은 그 시점의 계획입니다.</Basis>
        </Card>
      ) : null}
    </Page>
  );
}
