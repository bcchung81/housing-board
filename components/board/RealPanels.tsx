/* 종합상황판의 실데이터 행: 월별 실적 흐름(전국)과 시행주체별 호수. 서버 컴포넌트가 data/board 의 값을 읽어 그린다. */
import Link from 'next/link';
import { cn } from 'cn';
import { sub } from '../page';
import { Card } from '../ui/card';
import Legend from '../charts/Legend';
import MonthLines from '../charts/MonthLines';
import { ACTOR_COLOR, METRIC_COLOR } from '../charts/palette';
import { ACTORS, METRICS, NATION, fmt, isProvisional, lastMonth, monthLabel, seriesOf, ytd } from '../../lib/board/calc';
import { molit } from '../../lib/board/data';
import { Real } from './tags';
import { ag, agName, agVal, ags, bar3, disp, plink, ptSmall, ptitle, row2 } from './styles';

const LABEL = { permit: '인허가', start: '착공', complete: '준공', sale: '분양' } as const;
const KS = ['permit', 'start', 'complete'] as const;

export default function RealPanels() {
  const last = lastMonth(molit), year = last.slice(0, 4), mo = Number(last.slice(5));
  const lines = METRICS.map((k) => ({ key: k, label: LABEL[k], color: METRIC_COLOR[k], values: seriesOf(molit, k, NATION).total }));
  return (
    <div className={row2} id="real-row">
      <Card variant="board" render={<section id="p-actual" aria-label="월별 실적 흐름" />}>
        <h2 className={ptitle}>월별 실적 흐름 <Real title="국토교통 통계누리 주택건설실적통계" /> <small className={ptSmall}>· 전국 · 호 · 빗금은 잠정치</small></h2>
        <Legend items={lines.map((l) => ({ label: l.label, color: l.color }))} />
        <MonthLines months={molit.months} lines={lines} provisional={molit.provisional} href={(ym) => `/month/${ym}`} label={`전국 월별 인허가·착공·준공·분양 호수, ${molit.months[0]}부터 ${last}까지`} />
        <p className={cn(sub, 'mt-2')}>통계누리 · 자료 {molit.months[0].replace('-', '.')} ~ {last.replace('-', '.')}{isProvisional(molit, last) ? '(2026.01~ 잠정치)' : ''}. 그래프의 달을 누르면 월 상세로 내려갑니다.</p>
        <p className={plink}><Link href="/area">지역별 실적 →</Link> · <Link href={`/month/${last}`}>{monthLabel(last)} 월 상세 →</Link></p>
      </Card>

      <Card variant="board" render={<section id="p-actors" aria-label="시행주체별 호수" />}>
        <h2 className={ptitle}>시행주체별 호수 <Real title="국토교통 통계누리 주택건설실적통계" /> <small className={ptSmall}>· 전국 · {year}년 1~{mo}월 누계 (호)</small></h2>
        <Legend items={ACTORS.map((a) => ({ label: a, color: ACTOR_COLOR[a] }))} />
        <div className={ags}>
          {KS.map((k) => {
            const total = ytd(molit, k, NATION, last) ?? 0;
            return (
              <div key={k} className={cn(ag, 'grid-cols-[minmax(0,64px)_minmax(0,1fr)_92px]')}>
                <div className={agName}><b>{LABEL[k]}</b></div>
                <div className={cn(bar3, 'h-3.5')} role="img" aria-label={`${LABEL[k]} ${ACTORS.map((a) => `${a} ${fmt(ytd(molit, k, NATION, last, a))}호`).join(', ')}`}>
                  {ACTORS.map((a) => { const v = ytd(molit, k, NATION, last, a) ?? 0; return <span key={a} className="block" style={{ width: `${total ? (v / total * 100).toFixed(2) : 0}%`, background: ACTOR_COLOR[a] }} title={`${a} ${fmt(v)}호`} />; })}
                </div>
                <div className={agVal}><b className={disp}>{fmt(total)}</b></div>
              </div>
            );
          })}
        </div>
        <p className={cn(sub, 'mt-2')}>지자체·LH·주택업체는 공공, 민간은 민간부문입니다. 네 분류의 합이 총계입니다. 분양은 시행주체 구분이 없습니다.</p>
        <p className={plink}><Link href="/agency">기관별 상세 →</Link></p>
      </Card>
    </div>
  );
}
