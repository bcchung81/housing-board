/* 일반사용자 '사업 찾기'(/citizen/projects)의 쉬운 말 규칙(순수 함수 — 파일을 읽지 않고, 다른 .ts 를 가져오지 않는다. Node 시험이 그대로 부른다).
   /citizen 정적 페이지(tools/design/public-mock/template.html 안 JS)의 inLabel·inYear·prjMarks·nextStep·prjJudge·shortName·distinctNames 를 옮긴 것이다.
   템플릿은 원장 줄 p(배열)·D.det·D.jd 를 받고, 여기서는 같은 값을 이름 있는 인자로 받는다(steps = D.det[id][1], nx = {k: p[4], d: p[5]}).
   두 쪽이 같은 입력에 같은 결과인지는 tests/js/public-projects.test.cjs 가 템플릿 함수를 떼어 실제 원장 전체로 잠근다.
   다른 점(시험에서 예외로 적음): prjJudge 의 글자만 안 A(사실만, 2026-10-19 사용자 결정) — 정상은 빈칸, 주의·지연은 '준공 예정일이 19개월 지났어요'(템플릿 'n개월 늦어짐'). 종류(k)·개월(m)은 같다.
   제안서: scratchpad/public-menus/proposal.md 4·6·8.2절. */
import type { Cls } from './projects-view';

/* 고비 넷(템플릿 NEXT): 0 모집 공고 · 1 착공 · 2 준공 · 3 입주 — 원장 next.eventType·상세 stages 열쇠와 같은 차례 */
export const NEXT = ['모집 공고', '착공', '준공', '입주'] as const;
export const NEXT_EVENT = ['SUPPLY_NOTICE', 'CONSTRUCTION_START', 'COMPLETION', 'MOVE_IN'] as const;
/* 고비 하나: [날짜, 1 실제 · 0 예정] 또는 null. steps = 네 고비(템플릿 D.det[id][1]) */
export type Step = [string, 0 | 1] | null;
export type Steps = Step[];
/* 원장 다음 고비: k = NEXT 번호(없으면 -1), d = 예정일('' = 없음) — 템플릿 p[4]·p[5] */
export type Nx = { k: number; d: string };

/* 상세 stages → 네 고비(tools/design/public-mock/build_data.py det 와 같은 규칙: 실제가 있으면 실제, 없으면 예정) */
export function stepsOf(stages: Partial<Record<string, { plan?: string; actual?: string }>> | null | undefined): Steps {
  return NEXT_EVENT.map((k): Step => { const s = stages?.[k]; return s?.actual ? [s.actual, 1] : s?.plan ? [s.plan, 0] : null; });
}
/* 원장 next → Nx(build_data.py prj 줄의 4·5번째 칸) */
export const nxOf = (next: { eventType: string; planned: string } | null | undefined): Nx =>
  ({ k: next ? (NEXT_EVENT as readonly string[]).indexOf(next.eventType) : -1, d: next?.planned || '' });
/* 시행 기관 짧은 이름(build_data.py AG) */
export const AGENCY_SHORT: Record<string, string> = { lh: 'LH', gh: 'GH', sh: 'SH', local: '지자체', mnd: '국방부' };
export const AGENCY_FULL: Record<string, string> = { LH: '한국토지주택공사', SH: '서울주택도시공사', GH: '경기주택도시공사' };
/* 사업 유형 짧은 이름(build_data.py PG_SHORT — /citizen 사업 카드 유형 칩과 같은 표, 원래 이름은 title) */
export const PG_SHORT: Record<string, string> = {
  '공공주택 건설': '공공주택 건설', '도심 공공주택 복합사업': '도심 복합사업', '노후청사·공공부지': '노후청사·공공부지', '공공택지·공공분양': '공공택지 분양', '3기 신도시': '3기 신도시', '건설형 공공임대': '공공임대 건설',
  '노후 공공임대 재건축': '노후 임대 재건축', '공공시설·유휴부지 개발': '공공시설·유휴부지 개발', '군 유휴부지': '군 유휴부지', '도심 내 유휴부지 활용 공급': '도심 유휴부지 활용', '철도부지 복합개발': '철도부지 복합개발',
  '공공시설 이전': '공공시설 이전', '서울 남부권 공공택지 공급 조기화': '남부권 공공택지 공급', '신규 공공주택지구': '신규 주택지구', '우수입지 공공택지 분양': '우수입지 택지 분양', '유휴부지·노후청사 복합개발': '유휴·청사 복합개발',
  '공공택지 공급 조기화': '공공택지 공급',
};

