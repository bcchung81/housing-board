/* 사업 화면 자료를 읽는 곳(서버 컴포넌트 전용). 지금은 저장소에 커밋된 JSON 이고, Supabase 로 옮길 때는 이 파일의 세 함수만
   api.map(사업 행)·api.screens(키 'projects-index'·'project-detail'·'policy-progress')를 읽게 바꾸면 된다 — 화면은 이 함수들만 부른다.
   - getProjectsIndex: 사업 목록(지도 색인 ledger-map.json 의 행 + projects-index.json 의 공고 확인·프로그램·정책 연결 + 시군구 이름). /projects·/reports.
   - getProjectDetail: 발급 사업 하나의 일정·공정률·근거(project-detail.json — events 표를 사업별로 미리 묶은 것, tools/ledger/projects-index.js). /project/[id].
   - getPolicyProgress: 9·7 정책 단계별 목표·확인(policy-progress.json, tools/ledger/policy-progress.js). /projects·/reports.
   목록 화면은 사업 상세 자료를, 사업 상세는 목록 전체를 읽지 않는다(화면마다 필요한 파일만 서버 번들에 실린다). 요청마다 한 번만 만든다(cache). */
import { cache } from 'react';
import mapJson from '../../data/board/ledger-map.json';
import indexJson from '../../data/board/projects-index.json';
import detailJson from '../../data/board/project-detail.json';
import progressJson from '../../data/board/policy-progress.json';
import { rowsOf, type IndexExtra, type MapRow, type Policy, type PolicyProgress, type ProjectDetail, type Program } from './projects-view';

type IndexDoc = { observedMonth: string; referenceDate: string; policies: Policy[]; programs: Program[]; sgg: Record<string, string | null>; projects: Record<string, IndexExtra> };
type MapDoc = { observedMonth: string; referenceDate: string; bySgg: Record<string, MapRow[]> };
type DetailDoc = { observedMonth: string; referenceDate: string; agencies: Record<string, string>; sources: Record<string, { provider: string; dataset: string; asOf: string | null; collectedAt: string | null; url: string | null }>; projects: Record<string, ProjectDetail> };

export const getProjectsIndex = cache(async () => {
  const map = mapJson as unknown as MapDoc, idx = indexJson as unknown as IndexDoc;
  return { rows: rowsOf(map.bySgg, idx.projects, idx.sgg), policies: idx.policies, programs: idx.programs, sggNames: idx.sgg, referenceDate: map.referenceDate, observedMonth: map.observedMonth };
});

export const getProjectDetail = cache(async (id: string) => {
  const d = detailJson as unknown as DetailDoc;
  const p = d.projects[id];
  return p ? { detail: p, sources: d.sources, agencies: d.agencies, referenceDate: d.referenceDate, observedMonth: d.observedMonth } : null;
});

/* 사업 상세의 머리·표에 쓰는 목록 쪽 값(판정·다음 일정·공고 확인·연결): 사업 하나만 꺼낸다 — 상세는 목록 행 전부를 만들지 않는다 */
export const getProjectRow = cache(async (id: string) => {
  const map = mapJson as unknown as MapDoc, idx = indexJson as unknown as IndexDoc;
  /* 사업 id 의 시군구 칸(PRJ-{시군구5}-{일련4})으로 먼저 찾고, 없으면 전부 본다 */
  let sgg = id.slice(4, 9), r = map.bySgg[sgg]?.find((x) => x.id === id);
  if (!r) for (const [k, rows] of Object.entries(map.bySgg)) { r = rows.find((x) => x.id === id); if (r) { sgg = k; break; } }
  if (!r) return null;
  return { row: rowsOf({ [sgg]: [r] }, idx.projects, idx.sgg)[0], policies: idx.policies };
});

export const getPolicyProgress = cache(async () => progressJson as unknown as PolicyProgress);

/* 시군구 이름(목록 행이 없는 사업 — 숨김 사업 상세의 개요): projects-index.json 의 시군구 이름표만 읽는다 */
export const getSggName = cache(async (code: string) => (indexJson as unknown as IndexDoc).sgg[code] ?? null);
