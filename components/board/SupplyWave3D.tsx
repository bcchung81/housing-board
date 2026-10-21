'use client';
/* 종합상황판 '월별 공급 파동' 3D — 단계 6개 + 지연 띠를 쌓은 판을 뒤로 밀어낸 입체(SupplyWaveChart 가 next/dynamic 으로만 부른다).
   시점(2026-10-21 사용자 지시 '기울기 없이 정면으로'): 정사영 정면 카메라, 세계 좌표 = 캔버스 CSS px(lib/board/wave3d.ts layoutOf) — 앞면이 축 눈금과 px 단위로 맞고,
   깊이는 뒷면을 오른쪽 위로 비켜 드러난 윗면(밝게)·오른쪽 끝면(어둡게)으로 보인다. 회전·이동·확대 없음(휠은 페이지 스크롤로 넘어간다).
   층 면은 2D 리본과 같은 색: 세로 그라데이션(위 하이라이트·아래 그늘)·층 경계선·예정 구간(바탕 섞기 + 빗금)·지연 띠, 범례 강조 밖 층은 바탕 섞기.
   선·글자는 캔버스 밖 SVG·DOM 층(뒤: 연도 구분선 · 앞: 눈금선·달 눈금·가리킴·고른 달 막대·총량 괄호·기준선·축 글자·총량 라벨·툴팁) — 모두 판 여백 안이라 카드를 넘지 않는다.
   조작: 가리킴 = 툴팁, 누름 = 그 달 고르기, 키보드 ←→(Shift = 한 해) = 고른 달 옮기기. 요청 때만 그린다(frameloop demand). */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three';
import { C, f, ml, type Timeline } from '@/lib/board/sample';
import { bandOf, capOf, colsOf, cut, cx, edge, faceColors, frontOf, fullWin, keyStep, layoutOf, lidOf, monthAt, nowMark, seamOf, stackOf, sy, tipPlace, totalPlace, xTicks, yAt, yAxis, type Layout, type Rgb, type Stack } from '@/lib/board/wave3d';

export type Wave3DProps = {
  T: Timeline; su: number[][]; delays: (number[] | null)[];
  cursor: number; onPick: (m: number) => void; hl: number;   // 고른 달·범례 강조(없으면 -1)는 부르는 쪽 상태
  label: string;                                             // 판의 aria-label
  tip: (m: number) => ReactNode;                             // 툴팁 내용(2D 와 같은 것)
  fallback: ReactNode;                                       // WebGL 문맥을 못 만들면 그릴 2D
};

/* 캔버스가 읽을 토큰: 단계색 6 + 지연 띠·층 경계·빗금·하이라이트·그늘·카드 바탕(선·글자 색은 SVG·DOM 층이 var() 로 바로 쓴다) */
const TOK = [...C, 'var(--rb-band)', 'var(--rb-seam)', 'var(--rb-hatch)', 'var(--rb-hi)', 'var(--rb-lo)', 'var(--card)'];
const BAND = 6, SEAM = 7, HATCH = 8, HI = 9, LO = 10, CARD = 11;
type Tok = { rgb: Rgb; a: number; css: string };

/* 토큰 → 색: 판 안의 숨은 요소에 var() 를 칠해 계산된 색을 1×1 캔버스로 sRGB 바이트·불투명도로 읽는다(oklch·color-mix 도 같은 길).
   <html> 의 class·data-*(테마·관점·배색)가 바뀌면 다시 읽는다 */
function useTokens(host: RefObject<HTMLDivElement | null>) {
  const [toks, setToks] = useState<Tok[] | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const probe = document.createElement('i'), cv = document.createElement('canvas');
    probe.hidden = true; el.appendChild(probe); cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const read = () => {
      if (!ctx) return;
      setToks(TOK.map((v) => {
        probe.style.color = v;
        const css = getComputedStyle(probe).color;
        ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return { rgb: [r, g, b], a: a / 255, css };
      }));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-design', 'data-aud'] });
    return () => { mo.disconnect(); probe.remove(); };
  }, [host]);
  return toks;
}

