"""외부 입력 HOME 덤프: 읽기, 정책 사업 고르기, 원장 사업 id 로 합치기, 프로그램 원문 대조표·정책 지명 연결.

사업 id 규칙은 tools/ledger/home-source.js 와 같다: mappings/home-ids.json 의 키 HPR:·PRO:·LH:·BLK: 중 하나라도 맞으면
같은 PRJ id(키 순위 HPR > PRO > LH > BLK). BLK 키는 시군구 코드를 정해야 해서(home-source.js 의 시군구 해석) 여기서는 쓰지 않는다.
못 바꾼 레코드는 HOME:<PRO id>.
"""

import glob
import gzip
import json
import os
import re
from collections import defaultdict

from common import p, collect_actors, read_csv_dicts, nz, norm_block, norm_district, split_district


def load_dump_table(dump_dir, name):
    with gzip.open(p(dump_dir + '/' + name + '.jsonl.gz'), 'rt', encoding='utf-8') as f:
        return [json.loads(line) for line in f]


def load_home(cfg):
    """HOME 덤프 판 → ({표: 행 목록}, manifest). 판 안의 모든 표에서 actor(담당자 이름)를 모은다(출력에서 지우려고)."""
    h = cfg['home']
    d = h['dump_dir']
    for name in sorted(os.listdir(p(d))):
        if name.endswith('.jsonl.gz'):
            for r in load_dump_table(d, name[:-9]):
                collect_actors(r)
    D = {n: load_dump_table(d, n) for n in h['tables']}
    with open(p(d + '/manifest.json'), encoding='utf-8') as f:
        manifest = json.load(f)
    return D, manifest


def policy_project_ids(D, policy_field, home_policy_id):
    return sorted(r['entity_id'] for r in D['project'] if (r.get('payload') or {}).get(policy_field) == home_policy_id)


def project_subject_ids(D, pids, id_map, key_order, unmapped_prefix):
    """HOME 사업 레코드(PRO id) → (원장 사업 id, 쓴 키 종류). HPR 은 SOURCE_ANCHOR 별칭(PRO → HPR),
    LH 는 같은 HPR 의 REGION_DISTRICT_BLOCK 별칭(lh_completion_plan id)."""
    anchor, lh = {}, defaultdict(list)
    for a in D['home_identity_alias']:
        if a.get('match_rule') == 'SOURCE_ANCHOR':
            anchor[a['source_entity_id']] = a['project_id']
        elif a.get('match_rule') == 'REGION_DISTRICT_BLOCK':
            lh[a['project_id']].append(a['source_entity_id'])
    out = {}
    for pid in pids:
        hpr = anchor.get(pid)
        cands = {'HPR': ['HPR:' + hpr] if hpr else [], 'PRO': ['PRO:' + pid],
                 'LH': ['LH:' + x for x in sorted(lh.get(hpr, []))] if hpr else []}
        got = None
        for kind in key_order:
            hits = sorted({id_map[k] for k in cands.get(kind, []) if k in id_map})
            if hits:
                got = (hits[0], kind)
                break
        out[pid] = got or (unmapped_prefix + pid, '')
    return out


# ---------------------------------------------------------------- 프로그램 원문 대조표

def program_checks(cfg, policy):
    """01.정책/프로그램_원문대조_*.csv 중 이 정책 것 → {프로그램 이름: {...}}.
    파일 이름 꼬리(_ 로 나눈 토큰)에 정책 slug 가 있어야 하고, 정책 칸이 있는 파일은 그 칸에 정책 발표일이 든 행만 쓴다."""
    pc = cfg['program_checks']
    out = {}
    for path in sorted(glob.glob(p(pc['glob']))):
        rel = os.path.relpath(path, p(''))
        stem = os.path.splitext(os.path.basename(path))[0]
        tokens = stem[len(pc['prefix']):].split('_') if stem.startswith(pc['prefix']) else []
        if policy['slug'] not in tokens:
            continue
        rows = read_csv_dicts(rel)
        if not rows:
            continue
        cols = rows[0].keys()

        def col(names):
            return next((c for c in names if c in cols), None)

        c_pol, c_prog, c_v = col(pc['policy_cols']), col(pc['program_cols']), col(pc['verdict_cols'])
        c_page, c_loc, c_doc, c_quote = col(pc['page_cols']), col(pc['locator_cols']), col(pc['doc_cols']), col(pc['quote_cols'])
        for r in rows:
            if c_pol and policy['announced'] not in (r.get(c_pol) or ''):
                continue
            raw = r.get(c_v) or ''
            verdict = next((v for pre, v in pc['verdict_prefix'] if raw.startswith(pre)), 'UNVERIFIED')
            doc = r.get(c_doc) if c_doc else ''
            out.setdefault(r[c_prog], dict(
                raw=raw, page=(r.get(c_page) or '') if c_page else '', verdict=verdict,
                locator=(r.get(c_loc) or '') if c_loc else '', quote=(r.get(c_quote) or '') if c_quote else '',
                doc_path=(pc['doc_base'] + '/' + doc) if doc else '', check_file=rel))
    return out


