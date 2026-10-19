/* 상황판 화면의 계산(순수 함수). JSON 을 직접 읽지 않고 인자로 받아 Node 시험이 그대로 부른다(tests/js/board.test.cjs). */
import type { Actor, LhBlock, LhData, Metric, Molit, Series } from './types';

export const NATION = '00';
export const METRICS: Metric[] = ['permit', 'start', 'sale', 'complete'];   // 6단계 순서(03 인허가 → 04 착공 → 05 분양 → 06 준공, lib/board/stages.ts METRIC_STAGE)
export const ACTORS: Actor[] = ['지자체', 'LH', '주택업체', '민간'];
export const ACTOR_NOTE = '공공(지자체·LH·주택업체)과 민간으로 나눈 시행주체별 호수입니다. 네 분류의 합이 총계입니다.';

/* 화면 범위 = 수도권(2026-10-19 사용자 결정: 원장·화면은 서울·인천·경기 HOME 만). 원본 molit.json·lh-completion.json·Supabase 값은 전국 그대로 두고 화면에 넘길 때 줄인다 */
export const CAPITAL = ['11', '28', '41'];
export const CAPITAL_NAME = '수도권';
/* 통계누리: 합계 자리(NATION '00')를 세 시도 합으로 바꾸고 시도 목록을 [수도권, 서울, 인천, 경기]로. 세 시도 중 빈 달(null)이 있으면 그 달 합도 null */
export function capitalMolit(m: Molit): Molit {
  const add = (xs: (number | null)[][]) => xs[0].map((_, i) => (xs.some((x) => x[i] === null || x[i] === undefined) ? null : xs.reduce((n, x) => n + (x[i] as number), 0)));
  const sum = (ss: Series[]): Series => ({ total: add(ss.map((x) => x.total)), ...(ss[0].actors ? { actors: Object.fromEntries((Object.keys(ss[0].actors) as Actor[]).map((a) => [a, add(ss.map((x) => x.actors?.[a] ?? x.total.map(() => null)))])) as Record<Actor, (number | null)[]> } : {}) });
  const metrics = Object.fromEntries(Object.entries(m.metrics).map(([k, v]) => [k, { ...v, series: { [NATION]: sum(CAPITAL.map((c) => v.series[c])), ...Object.fromEntries(CAPITAL.map((c) => [c, v.series[c]])) } }])) as unknown as Molit['metrics'];
  return { ...m, sido: [{ code: NATION, name: CAPITAL_NAME }, ...m.sido.filter((x) => CAPITAL.includes(x.code))], metrics };
}
/* LH 준공예정: 수도권 블록만(건수 = 행 수, 호수 = 합) */
export function capitalLh(lh: LhData): LhData {
  const blocks = lh.blocks.filter((b) => CAPITAL.includes(b.sido));
  return { ...lh, blocks, count: blocks.length, units: blocks.reduce((n, b) => n + b.units, 0) };
}

export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('en-US'));
export const ymDot = (ym: string) => ym.replace('-', '.');
export const monthLabel = (ym: string) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;

export const lastMonth = (m: Molit) => m.months[m.months.length - 1];
export const monthIndex = (m: Molit, ym: string) => m.months.indexOf(ym);
export const isProvisional = (m: Molit, ym: string) => m.provisional.includes(ym);
export const sidoName = (m: Molit, code: string) => m.sido.find((s) => s.code === code)?.name;
export const seriesOf = (m: Molit, metric: Metric, code: string): Series => m.metrics[metric].series[code];

export function valueAt(m: Molit, metric: Metric, code: string, ym: string): number | null {
  const i = monthIndex(m, ym);
  return i < 0 ? null : seriesOf(m, metric, code).total[i];
}

/* 그해 1월부터 ym 까지의 합(연누계). 알 수 없는 달(null)이 끼면 null. */
export function ytd(m: Molit, metric: Metric, code: string, ym: string, actor?: Actor): number | null {
  const s = seriesOf(m, metric, code);
  const arr = actor ? s.actors?.[actor] : s.total;
  if (!arr) return null;
  const end = monthIndex(m, ym);
  if (end < 0) return null;
  let sum = 0, n = 0;
  for (let i = 0; i <= end; i++) {
    if (!m.months[i].startsWith(ym.slice(0, 4))) continue;
    const v = arr[i];
    if (v === null) return null;
    sum += v; n++;
  }
  return n === (Number(ym.slice(5))) ? sum : null;   // 1월부터 다 있어야 연누계다
}

