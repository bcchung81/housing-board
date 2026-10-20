'use client';
/* 사업 창 관리자(2026-10-19 — 옛 사업 상세 서랍 Drawer.tsx 대체, 핸드오프 docs/product/화면-데이터-활용-모달리스-창-핸드오프.md 5절). 대시보드 레이아웃에 하나 단다(지도 레이아웃도 장착만으로 동작).
   - 링크 가로채기: window 캡처 단계 click 위임 — 같은 출처의 /projects?id=·?cand=, /citizen/projects?id= 링크를 페이지 이동 대신 그 자리의 창으로(판정 nav.ts interceptOf).
     preventDefault + stopPropagation 이라 Next <Link> 는 이동하지 않는다(next/dist/client/app-dir/link.js 가 e.defaultPrevented 면 돌아간다). 새 탭(보조 키·가운데 단추)·data-window="off" 는 그대로 이동.
   - 관점: /citizen 화면은 일반사용자(PublicDetail), 그 밖은 정책담당자(ProjectDetail·Candidate). 지도(html[data-map-shell])는 html[data-aud]. 관점이 바뀌면 창을 닫는다.
   - 창 수: 정책담당자 3(넘치면 가장 오래된 창부터 닫음) · 일반사용자·900px 이하 1(다른 사업은 내용 교체) · 이미 열린 사업은 맨 위로. 목록 창(openList)도 센다.
   - 주소·기록(nav.ts navStep): 창 0 → 1 일 때만 pushState, 그 뒤는 replaceState(주소 = 맨 위 사업 창의 id 또는 cand). 마지막 창을 닫으면 기준 기록을 쌓았으면 history.back(), 아니면 id·cand 를 뺀다.
     Next 16 은 네이티브 pushState·replaceState 를 라우터와 이어 준다(usePathname·useSearchParams 가 따라옴 — next/dist/client/components/app-router.js 가 history 를 감싸 내부 상태를 복사).
     popstate: 주소에 id·cand 가 없으면 창을 모두 닫고, 있으면 그 사업을 맨 위로(없으면 연다). Next 링크로 거르기를 바꿔 주소에서 id 가 빠지면 창은 남기고 주소에 다시 적는다.
   - 첫 창: /projects·/citizen/projects 는 서버가 projectWindow 로 만든 첫 창(WindowSeed)을 받고, 그 밖의 화면은 장착 뒤 주소의 id·cand 를 /api/v1/project/{id} 로 받아 연다. 인쇄 보기(?print=1)에는 창이 없다.
   - 초점: 열면 제목, 닫으면 연 요소(가로챈 링크) → 목록의 같은 사업 링크 → 본문(main). Esc 는 여기 하나가 처리: 열린 ⓘ 팝오버·펼친 칩 메뉴가 먼저, 아니면 맨 위 창만 닫는다. */
