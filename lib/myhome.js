/* 마이홈포털 공공주택 모집공고(HWSPR02: 임대 rsdtRcritNtcList · 분양 ltRsdtRcritNtcList) 변환·시군구 거르기. 순수 함수(네트워크·키 없음).
   원천은 전국 현재 공고 목록(2026-10-05: 임대 244 + 분양 80)이고 시군구 필터가 없어 전체를 받아 이름으로 거른다.
   공고는 대부분 매입임대·일반매각(개별 주택)이라 건설 중인 단지(인허가 사업)와는 다른 층이다 → 사업과 합치지 않고 '모집 공고' 목록으로 따로 보인다.
   공고마다 임대 보증금·월세(rentGtn·mtRntchrg, 임대 행만)·제목의 대상(targetsOf)·시군구(placeOf)를 더한다. targetsOf·placeOf·norm 은 LH·청약홈 공고도 같이 쓴다.
   시험: tests/js/myhome.test.cjs */
'use strict';

const KINDS = { rental: '임대', sale: '분양' };
const HOSTS = ['https://www.myhome.go.kr/', 'https://m.myhome.go.kr/', 'https://apply.lh.or.kr/'];   // 링크는 이 주소로 시작하는 것만(원천 응답을 그대로 믿고 내보내지 않는다)

const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
/* '20261002' → '2026-10-02'. 달력에 없는 날짜는 null */
function dateOf(v) {
  const s = clean(v);
  if (!/^\d{8}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}
/* 전각 문자(　·１·（)를 반각으로, 공백을 하나로: 청약홈 주소에 '서울특별시　서초구　１６７５' 같은 전각이 있다 */
const norm = (v) => clean(v == null ? '' : String(v).normalize('NFKC'));
const intOf = (v) => { const n = Number(clean(v).replace(/,/g, '')); return Number.isInteger(n) && n > 0 ? n : null; };
const safeUrl = (u) => { const s = clean(u); return HOSTS.some((h) => s.startsWith(h)) ? s : ''; };

/* 제목에 적힌 대상(자격 판정 아님): 이 다섯 가지만, 이 순서로 */
const TARGETS = [['신혼부부', /신혼/], ['신생아', /신생아/], ['청년', /청년/], ['다자녀', /다자녀/], ['고령자', /고령|어르신/]];
const targetsOf = (title) => { const t = norm(title); return TARGETS.filter(([, re]) => re.test(t)).map(([name]) => name); };
/* 지역 이름 비교용: 주소의 '화성특례시'(청약홈)를 표준코드 이름 '화성시'로 맞춘다(특례시는 법정 이름이 아님) */
const placeKey = (v) => norm(v).replace(/특례시(?= |$)/g, '시');
/* 주소 후보들(앞에서부터) 가운데 시군구 이름({code, name}, 표준코드 전체 이름)으로 시작하는 가장 긴 것 → { sgg, sggName }. 구가 있는 시는 구가 이긴다. 없으면 null 둘 */
function placeOf(texts, regions) {
  let best = null;
  for (const t of (texts || []).map(placeKey).filter(Boolean)) for (const r of regions || []) {
    const name = placeKey(r && r.name);
    if (name && (t === name || t.startsWith(`${name} `)) && (!best || name.length > best.len)) best = { sgg: r.code, sggName: norm(r.name), len: name.length };
  }
  return best ? { sgg: best.sgg, sggName: best.sggName } : { sgg: null, sggName: null };
}
/* 임대 행의 보증금·월세(원). 보증금이 0·빈 값이면 둘 다 null(매입임대 묶음 공고는 0 = 값 없음), 보증금이 있으면 월세 0 은 그대로(전세형) */
function rentOf(raw, kind) {
  const deposit = kind === 'rental' ? intOf(raw.rentGtn) : null, mt = Number(clean(raw.mtRntchrg).replace(/,/g, ''));
  return { deposit, monthlyRent: deposit && clean(raw.mtRntchrg) !== '' && Number.isInteger(mt) && mt >= 0 ? mt : null };
}

/* 원천 한 행 → 화면에 보일 공고 한 건. 제목·주소가 없으면 null */
function notice(raw, kind) {
  if (!raw || !KINDS[kind]) return null;
  const title = clean(raw.pblancNm), address = clean(raw.fullAdres);
  if (!title) return null;
  const pnu = /^\d{19}$/.test(clean(raw.pnu)) ? clean(raw.pnu) : null;
  return {
    id: `${kind}-${clean(raw.pblancId)}${raw.houseSn ? `-${raw.houseSn}` : ''}`, kind, title,
    agency: clean(raw.suplyInsttNm) || null, status: clean(raw.sttusNm) || null, housingType: clean(raw.houseTyNm) || null, supplyType: clean(raw.suplyTyNm) || null,
    complex: clean(raw.hsmpNm) || null, units: intOf(raw.suplyHoCo) || intOf(raw.sumSuplyCo) || null, address: address || null, pnu,
    announcedAt: dateOf(raw.rcritPblancDe), applyFrom: dateOf(raw.beginDe), applyTo: dateOf(raw.endDe), url: safeUrl(raw.pcUrl) || safeUrl(raw.url) || null, source: 'myhome',
    ...rentOf(raw, kind), targets: targetsOf(title), sgg: null, sggName: null,
  };
}
/* 시군구 전체 이름('경기도 하남시')에 속한 공고인가: 주소가 그 이름으로 시작하거나, 시도·시군구 필드가 맞는다.
   구가 있는 시('경기도 수원시 영통구')는 주소 앞부분이, 시 전체('경기도 수원시')는 구를 가리지 않고 시까지만 맞으면 된다 */
function inRegion(raw, regionName) {
  const name = clean(regionName);
  if (!name) return false;
  const addr = clean(raw && raw.fullAdres), pair = `${clean(raw && raw.brtcNm)} ${clean(raw && raw.signguNm)}`.trim();
  return addr === name || addr.startsWith(`${name} `) || pair === name || pair.startsWith(`${name} `);
}
/* 임대·분양 원천 행 → 이 지역(시군구 또는 시도 이름)의 공고(공고일 최신 순, 같은 id 는 하나). regions({code, name}[]) 를 주면 주소·시도+시군구 필드로 sgg·sggName 을 채운다 */
function forRegion(rental, sale, regionName, regions) {
  const out = [], seen = new Set();
  for (const [kind, list] of [['rental', rental], ['sale', sale]]) for (const raw of list || []) {
    if (!inRegion(raw, regionName)) continue;
    const n = notice(raw, kind);
    if (n && !seen.has(n.id)) { seen.add(n.id); out.push(regions ? { ...n, ...placeOf([raw.fullAdres, `${clean(raw.brtcNm)} ${clean(raw.signguNm)}`], regions) } : n); }
  }
  return out.sort((a, b) => String(b.announcedAt || '').localeCompare(String(a.announcedAt || '')) || a.id.localeCompare(b.id));
}

module.exports = { KINDS, HOSTS, TARGETS, dateOf, intOf, norm, placeKey, safeUrl, targetsOf, placeOf, rentOf, notice, inRegion, forRegion };
