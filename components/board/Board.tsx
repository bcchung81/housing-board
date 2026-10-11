'use client';
/* 종합상황판(/) — 시안 이식. 시안의 동작(지시 6건 순환·월별 리본 차트·재생·시점 이동·범례 강조·시도)을 그대로 두고,
   월별 공급 파동·선택 시점 판정·시도·기관별 진행·향후 12개월은 사업 원장 집계(data/board/ledger-board.json — 원장 2026-10 기준)를 그린다.
   지연·주의 추이만 아직 시안 SAMPLE 이다(SAMPLE 표지). 총리 지시 6건 카드는 실데이터(lib/board/directives.ts).
   카드에는 숫자·단위·짧은 이름만 보이고, 기준·범위·규칙 설명은 카드 제목(h2)의 title 에 둔다(2026-10-11 사용자 지시: 실데이터 표지 제거·범례는 제목 줄에·서술 최소화).
   실데이터 위젯(월별 실적 흐름)은 서버 컴포넌트(RealPanels)를 middle 로 받아 시도 카드와 같은 줄에 둔다. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AD, AW, C, CIR, K, PX0, RCOL, RLAB, VW,
  anchor, argmax, delayAt, f, flatTotal, ip, judgedAt, kind, ml, rcls, ribbonOf, sg, timelineOf, txTrend,
} from '../../lib/board/sample';
import { ledgerJudged, ledgerMix, makeDirectives, nation as nationOf } from '../../lib/board/directives';
import type { LedgerBoard } from '../../lib/board/types';
import { cn } from 'cn';
import { sub } from '../page';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { CUR, HOVER, RIBBON, chartStatic, ribbonDynamic } from './ribbon';
import { Key, Sample } from './tags';
import PanelLink from './PanelLink';
import { ag, agName, agRow, agVal, ags, bar3, btn, disp, jtag, legend, pacts, phead, phgroup, ptitle, row2 } from './styles';

export type BoardReal = {
  sourceCount: number;                                              // 원천 카탈로그의 원천 수
  validMonths: string[];                                            // /month/{ym} 이 열리는 달
  ledger: LedgerBoard;                                              // 사업 원장 집계(원장 2026-10 기준)
  ledgerOrigin: 'supabase' | 'json';                                // 집계를 읽어 온 곳(Supabase api.board 또는 JSON 대체)
  ledgerMonth: string;                                              // 읽은 집계의 월(YYYY-MM)
  sido: Record<string, string>;                                     // 시도 코드 → 짧은 이름(통계누리 표기)
  lhAsOf: string;                                                   // LH 파일 기준일(원장의 LH 후보 예정일이 이 값)
  lhAgeMonths: number;                                              // 기준일이 실적 마지막 달보다 몇 개월 묵었나
  actualMonth: string;                                              // 통계누리 실적의 마지막 달(YYYY-MM)
  start: { year: string; upto: number; cum: number | null; cumLy: number | null };   // 통계누리 전국 착공 올해 1~마지막 달 누계와 전년 같은 기간(지시 카드)
};

/* 문구가 바뀌어도 칸 높이가 변하지 않게 가장 긴 문구를 보이지 않게 겹쳐 둔다(시안 reserve) */
function Reserve({ live, list }: { live: ReactNode; list: string[] }) {
  const sizes = Array.from(new Set(list)).sort((a, b) => b.length - a.length).slice(0, 3);
  return <span className="grid [&>*]:min-w-0 [&>*]:[grid-area:1/1]"><span>{live}</span>{sizes.map((t, i) => <span key={i} className="pointer-events-none invisible select-none" aria-hidden="true">{t}</span>)}</span>;
}

/* 패널 겉모양(.pnl)과 지시가 가리킬 때 둘러지는 주색 고리(.ringable .ring) */
const ringable = (on: boolean) => cn('[transition:box-shadow_.25s]', on && 'is-ringed [box-shadow:0_0_0_1px_var(--primary)]');   // is-ringed: 호버 그림자가 고리를 덮지 않게(card-soft)
/* 선택된 칩·버튼의 공통 호버: 눌려 있지 않을 때만 배경이 밝아진다 */
const hoverBg = 'not-aria-pressed:hover:bg-pn2';
/* 툴팁 안의 한 줄(.tip .tr): 왼쪽 이름(작은 색 사각형 포함)과 오른쪽 값 */
const tipRow = 'flex items-center justify-between gap-1.5';
const tipRowKey = 'flex items-center gap-1.5';

