import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Crumbs from '../../../components/Crumbs';
import { Dl, Page, PageTitle, SectionTitle } from '../../../components/page';
import Fold from '../../../components/sources/Fold';
import HashOpen from '../../../components/sources/HashOpen';
import StageLinks from '../../../components/sources/StageLinks';
import { DataGrid } from '../../../components/ui/data-grid';
import { fmt } from '../../../lib/board/calc';
import { ledger, molit, projects, lh, sources } from '../../../lib/board/data';
import { ledgerJudged, ledgerMix, nation as nationOf } from '../../../lib/board/directives';
import { CIR, K } from '../../../lib/board/sample';
import { ITEMS, MODE_LABEL } from '../../../lib/board/pipeline';
import { COLLECTION, OPERATIONS, bytesLabel } from '../../../lib/board/collection';
import { SCREEN_USAGE, sourceGap, sourceUsage } from '../../../lib/board/screen-usage';
import { cacheRecords, csvDetail, detailOf, readJson } from '../../../lib/board/samples';
import { ACQUIRE, ACQUIRE_ASOF, GAPS, type AcquireStatus } from '../../../lib/board/acquire';
import { stageLinks } from '../../../lib/board/stage-links';
import regionIndex from '../../../regions/index.json';
import type { Source } from '../../../lib/board/types';
import { GRID_DENSE, type Col, type Detail, type Row } from '../../../lib/grid/spec';

export const metadata: Metadata = { title: '데이터 원본' };

const H2 = 'mt-6 mb-1 text-[17px]';
const H3 = 'mt-5 mb-1 text-[15px]';   // 기타 탭 안의 구역 제목

const SCREEN_COLS: Col[] = [
  { key: 'screen', label: '화면', kind: 'text' },
  { key: 'count', label: '수집 건수' },
  { key: 'total', label: '전체', group: '위젯·기능' },
  { key: 'real', label: '실데이터', group: '위젯·기능' },
  { key: 'sample', label: 'SAMPLE', group: '위젯·기능' },
  { key: 'store', label: '보관', group: '데이터' },
  { key: 'live', label: '실시간', group: '데이터' },
  { key: 'none', label: '미연결', group: '데이터' },
  { key: 'scope', label: '범위', kind: 'text' },
  { key: 'gap', label: '미연결·제한', kind: 'text', wrap: true },
];
const BOARD_COLS: Col[] = [
  { key: 'widget', label: '위젯', kind: 'text' },
  { key: 'kind', label: '구분', kind: 'text' },
  { key: 'data', label: '데이터', kind: 'text', wrap: true },
  { key: 'method', label: '수집', kind: 'text' },
  { key: 'cycle', label: '현재 수집 주기', kind: 'text' },
  { key: 'count', label: '수집 건수', kind: 'text' },
  { key: 'asOf', label: '기준일', kind: 'text' },
  { key: 'gap', label: '부족·필요 데이터', kind: 'text', wrap: true },
];
const MAP_COLS: Col[] = [
  { key: 'name', label: '데이터', kind: 'text' },
  { key: 'use', label: '지도 기능', kind: 'text' },
  { key: 'mode', label: '방식', kind: 'text' },
  { key: 'method', label: '수집', kind: 'text' },
  { key: 'cycle', label: '현재 수집 주기', kind: 'text' },
  { key: 'count', label: '수집 건수', kind: 'text' },
  { key: 'scope', label: '범위', kind: 'text' },
  { key: 'gap', label: '부족', kind: 'text', wrap: true },
];
const STATUSES: AcquireStatus[] = ['신규 신청 필요', '신청됨·미연결', '받기 조건 있음', '파일 미수집'];
const ACQ_SUM_COLS: Col[] = [
  { key: 'kind', label: '구분', kind: 'text' }, { key: 'total', label: '추가 확보 필요' },
  ...STATUSES.map((st) => ({ key: st, label: st, group: '상태' })),
];
const ACQ_COLS: Col[] = [
  { key: 'id', label: 'ID', kind: 'text' },
  { key: 'kind', label: '구분', kind: 'text' },
  { key: 'name', label: '데이터', kind: 'text' },
  { key: 'no', label: '번호', kind: 'text' },
  { key: 'org', label: '제공기관', kind: 'text' },
  { key: 'status', label: '상태', kind: 'text' },
  { key: 'gap', label: '채우는 부족', kind: 'text' },
  { key: 'screen', label: '화면', kind: 'text' },
  { key: 'cycle', label: '갱신', kind: 'text' },
  { key: 'checked', label: '확인', kind: 'text' },
  { key: 'note', label: '비고', kind: 'text' },
];
const CATALOG_COLS: Col[] = [
  { key: 'dataset', label: '수집명', kind: 'text', wrap: true },
  { key: 'board', label: '종합상황판', kind: 'text' },
  { key: 'map', label: '지도', kind: 'text' },
  { key: 'method', label: '수집 방법', kind: 'text' },
  { key: 'cycle', label: '수집 / 원천 주기', kind: 'text' },
  { key: 'count', label: '데이터량', kind: 'text' },
  { key: 'size', label: '파일 용량(실측)', kind: 'text' },
  { key: 'asOf', label: '원천 기준일', kind: 'text' },
  { key: 'got', label: '수집일', kind: 'text' },
  { key: 'gap', label: '부족한 데이터', kind: 'text', wrap: true },
];

