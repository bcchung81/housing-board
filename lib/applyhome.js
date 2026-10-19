/* 한국부동산원 청약홈 분양정보(공공데이터포털 15098547, api.odcloud.kr getAPTLttotPblancDetail)의 민영 분양 공고 변환·지역 거르기. /api/v1/notices 가 마이홈·LH 공고에 더한다.
   - 호출: https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail  serviceKey·page·perPage·returnType=JSON, cond[RCEPT_ENDDE::GTE]=YYYY-MM-DD 로 접수 마감이 오늘 이후인 것만
     (실측 2026-10-17: 전체 2,907건 중 16건). 응답 { totalCount, matchCount(조건에 맞는 수), currentCount, data:[행…] }.
   - 민영(HOUSE_DTL_SECD_NM '민영')만 넣는다. 국민(공공분양)은 마이홈·LH 에서 이미 온다(중복 방지). 분양가·건설사 이름은 넣지 않는다.
   - 지역: 공급 위치(HSSPLY_ADRES) 앞부분이 표준코드 이름으로 시작하는지 본다(전각 문자는 반각으로, '화성특례시'는 표준코드의 '화성시'로). 주소에 시도가 없는 행('김포 …')은 시도 질의에서만 청약 지역 이름(SUBSCRPT_AREA_CODE_NM '경기')으로 시도를 정한다.
   순수 함수(네트워크·키 없음)와 응답 한 번 읽기(fetchApplyhome)만 둔다. 링크는 청약홈 주소만 싣는다. 시험: tests/js/applyhome.test.cjs */
'use strict';
const { isQuotaError } = require('./keys.js');
const { norm, placeKey, intOf, targetsOf, placeOf } = require('./myhome.js');

const LIST_URL = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail';
const HOSTS = ['https://www.applyhome.co.kr/'];
const FETCH_TIMEOUT_MS = 10000;
/* 청약 지역 이름 → 시도 코드(광주·전남은 2026-07 통합 시도 12) */
const AREA_SIDO = { 서울: '11', 부산: '26', 대구: '27', 인천: '28', 광주: '12', 대전: '30', 울산: '31', 세종: '36', 경기: '41', 충북: '43', 충남: '44', 전남: '12', 경북: '47', 경남: '48', 제주: '50', 강원: '51', 전북: '52' };

/* '2026-10-19' 또는 '20261019' → '2026-10-19'. 달력에 없는 날짜는 null */
function dateOf(v) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(norm(v));
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`, t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}
const safeUrl = (u) => { const s = norm(u); return HOSTS.some((h) => s.startsWith(h)) ? s : ''; };

/* 원천 한 행 → 공고 한 건(마이홈 공고와 같은 모양, source:'applyhome'). 민영이 아니거나 제목·마감일이 없거나 마감이 today(KST 'YYYY-MM-DD') 이전이면 null */
function notice(raw, today) {
  if (!raw || norm(raw.HOUSE_DTL_SECD_NM) !== '민영') return null;
  const title = norm(raw.HOUSE_NM), manage = norm(raw.HOUSE_MANAGE_NO), applyTo = dateOf(raw.RCEPT_ENDDE);
  if (!title || !manage || !applyTo || (today && applyTo < today)) return null;
  const starts = [dateOf(raw.SPSPLY_RCEPT_BGNDE), dateOf(raw.RCEPT_BGNDE)].filter(Boolean).sort();
  return {
    id: `applyhome-${manage}-${norm(raw.PBLANC_NO) || manage}`, kind: 'sale', title, agency: null, status: null, housingType: 'APT', supplyType: '민영 분양',
    complex: null, units: intOf(raw.TOT_SUPLY_HSHLDCO), address: norm(raw.HSSPLY_ADRES) || null, pnu: null,
    announcedAt: dateOf(raw.RCRIT_PBLANC_DE), applyFrom: starts[0] || null, applyTo, url: safeUrl(raw.PBLANC_URL) || null, source: 'applyhome',
    deposit: null, monthlyRent: null, targets: targetsOf(title), sgg: null, sggName: null,
  };
}
/* 이 지역의 공고인가: 주소가 지역 이름으로 시작하거나, 시도 질의(sidoCode)에서 청약 지역 이름이 그 시도일 때 */
function inRegion(raw, regionName, sidoCode) {
  const name = placeKey(regionName), addr = placeKey(raw && raw.HSSPLY_ADRES);
  if (name && (addr === name || addr.startsWith(`${name} `))) return true;
  return !!sidoCode && AREA_SIDO[norm(raw && raw.SUBSCRPT_AREA_CODE_NM)] === sidoCode;
}
/* 원천 행들 → 이 지역의 접수 중·예정 민영 분양 공고(공고일 최신 순, 같은 id 하나), 주소로 sgg·sggName 을 채운다 */
function forRegion(rows, { regionName, sidoCode = null, regions = [], today } = {}) {
  const out = [], seen = new Set();
  for (const raw of rows || []) {
    const n = notice(raw, today);
    if (!n || seen.has(n.id) || !inRegion(raw, regionName, sidoCode)) continue;
    seen.add(n.id); out.push({ ...n, ...placeOf([n.address], regions) });
  }
  return out.sort((a, b) => String(b.announcedAt || '').localeCompare(String(a.announcedAt || '')) || a.id.localeCompare(b.id));
}

/* odcloud 한 쪽 조회. 일시 오류(연결·5xx·빈 본문·JSON 아님·data 없음)는 점점 길게 기다려 다시, HTTP 429·한도 문구는 e.quota. 오류 문구에 요청 주소(키 포함)를 담지 않는다 */
async function fetchApplyhome({ doFetch, sleep, url, params, attempts = 3 }) {
  const q = new URLSearchParams(params);
  let last = '응답 없음';
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await sleep(400 * attempt);
    let r;
    try { r = await doFetch(`${url}?${q}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } }); } catch (e) { last = 'network'; continue; }
    if (r.status === 429) { const e = new Error('quota'); e.quota = true; throw e; }
    if (!r.ok) { last = `HTTP ${r.status}`; if (r.status >= 500) continue; throw new Error(last); }
    const text = await r.text();
    if (isQuotaError(text)) { const e = new Error('quota'); e.quota = true; throw e; }
    if (!String(text).trim()) { last = '빈 본문'; continue; }
    let json; try { json = JSON.parse(text); } catch (e) { last = 'JSON 아님'; continue; }
    if (!json || !Array.isArray(json.data)) { last = '응답 모양 이상'; continue; }
    return json;
  }
  throw new Error(last);
}
/* 응답 → { rows, total }(조건이 있으면 matchCount 가 조건에 맞는 수) */
function listOf(json) {
  const rows = json && Array.isArray(json.data) ? json.data : [];
  const total = json ? Number(json.matchCount != null ? json.matchCount : json.totalCount) || 0 : 0;
  return { rows, total };
}

module.exports = { LIST_URL, HOSTS, AREA_SIDO, dateOf, safeUrl, notice, inRegion, forRegion, fetchApplyhome, listOf };