/* ---------- 이름(템플릿 shortName·noticeName·blockOf·distinctNames) ---------- */
const PLACEHOLDER = /(?:O{2,}|0{2,}|○{2,}|ㅇ{2,})/;
export function shortName(n: string | null | undefined): string {
  n = (n || '').trim();
  if (!n) return '이름 미정';
  if (PLACEHOLDER.test(n)) {
    const head = n.split(PLACEHOLDER)[0];
    const w = head.match(/([가-힣0-9]+(?:동|리|읍|면|지구|구역))(?=[\s0-9A-Za-z-]*$)/) || head.match(/([가-힣]+(?:동|리|읍|면|지구|구역))/g)?.slice(-1).map((x) => [x, x]);
    return w ? `이름 미정 · ${w[1]}` : '이름 미정';
  }
  const s = n.replace(/\s*\(?\b[A-Z]{0,3}-?0*(\d+)BL\)?/g, '($1블록)').replace(/\s+[A-Z]{1,3}-?0*(\d+)$/, '($1블록)').replace(/^조달청\)\s*/, '').replace(/\s*(아파트\s*)?건설공사.*$/, '').replace(/\s*신축공사$/, '').replace(/\s*\d+공구.*$/, '').replace(/\s*\($/, '').replace(/\s*군부지/, ' 군부대 터').replace(/\s*주복\s*0*(\d+)/, ' (주상복합 $1)').replace(/\s+/g, ' ').trim().replace(/\s+[A-Z]{1,3}-?0*(\d+)$/, '($1블록)');
  return s || n;
}
export function noticeName(n: string | null | undefined): string {
  return (n || '').trim().replace(/^조달청\)\s*/, '').replace(/(\b[A-Z]{0,3}-?\d+)BL\b/g, '$1').replace(/\s*(아파트|공동주택)?\s*(건설|신축)공사.*$/, '').replace(/\s*\d+공구.*$/, '').replace(/\s+/g, ' ').trim() || (n || '').trim();
}
export const blockOf = (n: string) => (n.match(/\b[A-Z]{1,3}-?\d+(?:-\d+)?\b(?![\s\S]*\b[A-Z]{1,3}-?\d)/) || [''])[0];
/* 일반사용자 단계 이름(리본 칸 b 0~5): 준비 중 = ①②, 짓는 중 = ③, 모집 끝남 = ④(템플릿 STATUS·distinctNames 표) */
export const STAGE_NAME = ['준비 중', '준비 중', '짓는 중', '모집 끝남', '준공', '입주'] as const;
/* 같은 목록 안 이름 겹침: 보이는 이름이 같으면 공고 이름의 블록 표기를 덧붙이고, 그래도 같으면 sub(열거되지 않는 속성)에 지역 → 호수 → 단계.
   sggName = 시군구 코드 → 시도를 뗀 이름(템플릿 D.sgg 이름의 첫 낱말 뒤) */
export type NameIn = { id: string; name: string; sgg?: string; u?: number; b?: number };
export function distinctNames(items: NameIn[], sggName: (code: string) => string): Record<string, string> & { sub?: Record<string, string> } {
  const ids = new Map<string, NameIn>(); for (const x of items) if (!ids.has(x.id)) ids.set(x.id, x);
  const c: Record<string, number> = {}; for (const x of ids.values()) { const s = shortName(x.name); c[s] = (c[s] || 0) + 1; }
  const out: Record<string, string> = {}; for (const [id, x] of ids) { const s = shortName(x.name), b = c[s] > 1 ? blockOf(noticeName(x.name || '')) : ''; out[id] = b ? `${s} ${b}` : s; }
  const g: Record<string, string[]> = {}; for (const id of ids.keys()) (g[out[id]] = g[out[id]] || []).push(id);
  const sub: Record<string, string> = {};
  for (const L of Object.values(g)) {
    if (L.length < 2 || /^이름 미정/.test(out[L[0]])) continue;
    const by = (f: (x: NameIn) => string) => { const v = L.map((id) => f(ids.get(id)!)); return new Set(v).size === v.length ? v : null; };
    const v = by((x) => (x.sgg ? sggName(x.sgg) : '')) || by((x) => (x.u ? `${x.u.toLocaleString('ko-KR')}호` : '')) || by((x) => (x.b == null ? '' : ['준비 중', '준비 중', '짓는 중', '모집 끝남', '준공'][x.b] ?? ''));
    if (v) L.forEach((id, i) => { if (v[i]) sub[id] = v[i]; });
  }
  Object.defineProperty(out, 'sub', { value: sub, enumerable: false });
  return out;
}

