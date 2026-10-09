import type { Metadata } from 'next';
import Link from 'next/link';
import Crumbs from '../../../components/Crumbs';
import Legend from '../../../components/charts/Legend';
import StackedMonths from '../../../components/charts/StackedMonths';
import { ACTOR_COLOR } from '../../../components/charts/palette';
import { Basis, Prov } from '../../../components/ui';
import { ACTORS, NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, ytd, valueAt } from '../../../lib/board/calc';
import { lh, molit } from '../../../lib/board/data';
import { AGENCIES } from '../../../lib/board/agencies';

export const metadata: Metadata = { title: '기관별' };
const KS = [['permit', '인허가'], ['start', '착공'], ['complete', '준공']] as const;

/* 기관별(L1 목록): 통계누리 시행주체 4분류의 호수와 LH 준공 예정 요약. 기관별 지연·주의·정상 신호는 일정이 없어 아직 판정하지 않는다. */
export default function AgencyIndex() {
  const last = lastMonth(molit), year = last.slice(0, 4);
  const byYear = [...new Set(lh.blocks.map((b) => b.date.slice(0, 4)))].map((y) => ({ y, blocks: lh.blocks.filter((b) => b.date.startsWith(y)) }));
  return (
    <div className="page">
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '기관별' }]} />
      <h1>기관별 <span className="pill ok">실데이터</span></h1>
      <p className="lede">통계누리 시행주체(지자체·LH·주택업체·민간)별 호수와 LH 준공 예정. 기관을 누르면 그 기관의 월 흐름과 예정 블록으로 내려갑니다.</p>

      <div className="cards" style={{ marginTop: 12 }}>
        {AGENCIES.map((a) => <Link key={a.id} className="cardlink" href={`/agency/${a.id}`}><b>{a.name} {a.ready ? null : <span className="pill">준비 중</span>}</b><span>{a.summary}</span><code>/agency/{a.id}</code></Link>)}
      </div>

      <section className="panel" aria-label="시행주체별 호수">
        <h2>시행주체별 <small className="sub">· 전국 · 호 · {monthLabel(last)}{isProvisional(molit, last) ? <Prov /> : null}</small></h2>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th rowSpan={2}>시행주체</th>{KS.map(([, l]) => <th key={l} colSpan={2} style={{ textAlign: 'center' }}>{l}</th>)}</tr><tr>{KS.map(([k]) => <><th key={`${k}m`}>{Number(last.slice(5))}월</th><th key={`${k}y`}>1~{Number(last.slice(5))}월 누계</th></>)}</tr></thead>
            <tbody>
              {ACTORS.map((a) => (
                <tr key={a}><td>{a}</td>{KS.map(([k]) => <><td key={`${k}m`}>{fmt(seriesOf(molit, k, NATION).actors![a][molit.months.indexOf(last)])}</td><td key={`${k}y`}>{fmt(ytd(molit, k, NATION, last, a))}</td></>)}</tr>
              ))}
              <tr className="total"><td>총계</td>{KS.map(([k]) => <><td key={`${k}m`}>{fmt(valueAt(molit, k, NATION, last))}</td><td key={`${k}y`}>{fmt(ytd(molit, k, NATION, last))}</td></>)}</tr>
            </tbody>
          </table>
        </div>
        <Legend items={ACTORS.map((a) => ({ label: a, color: ACTOR_COLOR[a] }))} />
        <div className="cols2">
          {KS.map(([k, l]) => (
            <div key={k}>
              <h3>{l}(전국, 월별)</h3>
              <StackedMonths months={molit.months} stacks={ACTORS.map((a) => ({ key: a, label: a, color: ACTOR_COLOR[a], values: seriesOf(molit, k, NATION).actors![a] }))} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`전국 월별 ${l} 호수, 시행주체별`} />
            </div>
          ))}
        </div>
        <Basis>통계누리 주택건설실적통계 · {year}년 누계. 네 분류의 합이 총계입니다. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다.</Basis>
      </section>

      <section className="panel" aria-label="LH 준공 예정">
        <h2>LH 준공 예정 <small className="sub">· {lh.count}블록 · {fmt(lh.units)}세대</small></h2>
        <div className="tablewrap">
          <table className="tbl">
            <thead><tr><th>연도</th><th>블록</th><th>세대수</th></tr></thead>
            <tbody>{byYear.map((r) => <tr key={r.y}><td>{r.y}</td><td>{r.blocks.length}</td><td>{fmt(r.blocks.reduce((a, b) => a + b.units, 0))}</td></tr>)}</tbody>
          </table>
        </div>
        <Basis>LH 공공주택 준공예정현황(15141761) · 파일 기준일 {lh.sourceAsOf}.</Basis>
      </section>
    </div>
  );
}
