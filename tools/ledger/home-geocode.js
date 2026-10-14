'use strict';
/* 수도권 사업 위치 보강(근사): 지도에 그릴 위치가 시군구 대표점뿐이거나 없는 HOME 사업을, 같은 시군구 안에서 사업 이름(역·부지·시설 이름)이나
   이름에 적힌 지번으로 V-World 검색 API 에서 찾아 '단 하나의 강한 일치'만 근사 위치로 채택한다. 원장 표는 바꾸지 않는다.
   - 대상: data/board/home-map/<시군구>.json 의 사업 중 loc 이 없거나 시군구 대표점(area)·이름 검색(name)인 것. 번들 단지와 이어진 사업(bundles)은 번들이 그리므로 뺀다.
   - 검색어(queriesOf): 이름 끝이 '…동 123-4' 꼴이면 지번 검색(type=address, category=parcel, '<시군구 이름> …동 123-4').
     아니면 장소 검색(type=place): 舊·'구 '·괄호를 떼고 방향·범위 꾸밈말(북측·인근·일원·부지 등)을 뺀 이름, 그다음 마지막 낱말, 괄호 안 이름 순.
     장소 검색어는 시설 종류로 끝나야 한다(역·우체국·세무서·공원·터미널 등 PLACE_SUFFIX) — '서리풀'처럼 가게 이름과 겹치는 낱말은 찾지 않는다.
   - 강한 일치(decide): 장소는 제목(괄호·공백 뗌)이 검색어와 같고, 지번은 지번 주소 끝이 검색어의 '…동 번지'와 같으며, 둘 다 좌표가 그 시군구 경계(V-World) 안.
     강한 일치들이 첫 것에서 CLUSTER_M 안에 모이면 한 곳(같은 역의 출구·승강장 등)으로 보고 첫 것의 좌표를 채택(ADOPTED), 아니면 보류(HELD).
     검색어를 차례로 보며 강한 일치가 하나라도 나온 검색어에서 결정한다.
   - 결과: schemas/ledger-<달>/mappings/home-geocode.json(누적 — 같은 사업·같은 이름의 행은 다시 부르지 않는다, 사업 id 순, 한 행 한 줄).
     tools/ledger/home-map.js 가 읽어 위치 종류 name(NAME_SEARCH, 근사)을 더한다(시군구 대표점보다 앞, 지구 대표점보다 뒤).
   - 원 응답: .cache/home-map/search/ (gitignore, home-vworld.js). 캐시가 있으면 부르지 않는다.
   실행: node tools/ledger/home-geocode.js [--month YYYY-MM] [--max-calls N] [--redo]   (--redo: 매핑 행을 무시하고 캐시·API 로 다시 판정)
   시험: tests/js/home-lite.test.cjs */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./paths');
const V = require('./home-vworld');

