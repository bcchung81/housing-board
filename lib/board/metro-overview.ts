/* 지도 첫 화면 '수도권 개요'(/map, /map?sido=11|28|41)의 값(순수 함수 — 파일을 읽지 않는다. Node 시험이 그대로 부른다: tests/js/map-overview.test.cjs).
   - 면: data/board/region-map.json 의 시군구 67곳(서울 25 · 인천 11 · 경기 31 — 경기는 시 단위). 경로(투영 정수)는 그대로 넘기고 지도 쪽(assets/js/overview.js)이 경위도 GeoJSON 으로 되돌린다.
   - 값: 사업 화면(/projects)과 같은 목록 행(getProjectsIndex → rowsOf)과 지역 공급(/region)과 같은 앞으로 12개월 예정(region-calendar.json)에서 센다(지역 공급은 모집·준공·입주, 개요는 준공이 대표이고 입주는 마우스 올림 분해로만).
     진행 사업 호수 = 현재 단계가 ①계획~④모집(리본 칸 0~3)인 사업의 계획 호수 합(호수 미확인은 건수로 따로)
     지연 사업 = 사업 화면의 '지연(장기 포함)' = 판정 지연(현재 예정일 경과 6개월 이상, 12개월 이상 장기 지연 포함) — 번호 있는 사업만(후보는 세지 않음)
     앞으로 12개월 준공 = 지역 공급의 '앞으로 12개월'에서 준공(COMPLETION) 예정만(사업당 하나 — 사업·지역 공급 화면의 대표 '준공 예정'과 같은 정의, 2026-10-15 결정)
     앞으로 12개월 입주 = 같은 기간 입주(MOVE_IN) 예정(분해용 — 준공과 더하지 않는다)
   - 코드: 원장 시군구 코드 → 면. 서울·인천은 코드 그대로, 경기는 시 단위로 접는다(앞 4자리 + '0': 41281 고양시 덕양구 → 41280 고양시). */
import type { ProjectRow } from './projects-view';
import type { CalendarDoc, RegionMapDoc } from './region';

export const OV_SIDO = ['11', '28', '41'] as const;

export const SIDO_FULL: Record<string, string> = { '11': '서울특별시', '28': '인천광역시', '41': '경기도' };
export const SIDO_SHORT: Record<string, string> = { '11': '서울', '28': '인천', '41': '경기' };

/* 수도권 시군구·구 코드표(행정표준 법정동코드 — schemas/ledger-2026-10/tables/areas.json 의 SGG 행, 인천은 2026-07 개편 이름). '_' 는 띄어쓰기 */
const AREAS = '11110:종로구 11140:중구 11170:용산구 11200:성동구 11215:광진구 11230:동대문구 11260:중랑구 11290:성북구 11305:강북구 11320:도봉구 11350:노원구 11380:은평구 11410:서대문구 11440:마포구 11470:양천구 11500:강서구 11530:구로구 11545:금천구 11560:영등포구 11590:동작구 11620:관악구 11650:서초구 11680:강남구 11710:송파구 11740:강동구 '
  + '28125:제물포구 28155:영종구 28177:미추홀구 28185:연수구 28200:남동구 28237:부평구 28245:계양구 28275:서해구 28290:검단구 28710:강화군 28720:옹진군 '
  + '41110:수원시 41111:수원시_장안구 41113:수원시_권선구 41115:수원시_팔달구 41117:수원시_영통구 41130:성남시 41131:성남시_수정구 41133:성남시_중원구 41135:성남시_분당구 41150:의정부시 41170:안양시 41171:안양시_만안구 41173:안양시_동안구 '
  + '41190:부천시 41192:부천시_원미구 41194:부천시_소사구 41196:부천시_오정구 41210:광명시 41220:평택시 41250:동두천시 41270:안산시 41271:안산시_상록구 41273:안산시_단원구 41280:고양시 41281:고양시_덕양구 41285:고양시_일산동구 41287:고양시_일산서구 '
  + '41290:과천시 41310:구리시 41360:남양주시 41370:오산시 41390:시흥시 41410:군포시 41430:의왕시 41450:하남시 41460:용인시 41461:용인시_처인구 41463:용인시_기흥구 41465:용인시_수지구 41480:파주시 41500:이천시 41550:안성시 41570:김포시 '
  + '41590:화성시 41591:화성시_만세구 41593:화성시_효행구 41595:화성시_병점구 41597:화성시_동탄구 41610:광주시 41630:양주시 41650:포천시 41670:여주시 41800:연천군 41820:가평군 41830:양평군';
