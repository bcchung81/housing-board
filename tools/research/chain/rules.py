"""프로그램 조건 규칙(P3, basis RULE): 원문의 프로그램 정의·조건을 사업 속성 원천으로 대조해 프로그램 → 사업 연결을 판정한다.

실행  python3 -I tools/research/chain/rules.py --policy <policy_id|slug>   (그 정책의 evidence_rule.jsonl)
      python3 -I tools/research/chain/rules.py --all                     (모든 정책 + 사람용 요약 md)

입력
- config/program_rules.json: 프로그램마다 조건식(속성·연산·value_text·쪽·quote). 정책 고유 값은 여기에만 둔다.
- config/policies.json, config/stage_sources.json(checked_at, HOME 덤프, 작업 폴더).
- 연결 모집단: _work/<policy_id>/evidence.jsonl 의 links 항목(엔진이 만든 HOME·지명 연결) + 원장 links.json 의 PROGRAM_PROJECT
  (그 정책에 POLICY_PROGRAM 으로 걸린 프로그램). 둘 다 읽기만 한다.
- 사업 속성 원천: 원장 projects(sgg_code·agency_id)·events(CONSTRUCTION_START·SUPPLY_NOTICE)·units(housing_type),
  HOME 덤프 project(payload.district·tenure·developer), V-World LH 택지·사업지구 경계 이름.

원문 문자열 게이트: quote 는 그 쪽 원문 텍스트에, value_text 는 quote 에 그대로 있어야 한다(공백 무시). 어기면 설정 오류로 멈춘다.

판정(연결마다 한 행)
- 규칙 묶음(rule_set) 하나의 조건이 모두 충족 → MATCH
- 모든 묶음에서 조건 하나 이상 위배 → MISMATCH(어느 조건이 어떤 원천 값으로 위배인지 notes)
- 그 밖(속성 원천이 없어 검사 못한 조건이 남음) → UNVERIFIED(이유)
- 프로그램이 원문에 없음(evidence.jsonl 의 NOT_IN_SOURCE)·조건 미상(설정 status UNKNOWN 또는 설정 없음)은 행을 만들지 않고 요약에만 적는다.

출력  _work/<policy_id>/evidence_rule.jsonl(설계 6.1 형식), 01.정책/프로그램조건_대조.md(--all).
"""

import argparse
import datetime as dt
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import p, load_config, write_jsonl, write_text, split_district  # noqa: E402
from home import region_lexicon, _stem  # noqa: E402

try:
    import pypdf
except ModuleNotFoundError:  # python3 -I 는 사용자 site-packages 를 경로에서 뺀다
    import site
    sys.path.append(site.getusersitepackages())
    import pypdf

RULES_FILE = 'program_rules.json'
SUMMARY_NAME = '프로그램조건_대조.md'
OUT_NAME = 'evidence_rule.jsonl'
COLS = ['policy_id', 'subject_table', 'subject_id', 'field', 'external_ref', 'stage_code', 'dataset_value',
        'external_value', 'doc_url', 'doc_path', 'locator', 'original_value', 'verdict', 'basis', 'search_scope',
        'checked_by', 'checked_at', 'notes']
LINK_TYPE = 'PROGRAM_PROJECT'
SAT, VIOL, UNK = 'SAT', 'VIOL', 'UNK'
STATE_KO = {SAT: '충족', VIOL: '위배', UNK: '검사 못함'}
GENERAL_DEV = '사업주체: 후보지 발표문 일반 문구(사업지별 표기 아님)'
QUOTES = str.maketrans({'‘': "'", '’': "'", '`': "'", '′': "'"})

# 속성 → (설명, 허용 연산). 원천을 읽는 함수는 Facts 에 있다.
ATTRIBUTES = {
    'region': ('시군구(원장 projects.sgg_code)', {'region_in'}),
    'district': ('지구(HOME payload.district)', {'name_prefix_in'}),
    'land_zone': ('택지·사업지구 종류(V-World LH 지구 이름)', {'zone_kind_in'}),
    'start_date': ('착공일(원장 events CONSTRUCTION_START)', {'within', 'by', 'from'}),
    'supply_date': ('모집공고·분양 시기(원장 events SUPPLY_NOTICE)', {'within', 'by', 'from'}),
    'tenure': ('주택 유형(원장 units.housing_type·HOME tenure)', {'contains_any'}),
    'developer': ('사업주체(원장 projects.agency_id·HOME developer·고시문 사업자 표기)', {'developer_in'}),
    'site_record': ('사업 유형 기록(후보지 발표·고시·LH 지구 경계)', {'record_kind_any'}),
}
OP_KO = {'region_in': '∈ 지역', 'name_prefix_in': '∈(앞부분 일치)', 'zone_kind_in': '종류 ∈', 'within': '기간 안',
         'by': '까지', 'from': '부터', 'contains_any': '에 낱말 포함', 'developer_in': '∈ 사업주체', 'unsourced': '=',
         'record_kind_any': '에 종류 기록 있음'}


def squash(s):
    return re.sub(r'\s+', '', (s or '').translate(QUOTES))


def name_key(s):
    """지구·사업 이름 견주기용: 공백·괄호·가운뎃점 제거."""
    return re.sub(r'[()\[\]（）·ㆍ]', '', squash(s))


