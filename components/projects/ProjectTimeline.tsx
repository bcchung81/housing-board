/* 사업 상세의 주인공 차트 '단계 일정'(서버가 그린다 — 위치는 lib/board/projects-view.ts timelineOf 의 %). 시안: docs/design/home-concept/project.html.
   줄 = 리본 칸 ①계획~⑥입주. 예정은 점선·옅은 면, 실제는 실색(점·막대), 추정은 점선 테두리만, 예정일 경과는 빨간(지연)·노란(주의) 테두리, 원천이 없는 줄은 빗금.
   ③착공 줄은 공사 기간(예정 점선 막대 위에 실제 실선 막대). 아래 선은 공정률 보고(점마다 title). 세로 굵은 선은 오늘(원장 기준일의 달).
   줄마다 꼬리표(실제 달 · 예정 달 · 추정 '이전')를 마커 옆에 쓴다 — 오른쪽 끝(80% 넘음)이나 공사 막대가 있는 줄은 마커 왼쪽. 날짜를 따로 늘어놓은 일정 표는 두지 않는다. */
import { cn } from 'cn';
import { HATCH } from '../ui/chips';
import { BOARD_CIR, BOARD_COLOR, BOARD_NAMES, yearAt, type Timeline } from '../../lib/board/projects-view';

const light = (c: string, p = 22) => `color-mix(in srgb,${c} ${p}%,var(--card))`;
const LATE = { delay: 'var(--bad)', caution: 'var(--warn)', ok: 'var(--mute)' } as const;

export function TimelineLegend({ progress }: { progress: boolean }) {
  const li = 'flex items-center gap-1 whitespace-nowrap';
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
      <li className={li} title="현재 예정(원장 현재 예정 하나)"><i className="block h-[9px] w-4 rounded-[2px] border-[1.5px] border-dashed border-mute [background:color-mix(in_srgb,var(--mute)_22%,var(--card))]" aria-hidden="true" />예정</li>
      <li className={li} title="원천에서 확인한 날짜"><i className="block h-[5px] w-4 bg-mute" aria-hidden="true" />실제</li>
      <li className={li} title="현재 예정일 경과 6개월 이상(1~6개월은 노란 테두리)"><i className="block h-[9px] w-4 rounded-[2px] border-[1.5px] border-bad" aria-hidden="true" />지연</li>
      <li className={li} title="일정 원천 없음"><i className={cn('block h-[9px] w-4 rounded-[2px] border border-line2', HATCH)} aria-hidden="true" />미확보</li>
      <li className={li} title="원장 기준일의 달"><i className="block h-3 w-0.5 bg-foreground" aria-hidden="true" />오늘</li>
      {progress ? <li className={li} title="LH 공정률 보고"><i className="block h-0.5 w-4 bg-[var(--st-build)]" aria-hidden="true" />공정률</li> : null}
    </ul>
  );
}

