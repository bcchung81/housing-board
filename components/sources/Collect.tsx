/* 데이터 원본 ② 수집 상태 · ③ 연도 확보 · ④ 연결. 값은 lib/board/home-sources.ts 가 data/board/home-sources.json(HOME 수집 실행·확보 기록·원장 links 요약)과 원천 카탈로그에서 만든다.
   ② 실패·경고 원천만 표로 펼치고 정상 원천은 기관별로 접는다. ③ 빈틈 없는 원천과 올해 자료만 있는 원천은 한 줄로 접는다. 모든 행이 같은 표지인 열은 그리지 않고 한 번만 말한다.
   상태는 색만으로 알리지 않고 글자도 둔다. 시안: docs/design/home-concept/sources.html */
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { PanelHead } from '../page';
import { Card } from '../ui/card';
import { DataGrid } from '../ui/data-grid';
import { HATCH } from '../ui/chips';
import { GRID_DENSE, type Col, type Row } from '../../lib/grid/spec';
import { GRID_YEARS, LINK_NAME, coverageRows, statusRows, uniformColumns, type CoverageRow, type HomeSources, type StatusRow } from '../../lib/board/home-sources';
import { annualSeries } from '../../lib/board/annual';
import { fmt } from '../../lib/board/calc';
import type { Molit, Source } from '../../lib/board/types';

const KEY = 'flex items-center gap-1 whitespace-nowrap';
const dot = 'block size-[9px] flex-none rounded-[2px]';
const PART = 'color-mix(in srgb, var(--primary) 26%, var(--card))';
const LegendList = ({ children }: { children: ReactNode }) => <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">{children}</ul>;

const COLS: Col[] = [
  { key: 'name', label: '원천', kind: 'text', clip: 'clamp(220px, 100vw - 1000px, 440px)' },
  { key: 'owner', label: '구분', kind: 'text' },
  { key: 'org', label: '기관', kind: 'text', clip: '160px' },
  { key: 'st', label: '상태', kind: 'text' },
  { key: 'runs', label: '수집 실행', kind: 'text' },
  { key: 'last', label: '마지막 정상 수집', kind: 'text' },
  { key: 'asOf', label: '원천 기준일', kind: 'text' },
  { key: 'n', label: '건수' },
];

function issueRow(r: StatusRow): Row {
  return {
    id: `${r.owner}-${r.id}`,
    c: {
      name: { text: r.name, title: r.note }, owner: r.owner, org: r.org,
      st: r.ok ? { text: '경고', swatch: 'var(--warn)', tone: 'warn', title: '마지막 수집이 일부만(부분 수집)', sort: 1 }
        : { text: '실패', swatch: 'var(--bad)', tone: 'bad', title: `마지막 실행 ${r.lastRun ?? ''} 실패${r.lastOk ? ' — 마지막 정상 값을 씀' : ' — 정상 수집 없음'}`, sort: 0 },
      runs: r.runs, last: r.lastOk ?? { na: '없음' }, asOf: r.asOf, n: r.count,
    },
  };
}