const CLUSTER_M = 300;
const PARCEL_CLUSTER_M = 60;
const OUT_NAME = 'mappings/home-geocode.json';
const MODIFIER = /^((북|남|동|서)(측|쪽)(부지)?|인근|일원|일대|주변|앞|부지|유휴부지|이전부지|복합개발)$/;
const PLACE_SUFFIX = /(역|우체국|우편집중국|세무서|세관|경찰서|청사|구청|시청|주민센터|센터|공원|터미널|야구장|운동장|테니스장|체육관|학교|의료원|정보원|개발원|복지관|노동청|지청|사무소|도서관|기마대|정보대|터널|사거리|유수지|업무지구|타운|캠프킴)$/;
const SCHOOL = [[/초$/, '초등학교'], [/중$/, '중학교'], [/고$/, '고등학교']];
const FALLBACK_MIN = 3;   // 마지막 낱말만으로 찾을 때 시설 종류 앞에 남는 글자 수 하한('주민센터'·'우체국'·'수원사무소' 같은 흔한 이름은 찾지 않는다)
const norm = (s) => String(s ?? '').replace(/\([^)]*\)/g, '').replace(/[\s·.,]/g, '');
const byStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* 사업 이름 → [{ kind:'parcel'|'place', q, key? }] (순서대로 시도) */
function queriesOf(name, sggName) {
  const raw = String(name ?? '').replace(/\s+/g, ' ').trim();
  const out = [];
  const addr = /(?:^|\s)([가-힣]+[0-9]*(?:동|리|가)[0-9]*)\s+(산\s?)?(\d+(?:-\d+)?)$/.exec(raw);
  if (addr && /[동리가]\d*$/.test(addr[1])) {
    const key = `${addr[1]} ${addr[2] ? '산' : ''}${addr[3]}`;
    out.push({ kind: 'parcel', q: `${sggName} ${key}`, key });
    return out;
  }
  const clean = (t) => t.replace(/舊/g, ' ').replace(/^구\s+/, '').replace(/\s+/g, ' ').trim().split(' ').filter((w) => w && !MODIFIER.test(w))
    .map((w, i, a) => (i === a.length - 1 ? SCHOOL.reduce((x, [re, to]) => (x.length >= 3 && re.test(x) ? x.replace(re, to) : x), w) : w));
  const toks = clean(raw.replace(/\([^)]*\)/g, ' '));
  const last = toks.length > 1 ? toks[toks.length - 1] : '';
  const rest = (q) => norm(q).length - (norm(q).match(PLACE_SUFFIX) || [''])[0].length;
  const cands = [[toks.join(' '), 0], [last, FALLBACK_MIN], ...[...raw.matchAll(/\(([^)]*)\)/g)].map((m) => [clean(m[1]).join(' '), 0])];
  for (const [q, min] of cands) if (q && norm(q).length >= 3 && PLACE_SUFFIX.test(norm(q)) && rest(q) >= min && !out.some((x) => x.q === q)) out.push({ kind: 'place', q });
  return out;
}