def attr_label(attr, unsourced):
    if attr in ATTRIBUTES:
        return ATTRIBUTES[attr][0]
    return '%s(원천 없음)' % (unsourced.get(attr) or {}).get('label', attr)


# ---------------------------------------------------------------- 원 파일 텍스트(게이트)

_PDF = {}
_DOC = {}


def pdf_pages(path):
    """PDF → 쪽마다 공백을 지운 텍스트 (기본 추출, 레이아웃 추출) 쌍. 한 번만 읽는다."""
    if path not in _PDF:
        out = []
        for pg in pypdf.PdfReader(p(path)).pages:
            out.append((squash(pg.extract_text() or ''), squash(pg.extract_text(extraction_mode='layout') or '')))
        _PDF[path] = out
    return _PDF[path]


# ---------------------------------------------------------------- 기간 표기

def period(text):
    """원문 기간 표기 → (시작일, 끝일) ISO. 따옴표 + 두 자리 해 뒤의 'N분기'·'.上/下'·'년' 을 읽는다. 못 읽으면 None."""
    t = squash(text)
    m = re.search(r"'(\d{2})년(\d)분기", t)
    if m:
        y, q = 2000 + int(m.group(1)), int(m.group(2))
        if 1 <= q <= 4:
            end = dt.date(y, 3 * q, 1) + dt.timedelta(days=31)
            return dt.date(y, 3 * q - 2, 1).isoformat(), (end.replace(day=1) - dt.timedelta(days=1)).isoformat()
    m = re.search(r"'(\d{2})\.(上|下)", t)
    if m:
        y = 2000 + int(m.group(1))
        return ('%d-01-01' % y, '%d-06-30' % y) if m.group(2) == '上' else ('%d-07-01' % y, '%d-12-31' % y)
    m = re.search(r"'(\d{2})년", t)
    if m:
        y = 2000 + int(m.group(1))
        return '%d-01-01' % y, '%d-12-31' % y
    return None


def bounds(op, value_text):
    ps = [period(v) for v in value_text]
    if not ps or any(x is None for x in ps):
        return None
    lo, hi = min(x[0] for x in ps), max(x[1] for x in ps)
    return {'within': (lo, hi), 'by': ('0000-01-01', hi), 'from': (lo, '9999-12-31')}[op]


def date_range(d, m, y):
    """원장 이벤트 날짜(일·월·해 중 하나) → (시작, 끝)."""
    if d:
        return d, d
    if m:
        yy, mm = int(m[:4]), int(m[5:7])
        nxt = dt.date(yy + (mm == 12), mm % 12 + 1, 1)
        return '%s-01' % m, (nxt - dt.timedelta(days=1)).isoformat()
    if y:
        return '%s-01-01' % y, '%s-12-31' % y
    return None


# ---------------------------------------------------------------- 설정·게이트

def program_sets(pol_cfg, name):
    """설정의 프로그램 → (상태, 규칙 묶음 목록, 프로그램 설정). same_as 는 다른 프로그램의 묶음을 쓴다.
    정책 common_conditions 는 모든 묶음에 붙는다."""
    progs = pol_cfg.get('programs', {})
    pc = progs.get(name)
    if pc is None:
        return 'UNKNOWN', [], {'reason': '설정에 규칙 없음(조건 미상)'}
    if pc.get('status') != 'RULE':
        return pc.get('status') or 'UNKNOWN', [], pc
    src = progs[pc['same_as']] if pc.get('same_as') else pc
    common = pol_cfg.get('common_conditions', [])
    sets = [dict(s, conditions=list(s['conditions']) + list(common)) for s in src.get('rule_sets', [])]
    return 'RULE', sets, pc