function fileBytes(s: Source): number | null {
  const file = s.query.file;
  if (typeof file !== 'string') return null;
  const relative = file.startsWith('regions/') ? file : `data/raw/${s.id.startsWith('molit-') ? 'molit' : 'datagokr'}/${file}`;
  try { return statSync(path.join(process.cwd(), relative)).size; } catch { return null; }
}

/* 실제 지도 로더가 읽는 파일만 세며, 없는 선택 파일은 0으로 더한다. rec 는 행을 펼칠 때 보일 레코드(건물은 앞 10건만) */
type Rec = Record<string, unknown>;
function bundleCounts() {
  const counts = { projects: 0, buildings: 0, context: 0, infra: 0, infraRegions: 0, permits: 0, zones: 0 };
  const rec: Record<'projects' | 'buildings' | 'context' | 'infra' | 'permits' | 'zones', Rec[]> = { projects: [], buildings: [], context: [], infra: [], permits: [], zones: [] };
  const arr = (d: Record<string, unknown>, k: string) => (Array.isArray(d[k]) ? d[k] as Rec[] : []);
  for (const { slug } of regionIndex.regions) {
    const read = (name: string): Record<string, unknown> => {
      try { return JSON.parse(readFileSync(path.join(process.cwd(), 'regions', slug, `${name}.json`), 'utf8')); } catch { return {}; }
    };
    const n = (d: Record<string, unknown>, k: string) => Array.isArray(d[k]) ? d[k].length : 0;
    const projectsJson = read('projects'), buildings = read('buildings');
    counts.projects += n(projectsJson, 'projects');
    counts.buildings += n(buildings, 'features');
    rec.projects.push(...arr(projectsJson, 'projects').map((p) => ({ region: slug, ...p })));
    if (rec.buildings.length < 10) rec.buildings.push(...arr(buildings, 'features').slice(0, 10).map((f) => ({ region: slug, ...(f.properties as Rec) })));
    const context = read('context');
    counts.context += n(context, 'stations') + n(context, 'schools');
    rec.context.push(...arr(context, 'stations').map((x) => ({ region: slug, kind: '역', ...x })), ...arr(context, 'schools').map((x) => ({ region: slug, kind: '학교', ...x })));
    const infra = read('infra');
    if (Object.keys(infra).length) counts.infraRegions++;
    counts.permits += n(infra, 'permits');
    counts.zones += n(infra, 'zones') + n(infra, 'attendance');
    const kinds = ['schools', 'zones', 'attendance', 'stops', 'busRoutes', 'sites', 'permits', 'measures'];
    counts.infra += kinds.reduce((sum, k) => sum + n(infra, k), 0);
    for (let i = 0; rec.infra.length < 10 && kinds.some((k) => arr(infra, k)[i]); i++)   // 종류마다 돌아가며 하나씩
      for (const k of kinds) { const x = arr(infra, k)[i]; if (x && rec.infra.length < 10) rec.infra.push({ 구분: k, id: x.id ?? x.projectId, 이름: x.name ?? x.title ?? x.no ?? x.zoneId, 상태: x.status ?? x.category ?? x.type ?? null }); }
    rec.permits.push(...arr(infra, 'permits'));
    rec.zones.push(...arr(infra, 'zones').map((z) => ({ id: z.id, name: z.name, school: z.school })), ...arr(infra, 'attendance'));
  }
  return { ...counts, rec };
}

