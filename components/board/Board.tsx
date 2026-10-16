'use client';
/* 종합상황판(/) — 시안 이식. 시안의 동작(지시 6건 순환·월별 리본 차트·재생·시점 이동·범례 강조·시도)을 그대로 두고,
   월별 공급 파동·선택 시점 판정·시도·기관별 진행·향후 12개월은 사업 원장 집계(data/board/ledger-board.json — 원장 2026-10 기준)를 그린다.
   지연·주의 추이·선택 달 판정·리본의 지연 띠는 집계의 월 판정 이력(trend: 2025.01~2026.09 건축HUB 과거 판 소급, 2026.10부터 월 관측)을 쓴다 — trend 가 없는 옛 집계는 기준 달만 판정.
   총리 지시 6건 카드는 실데이터(lib/board/directives.ts).
   카드에는 숫자·단위·짧은 이름만 보이고, 기준·범위·규칙 설명은 카드 제목 옆 (i) 팝오버(키보드·터치로 열림)에 둔다 — 제목 title 은 두세 줄 요약(2026-10-11 사용자 지시: 서술 최소화, 2026-10-16 3차 평가: title 에만 있던 정의).
   실데이터 위젯(월별 실적 흐름)은 서버 컴포넌트(RealPanels)를 middle 로 받아 시도 카드와 같은 줄에 둔다. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Pause, Play } from 'lucide-react';
import {
  C, CIR, K, PX0, RCOL, REGION_POS, RLAB, VW,
  SCOPE_TAG, addedMarks, axisUnit, delayAt, delaysOf, f, flatTotal, judgedAt, judgmentsOf, kind, ml, rcls, ribbonOf, scopeChangeOf, sg, timelineOf, trendAt, trendMax, trendOf,
} from '../../lib/board/sample';
import { CAND_TEXT, candText, judgeBase, ledgerJudged, ledgerMix, makeDirectives, nation as nationOf, type Directive } from '../../lib/board/directives';
import { AHEAD_COMPLETION, AGENCY_NAME, bottleneckOf } from '../../lib/board/projects-view';
import { dotDates } from '../../lib/grid/spec';
import { staleText } from '../../lib/board/calc';
import type { LedgerBoard } from '../../lib/board/types';
import { cn } from 'cn';
import { sub } from '../page';
import { Badge } from '../ui/badge';
import ScopeChip from '../ui/scope-chip';
import InfoTip from '../ui/info-tip';
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
  regionOkUnits: Record<string, number>;                            // 시도별 판정 정상 호수(시도 타일 호수 기준 지연율의 분모 — 원장 집계 regions 에는 지연·주의 호수만 있다)
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

/* 지시 카드 값 줄 */
const dirRow = 'flex min-w-0 flex-wrap items-baseline gap-x-[min(6px,3cqi)] leading-[1.2] whitespace-nowrap';
/* 두 숫자 카드의 값 줄: 두 숫자를 위아래 두 줄로(좁은 카드에서 한 줄에 못 들어가 글자를 줄이지 않게 — 13px 이상 유지) */
const pairRow = 'flex min-w-0 flex-col items-start leading-[1.2] whitespace-nowrap';
/* 오른쪽 아래 목록 링크의 글자 틀. 값 줄 끝에 같은 글자를 보이지 않게 놓아(자리표) 링크 자리를 흐름 안에서 잡는다 — 값과 안 맞으면 자리표가 아랫줄로 내려가고 링크도 따라간다 */
const dirListText = 'inline-flex items-center gap-px text-[13px] leading-5 whitespace-nowrap';
const pairNum = 'rounded-[4px] text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
/* 두 숫자 카드의 값 줄: 앞말 + 숫자 + 단위 둘을 같은 크기로(link = 각 숫자를 자기 목록 링크로) */
function pairVals(x: Directive, link: boolean) {
  const one = (pre: string, big: string, u: string, l: { href: string; title: string }, k: string) => {
    const body = <><span className="text-[13px] font-bold text-ink2">{pre}</span> <span data-big className={cn(disp, 'font-normal text-[min(24px,11cqi)] leading-[1.15] underline decoration-muted-foreground decoration-dotted decoration-1 underline-offset-[3px]')}>{big}<span className="text-[max(13px,min(15px,7cqi))]">{u}</span></span></>;
    return link ? <Link key={k} href={l.href} title={l.title} aria-label={`${x.t} ${pre} ${big}${u} 목록`} data-slot="board-dir-pair-list" className={cn(pairNum, 'pointer-events-auto hover:[&_[data-big]]:text-primary hover:[&_[data-big]]:decoration-solid')}>{body}</Link> : <span key={k}>{body}</span>;
  };
  return <>{one(x.pre ?? '', x.big, x.u, x.list, 'a')}{one(x.pair!.pre, x.pair!.big, x.pair!.u, x.pair!.list, 'b')}</>;
}
/* 지시 카드 윗줄(제목): 말줄임 없이 낱말 단위로 줄바꿈하고, 원천 꼬리(tag)와 기간(note)은 제목 아래 작은 회색 한 줄('통계누리 · 2026.01~08 누계' — 조각 단위로만 줄바꿈).
   오른쪽 여백은 제목 줄의 (i) 자리(pr-8)만 — 목록 링크는 카드 오른쪽 아래(값 줄 끝)라 제목 폭을 줄이지 않는다. hide = 두 숫자 카드의 겹친 층에서 자리만 잡는 같은 틀 */
const dirTitle = (x: Directive, hide = false) => {
  const small = [x.tag, x.note].filter(Boolean);
  return (
    <span className={cn('block min-w-0', hide && 'invisible')} aria-hidden={hide || undefined}>
      <span className="block pr-8 text-[min(14px,8.5cqi)] leading-5 text-muted-foreground [word-break:keep-all]">{x.t}</span>
      {small.length ? <span data-slot="dir-tag" className="block text-[min(12px,7.5cqi)] leading-4 text-muted-foreground [word-break:keep-all]">{small.map((t, k) => <span key={k} className="whitespace-nowrap">{t}{k < small.length - 1 ? ' · ' : ''}</span>)}</span> : null}
    </span>
  );
};

