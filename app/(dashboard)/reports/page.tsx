import type { Metadata } from 'next';
import Link from 'next/link';
import Crumbs from '../../../components/Crumbs';
import StageLadder from '../../../components/StageLadder';
import { stageLabel } from '../../../components/StageKpis';
import { ACTOR_COLOR, METRIC_COLOR } from '../../../components/charts/palette';
import { Lede, Page, PageTitle, PanelTitle, kpisGrid, sub } from '../../../components/page';
import { Alert } from '../../../components/ui/alert';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { DataGrid } from '../../../components/ui/data-grid';
import { Basis, Kpi, Prov } from '../../../components/ui';
import { ACTORS, AHEAD_FROM, METRICS, NATION, fmt, isProvisional, lastMonth, lhByMonth, monthLabel, monthsBetween, nextYm, valueAt, ytd } from '../../../lib/board/calc';
import { lh, molit, projects } from '../../../lib/board/data';
import { METRIC_STAGE, STAGES } from '../../../lib/board/stages';
import type { Col, Row } from '../../../lib/grid/spec';

export const metadata: Metadata = { title: '보고자료' };

const FROM = AHEAD_FROM;   // 종합상황판의 '향후 12개월'과 같은 기준 달

/* 증감률(%): 비교할 값이 없으면 null */
const rate = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : (now - before) / before * 100);
const pct = (v: number | null) => (v === null ? '–' : `${v.toFixed(1)}%`);
/* ②·③ 표의 열: 착공·준공 누계와 그 전년 같은 기간 대비(증감은 ▲▼ 색, lib/grid/spec.ts display) */
const cumCols = (first: string): Col[] => [{ key: 'name', label: first, kind: 'text' }, { key: 'st', label: '04 착공 누계' }, { key: 'stYoy', label: '전년 같은 기간 대비', kind: 'delta' }, { key: 'dn', label: '06 준공 누계' }, { key: 'dnYoy', label: '전년 같은 기간 대비', kind: 'delta' }];

/* 보고자료(월간 주택공급 브리핑). 8.14 지시 '매월 진척상황 보고'와 정책 매트릭스의 '정례 보고(기간별 KPI 자동집계)'에 답한다.
   모든 숫자는 실데이터(통계누리·LH 파일·사업 id 레지스트리)를 다른 화면과 같은 계산 함수로 센 값이다. 원천이 없는 것(계획 물량·일정 지연)은 판정하지 않고 그렇다고 적는다. */