# ---------------------------------------------------------------- 정책 원문 지명 연결

def load_policy_sites(path):
    """_work/<policy_id>/policy_sites.jsonl(설계 6.1) → 행 목록. 파일이 없으면 None."""
    if not os.path.exists(p(path)):
        return None
    with open(p(path), encoding='utf-8') as f:
        return [json.loads(line) for line in f if line.strip()]


def _sido_ok(site_sido, region):
    if not site_sido or not region:
        return True
    a, b = re.sub(r'\s', '', site_sido), re.sub(r'\s', '', region)
    return a.startswith(b[:2]) and b.startswith(a[:2])


_LEX = {}


def region_lexicon(path):
    """법정동코드 파일(존재·폐지 모두) → {줄기: {(수준, 코드 앞자리)}}. 수준 sido(코드 2자리)·sgg(5자리)·dong(5자리, 속한 시군구).
    줄기는 끝의 특별시·광역시·도·시·군·구·동·읍·면·리·가와 숫자(독산1동 → 독산)를 뗀 것."""
    if path in _LEX:
        return _LEX[path]
    lex = {}
    with open(p(path), 'rb') as f:
        rows = f.read().decode('cp949').splitlines()[1:]
    for line in rows:
        parts = line.split(',')
        if len(parts) < 2:
            continue
        code, names = parts[0], parts[1].split()
        for k, nm in enumerate(names):
            level = 'sido' if k == 0 else ('sgg' if k == 1 or (k == 2 and re.search(r'구$', nm) and code[5:8] == '000') else 'dong')
            pref = code[:2] if level == 'sido' else code[:5]
            for w in {nm, _stem(nm)}:
                if len(w) >= 2:
                    lex.setdefault(w, set()).add((level, pref))
    _LEX[path] = lex
    return lex


def _stem(w):
    w = re.sub(r'(특별자치시|특별자치도|특별시|광역시)$', '', w)
    w = re.sub(r'\d*(도|시|군|구|동|읍|면|리|가)$', '', w)
    return re.sub(r'\d+$', '', w)


def _codes(lex, w):
    return lex.get(w) or lex.get(_stem(w)) or set()


def _compatible(entries, P):
    return any(c.startswith(q) or q.startswith(c) for _, c in entries for q in P)


def place_core(name, rules, lex, P, strip_region=True):
    """지명 비교용 핵심 이름 → (핵심, 뗀 지역 낱말 [(낱말, 수준들, 사업 지역과 맞음)]).
    공백 무시, PDF 깨짐·옛 표기('◯구'·'◯'·'舊'·'구.', 낱말 '구') 제거, 앞의 지역 낱말(법정동 이름) 제거,
    붙여 쓴 앞 시도·시군구 줄기는 사업 지역과 맞을 때만 제거(광명청소년복지관 → 청소년복지관, 동 이름은 떼지 않음), 끝 꼬리(부지·일원 등) 제거."""
    t = name or ''
    for m in rules.get('old_markers', ()):
        t = t.replace(m, ' ')
    toks = [x for x in re.split(r'\s+', t) if x and x not in rules.get('old_words', ())]
    removed = []
    while strip_region and len(toks) > 1:
        x = re.sub(r'[()]', '', toks[0])
        ent = _codes(lex, x) if not re.search(r'\d', x) else set()
        if not ent:
            break
        removed.append((_stem(x) or x, {lv for lv, _ in ent}, _compatible(ent, P)))
        toks = toks[1:]
    core = nz(''.join(toks))
    for n in range(min(len(core) - 3, 6) if strip_region else 0, 1, -1):
        ent = {e for e in lex.get(core[:n], set()) if e[0] != 'dong'}  # 붙여 쓴 동 이름(하계5단지)은 떼지 않는다
        if ent and _compatible(ent, P):
            removed.append((core[:n], {lv for lv, _ in ent}, True))
            core = core[n:]
            break
    changed = True
    while changed:
        changed = False
        for suf in list(rules.get('tails', ())) + list(rules.get('strip', ())):
            if core.endswith(suf) and len(core) > len(suf):
                core, changed = core[:-len(suf)], True
    return core, removed


def project_region_codes(pl, lex):
    """사업 지역 코드 앞자리 집합: 시군구 이름이 법정동 시군구로 풀리면 그 코드(5자리)만, 아니면 시도 코드."""
    def codes(v, level):
        out = set()
        for w in re.split(r'\s+', re.sub(r'[()]', ' ', v or '')):
            if len(w) >= 2:
                out |= {c for lv, c in _codes(lex, w) if lv == level}
        return out
    sido = codes(pl.get('region'), 'sido')
    sgg = {c for c in codes(pl.get('municipality'), 'sgg') if not sido or c[:2] in sido}
    return sgg or sido


