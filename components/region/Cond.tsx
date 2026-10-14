/* 지역 공급 ③ 동네 여건(서울·인천·경기만 자료가 있다): 숫자 셋(인구 · 주택 재고와 일반가구 · 미분양) + 주택 재고·일반가구 선(장래가구 추계는 점선).
   값은 lib/board/area-facts.ts(data/board/area-facts.json). 숫자마다 기준 시점이 따로라 값 옆에 시점을 붙인다. 자료가 없는 시도·전국은 이 블록을 그리지 않는다(화면이 한 줄만 적는다). */
import type { ReactNode } from 'react';
import { PanelHead, SrcLink } from '../page';
import { Card } from '../ui/card';
import Legend from '../charts/Legend';
import StockLines, { HOUSEHOLD_COLOR, STOCK_COLOR } from '../charts/StockLines';
import { conditions, stockChart, type AreaFactsDoc } from '../../lib/board/area-facts';
import { fmt } from '../../lib/board/calc';

const COND_TIP = '숫자마다 기준연도가 다름 · 재고−가구 차이는 공급 부족 확정치가 아님(공실·점유·실입주량은 이 자료에 없음) · KOSIS·SGIS(HOME 지역 지표) · 서울·인천·경기만';

/* 값과 기준 시점을 한 줄에(넓은 칸에서 오른쪽이 비지 않게). 좁으면 시점이 아래로 내려간다 */
function Fact({ label, value, unit, sub, tip }: { label: string; value: string; unit: string; sub?: ReactNode; tip: string }) {
  return (
    <Card variant="kpi" title={tip}>
      <span className="flex min-w-0 items-center gap-1.5 truncate text-[14px] text-muted-foreground"><i className="block size-[9px] flex-none rounded-[3px] bg-line2" aria-hidden="true" />{label}</span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <b className="font-display text-[min(30px,15cqi)] leading-[1.2] font-normal whitespace-nowrap tabular-nums">{value}<small className="ml-[3px] font-sans text-[14px] font-normal text-muted-foreground">{unit}</small></b>
        {sub ? <span className="text-[13px] text-muted-foreground tabular-nums">{sub}</span> : null}
      </span>
    </Card>
  );
}

export default function Cond({ facts, sido, name }: { facts: AreaFactsDoc; sido: string; name: string }) {
  const c = conditions(facts, sido), chart = stockChart(facts, sido);
  if (!c) return null;
  const ym = (p: string) => p.replace('-', '.');
  return (
    <Card render={<section aria-label="동네 여건" />}>
      <PanelHead title="동네 여건" tip={`${name} · ${COND_TIP}`}><SrcLink /></PanelHead>
      <div className="grid grid-cols-3 gap-2.5 mobile:grid-cols-1">
        <Fact label="인구" value={c.population ? fmt(c.population.value) : '–'} unit="명" sub={c.population?.period} tip="인구총조사 기반 총인구" />
        <Fact label="주택 재고" value={c.housingUnits ? fmt(c.housingUnits.value) : '–'} unit="호"
          sub={c.housingUnits ? `${c.housingUnits.period}${c.households ? ` · 일반가구 ${fmt(c.households.value)}(${c.households.period})` : ''}` : undefined}
          tip="KOSIS 주택 수 · 일반가구 수와 같은 연도로 비교(재고−가구 차이는 공급 부족 확정치가 아님)" />
        <Fact label="미분양" value={c.unsold ? fmt(c.unsold.value) : '–'} unit="호"
          sub={c.unsold ? `${ym(c.unsold.period)}${c.unsold.completed !== null ? ` · 준공 후 ${fmt(c.unsold.completed)}` : ''}` : undefined}
          tip="미분양주택현황 월말 재고 · 신규 공급 실적 아님" />
      </div>
      {chart ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="m-0 text-[16px] font-normal text-muted-foreground" title={`${name} · ${chart.years[0]}~${chart.lastActual} 실측, 그 뒤는 장래가구 추계(점선) · ${COND_TIP}`}>주택 재고 · 일반가구</h3>
            <span className="ml-auto"><Legend items={[{ label: '주택 재고', color: STOCK_COLOR }, { label: '일반가구', color: HOUSEHOLD_COLOR }, { label: '장래가구 추계(점선)', color: 'var(--line2)' }]} /></span>
          </div>
          <StockLines chart={chart} label={`${name} 주택 재고와 일반가구 ${chart.years[0]}~${chart.lastActual}, 장래가구 추계`} />
        </>
      ) : null}
    </Card>
  );
}
