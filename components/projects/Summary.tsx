/* 사업 화면 요약 카드의 세 부분(서버가 그린다 — 값은 lib/board/projects-view.ts). 시안: docs/design/home-concept/assets/app.js questions·pipeline·policyCompare.
   - Questions: 핵심 질문 5칸(계획대로·어디서 막힘·어떤 사업·어디 먼저·앞으로 얼마). 누르면 그 답의 거르기(또는 지역 공급)로 간다.
   - Pipeline: 리본 칸마다 원천 실제 기록으로 확인한 사업 수·계획 호수·비율 막대. 기록이 없는 칸은 접은 한 칸(점선)으로 한 번만.
   - PolicyCompare: 정책별 같은 기간 목표 대비 확인. 목표가 있는 단계만 칸으로, 나머지는 '목표 미배정' 한 번. 확인과 담당자 추정을 섞지 않는다 —
     막대는 확인(실색) 뒤에 추정 포함분(옅은 점선), 숫자는 '확인 / 목표' 와 아래 '추정 포함' 줄. 부족·비율은 확인으로만 낸다. */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from 'cn';
import { Badge } from '../ui/badge';
import { HATCH } from '../ui/chips';
import { BOARD_CIR, BOARD_COLOR, BOARD_INK, BOARD_NAMES, BOARD_OFFICIAL, hasEstimate, hasTarget, ymText, type CompareLine, type PipeCell, type Question, type StageCell } from '../../lib/board/projects-view';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const man = (v: number) => (v === 0 ? '0' : v >= 10000 ? `${+(v / 10000).toFixed(1)}만` : fmt(v));
const light = (c: string, p = 28) => `color-mix(in srgb,${c} ${p}%,var(--card))`;
const h3 = 'm-0 text-[16px] font-normal text-muted-foreground';
/* 추정 포함분 막대: 단계색 옅은 면 + 점선 테두리 */
const EST = (c: string): CSSProperties => ({ background: light(c, 55), outline: `1px dashed ${c}`, outlineOffset: '-1px' });

