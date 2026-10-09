import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import Legend from '../../../../components/charts/Legend';
import MonthLines from '../../../../components/charts/MonthLines';
import { METRIC_COLOR } from '../../../../components/charts/palette';
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
      <div className="page">
        <Crumbs items={crumbs} />
        <h1>{a.name} <span className="pill">준비 중</span></h1>
        <p className="lede">{a.summary}.</p>
        <div className="box"><b>기관별 신호(정상·주의·지연)는 일정(당초·변경·현재 예정)이 없어 판정하지 않습니다.</b> {a.id === 'mnd' ? '군인 특별공급(국방부)은 수작업 입력 대기 상태입니다.' : null}</div>
        {files.length ? (
          <section className="panel" aria-label="받은 원천 파일">
            <h2>받은 원천 파일 <small className="sub">· {files.length}종 · 아직 화면에서 쓰지 않음</small></h2>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>데이터셋</th><th>건수</th><th>원천 기준일</th></tr></thead>
                <tbody>{files.map((s) => <tr key={s.id}><td className="wrap"><Link href={`/sources#${s.id}`}>{s.dataset}</Link></td><td>{fmt(s.count)}</td><td>{s.sourceAsOf ?? <span className="na">확인하지 못함</span>}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  const last = lastMonth(molit), year = last.slice(0, 4);
  const lines = KS.map(([k, l]) => ({ key: k, label: l, color: METRIC_COLOR[k], values: seriesOf(molit, k, NATION).actors![a.actor] }));
  const i = molit.months.indexOf(last);
  const byYear = [...new Set(lh.blocks.map((b) => b.date.slice(0, 4)))].map((y) => ({ y, blocks: lh.blocks.filter((b) => b.date.startsWith(y)) }));
  const recent = molit.months.slice(-12).reverse();
  return (
    <div className="page">
      <Crumbs items={crumbs} />
      <h1>{a.name} <span className="pill ok">실데이터</span></h1>
      <p className="lede">통계누리 시행주체 `{a.actor}`의 전국 월별 호수{a.id === 'lh' ? '와 LH 준공 예정 블록' : ''}.</p>
      <div className="kpis">
        {KS.map(([k, l]) => <Kpi key={k} label={`${l} · ${monthLabel(last)}`} tone={METRIC_COLOR[k]} value={fmt(seriesOf(molit, k, NATION).actors![a.actor][i])} sub={<>{year}년 누계 {fmt(ytd(molit, k, NATION, last, a.actor))}호{isProvisional(molit, last) ? <Prov /> : null}</>} />)}
      </div>
      <section className="panel" aria-label="월별 실적">
        <h2>월별 실적 <small className="sub">· 전국 · 호 · 빗금은 잠정치</small></h2>
        <Legend items={lines.map((l) => ({ label: l.label, color: l.color }))} />
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`${a.name} 전국 월별 인허가·착공·준공 호수`} />
        <Basis>통계누리 주택건설실적통계. 인허가는 연초 누계의 차분입니다.</Basis>
      </section>
      <section className="panel" aria-label="최근 12개월">
        <h2>최근 12개월 <small className="sub">· 호</small></h2>
        <div className="tablewrap"><table className="tbl">
          <thead><tr><th>월</th>{KS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{recent.map((ym) => <tr key={ym}><td><Link href={`/month/${ym}`}>{ymDot(ym)}</Link></td>{KS.map(([k]) => <td key={k}>{fmt(seriesOf(molit, k, NATION).actors![a.actor!][molit.months.indexOf(ym)])}</td>)}</tr>)}</tbody>
        </table></div>
      </section>
      {a.id === 'lh' ? (
        <section className="panel" aria-label="LH 준공 예정">
          <h2>LH 준공 예정 <small className="sub">· {lh.count}블록 · {fmt(lh.units)}세대 · 준공예정일 순</small></h2>
          <div className="tablewrap"><table className="tbl">
            <thead><tr><th>연도</th><th>블록</th><th>세대수</th></tr></thead>
            <tbody>{byYear.map((r) => <tr key={r.y}><td>{r.y}</td><td>{r.blocks.length}</td><td>{fmt(r.blocks.reduce((s, b) => s + b.units, 0))}</td></tr>)}</tbody>
          </table></div>
          <div className="tablewrap" style={{ maxHeight: 520, overflowY: 'auto' }}><table className="tbl">
            <thead><tr><th>준공예정일</th><th>사업지구</th><th>블록</th><th>공급유형</th><th>세대수</th><th>위치</th></tr></thead>
            <tbody>{lh.blocks.map((b, k) => <tr key={k}><td><Link href={`/month/${b.date.slice(0, 7)}`}>{b.date}</Link></td><td className="wrap">{b.district}</td><td>{b.block}</td><td>{b.type}</td><td>{fmt(b.units)}</td><td className="wrap">{b.location}</td></tr>)}</tbody>
          </table></div>
          <Basis>LH 공공주택 준공예정현황(15141761) · 파일 기준일 {lh.sourceAsOf}. 예정일은 그 시점의 계획입니다.</Basis>
        </section>
      ) : null}
    </div>
  );
}
