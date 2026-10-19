import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Page, PageHead, PanelHead } from '@/components/page';
import { Card } from '@/components/ui/card';
import InfoTip from '@/components/ui/info-tip';
import Drawer from '@/components/projects/Drawer';
import FindFilters from '@/components/citizen/FindFilters';
import MyAreaFirst from '@/components/citizen/MyAreaFirst';
import PublicDetail from '@/components/citizen/PublicDetail';
import { mapHref, mapScopeHref } from '@/lib/board/map-href';
import { METRO_AREAS, SIDO_SHORT, guOf, unitOf } from '@/lib/board/metro-overview';
import { getProjectDrawer, getProjectsIndex, getPublicDetails } from '@/lib/board/projects-index';
import { BOARD_COLOR, applyFilters, isMetro, parseFilters, pastDueOf } from '@/lib/board/projects-view';
import {
  AGENCY_FULL, METRO, PG_SHORT, STAGE_GROUPS, byYear, findHref, groupOfBoard, ho, hoBig, inSupply, nameMatch, publicItems, refText, shortName,
  type FindQuery, type PublicItem, type StageGroup,
} from '@/lib/board/public-labels';

/* 일반사용자 '사업 찾기'(2026-10-19, 제안서 scratchpad/public-menus/proposal.md 4절). 정책 /projects 와 같은 목록 행(getProjectsIndex → rowsOf)·같은 거르기(parseFilters·applyFilters)이고
   이름·열·거르기만 다르다: 수도권(서울·인천·경기)의 공급 예정 사업(①~④ — /citizen 공급 예정 호수와 같은 범위)만, 들어올 해별 묶음, 묶음 안은 들어올 때 가까운 순(/citizen 시트 inCmp).
   주소: ?sido=metro|11|28|41 · ?sgg=시군구 · ?stage=prep|build|sale · ?q=이름 · ?id=사업(서랍). 주소에 지역이 없으면 내 동네(localStorage myArea)로 한 번 옮긴다.
   지연은 안 A — 사실 문장만(중립 색, 건수·'늦어지는 사업만' 거르기 없음). 정책 목표 대비·병목·핵심 질문·누적 진행·정책/기관/상태 칩·CSV·인쇄·사업 id·근거 접힘은 두지 않는다. */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const STAGES = Object.keys(STAGE_GROUPS) as StageGroup[];
/* 오늘(한국 시각) — 다음 일정에서 지난 예정을 빼는 기준(/citizen 은 브라우저 날짜) */
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function load(searchParams: Props['searchParams']) {
  const [q, idx] = await Promise.all([searchParams, getProjectsIndex()]);
  const f = parseFilters({ sido: one(q.sido), sgg: one(q.sgg) }, { policies: [], programs: [], sidoOk: (c) => METRO.includes(c), guOf });
  const stage = STAGES.find((s) => s === one(q.stage));
  const text = (one(q.q) ?? '').trim().slice(0, 40);
  const id = one(q.id) ?? null;
  const asked = ['sido', 'sgg', 'id', 'q'].some((k) => one(q[k]) !== undefined);
  /* 시도를 뗀 시군구 이름: 원장 이름('인천광역시 계양구' → '계양구'), 구가 있는 경기 시 코드는 지도 코드표('고양시') */
  const sggShort = (c: string) => { const n = idx.sggNames[c]; return n ? n.slice(n.indexOf(' ') + 1) : METRO_AREAS[c] ?? c; };
  const region = f.sgg ? `${SIDO_SHORT[f.sgg.slice(0, 2)]} ${sggShort(f.sgg)}` : f.sido ? SIDO_SHORT[f.sido] : '수도권';
  const cur: FindQuery = f.sgg ? { sgg: f.sgg } : { sido: f.sido ?? 'metro' };
  return { f, idx, stage, text, id, asked, sggShort, region, cur };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { id, region } = await load(searchParams);
  const d = id ? await getProjectDrawer(id) : null;
  if (d?.kind === 'detail' && isMetro(d.row.sgg)) return { title: shortName(d.row.name) };
  return { title: `${region} 사업 찾기` };
}

/* 줄 칸(1440): 이름 · 호 · 지금 · 다음 일정 · 들어올 때 · 예정 대비 · 시행. 900px 이하는 두세 줄(이름·호 / 지금·다음 일정 / 예정 대비) */
const COLS = 'grid grid-cols-[minmax(0,2.2fr)_6.5em_minmax(0,1.4fr)_minmax(0,1.9fr)_minmax(0,1.6fr)_minmax(0,1.9fr)_3.5em] items-baseline gap-x-4 mobile:grid-cols-[minmax(0,1fr)_auto] mobile:gap-y-0.5';
const LINK = 'group/action inline-flex items-center gap-px rounded-chip text-meta whitespace-nowrap text-muted-foreground no-underline underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
/* 단계 점(목록 '지금' 칸): 준비 중은 계획색, 짓는 중·모집 끝남은 그 단계색 */
const dotColor = (b: number) => BOARD_COLOR[b <= 1 ? 0 : b];

