'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown, MapPin, Search } from 'lucide-react';
import LinkPending from './link-pending';
import { constructSortFn, createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable, type SortingState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from 'cn';
import { Swatch } from '@/components/charts/Legend';
import { Prov } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { compare, display, dotDates, filterRows, groupStarts, headerRows, sortValue, splitPinned, wants, type Cell, type Col, type Row } from '@/lib/grid/spec';

/* 데이터 그리드(계획서 17절): TanStack Table v9(정렬)과 TanStack Virtual(긴 표)을 기존 Table 마크업 위에 얹는다. 헤드리스라 모양은 Table 그대로다.
   - 머리글을 누르면 정렬(숫자는 큰 값부터, 글자는 가나다순 → 반대 → 원래 순서). 값이 없는 칸은 방향과 상관없이 맨 뒤. th 에 aria-sort.
   - 머리글은 위에, 첫 열(행 이름)은 왼쪽에 붙어 있다(좁은 화면에서 옆으로 밀어도 무슨 행인지 보인다). 합계 행(전국·총계)은 정렬·검색과 상관없이 제자리.
   - 줄무늬, 글자 열은 왼쪽·숫자 열은 오른쪽 정렬, 묶음(머리글 2단)이 바뀌는 곳에 세로 구분선, 없는 값은 흐린 –.
   - 30행을 넘는 표는 검색 칸과 건수를, 120행을 넘는 표는 보이는 행만 그린다(LH 준공 예정 351행: DOM 행 351 → 수십).
   - 행에 detail(실제 레코드 예시)이 있으면 첫 칸에 ▸ 가 붙고, 행을 누르면(또는 ▸ 단추) 바로 아래에 예시 표가 열린다. 칸 안의 링크를 누르면 펼치지 않고 그 링크로 간다.
   - 행에 href 가 있으면 행을 눌러 그 주소로 간다(스크롤 유지, 사업 목록 → 상세 서랍). 키보드는 칸 안의 링크로 간다. sel 인 행은 선택 바탕.
   서버 화면은 직렬화되는 열·행(lib/grid/spec.ts 의 Col·Row)만 넘긴다. 시험: tests/js/grid.test.cjs */

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { grid: constructSortFn({ sort: (a, b) => compare(a, b) }) },
});
const helper = createColumnHelper<typeof features, Row>();

const ROW_H = 46;   // 한 줄 행 높이(16px × 1.6 + 위아래 10px + 테두리). 여러 줄 행은 그린 뒤 잰다
const TONE = { ok: 'text-ok', bad: 'text-bad', warn: 'text-warn', na: 'text-muted-foreground' } as const;
const HATCH = '[background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_1.5px,transparent_1.5px_3.5px)]';
const zebra = 'bg-[color-mix(in_srgb,var(--pn2)_45%,var(--card))]';   // 불투명이라야 붙은 첫 열 밑으로 글자가 비치지 않는다
const stickyCell = 'sticky left-0 z-[1] bg-inherit group-data-[scrolled]/grid:shadow-edge';   // 옆으로 민 동안만 오른쪽 그림자

/* 하이픈·물결이 든 짧은 낱말(2026-08-31, 2021-09~2026-08, 61-79번지)은 줄을 바꿀 때 가운데서 끊지 않는다(브라우저는 하이픈 뒤에서 끊는다) */
/* 보이는 날짜는 점 표기(dotDates — 2026-08-31 → 2026.08.31) */
const keepWords = (raw: string): React.ReactNode => { const t = dotDates(raw); return /[-~]/.test(t) ? t.split(/( +)/).map((w, i) => (i % 2 || !/[-~]/.test(w) || w.length > 24 ? w : <span key={i} className="whitespace-nowrap">{w}</span>)) : t; };

/* 말줄임 열(clip): 두 줄까지 줄바꿈하고 넘치면 말줄임(2026-10-16 2차 평가 — 한 줄 말줄임은 사업명 262px 를 180px 로 잘랐고, 최소 폭이 clip 값에 묶여 1280 에서 표가 9px 넘쳤다).
   칸 title: 칸에 title 이 있으면 그것(안쪽 span 이 보인다), 없으면 전체 글자 */
const clipTitle = (v: Cell, col: Col) => (typeof v === 'object' && v?.title ? undefined : display(v, col.kind).text);

