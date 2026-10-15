/* 대시보드 화면의 틀. 콘텐츠 상자는 종합상황판·상단 메뉴 바와 같은 1440px 선(px-7)이고, 블록 사이는 같은 간격(gap-3.5)이다.
   머리글은 빵부스러기 → 제목 h1(설명은 title) + 같은 줄 오른쪽 기준 한 줄. 카드 머리 줄은 제목 h2(덧말은 title) + 오른쪽 범례·조용한 링크(종합상황판 규칙). */
import type { ComponentProps, ReactNode } from 'react';
import { cn } from 'cn';
import Crumbs, { type Crumb } from './Crumbs';
import PanelLink from './board/PanelLink';
import { phead, phgroup, ptitle } from './board/styles';

export const Page = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto flex max-w-[1440px] flex-col gap-3.5 px-7 pb-9 mobile:px-3 mobile:pb-6">{children}</div>
);

/* 카드 안 작은 글씨: .panel .sub */
export const sub = 'text-[14px] text-muted-foreground';
/* 표 안의 '값 없음'(.tbl .na). 표 밖의 .na 는 스타일이 없었으므로 쓰지 않는다 */
export const na = 'text-muted-foreground';

/* 머리글. 아래 간격은 종합상황판(머리글 pb-3 → 첫 카드)과 같은 12px 이 되게 틀의 gap 에서 2px 를 뺀다 */
export function PageHead({ crumbs, title, tip, meta, metaTip, children }: { crumbs?: Crumb[]; title: ReactNode; tip?: string; meta?: ReactNode; metaTip?: string; children?: ReactNode }) {
  return (
    <header className="-mb-0.5 pt-4">
      {crumbs ? <Crumbs items={crumbs} /> : null}
      <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1', crumbs && 'mt-1')}>
        <h1 className="m-0 min-w-0 font-display text-[28px] leading-[1.2] font-normal tracking-[-0.03em] text-foreground [overflow-wrap:anywhere] mobile:text-[22px]" title={tip}>{title}</h1>
        {children}
        {meta ? <span className={cn(sub, 'ml-auto whitespace-nowrap tabular-nums mobile:text-[13px]')} title={metaTip}>{meta}</span> : null}
      </div>
    </header>
  );
}

/* 카드 머리 줄: 제목(설명은 title) + 범위 칩(scope — components/ui/scope-chip) … 오른쪽 범례 칩·조용한 링크 */
export function PanelHead({ title, tip, id, scope, children, className }: { title: ReactNode; tip?: string; id?: string; scope?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn(phead, 'mb-2', className)}>
      <h2 id={id} className={ptitle} title={tip}>{title}</h2>
      {scope}
      {children ? <div className={phgroup}>{children}</div> : null}
    </div>
  );
}
/* 표·그래프 아래 출처 문장 대신 카드 머리 줄 오른쪽의 조용한 링크(한 화면에 하나) */
export const SrcLink = ({ href = '/sources' }: { href?: string }) => <PanelLink href={href} full="데이터 원본">데이터 원본</PanelLink>;
/* 카드 안 소제목: .page h3 */
export const SubTitle = ({ className, ...p }: ComponentProps<'h3'>) => <h3 className={cn('mt-5 mb-2 text-[16px] font-normal text-muted-foreground', className)} {...p} />;

/* 빈 값: 긴 문장 대신 — (이유는 title) */
export const Dash = ({ why }: { why: string }) => <span className="text-muted-foreground" title={why} aria-label={why}>—</span>;

/* 목록 카드 격자(.cards)·KPI 격자(.kpis)·두 칸(.cols2): 자동 칸 수.
   KPI 격자는 auto-fill(빈 칸도 자리를 지킨다) — 카드가 1~2개여도 한 칸 폭(240px~약 280px)이라 가로로 늘어나지 않는다 */
export const cardsGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-2.5';
export const kpisGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5';
export const cols2 = 'grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-x-3.5';
/* 정의 목록(.dl) */
export const Dl = ({ className, ...p }: ComponentProps<'dl'>) => (
  <dl className={cn('m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[16px] leading-[1.6] [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere]', className)} {...p} />
);
