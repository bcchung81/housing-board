/* 대시보드 화면의 틀(옛 dash.css 의 .page .lede 와 .page h1·h2·h3). 900px 이하에서는 위쪽에 햄버거 자리(68px)를 비운다. */
import type { ComponentProps, ReactNode } from 'react';
import { cn } from 'cn';

export const Page = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto max-w-[1200px] px-7 pt-7 pb-12 max-[900px]:px-4 max-[900px]:pt-[68px] max-[900px]:pb-10">{children}</div>
);
export const PageTitle = ({ className, ...p }: ComponentProps<'h1'>) => <h1 className={cn('mt-1.5 mb-1 text-[26px] leading-[1.25]', className)} {...p} />;
export const Lede = ({ className, ...p }: ComponentProps<'p'>) => <p className={cn('m-0 mb-1.5 text-[14px] text-muted-foreground', className)} {...p} />;
/* 카드(panel) 안의 제목: .panel>h2 */
export const PanelTitle = ({ className, ...p }: ComponentProps<'h2'>) => <h2 className={cn('m-0 mb-1 text-[16px]', className)} {...p} />;
/* 카드 밖 구역 제목: .page h2 */
export const SectionTitle = ({ className, ...p }: ComponentProps<'h2'>) => <h2 className={cn('mt-7 mb-2.5 text-[16px]', className)} {...p} />;
/* 카드 안 소제목: .page h3 */
export const SubTitle = ({ className, ...p }: ComponentProps<'h3'>) => <h3 className={cn('mt-[18px] mb-2 text-[14px] font-bold text-muted-foreground', className)} {...p} />;
/* 카드 안 작은 글씨: .panel .sub */
export const sub = 'text-[12px] text-muted-foreground';
