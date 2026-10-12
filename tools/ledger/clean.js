'use strict';
/* 단계별 전국 원천(2026-10-12 수집, docs/product/단계별-원천-수집.md)을 원장 변환기가 읽을 중간 스냅샷으로 줄일 때 쓰는 공용 정제 규칙.
   순수 함수다: 파일을 읽거나 쓰지 않는다. tools/ledger/stage-snapshot.js 가 쓴다. 시험: tests/js/clean.test.cjs
   - 날짜: 원천마다 형식이 달라(YYYY-MM-DD · YYYYMMDD · YYYY.MM.DD · YYYYMM · YYYY · 'YYYY년 MM월' · 'YYYY.MM') 적힌 정밀도 그대로
     일 'YYYY-MM-DD' · 월 'YYYY-MM' · 연 'YYYY' 로 받는다. 자리표시값('9999-12-31' · '1111-11-11' · '0000' · '000001' · '999912' · '1900-01-01' ·
     '#VALUE!' · '0000. 0')과 1950 전·2035 뒤는 null 이고, 왜 null 인지(reason)를 함께 돌려 스냅샷 manifest 에서 센다.
   - 코드: 옛 법정동코드·PNU 는 지금 코드로(hub-bulk.js codeMapper 를 받는다). PNU 11번째 자리(대지구분)가 1(일반)·2(산)가 아니면 무효.
   - 주소: 지번 주소를 다듬어(괄호·'번지·일원·외 N필지'·블록·로트를 떼고 여러 필지는 첫 필지) map-lh.js jibunToPnu 에 넣는다.
     일반구가 새로 생긴 시(부천·화성)는 동 이름이 맞는 구를 찾는다. 도로명 주소는 도로명 → 지번 매핑(road-jibun.json)이 있을 때만 PNU.
   - CSV(따옴표 칸·칸 안 쉼표·줄바꿈), 행 접기, 글자 정리, 청약홈 경쟁률. */
const { normalize, jibunToPnu } = require('./map-lh');

/* ---------- 날짜 ---------- */

const DATE_FLOOR = 1950, DATE_CEIL = 2035;
/* 이름 그대로 자리표시값인 것(형식으로 읽으면 연 0000·9999 로 잡히지만 사유를 PLACEHOLDER 로 세려고 적어 둔다) */
const PLACEHOLDER_RAW = new Set(['#VALUE!', '0000', '000001', '999912', '0000. 0']);
const PLACEHOLDER_DAY = new Set(['1111-11-11', '1900-01-01', '9999-12-31']);
const pad2 = (n) => String(n).padStart(2, '0');

/* 날짜 글자 → { value, precision('day'|'month'|'year'|null), reason(null|'EMPTY'|'PLACEHOLDER'|'FORMAT'|'CALENDAR'|'RANGE') }.
   끝에 붙은 시각(' 09:00', ' 16:00:00')은 뗀다. 연이 0000·9999 이거나 PLACEHOLDER_* 면 PLACEHOLDER, 1950 전·2035 뒤면 RANGE */
