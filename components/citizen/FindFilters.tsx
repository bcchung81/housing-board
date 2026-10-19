'use client';
/* 사업 찾기(/citizen/projects) 거르기 줄: 이름 검색 · 지역 탭(수도권·서울·경기·인천 + 시군구 메뉴·풀기) · 단계 탭(전체·준비 중·짓는 중·모집 끝남).
   탭은 /citizen 상단 필터와 같은 부품 .ui-tabs(눌림 단추, role=group) — 누르면 주소(?sido·?sgg·?stage·?q)를 바꾼다. 검색은 스크립트가 없어도 GET 폼으로 동작한다.
   지역을 고르면 늘 주소에 적는다(수도권도 ?sido=metro) — 주소에 지역이 없을 때만 내 동네로 한 번 옮긴다(MyAreaFirst). */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ChipMenu, ClearChip } from '@/components/ui/chips';
import { FIND_BASE, STAGE_GROUP_NAME, findHref, type FindQuery, type StageGroup } from '@/lib/board/public-labels';

const SIDO_TABS: [string, string][] = [['metro', '수도권'], ['11', '서울'], ['41', '경기'], ['28', '인천']];
const STAGES: (StageGroup | '')[] = ['', 'prep', 'build', 'sale'];
/* 탭 누름 칸 44px(보이는 높이 30 + 위아래 7) */
const HIT = 'relative before:absolute before:inset-x-0 before:-inset-y-2';

type Props = { sido: string; sgg: { code: string; label: string } | null; sggItems: { code: string; label: string }[]; stage?: StageGroup; q: string };

export default function FindFilters({ sido, sgg, sggItems, stage, q }: Props) {
  const router = useRouter();
  const [text, setText] = React.useState(q);
  React.useEffect(() => setText(q), [q]);
  const cur: FindQuery = { ...(sgg ? { sgg: sgg.code } : { sido }), stage, q: q || undefined };
  const go = (v: FindQuery) => router.push(findHref(v), { scroll: false });
  return (
    <div className="flex flex-col gap-3">
      <form role="search" action={FIND_BASE} method="get" className="flex max-w-xl items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); go({ ...cur, q: text.trim() || undefined }); }}>
        {sgg ? <input type="hidden" name="sgg" value={sgg.code} /> : <input type="hidden" name="sido" value={sido} />}
        {stage ? <input type="hidden" name="stage" value={stage} /> : null}
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">사업 이름 검색</span>
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden="true" />
          <input type="search" name="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="사업 이름(초성도 돼요)" autoComplete="off"
            className="h-9 w-full min-w-0 rounded-tile border border-input bg-card pr-3 pl-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
        </label>
        <button type="submit" className="ui-btn ui-btn-secondary">찾기</button>
      </form>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="ui-tabs" role="group" aria-label="지역">
            {SIDO_TABS.map(([code, name]) => {
              const on = (sgg ? sgg.code.slice(0, 2) : sido) === code;
              return <button key={code} type="button" className={HIT} aria-pressed={on} onClick={() => go({ sido: code, stage, q: q || undefined })}>{name}</button>;
            })}
          </div>
          {sgg ? <ClearChip href={findHref({ sido: sgg.code.slice(0, 2), stage, q: q || undefined })} title={`${sgg.label} 풀고 시도 전체 보기`}>{sgg.label}</ClearChip> : null}
          {sggItems.length ? <ChipMenu label="시군구" on={!!sgg} title="시군구 고르기" fixed items={sggItems.map((x) => ({ href: findHref({ sgg: x.code, stage, q: q || undefined }), label: x.label, on: sgg?.code === x.code }))} cols={2} /> : null}
        </div>
        <div className="ui-tabs" role="group" aria-label="단계">
          {STAGES.map((s) => <button key={s || 'all'} type="button" className={HIT} aria-pressed={(stage ?? '') === s} onClick={() => go({ ...cur, stage: s || undefined })}>{s ? STAGE_GROUP_NAME[s] : '전체'}</button>)}
        </div>
      </div>
    </div>
  );
}