import { Suspense, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { mapHref } from '@/lib/board/map-href';
import type { ProjectWindow } from '@/lib/board/project-window';
import FloatingWindow, { DEFAULT_BOX, type Back, type WinBox } from './FloatingWindow';
import { windowParts } from './parts';
import {
  ADMIN_MAX, PUBLIC_MAX, hrefWith, interceptOf, isPrint, keyOf, navStep, nextBox, nextOff, place, popAction, urlTarget, viewOf,
  type Target, type View,
} from './nav';

export type ListRow = { href: string; name: string; meta?: string };
export type ListSpec = { title: string; rows: ListRow[]; moreHref?: string };
type Win = {
  uid: number; key: string; asked: string; view: View; target: Target | null;   // target 없음 = 목록 창
  data: ProjectWindow | null; list: ListSpec | null; error: string | null; opener: HTMLElement | null; fromMap: boolean; box: WinBox; focus: number;
};
export type WindowsApi = {
  /* 사업 창 열기(이미 열렸으면 맨 위로). cand = 번호 없는 후보 간단 보기 */
  openProject: (id: string, o?: { cand?: boolean; opener?: HTMLElement | null }) => void;
  /* 목록 창(종합상황판 숫자 → 같은 거르기의 사업 목록): 행 링크는 다시 가로채져 사업 창을 연다 */
  openList: (spec: ListSpec, o?: { opener?: HTMLElement | null }) => void;
  close: (key: string) => void;
  /* 첫 창(WindowSeed — 서버가 만든 props) */
  adopt: (data: ProjectWindow, o?: { fromMap?: boolean }) => void;
  /* 열린 사업 창의 사업 id(목록 선택 표시) — 장착 전에는 null(서버가 그린 선택 표시를 그대로 둔다) */
  openIds: ReadonlySet<string> | null;
};
const Ctx = createContext<WindowsApi | null>(null);
export const useWindows = () => useContext(Ctx);
export const useOpenIds = () => useContext(Ctx)?.openIds ?? null;

const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
const viewNow = (): View => viewOf(window.location.pathname, document.documentElement.hasAttribute('data-map-shell'), document.documentElement.getAttribute('data-aud'));
const here = () => window.location.pathname + window.location.search;
const targetOfData = (d: ProjectWindow): Target => ({ kind: d.kind === 'candidate' ? 'cand' : 'id', id: d.canonical });
/* 지도에서 연 첫 창(?from=map)의 머리 '지도로 돌아가기'(지도는 다른 루트 레이아웃이라 <a>) — 사업 상세·목록에서 뺀 사업만 */
export const backOf = (d: ProjectWindow, fromMap: boolean): Back | null =>
  fromMap && d.view === 'admin' && d.kind !== 'candidate' ? { href: mapHref({ project: d.canonical }), label: '지도로 돌아가기', title: '지도에서 이 사업 위치로 돌아가기' } : null;
/* 닫은 창의 초점 돌려줄 곳: 연 요소 → 목록(정책 표 data-grid · 일반사용자 표 role=table)의 같은 사업 링크 → 본문 main(초점이 body 로 빠지지 않게) */
function restoreFocus(w: Win) {
  const id = w.data?.canonical ?? w.target?.id;
  const row = id ? document.querySelector<HTMLElement>(`[data-slot="data-grid"] a[href$="=${CSS.escape(id)}"], [role="table"] a[href$="=${CSS.escape(id)}"]`) : null;
  ((w.opener?.isConnected ? w.opener : null) ?? row ?? document.getElementById('main'))?.focus({ preventScroll: true });
}
/* 맨 위 사업 창의 주소 대상(목록 창은 건너뛴다) */
const topTarget = (list: Win[]) => { for (let i = list.length - 1; i >= 0; i--) if (list[i].target) return list[i].target; return null; };

export default function WindowHost({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<Win[]>([]);
  const [ready, setReady] = useState(false);
  const [loc, setLoc] = useState({ pathname: '', search: '' });
  const ref = useRef<Win[]>([]);
  const base = useRef(false);    // 이 세션에서 창을 열며 기록을 하나 쌓았는가(마지막 창을 닫을 때 back)
  const seen = useRef('');        // 마지막으로 본·쓴 주소(경로 + 쿼리) — Next 이동(외부)과 내 pushState 를 가른다
  const uid = useRef(0);

  /* 창 목록을 바꾸고 주소·기록을 맞춘다(user = 사용자 조작 — 열기·닫기·맨 위 바꾸기) */
  const commit = useCallback((next: Win[], user: boolean) => {
    const s = navStep(urlTarget(window.location.search), topTarget(next), next.length, base.current, user);
    base.current = s.base;
    const url = hrefWith(window.location.pathname, window.location.search, s.target, window.location.hash);
    if (s.op === 'push') window.history.pushState(null, '', url);
    else if (s.op === 'replace') window.history.replaceState(null, '', url);
    else if (s.op === 'back') window.history.back();
    if (s.op === 'push' || s.op === 'replace') seen.current = here();
    ref.current = next;
    setWins(next);
  }, []);
  /* 다른 관점의 창은 닫는다(주소는 건드리지 않는다 — 관점이 바뀐 화면의 주소가 정본) */
  const syncView = useCallback((v: View) => {
    if (!ref.current.some((w) => w.view !== v)) return;
    ref.current = ref.current.filter((w) => w.view === v);
    base.current = false;
    setWins(ref.current);
  }, []);
  const maxOf = (v: View) => (v === 'public' || isMobile() ? PUBLIC_MAX : ADMIN_MAX);
  /* 새 창 자리: 맨 위 창이 끌기 전이면 정중앙에서 24 더 어긋나게(CSS), 끌어 옮긴 창이면 실제 그려진 자리에서 오른쪽 아래 24 */
  const boxAfter = (list: Win[]): WinBox => {
    const top = list[list.length - 1];
    const el = document.querySelector<HTMLElement>(`[data-window="${CSS.escape(top.key)}"]`);
    if (el?.hasAttribute('data-placed')) {
      const r = el.getBoundingClientRect();
      return { ...nextBox({ x: r.left, y: r.top, w: r.width }, { w: window.innerWidth, h: window.innerHeight }), h: null, placed: true, off: 0 };
    }
    return { ...DEFAULT_BOX, off: nextOff(top.box.off) };
  };
  /* 새 창을 맨 위에(일반사용자·900px 이하는 지금 창의 내용만 바꾼다 — 자리·접힘 그대로) */
  const put = (w: Win, user: boolean) => {
    const max = maxOf(w.view), cur = ref.current;
    const swap = max === 1 && cur.length ? cur[cur.length - 1] : null;
    const win = swap ? { ...w, uid: swap.uid, box: swap.box, focus: swap.focus + 1 } : { ...w, box: !cur.length ? w.box : boxAfter(cur) };
    commit(place(swap ? cur.filter((x) => x.uid !== swap.uid) : cur, win, max), user);
  };
  const find = (k: string) => ref.current.find((w) => w.key === k || w.asked === k);

  /* 창을 맨 위로(주소는 replace). focus = 제목에 초점(링크로 다시 눌렀을 때) */
  const raise = useCallback((key: string, user: boolean, focus = false, opener?: HTMLElement | null) => {
    const cur = ref.current, w = cur.find((x) => x.key === key);
    if (!w) return;
    if (cur[cur.length - 1] === w && !focus) return;
    commit(place(cur, { ...w, opener: opener ?? w.opener, focus: focus ? w.focus + 1 : w.focus }, cur.length), user);
  }, [commit]);

  const load = (key: string, t: Target, view: View, user: boolean) => {
    fetch(`/api/v1/project/${encodeURIComponent(t.id)}?view=${view}${t.kind === 'cand' ? '&cand=1' : ''}`)
      .then((r) => (r.ok ? r.json() as Promise<ProjectWindow> : Promise.reject(r.status)))
      .then((data) => {
        const w = ref.current.find((x) => x.key === key && !x.data);
        if (!w) return;   // 그 사이 닫혔거나 다른 사업으로 바뀐 창 — 늦게 온 응답은 버린다
        const k = keyOf(targetOfData(data)), dup = ref.current.find((x) => x.key === k && x !== w);
        if (dup) { commit(place(ref.current.filter((x) => x !== w), dup, ref.current.length), false); return; }   // 옛 id 로 열었는데 대표 사업 창이 이미 있다
        commit(ref.current.map((x) => (x === w ? { ...w, key: k, data, target: targetOfData(data) } : x)), false);   // 옛 id 면 주소를 대표 id 로
      })
      .catch((status) => {
        const w = ref.current.find((x) => x.key === key && !x.data);
        if (!w) return;
        if (!user) { commit(ref.current.filter((x) => x !== w), false); return; }   // 주소로 연 없는 사업은 열지 않는다(옛 서랍과 같음)
        commit(ref.current.map((x) => (x === w ? { ...w, error: status === 404 ? '사업 정보가 없습니다' : '불러오지 못했습니다' } : x)), false);
      });
  };

  /* 사업 창 보장: 열려 있으면 맨 위로, 없으면 열고 자료를 받는다 */
  const ensure = (t: Target, view: View, opener: HTMLElement | null, user: boolean, fromMap = false) => {
    syncView(view);
    const k = keyOf(t), ex = find(k);
    if (ex) { raise(ex.key, user, user, opener); return; }
    put({ uid: ++uid.current, key: k, asked: k, view, target: t, data: null, list: null, error: null, opener, fromMap, box: DEFAULT_BOX, focus: 1 }, user);
    load(k, t, view, user);
  };
  const ensureRef = useRef(ensure);
  ensureRef.current = ensure;

  const close = useCallback((key: string) => {
    const w = ref.current.find((x) => x.key === key);
    if (!w) return;
    commit(ref.current.filter((x) => x !== w), true);
    restoreFocus(w);
  }, [commit]);

  const api = useMemo<WindowsApi>(() => ({
    openProject: (id, o = {}) => ensureRef.current({ kind: o.cand ? 'cand' : 'id', id }, viewNow(), o.opener ?? null, true),
    openList: (spec, o = {}) => {
      const view = viewNow();
      syncView(view);
      const k = `list:${spec.title}`, ex = ref.current.find((w) => w.key === k);
      if (ex) { raise(k, true, true, o.opener); return; }
      put({ uid: ++uid.current, key: k, asked: k, view, target: null, data: null, list: spec, error: null, opener: o.opener ?? null, fromMap: false, box: DEFAULT_BOX, focus: 1 }, true);
    },
    close,
    adopt: (data, o = {}) => {
      syncView(data.view);
      const t = targetOfData(data), k = keyOf(t), asked = keyOf({ kind: t.kind, id: data.asked });
      const ex = ref.current.find((w) => w.key === k || w.asked === asked || w.asked === k);
      if (ex) { if (!ex.data) commit(ref.current.map((x) => (x === ex ? { ...ex, key: k, data, target: t } : x)), false); return; }
      put({ uid: ++uid.current, key: k, asked, view: data.view, target: t, data, list: null, error: null, opener: null, fromMap: !!o.fromMap, box: DEFAULT_BOX, focus: 1 }, false);
    },
    openIds: ready ? new Set(wins.flatMap((w) => (w.target ? [w.target.id, w.asked.slice(w.asked.indexOf(':') + 1)] : []))) : null,
  }), [ready, wins, close, commit, raise, syncView]);

  /* 주소 변화: 처음 장착(주소로 연 창) · Next 이동(거르기 링크 등 — 창은 남기고 주소에 다시 적는다) */
  const onUrl = useCallback(() => {
    const h = here();
    setLoc({ pathname: window.location.pathname, search: window.location.search });
    if (h === seen.current) return;
    seen.current = h;
    const view = viewNow();
    syncView(view);
    base.current = false;
    if (isPrint(window.location.search)) { if (ref.current.length) { ref.current = []; setWins([]); } return; }
    const t = urlTarget(window.location.search);
    if (t) {
      const ex = find(keyOf(t));
      if (!ex || ref.current[ref.current.length - 1] !== ex) ensureRef.current(t, view, null, false, window.location.pathname === '/projects' && new URLSearchParams(window.location.search).get('from') === 'map');
    } else if (ref.current.some((w) => w.target)) commit(ref.current, false);
  }, [commit, syncView]);

  /* 뒤로가기·앞으로가기 */
  useEffect(() => {
    const onPop = () => {
      seen.current = here();
      setLoc({ pathname: window.location.pathname, search: window.location.search });
      const view = viewNow();
      syncView(view);
      if (isPrint(window.location.search)) { ref.current = []; setWins([]); return; }
      const a = popAction(urlTarget(window.location.search), ref.current);
      if (a.act === 'closeAll') { const top = ref.current[ref.current.length - 1]; if (top) { commit([], false); restoreFocus(top); } base.current = false; }
      else if (a.act === 'raise') raise(a.key, false);
      else ensureRef.current(a.target, view, null, false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [commit, raise, syncView]);

  /* 링크 가로채기(캡처 단계 — Next <Link> 의 onClick 보다 먼저) */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      const t = interceptOf({ href: a.getAttribute('href')!, target: a.getAttribute('target'), download: a.hasAttribute('download'), off: a.getAttribute('data-window') === 'off' },
        e, { href: window.location.href, search: window.location.search });
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      ensureRef.current(t, viewNow(), a as HTMLElement, true);
    };
    /* 지도 정적 스크립트(assets/js)처럼 링크가 아닌 곳에서 여는 길: window.dispatchEvent(new CustomEvent('project:open', { detail: { id, cand } })) */
    const onOpen = (e: Event) => { const d = (e as CustomEvent<{ id?: string; cand?: boolean }>).detail; if (d?.id) ensureRef.current({ kind: d.cand ? 'cand' : 'id', id: d.id }, viewNow(), null, true); };
    window.addEventListener('click', onClick, true);
    window.addEventListener('project:open', onOpen);
    return () => { window.removeEventListener('click', onClick, true); window.removeEventListener('project:open', onOpen); };
  }, []);

  /* Esc: 열린 ⓘ 팝오버(Esc 는 팝오버만 닫는다 — 창 안 ⓘ, 2026-10-16) → 펼친 칩 메뉴(접힘 영역 data-fold 은 메뉴가 아니다) → 맨 위 창 하나 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current.length) return;
      if (document.querySelector('[data-popup-open]')) return;
      const menu = document.querySelector<HTMLDetailsElement>('details[open]:not([data-fold])');
      if (menu) { menu.open = false; return; }
      close(ref.current[ref.current.length - 1].key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  /* 장착: 지금 주소를 읽고(첫 창 WindowSeed 의 layout effect 와 같은 그림에), 장착 표시는 그 뒤 — 그 전 그림은 서버가 그린 선택 표시 그대로 */
  useLayoutEffect(() => setLoc({ pathname: window.location.pathname, search: window.location.search }), []);
  useEffect(() => setReady(true), []);

  const today = todayKst();
  const top = wins[wins.length - 1];
  return (
    <Ctx.Provider value={api}>
      {children}
      {/* 흐린 막: 창이 하나라도 있으면 화면 전체(상단 메뉴 포함, z-50)를 약하게 흐린다 — 보이는 효과일 뿐 클릭·스크롤·키보드를 막지 않는다(pointer-events: none). 창은 z-60 으로 막 위 */}
      {wins.length ? <Scrim /> : null}
      <Suspense fallback={null}><UrlWatch onChange={onUrl} /></Suspense>
      {wins.map((w) => {
        const p = w.data ? windowParts(w.data, loc, today) : null;
        return (
          <FloatingWindow key={w.uid} winKey={w.key} title={p?.title ?? w.list?.title ?? '사업 상세'} head={p?.head} back={w.data ? backOf(w.data, w.fromMap) : null} box={w.box} active={w === top} focusSeq={w.focus}
            closeLabel={w.list ? '목록 닫기' : '사업 상세 닫기'} onClose={() => close(w.key)} onRaise={() => raise(w.key, true)}>
            {p ? p.body : w.list ? <ListBody spec={w.list} /> : <p role="status" className="m-0 text-sm text-muted-foreground">{w.error ?? '불러오는 중'}</p>}
          </FloatingWindow>
        );
      })}
    </Ctx.Provider>
  );
}

/* 흐린 막 한 장: 나타날 때 짧게 투명도 전이(움직임 줄이기면 바로) */
function Scrim() {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  return <div aria-hidden="true" data-window-scrim="" className={`pointer-events-none fixed inset-0 z-50 bg-(--win-scrim) backdrop-blur-(--win-blur) transition-opacity duration-150 motion-reduce:transition-none print:hidden ${on ? 'opacity-100' : 'opacity-0'}`} />;
}

/* 주소(경로·쿼리)가 바뀔 때마다 — Next 링크 이동·네이티브 pushState 모두(useSearchParams 는 Suspense 안에서) */
function UrlWatch({ onChange }: { onChange: () => void }) {
  const sp = useSearchParams(), path = usePathname();
  useEffect(() => { onChange(); }, [sp, path, onChange]);
  return null;
}

/* 목록 창 본문: 행 = 사업 이름(링크 — 다시 가로채져 사업 창) · 짧은 덧말, 아래 '목록 전체 보기'(같은 거르기의 사업 화면으로 이동) */
function ListBody({ spec }: { spec: ListSpec }) {
  return (
    <>
      <ul className="m-0 flex list-none flex-col p-0">
        {spec.rows.map((r) => (
          <li key={r.href} className="flex flex-wrap items-baseline gap-x-3 border-b border-border py-2 last:border-b-0">
            <Link href={r.href} scroll={false} className="font-bold text-foreground no-underline [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{r.name}</Link>
            {r.meta ? <span className="text-sm text-muted-foreground tabular-nums">{r.meta}</span> : null}
          </li>
        ))}
      </ul>
      {spec.moreHref ? (
        <Link href={spec.moreHref} className="inline-flex items-center gap-px self-start text-sm text-muted-foreground no-underline underline-offset-[3px] hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          목록 전체 보기<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}
    </>
  );
}