/* 코드 → 시도 이름을 뺀 이름('고양시 덕양구') */
export const METRO_AREAS: Record<string, string> = Object.fromEntries(AREAS.split(' ').map((t) => { const [c, n] = t.split(':'); return [c, n.replace(/_/g, ' ')]; }));

/* 원장 시군구 코드 → 개요 면 코드. 경기만 시 단위로 접는다(구가 없는 시는 그대로). 수도권 밖이면 null */
export function unitOf(code: string): string | null {
  if (!/^\d{5}$/.test(code) || !(OV_SIDO as readonly string[]).includes(code.slice(0, 2))) return null;
  return code.startsWith('41') ? `${code.slice(0, 4)}0` : code;
}
/* 구가 있는 시(경기): 면 코드 → 구 코드들(코드 순) */
export function guOf(unit: string): string[] {
  if (!unit.startsWith('41')) return [];
  return Object.keys(METRO_AREAS).filter((c) => c !== unit && unitOf(c) === unit).sort();
}
/* 구가 있는 시 코드들(지도 첫 스크립트가 ?sgg=<시> 를 개요 구 메뉴로 넘길 때) */
export const GU_CITIES = Object.keys(METRO_AREAS).filter((c) => guOf(c).length);
/* 지도 화면 모드를 첫 그림 전에 정한다(지도 레이아웃 <head>): 상세 매개변수(?project·pnu·bjd·sgg·code·region)가 하나라도 있으면 'detail', 아니면 'overview'.
   CSS(app.css)가 이 값으로 상세 마크업과 개요 마크업 중 하나만 보이고, 지도 섬(MapIsland)이 그 모드의 스크립트만 부른다. assets/js/overview.js modeOf 와 같은 규칙(시험으로 확인).
   구가 있는 경기 시(guOf — 수원·성남·안양·부천·안산·고양·용인·화성)를 ?sgg= 로 열면(2026-10-15 평가 P1: 고양시 41280 이 '0호' 빈 지도) 상세를 열지 않고
   개요 /map?sido=41&pick=<시> 로 바꿔(replace) 그 시의 구 메뉴를 연다. 지표(?metric=)는 넘긴다. 시 단위 코드에만 적힌 사업(구 미정)을 여는 ?gu=none 은 그대로 상세.
   전역 이름을 남기지 않게 함수로 감싼다(전역 var 가 생기면 같은 이름을 최상위 const 로 쓰는 app.js 가 SyntaxError 로 통째로 멈춘다) */
export const MAP_MODE_INIT = "(function(){try{var q=new URLSearchParams(location.search),c=q.get('sgg'),m=q.get('metric'),d=document.documentElement;"
  + `if(c&&${JSON.stringify(GU_CITIES)}.indexOf(c)>=0&&q.get('gu')!=='none'&&!['project','pnu','bjd','code','region'].some(function(k){return q.has(k)})){d.setAttribute('data-map-mode','overview');location.replace('/map?sido='+c.slice(0,2)+'&pick='+c+(m?'&metric='+encodeURIComponent(m):''));return}`
  + "d.setAttribute('data-map-mode',['project','pnu','bjd','sgg','code','region'].some(function(k){return q.has(k)})?'detail':'overview')}catch(e){}})()";

/* 값 한 묶음: u = 진행 사업 호수, q = 진행 사업 중 호수 미확인 건수, n = 진행 사업 수, d = 지연 사업 수(장기 포함), a = 앞으로 12개월 준공 호, an = 그 예정 수, mi = 같은 기간 입주 호, mn = 그 예정 수,
   st = 현재 단계(①~⑥)별 사업 수 */
export type OvVals = { u: number; q: number; n: number; d: number; a: number; an: number; mi: number; mn: number; st: number[] };
export type OvGu = { code: string; name: string; v: OvVals | null };
export type OvUnit = { code: string; s: string; name: string; d: string; v: OvVals | null; gu: OvGu[] };
export type OverviewDoc = {
  schema: 'metro-overview/1'; ok: boolean; referenceDate: string | null; months: [string, string] | null;
  total: OvVals | null; sido: { code: string; name: string; v: OvVals | null }[]; units: OvUnit[]; view: Record<string, [number, number, number, number]>;
};

const zero = (): OvVals => ({ u: 0, q: 0, n: 0, d: 0, a: 0, an: 0, mi: 0, mn: 0, st: [0, 0, 0, 0, 0, 0] });
function add(t: OvVals, x: OvVals) {
  t.u += x.u; t.q += x.q; t.n += x.n; t.d += x.d; t.a += x.a; t.an += x.an; t.mi += x.mi; t.mn += x.mn;
  x.st.forEach((v, i) => { t.st[i] += v; });
}
/* 진행 = 리본 칸 0~3(①계획 ②인허가 ③착공 ④모집) */
export const inProgress = (r: { board: number }) => r.board <= 3;

