/* 사업 창(모달리스 창) 관리자의 순수 판정 — 링크 가로채기 · 주소 · 기록(push/replace/back) · 창 수 · 창 자리(2026-10-19, 옛 서랍 Drawer.tsx 의 base/depth 를 일반화).
   다른 모듈을 가져오지 않는다(Node 시험이 그대로 부른다: tests/js/windows.test.cjs). 화면 쪽은 components/windows/WindowHost.tsx. */

export type View = 'admin' | 'public';
/* 창 대상: 발급 사업 ?id= · 번호 없는 후보 ?cand=(정책 화면만) */
export type Target = { kind: 'id' | 'cand'; id: string };

/* 창 수: 정책담당자 3(넘치면 가장 오래된 창부터 닫음) · 일반사용자 1(다른 사업을 열면 내용 교체). 900px 이하도 1 */
export const ADMIN_MAX = 3;
export const PUBLIC_MAX = 1;
/* 창 규격(폭 >900px): 기본 폭 800 · 최소 400 · 최대 화면의 60% · 새 창은 앞 창에서 24 어긋나게(오른쪽 아래) · 끌기 전 첫 자리는 브라우저 보이는 영역의 정중앙(CSS) · 높이 최대 화면 − 96 */
export const WIN_W = 800;
export const WIN_W_MIN = 400;
export const WIN_W_MAX = 0.6;
export const WIN_STEP = 24;
export const WIN_H_GAP = 96;
export const WIN_H_MIN = 160;
export const WIN_HEAD = 52;   // 머리 줄 높이(끌어 옮길 때 화면 아래로 이만큼은 남긴다 — 위는 0, 창이 상단 메뉴 위 층이라 겹쳐도 머리 줄은 보인다)

export const keyOf = (t: Target) => `${t.kind}:${t.id}`;
export const sameTarget = (a: Target | null, b: Target | null) => a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/* 링크 주소의 창 대상: /projects?id=·?cand=(id 가 먼저), /citizen/projects?id= — 그 밖은 null(가로채지 않는다) */
export function linkTarget(pathname: string, search: string): Target | null {
  const q = new URLSearchParams(search);
  const id = q.get('id'), cand = q.get('cand');
  if (pathname === '/projects') return id ? { kind: 'id', id } : cand ? { kind: 'cand', id: cand } : null;
  if (pathname === '/citizen/projects') return id ? { kind: 'id', id } : null;
  return null;
}
/* 지금 주소의 창 대상(어느 화면이든 ?id= · ?cand= — 창을 연 화면의 주소에 붙인다) */
export function urlTarget(search: string): Target | null {
  const q = new URLSearchParams(search);
  const id = q.get('id'), cand = q.get('cand');
  return id ? { kind: 'id', id } : cand ? { kind: 'cand', id: cand } : null;
}
export const isPrint = (search: string) => new URLSearchParams(search).get('print') === '1';

/* 링크 가로채기 판정: 같은 출처의 사업 링크를 보조 키(⌘·Ctrl·Shift·Alt)·가운데 단추 없이 눌렀을 때만. target·download·data-window="off"·인쇄 보기(?print=1)는 통과 */
export type Click = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented?: boolean };
export type Anchor = { href: string; target: string | null; download: boolean; off: boolean };
export function interceptOf(a: Anchor, ev: Click, page: { href: string; search: string }): Target | null {
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return null;
  if (a.target || a.download || a.off || isPrint(page.search)) return null;
  let u: URL, here: URL;
  try { here = new URL(page.href); u = new URL(a.href, here); } catch { return null; }
  if (u.origin !== here.origin) return null;
  return linkTarget(u.pathname, u.search);
}

/* 관점: /citizen 으로 시작하면 일반사용자, 아니면 정책담당자. 지도 레이아웃(html[data-map-shell])은 보기 대상 스위치(html[data-aud])를 따른다 */
export function viewOf(pathname: string, mapShell: boolean, aud: string | null): View {
  if (mapShell) return aud === 'public' ? 'public' : 'admin';
  return pathname.startsWith('/citizen') ? 'public' : 'admin';
}

/* 주소: 지금 경로·쿼리를 두고 창 대상(id·cand)만 바꾼다 — 둘이 함께 남지 않게 */
export function hrefWith(pathname: string, search: string, t: Target | null, hash = ''): string {
  const q = new URLSearchParams(search);
  q.delete('id'); q.delete('cand');
  if (t) q.set(t.kind, t.id);
  const s = q.toString();
  return `${pathname}${s ? `?${s}` : ''}${hash}`;
}