/* ---------- 날짜·들어올 때(템플릿 fullDate·inDate·inYear·inLabel·dayKey·inCmp) ---------- */
export const fullDate = (w: string | null | undefined) => (!w ? '미정' : w.length >= 10 ? `${w.slice(0, 4)}년 ${+w.slice(5, 7)}월 ${+w.slice(8, 10)}일` : w.length === 7 ? `${w.slice(0, 4)}년 ${+w.slice(5, 7)}월` : `${w.slice(0, 4)}년`);
/* 들어올 날: 입주 → 준공 → 원장 다음 고비가 준공·입주일 때 그 날, 없으면 '' */
export const inDate = (s: Steps, nx: Nx): string => (s[3] && s[3][0]) || (s[2] && s[2][0]) || ((nx.k === 2 || nx.k === 3) && nx.d) || '';
export const inYear = (s: Steps, nx: Nx) => inDate(s, nx).slice(0, 4);
export function inLabel(s: Steps, nx: Nx): string {
  if (s[3] && s[3][0]) return '입주 ' + fullDate(s[3][0]);
  if (s[2] && s[2][0]) return '준공 ' + fullDate(s[2][0]);
  if ((nx.k === 2 || nx.k === 3) && nx.d) return (nx.k === 3 ? '입주 ' : '준공 ') + fullDate(nx.d);
  return '연도 미정';
}
export const dayKey = (w: string) => (!w ? '9' : w.length >= 10 ? w.slice(0, 10) : w.length === 7 ? w + '-32' : w + '-13-32');
/* 목록 순서: 들어올 날 가까운 순 → 원장 다음 고비 날짜 → 호수 큰 순. x = { d: 들어올 날, when: 원장 다음 고비 날짜, u: 호수 } */
export const inCmp = (a: { d: string; when: string; u: number }, b: { d: string; when: string; u: number }) => dayKey(a.d).localeCompare(dayKey(b.d)) || dayKey(a.when).localeCompare(dayKey(b.when)) || b.u - a.u;

/* ---------- 다음 일정(템플릿 prjMarks·nextStep) ---------- */
/* 같은 고비가 둘이면 상세 실제 > 상세 예정 > 원장 다음 고비. 예정인데 그 기간 끝이 오늘 전이면 빼고 다음 후보, 실제는 날짜와 상관없이 둔다 */
export type Mark = { k: number; d: string; real: boolean };
export const periodEnd = (w: string) => (w.length >= 10 ? w.slice(0, 10) : w.length === 7 ? w + '-31' : w + '-12-31');
export function prjMarks(s: Steps, nx: Nx, today: string): Mark[] {
  const out: Mark[] = [];
  for (let k = 0; k < 4; k++) {
    const st = s[k];
    const cand = [st && st[1] ? { k, d: st[0], real: true } : null, st && !st[1] ? { k, d: st[0], real: false } : null, nx.k === k && nx.d ? { k, d: nx.d, real: false } : null];
    const m = cand.find((x) => x && x.d && (x.real || periodEnd(x.d) >= today));
    if (m) out.push(m);
  }
  return out;
}
/* 고비 순으로 첫 예정, 예정이 없으면 마지막 실제, 둘 다 없으면 null */
export const nextStep = (marks: Mark[]) => marks.find((m) => !m.real) || marks.filter((m) => m.real).pop() || null;
export const stepText = (m: Mark | null) => (m ? `${NEXT[m.k]} ${fullDate(m.d)} ${m.real ? '완료' : '예정'}` : '미정');

/* ---------- 예정 대비(안 A — 사실만) ---------- */
/* 판정(정책 화면 statusOf 와 같은 원장 값): 번호 있는 사업의 정상·주의·지연만. k·m 은 템플릿과 같고 글자만 안 A.
   정상 → 빈칸, 주의·지연 → '{고비} 예정일이 n개월 지났어요', 판정 없음·번호 없는 후보 → '일정 미정' */
