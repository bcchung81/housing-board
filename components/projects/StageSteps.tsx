/* 사업 상세 서랍의 단계 줄: 목록·타임라인·지역 공급과 같은 ①~⑥ 이름과 단계색(리본 칸). 공식 6단계 번호(01~06)는 보이는 글에 쓰지 않고 칸 title 에만.
   지금 단계는 단계색 면 + '지금', 실제 기록으로 거친 단계는 옅은 면, 나머지는 테두리만. 칸을 누르면 지금 거르기를 유지한 채 그 단계인 사업 목록(href 를 화면이 준다). */
import Link from 'next/link';
import { cn } from 'cn';
import { BOARD_CIR, BOARD_COLOR, BOARD_INK, BOARD_NAMES, BOARD_OFFICIAL } from '../../lib/board/projects-view';

/* 칸마다 답할 질문(발표자료 6단계 질문을 리본 칸에 맞춤): ③착공은 공사 진행, ⑤준공은 공사의 끝(사용검사) — ⑤에 ③의 질문을 베끼지 않는다 */
export const QUESTION = [
  '정부가 무엇을 얼마나, 어디에 누가 추진하는가',
  '실제로 사업할 수 있는 단계까지 왔는가',
  '착공했고 현재 얼마나 진행됐는가',
  '언제, 누구에게, 몇 호를 모집하는가',
  '공사를 마치고 사용검사를 받았는가',
  '언제 국민이 실제로 들어가는가',
] as const;

export default function StageSteps({ current, reached, href }: { current: number; reached: number[]; href: (i: number) => string }) {
  return (
    <ol className="m-0 grid list-none grid-cols-6 gap-1.5 p-0 mobile:grid-cols-3" aria-label="공급 6단계">
      {BOARD_NAMES.map((name, i) => {
        const on = i === current, done = !on && (i === 0 || reached.includes(i)) && i < current;
        const c = BOARD_COLOR[i];
        return (
          <li key={name} className="min-w-0">
            <Link href={href(i)} aria-current={on ? 'step' : undefined} title={`${BOARD_CIR[i]} ${name} — ${QUESTION[i]} · 공식 단계 ${BOARD_OFFICIAL[i]}${on ? ' · 이 사업의 지금 단계' : done ? ' · 지난 단계' : ''} · 누르면 지금 거르기 안에서 이 단계인 사업`}
              className={cn('card-lift flex h-full min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-[8px] border-2 px-1 py-1.5 text-center no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                on ? 'text-foreground' : 'text-muted-foreground')}
              style={{ borderColor: on || done ? c : 'var(--border)', background: on ? `color-mix(in srgb,${c} 26%,var(--card))` : done ? `color-mix(in srgb,${c} 10%,var(--card))` : 'var(--card)' }}>
              <b className="text-[16px] leading-[1.3] font-bold whitespace-nowrap" style={on || done ? { color: BOARD_INK[i] } : undefined}>{BOARD_CIR[i]} {name}</b>
              {on ? <span className="mt-0.5 rounded-full bg-primary px-2 text-[13px] leading-[18px] font-bold text-primary-foreground">지금</span> : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
