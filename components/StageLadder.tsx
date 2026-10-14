/* 공급 6단계 계단(발표자료 SHEET 03 '주택공급 6단계, 단계마다 답해야 할 질문'의 그림). 단계를 표기하는 화면(사업 목록·사업 상세·보고자료)이 함께 쓴다.
   범례(공개 범위) → 계단 6칸(상자가 단계마다 높아지고 한 기준선에 선다). 칸마다 답할 질문은 칸의 title 에 둔다(화면 문구 최소화). 01~04 는 담당자 열람(파랑), 05~06 은 국민 공개(초록).
   current 는 지금 단계(진한 면·주색 고리·'현재' — 다크는 밝은 주색 고리·펄스가 사각 후광처럼 떠서 고리 없이 면·'현재'만), counts 는 칸 안의 사업 수. 칸은 그 단계로 거른 사업 목록(/projects?stage=NN)으로 가는 링크이고,
   사업 목록은 href 로 다른 거르기(시군구)를 이어 붙인다.
   900px 이하는 계단 대신 세로 목록(상자 높이를 푼다). */
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import { STAGES } from '../lib/board/stages';

/* flat: 계단 대신 같은 높이(64px)의 한 줄(사업 상세 서랍 — 좁은 서랍에서 계단 높이 148px 를 쓰지 않는다) */
type Props = { current?: string; counts?: Record<string, number>; className?: string; href?: (code: string) => string; flat?: boolean };

const SCOPE = { gov: 'var(--scope-gov)', pub: 'var(--scope-pub)' } as const;

export default function StageLadder({ current, counts, className, href = (code) => `/projects?stage=${code}`, flat = false }: Props) {
  return (
    <div data-slot="stage-ladder" className={className}>
      <p className="m-0 mb-1 flex flex-wrap justify-end gap-x-2.5 gap-y-0.5 text-[12px] text-muted-foreground" aria-label="공개 범위">
        <span className="flex items-center gap-1"><i className="block size-[9px] rounded-[2px] border-2 border-[var(--scope-gov)]" aria-hidden="true" />담당자 열람 (01~04)</span>
        <span className="flex items-center gap-1"><i className="block size-[9px] rounded-[2px] border-2 border-[var(--scope-pub)]" aria-hidden="true" />국민에게도 공개 (05~06)</span>
      </p>
      <ol className="m-0 grid list-none grid-cols-6 p-0 mobile:grid-cols-1 mobile:gap-2" aria-label="공급 6단계">
        {STAGES.map((s, i) => {
          const on = s.code === current, n = counts?.[s.code];
          const style = { '--sc': SCOPE[s.scope], '--h': `${64 + i * 16}px`, '--i': i * 1.5 } as CSSProperties;   // --i: 첫 화면에 01→06 차례로 오른다(q-rise)
          return (
            <li key={s.code} className="q-rise flex min-w-0 flex-col" style={style}>
              <div className={cn('flex items-end border-b-2 border-line2 px-1.5 mobile:h-auto mobile:border-b-0 mobile:px-0', !flat && 'h-[148px]')}>
                <Link href={href(s.code)} aria-current={on ? 'step' : undefined} title={`${s.code} ${s.name} — ${s.q}`}
                  className={cn('card-lift keep-border flex h-[var(--h)] w-full flex-col items-center justify-center gap-0.5 border-2 border-b-0 border-[var(--sc)] px-1 text-center no-underline mobile:h-auto mobile:flex-row mobile:justify-start mobile:gap-2 mobile:rounded-[8px] mobile:border-b-2 mobile:px-3 mobile:py-1.5',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    flat && 'h-auto min-h-[64px]',
                    on ? 'q-pulse bg-[color-mix(in_srgb,var(--sc)_24%,var(--card))] text-foreground [box-shadow:0_0_0_2px_var(--primary)] dark:[box-shadow:none]' : 'bg-[color-mix(in_srgb,var(--sc)_14%,var(--card))] text-[var(--sc)] hover:bg-[color-mix(in_srgb,var(--sc)_22%,var(--card))]')}>
                  <span className="text-[15px] leading-none tabular-nums">{s.code}</span>
                  <b className="font-display text-[20px] leading-[1.25] font-normal">{s.name}</b>
                  {/* 건수와 '현재'는 한 줄 — 가장 낮은 01 칸(64px)에서도 칸 안에 든다 */}
                  {n !== undefined || on ? (
                    <span className="flex items-center gap-1.5">
                      {n !== undefined ? <span className="text-[14px] leading-none text-foreground tabular-nums">{n}건</span> : null}
                      {on ? <span className="rounded-full bg-primary px-2 text-[12px] leading-[18px] font-bold text-primary-foreground">현재</span> : null}
                    </span>
                  ) : null}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
