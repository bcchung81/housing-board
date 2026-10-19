import type { ReactNode } from 'react';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

/* KPI 칸: 이름 · 큰 숫자 · 짧은 보조 값. 큰 숫자는 칸이 좁아지면 8단계 안에서 한 단계씩 작아져 칸 밖으로 나가지 않는다
   (카드의 @container 폭 단계 — 옛 유동 크기 max(14px, min(30px, 15cqi)) 와 같은 문턱: 폭의 15% 가 그 단계 이상일 때) */
export function Kpi({ label, value, unit = '호', sub, tone, tip, variant = 'tile' }: { variant?: 'tile' | 'inset'; label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: string; tip?: string }) {
  return (
    <Card variant={variant} className="@container flex flex-col gap-1.5" title={tip}>
      <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground"><i className="block size-[9px] flex-none rounded-chip bg-line2" style={tone ? { background: tone } : undefined} aria-hidden="true" />{label}</span>
      <b className="text-sm leading-title font-bold whitespace-nowrap tabular-nums @min-[107px]:text-base @min-[120px]:text-md @min-[134px]:text-lg @min-[160px]:text-xl @min-[200px]:text-2xl">{value}<small className="ml-[3px] font-sans text-sm font-normal text-muted-foreground">{unit}</small></b>
      {sub ? <span className="text-sm text-muted-foreground tabular-nums">{sub}</span> : null}
    </Card>
  );
}

export const Prov = () => <Badge variant="warn" className="ml-1.5 px-1.5 py-0" title="통계누리가 잠정치로 낸 달입니다. 확정치는 2027년 9월 공표 예정">잠정</Badge>;
