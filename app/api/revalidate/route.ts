import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';

/* 적재 도구(tools/ledger/supabase-load.js)가 발행 직후 화면 캐시를 비운다. POST + x-revalidate-secret 만 받는다. */
export const dynamic = 'force-dynamic';

const ALLOWED_TAGS = ['ledger-board'];

const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return Response.json({ error: 'REVALIDATE_SECRET 없음' }, { status: 503 });
  if (!same(req.headers.get('x-revalidate-secret') ?? '', secret)) return Response.json({ error: '인증 실패' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { tag?: unknown } | null;
  const tag = body?.tag;
  if (typeof tag !== 'string' || !ALLOWED_TAGS.includes(tag)) return Response.json({ error: '허용되지 않은 tag' }, { status: 400 });
  revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: true, tag, at: new Date().toISOString() });
}