def gate(rules, pages_of):
    """원문 문자열 게이트와 설정 검사 → 오류 목록. pages_of(doc_path) → 쪽 텍스트 쌍 목록."""
    errs = []
    vocab = rules.get('vocab', {})
    unsourced = rules.get('unsourced_attributes', {})
    zone_kinds = {squash(k) for _, k in vocab.get('zone_kinds', [])}
    for ref in rules.get('sources', {}).get('reference_lists', []):
        g = ref.get('developer_text')
        if not g:
            continue
        pages = pages_of(g['doc_path'])
        pg = g.get('page')
        if not isinstance(pg, int) or not (1 <= pg <= len(pages)) or not any(squash(g['quote']) in t for t in pages[pg - 1]):
            errs.append('%s developer_text: quote 가 원문 %s쪽에 없음' % (ref['path'], pg))
        for v in g.get('value_text') or []:
            if squash(v) not in squash(g['quote']):
                errs.append('%s developer_text: 값 %r 이 quote 에 없음' % (ref['path'], v))
        if not g.get('value_text'):
            errs.append('%s developer_text: value_text 없음' % ref['path'])
    for pid, pol in sorted(rules.get('policies', {}).items()):
        doc = pol.get('doc_path')
        pages = pages_of(doc) if doc else []
        conds = [('(공통)', c) for c in pol.get('common_conditions', [])]
        for name, pc in sorted(pol.get('programs', {}).items()):
            if pc.get('status') != 'RULE':
                if not pc.get('reason'):
                    errs.append('%s %s: 규칙이 없으면 reason(조건 미상 사유)이 있어야 함' % (pid, name))
                continue
            if pc.get('same_as'):
                if pc['same_as'] not in pol.get('programs', {}):
                    errs.append('%s %s: same_as %s 없음' % (pid, name, pc['same_as']))
                continue
            if not pc.get('rule_sets'):
                errs.append('%s %s: rule_sets 없음' % (pid, name))
            for s in pc.get('rule_sets', []):
                conds += [(name, c) for c in s.get('conditions', [])]
        for name, c in conds:
            where = '%s %s %s' % (pid, name, c.get('attribute'))
            attr, op, vals = c.get('attribute'), c.get('op'), c.get('value_text') or []
            if attr in unsourced:
                if op != 'unsourced':
                    errs.append('%s: 원천 없는 속성은 op unsourced' % where)
                if not (unsourced[attr] or {}).get('reason'):
                    errs.append('%s: 원천 없는 속성의 reason 없음' % where)
            elif attr not in ATTRIBUTES:
                errs.append('%s: 모르는 속성' % where)
            elif op not in ATTRIBUTES[attr][1]:
                errs.append('%s: 이 속성에 쓸 수 없는 연산 %s' % (where, op))
            if not vals:
                errs.append('%s: value_text 없음' % where)
            q, pg = c.get('quote'), c.get('page')
            if not q or not isinstance(pg, int):
                errs.append('%s: 쪽·quote 없음' % where)
                continue
            if not (1 <= pg <= len(pages)) or not any(squash(q) in t for t in pages[pg - 1]):
                errs.append('%s: quote 가 원문 %s쪽에 없음: %s' % (where, pg, q))
            for v in vals:
                if squash(v) not in squash(q):
                    errs.append('%s: 값 %r 이 quote 에 없음' % (where, v))
            if op in ('within', 'by', 'from') and bounds(op, vals) is None:
                errs.append('%s: 기간 표기를 못 읽음 %r' % (where, vals))
            if op == 'region_in':
                errs += ['%s: 지역 낱말 %r 이 vocab.region 에 없음' % (where, v) for v in vals if v not in vocab.get('region', {})]
            if op == 'developer_in':
                errs += ['%s: 사업주체 낱말 %r 이 vocab.developer 에 없음' % (where, v) for v in vals
                         if v not in vocab.get('developer', {})]
            if op in ('zone_kind_in', 'record_kind_any'):
                errs += ['%s: 지구 종류 %r 이 vocab.zone_kinds 에 없음' % (where, v) for v in vals if squash(v) not in zone_kinds]
    return errs


# ---------------------------------------------------------------- 속성 원천

def load_json(path):
    with open(p(path), encoding='utf-8') as f:
        return json.load(f)


def read_jsonl(path):
    if not os.path.exists(p(path)):
        return []
    with open(p(path), encoding='utf-8') as f:
        return [json.loads(x) for x in f if x.strip()]


