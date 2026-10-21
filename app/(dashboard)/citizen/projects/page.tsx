import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { MetricRow, Page, PageHead, PanelHead } from '@/components/page';
import { Card } from '@/components/ui/card';
import InfoTip from '@/components/ui/info-tip';
import ScopeChip from '@/components/ui/scope-chip';
import FindFilters from '@/components/citizen/FindFilters';
import RowLink from '@/components/windows/RowLink';
import WindowSeed from '@/components/windows/WindowSeed';
import { mapScopeHref } from '@/lib/board/map-href';
import { METRO_AREAS, SIDO_SHORT, guOf } from '@/lib/board/metro-overview';
import { getProjectDrawer, getProjectsIndex, getPublicDetails } from '@/lib/board/projects-index';
import { projectWindow } from '@/lib/board/project-window';
import { applyFilters, homeRowsOf, isMetro, parseFilters, type HomeDocRow, type HomeResidual } from '@/lib/board/projects-view';
import homeJson from '@/data/board/home-projects.json';
import {
  AGENCY_FULL, DUP_TEXT, DUP_TIP, METRO, PUBLIC_OF_HOME, STAGE_GROUPS, bigNum, byYear, dupAliases, findHref, ho, homeFact, nameMatch, publicItems, refText, shortName,
  type FindQuery, type PublicItem, type StageGroup,
} from '@/lib/board/public-labels';

/* 일반사용자 '사업 찾기'(2026-10-19, 제안서 scratchpad/public-menus/proposal.md 4절). 정책 /projects 와 같은 거르기(parseFilters·applyFilters)이고 이름·열·거르기만 다르다.
   2026-10-21 HOME PoC 수치 일치(사용자 결정 — 일반사용자까지 9·7 기본, 전환 없음): 목록 줄 = HOME 원천 사업 행(PRO_ — data/board/home-projects.json, 정책 /projects 와 같은 homeRowsOf) 중
   수도권 9·7 포트폴리오의 물량 집계 행(175행 151,271호 — /citizen 공급 예정 호수와 같은 범위, 정책 /projects 230행 중 같은 블록에 겹친·모호 55행은 줄로 보이지 않는다).
   이름 검색은 겹친 행 이름도 받아 그 대표 줄(같은 블록 또는 같은 현장 원장 사업의 집계 행)로 잇고, 대표 줄이 없는 겹친 행은 검색할 때만 그 줄 그대로(DUP_TEXT) 보인다.
   호수 = 집계 호수, 단계 = PoC 누적 도달 칸 → 일반사용자 이름(PUBLIC_OF_HOME),
   예정 대비 = PoC 판정(homeFact — 2026-10-21 W6 원장 예정일 문장 없음), 시행 = PoC 기관 이름, 공사 % = PoC 공정률. 다음 일정·들어올 때·사업 창은 같은 현장 원장 사업(ourId)의 값(없으면 미정·창 없음).
   들어올 해별 묶음, 묶음 안은 들어올 때 가까운 순(/citizen 시트 inCmp).
   주소: ?sido=metro|11|28|41 · ?sgg=시군구 · ?stage=prep|build|sale · ?q=이름 · ?id=사업(사업 창 — 2026-10-19 서랍 대체, 한 번에 1개). 첫 범위는 늘 수도권 전체(2026-10-21 W6), 저장된 내 동네(localStorage myArea)는 수도권 전체일 때 거르기 줄의 [내 동네] 단추(MyAreaFirst)로 한 번 눌러 간다.
   지연은 안 A — 사실 문장만(중립 색, 건수·'늦어지는 사업만' 거르기 없음). 정책 목표 대비·병목·핵심 질문·누적 진행·정책/기관/상태 칩·CSV·인쇄·사업 id·근거 접힘은 두지 않는다. */
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const STAGES = Object.keys(STAGE_GROUPS) as StageGroup[];
const HOME = homeJson as unknown as { asOf: string; rows: HomeDocRow[]; residuals: HomeResidual[] };
const BLOCK = new Map(HOME.rows.map((r) => [r.id, r.loc.block]));
/* 오늘(한국 시각) — 다음 일정에서 지난 예정을 빼는 기준(/citizen 은 브라우저 날짜) */
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function load(searchParams: Props['searchParams']) {
  const [q, idx] = await Promise.all([searchParams, getProjectsIndex()]);
  const home = homeRowsOf(HOME.rows).filter((r) => isMetro(r.sgg) && r.home!.p97);
  const f = parseFilters({ sido: one(q.sido), sgg: one(q.sgg) }, { policies: [], programs: [], sidoOk: (c) => METRO.includes(c), guOf });
  const stage = STAGES.find((s) => s === one(q.stage));
  const text = (one(q.q) ?? '').trim().slice(0, 40);
  const id = one(q.id) ?? null;
  /* 시도를 뗀 시군구 이름: 원장 이름('인천광역시 계양구' → '계양구'), 구가 있는 경기 시 코드는 지도 코드표('고양시'), 그 밖은 HOME 행의 시군구 이름(시군구 미연결은 '시군구 미정') */
  const homeSgg = new Map(home.map((r) => [r.sgg, r.sggName]));
  const sggShort = (c: string) => { const n = idx.sggNames[c] ?? homeSgg.get(c); return c.endsWith('000') ? '시군구 미정' : n ? n.slice(n.indexOf(' ') + 1) : METRO_AREAS[c] ?? c; };
  const region = f.sgg ? `${SIDO_SHORT[f.sgg.slice(0, 2)]} ${sggShort(f.sgg)}` : f.sido ? SIDO_SHORT[f.sido] : '수도권';
  const cur: FindQuery = f.sgg ? { sgg: f.sgg } : { sido: f.sido ?? 'metro' };
  /* 받은 쿼리 글자(첫 창의 '같은 단계' 링크가 지금 거르기를 지키게 — WindowSeed) */
  const search = new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString();
  return { f, idx, home, stage, text, id, sggShort, region, cur, search };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { id, region } = await load(searchParams);
  const d = id ? await getProjectDrawer(id) : null;
  if (d?.kind === 'detail' && isMetro(d.row.sgg)) return { title: shortName(d.row.name) };
  return { title: `${region} 사업 찾기` };
}

