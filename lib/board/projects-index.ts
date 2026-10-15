/* 사업 화면 자료를 읽는 곳(서버 컴포넌트 전용). 지금은 저장소에 커밋된 JSON 이고, Supabase 로 옮길 때는 이 파일의 함수만
   api.map(사업 행)·api.screens(키 'projects-index'·'project-detail'·'policy-progress')를 읽게 바꾸면 된다 — 화면은 이 함수들만 부른다.
   - getProjectsIndex: 사업 목록(지도 색인 ledger-map.json 의 행 + projects-index.json 의 공고 확인·프로그램·정책 연결·기관·확인 단계·준공 예정 + 시군구 이름). /projects.
   - getProjectDrawer: 상세 서랍(/projects?id=) 하나 — 발급 사업의 일정·공정률·근거(project-detail.json, tools/ledger/projects-index.js). 대체된 옛 id 는 대표 사업으로, 숨김 사업은 안내만.
   - getPolicyProgress: 9·7 정책 단계별 목표·확인(policy-progress.json, tools/ledger/policy-progress.js). /projects.
   서랍은 ?id= 인 사업 것만 꺼낸다(상세 자료 전체를 화면에 넘기지 않는다). 요청마다 한 번만 만든다(cache). */
import { cache } from 'react';
import mapJson from '../../data/board/ledger-map.json';
import indexJson from '../../data/board/projects-index.json';
import detailJson from '../../data/board/project-detail.json';
import progressJson from '../../data/board/policy-progress.json';
import { DETAILS } from '../shell/menu';
import { getBoardData } from './data';
import { drawerTarget, rowsOf, type IndexExtra, type MapRow, type Policy, type PolicyProgress, type ProjectDetail, type ProjectRow, type Program } from './projects-view';
import type { RegistryProject } from './types';

type IndexDoc = { observedMonth: string; referenceDate: string; policies: Policy[]; programs: Program[]; sgg: Record<string, string | null>; projects: Record<string, IndexExtra> };
type MapDoc = { observedMonth: string; referenceDate: string; bySgg: Record<string, MapRow[]> };
export type SourceRef = { provider: string; dataset: string; asOf: string | null; collectedAt: string | null; url: string | null };
type DetailDoc = { observedMonth: string; referenceDate: string; agencies: Record<string, string>; sources: Record<string, SourceRef>; projects: Record<string, ProjectDetail> };

export const getProjectsIndex = cache(async () => {
  const map = mapJson as unknown as MapDoc, idx = indexJson as unknown as IndexDoc;
  return { rows: rowsOf(map.bySgg, idx.projects, idx.sgg), policies: idx.policies, programs: idx.programs, sggNames: idx.sgg, referenceDate: map.referenceDate, observedMonth: map.observedMonth };
});

export const getPolicyProgress = cache(async () => progressJson as unknown as PolicyProgress);

/* 서랍 자료: detail = 발급 사업(목록 행 + 상세), hidden = 목록에서 뺀 사업(안내 한 줄). 대체된 id 는 대표 사업의 detail 에 from(옛 id·이름)을 붙인다.
   레지스트리에 없거나 발급 전 후보(임시 번호)면 null — 서랍을 열지 않는다 */
export type Drawer =
  | { kind: 'detail'; row: ProjectRow; detail: ProjectDetail; sources: Record<string, SourceRef>; agencies: Record<string, string>; referenceDate: string; policies: Policy[]; from: { id: string; name: string } | null; label: string | null }
  | { kind: 'hidden'; project: RegistryProject; sggName: string };
export const getProjectDrawer = cache(async (asked: string): Promise<Drawer | null> => {
  const { allProjects } = await getBoardData();
  const idx = indexJson as unknown as IndexDoc, det = detailJson as unknown as DetailDoc;
  const t = drawerTarget(asked, allProjects, (id) => id in det.projects, DETAILS.project.id);
  if (!t) return null;
  if (t.kind === 'hidden') return { kind: 'hidden', project: t.project, sggName: idx.sgg[t.project.sgg] ?? t.project.sgg };
  const id = t.id, detail = det.projects[id];
  /* 사업 id 의 시군구 칸(PRJ-{시군구5}-{일련4})으로 먼저 찾고, 없으면 전부 본다 */
  const map = mapJson as unknown as MapDoc;
  let sgg = id.slice(4, 9), r = map.bySgg[sgg]?.find((x) => x.id === id);
  if (!r) for (const [k, rows] of Object.entries(map.bySgg)) { r = rows.find((x) => x.id === id); if (r) { sgg = k; break; } }
  if (!r) return null;
  return { kind: 'detail', row: rowsOf({ [sgg]: [r] }, idx.projects, idx.sgg)[0], detail, sources: det.sources, agencies: det.agencies, referenceDate: det.referenceDate, policies: idx.policies, from: t.from, label: await mapLabelOf(sgg, id) };
});

/* 지도 이름표(짧은 이름, 예: '고양창릉 A4'): 수도권 지도 자료(data/board/home-map/<시군구>.json 의 label — tools/ledger/home-map.js 가 블록 키 '지구 블록'으로 만든다).
   서랍 제목을 지도와 같은 이름으로 하려고 읽는다(긴 원장 이름은 부제). 수도권 밖·자료 없음이면 null */
async function mapLabelOf(sgg: string, id: string): Promise<string | null> {
  if (!/^(11|28|41)\d{3}$/.test(sgg)) return null;
  try {
    const doc = (await import(`../../data/board/home-map/${sgg}.json`)).default as { projects: { id: string; label?: string }[] };
    return doc.projects.find((p) => p.id === id)?.label ?? null;
  } catch { return null; }
}