class Facts:
    """사업 속성 원천(원장 표·HOME 덤프·LH 지구 경계 이름). 값마다 원천 위치를 함께 돌려준다."""

    def __init__(self, rules, home_projects, home_dir):
        src = rules['sources']
        self.vocab = rules.get('vocab', {})
        self.unsourced = rules.get('unsourced_attributes', {})
        self.unknown = src.get('unknown_markers', [])
        self.ledger_dir = src['ledger_dir']
        tbl = lambda n: load_json('%s/%s.json' % (self.ledger_dir, n))['rows']
        self.projects = {r['local_project_id']: r for r in tbl('projects')}
        self.events = defaultdict(list)
        for i, r in enumerate(tbl('events')):
            self.events[r['local_project_id']].append((i, r))
        self.units = defaultdict(list)
        for r in tbl('units'):
            self.units[r['local_project_id']].append(r)
        self.programs = {r['local_program_id']: r['program_name'] for r in tbl('programs')}
        self.links = tbl('links')
        self.home = {r['entity_id']: r for r in home_projects}
        self.home_file = home_dir + '/project.jsonl.gz'
        self.zone_file, self.zone_label = src['lh_zone'], src.get('lh_zone_label', src['lh_zone'])
        self.zones = sorted({f['properties'].get('zonename') for f in load_json(src['lh_zone'])['features']
                             if f.get('properties', {}).get('zonename')})
        self.name_rules = src.get('name_rules', {})
        self.lex = region_lexicon(self.name_rules['region_lexicon']) if self.name_rules.get('region_lexicon') else {}
        self.refs = []  # (목록 설정, 행 번호, 행, 이름 키, 지역 낱말 코드 집합들)
        for ref in src.get('reference_lists', []):
            for i, r in enumerate(read_jsonl(ref['path']), 1):
                if ref.get('doc_contains') and ref['doc_contains'] not in (r.get('doc_path') or ''):
                    continue
                keys, regs = self.name_keys(r.get('site_name'))
                self.refs.append((ref, i, r, keys, regs + self.region_words(r.get(ref.get('region_field') or ''))))
        self.gosi = defaultdict(list)
        for path in sorted(glob.glob(p(src['gosi_glob']))) if src.get('gosi_glob') else []:
            rel = os.path.relpath(path, p(''))
            for i, r in enumerate(read_jsonl(rel), 1):
                if r.get('subject_table') == 'projects' and r.get('verdict') in src.get('gosi_verdicts', ()) and r.get('doc_path'):
                    self.gosi[r['subject_id']].append((rel, i, r))
        self.dev_labels = [squash(x) for x in src.get('developer_labels', [])]
        self.dev_names = src.get('developer_names', [])
        self.dev_window = src.get('developer_window', 150)

    def known(self, v):
        return v not in (None, '') and not any(m in str(v) for m in self.unknown)

    def payload(self, pro):
        return (self.home.get(pro) or {}).get('payload') or {}

    def home_where(self, pro, field, v):
        return '%s %s payload.%s=%r (원천 %s)' % (self.home_file, pro, field, v, (self.home.get(pro) or {}).get('source_id'))

    # 각 속성: (값 목록 [(값, 위치)], 없을 때 사유)
    def region(self, prj, pro):
        r = self.projects.get(prj)
        if r and r.get('sgg_code'):
            return [(r['sgg_code'], '%s/projects.json %s sgg_code=%s' % (self.ledger_dir, prj, r['sgg_code']))], None
        return [], '원장 projects 에 이 사업의 sgg_code 없음'

    def district(self, prj, pro):
        d = self.payload(pro).get('district')
        if self.known(d):
            base, _ = split_district(d)
            if base:
                return [(base, self.home_where(pro, 'district', d))], None
        return [], 'HOME payload.district 없음'

    def land_zone(self, prj, pro):
        """지구 키(HOME 지구명, 없으면 원장 사업 이름)로 LH 지구 경계 이름을 찾는다. 이름(앞 시도 줄임말을 뗀 것 포함)이
        키로 시작하는 지구 중, 키 바로 뒤가 숫자가 아닌 것(같은 지구)이 있으면 그것만, 없으면 키로 시작하는 지구 모두."""
        d = self.payload(pro).get('district')
        base = split_district(d)[0] if self.known(d) else ''
        key, how = (name_key(base), 'HOME 지구명') if base else (name_key((self.projects.get(prj) or {}).get('project_name')),
                                                              '원장 사업 이름')
        if not key:
            return [], '지구명·사업 이름 없음'
        leads = [name_key(x) for x in self.vocab.get('zone_name_lead', [])]
        exact, loose = [], []
        for z in self.zones:
            zz = name_key(z)
            forms = [zz] + [zz[len(ld):] for ld in leads if zz.startswith(ld)]
            hits = [f[len(key):] for f in forms if f.startswith(key)]
            if not hits:
                continue
            (exact if any(not h[:1].isdigit() for h in hits) else loose).append(z)
        got = exact or loose
        if not got:
            return [], 'LH 지구 경계 이름 중 %s %r 로 시작하는 것 없음' % (how, key)
        return [(z, '%s(%s) zonename=%r ← %s %r' % (self.zone_file, self.zone_label, z, how, key)) for z in got], None

    def _events(self, prj, etype):
        rows = [(i, r) for i, r in self.events.get(prj, []) if r['event_type'] == etype]
        act = [(i, r) for i, r in rows if r['date_type'] == 'ACTUAL']
        use = act or [(i, r) for i, r in rows if r['date_type'] == 'PLANNED']
        out = []
        for i, r in use:
            rg = date_range(r.get('event_date'), r.get('event_month'), r.get('event_year'))
            if rg:
                v = r.get('event_date') or r.get('event_month') or r.get('event_year')
                out.append((rg, '%s/events.json 행 %d %s %s %s=%s (source_ref %s)' % (
                    self.ledger_dir, i + 1, prj, etype, r['date_type'], v, r.get('source_ref'))))
        return out, (None if out else '원장 events 에 %s(실제·예정) 없음' % etype)

    def start_date(self, prj, pro):
        return self._events(prj, 'CONSTRUCTION_START')

    def supply_date(self, prj, pro):
        return self._events(prj, 'SUPPLY_NOTICE')

    def tenure(self, prj, pro):
        out = [(u['housing_type'], '%s/units.json %s housing_type=%s (source_ref %s)' % (
            self.ledger_dir, prj, u['housing_type'], u.get('source_ref'))) for u in self.units.get(prj, [])
            if self.known(u.get('housing_type'))]
        pl = self.payload(pro)
        if self.known(pl.get('tenure')):
            out.append((pl['tenure'], self.home_where(pro, 'tenure', pl['tenure'])))
        for x in sorted({r.get('tenure') for r in pl.get('rows') or [] if self.known(r.get('tenure'))}):
            out.append((x, self.home_where(pro, 'rows[].tenure', x)))
        return out, (None if out else '원장 units·HOME 에 주택 유형 없음')

    def developer(self, prj, pro):
        out = []
        r = self.projects.get(prj) or {}
        if self.known(r.get('agency_id')):
            out.append((r['agency_id'], '%s/projects.json %s agency_id=%s' % (self.ledger_dir, prj, r['agency_id'])))
        dv = self.payload(pro).get('developer')
        if self.known(dv):
            out.append((dv, self.home_where(pro, 'developer', dv)))
        gosi = self.gosi_developers(prj)
        out += gosi
        if not gosi:  # 이은 고시문에 사업자 표기가 없을 때만 후보지 발표문의 사업 유형 일반 문구
            for ref, w in self.reference_hits(prj, pro):
                g = ref.get('developer_text')
                if g:
                    out += [(v, '%s — %s %s쪽 “%s” ← 후보지 목록 %s' % (GENERAL_DEV, g['doc_path'], g['page'], g['quote'], w))
                            for v in g['value_text']]
        return out, (None if out else '원장 agency_id·HOME 시행자 없음(확인 필요), 이은 고시문에 사업자 표기 없음')

    # ---- 이름 대조(엔진 지명 규칙과 같은 정규화)

    def _ents(self, w):
        return self.lex.get(w) or self.lex.get(_stem(w)) or set()

    def name_keys(self, name):
        """이름 → (대조 키 집합, 뗀 앞 지역 낱말의 코드 집합들). 시도·시군구 낱말만 떼고 동 이름은 남긴다."""
        r = self.name_rules
        t = name or ''
        for m in r.get('old_markers', []):
            t = t.replace(m, ' ')
        toks, regs = t.split(), []
        while len(toks) > 1:
            w = re.sub(r'[()]', '', toks[0])
            ent = set() if re.search(r'\d', w) else self._ents(w)
            if not any(lv in ('sido', 'sgg') for lv, _ in ent):
                break
            regs.append(ent)
            toks = toks[1:]
        body = ' '.join(toks)
        keys = set()
        for v in [re.sub(r'[()]', '', body), re.sub(r'\([^)]*\)', '', body)] + re.findall(r'\(([^)]*)\)', body):
            k, changed = name_key(v), True
            while changed:
                changed = False
                for tail in r.get('tails', []):
                    if k.endswith(tail) and len(k) > len(tail):
                        k, changed = k[:-len(tail)], True
            if len(k) >= r.get('min_len', 3):
                keys.add(k)
        return keys, regs

    def region_words(self, text):
        """지역 칸(시군구 표기) → 낱말마다 코드 집합. 붙여 쓴 시도+시군구(인천부평)는 나눠 보고, 한 글자(중)는 '구'를 붙여 본다."""
        out = []
        for w in (text or '').split():
            ent = self._ents(w)
            if not ent and len(w) >= 4:
                out += [e for e in (self._ents(w[:2]), self._ents(w[2:])) if e]
                continue
            if not ent and len(w) == 1:
                ent = self._ents(w + '구')
            if ent:
                out.append(ent)
        return out

    def reference_hits(self, prj, pro):
        sgg = (self.projects.get(prj) or {}).get('sgg_code') or ''
        names = [(self.projects.get(prj) or {}).get('project_name'), self.payload(pro).get('name')]
        pkeys = set()
        for n in names:
            pkeys |= self.name_keys(n)[0]
        out = []
        for ref, i, r, keys, regs in self.refs:
            same = sorted(keys & pkeys)
            if not same:
                continue
            if regs and not (sgg and all(any(sgg.startswith(c) for _, c in e) for e in regs)):
                continue
            region = '지역 일치' if regs else '지역 표기 없음'
            out.append((ref, '%s 행 %d %r (%s; 원문 %s %s쪽; 키 %s, %s)' % (
                ref['path'], i, r.get('site_name'), ref.get('label'), r.get('doc_path'), r.get('page'), same[0], region)))
        return out

    # ---- 고시문

    def gosi_text(self, path):
        if path not in _DOC:
            t = ''
            if path.lower().endswith('.pdf') and os.path.exists(p(path)):
                t = ' '.join(pg.extract_text() or '' for pg in pypdf.PdfReader(p(path)).pages)
            elif path.lower().endswith(('.html', '.htm')) and os.path.exists(p(path)):
                with open(p(path), encoding='utf-8', errors='replace') as f:
                    t = re.sub(r'<[^>]+>', ' ', f.read())
            _DOC[path] = squash(t)
        return _DOC[path]

    def gosi_kinds(self, prj):
        out = []
        for rel, i, r in self.gosi.get(prj, []):
            title = r.get('dataset_value') or ''
            k = zone_kind(self.vocab, title)
            if k:
                out.append((k, '%s 행 %d 고시 제목 %r (%s)' % (rel, i, title[:120], r['doc_path'])))
            t = self.gosi_text(r['doc_path'])
            pos = t.find('사업의종류')
            k2 = zone_kind(self.vocab, t[pos:pos + 60]) if pos >= 0 else None
            if k2:
                out.append((k2, '%s 고시문 \'사업의 종류\' (%s 행 %d)' % (r['doc_path'], rel, i)))
        return out

    def gosi_developers(self, prj):
        out = []
        for rel, i, r in self.gosi.get(prj, []):
            t = self.gosi_text(r['doc_path'])
            for lab in self.dev_labels:
                for m in re.finditer(re.escape(lab), t):
                    win = t[m.end():m.end() + self.dev_window]
                    for n in self.dev_names:
                        if squash(n) in win:
                            out.append((n, '%s 고시문 \'%s\' 뒤 표기 (%s 행 %d)' % (r['doc_path'], lab, rel, i)))
        return sorted(set(out))

    def site_record(self, prj, pro):
        out = [(ref['kind'], w) for ref, w in self.reference_hits(prj, pro)] + self.gosi_kinds(prj)
        zones, _ = self.land_zone(prj, pro)
        out += [(zone_kind(self.vocab, z) or '미정', w) for z, w in zones]
        out = sorted(set(out), key=lambda x: (x[1], x[0]))
        return out, (None if out else '후보지 발표 목록·고시·LH 지구 경계에 이 사업 기록 없음')

    def get(self, attr, prj, pro):
        if attr in self.unsourced:
            return [], '속성 원천 없음: ' + self.unsourced[attr]['reason']
        return getattr(self, attr)(prj, pro)