/* 표(2026-10-19 사용자 피드백 '카드 안 데이터 구분·grid·연도/사업 구분'): 열 정의 하나(COLS)를 머리 줄·모든 줄이 함께 써서 열 너비가 같다.
   칸 사이 옅은 세로선(--border)·줄 구분선·번갈아 바탕(components/ui/data-grid.tsx 와 같은 불투명 줄무늬 — 묶음의 첫 줄은 해 머리라 odd = 둘째·넷째 사업), 줄 높이 44 이상. 열 머리는 메뉴 바(64, 900px 이하 48) 아래에, 해 묶음 머리는 열 머리 아래에 붙는다.
   접근성: role=table/rowgroup/row/columnheader/cell — 줄 전체를 덮는 링크는 이름 칸의 사업 이름(after 로 줄을 덮음)이라 링크·표 의미가 함께 산다.
   900px 이하: 열 머리는 화면 읽기에만, 사업마다 테두리 칸(이름·지역 + 호 / 진행 / 다음 일정 / 들어올 때 / 예정 대비) */
const COLS = 'grid grid-cols-[minmax(0,2.2fr)_6.5em_minmax(9.5em,1.5fr)_minmax(0,1.8fr)_minmax(0,1.4fr)_minmax(0,1.8fr)_4.5em] mobile:grid-cols-[minmax(0,1fr)_auto]';
/* 칸: 좌우 12 + 첫 칸을 뺀 칸 왼쪽 세로선. 900px 이하는 세로선·좌우 여백 없음(칸 안 여백이 대신) */
const CELL = 'min-w-0 px-3 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border mobile:px-0 mobile:border-l-0!';
const LINK = 'group/action inline-flex items-center gap-px rounded-chip text-meta whitespace-nowrap text-muted-foreground no-underline underline-offset-4 hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
/* 진행 띠(/citizen 사업 표 progHtml 과 같은 6칸): 채운 칸(지나온 단계 + 지금) = 칸마다 자기 단계색, 남은 칸 = --line2. 단계 이름은 그 단계 글자색(준비 중 = 계획) */
const BAND = ['plan', 'permit', 'build', 'sale', 'soon', 'move'] as const;
const INK = ['plan', 'plan', 'build', 'sale', 'soon', 'move'] as const;
function Progress({ x }: { x: PublicItem }) {
  return (
    <span className="flex flex-col items-start gap-y-1 mobile:flex-row mobile:flex-wrap mobile:items-center mobile:gap-x-2">
      <span className="inline-grid flex-none grid-cols-[repeat(6,var(--pj-band-w))] gap-(--pj-band-gap)" aria-hidden="true">
        {BAND.map((n, i) => <span key={n} className="block h-(--pj-band-h) rounded-chip bg-line2" style={i <= x.board ? { background: `var(--st-${n})` } : undefined} />)}
      </span>
      <span className="whitespace-nowrap tabular-nums">
        <b className="font-bold" style={{ color: `var(--st-${INK[x.board] ?? 'plan'}-ink)` }}>{x.stage}</b>
        {x.pct != null ? <span className="text-muted-foreground">{` · 공사 ${x.pct}%`}</span> : null}
      </span>
    </span>
  );
}
/* 900px 이하에서만 보이는 칸 이름(열 머리와 같은 말, 화면 읽기는 열 머리로 듣는다) */
const Tag = ({ children }: { children: string }) => <span className="mr-2 hidden text-meta text-muted-foreground mobile:inline" aria-hidden="true">{children}</span>;
/* 날짜 안에서는 줄을 바꾸지 않음(2026-10-19 1280 폭에서 '2025년 2월 / 18일' 처럼 끊김): 날짜 사이 공백만 줄바꿈 없는 공백으로 */
const keepDate = (s: string) => s.replace(/\d{4}년(?: \d{1,2}월)?(?: \d{1,2}일)?/g, (m) => m.replace(/ /g, '\u00a0'));

