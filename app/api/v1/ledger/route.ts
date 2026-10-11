import { unstable_cache } from 'next/cache';
import ledger from '../../../../handlers/v1/ledger.js';
import { allMethods, toRoute } from '../../../../lib/next-handler';

/* 지도 사업 표시값(api.map): 성공한 Supabase 읽기만 3600초 캐시하고, 태그는 종합상황판과 같은 ledger-board(적재 뒤 /api/revalidate 가 함께 비운다) */
const handler = ledger.createHandler({
  wrap: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => unstable_cache(fn, ['ledger-map'], { revalidate: 3600, tags: ['ledger-board'] }),
});

export const dynamic = 'force-dynamic';
export const maxDuration = 15;
export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = allMethods(toRoute(handler));
