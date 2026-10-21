/* 데이터 원본 ② 수집 상태 · ③ 연도 확보 · ④ 연결. 값은 lib/board/home-sources.ts 가 data/board/home-sources.json(HOME 수집 실행·정책–프로그램·프로그램–사업 연결은 덤프, 건수·기준일·조회 범위·연도 확보는 PoC 스냅샷)과 원천 카탈로그에서 만든다.
   ② 실패·경고 원천만 표로 펼치고 정상 원천은 기관별로 접는다. ③ 빈틈 없는 줄은 한 줄로 접는다. 모든 행이 같은 표지인 열은 그리지 않고 한 번만 말한다.
   상태는 색만으로 알리지 않고 글자도 둔다. 시안: docs/design/home-concept/sources.html */
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { MetricRow, PanelHead } from '@/components/page';
import { Card } from '@/components/ui/card';
import InfoTip from '@/components/ui/info-tip';
import ScopeChip from '@/components/ui/scope-chip';
import { DataGrid } from '@/components/ui/data-grid';
import { HATCH } from '@/components/ui/chips';
import { GRID_DENSE, dotDates, type Col, type Row } from '@/lib/grid/spec';
import { GRID_YEARS, LINK_NAME, coverageRows, statusRows, uniformColumns, type CoverageRow, type GridState, type HomeSources, type StatusRow } from '@/lib/board/home-sources';
import { fmt } from '@/lib/board/calc';
import type { Source } from '@/lib/board/types';

const KEY = 'flex items-center gap-1 whitespace-nowrap';
const dot = 'block size-[9px] flex-none';
/* 원천 이름 HOME 은 보이는 글 대신 title 에 — 보이는 이름은 '정책 진행 자료'(우리 = 파일로 받아 둔 원천 카탈로그) */
const HOME_TIP = 'HOME — 국토교통부 정책·LH·SH·GH 원천을 모은 팀 자료';
const OWNER = { 우리: '우리', HOME: '정책 진행 자료' } as const;
/* 기관 이름 중 내부 말(자료의 provider '<옛 서비스 이름> 지도 번들')은 보이는 글에서 '주택공급 지도 자료'로. 자료 값은 그대로 둔다 */
export const showOrg = (o: string) => o.replace(/지도 번들|번들/g, '지도 자료').replace(/^주택파동/, '주택공급');   // legacy-name
/* 원천 이름은 말줄임 없이 낱말 단위로 줄바꿈(2026-10-16 2차 평가: 1440 에서 324→263px, 1280 에서 5건이 잘렸다) */
const WRAP = 'min-w-0 [overflow-wrap:break-word] [word-break:keep-all]';
/* 가운뎃점으로 이은 낱말('서울·경기')은 점 뒤에서만 줄을 바꾼다(keep-all 이라 점 뒤에도 기회가 없어 낱말 가운데서 끊겼다) — 서버 글은 <wbr>, 표 칸 글은 폭 없는 공백 */
const dotWrap = (t: string): ReactNode => t.split('·').flatMap((w, i) => (i ? ['·', <wbr key={i} />, w] : [w]));
const dotBreak = (t: string) => t.replace(/·/g, '·\u200B');
const LegendList = ({ children }: { children: ReactNode }) => <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-0.5 p-0 text-sm text-muted-foreground" aria-label="범례">{children}</ul>;

/* 휴대폰: 머리·숫자·횟수 칸은 줄을 바꾸지 않고(원천·기관 이름은 칸 안에서 2줄까지 — clip) 표가 넓어지면 틀이 가로로 민다 */
const NOWRAP = '[&_th]:whitespace-nowrap! [&_td]:whitespace-nowrap!';

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
      name: { text: dotBreak(r.name), title: r.note }, owner: { text: OWNER[r.owner], title: HOME_TIP }, org: dotBreak(showOrg(r.org)),
      st: r.ok ? { text: '경고', swatch: 'var(--warn)', tone: 'warn', title: '마지막 수집은 정상이지만 조회 범위가 일부', sort: 1 }
        : { text: '실패', swatch: 'var(--bad)', tone: 'bad', title: `마지막 실행 ${r.lastRun ?? ''} 실패${r.lastOk ? ' — 마지막 정상 값을 씀' : ' — 정상 수집 없음'}`, sort: 0 },
      runs: r.runs, last: r.lastOk ?? { na: '없음' }, asOf: r.asOf, n: r.count,
    },
  };
}