function Row({ x, href, on, withArea }: { x: PublicItem; href: string; on: boolean; withArea: boolean }) {
  const now = `${x.stage}${x.pct != null ? ` · 공사 ${x.pct}%` : ''}`;
  const label = [x.full || x.name, withArea ? x.area : '', x.units ? ho(x.units) : '호수 미정', now, `다음 일정 ${x.nextText}`, x.inText, x.fact, x.agency ? `시행 ${x.agency}` : ''].filter(Boolean).join(' · ');
  return (
    <li className="border-b border-border last:border-b-0">
      <Link href={href} scroll={false} aria-label={label} aria-current={on ? 'true' : undefined}
        className={`${COLS} rounded-tile px-compact-x py-tile-y text-body text-foreground no-underline hover:bg-pn2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${on ? 'bg-accent' : ''}`}>
        <span className="min-w-0">
          <span className="font-bold [overflow-wrap:anywhere]" title={x.full}>{x.name}</span>
          {x.sub || withArea ? <span className="ml-2 text-meta text-muted-foreground">{[withArea ? x.area : '', x.sub].filter(Boolean).join(' · ')}</span> : null}
        </span>
        <span className="text-right tabular-nums">{x.units ? ho(x.units) : <span className="text-muted-foreground">호수 미정</span>}</span>
        <span className="contents mobile:col-span-2 mobile:flex mobile:flex-wrap mobile:items-baseline mobile:gap-x-2">
          <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap"><i className="inline-block size-2.5 flex-none self-center rounded-full" style={{ background: dotColor(x.board) }} aria-hidden="true" />{now}</span>
          <span className={`tabular-nums ${x.nextText === '미정' ? 'text-muted-foreground' : ''}`}><span className="hidden mobile:inline" aria-hidden="true">· </span>{x.nextText}</span>
        </span>
        <span className={`tabular-nums mobile:hidden ${x.inDay ? '' : 'text-muted-foreground'}`}>{x.inText}</span>
        <span className={`text-muted-foreground ${x.fact ? 'mobile:col-span-2' : 'mobile:hidden'}`}>{x.fact}</span>
        <span className="mobile:hidden" title={x.agency ? AGENCY_FULL[x.agency] : undefined}>{x.agency || <span className="text-muted-foreground">미정</span>}</span>
      </Link>
    </li>
  );
}

