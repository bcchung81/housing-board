import { cn } from 'cn';
import type { ReactNode } from 'react';

/* 제목 줄 범례 칩 하나: 색 견본(sw = 배경색, className 으로 모양을 바꾼다) + 이름 */
export const Key = ({ sw, className, children }: { sw?: string; className?: string; children: ReactNode }) =>
  <span className="flex items-center gap-1 whitespace-nowrap"><i className={cn('block size-[9px] flex-none rounded-[2px]', className)} style={sw ? { background: sw } : undefined} aria-hidden="true" />{children}</span>;
