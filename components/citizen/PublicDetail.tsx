/* 사업 찾기 상세(서랍 안, 서버가 그린다 — 자료는 lib/board/projects-index.ts getProjectDrawer·getPublicDetails). 제안서 4.1·4.4.
   예정 대비 한 줄(안 A — 사실만, 중립 색) → 6칸 사다리 + 호수·공고 나간 호수·공사 n% → 일정 4줄(착공·모집 공고·준공·입주, 실제/예정) + 청약홈 → 연결 링크 · 출처(i).
   정책 서랍의 판정·타임라인·개요·근거 접힘·사업 id 는 두지 않는다. */
import Link from 'next/link';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { PanelHead } from '@/components/page';
import { Card } from '@/components/ui/card';
import InfoTip from '@/components/ui/info-tip';
import PublicSteps from './PublicSteps';
import type { Drawer } from '@/lib/board/projects-index';
import { NEXT, PAST_DUE_PUBLIC, PAST_DUE_TIP, factLine, fullDate, ho, noticeName, nxOf, periodEnd, prjJudge, sourceName, type Steps } from '@/lib/board/public-labels';

/* 일정 4줄의 차례(제안서 4.4): 착공 · 모집 공고 · 준공 · 입주 — NEXT 번호 */
const ORDER = [1, 0, 2, 3];
const LINK = 'group/action inline-flex items-center gap-px rounded-chip text-meta whitespace-nowrap text-muted-foreground no-underline underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const Chev = () => <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />;

type Extra = { steps: Steps; agency: string; progress1: number | null; progressAt: string | null };
type Props = { d: Extract<Drawer, { kind: 'detail' }>; x: Extra | undefined; today: string; pastDue: boolean; links: { map: string | null; schedule: string; sameStage: string | null } };

export default function PublicDetail({ d, x, today, pastDue, links }: Props) {
  const r = d.row, steps = x?.steps ?? [null, null, null, null], nx = nxOf(r.next);
  const fact = factLine(prjJudge(r), r.overdue);
  /* 일정 칸: 상세 자료(실제 > 예정), 없으면 원장 다음 고비 */
  const rows = ORDER.map((k) => ({ k, v: steps[k] ?? (nx.k === k && nx.d ? ([nx.d, 0] as [string, 0]) : null) }));
  const noticeStep = rows.find((w) => w.k === 0)?.v;
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
        <p role="note" className="m-0 ui-inset flex flex-wrap items-center gap-x-1 text-base">
          <span>{fact ?? PAST_DUE_PUBLIC}</span>
          <InfoTip label="예정일"><p>{PAST_DUE_TIP}</p><p>{`${fullDate(d.referenceDate)} 기준`}</p>{alt ? <p>{alt}</p> : null}</InfoTip>
        </p>
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

      <Card render={<section aria-labelledby="pd-sched" />}>
        <PanelHead id="pd-sched" title="일정" scope={<InfoTip label="일정"><p>예정일은 사업 시행자 계획이라 바뀔 수 있어요</p><p>실제 = 마친 날 · 예정 = 계획한 날</p></InfoTip>} />
        <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 text-base [&_dd]:m-0 [&_dt]:text-muted-foreground">
          {rows.map(({ k, v }) => (
            <div key={k} className="contents">
              <dt>{NEXT[k]}</dt>
              <dd className="tabular-nums">{v ? fullDate(v[0]) : '미정'}{v ? <span className="ml-2 text-meta text-muted-foreground">{v[1] ? '실제' : periodEnd(v[0]) < today ? '예정 · 지남' : '예정'}</span> : null}</dd>
            </div>
          ))}
        </dl>
        {noticeStep ? (
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
        <Link href={`/projects?id=${encodeURIComponent(r.id)}`} className={`${LINK} ml-auto`}>정책담당자 화면에서 보기<Chev /></Link>
      </nav>
    </>
  );
}
