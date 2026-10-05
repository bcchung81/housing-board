/* 공공데이터포털(apis.data.go.kr) JSON 한 쪽 조회: 일시 오류는 점점 길게 기다려 다시 시도하고, 한도 오류는 e.quota=true 로 던져 키 풀(lib/keys.js)이 다음 키로 넘기게 한다.
   - 다시 시도: HTTP 5xx · 빈 본문 · JSON 아님 · resultCode 99(동시 접속 가득) 최대 attempts 번
   - 초당 한도(…REQUESTS_PER_SECOND_EXCEEDS_ERROR, HTTP 429): 하루 한도가 아니라 순간 과속이므로 잠시 쉬고 다시 시도한다(계속이면 e.throttled, 키는 쉬게 하지 않음)
   - 일일 한도: HTTP 429(본문 없음) · XML 본문의 LIMITED_NUMBER… · resultCode 22 → quota
   - 그 밖의 오류(resultCode 가 00 이 아님·4xx)는 바로 던진다. 오류 문구에 요청 주소(키 포함)를 담지 않는다.
   시험: tests/js/permitsapi.test.cjs · tests/js/infra.api.test.cjs */
'use strict';
const { isQuotaError } = require('./keys.js');

const quotaError = () => { const e = new Error('quota'); e.quota = true; return e; };

async function fetchPage({ doFetch, sleep, url, params, timeoutMs = 10000, attempts = 4 }) {
  const q = new URLSearchParams(params);
  let last = '응답 없음', wait = 0, throttled = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await sleep(wait || 400 * attempt);
    wait = 0;
    let r;
    try { r = await doFetch(`${url}?${q}`, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } }); } catch (e) { last = 'network'; continue; }
    const text = r.status === 429 || r.ok ? await r.text() : '';
    if (/REQUESTS_PER_SECOND/i.test(text)) { last = '초당 호출 한도'; throttled = true; wait = 1100 * (attempt + 1); continue; }
    if (r.status === 429) throw quotaError();
    if (!r.ok) { last = `HTTP ${r.status}`; if (r.status >= 500) continue; throw new Error(last); }
    if (!String(text).trim()) { last = '빈 본문'; continue; }
    if (isQuotaError(text)) throw quotaError();
    let json; try { json = JSON.parse(text); } catch (e) { last = 'JSON 아님'; continue; }
    const header = json && json.response && json.response.header, code = String(header && header.resultCode);
    if (code === '22') throw quotaError();
    if (code === '99') { last = '동시 접속 가득'; continue; }
    if (code !== '00') throw new Error(`result ${code}`);
    const body = json.response.body || {}, items = body.items && body.items.item !== undefined ? body.items.item : body.items;
    return { items: Array.isArray(items) ? items : items && typeof items === 'object' ? [items] : [], total: Number(body.totalCount) || 0 };
  }
  const e = new Error(last); if (throttled && last === '초당 호출 한도') e.throttled = true;
  throw e;
}

module.exports = { fetchPage, quotaError };
