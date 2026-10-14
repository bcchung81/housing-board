'use client';
/* 지역 공급 ① 앞으로 12개월: 파동 타임라인(달마다 사업 조각을 호수만큼 쌓음) · 지도(원 넓이 = 호수, 서울·인천·경기만) · 고른 달 목록.
   세 블록이 같은 고른 달(주소 ?m=)과 강조 사업을 쓴다. 시도·종류 거르기는 서버(칩 링크)가 하고, 이 섬은 달 고르기·강조·지도 원 크기만 맡는다.
   마우스는 조각·원에 HUD(떠 있는 설명)를, 키보드는 달 단추(←→ Home End)와 목록 링크가 같은 정보를 준다. 시안: docs/design/home-concept/assets/app.js PAGES.region */
import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import { CAL_KINDS, CAL_TYPE, LOC_NAME, type AheadEntry, type CalKind } from '../../lib/board/region';

type MapData = { view: [number, number, number, number]; sgg: { s: string; n: string; d: string }[]; districts: { n: string; d: string }[] };
type Props = { sido: string; regionName: string; months: string[]; nowM: string; list: AheadEntry[]; initialM: string; map: MapData | null };

const WAVE_H = 260, LIST_N = 8;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const man = (v: number) => (v === 0 ? '0' : v >= 10000 ? `${+(v / 10000).toFixed(1)}만` : fmt(v));
const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; };
const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
const monthLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`;
const dayText = (e: AheadEntry) => (e.day ? `${Number(e.day.slice(5, 7))}월 ${Number(e.day.slice(8, 10))}일` : `${Number(e.ym.slice(5, 7))}월 중`);
const light = (c: string, p: number) => `color-mix(in srgb,${c} ${p}%,var(--card))`;
const hollow = (e: AheadEntry) => e.loc === 'rep' || e.loc === 'area';
const HATCH_SW = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_1.5px,transparent_1.5px_3.5px)]';
const LINK = 'group/action inline-flex flex-none cursor-pointer items-center gap-px rounded-[4px] border-0 bg-transparent p-0 text-[14px] leading-[1.45] whitespace-nowrap text-muted-foreground no-underline underline-offset-[3px] transition-colors hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const KindChip = ({ t }: { t: CalKind }) => (
  <span className="inline-block flex-none rounded-full px-2 text-[12px] leading-[19px] font-bold whitespace-nowrap" style={{ background: light(CAL_TYPE[t].color, 16), color: CAL_TYPE[t].ink }}>{CAL_TYPE[t].name}</span>
);

export default function Ahead({ sido, regionName, months, nowM, list, initialM, map }: Props) {
  const [m, setM] = React.useState(initialM);
  const [hover, setHover] = React.useState<string | null>(null);   // 마우스를 올린 달(지도만 그 달을 진하게)
  const [hl, setHl] = React.useState<string | null>(null);         // 누른 사업
  const [hot, setHot] = React.useState<string | null>(null);       // 목록·조각에 올린 사업
  const [more, setMore] = React.useState(false);
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
    ? CAL_KINDS.map((t) => { const ys = xs.filter((e) => e.type === t), u = sum(ys, (e) => e.units); return u ? <span key={t} className="relative block w-full flex-none border-t border-chartbg" style={{ height: `${u / max * 100}%`, background: CAL_TYPE[t].color }} title={`${monthLabel(x)} ${CAL_TYPE[t].name} ${ys.length}곳 · ${fmt(u)}호`} /> : null; })
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
              <span className="absolute right-[calc(100%+8px)] -translate-y-1/2 text-[12px] leading-none whitespace-nowrap text-mute tabular-nums" style={{ top: `${i * 50}%` }}>{man(v)}</span>
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
                aria-label={`${monthLabel(x)} ${xs.length}곳 ${fmt(tot[i])}호`}
                onClick={(ev) => { const seg = (ev.target as HTMLElement).closest<HTMLElement>('[data-seg]'); pick(x, seg ? seg.dataset.seg! : null); }}
                className="btn-reset group/m flex min-w-0 flex-col items-center rounded-[8px] px-0.5 pt-1 pb-0.5 enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--pn2)_70%,transparent)] aria-checked:bg-[color-mix(in_srgb,var(--primary)_9%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                <span className="flex h-[36px] flex-col items-center justify-end leading-[1.25] tabular-nums">
                  {xs.length ? <><b className="text-[13px] whitespace-nowrap">{man(tot[i])}<small className="ml-px text-[11px] font-normal text-muted-foreground">호</small></b><span className="text-[12px] whitespace-nowrap text-muted-foreground">{xs.length}곳</span></> : null}
                </span>
                <span className="relative flex w-full flex-col-reverse items-center" style={{ height: WAVE_H }}>
                  {xs.length
                    ? <span className="q-grow-y flex h-full w-[min(30px,62%)] flex-col-reverse [&>span:last-child]:rounded-t-[3px]" style={{ ['--i' as string]: i }}>{segs(xs, x)}</span>
                    : <><span className="text-[12px] leading-none text-muted-foreground">없음</span><span className="mb-1 block h-[5px] w-px bg-line2" /></>}
                </span>
                <span className="mt-1.5 flex flex-col items-center leading-[1.25]">
                  <span className="rounded-full px-1.5 text-[13px] whitespace-nowrap tabular-nums group-aria-checked/m:bg-primary group-aria-checked/m:font-bold group-aria-checked/m:text-primary-foreground">{Number(x.slice(5))}월</span>
                  <span className="h-4 text-[11px] whitespace-nowrap text-muted-foreground">{x === nowM ? '이번 달' : x.endsWith('-01') ? x.slice(0, 4) : ''}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ---------- 지도(경계가 있는 서울·인천·경기만) ---------- */
  let mapEl: React.ReactNode = null;
  if (map) {
    const V = map.view;
    const k = box && box.w > 0 && box.h > 0 ? Math.max(V[2] / box.w, V[3] / box.h) : null;
    const maxU = Math.max(1, ...list.map((e) => e.units));
    const act = hover ?? m;
    const pts = list.filter((e) => e.pt).sort((a, b) => Number(a.ym === act) - Number(b.ym === act) || b.units - a.units);
    const rOf = (e: AheadEntry) => (e.units ? Math.max(4, 17 * Math.sqrt(e.units / maxU)) : 4) * (k ?? 1);
    const ringOf = hotKey ? pts.find((e) => e.k === hotKey) : undefined;
    mapEl = (
      <div ref={mapBox} data-slot="chart-frame" className="relative h-full min-h-[340px] overflow-hidden rounded-[10px] border border-border bg-chartbg"
        onMouseMove={(ev) => { lastMouse.current = ev; if (hud) place(ev); }}
        onMouseOver={(ev) => { lastMouse.current = ev; const d = (ev.target as Element).closest<SVGElement>('[data-dot]'); const e = d ? byK.get(d.dataset.dot!) : undefined; setHud(e ? { e, withLoc: true } : null); }}
        onMouseLeave={() => setHud(null)}
        onClick={(ev) => { const d = (ev.target as Element).closest<SVGElement>('[data-dot]'); const e = d ? byK.get(d.dataset.dot!) : undefined; if (e) { setHud(null); pick(e.ym, e.k); } }}>
        <svg viewBox={V.join(' ')} preserveAspectRatio="xMidYMid meet" className="absolute top-2 left-2 block h-[calc(100%-16px)] w-[calc(100%-16px)]" role="img" aria-label={`${regionName} 예정 사업 위치(목록과 같은 사업)`}>
          <g strokeLinejoin="round">
            {map.sgg.filter((g) => g.s !== sido).map((g, i) => <path key={`o${i}`} d={g.d} fill="none" stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
            {map.sgg.filter((g) => g.s === sido).map((g, i) => <path key={`s${i}`} d={g.d} fill="var(--card)" stroke="var(--line2)" vectorEffect="non-scaling-stroke"><title>{g.n}</title></path>)}
          </g>
          <g fill="color-mix(in srgb,var(--muted-foreground) 20%,transparent)" aria-hidden="true">
            {map.districts.map((x, i) => <path key={i} d={x.d}><title>{x.n}</title></path>)}
          </g>
          {k ? (
            <g>
              {pts.map((e) => {
                const on = e.ym === act, c = CAL_TYPE[e.type].color, [x, y] = e.pt!, r = rOf(e);
                return hollow(e)
                  ? <circle key={e.k} data-dot={e.k} cx={x} cy={y} r={r} fill="var(--chartbg)" fillOpacity={on ? 0.7 : 0} stroke={c} strokeWidth={on ? 2 : 1.2} strokeOpacity={on ? 1 : 0.4} vectorEffect="non-scaling-stroke" className="cursor-pointer" />
                  : <circle key={e.k} data-dot={e.k} cx={x} cy={y} r={r} fill={c} fillOpacity={on ? 0.9 : 0.22} stroke={on ? 'var(--card)' : 'none'} strokeWidth={1} vectorEffect="non-scaling-stroke" className="cursor-pointer" />;
              })}
              {ringOf ? <circle cx={ringOf.pt![0]} cy={ringOf.pt![1]} r={rOf(ringOf) + 3 * k} fill="none" stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
            </g>
          ) : null}
        </svg>
        <ul className="pointer-events-auto absolute bottom-2 left-3 m-0 flex list-none flex-wrap items-center gap-x-2.5 p-0 text-[12px] text-muted-foreground" aria-label="지도 범례">
          <li className="flex items-center gap-1" title="원 넓이 = 호수(호수 미확인은 가장 작은 원)"><i className="block size-[9px] rounded-full bg-mute" aria-hidden="true" />원 넓이 = 호수</li>
          <li className="flex items-center gap-1" title="정확한 좌표가 없어 시군구 중심(또는 시군구·동 근사 위치)에 둔 사업"><i className="block size-[9px] rounded-full border-[1.5px] border-mute" aria-hidden="true" />대표 위치</li>
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
        <span className="text-[14px] text-muted-foreground tabular-nums">{xs.length}곳 · {fmt(sum(xs, (e) => e.units))}호</span>
      </div>
      <ol className="m-0 list-none columns-2 gap-x-8 p-0 narrow:columns-1" aria-label={`${monthLabel(m)} 예정 사업`}>
        {shown.map((e) => {
          const href = e.drawer ? `/projects?id=${e.id}` : '';
          return (
            <li key={e.k} data-row={e.k} data-hl={e.k === hotKey ? '' : undefined} className="flex break-inside-avoid items-center gap-x-3 border-b border-border px-1 py-1.5 text-[14px] leading-[1.5] data-[hl]:bg-[color-mix(in_srgb,var(--primary)_9%,transparent)]">
              <KindChip t={e.type} />
              <span className="min-w-0 flex-1 truncate font-bold" title={e.name}>
                {href ? <Link href={href} className="text-foreground no-underline underline-offset-[3px] hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{e.name}</Link> : e.name}
              </span>
              <span className="w-[74px] flex-none whitespace-nowrap text-muted-foreground tabular-nums">{dayText(e)}</span>
              <span className="w-[96px] flex-none truncate text-muted-foreground" title={e.sgg}>{e.place}</span>
              <span className="w-[68px] flex-none text-right whitespace-nowrap tabular-nums">{e.units ? `${fmt(e.units)}호` : <span className="text-[13px] text-muted-foreground" title="호수 미확인">미확인</span>}</span>
              <span className="w-4 flex-none">{href ? <Link href={href} tabIndex={-1} aria-hidden="true" className="flex text-muted-foreground hover:text-primary"><ChevronRight className="size-4" /></Link> : null}</span>
            </li>
          );
        })}
      </ol>
      {xs.length > shown.length ? <button type="button" onClick={() => setMore(true)} className={cn('btn-reset mt-2', LINK)}>더 보기 · 외 {xs.length - shown.length}곳 {fmt(sum(xs.slice(LIST_N), (e) => e.units))}호</button> : null}
    </div>
  );

  return (
    <>
      <div className={map ? 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3.5 narrow:grid-cols-1' : 'grid grid-cols-1'}>
        <div className="min-w-0">{wave}</div>
        {map ? <div className="min-w-0">{mapEl}</div> : null}
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
