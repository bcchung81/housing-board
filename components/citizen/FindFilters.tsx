'use client';
/* 사업 찾기(/citizen/projects) 거르기 한 줄: 이름 검색(.ui-search) · 지역 탭(수도권·서울·경기·인천 + 시군구 메뉴·풀기) · 단계 탭(전체·계획·인허가·착공·모집).
   지역 = 채움 탭 .ui-tabs-seg, 단계 = 밑줄 탭 .ui-tabs-line(고른 단계는 단계 글자색 --tab-c, /citizen 과 같음) — 눌림 단추, role=group — 누르면 주소(?sido·?sgg·?stage·?q)를 바꾼다. 검색은 스크립트가 없어도 GET 폼으로 동작한다.
   지역을 고르면 늘 주소에 적는다(수도권도 ?sido=metro). 수도권 전체를 볼 때(myArea)는 지역 탭 옆에 저장된 내 동네로 가는 단추(MyAreaFirst — 2026-10-21 W6, 자동 이동 없음). */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from 'cn';
import { ChipMenu, ClearChip } from '@/components/ui/chips';
import MyAreaFirst from './MyAreaFirst';
import { FIND_BASE, STAGE_GROUP_NAME, findHref, type FindQuery, type StageGroup } from '@/lib/board/public-labels';

const SIDO_TABS: [string, string][] = [['metro', '수도권'], ['11', '서울'], ['41', '경기'], ['28', '인천']];
const STAGES: (StageGroup | '')[] = ['', 'plan', 'permit', 'build', 'sale'];
/* 탭 누름 칸 44px(보이는 높이 --ctl-h 40 안쪽 32 + 위아래 6) */
const HIT = 'relative before:absolute before:inset-x-0 before:-inset-y-1.5';
/* 시군구 메뉴·풀기 칩(공용 칩 부품)을 탭과 같은 높이 --ctl-h · 같은 반경(tile) 로 맞춘다. 안 고른 메뉴는 채움 탭 틀과 같은 면(--muted, 테두리·그림자 없음) */
const MENU = '[&_summary]:h-(--ctl-h) [&_summary]:rounded-tile [&_summary]:px-3 [&_a]:h-(--ctl-h) [&_a]:rounded-tile [&_a]:px-3';
const MENU_OFF = '[&_summary]:border-transparent [&_summary]:bg-muted [&_summary]:shadow-none';
/* 단계 탭 색: 단계 글자색 --st-*-ink(전체는 기본 --foreground) */
const STAGE_INK: Record<string, string> = { plan: '[--tab-c:var(--st-plan-ink)]', permit: '[--tab-c:var(--st-permit-ink)]', build: '[--tab-c:var(--st-build-ink)]', sale: '[--tab-c:var(--st-sale-ink)]' };

type Props = { sido: string; sgg: { code: string; label: string } | null; sggItems: { code: string; label: string }[]; stage?: StageGroup; q: string; myArea?: boolean };

export default function FindFilters({ sido, sgg, sggItems, stage, q, myArea }: Props) {
  const router = useRouter();
  const [text, setText] = React.useState(q);
  React.useEffect(() => setText(q), [q]);
  const cur: FindQuery = { ...(sgg ? { sgg: sgg.code } : { sido }), stage, q: q || undefined };
  const go = (v: FindQuery) => router.push(findHref(v), { scroll: false });
  /* 한 줄(컨테이너 폭 ≥ 64rem): [검색 + 찾기] · [지역 탭 · 시군구] · [단계 탭], 검색이 남는 폭을 채움(최소 15rem·최대 28rem). 모자라면 탭 묶음이 다음 줄, 37.5rem 이하는 검색 → 지역 → 단계 세로.
     조작 높이는 줄 전체가 --btn-h = --ctl-h(40) 로 한 값(/citizen 위쪽 줄과 같은 부품 .ui-search · .ui-tabs) */
  return (
    <div className="@container [--btn-h:var(--ctl-h)]">
      <div className="flex flex-col gap-3 @min-[64rem]:flex-row @min-[64rem]:items-center">
        <form role="search" action={FIND_BASE} method="get" className="flex max-w-xl items-center gap-2 @min-[64rem]:max-w-md @min-[64rem]:flex-1"
          onSubmit={(e) => { e.preventDefault(); go({ ...cur, q: text.trim() || undefined }); }}>
          {sgg ? <input type="hidden" name="sgg" value={sgg.code} /> : <input type="hidden" name="sido" value={sido} />}
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          <label className="ui-search min-w-60 flex-1">
            <span className="sr-only">사업 이름 검색</span>
            <Search aria-hidden="true" />
            <input type="search" name="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="사업 이름(초성도 돼요)" autoComplete="off" />
          </label>
          <button type="submit" className="ui-btn ui-btn-secondary">찾기</button>
        </form>
        <div className="flex flex-wrap items-center gap-3 @max-[37.5rem]:flex-col @max-[37.5rem]:items-start">
          <div className="flex flex-wrap items-center gap-3">
            <div className="ui-tabs ui-tabs-seg" role="group" aria-label="지역">
              {SIDO_TABS.map(([code, name]) => {
                const on = (sgg ? sgg.code.slice(0, 2) : sido) === code;
                return <button key={code} type="button" className={HIT} aria-pressed={on} onClick={() => go({ sido: code, stage, q: q || undefined })}>{name}</button>;
              })}
            </div>
            {sgg ? <div className={MENU}><ClearChip href={findHref({ sido: sgg.code.slice(0, 2), stage, q: q || undefined })} title={`${sgg.label} 풀고 시도 전체 보기`}>{sgg.label}</ClearChip></div> : null}
            {sggItems.length ? <div className={cn(MENU, !sgg && MENU_OFF)}><ChipMenu label="시군구" on={!!sgg} title="시군구 고르기" fixed items={sggItems.map((x) => ({ href: findHref({ sgg: x.code, stage, q: q || undefined }), label: x.label, on: sgg?.code === x.code }))} cols={2} /></div> : null}
            {myArea ? <MyAreaFirst to="find" stage={stage} /> : null}
          </div>
          <div className="ui-tabs ui-tabs-line" role="group" aria-label="단계">
            {STAGES.map((s) => <button key={s || 'all'} type="button" className={cn(HIT, STAGE_INK[s])} aria-pressed={(stage ?? '') === s} onClick={() => go({ ...cur, stage: s || undefined })}>{s ? STAGE_GROUP_NAME[s] : '전체'}</button>)}
          </div>
        </div>
      </div>
    </div>
  );
}
