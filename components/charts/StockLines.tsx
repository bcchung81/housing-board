/* 주택 재고 vs 일반가구 연도 선(서버 SVG). 실측은 실선, 장래가구 추계는 마지막 실측 해에서 이어지는 점선. 세로축은 0 이 아니라 값 범위에 맞춘다(차이를 읽는 그림).
   해 눈금은 짝수 해만(추계까지 이어지면 해가 19개라 겹친다). 점마다 title 로 값을 읽을 수 있다. */
import type { StockChart } from '../../lib/board/area-facts';

const H = 260, W = 1000;
const man = (v: number) => `${+(v / 10000).toFixed(v >= 1e6 ? 0 : 1)}만`;

export const STOCK_COLOR = 'var(--chart-1)', HOUSEHOLD_COLOR = 'var(--chart-5)';

export default function StockLines({ chart, label }: { chart: StockChart; label: string }) {
  const { years, stock, households, forecast, lastActual } = chart;
  const vals = [...stock, ...households, ...forecast].filter((v): v is number => v !== null);
  const min = Math.min(...vals), max = Math.max(...vals);
  const step = (() => { const raw = (max - min) / 3 || 1, p = 10 ** Math.floor(Math.log10(raw)); return ([1, 2, 2.5, 5, 10].find((m) => raw <= m * p) ?? 10) * p; })();
  const lo = Math.floor(min / step) * step, hi = Math.max(Math.ceil(max / step) * step, lo + step);
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => hi - i * step);
  const n = years.length, X = (i: number) => (i + 0.5) / n * W, Y = (v: number) => (1 - (v - lo) / (hi - lo)) * H;
  const pts = (arr: (number | null)[]) => arr.flatMap((v, i) => (v === null ? [] : [`${X(i).toFixed(1)},${Y(v).toFixed(1)}`])).join(' ');
  const cutX = (years.indexOf(lastActual) + 1) / n * W, hasFc = forecast.some((v, i) => v !== null && years[i] > lastActual);
  const dots = (arr: (number | null)[], color: string, name: string) => arr.map((v, i) => v === null ? null : (
    <span key={`${name}-${i}`} className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-chartbg" style={{ left: `${X(i) / W * 100}%`, top: `${Y(v) / H * 100}%`, background: color }} title={`${years[i]} ${name} ${v.toLocaleString('en-US')}`} />
  ));
  return (
    <div data-slot="chart-frame" className="relative mt-3 rounded-[10px] border border-border bg-chartbg pt-4 pr-5 pb-10 pl-[72px]">
      <div aria-hidden="true" className="pointer-events-none absolute top-4 bottom-10 left-0 w-[64px] text-[13px] leading-none text-mute">
        {ticks.map((v) => <span key={v} data-slot="chart-axis" className="absolute right-0 -translate-y-1/2 whitespace-nowrap tabular-nums" style={{ top: `${Y(v) / H * 100}%` }}>{man(v)}</span>)}
      </div>
      <div className="relative" style={{ height: H }}>
        <svg preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block size-full overflow-visible" role="img" aria-label={label}>
          {ticks.map((v) => <line key={v} x1="0" x2={W} y1={Y(v)} y2={Y(v)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
          {hasFc ? <line x1={cutX} x2={cutX} y1="0" y2={H} stroke="var(--line2)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null}
          <g className="q-sweep">
            <polyline fill="none" stroke={STOCK_COLOR} strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={pts(stock)} />
            <polyline fill="none" stroke={HOUSEHOLD_COLOR} strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={pts(households)} />
            <polyline fill="none" stroke={HOUSEHOLD_COLOR} strokeWidth="2.4" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={pts(forecast)} />
          </g>
        </svg>
        {dots(stock, STOCK_COLOR, '주택 재고')}{dots(households, HOUSEHOLD_COLOR, '일반가구')}
        {hasFc ? <span className="absolute top-0 pl-1.5 text-[12px] text-muted-foreground" style={{ left: `${cutX / W * 100}%` }}>추계</span> : null}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-5 bottom-3 left-[72px] h-4 text-[13px] leading-none text-mute">
        {years.map((y, i) => y % 2 === 0 ? <span key={y} data-slot="chart-axis" className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${(i + 0.5) / n * 100}%` }}>{y}</span> : null)}
      </div>
    </div>
  );
}
