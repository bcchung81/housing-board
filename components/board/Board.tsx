'use client';
/* 종합상황판(/) — 시안 이식. 시안의 동작(지시 6건 순환·월별 리본 차트·재생·시점 이동·범례 강조·시도)을 그대로 두고,
   월별 공급 파동·선택 시점 판정·시도·기관별 진행·향후 12개월은 사업 원장 집계(data/board/ledger-board.json — 원장 2026-10 기준)를 그린다.
   지연·주의 추이·선택 달 판정·리본의 지연 띠는 집계의 월 판정 이력(trend: 2025.01~2026.09 건축HUB 과거 판 소급, 2026.10부터 월 관측)을 쓴다 — trend 가 없는 옛 집계는 기준 달만 판정.
   총리 지시 6건 카드는 실데이터(lib/board/directives.ts).
   카드에는 숫자·단위·짧은 이름만 보이고, 기준·범위·규칙 설명은 카드 제목(h2)의 title 에 둔다(2026-10-11 사용자 지시: 실데이터 표지 제거·범례는 제목 줄에·서술 최소화).
   실데이터 위젯(월별 실적 흐름)은 서버 컴포넌트(RealPanels)를 middle 로 받아 시도 카드와 같은 줄에 둔다. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  C, CIR, K, PX0, RCOL, REGION_POS, RLAB, VW,
  addedMarks, apart, axisUnit, delayAt, delaysOf, f, flatTotal, judgedAt, judgmentsOf, kind, ml, rcls, ribbonOf, sg, timelineOf, trendAt, trendMax, trendOf,
} from '../../lib/board/sample';
import { CAND_TEXT, candText, ledgerJudged, ledgerMix, makeDirectives, nation as nationOf } from '../../lib/board/directives';
import { AHEAD_COMPLETION, AGENCY_NAME, bottleneckOf } from '../../lib/board/projects-view';
import { dotDates } from '../../lib/grid/spec';
import type { LedgerBoard } from '../../lib/board/types';
import { cn } from 'cn';
import { sub } from '../page';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { CUR, HOVER, RIBBON, chartStatic, ribbonDynamic } from './ribbon';
import { Key } from './tags';
import PanelLink from './PanelLink';
import MapLink from './MapLink';
import { mapScopeHref } from '../../lib/board/map-href';
import { ag, agName, agVal, ags, bar3, btn, disp, jtag, legend, pacts, phead, phgroup, ptitle, row2 } from './styles';

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

  const DIR = useMemo(() => makeDirectives({ sourceCount: real.sourceCount, stageNames: K, ledger: real.ledger, start: real.start, bottleneck: bottleneckOf }), [real.sourceCount, real.ledger, real.start]);
  const valid = useMemo(() => new Set(real.validMonths), [real.validMonths]);
  /* 달마다 판정(판정 없는 달 null)과 단계별 지연 호수 */
  const JS = useMemo(() => judgmentsOf(L), [L]), DL = useMemo(() => delaysOf(JS), [JS]), TR = useMemo(() => trendOf(T, JS), [T, JS]);
  const rib = useMemo(() => ribbonOf(T, L.stageUnits, DL), [T, L, DL]);
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

  /* 선택 시점의 값. 단계 호수·증감은 선택 시점을 따르고(증감 = 선택 − 기준 달), 판정 값은 선택 시점 이하의 가장 늦은 판정 달(jm, 이력 달 또는 기준 달)의 값이다 — 판정 달이 없으면 판정 없음 */
  const v = L.stageUnits[cursor], nv = L.stageUnits[NOW], jm = judgedAt(T, cursor), judged = jm >= 0, SJ = JS[judged ? jm : NOW]!, ds = delayAt(T, DL, cursor), bk = bottleneckOf(SJ.delayByStage)?.i ?? -1;   // 병목: 사업 화면 '어디서 막혀 있는가'와 같은 계산(projects-view bottleneckOf)
  const planned = (m: number) => kind(T, m) === '예정 기준', showDlt = cursor !== NOW;
  const jTag = judged ? `${ml(T, jm)} 판정` : '판정 없음', showJTag = jm !== cursor;
  /* 판정 범위(D3): candidate 가 있는 판정 행은 사업 번호가 있는 사업만(후보는 확인 필요로 따로), 없는 행(소급 이력)은 후보 포함 */
  const scopeFrom = T.judged.find((m) => JS[m]?.candidate), mixed = judged && !SJ.candidate && scopeFrom !== undefined;   // 판정 달 꼬리표는 선택 달과 판정 달이 다를 때만(예정 달 → 기준 달 판정, 판정 없는 달 → 판정 없음)
  const ymKo = (m: number) => `${T.months[m].slice(0, 4)}년 ${Number(T.months[m].slice(5))}월`, ymDot = (ym: string) => ym.replace('-', '.');
  const J = L.judgment, d = SJ.delay.units, w = SJ.caution.units, ok = SJ.ok.units, tt = d + w + ok, pct = (x: number) => (x / tt * 100).toFixed(1) + '%';   // J = 기준 달 판정(기관 카드), d·w·ok = 선택 달 판정
  /* 원장 범위: 카드 제목의 title 에 보인다(일부가 전국처럼 보이지 않게) */
  const nation = nationOf(L);
  const scope = `원장 ${ymDot(L.observedMonth)} 기준 · 사업 ${f(L.scope.projects)}건(${ledgerMix(L)}) · ${nation} · ${real.ledgerOrigin === 'supabase' ? `출처 Supabase(api.board, ${real.ledgerMonth})` : '출처 JSON 대체'}`;
  /* 지연·주의 추이: 판정이 있는 달(0 … NOW)의 호수. 세로 맨 위(tmax)는 이력 최댓값에 맞춘다(눈금선 3개 = 4등분). 선은 viewBox 560×TH(세로 px 그대로), 점·이름표는 같은 좌표를 퍼센트·px 로 얹은 HTML */
  const TH = 168, TPT = 10, TPH = TH - 20, TLBL = 120;   // TLBL = 오른쪽 이름표 칸 폭(px)
  const tmax = trendMax(Math.max(0, ...TR.flatMap((r) => (r ? [r.d, r.w] : [])))), cc = Math.min(cursor, NOW), ct = TR[judgedAt(T, cc)] ?? null, tsel = trendAt(T, TR, cursor);
  const tx = (m: number) => (m * 560 / NOW).toFixed(1), tpc = (m: number) => `${(m / NOW * 100).toFixed(2)}%`;
  const tyn = (val: number) => TPT + TPH - val / tmax * TPH, ty = (val: number) => tyn(val).toFixed(1);
  const pts = (k: 'd' | 'w') => TR.flatMap((r, m) => (r ? [tx(m) + ',' + ty(r[k])] : [])).join(' ');
  const t0 = T.judged[0], tf = TR[t0] ?? null, te = TR[judgedAt(T, NOW)] ?? { d: 0, w: 0 };
  const [eyD, eyW] = apart(tyn(te.d), tyn(te.w), 36, TH - 18), [syD, syW] = apart(tyn(tf?.d ?? 0), tyn(tf?.w ?? 0), 16, TH);   // 이름표 겹침 방지: 아래쪽을 내린다
  const AM = addedMarks(JS, NOW), amSel = AM.find((a) => a.m === judgedAt(T, cc)), amTip = (a: { m: number; sources: string[] }) => `${ml(T, a.m)} 원천 추가: ${a.sources.join('·')} — 이전 달과 직접 비교 주의`;
  const up = L.upcoming, fi = cursor - NOW, hasFut = fi >= 0 && fi < up.length;
  const maxUp = Math.max(1, ...up.map((m) => m.units)), upSum = up.reduce((n, m) => n + m.units, 0), upProj = up.reduce((n, m) => n + m.projects, 0), UPH = 82;   // UPH = 막대 최대 높이(viewBox 100 중, 위 18은 선택 값 자리)
  const cur = DIR[focus - 1];
  const sidoName = (code: string) => real.sido[code] ?? code;
  const curReg = L.regions.find((r) => r.code === region)!;
  const curRegMap = mapScopeHref({ sido: curReg.code });   // 수도권 시도만 지도 연결(그 밖은 null)
  const judgedNames = L.regions.filter((r) => r.judged).map((r) => sidoName(r.code)).join('·');
  const judgedText = L.regions.every((r) => r.judged) ? `${L.regions.length}개 시도 모두` : `${judgedNames}만`;
  const emptyAgencies = L.agencies.filter((a) => !a.projects);
  const outNote = L.agencies.find((a) => a.id === 'lh')?.note;   // 판정 밖(LH 후보)의 사유
  const monthLink = valid.has(T.months[cursor]) ? `/month/${T.months[cursor]}` : null;
  const tipView = tip ? tipOf(tip.m) : null;
  function tipOf(m: number) {
    const vv = L.stageUnits[m], dd = delayAt(T, DL, m), b = bottleneckOf(dd)?.i ?? 0, tj = judgedAt(T, m);
    return { m, vv, dd, b, tj: tj >= 0 ? JS[tj] : null };
  }

  return (
    <div className="[&_:focus-visible]:[outline-offset:2px] [&_:focus-visible]:[outline:2px_solid_var(--primary)] motion-reduce:[&_*]:animate-none! motion-reduce:[&_*]:transition-none!">
      <div className="board-desktop mx-auto max-w-[1440px] px-7 pb-9 mobile:px-3 mobile:pb-6 mobile:[&_[data-slot=card]]:px-3.5 mobile:[&_[data-slot=card]]:pt-3.5 mobile:[&_[data-slot=card]]:pb-4">
        <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 pt-4 pb-3">
          <h1 className="m-0 font-display text-[28px] leading-[1.2] font-normal tracking-[-0.03em] text-foreground mobile:text-[22px]">주택공급 종합상황판</h1>
          <span className={cn(sub, 'ml-auto whitespace-nowrap mobile:ml-0 mobile:text-[13px]')} title={`원장 위젯은 ${scope}입니다. 실적(통계누리) 자료는 ${real.actualMonth.replace('-', '.')}까지입니다.`}>원장 {L.referenceDate.replace(/-/g, '.')} · 실적 {real.actualMonth.replace('-', '.')}</span>
        </header>

        <section aria-label="총리 지시 6건">
          <div className="grid grid-cols-2 gap-2 min-[901px]:grid-cols-3 min-[1101px]:grid-cols-6">
            {DIR.map((x, i) => (
              <button key={i} type="button" data-slot="board-dir" title={`${x.date} 지시 · ${x.t}\n${x.basis}`} style={{ ['--i' as string]: i }} className={cn(btn, 'q-rise card-lift group/dir @container relative flex h-20 min-w-0 flex-col justify-center gap-[3px] overflow-hidden rounded-[12px] border border-border bg-card px-3.5 aria-pressed:border-primary aria-pressed:bg-accent', hoverBg)} aria-pressed={i === focus - 1} onClick={() => { setFocus(i + 1); setTour(false); }}
                aria-label={`${x.date} 지시 ${x.t}: ${x.m}${x.sub ? `, ${x.sub.text}` : ''}`}>
                <span className="block min-w-0 truncate text-[min(14px,8.5cqi)] leading-5 whitespace-nowrap text-muted-foreground">{x.t}</span>
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-[min(6px,3cqi)] leading-[1.2] whitespace-nowrap">{/* 값이 칸보다 길면 보조 값이 아랫줄로 내려간다 */}
                  {x.pre ? <span className="text-[min(14px,9cqi)] font-bold text-ink2">{x.pre}</span> : null}
                  <span className={cn(disp, 'font-normal text-[min(26px,12cqi)] leading-[1.15] group-aria-pressed/dir:text-primary')}>{x.big}<span className="text-[min(17px,8cqi)]">{x.u}</span></span>
                  {x.sub ? <span className={cn('text-[min(14px,9cqi)] font-bold', x.sub.tone === 'ok' ? 'text-ok' : x.sub.tone === 'bad' ? 'text-bad' : 'text-warn')}>{x.sub.text}</span> : null}
                </span>
                <span className="absolute bottom-0 left-0 h-[3px] w-0 bg-primary [transition:width_.9s_linear]" style={{ width: i === focus - 1 && tour ? `${(((tick % 7) + 1) / 7 * 100).toFixed(0)}%` : '0' }} />
              </button>
            ))}
          </div>
        </section>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_400px] items-stretch gap-3.5 narrow:grid-cols-1">
          <Card variant="board" className={ringable(cur.p.includes('p-chart'))} render={<section id="p-chart" aria-label="월별 공급 파동" />}>
            <div className="mb-2 flex flex-wrap items-center gap-3.5">
              <h2 className={ptitle} title={`${scope} · 달 말 단계별 호수 · ${ml(T, T.actual)}까지 실제 날짜(호수가 가장 많은 원천의 자료 달), 이후 현재 예정(빗금) · 세로축 ${axisUnit(rib)} · 기준 ${ml(T, NOW)} · 붉은 띠 = 단계별 지연 호수(${ml(T, T.judged[0])} 판정부터) · 병목(지연 호수가 가장 큰 단계)은 달에 마우스를 올리면 보입니다${flatTotal(rib) ? ` · 총량 매달 ${f(rib.total[0])}호(같은 사업이 단계만 옮겨 감)` : ''}`}>월별 공급 파동</h2>
              <div data-slot="board-legend" className="ml-auto flex flex-wrap gap-0.5" role="group" aria-label="단계 범례 (누르면 해당 단계를 강조)">
                {K.map((k, i) => <button key={k} type="button" className={cn(btn, 'flex items-center gap-1.5 rounded-full border border-transparent px-2 py-[3px] text-[14px] [transition:background_.15s,border-color_.15s] aria-pressed:border-primary aria-pressed:bg-accent', hoverBg)} aria-pressed={hl === i} onClick={() => setHl(hl === i ? -1 : i)}><i className="block size-2.5 flex-none rounded-[3px]" style={{ background: C[i] }} />{k}</button>)}
                <span className="flex items-center gap-1.5 border border-transparent px-2 py-[3px] text-[14px]" title={`붉은 띠 = 단계별 지연 호수(${ml(T, T.judged[0])} 판정부터)`}><i className="block size-2.5 flex-none rounded-[3px] bg-[var(--rb-band)]" />지연</span>
              </div>
            </div>
            {/* 좁은 화면에서만 가로로 민다. 세로는 숨긴다: overflow-x 가 auto 면 세로도 auto 가 되어, 툴팁·소수점 높이로 1px 만 넘쳐도 세로 스크롤바가 생기고 그 폭만큼 차트가 다시 줄어 그림이 흔들렸다 */}
            <div className="overflow-x-auto overflow-y-hidden rounded-[10px]">
            <div className="relative min-w-[760px] cursor-pointer rounded-[10px] border border-border bg-chartbg [touch-action:pan-y] mobile:min-w-0" ref={wrapRef} data-intro={intro || undefined}
              onPointerMove={(e) => { const m = monthAt(e.clientX); if (m < 0) setTip(null); else { const wr = wrapRef.current!.getBoundingClientRect(); setTip({ m, x: e.clientX - wr.left, y: e.clientY - wr.top }); } }}
              onPointerLeave={() => setTip(null)}
              onClick={(e) => { const m = monthAt(e.clientX); if (m >= 0) goto(m); }}>
              <svg id="chart" shapeRendering="geometricPrecision" ref={svgRef} className="block h-auto w-full [&_text]:[font-family:inherit]" viewBox="0 0 960 400" role="img" aria-label={`${ymKo(0)}부터 ${ymKo(LAST)}까지 원장 사업 ${f(L.scope.projects)}건의 달 말 단계별 호수를 쌓은 월별 리본(${nation}). 바닥부터 쌓은 높이(세로축, 호)가 그 달 총량이고, 층 안의 붉은 띠가 ${ml(T, T.judged[0])} 판정부터의 단계별 지연 호수입니다. 차트를 누르면 그 달을 고릅니다.`}>
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
                      {tipView.tj ? <>
                        <div className={tipRow}><span className={cn(tipRowKey, 'text-bad')}>지연</span><b className={disp}>{f(tipView.tj.delay.units)}</b></div><div className={tipRow}><span className={cn(tipRowKey, 'text-warn')}>주의</span><b className={disp}>{f(tipView.tj.caution.units)}</b></div>
                        <div className={tipRow}><span className={cn(tipRowKey, 'text-primary')}>병목 · {K[tipView.b]}</span><b className={disp}>{f(tipView.dd[tipView.b])}</b></div>
                      </> : <div className={cn(tipRow, 'text-muted-foreground')}>판정은 {ml(T, T.judged[0])}부터</div>}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            </div>
          </Card>

          <Card variant="board" className="@container" render={<section id="p-snap" aria-label="선택 시점의 판정과 단계별 호수" />}>
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <h2 className={cn(ptitle, 'text-[26px]')} title={`${scope} · 단계 호수는 선택 달, 증감 = 선택 달 − 기준 달(${ml(T, NOW)}) · 판정은 선택 달 이하의 가장 늦은 판정 달(${ml(T, T.judged[0])}~${ml(T, NOW)}, ${ml(T, NOW)} 뒤 달은 ${ml(T, NOW)} 판정) · 판정 기준일 ${dotDates(SJ.referenceDate)} · 지연 = 현재 예정일 경과 ${L.judge.delayMonths}개월 이상, 주의 = ${L.judge.cautionMonths}~${L.judge.delayMonths}개월 · ${ledgerJudged(L)}`}>{ml(T, cursor)}</h2>
              <Badge variant="solid" className={planned(cursor) ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'}>{kind(T, cursor)}</Badge>
              <span className={pacts}>{bk >= 0 ? <PanelLink href={`/projects?stage=${bk}&status=check`} full={`병목 단계(${CIR[bk]} ${K[bk]})의 점검 필요 사업(전국)`}>병목 단계</PanelLink> : null}{monthLink ? <PanelLink href={monthLink} full={`${ml(T, cursor)} 월 상세`}>{Number(T.months[cursor].slice(5))}월</PanelLink> : null}</span>
            </div>
            <div>
              {/* 판정 달 꼬리표는 막대 오른쪽에, 선택 달과 판정 달이 다를 때만(제목 줄은 '예정 기준' 표지와 이동 링크로 폭이 없다) */}
              <div className="flex items-center gap-2">
                <div className="q-grow-x flex h-3.5 min-w-0 flex-auto gap-0.5 overflow-hidden bg-pn2 [&>span]:block [&>span]:h-full [&>span]:min-w-0" role="img" aria-label={judged ? `${jTag}: 전체 ${f(tt)}호 중 지연 ${pct(d)}, 주의 ${pct(w)}, 정상 ${pct(ok)}` : '판정 없음'}>
                  {judged ? <><span className="bg-bad" style={{ width: `${(d / tt * 100).toFixed(2)}%` }} /><span className="bg-warn" style={{ width: `${(w / tt * 100).toFixed(2)}%` }} /><span className="bg-ok" style={{ width: `${(ok / tt * 100).toFixed(2)}%` }} /></> : null}
                </div>
                {showJTag ? <span data-slot="judge-tag" className={cn(jtag, 'flex-none leading-none')}>{jTag}</span> : null}
                {mixed ? <span data-slot="judge-tag" className={cn(jtag, 'flex-none leading-none')} title={`이 달 판정은 소급 이력이라 사업 번호가 없는 후보를 포함합니다 — ${ml(T, scopeFrom!)}부터 판정은 번호가 있는 사업만(후보는 ${CAND_TEXT}로 따로)`}>후보 포함</span> : null}
                <span data-slot="basis-tag" className="flex-none text-[12px] leading-none whitespace-nowrap text-muted-foreground" title="막대·비율 = 지연·주의·정상 판정 사업의 계획 호수 비율(호수 기준) — 시도 타일의 지연율은 건수 기준">호수 기준</span>
              </div>
              {/* 판정 없는 달은 숫자 대신 '—'(칸 높이는 그대로라 달을 옮겨도 표가 흔들리지 않는다) */}
              <div className="mt-[9px] grid grid-cols-3 gap-2">
                {([['지연', 'bad', d, SJ.delay.projects], ['주의', 'warn', w, SJ.caution.projects], ['정상', 'ok', ok, SJ.ok.projects]] as const).map(([name, tone, n, np]) => (
                  <div key={name} className="min-w-0">
                    <div className="flex items-center gap-[5px] text-[13px] whitespace-nowrap text-muted-foreground"><i className={cn('block size-2 flex-none rounded-[2px]', tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-ok')} />{name}<em className={cn('font-bold text-foreground not-italic tabular-nums', !judged && 'invisible')}>{pct(n)}</em></div>
                    <b className={cn('mt-px block font-display text-[min(22px,6.2cqi)] leading-[1.2] whitespace-nowrap tabular-nums', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ok', !judged && 'text-mute')}>{judged ? <>{f(n)}<small className="ml-0.5 [font-family:inherit] text-[13px] font-normal">호</small></> : '—'}</b>
                    <div className={cn('text-[13px] whitespace-nowrap text-muted-foreground tabular-nums', !judged && 'text-mute')}>{judged ? `${f(np)}건` : '—'}</div>
                  </div>
                ))}
              </div>
              {judged && SJ.candidate ? (
                <div data-slot="board-cand" className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground tabular-nums" title={`사업 번호가 없는 후보(건축HUB 원천 예정일 기준)는 같은 판정 계산을 하되 지연·주의·정상에 넣지 않고 따로 셉니다 — 이미 준공했는데 대장과 연결되지 않았을 수 있습니다 · ${candText(SJ.candidate)}건`}>
                  <span className="whitespace-nowrap"><b className="font-bold text-foreground">{CAND_TEXT}</b> {f(SJ.candidate.ok.projects + SJ.candidate.caution.projects + SJ.candidate.delay.projects)}건</span>
                  <span className="whitespace-nowrap">{candText(SJ.candidate)}</span>
                  <span className="ml-auto"><PanelLink href="/projects?sido=all&status=review" full={`${CAND_TEXT} 사업 목록(전국)`}>후보 목록</PanelLink></span>
                </div>
              ) : null}
            </div>
            {/* 증감 칸은 선택 달이 기준 달이 아닐 때만(기준 달이면 3칸) */}
            <div className={cn('mt-3 grid flex-auto grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-x-3', showDlt ? 'grid-cols-[minmax(0,1fr)_max-content_max-content_max-content] phone:grid-cols-[minmax(0,1fr)_max-content_max-content]' : 'grid-cols-[minmax(0,1fr)_max-content_max-content]')} aria-label={showDlt ? '단계별 호수, 기준 달 대비 증감, 지연 호수' : '단계별 호수, 지연 호수'}>
              <div className="col-span-full grid grid-cols-subgrid items-center px-1.5 pb-0.5 text-[13px] text-muted-foreground">
                <span /><span className="text-right">호수</span>{showDlt ? <span className="text-right phone:hidden">증감</span> : null}<span className="text-right">지연</span>
              </div>
              {K.map((k, i) => {
                const dlt = v[i] - nv[i], neck = judged && i === bk;
                return (
                  <div key={k} className={cn('col-span-full grid flex-auto grid-cols-subgrid items-center rounded-[6px] border-b border-border px-1.5 py-0.5 last:border-b-0', neck && 'bg-accent')}>
                    <span className="flex items-center gap-2 text-[15px] font-bold whitespace-nowrap"><i className="block size-[11px] flex-none rounded-[3px]" style={{ background: C[i] }} />{CIR[i]} {k}<Badge variant="solid" className={cn('ml-0.5 bg-primary/10 px-1.5 text-[12px] leading-[15px] text-primary', neck ? 'visible' : 'invisible')}>병목</Badge></span>
                    <span className={cn(disp, 'text-right text-[min(20px,5.6cqi)] whitespace-nowrap', !v[i] && 'text-muted-foreground')}>{f(v[i])}</span>
                    {showDlt ? <span className={cn('text-right text-[14px] whitespace-nowrap tabular-nums phone:hidden', dlt === 0 ? 'text-mute' : dlt > 0 ? 'text-ok' : 'text-warn')}>{dlt === 0 ? '0' : sg(dlt)}</span> : null}
                    <span className={cn('text-right text-[14px] whitespace-nowrap tabular-nums', judged && ds[i] ? 'text-bad' : judged ? 'text-muted-foreground' : 'text-mute')}>{judged ? f(ds[i]) : '—'}</span>
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
              <h2 className={ptitle} title={`${scope} · 시도는 사업의 시군구 코드 앞 2자리 · 큰 숫자 = 지연율(지연 ÷ 판정 사업, 판정은 사업 번호가 있는 사업만 — 후보는 ${CAND_TEXT}로 따로) · 아래 막대 = 지연 · 주의 · 정상 판정 사업 비율 · 바탕색 = 지연율 구간(${RLAB.join(' / ')}%, 흰 바탕 = 판정 대상 없음) · 건수는 타일에 마우스를 올리면 보입니다 · 판정은 ${judgedText}`}>시도 {L.regions.length}곳</h2>
              <span className={cn(legend, 'ml-auto flex-nowrap gap-x-1.5')}><span title="지연율 = 지연 사업 수 ÷ 판정 사업 수(건수 기준)">지연율 · 건수 기준</span><span>0</span><span className="flex h-2.5 overflow-hidden rounded-[2px] border border-border" title={`지연율 구간: ${RLAB.join(' / ')}%`}>{RCOL.map((c, i) => <i key={i} className="block w-4" style={{ background: c }} />)}</span><span>30%+</span></span>
            </div>
            <div className="mt-3 grid flex-1 auto-rows-[minmax(60px,1fr)] grid-cols-4 gap-1.5 mobile:auto-rows-[minmax(54px,1fr)] mobile:gap-1">
              {L.regions.map((r, ri) => {
                const n = sidoName(r.code), rate = r.judged ? r.delay / r.judged * 100 : null, pos = REGION_POS[r.code];   // 판정된 사업이 없으면 지연율도 없다(중립 색)
                return (
                  <button key={r.code} type="button" data-slot="board-region" className={cn(btn, 'q-rise card-lift flex flex-col justify-between gap-1 min-w-0 @container rounded-[10px] border border-border bg-[var(--rc)] px-2.5 pt-2 pb-[9px] mobile:px-[7px] mobile:pt-1.5 mobile:pb-[7px] aria-pressed:border-primary aria-pressed:[box-shadow:0_0_0_1px_var(--primary)]')} aria-pressed={r.code === region} onClick={() => setRegion(r.code)} style={{ ['--rc' as string]: rate === null ? 'var(--card)' : RCOL[rcls(rate)], ['--i' as string]: ri * 0.5, ...(pos ? { gridArea: `${pos[0]} / ${pos[1]}` } : {}) }}
                    title={`${n} · 사업 ${f(r.projects)}건 · 판정 ${f(r.judged)}건 · ` + (rate === null ? '판정 대상 없음' : `지연율 ${rate.toFixed(1)}% · 지연 ${r.delay} · 주의 ${r.caution} · 정상 ${r.ok}`) + (r.candidate?.judged ? ` · ${CAND_TEXT} ${f(r.candidate.judged)}건(계산하면 지연 ${f(r.candidate.delay)} · 주의 ${f(r.candidate.caution)} · 정상 ${f(r.candidate.ok)} — 판정에 넣지 않음)` : '') + (r.code === '12' ? ' · 2026.07부터 광주·전남은 전남광주로 집계됩니다' : '')}
                    aria-label={`${n} 사업 ${f(r.projects)}건 판정 ${f(r.judged)}건 ` + (rate === null ? '판정 대상 없음' : `지연 ${r.delay} 주의 ${r.caution} 정상 ${r.ok} 지연율 ${rate.toFixed(1)}%`) + (r.candidate?.judged ? ` ${CAND_TEXT} ${f(r.candidate.judged)}건` : '')}>
                    <span className="flex items-baseline justify-between gap-1.5 @max-[105px]:flex-col @max-[105px]:items-start @max-[105px]:gap-0.5">
                      <span className="text-[15px] leading-[1.25] font-bold whitespace-nowrap text-foreground @max-[105px]:text-[13px]">{n}</span>
                      <span className={cn(disp, 'text-[22px] leading-none whitespace-nowrap @max-[105px]:text-[18px]')}>{rate === null ? '—' : <>{rate.toFixed(1)}<small className="text-[14px] @max-[105px]:text-[12px]">%</small></>}</span>
                    </span>
                    <span className="flex h-1.5 gap-px bg-[color-mix(in_srgb,var(--card)_70%,transparent)] [&>span]:block [&>span]:h-full [&>span]:min-w-[3px] [&>span]:flex-none" aria-hidden="true">
                      {rate === null ? null : ([[r.delay, 'bg-bad'], [r.caution, 'bg-warn'], [r.ok, 'bg-ok']] as const).map(([cnt, c]) => cnt ? <span key={c} className={c} style={{ flex: `${cnt} 1 0` }} /> : null)}
                    </span>
                  </button>
                );
              })}
              <div data-slot="board-region-sum" aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-border bg-card px-3.5 py-2 [grid-area:5/2/6/5] mobile:gap-x-2.5 mobile:gap-y-0.5 mobile:px-2 mobile:py-1.5">
                <b className="text-[15px]">{sidoName(curReg.code)}</b>
                <span className="flex gap-2.5 text-[14px] whitespace-nowrap text-muted-foreground mobile:gap-1.5 mobile:text-[13px]"><span>지연<strong className="ml-[3px] text-bad">{f(curReg.delay)}</strong></span><span>주의<strong className="ml-[3px] text-warn">{f(curReg.caution)}</strong></span><span>정상<strong className="ml-[3px] text-ok">{f(curReg.ok)}</strong></span><span>건</span>{curReg.candidate?.judged ? <span title={`사업 번호가 없는 후보 — 같은 계산을 하되 판정에 넣지 않음 · 계산하면 지연 ${f(curReg.candidate.delay)} · 주의 ${f(curReg.candidate.caution)} · 정상 ${f(curReg.candidate.ok)}`}>· 확인 필요<strong className="ml-[3px] text-foreground">{f(curReg.candidate.judged)}</strong></span> : null}</span>
                <span className={cn(pacts, 'mobile:ml-0')}><PanelLink href={`/region?sido=${curReg.code}`} full={`${sidoName(curReg.code)} 실적(실데이터) 상세`}>{sidoName(curReg.code)} 실적</PanelLink>{curRegMap ? <MapLink href={curRegMap} full={`${sidoName(curReg.code)} 지도에서 보기`} /> : null}</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5">
          <Card variant="board" className={ringable(cur.p.includes('p-trend'))} render={<section id="p-trend" aria-label="지연·주의 추이" />}>
            <div className={phead}>
              <h2 className={ptitle} title={`지연·주의 호수(호) · 2025.01~2026.09 건축HUB 과거 판 소급 판정 · 2026.10부터 월 관측 · 이름표 = 선택 달 값과 전월 대비 증감(원천이 추가된 달은 판정 대상이 바뀌어 '비교 불가')${scopeFrom !== undefined ? ` · ${ml(T, scopeFrom)}부터 사업 번호가 있는 사업만 판정(그 앞 달 소급 판정은 후보 포함 — 직접 비교 주의)` : ''}`}>지연·주의 추이</h2>
            </div>
            {/* 선·격자는 non-scaling-stroke 로 화면 px 굵기를 지키고(1px 미만 흐림 방지, 계획서 14절 T2), 점·글자는 선 위에 겹친 HTML 이라 폭이 줄어도 크기가 그대로다 */}
            <div className="mt-3 flex" style={{ height: TH }}>
              <div className="relative min-w-0 flex-1">
                <svg id="trend" className="absolute inset-0 size-full" viewBox={`0 0 560 ${TH}`} preserveAspectRatio="none" role="img" aria-label={`지연과 주의 호수 추이, ${ml(T, t0)}부터 ${ml(T, NOW)}까지. ${tf ? `${ml(T, t0)} 지연 ${f(tf.d)}호, 주의 ${f(tf.w)}호. ` : ''}${tsel ? (amSel ? `${ml(T, cc)} 지연 ${f(tsel.d)}호, 주의 ${f(tsel.w)}호(원천 추가로 전월과 비교 불가).` : `${ml(T, cc)} 지연 ${f(tsel.d)}호(전월 대비 ${sg(tsel.dd)}), 주의 ${f(tsel.w)}호(${sg(tsel.dw)}).`) : `${ml(T, cc)} 판정 없음.`}${AM.map((a) => ` ${ml(T, a.m)} 원천 추가.`).join('')}`}>
                  {[0.25, 0.5, 0.75].map((fr) => <line key={fr} x1="0" y1={ty(tmax * fr)} x2="560" y2={ty(tmax * fr)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
                  {AM.map((a) => <line key={a.m} data-added-mark x1={tx(a.m)} y1="2" x2={tx(a.m)} y2={TH - 2} stroke="var(--muted-foreground)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"><title>{amTip(a)}</title></line>)}
                  <g className="q-sweep"><polyline points={pts('w')} fill="none" stroke="var(--warn)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /><polyline points={pts('d')} fill="none" stroke="var(--bad)" strokeWidth="2.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></g>
                  <line x1={tx(cc)} y1="2" x2={tx(cc)} y2={TH - 2} stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                  {AM.map((a) => <span key={a.m} data-added-label className="absolute bottom-0 -translate-x-full whitespace-nowrap bg-card pr-1 text-[12px] leading-4 text-muted-foreground" style={{ left: tpc(a.m) }} title={amTip(a)}>원천 추가</span>)}
                  {ct ? ([['bg-bad', ct.d], ['bg-warn', ct.w]] as const).map(([c, val]) => <i key={c} className={cn('absolute block size-3 -translate-1/2 rounded-full border-[1.5px] border-card', c)} style={{ left: tpc(cc), top: tyn(val) }} />) : null}
                  {tf && t0 < NOW ? ([[tf.d, syD], [tf.w, syW]] as const).map(([val, yy], i) => <span key={i} className="absolute left-0 text-[13px] leading-4 text-muted-foreground tabular-nums" style={{ top: Math.max(0, yy - 24) }}>{f(val)}</span>) : null}
                </div>
              </div>
              <div className="relative ml-1 flex-none" style={{ width: TLBL }} aria-hidden="true">
                {([['지연', 'text-bad', eyD, tsel?.d, tsel?.dd], ['주의', 'text-warn', eyW, tsel?.w, tsel?.dw]] as const).map(([name, tone, yy, val, dv]) => (
                  <div key={name} className="absolute left-0 w-full whitespace-nowrap" style={{ top: Math.max(0, yy - 16) }}>
                    <div className={cn('text-[13px] leading-4 font-bold', tone)}>{name}</div>
                    <div className="text-[15px] leading-[18px] font-bold text-foreground tabular-nums">{val === undefined ? '—' : f(val)}{dv === undefined ? null : amSel ? <span className="ml-[5px] text-[12px] font-normal text-muted-foreground" title={`${amTip(amSel)} — 전월 대비 증감을 내지 않음(원천 추가로 판정 대상이 바뀜)`}>비교 불가</span> : <span className="ml-[5px] text-[12px] font-normal text-muted-foreground">{sg(dv)}</span>}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={cn(sub, 'mt-0.5 flex justify-between')} style={{ paddingRight: TLBL + 4 }}><span>{ml(T, 0)}</span><span>{ml(T, NOW)}</span></div>
          </Card>

          <Card variant="board" className={ringable(cur.p.includes('p-fut'))} render={<section id="p-fut" aria-label={AHEAD_COMPLETION} />}>
            <div className={phead}>
              <h2 className={ptitle} title={`${scope} · 준공 예정 월별(호) · 준공 실제 기록이 없는 사업의 현재 예정 준공 달(같은 사업은 한 번) · LH 후보의 예정일은 파일 기준일(${dotDates(real.lhAsOf)}) 값으로, 실적 자료보다 ${real.lhAgeMonths}개월 묵었습니다 · 막대를 누르면 그 달을 고릅니다 · 사업 화면의 '${AHEAD_COMPLETION}'·지역 공급의 준공 칩과 같은 범위·같은 값 · 지난 시점의 준공 실적은 월 상세·지역별 화면에서 봅니다`}>{AHEAD_COMPLETION}</h2>
              <span className={pacts}><PanelLink href="/agency/lh" full="LH 준공 예정 상세">LH 상세</PanelLink></span>
            </div>
            <div className="mt-2 flex items-baseline gap-2"><b className={cn(disp, 'text-[30px] leading-[1.1] font-normal')}>{f(upSum)}<small className="text-[18px]">호</small></b><span className="text-[14px] text-muted-foreground">{f(upProj)}건</span></div>
            <div className="relative mt-2 min-h-[118px] flex-[1_1_118px]">
              <svg id="fmonths" className="absolute inset-0 size-full [&_rect]:cursor-pointer" viewBox="0 0 240 100" preserveAspectRatio="none" role="img" aria-label={`${ymDot(up[0].ym)}부터 ${ymDot(up[up.length - 1].ym)}까지 월별 준공 예정 호수, 합 ${f(upSum)}호(원장 사업 ${f(L.scope.projects)}건, ${nation})`}>
                {up.map((m, i) => { const h = m.units / maxUp * UPH; return <rect key={m.ym} x={i * 20 + 1.5} y={(100 - h).toFixed(1)} width="17" height={Math.max(h, 0.4).toFixed(1)} fill="var(--st-soon)" className="q-grow-y" style={{ ['--i' as string]: i }} onClick={() => goto(NOW + i)}><title>{`${m.ym.replace('-', '.')} 준공 예정 ${f(m.units)}호 · ${m.projects}건`}</title></rect>; })}
                {hasFut ? <rect x={fi * 20 + 0.5} y={(100 - up[fi].units / maxUp * UPH - 1).toFixed(1)} width="19" height={(up[fi].units / maxUp * UPH + 1).toFixed(1)} fill="none" stroke="var(--foreground)" strokeWidth="2" style={{ vectorEffect: 'non-scaling-stroke' }} pointerEvents="none" /> : null}
              </svg>
              {hasFut ? <span className="pointer-events-none absolute -translate-x-1/2 text-[12px] leading-4 font-bold whitespace-nowrap text-foreground tabular-nums" style={{ left: `clamp(20px, ${((fi * 20 + 10) / 240 * 100).toFixed(2)}%, calc(100% - 20px))`, bottom: `calc(${(up[fi].units / maxUp * UPH).toFixed(1)}% + 5px)` }}>{f(up[fi].units)}</span> : null}
            </div>
            <div className={cn(sub, 'mt-0.5 flex justify-between')}><span>{ymDot(up[0].ym)}</span><span>{ymDot(up[(up.length - 1) >> 1].ym)}</span><span>{ymDot(up[up.length - 1].ym)}</span></div>
          </Card>

          <Card variant="board" className={ringable(cur.p.includes('p-agency'))} render={<section id="p-agency" aria-label="기관별 진행" />}>
            <div className={phead}>
              <h2 className={ptitle} title={`${scope} · 막대는 기관별 정상·주의·지연·판정 밖 호수(판정된 사업의 물량) · 오른쪽 = 지연 호수 · 전체 지연 ${f(J.delay.units)}호 중 비중 · 판정 밖: ${dotDates(outNote ?? '')}`}>기관별 진행</h2>
              <div className={phgroup}>
                <span className={legend} title="막대 색: 정상 · 주의 · 지연 · 판정 밖 호수">{[['bg-ok', '정상'], ['bg-warn', '주의'], ['bg-bad', '지연'], ['bg-[var(--out)] shadow-[inset_0_0_0_1px_var(--out-line)]', '판정 밖']].map(([c, n]) => <Key key={n} className={cn('size-2', c)}>{n}</Key>)}</span>
                <span className={pacts}><PanelLink href="/projects?sido=all" full="사업 목록(전국) — 기관 메뉴로 거르기">기관별 사업</PanelLink></span>
              </div>
            </div>
            <div className={ags}>
              {L.agencies.filter((a) => a.projects).map((a, ai) => {
                const out = a.units - a.okUnits - a.cautionUnits - a.delayUnits, pw = (n: number) => `${(n / a.units * 100).toFixed(1)}%`;   // out = 판정 밖 호수(LH 후보·예정 없는 사업)
                return (
                  <div key={a.id} className={ag} title={`${a.name} ${f(a.units)}호 — 정상 ${f(a.okUnits)} · 주의 ${f(a.cautionUnits)} · 지연 ${f(a.delayUnits)} · 판정 밖 ${f(out)}호${a.excludedUnits || a.candidateUnits ? `(${[a.excludedUnits ? `판정 제외 ${f(a.excludedUnits)}호` : '', a.candidateUnits ? `${CAND_TEXT} ${f(a.candidateUnits)}호` : ''].filter(Boolean).join(' · ')})` : ''}. ${a.id === 'unknown' ? `사업 ${f(a.projects)}건 — ` : ''}${dotDates(a.note ?? '')}${a.id === 'unknown' ? `. 판정 밖: ${dotDates(outNote ?? '')}` : ''}`}>
                    <div className={agName}><b>{a.id === 'unknown' ? AGENCY_NAME.etc : a.name}</b><span className="text-[13px] font-normal text-muted-foreground">{f(a.units)}호</span></div>
                    <div className={cn(bar3, 'q-grow-x h-3 mobile:col-span-full mobile:row-start-2')} style={{ ['--i' as string]: ai }} role="img" aria-label={`${a.name} ${f(a.units)}호: 정상 ${f(a.okUnits)} 주의 ${f(a.cautionUnits)} 지연 ${f(a.delayUnits)} 판정 밖 ${f(out)}`}>
                      <span className="block bg-ok" style={{ width: pw(a.okUnits) }} /><span className="block bg-warn" style={{ width: pw(a.cautionUnits) }} /><span className="block bg-bad" style={{ width: pw(a.delayUnits) }} /><span className="block bg-[var(--out)]" style={{ width: pw(out) }} />
                    </div>
                    <div className={agVal}><b className={cn(disp, 'text-bad')}>{f(a.delayUnits)}</b><span className="text-[13px] text-muted-foreground">{(J.delay.units ? a.delayUnits / J.delay.units * 100 : 0).toFixed(1)}%</span></div>
                  </div>
                );
              })}
            </div>
            {emptyAgencies.length ? <div className="min-w-0 text-[13px] text-muted-foreground" title="원장에 사업이 없는 기관">사업 없음: {emptyAgencies.map((a) => a.name).join(' · ')}</div> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