export function Collect({ hs, items }: { hs: HomeSources; items: Source[] }) {
  const all = statusRows(hs, items);
  const issues = all.filter((r) => !r.ok || r.warn), okRows = all.filter((r) => r.ok && !r.warn);
  const nFail = all.filter((r) => !r.ok).length, nWarn = all.filter((r) => r.warn).length;
  const rows = issues.map(issueRow);
  /* 모든 행이 같은 표지인 열(예: 구분 모두 HOME · 원천 기준일 없음)은 접는다 */
  const text = (v: Row['c'][string]) => (v === null || v === undefined ? null : typeof v === 'object' ? (v.na !== undefined ? null : v.text ?? null) : String(v));
  const { keep, folded } = uniformColumns(COLS.map((c) => c.key).filter((k) => k !== 'name'), rows.map((r) => Object.fromEntries(Object.entries(r.c).map(([k, v]) => [k, text(v)]))), Object.fromEntries(COLS.map((c) => [c.key, c.label])));
  const cols = COLS.filter((c) => c.key === 'name' || keep.includes(c.key));

  const orgs = new Map<string, StatusRow[]>();
  for (const r of okRows) { if (!orgs.has(r.org)) orgs.set(r.org, []); orgs.get(r.org)!.push(r); }
  const orgList = [...orgs].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'));
  const maxDay = (rs: StatusRow[]) => rs.map((r) => r.lastOk).filter((d): d is string => !!d).sort().pop();
  /* 마지막 줄 빈 칸이 적은 열 수(3·4) */
  const orgCols = [3, 4].sort((x, y) => (x - orgList.length % x) % x - (y - orgList.length % y) % y)[0];

  return (
    <Card render={<section aria-label="수집 상태" />}>
      <PanelHead title={<>수집 상태<span className="ml-2 text-[14px] font-normal text-muted-foreground tabular-nums" title={`우리 원천 ${items.length}곳(원천 카탈로그) · HOME 원천 ${hs.sources.length}곳(덤프 수집 실행 ${fmt(hs.runs.total)}회 중 실패 ${hs.runs.failed}·중단 ${hs.runs.interrupted})`}>{all.length}곳 · 실패 {nFail} · 경고 {nWarn}</span></>}
        tip="실패·경고 원천만 표로 펼치고, 정상 원천은 기관별로 접음(기관 · 원천 수 · 최근 수집일) · 실패 = 마지막 실행 실패(마지막 정상 값을 씀) · 경고 = 마지막 수집이 일부만 · 우리 = 파일로 받아 둔 원천 카탈로그, HOME = 덤프의 수집 실행 결과">
        <LegendList>
          {nFail ? <li className={KEY}><i className={`${dot} rounded-full bg-bad`} aria-hidden="true" />실패</li> : null}
          {nWarn ? <li className={KEY}><i className={`${dot} rounded-full bg-warn`} aria-hidden="true" />경고</li> : null}
          <li className={KEY}><i className={`${dot} rounded-full bg-ok`} aria-hidden="true" />정상</li>
        </LegendList>
      </PanelHead>
      {rows.length ? (
        <>
          {folded.length ? <p className="m-0 text-[13px] text-muted-foreground">{folded.join(' · ')}</p> : null}
          <div className={GRID_DENSE}><DataGrid label="실패·경고 원천" cols={cols} rows={rows} sortable={false} /></div>
        </>
      ) : null}
      <div className={rows.length ? 'mt-4' : undefined}>
        <h3 className="m-0 text-[16px] font-normal text-muted-foreground" title="정상 원천 — 기관을 누르면 원천마다 기준일·건수">정상 {okRows.length}곳 · 기관 {orgList.length}</h3>
        <div className={`mt-1.5 grid ${orgCols === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-x-8 narrow:grid-cols-2 mobile:grid-cols-1`}>
          {orgList.map(([org, rs]) => (
            <details key={org} className="group/o min-w-0 border-b border-border">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[6px] py-1.5 text-[14px] hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 flex-none text-muted-foreground transition-transform group-open/o:rotate-90" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-bold" title={org}>{org}</span>
                <span className="flex-none text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">{rs.length}곳{maxDay(rs) ? ` · ${maxDay(rs)}` : ''}</span>
              </summary>
              <ul className="m-0 list-none p-0 pb-2 pl-5 text-[13px] leading-[1.5]">
                {rs.map((r) => (
                  <li key={`${r.owner}-${r.id}`} className="flex gap-2 py-0.5">
                    <span className="min-w-0 flex-1 truncate" title={`${r.name} · ${r.owner}`}>{r.name}</span>
                    <span className="flex-none text-muted-foreground tabular-nums">{[r.asOf ? `기준 ${r.asOf}` : '', r.count !== null ? fmt(r.count) : ''].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </Card>
  );
}

const MARK = { full: '확보', part: '부분', none: '미확보' } as const;
export function Coverage({ hs, molit }: { hs: HomeSources; molit: Molit }) {
  const cover = coverageRows(hs, annualSeries(molit, 'complete', '00'));
  const now = GRID_YEARS.length - 1;
  /* 빈틈 없는 원천(올해는 진행 중이라 부분도 확보로 셈)과 올해 자료만 있는 원천은 한 줄로 접는다 */
  const isFull = (r: CoverageRow) => r.cells.every((c, i) => c === 'full' || (i === now && c === 'part'));
  const onlyNow = (r: CoverageRow) => r.cells.every((c, i) => (i === now ? c !== 'none' : c === 'none'));
  const rest = cover.filter((r) => !isFull(r) && !onlyNow(r));
  const fold = (rs: CoverageRow[], label: string, tip: string) => (rs.length ? (
    <p className="m-0 mt-2 text-[14px] text-muted-foreground" title={tip}><b className="font-bold text-foreground">{label} {rs.length}곳</b> · {rs.map((r, i) => <span key={r.id} title={r.owner}>{i ? ' · ' : ''}{r.name}</span>)}</p>
  ) : null);
  return (
    <Card render={<section aria-label="연도 확보" />}>
      <PanelHead title="연도 확보" tip={`원천마다 ${GRID_YEARS[0]}~${GRID_YEARS[now]} 자료가 있는지 · 부분은 일부 월·범위만(${GRID_YEARS[now]}은 진행 중인 해) · 통계누리는 월 자료로 센 값, 나머지는 원장의 사건일·공고일·지표 기간과 HOME 확보 기록 · 빈틈 없는 원천과 올해 자료만 있는 원천은 한 줄로 접음`}>
        <LegendList>
          <li className={KEY}><i className={`${dot} bg-primary`} aria-hidden="true" />확보</li>
          <li className={KEY}><i className={dot} style={{ background: PART }} aria-hidden="true" />부분</li>
          <li className={KEY}><i className={`${dot} border border-line2 ${HATCH}`} aria-hidden="true" />미확보</li>
        </LegendList>
      </PanelHead>
      {rest.length ? (
        <div className="overflow-x-auto">
          <div role="table" aria-label="원천별 연도 확보" className="grid min-w-[520px] grid-cols-[minmax(0,320px)_repeat(9,minmax(0,1fr))] items-center gap-1 text-[13px]">
            <div role="row" className="contents">
              <span role="columnheader" />
              {GRID_YEARS.map((y) => <span key={y} role="columnheader" className="text-center text-muted-foreground tabular-nums">{y}</span>)}
            </div>
            {rest.map((r) => (
              <div key={r.id} role="row" className="contents">
                <span role="rowheader" className="truncate" title={`${r.name} · ${r.owner}`}>{r.owner === 'HOME' ? <span className="mr-1 text-[11px] text-muted-foreground">HOME</span> : null}{r.name}</span>
                {r.cells.map((c, i) => (
                  <span key={i} role="cell" title={`${r.name} · ${GRID_YEARS[i]} · ${MARK[c]}`} className={`block h-[18px] rounded-[3px] ${c === 'none' ? `border border-line2 ${HATCH}` : ''}`}
                    style={c === 'full' ? { background: 'var(--primary)' } : c === 'part' ? { background: PART } : undefined}>
                    <span className="sr-only">{MARK[c]}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {fold(cover.filter(isFull), `${GRID_YEARS[0]}~${GRID_YEARS[now]} 빈틈 없음`, `모든 연도 확보(${GRID_YEARS[now]}은 진행 중이라 부분 포함)`)}
      {fold(cover.filter(onlyNow), `${GRID_YEARS[now]} 자료만`, `과거 연도 없이 지금 판(${GRID_YEARS[now]})만 있는 원천 — 예정·현황 스냅샷`)}
    </Card>
  );
}

export function Links({ hs }: { hs: HomeSources }) {
  return (
    <Card render={<section aria-label="연결" />}>
      <PanelHead title="연결" tip="정책–프로그램, 프로그램–사업 연결(사업 원장 links) · 검토 중 = 담당자 확인 전 제안 · 해제된 연결은 빠짐">
        <LegendList>
          <li className={KEY}><i className={`${dot} bg-primary`} aria-hidden="true" />확정</li>
          <li className={KEY}><i className={dot} style={{ background: 'color-mix(in srgb, var(--primary) 30%, var(--card))' }} aria-hidden="true" />검토 중</li>
        </LegendList>
      </PanelHead>
      <div className="mt-3 grid grid-cols-2 gap-x-10 gap-y-5 narrow:grid-cols-1">
        {hs.links.map((l) => {
          const all = l.confirmed + l.review;
          return (
            <div key={l.type} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <b className="text-[15px]">{LINK_NAME[l.type]}</b>
                <span className="text-[13px] text-muted-foreground tabular-nums">검토 중 <b className="text-[15px] text-foreground">{fmt(l.review)}</b> · 확정 <b className="text-[15px] text-foreground">{fmt(l.confirmed)}</b></span>
              </div>
              {all ? (
                <span className="flex h-[14px] gap-px overflow-hidden" role="img" aria-label={`${LINK_NAME[l.type]}: 확정 ${l.confirmed}, 검토 중 ${l.review}`}>
                  {l.confirmed ? <span style={{ width: `${l.confirmed / all * 100}%`, minWidth: 3, background: 'var(--primary)' }} title={`확정 ${fmt(l.confirmed)}`} /> : null}
                  {l.review ? <span style={{ width: `${l.review / all * 100}%`, background: 'color-mix(in srgb, var(--primary) 30%, var(--card))' }} title={`검토 중 ${fmt(l.review)}`} /> : null}
                </span>
              ) : <span className="text-[13px] text-muted-foreground">연결 없음</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
