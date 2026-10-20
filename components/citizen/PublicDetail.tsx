/* 사업 찾기 상세(사업 창 안 — 2026-10-19 서랍 → 모달리스 창: 창 관리자 components/windows 가 클라이언트에서 그린다, 자료는 lib/board/project-window.ts projectWindow). 제안서 4.1·4.4.
   예정 대비 한 줄(안 A — 사실만, 중립 색) → 6칸 사다리 + 호수·공고 나간 호수·공사 n% → 일정 4줄(착공·모집 공고·준공·입주, 실제/예정) + 청약홈 → 연결 링크 · 출처(i).
   정책 서랍의 판정·타임라인·개요·근거 접힘·사업 id 는 두지 않는다. */
import { useId } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { FactNote, PanelHead } from '@/components/page';
import { Card } from '@/components/ui/card';
import InfoTip from '@/components/ui/info-tip';
import PublicSteps from './PublicSteps';
import type { PublicWin } from '@/lib/board/project-window';
import { NEXT, NOTICE_SITE, PAST_DUE_PUBLIC, PAST_DUE_TIP, factLine, fullDate, ho, noticeName, nxOf, periodEnd, prjJudge, sourceName, type Steps } from '@/lib/board/public-labels';

/* 일정 4줄의 차례(제안서 4.4): 착공 · 모집 공고 · 준공 · 입주 — NEXT 번호 */
const ORDER = [1, 0, 2, 3];
const LINK = 'group/action inline-flex items-center gap-px rounded-chip text-meta whitespace-nowrap text-muted-foreground no-underline underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const Chev = () => <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />;

type Extra = { steps: Steps; agency: string; progress1: number | null; progressAt: string | null };
type Props = { d: Pick<PublicWin, 'row' | 'detail' | 'sources' | 'referenceDate'>; x: Extra | undefined; today: string; pastDue: boolean; links: { map: string | null; schedule: string; sameStage: string | null } };

