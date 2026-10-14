/* 우리 동네 '동네 여건'(시도 단위): data/board/area-facts.json(tools/ledger/area-facts.js 가 원장 지역 지표에서 뽑는다)을 화면 값으로 바꾼다. 순수 함수 — 파일을 읽지 않는다.
   자료는 서울(11)·인천(28)·경기(41)뿐이다. 다른 시도는 null(화면이 '자료 없음'으로 적는다 — 0 으로 바꾸지 않는다).
   숫자마다 기준 시점(연도·월)이 따로라 값과 함께 돌려준다. 재고−가구 차이는 공급 부족 확정치가 아니다(공실·점유·실입주량은 이 자료에 없음). */
export type Series = Record<string, number>;
export type SidoFacts = { name: string; population?: Series; households?: Series; housing_units?: Series; forecast_households?: Series; unsold_total?: Series; unsold_completed?: Series };
export type AreaFactsDoc = { schema: string; source: string | null; sido: Record<string, SidoFacts> };

/* 시계열의 마지막 시점(문자열 사전순 = 시간순: '2025' · '2026-08') */
export function latest(s?: Series): { period: string; value: number } | null {
  const keys = Object.keys(s ?? {}).sort();
  const period = keys[keys.length - 1];
  return period === undefined ? null : { period, value: s![period] };
}

export type Conditions = {
  population: { period: string; value: number } | null;
  households: { period: string; value: number } | null;
  housingUnits: { period: string; value: number } | null;
  unsold: { period: string; value: number; completed: number | null } | null;
};

/* 숫자 4: 인구·일반가구·주택 재고(기준연도)·미분양(기준 월, 준공 후 호수는 곁붙임). 자료가 없는 시도는 null */
export function conditions(doc: AreaFactsDoc, sido: string): Conditions | null {
  const f = doc.sido[sido];
  if (!f) return null;
  const u = latest(f.unsold_total);
  return {
    population: latest(f.population), households: latest(f.households), housingUnits: latest(f.housing_units),
    unsold: u ? { ...u, completed: f.unsold_completed?.[u.period] ?? null } : null,
  };
}

export type StockChart = { years: number[]; stock: (number | null)[]; households: (number | null)[]; forecast: (number | null)[]; lastActual: number };
/* 주택 재고 vs 일반가구 연도 선. 장래가구 추계는 마지막 실측 해에서 이어 그린다(점선). 재고·가구가 겹치는 해가 없으면 null */
export function stockChart(doc: AreaFactsDoc, sido: string): StockChart | null {
  const f = doc.sido[sido];
  if (!f?.housing_units || !f.households) return null;
  const actual = Object.keys(f.housing_units).filter((y) => y in f.households!).map(Number).sort((a, b) => a - b);
  if (!actual.length) return null;
  const lastActual = actual[actual.length - 1];
  const fc = Object.keys(f.forecast_households ?? {}).map(Number).filter((y) => y > lastActual).sort((a, b) => a - b);
  const years = [...actual, ...fc];
  return {
    years, lastActual,
    stock: years.map((y) => (y <= lastActual ? f.housing_units![y] ?? null : null)),
    households: years.map((y) => (y <= lastActual ? f.households![y] ?? null : null)),
    forecast: years.map((y) => (y === lastActual ? f.households![y] : y > lastActual ? f.forecast_households![y] : null)),
  };
}
