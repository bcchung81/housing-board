import type { NextRequest } from 'next/server';
import { projectWindow } from '@/lib/board/project-window';

/* 사업 창 내용(2026-10-19): GET /api/v1/project/{id}?view=admin|public[&cand=1] → lib/board/project-window.ts projectWindow 결과(허용 목록 — pks·bundles·bjd 없음, dataAsOf = 원장 기준일).
   다른 화면(/month·/agency·/region·/citizen/schedule·지도)에서 사업 링크를 누르면 창 관리자(components/windows)가 이 경로로 받아 그 자리에서 창을 연다.
   일반사용자 view 는 수도권 발급 사업만, cand=1 = 번호 없는 후보 간단 보기(정책담당자만). 없는 사업 404.
   자료는 배포마다 바뀌는 빌드 JSON(+ 화면 자료의 Supabase 읽기 캐시)이라 CDN 에 길게 둔다 — 브라우저는 매번 확인(배포 뒤 바로 새 자료) */
const OK_CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  const view = q.get('view') === 'public' ? 'public' : 'admin';
  const win = await projectWindow(id, view, { cand: q.get('cand') === '1' });
  if (!win) return Response.json({ error: 'not-found' }, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  return Response.json(win, { headers: { 'Cache-Control': OK_CACHE } });
}
