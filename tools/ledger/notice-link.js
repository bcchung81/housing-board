'use strict';
/* 공고 ↔ 사업 연결 규칙(2026-10-11 실측: 표본 68건 모두 맞음, docs/product/데이터-수집-계획.md). convert.js addNational 이 쓴다. 순수 함수 — 파일을 읽거나 쓰지 않는다.
   블록 코드 정규화는 hub-bulk.js normBlock, LH 지구 낱말은 districtToken 하나뿐이다(여기서 새로 짜지 않는다). 숫자만인 블록('1블록')은 normBlock 이 null 이라 '#1' 로 따로 쓴다.
   - T1_LH_DISTRICT_BLOCK(자동): 제목 조각(또는 LH 공급정보·마이홈 단지명)의 블록 = LH 준공예정 블록이고 그 LH 지구 낱말이 조각에 있다, 시도 일치
   - T2_NAME_DISTRICT_BLOCK(자동): 조각의 블록 = 사업 블록이고 조각의 지구 낱말 전체가 사업 이름·단지명·특수지명·LH 지구 이름에 있다(주소는 보지 않는다), 시도 일치
   - T3_NAME_SUBDISTRICT_BLOCK(검토 목록): T2 와 같되 지구 낱말에서 시군구·시도 줄임말('인천영종' → '영종')을 떼야 맞는다
   블록만 같거나 법정동·본번만 같은 것은 쓰지 않는다(실측 정밀도 0 근처). */
const { normBlock, districtToken } = require('./hub-bulk');

const RULE = { T1: 'T1_LH_DISTRICT_BLOCK', T2: 'T2_NAME_DISTRICT_BLOCK', T3: 'T3_NAME_SUBDISTRICT_BLOCK' };
const compact = (s) => String(s ?? '').replace(/\s/g, '').toUpperCase();
/* text 안에 tok 이 있고 바로 뒤가 숫자·한글 음절이 아니다('대장2' 가 '대장' 에, '구리갈매역세권' 이 '구리갈매' 에, '안양관양고' 가 '안양관양' 에 맞지 않게). 지구명에 원래 붙는 꼬리(TAIL)는 허용 */
const TAIL = /^(지구|공공주택|택지|신도시|도시개발|하늘도시|도시|공동주택|아파트|주택|단지|일원|블록|블럭|구역|정보타운|테크노밸리|행복|공공|국민|영구|통합|신혼|분양|임대|리츠|사업)/;
const hasTok = (text, tok) => { if (!tok) return false; let i = text.indexOf(tok); while (i >= 0) { const rest = text.slice(i + tok.length), c = rest[0] ?? ''; if (!/\d/.test(c) && (!/[가-힣]/.test(c) || TAIL.test(rest))) return true; i = text.indexOf(tok, i + 1); } return false; };

/* 글자에서 블록 코드들: 'A-24블록' 'A16, A17' 'A33·37·60' 세종식 '5-1L1BL' '6-3UR1', 숫자뿐인 '1블록' → '#1'. 기관 약자(LH 등)는 블록으로 보지 않는다 */
function blocksOf(text) {
  const out = new Set();
  let t = String(text ?? '').toUpperCase().replace(/LH|SH|GH|IH/g, ' ');
  t = t.replace(/(\d{1,2})-(\d{1,2})\s*([A-Z]{1,3})\s*(\d{1,2})(?!\d)/g, (m, a, b, c, d) => { out.add(normBlock(`${a}${b}${c}${d}`)); return ' '; });
  const re = /(?<![A-Z0-9])([A-Z]{1,2})\s?-?\s?(\d{1,3})(?:-(\d{1,2}))?(?!\d)((?:\s*(?:,|및|·|、|&)\s*(?:[A-Z]{1,2}\s?-?\s?)?\d{1,3}(?!\d))*)/g;
  let m;
  while ((m = re.exec(t))) {
    out.add(normBlock(`${m[1]}${m[2]}${m[3] ? `-${m[3]}` : ''}`));
    for (const c of m[4].matchAll(/([A-Z]{1,2})?\s?-?\s?(\d{1,3})/g)) out.add(normBlock(`${c[1] || m[1]}${c[2]}`));
  }
  for (const c of t.matchAll(/(?<![A-Z0-9\-.])(\d{1,2})\s*(?:블록|블럭|BL)/g)) out.add(`#${+c[1]}`);
  out.delete(null);
  return out;
}
const GENERIC = /^(지구|단지|일원|지역|공공주택지구|택지개발지구|신도시)$|신혼희망|행복주택|공공주택|공공분양|공공임대|국민임대|영구임대|통합공공임대|장기전세|분양전환|분양주택|임대주택|입주자|모집|공고/;
/* 조각의 지구 낱말: 첫 블록 코드 바로 앞 낱말(두 글자 이상). 없으면 null */
function titleDistrict(seg) {
  const m = /^(.*?)(?:\s*)(?:\d{1,2}-\d{1,2}\s*[A-Z]{1,3}\d|(?<![A-Za-z0-9])[A-Z]{1,2}\s?-?\s?\d|\d{1,2}\s*(?:블록|블럭|BL))/i.exec(String(seg).trim());
  if (!m) return null;
  const w = m[1].trim().split(/\s+/).map((x) => x.replace(/[,·]/g, '')).filter((x) => x && !GENERIC.test(x)).pop() ?? '';
  return w.length >= 2 ? w : null;
}
/* 제목을 괄호로 나눈 조각마다 { text, blks, dist }. 조각에 지구 낱말이 없으면 앞 조각의 끝 낱말('공주월송2단지(A2블록)') */
function pairsOf(title) {
  const segs = String(title ?? '').split(/[[\]()【】]/).map((x) => x.trim()).filter((x) => x && !/^(정정공고|취소공고|마감|무순위|세종|리츠)$/.test(x));
  const out = [];
  segs.forEach((seg, i) => {
    const blks = blocksOf(seg);
    if (!blks.size) return;
    const dist = titleDistrict(seg) ?? (i > 0 ? segs[i - 1].split(/\s+/).filter((x) => !GENERIC.test(x)).pop() : null);
    if (dist && dist.length >= 2) out.push({ text: seg, blks, dist });
  });
  return out;
}