# ---------------------------------------------------------------- 조건 검사

def zone_kind(vocab, zonename):
    z = squash(zonename)
    return next((k for w, k in vocab.get('zone_kinds', []) if squash(w) in z), None)


def check(cond, facts, prj, pro):
    """조건 하나 → (상태, 설명). 설명에 사업 값과 원천 위치를 적는다."""
    attr, op, vals = cond['attribute'], cond['op'], cond['value_text']
    label = '%s %s %s' % (attr_label(attr, facts.unsourced), OP_KO.get(op, op), '·'.join(vals))
    got, why = facts.get(attr, prj, pro)
    if not got:
        return UNK, '%s — 검사 못함: %s' % (label, why)
    states = []
    if op == 'region_in':
        codes = [c for v in vals for c in facts.vocab['region'][v]]
        states = [SAT if any(str(v).startswith(c) for c in codes) else VIOL for v, _ in got]
    elif op == 'name_prefix_in':
        for v, _ in got:
            sv = name_key(v)
            states.append(SAT if any(sv.startswith(name_key(x)) for x in vals) else VIOL)
    elif op == 'zone_kind_in':
        want = {squash(x) for x in vals}
        kinds = [zone_kind(facts.vocab, v) for v, _ in got]
        states = [UNK if k is None else (SAT if squash(k) in want else VIOL) for k in kinds]
        got = [('%s [종류 %s]' % (v, k or '미정'), w) for (v, w), k in zip(got, kinds)]
    elif op in ('within', 'by', 'from'):
        lo, hi = bounds(op, vals)
        for (a, b), _ in got:
            states.append(SAT if lo <= a and b <= hi else (VIOL if b < lo or a > hi else UNK))
        got = [(a if a == b else '%s~%s' % (a, b), w) for (a, b), w in got]
    elif op == 'contains_any':
        hit = [any(squash(x) in squash(v) for x in vals) for v, _ in got]
        states = [SAT] if any(hit) else [VIOL]
    elif op == 'record_kind_any':
        want = {squash(x) for x in vals}
        states = [SAT] if any(squash(v) in want for v, _ in got) else [UNK]  # 다른 종류 기록만 있어도 위배로 보지 않는다
    elif op == 'developer_in':
        names = {n for v in vals for n in facts.vocab['developer'][v]}
        states = [SAT] if any(v in names for v, _ in got) else [VIOL]
    seen = ' · '.join('%r ← %s' % (v, w) for v, w in got)
    if all(s == SAT for s in states):
        return SAT, '%s — 충족: %s' % (label, seen)
    if all(s == VIOL for s in states):
        return VIOL, '%s — 위배: %s' % (label, seen)
    return UNK, '%s — 검사 못함(값이 엇갈리거나 종류 미정): %s' % (label, seen)


