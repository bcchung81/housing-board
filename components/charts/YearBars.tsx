/* 연도별 막대(서버가 SVG 로 그린다). 완결 연도는 진한 막대, 부분 연도(2021 은 9~12월·올해는 1~N월)는 옅은 점선 막대 + 기간 꼬리표.
   전년 대비 꼬리표는 두 해 모두 12/12개월인 완결 연도에만 붙는다(lib/board/annual.ts yoy). 세로축은 MonthLines 와 같은 틀(HTML 눈금). */
import { niceMax } from './MonthLines';
import { spanLabel, yoy, type YearVal } from '../../lib/board/annual';

const H = 260;
const man = (v: number) => (v === 0 ? '0' : `${+(v / 10000).toFixed(1)}만`);

export default function YearBars({ series, color, label }: { series: YearVal[]; color: string; label: string }) {
  const n = series.length;
  const top = niceMax(Math.max(1, ...series.map((y) => y.value ?? 0)));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => top * f);
  const part = `color-mix(in srgb, ${color} 34%, var(--chartbg))`;
  return (
    <div data-slot="chart-frame" className="relative mt-3 rounded-[10px] border border-border bg-chartbg pt-6 pr-5 pb-10 pl-[72px]">
      <div aria-hidden="true" className="pointer-events-none absolute top-6 bottom-10 left-0 w-[64px] text-[13px] leading-none text-mute">
        {ticks.map((v, i) => <span key={i} data-slot="chart-axis" className="absolute right-0 -translate-y-1/2 whitespace-nowrap tabular-nums" style={{ top: `${i / 4 * 100}%` }}>{man(v)}</span>)}
      </div>
      <div className="relative" style={{ height: H }}>
        <svg preserveAspectRatio="none" viewBox={`0 0 ${n * 100} 1000`} className="absolute inset-0 block size-full overflow-visible" role="img" aria-label={label}>
          {ticks.map((v) => <line key={v} x1="0" x2={n * 100} y1={1000 - v / top * 1000} y2={1000 - v / top * 1000} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
          {series.map((y, i) => y.value === null ? null : (
            <rect key={y.year} className="q-grow-y" x={i * 100 + 24} width="52" y={1000 - y.value / top * 1000} height={y.value / top * 1000}
              style={{ fill: y.complete ? color : part, ['--i' as string]: i * 0.5 }} {...(y.complete ? {} : { stroke: color, strokeDasharray: '4 3', vectorEffect: 'non-scaling-stroke' })}>
              <title>{`${y.year}${y.complete ? '' : ` ${spanLabel(y)}(부분 연도${y.provisional ? '·잠정' : ''})`} — ${y.value.toLocaleString('en-US')}호`}</title>
            </rect>
          ))}
        </svg>
        {series.map((y, i) => {
          if (y.value === null) return null;
          const d = y.complete ? yoy(series, y.year) : null;
          const tag = !y.complete
            ? <span className="text-muted-foreground" title={`부분 연도라 전년 대비를 내지 않음 · ${y.months}/12개월${y.provisional ? ' · 잠정치 포함' : ''}`}>{spanLabel(y)}</span>
            : d === null ? null
            : <span className={d >= 0 ? 'text-ok' : 'text-bad'} title="전년 대비(두 해 모두 12/12개월)">{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%</span>;
          return tag ? <span key={y.year} className="absolute -translate-x-1/2 text-[12px] whitespace-nowrap tabular-nums" style={{ left: `${(i + 0.5) / n * 100}%`, bottom: `calc(${y.value / top * 100}% + 3px)` }}>{tag}</span> : null;
        })}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-5 bottom-3 left-[72px] h-4 text-[13px] leading-none text-mute">
        {series.map((y, i) => <span key={y.year} data-slot="chart-axis" className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${(i + 0.5) / n * 100}%` }}>{y.year}</span>)}
      </div>
    </div>
  );
}