/* 공고 종류: CANCEL 취소공고(잇지 않는다) · NON_SUPPLY 가정어린이집·오피스텔·상가 등 주택 공급이 아닌 것(잇되 SUPPLY_NOTICE 없음) ·
   FOLLOW_UP 잔여세대·추가·예비입주자·선착순·매각 등 최초 모집 뒤의 공고(잇기만) · INITIAL 최초 입주자모집(SUPPLY_NOTICE — 보드 ④모집) */
function noticeKind(title, type) {
  const s = String(title ?? '');
  if (/취소\s*공고|공고\s*취소/.test(s)) return 'CANCEL';
  if (type === '가정어린이집' || /어린이집|오피스텔|상가|운영예정자/.test(s)) return 'NON_SUPPLY';
  if (/잔여|추가|예비|선착순|매각|재공급|무순위|완화|해약|상시/.test(s)) return 'FOLLOW_UP';
  return /모집/.test(s) ? 'INITIAL' : 'FOLLOW_UP';
}
/* 정정·재공고 묶음 키: 앞머리 괄호([정정공고]·(재게시)·[신규모집] 등), 날짜 괄호('25.10.01. 공고), 회차, 빈칸을 지운 제목 */
const noticeGroup = (title) => String(title ?? '')
  .replace(/^(\s*[[(【][^\])】]*[\])】]\s*)+/, '')
  .replace(/[[(]\s*(공고일?\s*:?\s*)?['‘’]?\d{2,4}[.\-년]\s*\d{1,2}[.\-월]\s*\d{1,2}[.일]?\s*(공고)?\.?\s*[\])]/g, '')
  .replace(/[([]\d+회?차[)\]]|\d+회차/g, '')
  .replace(/\s/g, '');

/* 공고의 시도: 이름 → { code, any }. '전국' 이나 'X 외' 는 다른 시도도 받는다(any). 모르는 이름은 code null(거르지 않는다) */
function sidoIndex(areaRows) {
  const code = new Map(areaRows.filter((a) => a.level === 'SIDO').map((a) => [a.area_name, a.area_code]));
  for (const [n, c] of [['세종특별자치시', '36'], ['전라남도', '12'], ['광주광역시', '12']]) code.set(n, c);   // 세종은 법정동 파일에 시도 행이 없고, 마이홈은 옛 시도 이름을 쓴다
  return (name) => { const s = String(name ?? ''); if (s === '전국') return { code: null, any: true }; return { code: code.get(s.replace(/\s*외$/, '')) ?? null, any: /외$/.test(s) }; };
}
const SIDO_SHORT = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
/* 지구 낱말 앞머리로 붙는 줄임말: 사업 시군구 이름의 낱말(시·군·구 뗀 두 글자 이상) + 시도 줄임말 */
const shortsOf = (sggName) => [...new Set(String(sggName ?? '').split(' ').slice(1).map((w) => w.replace(/(특별자치시|특별자치도|광역시|특별시|시|군|구)$/, '')).filter((s) => s.length >= 2)), ...SIDO_SHORT];

/* 사업 색인: 블록 → 사업들, 사업마다 대조 글자(이름·단지명·특수지명·LH 지구 이름, 주소 제외)와 LH 지구 낱말.
   hubRecords 는 건축HUB 대용량 기록(관리번호 → 이름·단지명·특수지명·블록) */
function projectIndex({ projects, identifiers, complexes, hubRecords = [] }, lhSource) {
  const recByPk = new Map(hubRecords.map((r) => [r.pk, r]));
  const P = new Map(projects.map((p) => [p.local_project_id, { p, blocks: new Set(), texts: [], tokens: [] }]));
  for (const r of identifiers) {
    const x = P.get(r.local_project_id);
    if (!x) continue;
    if (r.id_type === 'AREA_BLOCK') {
      const [d, b] = r.id_value.split('|');
      const nb = normBlock(b);
      if (nb) x.blocks.add(nb); else if (/^\d+$/.test(b) && +b > 0) x.blocks.add(`#${+b}`);
      for (const k of blocksOf(d)) x.blocks.add(k);
      x.texts.push(d);
      const tok = districtToken(d);
      if (tok) x.tokens.push(compact(tok));
    } else if (r.id_type === 'HUB_HS_PK') {
      const rec = recByPk.get(r.id_value);
      if (!rec) continue;
      const nb = normBlock(rec.block);
      if (nb) x.blocks.add(nb);
      for (const k of blocksOf(`${rec.name} ${rec.complex ?? ''}`)) x.blocks.add(k);
      x.texts.push(rec.name, rec.complex ?? '', rec.special);
    }
  }
  for (const c of complexes) {
    const x = P.get(c.local_project_id);
    if (!x) continue;
    x.texts.push(c.complex_name, c.complex_label);
    for (const k of blocksOf(`${c.complex_name} ${c.complex_label}`)) x.blocks.add(k);
  }
  const byBlock = new Map();
  for (const x of P.values()) {
    x.texts.push(x.p.project_name ?? '');
    if (x.p.source_ref !== lhSource) for (const k of blocksOf(x.p.project_name)) x.blocks.add(k);   // LH 후보 이름은 '지구 블록' 이라 식별자로 이미 넣었다
    x.text = x.texts.map(compact).join('|');   // 글자 사이를 '|' 로 이어 앞 글자의 끝과 뒤 글자의 첫머리가 한 낱말로 붙지 않게 한다
    x.lh = x.p.source_ref === lhSource;
    for (const b of x.blocks) (byBlock.get(b) || byBlock.set(b, []).get(b)).push(x);
  }
  return { byBlock };
}

/* 공고 하나의 제목 대조. texts = [제목, LH 공급정보 단지명…, 마이홈 단지명…], sido = sidoIndex 결과, sggName(시군구 코드 → 이름).
   사업마다 처음 맞은 것 하나: [{ pid, rule, block, text, dist, token?, short?, others }], others = 같은 공고·같은 블록에 맞은 다른 사업 */
function matchTitle({ texts, sido }, { byBlock }, sggName) {
  const hits = new Map();
  for (const { text, blks, dist } of texts.flatMap(pairsOf)) {
    const D = compact(dist), T = compact(text);
    for (const block of blks) for (const x of byBlock.get(block) ?? []) {
      if (!sido.any && sido.code && sido.code !== x.p.sgg_code.slice(0, 2)) continue;
      let hit = null;
      if (x.lh) { const token = x.tokens.find((t) => hasTok(T, t)); if (token) hit = { rule: RULE.T1, token }; }
      if (!hit && hasTok(x.text, D)) hit = { rule: RULE.T2 };
      if (!hit) for (const s of shortsOf(sggName(x.p.sgg_code))) if (D.startsWith(s) && D.length - s.length >= 2 && hasTok(x.text, D.slice(s.length))) { hit = { rule: RULE.T3, short: s }; break; }
      if (hit && !hits.has(x.p.local_project_id)) hits.set(x.p.local_project_id, { pid: x.p.local_project_id, block, text, dist, ...hit });
    }
  }
  const out = [...hits.values()];
  for (const h of out) h.others = out.filter((o) => o.block === h.block && o.pid !== h.pid).map((o) => o.pid);
  return out;
}

/* 대조 근거 글자(evidence): 규칙 이름 + 대조한 글자 */
function titleEvidence(h, projectName) {
  const blk = h.block.replace('#', '');
  const why = h.rule === RULE.T1 ? `LH 지구 낱말 '${h.token}' 이 제목에 있음`
    : h.rule === RULE.T2 ? `지구 낱말 '${h.dist}' 이 사업 이름·단지명에 있음`
      : `지구 낱말 '${h.dist}' 에서 '${h.short}' 를 떼면 사업 이름·단지명에 있음`;
  return `${h.rule}: "${h.text}" 블록 ${blk} · ${why} = 사업 ${projectName ?? '(이름 없음)'}${h.others.length ? ` · 같은 블록 다른 사업 ${h.others.join(',')}(중복 의심)` : ''}`;
}

module.exports = { RULE, blocksOf, titleDistrict, pairsOf, noticeKind, noticeGroup, sidoIndex, shortsOf, projectIndex, matchTitle, titleEvidence, hasTok, compact };
