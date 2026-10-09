/* 종합상황판 시안의 팔레트(단계 색)에서 가져온 차트 색. 값은 테마별 CSS 변수(app/tailwind.css 의 --s-*)다. 색만으로 구분하지 않도록 차트마다 범례·값 글자를 함께 둔다. */
import type { Actor, Metric } from '../../lib/board/types';

export const METRIC_COLOR: Record<Metric, string> = { permit: 'var(--s-teal)', start: 'var(--s-orange)', complete: 'var(--s-lime)', sale: 'var(--s-gray)' };
export const ACTOR_COLOR: Record<Actor, string> = { 지자체: 'var(--s-blue)', LH: 'var(--s-teal)', 주택업체: 'var(--s-amber)', 민간: 'var(--s-violet)' };