/* 한 달의 시도별 표: 지표별 값(전국 포함). */
export function monthTable(m: Molit, ym: string) {
  return m.sido.map((s) => ({ code: s.code, name: s.name, values: Object.fromEntries(METRICS.map((k) => [k, valueAt(m, k, s.code, ym)])) as Record<Metric, number | null> }));
}

/* 한 시도(또는 전국)의 최근 n개월 표. */
export function recentMonths(m: Molit, n: number) { return m.months.slice(-n); }

export function neighborMonths(m: Molit, ym: string) {
  const i = monthIndex(m, ym);
  return { prev: i > 0 ? m.months[i - 1] : null, next: i >= 0 && i < m.months.length - 1 ? m.months[i + 1] : null };
}

/* LH 준공 예정: ym 부터 n개월(포함)의 월별 호수·블록 수. */
export function nextYm(ym: string, k = 1) {
  let y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5)) - 1 + k;
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  return `${y}-${String(mo + 1).padStart(2, '0')}`;
}
export function lhByMonth(lh: LhData, fromYm: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const ym = nextYm(fromYm, i);
    const blocks = lh.blocks.filter((b) => b.date.startsWith(ym));
    return { ym, units: blocks.reduce((a, b) => a + b.units, 0), blocks: blocks.length };
  });
}
export const lhOfMonth = (lh: LhData, ym: string): LhBlock[] => lh.blocks.filter((b) => b.date.startsWith(ym));
export const lhUnits = (blocks: LhBlock[]) => blocks.reduce((a, b) => a + b.units, 0);

/* 달 수(개월) 차이: a 에서 b 까지. */
export function monthsBetween(a: string, b: string) { return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)); }
/* 자료 낡음 표지: 자료 기준일(asOf)이 비교 기준일(ref, 보통 원장 기준일)보다 다 찬 달로 몇 개월 앞섰나(YYYY-MM-DD). 1개월 미만이면 null */
export function staleText(asOf: string, ref: string) {
  const n = monthsBetween(asOf, ref) - (Number(ref.slice(8, 10)) < Number(asOf.slice(8, 10)) ? 1 : 0);
  return n >= 1 ? `${n}개월 전 자료` : null;
}
/* 기간 꼬리: 올해 1월부터 upto 월까지의 누계('2026.01~08 누계') */
export const ytdSpan = (year: string, upto: number) => `${year}.01~${String(upto).padStart(2, '0')} 누계`;
/* 시도 타일의 호수 기준 지연율 분모: 판정 사업(사업 번호가 있는 사업 — 판정 cls 가 있는 행)의 정상 호수를 시도별로 더한다. 원장 집계 regions 에는 지연·주의 호수만 있다 */
export function okUnitsBySido(rows: { issued: boolean; cls: string | null; sgg: string; units: number }[]) {
  const out: Record<string, number> = {};
  for (const r of rows) if (r.issued && r.cls === 'ok') out[r.sgg.slice(0, 2)] = (out[r.sgg.slice(0, 2)] ?? 0) + r.units;
  return out;
}

/* 시도 하나의 LH 준공 예정 달력: fromYm 부터 n개월, 달마다 그 달의 블록(날짜·사업지구 순)과 세대수. 우리 동네(9.4 지시 '공급계획 사전 공개')가 쓴다 */
/* LH 준공예정 블록 주소(원천 location)의 표시 글: 원천은 주소 칸 여럿을 이어 붙여 시도·시군구가 되풀이된다
   ('부산광역시 남구 문현동 부산 남구 부산광역시 남구 문현동 산23-1번지 일원'). 원천 값은 그대로 두고 화면에서만 접두 중복을 뺀다.
   토막 = 시도 이름(긴·짧은 꼴)이나 이미 나온 시·군·구 낱말에서 새로 시작하는 부분. 토막에서 시도·이미 나온 시군구를 빼고 남은 낱말이
   이미 쓴 글에 이어 있으면 그 뒤만 붙이고(앞 글 끝에 이어지면 띄어쓰기, 아니면 ' · '), 남은 것이 없으면 버린다 */