export default function ProjectTimeline({ t }: { t: Timeline }) {
  const pr = t.progress, last = pr[pr.length - 1];
  return (
    <div className="relative mt-3 rounded-[10px] border border-border bg-chartbg px-5 pt-7 pb-9 mobile:px-3">
      <div className="relative grid grid-cols-[86px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <span className="pointer-events-none absolute inset-y-0 right-0 left-[98px]" aria-hidden="true">
          {t.years.map((y) => <span key={y} className="absolute inset-y-0 border-l border-border" style={{ left: `${yearAt(t, y)}%` }} />)}
          <span className="absolute -top-6 bottom-0 z-[1] border-l-2 border-foreground" style={{ left: `${t.today}%` }} />
          <span className="absolute -top-[26px] pl-1.5 text-[12px] font-bold whitespace-nowrap tabular-nums" style={{ left: `${t.today}%` }}>오늘 {t.todayText}</span>
        </span>
        {t.rows.map((r) => {
          const c = BOARD_COLOR[r.board];
          return [
            <span key={`n${r.board}`} className="flex h-[26px] items-center gap-1.5 text-[14px] whitespace-nowrap"><i className="block size-[9px] flex-none rounded-[2px]" style={{ background: c }} aria-hidden="true" />{BOARD_CIR[r.board]} {BOARD_NAMES[r.board]}</span>,
            <span key={`t${r.board}`} className="relative block h-[26px]">
              {r.empty ? <span className={cn('absolute inset-x-0 top-[3px] h-[20px] border border-line2', HATCH)} title={`${BOARD_NAMES[r.board]} — 일정 원천 없음`} /> : null}
              {r.bars.map((b) => b.kind === 'plan'
                ? <span key="bp" className="absolute top-[3px] h-[20px] rounded-[3px] border-[1.5px] border-dashed" style={{ left: `${b.from}%`, width: `${Math.max(0.6, b.to - b.from)}%`, background: light(c), borderColor: c }} title={b.text} />
                : <span key="ba" className="q-grow-x absolute top-[9px] h-[8px]" style={{ left: `${b.from}%`, width: `${Math.max(0.6, b.to - b.from)}%`, background: c }} title={b.text} />)}
              {r.marks.map((m, i) => m.kind === 'actual'
                ? <span key={i} className="absolute top-1/2 z-[2] size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style={{ left: `${m.at}%`, background: c }} title={m.text} />
                : <span key={i} className={cn('absolute top-[3px] z-[2] h-[20px] w-[14px] -translate-x-1/2 rounded-[3px] border-dashed', m.late ? 'border-2 border-solid' : 'border-[1.5px]')}
                  style={{ left: `${m.at}%`, background: m.kind === 'plan' ? light(c, 32) : 'transparent', borderColor: m.late ? LATE[m.late.cls] : c }}
                  title={m.late ? `${m.text} · 경과 ${m.late.months}개월 — ${m.late.cls === 'delay' ? '지연' : '주의'}` : m.text} />)}
              {r.tag ? (
                <span aria-hidden="true" className={cn('pointer-events-none absolute top-1/2 z-[3] -translate-y-1/2 rounded-[3px] bg-chartbg px-1 text-[12px] leading-[16px] whitespace-nowrap tabular-nums',
                  r.tag.at > 80 || (r.bars.length && r.tag.at > 12) ? '-ml-2.5 -translate-x-full' : 'ml-2.5', r.tag.late === 'delay' ? 'text-bad' : r.tag.late === 'caution' ? 'text-warn' : 'text-muted-foreground')}
                  style={{ left: `${r.tag.at}%` }}>{r.tag.text}</span>
              ) : null}
            </span>,
          ];
        })}
        {pr.length ? <>
          <span className="flex h-[56px] items-center text-[14px] whitespace-nowrap text-muted-foreground" title="LH 공사진행 보고 · 보고일마다 점(같은 날 여러 보고는 큰 값)">공정률</span>
          <span className="relative mt-1 block h-[56px] border-t border-dashed border-border">
            <svg className="absolute inset-0 block size-full overflow-visible" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={`공정률 이력, 마지막 ${last.pct}%`}>
              <polyline fill="none" stroke="var(--st-build)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" points={pr.map((p) => `${(p.at * 10).toFixed(1)},${(100 - p.pct).toFixed(1)}`).join(' ')} />
            </svg>
            {pr.map((p, i) => <span key={i} className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-card" style={{ left: `${p.at}%`, top: `${100 - p.pct}%`, background: 'var(--st-build)' }} title={p.text} />)}
            <span className="absolute -translate-y-1/2 pl-2 text-[12px] font-bold whitespace-nowrap tabular-nums" style={{ left: `${last.at}%`, top: `${100 - last.pct}%`, color: 'var(--st-build-ink)' }}>{last.pct}%</span>
          </span>
        </> : null}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-5 bottom-3 left-[118px] h-4 text-[13px] leading-none text-mute mobile:right-3 mobile:left-[110px]">
        {t.years.map((y) => <span key={y} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${yearAt(t, y) + 50 / t.years.length}%` }}><span className="mobile:hidden">{y}</span><span className="hidden mobile:inline">&apos;{String(y).slice(2)}</span></span>)}
      </div>
    </div>
  );
}