export default async function CitizenProjectsPage({ searchParams }: Props) {
  const { f, idx, stage, text, id, asked, sggShort, region, cur } = await load(searchParams);
  const [details, drawer] = await Promise.all([getPublicDetails(), id ? getProjectDrawer(id) : null]);
  const today = todayKst();
  /* 범위: 정책 화면과 같은 지역 거르기(수도권 밖 시도는 parseFilters 가 받지 않는다) → 공급 예정(①~④) → 단계 묶음 */
  const scope = applyFilters(idx.rows, f).filter((r) => isMetro(r.sgg) && inSupply(r.board));
  const staged = stage ? scope.filter((r) => (STAGE_GROUPS[stage] as readonly number[]).includes(r.board)) : scope;
  const area = (c: string) => (f.metro ? `${SIDO_SHORT[c.slice(0, 2)]} ${sggShort(c)}` : sggShort(c));
  const all = publicItems(staged.map((r) => {
    const x = details[r.id];
    return { id: r.id, name: r.name, sgg: r.sgg, area: area(r.sgg), units: r.units, board: r.board, issued: r.issued, cls: r.cls, overdue: r.overdue, next: r.next,
      pastDue: pastDueOf(r), steps: x?.steps ?? [null, null, null, null], agency: x?.agency ?? '', progress: x?.progress ?? null };
  }), today, sggShort);
  const items = text ? all.filter((x) => nameMatch(text, [x.name, x.full])) : all;
  const groups = byYear(items, today);
  const units = items.reduce((s, x) => s + x.units, 0);
  const at = (p: FindQuery) => findHref({ ...cur, stage, q: text || undefined, ...p });
  const sel = drawer?.kind === 'detail' && isMetro(drawer.row.sgg) ? drawer : null;
  const selName = sel ? all.find((x) => x.id === sel.row.id)?.name ?? shortName(sel.row.name) : null;
  /* 시군구 메뉴: 고른 시도의 공급 예정 사업이 있는 시군구 */
  const sd = f.sgg ? f.sgg.slice(0, 2) : f.sido;
  const sggItems = sd ? [...new Set(idx.rows.filter((r) => r.sgg.startsWith(sd) && inSupply(r.board)).map((r) => r.sgg))].map((code) => ({ code, label: sggShort(code) })).sort((a, b) => a.label.localeCompare(b.label, 'ko')) : [];
  const mapTo = mapScopeHref({ sgg: f.sgg ?? null, sido: f.sido ?? null });
  const empty = [stage && { href: at({ stage: undefined }), label: '단계 전체로' }, text && { href: at({ q: undefined }), label: '이름 검색 지우기' },
    f.sgg ? { href: at({ sgg: undefined, sido: f.sgg.slice(0, 2) }), label: `${SIDO_SHORT[f.sgg.slice(0, 2)]} 전체로` } : f.sido ? { href: at({ sido: 'metro' }), label: '수도권 전체로' } : null].filter(Boolean) as { href: string; label: string }[];

  return (
    <Page>
      {asked ? null : <MyAreaFirst stage={stage} />}
      <PageHead title="사업 찾기"
        meta={<span className="inline-flex items-center gap-x-1">{refText(idx.referenceDate)}
          <InfoTip label="자료 기준"><p>국토교통부·LH·SH·GH 공공 자료를 모은 수도권(서울·인천·경기) 공공 주택 사업이에요</p><p>예정일은 사업 시행자 계획이라 바뀔 수 있어요</p><p>출처: 국토교통부 건축HUB · LH · 청약홈</p></InfoTip></span>} />
      <FindFilters sido={cur.sido ?? f.sgg!.slice(0, 2)} sgg={f.sgg ? { code: f.sgg, label: sggShort(f.sgg) } : null} sggItems={sggItems} stage={stage} q={text} />
      <Card render={<section aria-labelledby="find-list" />}>
        <PanelHead id="find-list" title={`${region} · 사업 ${items.length.toLocaleString('ko-KR')}곳 · ${hoBig(units)}`}
          scope={<InfoTip label="사업 수"><p>지금 짓기 전이거나 짓는 중이거나 모집 공고까지 나간 공공 주택 사업이에요(종합상황판의 공급 예정 호수와 같은 범위)</p><p>들어올 해별로 묶고, 들어올 때가 가까운 순이에요</p></InfoTip>}>
          {mapTo ? <a href={mapTo} className={LINK}>지도에서 보기<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></a> : null}
        </PanelHead>
        {groups.length ? (
          <>
            <div className={`${COLS} border-b border-border px-compact-x pb-2 text-meta text-muted-foreground mobile:hidden`} aria-hidden="true">
              <span>이름</span><span className="text-right">호</span><span>지금</span><span>다음 일정</span><span>들어올 때</span><span>예정 대비</span><span>시행</span>
            </div>
            {groups.map((g) => (
              <section key={g.year || 'none'} aria-label={g.label} className="mt-4 first-of-type:mt-3">
                <h3 className="ui-h3 m-0 flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border px-compact-x pb-1.5">
                  <span>{g.label}</span><span className="text-meta font-normal text-muted-foreground tabular-nums">{`${g.items.length}곳 · ${ho(g.units)}`}</span>
                </h3>
                <ul className="m-0 list-none p-0">
                  {g.items.map((x) => <Row key={x.id} x={x} href={at({ id: x.id })} on={x.id === sel?.row.id} withArea={!f.sgg} />)}
                </ul>
              </section>
            ))}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-tile-y">
            <p className="m-0 text-base">이 조건의 사업이 없어요</p>
            {empty.map((e) => <Link key={e.href} href={e.href} scroll={false} className={LINK}>{e.label}<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>)}
          </div>
        )}
      </Card>
      <Drawer id={sel ? id : null} canonical={sel?.row.id ?? null} closeHref={at({ id: undefined })} title={selName}
        head={sel ? <span className="basis-full text-meta text-muted-foreground">{[`${SIDO_SHORT[sel.row.sgg.slice(0, 2)]} ${sggShort(sel.row.sgg)}`, details[sel.row.id]?.agency ? `시행 ${details[sel.row.id].agency}` : ''].filter(Boolean).join(' · ')}{sel.row.programs[0] ? <span className="ui-chip ml-2" title={sel.row.programs[0]}>{PG_SHORT[sel.row.programs[0]] ?? sel.row.programs[0]}</span> : null}</span> : null}>
        {sel ? <PublicDetail d={sel} x={details[sel.row.id]} today={today} pastDue={pastDueOf(sel.row)}
          links={{ map: mapHref({ project: sel.row.id }), schedule: `/citizen/schedule?sido=${sel.row.sgg.slice(0, 2)}&sgg=${unitOf(sel.row.sgg) ?? sel.row.sgg}`, sameStage: groupOfBoard(sel.row.board) ? at({ stage: groupOfBoard(sel.row.board)!, id: undefined }) : null }} /> : null}
      </Drawer>
    </Page>
  );
}
