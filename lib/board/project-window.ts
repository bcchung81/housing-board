/* 사업 창(모달리스 창, 2026-10-19 — 옛 사업 상세 서랍 대체) 내용 props 를 만드는 하나뿐인 함수(서버 전용). 페이지의 첫 창(/projects·/citizen/projects)과
   상세 API(app/api/v1/project/[id]/route.ts)가 같이 쓴다 — 서버 컴포넌트가 클라이언트 부품에 넘기는 props 도 RSC 페이로드로 공개되므로 둘 다 이 결과만 싣는다.
   허용 목록: 건축HUB 관리번호(pks — 공개 범위 미결, projects-view MapRow)·번들 단지(bundles)·법정동(bjd)·필지(pnus)는 싣지 않는다.
   화면 계산에 필요한 파생값(지도 위치 판정 mapLocOf · 후보 출처 이름 · 시군구 표기)은 여기서 계산해 싣고, 출처는 그 사업 refs 가 가리키는 것만, 기관 이름·정책도 그 사업 것만.
   지금 보는 화면의 거르기에 따라 달라지는 링크(같은 단계 사업)는 클라이언트(components/windows)가 만든다. 함수는 싣지 않는다(직렬화되는 값만).
   HOME 원천 행(?id=PRO_…, 2026-10-21 — 사업 화면 목록의 행): 머리·단계·상태·기관·호수는 PoC 값(row.home), 우리 원장 사업(같은 현장 병합 — ourId)이 있으면 그 상세(일정·공정률·공고·근거)를 붙인다(ledger).
   붙인 상세의 단계별 '예정일 경과' 표지(옛 판정)는 PoC 판정과 섞이지 않게 뺀다. 원장 사업이 없으면 kind 'home'(머리·단계·개요만). */
import { getBoardData } from './data';
import { sidoName } from './calc';
import { getHomeProjects, getProjectDrawer, getProjectsIndex, getPublicDetails, type SourceRef } from './projects-index';
import { sggLabel } from './projects-list';
import { candidateOf, homeJudgeOf, isMetro, mapLocOf, pastDueOf, type Cls, type MapLoc, type Policy, type ProjectDetail, type ProjectRow, type PublicJudge } from './projects-view';
import { mapHref } from './map-href';
import { METRO_AREAS, SIDO_SHORT, unitOf } from './metro-overview';
import { PG_SHORT, groupOfBoard, noticeUrl, shortName, type StageGroup, type Steps } from './public-labels';

export type WinRow = Omit<ProjectRow, 'pks' | 'bundles'>;
/* 공고 줄: 원장 공고 + 상세 주소(서버가 만든다 — noticeUrl). review 가 CONFIRMED 가 아니면 화면이 '확인 필요'(정책담당자)·'확인 중'(일반사용자) 표지를 단다.
   확정 연결 먼저 · 공고일 최근 순 NOTICE_SHOW 건만 싣고 나머지는 noticesMore(건수 — 화면 '외 n건') */
export type WinNotice = { system: string; id: string; title: string; date: string | null; review: string; url: string | null };
type WinNotices = { notices?: WinNotice[]; noticesMore?: number };
export type WinDetail = Omit<ProjectDetail, 'bjd' | 'notices'> & WinNotices;
type Base = { asked: string; canonical: string; title: string; dataAsOf: string };
/* 정책담당자: 발급 사업 상세(ProjectDetail + DrawerHead) · 목록에서 뺀 사업(안내) · 번호 없는 후보 간단 보기(Candidate + CandidateHead) */
/* ledger = HOME 원천 행 창에 붙인 우리 원장 사업(id·이름·그 사업에 합쳐진 원천 행 수) — 원장 사업 창이면 없음 */
export type LedgerLink = { id: string; name: string; rows: number };
/* judge = 원장 사업 창(?id=PRJ-…)에 합쳐진 HOME 원천 행들의 PoC 판정(2026-10-21 — 일반사용자 창 home 과 같은 규칙) + 그 행들(id·이름·판정·부족 호수). 있으면 상태는 이것, 옛 '예정일 경과' 표지는 뺀다 */
export type JudgeRow = { id: string; name: string; cls: Cls | null; gap: number | null };
export type AdminJudge = PublicJudge & { rows: JudgeRow[] };
export type AdminDetailWin = Base & { kind: 'detail'; view: 'admin'; row: WinRow; detail: WinDetail; sources: Record<string, SourceRef>; agencies: Record<string, string>; referenceDate: string; policies: Policy[];
  from: { id: string; name: string } | null; label: string | null; mapLoc: MapLoc | null; ledger?: LedgerLink; judge?: AdminJudge };
