/* 사업 화면 요약 카드의 세 부분(서버가 그린다 — 값은 lib/board/projects-view.ts). 시안: docs/design/home-concept/assets/app.js questions·pipeline·policyCompare.
   - Questions: 핵심 질문 5칸(정책 목표 대비·어디서 막힘·어떤 사업·어디 먼저·앞으로 얼마). 누르면 그 답의 거르기(또는 지역 공급)로 간다. 칸마다 쉬운 말 정의 ⓘ(help).
     첫 칸(정책 목표 대비, 정책 전체 범위)은 page 가 '요약 범위' 줄 밖에 따로 두고, 대표 단계 하나 대신 ①~⑥ 단계마다 확인/목표·비율·미니 막대를 가로 여섯 칸으로(StageRates — 단계별 진행과 같은 칸).
     2026-10-16 3차 평가: 정책 카드를 원장 카드 옆 좁은 칸에 세로 줄로 두면 원장 카드보다 짧아 아래가 165px(인쇄 보기 414px) 비었다 — 위아래로 쌓고 가로로 편다.
   - Pipeline(보이는 이름 '단계별 진행'): 리본 칸마다 이 단계까지 온 사업(지금 이 단계이거나 그 뒤 단계 — 현재 단계 기준 누적이라 ①계획 = 전체, 계획 호수·비율 막대)과 지금 이 단계(누르면 거르는 기준).
     여섯 칸은 늘 같은 폭(2026-10-16 2차 평가: 없는 칸을 하나로 합치면 폭이 고르지 않고 인쇄 보기 오른쪽이 빈다) — 둘 다 없는 칸은 제자리에 점선 칸 '사업 없음'.
   - ReadHelp: 핵심 정의(지연 구간 · 확인과 담당자 추정 · 이 단계까지 온 사업과 지금 · 병목 · 앞으로 12개월)를 눌러서 여는 ⓘ 하나로(인쇄에는 펼친 목록).
   - PolicyCompare: 정책별 같은 기간 목표 대비 확인 — 기본 접힘(<details>, 머리에 핵심 한 줄 compareHead), 인쇄 보기는 펼침. 목표가 있는 단계만 칸으로, 나머지는 '목표 없음' 한 번.
     확인과 담당자 추정을 섞지 않는다 — 막대는 확인(실색) 뒤에 추정 포함분(옅은 점선), 숫자는 '확인 / 목표' 와 아래 '추정 포함' 줄. 달성률은 확인으로만 낸다.
     비율은 모든 칸이 목표 대비 달성률 '달성 n%' 하나(2026-10-16 4차 평가 — 미달을 '부족 n%'로 따로 쓰지 않는다), 막대에는 목표 = 100% 기준선(TargetLine, 세로 줄).
     정책–사업 연결 상태(확정·확정 전)는 보이는 글에 쓰지 않고 정책 이름 title 에만. */
import Link from 'next/link';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { cn } from 'cn';
import { Card, cardVariants } from '@/components/ui/card';
import { HATCH } from '@/components/ui/chips';
import InfoTip from '@/components/ui/info-tip';
import LinkPending from '@/components/ui/link-pending';
import { ChevronRight } from 'lucide-react';
import { AHEAD_COMPLETION, BOARD_CIR, BOARD_COLOR, BOARD_INK, BOARD_NAMES, DELAY_GROUP, compareHead, hasEstimate, hasTarget, pct1, policyLabel, rateOf, stageCellTip, ymText, type CompareLine, type PipeCell, type Question, type StageCell } from '@/lib/board/projects-view';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const man = (v: number) => (v === 0 ? '0' : v >= 10000 ? `${+(v / 10000).toFixed(1)}만` : fmt(v));
const light = (c: string, p = 28) => `color-mix(in srgb,${c} ${p}%,var(--card))`;
/* 카드 안 소제목: 화면 제목(h1) 바로 아래 단계라 h2(모양은 작은 회색 소제목) — 인쇄 보기에서도 h1 → h2 순서 */
const h3 = 'm-0 text-base font-normal text-muted-foreground';
/* 추정 포함분 막대: 단계색 옅은 면 + 점선 테두리 */
const EST = (c: string): CSSProperties => ({ background: light(c, 55), outline: `1px dashed ${c}`, outlineOffset: '-1px' });

