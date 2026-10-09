'use client';
/* 종합상황판(/) — 시안 이식. 시안의 동작(지시 6건 순환·월별 리본 차트·재생·시점 이동·범례 강조·시도·데이터 흐름)을 그대로 두고,
   수치는 시안의 SAMPLE 이다(위젯마다 SAMPLE 표지). 실데이터가 있는 위젯(향후 12개월 LH 준공 예정, 원천 수)은 실제 값이고 '실데이터' 표지가 붙는다.
   실데이터 행(월별 실적·시행주체별)은 서버 컴포넌트(RealPanels)를 middle 로 받아 가운데에 끼운다. */
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AD, AG, AW, C, CIR, JUMPS, K, LAST, NOW, PITCH, PW, PX0, RANGE, RCOL, RLAB, REG, VW,
  argmax, dStage, f, ip, kind, makeDir, makeFL, ml, r10, rcls, sg, tot, txRegion, txSnap, txTrend, vals, ymOf, yr,
} from '../../lib/board/sample';
import { CUR, HOVER, RIBBON, chartStatic, ribbonDynamic } from './ribbon';

export type BoardReal = {
  sourceCount: number;                                              // 원천 카탈로그의 원천 수
  validMonths: string[];                                            // /month/{ym} 이 열리는 달
  lh: { ym: string; units: number; blocks: number }[];              // NOW(2026.10)부터 12개월 LH 준공 예정
  lhAsOf: string;                                                   // LH 파일 기준일
  lhAgeMonths: number;                                              // 기준일이 실적 마지막 달보다 몇 개월 묵었나
  actualMonth: string;                                              // 통계누리 실적의 마지막 달(YYYY-MM)
};

/* 문구가 바뀌어도 칸 높이가 변하지 않게 가장 긴 문구를 보이지 않게 겹쳐 둔다(시안 reserve) */
function Reserve({ live, list, className }: { live: ReactNode; list: string[]; className?: string }) {
  const sizes = Array.from(new Set(list)).sort((a, b) => b.length - a.length).slice(0, 3);
  return <span className={`stk${className ? ` ${className}` : ''}`}><span className="live">{live}</span>{sizes.map((t, i) => <span key={i} className="sz" aria-hidden="true">{t}</span>)}</span>;
}

const Sample = () => <span className="tag tsample" title="시안용 SAMPLE 수치입니다. 실제 자료가 아닙니다.">SAMPLE</span>;
const Real = ({ title }: { title: string }) => <span className="tag treal" title={title}>실데이터</span>;