function parseDate(s) {
  const raw = String(s ?? '').trim();
  if (!raw) return { value: null, precision: null, reason: 'EMPTY' };
  if (PLACEHOLDER_RAW.has(raw)) return { value: null, precision: null, reason: 'PLACEHOLDER' };
  const t = raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, '');
  let m, y, mo = null, d = null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)) || (m = /^(\d{4})(\d{2})(\d{2})$/.exec(t)) || (m = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?$/.exec(t))) [, y, mo, d] = m;
  else if ((m = /^(\d{4})년\s*(\d{1,2})월(?:\s*(\d{1,2})일)?$/.exec(t))) [, y, mo, d] = m;
  else if ((m = /^(\d{4})(\d{2})$/.exec(t)) || (m = /^(\d{4})[.-]\s*(\d{1,2})\.?$/.exec(t))) [, y, mo] = m;
  else if ((m = /^(\d{4})\.?$/.exec(t))) [, y] = m;
  else return { value: null, precision: null, reason: 'FORMAT' };
  const Y = +y, M = mo == null ? null : +mo, D = d == null ? null : +d;
  const day = D != null ? `${y}-${pad2(M)}-${pad2(D)}` : null;
  if (y === '0000' || y === '9999' || PLACEHOLDER_DAY.has(day)) return { value: null, precision: null, reason: 'PLACEHOLDER' };
  if (M != null && (M < 1 || M > 12)) return { value: null, precision: null, reason: 'CALENDAR' };
  if (D != null) { const dt = new Date(Date.UTC(Y, M - 1, D)); if (dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return { value: null, precision: null, reason: 'CALENDAR' }; }
  if (Y < DATE_FLOOR || Y > DATE_CEIL) return { value: null, precision: null, reason: 'RANGE' };
  if (D != null) return { value: day, precision: 'day', reason: null };
  if (M != null) return { value: `${y}-${pad2(M)}`, precision: 'month', reason: null };
  return { value: y, precision: 'year', reason: null };
}
const cleanDate = (s) => parseDate(s).value;
/* 월 단위 값(입주예정월 등): 일까지 적혀 있으면 달까지만 */
function parseMonth(s) {
  const r = parseDate(s);
  return r.precision === 'day' ? { ...r, value: r.value.slice(0, 7), precision: 'month' } : r;
}
/* 'YYYY.MM.DD HH:MM ~ YYYY.MM.DD HH:MM'(LH 접수 일시) → [시작, 끝] 의 parseDate 결과 */
const parseRange = (s) => { const [a, b] = String(s ?? '').split('~'); return [parseDate(a), parseDate(b)]; };

/* ---------- 글자·수 ---------- */