function SourceDetail({ s }: { s: Source }) {
  return (
    <section id={s.id} aria-label={s.dataset} className="scroll-mt-20 border-b border-border py-3 last:border-b-0">
      <h3 className="m-0 text-[14px]">{s.dataset}</h3>
      <p className="mt-1 mb-1.5 text-[13px] text-muted-foreground">{s.description}</p>
      <Dl className="text-[13px]">
        <dt>기관</dt><dd>{s.provider}</dd>
        <dt>조회 조건</dt><dd>{Object.entries(s.query).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ')}</dd>
        <dt>활용 화면</dt><dd>{s.usedBy.length ? s.usedBy.join(' · ') : '화면 미연결'}</dd>
        <dt>이용허락</dt><dd>{s.license ?? '확인하지 못함'}</dd>
      </Dl>
    </section>
  );
}

export default function SourcesPage() {
  const items = sources.items;
  const bundles = bundleCounts();
  const regions = regionIndex.regions.length;
  const nameOf = (id: string) => ITEMS.find((i) => i.id === id)!.name;
  const missing = (screen: 'board' | 'map') => ITEMS.filter((i) => SCREEN_USAGE[i.id][screen].startsWith('필요')).map((i) => i.name);

  /* 수집 건수: 보관 자료는 파일·번들의 레코드 수, 실시간 API 는 로컬 캐시에 남은 응답의 레코드 수 */
  const { records: cache, responses } = cacheRecords();
  const held = (n: number, unit: string) => ({ text: `${fmt(n)} ${unit}`, sort: n });
  const cached = (...apis: string[]) => {
    const rec = apis.reduce((n, a) => n + (cache[a]?.length ?? 0), 0), resp = apis.reduce((n, a) => n + (responses[a] ?? 0), 0);
    return resp ? { text: `캐시 ${fmt(rec)}건 · 응답 ${fmt(resp)}`, sort: rec } : { na: '캐시 없음' };
  };

  /* 종합상황판: 화면 위젯 순서. 실데이터 = 월별 실적·원장 집계 5개(원장 2026-10 기준) + 원천 수, 나머지는 시안 고정값(SAMPLE) */
  const molitUsed = items.filter((s) => s.id.startsWith('molit-') && s.usedBy.includes('/'));
  const molitRows = molitUsed.reduce((n, s) => n + s.count, 0);
  const sample = (widget: string, need: string): Row => ({ id: widget, c: { widget, kind: { text: 'SAMPLE', muted: true }, data: '시안 고정값', method: null, cycle: null, count: { na: '없음' }, asOf: null, gap: `필요: ${need}` } });
  /* 원장 집계 위젯 5개는 같은 원장을 쓰므로 수집 건수는 첫 행에만 센다(합계에 겹쳐 세지 않게) */
  const judgedSido = ledger.regions.filter((r) => r.judged).map((r) => molit.sido.find((x) => x.code === r.code)?.name ?? r.code).join('·');
  const ledgerRow = (id: string, widget: string, gap: string, first = false): Row => ({ id, c: { widget, kind: '실데이터', data: `원장 ${ledger.observedMonth} 기준 표 · data/board/ledger-board.json`, method: 'tools/ledger → ledger-board.json', cycle: '수동 갱신', count: first ? held(ledger.scope.projects, '사업') : { na: '위 원장과 같음' }, asOf: ledger.observedMonth, gap } });
  const boardRows: Row[] = [
    { id: 'directives', c: { widget: '총리 지시 6건', kind: '실데이터', data: '통계누리 착공 누계 · 사업 원장 집계 · 원천 카탈로그', method: '통계누리 수집 + 원장 집계(tools/ledger/board.js) + sources.json', cycle: '수동 갱신', count: held(items.length, '데이터셋'), asOf: null, gap: `필요: ${nameOf('ledger')} · ${nameOf('agency-input')} · ${nameOf('schedule')}` } },
    ledgerRow('ribbon', '월별 공급 파동', `${nationOf(ledger)}(사업 ${ledger.scope.projects}건 · ${ledgerMix(ledger)}) · 지연 띠는 ${ledger.observedMonth} 관측부터 · ${nameOf('schedule')}(월별 이력) 없음`, true),
    ledgerRow('snap', '선택 시점 판정', `${ledgerJudged(ledger)} · 과거 판정 기록 없음`),
    ledgerRow('region', `시도 ${ledger.regions.length}곳`, `판정은 ${judgedSido}만 · ${nationOf(ledger)} 사업 중`),
    { id: 'actual', c: { widget: '월별 실적 흐름', kind: '실데이터', data: `${nameOf('molit')} 중 ${molitUsed.length}표(인허가·착공·준공·분양) · ${molit.months[0]}~${molit.months[molit.months.length - 1]}`, method: COLLECTION[molitUsed[0].id].method, cycle: COLLECTION[molitUsed[0].id].cycle, count: held(molitRows, '행'), asOf: molitUsed[0].sourceAsOf, gap: SCREEN_USAGE.molit.gap } },
    sample('지연·주의 추이', `${nameOf('schedule')}(월별 이력)`),
    ledgerRow('future', '향후 12개월 공급 예정', `준공만(착공·모집·입주 예정 없음) · LH 후보 예정일은 파일 기준일 ${lh.sourceAsOf} 값`),
    ledgerRow('agency', '기관별 진행', `기관 미상 ${ledger.agencies.find((a) => a.id === 'unknown')?.projects ?? 0}건 · ${nameOf('agency-input')} 없음`),
  ];

  /* 지도: 지도에서 쓰는 운영 자료 + 지역 번들·건물대장. 보관 → 실시간 → 미연결 순. 캐시 키 앞부분은 handlers/** 의 cache.wrap 키 */
  const mark = (s: string) => s.replace(/^[✓△] /, '');
  const hubBasis = items.find((s) => s.id === 'hub-hs-basis')!.count;
  const hubCache = cache.permits?.length ?? 0;   // 대지위치(plat)는 같은 허가의 면적이라 세지 않는다
  const lhLocal = lh.blocks.filter((b) => b.district.includes('계양')).length;
  const COUNT: Record<string, { count: Row['c'][string]; scope: string | null }> = {
    'hub-hs': { count: { text: `보관 ${fmt(hubBasis)}건 · 캐시 ${fmt(hubCache)}건`, sort: hubBasis + hubCache }, scope: '전국 조회' },
    ledger: { count: held(projects.length, '사업'), scope: `${new Set(projects.map((p) => p.sgg)).size}개 시군구` },
    schedule: { count: { na: '없음' }, scope: null },
    'hub-ap': { count: held(bundles.permits, '허가'), scope: '계양' },
    'agency-input': { count: { na: '없음' }, scope: null },
    'lh-completion': { count: held(lhLocal, '블록'), scope: `계양 (전국 ${fmt(lh.count)}블록 중)` },
    stan: { count: cached('stan', 'place'), scope: '전국' },
    newschool: { count: cached('eduinfo'), scope: '전국' },
    'school-zone': { count: held(bundles.zones, '구역'), scope: '계양' },
    notices: { count: cached('lh', 'myhome'), scope: '전국' },
    buildings: { count: cached('bld'), scope: '전국' },
    geom: { count: cached('parcel', 'vw'), scope: '전국' },
    stops: { count: cached('infra'), scope: '전국 · 서울 별도 API' },
    bus: { count: cached('bus'), scope: '지원 지역 노선' },
    tiles: { count: cached('terrain'), scope: '전국' },
  };
  const itemRows: Row[] = ITEMS.filter((i) => !SCREEN_USAGE[i.id].map.startsWith('—')).map((i) => {
    const op = OPERATIONS[i.id], usage = SCREEN_USAGE[i.id];
    const none = usage.map.startsWith('필요');
    const mode = i.id === 'hub-ap' || i.id === 'lh-completion' ? '보관' : i.now === 'none' ? '미연결' : MODE_LABEL[i.now];
    return { id: i.id, muted: none, c: { name: i.name, use: none ? null : usage.map.startsWith('△') ? `△ ${mark(usage.map)}` : mark(usage.map), mode, method: i.id === 'hub-ap' ? '건축HUB API → 계양 시설 번들' : op.method, cycle: i.id === 'hub-ap' ? '계양 수동 보완' : op.cycle, ...COUNT[i.id], gap: usage.gap } };
  });
  const bundleRows: Row[] = [
    { id: 'map-projects', c: { name: '지역 사업·단지 번들', use: '단지·공정·일정', mode: '보관', method: '공고·API·공사현황 가공 → JSON', cycle: '수동 보완·재배포', count: held(bundles.projects, '단지'), scope: `${regions}개 지역`, gap: '지역 제한 · 일부 층수·입주일 · 일정 변경 이력 없음' } },
    { id: 'map-buildings', c: { name: '지역 건물 보관본', use: '기존 건물', mode: '보관', method: 'V-World 파일·API 가공 → JSON', cycle: '수동 보완·재배포', count: held(bundles.buildings, '건물'), scope: `${regions}개 지역`, gap: '높이·층수 완전성 · 보관본 최신성' } },
    { id: 'map-context', c: { name: '역·기존 학교 위치', use: '주변 역·학교', mode: '보관', method: 'OpenStreetMap → context.json', cycle: '수동 보완·재배포', count: held(bundles.context, '위치'), scope: `${regions}개 지역`, gap: '공식 학교 배정·통학구역 대조' } },
    { id: 'map-infra', c: { name: '기반시설·교통 점검 번들', use: '△ 계양 시설 점검', mode: '보관', method: 'API·파일·보도 확인 → infra.json', cycle: '수동 보완·재배포', count: held(bundles.infra, '항목'), scope: `${bundles.infraRegions}개 지역`, gap: `${regions - bundles.infraRegions}개 지역 상세 시설 점검 없음` } },
    { id: 'building-register', c: { name: '건축물대장 · 총괄표제부', use: '위치·준공 보강', mode: '실시간', method: '건축HUB API', cycle: '조회 시 · 캐시 24시간', count: cached('ledger'), scope: '전국 조회', gap: '블록·합필 위치 매칭 실패 · 조회 권한·한도 누락' } },
  ];
  const rank = { 보관: 0, 혼합: 1, 실시간: 2, 미연결: 3 } as Record<string, number>;
  const mapRows = [...bundleRows, ...itemRows].sort((a, b) => rank[a.c.mode as string] - rank[b.c.mode as string]);

  const countBy = (rows: Row[], key: string, value: string) => rows.filter((r) => r.c[key] === value).length;
  const total = (rows: Row[]) => rows.reduce((n, r) => { const v = r.c.count; return n + (v && typeof v === 'object' && typeof v.sort === 'number' ? v.sort : 0); }, 0);
  const boardMissing = missing('board'), mapMissing = missing('map');
  const boardReal = countBy(boardRows, 'kind', '실데이터'), mapUsed = mapRows.length - countBy(mapRows, 'mode', '미연결');
  const screenRows: Row[] = [
    { id: 'board', c: { screen: { text: '종합상황판', href: '/' }, count: total(boardRows), total: boardRows.length, real: boardReal, sample: boardRows.length - boardReal, store: boardRows.filter((r) => r.c.method).length, live: 0, none: boardMissing.length, scope: '전국 · 시도 · 월', gap: boardMissing.join(' · ') } },
    { id: 'map', c: { screen: { text: '지도', href: '/map' }, count: total(mapRows), total: mapUsed, real: mapUsed, sample: 0, store: countBy(mapRows, 'mode', '보관'), live: countBy(mapRows, 'mode', '실시간'), none: mapMissing.length, scope: `번들 ${regions}개 지역 · 조회 전국`, gap: `${mapMissing.join(' · ')} · 시설 점검 ${bundles.infraRegions}개 지역 · 공고↔사업 연결` } },
  ];

  /* 행을 누르면 펼치는 실제 레코드 예시(앞 10건). 번들·레지스트리·보관 JSON 은 배포본에도 있고, 원본 CSV·캐시는 로컬에만 있다 */
  const nation = (k: 'permit' | 'start' | 'sale' | 'complete') => molit.metrics[k].series['00'].total;
  const molitRecs = molit.months.map((ym, i) => ({ 월: ym, 인허가: nation('permit')[i], 착공: nation('start')[i], 분양: nation('sale')[i], 준공: nation('complete')[i], 잠정: molit.provisional.includes(ym) ? 'Y' : '' })).reverse();
  const blockKeys = ['date', 'district', 'units', 'type', 'location', 'sido'];
  const fromCache = (apis: string[], keys?: string[]) => { const recs = apis.flatMap((a) => cache[a] ?? []); return detailOf(recs, `로컬 캐시 .cache · ${apis.join('·')}`, { keys }); };
  const PROCESSED: Record<string, string> = { 'molit-permit-monthly': '인허가_월별누계', 'molit-start-monthly': '착공_월계', 'molit-complete-monthly': '준공_월계', 'molit-sale-apt': '분양_공동주택', 'molit-permit-annual': '인허가_지역별_연간' };
  const DETAIL: Record<string, Detail | undefined> = {
    directives: detailOf(items.map((x) => ({ id: x.id, dataset: x.dataset, provider: x.provider, count: x.count, sourceAsOf: x.sourceAsOf, collectedAt: x.collectedAt?.slice(0, 10) })), 'data/board/sources.json'),
    actual: detailOf(molitRecs, 'data/board/molit.json · 전국'),
    ribbon: detailOf(ledger.months.map((ym, i) => ({ 월: ym, ...Object.fromEntries(K.map((k, j) => [`${CIR[j]} ${k}`, ledger.stageUnits[i][j]])) })), 'data/board/ledger-board.json · stageUnits'),
    snap: detailOf(ledger.overdue as unknown as Rec[], 'data/board/ledger-board.json · overdue'),
    region: detailOf(ledger.regions as unknown as Rec[], 'data/board/ledger-board.json · regions'),
    future: detailOf(ledger.upcoming as unknown as Rec[], 'data/board/ledger-board.json · upcoming'),
    agency: detailOf(ledger.agencies as unknown as Rec[], 'data/board/ledger-board.json · agencies'),
    'map-projects': detailOf(bundles.rec.projects, 'regions/*/projects.json', { keys: ['region', 'name', 'kind', 'status', 'units', 'dongCount', 'moveIn', 'builder'] }),
    'map-buildings': detailOf(bundles.rec.buildings, 'regions/*/buildings.json', { total: bundles.buildings }),
    'map-context': detailOf(bundles.rec.context, 'regions/*/context.json', { keys: ['region', 'kind', 'name', 'lon', 'lat'] }),
    'map-infra': detailOf(bundles.rec.infra, 'regions/*/infra.json', { total: bundles.infra }),
    'building-register': fromCache(['ledger']),
    ledger: detailOf(projects as unknown as Rec[], 'registry/projects.json', { keys: ['id', 'name', 'sgg', 'stageCode', 'units', 'asOf'] }),
    'hub-ap': detailOf(bundles.rec.permits, 'regions/*/infra.json · permits'),
    'lh-completion': detailOf(lh.blocks.filter((b) => b.district.includes('계양')) as unknown as Rec[], 'data/board/lh-completion.json · 계양', { keys: blockKeys }),
    'school-zone': detailOf(bundles.rec.zones, 'regions/*/infra.json · zones·attendance'),
    'hub-hs': fromCache(['permits'], ['pnu', 'jibun', 'name', 'units', 'status', 'approvedAt', 'startedAt', 'mainBldCnt']),
    stan: fromCache(['stan'], ['locatadd_nm', 'region_cd', 'locallow_nm', 'locat_order', 'adpt_de']),
    newschool: fromCache(['eduinfo'], ['schlNm', 'schlGradCd', 'eduOffcNm', 'sggNm', 'openSchdYm', 'classCnt', 'stdtCnt', 'realAddr']),
    notices: fromCache(['lh', 'myhome'], ['PAN_NM', 'AIS_TP_CD_NM', 'CNP_CD_NM', 'PAN_NT_ST_DT', 'CLSG_DT', 'PAN_SS', 'ALL_CNT']),
    buildings: fromCache(['bld']),
    geom: fromCache(['parcel', 'vw']),
    stops: fromCache(['infra'], ['id', 'name', 'no', 'lon', 'lat']),
    bus: fromCache(['bus']),
    tiles: fromCache(['terrain']),
    'hub-hs-basis': detailOf((projects as unknown as { id: string; name: string; sgg: string; refs: { system: string; value: string; asOf: string }[] }[]).flatMap((x) => x.refs.filter((r) => r.system === 'hub-hs-basis').map((r) => ({ id: x.id, name: x.name, sgg: x.sgg, mgmHsrgstPk: r.value, asOf: r.asOf }))), 'registry/projects.json · 연결된 기본개요 키'),
    ...Object.fromEntries(items.filter((x) => typeof x.query.file === 'string').map((x) => {
      const file = x.query.file as string;
      return [x.id, file.startsWith('regions/') ? detailOf((readJson(file)?.projects as Rec[]) ?? [], file, { keys: ['name', 'kind', 'status', 'units', 'dongCount', 'moveIn', 'builder'] })
        : PROCESSED[x.id] ? csvDetail(`data/processed/molit_${PROCESSED[x.id]}.csv`) : csvDetail(`data/raw/datagokr/${file}`)];
    })),
  };
  const withDetail = (rows: Row[]) => rows.map((r) => (DETAIL[r.id] ? { ...r, detail: DETAIL[r.id] } : r));

  const catalogRows: Row[] = items.map((s) => {
    const c = COLLECTION[s.id], usage = sourceUsage(s.id, s.usedBy), size = fileBytes(s);
    return { id: s.id, detail: DETAIL[s.id], c: {
      dataset: { text: c.name, href: `#${s.id}` }, board: usage.board, map: usage.map, method: c.method, cycle: c.cycle,
      count: { text: `${fmt(s.count)} ${c.unit}`, sort: s.count },
      size: size === null ? { na: '확인하지 못함' } : { text: bytesLabel(size), sort: size },
      asOf: s.sourceAsOf ?? { na: '확인하지 못함' },
      got: s.collectedAt ? { text: s.collectedAt.slice(0, 10), sort: s.collectedAt } : { na: '기록 없음' },
      gap: sourceGap(s),
    } };
  });
  /* 추가 확보 필요(조사 결과): 구분별 건수와 상세 */
  const acqCount = (rows: typeof ACQUIRE) => ({ total: rows.length, ...Object.fromEntries(STATUSES.map((st) => [st, rows.filter((a) => a.status === st).length || null])) });
  const acqApi = ACQUIRE.filter((a) => a.kind === 'API'), acqFile = ACQUIRE.filter((a) => a.kind === '파일');
  const acqSumRows: Row[] = [
    { id: 'api', c: { kind: 'API', ...acqCount(acqApi) } },
    { id: 'file', c: { kind: '파일(CSV·SHP 등)', ...acqCount(acqFile) } },
    { id: 'all', pin: 'bottom', c: { kind: '합계', ...acqCount(ACQUIRE) } },
  ];
  const acqRows: Row[] = ACQUIRE.map((a) => ({ id: a.id, c: {
    id: a.id, kind: a.kind, name: { text: a.name, href: a.url }, no: a.no, org: a.org, status: a.status,
    gap: a.gaps.map((g) => GAPS[g].name).join(' · '), screen: [...new Set(a.gaps.flatMap((g) => GAPS[g].screen.split('·')))].join('·'),
    cycle: a.cycle, checked: a.checked === '확인' ? a.checked : { text: a.checked, muted: true }, note: a.note,
  } }));

  /* 단계별 데이터 연계(탭): 원천에서 센 숫자로 단계 자료를 만든다 */
  const reg = projects as unknown as { sgg: string; stageCode: string; refs: { system: string }[] }[];
  const countOf = (list: string[]) => list.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
  const has = (api: string, k: string) => (cache[api] ?? []).filter((r) => r[k]).length;
  const count = (id: string) => items.find((x) => x.id === id)?.count ?? 0;
  const stages = stageLinks({
    regions, sgg: new Set(reg.map((p) => p.sgg)).size, registryTotal: reg.length, registryRefs: reg.filter((p) => p.refs.some((r) => r.system === 'hub-hs-basis')).length,
    registry: countOf(reg.map((p) => p.stageCode)), bundle: countOf(bundles.rec.projects.map((p) => String(p.status))),
    molit: { permit: count('molit-permit-monthly'), start: count('molit-start-monthly'), sale: count('molit-sale-apt'), complete: count('molit-complete-monthly'), annual: count('molit-permit-annual') },
    months: `${molit.months[0]}~${molit.months[molit.months.length - 1]}`,
    lhBlocks: lh.count, lhAsOf: lh.sourceAsOf,
    catalog: Object.fromEntries(items.map((x) => [x.id, x.count])),
    hubBasis, permits: cache.permits?.length ?? 0, permitsStarted: has('permits', 'startedAt'), permitsCompleted: has('permits', 'completedAt'),
    plat: cache.plat?.length ?? 0, ledger: cache.ledger?.length ?? 0, lhNotices: cache.lh?.length ?? 0, myhome: cache.myhome?.length ?? 0, myhomePnu: has('myhome', 'pnu'), stan: cache.stan?.length ?? 0,
  }, ACQUIRE);

  return (
    <Page>
      <Crumbs items={[{ label: '종합상황판', href: '/' }, { label: '데이터 원본' }]} />
      <PageTitle>데이터 원본</PageTitle>
      <section id="stage-links" aria-labelledby="h-stage" className="scroll-mt-20">
        <SectionTitle id="h-stage" className={H2}>단계별 데이터 연계</SectionTitle>
        <StageLinks stages={stages} extra={(
      <div id="etc">
        <p className="m-0 text-[12px] text-muted-foreground">✓ 사용 · △ 일부 지역·가공본 · 미연결 = 필요하나 연결 안 됨 · SAMPLE = 시안 고정값 · 보관 = 파일로 받아 둠 · 실시간 = 화면 조회 때 요청 · 수집 건수 = 보관 레코드 + 로컬 캐시(.cache) 응답 레코드</p>
        <section aria-labelledby="h-screen" className={GRID_DENSE}>
          <h3 id="h-screen" className={H3}>화면별 요약</h3>
          <DataGrid label="화면별 데이터 사용과 부족한 자료" cols={SCREEN_COLS} rows={screenRows} sortable={false} />
        </section>
        <section id="board-data" aria-labelledby="h-board" className={`scroll-mt-20 ${GRID_DENSE}`}>
          <h3 id="h-board" className={H3}>종합상황판 · 위젯별 데이터</h3>
          <DataGrid label="종합상황판 위젯별 데이터" cols={BOARD_COLS} rows={withDetail(boardRows)} sortable={false} />
        </section>
        <section id="map-data" aria-labelledby="h-map" className={`scroll-mt-20 ${GRID_DENSE}`}>
          <h3 id="h-map" className={H3}>지도 · 데이터별 사용</h3>
          <DataGrid label="지도 데이터별 사용과 수집 현황" cols={MAP_COLS} rows={withDetail(mapRows)} />
        </section>
        <section id="acquire" aria-labelledby="h-acquire" className={`scroll-mt-20 ${GRID_DENSE}`}>
          <h3 id="h-acquire" className={H3}>추가 확보 필요 · API {acqApi.length}건 · 파일 {acqFile.length}건 <small className="text-[12px] font-normal text-muted-foreground">조사 {ACQUIRE_ASOF}</small></h3>
          <DataGrid label="추가 확보 필요 건수" cols={ACQ_SUM_COLS} rows={acqSumRows} sortable={false} />
          <DataGrid label="추가 확보 필요 API·파일" cols={ACQ_COLS} rows={acqRows} />
        </section>
        <section id="catalog" aria-labelledby="h-catalog" className={`scroll-mt-20 ${GRID_DENSE}`}>
          <h3 id="h-catalog" className={H3}>보관 원천 · 기준일·데이터량</h3>
          <Fold title="보관 데이터셋 목록" meta={`${items.length}건 · 수집일 · 실측 용량 · 부족한 자료`}>
            <DataGrid label="원천 카탈로그 요약" cols={CATALOG_COLS} rows={catalogRows} />
            <Fold title="원천 조회 조건·이용허락" meta={`${items.length}건`}>
              {items.map((s) => <SourceDetail key={s.id} s={s} />)}
            </Fold>
          </Fold>
        </section>
      </div>
        )} />
      </section>
      <HashOpen />
    </Page>
  );
}