const JD: Record<string, number> = { ok: 0, caution: 1, delay: 2 };
export type Judge = { k: 'none' | 'ok' | 'caution' | 'delay'; t: string; m?: number };
const EV_NAME: Record<string, string> = { SUPPLY_NOTICE: '모집 공고', CONSTRUCTION_START: '착공', COMPLETION: '준공', MOVE_IN: '입주', PERMIT: '허가' };
export function prjJudge(r: { issued: boolean; cls: Cls | null; overdue: { eventType: string; months: number } | null }): Judge {
  if (!r.issued || !r.cls || !(r.cls in JD)) return { k: 'none', t: '일정 미정' };
  const m = r.overdue?.months || 0;
  if (JD[r.cls] === 0) return { k: 'ok', t: '' };
  const ev = r.overdue ? EV_NAME[r.overdue.eventType] : '';
  return { k: JD[r.cls] === 1 ? 'caution' : 'delay', t: `${ev ? ev + ' ' : ''}예정일이 ${m ? `${m}개월 ` : ''}지났어요`, m };
}
/* 1개월이 안 되게 예정일이 지난 사업(projects-view pastDueOf): 판정은 정상 그대로, 글자만 */
export const PAST_DUE_PUBLIC = '예정일 지남 · 기록 확인 중';
export const PAST_DUE_TIP = '사업 시행자가 알린 예정일이 지났는데 마쳤다는 기록이 아직 없어요. 일정이 바뀌었거나 기록이 늦게 올라올 수 있어요';
/* 목록 '예정 대비' 칸: 판정 글자, 정상인데 예정일이 막 지났으면 PAST_DUE_PUBLIC */
export const factOf = (j: Judge, pastDue: boolean) => (j.k === 'ok' && pastDue ? PAST_DUE_PUBLIC : j.t);
/* 상세 머리 한 줄(안 A): '준공 예정일(2025년 2월 18일)이 19개월 지났어요' */
export function factLine(j: Judge, overdue: { eventType: string; planned: string } | null): string | null {
  if ((j.k !== 'caution' && j.k !== 'delay') || !overdue) return null;
  return `${EV_NAME[overdue.eventType] ?? ''} 예정일(${fullDate(overdue.planned)})이 ${j.m ? `${j.m}개월 ` : ''}지났어요`.trim();
}

/* ---------- 상세 사다리(D5: /citizen 과 같은 '착공·준공', 원 숫자 없음) ---------- */
export const LADDER = ['계획', '허가', '착공', '모집 공고', '준공', '입주'] as const;
export const LADDER_Q = [
  '어디에 몇 호를 지을지 정했어요',
  '지을 수 있게 허가를 받는 단계예요',
  '공사를 시작했고 짓고 있어요',
  '들어올 사람을 모집하는 공고가 나갔어요',
  '공사를 마치고 사용 승인을 받았어요',
  '사람들이 들어가 살기 시작해요',
] as const;
/* 단계 거르기(/citizen 상단 필터와 같은 묶음): 준비 중 = 칸 0·1 · 짓는 중 = 2 · 모집 끝남 = 3 */
export const STAGE_GROUPS = { prep: [0, 1], build: [2], sale: [3] } as const;
export type StageGroup = keyof typeof STAGE_GROUPS;
export const STAGE_GROUP_NAME: Record<StageGroup, string> = { prep: '준비 중', build: '짓는 중', sale: '모집 끝남' };
export const groupOfBoard = (b: number): StageGroup | null => (b <= 1 ? 'prep' : b === 2 ? 'build' : b === 3 ? 'sale' : null);

/* ---------- 숫자 ---------- */
/* 큰 합계 '22만 7,976호'(템플릿 bigNum + 단위) · 비교 숫자 '1,285호' */
export const bigNum = (u: number) => (u >= 1e4 ? `${Math.floor(u / 1e4)}만${u % 1e4 ? ` ${(u % 1e4).toLocaleString('ko-KR')}` : ''}` : u.toLocaleString('ko-KR'));
export const hoBig = (u: number) => { const n = bigNum(u); return /만$/.test(n) ? `${n} 호` : `${n}호`; };
export const ho = (u: number) => `${u.toLocaleString('ko-KR')}호`;
/* 출처 이름(상세 근거의 provider → 쉬운 이름). 내부 자료 이름(원장·덤프·번들)은 보이지 않고, 모르는 것은 null(뺀다) */
export function sourceName(provider: string): string | null {
  if (/청약홈/.test(provider)) return '청약홈(한국부동산원)';
  if (/한국부동산원/.test(provider)) return '한국부동산원';
  if (/한국토지주택공사/.test(provider)) return 'LH(한국토지주택공사)';
  if (/HOME/.test(provider)) return '국토교통부·LH·SH·GH 공공 자료';
  return null;
}
/* 날짜 '2026년 10월 13일 기준' */
export const refText = (d: string) => `${fullDate(d)} 기준`;