/* HOME 원천 행인데 우리 원장 사업이 없음(덤프 뒤 생긴 행·변환 제외) — 머리·단계·개요만 */
export type HomeWin = Base & { kind: 'home'; view: 'admin'; row: WinRow; policies: Policy[]; referenceDate: string };
export type HiddenWin = Base & { kind: 'hidden'; view: 'admin'; project: { id: string; name: string; hiddenAt: string; hiddenReason?: string }; sggName: string };
export type CandidateWin = Base & { kind: 'candidate'; view: 'admin'; row: WinRow; sggName: string; sources: string[] };
/* 일반사용자: 사업 찾기 상세(PublicDetail + 머리 — 지역·시행·유형). today 는 페이지가 넣을 때만(없으면 클라이언트가 오늘 날짜) */
export type PublicExtra = { steps: Steps; agency: string; progress: number | null; progressAt: string | null; progress1: number | null };
/* home = 이 원장 사업에 합쳐진 HOME 원천 행들의 PoC 사업 판정(2026-10-21 — 가장 나쁜 판정 하나와 그 판정 행들의 부족 호수 합, 원천 행이 없으면 null). 있으면 예정 대비 문장은 이것으로(public-labels homeFact),
   옛 원장 '예정일 지남'(pastDue)은 쓰지 않는다 — 사업 찾기 목록 줄과 같은 규칙 */
export type PublicWin = Base & { kind: 'detail'; view: 'public'; row: WinRow; detail: { refs: string[] } & WinNotices; sources: Record<string, SourceRef>; referenceDate: string; extra: PublicExtra | null; pastDue: boolean; home: PublicJudge | null;
  head: { area: string; agency: string; program: { name: string; short: string } | null; types?: { name: string; raw: string[] }[] }; links: { map: string; schedule: string }; sameStage: StageGroup | null; today?: string };
export type ProjectWindow = AdminDetailWin | HiddenWin | CandidateWin | HomeWin | PublicWin;