export default function Board({ real, middle }: { real: BoardReal; middle: ReactNode }) {
  const L = real.ledger;
  /* 시점은 원장 집계에서 읽는다: NOW = 기준 달, LAST = 마지막 시점, T.actual = 실제 날짜가 있는 마지막 달 */
  const T = useMemo(() => timelineOf(L), [L]), NOW = T.now, LAST = T.last;
  const [focus, setFocus] = useState(1);
  const [cursor, setCursor] = useState(NOW);
  const [tour, setTour] = useState(false);
  const [hold, setHold] = useState(false);   // 마우스를 올렸거나 키보드 초점이 지시 카드 영역 안에 있는 동안 순환을 멈춘다(WCAG 2.2.2)
  const [tick, setTick] = useState(0);
  const [hl, setHl] = useState(-1);
  const [region, setRegion] = useState('11');   // 시도 코드
  const [tip, setTip] = useState<{ m: number; x: number; y: number } | null>(null);
  /* 리본 첫 화면 연출 단계(app/tailwind.css 의 [data-intro]): sweep 쓸기 → landed 기준 달(NOW) 표시 → '' 끝. 서버 렌더부터 sweep 이라 첫 화면부터 쓸린다.
     기준 시점은 처음부터 기준 달(NOW) — 지난 달을 훑는 연출을 하지 않아 숫자가 바뀌지 않는다(2026-10-15 평가: 2026.07 값을 먼저 보였다가 바뀌어 회의실에서 혼란) */
  const [intro, setIntro] = useState<'sweep' | 'landed' | ''>('sweep');
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const DIR = useMemo(() => makeDirectives({ sourceCount: real.sourceCount, stageNames: K, ledger: real.ledger, start: real.start, bottleneck: bottleneckOf }), [real.sourceCount, real.ledger, real.start]);
  const valid = useMemo(() => new Set(real.validMonths), [real.validMonths]);
  /* 달마다 판정(판정 없는 달 null)과 단계별 지연 호수 */
  const JS = useMemo(() => judgmentsOf(L), [L]), DL = useMemo(() => delaysOf(JS), [JS]), TR = useMemo(() => trendOf(T, JS), [T, JS]);
  const SF = useMemo(() => scopeChangeOf(JS), [JS]);   // 판정 기준 변경 달(없으면 -1): 그 앞 판정은 후보 포함 소급 값
  const rib = useMemo(() => ribbonOf(T, L.stageUnits, DL, SF), [T, L, DL, SF]);
  const staticSvg = useMemo(() => chartStatic(rib, hl), [rib, hl]);
  const dynSvg = useMemo(() => ribbonDynamic(rib, cursor), [rib, cursor]);

  useEffect(() => { setTour(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);   // 시안: reduce 이면 순환 끔
  useEffect(() => {   // 리본 첫 화면 연출. 움직임 줄이기면 건너뛰고, 사용자가 누르거나 키·휠을 쓰면 바로 끝낸다(누른 곳의 동작은 그대로 이어진다). 기준 시점은 내내 NOW
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setIntro(''); return; }
    const EV = ['pointerdown', 'keydown', 'wheel'] as const, opt = { capture: true, passive: true };
    const timers: number[] = [];
    const off = () => { for (const ev of EV) window.removeEventListener(ev, end, opt); };
    function end() { timers.forEach(clearTimeout); off(); setIntro(''); }
    for (const ev of EV) window.addEventListener(ev, end, opt);
    setIntro('sweep');
    timers.push(window.setTimeout(() => {   // 쓸기가 끝나면 기준 달 표시가 한 번 반짝인다(landed)
      setIntro('landed'); timers.push(window.setTimeout(() => { off(); setIntro(''); }, 950));
    }, 1100));
    return end;
  }, []);
  const run = tour && !hold;
  useEffect(() => {   // 지시 순환: 1 초 틱, 7 초마다 다음 지시. 멈춤 단추·마우스·초점으로 멈추면 틱도 멈춘다(진행 막대가 그 자리에 선다)
    if (!run) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [run]);
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
  const scopeFrom = SF >= 0 ? SF : undefined, mixed = judged && !SJ.candidate && scopeFrom !== undefined;   // 판정 달 꼬리표는 선택 달과 판정 달이 다를 때만(예정 달 → 기준 달 판정, 판정 없는 달 → 판정 없음)
  const ymKo = (m: number) => `${T.months[m].slice(0, 4)}년 ${Number(T.months[m].slice(5))}월`, ymDot = (ym: string) => ym.replace('-', '.');
  const J = L.judgment, d = SJ.delay.units, w = SJ.caution.units, ok = SJ.ok.units, tt = d + w + ok, pct = (x: number) => (x / tt * 100).toFixed(1) + '%';   // J = 기준 달 판정(기관 카드), d·w·ok = 선택 달 판정
  const jTot = rib.total[judged ? jm : NOW];   // 판정 비율의 모수 '전체' = 판정 달의 리본 총량(원장 전체 호수)
  /* 원장 범위: 카드 제목의 title 에 보인다(일부가 전국처럼 보이지 않게) */
  const nation = nationOf(L), whole = nation === '전국' ? '전국' : '원장 전체';   // whole = 기관별 진행 '전국 지연 중 몫'의 전체
  const scope = `원장 ${ymDot(L.observedMonth)} 기준 · 사업 ${f(L.scope.projects)}건(${ledgerMix(L)}) · ${nation} · ${real.ledgerOrigin === 'supabase' ? `출처 Supabase(api.board, ${ymDot(real.ledgerMonth)})` : '출처 JSON 대체'}`;
  const basisLine = `원장 ${ymDot(L.observedMonth)} 기준 · ${nation}`;   // 카드 제목 title 의 짧은 범위(긴 범위·규칙은 제목 옆 (i) 팝오버)
  /* 범위 칩(숫자 묶음 머리): 원장 위젯은 '전국 · 사업 원장', 월별 실적 흐름은 '전국 · 통계누리'(RealPanels) */
  const ledgerChip = <ScopeChip scope={nation === '전국' ? '전국' : '일부 지역'} source="사업 원장" title={`사업 원장 집계 — ${scope}`} />;
  /* 지연·주의 추이: 판정이 있는 달(0 … NOW)의 호수. 세로 맨 위(tmax)는 이력 최댓값에 맞춘다(눈금선 3개 = 4등분).
     2026-10-16 평가(고정 높이 168px·오른쪽 이름표 칸 120px 이라 카드 아래·오른쪽이 비었다): 위 줄 = 선택 달 값(큰 숫자), 아래 = 이력 선이 카드의 남는 높이를 채운다.
     선은 viewBox 560×100(세로는 % 그대로, preserveAspectRatio none), 점·표지는 같은 좌표를 퍼센트로 얹은 HTML. 판정 기준 변경 달(SF) 앞은 후보 포함 소급이라 빗금 띠 + 점선, 그 뒤는 실선·점(둘을 잇지 않는다) */
  const tmax = trendMax(Math.max(0, ...TR.flatMap((r) => (r ? [r.d, r.w] : [])))), cc = Math.min(cursor, NOW), ct = TR[judgedAt(T, cc)] ?? null, tsel = trendAt(T, TR, cursor);
  const tx = (m: number) => (m * 560 / NOW).toFixed(1), tpc = (m: number) => `${(m / NOW * 100).toFixed(2)}%`;
  const tyn = (val: number) => 100 - val / tmax * 92, ty = (val: number) => tyn(val).toFixed(2);   // 위 8% 는 비워 둔다
  const oldEnd = SF > 0 && SF <= NOW ? SF : 0;   // [0, oldEnd) = 이전 기준(후보 포함 소급), [oldEnd, NOW] = 지금 기준
  const pts = (k: 'd' | 'w', a: number, b: number) => TR.slice(a, b).flatMap((r, i) => (r ? [tx(a + i) + ',' + ty(r[k])] : [])).join(' ');
  const t0 = T.judged[0], tf = TR[t0] ?? null, jsel = judgedAt(T, cc);
  const newPts = oldEnd > 0 ? TR.flatMap((r, m) => (r && m >= oldEnd ? [{ m, r }] : [])) : [];   // 기준 변경 뒤 판정 달(점 — 몇 달뿐이라 선만으로는 안 보인다)
  /* 추이의 세로 표지: 원천 추가 달 + 판정 기준 변경 달(리본 구분선과 같은 달 — 둘이 같으면 한 표지). 표지 달은 전월과 '비교 불가' */
  const AM = [...addedMarks(JS, NOW).filter((a) => a.m !== SF), ...(SF >= 0 && SF <= NOW ? [{ m: SF, sources: JS[SF]?.addedSources ?? [] }] : [])].sort((a, b) => a.m - b.m);
  const amSel = AM.find((a) => a.m === judgedAt(T, cc));
  const amTip = (a: { m: number; sources: string[] }) => a.m === SF
    ? `${SCOPE_TAG(ml(T, a.m))}(그 앞 달은 후보 포함 소급 판정)${a.sources.length ? ` · 원천 추가: ${a.sources.join('·')}` : ''} — 이전 달과 비교 불가`
    : `${ml(T, a.m)} 원천 추가: ${a.sources.join('·')} — 이전 달과 직접 비교 주의`;
  const amName = (a: { m: number }) => (a.m === SF ? '기준 변경' : '원천 추가');
  const scopeAria = scopeFrom !== undefined ? ` ${ml(T, scopeFrom)}에 세로 구분선: ${SCOPE_TAG(ml(T, scopeFrom))}. 그 앞 빗금 띠는 번호 없는 후보를 포함한 값이라 이어서 비교할 수 없습니다.` : '';   // 리본 aria-label
  const up = L.upcoming, fi = cursor - NOW, hasFut = fi >= 0 && fi < up.length;
  const fu = up[hasFut ? fi : 0];   // 월 상세 링크 달: 고른 달이 앞으로 12개월 안이면 그 달, 아니면 첫 달(링크 숫자 = 월 상세 '준공 예정 사업' 합계)
  const maxUp = Math.max(1, ...up.map((m) => m.units)), upSum = up.reduce((n, m) => n + m.units, 0), upProj = up.reduce((n, m) => n + m.projects, 0), UPH = 82;   // UPH = 막대 최대 높이(viewBox 100 중, 위 18은 선택 값 자리)
  const cur = DIR[focus - 1];
  const sidoName = (code: string) => real.sido[code] ?? code;
  const curReg = L.regions.find((r) => r.code === region)!;
  const curRegMap = mapScopeHref({ sido: curReg.code });   // 수도권 시도만 지도 연결(그 밖은 null)
  /* 시도 타일: 전국 16칸 지리 격자(2026-10-16 4차 사용자 지시 — 2차의 '판정 시도만 크게 + 나머지 한 줄 묶음'을 되돌림). 판정 대상이 없는 칸은 흰 바탕 + 짧은 표기 */
  const judgedNames = L.regions.filter((r) => r.judged).map((r) => sidoName(r.code)).join('·');
  const judgedText = L.regions.every((r) => r.judged) ? `${L.regions.length}개 시도 모두` : `${judgedNames}만`;
  const emptyAgencies = L.agencies.filter((a) => !a.projects);
  const outNote = L.agencies.find((a) => a.id === 'lh')?.note;   // 일정 정보 없음(LH 후보)의 사유
  const lhStale = staleText(real.lhAsOf, L.referenceDate);   // LH 파일 낡음(원장 기준일과의 차이 — 기관·월 화면과 같은 기준)
  /* 막대의 판정하지 않은 물량(2026-10-16 용어: '판정 밖' → '일정 정보 없음'): 확인 필요(후보 — 같은 계산을 하지만 판정에 넣지 않음)는 빗금 조각으로 따로,
     나머지(LH 후보 · 준공 완료 · 판정할 현재 예정일 없음)가 일정 정보 없음 */
  const NONE_TEXT = '일정 정보 없음', NONE_TIP = `${NONE_TEXT} = 판정할 현재 예정일이 없는 사업(준공 완료 포함)과 LH 후보(${dotDates(outNote ?? '')})`;
  const candHatch = '[background:repeating-linear-gradient(45deg,var(--out-line)_0_1.5px,var(--out)_1.5px_4px)]';
  const monthLink = valid.has(T.months[cursor]) ? `/month/${T.months[cursor]}` : null;
  const tipView = tip ? tipOf(tip.m) : null;
  function tipOf(m: number) {
    const vv = L.stageUnits[m], dd = delayAt(T, DL, m), b = bottleneckOf(dd)?.i ?? 0, tj = judgedAt(T, m);
    return { m, vv, dd, b, tj: tj >= 0 ? JS[tj] : null };
  }

  return (
    <div className="[&_:focus-visible]:[outline-offset:2px] [&_:focus-visible]:[outline:2px_solid_var(--primary)] motion-reduce:[&_*]:animate-none! motion-reduce:[&_*]:transition-none!">
      <div className="board-desktop mx-auto max-w-[1760px] px-7 pb-9 mobile:px-3 mobile:pb-6 mobile:[&_[data-slot=card]]:px-3.5 mobile:[&_[data-slot=card]]:pt-3.5 mobile:[&_[data-slot=card]]:pb-4">
        <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 pt-4 pb-3">
          <h1 className="m-0 font-display text-[28px] leading-[1.2] font-normal tracking-[-0.03em] text-foreground mobile:text-[22px]">주택공급 종합상황판</h1>
          <button type="button" data-slot="dir-pause" aria-controls="board-dirs" aria-pressed={!tour} aria-label="지시 카드 자동 넘김 멈춤" title={tour ? '지시 카드 자동 넘김 멈춤(7초마다 다음 지시 · 카드에 마우스를 올리거나 초점이 있으면 잠시 멈춤)' : '지시 카드 자동 넘김 다시 시작'}
            onClick={() => setTour((t) => !t)}
            className={cn(btn, 'ml-auto inline-flex h-7 items-center gap-1.5 self-center rounded-full border border-border px-2.5 text-[13px] whitespace-nowrap text-muted-foreground hover:text-foreground aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-foreground mobile:ml-0', hoverBg)}>
            {tour ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}자동 넘김
          </button>
          <span className={cn(sub, 'whitespace-nowrap mobile:text-[13px]')} title={`원장 위젯은 ${scope}입니다. 실적(통계누리) 자료는 ${real.actualMonth.replace('-', '.')}까지입니다.`}>원장 {L.referenceDate.replace(/-/g, '.')} · 실적 {real.actualMonth.replace('-', '.')}</span>
        </header>

        <section id="board-dirs" aria-label="총리 지시 6건"
          onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}
          onFocus={() => setHold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold(false); }}>
          <div className="grid grid-cols-2 gap-2 min-[901px]:grid-cols-3 min-[1101px]:grid-cols-6">
            {DIR.map((x, i) => (
              <div key={i} className="relative min-w-0">
              <button type="button" data-slot="board-dir" title={`${x.date} 지시 · ${x.t}\n${x.basis}`} style={{ ['--i' as string]: i }} className={cn(btn, 'peer q-rise card-lift group/dir @container relative flex min-h-20 h-full w-full min-w-0 flex-col justify-between gap-1.5 rounded-[12px] border border-border bg-card px-3.5 py-2.5 aria-pressed:border-primary aria-pressed:bg-accent', hoverBg)} aria-pressed={i === focus - 1} onClick={() => { setFocus(i + 1); setTour(false); }}
                aria-label={`${x.date} 지시 ${x.t}${x.tag ? `(${x.tag})` : ''}: ${x.m}${x.sub ? `, ${x.sub.text}` : ''}${x.note ? `, ${x.note}` : ''}`}>
                {dirTitle(x)}
                {x.pair ? <span className={cn(pairRow, 'invisible')} aria-hidden="true">{pairVals(x, false)}</span> : (
                <span className={dirRow}>{/* 값이 칸보다 길면 보조 값이 아랫줄로 내려간다 */}
                  {x.pre ? <span className="text-[min(14px,9cqi)] font-bold text-ink2">{x.pre}</span> : null}
                  <span className={cn(disp, 'font-normal text-[min(26px,12cqi)] leading-[1.15] group-aria-pressed/dir:text-primary')}>{x.big}<span className="text-[min(17px,8cqi)]">{x.u}</span></span>
                  {x.sub ? <span className={cn('text-[min(14px,9cqi)] font-bold', x.sub.tone === 'ok' ? 'text-ok' : x.sub.tone === 'bad' ? 'text-bad' : 'text-warn')}>{x.sub.text}</span> : null}
                  <span data-slot="dir-list-gap" className={cn(dirListText, 'invisible ml-auto')} aria-hidden="true">{x.list.text ?? '목록'}<ChevronRight className="size-3.5" aria-hidden="true" /></span>
                </span>)}
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"><span className="absolute bottom-0 left-0 h-[3px] w-0 bg-primary [transition:width_.9s_linear]" style={{ width: i === focus - 1 && tour ? `${(((tick % 7) + 1) / 7 * 100).toFixed(0)}%` : '0' }} /></span>
              </button>
              {/* 두 숫자 카드(pair — 지연 확정 · 후보 계산): 두 숫자가 각각 자기 목록으로 가는 링크다. 단추 안에 링크를 넣을 수 없어, 단추와 같은 틀(테두리·여백·세로 가운데)의 겹친 층에
                  같은 줄을 링크로 다시 놓는다(단추 안 줄은 자리만 잡고 보이지 않음). 겹친 층은 누름을 단추로 흘려보내고 링크만 받는다 */}
              {x.pair ? (
                <div data-slot="board-dir-pair" className="pointer-events-none absolute inset-0 z-[1] flex flex-col justify-between gap-1.5 rounded-[12px] border border-transparent px-3.5 py-2.5 @container transition-[translate] peer-hover:-translate-y-0.5 peer-focus-visible:-translate-y-0.5 motion-reduce:transition-none [.peer[aria-pressed=true]~&_[data-big]]:text-primary">
                  {dirTitle(x, true)}
                  <span className={pairRow}>{pairVals(x, true)}</span>
                </div>
              ) : null}
              {/* 오른쪽 위: 정의 (i)(키보드·회의실 화면에서도 열리는 팝오버). 단추 밖 형제라 단추 안에 단추·링크가 들어가지 않는다 */}
              <div className="absolute top-[5px] right-2.5 z-[2] flex items-center gap-1 transition-[translate] peer-hover:-translate-y-0.5 motion-reduce:transition-none">
                <InfoTip label={`${x.t} 기준`} className="h-7 px-0.5">
                  <p>{x.basis}</p>{x.list.text ? <p>{x.list.title}</p> : null}
                </InfoTip>
              </div>
              {/* 오른쪽 아래: 목록 링크(글자 = 무엇이 열리는지, 없으면 '목록'). 값 줄 끝의 보이지 않는 같은 글자(dir-list-gap)가 자리를 잡아 값·제목과 겹치지 않는다 */}
              {x.pair ? null : (
                <Link href={x.list.href} title={x.list.title} aria-label={`${x.t} ${x.list.text ?? '목록'}`} data-slot="board-dir-list"
                  className={cn(dirListText, 'absolute right-3.5 bottom-[11px] z-[2] rounded-[4px] text-muted-foreground no-underline underline-offset-[3px] transition-[translate] peer-hover:-translate-y-0.5 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none')}>
                  {x.list.text ?? '목록'}<ChevronRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
              </div>
            ))}
          </div>
        </section>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_clamp(340px,30vw,400px)] items-stretch gap-3.5 narrow:grid-cols-1 min-[1600px]:grid-cols-[minmax(0,1fr)_clamp(400px,26vw,460px)]">
          <Card variant="board" className={ringable(cur.p.includes('p-chart'))} render={<section id="p-chart" aria-label="월별 공급 파동" />}>
            <div className="mb-2 flex flex-wrap items-center gap-3.5">
              <h2 className={ptitle} title={`${basisLine} · 달 말 단계별 호수(세로축 ${axisUnit(rib)}) · 붉은 띠 = 지연 호수`}>월별 공급 파동</h2>
              <InfoTip label="월별 공급 파동 읽는 법" className="-ml-2">
                <p>달 말에 각 단계에 있는 사업의 호수를 쌓았습니다(세로축 {axisUnit(rib)}). {ml(T, T.actual)}까지 실제 날짜, 그 뒤는 현재 예정(빗금){flatTotal(rib) ? ` · 총량은 매달 ${f(rib.total[0])}호(같은 사업이 단계만 옮겨 감)` : ''}.</p>
                <p>붉은 띠 = 단계별 지연 호수({ml(T, T.judged[0])} 판정부터){scopeFrom !== undefined ? ` · ${SCOPE_TAG(ml(T, scopeFrom))} — 그 앞 빗금 띠는 후보 포함` : ''}. 달에 마우스를 올리면 병목, 누르면 그 달을 고릅니다.</p>
                <p className="text-muted-foreground">{scope}</p>
              </InfoTip>
              {ledgerChip}
              <div data-slot="board-legend" className="ml-auto flex flex-wrap gap-0.5" role="group" aria-label="단계 범례 (누르면 해당 단계를 강조)">
                {K.map((k, i) => <button key={k} type="button" className={cn(btn, 'flex items-center gap-1.5 rounded-full border border-transparent px-2 py-[3px] text-[14px] [transition:background_.15s,border-color_.15s] aria-pressed:border-primary aria-pressed:bg-accent', hoverBg)} aria-pressed={hl === i} onClick={() => setHl(hl === i ? -1 : i)}><i className="block size-2.5 flex-none rounded-[3px]" style={{ background: C[i] }} />{k}</button>)}
                <span className="flex items-center gap-1.5 border border-transparent px-2 py-[3px] text-[14px]" title={`붉은 띠 = 단계별 지연 호수(${ml(T, T.judged[0])} 판정부터)${scopeFrom !== undefined ? ` · ${SCOPE_TAG(ml(T, scopeFrom))}` : ''}`}><i className="block size-2.5 flex-none rounded-[3px] bg-[var(--rb-band)]" />지연</span>
                {scopeFrom !== undefined ? <span data-slot="band-old-key" className="flex items-center gap-1.5 border border-transparent px-2 py-[3px] text-[14px]" title={`빗금 띠 = ${ml(T, scopeFrom - 1)}까지 소급 판정의 지연 호수(번호 없는 후보 포함) — ${SCOPE_TAG(ml(T, scopeFrom))}이라 값이 이어지지 않음(다시 계산하지 않음)`}><i className="block size-2.5 flex-none rounded-[3px] [background:repeating-linear-gradient(45deg,var(--rb-band)_0_1.5px,color-mix(in_srgb,var(--rb-band)_28%,transparent)_1.5px_4px)]" />지연 · 후보 포함</span> : null}
              </div>
            </div>
            {/* 좁은 화면에서만 가로로 민다. 세로는 숨긴다: overflow-x 가 auto 면 세로도 auto 가 되어, 툴팁·소수점 높이로 1px 만 넘쳐도 세로 스크롤바가 생기고 그 폭만큼 차트가 다시 줄어 그림이 흔들렸다.
                최소 폭 620px 와 오른쪽 칸 clamp(340px,30vw,400px): 1101~1280px 화면(스크롤바 포함)에서 왼쪽 칸이 760px 보다 좁아 가로 스크롤이 생기던 것을 없앤다(2026-10-15) */}
            <div className="overflow-x-auto overflow-y-hidden rounded-[10px]">
            <div className="relative min-w-[620px] cursor-pointer rounded-[10px] border border-border bg-chartbg [touch-action:pan-y] mobile:min-w-0" ref={wrapRef} data-intro={intro || undefined}
              onPointerMove={(e) => { const m = monthAt(e.clientX); if (m < 0) setTip(null); else { const wr = wrapRef.current!.getBoundingClientRect(); setTip({ m, x: e.clientX - wr.left, y: e.clientY - wr.top }); } }}
              onPointerLeave={() => setTip(null)}
              onClick={(e) => { const m = monthAt(e.clientX); if (m >= 0) goto(m); }}>
              <svg id="chart" shapeRendering="geometricPrecision" ref={svgRef} className="block h-auto w-full [&_text]:[font-family:inherit]" viewBox="0 0 960 400" role="img" aria-label={`${ymKo(0)}부터 ${ymKo(LAST)}까지 원장 사업 ${f(L.scope.projects)}건의 달 말 단계별 호수를 쌓은 월별 리본(${nation}). 바닥부터 쌓은 높이(세로축, 호)가 그 달 총량이고, 층 안의 붉은 띠가 ${ml(T, T.judged[0])} 판정부터의 단계별 지연 호수입니다.${scopeAria} 차트를 누르면 그 달을 고릅니다.`}>
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
                        <div className={tipRow}><span className={cn(tipRowKey, 'text-bad')}>지연{SF >= 0 && tipView.m < SF ? ' · 후보 포함' : ''}</span><b className={disp}>{f(tipView.tj.delay.units)}</b></div><div className={tipRow}><span className={cn(tipRowKey, 'text-warn')}>주의</span><b className={disp}>{f(tipView.tj.caution.units)}</b></div>
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
              <h2 className={cn(ptitle, 'text-[26px]')} title={`${basisLine} · 판정 기준일 ${dotDates(SJ.referenceDate)} · 호수 기준`}>{ml(T, cursor)}</h2>
              <InfoTip label="판정·병목 기준" className="-ml-1.5">
                <p>막대·비율 = 판정 사업의 계획 호수 중 지연·주의·정상 비율(호수 기준 — 시도 타일도 같은 기준). 지연 = 현재 예정일 경과 {L.judge.delayMonths}개월 이상, 주의 = {L.judge.cautionMonths}~{L.judge.delayMonths}개월.</p>
                <p>병목 = 지연 호수가 가장 큰 단계. 단계 호수 = 그 달 말 그 단계에 있는 사업의 호수, 증감 = 선택 달 − 기준 달({ml(T, NOW)}). 판정은 선택 달 이하의 가장 늦은 판정 달(판정 기준일 {dotDates(SJ.referenceDate)}).</p>
                <p>모수 = 판정 사업의 건수·호수(사업 번호가 있는 사업). 전체의 % = 원장 전체 {f(jTot)}호(리본 총량, 사업 {f(L.scope.projects)}건) 중 판정 호수의 비율 — 나머지는 {CAND_TEXT}·{NONE_TEXT}.</p>
                <p className="text-muted-foreground">{ledgerJudged(L)}</p>
              </InfoTip>
              {ledgerChip}
              <Badge variant="solid" className={planned(cursor) ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'}>{kind(T, cursor)}</Badge>
              <span className={pacts}>{bk >= 0 ? <PanelLink href={`/projects?sido=all&stage=${bk}&status=late`} full={`병목 단계(${CIR[bk]} ${K[bk]})의 지연(장기 포함) 사업(전국 · 지금 기준)`}>병목 단계</PanelLink> : null}{monthLink ? <PanelLink href={monthLink} full={`${ml(T, cursor)} 월 상세`}>{Number(T.months[cursor].slice(5))}월</PanelLink> : null}</span>
            </div>
            <div>
              {/* 판정 달 꼬리표는 막대 오른쪽에, 선택 달과 판정 달이 다를 때만(제목 줄은 '예정 기준' 표지와 이동 링크로 폭이 없다) */}
              <div className="flex items-center gap-2">
                <div className="q-grow-x flex h-3.5 min-w-0 flex-auto gap-0.5 overflow-hidden bg-pn2 [&>span]:block [&>span]:h-full [&>span]:min-w-0" role="img" aria-label={judged ? `${jTag}: 전체 ${f(tt)}호 중 지연 ${pct(d)}, 주의 ${pct(w)}, 정상 ${pct(ok)}` : '판정 없음'}>
                  {judged ? <><span className="bg-bad" style={{ width: `${(d / tt * 100).toFixed(2)}%` }} /><span className="bg-warn" style={{ width: `${(w / tt * 100).toFixed(2)}%` }} /><span className="bg-ok" style={{ width: `${(ok / tt * 100).toFixed(2)}%` }} /></> : null}
                </div>
                {showJTag ? <span data-slot="judge-tag" className={cn(jtag, 'flex-none leading-none')}>{jTag}</span> : null}
                {mixed ? <span data-slot="judge-tag" className={cn(jtag, 'flex-none leading-none')} title={`이 달 판정은 소급 이력이라 사업 번호가 없는 후보를 포함합니다 — ${ml(T, scopeFrom!)}부터 판정은 번호가 있는 사업만(후보는 ${CAND_TEXT}로 따로)`}>후보 포함</span> : null}
                <span data-slot="basis-tag" className="flex-none text-[12px] leading-none whitespace-nowrap text-muted-foreground" title="막대·비율 = 지연·주의·정상 판정 사업의 계획 호수 비율(호수 기준) — 시도 타일도 호수 기준">호수 기준</span>
              </div>
              {/* 비율의 모수(2026-10-16 4차): 판정 사업 건수·호수와 원장 전체 호수 중 몫 — 판정 없는 달은 자리만(칸 높이 유지) */}
              <div data-slot="judge-base" className={cn('mt-1 text-[12px] leading-4 text-muted-foreground tabular-nums', !judged && 'invisible')} title={`비율의 모수 — 전체 = 원장 전체 ${f(jTot)}호(리본 총량) 중 판정 호수`}>{judgeBase(SJ, jTot)}</div>
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
              {/* 지연 두 숫자(2026-10-15 사용자 결정): 확정(번호 있는 사업) · 후보 계산(번호 없는 후보를 같은 규칙으로 계산한 지연)을 같은 크기로 나란히, 각 숫자는 자기 목록으로 */}
              {judged && SJ.candidate ? (
                <div data-slot="board-cand" className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[14px] text-muted-foreground tabular-nums" title={`사업 번호가 없는 후보(건축HUB 원천 예정일 기준) ${f(SJ.candidate.ok.projects + SJ.candidate.caution.projects + SJ.candidate.delay.projects)}건은 같은 판정 계산을 하되 지연·주의·정상에 넣지 않고 따로 셉니다 — 이미 준공했는데 대장과 연결되지 않았을 수 있습니다 · ${candText(SJ.candidate)}건`}>
                  <b className="font-bold text-foreground">지연</b>
                  <PanelLink href="/projects?sido=all&status=late" full={`지연 확정 — 지연(장기 포함) 사업 목록(전국 · 지금 기준) · 사업 번호가 있는 사업`}>확정 <b className={cn(disp, 'text-[20px] leading-none text-bad')}>{f(SJ.delay.projects)}</b>건</PanelLink>
                  <span aria-hidden="true">·</span>
                  <PanelLink href="/projects?sido=all&status=review-late" full={`후보 계산 — 번호 없는 후보 중 같은 규칙으로 계산하면 지연인 사업 ${f(SJ.candidate.delay.projects)}건 목록(전국 · 지금 기준)`}>후보 계산 <b className={cn(disp, 'text-[20px] leading-none text-foreground')}>{f(SJ.candidate.delay.projects)}</b>건</PanelLink>
                </div>
              ) : null}
            </div>
            {/* 증감 칸은 선택 달이 기준 달이 아닐 때만(기준 달이면 3칸) */}
            <div className={cn('mt-3 grid flex-auto grid-rows-[auto_repeat(6,minmax(0,1fr))] gap-x-3', showDlt ? 'grid-cols-[minmax(0,1fr)_max-content_max-content_max-content] phone:grid-cols-[minmax(0,1fr)_max-content_max-content]' : 'grid-cols-[minmax(0,1fr)_max-content_max-content]')} aria-label={showDlt ? '단계별 호수, 기준 달 대비 증감, 지연 호수' : '단계별 호수, 지연 호수'}>
              <div className="col-span-full grid grid-cols-subgrid items-center px-1.5 pb-0.5 text-[13px] text-muted-foreground">
                <span data-slot="stage-now" title="그 달 말에 이 단계에 있는 사업의 호수(지금 단계 기준 — 지역 공급 '입주 예정'은 앞으로 입주할 예정 사업이라 다른 숫자)">현재 단계</span><span className="text-right" data-slot="stage-def" title={`단계별 호수 = ${cursor === NOW ? '지금' : `${ml(T, cursor)} 말`} 그 단계에 있는 사업의 호수(사업 화면 '단계별 진행'의 큰 숫자는 이 단계까지 온 누적 · 지시 카드 착공은 통계누리 누계)`}>호수 <span className="text-[12px] text-mute">· {cursor === NOW ? '지금' : `${Number(T.months[cursor].slice(5))}월 말`}</span></span>{showDlt ? <span className="text-right phone:hidden">증감</span> : null}<span className="text-right">지연</span>
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
              <h2 className={ptitle} title={`${basisLine} · 지연율 = 지연 호수 ÷ 판정 호수(호수 기준) · 판정은 ${judgedText}`}>시도 {L.regions.length}곳</h2>
              <InfoTip label="시도 지연율 기준" className="-ml-2">
                <p>지연율 = 지연 호수 ÷ 판정 사업 호수(호수 기준 — 선택 시점 판정 막대와 같은 기준). 타일 아래는 지연 호수 · 건수, 막대는 지연·주의·정상 호수 비율입니다.</p>
                <p>바탕색 = 지연율 구간({RLAB.join(' / ')}%). 판정은 사업 번호가 있는 사업만({judgedText}) — 판정 대상이 없는 시도는 흰 바탕에 '판정 대상 없음 · 확인 필요 n건'({CAND_TEXT} — 같은 계산을 하되 판정에 넣지 않음).</p>
                <p className="text-muted-foreground">{scope}</p>
              </InfoTip>
              {ledgerChip}
              <span className={cn(legend, 'ml-auto flex-nowrap gap-x-1.5')}><span title="지연율 = 지연 호수 ÷ 판정 사업 호수(호수 기준 — 선택 시점 판정 막대와 같은 기준)">지연율 · 호수 기준</span><span>0</span><span className="flex h-2.5 overflow-hidden rounded-[2px] border border-border" title={`지연율 구간: ${RLAB.join(' / ')}%`}>{RCOL.map((c, i) => <i key={i} className="block w-4" style={{ background: c }} />)}</span><span>30%+</span></span>
            </div>
            <div className="mt-3 grid flex-1 auto-rows-[minmax(68px,1fr)] grid-cols-4 gap-1.5 mobile:auto-rows-[minmax(56px,1fr)] mobile:gap-1">
              {L.regions.map((r, ri) => {
                const n = sidoName(r.code), pos = REGION_POS[r.code], none = !r.judged, ok = real.regionOkUnits[r.code] ?? 0, tu = ok + r.cautionUnits + r.delayUnits, rate = tu ? r.delayUnits / tu * 100 : 0;   // 지연율 = 지연 호수 ÷ 판정 호수(선택 시점 판정 막대와 같은 호수 기준) · none = 판정 대상(번호 있는 사업) 없음
                return (
                  <button key={r.code} type="button" data-slot="board-region" className={cn(btn, 'q-rise card-lift flex flex-col justify-between gap-1 min-w-0 @container rounded-[10px] border border-border bg-[var(--rc)] px-2.5 pt-2 pb-[9px] mobile:px-[7px] mobile:pt-1.5 mobile:pb-[7px] aria-pressed:border-primary aria-pressed:[box-shadow:0_0_0_1px_var(--primary)]')} aria-pressed={r.code === region} onClick={() => setRegion(r.code)} style={{ ['--rc' as string]: none ? 'var(--card)' : RCOL[rcls(rate)], ['--i' as string]: ri * 0.5, ...(pos ? { gridArea: `${pos[0]} / ${pos[1]}` } : {}) }}
                    title={none
                      ? `${n} · 사업 ${f(r.projects)}건 · 판정 대상 없음(번호 있는 사업 없음)` + (r.candidate?.judged ? ` · ${CAND_TEXT} ${f(r.candidate.judged)}건(계산하면 지연 ${f(r.candidate.delay)} · 주의 ${f(r.candidate.caution)} · 정상 ${f(r.candidate.ok)} — 판정에 넣지 않음)` : '') + (r.code === '12' ? ' · 2026.07부터 광주·전남은 전남광주로 집계됩니다' : '')
                      : `${n} · 판정 ${f(r.judged)}건 ${f(tu)}호 · 지연율 ${rate.toFixed(1)}%(호수 기준) · 지연 ${f(r.delayUnits)}호(${r.delay}건) · 주의 ${f(r.cautionUnits)}호(${r.caution}건) · 정상 ${f(ok)}호(${r.ok}건)` + (r.candidate?.judged ? ` · ${CAND_TEXT} ${f(r.candidate.judged)}건(계산하면 지연 ${f(r.candidate.delay)} · 주의 ${f(r.candidate.caution)} · 정상 ${f(r.candidate.ok)} — 판정에 넣지 않음)` : '')}
                    aria-label={(none ? `${n} 판정 대상 없음(번호 있는 사업 없음), 사업 ${f(r.projects)}건` : `${n} 지연율 ${rate.toFixed(1)}%(호수 기준), 지연 ${f(r.delayUnits)}호 ${r.delay}건, 주의 ${f(r.cautionUnits)}호, 정상 ${f(ok)}호, 판정 ${f(r.judged)}건`) + (r.candidate?.judged ? ` ${CAND_TEXT} ${f(r.candidate.judged)}건` : '')}>
                    <span className="flex items-baseline justify-between gap-1.5 @max-[105px]:flex-col @max-[105px]:items-start @max-[105px]:gap-0.5">
                      <span className="text-[15px] leading-[1.25] font-bold whitespace-nowrap text-foreground @max-[105px]:text-[13px]">{n}</span>
                      {none ? null : <span className={cn(disp, 'text-[22px] leading-none whitespace-nowrap @max-[105px]:text-[18px]')}>{rate.toFixed(1)}<small className="text-[14px] @max-[105px]:text-[12px]">%</small></span>}
                    </span>
                    {none ? (
                      <span data-slot="region-none" className="text-[12px] leading-[1.3] text-muted-foreground tabular-nums [word-break:keep-all]">판정 대상 없음{r.candidate?.judged ? <> · 확인 필요 {f(r.candidate.judged)}건</> : null}</span>
                    ) : (
                      <>
                        <span className="flex h-2 gap-px bg-[color-mix(in_srgb,var(--card)_70%,transparent)] [&>span]:block [&>span]:h-full [&>span]:min-w-[3px] [&>span]:flex-none" aria-hidden="true">
                          {([[r.delayUnits, 'bg-bad'], [r.cautionUnits, 'bg-warn'], [ok, 'bg-ok']] as const).map(([cnt, c]) => cnt ? <span key={c} className={c} style={{ flex: `${cnt} 1 0` }} /> : null)}
                        </span>
                        <span className="text-[12px] leading-[1.3] whitespace-nowrap text-muted-foreground tabular-nums @max-[105px]:whitespace-normal">지연 {f(r.delayUnits)}호 · {f(r.delay)}건</span>
                      </>
                    )}
                  </button>
                );
              })}
              <div data-slot="board-region-sum" aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-border bg-card px-3.5 py-2 [grid-area:5/2/6/5] mobile:gap-x-2.5 mobile:gap-y-0.5 mobile:px-2 mobile:py-1.5">
                <b className="text-[15px]">{sidoName(curReg.code)}</b>
                <span className="flex gap-2.5 text-[14px] whitespace-nowrap text-muted-foreground mobile:gap-1.5 mobile:text-[13px]"><span>지연<strong className="ml-[3px] text-bad">{f(curReg.delay)}</strong></span><span>주의<strong className="ml-[3px] text-warn">{f(curReg.caution)}</strong></span><span>정상<strong className="ml-[3px] text-ok">{f(curReg.ok)}</strong></span><span>건</span>{curReg.candidate?.judged ? <span title={`사업 번호가 없는 후보 — 같은 계산을 하되 판정에 넣지 않음 · 계산하면 지연 ${f(curReg.candidate.delay)} · 주의 ${f(curReg.candidate.caution)} · 정상 ${f(curReg.candidate.ok)}`}>· 확인 필요<strong className="ml-[3px] text-foreground">{f(curReg.candidate.judged)}</strong></span> : null}</span>
                <span className={cn(pacts, 'mobile:ml-0')}><PanelLink href={`/region?sido=${curReg.code}`} full={`${sidoName(curReg.code)} 실적 상세`}>{sidoName(curReg.code)} 실적</PanelLink>{curRegMap ? <MapLink href={curRegMap} full={`${sidoName(curReg.code)} 지도에서 보기`} /> : null}</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5 min-[1600px]:grid-cols-3">
          <Card variant="board" className={ringable(cur.p.includes('p-trend'))} render={<section id="p-trend" aria-label="지연·주의 추이" />}>
            <div className={phead}>
              <h2 className={ptitle} title="지연·주의 사업의 계획 호수(호) · 2025.01~2026.09 소급 판정, 2026.10부터 월 관측">지연·주의 추이</h2>
              <InfoTip label="지연·주의 추이 읽는 법" className="-ml-2">
                <p>지연·주의 사업의 계획 호수(호). 2025.01~2026.09 는 건축HUB 과거 판으로 소급 판정, 2026.10부터 월 관측입니다.</p>
                <p>위 숫자 = 선택 달 값과 전월 대비 증감. 원천이 추가된 달은 판정 대상이 바뀌어 '비교 불가'{scopeFrom !== undefined ? ` · ${SCOPE_TAG(ml(T, scopeFrom))} — 그 앞 소급 판정은 후보 포함(리본의 구분선과 같은 달)` : ''}.</p>
              </InfoTip>
              {ledgerChip}
              <span data-slot="trend-unit" className="ml-auto text-[12px] whitespace-nowrap text-muted-foreground" title="선·이름표의 숫자는 지연·주의 사업의 계획 호수">단위 호</span>
            </div>
            {/* 선택 달 값(큰 숫자): 판정 달의 지연·주의 호수와 전월 대비(원천 추가·판정 기준 변경 달은 '비교 불가') */}
            <div data-slot="trend-now" className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 tabular-nums">
              {([['지연', 'text-bad', tsel?.d, tsel?.dd], ['주의', 'text-warn', tsel?.w, tsel?.dw]] as const).map(([name, tone, val, dv]) => (
                <span key={name} className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span className={cn('text-[14px] font-bold', tone)}>{name}</span>
                  <b className={cn(disp, 'text-[26px] leading-[1.1] font-normal text-foreground')}>{val === undefined ? '—' : f(val)}</b>
                  {dv === undefined ? null : amSel ? <span className="text-[12px] text-muted-foreground" title={`${amTip(amSel)} — 전월 대비 증감을 내지 않음(${amSel.m === SF ? '판정 기준 변경' : '원천 추가'}으로 판정 대상이 바뀜)`}>비교 불가</span> : <span className="text-[12px] text-muted-foreground">{sg(dv)}</span>}
                </span>
              ))}
              <span className="ml-auto text-[12px] whitespace-nowrap text-muted-foreground" title={jsel >= 0 && jsel < oldEnd ? `${ml(T, jsel)} 판정은 소급 이력이라 사업 번호가 없는 후보를 포함 — ${ml(T, oldEnd)}부터와 비교 불가` : '사업 번호가 있는 사업의 판정'}>{jsel >= 0 ? `${ml(T, jsel)} ${jsel < oldEnd ? '소급 · 후보 포함' : '판정'}` : '판정 없음'}</span>
            </div>
            {/* 선·격자는 non-scaling-stroke 로 화면 px 굵기를 지키고(1px 미만 흐림 방지, 계획서 14절 T2), 점·글자는 선 위에 겹친 HTML 이라 폭이 줄어도 크기가 그대로다 */}
            <div data-slot="trend-plot" className="relative mt-2 min-h-[110px] flex-1">
              {oldEnd > 0 ? (
                <div data-slot="trend-old" className="absolute inset-y-0 left-0 rounded-[4px] [background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_14%,transparent)_0_1.5px,transparent_1.5px_6px)]" style={{ width: tpc(oldEnd) }} title={`${ml(T, t0)}~${ml(T, oldEnd - 1)}: 건축HUB 과거 판 소급 판정(번호 없는 후보 포함) — ${SCOPE_TAG(ml(T, oldEnd))}이라 이어서 비교할 수 없음`} aria-hidden="true">
                  <span className="absolute top-0 left-1 text-[12px] leading-4 whitespace-nowrap text-muted-foreground">이전 기준 · 후보 포함{tf ? ` · 지연 ${f(tf.d)}` : ''}</span>
                </div>
              ) : null}
              <svg id="trend" className="absolute inset-0 size-full" viewBox="0 0 560 100" preserveAspectRatio="none" role="img" aria-label={`지연과 주의 호수 추이, ${ml(T, t0)}부터 ${ml(T, NOW)}까지. ${tf ? `${ml(T, t0)} 지연 ${f(tf.d)}호, 주의 ${f(tf.w)}호. ` : ''}${tsel ? (amSel ? `${ml(T, cc)} 지연 ${f(tsel.d)}호, 주의 ${f(tsel.w)}호(${amName(amSel)}으로 전월과 비교 불가).` : `${ml(T, cc)} 지연 ${f(tsel.d)}호(전월 대비 ${sg(tsel.dd)}), 주의 ${f(tsel.w)}호(${sg(tsel.dw)}).`) : `${ml(T, cc)} 판정 없음.`}${AM.map((a) => ` ${a.m === SF ? SCOPE_TAG(ml(T, a.m)) : `${ml(T, a.m)} 원천 추가`}.`).join('')}${oldEnd > 0 ? ` 빗금 구간(${ml(T, oldEnd - 1)}까지)은 후보 포함 소급 값이라 점선입니다.` : ''}`}>
                {[0.25, 0.5, 0.75].map((fr) => <line key={fr} x1="0" y1={ty(tmax * fr)} x2="560" y2={ty(tmax * fr)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
                {AM.map((a) => <line key={a.m} data-added-mark x1={tx(a.m)} y1="1" x2={tx(a.m)} y2="99" stroke="var(--muted-foreground)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"><title>{amTip(a)}</title></line>)}
                <g className="q-sweep">
                  {oldEnd > 0 ? <><polyline points={pts('w', 0, oldEnd)} fill="none" stroke="var(--warn)" strokeWidth="1.8" strokeDasharray="5 3" opacity=".75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /><polyline points={pts('d', 0, oldEnd)} fill="none" stroke="var(--bad)" strokeWidth="2" strokeDasharray="5 3" opacity=".75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></> : null}
                  <polyline points={pts('w', oldEnd, NOW + 1)} fill="none" stroke="var(--warn)" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /><polyline points={pts('d', oldEnd, NOW + 1)} fill="none" stroke="var(--bad)" strokeWidth="2.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </g>
                <line x1={tx(cc)} y1="1" x2={tx(cc)} y2="99" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {AM.map((a) => <span key={a.m} data-added-label className="absolute bottom-0 -translate-x-full whitespace-nowrap bg-card pr-1 text-[12px] leading-4 text-muted-foreground" style={{ left: tpc(a.m) }} title={amTip(a)}>{amName(a)}</span>)}
                {newPts.flatMap(({ m, r }) => ([['bg-bad', r.d], ['bg-warn', r.w]] as const).map(([c, val]) => <i key={`${m}${c}`} className={cn('absolute block size-2 -translate-1/2 rounded-full', c)} style={{ left: tpc(m), top: `${ty(val)}%` }} />))}
                {ct ? ([['bg-bad', ct.d], ['bg-warn', ct.w]] as const).map(([c, val]) => <i key={c} className={cn('absolute block size-3 -translate-1/2 rounded-full border-[1.5px] border-card', c)} style={{ left: tpc(cc), top: `${ty(val)}%` }} />) : null}
              </div>
            </div>
            <div className={cn(sub, 'mt-0.5 flex justify-between')}><span>{ml(T, 0)}</span><span>{ml(T, NOW)}</span></div>
          </Card>

          <Card variant="board" className={ringable(cur.p.includes('p-fut'))} render={<section id="p-fut" aria-label={AHEAD_COMPLETION} />}>
            <div className={phead}>
              <h2 className={ptitle} title={`${basisLine} · 준공 실제 기록이 없는 사업의 현재 예정 준공 달 · 월별 호수`}>{AHEAD_COMPLETION}</h2>
              <InfoTip label="준공 예정 기준" className="-ml-2">
                <p>준공 실제 기록이 없는 사업의 현재 예정 준공 달(같은 사업은 한 번), 월별 호수. 사업 화면의 '{AHEAD_COMPLETION}'·지역 공급의 준공 칩과 같은 범위·같은 값입니다.</p>
                <p>LH 후보의 예정일은 LH 파일 기준일({dotDates(real.lhAsOf)}) 값{lhStale ? ` — ${lhStale}(원장 기준일 ${dotDates(L.referenceDate)} 기준)` : ''}. 막대를 누르면 그 달을 고르고, 지난 준공 실적은 월 상세·지역별 화면에서 봅니다.</p>
                <p className="text-muted-foreground">{scope}</p>
              </InfoTip>
              {ledgerChip}
              <span className={pacts}><PanelLink href="/agency/lh" full="LH 준공 예정 상세">LH 상세</PanelLink></span>
            </div>
            <div className="mt-2 flex items-baseline gap-2"><b className={cn(disp, 'text-[30px] leading-[1.1] font-normal')}>{f(upSum)}<small className="text-[18px]">호</small></b><span className="text-[14px] text-muted-foreground">{f(upProj)}건</span>
              {valid.has(fu.ym) ? <span data-slot="fut-month" className="ml-auto tabular-nums"><PanelLink href={`/month/${fu.ym}`} full={`${ymDot(fu.ym)} 준공 예정 ${f(fu.projects)}건 ${f(fu.units)}호 — 월 상세(같은 합계)`}>{Number(fu.ym.slice(5))}월 {f(fu.units)}호</PanelLink></span> : null}</div>
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
              <h2 className={ptitle} title={`${basisLine} · 기관별 정상·주의·지연 호수 · 오른쪽 = 지연 호수와 ${whole} 지연 중 몫`}>기관별 진행</h2>
              <InfoTip label="기관별 진행 기준" className="-ml-2">
                <p>막대 = 기관 사업 호수의 정상·주의·지연(사업 번호가 있는 사업의 판정) · {CAND_TEXT}(빗금) · {NONE_TEXT}.</p>
                <p>오른쪽 = 지연 호수와 {whole} 지연 중 몫({whole} 지연 {f(J.delay.units)}호 중 그 기관 몫 — LH 100.0% = 지연이 모두 LH 사업). {NONE_TIP}.</p>
                <p className="text-muted-foreground">{scope}</p>
              </InfoTip>
              {ledgerChip}
              <div className={phgroup}>
                <span className={legend} title={`막대 색: 정상 · 주의 · 지연 · 확인 필요(후보, 빗금) · ${NONE_TEXT} 호수 — ${NONE_TIP}`}>{[['bg-ok', '정상'], ['bg-warn', '주의'], ['bg-bad', '지연'], [candHatch, '확인 필요'], ['bg-[var(--out)] shadow-[inset_0_0_0_1px_var(--out-line)]', NONE_TEXT]].map(([c, n]) => <Key key={n} className={cn('size-2', c)}>{n}</Key>)}</span>
                <span className={pacts}><PanelLink href="/projects?sido=all" full="사업 목록(전국) — 기관 메뉴로 거르기">기관별 사업</PanelLink></span>
              </div>
            </div>
            <div className={ags}>
              {/* 열 머리: 오른쪽 % 가 무엇의 비율인지(전국 지연 중 몫 = 전국 지연 호수 중 그 기관 몫, 2026-10-16 4차) */}
              <div data-slot="agency-head" className={cn(ag, '-mb-3 text-[12px] text-muted-foreground mobile:-mb-1')} aria-hidden="true"><span /><span className="mobile:hidden" /><span className="text-right" title={`지연 호수 · ${whole} 지연 중 몫 = ${whole} 지연 ${f(J.delay.units)}호 중 그 기관 몫`}>지연 · {whole} 지연 중 몫</span></div>
              {L.agencies.filter((a) => a.projects).map((a, ai) => {
                const out = a.units - a.okUnits - a.cautionUnits - a.delayUnits, cand = a.candidateUnits ?? 0, none = out - cand, pw = (n: number) => `${(n / a.units * 100).toFixed(1)}%`;   // out = 판정하지 않은 호수 = 확인 필요(후보) + 일정 정보 없음(none)
                return (
                  <div key={a.id} className={ag} title={`${a.name} ${f(a.units)}호 — 정상 ${f(a.okUnits)} · 주의 ${f(a.cautionUnits)} · 지연 ${f(a.delayUnits)} · ${CAND_TEXT} ${f(cand)} · ${NONE_TEXT} ${f(none)}호${a.excludedUnits ? `(판정 제외 ${f(a.excludedUnits)}호 포함)` : ''}. ${a.id === 'unknown' ? `사업 ${f(a.projects)}건 — ` : ''}${dotDates(a.note ?? '')}`}>
                    <div className={agName}><b>{a.id === 'unknown' ? AGENCY_NAME.etc : a.name}</b><span className="text-[13px] font-normal text-muted-foreground">{f(a.units)}호</span></div>
                    <div className={cn(bar3, 'q-grow-x h-3 mobile:col-span-full mobile:row-start-2')} style={{ ['--i' as string]: ai }} role="img" aria-label={`${a.name} ${f(a.units)}호: 정상 ${f(a.okUnits)} 주의 ${f(a.cautionUnits)} 지연 ${f(a.delayUnits)} ${CAND_TEXT} ${f(cand)} ${NONE_TEXT} ${f(none)}`}>
                      <span className="block bg-ok" style={{ width: pw(a.okUnits) }} /><span className="block bg-warn" style={{ width: pw(a.cautionUnits) }} /><span className="block bg-bad" style={{ width: pw(a.delayUnits) }} /><span className={cn('block', candHatch)} style={{ width: pw(cand) }} /><span className="block bg-[var(--out)]" style={{ width: pw(none) }} />
                    </div>
                    <div className={agVal} title={`지연 ${f(a.delayUnits)}호 — ${whole} 지연 ${f(J.delay.units)}호 중 ${a.name} 몫`}><b className={cn(disp, 'text-bad')}>{f(a.delayUnits)}<small className="text-[14px]">호</small></b><span className="text-[13px] text-muted-foreground">몫 {(J.delay.units ? a.delayUnits / J.delay.units * 100 : 0).toFixed(1)}%</span></div>
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