/* 전각·호환 글자를 풀고(NFKC: '１' → '1', '㈜' → '(주)') 공백을 하나로. 빈 글자는 null */
const cleanText = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim() || null;
/* 시행·시공 회사 이름: 앞뒤 쉼표를 떼고, 글자·숫자가 없으면(',' · '-') null */
function cleanParty(s) {
  const t = (cleanText(s) ?? '').replace(/^[,\s]+|[,\s]+$/g, '');
  return /[0-9A-Za-z가-힣]/.test(t) ? t : null;
}
/* 세대수 같은 개수: '150.0' · '1,128' · 1128 → 정수, 음수·소수·빈 값은 null */
function toCount(s) {
  const t = String(s ?? '').trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
/* 'Y'·'N' → true·false, 그 밖 null */
const yn = (s) => (s === 'Y' ? true : s === 'N' ? false : null);

/* 청약홈 경쟁률: '12.5' · '1,234.5' → { rate }, '(△17)' → 17세대 미달 { shortfall: 17 }, '-' · 빈 값 → 둘 다 null */
function parseCompetition(s) {
  const t = String(s ?? '').trim();
  const short = /^\(\s*△\s*([\d,]+)\s*\)$/.exec(t);
  if (short) return { rate: null, shortfall: Number(short[1].replace(/,/g, '')) };
  const n = Number(t.replace(/,/g, ''));
  return t && t !== '-' && Number.isFinite(n) ? { rate: n, shortfall: null } : { rate: null, shortfall: null };
}

/* ---------- CSV · 행 접기 ---------- */

/* RFC 4180 CSV → 행(칸 배열)들. 따옴표 칸 안의 쉼표·줄바꿈·"" 를 받는다. 칸 앞뒤 공백은 그대로 둔다(부르는 쪽이 trim). 끝의 빈 줄은 버린다 */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/* 같은 키의 행을 하나로 접는다(처음 나온 순서). merge(같은 키 행들) → 기록, 기본은 첫 행. { rows, repeats: 접혀 없어진 행 수 } */
function fold(rows, keyOf, merge = (g) => g[0]) {
  const groups = new Map();
  for (const r of rows) { const k = keyOf(r); (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  return { rows: [...groups.values()].map(merge), repeats: rows.length - groups.size };
}
/* 행마다 반복되는 단지 총계(합하면 안 된다): 모두 같으면 그 값, 다르면 가장 큰 값과 varies true */
function repeatedTotal(values) {
  const v = values.filter((x) => x != null);
  if (!v.length) return { value: null, varies: false };
  const max = Math.max(...v);
  return { value: max, varies: v.some((x) => x !== max) };
}

/* ---------- 코드 ---------- */

/* PNU 글자 → { pnu(지금 코드) | null, reason(null|'EMPTY'|'FORMAT'|'LAND'|'LOT'|'UNMAPPED'), changed(옛 코드를 바꿨나) }.
   끝 공백은 뗀다. 11번째 자리(대지구분)는 1·2 만(3 가지번 등은 LAND), 본번 0000 은 필지가 아니다(LOT). mapper = hub-bulk.js codeMapper(…) */
function pnuNow(s, mapper) {
  const t = String(s ?? '').trim();
  if (!t) return { pnu: null, reason: 'EMPTY', changed: false };
  if (!/^\d{19}$/.test(t)) return { pnu: null, reason: 'FORMAT', changed: false };
  if (t[10] !== '1' && t[10] !== '2') return { pnu: null, reason: 'LAND', changed: false };
  if (t.slice(11, 15) === '0000') return { pnu: null, reason: 'LOT', changed: false };
  const b = mapper.bjd(t.slice(0, 10));
  if (!b) return { pnu: null, reason: 'UNMAPPED', changed: false };
  return { pnu: b + t.slice(10), reason: null, changed: b !== t.slice(0, 10) };
}

/* ---------- 주소 ---------- */

const SIDO_SHORT = { 서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
  경기: '경기도', 강원: '강원도', 충북: '충청북도', 충남: '충청남도', 전북: '전라북도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도' };
/* 지금 법정동코드에 이름이 없는 옛 시군구(HUG 지역 이름 등, 시도 이름은 normalize 뒤) → 지금 시군구. 쪼개진 곳은 상위 시(구를 모르면), 인천 서구는 OLD_SPLIT */
const OLD_SGG = {
  '충청남도 연기군': '36110',                 // 2012 세종시 출범
  '경상남도 마산시': '48120', '경상남도 진해시': '48129',   // 2010 창원 통합(진해는 진해구 하나)
  '충청북도 청원군': '43110',                 // 2014 청주 통합(구를 모른다)
  '제주특별자치도 남제주': '50130', '제주특별자치도 남제주군': '50130', '제주특별자치도 북제주': '50110', '제주특별자치도 북제주군': '50110',
  '경기도 고양시 일산구': '41280',            // 2005 일산동구·일산서구로 나뉨
  '인천광역시 동구': '28125',                 // 2026-07 제물포구에 들어감
};
/* 둘로 나뉜 옛 구: 글자 안의 동 이름(또는 구 이름 줄기)으로만 고른다 */
const OLD_SPLIT = { '인천광역시 서구': ['28290', '28275'], '인천광역시 중구': ['28125', '28155'] };   // 2026-07 검단구·서해구, 제물포구·영종구

/* 도로명 주소인가: 괄호 앞에 '…로·…길 건물번호'가 있다(tools/ledger/road-jibun.js isRoad 와 같은 판정 — 매핑 파일의 주소와 같은 것을 고르려고) */
const isRoad = (a) => /(로|길)\s*\d+(-\d+)?(번지)?(\s|,|$)/.test(String(a).replace(/\s*\(.*$/, '').trim() + ' ');

const LOT_TOKEN = /^(\d+)(?:-(\d*))?$/;
/* 지번 주소 다듬기 → { main: '시도 시군구 … 동 본번[-부번]' 또는 번지가 없으면 지역 이름까지, lot: 번지가 있었나, parens: 괄호 안 글자들 }.
   괄호·'번지'·'일원'·'일대'·'외 N필지'를 떼고, 쉼표로 여러 필지면 첫 필지, '9블록'·'A-1BL'·'1로트'의 숫자는 번지가 아니다. 번지 뒤 글자(단지명 등)는 버린다 */
function tidyJibun(addr) {
  const s = String(addr ?? '').normalize('NFKC');
  const parens = [...s.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  const t = s.replace(/\([^()]*\)/g, ' ').replace(/[()]/g, ' ')
    .replace(/(\S)특례시(?=\s|$)/g, '$1시').replace(/(\S동)\s+(\d+가)(?=\s|$)/g, '$1$2')   // '화성특례시' → '화성시', '수성동 4가' → '수성동4가'
    .replace(/[A-Za-z]*\s?-?\d+(?:-\d+)?\s*(블록|블럭|BL|로트|LOT)(?![가-힣A-Za-z])/gi, ' ')
    .replace(/외\s*\d+\s*필지|외\s*\d+\s*筆|외\s*\d+$/g, ' ').replace(/번지|일원|일대/g, ' ')
    .split(/[,，]/)[0];
  const tok = t.split(/\s+/).filter(Boolean);
  for (let i = 1; i < tok.length; i++) {   // 첫 번지(앞에 지역 이름이 하나 이상 있을 때). '산' 은 따로 떨어져 있거나 붙어 있다
    const m = LOT_TOKEN.exec(tok[i].replace(/^산/, ''));
    if (!m) continue;
    const san = tok[i].startsWith('산') || tok[i - 1] === '산';
    const head = tok.slice(0, tok[i - 1] === '산' ? i - 1 : i);
    return { main: `${head.join(' ')} ${san ? '산 ' : ''}${m[1]}${m[2] ? `-${m[2]}` : ''}`, lot: true, parens };
  }
  return { main: tok.join(' '), lot: false, parens };
}

/* 시군구 코드 → 그 아래 일반구 행들(시 단위 코드에 구가 있을 때). idx = map-lh.js nameIndex(…), 결과는 idx 마다 한 번 만든다 */
const childCache = new WeakMap();
function childGus(idx, sgg) {
  if (!childCache.has(idx)) {
    const m = new Map();
    for (const r of idx.sggByCode.values()) {
      const city = [...idx.sggByCode.values()].find((c) => c !== r && r.area_name.startsWith(`${c.area_name} `) && c.area_code.slice(0, 4) === r.area_code.slice(0, 4));
      if (city) (m.get(city.area_code) || m.set(city.area_code, []).get(city.area_code)).push(r);
    }
    childCache.set(idx, m);
  }
  return childCache.get(idx).get(sgg) ?? [];
}

/* jibunToPnu + 일반구 신설 시(부천·화성 등, 주소에 구가 없다): 시 단위로만 맞고 법정동이 안 맞으면 시 이름 뒤에 구를 넣어 하나만 맞을 때 그 구 */
function jibunGu(addr, idx) {
  const r = jibunToPnu(addr, idx);
  if (r.pnu || r.error !== 'BJD') return r;
  const gus = childGus(idx, r.sgg);
  if (!gus.length) return r;
  const tok = addr.split(/\s+/), city = idx.sggByCode.get(r.sgg).area_name.split(' ').pop(), k = tok.indexOf(city);
  if (k < 0) return r;
  const hits = gus.map((g) => jibunToPnu([...tok.slice(0, k + 1), g.area_name.split(' ').pop(), ...tok.slice(k + 1)].join(' '), idx)).filter((x) => x.pnu);
  return hits.length === 1 ? hits[0] : r;
}

/* 지역 이름(번지 없음, '시도 시군구 [동]') → { sgg, bjd }. jibunGu 의 이름 규칙을 그대로 쓰려고 번지 자리에 1 을 붙인다 */
function areaOf(name, idx) {
  const t = String(name ?? '').trim();
  if (!t) return { sgg: null, bjd: null };
  const r = jibunGu(`${t} 1`, idx);
  return { sgg: r.sgg ?? null, bjd: r.bjd ?? null };
}

/* 지번 주소 → { sgg, bjd, pnu, via('JIBUN'|'PAREN'|null) }. 다듬은 주소가 안 되면 괄호 안 지번('(당수동 3001)')을 앞 주소의 시군구에 붙여 다시 */
function parcelPnu(addr, idx) {
  const { main, lot, parens } = tidyJibun(addr);
  const first = lot ? jibunGu(main, idx) : { error: 'LOT', ...areaOf(main, idx) };
  if (first.pnu) return { sgg: first.sgg, bjd: first.bjd, pnu: first.pnu, via: 'JIBUN' };
  const prefix = main.split(' ').filter((w, i) => i === 0 || /(시|군|구)$/.test(w));
  for (const p of parens) {   // 괄호가 온전한 주소면 그대로, 시군구부터 적혀 있으면('아산시 둔포면 …') 앞 주소의 그 앞까지만 붙인다
    const head = p.split(/\s+/)[0], cut = prefix.indexOf(head);
    for (const cand of [p, `${(cut < 0 ? prefix : prefix.slice(0, cut)).join(' ')} ${p}`]) {
      const q = tidyJibun(cand);
      if (!q.lot) continue;
      const r = jibunGu(q.main, idx);
      if (r.pnu) return { sgg: r.sgg, bjd: r.bjd, pnu: r.pnu, via: 'PAREN' };
    }
  }
  return { sgg: first.sgg ?? null, bjd: first.bjd ?? null, pnu: null, via: null };
}

/* 주소(지번 또는 도로명) → { kind('JIBUN'|'ROAD'), sgg, bjd, pnu, via('JIBUN'|'PAREN'|'ROAD_MAP'|null) }.
   도로명은 roadMap(원문 주소(trim) → 지번 주소, road-jibun.json 의 OK 행)이 있으면 그 지번으로 PNU, 없으면 PNU 없이
   도로명 앞부분(시도 시군구 [읍면])과 괄호의 첫 법정동('(부송동,…)')으로 시군구·법정동만 */
function locateAddress(addr, idx, roadMap = null) {
  const a = String(addr ?? '').trim();
  if (!a) return { kind: null, sgg: null, bjd: null, pnu: null, via: null };
  if (!isRoad(a)) return { kind: 'JIBUN', ...parcelPnu(a, idx) };
  const parcel = roadMap?.get(a) ?? roadMap?.get(a.replace(/\s+/g, ' '));
  if (parcel) { const r = parcelPnu(parcel, idx); if (r.pnu) return { kind: 'ROAD', ...r, via: 'ROAD_MAP' }; }
  const tok = a.normalize('NFKC').replace(/\s*\(.*$/, '').split(/\s+/);
  const ri = tok.findIndex((t) => /(로|길)$/.test(t) || /\d(번)?길$/.test(t) || /(로|길)\d/.test(t));
  const dong = /^\s*([^,\s]+(동|가|리|읍|면))\s*(,|$)/.exec(/\(([^()]*)\)/.exec(a)?.[1] ?? '')?.[1];
  const at = areaOf([...tok.slice(0, ri < 0 ? tok.length : ri), ...(dong ? [dong] : [])].join(' '), idx);
  return { kind: 'ROAD', sgg: at.sgg, bjd: at.bjd, pnu: null, via: null };
}

/* 동 이름 줄기(끝의 동·가·리 뗌, 두 글자 이상)가 text 에 있는 후보 시군구가 하나면 그 코드. 구 이름 줄기('검단')도 본다 */
function guByText(cands, text, idx, areaRows) {
  const t = String(text ?? '').normalize('NFKC').replace(/\s/g, '');
  const hit = new Set();
  for (const code of cands) {
    const sg = idx.sggByCode.get(code);
    if (!sg) continue;
    const stems = [sg.area_name.split(' ').pop().replace(/구$/, ''), ...areaRows.filter((r) => r.level === 'BJD' && r.parent_code === code).map((r) => r.area_name.split(' ').pop().replace(/\d*(동|가|리)$/, ''))];
    if (stems.some((s) => s.length >= 2 && t.includes(s))) hit.add(code);
  }
  return hit.size === 1 ? [...hit][0] : null;
}

/* '시도약칭 시군구 [구]'(HUG 지역 이름 '경기 고양시 일산구' 등) → 지금 시군구 코드 또는 null. text(사업명 등)는 둘로 나뉜 옛 구를 고를 때만 본다.
   일반구가 있는 시 이름만 있으면 시 단위 코드(동 이름이 없어 구를 못 고른다) */
function sggOfAreaName(name, idx, areaRows, text = '') {
  const t = String(name ?? '').trim().split(/\s+/);
  if (!t[0]) return null;
  const n = normalize([SIDO_SHORT[t[0]] ?? t[0], ...t.slice(1)].join(' '));
  if (n.method === 'RULE_SEJONG') return '36110';
  const full = n.tokens.join(' ');
  if (idx.sggByName.has(full)) return idx.sggByName.get(full).area_code;
  if (OLD_SGG[full]) return OLD_SGG[full];
  if (OLD_SPLIT[full]) return guByText(OLD_SPLIT[full], text, idx, areaRows);
  return null;
}

module.exports = { DATE_FLOOR, DATE_CEIL, parseDate, cleanDate, parseMonth, parseRange, cleanText, cleanParty, toCount, yn, parseCompetition, parseCsv, fold, repeatedTotal,
  pnuNow, SIDO_SHORT, OLD_SGG, isRoad, tidyJibun, jibunGu, areaOf, parcelPnu, locateAddress, guByText, sggOfAreaName };