/* 기록 한 걸음. cur = 지금 주소의 대상, next = 바뀐 뒤 맨 위 사업 창의 대상(목록 창은 주소가 없다), count = 바뀐 뒤 창 수(목록 창 포함),
   base = 이 세션에서 창을 열며 기록을 하나 쌓았는지, user = 사용자 조작(열기·닫기·맨 위 바꾸기). 사용자 조작이 아니면(주소로 연 첫 창·뒤로가기·옛 id → 대표 id) 주소만 맞춘다.
   - 창 0 → 1: push(기준 기록) · 그 뒤 열기·맨 위 바꾸기: replace
   - 마지막 창 닫기: 기준 기록을 쌓았으면 back(그만큼 뒤로 — 기록이 쌓이지 않게), 주소로 바로 열었으면 replace 로 id·cand 를 뺀다
   - 사업 창은 다 닫혔는데 목록 창이 남으면 replace(뒤로 가면 남은 창까지 닫히므로) */
export type Step = { op: 'push' | 'replace' | 'back' | 'none'; target: Target | null; base: boolean };
export function navStep(cur: Target | null, next: Target | null, count: number, base: boolean, user: boolean): Step {
  if (sameTarget(cur, next)) return { op: 'none', target: next, base: next || count ? base : false };
  if (!user) return { op: 'replace', target: next, base };
  if (!cur) return { op: 'push', target: next, base: true };
  if (!next) return count === 0 && base ? { op: 'back', target: null, base: false } : { op: 'replace', target: null, base: false };
  return { op: 'replace', target: next, base };
}

/* 뒤로가기·앞으로가기(popstate): 주소에 대상이 없으면 창을 모두 닫고, 있으면 그 사업을 맨 위로(열려 있지 않으면 연다) */
export type PopAction = { act: 'closeAll' } | { act: 'raise'; key: string } | { act: 'open'; target: Target };
export function popAction(t: Target | null, list: { key: string; asked: string }[]): PopAction {
  if (!t) return { act: 'closeAll' };
  const k = keyOf(t), w = list.find((x) => x.key === k || x.asked === k);
  return w ? { act: 'raise', key: w.key } : { act: 'open', target: t };
}

/* 창 목록(아래 → 위, 끝 = 맨 위 = 활성)에 창을 맨 위로 놓는다: 이미 있으면(같은 key) 옮기기만, max 를 넘으면 가장 오래된(맨 아래) 창부터 닫는다 */
export function place<T extends { key: string }>(list: T[], win: T, max: number): T[] {
  const out = [...list.filter((w) => w.key !== win.key), win];
  return out.slice(Math.max(0, out.length - max));
}

/* 창 자리·크기: 폭은 400 ~ 화면의 60%, 높이는 160 ~ 화면 − 96. 끌거나 화면 크기가 바뀌어도 창이 화면 밖으로 나가지 않게(위는 화면 맨 위, 아래는 머리 줄만큼 남김) */
export type Box = { x: number; y: number; w: number };
export type Viewport = { w: number; h: number };
export const clampW = (w: number, vw: number) => Math.round(Math.min(Math.max(WIN_W_MIN, w), Math.max(WIN_W_MIN, vw * WIN_W_MAX)));
export const clampH = (h: number, vh: number) => Math.round(Math.min(Math.max(WIN_H_MIN, h), Math.max(WIN_H_MIN, vh - WIN_H_GAP)));
export function clampBox(b: Box, vp: Viewport): Box {
  const w = clampW(b.w, vp.w);
  return { x: Math.round(Math.min(Math.max(0, b.x), Math.max(0, vp.w - w))), y: Math.round(Math.min(Math.max(0, b.y), Math.max(0, vp.h - WIN_HEAD))), w };
}
/* 끌지 않은 새 창의 정중앙 어긋남(px, CSS --win-off): 맨 위 창에서 24 더 — 창 수 한도(3)를 넘기면 0 으로 돌아간다 */
export const nextOff = (prev: number) => (prev + WIN_STEP > (ADMIN_MAX - 1) * WIN_STEP ? 0 : prev + WIN_STEP);
/* 맨 위 창을 끌어 옮겼을 때 새 창 자리: 그 창에서 오른쪽 아래 24(화면 밖이면 clampBox 가 되돌림) */
export const nextBox = (prev: Box, vp: Viewport): Box => clampBox({ x: prev.x + WIN_STEP, y: prev.y + WIN_STEP, w: prev.w }, vp);

/* 창 안 '같은 단계 사업' 링크: 지금 그 목록 화면(list)이면 지금 거르기를 두고 창 주소(id·cand)·인쇄·지도에서 옴(from)을 뺀 뒤 stage 만 바꾸고, 다른 화면이면 list?stage= */
export function sameStageHref(pathname: string, search: string, list: '/projects' | '/citizen/projects', stage: string): string {
  if (pathname !== list) return `${list}?stage=${encodeURIComponent(stage)}`;
  const q = new URLSearchParams(search);
  for (const k of ['id', 'cand', 'print', 'from']) q.delete(k);
  q.set('stage', stage);
  return `${list}?${q.toString()}`;
}