export default function Board({ real, middle }: { real: BoardReal; middle: ReactNode }) {
  const L = real.ledger;
  /* 시점은 원장 집계에서 읽는다: NOW = 기준 달, LAST = 마지막 시점, T.actual = 실제 날짜가 있는 마지막 달 */
  const T = useMemo(() => timelineOf(L), [L]), NOW = T.now, LAST = T.last;
  const [focus, setFocus] = useState(1);
  const [cursor, setCursor] = useState(NOW);
  const [tour, setTour] = useState(false);
  const [tick, setTick] = useState(0);
  const [hl, setHl] = useState(-1);
  const [region, setRegion] = useState('11');   // 시도 코드
  const [tip, setTip] = useState<{ m: number; x: number; y: number } | null>(null);
  /* 리본 첫 화면 연출 단계(app/tailwind.css 의 [data-intro]): sweep 쓸기 → travel 첫 시점→기준 달(NOW) → landed 착지 → '' 끝. 서버 렌더부터 sweep 이라 첫 화면부터 쓸린다 */
  const [intro, setIntro] = useState<'sweep' | 'travel' | 'landed' | ''>('sweep');
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const DIR = useMemo(() => makeDirectives({ sourceCount: real.sourceCount, stageNames: K, ledger: real.ledger, start: real.start }), [real.sourceCount, real.ledger, real.start]);
  const valid = useMemo(() => new Set(real.validMonths), [real.validMonths]);
  const rib = useMemo(() => ribbonOf(T, L.stageUnits, L.delayByStage), [T, L]);
  const staticSvg = useMemo(() => chartStatic(rib, hl), [rib, hl]);
  const dynSvg = useMemo(() => ribbonDynamic(rib, cursor), [rib, cursor]);

  useEffect(() => { setTour(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);   // 시안: reduce 이면 순환 끔
  useEffect(() => {   // 리본 첫 화면 연출. 움직임 줄이기면 건너뛰고, 사용자가 누르거나 키·휠을 쓰면 바로 끝내고 기준 시점을 기준 달(NOW)로 둔다(누른 곳의 동작은 그대로 이어진다)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setIntro(''); return; }
    const EV = ['pointerdown', 'keydown', 'wheel'] as const, opt = { capture: true, passive: true };
    const timers: number[] = [];
    let raf = 0;
    const off = () => { for (const ev of EV) window.removeEventListener(ev, skip, opt); };
    const end = () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); off(); setIntro(''); };
    function skip() { end(); setCursor(NOW); }
    for (const ev of EV) window.addEventListener(ev, skip, opt);
    setIntro('sweep'); setCursor(0);
    timers.push(window.setTimeout(() => {   // ② 시간 여행: 한 달에 60ms. 경과 시간으로 달을 정해 타이머가 늦춰지는 탭에서도 같은 시간에 끝난다
      setIntro('travel');
      const t1 = performance.now();
      const step = (t: number) => {
        const m = Math.min(NOW, Math.floor((t - t1) / 60) + 1);
        setCursor(m);
        if (m >= NOW) { setIntro('landed'); timers.push(window.setTimeout(() => { off(); setIntro(''); }, 950)); return; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, 1100));
    return end;
  }, [NOW]);
  useEffect(() => {   // 지시 순환: 1 초 틱, 7 초마다 다음 지시
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (tour && tick > 0 && tick % 7 === 0) setFocus((x) => (x % 6) + 1); }, [tick, tour]);

  const goto = (m: number) => setCursor(Math.max(0, Math.min(LAST, m)));
  const monthAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const m = Math.floor(((clientX - r.left) * (VW / r.width) - PX0) / rib.pitch);
    return m < 0 || m > LAST ? -1 : m;
  };
  useLayoutEffect(() => {   // 툴팁이 차트 밖으로 나가지 않게 자리를 잡는다(시안 showTip)
    if (!tip || !tipRef.current || !wrapRef.current) return;
    const wr = wrapRef.current.getBoundingClientRect(), t = tipRef.current;
    const tw = t.offsetWidth, th = t.offsetHeight;
    let x = tip.x + 14, y = tip.y + 14;
    if (x + tw > wr.width - 6) x = tip.x - tw - 14;
    if (y + th > wr.height - 6) y = wr.height - th - 6;
    t.style.left = `${Math.max(x, 6)}px`; t.style.top = `${Math.max(y, 6)}px`;
  }, [tip]);

  /* 선택 시점의 값. 단계 호수·증감은 선택 시점을 따르고(증감 = 선택 − 기준 달), 판정 값은 선택 시점 이하의 가장 늦은 판정 달(jm, 원장에는 기준 달 하나)의 값이다 — 그 앞 달은 판정 없음 */
  const v = L.stageUnits[cursor], nv = L.stageUnits[NOW], jm = judgedAt(T, cursor), judged = jm >= 0, ds = delayAt(T, L.delayByStage, cursor), bk = argmax(L.delayByStage);
  const planned = (m: number) => kind(T, m) === '예정 기준', showDlt = cursor !== NOW;
  const nowTag = `${ml(T, NOW)} 판정`, jTag = judged ? `${ml(T, jm)} 판정` : '판정 없음';
  const ymKo = (m: number) => `${T.months[m].slice(0, 4)}년 ${Number(T.months[m].slice(5))}월`, ymDot = (ym: string) => ym.replace('-', '.');
  const J = L.judgment, d = J.delay.units, w = J.caution.units, ok = J.ok.units, tt = d + w + ok, pct = (x: number) => (x / tt * 100).toFixed(1) + '%';
  /* 원장 범위: 카드 제목의 title 에 보인다(일부가 전국처럼 보이지 않게) */
  const nation = nationOf(L);
  const scope = `원장 ${L.observedMonth} 기준 · 사업 ${f(L.scope.projects)}건(${ledgerMix(L)}) · ${nation} · ${real.ledgerOrigin === 'supabase' ? `출처 Supabase(api.board, ${real.ledgerMonth})` : '출처 JSON 대체'}`;
  const cc = Math.min(cursor, NOW), tx = (m: number) => (m * 560 / NOW).toFixed(1), ty = (val: number) => (190 - val / 20000 * 180).toFixed(1);
  const RANGE = T.months.map((_, i) => i), ad = anchor(AD, NOW), aw = anchor(AW, NOW);   // SAMPLE 추이는 기준 달에 맞춰 옮긴다
  const pts = (arr: [number, number][]) => RANGE.slice(0, NOW + 1).map((m) => tx(m) + ',' + ty(ip(arr, m, NOW))).join(' ');
  const up = L.upcoming, fi = cursor - NOW, hasFut = fi >= 0 && fi < up.length;
  const maxUp = Math.max(1, ...up.map((m) => m.units));
  const cur = DIR[focus - 1];
  const sidoName = (code: string) => real.sido[code] ?? code;
  const curReg = L.regions.find((r) => r.code === region)!;
  const judgedNames = L.regions.filter((r) => r.judged).map((r) => sidoName(r.code)).join('·');
  const judgedText = L.regions.every((r) => r.judged) ? `${L.regions.length}개 시도 모두` : `${judgedNames}만`;
  const emptyAgencies = L.agencies.filter((a) => !a.projects);
  const outNote = L.agencies.find((a) => a.id === 'lh')?.note;   // 판정 밖(LH 후보)의 사유
  const monthLink = valid.has(T.months[cursor]) ? `/month/${T.months[cursor]}` : null;
  const tipView = tip ? tipOf(tip.m) : null;
  const futRead = hasFut
    ? `${ml(T, cursor)} 준공 ${f(up[fi].units)}호 · ${up[fi].projects}사업`
    : cursor < NOW ? `${ml(T, cursor)} 지난 시점 · 실적은 월 상세` : `${ml(T, cursor)} · 12개월 범위 밖`;
  const futList = [`${ml(T, NOW)} 준공 ${f(maxUp)}호 · 99사업`, `${ml(T, 0)} 지난 시점 · 실적은 월 상세`, `${ml(T, LAST)} · 12개월 범위 밖`];

  function tipOf(m: number) {
    const vv = L.stageUnits[m], dd = delayAt(T, L.delayByStage, m), b = argmax(dd);
    return { m, vv, dd, b };
  }

  return (
    <div className="[&_:focus-visible]:[outline-offset:2px] [&_:focus-visible]:[outline:2px_solid_var(--primary)] motion-reduce:[&_*]:animate-none! motion-reduce:[&_*]:transition-none!">
      <div className="board-desktop mx-auto max-w-[1440px] px-7 pb-9">
        <header className="flex flex-wrap items-center gap-5 pt-6 pb-4">
          <div className="flex flex-wrap items-center gap-5 phone:gap-2"><div className="flex flex-col gap-[3px] phone:w-full"><h1 className="m-0 text-[32px] leading-[1.35] font-bold tracking-[-0.035em] text-foreground mobile:text-[13px]">주택공급 종합상황판</h1><span className="text-[14px] text-muted-foreground [word-break:keep-all]">계획에서 입주까지, 대한민국 주택공급의 흐름을 한눈에</span></div></div>
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <span className={sub} title={`지연·주의 추이(SAMPLE 표지)만 시안 수치이고 나머지는 실제 자료입니다. 원장 위젯은 ${scope}입니다. 실적(통계누리) 자료는 ${real.actualMonth.replace('-', '.')}까지입니다.`}>원장 {L.referenceDate} · 실적 {real.actualMonth.replace('-', '.')}</span>
          </div>
        </header>

        <section aria-label="총리 지시 6건">
          <div className="grid grid-cols-2 gap-2 min-[901px]:grid-cols-3 min-[1101px]:grid-cols-6">
            {DIR.map((x, i) => (
              <button key={i} type="button" data-slot="board-dir" title={x.basis} style={{ ['--i' as string]: i }} className={cn(btn, 'q-rise card-lift group/dir @container relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-[12px] border border-border bg-card px-3.5 pt-2.5 pb-3 aria-pressed:border-primary aria-pressed:bg-accent', hoverBg)} aria-pressed={i === focus - 1} onClick={() => { setFocus(i + 1); setTour(false); }}
                aria-label={`${x.t} ${x.m}${x.sub ? `, ${x.sub.text}${x.sub.note ? ' ' + x.sub.note : ''}` : ''}`}>
                <span className="block min-w-0 truncate text-[min(14px,8.5cqi)] whitespace-nowrap text-muted-foreground">{x.date} · {x.t}</span>
                <span className="flex min-w-0 flex-col"><span className={cn(disp, 'block text-[min(28px,11cqi)] leading-[1.15] whitespace-nowrap group-aria-pressed/dir:text-primary')}>{x.m}</span>
                  {x.sub ? <span className={cn('flex flex-col text-[min(14px,8.5cqi)] leading-[1.15] font-bold whitespace-nowrap', x.sub.tone === 'ok' ? 'text-ok' : x.sub.tone === 'bad' ? 'text-bad' : 'text-warn')}><span>{x.sub.text}</span>{x.sub.note ? <small className="text-[min(13px,8cqi)] font-normal text-muted-foreground">{x.sub.note}</small> : null}</span> : null}
                </span>
                <span className="absolute bottom-0 left-0 h-[3px] w-0 bg-primary [transition:width_.9s_linear]" style={{ width: i === focus - 1 && tour ? `${(((tick % 7) + 1) / 7 * 100).toFixed(0)}%` : '0' }} />
              </button>
            ))}
          </div>
        </section>

        <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_400px] items-stretch gap-3.5 narrow:grid-cols-1">
          <Card variant="board" className={ringable(cur.p.includes('p-chart'))} render={<section id="p-chart" aria-label="월별 공급 파동" />}>
            <div className="mb-2 flex flex-wrap items-center gap-3.5">
              <h2 className={ptitle} title={`${scope} · 달 말 단계별 호수 · ${ml(T, T.actual)}까지 실제 날짜(호수가 가장 많은 원천의 자료 달), 이후 현재 예정(빗금) · 기준일 ${ml(T, NOW)} · 붉은 띠 = 단계별 지연 호수(${ml(T, NOW)} 관측부터)${flatTotal(rib) ? ` · 총량 매달 ${f(rib.total[0])}호(같은 사업이 단계만 옮겨 감)` : ''}`}>월별 공급 파동</h2>
              <div data-slot="board-legend" className="ml-auto flex flex-wrap gap-1" role="group" aria-label="단계 범례 (누르면 해당 단계를 강조)">
                {K.map((k, i) => <button key={k} type="button" className={cn(btn, 'flex items-center gap-1.5 rounded-full border border-transparent px-[9px] py-[3px] text-[14px] [transition:background_.15s,border-color_.15s] aria-pressed:border-primary aria-pressed:bg-accent', hoverBg)} aria-pressed={hl === i} onClick={() => setHl(hl === i ? -1 : i)}><i className="block size-[11px] flex-none rounded-[3px]" style={{ background: C[i] }} />{k}</button>)}
                <span className="flex items-center gap-1.5 border border-transparent px-[9px] py-[3px] text-[14px]" title={`붉은 띠 = 단계별 지연 호수(${ml(T, NOW)} 관측부터)`}><i className="block size-[11px] flex-none rounded-[3px] bg-[var(--rb-band)]" />지연</span>
              </div>
            </div>
            {/* 좁은 화면에서만 가로로 민다. 세로는 숨긴다: overflow-x 가 auto 면 세로도 auto 가 되어, 툴팁·소수점 높이로 1px 만 넘쳐도 세로 스크롤바가 생기고 그 폭만큼 차트가 다시 줄어 그림이 흔들렸다 */}
            <div className="overflow-x-auto overflow-y-hidden rounded-[10px]">
            <div className="relative min-w-[900px] cursor-pointer rounded-[10px] border border-border bg-chartbg [touch-action:pan-y] mobile:min-w-0" ref={wrapRef} data-intro={intro || undefined}
              onPointerMove={(e) => { const m = monthAt(e.clientX); if (m < 0) setTip(null); else { const wr = wrapRef.current!.getBoundingClientRect(); setTip({ m, x: e.clientX - wr.left, y: e.clientY - wr.top }); } }}
              onPointerLeave={() => setTip(null)}
              onClick={(e) => { const m = monthAt(e.clientX); if (m >= 0) goto(m); }}>
              <svg id="chart" shapeRendering="geometricPrecision" ref={svgRef} className="block h-auto w-full [&_text]:[font-family:inherit]" viewBox="0 0 960 400" role="img" aria-label={`${ymKo(0)}부터 ${ymKo(LAST)}까지 원장 사업 ${f(L.scope.projects)}건의 달 말 단계별 호수를 쌓은 월별 리본(${nation}). 바닥부터 쌓은 높이(세로축, 호)가 그 달 총량이고, 층 안의 붉은 띠가 ${ml(T, NOW)} 관측부터의 단계별 지연 호수이며 핀이 병목 단계를 가리킵니다. 차트를 누르면 그 달을 고릅니다.`}>
                <g dangerouslySetInnerHTML={{ __html: staticSvg }} />
                <rect x={rib.X(tip ? tip.m : 0).toFixed(1)} y={RIBBON.TOP - 4} width={rib.pitch.toFixed(1)} height={RIBBON.PH + 8} fill={HOVER.fill} fillOpacity={HOVER.opacity} visibility={tip ? 'visible' : 'hidden'} pointerEvents="none" />
                <rect x={rib.X(cursor).toFixed(1)} y={RIBBON.TOP - 4} width={rib.pitch.toFixed(1)} height={RIBBON.PH + 8} rx="3" fill={CUR.fill} className="rb-cur" pointerEvents="none" />
                {/* ① 쓸기의 빛줄기: 드러나는 층의 앞날을 따라 왼쪽→오른쪽으로 지나간다(평소엔 투명) */}
                <rect className="rb-scan" x={PX0 - 30} y={RIBBON.TOP - 4} width="36" height={RIBBON.PH + 8} fill="url(#rb-scan-g)" opacity="0" pointerEvents="none" />
                <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: dynSvg }} />
              </svg>
              {/* 툴팁도 리본을 가리지 않는 HUD 유리: dark 범위로 감싸 안의 글자·상태색이 어두운 유리용(다크 토큰) 값을 쓰고, 다크 바탕 88% + 흐림으로 뒤 리본이 번져 보인다 */}
              <div data-slot="board-tip" className="dark pointer-events-none absolute z-[3] min-w-[168px] rounded-[10px] border border-[var(--rb-hud-line)] bg-[color-mix(in_srgb,var(--popover)_88%,transparent)] px-[11px] py-[9px] text-[14px] leading-[1.5] text-foreground shadow-[var(--shadow-pop)] backdrop-blur-[6px]" ref={tipRef} hidden={!tip}>
                {tipView ? (
                  <>
                    <div className="mb-1 flex items-center gap-2"><b className={cn(disp, 'text-[18px]')}>{ml(T, tipView.m)}</b><Badge variant="solid" className={planned(tipView.m) ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'}>{kind(T, tipView.m)}</Badge></div>
                    <div className={cn(sub, 'mb-[3px]')}>총량 {f(rib.total[tipView.m])}호</div>
                    {K.map((k, i) => <div key={k} className={tipRow}><span className={tipRowKey}><i className="block size-[9px] rounded-[2px]" style={{ background: C[i] }} />{CIR[i]} {k}</span><b className={disp}>{f(tipView.vv[i])}</b></div>)}
                    <div className="mt-[3px] border-t border-border pt-[3px]">
                      {tipView.m >= NOW ? <>
                        <div className={tipRow}><span className={cn(tipRowKey, 'text-bad')}>지연</span><b className={disp}>{f(J.delay.units)}</b></div><div className={tipRow}><span className={cn(tipRowKey, 'text-warn')}>주의</span><b className={disp}>{f(J.caution.units)}</b></div>
                        <div className={tipRow}><span className={cn(tipRowKey, 'text-primary')}>병목 · {K[tipView.b]}</span><b className={disp}>{f(tipView.dd[tipView.b])}</b></div>
                      </> : <div className={cn(tipRow, 'text-muted-foreground')}>판정은 {ml(T, NOW)} 관측부터</div>}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            </div>
          </Card>

          <Card variant="board" className="@container" render={<section id="p-snap" aria-label="선택 시점의 판정과 단계별 호수" />}>
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <h2 className={ptitle} title={`${scope} · 단계 호수는 선택 달, 증감 = 선택 달 − 기준 달(${ml(T, NOW)}) · 판정은 ${ml(T, NOW)} 관측만 있다: 그 앞 달은 판정 없음, 뒤 달은 ${ml(T, NOW)} 판정 · 판정 기준일 ${L.referenceDate} · 지연 = 현재 예정일 경과 ${L.judge.delayMonths}개월 이상, 주의 = ${L.judge.cautionMonths}~${L.judge.delayMonths}개월 · ${ledgerJudged(L)}`}>{ml(T, cursor)}</h2>
              <Badge variant="solid" className={planned(cursor) ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'}>{kind(T, cursor)}</Badge>
              <span className={pacts}><PanelLink href={`/projects?stage=0${bk + 1}`} full={`병목 단계(${K[bk]})의 사업`}>병목 단계</PanelLink>{monthLink ? <PanelLink href={monthLink} full={`${ml(T, cursor)} 월 상세`}>{Number(T.months[cursor].slice(5))}월</PanelLink> : null}</span>
            </div>
            <div>
              {/* 판정 달 꼬리표는 막대 오른쪽에(제목 줄은 '예정 기준' 표지와 이동 버튼으로 폭이 없다) */}
              <div className="flex items-center gap-2">
                <div className="q-grow-x flex h-3.5 min-w-0 flex-auto gap-0.5 overflow-hidden bg-pn2 [&>span]:block [&>span]:h-full [&>span]:min-w-0" role="img" aria-label={judged ? `${jTag}: 전체 ${f(tt)}호 중 지연 ${pct(d)}, 주의 ${pct(w)}, 정상 ${pct(ok)}` : '판정 없음'}>
                  {judged ? <><span className="bg-bad" style={{ width: `${(d / tt * 100).toFixed(2)}%` }} /><span className="bg-warn" style={{ width: `${(w / tt * 100).toFixed(2)}%` }} /><span className="bg-ok" style={{ width: `${(ok / tt * 100).toFixed(2)}%` }} /></> : null}
                </div>
                <span data-slot="judge-tag" className={cn(jtag, 'flex-none leading-none')}>{jTag}</span>
              </div>
              {/* 판정 없는 달은 숫자만 감춘다(칸 높이는 그대로) */}
              <div className="mt-[9px] grid grid-cols-3 gap-2">
                {([['지연', 'bad', d, J.delay.projects], ['주의', 'warn', w, J.caution.projects], ['정상', 'ok', ok, J.ok.projects]] as const).map(([name, tone, n, np]) => (
                  <div key={name} className="min-w-0">
                    <div className="flex items-center gap-[5px] text-[14px] whitespace-nowrap text-muted-foreground"><i className={cn('block size-[9px] flex-none rounded-[3px]', tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-ok')} />{name}<em className={cn('ml-0.5 text-[14px] not-italic tabular-nums', !judged && 'invisible')}>{pct(n)}</em></div>
                    <b className={cn('block font-display text-[min(20px,5cqi)] leading-[1.3] whitespace-nowrap tabular-nums', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ok', !judged && 'invisible')}>{f(n)}<small className="ml-0.5 [font-family:inherit] text-[14px] font-normal opacity-80">호</small></b>
                    <div className={cn('text-[14px] whitespace-nowrap text-muted-foreground tabular-nums', !judged && 'invisible')}>{f(np)}건</div>
                  </div>
                ))}
              </div>
            </div>
            {/* 증감 칸은 선택 달이 기준 달이 아닐 때만(기준 달이면 3칸) */}
            <div className={cn('mt-3 grid flex-auto content-start gap-x-3', showDlt ? 'grid-cols-[minmax(0,1fr)_max-content_max-content_max-content] phone:grid-cols-[minmax(0,1fr)_max-content_max-content]' : 'grid-cols-[minmax(0,1fr)_max-content_max-content]')} aria-label={showDlt ? '단계별 호수, 기준 달 대비 증감, 지연 호수' : '단계별 호수, 지연 호수'}>
              <div className="col-span-full grid grid-cols-subgrid items-center px-1.5 pb-0.5 text-[13px] text-muted-foreground">
                <span>단계</span><span className="text-right">호수</span>{showDlt ? <span className="text-right phone:hidden">증감</span> : null}<span className="text-right">지연 호수</span>
              </div>
              {K.map((k, i) => {
                const dlt = v[i] - nv[i], neck = judged && i === bk;
                return (
                  <div key={k} className={cn('col-span-full grid flex-auto grid-cols-subgrid items-center rounded-[6px] border-b border-border px-1.5 py-0.5 last:border-b-0', neck && 'bg-accent')}>
                    <span className="flex items-center gap-2 text-[15px] font-bold whitespace-nowrap"><i className="block size-[11px] flex-none rounded-[3px]" style={{ background: C[i] }} />{CIR[i]} {k}<Badge variant="solid" className={cn('ml-0.5 bg-primary/10 px-1.5 text-[12px] leading-[15px] text-primary', neck ? 'visible' : 'invisible')}>병목</Badge></span>
                    <span className={cn(disp, 'text-right text-[min(20px,5cqi)] whitespace-nowrap')}>{f(v[i])}</span>
                    {showDlt ? <span className={cn('text-right text-[14px] whitespace-nowrap tabular-nums phone:hidden', dlt === 0 ? 'text-mute' : dlt > 0 ? 'text-ok' : 'text-warn')}>{dlt === 0 ? '0' : sg(dlt)}</span> : null}
                    <span className={cn('text-right text-[14px] whitespace-nowrap tabular-nums', judged ? 'text-bad' : 'text-mute')}>{judged ? f(ds[i]) : '—'}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className={row2}>
          {middle}

          <Card variant="board" className={ringable(cur.p.includes('p-region'))} render={<section id="p-region" aria-label={`시도 ${L.regions.length}곳`} />}>
            <div className={phead}>
              <h2 className={ptitle} title={`${scope} · 시도는 사업의 시군구 코드 앞 2자리 · 타일 숫자 = 지연 · 주의 · 정상 판정 사업 수 · 바탕색 = 지연율(%) 단계(흰 바탕 = 판정 대상 없음) · 판정은 ${judgedText}`}>시도 {L.regions.length}곳</h2>
              <span data-slot="judge-tag" className={jtag}>{nowTag}</span>
              <div className={phgroup}>
                <span className={legend} title="바탕색 = 지연율(%) 단계 · 숫자 색 = 지연 · 주의 · 정상 판정 사업 수"><span>지연율</span>{RCOL.map((c, i) => <Key key={i} sw={c} className="h-2.5 w-3.5 border border-border">{RLAB[i]}</Key>)}<span className="text-bad">지연</span><span className="text-warn">주의</span><span className="text-ok">정상</span></span>
                <span className={pacts}><PanelLink href={`/area/${curReg.code}`} full={`${sidoName(curReg.code)} 실적(실데이터) 상세`}>{sidoName(curReg.code)} 실적</PanelLink></span>
              </div>
            </div>
            <div className="mx-0 my-2.5 grid flex-auto grid-cols-[repeat(auto-fill,minmax(112px,1fr))] auto-rows-[minmax(0,1fr)] gap-1.5">
              {L.regions.map((r, ri) => {
                const n = sidoName(r.code), rate = r.judged ? r.delay / r.judged * 100 : null;   // 판정된 사업이 없으면 지연율도 없다(중립 색)
                return (
                  <button key={r.code} type="button" data-slot="board-region" className={cn(btn, 'q-rise card-lift flex flex-col justify-between gap-1.5 rounded-[10px] border border-border bg-[var(--rc)] px-[9px] py-2 aria-pressed:border-primary aria-pressed:[box-shadow:0_0_0_1px_var(--primary)]')} aria-pressed={r.code === region} onClick={() => setRegion(r.code)} style={{ ['--rc' as string]: rate === null ? 'var(--card)' : RCOL[rcls(rate)], ['--i' as string]: ri * 0.5 }}
                    title={`${n} · 사업 ${f(r.projects)}건 · 판정 ${f(r.judged)}건 · ` + (rate === null ? '판정 대상 없음' : `지연율 ${rate.toFixed(1)}%`) + (r.code === '12' ? ' · 2026-07부터 광주·전남은 전남광주로 집계됩니다' : '')}
                    aria-label={`${n} 사업 ${f(r.projects)}건 판정 ${f(r.judged)}건 ` + (rate === null ? '판정 대상 없음' : `지연 ${r.delay} 주의 ${r.caution} 정상 ${r.ok} 지연율 ${rate.toFixed(1)}%`)}>
                    <span className="flex items-baseline justify-between gap-1 text-[15px] font-bold text-foreground"><span>{n}</span>{rate === null ? <span className="text-[13px] font-normal text-muted-foreground">{f(r.projects)}건</span> : <span className={cn(disp, 'text-[14px]')}>{rate.toFixed(1)}%</span>}</span>
                    {rate === null
                      ? <span className="text-[13px] text-muted-foreground">판정 대상 없음</span>
                      : <span className={cn(disp, 'flex gap-2 self-start rounded-[7px] bg-card/90 px-2 py-0.5 text-[16px]')}><span className="text-bad">{r.delay}</span><span className="text-warn">{r.caution}</span><span className="text-ok">{r.ok}</span></span>}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5">
          <Card variant="board" className={ringable(cur.p.includes('p-trend'))} render={<section id="p-trend" aria-label="지연·주의 추이" />}>
            <div className={phead}>
              <h2 className={ptitle} title={`지연·주의 호수(호) 추이 · 실적 기준 · 판정 이력은 ${L.observedMonth} 관측부터 쌓인다 · 아래 줄은 선택 시점(${ml(T, Math.min(cursor, NOW))})의 전월 대비 증감(호)`}>지연·주의 추이 <Sample /></h2>
              <span className={cn(legend, 'ml-auto')}><Key sw="var(--bad)" className="h-[3px] w-3.5 rounded-full">지연</Key><Key sw="var(--warn)" className="h-[3px] w-3.5 rounded-full">주의</Key></span>
            </div>
            {/* 패널 폭에 따라 0.6~1배로 줄어 그려진다: 선·격자는 non-scaling-stroke 로 화면 px 굵기를 지킨다(1px 미만 흐림 방지, 계획서 14절 T2) */}
            <svg id="trend" className="mt-1.5 block h-auto w-full" viewBox="0 0 560 200" role="img" aria-label="지연과 주의 호수 추이">
              <line x1="0" y1="55" x2="560" y2="55" stroke="var(--border)" vectorEffect="non-scaling-stroke" /><line x1="0" y1="100" x2="560" y2="100" stroke="var(--border)" vectorEffect="non-scaling-stroke" /><line x1="0" y1="145" x2="560" y2="145" stroke="var(--border)" vectorEffect="non-scaling-stroke" />
              <g className="q-sweep"><polyline points={pts(aw)} fill="none" stroke="var(--warn)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /><polyline points={pts(ad)} fill="none" stroke="var(--bad)" strokeWidth="2.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></g>
              <line x1={tx(cc)} y1="6" x2={tx(cc)} y2="194" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <circle cx={tx(cc)} cy={ty(ip(ad, cc, NOW))} r="4.5" fill="var(--bad)" /><circle cx={tx(cc)} cy={ty(ip(aw, cc, NOW))} r="4.5" fill="var(--warn)" />
            </svg>
            <div className={cn(sub, 'flex justify-between')}><span>{ml(T, 0)}</span><span>{ml(T, NOW)}</span></div>
            <div className="mt-1.5 text-[14px] text-ink2"><Reserve live={txTrend(T, cursor)} list={RANGE.map((m) => txTrend(T, m))} /></div>
          </Card>

          <Card variant="board" className={ringable(cur.p.includes('p-fut'))} render={<section id="p-fut" aria-label="향후 12개월 공급 예정" />}>
            <div className={phead}>
              <h2 className={ptitle} title={`${scope} · 준공 예정 월별(호) · 준공 실제 기록이 없는 사업의 현재 예정 준공 달(같은 사업은 한 번) · LH 후보의 예정일은 파일 기준일(${real.lhAsOf}) 값으로, 실적 자료보다 ${real.lhAgeMonths}개월 묵었습니다 · 지난 시점의 준공 실적은 월 상세·지역별 화면에서 봅니다`}>향후 12개월 공급 예정</h2>
              <span className={pacts}><PanelLink href="/agency/lh" full="LH 준공 예정 상세">LH 상세</PanelLink></span>
            </div>
            <svg id="fmonths" className="mt-3 block min-h-[76px] w-full flex-[1_1_76px]!" viewBox="0 0 240 100" preserveAspectRatio="none" role="img" aria-label={`${ymDot(up[0].ym)}부터 ${ymDot(up[up.length - 1].ym)}까지 월별 준공 예정 호수(원장 사업 ${f(L.scope.projects)}건, ${nation})`}>
              <defs><linearGradient id="fm-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: `color-mix(in srgb, ${C[4]} 66%, var(--rb-hi))` }} /><stop offset="1" style={{ stopColor: C[4] }} /></linearGradient></defs>
              {up.map((m, i) => { const h = m.units / maxUp * 92; return <rect key={m.ym} x={i * 20 + 1.5} y={(100 - h).toFixed(1)} width="17" height={Math.max(h - 0.6, 0.4).toFixed(1)} fill="url(#fm-g)" className="q-grow-y" style={{ ['--i' as string]: i }}><title>{`${m.ym.replace('-', '.')} 준공 예정 ${f(m.units)}호 · ${m.projects}사업`}</title></rect>; })}
              <rect x={fi * 20 + 0.5} y="1" width="20" height="99" fill="none" stroke="var(--foreground)" strokeWidth="2" style={{ vectorEffect: 'non-scaling-stroke' }} visibility={hasFut ? 'visible' : 'hidden'} />
            </svg>
            <div className={cn(sub, 'mt-[3px] flex justify-between')}><span>{ymDot(up[0].ym)}</span><span>{ymDot(up[(up.length - 1) >> 1].ym)}</span><span>{ymDot(up[up.length - 1].ym)}</span></div>
            <div className="mt-2 text-[14px] text-ink2"><Reserve live={futRead} list={futList} /></div>
            <p className={cn(sub, 'mt-1.5')}>12개월 합 {f(up.reduce((n, m) => n + m.units, 0))}호 · {up.reduce((n, m) => n + m.projects, 0)}사업</p>
          </Card>

          <Card variant="board" className={ringable(cur.p.includes('p-agency'))} render={<section id="p-agency" aria-label="기관별 진행" />}>
            <div className={phead}>
              <h2 className={ptitle} title={`${scope} · 막대는 기관별 정상·주의·지연·판정 밖 호수(판정된 사업의 물량) · 오른쪽 = 지연 호수 · 전체 지연 ${f(J.delay.units)}호 중 비중 · 판정 밖: ${outNote}`}>기관별 진행</h2>
              <div className={phgroup}>
                <span className={legend} title="막대 색: 정상 · 주의 · 지연 · 판정 밖 호수">{[['bg-ok', '정상'], ['bg-warn', '주의'], ['bg-bad', '지연'], ['bg-pn2', '판정 밖']].map(([c, n]) => <Key key={n} className={c} under>{n}</Key>)}</span>
                <span className={pacts}><PanelLink href="/agency" full="기관별 실데이터(시행주체별 호수)">시행주체별</PanelLink></span>
              </div>
            </div>
            {/* 판정 달: 이 카드의 제목 줄은 1280px 에서 남는 폭이 없어(제목·범례·이동 버튼으로 꽉 참) 제목 줄 바로 아래 오른쪽(지연 호수 칸 위)에 둔다 */}
            <span data-slot="judge-tag" className={cn(jtag, 'mt-1 -mb-1.5 self-end')}>{nowTag}</span>
            <div className={ags}>
              {L.agencies.filter((a) => a.projects).map((a, ai) => {
                const out = a.units - a.okUnits - a.cautionUnits - a.delayUnits, pw = (n: number) => `${(n / a.units * 100).toFixed(1)}%`;   // out = 판정 밖 호수(LH 후보·예정 없는 사업)
                return (
                  <div key={a.id} className={cn(ag, agRow)} title={`${a.name} ${f(a.units)}호 — 정상 ${f(a.okUnits)} · 주의 ${f(a.cautionUnits)} · 지연 ${f(a.delayUnits)} · 판정 밖 ${f(out)}호${a.excludedUnits ? `(판정 제외 ${f(a.excludedUnits)}호)` : ''}. ${a.id === 'unknown' ? `사업 ${f(a.projects)}건 — ` : ''}${a.note}${a.id === 'unknown' ? `. 판정 밖: ${outNote}` : ''}`}>
                    <div className={agName}><b>{a.name}</b><span className="text-[14px] font-normal text-muted-foreground">{f(a.units)}호</span></div>
                    <div className={cn(bar3, 'q-grow-x h-3')} style={{ ['--i' as string]: ai }} role="img" aria-label={`${a.name} ${f(a.units)}호: 정상 ${f(a.okUnits)} 주의 ${f(a.cautionUnits)} 지연 ${f(a.delayUnits)} 판정 밖 ${f(out)}`}>
                      <span className="block bg-ok" style={{ width: pw(a.okUnits) }} /><span className="block bg-warn" style={{ width: pw(a.cautionUnits) }} /><span className="block bg-bad" style={{ width: pw(a.delayUnits) }} /><span className="block bg-pn2" style={{ width: pw(out) }} />
                    </div>
                    <div className={agVal}><b className={cn(disp, 'text-bad')}>{f(a.delayUnits)}</b><span className="text-[14px] text-muted-foreground">· {J.delay.units ? Math.round(a.delayUnits / J.delay.units * 100) : 0}%</span></div>
                  </div>
                );
              })}
              {emptyAgencies.length ? <div className={cn(ag, agRow)}><div className="col-span-full min-w-0 text-[14px] text-muted-foreground"><b className="text-[15px] font-bold text-foreground">{emptyAgencies.map((a) => a.name).join(' · ')}</b> — 원장에 사업 없음</div></div> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