export default function ReportsPage() {
  const last = lastMonth(molit), prev = nextYm(last, -1), lastYear = nextYm(last, -12), year = last.slice(0, 4), upto = Number(last.slice(5));
  const prov = isProvisional(molit, last);
  const rows = METRICS.map((k) => {
    const now = valueAt(molit, k, NATION, last), cum = ytd(molit, k, NATION, last), cumLy = ytd(molit, k, NATION, lastYear);
    return { k, now, mom: rate(now, valueAt(molit, k, NATION, prev)), yoy: rate(now, valueAt(molit, k, NATION, lastYear)), cum, cumYoy: rate(cum, cumLy) };
  });
  const actorRows = ACTORS.map((a) => ({ a, start: ytd(molit, 'start', NATION, last, a), startLy: ytd(molit, 'start', NATION, lastYear, a), done: ytd(molit, 'complete', NATION, last, a), doneLy: ytd(molit, 'complete', NATION, lastYear, a) }));
  const pub = (key: 'start' | 'startLy' | 'done' | 'doneLy') => actorRows.filter((r) => r.a !== '민간').reduce((s, r) => s + (r[key] ?? 0), 0);
  const total = (key: 'start' | 'startLy' | 'done' | 'doneLy') => actorRows.reduce((s, r) => s + (r[key] ?? 0), 0);
  const share = (key: 'start' | 'startLy' | 'done' | 'doneLy') => (total(key) ? pub(key) / total(key) * 100 : null);
  const sidoRows = molit.sido.filter((s) => s.code !== NATION).map((s) => {
    const st = ytd(molit, 'start', s.code, last), dn = ytd(molit, 'complete', s.code, last);
    return { ...s, st, stYoy: rate(st, ytd(molit, 'start', s.code, lastYear)), dn, dnYoy: rate(dn, ytd(molit, 'complete', s.code, lastYear)) };
  }).sort((a, b) => (b.st ?? 0) - (a.st ?? 0));
  const nowCols: Col[] = [{ key: 'stage', label: '단계(지표)', kind: 'text' }, { key: 'now', label: `${upto}월` }, { key: 'mom', label: '전월 대비', kind: 'delta' }, { key: 'yoy', label: '전년 같은 달 대비', kind: 'delta' }, { key: 'cum', label: `${year}년 1~${upto}월 누계` }, { key: 'cumYoy', label: '전년 같은 기간 대비', kind: 'delta' }];
  const nowRows: Row[] = STAGES.map((s) => {   // 공급 6단계 6행: 통계누리 지표가 없는 01 정책·02 사업화도 자리를 보인다(계획서 11절)
    const r = rows.find((x) => METRIC_STAGE[x.k] === s.code);
    return r
      ? { id: s.code, c: { stage: { text: stageLabel(r.k), swatch: METRIC_COLOR[r.k] }, now: r.now, mom: r.mom, yoy: r.yoy, cum: r.cum, cumYoy: r.cumYoy } }
      : { id: s.code, muted: true, note: `자료 없음 — 통계누리에 없는 단계${s.code === '01' ? '(계획·목표 물량 원천 없음)' : '(사업별 단계는 ⑤ 사업 단계에서)'}`, c: { stage: { text: `${s.code} ${s.name}`, dashed: true } } };
  });
  const actorGrid: Row[] = [
    ...actorRows.map((r) => ({ id: r.a, c: { name: { text: r.a, swatch: ACTOR_COLOR[r.a] }, st: r.start, stYoy: rate(r.start, r.startLy), dn: r.done, dnYoy: rate(r.done, r.doneLy) } })),
    { id: 'public', pin: 'bottom', c: { name: '공공(지자체·LH·주택업체) 비중', st: { text: pct(share('start')) }, stYoy: { text: `전년 ${pct(share('startLy'))}`, muted: true }, dn: { text: pct(share('done')) }, dnYoy: { text: `전년 ${pct(share('doneLy'))}`, muted: true } } },
  ];
  const ahead = lhByMonth(lh, FROM, 12);
  const sum = (n: number) => ahead.slice(0, n).reduce((s, m) => ({ units: s.units + m.units, blocks: s.blocks + m.blocks }), { units: 0, blocks: 0 });
  const counts = Object.fromEntries(STAGES.map((s) => [s.code, projects.filter((p) => p.stageCode === s.code).length]));
  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '보고자료' }]} />
      <PageTitle>월간 주택공급 브리핑 <Badge variant="ok">실데이터</Badge></PageTitle>
      <Lede>{monthLabel(last)} 기준. 매월 진척상황 보고(8.14 지시)를 위해 상황판의 실데이터를 한 장으로 모았습니다. 숫자는 지역별·기관별·월 상세와 같은 계산입니다{prov ? '(통계누리 잠정치 포함)' : ''}.</Lede>

      <Card render={<section aria-label="이번 달 실적" />}>
        <PanelTitle>① 계획대로 가고 있는가 — 전국 실적 <small className={sub}>· 호 · {monthLabel(last)}{prov ? <Prov /> : null}</small></PanelTitle>
        <DataGrid label="전국 단계별 실적" cols={nowCols} rows={nowRows} sortable={false} />
        <Basis>통계누리 주택건설실적통계(전국). 계획(목표) 물량이 원천에 없어 &lsquo;계획 대비 달성률&rsquo;은 계산하지 않습니다 — 종합상황판의 달성률은 SAMPLE 입니다. 월별 흐름은 <Link href="/area">지역별</Link>, 이 달의 시도 표는 <Link href={`/month/${last}`}>{monthLabel(last)} 월 상세</Link>.</Basis>
      </Card>

      <Card render={<section aria-label="시행주체별 진척" />}>
        <PanelTitle>② 기관별 진척 — 시행주체별 누계 <small className={sub}>· 전국 · 호 · {year}년 1~{upto}월</small></PanelTitle>
        <DataGrid label="시행주체별 누계" cols={cumCols('시행주체')} rows={actorGrid} />
        <Basis>통계누리 시행주체 구분. 지자체·LH·주택업체는 공공, 민간은 민간부문입니다. 기관별 월 흐름은 <Link href="/agency">기관별</Link>.</Basis>
      </Card>

      <Card render={<section aria-label="지역별 진척" />}>
        <PanelTitle>③ 어디서 늘고 줄었는가 — 시도별 누계 <small className={sub}>· 호 · {year}년 1~{upto}월 · 착공 누계가 많은 순</small></PanelTitle>
        <DataGrid label="시도별 누계" cols={cumCols('시도')} rows={sidoRows.map((r) => ({ id: r.code, c: { name: { text: r.name, href: `/area/${r.code}` }, st: r.st, stYoy: r.stYoy, dn: r.dn, dnYoy: r.dnYoy } }))} />
        <Basis>2026-07부터 광주·전남은 &lsquo;전남광주&rsquo;로 집계되고 이전 달은 두 곳을 합산했습니다.</Basis>
      </Card>

      <Card render={<section aria-label="앞으로 공급되는 물량" />}>
        <PanelTitle>④ 앞으로 실제 공급되는 물량 — LH 준공 예정 <small className={sub}>· {monthLabel(FROM)}부터</small></PanelTitle>
        <div className={kpisGrid}>
          {([3, 6, 12] as const).map((n) => <Kpi key={n} label={`향후 ${n}개월`} unit="세대" tone={METRIC_COLOR.complete} value={fmt(sum(n).units)} sub={`${sum(n).blocks}블록 · ${monthLabel(FROM)} ~ ${monthLabel(nextYm(FROM, n - 1))}`} />)}
        </div>
        <Basis>LH 공공주택 준공예정현황(15141761) · 파일 기준일 {lh.sourceAsOf}(실적 자료보다 {Math.max(0, monthsBetween(lh.sourceAsOf.slice(0, 7), last))}개월 묵음). 착공·모집·입주 예정의 월별 원천은 아직 없습니다. 블록별 목록은 <Link href="/agency/lh">LH 준공 예정</Link>, 지역별 달력은 <Link href="/my-area">우리 동네</Link>.</Basis>
      </Card>

      <Card render={<section aria-label="사업 단계" />}>
        <PanelTitle>⑤ 사업은 어느 단계에 있는가 <small className={sub}>· 사업 id 레지스트리 {projects.length}건</small></PanelTitle>
        <StageLadder className="mt-0" counts={counts} />
        <Basis>사업 id 레지스트리 {projects[0].asOf} 기준 5개 시군구라 전국 분포가 아닙니다. 단계는 스펙 9.2 의 제안 매핑입니다.</Basis>
      </Card>

      <Alert>
        <b>판정하지 못하는 것.</b> 원천이 없어 이 보고에서 빠진 항목입니다 — ① 계획 물량 대비 달성률(공급계획 목표치 원천 없음), ② 일정 지연(9.18 지시: 당초·변경·현재 예정 일정이 사업 레코드에 없어 지연 개월을 셀 수 없음), ③ 단계별 병목·머문 기간(단계 진입일 없음). 종합상황판의 해당 위젯은 SAMPLE 입니다.
      </Alert>
    </Page>
  );
}
