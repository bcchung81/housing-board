/* 월별 쌓은 막대(시행주체별). 막대마다 /month 링크. 알 수 없는 달(null)은 빈 칸. 잠정치는 윗면을 빗금으로 구분하지 않고 아래 눈금 글자로 알린다. */
import { ymDot } from '../../lib/board/calc';
import { niceMax } from './MonthLines';

export type Stack = { key: string; label: string; color: string; values: (number | null)[] };
const W = 960, H = 220, L = 56, R = 12, T = 10, B = 28;

export default function StackedMonths({ months, stacks, provisional, href, label }: { months: string[]; stacks: Stack[]; provisional: string[]; href: (ym: string) => string; label: string }) {
  const totals = months.map((_, i) => stacks.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const top = niceMax(Math.max(1, ...totals));
  const pw = W - L - R, step = pw / months.length, bw = Math.max(2, step * 0.7);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}><line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} stroke="#22305E" /><text x={L - 8} y={y(top * f) + 4} textAnchor="end">{Math.round(top * f).toLocaleString('en-US')}</text></g>
      ))}
      {months.map((m, i) => {
        let acc = 0;
        const xs = L + step * i + (step - bw) / 2;
        return (
          <a key={m} href={href(m)} className="hit">
            <title>{`${ymDot(m)}${provisional.includes(m) ? ' (잠정)' : ''} — ` + stacks.map((s) => `${s.label} ${s.values[i] === null ? '알 수 없음' : s.values[i]!.toLocaleString('en-US') + '호'}`).join(' · ')}</title>
            <rect x={L + step * i} y={T} width={step} height={H - T - B} fill="transparent" />
            {stacks.map((s) => {
              const v = s.values[i] ?? 0;
              const h = (H - T - B) * (v / top);
              acc += v;
              return h > 0 ? <rect key={s.key} x={xs} y={y(acc)} width={bw} height={h} fill={s.color} /> : null;
            })}
          </a>
        );
      })}
      {months.map((m, i) => (m.endsWith('-01') || i === 0) ? <text key={m} x={L + step * (i + 0.5)} y={H - 8} textAnchor="middle">{m.slice(0, 4)}</text> : null)}
    </svg>
  );
}
