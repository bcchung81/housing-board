import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Badge } from '../ui/badge';

/* 위젯 표지: 시안 수치(SAMPLE). 실제 자료 위젯은 표지 없이 제목 title 에 기준·범위를 둔다 */
export const Sample = () => <Badge variant="solid" className="ml-2 bg-[var(--sample-bg)] align-middle text-[var(--sample-ink)]" title="시안용 SAMPLE 수치입니다. 실제 자료가 아닙니다.">SAMPLE</Badge>;
/* 제목 줄 범례 칩 하나: 색 견본(sw = 배경색, className 으로 모양을 바꾼다) + 이름.
   under 는 견본을 글자 밑 3px 띠로 그린다(폭을 더 쓰지 않아 좁은 카드 제목 줄에도 한 줄로 들어간다 — 1280px 의 월별 실적 흐름·기관별 진행) */
export const Key = ({ sw, className, under, children }: { sw?: string; className?: string; under?: boolean; children: ReactNode }) => under
  ? <span className="relative whitespace-nowrap"><i className={cn('absolute inset-x-0 -bottom-[3px] block h-[3px] rounded-full', className)} style={sw ? { background: sw } : undefined} aria-hidden="true" />{children}</span>
  : <span className="flex items-center gap-1 whitespace-nowrap"><i className={cn('block size-[9px] flex-none rounded-[2px]', className)} style={sw ? { background: sw } : undefined} aria-hidden="true" />{children}</span>;