def judge(sets, facts, prj, pro):
    """규칙 묶음들 → (verdict, 보일 묶음 [(묶음, 상태, [(조건, 상태, 설명)])])."""
    res = []
    for s in sets:
        cs = [(c,) + check(c, facts, prj, pro) for c in s['conditions']]
        st = VIOL if any(x[1] == VIOL for x in cs) else (UNK if any(x[1] == UNK for x in cs) else SAT)
        res.append((s, st, cs))
    sat = [r for r in res if r[1] == SAT]
    if sat:
        return 'MATCH', sat[:1]
    if all(r[1] == VIOL for r in res):
        return 'MISMATCH', res
    return 'UNVERIFIED', res


# ---------------------------------------------------------------- 연결 모집단

def population(policy_id, work_dir, facts):
    """정책의 PROGRAM_PROJECT 연결 → {subject_id: {...}}. evidence.jsonl(엔진) 과 원장 links.json 의 합집합."""
    out = {}
    for r in read_jsonl('%s/%s/evidence.jsonl' % (work_dir, policy_id)):
        if r.get('subject_table') != 'links' or not (r.get('subject_id') or '').startswith(LINK_TYPE + '|'):
            continue
        e = out.setdefault(r['subject_id'], {'external_ref': None, 'external_value': None, 'verdicts': set(),
                                             'from': 'evidence.jsonl'})
        e['external_ref'] = e['external_ref'] or r.get('external_ref')
        e['external_value'] = e['external_value'] or r.get('external_value')
        e['verdicts'].add(r.get('verdict'))
    progs = {r['to_local_id'] for r in facts.links if r['link_type'] == 'POLICY_PROGRAM' and r['from_local_id'] == policy_id}
    for r in facts.links:
        if r['link_type'] != LINK_TYPE or r['from_local_id'] not in progs:
            continue
        sid = '|'.join([LINK_TYPE, r['from_local_id'], r['to_local_id']])
        ref = (r.get('evidence') or '').split(' ')[0]
        e = out.setdefault(sid, {'external_ref': None, 'external_value': None, 'verdicts': set(), 'from': '원장 links.json'})
        e['external_ref'] = e['external_ref'] or (ref if ref in facts.home else None)
    return out