/* 목표 = 100% 기준선: 막대 안 at%(미달은 오른쪽 끝, 초과는 목표 자리 — StageCell.mark) 세로 줄, 막대 위아래로 2px 나온다 */
const TargetLine = ({ at }: { at: number }) => <span data-slot="target-line" className="absolute -inset-y-[2px] w-[2px] -translate-x-full bg-foreground" style={{ left: `${at}%` }} />;

/* 첫 칸의 단계 칸 미니 막대: 확인/목표(단계색 실색) 뒤에 담당자 추정 포함(옅은 점선) · 목표 = 100% 기준선 · 목표 미달은 빨간 테두리 · 목표만 있고 실적 없음은 빗금 · 목표 없음은 점선 한 줄 */
function MiniBar({ c }: { c: StageCell }) {
  const color = BOARD_COLOR[c.board];
  if (c.target == null) return <span className="my-[2px] block h-[2px] border-t border-dashed border-line2" aria-hidden="true" />;
  if (c.actual == null) return <span className={cn('block h-[6px] rounded-full', HATCH)} style={{ backgroundColor: light(color, 30) }} aria-hidden="true" />;
  return (
    <span className="relative block h-[6px] rounded-full" style={{ background: light(color, 30) }} aria-hidden="true">
      {hasEstimate(c) ? <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.estFill}%`, ...EST(color) }} /> : null}
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.fill}%`, background: color }} />
      {c.state === 'short' ? <span className="absolute inset-0 rounded-full border border-bad" /> : null}
      <TargetLine at={c.mark} />
    </span>
  );
}

/* 첫 칸의 단계 칸(가로 여섯 칸 — 단계별 진행과 같은 폭): 단계 이름(단계 글자색) · 달성 n%(확인 기준 — rateOf) / 미니 막대 / 확인 / 목표.
   목표가 없는 단계는 '목표 없음'(옅게), 담당자 추정 포함은 칸 title 에 */
function StageRates({ cells }: { cells: StageCell[] }) {
  return (
    <span className="mt-1 grid gap-x-3 gap-y-3 text-sm leading-body whitespace-nowrap tabular-nums narrow:grid-cols-3! mobile:grid-cols-2! phone:grid-cols-2!" style={{ gridTemplateColumns: 'repeat(6,minmax(0,1fr))' }}>
      {cells.map((c) => {
        const both = c.target != null && c.actual != null, short = c.state === 'short';
        return (
          <span key={c.key} title={stageCellTip(c, '', cells)} className={cn('flex min-w-0 flex-col gap-1', !both && 'text-muted-foreground')}>
            <span className="flex items-baseline justify-between gap-2">
              <span style={both ? { color: BOARD_INK[c.board] } : undefined}>{BOARD_CIR[c.board]}{BOARD_NAMES[c.board]}</span>
              <span className={cn(short ? 'font-bold text-bad' : both && c.actual! > c.target! ? 'text-ok' : undefined)}>{both ? rateOf(c).word : ''}</span>
            </span>
            <MiniBar c={c} />
            {both ? <span className="text-muted-foreground"><b className="font-bold text-foreground">{fmt(c.actual!)}</b> / {fmt(c.target!)}</span>
              : c.target != null ? <span>실적 없음 / {fmt(c.target)}</span> : <span>목표 없음</span>}
          </span>
        );
      })}
    </span>
  );
}