export function Collect({ hs, items }: { hs: HomeSources; items: Source[] }) {
  const all = statusRows(hs);
  const issues = all.filter((r) => !r.ok || r.warn), okRows = all.filter((r) => r.ok && !r.warn);
  const nFail = all.filter((r) => !r.ok).length, nWarn = all.filter((r) => r.warn).length;
  const failNames = all.filter((r) => !r.ok).map((r) => r.name);
  const rows = issues.map(issueRow);
  /* 모든 행이 같은 표지인 열(예: 구분 모두 HOME · 원천 기준일 없음)은 접는다 */
  const text = (v: Row['c'][string]) => (v === null || v === undefined ? null : typeof v === 'object' ? (v.na !== undefined ? null : v.text ?? null) : String(v));
  const { keep, folded } = uniformColumns(COLS.map((c) => c.key).filter((k) => k !== 'name'), rows.map((r) => Object.fromEntries(Object.entries(r.c).map(([k, v]) => [k, text(v)]))), Object.fromEntries(COLS.map((c) => [c.key, c.label])));
  const cols = COLS.filter((c) => c.key === 'name' || keep.includes(c.key));

  const orgs = new Map<string, StatusRow[]>();
  for (const r of okRows) { const o = showOrg(r.org); if (!orgs.has(o)) orgs.set(o, []); orgs.get(o)!.push(r); }
  const orgList = [...orgs].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'));
  const maxDay = (rs: StatusRow[]) => rs.map((r) => r.lastOk).filter((d): d is string => !!d).sort().pop();
  /* 마지막 줄 빈 칸이 적은 열 수(3·4) */
  const orgCols = [3, 4].sort((x, y) => (x - orgList.length % x) % x - (y - orgList.length % y) % y)[0];

  return (
    <Card render={<section aria-label="수집 상태" />}>
      <PanelHead title="수집 상태"
        scope={<ScopeChip scope="원천 전체" title="지역 거르기 없음 — 정책 진행 자료(HOME)의 원천 전체 · 우리가 파일로 받아 둔 원천은 아래 원천 카탈로그" />}>
        <LegendList>
          {nFail ? <li className={KEY}><i className={`${dot} rounded-full bg-bad`} aria-hidden="true" />실패</li> : null}
          {nWarn ? <li className={KEY}><i className={`${dot} rounded-full bg-warn`} aria-hidden="true" />경고</li> : null}
          <li className={KEY}><i className={`${dot} rounded-full bg-ok`} aria-hidden="true" />정상</li>
        </LegendList>
        <InfoTip label="수집 상태 읽는 법">
          <dl>
            <dt>실패 · 경고</dt><dd>실패 = 마지막 실행이 실패해 마지막 정상 값을 씀 · 경고 = 마지막 수집은 정상이지만 조회 범위가 일부 · 둘만 표로 펼치고 정상 원천은 기관별로 접음</dd>
            <dt>{OWNER.HOME}</dt><dd>HOME(국토교통부 정책·LH·SH·GH 원천을 모은 팀 자료)의 수집 출처 · 수집 출처 = 정상으로 저장된 레코드가 있는 출처 · 건수 = 원천별 정상 레코드 수 · 원천 기준일은 원천이 밝힌 곳만 · 건수·기준일·조회 범위는 {hs.poc.fetchedAt.slice(0, 10).replace(/-/g, '.')} 받아 둔 PoC 값(덤프에 없음), 수집 실행은 덤프</dd>
          </dl>
        </InfoTip>
      </PanelHead>
      <div title={`정책 진행 자료(HOME) 등록 원천 ${hs.sources.length}곳 중 정상 레코드가 있는 ${hs.poc.withData}곳(덤프 수집 실행 ${fmt(hs.runs.total)}회 중 실패 ${hs.runs.failed}·중단 ${hs.runs.interrupted}) · 우리가 파일로 받아 둔 원천 ${items.length}곳은 원천 카탈로그`}>
        <MetricRow label="수집 출처" value={hs.poc.withData} unit="곳"
          items={[`등록 ${hs.sources.length} · 기관 ${hs.poc.orgs} · 우리 보관 원천 ${items.length}은 아래 카탈로그`,
            <span key="f" className={nFail ? 'text-bad' : undefined}>실패 {nFail}{failNames.length ? ` (${failNames.join(' · ')})` : ''}</span>,
            <span key="w" className={nWarn ? 'text-warn' : undefined}>경고 {nWarn}</span>]} />
      </div>
      {rows.length ? (
        <>
          {folded.length ? <p className="m-0 text-sm text-muted-foreground">{folded.join(' · ')}</p> : null}
          <div className={`${GRID_DENSE} ${NOWRAP}`}><DataGrid label="실패·경고 원천" cols={cols} rows={rows} sortable={false} /></div>
        </>
      ) : null}
      <div className={rows.length ? 'mt-4' : undefined}>
        <p className="ui-meta m-0" title="정상 원천 — 기관을 누르면 원천마다 기준일·건수">정상 {okRows.length}곳 · 기관 {orgList.length}</p>
        <div className={`mt-1.5 grid ${orgCols === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-x-8 narrow:grid-cols-2 mobile:grid-cols-1 phone:grid-cols-1`}>
          {orgList.map(([org, rs]) => (
            <details key={org} className="group/o min-w-0 border-b border-border">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-chip py-1.5 text-sm hover:bg-pn2 focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 flex-none text-muted-foreground transition-transform group-open/o:rotate-90" aria-hidden="true" />
                <span className={`${WRAP} flex-1 font-bold`}>{dotWrap(org)}</span>
                <span className="flex-none text-sm whitespace-nowrap text-muted-foreground tabular-nums">{rs.length}곳{maxDay(rs) ? ` · ${dotDates(maxDay(rs)!)}` : ''}</span>
              </summary>
              <ul className="m-0 list-none p-0 pb-2 pl-5 text-sm leading-body">
                {rs.map((r) => (
                  <li key={`${r.owner}-${r.id}`} className="flex gap-2 py-0.5">
                    <span className={`${WRAP} flex-1`} title={`${r.name} · ${r.owner}`}>{dotWrap(r.name)}</span>
                    <span className="flex-none text-muted-foreground tabular-nums">{[r.asOf ? `기준 ${dotDates(r.asOf)}` : '', r.count !== null ? fmt(r.count) : ''].filter(Boolean).join(' · ')}</span>
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

const MARK: Record<GridState, string> = { full: '확보', none: '미확보', nosrc: '원본 행 없음', unpub: '원천 미공표' };
/* 칸 모양: 확보 = 꽉 찬 색 · 미확보 = 빗금 · 원본 행 없음 = 옅은 면 · 원천 미공표 = 빈 테두리 */
const CELL_CLS: Record<GridState, string> = { full: '', none: `border border-line2 ${HATCH}`, nosrc: 'border border-line2 bg-pn2', unpub: 'border border-line2' };
export function Coverage({ hs }: { hs: HomeSources }) {
  const cover = coverageRows(hs);
  /* 빈틈 없는 원천(모든 연도 확보)은 한 줄로 접는다 */
  const isFull = (r: CoverageRow) => r.cells.every((c) => c === 'full');
  const rest = cover.filter((r) => !isFull(r));
  const fold = (rs: CoverageRow[], label: string, tip: string) => (rs.length ? (
    <p className="m-0 mt-2 text-sm text-muted-foreground" title={tip}><b className="font-bold text-foreground">{label} {rs.length}줄</b> · {rs.map((r, i) => <span key={r.id} title={r.owner}>{i ? ' · ' : ''}{dotWrap(r.name)}</span>)}</p>
  ) : null);
  return (
    <Card render={<section aria-label="연도 확보" />}>
      <PanelHead title="연도 확보" scope={<ScopeChip scope="원천 전체" title="지역 거르기 없음 — 원천마다 그 원천이 다루는 범위 전체(서울·경기 시도별 줄)" />}>
        <LegendList>
          <li className={KEY}><i className={`${dot} rounded-chip bg-primary`} aria-hidden="true" />확보</li>
          <li className={KEY}><i className={`${dot} rounded-chip ${CELL_CLS.none}`} aria-hidden="true" />미확보</li>
          <li className={KEY}><i className={`${dot} rounded-chip ${CELL_CLS.nosrc}`} aria-hidden="true" />원본 행 없음</li>
          <li className={KEY}><i className={`${dot} rounded-chip ${CELL_CLS.unpub}`} aria-hidden="true" />원천 미공표</li>
        </LegendList>
        <InfoTip label="연도 확보 읽는 법">
          <dl>
            <dt>확보 · 미확보</dt><dd>원천 × 시도마다 {GRID_YEARS[0]}~{GRID_YEARS[GRID_YEARS.length - 1]}년 자료가 저장돼 있는지(저장된 원천 증거가 있으면 확보)</dd>
            <dt>원본 행 없음 · 원천 미공표</dt><dd>원본에 그 해의 행이 없거나, 확인한 공식 원천이 아직 그 해를 공표하지 않음 · 미확보와 따로 셈</dd>
            <dt>세는 법</dt><dd>{OWNER.HOME}의 자료연도별 확보 {hs.grid.length}줄 × {GRID_YEARS.length}해 · {hs.poc.fetchedAt.slice(0, 10).replace(/-/g, '.')} 받아 둔 값 · 빈틈 없는 줄은 한 줄로 접음</dd>
          </dl>
        </InfoTip>
      </PanelHead>
      {rest.length ? (
        <div className="relative overflow-x-auto">
          <div role="table" aria-label="원천별 연도 확보" className="grid min-w-[680px] grid-cols-[minmax(0,320px)_repeat(9,minmax(0,1fr))] items-center gap-1 text-sm">
            <div role="row" className="contents">
              <span role="columnheader" />
              {GRID_YEARS.map((y) => <span key={y} role="columnheader" className="text-center text-muted-foreground tabular-nums">{y}</span>)}
            </div>
            {rest.map((r) => (
              <div key={r.id} role="row" className="contents">
                <span role="rowheader" className={`${WRAP} leading-sub`} title={`${r.name} · ${r.owner}`}>{dotWrap(r.name)}</span>
                {r.cells.map((c, i) => (
                  <span key={i} role="cell" title={`${r.name} · ${GRID_YEARS[i]} · ${MARK[c]}`} className="block">
                    {/* 색 칸은 그림만, 읽는 글자는 칠한 칸 밖 sr-only(칠한 바탕 위 숨긴 글자가 대비 검사에 걸리지 않게) */}
                    <span aria-hidden="true" className={`block h-[18px] rounded-chip ${CELL_CLS[c]}`}
                      style={c === 'full' ? { background: 'var(--primary)' } : undefined} />
                    <span className="sr-only">{MARK[c]}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {fold(cover.filter(isFull), `${GRID_YEARS[0]}~${GRID_YEARS[GRID_YEARS.length - 1]} 빈틈 없음`, '모든 연도 확보')}
    </Card>
  );
}

export function Links({ hs }: { hs: HomeSources }) {
  return (
    <Card render={<section aria-label="연결" />}>
      <PanelHead title="연결" scope={<ScopeChip scope="정책 전체" source="정책 진행 자료" title="정책 진행 자료(HOME)의 정책 전체 — 정책 미지정 사업까지 모두 · 지역 거르기 없음" />}>
        <LegendList>
          <li className={KEY}><i className={`${dot} rounded-chip bg-primary`} aria-hidden="true" />담당자 확인</li>
          <li className={KEY}><i className={`${dot} rounded-chip`} style={{ background: 'color-mix(in srgb, var(--primary) 30%, var(--card))' }} aria-hidden="true" />담당자 확인 전</li>
        </LegendList>
        <InfoTip label="연결 읽는 법">
          <p>정책–프로그램, 프로그램–사업 연결(정책 진행 자료, 정책 미지정 사업 포함) 수입니다. 담당자 확인 전 = 자동으로 제안했고 담당자가 아직 확인하지 않은 연결 · 해제된 연결은 뺌.</p>
        </InfoTip>
      </PanelHead>
      <div className="mt-3 grid grid-cols-2 gap-3 narrow:grid-cols-1">
        {hs.links.map((l) => {
          const all = l.confirmed + l.review;
          return (
            <Card key={l.type} variant="inset" className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <b className="text-base">{LINK_NAME[l.type]}</b>
                <span className="text-sm text-muted-foreground tabular-nums">담당자 확인 전 <b className="text-base text-foreground">{fmt(l.review)}</b> · 확인 <b className="text-base text-foreground">{fmt(l.confirmed)}</b></span>
              </div>
              {all ? (
                <span className="flex h-[14px] gap-px overflow-hidden" role="img" aria-label={`${LINK_NAME[l.type]}: 담당자 확인 ${l.confirmed}, 확인 전 ${l.review}`}>
                  {l.confirmed ? <span style={{ width: `${l.confirmed / all * 100}%`, minWidth: 3, background: 'var(--primary)' }} title={`담당자 확인 ${fmt(l.confirmed)}`} /> : null}
                  {l.review ? <span style={{ width: `${l.review / all * 100}%`, background: 'color-mix(in srgb, var(--primary) 30%, var(--card))' }} title={`담당자 확인 전 ${fmt(l.review)}`} /> : null}
                </span>
              ) : <span className="text-sm text-muted-foreground">연결 없음</span>}
            </Card>
          );
        })}
      </div>
    </Card>
  );
}