# ---------------------------------------------------------------- 실행

def jn(xs):
    seen = []
    for x in xs:
        if x not in seen:
            seen.append(x)
    return seen


def run_policy(policy, rules, facts, checked_at, work_dir):
    """한 정책 → (evidence 행, 요약 기록)."""
    pid = policy['policy_id']
    pol_cfg = rules['policies'].get(pid, {})
    links = population(pid, work_dir, facts)
    nis_progs = {s.split('|')[1] for s, e in links.items() if 'NOT_IN_SOURCE' in e['verdicts']}
    rows, summ = [], []
    for sid in sorted(links):
        e = links[sid]
        _, prog_id, prj = sid.split('|', 2)
        prog = facts.programs.get(prog_id, prog_id)
        pro = e['external_ref']
        rec = {'subject_id': sid, 'program': prog, 'project': prj, 'external_ref': pro}
        if prog_id in nis_progs:
            summ.append(dict(rec, status='NOT_IN_SOURCE'))
            continue
        status, sets, pc = program_sets(pol_cfg, prog)
        if status != 'RULE':
            summ.append(dict(rec, status='UNKNOWN', reason=pc.get('reason')))
            continue
        verdict, shown = judge(sets, facts, prj, pro)
        conds = [c for s, _, cs in shown for c, _, _ in cs]
        pages = sorted({c['page'] for c in conds})
        name = facts.payload(pro).get('name') or (facts.projects.get(prj) or {}).get('project_name')
        notes = ' || '.join('규칙 「%s」 %s: %s' % (s['label'], STATE_KO[st], ' ; '.join(d for _, _, d in cs))
                            for s, st, cs in shown)
        if prj.startswith('HOME:') or prj not in facts.projects:
            notes += ' || 원장 projects 에 이 사업 id 없음'
        rows.append(dict(
            policy_id=pid, subject_table='links', subject_id=sid, field='program_project', external_ref=pro,
            stage_code='01', dataset_value=pc.get('source_program'),
            external_value=e['external_value'] or 'HOME 프로그램 %s · 사업 %s' % (prog, name),
            doc_url=None, doc_path=pol_cfg['doc_path'],
            locator='%s (프로그램 조건)' % ', '.join('p.%d' % x for x in pages),
            original_value=' / '.join(jn(c['quote'] for c in conds)),
            verdict=verdict, basis='RULE', search_scope=None, checked_by='TOOL', checked_at=checked_at, notes=notes))
        summ.append(dict(rec, status=verdict, name=name, shown=shown))
    rows = [{c: r.get(c) for c in COLS} for r in rows]
    return rows, summ


def cond_text(c, unsourced):
    return '%s %s %s (%s쪽·인쇄 %s쪽: “%s”)' % (attr_label(c['attribute'], unsourced), OP_KO.get(c['op'], c['op']),
                                         '·'.join(c['value_text']), c['page'], c.get('printed_page') or '?', c['quote'])


