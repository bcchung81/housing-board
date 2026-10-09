/* 종합상황판 시안의 팔레트(단계 색)에서 가져온 차트 색. 색만으로 구분하지 않도록 차트마다 범례·값 글자를 함께 둔다. */
import type { Actor, Metric } from '../../lib/board/types';

export const METRIC_COLOR: Record<Metric, string> = { permit: '#45D3C4', start: '#FF9F43', complete: '#A5E56D', sale: '#C7D0DA' };
export const ACTOR_COLOR: Record<Actor, string> = { 지자체: '#7BA7FF', LH: '#45D3C4', 주택업체: '#FFC24D', 민간: '#D9A6FF' };
