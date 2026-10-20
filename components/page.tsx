/* 대시보드 화면의 틀. 콘텐츠 상자는 종합상황판·상단 메뉴 바와 같은 1440px 선(px-7)이고, 블록 사이는 같은 간격(gap-3.5)이다.
   1600px 이상 화면에서는 1760px 까지 넓힌다(2026-10-16 2차 평가: 1920 에서 좌우 268px 씩 비었다 — 종합상황판·상단 메뉴 바는 각자 맞춘다).
   머리글은 제목 h1(설명은 title) + 같은 줄 오른쪽 기준 한 줄. 카드 머리 줄은 제목 h2(덧말은 title) + 오른쪽 범례·조용한 링크(종합상황판 규칙). */
import { Fragment, type ComponentProps, type ReactNode } from 'react';
import { cn } from 'cn';
import PanelLink from './board/PanelLink';
import { phead, phgroup, ptitle } from './board/styles';
import InfoTip from './ui/info-tip';

export const Page = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto flex max-w-[1440px] min-[1600px]:max-w-[1760px] flex-col gap-3.5 px-7 pb-9 mobile:px-3 mobile:pb-6">{children}</div>
);

/* 카드 안 작은 글씨: .panel .sub */
export const sub = 'text-sm text-muted-foreground';
/* 표 안의 '값 없음'(.tbl .na). 표 밖의 .na 는 스타일이 없었으므로 쓰지 않는다 */
export const na = 'text-muted-foreground';

/* 머리글. 아래 간격은 종합상황판(머리글 pb-3 → 첫 카드)과 같은 12px 이 되게 틀의 gap 에서 2px 를 뺀다 */
export function PageHead({ title, tip, meta, metaTip, children }: { title: ReactNode; tip?: string; meta?: ReactNode; metaTip?: string; children?: ReactNode }) {
  return (
    <header className="-mb-0.5 pt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="m-0 min-w-0 text-h1 font-bold text-foreground [overflow-wrap:anywhere]" title={tip}>{title}</h1>
        {children}
        {meta ? <span className={cn(sub, 'ml-auto whitespace-nowrap tabular-nums mobile:text-sm')} title={metaTip}>{meta}</span> : null}
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
/* 카드 대표값 줄(2026-10-19, DESIGN.md Components): 카드 제목 아래 한 줄 — [지표 이름 14 보조색] [값 24/700 + 단위 14(값과 줄바꿈 안 됨)] [보조 건수·기간 14 보조색, ' · ' 구분].
   제목 문자열에 숫자를 붙이지 않고 이 줄로 나눈다. 빈 보조 항목은 생략한다 */
export function MetricRow({ label, value, unit, items, className }: { label?: ReactNode; value: ReactNode; unit?: ReactNode; items?: ReactNode[]; className?: string }) {
  const rest = (items ?? []).filter((x) => x !== null && x !== undefined && x !== false && x !== '');
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      {label ? <span className={sub}>{label}</span> : null}
      <span className="whitespace-nowrap text-foreground"><span className="text-xl font-bold tabular-nums">{value}</span>{unit ? <span className="ml-0.5 text-sm">{unit}</span> : null}</span>
      {rest.length ? <span className={cn(sub, 'tabular-nums')}>{rest.map((x, i) => <Fragment key={i}>{i ? ' · ' : null}{x}</Fragment>)}</span> : null}
    </div>
  );
}

/* 사실 안내 한 문장(2026-10-19, DESIGN.md Components): 일정 경과·원천 차이·자료 부족. 본문 크기, 면 투명(안쪽 면이 필요하면 className 에 ui-inset), 장식 아이콘·색 띠·배지 없음.
   색은 글자에만: 중립(기본) = 본문색 · 주의 = --warn · 오류 = --bad. 일반 지연 사실은 중립. 정의·근거는 tip 의 (i) 설명 */
const FACT_TONE = { neutral: 'text-foreground', warn: 'text-warn', error: 'text-bad' } as const;
export function FactNote({ children, tone = 'neutral', tip, className }: { children: ReactNode; tone?: keyof typeof FACT_TONE; tip?: { label: string; children: ReactNode }; className?: string }) {
  return (
    <p role="note" className={cn('m-0 text-(length:--fs-body) leading-body', FACT_TONE[tone], className)}>
      {children}{tip ? <InfoTip label={tip.label} className="ml-1 align-middle">{tip.children}</InfoTip> : null}
    </p>
  );
}

/* 표·그래프 아래 출처 문장 대신 카드 머리 줄 오른쪽의 조용한 링크(한 화면에 하나) */
export const SrcLink = ({ href = '/sources' }: { href?: string }) => <PanelLink href={href} full="데이터 원본">데이터 원본</PanelLink>;
/* 카드 안 소제목: h3 역할(16/700, globals 의 .ui-h3) */
export const SubTitle = ({ className, ...p }: ComponentProps<'h3'>) => <h3 className={cn('ui-h3 mt-5 mb-2 text-muted-foreground', className)} {...p} />;

/* 빈 값: 긴 문장 대신 — (이유는 title) */
export const Dash = ({ why }: { why: string }) => <span className="text-muted-foreground" title={why} aria-label={why}>—</span>;

/* 목록 카드 격자(.cards)·KPI 격자(.kpis)·두 칸(.cols2): 자동 칸 수.
   KPI 격자는 auto-fill(빈 칸도 자리를 지킨다) — 카드가 1~2개여도 한 칸 폭(240px~약 280px)이라 가로로 늘어나지 않는다 */
export const cardsGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-2.5';
export const kpisGrid = 'grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5';
export const cols2 = 'grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-x-3.5';
/* 정의 목록(.dl) */
export const Dl = ({ className, ...p }: ComponentProps<'dl'>) => (
  <dl className={cn('m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-base [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:[overflow-wrap:anywhere]', className)} {...p} />
);
