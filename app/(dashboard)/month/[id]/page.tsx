import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Crumbs from '../../../../components/Crumbs';
import { METRIC_COLOR } from '../../../../components/charts/palette';
import { Basis, Kpi, Prov } from '../../../../components/ui';
import { ACTORS, METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, monthTable, neighborMonths, seriesOf, lhOfMonth, lhUnits, ymDot } from '../../../../lib/board/calc';
import { lh, molit } from '../../../../lib/board/data';
import { DETAILS } from '../../../../lib/shell/menu';

const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' } as const;
type Props = { params: Promise<{ id: string }> };

/* 월 상세: 그 달의 인허가·착공·준공·분양(시도별·시행주체별, 통계누리 실적)과 LH 준공 예정 블록. 실적이 있는 달과 LH 예정 달만 열린다. */
const lhMonths = [...new Set(lh.blocks.map((b) => b.date.slice(0, 7)))].sort();
const allMonths = [...new Set([...molit.months, ...lhMonths])].sort();
export const dynamicParams = false;
export const generateStaticParams = () => allMonths.map((id) => ({ id }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `${monthLabel(id)}` };
}

export default async function MonthPage({ params }: Props) {
  const { id: ym } = await params;
  if (!DETAILS.month.id.test(ym) || !allMonths.includes(ym)) notFound();
  const actual = molit.months.includes(ym);
  const blocks = lhOfMonth(lh, ym);
  const last = lastMonth(molit);
  const nb = actual ? neighborMonths(molit, ym) : { prev: allMonths[allMonths.indexOf(ym) - 1] ?? null, next: allMonths[allMonths.indexOf(ym) + 1] ?? null };
  const table = actual ? monthTable(molit, ym) : [];
  const nation = table.find((r) => r.code === NATION);
  const i = molit.months.indexOf(ym);
  return (
    <div className="page">
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: monthLabel(ym) }]} />
      <h1>{monthLabel(ym)} <code>{ym}</code> {actual ? <span className="pill ok">실적</span> : <span className="pill">예정</span>}{actual && isProvisional(molit, ym) ? <span className="pill prov">잠정</span> : null}</h1>
      <p className="lede">{actual ? `전국·시도별 인허가·착공·준공·분양 호수와 시행주체별 호수${blocks.length ? ', 그 달에 준공 예정이던 LH 블록' : ''}.` : `실적 자료가 없는 달(자료는 ${ymDot(molit.months[0])}~${ymDot(last)})입니다. LH 준공 예정 블록만 있습니다.`}</p>
      <div className="nav2">
        {nb.prev ? <Link href={`/month/${nb.prev}`}>‹ {ymDot(nb.prev)}</Link> : <span />}
        {nb.next ? <Link href={`/month/${nb.next}`}>{ymDot(nb.next)} ›</Link> : <span />}
      </div>

      {actual && nation ? (
        <>
          <div className="kpis">
            {METRICS.map((k) => <Kpi key={k} label={`${LABEL[k]} · 전국`} tone={METRIC_COLOR[k]} value={fmt(nation.values[k])} sub={k === 'permit' && nation.values[k] === null ? '자료가 이 달부터라 월 흐름을 알 수 없음' : undefined} />)}
          </div>

          <section className="panel" aria-label="시도별">
            <h2>시도별 <small className="sub">· 호</small></h2>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>시도</th>{METRICS.map((k) => <th key={k}>{LABEL[k]}</th>)}</tr></thead>
                <tbody>
                  {table.map((r) => (
                    <tr key={r.code} className={r.code === NATION ? 'total' : undefined}>
                      <td>{r.code === NATION ? '전국' : <Link href={`/area/${r.code}`}>{r.name}</Link>}</td>
                      {METRICS.map((k) => <td key={k}>{fmt(r.values[k])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Basis>통계누리 주택건설실적통계. 2026-07부터 &lsquo;전남광주&rsquo;로 집계되고 이전 달은 광주+전남 합산입니다. 인허가는 연초 누계의 차분입니다.</Basis>
          </section>

          <section className="panel" aria-label="시행주체별">
            <h2>시행주체별 <small className="sub">· 전국 · 호</small></h2>
            <div className="tablewrap">
              <table className="tbl">
                <thead><tr><th>시행주체</th>{(['permit', 'start', 'complete'] as const).map((k) => <th key={k}>{LABEL[k]}</th>)}</tr></thead>
                <tbody>
                  {ACTORS.map((a) => <tr key={a}><td>{a}</td>{(['permit', 'start', 'complete'] as const).map((k) => <td key={k}>{fmt(seriesOf(molit, k, NATION).actors![a][i])}</td>)}</tr>)}
                  <tr className="total"><td>총계</td>{(['permit', 'start', 'complete'] as const).map((k) => <td key={k}>{fmt(seriesOf(molit, k, NATION).total[i])}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <Basis>분양은 시행주체 구분이 없습니다. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다.</Basis>
          </section>
        </>
      ) : null}

      <section className="panel" aria-label="LH 준공 예정">
        <h2>LH 준공 예정 <small className="sub">· {blocks.length}블록 · {fmt(lhUnits(blocks))}세대</small></h2>
        {blocks.length > 0 ? (
          <div className="tablewrap">
            <table className="tbl">
              <thead><tr><th>사업지구</th><th>블록</th><th>공급유형</th><th>세대수</th><th>준공예정일</th><th>위치</th></tr></thead>
              <tbody>
                {blocks.map((b, k) => <tr key={k}><td className="wrap">{b.district}</td><td>{b.block}</td><td>{b.type}</td><td>{fmt(b.units)}</td><td>{b.date}</td><td className="wrap">{b.location}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="sub">이 달에 준공 예정인 LH 블록이 파일에 없습니다.</p>}
        <Basis>LH 공공주택 준공예정현황(공공데이터포털 15141761) · 파일 기준일 {lh.sourceAsOf}로 {Math.max(0, (Number(last.slice(0, 4)) - Number(lh.sourceAsOf.slice(0, 4))) * 12 + Number(last.slice(5)) - Number(lh.sourceAsOf.slice(5, 7)))}개월 묵었습니다. 예정일은 그 시점의 계획이며 이후 바뀌었을 수 있습니다.</Basis>
      </section>
    </div>
  );
}