/* sRGB 바이트 → three 색(색 관리가 선형으로 바꾼다 — 화면에는 토큰 값 그대로) */
const lin = (c: Rgb) => new Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, SRGBColorSpace);
type Grid = { positions: Float32Array; index: number[]; per: number };
function useGeo(g: Grid, rows?: Rgb[], uv?: number) {
  const geo = useMemo(() => {
    const x = new BufferGeometry();
    x.setAttribute('position', new BufferAttribute(g.positions, 3)); x.setIndex(g.index);
    if (rows) {   // 기둥마다 같은 줄 색(앞면 세로 그라데이션)
      const cs = rows.map(lin), col = new Float32Array(g.positions.length);
      for (let i = 0; i < g.positions.length / 3; i++) { const c = cs[i % g.per]; col.set([c.r, c.g, c.b], i * 3); }
      x.setAttribute('color', new BufferAttribute(col, 3));
    }
    if (uv) {   // 빗금: 세계 px ÷ 무늬 칸(2D 리본 #hatch 와 같은 14px)
      const t = new Float32Array((g.positions.length / 3) * 2);
      for (let i = 0; i < t.length / 2; i++) t.set([g.positions[i * 3] / uv, g.positions[i * 3 + 1] / uv], i * 2);
      x.setAttribute('uv', new BufferAttribute(t, 2));
    }
    return x;
  }, [g, rows, uv]);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}
function Face({ g, rows, color, opacity = 1, order = 0 }: { g: Grid; rows?: Rgb[]; color?: Rgb; opacity?: number; order?: number }) {
  const geo = useGeo(g, rows);
  const see = opacity < 1;
  return <mesh geometry={geo} renderOrder={order}><meshBasicMaterial vertexColors={!!rows} color={color ? lin(color) : undefined} transparent={see} opacity={opacity} depthWrite={!see} /></mesh>;
}
/* 예정 구간 빗금(2D #hatch 와 같은 무늬·색·불투명도 .32): 28px 캔버스(2배)에 14px 칸 무늬를 그려 되풀이 */
function Hatch({ g, tok }: { g: Grid; tok: Tok }) {
  const geo = useGeo(g, undefined, 14);
  const tex = useMemo(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 28;
    const x = cv.getContext('2d');
    if (x) { x.scale(2, 2); x.strokeStyle = tok.css; x.globalAlpha = 0.32; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-3, 3); x.lineTo(3, -3); x.moveTo(0, 14); x.lineTo(14, 0); x.moveTo(11, 17); x.lineTo(17, 11); x.stroke(); }
    const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace;
    return t;
  }, [tok.css]);
  useEffect(() => () => tex.dispose(), [tex]);
  return <mesh geometry={geo} renderOrder={3}><meshBasicMaterial map={tex} transparent depthTest={false} depthWrite={false} /></mesh>;
}

/* 정면 고정: 정사영 카메라를 판 가운데 앞에 둔다(판 크기가 바뀌면 다시) — 세계 1 = CSS 1px */
function Front() {
  const camera = useThree((s) => s.camera), size = useThree((s) => s.size), invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    camera.position.set(size.width / 2, size.height / 2, 10);
    camera.updateProjectionMatrix(); invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}

/* 쌓은 판: 단계마다 실적·예정 구간의 앞면(그라데이션)·윗면·끝면, 전 구간의 지연 띠·층 경계선, 예정 구간 빗금. 가리킴(hover)이 바뀌어도 다시 그리지 않는다(memo) */
const Ribbon = memo(function Ribbon({ st, T, L, ymax, toks, hl }: { st: Stack; T: Timeline; L: Layout; ymax: number; toks: Tok[]; hl: number }) {
  const parts = useMemo(() => {
    const e = Math.max(L.x0, Math.min(L.x1, edge(L, T.actual + 1)));
    return [5, 4, 3, 2, 1, 0].map((k) => {
      const cs = colsOf(st, k, L, ymax), dim = hl >= 0 && hl !== k;
      const segs = ([[L.x0, e, false], [e, L.x1, true]] as const).map(([xa, xb, plan]) => ({ plan, cs: cut(cs, xa, xb) })).filter((s) => s.cs.length > 1)
        .map((s) => { const fc = faceColors(toks[k].rgb, { hi: toks[HI].rgb, lo: toks[LO].rgb, card: toks[CARD].rgb, plan: s.plan, dim }); return { ...s, fc, rows: [fc.top, fc.mid, fc.bottom], front: frontOf(s.cs), lid: lidOf(s.cs, L) }; });
      const last = segs.at(-1);
      return { k, dim, segs, cap: last ? { g: capOf(last.cs.at(-1)!, L), color: last.fc.cap } : null, band: bandOf(cs), seam: seamOf(cs) };
    });
  }, [st, T.actual, L, ymax, toks, hl]);
  const hatch = useMemo(() => { const e = edge(L, T.actual + 1); return e < L.x1 ? { positions: new Float32Array([e, L.y1 + L.dy, 0.6, L.x1 + L.dx, L.y1 + L.dy, 0.6, e, L.y0, 0.6, L.x1 + L.dx, L.y0, 0.6]), index: [0, 2, 1, 1, 2, 3], per: 2 } : null; }, [L, T.actual]);
  const band = (dim: boolean) => (dim ? faceColors(toks[BAND].rgb, { hi: toks[HI].rgb, lo: toks[LO].rgb, card: toks[CARD].rgb, plan: false, dim }).mid : toks[BAND].rgb);
  return (
    <>
      {parts.map((p) => (
        <group key={p.k}>
          {p.segs.map((s) => (
            <group key={String(s.plan)}>
              <Face g={s.front} rows={s.rows} />
              <Face g={s.lid} color={s.fc.lid} />
            </group>
          ))}
          {p.cap ? <Face g={p.cap.g} color={p.cap.color} /> : null}
          <Face g={p.band} color={band(p.dim)} />
          <Face g={p.seam} color={toks[SEAM].rgb} opacity={0.85 * toks[SEAM].a * (p.dim ? 0.28 : 1)} order={1} />
        </group>
      ))}
      {hatch ? <Hatch g={hatch} tok={toks[HATCH]} /> : null}
    </>
  );
});