export default function PublicDetail({ d, x, today, pastDue, links }: Props) {
  const r = d.row, steps = x?.steps ?? [null, null, null, null], nx = nxOf(r.next);
  const sid = useId();   // 창마다 고유한 일정 제목 id(옛 고정 id pd-sched)
  const fact = factLine(prjJudge(r), r.overdue);
  /* 일정 칸: 상세 자료(실제 > 예정), 없으면 원장 다음 고비 */
  const rows = ORDER.map((k) => ({ k, v: steps[k] ?? (nx.k === k && nx.d ? ([nx.d, 0] as [string, 0]) : null) }));
  const noSchedule = rows.every((w) => !w.v);
  const noticeStep = rows.find((w) => w.k === 0)?.v;
  const notices = d.detail.notices;
  const alt = r.dateAlt ? `${r.dateAlt.source} 자료에는 준공 ${fullDate(r.dateAlt.planned)} 예정` : null;
  const src = x?.agency || '시행 기관';
  /* 출처: 쉬운 이름으로 묶고(같은 이름은 하나), 원문 주소가 있으면 첫 주소 */
  const srcs: { name: string; url: string | null }[] = [];
  for (const ref of d.detail.refs) {
    const s = d.sources[ref], name = s && sourceName(s.provider);
    if (!name) continue;
    const had = srcs.find((v) => v.name === name);
    if (!had) srcs.push({ name, url: s.url }); else if (!had.url) had.url = s.url;
  }
  return (
    <>
      {fact || pastDue ? (
        <FactNote className="ui-inset" tip={{ label: '예정일', children: <><p>{PAST_DUE_TIP}</p><p>{`${fullDate(d.referenceDate)} 기준`}</p>{alt ? <p>{alt}</p> : null}</> }}>{fact ?? PAST_DUE_PUBLIC}</FactNote>
      ) : null}
      {alt ? <p className="m-0 text-meta text-muted-foreground">{alt}</p> : null}

      <Card render={<section aria-label="지금 단계" />} className="flex flex-col gap-3">
        <PublicSteps current={r.board} />
        <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-base tabular-nums">
          <b className="font-bold">{r.units > 0 ? ho(r.units) : '호수 미정'}</b>
          {r.notice != null ? <span>모집 공고 나간 호수 {ho(r.notice)}</span> : null}
          {x?.progress1 != null ? (
            <span className="inline-flex items-center gap-x-1">공사 {x.progress1.toFixed(1)}%
              <InfoTip label="공사 진행"><p>{`${x.progressAt ? fullDate(x.progressAt) : ''} ${src} 보고`.trim()}</p></InfoTip>
            </span>
          ) : null}
        </p>
      </Card>

      <Card render={<section aria-labelledby={sid} />}>
        <PanelHead id={sid} title="일정" scope={<InfoTip label="일정"><p>예정일은 사업 시행자 계획이라 바뀔 수 있어요</p><p>실제 = 마친 날 · 예정 = 계획한 날</p></InfoTip>} />
        {noSchedule ? <FactNote>이 사업은 아직 일정 자료가 없어요</FactNote> : (
          <dl className="m-0 grid grid-cols-[max-content_max-content_minmax(0,1fr)] gap-x-6 gap-y-2 text-base [&_dd]:m-0 [&_dt]:text-muted-foreground">
            {rows.map(({ k, v }) => (
              <div key={k} className="contents">
                <dt>{NEXT[k]}</dt>
                <dd className="tabular-nums">{v ? fullDate(v[0]) : '미정'}</dd>
                <dd className="text-muted-foreground">{v ? (v[1] ? '실제' : periodEnd(v[0]) < today ? '예정 · 지남' : '예정') : ''}</dd>
              </div>
            ))}
          </dl>
        )}
        {notices?.length ? (
          <ul className="mt-3 mb-0 flex list-none flex-col gap-1.5 p-0 text-meta" aria-label="청약 공고">
            {notices.map((n) => (
              <li key={`${n.system}${n.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className={`${LINK} whitespace-normal`} title={`${NOTICE_SITE[n.system] ?? '원문'} 공고 상세가 새 창으로 열려요`}>
                    <span className="text-foreground">{n.title}</span><ExternalLink className="ml-1 size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only">(새 창)</span>
                  </a>
                ) : <span className="text-foreground">{n.title}</span>}
                {n.date ? <span className="tabular-nums text-muted-foreground">{fullDate(n.date)}</span> : null}
                {n.review !== 'CONFIRMED' ? <span className="ui-chip" title="사업과 공고의 연결을 확인하고 있어요">확인 중</span> : null}
              </li>
            ))}
            {d.detail.noticesMore ? <li className="text-muted-foreground">{`외 ${d.detail.noticesMore}건`}</li> : null}
          </ul>
        ) : noticeStep ? (
          <p className="mt-3 mb-0 flex flex-wrap items-center gap-x-2 text-meta text-muted-foreground">
            <a href="https://www.applyhome.co.kr/" target="_blank" rel="noopener noreferrer" className={LINK} title={`청약홈이 새 창으로 열려요. 공고 이름 '${noticeName(r.name)}'(으)로 찾아 보세요`}>
              청약홈에서 찾기<ExternalLink className="ml-1 size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only">(새 창)</span>
            </a>
            <span>공고 이름 {noticeName(r.name)}</span>
          </p>
        ) : null}
      </Card>

      <nav aria-label="이어서 보기" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {links.map ? <a href={links.map} className={LINK}>지도에서 보기<Chev /></a> : null}
        <Link href={links.schedule} className={LINK}>이 지역 공급 일정<Chev /></Link>
        {links.sameStage ? <Link href={links.sameStage} scroll={false} className={LINK}>같은 단계 사업 보기<Chev /></Link> : null}
        <span className="inline-flex items-center text-meta text-muted-foreground">출처
          <InfoTip label="출처">
            <ul className="m-0 list-none p-0">{srcs.map((s) => <li key={s.name}>{s.name}{s.url ? <> · <a href={s.url} target="_blank" rel="noopener noreferrer">원문</a></> : null}</li>)}</ul>
            <p>{`${fullDate(d.referenceDate)} 기준`}</p>
          </InfoTip>
        </span>
        <Link href={`/projects?id=${encodeURIComponent(r.id)}`} data-window="off" className={`${LINK} ml-auto`}>정책담당자 화면에서 보기<Chev /></Link>
      </nav>
    </>
  );
}

/* 사업 창 머리 부속(제목 옆): 지역(시도 · 시군구) · 시행 기관 · 유형 칩 — 서버(projectWindow)가 만든 글자만 받는다 */
export function PublicHead({ head }: { head: PublicWin['head'] }) {
  return (
    <span className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-body text-muted-foreground">
      <span>{head.area}</span>
      {head.agency ? <span>{`시행 ${head.agency}`}</span> : null}
      {head.program ? <span className="ui-chip" title={head.program.name}>{head.program.short}</span> : null}
      {head.types?.map((t) => <span key={t.name} className="ui-chip" title={`원천 이름: ${t.raw.join(' · ')}`}>{t.name}</span>)}
    </span>
  );
}
