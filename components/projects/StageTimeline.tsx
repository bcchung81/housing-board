/* 사업 상세 서랍의 '단계 타임라인'(서버가 그린다 — 위치는 lib/board/projects-view.ts timelineOf 의 %). 시안: docs/design/home-concept/assets/app.js timeline.
   단계마다 두 줄: 현재(원장 현재 예정 — 점선 칸, 경과면 빨간·노란 테두리) · 실제(원천에서 확인한 날짜 — 점, ③착공은 공사 기간 막대). 기록이 하나도 없는 단계는 줄을 그리지 않는다.
   예정일이 지났는데 실제가 없으면 실제 줄에 빗금. 오른쪽 열은 예정일 경과 개월. 아래 선은 공정률 보고. 세로 굵은 선은 오늘(원장 기준일의 달).
   범례는 이 사업 타임라인에 그린 표지만(TimelineLegend). 기준선(당초) 줄은 원천이 없어 없다 — 서랍 머리에서 '당초 일정 없음' 한 번. 오른쪽 열 머리 = '예정 경과'.
   창 몸통이 @container — 640px 이하(창 폭 ≈ 680)면 이름·'현재/실제'·경과 열을 줄여 막대 칸을 확보(겹침 오프셋 right/left 도 같이). */
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { HATCH } from '@/components/ui/chips';
import { BOARD_CIR, BOARD_COLOR, BOARD_NAMES, pct1, yearAt, type Timeline } from '@/lib/board/projects-view';

const light = (c: string, p = 22) => `color-mix(in srgb,${c} ${p}%,var(--card))`;
const LATE = { delay: 'var(--bad)', caution: 'var(--warn)', ok: 'var(--mute)' } as const;
const lateText = (cls: string) => (cls === 'delay' ? 'text-bad font-bold' : 'text-warn font-bold');

export function TimelineLegend({ t }: { t: Timeline }) {
  const li = 'flex items-center gap-1 whitespace-nowrap';
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-sm text-muted-foreground" aria-label="범례">
      {t.used.plan ? <li className={li} title="원장 현재 예정(CURRENT) 하나"><i className="block h-[9px] w-4 rounded-chip border border-dashed border-mute [background:color-mix(in_srgb,var(--mute)_22%,var(--card))]" aria-hidden="true" />현재 예정</li> : null}
      {t.used.actual ? <li className={li} title="원천에서 확인한 날짜"><i className="block h-[5px] w-4 bg-mute" aria-hidden="true" />실제</li> : null}
      {t.used.late ? <li className={li} title="현재 예정일 경과 6개월 이상(1~6개월은 노란 테두리)"><i className="block h-[9px] w-4 rounded-chip border-2 border-bad" aria-hidden="true" />지연</li> : null}
      {t.used.missing ? <li className={li} title="예정일이 지났는데 실제 기록 없음"><i className={cn('block h-[9px] w-4 rounded-chip border border-line2', HATCH)} aria-hidden="true" />미확보</li> : null}
      <li className={li} title="원장 기준일의 달"><i className="block h-3 w-0.5 bg-foreground" aria-hidden="true" />오늘</li>
      {t.progress.length ? <li className={li} title="LH 공사진행 보고"><i className="block h-0.5 w-4 bg-[var(--st-build)]" aria-hidden="true" />공정률</li> : null}
    </ul>
  );
}

/* 마커 옆 날짜 꼬리표: 오른쪽 끝(70% 넘음 — 좁은 창에서도 잘리지 않게)이면 마커 왼쪽 */
function Tag({ at, left = at > 70, className, children }: { at: number; left?: boolean; className?: string; children: ReactNode }) {
  return <span aria-hidden="true" className={cn('pointer-events-none absolute top-1/2 z-[3] -translate-y-1/2 rounded-chip bg-chartbg px-1 text-sm leading-none whitespace-nowrap tabular-nums', left ? '-ml-2.5 -translate-x-full' : 'ml-2.5', className)} style={{ left: `${at}%` }}>{children}</span>;
}
const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <><span className="text-sm leading-none text-muted-foreground">{label}</span><span className="relative block h-[16px]">{children}</span></>
);

