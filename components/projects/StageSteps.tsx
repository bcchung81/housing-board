/* 사업 상세 서랍의 단계 줄: 목록·타임라인·지역 공급과 같은 ①~⑥ 이름과 단계색(리본 칸). 공식 6단계 번호(01~06)는 ①~⑥ 과 어긋나 쓰지 않는다(title 에도 — 2026-10-16 3차 평가).
   여섯 칸의 정의는 title 만이 아니라 줄 아래 ⓘ(키보드로 열림)에도.
   '지금' 한 칸만 단계색으로 채우고(+ '지금' 꼬리표), 지난 단계는 옅은 체크, 앞 단계는 빈 칸(projects-view stepState). 실제 기록 여부는 title 에.
   칸은 링크가 아니다(2026-10-16 2차 평가: 칸을 누르면 서랍이 닫히고 목록으로 넘어갔다) — 칸마다 정의는 title, 지금 단계의 정의는 줄 아래 보이는 글로.
   창 몸통이 @container 라 680px 이하(창 폭 ≈ 720)면 6칸 → 3칸. 목록 이동은 따로 '같은 단계 사업 목록' 링크 하나(listHref — 화면이 지금 거르기를 유지한 목록 주소를 준다). */
import { Fragment } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from 'cn';
import InfoTip from '@/components/ui/info-tip';
import { Card } from '@/components/ui/card';
import { BOARD_CIR, BOARD_COLOR, BOARD_INK, BOARD_NAMES, HOME_NAMES, stepState } from '@/lib/board/projects-view';

/* 칸마다 답할 질문(발표자료 6단계 질문을 리본 칸에 맞춤): ③착공은 공사 진행, ⑤준공은 공사의 끝(사용검사) — ⑤에 ③의 질문을 베끼지 않는다 */
export const QUESTION = [
  '정부가 무엇을 얼마나, 어디에 누가 추진하는가',
  '실제로 사업할 수 있는 단계까지 왔는가',
  '착공했고 현재 얼마나 진행됐는가',
  '언제, 누구에게, 몇 호를 모집하는가',
  '공사를 마치고 사용검사를 받았는가',
  '언제 국민이 실제로 들어가는가',
] as const;
/* HOME 6칸(정책 화면 PoC 이름 — 사업 화면 원천 행 창)의 질문 */
export const HOME_QUESTION = [
  '정부가 무엇을 얼마나, 어디에 누가 추진하는가',
  '어느 위치에 누가 몇 호를 추진할 것인가',
  '실제로 사업할 수 있는 단계까지 왔는가',
  '착공했고 공사를 마쳤는가(준공 포함)',
  '언제, 누구에게, 몇 호를 분양·모집하는가',
  '언제 국민이 실제로 들어가는가',
] as const;

/* home = HOME 원천 행(사업 화면 목록의 행): 칸 이름은 정책 화면 PoC 이름, '실제 기록' = 그 단계까지 온 기록 */
export default function StageSteps({ current, reached, listHref, home = false }: { current: number; reached: number[]; listHref: string; home?: boolean }) {
  const NAMES = home ? HOME_NAMES : BOARD_NAMES, QS = home ? HOME_QUESTION : QUESTION;
  const label = (i: number) => (home ? NAMES[i] : `${BOARD_CIR[i]} ${NAMES[i]}`);   // HOME(사업 화면 원천 행)은 원 숫자 없음 — 목록 단계 열과 같은 글자
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="m-0 grid list-none grid-cols-6 gap-1.5 p-0 mobile:grid-cols-3 @max-[680px]:grid-cols-3" aria-label="공급 6단계">
        {NAMES.map((name, i) => {
          const st = stepState(i, current), on = st === 'now';
          const c = BOARD_COLOR[i];
          const rec = i === 0 || reached.includes(i) ? '실제 기록 있음' : '실제 기록 없음';
          return (
            <li key={name} className="min-w-0">
              <Card variant="inset" aria-current={on ? 'step' : undefined} data-step={st}
                title={`${label(i)} — ${QS[i]}${on ? ' · 이 사업의 지금 단계' : st === 'past' ? ` · 지난 단계(${rec})` : ' · 아직 오지 않은 단계'}`}
                className={cn('flex h-full min-h-[64px] flex-col items-center justify-center gap-0.5 text-center',
                  on ? 'font-bold text-foreground' : 'text-muted-foreground')}
                style={on ? { background: `color-mix(in srgb,${c} 26%,var(--card))` } : undefined}>
                <b className={cn('flex items-center gap-1 text-base leading-sub whitespace-nowrap', on ? 'font-bold' : 'font-normal')} style={on ? { color: BOARD_INK[i] } : undefined}>
                  {st === 'past' ? <><Check className="size-4 flex-none opacity-70" aria-hidden="true" /><span className="sr-only">지난 단계 </span></> : null}{label(i)}
                </b>
                {on ? <span className="mt-0.5 rounded-full bg-primary px-2 py-0.5 text-sm leading-none font-bold text-primary-foreground">지금</span> : null}
              </Card>
            </li>
          );
        })}
      </ol>
      <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
        <span data-slot="stage-def" className="inline-flex flex-wrap items-center gap-x-1"><span><b className="font-bold" style={{ color: BOARD_INK[current] }}>{label(current)}</b> — {QS[current]}</span>
          <InfoTip label="여섯 단계">
            <dl>{QS.map((q, i) => <Fragment key={i}><dt>{label(i)}</dt><dd>{q}{i === current ? ' · 지금' : stepState(i, current) === 'past' ? ` · 지난 단계(${i === 0 || reached.includes(i) ? '실제 기록 있음' : '실제 기록 없음'})` : ''}</dd></Fragment>)}</dl>
            <p>&apos;지금&apos; = 이 사업의 지금 단계 · 체크 = 지난 단계</p>
          </InfoTip>
        </span>
        <Link href={listHref} scroll={false} className="ml-auto whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          title={`지금 목록의 범위(지역·정책·기관 거르기)를 그대로 두고 ${label(current)} 단계인 사업만 — 서랍은 닫힘`}>같은 단계 사업 목록 ›</Link>
      </p>
    </div>
  );
}
