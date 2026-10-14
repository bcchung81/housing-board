import type { ReactNode } from 'react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

/* KPI 칸: 이름 · 큰 숫자(칸이 좁아지면 글자가 줄어 칸 밖으로 나가지 않는다 — @container + cqi) · 짧은 보조 값 */
export function Kpi({ label, value, unit = '호', sub, tone, tip }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: string; tip?: string }) {
  return (
    <Card variant="kpi" title={tip}>
      <span className="flex min-w-0 items-center gap-1.5 truncate text-[14px] text-muted-foreground"><i className="block size-[9px] flex-none rounded-[3px] bg-line2" style={tone ? { background: tone } : undefined} aria-hidden="true" />{label}</span>
      <b className="font-display text-[min(30px,15cqi)] leading-[1.2] font-normal whitespace-nowrap tabular-nums">{value}<small className="ml-[3px] font-sans text-[14px] font-normal text-muted-foreground">{unit}</small></b>
      {sub ? <span className="text-[14px] text-muted-foreground tabular-nums">{sub}</span> : null}
    </Card>
  );
}

export const Prov = () => <Badge variant="warn" className="ml-1.5 px-1.5 text-[11px] leading-[18px]" title="통계누리가 잠정치로 낸 달입니다. 확정치는 2027년 9월 공표 예정">잠정</Badge>;
