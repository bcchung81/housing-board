import { cn } from 'cn';
import type { ReactNode } from 'react';

/* 제목 줄 범례 칩 하나: 색 견본(sw = 배경색) + 이름. 견본은 두 모양뿐(2026-10-18 규격 통일): 면 = 10px 사각, 선(line) = 12×3px 막대. className 은 견본 색·무늬만 */
export const Key = ({ sw, line, className, children }: { sw?: string; line?: boolean; className?: string; children: ReactNode }) =>
  <span className="flex items-center gap-1 whitespace-nowrap"><i className={cn('block flex-none', line ? 'h-[3px] w-3 rounded-full' : 'size-2.5 rounded-chip', className)} style={sw ? { background: sw } : undefined} aria-hidden="true" />{children}</span>;