const QA = 'group/q relative flex w-full min-w-0 flex-col gap-1 rounded-tile text-left text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary';
export function Questions({ list }: { list: Question[] }) {
  return (
    <ol className={cn('m-0 grid list-none gap-3 p-0', list.length > 2 && 'narrow:grid-cols-3! mobile:grid-cols-2! phone:grid-cols-1!')} style={{ gridTemplateColumns: `repeat(${list.length},minmax(0,1fr))` }} aria-label="핵심 질문">
      {list.map((x) => {
        const inner = (
          <>
            <span className={cn('flex min-w-0 items-center gap-1.5 pr-7 text-sm text-muted-foreground', x.href && 'group-hover/q:text-primary')}>
              <span className="line-clamp-2 [word-break:keep-all]" title={x.q}>{x.q}</span>{/* 말줄임 대신 두 줄까지(2026-10-16 4차 평가) */}
            </span>
            {x.stages ? <StageRates cells={x.stages} /> : <>
            <b className={cn('text-2xl leading-title font-bold whitespace-nowrap tabular-nums', x.tone === 'bad' && 'text-bad', x.muted && 'text-muted-foreground')} style={x.ink ? { color: x.ink } : undefined}>
              {x.value}{x.unit ? <small className="ml-[3px] font-sans text-sm font-normal text-muted-foreground">{x.unit}</small> : null}
            </b>
            <span data-slot="q-sub" className="text-sm text-pretty text-muted-foreground tabular-nums" title={x.sub}>{x.sub}</span>{/* 줄바꿈 허용(말줄임 없음 — 1280·인쇄에서 '확인 필요(후보) 313'이 잘렸다) */}
            </>}
          </>
        );
        return (
          <li key={x.q} className={cn(cardVariants({ variant: 'inset' }), 'relative min-w-0 px-tile-x! py-tile-y!')}>
            {x.href ? <Link href={x.href} scroll={false} title={x.tip} className={QA}>{inner}<LinkPending /></Link> : <div title={x.tip} className={QA}>{inner}</div>}
            <span className="absolute top-1.5 right-2"><InfoTip label={x.q}><p>{x.help}</p>{x.note ? <p>{x.note}</p> : null}</InfoTip></span>
          </li>
        );
      })}
    </ol>
  );
}

