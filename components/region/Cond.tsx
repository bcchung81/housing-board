/* 지역 공급 ③ 동네 여건(서울·인천·경기만 자료가 있다): 숫자 셋(인구 · 주택 재고와 일반가구 · 미분양) + 주택 재고·일반가구 선(장래가구 추계는 점선).
   값은 lib/board/area-facts.ts(data/board/area-facts.json). 숫자마다 기준 시점이 따로라 값 옆에 시점을 붙인다. 자료가 없는 시도·전국은 이 블록을 그리지 않는다(화면이 한 줄만 적는다). */
import type { ReactNode } from 'react';
import { PanelHead, SrcLink } from '@/components/page';
import { Card } from '@/components/ui/card';
import ScopeChip from '@/components/ui/scope-chip';
import Legend from '@/components/charts/Legend';
import StockLines, { HOUSEHOLD_COLOR, STOCK_COLOR } from '@/components/charts/StockLines';
import { conditions, stockChart, type AreaFactsDoc } from '@/lib/board/area-facts';
import { fmt } from '@/lib/board/calc';

const COND_TIP = '숫자마다 기준연도가 다름 · 재고−가구 차이는 공급 부족 확정치가 아님(공실·점유·실입주량은 이 자료에 없음) · KOSIS·SGIS(정책 진행 자료(HOME) 지역 지표) · 서울·인천·경기만';

/* 값과 기준 시점을 한 줄에(넓은 칸에서 오른쪽이 비지 않게). 좁으면 시점이 아래로 내려간다 */
function Fact({ label, value, unit, sub, tip }: { label: string; value: string; unit: string; sub?: ReactNode; tip: string }) {
  return (
    <Card variant="inset" className="@container flex flex-col gap-1.5" title={tip}>
      {/* 칸 이름은 말줄임 없이 두 줄까지(2026-10-16 4차 평가 — 1280·1440 좁은 칸) */}
      <span className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground"><i className="mt-[6px] block size-[9px] flex-none rounded-chip bg-line2" aria-hidden="true" /><span className="line-clamp-2 [word-break:keep-all]">{label}</span></span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <b className="text-sm leading-title @min-[160px]:text-xl @min-[200px]:text-2xl font-bold whitespace-nowrap tabular-nums">{value}<small className="ml-[3px] font-sans text-sm font-normal text-muted-foreground">{unit}</small></b>
        {sub ? <span className="text-sm text-muted-foreground tabular-nums">{sub}</span> : null}
      </span>
    </Card>
  );
}

export default function Cond({ facts, sido, name, sggName }: { facts: AreaFactsDoc; sido: string; name: string; sggName?: string | null }) {
  const c = conditions(facts, sido), chart = stockChart(facts, sido);
  if (!c) return null;
  const ym = (p: string) => p.replace('-', '.');
  return (
    <Card render={<section aria-label="동네 여건" />}>
      <PanelHead title="동네 여건" tip={`${name} · ${COND_TIP}`}
        scope={<ScopeChip scope={name} source="KOSIS·SGIS" note={sggName ? { text: '시도 단위 자료', title: `${sggName}을 골라도 ${name} 전체 값(시군구 자료 없음)` } : undefined} />}><SrcLink /></PanelHead>
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
            <h3 className="ui-h3 text-muted-foreground" title={`${name} · ${chart.years[0]}~${chart.lastActual} 실측, 그 뒤는 장래가구 추계(점선) · ${COND_TIP}`}>주택 재고 · 일반가구</h3>
            <span className="ml-auto"><Legend items={[{ label: '주택 재고', color: STOCK_COLOR }, { label: '일반가구', color: HOUSEHOLD_COLOR }, { label: '장래가구 추계(점선)', color: 'var(--line2)' }]} /></span>
          </div>
          {/* 차트 틀은 이 카드 안이라 테두리·바탕을 걷는다(카드 안 카드 금지) */}
          <div className="[&_[data-slot=chart-frame]]:rounded-none [&_[data-slot=chart-frame]]:border-0 [&_[data-slot=chart-frame]]:bg-transparent">
            <StockLines chart={chart} label={`${name} 주택 재고와 일반가구 ${chart.years[0]}~${chart.lastActual}, 장래가구 추계`} />
          </div>
        </>
      ) : null}
    </Card>
  );
}
