'use client';
/* 눌러서 여는 도움말(ⓘ): title 툴팁에만 있던 핵심 정의를 보이는 단추 하나로. Base UI Popover — 누르기·터치로 열고, 키보드 포커스(Enter·Space)·Esc 닫기·바깥 누르기 닫기.
   label 은 단추의 읽기 이름('읽는 법' 등)이고, text 를 주면 단추 옆에 보이는 글자로도 쓴다. 인쇄에는 단추를 싣지 않는다(인쇄용 정의는 화면마다 따로). data-ctl = 조작 표지(사업 화면 인쇄 미리보기 ?print=1 이 숨긴다). */
import type { ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Info } from 'lucide-react';
import { cn } from 'cn';

export default function InfoTip({ label, text, children, className }: { label: string; text?: string; children: ReactNode; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger aria-label={`${label} 설명`} data-ctl
        className={cn('btn-reset inline-flex h-7 flex-none cursor-pointer items-center gap-1 rounded-chip px-1 text-sm text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[popup-open]:text-primary print:hidden', className)}>
        <Info className="size-4 flex-none" aria-hidden="true" />{text ? <span>{text}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" collisionPadding={12} className="z-50">
          <Popover.Popup className="max-w-[min(420px,calc(100vw-24px))] rounded-tile border border-border bg-popover px-tile-x py-tile-y text-sm leading-body text-popover-foreground shadow-pop outline-none transition-[opacity,translate] duration-150 ease-out data-[ending-style]:translate-y-[-2px] data-[ending-style]:opacity-0 data-[starting-style]:translate-y-[-2px] data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Popover.Title className="m-0 mb-1.5 text-sm font-bold">{label}</Popover.Title>
            <div className="[&_dd]:m-0 [&_dd]:mb-1.5 [&_dd]:text-muted-foreground [&_dl]:m-0 [&_dt]:font-bold [&_p]:m-0 [&_p+p]:mt-1.5">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