function Row({ x, href, on, withArea }: { x: PublicItem; href: string | null; on: boolean; withArea: boolean }) {
  const tip = [x.full !== x.name ? x.full : '', x.agency ? `시행 ${AGENCY_FULL[x.agency] ?? x.agency}` : ''].filter(Boolean).join('\n');
  return (
    <div role="row" className={`${COLS} relative min-h-14 items-center border-b border-border py-2.5 text-body text-foreground last:border-b-0 odd:bg-[color-mix(in_srgb,var(--pn2)_45%,var(--card))] hover:bg-pn2 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-primary has-[a[aria-current]]:bg-accent! has-[a[aria-current]]:outline has-[a[aria-current]]:outline-1 has-[a[aria-current]]:-outline-offset-1 has-[a[aria-current]]:outline-primary
      mobile:mt-2 mobile:gap-y-1.5 mobile:rounded-tile mobile:border mobile:border-border mobile:bg-card mobile:odd:bg-card mobile:px-tile-x mobile:py-tile-y mobile:last:border-b mobile:hover:bg-pn2`}>
      <span role="cell" className={`${CELL} flex flex-col items-start gap-y-1 mobile:flex-row mobile:flex-wrap mobile:items-baseline mobile:gap-x-2`}>
        {href && x.link ? (
          <RowLink pid={x.link} on={on} href={href} scroll={false} title={tip || undefined}
            className="font-bold text-foreground no-underline [overflow-wrap:anywhere] after:absolute after:inset-0 hover:underline focus-visible:outline-none">{x.name}</RowLink>
        ) : <span className="font-bold text-foreground [overflow-wrap:anywhere]" title={tip || undefined}>{x.name}</span>}
        {withArea || x.sub ? (
          <span className="flex flex-wrap items-baseline gap-x-2 mobile:contents">
            {withArea ? <span className="ui-chip">{x.area}</span> : null}
            {x.sub ? <span className="text-meta text-muted-foreground">{x.sub}</span> : null}
          </span>
        ) : null}
      </span>
      <span role="cell" className={`${CELL} self-center text-right tabular-nums mobile:self-start`}>{x.units ? ho(x.units) : x.dup ? <span className="text-muted-foreground" title={DUP_TIP}>{DUP_TEXT}</span> : <span className="text-muted-foreground">호수 미정</span>}</span>
      <span role="cell" className={`${CELL} mobile:col-span-2`}><Progress x={x} /></span>
      <span role="cell" className={`${CELL} tabular-nums mobile:col-span-2 ${x.nextText === '미정' ? 'text-muted-foreground' : ''}`}><Tag>다음 일정</Tag>{keepDate(x.nextText)}</span>
      <span role="cell" className={`${CELL} tabular-nums mobile:col-span-2 ${x.inDay ? '' : 'text-muted-foreground'}`}><Tag>들어올 때</Tag>{keepDate(x.inText)}</span>
      <span role="cell" className={`${CELL} text-muted-foreground mobile:col-span-2 ${x.fact ? '' : 'mobile:hidden'}`}>{x.fact}</span>
      <span role="cell" className={`${CELL} mobile:hidden`}>{x.agency || <span className="text-muted-foreground">미정</span>}</span>
    </div>
  );
}

