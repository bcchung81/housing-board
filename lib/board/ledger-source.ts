import { unstable_cache } from 'next/cache';
import { ledger as ledgerJson } from './data';
import type { LedgerBoard } from './types';

/* 종합상황판의 사업 원장 집계 — Supabase 보기 api.board(읽기 전용)를 공개용 키로 서버에서 읽는다(성공한 결과만 3600초 캐시, 태그 ledger-board).
   환경변수가 없거나 요청·모양 검사가 실패하면 data/board/ledger-board.json 으로 대체한다(전환 기간). */
export type LedgerSource = { board: LedgerBoard; origin: 'supabase' | 'json'; month: string; fetchedAt?: string };

const valid = (b: unknown): b is LedgerBoard => {
  const x = b as LedgerBoard | null;
  return !!x && x.schema === 'ledger-board/1' && Array.isArray(x.months) && Array.isArray(x.regions) && Array.isArray(x.agencies) && Array.isArray(x.upcoming) && Array.isArray(x.stageUnits);
};

/* 성공한 결과만 캐시에 남도록, 실패·빈 결과·모양 불량은 모두 던진다(던진 결과는 unstable_cache 가 저장하지 않는다).
   fetch 자체는 no-store — 빈 응답이 데이터 캐시에 3600초 박히는 일을 막는다. 갱신은 /api/revalidate 로 태그를 비운다. */
const fetchSupabase = async (url: string, key: string): Promise<{ board: LedgerBoard; month: string; fetchedAt: string }> => {
  const res = await fetch(`${url}/rest/v1/board?select=month,reference_date,board,status&order=month.desc&limit=1`, {
    headers: { apikey: key, 'Accept-Profile': 'api' },
    signal: AbortSignal.timeout(4000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as { month: string; board: unknown }[];
  if (!Array.isArray(rows) || !rows.length) throw new Error('결과 없음');
  if (!valid(rows[0].board)) throw new Error('모양 검사 실패');
  return { board: rows[0].board, month: rows[0].month, fetchedAt: new Date().toISOString() };
};

const cachedSupabase = unstable_cache(fetchSupabase, ['ledger-board'], { revalidate: 3600, tags: ['ledger-board'] });

export async function loadLedgerBoard(): Promise<LedgerSource> {
  const fallback = (why: string): LedgerSource => {
    console.warn(`[ledger-board] Supabase 대신 JSON 사용: ${why}`);
    return { board: ledgerJson, origin: 'json', month: ledgerJson.observedMonth };
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return fallback('환경변수 없음');
  try {
    return { origin: 'supabase', ...(await cachedSupabase(url, key)) };
  } catch (e) {
    return fallback(e instanceof Error ? e.message || e.name : '오류');
  }
}