/* 낱말 하나가 이 길이를 넘으면 칸(최소 160px)보다 길 수 있다: 두 줄 말줄임은 칸에 맞춰 낱말을 쪼개므로(예 '정보대(서빙…') 쪼개지 않고 한 줄 말줄임으로 둔다. 전체는 title */
const LONG_WORD = 10;
const longWord = (v: Cell, col: Col) => display(v, col.kind).text.split(/\s+/).some((w) => w.length > LONG_WORD);

function CellView({ v, col }: { v: Cell; col: Col }) {
  const d = display(v, col.kind);
  const o = typeof v === 'object' && v !== null ? v : undefined;
  const text = o?.icon === 'map' ? <><MapPin className="inline size-3.5 align-[-2px]" aria-hidden="true" /><span aria-hidden="true">지도</span><span className="sr-only">{d.text}</span></> : o?.code ? <code className="whitespace-nowrap">{d.text}</code> : keepWords(d.text);
  const body = o?.href ? (o.doc ? <a href={o.href} className={o.icon ? 'inline-flex items-center gap-1 rounded-chip p-0.5 whitespace-nowrap text-muted-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary' : undefined}>{text}</a> : <Link href={o.href} scroll={o.stay ? false : undefined} className="relative">{text}<LinkPending /></Link>) : text;
  const mark = o?.mark === 'hatch' ? <i className={cn('mr-1.5 inline-block size-[11px] rounded-chip border border-line2 align-[-1px]', HATCH)} aria-hidden="true" />
    : o?.mark === 'outline' ? <i className="mr-1.5 inline-block size-[11px] rounded-chip border-2 align-[-1px]" style={{ borderColor: o.swatch }} aria-hidden="true" /> : null;
  const toned = d.tone ? <span className={cn(TONE[d.tone], o?.strong && 'font-bold')}>{body}</span> : o?.strong ? <b>{body}</b> : body;
  const inner = (
    <>
      {mark ?? (o?.dashed ? <i className="mr-1.5 inline-block size-[11px] rounded-chip border border-dashed border-line2 align-[-1px]" aria-hidden="true" /> : o?.swatch ? <Swatch color={o.swatch} /> : null)}
      {/* 알약 글자는 단계 글자색을 본문색 쪽으로 20% 당겨 알약 바탕 위 4.5:1 이상(밝은 테마 ② 인허가 3.9 → 5.2, 2026-10-15 평가) */}
      {o?.pill ? <span className="inline-block rounded-full px-2 text-sm leading-body font-bold whitespace-nowrap" style={{ background: `color-mix(in srgb,${o.pill.color} 16%,var(--card))`, color: `color-mix(in srgb,${o.pill.ink} 80%,var(--foreground))` }}>{body}</span> : toned}
      {o?.tag ? <span className="ml-1.5 inline-block rounded-chip border border-line2 px-1 text-sm leading-sub font-normal whitespace-nowrap text-muted-foreground">{o.tag}</span> : null}
      {o?.prov ? <Prov /> : null}
    </>
  );
  return o?.title ? <span title={o.title}>{inner}</span> : inner;
}

