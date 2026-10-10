/* 공급 실적(통계누리 주택건설실적통계)의 두 보기: 시도별(/area)·시행주체별(/agency). 2026-10-10 '지역별'·'기관별' 메뉴를 하나로 합쳤다.
   보기마다 주소가 따로라(시도 상세 /area/NN·기관 상세 /agency/{id}도 그대로) 탭은 화면을 바꾸는 링크다. 모양은 데이터 원본의 단계 탭과 같다. */
import Link from 'next/link';

const VIEWS = [['/area', '시도별'], ['/agency', '시행주체별']] as const;

export default function SupplyTabs({ current }: { current: (typeof VIEWS)[number][0] }) {
  return (
    <nav aria-label="공급 실적 보기" className="mt-1 mb-3 flex w-fit max-w-full flex-wrap rounded-[10px] bg-card p-[3px] shadow-[var(--shadow-card)]">
      {VIEWS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === current ? 'page' : undefined}
          className="flex h-8 items-center rounded-[8px] px-3 text-[14px] font-bold whitespace-nowrap text-ink2 no-underline [transition:background_.15s,color_.15s] not-aria-[current=page]:hover:bg-pn2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
          {label}
        </Link>
      ))}
    </nav>
  );
}