/* 검색 응답 항목들 → 판정. items: [{ title, category, parcel, point:[x,y] }], inside(pt) → 시군구 안인가 */
function decide(query, items, inside) {
  const strong = items.filter((it) => (query.kind === 'place' ? norm(it.title) === norm(query.q) : norm(it.parcel).endsWith(norm(query.key))) && it.point.every(Number.isFinite));
  const within = strong.filter((it) => inside(it.point));
  if (!strong.length) return { strong: 0, status: 'HELD', reason: 'none' };
  if (!within.length) return { strong: 0, status: 'HELD', reason: 'outside' };
  const far = within.filter((it) => V.distM(within[0].point, it.point) > (query.kind === 'place' ? CLUSTER_M : PARCEL_CLUSTER_M));
  if (far.length) return { strong: within.length, status: 'HELD', reason: 'spread' };
  /* 한 곳으로 모인 일치 중 대표: 제목에 괄호 설명이 없고(정류장·출구 이름이 아닌 시설 자체) 도로시설(정류장·출입구)이 아닌 것 → 응답 순서 */
  const rank = (it) => (/\(/.test(it.title) ? 2 : 0) + (/^도로시설/.test(it.category) ? 1 : 0);
  const first = within.map((it, i) => [it, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])[0][0];
  return { strong: within.length, status: 'ADOPTED', reason: 'single', at: [Math.round(first.point[0] * 1e6) / 1e6, Math.round(first.point[1] * 1e6) / 1e6], match: query.kind === 'place' ? first.title : first.parcel, category: first.category || '' };
}

/* V-World 검색(캐시) → 항목 목록 */
async function searchItems(client, query, bbox) {
  const params = query.kind === 'place' ? { type: 'place', query: query.q, size: '100', page: '1', bbox: bbox.map((v) => v.toFixed(4)).join(',') } : { type: 'address', category: 'parcel', query: query.q, size: '30', page: '1' };
  const name = V.hashName(JSON.stringify(params));
  let items = V.cacheGet('search', name);
  if (!items) {
    const res = await client.search(params);
    items = res.status === 'NOT_FOUND' ? [] : (((res.result || {}).items) || []).map((it) => ({
      title: String(it.title ?? '').trim(), category: String(it.category ?? '').trim(),
      parcel: String((it.address && it.address.parcel) ?? '').trim(), road: String((it.address && it.address.road) ?? '').trim(),
      point: [Number(it.point && it.point.x), Number(it.point && it.point.y)],
    }));
    V.cachePut('search', name, items);
  }
  return items;
}

const targetsOf = (docs) => docs.flatMap((d) => d.projects.filter((r) => (!r.loc || r.loc.by === 'area' || r.loc.by === 'name') && !(r.bundles || []).length).map((r) => ({ id: r.id, sgg: d.sgg, name: String(r.name ?? '') })));

function renderGeocode(rows) {
  const head = { schema: 'home-geocode/1', method: '사업 이름(또는 이름 끝 지번)으로 V-World 검색(장소·지번)을 불러, 같은 시군구 경계 안의 강한 일치(장소: 제목=검색어, 지번: 지번 주소 끝=검색어)가 한 곳(장소 300 m·지번 60 m 안)일 때만 채택. 근사 위치이며 확인 필요(REVIEW)' };
  const sorted = [...rows].sort((a, b) => byStr(a.id, b.id));
  return `{\n${Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n  "rows": [\n${sorted.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
}

/* 매핑 파일 → Map(id → 채택 행) (home-map.js 가 쓴다). 파일이 없으면 빈 표 */
function adoptedOf(file) {
  if (!fs.existsSync(file)) return new Map();
  return new Map(JSON.parse(fs.readFileSync(file, 'utf8')).rows.filter((r) => r.status === 'ADOPTED' && Array.isArray(r.at)).map((r) => [r.id, r]));
}

module.exports = { CLUSTER_M, OUT_NAME, queriesOf, decide, targetsOf, renderGeocode, adoptedOf, norm };

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
  const month = arg('month', P.latestMonth()), dir = P.ledgerDir(month), out = path.join(dir, OUT_NAME), redo = process.argv.includes('--redo');
  const areas = JSON.parse(fs.readFileSync(path.join(dir, 'tables/areas.json'), 'utf8')).rows;
  const sggName = new Map(areas.filter((a) => a.level === 'SGG').map((a) => [a.area_code, a.area_name]));
  const mapDir = path.join(P.ROOT, 'data/board/home-map');
  const docs = fs.readdirSync(mapDir).filter((f) => /^\d{5}\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(mapDir, f), 'utf8')));
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')).rows : [];
  const keep = new Map(prev.map((r) => [r.id, r]));
  const client = V.createClient({ maxCalls: Number(arg('max-calls', 1500)), log: console.log });
  const targets = targetsOf(docs);
  const today = new Date().toISOString().slice(0, 10);
  let reused = 0;
  for (const t of targets) {
    const old = keep.get(t.id);
    if (old && old.name === t.name && !redo) { reused++; continue; }
    const qs = queriesOf(t.name, sggName.get(t.sgg) || '');
    const row = { id: t.id, sgg: t.sgg, name: t.name, queries: qs.map((x) => x.q), query: null, kind: null, candidates: 0, strong: 0, status: 'HELD', reason: qs.length ? 'none' : 'no-query', checkedAt: old && old.checkedAt && redo ? old.checkedAt : today };
    if (qs.length) {
      const b = await V.sggBoundary(client, t.sgg);
      if (!b.geometry) { row.reason = 'no-boundary'; keep.set(t.id, row); continue; }
      const bb = V.bboxOf(b.geometry), inside = (pt) => V.pointInGeometry(b.geometry, pt);
      for (const q of qs) {
        let items;
        try { items = await searchItems(client, q, bb); } catch (e) { row.reason = 'error'; row.error = e.message; break; }
        const d = decide(q, items, inside);
        row.query = q.q; row.kind = q.kind; row.candidates = items.length;
        Object.assign(row, d);
        if (d.reason !== 'none') break;
      }
    }
    keep.set(t.id, row);
  }
  const rows = [...keep.values()];
  fs.writeFileSync(out, renderGeocode(rows));
  const cur = rows.filter((r) => targets.some((t) => t.id === r.id));
  const by = (f) => cur.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  console.log(`${path.relative(P.ROOT, out)}: 대상 ${targets.length}건(다시 쓴 행 ${reused}) · V-World 호출 ${client.stats.calls}(재시도 ${client.stats.retries}, 실패 ${client.stats.errors})`);
  console.log('판정:', JSON.stringify(by((r) => `${r.status}/${r.reason}`)), '시도별 채택:', JSON.stringify(by((r) => `${r.sgg.slice(0, 2)}:${r.status}`)));
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