/* quietCount: 검색 칸 옆 건수를 찾을 때만 보인다(표 머리에 이미 건수가 있는 사업 목록 — 같은 숫자를 두 번 내지 않는다) */
export function DataGrid({ cols, rows, label, sortable = true, maxHeight, quietCount = false, emptyText = '자료 없음' }: { cols: Col[]; rows: Row[]; label: string; sortable?: boolean; maxHeight?: number; quietCount?: boolean; emptyText?: string }) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const uid = React.useId();
  const router = useRouter();
  /* 행을 눌러 서랍을 여는 동안(서버가 그린다) 그 행에 진행 표지 */
  const [going, startGoing] = React.useTransition();
  const [goingId, setGoingId] = React.useState<string | null>(null);
  const { top, body, bottom } = React.useMemo(() => splitPinned(rows), [rows]);
  const want = wants(body.length);
  const data = React.useMemo(() => filterRows(body, q, cols), [body, q, cols]);
  const columns = React.useMemo(() => helper.columns(cols.map((c) => helper.accessor((r) => sortValue(r.c[c.key]), {
    id: c.key, sortFn: 'grid', sortUndefined: 'last', sortDescFirst: (c.kind ?? 'int') !== 'text', enableSorting: sortable && c.sort !== false,
  }))), [cols, sortable]);
  const table = useTable({ features, columns, data, state: { sorting }, onSortingChange: setSorting, getRowId: (r) => r.id });
  const list = table.getRowModel().rows;

  const heads = React.useMemo(() => headerRows(cols), [cols]);
  const starts = React.useMemo(() => groupStarts(cols), [cols]);
  const textCol = React.useMemo(() => new Set(cols.filter((c) => c.kind === 'text').map((c) => c.key)), [cols]);
  const first = cols[0].key;
  const height = maxHeight ?? (want.virtual ? 520 : undefined);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: want.virtual ? list.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 10,
    getItemKey: (i) => list[i].id, initialRect: { width: 0, height: height ?? 0 },   // 서버 HTML 에도 첫 화면 행을 그린다
  });
  const items = v.getVirtualItems();
  const shown = want.virtual ? items.map((it) => ({ row: list[it.index].original, i: it.index })) : list.map((r, i) => ({ row: r.original, i }));
  const padTop = want.virtual && items.length ? items[0].start : 0;
  const padBottom = want.virtual && items.length ? v.getTotalSize() - items[items.length - 1].end : 0;
  const lead = heads.length + top.length;   // aria-rowindex 가 1부터 머리글 줄을 포함해 센다

  const expandable = !want.virtual && rows.some((r) => r.detail);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const detailId = (r: Row) => `${uid}-${r.id}-detail`;
  /* 펼친 예시 표: 칸 폭이 0 에서 시작해(w-0 min-w-full) 바깥 표의 열 너비를 넓히지 않는다. 열이 많아도(최대 20) 넘쳐 잘리지 않게
     머리글(긴 원본 열 이름)은 한글 음절 단위로 줄을 바꾼다(word-break normal). 값 칸은 낱말 단위 그대로라 숫자·낱말이 중간에서 끊기지 않는다 */
  const detailLine = (r: Row) => (
    <tr key={`${r.id}-detail`} id={detailId(r)}>
      <TableCell colSpan={cols.length} className="bg-pn2 px-3 py-2 text-left whitespace-normal">
        <div className="w-0 min-w-full [&_th]:[word-break:normal]!">
          <p className="m-0 text-sm text-muted-foreground">예시 {r.detail!.rows.length.toLocaleString('en-US')}건 / 전체 {r.detail!.total.toLocaleString('en-US')}건 · {r.detail!.source}</p>
          <DataGrid label={`${label} · ${display(r.c[first], cols[0].kind).text} 예시`} cols={r.detail!.cols} rows={r.detail!.rows} sortable={false} />
        </div>
      </TableCell>
    </tr>
  );
  const line = (r: Row, i: number, pinned: boolean, measure?: boolean) => [
    <TableRow key={r.id} total={pinned} data-index={measure ? i : undefined} ref={measure ? v.measureElement : undefined}
      aria-rowindex={want.virtual ? (pinned ? undefined : lead + i + 1) : undefined}
      onClick={expandable && r.detail ? (e) => { if (!(e.target as HTMLElement).closest('a, button, input')) toggle(r.id); }
        : r.href ? (e) => { if (!(e.target as HTMLElement).closest('a, button, input')) { setGoingId(r.id); startGoing(() => router.push(r.href!, { scroll: false })); } } : undefined}
      data-sel={r.sel ? '' : undefined} aria-busy={going && goingId === r.id ? true : undefined}
      className={cn(!pinned && (r.sel ? 'bg-accent' : i % 2 ? zebra : 'bg-card'), r.muted && 'text-muted-foreground', ((expandable && r.detail) || r.href) && 'cursor-pointer', going && goingId === r.id && 'cursor-progress animate-pulse motion-reduce:animate-none')}>
      {r.note !== undefined ? (
        <>
          <TableCell className={stickyCell}><CellView v={r.c[first]} col={cols[0]} /></TableCell>
          <TableCell colSpan={cols.length - 1} className="text-left whitespace-normal" title={r.noteTitle}>{dotDates(r.note)}</TableCell>
        </>
      ) : cols.map((c) => (
        <TableCell key={c.key} className={cn(c.key === first && stickyCell, c.kind === 'text' && 'text-left', (c.kind === 'int' || c.kind === 'delta' || c.kind === 'pct') && 'whitespace-nowrap!', c.wrap && 'min-w-[180px] whitespace-normal [word-break:keep-all]', starts.has(c.key) && 'border-l')}>
          {expandable && c.key === first ? (r.detail ? (
            <button type="button" aria-expanded={open.has(r.id)} aria-controls={open.has(r.id) ? detailId(r) : undefined} aria-label={`${display(r.c[first], cols[0].kind).text} 예시 ${open.has(r.id) ? '접기' : '펼치기'}`} onClick={() => toggle(r.id)}
              className="mr-1 inline-flex size-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 align-[-2px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
              <ChevronRight className={cn('size-3.5 transition-transform', open.has(r.id) && 'rotate-90')} aria-hidden="true" />
            </button>
          ) : <span className="mr-1 inline-block w-4" aria-hidden="true" />) : null}
          {c.clip ? (
            longWord(r.c[c.key], c)
              ? <span className="block truncate" style={{ maxWidth: c.clip }} title={clipTitle(r.c[c.key], c)}><CellView v={r.c[c.key]} col={c} /></span>
              : <span className="line-clamp-2 whitespace-normal [overflow-wrap:normal] [word-break:keep-all]" style={{ maxWidth: c.clip }} title={clipTitle(r.c[c.key], c)}><CellView v={r.c[c.key]} col={c} /></span>
          ) : <CellView v={r.c[c.key]} col={c} />}
        </TableCell>
      ))}
    </TableRow>,
    expandable && r.detail && open.has(r.id) ? detailLine(r) : null,
  ];
  const spacer = (h: number, key: string) => (h > 0 ? <tr key={key} aria-hidden="true"><td colSpan={cols.length} className="border-0 p-0" style={{ height: h }} /></tr> : null);

  return (
    <div data-slot="data-grid">
      {want.search ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="relative block w-full max-w-[320px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이 표에서 찾기" aria-label={`${label} 안에서 찾기`}
              className="h-10 w-full rounded-tile border border-line2 bg-card pr-3 pl-9 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary" />
          </label>
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{q.trim() ? `${data.length.toLocaleString('en-US')}건 / 전체 ${body.length.toLocaleString('en-US')}건` : quietCount ? '' : `${body.length.toLocaleString('en-US')}건`}</span>
        </div>
      ) : null}
      <Table aria-label={label} aria-rowcount={want.virtual ? lead + list.length + bottom.length : undefined}
        containerClassName={cn('group/grid', height !== undefined && 'overflow-y-auto')}
        containerProps={{ ref: scrollRef, style: height !== undefined ? { maxHeight: height } : undefined, onScroll: (e) => e.currentTarget.toggleAttribute('data-scrolled', e.currentTarget.scrollLeft > 0) }}>
        <TableHeader>
          {heads.map((cells, li) => (
            <tr key={li}>
              {cells.map((h, hi) => {
                const column = h.key ? table.getColumn(h.key) : undefined;
                const can = !!column?.getCanSort();
                const dir = column?.getIsSorted();
                const Icon = dir === 'asc' ? ChevronUp : dir === 'desc' ? ChevronDown : ChevronsUpDown;
                return (
                  <TableHead key={h.key ?? `g${hi}`} colSpan={h.colSpan > 1 ? h.colSpan : undefined} rowSpan={h.rowSpan > 1 ? h.rowSpan : undefined}
                    aria-sort={can ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                    className={cn('z-[2]', h.key === first && 'left-0 z-[3] group-data-[scrolled]/grid:shadow-edge', !h.key && 'text-center', h.key && textCol.has(h.key) && 'text-left', (h.key ? starts.has(h.key) : true) && h.key !== first && 'border-l', dir && 'text-foreground')}>
                    {h.swatch ? <Swatch color={h.swatch} /> : null}
                    {can ? (
                      <button type="button" onClick={column!.getToggleSortingHandler()} title="눌러서 정렬"
                        className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-[inherit] text-inherit hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                        {h.label}<Icon className={cn('size-3.5 shrink-0', !dir && 'opacity-40')} aria-hidden="true" />
                      </button>
                    ) : h.label}
                  </TableHead>
                );
              })}
            </tr>
          ))}
        </TableHeader>
        <TableBody>
          {top.map((r) => line(r, -1, true))}
          {spacer(padTop, 'pad-top')}
          {shown.map(({ row, i }) => line(row, i, false, want.virtual))}
          {spacer(padBottom, 'pad-bottom')}
          {q.trim() && !data.length ? <TableRow><TableCell colSpan={cols.length} className="text-center whitespace-normal text-muted-foreground">&lsquo;{q.trim()}&rsquo;에 맞는 행이 없습니다</TableCell></TableRow> : null}
          {!rows.length ? <TableRow><TableCell colSpan={cols.length} className="text-left text-sm whitespace-normal text-muted-foreground">{emptyText}</TableCell></TableRow> : null}
          {bottom.map((r) => line(r, -1, true))}
        </TableBody>
      </Table>
    </div>
  );
}