const QA = 'group/q flex w-full min-w-0 flex-col gap-1 rounded-[8px] text-left text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary';
export function Questions({ list }: { list: Question[] }) {
  return (
    <ol className="m-0 grid list-none gap-y-4 divide-x divide-border p-0 narrow:grid-cols-3! narrow:divide-x-0 mobile:grid-cols-2!" style={{ gridTemplateColumns: `repeat(${list.length},minmax(0,1fr))` }} aria-label="핵심 질문">
      {list.map((x) => {
        const inner = (
          <>
            <span className={cn('text-[14px] text-muted-foreground', x.href && 'group-hover/q:text-primary')}>{x.q}</span>
            <b className={cn('font-display text-[28px] leading-[1.2] font-normal whitespace-nowrap tabular-nums', x.tone === 'bad' && 'text-bad', x.muted && 'text-muted-foreground')} style={x.ink ? { color: x.ink } : undefined}>
              {x.value}{x.unit ? <small className="ml-[3px] font-sans text-[14px] font-normal text-muted-foreground">{x.unit}</small> : null}
            </b>
            <span className="truncate text-[13px] text-muted-foreground tabular-nums">{x.sub}</span>
          </>
        );
        return (
          <li key={x.q} className="min-w-0 px-4 first:pl-0 last:pr-0 narrow:pl-0">
            {x.href ? <Link href={x.href} scroll={false} title={x.tip} className={QA}>{inner}</Link> : <div title={x.tip} className={QA}>{inner}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function Pipeline({ open, shut, total, on, href, badges }: { open: PipeCell[]; shut: number[]; total: number; on?: number; href: (i: number) => string; badges?: ReactNode }) {
  const cols = `repeat(${open.length},minmax(0,1fr))${shut.length ? ` minmax(0,${Math.max(0.7, shut.length * 0.45)}fr)` : ''}`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={h3} title="단계마다 원천 실제 기록으로 확인한 사업 수와 그 계획 호수 · 막대 = 범위 사업 중 비율 · 기록 없는 단계는 접은 한 칸 · 칸을 누르면 그 단계(지금 단계)의 사업만">단계 파이프라인</h3>
        {badges}
      </div>
      <ol className="m-0 mt-3 grid list-none gap-2 p-0 narrow:grid-cols-3! mobile:grid-cols-2!" style={{ gridTemplateColumns: cols }} aria-label="단계 파이프라인">
        {open.map((c) => {
          const tip = `${BOARD_CIR[c.i]} ${BOARD_NAMES[c.i]} — 원천 실제 기록으로 확인한 사업 ${fmt(c.n)}건(${c.share.toFixed(0)}%) · 그 사업들의 계획 호수 ${fmt(c.units)}호${c.i === 0 ? ' · ①은 계획 호수를 확인한 사업' : ''} · 누르면 지금 이 단계인 사업만`;
          return (
            <li key={c.i} className="min-w-0">
              <Link href={href(c.i)} scroll={false} aria-current={on === c.i ? 'true' : undefined} title={tip}
                className="card-lift flex h-full w-full min-w-0 flex-col gap-1.5 rounded-[10px] border border-border px-3 py-2.5 text-left text-foreground no-underline aria-[current=true]:border-primary aria-[current=true]:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="flex items-center gap-1.5 text-[14px] whitespace-nowrap" style={{ color: BOARD_INK[c.i] }}><i className="block size-[9px] flex-none rounded-[2px]" style={{ background: BOARD_COLOR[c.i] }} aria-hidden="true" />{BOARD_CIR[c.i]} {BOARD_NAMES[c.i]}</span>
                <span className="flex flex-col">
                  <b className="font-display text-[24px] leading-[1.15] font-normal tabular-nums">{fmt(c.units)}<small className="ml-[3px] font-sans text-[13px] text-muted-foreground">호</small></b>
                  <span className="text-[13px] text-muted-foreground tabular-nums">{fmt(c.n)}건 / {fmt(total)}</span>
                </span>
                <span className="relative block h-[6px]" style={{ background: light(BOARD_COLOR[c.i], 22) }} aria-hidden="true">
                  <span className="q-grow-x absolute inset-y-0 left-0" style={{ width: `${c.share}%`, background: BOARD_COLOR[c.i], '--i': c.i } as CSSProperties} />
                </span>
              </Link>
            </li>
          );
        })}
        {shut.length ? (
          <li className="min-w-0">
            <div className="flex h-full min-h-[80px] flex-col justify-center gap-0.5 rounded-[10px] border border-dashed border-line2 px-3 py-2.5"
              title={`${shut.map((i) => `${BOARD_CIR[i]} ${BOARD_NAMES[i]}`).join(' · ')} — 원천 실제 기록이 있는 사업 없음${shut.includes(5) ? ' · 입주 실적은 원천에서 집계하지 않음(실제 시작일만)' : ''}`}>
              <span className="text-[14px] text-muted-foreground">{shut.map((i) => `${BOARD_CIR[i]}${BOARD_NAMES[i]}`).join(' · ')}</span>
              <span className="text-[13px] text-muted-foreground">기록 없음</span>
            </div>
          </li>
        ) : null}
      </ol>
    </div>
  );
}

/* 목표 칸 하나: 목표·확인(+추정 포함) 막대 · 실적 없음 · 연말 목표만 */
function TargetCell({ c, pol }: { c: StageCell; pol: string }) {
  const color = BOARD_COLOR[c.board], tip = c.target != null ? `${pol} ${BOARD_CIR[c.board]} ${BOARD_NAMES[c.board]} — ${ymText(c.from)}~${ymText(c.through)} · 확인 ${c.actual != null ? `${fmt(c.actual)}호` : '없음'}${c.review ? `(검토 중 연결 ${fmt(c.review)}호 포함)` : ''}${hasEstimate(c) ? ` · 추정 포함 ${fmt(c.withEst!)}호(담당자 추정 입력 ${fmt(c.withEst! - c.actual!)}호 — 확인과 구분)` : ''} / 목표 ${fmt(c.target)}호${c.state === 'short' ? ` · 부족 ${fmt(c.gap ?? 0)}호(${c.shortfallPct}%, 확인 기준)` : ''} · 목표: ${c.targetBasis} · 확인: ${c.actualBasis}` : '';
  if (c.target != null && c.actual != null) {
    const short = c.state === 'short', est = hasEstimate(c);
    return (
      <div className="flex flex-col gap-1" title={tip}>
        <span className="relative block h-[8px]" style={{ background: light(color, 30) }}>
          {est ? <span className="absolute inset-y-0 left-0" style={{ width: `${c.estFill}%`, ...EST(color) }} /> : null}
          <span className="absolute inset-y-0 left-0" style={{ width: `${c.fill}%`, background: color }} />
          {short ? <span className="absolute inset-0 border-[1.5px] border-bad" /> : null}
        </span>
        <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
          <b className={cn('text-[14px]', short ? 'text-bad' : 'text-foreground')}>{fmt(c.actual)}</b> / {fmt(c.target)}{short ? <> <b className="text-bad">부족 {c.shortfallPct}%</b></> : null}
        </span>
        {est ? <span className="text-[12px] whitespace-nowrap text-muted-foreground tabular-nums">추정 포함 {fmt(c.withEst!)}</span> : null}
      </div>
    );
  }
  if (c.target != null) {
    return (
      <div className="flex flex-col gap-1" title={tip}>
        <span className={cn('block h-[8px]', HATCH)} style={{ backgroundColor: light(color, 30) }} />
        <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">실적 없음 / {fmt(c.target)}</span>
      </div>
    );
  }
  const ye = c.yearEnd!;
  return (
    <div className="flex flex-col gap-1" title={`${pol} ${BOARD_CIR[c.board]} ${BOARD_NAMES[c.board]} — 같은 기간(${ymText(c.from)}~${ymText(c.through)}) 목표 없음 · 연말 목표 ${ye.date.replace(/-/g, '.')} ${fmt(ye.units)}호(${c.targetBasis})${c.actual != null ? ` · 확인 ${fmt(c.actual)}호(${c.actualBasis})` : ''}`}>
      <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">연말 목표 <b className="text-[14px] text-foreground">{man(ye.units)}</b></span>
      {c.actual != null ? <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">확인 {man(c.actual)}</span> : null}
    </div>
  );
}

export function PolicyCompare({ lines, title, href }: { lines: CompareLine[]; title: string; href: (key: string) => string }) {
  if (!lines.length) return null;
  const used = lines.flatMap((l) => l.cells.filter(hasTarget));
  const c0 = lines[0].cells[0];
  const lg: { label: string; tip: string; cls?: string; style?: CSSProperties }[] = [{ label: '확인', cls: 'bg-mute', tip: '확인 호수(단계색 실색) — 원천·연결 사건과 담당자 측정값 중 추정이 아닌 것' }];
  if (used.some(hasEstimate)) lg.push({ label: '추정 포함', tip: '담당자 추정 입력(기한이 지난 단계에 담당자가 고른 현재값)을 더한 값(옅은 점선) — 비율·부족은 확인으로만', style: EST('var(--mute)') });
  if (used.some((c) => c.target != null)) lg.push({ label: '목표', tip: '같은 기간 목표(같은 색 옅게)', style: { background: light('var(--mute)', 30) } });
  if (used.some((c) => c.target != null && c.actual == null)) lg.push({ label: '실적 없음', cls: `border border-line2 ${HATCH}`, tip: '목표는 있으나 확인 실적 원천이 없음(빗금)' });
  if (used.some((c) => c.state === 'short')) lg.push({ label: '목표 미달', cls: 'border-[1.5px] border-bad', tip: '확인이 목표에 못 미침(빨간 테두리)' });
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={h3} title="정책마다 같은 기간 목표 대비 확인 · 단계 목표가 배정된 정책만(1·29·8·13 은 목표 없음 — 렌즈 칩으로 사업은 볼 수 있음) · 확인은 검토 중 연결 포함, 담당자 추정 입력은 따로 · 정책 전체 범위(policy-progress)">{title}</h3>
        <span className="text-[14px] text-muted-foreground tabular-nums" title="같은 해 1월~기준 달 누적(policy-progress samePeriod)">{ymText(c0.from)}~{c0.through.slice(5, 7)}</span>
        <ul className="m-0 ml-auto flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
          {lg.map((x) => <li key={x.label} className="flex items-center gap-1 whitespace-nowrap" title={x.tip}><i className={cn('block size-[9px] flex-none rounded-[2px]', x.cls)} style={x.style} aria-hidden="true" />{x.label}</li>)}
        </ul>
      </div>
      {lines.map((l) => (
        <div key={l.policy.key} className="mt-2 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-[10px] border border-border px-3 py-2.5">
          <Link href={href(l.policy.key)} scroll={false} className="flex flex-col rounded-[6px] text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" title={`${l.policy.name} · ${l.policy.announced.replace(/-/g, '.')} 발표 · ${l.policy.scope} · 누르면 이 렌즈`}>
            <b className="font-display text-[20px] leading-[1.2] font-normal hover:underline">{l.policy.short}</b>
            <span className="text-[13px] text-muted-foreground tabular-nums">사업 {fmt(l.n)}건 · {fmt(l.units)}호</span>
          </Link>
          {l.cells.filter(hasTarget).map((c) => (
            <div key={c.key} className="flex min-w-[150px] flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[14px] whitespace-nowrap" style={{ color: BOARD_INK[c.board] }} title={`공식 단계 ${BOARD_OFFICIAL[c.board]} · HOME 단계 '${c.label}'`}><i className="block size-[9px] flex-none rounded-[2px]" style={{ background: BOARD_COLOR[c.board] }} aria-hidden="true" />{BOARD_CIR[c.board]} {BOARD_NAMES[c.board]}</span>
              <TargetCell c={c} pol={l.policy.short} />
            </div>
          ))}
          <span className="ml-auto flex items-center gap-2">
            {l.none.length ? <span className="text-[13px] text-muted-foreground" title={`${l.none.map((i) => `${BOARD_CIR[i]} ${BOARD_NAMES[i]}`).join(' · ')} — 같은 기간 단계 목표가 배정되지 않음`}>{l.none.map((i) => BOARD_CIR[i]).join('')} 목표 미배정</span> : null}
            <Badge title="정책–사업 연결 상태 · 검토 중은 담당자 확인 전 제안">검토 중 {fmt(l.review)} · 확정 {fmt(l.confirmed)}</Badge>
          </span>
        </div>
      ))}
    </div>
  );
}
