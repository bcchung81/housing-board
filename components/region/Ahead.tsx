'use client';
/* 지역 공급 ① 앞으로 12개월: 파동 타임라인(달마다 사업 조각을 호수만큼 쌓음) · 지도(원 넓이 = 호수, 서울·인천·경기만) · 고른 달 목록.
   세 블록이 같은 고른 달(주소 ?m=)과 강조 사업을 쓴다. 시도·종류 거르기는 서버(칩 링크)가 하고, 이 섬은 달 고르기·강조·지도 원 크기만 맡는다.
   마우스는 조각·원에 HUD(떠 있는 설명)를, 키보드는 달 단추(←→ Home End)·지도 원(고른 달의 원만 초점 — Tab 으로 하나, ←→ 이동, Enter·Space 고르기)과 목록 링크가 같은 정보를 준다. 시안: docs/design/home-concept/assets/app.js PAGES.region
   지도 연결점(수도권 사업만): 목록 행의 지도 표지, 원·조각을 눌러 고른 사업은 지도 상자 위 '지도에서 보기'. 지도(/map)는 다른 루트 레이아웃이라 <a>.
   지도 시군구 고르기(수도권 면): 면을 누르면(원이 먼저) 테두리 강조 + 지도 위 줄에 '{시군구} · 지도에서 크게 보기'(구가 있는 경기 시는 구마다), 키보드는 그 줄의 시군구 목록(select), Esc 로 풀림. 주소 ?sgg=<면 코드>.
   sido: 'metro' 수도권 · '' 전국 · 'NN' 시도 하나. */
import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';
import { cn } from 'cn';
import { CAL_KINDS, CAL_TYPE, LOC_NAME, METRO, dotFocus, inScope, sggUnits, type AheadEntry, type CalKind } from '../../lib/board/region';
import { mapHref } from '../../lib/board/map-href';
import { METRO_AREAS, SIDO_SHORT, guOf } from '../../lib/board/metro-overview';
import MapLink from '../board/MapLink';
import InfoTip from '../ui/info-tip';

type MapData = { view: [number, number, number, number]; sgg: { s: string; n: string; d: string }[]; districts: { n: string; d: string }[] };
type Props = { sido: string; regionName: string; months: string[]; nowM: string; list: AheadEntry[]; initialM: string; initialSgg: string | null; map: MapData | null };

const SGG_TABLE = { areas: METRO_AREAS, sidoShort: SIDO_SHORT, guOf };
const WAVE_H = 260, LIST_N = 8;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const man = (v: number) => (v === 0 ? '0' : v >= 10000 ? `${+(v / 10000).toFixed(1)}만` : fmt(v));
const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; };
const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
const monthLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
const dayText = (e: AheadEntry) => (e.day ? `${Number(e.day.slice(5, 7))}월 ${Number(e.day.slice(8, 10))}일` : `${Number(e.ym.slice(5, 7))}월 중`);
const light = (c: string, p: number) => `color-mix(in srgb,${c} ${p}%,var(--card))`;
const hollow = (e: AheadEntry) => e.loc === 'rep' || e.loc === 'area' || e.loc === 'name';
const onMap = (e: AheadEntry) => METRO.includes(e.sd);
const HATCH_SW = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_1.5px,transparent_1.5px_3.5px)]';
const LINK = 'group/action inline-flex flex-none cursor-pointer items-center gap-px rounded-[4px] border-0 bg-transparent p-0 text-[14px] leading-[1.45] whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const KindChip = ({ t }: { t: CalKind }) => (
  <span className="inline-block flex-none rounded-full px-2 text-[13px] leading-[20px] font-bold whitespace-nowrap" style={{ background: light(CAL_TYPE[t].color, 16), color: CAL_TYPE[t].ink }}>{CAL_TYPE[t].name}</span>
);