/* 원장 시군구 코드별 값(접기 전). 사업 화면 행(rows)과 지역 공급 예정(calendar)을 받는다 */
export function valuesBySgg(rows: Pick<ProjectRow, 'sgg' | 'board' | 'units' | 'cls' | 'issued'>[], calendar: Pick<CalendarDoc, 'sido'>, sggNames: Record<string, string | null>): Map<string, OvVals> {
  const out = new Map<string, OvVals>(), at = (c: string) => { let v = out.get(c); if (!v) out.set(c, (v = zero())); return v; };
  for (const r of rows) {
    if (!unitOf(r.sgg)) continue;
    const v = at(r.sgg);
    v.st[Math.min(5, Math.max(0, r.board))] += 1;
    if (r.issued && r.cls === 'delay') v.d += 1;   // 판정 지연은 번호 있는 사업만(사업 화면 isLate·원장 judgment.delay 와 같은 정의) — 후보의 계산 지연은 세지 않는다
    if (inProgress(r)) { v.n += 1; if (r.units > 0) v.u += r.units; else v.q += 1; }
  }
  /* 예정의 시군구는 이름('경기도 고양시 덕양구')이라 원장 이름표로 코드를 찾는다 */
  const byName = new Map(Object.entries(sggNames).filter(([, n]) => n).map(([c, n]) => [n as string, c]));
  for (const sd of OV_SIDO) for (const e of calendar.sido[sd] ?? []) {
    if (e.type !== 'COMPLETION' && e.type !== 'MOVE_IN') continue;
    const c = byName.get(e.sgg);
    if (!c) continue;
    const v = at(c);
    if (e.type === 'COMPLETION') { v.a += e.units; v.an += 1; } else { v.mi += e.units; v.mn += 1; }
  }
  return out;
}

const unitName = (s: string, n: string) => `${SIDO_FULL[s]} ${n}`;

/* 개요 자료 하나. data 가 null 이면(원장을 읽지 못함) 경계만 */
export function metroOverview(map: RegionMapDoc, data: { rows: Pick<ProjectRow, 'sgg' | 'board' | 'units' | 'cls' | 'issued'>[]; calendar: CalendarDoc; sggNames: Record<string, string | null>; referenceDate: string } | null): OverviewDoc {
  const codeOf = new Map(Object.entries(METRO_AREAS).map(([c, n]) => [`${c.slice(0, 2)}|${n}`, c]));
  const by = data ? valuesBySgg(data.rows, data.calendar, data.sggNames) : null;
  const units: OvUnit[] = map.sgg.filter((g) => (OV_SIDO as readonly string[]).includes(g.s)).map((g) => {
    const code = codeOf.get(`${g.s}|${g.n}`);
    if (!code) throw new Error(`개요 면 코드를 찾지 못했습니다: ${unitName(g.s, g.n)}`);
    const gu: OvGu[] = guOf(code).map((c) => ({ code: c, name: METRO_AREAS[c], v: by ? by.get(c) ?? zero() : null }));
    let v: OvVals | null = null;
    if (by) {
      v = zero();
      for (const [c, x] of by) if (unitOf(c) === code) add(v, x);
      /* 시 단위 코드로만 적힌 사업(구 미정)이 있으면 구 메뉴 맨 끝에 시 자체를 둔다 */
      const self = by.get(code);
      if (gu.length && self && (self.n || self.d || self.an || self.mn || self.st.some(Boolean))) gu.push({ code, name: `${g.n}(구 미정)`, v: self });
    }
    return { code, s: g.s, name: g.n, d: g.d, v, gu };
  });
  const sido = OV_SIDO.map((s) => {
    if (!by) return { code: s, name: SIDO_SHORT[s], v: null };
    const v = zero();
    for (const u of units) if (u.s === s && u.v) add(v, u.v);
    return { code: s, name: SIDO_SHORT[s], v };
  });
  let total: OvVals | null = null;
  if (by) { total = zero(); for (const s of sido) add(total, s.v!); }
  const months = data && data.calendar.months?.length ? [data.calendar.months[0], data.calendar.months[data.calendar.months.length - 1]] as [string, string] : null;
  return { schema: 'metro-overview/1', ok: !!by, referenceDate: data ? data.referenceDate : null, months, total, sido, units, view: map.view };
}
