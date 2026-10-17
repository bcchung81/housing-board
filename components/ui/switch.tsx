import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from 'cn';

/* 켜고 끄는 스위치(머리 줄의 테마·보기 대상, 지시서 header-unify-spec 1절). 트랙 48×28 알약, 손잡이 22px 흰 원(안쪽 여백 3px), 손잡이 안 아이콘 14px.
   꺼짐 = 옅은 트랙(--muted + 테두리 --line2), 손잡이 왼쪽. 켜짐 = 진한 트랙(라이트 --foreground, 다크 --primary), 손잡이 오른쪽(20px).
   서버 그림은 저장된 상태를 모르므로, 손잡이 자리·트랙 색·아이콘은 첫 그림 전 스크립트가 정한 <html> 표시를 보는 CSS 로 그린다(깜빡임 없음):
   on='dark' 이면 html.dark, on='admin' 이면 html[data-aud=admin]. aria-checked 는 수화 뒤 checked 로 맞춘다. 누름 영역은 위아래로 늘려 44px. */
const ON = {
  dark: {
    track: 'dark:border-primary dark:bg-primary',
    knob: 'dark:translate-x-5',
    off: 'dark:hidden',
    on: 'hidden dark:flex',
  },
  admin: {
    track: '[html[data-aud=admin]_&]:border-foreground [html[data-aud=admin]_&]:bg-foreground dark:[html[data-aud=admin]_&]:border-primary dark:[html[data-aud=admin]_&]:bg-primary',
    knob: '[html[data-aud=admin]_&]:translate-x-5',
    off: '[html[data-aud=admin]_&]:hidden',
    on: 'hidden [html[data-aud=admin]_&]:flex',
  },
} as const;

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role' | 'onClick'> & {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  on: keyof typeof ON;
  offIcon: ReactNode;
  onIcon: ReactNode;
};

export function Switch({ checked, onCheckedChange, on, offIcon, onIcon, className, ...props }: SwitchProps) {
  const s = ON[on];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      className={cn("relative block h-7 w-12 shrink-0 cursor-pointer rounded-full border border-line2 bg-muted p-0 transition-colors duration-150 ease-[ease] motion-reduce:transition-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground", s.track, className)}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span aria-hidden="true" className={cn('pointer-events-none absolute top-0.5 left-0.5 flex size-[22px] items-center justify-center rounded-full bg-white text-foreground shadow-[0_1px_2px_rgb(0_0_0/25%)] transition-transform duration-150 ease-[ease] motion-reduce:transition-none dark:text-[#10243D] [&_svg]:size-3.5', s.knob)}>
        <span className={cn('flex', s.off)}>{offIcon}</span>
        <span className={s.on}>{onIcon}</span>
      </span>
    </button>
  );
}
