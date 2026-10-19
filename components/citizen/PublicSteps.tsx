/* 사업 찾기 상세의 6칸 사다리(일반사용자 이름 — 원 숫자 없이 계획·허가·착공·모집 공고·준공·입주, 제안서 4.2 D5).
   모양은 정책 서랍의 components/projects/StageSteps 와 같다('지금' 한 칸만 단계색 면 + '지금' 꼬리표, 지난 단계는 체크, 칸은 링크 아님).
   StageSteps 는 ①~⑥ 이름·정책 질문이 시험으로 잠겨 있어 고치지 않고, 같은 계산(projects-view stepState·단계색)을 쓰는 얇은 판을 따로 둔다. */
import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from 'cn';
import InfoTip from '@/components/ui/info-tip';
import { Card } from '@/components/ui/card';
import { BOARD_COLOR, BOARD_INK, stepState } from '@/lib/board/projects-view';
import { LADDER, LADDER_Q } from '@/lib/board/public-labels';

const STATE = { now: ' · 지금 단계', past: ' · 지난 단계', ahead: '' } as const;

export default function PublicSteps({ current }: { current: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="m-0 grid list-none grid-cols-6 gap-1.5 p-0 mobile:grid-cols-3" aria-label="여섯 단계">
        {LADDER.map((name, i) => {
          const st = stepState(i, current), on = st === 'now';
          return (
            <li key={name} className="min-w-0">
              <Card variant="inset" aria-current={on ? 'step' : undefined} data-step={st} title={`${name} — ${LADDER_Q[i]}${STATE[st]}`}
                className={cn('flex h-full min-h-16 flex-col items-center justify-center gap-0.5 text-center', on ? 'font-bold text-foreground' : 'text-muted-foreground')}
                style={on ? { background: `color-mix(in srgb,${BOARD_COLOR[i]} 26%,var(--card))` } : undefined}>
                <b className={cn('flex items-center gap-1 text-base leading-sub whitespace-nowrap', on ? 'font-bold' : 'font-normal')} style={on ? { color: BOARD_INK[i] } : undefined}>
                  {st === 'past' ? <><Check className="size-4 flex-none opacity-70" aria-hidden="true" /><span className="sr-only">지난 단계 </span></> : null}{name}
                </b>
                {on ? <span className="mt-0.5 rounded-full bg-primary px-2 py-0.5 text-sm leading-none font-bold text-primary-foreground">지금</span> : null}
              </Card>
            </li>
          );
        })}
      </ol>
      <p className="m-0 flex flex-wrap items-center gap-x-1 text-meta text-muted-foreground">
        <span><b className="font-bold" style={{ color: BOARD_INK[current] }}>{LADDER[current]}</b> — {LADDER_Q[current]}</span>
        <InfoTip label="여섯 단계">
          <dl>{LADDER.map((n, i) => <Fragment key={n}><dt>{n}</dt><dd>{LADDER_Q[i]}{STATE[stepState(i, current)]}</dd></Fragment>)}</dl>
          <p>준비 중 = 계획·허가, 짓는 중 = 착공, 모집 끝남 = 모집 공고까지 온 사업이에요</p>
        </InfoTip>
      </p>
    </div>
  );
}