def summary_md(policies, rules, results, checked_at):
    L = ['# 프로그램 조건 대조(규칙 판정, basis RULE)', '',
         '`tools/research/chain/rules.py` 가 만든다(손으로 고치지 않는다). 규칙은 `tools/research/chain/config/program_rules.json`, '
         '판정 행은 `dataset/_work/<정책>/evidence_rule.jsonl`. 기준일(checked_at) %s.' % checked_at, '',
         '- 원문의 프로그램 정의·조건을 조건식으로 적고, 프로그램 → 사업 연결마다 사업 속성 원천(원장 projects·events·units, '
         'HOME 덤프 project, V-World LH 지구 경계 이름)으로 검사한다.',
         '- 규칙 묶음 하나의 조건이 모두 충족이면 MATCH, 모든 묶음에 위배가 있으면 MISMATCH, 그 밖(검사 못한 조건이 남음)은 UNVERIFIED.',
         '- 조건 값은 원문 quote 에 그대로 있고 quote 는 그 쪽 원문에 있다(원문 문자열 게이트). 원천이 없는 조건(기존 부지 용도·기존 단지 준공연도)도 '
         '적어 두어 그 조건이 걸린 연결은 MATCH 가 되지 않는다.',
         '- 프로그램이 원문에 없는 연결(NOT_IN_SOURCE)과 조건 미상 프로그램은 규칙 행을 만들지 않는다.', '']
    allc = Counter()
    unsourced = rules.get('unsourced_attributes', {})
    for pol in policies:
        pid = pol['policy_id']
        summ = results[pid]
        pol_cfg = rules['policies'].get(pid, {})
        c = Counter(s['status'] for s in summ)
        allc.update(c)
        L += ['## %s %s' % (pid, pol.get('name') or ''), '',
              '연결 %d: MATCH %d · MISMATCH %d · UNVERIFIED %d · 원문에 없는 프로그램(NOT_IN_SOURCE) %d · 조건 미상 %d' % (
                  len(summ), c['MATCH'], c['MISMATCH'], c['UNVERIFIED'], c['NOT_IN_SOURCE'], c['UNKNOWN']), '',
              '원문: `%s`' % pol_cfg.get('doc_path'), '']
        by = defaultdict(list)
        for s in summ:
            by[s['program']].append(s)
        L += ['| 프로그램(HOME) | 원문 프로그램 | 연결 | MATCH | MISMATCH | UNVERIFIED | 비고 |', '|---|---|---|---|---|---|---|']
        for prog in sorted(by):
            ss = by[prog]
            cc = Counter(s['status'] for s in ss)
            status, _, pc = program_sets(pol_cfg, prog)
            note = ''
            if cc['NOT_IN_SOURCE']:
                note = '원문에 없는 프로그램(NOT_IN_SOURCE) — 규칙 판정 안 함'
            elif status != 'RULE':
                note = '조건 미상: %s' % pc.get('reason')
            L.append('| %s | %s | %d | %d | %d | %d | %s |' % (prog, pc.get('source_program') or '', len(ss), cc['MATCH'],
                                                              cc['MISMATCH'], cc['UNVERIFIED'], note))
        L.append('')
        for prog in sorted(by):
            status, sets, pc = program_sets(pol_cfg, prog)
            if status != 'RULE' or any(s['status'] == 'NOT_IN_SOURCE' for s in by[prog]):
                continue
            L += ['### %s' % prog, '']
            for s in sets:
                L.append('- 규칙 「%s」' % s['label'])
                L += ['  - %s' % cond_text(c, unsourced) for c in s['conditions']]
            why = Counter()
            for s in by[prog]:
                if s['status'] == 'UNVERIFIED':
                    why.update({attr_label(c['attribute'], unsourced) for _, st, cs in s['shown'] for c, cst, _ in cs
                                if cst == UNK})
            if why:
                L.append('- 검사 못한 조건(UNVERIFIED 연결 기준, 건수): ' + ', '.join('%s %d' % kv for kv in sorted(why.items())))
            dev = Counter()
            for s in by[prog]:
                if s['status'] == 'MATCH':
                    for _, _, cs in s['shown']:
                        for c, cst, d in cs:
                            if c['attribute'] == 'developer' and cst == SAT:
                                vals = d.split('— 충족: ', 1)[-1].split(" · '")
                                dev['일반 문구 근거' if all(GENERAL_DEV in v for v in vals)
                                    else '사업지별 근거(고시문·원장·HOME)'] += 1
            if dev:
                L.append('- MATCH 의 사업주체 근거: ' + ', '.join('%s %d' % kv for kv in sorted(dev.items())))
            bad = [s for s in by[prog] if s['status'] == 'MISMATCH']
            if bad:
                L.append('- 위배 사례:')
                for s in bad:
                    v = ' ; '.join(d for _, st, cs in s['shown'] for _, cst, d in cs if cst == VIOL)
                    L.append('  - %s %s: %s' % (s['project'], s.get('name') or '', v))
            L.append('')
    L += ['## 합계', '', '연결 %d: MATCH %d · MISMATCH %d · UNVERIFIED %d · NOT_IN_SOURCE %d · 조건 미상 %d' % (
        sum(allc.values()), allc['MATCH'], allc['MISMATCH'], allc['UNVERIFIED'], allc['NOT_IN_SOURCE'], allc['UNKNOWN']), '',
          '## 원천이 없어 검사 못한 조건', '']
    L += ['- %s: %s' % (v.get('label', k), v.get('reason')) for k, v in sorted(unsourced.items())]
    L.append('')
    return '\n'.join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--policy', help='policy_id 또는 slug')
    g.add_argument('--all', action='store_true')
    args = ap.parse_args(argv)

    from home import load_home  # HOME 덤프 읽기(담당자 이름을 모아 출력에서 지운다)
    cfg = load_config('stage_sources.json')
    rules = load_config(RULES_FILE)
    policies = load_config('policies.json')['policies']
    errs = gate(rules, pdf_pages)
    if errs:
        sys.stderr.write('원문 문자열 게이트·설정 오류 %d건:\n%s\n' % (len(errs), '\n'.join(errs)))
        return 2
    if args.policy:
        policies = [x for x in policies if args.policy in (x['policy_id'], x['slug'])]
        if not policies:
            sys.stderr.write('정책 없음: %s\n' % args.policy)
            return 2
    D, _ = load_home(cfg)
    facts = Facts(rules, D['project'], cfg['home']['dump_dir'])
    work = cfg['paths']['work_dir']
    results = {}
    for pol in policies:
        rows, summ = run_policy(pol, rules, facts, cfg['checked_at'], work)
        write_jsonl('%s/%s/%s' % (work, pol['policy_id'], OUT_NAME), rows)
        results[pol['policy_id']] = summ
        c = Counter(s['status'] for s in summ)
        print('%s 연결 %d: MATCH %d · MISMATCH %d · UNVERIFIED %d · NOT_IN_SOURCE %d · 조건 미상 %d' % (
            pol['policy_id'], len(summ), c['MATCH'], c['MISMATCH'], c['UNVERIFIED'], c['NOT_IN_SOURCE'], c['UNKNOWN']))
    if args.all:
        write_text('%s/%s' % (cfg['paths']['policy_dir'], SUMMARY_NAME), summary_md(policies, rules, results, cfg['checked_at']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