export default function Ahead({ sido, regionName, months, nowM, list, initialM, initialSgg, map }: Props) {
  const [m, setM] = React.useState(initialM);
  const [hover, setHover] = React.useState<string | null>(null);   // 마우스를 올린 달(지도만 그 달을 진하게)
  const [hl, setHl] = React.useState<string | null>(null);         // 누른 사업
  const [hot, setHot] = React.useState<string | null>(null);       // 목록·조각에 올린 사업
  const [more, setMore] = React.useState(false);
  const [sgg, setSgg] = React.useState<string | null>(initialSgg);   // 지도에서 고른 시군구(면 코드)
  const [hud, setHud] = React.useState<{ e: AheadEntry; withLoc: boolean } | null>(null);
  const hudRef = React.useRef<HTMLDivElement>(null);
  const waveRef = React.useRef<HTMLDivElement>(null);
  const mapBox = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);

  const byM = React.useMemo(() => Object.fromEntries(months.map((x) => [x, list.filter((e) => e.ym === x)])), [months, list]);
  const byK = React.useMemo(() => new Map(list.map((e) => [e.k, e])), [list]);
  const ok = months.filter((x) => byM[x].length);

  /* 지도 원 크기는 화면 px 로 정한다(지도 단위 / 화면 px) */
  React.useEffect(() => {
    const el = mapBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setBox({ w: r.width - 16, h: r.height - 16 }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  const setUrlM = (x: string) => {
    const q = new URLSearchParams(window.location.search);
    q.set('m', x);
    window.history.replaceState(null, '', `?${q.toString()}${window.location.hash}`);
  };
  const pickSgg = (c: string | null) => {
    setSgg(c);
    const q = new URLSearchParams(window.location.search);
    if (c) q.set('sgg', c); else q.delete('sgg');
    const t = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${t ? `?${t}` : ''}${window.location.hash}`);
  };
  const pick = (x: string, k: string | null = null, focus = false) => {
    if (!byM[x]?.length) return;
    setM(x); setHl(k); setHot(null);
    setMore(k ? byM[x].findIndex((e) => e.k === k) >= LIST_N : false);
    setUrlM(x);
    if (focus) requestAnimationFrame(() => waveRef.current?.querySelector<HTMLButtonElement>(`[data-m="${x}"]`)?.focus());
    if (k) requestAnimationFrame(() => document.querySelector(`[data-row="${CSS.escape(k)}"]`)?.scrollIntoView({ block: 'nearest' }));
  };
  const place = (ev: React.MouseEvent) => {
    const el = hudRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 16;
    if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - 16;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
  };
  React.useLayoutEffect(() => { if (!hud && hudRef.current) hudRef.current.style.left = '-9999px'; }, [hud]);
  const lastMouse = React.useRef<React.MouseEvent | null>(null);
  React.useLayoutEffect(() => { if (hud && lastMouse.current) place(lastMouse.current); }, [hud]);

  const hotKey = hot ?? hl;

  /* ---------- 파동 ---------- */
  const tot = months.map((x) => sum(byM[x], (e) => e.units));
  const max = niceMax(Math.max(1, ...tot));
  const segs = (xs: AheadEntry[], x: string) => (!sido
    /* 전국: 사업이 많아(달마다 수십~수백) 조각 대신 종류별로 묶는다 */
    ? CAL_KINDS.map((t) => { const ys = xs.filter((e) => e.type === t), u = sum(ys, (e) => e.units); return u ? <span key={t} className="relative block w-full flex-none border-t border-chartbg" style={{ height: `${u / max * 100}%`, background: CAL_TYPE[t].color }} title={`${monthLabel(x)} ${CAL_TYPE[t].name} ${ys.length}건 · ${fmt(u)}호`} /> : null; })
    : [...xs].sort((a, b) => CAL_KINDS.indexOf(a.type) - CAL_KINDS.indexOf(b.type) || b.units - a.units).map((e) => (e.units
      ? <span key={e.k} data-seg={e.k} data-hl={e.k === hotKey ? '' : undefined} className="relative block min-h-[3px] w-full flex-none border-t border-chartbg data-[hl]:z-[1] data-[hl]:outline-2 data-[hl]:outline-foreground" style={{ height: `${e.units / max * 100}%`, background: CAL_TYPE[e.type].color }} />
      : <span key={e.k} data-seg={e.k} data-hl={e.k === hotKey ? '' : undefined} className={cn('relative block h-[7px] w-full flex-none border border-b-0 data-[hl]:z-[1] data-[hl]:outline-2 data-[hl]:outline-foreground', HATCH_SW)} style={{ borderColor: CAL_TYPE[e.type].color }} />)));

  const onWaveKey = (ev: React.KeyboardEvent) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (!b || !ok.length) return;
    const i = ok.indexOf(b.dataset.m!);
    const n = ({ ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: ok.length - 1 } as Record<string, number>)[ev.key];
    if (n === undefined) return;
    ev.preventDefault();
    pick(ok[(n + ok.length) % ok.length], null, true);
  };
  const wave = (
    <div data-slot="chart-frame" className="relative h-full rounded-[10px] border border-border bg-chartbg py-2.5 pr-3 pl-[54px]"
      onMouseLeave={() => { setHover(null); setHud(null); }}>
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: 40, height: WAVE_H }}>
          {[max, max / 2, 0].map((v, i) => (
            <React.Fragment key={i}>
              <span className="absolute inset-x-0 border-t border-border" style={{ top: `${i * 50}%` }} />
              <span className="absolute right-[calc(100%+8px)] -translate-y-1/2 text-[13px] leading-none whitespace-nowrap text-mute tabular-nums" style={{ top: `${i * 50}%` }}>{man(v)}</span>
            </React.Fragment>
          ))}
        </div>
        <div ref={waveRef} role="radiogroup" aria-label="달 고르기" className="relative grid grid-cols-12" onKeyDown={onWaveKey}
          onMouseMove={(ev) => { lastMouse.current = ev; if (hud) place(ev); }}
          onMouseOver={(ev) => {
            lastMouse.current = ev;
            const t = ev.target as HTMLElement, b = t.closest<HTMLButtonElement>('[data-m]'), seg = t.closest<HTMLElement>('[data-seg]');
            setHover(b && !b.disabled ? b.dataset.m! : null);
            const e = seg ? byK.get(seg.dataset.seg!) : undefined;
            setHud(e ? { e, withLoc: false } : null);
          }}>
          {months.map((x, i) => {
            const xs = byM[x], on = x === m;
            return (
              <button key={x} type="button" role="radio" aria-checked={on} data-m={x} disabled={!xs.length} tabIndex={xs.length ? (on ? 0 : -1) : undefined}
                aria-label={`${monthLabel(x)} ${xs.length}건 ${fmt(tot[i])}호`}
                onClick={(ev) => { const seg = (ev.target as HTMLElement).closest<HTMLElement>('[data-seg]'); pick(x, seg ? seg.dataset.seg! : null); }}
                className="btn-reset group/m flex min-w-0 flex-col items-center rounded-[8px] px-0.5 pt-1 pb-0.5 enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--pn2)_70%,transparent)] aria-checked:bg-[color-mix(in_srgb,var(--primary)_9%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                <span className="flex h-[36px] flex-col items-center justify-end leading-[1.25] tabular-nums">
                  {xs.length ? <><b className="text-[13px] whitespace-nowrap">{man(tot[i])}<small className="ml-px text-[11px] font-normal text-muted-foreground">호</small></b><span className="text-[13px] whitespace-nowrap text-muted-foreground">{xs.length}건</span></> : null}
                </span>
                <span className="relative flex w-full flex-col-reverse items-center" style={{ height: WAVE_H }}>
                  {xs.length
                    ? <span className="q-grow-y flex h-full w-[min(30px,62%)] flex-col-reverse [&>span:last-child]:rounded-t-[3px]" style={{ ['--i' as string]: i }}>{segs(xs, x)}</span>
                    : <><span className="text-[13px] leading-none text-muted-foreground">없음</span><span className="mb-1 block h-[5px] w-px bg-line2" /></>}
                </span>
                <span className="mt-1.5 flex flex-col items-center leading-[1.25]">
                  <span className="rounded-full px-1.5 text-[13px] whitespace-nowrap tabular-nums group-aria-checked/m:bg-primary group-aria-checked/m:font-bold group-aria-checked/m:text-primary-foreground">{Number(x.slice(5))}월</span>
                  <span className="h-4 text-[12px] whitespace-nowrap text-muted-foreground">{x === nowM ? '이번 달' : x.endsWith('-01') ? x.slice(0, 4) : ''}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ---------- 지도(경계가 있는 서울·인천·경기만) ---------- */
  let mapEl: React.ReactNode = null, sggBar: React.ReactNode = null;
  if (map) {
    const V = map.view;
    const k = box && box.w > 0 && box.h > 0 ? Math.max(V[2] / box.w, V[3] / box.h) : null;
    const maxU = Math.max(1, ...list.map((e) => e.units));
    const act = hover ?? m;
    const pts = list.filter((e) => e.pt).sort((a, b) => Number(a.ym === act) - Number(b.ym === act) || b.units - a.units);
    const rOf = (e: AheadEntry) => (e.units ? Math.max(4, 17 * Math.sqrt(e.units / maxU)) : 4) * (k ?? 1);
    const ringOf = hotKey ? pts.find((e) => e.k === hotKey) : undefined;
    const foc = dotFocus(byM[m] ?? [], m, hl);
    const focusDot = (k: string) => { mapBox.current?.querySelector<SVGElement>(`[data-dot="${CSS.escape(k)}"]`)?.focus(); setHot(k); };
    const onDotKey = (ev: React.KeyboardEvent) => {
      const k = (ev.target as Element).closest<SVGElement>('[data-dot]')?.dataset.dot;
      const i = k ? foc.keys.indexOf(k) : -1;
      if (i < 0) return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const e = byK.get(k!)!; pick(e.ym, e.k); return; }
      const n = ({ ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: foc.keys.length - 1 } as Record<string, number>)[ev.key];
      if (n === undefined) return;
      ev.preventDefault();
      focusDot(foc.keys[(n + foc.keys.length) % foc.keys.length]);
    };
    /* 초점을 받는 원(고른 달)의 접근 속성: 단추 역할·이름(사업·종류·날짜·호수·위치)·눌림 */
    const dotA11y = (e: AheadEntry) => (foc.keys.includes(e.k) ? {
      tabIndex: e.k === foc.tab ? 0 : -1, role: 'button', 'aria-pressed': e.k === hl,
      'aria-label': `${e.name} · ${CAL_TYPE[e.type].name} ${dayText(e)} · ${e.units ? `${fmt(e.units)}호` : '호수 미확인'} · ${e.place}${e.loc ? ` · ${LOC_NAME[e.loc]}` : ''}`,
      onFocus: () => setHot(e.k), onBlur: () => setHot(null),
      className: 'cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-primary',
    } : { className: 'cursor-pointer', 'aria-hidden': true });
    const units = sggUnits(map, sido, SGG_TABLE), cur = units.find((u) => u.code && u.code === sgg);
    sggBar = (
      <div className="flex min-h-[30px] flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
        <select aria-label="시군구 고르기(고르면 지도에서 크게 볼 수 있음)" value={cur?.code ?? ''} onChange={(ev) => pickSgg(ev.target.value || null)}
          className="h-[30px] max-w-[11rem] cursor-pointer rounded-[8px] border border-border bg-card px-2 text-[14px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <option value="">시군구 고르기</option>
          {[...new Set(units.map((u) => u.s))].map((sd) => (
            <optgroup key={sd} label={units.find((u) => u.s === sd)!.label.split(' ')[0]}>
              {units.filter((u) => u.s === sd && u.code).map((u) => <option key={u.code} value={u.code!}>{u.n}</option>)}
            </optgroup>
          ))}
        </select>
        {cur ? (cur.gu.length ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5"><b className="font-bold">{cur.n} —</b>{cur.gu.map((g) => <MapLink key={g.code} href={mapHref({ sgg: g.code })} full={`${cur.n} ${g.name} 지도에서 크게 보기`}>{g.name} 지도</MapLink>)}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2"><b className="font-bold">{cur.n} ·</b><MapLink href={mapHref({ sgg: cur.code! })} full={`${cur.n} 지도에서 크게 보기`}>지도에서 크게 보기</MapLink></span>
        )) : null}
        <InfoTip label="지도 보는 법" className="ml-auto"><p>원을 누르면(키보드는 Enter) 그 사업을 지도에서 볼 수 있습니다.</p></InfoTip>
      </div>
    );
    mapEl = (
      <div ref={mapBox} data-slot="chart-frame" className="relative min-h-[340px] flex-1 overflow-hidden rounded-[10px] border border-border bg-chartbg"
        onMouseMove={(ev) => { lastMouse.current = ev; if (hud) place(ev); }}
        onMouseOver={(ev) => { lastMouse.current = ev; const d = (ev.target as Element).closest<SVGElement>('[data-dot]'); const e = d ? byK.get(d.dataset.dot!) : undefined; setHud(e ? { e, withLoc: true } : null); }}
        onMouseLeave={() => setHud(null)}
        onClick={(ev) => {
          const d = (ev.target as Element).closest<SVGElement>('[data-dot]'), e = d ? byK.get(d.dataset.dot!) : undefined;
          if (e) { setHud(null); pick(e.ym, e.k); return; }
          /* 원이 아니면 면: 누른 시군구를 고르고, 이미 고른 면을 다시 누르면 푼다 */
          const c = (ev.target as Element).closest<SVGElement>('[data-sgg]')?.dataset.sgg;
          if (c) pickSgg(c === sgg ? null : c);
        }}>
        <svg viewBox={V.join(' ')} preserveAspectRatio="xMidYMid meet" className="absolute top-2 left-2 block h-[calc(100%-16px)] w-[calc(100%-16px)]" role="group" aria-label={`${regionName} ${monthLabel(m)} 예정 사업 위치 ${foc.keys.length}건(목록과 같은 사업 · ←→ 로 옮기고 Enter 로 고르기)`} onKeyDown={onDotKey}>
          <g strokeLinejoin="round" aria-hidden="true">
            {map.sgg.filter((g) => !inScope(sido, g.s)).map((g, i) => <path key={`o${i}`} d={g.d} fill="none" stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
            {map.sgg.filter((g) => inScope(sido, g.s)).map((g, i) => {
              const u = units.find((x) => x.s === g.s && x.n === g.n);
              return u?.code
                ? <path key={`s${i}`} d={g.d} data-sgg={u.code} fill="var(--card)" stroke="var(--line2)" vectorEffect="non-scaling-stroke" className="cursor-pointer hover:fill-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"><title>{g.n} — 누르면 고르기(지도에서 크게 보기)</title></path>
                : <path key={`s${i}`} d={g.d} fill="var(--card)" stroke="var(--line2)" vectorEffect="non-scaling-stroke"><title>{g.n}</title></path>;
            })}
          </g>
          <g fill="color-mix(in srgb,var(--muted-foreground) 20%,transparent)" aria-hidden="true">
            {map.districts.map((x, i) => <path key={i} d={x.d}><title>{x.n}</title></path>)}
          </g>
          {cur ? <path d={map.sgg.find((g) => g.s === cur.s && g.n === cur.n)!.d} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" /> : null}
          {k ? (
            <g>
              {pts.map((e) => {
                const on = e.ym === act, c = CAL_TYPE[e.type].color, [x, y] = e.pt!, r = rOf(e);
                return hollow(e)
                  ? <circle key={e.k} data-dot={e.k} cx={x} cy={y} r={r} fill="var(--chartbg)" fillOpacity={on ? 0.7 : 0} stroke={c} strokeWidth={on ? 2 : 1.2} strokeOpacity={on ? 1 : 0.4} vectorEffect="non-scaling-stroke" {...dotA11y(e)} />
                  : <circle key={e.k} data-dot={e.k} cx={x} cy={y} r={r} fill={c} fillOpacity={on ? 0.9 : 0.22} stroke={on ? 'var(--card)' : 'none'} strokeWidth={1} vectorEffect="non-scaling-stroke" {...dotA11y(e)} />;
              })}
              {ringOf ? <circle cx={ringOf.pt![0]} cy={ringOf.pt![1]} r={rOf(ringOf) + 3 * k} fill="none" stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" /> : null}
            </g>
          ) : null}
        </svg>
        {(() => { const sel = hl ? byK.get(hl) : undefined; return sel && onMap(sel) ? (
          <a href={mapHref({ project: sel.id })} title={`${sel.name} — 지도에서 이 사업 위치와 주변 보기`}
            className="absolute top-2 right-2 inline-flex max-w-[70%] items-center gap-1 rounded-[8px] border border-border bg-card px-2.5 py-1 text-[14px] font-bold text-foreground no-underline shadow-[var(--shadow-card)] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <MapPin className="size-4 flex-none" aria-hidden="true" /><span className="truncate">{sel.name}</span><span className="flex-none font-normal text-muted-foreground">지도에서 보기 ›</span>
          </a>
        ) : null; })()}
        <ul className="pointer-events-auto absolute bottom-2 left-3 m-0 flex list-none flex-wrap items-center gap-x-2.5 p-0 text-[13px] text-muted-foreground" aria-label="지도 범례">
          <li className="flex items-center gap-1" title="원 넓이 = 호수(호수 미확인은 가장 작은 원)"><i className="block size-[9px] rounded-full bg-mute" aria-hidden="true" />원 넓이 = 호수</li>
          <li className="flex items-center gap-1" title="정확한 좌표가 없어 시군구 중심(또는 근사 위치)에 둔 사업"><i className="block size-[9px] rounded-full border-[1.5px] border-mute" aria-hidden="true" />대표 위치</li>
          <li className="flex items-center gap-1" title="공공주택지구 공동주택용지(V-World LT_C_LHBLPN)"><i className="block size-[9px] rounded-[2px]" style={{ background: 'color-mix(in srgb,var(--muted-foreground) 20%,transparent)' }} aria-hidden="true" />지구</li>
        </ul>
      </div>
    );
  }

  /* ---------- 고른 달 목록 ---------- */
  const xs = byM[m] ?? [], shown = more ? xs : xs.slice(0, LIST_N);
  const rowIn = (ev: React.SyntheticEvent) => { const r = (ev.target as HTMLElement).closest<HTMLElement>('[data-row]'); setHot(r ? r.dataset.row! : null); };
  const listEl = (
    <div className="mt-4" onMouseOver={rowIn} onFocus={rowIn} onMouseLeave={() => setHot(null)}
      onBlur={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setHot(null); }}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h3 className="m-0 text-[16px] font-bold">{monthLabel(m)}</h3>
        <span className="text-[14px] text-muted-foreground tabular-nums">{xs.length}건 · {fmt(sum(xs, (e) => e.units))}호</span>
      </div>
      <ol className="m-0 list-none columns-2 gap-x-8 p-0 narrow:columns-1" aria-label={`${monthLabel(m)} 예정 사업`}>
        {shown.map((e) => {
          /* 상세가 있는 사업은 상세 서랍(?id=), 후보 사업은 간단 보기(?cand=) — 막다른 행이 없다 */
          const href = e.drawer ? `/projects?id=${e.id}` : `/projects?cand=${e.id}`;
          return (
            <li key={e.k} data-row={e.k} data-hl={e.k === hotKey ? '' : undefined} className="flex break-inside-avoid items-center gap-x-3 border-b border-border px-1 py-1.5 text-[14px] leading-[1.5] data-[hl]:bg-[color-mix(in_srgb,var(--primary)_9%,transparent)]">
              <KindChip t={e.type} />
              <span className="min-w-0 flex-1 truncate font-bold" title={e.name}>
                <Link href={href} className="text-foreground no-underline underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{e.name}</Link>
                {e.drawer ? null : <>{' '}<span className="ml-1 text-[13px] font-normal text-muted-foreground" title="후보 사업(사업 번호가 아직 없음) — 누르면 간단 보기">(후보)</span></>}
              </span>
              <span className="w-[74px] flex-none whitespace-nowrap text-muted-foreground tabular-nums">{dayText(e)}</span>
              <span className="w-[96px] flex-none truncate text-muted-foreground" title={e.sgg}>{e.place}</span>
              <span className="w-[68px] flex-none text-right whitespace-nowrap tabular-nums">{e.units ? `${fmt(e.units)}호` : <span className="text-[13px] text-muted-foreground" title="호수 미확인">미확인</span>}</span>
              <span className="w-5 flex-none">{onMap(e) ? <a href={mapHref({ project: e.id })} title={`${e.name} — 지도에서 보기`} aria-label={`${e.name} 지도에서 보기`} className="flex rounded-[4px] text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"><MapPin className="size-4" aria-hidden="true" /></a> : null}</span>
              <span className="w-4 flex-none"><Link href={href} tabIndex={-1} aria-hidden="true" className="flex text-muted-foreground hover:text-primary"><ChevronRight className="size-4" /></Link></span>
            </li>
          );
        })}
      </ol>
      {xs.some((e) => !e.drawer) ? <p className="m-0 mt-1.5 text-[14px] text-muted-foreground">(후보) = 사업 번호가 아직 없는 후보 사업 · 누르면 간단 보기</p> : null}
      {xs.length > shown.length ? <button type="button" onClick={() => setMore(true)} className={cn('btn-reset mt-2', LINK)}>더 보기 · 외 {xs.length - shown.length}건 {fmt(sum(xs.slice(LIST_N), (e) => e.units))}호</button> : null}
    </div>
  );

  return (
    <>
      <div className={map ? 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3.5 narrow:grid-cols-1' : 'grid grid-cols-1'}>
        <div className="min-w-0">{wave}</div>
        {map ? <div className="flex min-w-0 flex-col gap-2" onKeyDown={(ev) => { if (ev.key === 'Escape' && sgg) pickSgg(null); }}>{sggBar}{mapEl}</div> : null}
      </div>
      {listEl}
      <div ref={hudRef} hidden={!hud} role="presentation" style={{ left: -9999, top: 0 }}
        className="pointer-events-none fixed z-50 max-w-[300px] rounded-[8px] border border-border bg-popover px-2.5 py-1.5 text-[13px] leading-[1.45] text-popover-foreground shadow-[var(--shadow-pop)]">
        {hud ? (
          <>
            <b className="block">{hud.e.name}</b>
            <span className="block tabular-nums"><b style={{ color: CAL_TYPE[hud.e.type].ink }}>{CAL_TYPE[hud.e.type].name}</b> · {dayText(hud.e)} · {hud.e.units ? `${fmt(hud.e.units)}호` : '호수 미확인'}</span>
            <span className="block text-muted-foreground">{hud.e.place}{hud.withLoc && hud.e.loc ? ` · ${LOC_NAME[hud.e.loc]}` : ''}</span>
          </>
        ) : null}
      </div>
    </>
  );
}