const SIDO_ALIAS = new Set(['서울특별시', '서울시', '서울', '부산광역시', '부산시', '부산', '대구광역시', '대구시', '대구', '인천광역시', '인천시', '인천', '광주광역시', '광주',
  '대전광역시', '대전시', '대전', '울산광역시', '울산시', '울산', '세종특별자치시', '세종시', '세종', '경기도', '경기', '강원도', '강원특별자치도', '강원', '충청북도', '충북',
  '충청남도', '충남', '전라북도', '전북특별자치도', '전북', '전라남도', '전남', '경상북도', '경북', '경상남도', '경남', '제주특별자치도', '제주도', '제주']);   // '광주시'는 경기 광주시와 겹쳐 넣지 않는다
const ADMIN = /^\S+[시군구]$/;
const FILLER = new Set(['일원', '일대', '일부', '내']);
export function addrText(location: string): string {
  const words = location.trim().split(/\s+/).filter(Boolean);
  const stem = (w: string) => w.slice(0, -1);
  const seen = new Set<string>();
  const segs: string[][] = [];
  for (const w of words) {
    const isNew = SIDO_ALIAS.has(w) || (ADMIN.test(w) && seen.has(stem(w)));
    if (!segs.length || (isNew && segs[segs.length - 1].length)) segs.push([]);
    segs[segs.length - 1].push(w);
    if (ADMIN.test(w) && !SIDO_ALIAS.has(w)) seen.add(stem(w));
  }
  const kept: string[] = [...(segs[0] ?? [])];
  let out = kept.join(' ');
  const firstSeen = new Set(kept.filter((w) => ADMIN.test(w)).map(stem));
  for (const seg of segs.slice(1)) {
    let i = 0;
    while (i < seg.length && (SIDO_ALIAS.has(seg[i]) || (ADMIN.test(seg[i]) && firstSeen.has(stem(seg[i]))))) i++;
    const rest = seg.slice(i);
    if (!rest.length) continue;
    /* 이미 쓴 낱말 줄에 이어 있는 가장 긴 머리 */
    let k = 0, endsAtTail = false;
    for (let n = rest.length; n > 0 && !k; n--) for (let j = 0; j + n <= kept.length; j++) {
      if (rest.slice(0, n).every((w, q) => kept[j + q] === w)) { k = n; endsAtTail = j + n === kept.length; break; }
    }
    const tail = rest.slice(k);
    if (!tail.length || tail.every((w) => FILLER.has(w))) continue;   // '일원'만 남은 토막은 뜻이 없다
    out += (k && endsAtTail ? ' ' : ' · ') + tail.join(' ');
    kept.push(...tail);
    for (const w of tail) if (ADMIN.test(w)) firstSeen.add(stem(w));
  }
  return out;
}

/* 달력 칸 접기: 이어진 빈 달(예정 없음)은 한 칸으로 — { from, to } 이 같으면 한 달 */
export function foldEmptyMonths<T extends { ym: string; blocks: unknown[] }>(cal: T[]): ({ kind: 'month'; m: T } | { kind: 'empty'; from: string; to: string })[] {
  const out: ({ kind: 'month'; m: T } | { kind: 'empty'; from: string; to: string })[] = [];
  for (const m of cal) {
    const last = out[out.length - 1];
    if (m.blocks.length) out.push({ kind: 'month', m });
    else if (last && last.kind === 'empty') last.to = m.ym;
    else out.push({ kind: 'empty', from: m.ym, to: m.ym });
  }
  return out;
}

export function lhCalendar(lh: LhData, sido: string, fromYm: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const ym = nextYm(fromYm, i);
    const blocks = lh.blocks.filter((b) => b.sido === sido && b.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date) || a.district.localeCompare(b.district, 'ko'));
    return { ym, blocks, units: lhUnits(blocks) };
  });
}