/* 허용 목록: 이름을 적은 칸만 옮긴다(원장 행 JSON 에는 타입에 없는 칸 — 필지 pnus 등 — 도 있어 빼기 대신 고르기) */
const ROW_KEYS = ['id', 'name', 'issued', 'stage', 'cls', 'why', 'overdue', 'next', 'done', 'units', 'dateAlt', 'sgg', 'sggName', 'notice', 'programs', 'policies', 'link', 'agency', 'reached', 'completion', 'board', 'home'] as const satisfies readonly (keyof WinRow)[];
const DETAIL_KEYS = ['unit', 'agency', 'scope', 'basis', 'asOf', 'issuedAt', 'source', 'stages', 'progress', 'refs', 'loc', 'types'] as const satisfies readonly (keyof WinDetail)[];
const only = <T extends object>(o: T, keys: readonly (keyof T)[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const rowOf = (r: ProjectRow) => only(r, ROW_KEYS) as WinRow;
const NOTICE_SHOW = 3;
const noticesOf = (x: ProjectDetail): WinNotices => {
  if (!x.notices?.length) return {};
  const all = [...x.notices].sort((a, b) => +(a.review !== 'CONFIRMED') - +(b.review !== 'CONFIRMED') || (b.date ?? '').localeCompare(a.date ?? '') || b.id.localeCompare(a.id));   // 확정 연결 먼저(검토 중 LH 공고가 확정 청약홈 공고를 밀어내지 않게), 그 안에서 최근 순
  const notices = all.slice(0, NOTICE_SHOW).map((n) => ({ system: n.system, id: n.id, title: n.title, date: n.date, review: n.review, url: noticeUrl(n.system, n.id, n.url) }));
  return { notices, ...(all.length > NOTICE_SHOW ? { noticesMore: all.length - NOTICE_SHOW } : {}) };
};
const detailOf = (x: ProjectDetail) => ({ ...only(x, DETAIL_KEYS), ...noticesOf(x) }) as WinDetail;
/* PoC 판정을 쓰는 창: 단계별 '예정일 경과' 표지(옛 판정)를 뺀다 */
const noLate = (x: WinDetail): WinDetail => ({ ...x, stages: Object.fromEntries(Object.entries(x.stages).map(([k, st]) => { const { late: _late, ...rest } = st ?? {}; return [k, rest]; })) as WinDetail['stages'] });
const pick = (all: Record<string, SourceRef>, refs: string[]) => Object.fromEntries(refs.filter((k) => all[k]).map((k) => [k, all[k]]));

/* asked = 주소의 id(옛 id 면 canonical 이 대표 사업 id), view = 관점. opts.cand = 후보 간단 보기(?cand=, 정책담당자만) · opts.today = 일반사용자 페이지 첫 창의 오늘(한국 시각).
   일반사용자 제목은 짧은 이름(shortName) — 사업 찾기 첫 창은 페이지가 목록에 보이는 이름으로 바꿔 넣는다.
   없는 사업·관점에 맞지 않는 사업(일반사용자는 수도권 발급 사업만 — 지금 /citizen/projects 의 sel 조건)은 null */
export async function projectWindow(asked: string, view: 'admin' | 'public', opts: { cand?: boolean; today?: string } = {}): Promise<ProjectWindow | null> {
  if (/^PRO_/.test(asked)) return view === 'admin' && !opts.cand ? homeWindow(asked) : null;
  const idx = await getProjectsIndex();
  const dataAsOf = idx.referenceDate;
  if (view === 'admin' && opts.cand) {
    const c = candidateOf(idx.rows, asked);
    if (!c) return null;
    const { molit } = await getBoardData();
    return { kind: 'candidate', view, asked, canonical: c.row.id, title: c.row.name, dataAsOf, row: rowOf(c.row), sggName: sggLabel(c.row.sggName, sidoName(molit, c.row.sgg.slice(0, 2))), sources: c.sources };
  }
  const d = await getProjectDrawer(asked);
  if (!d) return null;
  if (view === 'admin') {
    if (d.kind === 'hidden') {
      const p = d.project;
      return { kind: 'hidden', view, asked, canonical: p.id, title: p.name, dataAsOf, project: { id: p.id, name: p.name, hiddenAt: p.hiddenAt!, ...(p.hiddenReason ? { hiddenReason: p.hiddenReason } : {}) }, sggName: d.sggName };
    }
    const r = d.row, hs = (await getHomeProjects()).rows.filter((y) => y.home?.ourId === r.id), j = homeJudgeOf(hs, r.id);
    return { kind: 'detail', view, asked, canonical: r.id, title: d.label ?? r.name, dataAsOf, row: rowOf(r), detail: j ? noLate(detailOf(d.detail)) : detailOf(d.detail), sources: pick(d.sources, d.detail.refs),
      agencies: r.agency && d.agencies[r.agency] ? { [r.agency]: d.agencies[r.agency] } : {}, referenceDate: d.referenceDate, policies: d.policies.filter((p) => r.policies.includes(p.key)),
      from: d.from, label: d.label, mapLoc: mapLocOf(r, d.detail.loc),
      ...(j ? { judge: { ...j, rows: hs.map((y) => ({ id: y.id, name: y.name, cls: y.cls, gap: y.home!.gap ?? null })) } } : {}) };
  }
  if (d.kind !== 'detail' || !isMetro(d.row.sgg)) return null;
  const r = d.row, sd = r.sgg.slice(0, 2), x = (await getPublicDetails())[r.id] ?? null, home = homeJudgeOf((await getHomeProjects()).rows, r.id);
  /* 시도를 뗀 시군구 이름: 원장 이름('인천광역시 계양구' → '계양구'), 구가 있는 경기 시 코드는 지도 코드표(/citizen/projects sggShort 와 같다) */
  const n = idx.sggNames[r.sgg], sggShort = n ? n.slice(n.indexOf(' ') + 1) : METRO_AREAS[r.sgg] ?? r.sgg;
  return { kind: 'detail', view, asked, canonical: r.id, title: shortName(r.name), dataAsOf, row: rowOf(r), detail: { refs: d.detail.refs, ...noticesOf(d.detail) }, sources: pick(d.sources, d.detail.refs),
    referenceDate: d.referenceDate, extra: x, pastDue: home ? false : pastDueOf(r), home,
    head: { area: `${SIDO_SHORT[sd]} ${sggShort}`, agency: x?.agency ?? '', program: r.programs[0] ? { name: r.programs[0], short: PG_SHORT[r.programs[0]] ?? r.programs[0] } : null, ...(d.detail.types ? { types: d.detail.types } : {}) },
    links: { map: mapHref({ project: r.id }), schedule: `/citizen/schedule?sido=${sd}&sgg=${unitOf(r.sgg) ?? r.sgg}` }, sameStage: groupOfBoard(r.board), ...(opts.today ? { today: opts.today } : {}) };
}

/* HOME 원천 행 창(정책담당자만): 행 = PoC 값, 우리 원장 사업이 있으면 그 상세를 붙인다(옛 '예정일 경과' 표지는 뺀다) */
async function homeWindow(asked: string): Promise<AdminDetailWin | HomeWin | null> {
  const h = await getHomeProjects();
  const r = h.rows.find((x) => x.id === asked);
  if (!r) return null;
  const base = { view: 'admin' as const, asked, canonical: r.id, title: r.name, dataAsOf: h.referenceDate, row: rowOf(r) };
  const ourId = r.home?.ourId, d = ourId ? await getProjectDrawer(ourId) : null;
  if (!d || d.kind !== 'detail') return { ...base, kind: 'home', policies: h.policies.filter((p) => r.policies.includes(p.key)), referenceDate: h.referenceDate };
  return { ...base, kind: 'detail', detail: noLate(detailOf(d.detail)), sources: pick(d.sources, d.detail.refs), agencies: {}, referenceDate: d.referenceDate, policies: h.policies.filter((p) => r.policies.includes(p.key)),
    from: null, label: d.label, mapLoc: mapLocOf(d.row, d.detail.loc), ledger: { id: d.row.id, name: d.row.name, rows: h.rows.filter((y) => y.home?.ourId === ourId).length } };
}