def _name_rule(pcore, preg, score, sreg, rules, lex, P, s, pl):
    """핵심 이름 한 쌍 → 연결 방법 또는 None."""
    if not score or not pcore or not all(ok for _, _, ok in sreg):
        return None  # 지명 앞 지역 낱말이 사업 지역과 다르면(부천 ↔ 수원) 잇지 않는다
    pd = {w for w, lv, _ in preg if lv == {'dong'}}
    sd_ = {w for w, lv, _ in sreg if lv == {'dong'}}
    if pd and sd_ and not pd & sd_:
        return None  # 양쪽 동 이름이 다르면(쌍문동 ↔ 창동) 잇지 않는다
    if score == pcore:
        return '이름(정규화)'
    if (score in pcore or pcore in score) and min(len(score), len(pcore)) >= rules.get('min_contain', 4):
        longer, shorter = (score, pcore) if len(score) > len(pcore) else (pcore, score)
        rest = longer.replace(shorter, '', 1)
        if any(rest.endswith(q) for q in rules.get('distinct_tails', ())):
            return None  # 남는 부분이 위치 구분(북측·남측 등)이면 다른 사업(효창공원앞역 ↔ 효창공원앞역 북측)
        ent = lex.get(rest, set()) or lex.get(_stem(rest), set())
        if ent and not _compatible(ent, P):
            return None  # 남는 앞부분이 다른 지역 이름(수원우편집중국 ↔ 우편집중국 @부천)
        return '이름(포함·지역 일치)'
    if score.startswith(pcore) and score[len(pcore):].isdigit() and s.get('units') and \
            s.get('units') == pl.get('planned_units'):
        return '이름 앞부분+호수'
    return None


def site_matches(pl, sites, rules=None):
    """사업 레코드(payload)와 원문 지명이 같은 곳인지 → [(지명 행, 연결 방법)].
    - 지구+블록: 정규화 지구가 같고 정규화 블록이 같다.
    - 지구: 지명에 블록이 없고 정규화 지구가 같다(지구 단위 언급).
    - 이름: 사업에 지구가 없으면, 지명 이름(공백·괄호 무시)이 사업 이름과 같다.
    - 이름(정규화): rules(config keys.site_name_rules)로 옛 표기·깨진 글자·꼬리·앞 지역 낱말을 뗀 핵심 이름이 같다.
    - 이름(포함): 핵심 이름 한쪽이 다른 쪽을 포함(짧은 쪽 rules.min_contain 자 이상)하고, 양쪽 모두 지역 낱말을 뗐다면 하나 이상 같다.
    - 이름+호수: 지명이 핵심 이름 뒤에 숫자만 붙은 것(가양 → 가양7)이고 지명 호수 = 사업 계획 호수.
    지구 없는 사업의 이름 규칙에는 합계·비지명(site_kind 가 rules.skip_kinds) 행을 쓰지 않는다.
    시도가 둘 다 있으면 앞 두 글자가 같아야 한다. 근거 없는 유사도 매칭은 하지 않는다."""
    rules = rules or {}
    out = []
    nd, nb = norm_district(pl.get('district')), norm_block(pl.get('block'))
    pbase, _ = split_district(pl.get('district'))
    lex = region_lexicon(rules['region_lexicon']) if rules.get('region_lexicon') else {}
    P = project_region_codes(pl, lex)
    pvars = [place_core(pl.get('name'), rules, lex, P, x) for x in (True, False)] if rules else []
    for s in sites:
        if not _sido_ok(s.get('sido'), pl.get('region')):
            continue
        sd = norm_district(s.get('district'))
        sb = norm_block(s.get('block'))
        if nd and sd and sd == nd:
            if sb and nb and sb == nb:
                out.append((s, '지구+블록'))
            elif not sb:
                out.append((s, '지구'))
        elif not pbase and s.get('site_name'):
            sn, pn = nz(s['site_name']), nz(pl.get('name'))
            if sn == pn:
                out.append((s, '이름'))
                continue
            if not rules or s.get('site_kind') in rules.get('skip_kinds', ()):
                continue
            svars = [place_core(s['site_name'], rules, lex, P, x) for x in (True, False)]
            how = None
            for pcore, _ in pvars:  # 지역 낱말을 뗀 것·안 뗀 것 모두 비교하되 지역 판정은 늘 뗀 쪽 낱말로
                for score, _ in svars:
                    how = how or _name_rule(pcore, pvars[0][1], score, svars[0][1], rules, lex, P, s, pl)
            if how:
                out.append((s, how))
    return out