const man = (v: number, max: number) => (v === 0 ? '0' : max >= 10000 ? `${+(v / 10000).toFixed(2)}만` : f(v));

export default function SupplyWave3D({ T, su, delays, cursor, onPick, hl, label, tip, fallback }: Wave3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const toks = useTokens(host);
  const st = useMemo(() => stackOf(T, su, delays), [T, su, delays]);
  const n = st.n;
  const win = useMemo(() => fullWin(n), [n]);
  const [hover, setHover] = useState(-1);
  const sel = Math.max(0, Math.min(n - 1, cursor));
  /* 판 크기(px) — 캔버스와 같다. 판 배치·눈금 수·덮개 층이 따른다 */
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [ready, setReady] = useState(false);   // WebGL 문맥을 만든 뒤에만 선·글자 층(실패해 2D 대체면 그리지 않는다)
  const L = useMemo(() => (size.w ? layoutOf(size.w, size.h, n) : null), [size.w, size.h, n]);
  const ya = useMemo(() => yAxis(st, win, L ? L.y1 - L.y0 : 320), [st, win, L]);
  const xt = useMemo(() => xTicks(T.months, win), [T.months, win]);
  const now = L ? nowMark(T, L) : null;
  const at = (e: ReactMouseEvent<HTMLDivElement>) => (L ? monthAt(L, e.clientX - e.currentTarget.getBoundingClientRect().left) : -1);
  /* 툴팁(가리킨 달 판 위쪽에 붙여 판 안으로 — tipPlace)·총량 라벨(더미 윗변 안쪽 — totalPlace): 그린 뒤 크기를 재서 자리를 정한다 */
  const tipRef = useRef<HTMLDivElement>(null), totRef = useRef<HTMLSpanElement>(null);
  const top = L ? yAt(L, st.total[sel], ya.max) : 0;
  useLayoutEffect(() => {
    if (!L) return;
    const t = tipRef.current;
    if (t && hover >= 0) { const q = tipPlace(cx(L, hover), sy(L, L.y1), t.offsetWidth, t.offsetHeight, L.w, L.h); t.style.left = `${q.x}px`; t.style.top = `${q.y}px`; }
    const b = totRef.current;
    if (b) { const q = totalPlace(L, cx(L, sel), top, b.offsetWidth, b.offsetHeight); b.style.left = `${q.x}px`; b.style.top = `${q.y}px`; }
  });
  const T0 = L ? sy(L, L.y1 + L.dy) : 0, B0 = L ? sy(L, L.y0) : 0;   // 막대·선이 서는 판 위(깊이 포함)·바닥(화면 y)
  return (
    <div ref={host} tabIndex={0} role="group" aria-roledescription="3D 차트" aria-label={label}
      className="relative mt-3 aspect-[12/5] w-full cursor-pointer [touch-action:pan-y]"
      onPointerMove={(e) => setHover(at(e))} onPointerLeave={() => setHover(-1)}
      onClick={(e) => { const m = at(e); if (m >= 0) onPick(m); }}
      onKeyDown={(e) => {
        const next = keyStep(sel, e.key, e.shiftKey, n);
        if (next === null) return;
        e.preventDefault();
        if (next !== sel) onPick(next);
      }}>
      {toks && ready && L ? (
        <svg data-slot="wave3d-back" className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
          {xt.ticks.slice(1).map((t) => <line key={t.m} x1={edge(L, t.m)} x2={edge(L, t.m)} y1={T0 - 4} y2={B0} stroke="var(--rb-sep)" strokeDasharray="2 4" />)}
        </svg>
      ) : null}
      {toks ? (
        <Canvas orthographic frameloop="demand" flat dpr={[1, 2]} gl={{ antialias: true, alpha: true }} fallback={fallback} onCreated={() => setReady(true)}
          camera={{ near: 0.1, far: 100, position: [0, 0, 10] }}>
          {L ? <Ribbon st={st} T={T} L={L} ymax={ya.max} toks={toks} hl={hl} /> : null}
          <Front />
        </Canvas>
      ) : null}
      {toks && ready && L ? (
        <div data-slot="wave3d-labels" className="pointer-events-none absolute inset-0">
          <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true">
            <defs><linearGradient id="w3-cur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--rb-acc)" stopOpacity=".34" /><stop offset=".16" stopColor="var(--rb-acc)" stopOpacity=".14" /><stop offset=".84" stopColor="var(--rb-acc)" stopOpacity=".14" /><stop offset="1" stopColor="var(--rb-acc)" stopOpacity=".34" /></linearGradient></defs>
            {/* 세로축 눈금선: 층 위에서도 보이게 층 경계색 55% 점선, 0 은 실선(2D 리본과 같다) */}
            {ya.ticks.map((v, i) => { const y = sy(L, yAt(L, v, ya.max)); return <line key={v} x1={L.x0} x2={L.x1} y1={y} y2={y} stroke={i ? 'var(--rb-seam)' : 'var(--rb-mid)'} strokeOpacity={i ? 0.55 : 1} strokeDasharray={i ? '3 4' : undefined} />; })}
            {/* 달 눈금(1월은 길게) */}
            {Array.from({ length: n + 1 }, (_, m) => { const jan = m < n && T.months[m].endsWith('-01'); return <line key={m} x1={edge(L, m)} x2={edge(L, m)} y1={B0} y2={B0 + (jan ? 7 : 3)} stroke="var(--rb-axis)" strokeOpacity={jan ? 1 : 0.6} />; })}
            {hover >= 0 ? <rect x={edge(L, hover)} y={T0} width={L.pitch} height={B0 - T0} fill="var(--rb-hover)" fillOpacity=".1" /> : null}
            <rect x={edge(L, sel)} y={T0} width={L.pitch} height={B0 - T0} rx="3" fill="url(#w3-cur)" />
            {now ? <line x1={now.x} x2={now.x} y1={T0 - 4} y2={B0 + 2} stroke="var(--rb-ink)" strokeWidth="1.4" strokeDasharray="5 4" /> : null}
            {/* 고른 달 총량 괄호 */}
            <g stroke="var(--rb-cur)">
              <line x1={cx(L, sel)} x2={cx(L, sel)} y1={sy(L, top)} y2={B0} strokeWidth="1.4" strokeDasharray="2 2" />
              <line x1={cx(L, sel) - 8} x2={cx(L, sel) + 8} y1={sy(L, top)} y2={sy(L, top)} strokeWidth="2" />
              <line x1={cx(L, sel) - 8} x2={cx(L, sel) + 8} y1={B0} y2={B0} strokeWidth="2" />
            </g>
            {/* 축 글자: 세로축은 판 왼쪽 여백에 오른쪽 끝을 맞춰, 가로축은 1월 눈금 아래 한 줄(판 왼쪽 끝 글자는 왼쪽 정렬 — 0 과 겹치지 않게), 기준 달은 판 위 여백 */}
            <g className="text-sm tabular-nums" fill="var(--rb-axis)">
              {ya.ticks.map((v) => <text key={v} x={L.x0 - 8} y={sy(L, yAt(L, v, ya.max))} textAnchor="end" dominantBaseline="central">{man(v, ya.max)}</text>)}
              {xt.ticks.map((t) => <text key={t.m} x={edge(L, t.m)} y={B0 + 9} textAnchor={t.m === 0 ? 'start' : 'middle'} dominantBaseline="hanging">{t.label}</text>)}
            </g>
            {now ? <text className="text-sm font-bold" x={now.x} y={T0 - 8} textAnchor="middle" fill="var(--rb-ink)">{now.label}</text> : null}
          </svg>
          <span ref={totRef} data-slot="wave3d-total" className="absolute flex h-6 items-center rounded-chip border border-[var(--rb-hud-line)] bg-[var(--rb-hud)] px-2 text-sm whitespace-nowrap tabular-nums" style={{ color: 'var(--rb-hud-txt)' }}>{f(st.total[sel])}호</span>
          {hover >= 0 ? (
            <div ref={tipRef} data-slot="board-tip" className="dark pointer-events-none absolute min-w-[168px] rounded-tile border border-[var(--rb-hud-line)] bg-[color-mix(in_srgb,var(--popover)_88%,transparent)] px-compact-x py-compact-y text-sm leading-body text-foreground shadow-pop backdrop-blur-[6px]">{tip(hover)}</div>
          ) : null}
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">{`${ml(T, sel)} 총량 ${f(st.total[sel])}호 · 보이는 범위 ${ml(T, win.a)}~${ml(T, win.b)}`}</p>
    </div>
  );
}