export default function StageTimeline({ t }: { t: Timeline }) {
  if (!t.lanes.length && !t.progress.length) return <p className="m-0 mt-2 text-sm text-muted-foreground">단계 일정 기록 없음</p>;
  const pr = t.progress, last = pr[pr.length - 1];
  return (
    <div className="relative mt-3 rounded-tile border border-border bg-chartbg px-card pt-7 pb-9 @max-[640px]:px-3">
      <div className="relative flex flex-col gap-2.5">
        <span className="pointer-events-none absolute inset-y-0 right-[88px] left-[160px] @max-[640px]:right-[68px] @max-[640px]:left-[128px]" aria-hidden="true">
          {t.years.map((y) => <span key={y} className="absolute inset-y-0 border-l border-border" style={{ left: `${yearAt(t, y)}%` }} />)}
          <span className="absolute -top-6 bottom-0 z-[1] border-l border-foreground" style={{ left: `${t.today}%` }} />
          <span className={cn('absolute -top-[26px] pl-1.5 text-sm font-bold whitespace-nowrap tabular-nums', t.today > 75 && '-translate-x-full pr-1.5 pl-0')} style={{ left: `${t.today}%` }}>오늘 {t.todayText}</span>
        </span>
        {t.lanes.length ? <span className="absolute -top-[26px] right-0 w-[76px] text-right @max-[640px]:w-[56px] text-sm whitespace-nowrap text-muted-foreground" title="현재 예정일이 지난 개월(지연 6개월 이상은 빨강, 주의 1~6개월은 노랑)">예정 경과</span> : null}
        {t.lanes.map((l) => {
          const c = BOARD_COLOR[l.board];
          return (
            <div key={l.board} className="grid grid-cols-[96px_40px_minmax(0,1fr)_76px] items-center gap-x-3 @max-[640px]:grid-cols-[72px_32px_minmax(0,1fr)_56px] gap-y-[3px]" role="group" aria-label={`${BOARD_CIR[l.board]} ${BOARD_NAMES[l.board]}`}>
              <span className="row-span-2 flex items-center gap-1.5 self-center text-sm whitespace-nowrap"><i className="block size-[9px] flex-none rounded-chip" style={{ background: c }} aria-hidden="true" />{BOARD_CIR[l.board]} {BOARD_NAMES[l.board]}</span>
              <Line label="현재">
                {l.planBar ? <span className="absolute top-[1px] bottom-[1px] rounded-chip border border-dashed" style={{ left: `${l.planBar.from}%`, width: `${Math.max(0.6, l.planBar.to - l.planBar.from)}%`, background: light(c), borderColor: c }} title={l.planBar.title} /> : null}
                {l.plan ? <>
                  <span className={cn('absolute top-[1px] bottom-[1px] z-[2] w-[13px] -translate-x-1/2 rounded-chip', l.plan.late ? 'border-2' : 'border border-dashed')}
                    style={{ left: `${l.plan.at}%`, background: light(c, 32), borderColor: l.plan.late ? LATE[l.plan.late] : c }} title={l.plan.title} />
                  <Tag at={l.plan.at} className={l.plan.late ? lateText(l.plan.late) : 'text-muted-foreground'}>{l.plan.tag}</Tag>
                </> : null}
              </Line>
              <span className="row-span-2 self-center text-right text-sm tabular-nums">
                {l.late ? <span className={lateText(l.late.cls)} title={`현재 예정일 경과 ${l.late.months}개월`}>+{l.late.months}개월</span> : <span className="text-muted-foreground">–</span>}
              </span>
              <Line label="실제">
                {l.actualBar ? <span className="q-grow-x absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full" style={{ left: `${l.actualBar.from}%`, width: `${Math.max(0.6, l.actualBar.to - l.actualBar.from)}%`, background: c }} title={l.actualBar.title} /> : null}
                {l.actual ? <>
                  <span className="absolute top-1/2 z-[2] size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style={{ left: `${l.actual.at}%`, background: c }} title={l.actual.title} />
                  <Tag at={l.actual.at} left={l.actualBar ? l.actual.at > 12 : undefined} className="text-foreground">{l.actual.tag}</Tag>
                </> : null}
                {l.missing ? <span className={cn('absolute inset-0 rounded-chip border border-border', HATCH)} title={l.missing} /> : null}
              </Line>
            </div>
          );
        })}
        {pr.length ? (
          <div className="grid grid-cols-[148px_minmax(0,1fr)_76px] items-center gap-x-3 @max-[640px]:grid-cols-[116px_minmax(0,1fr)_56px]">
            <span className="text-sm whitespace-nowrap text-muted-foreground" title="LH 공사진행 보고 · 보고일마다 점(같은 날 여러 보고는 큰 값)">공정률</span>
            <span className="relative mt-1 block h-[56px] border-t border-dashed border-border">
              <svg className="absolute inset-0 block size-full overflow-visible" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={`공정률 이력, 마지막 ${pct1(last.pct)}%`}>
                <polyline fill="none" stroke="var(--st-build)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={pr.map((p) => `${(p.at * 10).toFixed(1)},${(100 - p.pct).toFixed(1)}`).join(' ')} />
              </svg>
              {pr.map((p, i) => <span key={i} className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-card" style={{ left: `${p.at}%`, top: `${100 - p.pct}%`, background: 'var(--st-build)' }} title={p.text} />)}
              <span className={cn('absolute -translate-y-1/2 pl-2 text-sm font-bold whitespace-nowrap tabular-nums', last.at > 85 && '-translate-x-full pr-2 pl-0')} style={{ left: `${last.at}%`, top: `${100 - last.pct}%`, color: 'var(--st-build-ink)' }}>{pct1(last.pct)}%</span>
            </span>
            <span />
          </div>
        ) : null}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-[108px] bottom-3 left-[180px] @max-[640px]:right-[80px] @max-[640px]:left-[140px] h-4 text-sm leading-none text-mute">
        {t.years.map((y) => <span key={y} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${yearAt(t, y) + 50 / t.years.length}%` }}>{y}</span>)}
      </div>
    </div>
  );
}