/* ---------- 목록 ---------- */
/* 수도권(서울·인천·경기)만 — 수도권 밖은 번호 없는 후보뿐이라 보이지 않는다(2026-10-19 사용자 결정) */
export const METRO = ['11', '28', '41'];
/* 공급 예정(리본 칸 ①~④ — /citizen projectsOf·sumOf 와 같은 범위)만 목록에 든다 */
export const inSupply = (b: number) => b <= 3;

export type PublicIn = {
  id: string; name: string; sgg: string; area: string; units: number; board: number; issued: boolean; cls: Cls | null;
  overdue: { eventType: string; planned: string; months: number } | null; next: { eventType: string; planned: string } | null;
  pastDue: boolean; steps: Steps; agency: string; progress: number | null;
};
export type PublicItem = {
  id: string; name: string; sub: string; full: string; sgg: string; area: string; units: number; board: number;
  stage: string; pct: number | null; nextText: string; inText: string; inDay: string; year: string; fact: string; judge: Judge['k']; agency: string;
  when: string;   // 원장 다음 고비 날짜(순서의 둘째 열쇠)
};
/* 목록 줄: 이름(distinctNames) · 지금(단계 + 공사 n%) · 다음 일정 · 들어올 때 · 예정 대비 · 시행. 순서 = inCmp(들어올 날 가까운 순) */
export function publicItems(xs: PublicIn[], today: string, sggName: (code: string) => string): PublicItem[] {
  const nm = distinctNames(xs.map((x) => ({ id: x.id, name: x.name, sgg: x.sgg, u: x.units, b: x.board })), sggName);
  return xs.map((x) => {
    const nx = nxOf(x.next), j = prjJudge(x), day = inDate(x.steps, nx);
    return {
      id: x.id, name: nm[x.id], sub: nm.sub?.[x.id] ?? '', full: x.name, sgg: x.sgg, area: x.area, units: x.units, board: x.board,
      stage: STAGE_NAME[x.board] ?? '', pct: x.progress, nextText: stepText(nextStep(prjMarks(x.steps, nx, today))), inText: inLabel(x.steps, nx), inDay: day, year: day.slice(0, 4),
      fact: factOf(j, x.pastDue), judge: j.k, agency: x.agency, when: nx.d,
    };
  }).sort((a, b) => inCmp({ d: a.inDay, when: a.when, u: a.units }, { d: b.inDay, when: b.when, u: b.units }));
}
/* 들어올 해 묶음: 지난 해는 올해에 넣고(/citizen yearBucket 칸 0 과 같음) 앞으로의 해는 해마다, 연도 미정은 맨 뒤 */
export type YearGroup = { year: string; label: string; items: PublicItem[]; units: number };
export function byYear(items: PublicItem[], today: string): YearGroup[] {
  const y0 = today.slice(0, 4), m = new Map<string, PublicItem[]>();
  for (const x of items) { const y = !x.year ? '' : x.year < y0 ? y0 : x.year; (m.get(y) || m.set(y, []).get(y)!).push(x); }
  return [...m.entries()].sort((a, b) => (a[0] || '9999').localeCompare(b[0] || '9999'))
    .map(([year, L]) => ({ year, label: year ? `${year}년 들어와요` : '연도 미정', items: L, units: L.reduce((s, x) => s + x.units, 0) }));
}
/* 이름 검색: 띄어쓰기·대소문자 무시, 초성만 쓰면 초성으로(예 'ㄱㅇ' → 계양) */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const choOf = (s: string) => [...s].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch; }).join('');
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
export function nameMatch(q: string, names: string[]): boolean {
  const k = norm(q);
  if (!k) return true;
  const onlyCho = [...k].every((ch) => CHO.includes(ch));
  return names.some((n) => { const t = norm(n); return t.includes(k) || (onlyCho && choOf(t).includes(k)); });
}

/* ---------- 주소 ---------- */
/* /citizen/projects?sido=NN|sgg=NNNNN&stage=prep|build|sale&q=이름&id=사업. 시군구가 있으면 시도는 적지 않는다(시군구 앞 두 자리) */
export type FindQuery = { sido?: string; sgg?: string; stage?: StageGroup; q?: string; id?: string };
export const FIND_BASE = '/citizen/projects';
export function findHref(v: FindQuery): string {
  const p = new URLSearchParams();
  if (v.sgg) p.set('sgg', v.sgg); else if (v.sido) p.set('sido', v.sido);
  if (v.stage) p.set('stage', v.stage);
  if (v.q) p.set('q', v.q);
  if (v.id) p.set('id', v.id);
  const s = p.toString();
  return s ? `${FIND_BASE}?${s}` : FIND_BASE;
}
