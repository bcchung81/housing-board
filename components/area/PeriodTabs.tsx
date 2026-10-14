/* 공급 실적 시도별의 기간 전환 `월별 | 연도별`(?period=year). SupplyTabs 와 같은 모양의 링크 탭이라 주소에 남는다. */
import Link from 'next/link';

export const tabLink = 'flex h-8 items-center rounded-[8px] px-3 text-[14px] font-bold whitespace-nowrap text-ink2 no-underline [transition:background_.15s,color_.15s] not-aria-[current=page]:hover:bg-pn2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';

export default function PeriodTabs({ year }: { year: boolean }) {
  return (
    <nav aria-label="기간" className="flex w-fit max-w-full flex-wrap self-center rounded-[10px] bg-card p-[3px] shadow-[var(--shadow-card)]">
      <Link href="/area" aria-current={year ? undefined : 'page'} className={tabLink}>월별</Link>
      <Link href="/area?period=year" aria-current={year ? 'page' : undefined} className={tabLink}>연도별</Link>
    </nav>
  );
}
