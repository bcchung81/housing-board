/* 짧은 라벨 한 줄 + 말줄임(globals 의 .ui-truncate). 잘려도 전체 이름은 title 로 보인다 — 글자(children)가 문자열이면 title 을 따로 주지 않아도 된다.
   두 줄로 넘어가면 안 되는 이름표(칩·표 머리·카드 머리 줄의 짧은 이름)에 쓴다. 서버·클라이언트 어디서나 쓴다(상태 없음). */
import type { ComponentProps } from 'react';
import { cn } from 'cn';

export default function OneLine({ className, title, children, ...props }: ComponentProps<'span'>) {
  return <span className={cn('ui-truncate block', className)} title={title ?? (typeof children === 'string' ? children : undefined)} {...props}>{children}</span>;
}
