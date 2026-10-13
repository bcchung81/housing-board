import { unstable_cache } from 'next/cache';
import lhJson from '../../data/board/lh-completion.json';
import molitJson from '../../data/board/molit.json';
import sourcesJson from '../../data/board/sources.json';
import registryJson from '../../registry/projects.json';
import type { LhData, Molit, RegistryProject, Sources } from './types';

/* 화면 자료(월별 실적·LH 준공예정·데이터 원본·사업 레지스트리) — Supabase 보기 api.screens(읽기 전용)를 공개용 키로 서버에서 읽는다(성공한 결과만 3600초 캐시, 태그 ledger-board).
   환경변수가 없거나 요청·모양 검사가 실패하면 번들 JSON 4개를 모두 쓴다(전환 기간). 일부만 섞어 쓰지 않는다. */
export type ScreenSource = { molit: Molit; lh: LhData; sources: Sources; projects: RegistryProject[]; origin: 'supabase' | 'json'; month: string; runId: number | null };
type Screens = Pick<ScreenSource, 'molit' | 'lh' | 'sources' | 'projects'>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const CHECKS: Record<string, (p: unknown) => boolean> = {
  molit: (p) => isObj(p) && Array.isArray(p.months) && Array.isArray(p.sido),
  lh: (p) => isObj(p) && Array.isArray(p.blocks),
  sources: (p) => isObj(p) && Array.isArray(p.items),
  registry: (p) => isObj(p) && Array.isArray(p.projects),
};

/* 성공한 결과만 캐시에 남도록, 실패·키 누락·모양 불량은 모두 던진다(던진 결과는 unstable_cache 가 저장하지 않는다).
   fetch 자체는 no-store — 빈 응답이 데이터 캐시에 3600초 박히는 일을 막는다. 갱신은 /api/revalidate 로 태그를 비운다. */
const fetchSupabase = async (url: string, key: string): Promise<Screens & { month: string; runId: number | null }> => {
  const res = await fetch(`${url}/rest/v1/screens?select=key,month,reference_date,run_id,payload`, {
    headers: { apikey: key, 'Accept-Profile': 'api' },
    signal: AbortSignal.timeout(4000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = (await res.json()) as { key: string; month: string; run_id: number | null; payload: unknown }[];
  if (!Array.isArray(rows) || !rows.length) throw new Error('결과 없음');
  const by = new Map(rows.map((r) => [r.key, r]));
  for (const k of Object.keys(CHECKS)) {
    const r = by.get(k);
    if (!r) throw new Error(`키 없음: ${k}`);
    if (!CHECKS[k](r.payload)) throw new Error(`모양 검사 실패: ${k}`);
  }
  const p = (k: string) => by.get(k)!.payload;
  return {
    molit: p('molit') as Molit, lh: p('lh') as LhData, sources: p('sources') as Sources,
    projects: (p('registry') as { projects: RegistryProject[] }).projects,
    month: by.get('molit')!.month, runId: by.get('molit')!.run_id ?? null,
  };
};

const cachedSupabase = unstable_cache(fetchSupabase, ['screens'], { revalidate: 3600, tags: ['ledger-board'] });

export async function loadScreens(): Promise<ScreenSource> {
  const fallback = (why: string): ScreenSource => {
    console.warn(`[screens] Supabase 대신 JSON 사용: ${why}`);
    const molit = molitJson as unknown as Molit;
    return {
      molit, lh: lhJson as unknown as LhData, sources: sourcesJson as unknown as Sources,
      projects: (registryJson as unknown as { projects: RegistryProject[] }).projects,
      origin: 'json', month: molit.months[molit.months.length - 1], runId: null,
    };
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