export function Pipeline({ open, total, on, href, badges }: { open: PipeCell[]; total: number; on?: number; href: (i: number) => string; badges?: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="ui-h3" title="큰 숫자·막대 = 이 단계까지 온 사업(지금 이 단계이거나 그 뒤 단계에 있는 사업 — ①계획은 전체)의 계획 호수·비율 · 지금 이 단계 = 현재 그 단계인 사업 · 칸을 누르면 지금 그 단계인 사업만 목록에">단계별 진행</h3>
        <InfoTip label="단계별 진행">
          <p>사업이 계획부터 입주까지 여섯 단계 중 어디까지 왔는지 셉니다.</p>
          <p>큰 숫자는 이 단계까지 온 사업의 집 수(호)입니다. 지금 착공 단계인 사업은 계획·인허가에도 셉니다. &apos;지금 이 단계&apos;는 지금 바로 그 단계에 있는 사업 수입니다. 칸을 누르면 그 사업만 아래 목록에 남습니다.</p>
          <p>&apos;누적&apos;이라 지금 그 단계인 호수만 세는 종합상황판 단계표와 다릅니다(종합상황판 착공은 통계누리 누계). &apos;사업 없음&apos; 칸은 이 단계까지 온 사업이 없다는 뜻입니다(⑥입주는 원천에 입주 실적이 없음).</p>
        </InfoTip>
        {badges}
      </div>
      <ol className="m-0 mt-3 grid list-none gap-2 p-0 narrow:grid-cols-3! mobile:grid-cols-2! phone:grid-cols-2!" style={{ gridTemplateColumns: 'repeat(6,minmax(0,1fr))' }} aria-label="단계별 진행">
        {BOARD_NAMES.map((_, i) => {
          const c = open.find((x) => x.i === i);
          if (!c) return (
            <li key={i} className="min-w-0">
              <div className="ui-inset flex h-full min-h-[80px] flex-col justify-center gap-0.5"
                title={`${BOARD_CIR[i]} ${BOARD_NAMES[i]} — 이 단계까지 온 사업이 없음${i === 5 ? ' · 입주 실적은 원천에서 집계하지 않음(실제 시작일만)' : ''}`}>
                <span className="text-sm text-muted-foreground">{BOARD_CIR[i]} {BOARD_NAMES[i]}</span>
                <span className="text-sm text-muted-foreground">사업 없음</span>
              </div>
            </li>
          );
          const tip = `${BOARD_CIR[c.i]} ${BOARD_NAMES[c.i]} — 이 단계까지 온 사업 ${fmt(c.n)}건(${pct1(c.share)}% · 지금 이 단계이거나 그 뒤 단계인 사업) · 계획 호수 ${fmt(c.units)}호 · 지금 이 단계 ${fmt(c.now)}건${c.now ? ' — 누르면 그 사업만 목록에' : ''}`;
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-sm whitespace-nowrap" style={{ color: BOARD_INK[c.i] }}><i className="block size-[9px] flex-none rounded-chip" style={{ background: BOARD_COLOR[c.i] }} aria-hidden="true" />{BOARD_CIR[c.i]} {BOARD_NAMES[c.i]}</span>
              <span className="flex flex-col">
                <b className="text-xl leading-title font-bold tabular-nums">{fmt(c.units)}<small className="ml-[3px] font-sans text-sm whitespace-nowrap text-muted-foreground">호</small><small data-slot="stage-def" className="ml-1.5 font-sans text-sm font-normal whitespace-nowrap text-muted-foreground" title="이 단계까지 온 누적(지금 이 단계이거나 그 뒤 단계) — 종합상황판 단계표는 지금 그 단계인 호수, 지시 카드 착공은 통계누리 누계">누적</small></b>
                <span className="text-sm text-muted-foreground tabular-nums">이 단계까지 온 사업 {fmt(c.n)} / {fmt(total)}</span>
              </span>
              <span className="relative block h-[6px] rounded-full" style={{ background: light(BOARD_COLOR[c.i], 22) }} aria-hidden="true">
                <span className="q-grow-x absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.share}%`, background: BOARD_COLOR[c.i], '--i': c.i } as CSSProperties} />
              </span>
              <span className={cn('text-sm tabular-nums', c.now ? 'text-foreground' : 'text-muted-foreground')}>지금 이 단계 <b>{fmt(c.now)}</b>{c.now ? <span data-ctl className="ml-0.5 text-muted-foreground print:hidden" aria-hidden="true">›</span> : null}</span>
            </>
          );
          const box = cn(cardVariants({ variant: 'inset' }), 'flex h-full w-full min-w-0 flex-col gap-1.5 text-left text-foreground no-underline');
          return (
            <li key={c.i} className="min-w-0">
              {c.now ? (
                <Link href={href(c.i)} scroll={false} aria-current={on === c.i ? 'true' : undefined} title={tip}
                  className={cn('relative transition-colors hover:bg-accent', box, 'aria-[current=true]:bg-primary/10 aria-[current=true]:font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary')}>{body}<LinkPending /></Link>
              ) : <div title={tip} className={box}>{body}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* 목표 칸 하나: 목표·확인(+추정 포함) 막대 · 실적 없음 · 연말 목표만 */
function TargetCell({ c, pol }: { c: StageCell; pol: string }) {
  const color = BOARD_COLOR[c.board], tip = c.target != null ? `${pol} ${BOARD_CIR[c.board]} ${BOARD_NAMES[c.board]} — ${ymText(c.from)}~${ymText(c.through)} · 확인 ${c.actual != null ? `${fmt(c.actual)}호` : '없음'}${c.review ? `(확정 전 연결 ${fmt(c.review)}호 포함)` : ''}${hasEstimate(c) ? ` · 담당자 추정 포함 ${fmt(c.withEst!)}호(담당자 추정 입력 ${fmt(c.withEst! - c.actual!)}호 — 확인과 구분)` : ''} / 목표 ${fmt(c.target)}호${c.actual != null ? ` · ${rateOf(c).word}(확인 기준)${c.state === 'short' ? ` · 목표까지 ${fmt(c.gap ?? 0)}호` : ''}` : ''} · 목표: ${c.targetBasis} · 확인: ${c.actualBasis}` : '';
  if (c.target != null && c.actual != null) {
    const short = c.state === 'short', est = hasEstimate(c);
    return (
      <div className="flex flex-col gap-1" title={tip}>
        <span className="relative block h-[8px] rounded-full" style={{ background: light(color, 30) }}>
          {est ? <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.estFill}%`, ...EST(color) }} /> : null}
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.fill}%`, background: color }} />
          {short ? <span className="absolute inset-0 rounded-full border border-bad" /> : null}
          <TargetLine at={c.mark} />
        </span>
        <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
          <b className={cn('text-sm', short ? 'text-bad' : 'text-foreground')}>{fmt(c.actual)}</b> / {fmt(c.target)} <b className={short ? 'text-bad' : c.actual > c.target ? 'text-ok' : 'text-foreground'}>{rateOf(c).word}</b>
        </span>
        {est ? <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">담당자 추정 포함 {fmt(c.withEst!)}</span> : null}
      </div>
    );
  }
  if (c.target != null) {
    return (
      <div className="flex flex-col gap-1" title={tip}>
        <span className={cn('block h-[8px] rounded-full', HATCH)} style={{ backgroundColor: light(color, 30) }} />
        <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">실적 없음 / {fmt(c.target)}</span>
      </div>
    );
  }
  const ye = c.yearEnd!;
  return (
    <div className="flex flex-col gap-1" title={`${pol} ${BOARD_CIR[c.board]} ${BOARD_NAMES[c.board]} — 같은 기간(${ymText(c.from)}~${ymText(c.through)}) 목표 없음 · 연말 목표 ${ye.date.replace(/-/g, '.')} ${fmt(ye.units)}호(${c.targetBasis})${c.actual != null ? ` · 확인 ${fmt(c.actual)}호(${c.actualBasis})` : ''}`}>
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">연말 목표 <b className="text-sm text-foreground">{man(ye.units)}</b></span>
      {c.actual != null ? <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">확인 {man(c.actual)}</span> : null}
    </div>
  );
}

export function PolicyCompare({ lines, title, href, open = false }: { lines: CompareLine[]; title: string; href: (key: string) => string; open?: boolean }) {
  if (!lines.length) return null;
  const used = lines.flatMap((l) => l.cells.filter(hasTarget));
  const c0 = lines[0].cells[0];
  const lg: { label: string; tip: string; cls?: string; style?: CSSProperties }[] = [{ label: '확인', cls: 'bg-mute', tip: '확인 호수(단계색 실색) — 원천·연결 사건과 담당자 측정값 중 추정이 아닌 것' }];
  if (used.some(hasEstimate)) lg.push({ label: '담당자 추정 포함', tip: '담당자 추정 입력(기한이 지난 단계에 담당자가 고른 현재값)을 더한 값(옅은 점선) — 달성률은 확인으로만', style: EST('var(--mute)') });
  if (used.some((c) => c.target != null)) lg.push({ label: '목표(100%)', tip: '같은 기간 목표 = 100% 기준선(세로 줄) — 막대가 줄을 넘으면 목표 이상', cls: 'w-[2px]! rounded-none! bg-foreground' });
  if (used.some((c) => c.target != null && c.actual == null)) lg.push({ label: '실적 없음', cls: `border border-line2 ${HATCH}`, tip: '목표는 있으나 확인 실적 원천이 없음(빗금)' });
  if (used.some((c) => c.state === 'short')) lg.push({ label: '목표 미달', cls: 'border border-bad', tip: '확인이 목표에 못 미침(빨간 테두리)' });
  /* 기본 접힘(목록 앞 블록을 줄인다) — 머리에 정책마다 핵심 한 줄. ⓘ 는 summary 밖(누르면 접힘이 바뀌지 않게) */
  return (
    <div className="relative mt-5">
      <details data-fold open={open} className="group/fold">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-tile pr-10 hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
          title="정책마다 같은 기간 목표 대비 확인 · 단계 목표가 배정된 정책만(1·29·8·13 대책은 목표 없음 — 정책 칩으로 사업은 볼 수 있음) · 확인은 담당자가 아직 확정하지 않은 연결 포함, 담당자 추정 입력은 따로 · 정책 전체 범위(수도권·전국 거르기와 상관없음) · 누르면 펼치기/접기">
          <ChevronRight data-ctl className="size-4 flex-none text-muted-foreground transition-transform group-open/fold:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
          <h2 className={h3}>{title}</h2>
          <span className="text-sm text-muted-foreground tabular-nums" title="같은 해 1월~기준 달 누적">{ymText(c0.from)}~{ymText(c0.through)} · 정책 전체</span>
          {lines.map((l) => <span key={l.policy.key} className="text-sm text-foreground tabular-nums">{compareHead(l)}</span>)}
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ul className="m-0 ml-auto flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-sm text-muted-foreground" aria-label="범례">
            {lg.map((x) => <li key={x.label} className="flex items-center gap-1 whitespace-nowrap" title={x.tip}><i className={cn('block size-[9px] flex-none rounded-chip', x.cls)} style={x.style} aria-hidden="true" />{x.label}</li>)}
          </ul>
        </div>
        {lines.map((l) => (
          <Card variant="inset" key={l.policy.key} className="mt-2 flex flex-wrap items-center gap-x-8 gap-y-2">
            <Link href={href(l.policy.key)} scroll={false} className="flex flex-col rounded-chip text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              title={`${l.policy.name} · ${l.policy.announced.replace(/-/g, '.')} 발표 · ${l.policy.scope} · 정책–사업 연결: 담당자 확정 ${fmt(l.confirmed)}건 · 확정 전(제안) ${fmt(l.review)}건 · 누르면 이 정책의 사업`}>
              <b className="text-lg leading-title font-bold whitespace-nowrap hover:underline">{policyLabel(l.policy)}</b>
              <span className="text-sm text-muted-foreground tabular-nums">사업 {fmt(l.n)}건 · {fmt(l.units)}호</span>
            </Link>
            {l.cells.filter(hasTarget).map((c) => (
              <div key={c.key} className="flex min-w-[150px] flex-col gap-1">
                <span className="flex items-center gap-1.5 text-sm whitespace-nowrap" style={{ color: BOARD_INK[c.board] }} title={`정책 진행 자료(HOME)의 단계 이름 '${c.label}'`}><i className="block size-[9px] flex-none rounded-chip" style={{ background: BOARD_COLOR[c.board] }} aria-hidden="true" />{BOARD_CIR[c.board]} {BOARD_NAMES[c.board]}</span>
                <TargetCell c={c} pol={l.policy.short} />
              </div>
            ))}
            {l.none.length ? <span className="ml-auto text-sm text-muted-foreground" title={`${l.none.map((i) => `${BOARD_CIR[i]} ${BOARD_NAMES[i]}`).join(' · ')} — 같은 기간 단계 목표가 배정되지 않음`}>{l.none.map((i) => BOARD_CIR[i]).join('')} 목표 없음</span> : null}
          </Card>
        ))}
      </details>
      <span className="absolute top-[-2px] right-0">
        <InfoTip label={title}>
          <p>정부가 정책에서 정한 단계별 목표 호수와 실제 기록으로 확인한 호수를 같은 기간(올해 1월부터)끼리 견줍니다. 단계 목표가 배정된 정책만 보입니다(목표가 없는 정책은 정책 칩으로 사업만 봄).</p>
          <p>정책 전체 숫자라 지역·기관 거르기와 상관없습니다. 비율은 모두 &apos;달성 %&apos; = 확인 ÷ 목표(100%가 목표, 확인 기준)입니다. 확인 값은 정책 진행 자료(HOME)의 원천 값 그대로(검증 대기)입니다.</p>
          <dl>{lg.map((x) => <Fragment key={x.label}><dt>{x.label}</dt><dd>{x.tip}</dd></Fragment>)}</dl>
        </InfoTip>
      </span>
    </div>
  );
}

/* 읽는 법: 핵심 정의를 눌러서 여는 ⓘ 하나로(문구 최소화). 인쇄에는 같은 정의를 펼친 목록으로 싣는다(print 만) */
function Defs() {
  return (
    <dl>
      <dt>{DELAY_GROUP}</dt><dd>지금 잡혀 있는 예정일을 6개월 넘게 넘긴 사업 — 6~12개월은 지연, 12개월이 넘으면 장기(1~6개월 넘긴 주의는 따로 셈) · 사업 번호가 없는 후보는 &apos;확인 필요&apos;로 따로 셈</dd>
      <dt>확인 · 담당자 추정 포함</dt><dd>확인 = 실제 기록으로 확인한 집 수(호, 정책 진행 자료(HOME) 원천 값 그대로) · 담당자 추정 포함 = 여기에 담당자가 짐작해 넣은 값을 더한 수(달성률은 확인한 수로만 계산)</dd>
      <dt>이 단계까지 온 사업 · 지금 이 단계</dt><dd>이 단계까지 온 사업 = 지금 그 단계이거나 그 뒤 단계에 있는 사업(①계획은 전체) · 지금 이 단계 = 지금 바로 그 단계에 있는 사업(칸을 누르면 목록이 그 사업만)</dd>
      <dt>병목</dt><dd>예정일을 6개월 넘게 넘긴 사업의 집 수가 가장 많이 몰린 단계(종합상황판과 같은 계산)</dd>
      <dt>{AHEAD_COMPLETION}</dt><dd>자료 기준 달부터 12개월 안에 공사를 마칠 예정인 사업(이미 공사를 마친 사업은 뺌)</dd>
    </dl>
  );
}
export const ReadHelp = () => <InfoTip label="읽는 법" text="읽는 법"><Defs /></InfoTip>;
export const PrintDefs = () => <div aria-hidden="true" className="mt-4 hidden border-t border-border pt-3 text-sm print:block [&_dd]:m-0 [&_dd]:mb-1 [&_dl]:m-0 [&_dt]:font-bold" data-print-defs><Defs /></div>;