export default function Board({ real, middle }: { real: BoardReal; middle: ReactNode }) {
  const [focus, setFocus] = useState(1);
  const [cursor, setCursor] = useState(NOW);
  const [playing, setPlaying] = useState(false);
  const [tour, setTour] = useState(false);
  const [tick, setTick] = useState(0);
  const [hl, setHl] = useState(-1);
  const [region, setRegion] = useState('서울');
  const [fn, setFn] = useState(0);
  const [tip, setTip] = useState<{ m: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const DIR = useMemo(() => makeDir(real.sourceCount), [real.sourceCount]);
  const FL = useMemo(() => makeFL(real.sourceCount), [real.sourceCount]);
  const valid = useMemo(() => new Set(real.validMonths), [real.validMonths]);
  const staticSvg = useMemo(() => chartStatic(hl), [hl]);
  const dynSvg = useMemo(() => ribbonDynamic(cursor), [cursor]);

  useEffect(() => { setTour(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);   // 시안: reduce 이면 순환 끔
  useEffect(() => {   // 재생: 420 ms 마다 한 달
    if (!playing) return;
    const id = setInterval(() => setCursor((c) => { if (c >= LAST) { setPlaying(false); return c; } return c + 1; }), 420);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => {   // 지시 순환: 1 초 틱, 7 초마다 다음 지시
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (tour && tick > 0 && tick % 7 === 0) setFocus((x) => (x % 6) + 1); }, [tick, tour]);

  const goto = (m: number, keepPlay = false) => { setCursor(Math.max(0, Math.min(LAST, m))); if (!keepPlay) setPlaying(false); };
  const monthAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const m = Math.floor(((clientX - r.left) * (VW / r.width) - PX0) / PITCH);
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

  /* 선택 시점의 값 */
  const v = vals(cursor), nv = vals(NOW), past = cursor <= NOW, ds = dStage(cursor), bk = argmax(ds);
  const d = r10(ip(AD, cursor)), w = r10(ip(AW, cursor)), tt = tot(cursor), ok = tt - d - w, pct = (x: number) => (x / tt * 100).toFixed(1) + '%';
  const cc = Math.min(cursor, NOW), tx = (m: number) => (m * 560 / NOW).toFixed(1), ty = (val: number) => (190 - val / 20000 * 180).toFixed(1);
  const pts = (arr: [number, number][]) => RANGE.slice(0, NOW + 1).map((m) => tx(m) + ',' + ty(ip(arr, m))).join(' ');
  const fi = cursor - NOW, hasFut = fi >= 0 && fi < 12;
  const maxLh = Math.max(1, ...real.lh.map((m) => m.units));
  const cur = DIR[focus - 1];
  const curReg = REG.find((r) => r.n === region)!;
  const monthLink = valid.has(ymOf(cursor)) ? `/month/${ymOf(cursor)}` : null;
  const tipView = tip ? tipOf(tip.m) : null;
  const futRead = hasFut
    ? `${ml(cursor)} 예정 — LH 준공 ${f(real.lh[fi].units)}세대 · ${real.lh[fi].blocks}블록`
    : cursor < NOW ? `지난 시점(${ml(cursor)})의 준공 실적은 월 상세·지역별 화면에서 봅니다.` : '이 시점은 12개월 예정 범위(2026.10~2027.09) 밖입니다.';
  const futList = [`${ml(NOW)} 예정 — LH 준공 ${f(maxLh)}세대 · 99블록`, '지난 시점(2025.01)의 준공 실적은 월 상세·지역별 화면에서 봅니다.', '이 시점은 12개월 예정 범위(2026.10~2027.09) 밖입니다.'];

  function tipOf(m: number) {
    const vv = vals(m), dd = dStage(m), b = argmax(dd);
    return { m, vv, dd, b };
  }

  return (
    <div className="board">
      <div className="app">
        <header className="top">
          <div className="brand"><div className="cap"><b>주택공급 종합상황판</b><span>계획에서 입주까지, 대한민국 주택공급의 흐름을 한눈에</span></div></div>
          <div className="tags">
            <span className="tag" style={{ background: '#FFE08A', color: '#3B2B00' }} title="시안의 수치는 SAMPLE입니다. '실데이터' 표지가 붙은 위젯만 실제 자료이고, 각각 자료의 기준일을 함께 보입니다.">SAMPLE 시안 수치 · &lsquo;실데이터&rsquo; 표지만 실제 자료</span>
            <span className="sub">시안 기준일 2026-10-07 · 실적 자료는 {real.actualMonth.replace('-', '.')}까지</span>
          </div>
        </header>

        <section aria-label="총리 지시 6건">
          <div className="dirs">
            {DIR.map((x, i) => (
              <button key={i} type="button" className="dir" aria-pressed={i === focus - 1} onClick={() => { setFocus(i + 1); setTour(false); }}
                aria-label={x.dv !== undefined ? `${x.t} ${x.m}, 전월 대비 ${Math.abs(x.dv).toFixed(1)}%p ${x.dv >= 0 ? '상승' : '하락'}` : undefined}>
                <span className="d">{x.date} · {x.t}</span>
                <span className="mrow"><span className="m disp">{x.m}</span>
                  {x.dv !== undefined ? <span className="dv" style={{ color: x.dv >= 0 ? 'var(--ok)' : 'var(--bad)' }}><span>{x.dv >= 0 ? '▲' : '▼'} {Math.abs(x.dv).toFixed(1)}%p</span><small>전월 대비</small></span> : null}
                </span>
                <span className="bar" style={{ width: i === focus - 1 && tour ? `${(((tick % 7) + 1) / 7 * 100).toFixed(0)}%` : '0' }} />
              </button>
            ))}
          </div>
          <div className="quote"><span className="tag">지시 요지</span><Reserve live={cur.q} list={DIR.map((x) => x.q)} /></div>
        </section>

        <div className="hero">
          <section className={`pnl ringable${cur.p.includes('p-chart') ? ' ring' : ''}`} id="p-chart" aria-label="월별 공급 파동">
            <div className="ph">
              <h2 className="ptitle disp">월별 공급 파동 <Sample /> <small>· 연도별 총량에 따른 단계별 위치 · 2026.10까지 실적, 이후 예정(빗금)</small></h2>
              <div className="blegend" role="group" aria-label="단계 범례 (누르면 해당 단계를 강조)">
                {K.map((k, i) => <button key={k} type="button" aria-pressed={hl === i} onClick={() => setHl(hl === i ? -1 : i)}><i style={{ background: C[i] }} />{k}</button>)}
              </div>
            </div>
            <div className="chartwrap" ref={wrapRef}
              onPointerMove={(e) => { const m = monthAt(e.clientX); if (m < 0) setTip(null); else { const wr = wrapRef.current!.getBoundingClientRect(); setTip({ m, x: e.clientX - wr.left, y: e.clientY - wr.top }); } }}
              onPointerLeave={() => setTip(null)}
              onClick={(e) => { const m = monthAt(e.clientX); if (m >= 0) goto(m); }}>
              <svg id="chart" ref={svgRef} viewBox="0 0 960 400" role="img" aria-label="2025년 1월부터 2028년 10월까지 단계별 호수를 쌓은 월별 리본. 연도별 총량에 따라 굵기가 달라지고, 층 안의 붉은 띠가 단계별 지연 호수이며 핀이 병목 단계를 가리킵니다. 아래 슬라이더로 시점을 고릅니다.">
                <g dangerouslySetInnerHTML={{ __html: staticSvg }} />
                <g pointerEvents="none" dangerouslySetInnerHTML={{ __html: dynSvg }} />
                <rect x={(RIBBON.PX0 + (tip ? tip.m : 0) * RIBBON.PITCH).toFixed(1)} y={RIBBON.TOP - 4} width={RIBBON.PITCH.toFixed(1)} height={RIBBON.PH + 8} fill={HOVER.fill} fillOpacity={HOVER.opacity} visibility={tip ? 'visible' : 'hidden'} pointerEvents="none" />
                <rect x={(PX0 + cursor * PW / (LAST + 1)).toFixed(1)} y={RIBBON.TOP - 4} width={RIBBON.PITCH.toFixed(1)} height={RIBBON.PH + 8} rx="3" fill="none" stroke={CUR.stroke} strokeWidth={CUR.width} pointerEvents="none" />
              </svg>
              <div className="tip" ref={tipRef} hidden={!tip}>
                {tipView ? (
                  <>
                    <div className="tl"><b className="disp" style={{ fontSize: 16 }}>{ml(tipView.m)}</b><span className="tag" style={{ background: tipView.m <= NOW ? 'var(--ink)' : 'var(--acc)', color: tipView.m <= NOW ? 'var(--bg)' : 'var(--acc-ink)' }}>{kind(tipView.m)}</span></div>
                    <div className="sub" style={{ marginBottom: 3 }}>{2025 + yr(tipView.m)}년 총량 {f(tot(tipView.m))}호</div>
                    {K.map((k, i) => <div key={k} className="tr"><span><i style={{ background: C[i] }} />{CIR[i]} {k}</span><b className="disp">{f(r10(tipView.vv[i]))}</b></div>)}
                    <div style={{ marginTop: 3, paddingTop: 3, borderTop: '1px solid var(--line)' }}>
                      {tipView.m <= NOW ? <><div className="tr"><span style={{ color: 'var(--bad)' }}>지연</span><b className="disp">{f(r10(ip(AD, tipView.m)))}</b></div><div className="tr"><span style={{ color: 'var(--warn)' }}>주의</span><b className="disp">{f(r10(ip(AW, tipView.m)))}</b></div></> : null}
                      <div className="tr"><span style={{ color: 'var(--acc)' }}>병목 · {K[tipView.b]}</span><b className="disp">{f(r10(tipView.dd[tipView.b]))}</b></div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="ctrl">
              <button type="button" className="play" aria-label={playing ? '일시정지' : '재생'} onClick={() => { if (!playing && cursor >= LAST) { setCursor(0); setPlaying(true); } else setPlaying(!playing); }}>
                {playing
                  ? <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="4" y="3" width="4" height="14" fill="#2A0E04" /><rect x="12" y="3" width="4" height="14" fill="#2A0E04" /></svg>
                  : <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 3 L17 10 L5 17 Z" fill="#2A0E04" /></svg>}
              </button>
              <div className="slider"><input type="range" min={0} max={LAST} step={1} value={cursor} aria-label="시점 선택 (2025.01 ~ 2028.10)" aria-valuetext={`${ml(cursor)} ${kind(cursor)}`} onChange={(e) => goto(Number(e.target.value))} /></div>
              <div className="jumps" role="group" aria-label="시점 바로가기">{JUMPS.map(([l, m]) => <button key={l} type="button" aria-pressed={cursor === m} onClick={() => goto(m)}>{l}</button>)}</div>
              <button type="button" className="tour" aria-pressed={tour} onClick={() => setTour(!tour)}>순환 표시 <span>{tour ? '켜짐' : '꺼짐'}</span></button>
            </div>
          </section>

          <section className="pnl" id="p-snap" aria-label="선택 시점의 판정과 단계별 호수">
            <div className="snaphead">
              <h2 className="ptitle disp">{ml(cursor)}</h2>
              <span className="tag" style={{ background: past ? 'var(--ink)' : 'var(--acc)', color: past ? 'var(--bg)' : 'var(--acc-ink)' }}>{kind(cursor)}</span>
              <Sample />
            </div>
            <div className="sumA">
              <div className="bar" role="img" aria-label={`전체 ${f(tt)}호 중 지연 ${pct(d)}, 주의 ${pct(w)}, 정상 ${pct(ok)}`}>
                <span className="d" style={{ width: `${(d / tt * 100).toFixed(2)}%` }} /><span className="w" style={{ width: `${(w / tt * 100).toFixed(2)}%` }} /><span className="o" style={{ width: `${(ok / tt * 100).toFixed(2)}%` }} />
              </div>
              <div className="leg">
                <div className="lgi"><div className="lb"><i className="d" />지연<em>{pct(d)}</em></div><b style={{ color: 'var(--bad)' }}>{f(d)}<small>호</small></b></div>
                <div className="lgi"><div className="lb"><i className="w" />주의<em>{pct(w)}</em></div><b style={{ color: 'var(--warn)' }}>{f(w)}<small>호</small></b></div>
                <div className="lgi"><div className="lb"><i className="o" />정상<em>{pct(ok)}</em></div><b style={{ color: 'var(--ok)' }}>{f(ok)}<small>호</small></b></div>
              </div>
            </div>
            <div className="sub" style={{ marginTop: 6 }}><Reserve live={txSnap(cursor)} list={[txSnap(LAST), 'x']} /></div>
            <div className="srows" aria-label="단계별 호수, 현재 대비 증감, 지연 호수">
              {K.map((k, i) => {
                const dlt = r10(v[i] - nv[i]);
                return (
                  <div key={k} className={`srow${i === bk ? ' hot' : ''}`}>
                    <span className="k"><i style={{ background: C[i] }} />{CIR[i]} {k}<span className="bn tag">병목</span></span>
                    <span className="v disp">{f(r10(v[i]))}</span>
                    <span className="dl" style={{ color: dlt === 0 ? 'var(--mute)' : dlt > 0 ? '#7FE3B8' : '#FFB86B' }}>{dlt === 0 ? '현재' : sg(dlt)}</span>
                    <span className="dy">지연 {f(r10(ds[i]))}</span>
                  </div>
                );
              })}
            </div>
            <p className="plink"><Link href={`/stage/0${bk + 1}`}>병목 단계({K[bk]}) 상세 →</Link>{monthLink ? <> · <a href={monthLink}>{ml(cursor)} 월 상세 →</a></> : null}</p>
          </section>
        </div>

        {middle}

        <div className="row3">
          <section className={`pnl ringable${cur.p.includes('p-trend') ? ' ring' : ''}`} id="p-trend" aria-label="지연·주의 추이">
            <h2 className="ptitle disp">지연·주의 추이 <Sample /> <small>· 호 · 실적 기준</small></h2>
            <svg id="trend" viewBox="0 0 560 200" role="img" aria-label="지연과 주의 호수 추이" style={{ display: 'block', width: '100%', height: 'auto', marginTop: 6 }}>
              <line x1="0" y1="55" x2="560" y2="55" stroke="#22305E" /><line x1="0" y1="100" x2="560" y2="100" stroke="#22305E" /><line x1="0" y1="145" x2="560" y2="145" stroke="#22305E" />
              <polyline points={pts(AW)} fill="none" stroke="#FFC24D" strokeWidth="2.4" /><polyline points={pts(AD)} fill="none" stroke="#FF6B88" strokeWidth="2.8" />
              <line x1={tx(cc)} y1="6" x2={tx(cc)} y2="194" stroke="#FF8A65" strokeWidth="2" />
              <circle cx={tx(cc)} cy={ty(ip(AD, cc))} r="4.5" fill="#FF6B88" /><circle cx={tx(cc)} cy={ty(ip(AW, cc))} r="4.5" fill="#FFC24D" />
            </svg>
            <div className="sub" style={{ display: 'flex', justifyContent: 'space-between' }}><span>2025.01</span><span>2026.10</span></div>
            <div className="sub" style={{ marginTop: 6, color: 'var(--ink2)' }}><Reserve live={txTrend(cursor)} list={RANGE.map(txTrend)} /></div>
          </section>

          <section className={`pnl ringable${cur.p.includes('p-fut') ? ' ring' : ''}`} id="p-fut" aria-label="향후 12개월 공급 예정">
            <h2 className="ptitle disp">향후 12개월 공급 예정 <Real title={`LH 공공주택 준공예정현황(15141761), 파일 기준일 ${real.lhAsOf}`} /> <small>· 준공 예정(LH) 월별 (세대)</small></h2>
            <svg id="fmonths" viewBox="0 0 240 100" preserveAspectRatio="none" role="img" aria-label="2026.10부터 2027.09까지 월별 LH 준공 예정 세대수" style={{ marginTop: 12 }}>
              {real.lh.map((m, i) => { const h = m.units / maxLh * 92; return <rect key={m.ym} x={i * 20 + 1.5} y={(100 - h).toFixed(1)} width="17" height={Math.max(h - 0.6, 0.4).toFixed(1)} fill={C[4]}><title>{`${m.ym.replace('-', '.')} LH 준공 예정 ${f(m.units)}세대 · ${m.blocks}블록`}</title></rect>; })}
              <rect x={fi * 20 + 0.5} y="1" width="20" height="99" rx="1" fill="none" stroke="#FFFFFF" strokeWidth="2" style={{ vectorEffect: 'non-scaling-stroke' }} visibility={hasFut ? 'visible' : 'hidden'} />
            </svg>
            <div className="sub" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}><span>2026.10</span><span>2027.03</span><span>2027.09</span></div>
            <div className="sub" style={{ marginTop: 8, color: 'var(--ink2)' }}><Reserve live={futRead} list={futList} /></div>
            <p className="sub" style={{ marginTop: 6 }}>착공·모집·입주 예정의 월별 자료는 원천이 없어 비어 있습니다. LH 파일은 기준일(<b>{real.lhAsOf}</b>)이 실적 자료보다 {real.lhAgeMonths}개월 묵었습니다.</p>
            <p className="plink"><Link href="/agency/lh">LH 준공 예정 상세 →</Link></p>
          </section>

          <section className={`pnl ringable${cur.p.includes('p-agency') ? ' ring' : ''}`} id="p-agency" aria-label="기관별 진행">
            <h2 className="ptitle disp">기관별 진행 <Sample /> <small>· 호 · 지연은 전체 지연 10,000호 중 비중</small></h2>
            <div className="ags">
              {AG.map((a) => {
                const t = a[1] + a[2] + a[3];
                return (
                  <div key={a[0]} className="ag">
                    <div className="an"><b>{a[0]}</b><span className="sub">{f(t)}호</span></div>
                    <div className="bar3" style={{ height: 12 }}>
                      <span style={{ width: `${(a[1] / t * 100).toFixed(1)}%`, background: 'var(--ok)' }} /><span style={{ width: `${(a[2] / t * 100).toFixed(1)}%`, background: 'var(--warn)' }} /><span style={{ width: `${(a[3] / t * 100).toFixed(1)}%`, background: 'var(--bad)' }} />
                    </div>
                    <div className="ad"><b className="disp" style={{ color: 'var(--bad)' }}>{f(a[3])}</b><span className="sub">· {(a[3] / 100).toFixed(0)}%</span></div>
                  </div>
                );
              })}
            </div>
            <div className="sub" style={{ marginTop: 8 }}>군인 특별공급(국방부)은 수작업 입력 대기 상태입니다.</div>
            <p className="plink"><Link href="/agency">기관별 실데이터(시행주체별 호수) →</Link></p>
          </section>
        </div>

        <div className="row2">
          <section className={`pnl ringable${cur.p.includes('p-region') ? ' ring' : ''}`} id="p-region" aria-label="전국 17개 시도">
            <h2 className="ptitle disp">전국 17개 시도 <Sample /> <small>· 지연 · 주의 · 정상 (사업 수) · 바탕색 = 지연율 단계</small></h2>
            <div className="rlegend" aria-label="바탕색과 지연율 구간"><span style={{ color: 'var(--ink2)', fontWeight: 700 }}>지연율(%)</span>{RCOL.map((c, i) => <span key={i}><i style={{ background: c }} />{RLAB[i]}</span>)}</div>
            <div className="regions">
              {REG.map((r) => {
                const rate = r.d / r.tot * 100;
                return (
                  <button key={r.n} type="button" className="reg" aria-pressed={r.n === region} onClick={() => setRegion(r.n)} style={{ ['--rc' as string]: RCOL[rcls(rate)] }}
                    aria-label={`${r.n} 지연 ${r.d} 주의 ${r.w} 정상 ${r.ok} 지연율 ${rate.toFixed(1)}%`}>
                    <span className="nm"><span>{r.n}{r.big ? <em>상세</em> : null}</span><span className="rt disp">{rate.toFixed(1)}%</span></span>
                    <span className="num disp"><span style={{ color: 'var(--bad)' }}>{r.d}</span><span style={{ color: 'var(--warn)' }}>{r.w}</span><span style={{ color: 'var(--ok)' }}>{r.ok}</span></span>
                  </button>
                );
              })}
            </div>
            <div className="note"><Reserve live={txRegion(curReg)} list={REG.map(txRegion)} /></div>
            <p className="plink"><Link href={`/area/${curReg.code}`}>{curReg.n} 실적(실데이터) 상세 →</Link>{curReg.code === '12' ? <span className="sub">2026-07부터 광주·전남은 전남광주로 집계됩니다</span> : null}</p>
          </section>

          <section className={`pnl ringable${cur.p.includes('p-flow') ? ' ring' : ''}`} id="p-flow" aria-label="데이터 흐름">
            <h2 className="ptitle disp">데이터 흐름 <small>· 단계를 누르면 설명이 바뀝니다</small></h2>
            <div className="flowv">
              {FL.map((n, i) => (
                <div key={n.k} style={{ display: 'contents' }}>
                  <button type="button" className="fstep" aria-pressed={i === fn} onClick={() => setFn(i)}>
                    <span className="no disp">{i + 1}</span><span><span className="k">{n.k}</span><span className="s">{n.s}</span></span>
                  </button>
                  {i < FL.length - 1 ? <div className="vc" aria-hidden="true" /> : null}
                </div>
              ))}
            </div>
            <div className="note"><Reserve live={FL[fn].t} list={FL.map((x) => x.t)} /></div>
            <p className="plink"><Link href="/sources">데이터 원본(원천 {real.sourceCount}곳, 받은 때와 원천 기준일) →</Link></p>
          </section>
        </div>

        <nav className="more" aria-label="상세 화면"><Link href="/area">지역별</Link><Link href="/projects">사업</Link><Link href="/stage">단계별</Link><Link href="/agency">기관별</Link><Link href="/sources">데이터 원본</Link><a href="/map">지도</a></nav>
      </div>
    </div>
  );
}
