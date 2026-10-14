/* 데이터 원본 '수집 상태' 보기: (a) 원천 표 — 상태 정상/실패·마지막 정상 수집·원천 기준일·건수, (b) 연도 × 원천 확보 격자, (c) 연결 현황(정책–프로그램·프로그램–사업).
   값은 lib/board/home-sources.ts 가 data/board/home-sources.json(HOME 수집 실행·확보 기록·원장 links 요약)과 원천 카탈로그에서 만든다. 상태는 색만으로 알리지 않고 글자도 둔다. */
import { PanelHead } from '../page';
import { Card } from '../ui/card';
import { DataGrid } from '../ui/data-grid';
import { GRID_DENSE, type Col, type Row } from '../../lib/grid/spec';
import { GRID_YEARS, LINK_NAME, coverageRows, statusRows, type HomeSources } from '../../lib/board/home-sources';
import { annualSeries } from '../../lib/board/annual';
import { fmt } from '../../lib/board/calc';
import type { Molit, Source } from '../../lib/board/types';

const COLS: Col[] = [
  { key: 'name', label: '원천', kind: 'text', wrap: true },
  { key: 'owner', label: '구분', kind: 'text' },
  { key: 'org', label: '기관', kind: 'text' },
  { key: 'status', label: '상태', kind: 'text' },
  { key: 'runs', label: '수집 실행', kind: 'text' },
  { key: 'last', label: '마지막 정상 수집', kind: 'text' },
  { key: 'asOf', label: '원천 기준일', kind: 'text' },
  { key: 'n', label: '건수' },
];
const HATCH = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_32%,transparent)_0_1.5px,transparent_1.5px_5px)]';
const dot = 'block size-[9px] flex-none rounded-[2px]';
const KEY = 'flex items-center gap-1';

export default function Status({ hs, items, molit }: { hs: HomeSources; items: Source[]; molit: Molit }) {
  const src = statusRows(hs, items);
  const failed = src.filter((r) => !r.ok).length;
  const rows: Row[] = src.map((r) => ({
    id: `${r.owner}-${r.id}`,
    c: {
      name: r.name, owner: r.owner, org: r.org,
      status: r.ok ? { text: '정상', swatch: 'var(--ok)' } : { text: '실패', swatch: 'var(--bad)' },
      runs: r.runs,
      last: r.lastOk ?? { na: '없음' }, asOf: r.asOf ?? null, n: r.count,
    },
  }));
  const cover = coverageRows(hs, annualSeries(molit, 'complete', '00'));
  const MARK = { full: '확보', part: '부분', none: '미확보' } as const;
  return (
    <div className="grid gap-3.5">
      <Card render={<section aria-label="원천 수집 상태" />}>
        <PanelHead title={<>원천 <span className="text-[14px] text-muted-foreground tabular-nums">{src.length}곳 · 실패 {failed}</span></>}
          tip={`원천마다 마지막 정상 수집·원천 기준일·건수 · 실패한 원천은 맨 위에 두고 마지막 정상 값을 씁니다. 우리 원천 ${items.length}곳은 파일로 받아 둔 자료(카탈로그 수집일), HOME 원천 ${hs.sources.length}곳은 HOME 덤프의 수집 실행 ${fmt(hs.runs.total)}회(실패 ${hs.runs.failed}·중단 ${hs.runs.interrupted}) 중 마지막 실행의 결과입니다. 건수는 원장에 옮긴 행 수(없으면 확보 기록의 수집 건수).`} />
        <div className={GRID_DENSE}><DataGrid label="원천 수집 상태" cols={COLS} rows={rows} /></div>
      </Card>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-3.5 narrow:grid-cols-1">
        <Card render={<section aria-label="연도별 확보 격자" />}>
          <PanelHead title="연도 확보" tip={`원천마다 ${GRID_YEARS[0]}~${GRID_YEARS[GRID_YEARS.length - 1]} 자료가 있는지 · 부분은 일부 월·범위만 · 기간을 알 수 있는 원천만 올렸습니다(통계누리는 월 자료로 센 값, 나머지는 원장의 사건일·공고일·지표 기간과 HOME 확보 기록의 기대·수집 건수).`}>
            <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
              <li className={KEY}><i className={dot} style={{ background: 'var(--primary)' }} aria-hidden="true" />확보</li>
              <li className={KEY}><i className={dot} style={{ background: 'color-mix(in srgb, var(--primary) 26%, var(--card))' }} aria-hidden="true" />부분</li>
              <li className={KEY}><i className={`${dot} border border-line2 ${HATCH}`} aria-hidden="true" />미확보</li>
            </ul>
          </PanelHead>
          <div className="overflow-x-auto"><div role="table" aria-label="원천별 연도 확보" className="grid min-w-[520px] grid-cols-[minmax(0,200px)_repeat(9,minmax(0,1fr))] items-center gap-1 text-[13px]">
            <span role="columnheader" />
            {GRID_YEARS.map((y) => <span key={y} role="columnheader" className="text-center text-muted-foreground tabular-nums">{y}</span>)}
            {cover.map((r) => (
              <div key={r.id} role="row" className="contents">
                <span role="rowheader" className="truncate" title={`${r.name} · ${r.owner}`}>{r.owner === 'HOME' ? <span className="mr-1 text-[11px] text-muted-foreground">HOME</span> : null}{r.name}</span>
                {r.cells.map((c, i) => (
                  <span key={i} role="cell" title={`${r.name} · ${GRID_YEARS[i]} · ${MARK[c]}`}
                    className={`block h-[18px] rounded-[3px] ${c === 'none' ? `border border-line2 ${HATCH}` : ''}`}
                    style={c === 'full' ? { background: 'var(--primary)' } : c === 'part' ? { background: 'color-mix(in srgb, var(--primary) 26%, var(--card))' } : undefined}>
                    <span className="sr-only">{MARK[c]}</span>
                  </span>
                ))}
              </div>
            ))}
          </div></div>
        </Card>

        <Card render={<section aria-label="연결 현황" />}>
          <PanelHead title="연결" tip="정책–프로그램, 프로그램–사업 연결(사업 원장 links) · 검토 중은 담당자 확인 전 제안, 해제된 연결은 빠집니다.">
            <ul className="m-0 flex list-none flex-wrap items-center gap-x-2.5 p-0 text-[13px] text-muted-foreground" aria-label="범례">
              <li className={KEY}><i className={dot} style={{ background: 'var(--primary)' }} aria-hidden="true" />확정</li>
              <li className={KEY}><i className={dot} style={{ background: 'color-mix(in srgb, var(--primary) 30%, var(--card))' }} aria-hidden="true" />검토 중</li>
            </ul>
          </PanelHead>
          <div className="flex flex-col gap-4">
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
      </div>
    </div>
  );
}