export default async function CitizenProjectsPage({ searchParams }: Props) {
  const { f, idx, home, stage, text, id, sggShort, region, cur, search } = await load(searchParams);
  const today = todayKst();
  /* 첫 창(?id=): 창 props 는 projectWindow 결과만(수도권 발급 사업 — 허용 목록, RSC 페이로드에 공개된다) */
  const [details, win] = await Promise.all([getPublicDetails(), id ? projectWindow(id, 'public', { today }) : null]);
  /* 범위: 정책 화면과 같은 지역 거르기(수도권 밖 시도는 parseFilters 가 받지 않는다) → HOME PoC 9·7 집계 행(겹친 행은 이름 검색일 때만 — dupAliases) → 단계 묶음(일반사용자 칸) */
  const ours = new Map([...idx.rows, ...idx.renewalRows].map((r) => [r.id, r]));
  const { also, orphan } = dupAliases(home, (pid) => BLOCK.get(pid) ?? null);
  const scope = applyFilters(home.filter((r) => r.home!.chart.p97 || (text && orphan.has(r.id))), f);
  const pb = (r: (typeof home)[number]) => PUBLIC_OF_HOME[r.board] ?? 0;
  const staged = stage ? scope.filter((r) => (STAGE_GROUPS[stage] as readonly number[]).includes(pb(r))) : scope;
  const area = (c: string) => (f.metro ? `${SIDO_SHORT[c.slice(0, 2)]} ${sggShort(c)}` : sggShort(c));
  const all = publicItems(staged.map((r) => {
    const h = r.home!, o = h.ourId ? ours.get(h.ourId) : undefined, x = h.ourId ? details[h.ourId] : undefined;
    return { id: r.id, name: r.name, sgg: r.sgg, area: area(r.sgg), units: h.counted ?? 0, board: pb(r), issued: true, cls: r.cls, overdue: o?.overdue ?? null, next: o?.next ?? null,
      pastDue: false, steps: x?.steps ?? [null, null, null, null], agency: r.agency === '기관 미상' ? '' : r.agency ?? '', progress: h.progress ? Math.round(h.progress.pct) : null,
      fact: homeFact(r.cls, h.gap), dup: !h.chart.p97 && (r.units ?? 0) > 0, link: h.ourId && details[h.ourId] ? h.ourId : null };
  }), today, sggShort);
  const items = text ? all.filter((x) => nameMatch(text, [x.name, x.full, ...(also.get(x.id) ?? [])])) : all;
  const groups = byYear(items, today);
  const units = items.reduce((s, x) => s + x.units, 0);
  const at = (p: FindQuery) => findHref({ ...cur, stage, q: text || undefined, ...p });
  /* 창 제목 = 목록에 보이는 이름(같은 이름 사업을 가른 이름), 목록에 없으면 짧은 이름 */
  const sel = win ? { ...win, title: all.find((x) => x.link === win.canonical)?.name ?? win.title } : null;
  /* 시군구 메뉴: 고른 시도의 HOME 행이 있는 시군구(시군구 미연결 행은 시도 전체에서만) */
  const sd = f.sgg ? f.sgg.slice(0, 2) : f.sido;
  const sggItems = sd ? [...new Set(home.filter((r) => r.sgg.startsWith(sd) && !r.sgg.endsWith('000')).map((r) => r.sgg))].map((code) => ({ code, label: sggShort(code) })).sort((a, b) => a.label.localeCompare(b.label, 'ko')) : [];
  const mapTo = mapScopeHref({ sgg: f.sgg ?? null, sido: f.sido ?? null });
  const empty = [stage && { href: at({ stage: undefined }), label: '단계 전체로' }, text && { href: at({ q: undefined }), label: '이름 검색 지우기' },
    f.sgg ? { href: at({ sgg: undefined, sido: f.sgg.slice(0, 2) }), label: `${SIDO_SHORT[f.sgg.slice(0, 2)]} 전체로` } : f.sido ? { href: at({ sido: 'metro' }), label: '수도권 전체로' } : null].filter(Boolean) as { href: string; label: string }[];

  return (
    <Page>
      <PageHead title="사업 찾기"
        meta={<span className="inline-flex items-center gap-x-1">{refText(idx.referenceDate)}
          <InfoTip label="자료 기준"><p>국토교통부·LH·SH·GH·iH 공공 자료를 모은 수도권(서울·인천·경기) 주택 공급 정책 사업이에요</p><p>예정일은 사업 시행자 계획이라 바뀔 수 있어요</p><p>출처: 국토교통부 건축HUB · LH · 청약홈</p></InfoTip></span>} />
      <FindFilters sido={cur.sido ?? f.sgg!.slice(0, 2)} sgg={f.sgg ? { code: f.sgg, label: sggShort(f.sgg) } : null} sggItems={sggItems} stage={stage} q={text} myArea={!f.sgg && !f.sido} />
      <Card render={<section aria-labelledby="find-list" />}>
        <PanelHead id="find-list" title="사업 목록"
          scope={<><ScopeChip scope={region} title={`${region}의 9·7 주택 공급 확대 방안 사업`} /><InfoTip label="사업 수"><p>9·7 주택 공급 확대 방안에 연결된 수도권 사업이에요(종합상황판의 공급 예정 호수와 같은 범위)</p><p>같은 단지 자료가 여러 개면 한 번만 세요</p><p>들어올 해별로 묶고, 들어올 때가 가까운 순이에요</p></InfoTip></>}>
          {mapTo ? <a href={mapTo} className={LINK}>지도에서 보기<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></a> : null}
        </PanelHead>
        <MetricRow className="mb-2" value={bigNum(units)} unit="호" items={[`${items.length.toLocaleString('ko-KR')}곳`]} />
        {groups.length ? (
          <div role="table" aria-labelledby="find-list">
            <div role="row" className={`${COLS} sticky top-16 z-20 h-10 items-center border-b border-border bg-card text-meta font-bold text-muted-foreground mobile:sr-only`}>
              {['이름', '호', '지금', '다음 일정', '들어올 때', '예정 대비', '시행'].map((h, i) => <span key={h} role="columnheader" className={`${CELL} ${i === 1 ? 'text-right' : ''}`}>{h}</span>)}
            </div>
            {groups.map((g) => (
              <section key={g.year || 'none'} role="rowgroup" aria-label={g.label} className="mt-6 first-of-type:mt-3 mobile:mt-5">
                <div role="row" className="sticky top-26 z-10 mobile:top-12">
                  <div role="cell" aria-colspan={7} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 rounded-tile bg-[color-mix(in_oklab,var(--primary)_var(--tint-mix),var(--card))] px-3 py-2">
                    <h3 className="m-0 text-md leading-sub font-bold text-foreground">{g.label}</h3>
                    <span className="text-meta text-muted-foreground tabular-nums">{`${g.items.length}곳 · ${ho(g.units)}`}</span>
                  </div>
                </div>
                {g.items.map((x) => <Row key={x.id} x={x} href={x.link ? at({ id: x.link }) : null} on={!!x.link && x.link === sel?.canonical} withArea={!f.sgg} />)}
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-tile-y">
            <p className="m-0 text-base">이 조건의 사업이 없어요</p>
            {empty.map((e) => <Link key={e.href} href={e.href} scroll={false} className={LINK}>{e.label}<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /></Link>)}
          </div>
        )}
      </Card>
      {/* 사업 창(한 번에 1개 — 다른 사업을 누르면 내용 교체): 창 관리자 components/windows. 주소로 연 첫 창은 서버가 만든 props 로 깜박임 없이 */}
      <WindowSeed win={sel} path="/citizen/projects" search={search} />
    </Page>
  );
}
