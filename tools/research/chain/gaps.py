#!/usr/bin/env python3
"""M4 누락 검증(역방향 대조) 02 사업화 · 03 인허가: 권위 원천에 있는데 데이터셋 정책 사슬에 없는 것을 찾아 판정한다.

    python3 -I tools/research/chain/gaps.py --policy <policy_id|slug> [--policy ...] | --all [--exa]

입력  config/gap_rules.json(규칙·어휘·질의 템플릿), config/stage_sources.json(checked_at·HOME 덤프·원천 경로),
      config/policies.json, _work/<policy_id>/{policy_sites,policy_programs,evidence,gaps}.jsonl, dataset/links.json,
      원장 표(schemas/ledger-2026-10/tables), HOME 사업 덤프, LH 공급계획·건설공사현황·준공예정, 건축HUB 대용량,
      Exa 캐시(03.인허가/원본/_exa_gaps).
출력  _work/<policy_id>/gaps.jsonl 의 stage_code 02·03 행(다른 단계 행은 글자 그대로 두고 자리도 지킨다),
      02.사업화/누락검증_02.md, 03.인허가/누락검증_03.md.

후보 묶음
  02 SITE      원문 지명(SITE, 후속 발표 포함) → 레지스트리(원장 + HOME) 대조
  02 PROGRAM   조건이 원문 한 문장에서 확정되는 공급 프로그램 → LH 공급계획·건설공사현황·준공예정 블록 행
  02 EVIDENCE  사업화 근거(evidence stage_02 확인 행)가 없는 데이터셋 사업
  03 HUB       데이터셋 사업 필지(PNU)·법정동+블록에 걸린 건축HUB 주택인허가 기록 중 그 사업과 연결 안 된 것
  03 EVIDENCE  인허가 근거가 없는 데이터셋 사업 + Exa 로 찾은 사업계획승인 고시 후보
판정  MISSING 누락 확정 · OUT_OF_SCOPE 범위 밖 · ALREADY_PRESENT 이미 있음 · PENDING 판단 보류(이유 필수).
gap_type  LINK_MISSING(레지스트리에 있으나 정책 사슬에 연결 안 됨) · PROJECT_MISSING(레지스트리에도 없음) ·
          EVIDENCE_MISSING(사슬 사업의 단계 근거 없음). 후보 묶음은 source 칸(ORIGINAL·후속 폴더·원천 키·evidence·exa).

코드에는 정책 고유 값(정책 id·날짜·지명·URL)을 두지 않는다. 네트워크(Exa)는 --exa 일 때만 부르고, 같은 입력·같은 캐시면
출력은 바이트까지 같다.
"""
import argparse
import glob
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import zipfile
from collections import defaultdict

try:
    import pypdf  # noqa: F401  readers 가 쓴다
except ModuleNotFoundError:  # python3 -I 는 사용자 site-packages 를 경로에서 뺀다
    import site
    sys.path.append(site.getusersitepackages())

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import readers  # noqa: E402
from common import (CONFIG_DIR, p, load_config, nz, norm_block, split_district, src_district, district_eq,  # noqa: E402
                    site_in_text, to_int, scrub, scrub_json, collect_actors)
from home import load_dump_table, project_subject_ids  # noqa: E402

GAP_LABEL = {'MISSING': '누락 확정', 'OUT_OF_SCOPE': '범위 밖', 'ALREADY_PRESENT': '이미 있음', 'PENDING': '판단 보류'}
GAP_TYPES = ['LINK_MISSING', 'PROJECT_MISSING', 'EVIDENCE_MISSING']


def load_json(path):
    with open(p(path), encoding='utf-8') as f:
        return json.load(f)


def read_jsonl(path):
    if not os.path.exists(p(path)):
        return []
    with open(p(path), encoding='utf-8') as f:
        return [json.loads(x) for x in f if x.strip()]


def table(d, name):
    return load_json('%s/%s.json' % (d, name))['rows']


def sha16(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]


def page_locator(page, printed):
    if not page:
        return None
    return 'PDF %s쪽' % page + (' · 인쇄 %s쪽' % printed if printed else '')


def gap_row(policy_id, stage, gap_type, verdict, reason, value, checked_at, source, doc_url=None, doc_path=None,
            locator=None, quote=None, matched=None):
    """01 행(policy.py gap_row)과 같은 칸·같은 순서."""
    assert verdict in GAP_LABEL and gap_type in GAP_TYPES and reason
    return {
        'policy_id': policy_id, 'stage_code': stage, 'gap_type': gap_type, 'source': source,
        'candidate_value': value, 'doc_url': doc_url, 'doc_path': doc_path, 'locator': locator, 'quote': quote,
        'verdict': verdict, 'verdict_label': GAP_LABEL[verdict], 'reason': reason, 'matched_ref': matched,
        'checked_by': 'TOOL', 'checked_at': checked_at,
    }


# ---------------------------------------------------------------- 지역

def sido_of(G, text):
    """지역·본부·주소 글 앞부분 → 시도 코드(못 정하면 '')."""
    t = re.sub(r'\s', '', text or '')
    for k in sorted(G['sido_prefix'], key=lambda x: (-len(x), x)):
        if t.startswith(k):
            return G['sido_prefix'][k]
    return ''


def region_codes(G, text):
    """문장의 지역 낱말(가장 긴 것 먼저, 처음 나온 것) → (낱말, 시도 코드 목록)."""
    best = None
    for w in sorted(G['region_words'], key=lambda x: (-len(x), x)):
        i = (text or '').find(w)
        if i >= 0 and (best is None or i < best[0]):
            best = (i, w)
    return (best[1], G['region_words'][best[1]]) if best else (None, None)


# ---------------------------------------------------------------- 레지스트리(원장 + HOME)

class Registry:
    """원장 사업 + HOME 사업 레코드를 사업 id(원장 PRJ 또는 HOME:PRO)로 합친 것."""

    def __init__(self, G, S):
        rc = G['registry']
        led = rc['ledger_tables']
        self.suffixes = S['independent']['keys']['district_suffixes']
        self.ents = {}
        for r in table(led, 'projects'):
            e = self.ent(r['local_project_id'])
            self.add(e['names'], r.get('project_name'))
            e['sgg'] = r.get('sgg_code') or e['sgg']
        self.hub_pk = defaultdict(set)      # 관리번호 → 사업 id
        self.locs = defaultdict(list)       # 사업 id → 위치 행
        for r in table(led, 'identifiers'):
            if r['id_type'] == rc['area_block_id_type']:
                d, b = (r['id_value'].split('|') + [''])[:2]
                if d and b:
                    self.add(self.ent(r['local_project_id'])['pairs'], (d, b))
            elif r['id_type'] == rc['hub_id_type']:
                self.hub_pk[r['id_value']].add(r['local_project_id'])
        for r in table(led, 'project_locations'):
            self.locs[r['local_project_id']].append(r)
        h = S['home']
        rows = {}
        for r in load_dump_table(h['dump_dir'], 'project'):
            k = r['entity_id']
            if k not in rows or (r.get('revision_no') or 0, r.get('recorded_at') or '') >= \
                    (rows[k].get('revision_no') or 0, rows[k].get('recorded_at') or ''):
                rows[k] = r
        collect_actors(list(rows.values()))
        alias = load_dump_table(h['dump_dir'], 'home_identity_alias')
        id_map = load_json(h['id_map'])
        subj = project_subject_ids({'home_identity_alias': alias}, sorted(rows), id_map, h['id_keys'], h['unmapped_prefix'])
        self.pro = {}
        for pid in sorted(rows):
            pl = rows[pid].get('payload') or {}
            rid = subj[pid][0]
            self.pro[pid] = rid
            e = self.ent(rid)
            self.add(e['names'], pl.get('name'))
            self.add(e['pro'], pid)
            if pl.get('district') and pl.get('block'):
                self.add(e['pairs'], (pl['district'], pl['block']))
            elif pl.get('district'):
                self.add(e['districts'], pl['district'])
            if not e['region']:
                e['region'] = pl.get('region') or ''
            self.add(e['units'], to_int(pl.get('planned_units')))
            self.add(e['developer'], pl.get('developer'))
        for rid, e in self.ents.items():
            if not e['sgg'] and rid.startswith('PRJ-'):
                e['sgg'] = rid.split('-')[1]
            e['sido'] = e['sgg'][:2] if e['sgg'] else sido_of(G, e['region'])
        self.G = G
        self.keys_ready = False

    def ent(self, rid):
        e = self.ents.get(rid)
        if e is None:
            e = self.ents[rid] = {'rid': rid, 'names': [], 'pairs': [], 'districts': [], 'sgg': '', 'region': '',
                                  'units': [], 'pro': [], 'developer': []}
        return e

    @staticmethod
    def add(lst, v):
        if v not in (None, '') and v not in lst:
            lst.append(v)

    def name(self, rid):
        e = self.ents.get(rid)
        return (e['names'][0] if e and e['names'] else '') or ''

    def prepare_keys(self):
        """이름 키(공백·괄호·꼬리 낱말 제거)·지구 키·공백 없는 이름."""
        if self.keys_ready:
            return
        for e in self.ents.values():
            e['nz'] = [nz(n) for n in e['names']]
            e['name_keys'] = sorted({name_key(self.G, n) for n in e['names']} - {''})
            ds = [d for d, _ in e['pairs']] + e['districts']
            for n in e['names']:
                m = re.match(self.G['site_match']['name_district_regex'], n or '')
                if m:
                    ds.append(m.group(1))
            e['district_list'] = sorted(set(ds))
            e['district_keys'] = sorted({src_district(d, self.suffixes) for d in ds} - {''})
        self.keys_ready = True

    def block_match(self, e, district, block):
        """사업 e 가 (원천 지구, 블록)과 같은 곳인지 → 방법 글 또는 None."""
        nb = norm_block(block)
        if not nb:
            return None
        for d, b in e['pairs']:
            if norm_block(b) == nb and district_eq(district, d, self.suffixes):
                return '지구·블록 같음(%s %s)' % (d, b)
        sd = src_district(district, self.suffixes)
        for n in e['names']:
            if sd and site_in_text(n, sd, block):
                return '사업 이름에 지구·블록(%s)' % n
        return None


# ---------------------------------------------------------------- 지명 키

def name_key(G, name):
    """대조 키: strip_regex 를 지우고, 시도·행정구역 낱말을 빼고, 공백 없이 잇고, 끝 꼬리 낱말을 뗀다."""
    return ''.join(site_tokens(G, name))


def site_tokens(G, name):
    sm = G['site_match']
    s = name or ''
    for rx in sm['strip_regex']:
        s = re.sub(rx, ' ', s)
    admin = re.compile(sm['admin_suffix_regex'])
    sido_words = set(G['sido_prefix']) | set(G['region_words'])
    toks = []
    for t in re.split(r'\s+', s):
        t = t.strip()
        if not t or t in sido_words or admin.match(t) or re.fullmatch(sm['admin_token_regex'], t):
            continue
        toks.append(t)
    if toks:
        last = toks[-1]
        changed = True
        while changed:
            changed = False
            for suf in sm['drop_suffixes']:
                if last.endswith(suf) and len(last) > len(suf):
                    last, changed = last[:-len(suf)], True
                elif last == suf and len(toks) > 1:
                    toks.pop()
                    last, changed = toks[-1], True
                    break
        toks[-1] = last
    return toks


def first_token(G, name):
    s = name or ''
    for rx in G['site_match']['strip_regex']:
        s = re.sub(rx, ' ', s)
    t = s.split()
    return t[0] if t else ''


def policy_labels(pol):
    """정책 slug(a-b) → 원문 표기 변형(a·b, a.b, aㆍb)."""
    parts = pol.get('slug', '').split('-')
    if len(parts) != 2:
        return []
    a, b = parts
    return ['%s%s%s' % (a, sep, b) for sep in ('·', '.', 'ㆍ', '･')]


# ---------------------------------------------------------------- 데이터셋 정책 사슬

def load_chain(G, S, policy, links):
    """정책 사슬 사업 id 와 사업 × 단계 evidence."""
    work = S['paths']['work_dir']
    ev = []
    for path in sorted(glob.glob(p('%s/%s/%s' % (work, policy['policy_id'], G['dataset']['evidence_glob'])))):
        ev += read_jsonl(path)
    progs = {r['to_local_id'] for r in links if r['link_type'] == 'POLICY_PROGRAM' and r['from_local_id'] == policy['policy_id']}
    subjects = {r['to_local_id'] for r in links if r['link_type'] == 'PROGRAM_PROJECT' and r['from_local_id'] in progs}
    by = defaultdict(list)
    text = defaultdict(list)
    for r in ev:
        if r['subject_table'] != 'projects':
            continue
        subjects.add(r['subject_id'])
        by[(r['subject_id'], r['stage_code'])].append(r)
        text[r['subject_id']].append(' '.join(str(r.get(k) or '') for k in ('locator', 'original_value', 'notes')))
    return {'subjects': sorted(subjects), 'ev': by, 'text': text, 'ev_rows': len(ev)}


def stage_status(G, chain, subj, stage):
    """(근거 있음, 그 단계 evidence 행 목록)."""
    d = G['dataset']
    rows = chain['ev'].get((subj, stage), [])
    ok = any(r['verdict'] in d['confirmed_verdicts'] and r.get('basis') not in d['unconfirmed_basis'] for r in rows)
    return ok, rows


# ---------------------------------------------------------------- 02 지명 → 레지스트리

def site_records(G, S, policy, docs_url):
    """원문 지명(policy_sites.jsonl) + 01 의 후속 발표 지명(FOLLOWUP_SITE) → 대조할 지명 목록."""
    work = '%s/%s' % (S['paths']['work_dir'], policy['policy_id'])
    out, seen = [], set()
    for r in read_jsonl(work + '/' + G['dataset']['policy_sites']):
        dp = r.get('doc_path') or ''
        src = 'ORIGINAL' if dp.startswith(policy['docs_dir'] + '/') else os.path.basename(os.path.dirname(dp))
        loc = page_locator(r.get('page'), r.get('printed_page'))
        seen.add((dp, loc, nz(r['site_name']), to_int(r.get('units'))))
        out.append(dict(name=r['site_name'], district=r.get('district'), block=r.get('block'), units=r.get('units'),
                        sido=sido_of(G, r.get('sido')), kind=r.get('site_kind') or 'SITE', source=src,
                        doc_path=r.get('doc_path'), doc_url=docs_url.get(r.get('doc_path')),
                        locator=page_locator(r.get('page'), r.get('printed_page')), quote=r.get('quote'),
                        program=r.get('program_name')))
    for g in read_jsonl(work + '/' + G['output']['gaps_file']):
        if g.get('stage_code') != '01' or g.get('gap_type') != 'FOLLOWUP_SITE':
            continue
        m = re.match(r'^(.*?)(?:\s+(\d+)호)?$', g['candidate_value'] or '')
        if ((g.get('doc_path') or ''), g.get('locator'), nz(m.group(1)), to_int(m.group(2))) in seen:
            continue  # policy_sites.jsonl 에 같은 문서·쪽·지명이 이미 있음(지구·블록·시도 칸이 있는 그 행을 쓴다)
        kind = 'SITE'
        if g['verdict'] == 'OUT_OF_SCOPE':
            head = (g.get('reason') or '').split(' ')[0]
            kind = head if head in ('AGGREGATE', 'NOT_SITE') else 'SITE'
        out.append(dict(name=m.group(1), district=None, block=None, units=to_int(m.group(2)), sido='', kind=kind,
                        source=g['source'], doc_path=g.get('doc_path'), doc_url=g.get('doc_url'), locator=g.get('locator'),
                        quote=g.get('quote'), program=None, kind_from='01 판정 %s(%s)' % (g['verdict_label'], g.get('reason'))))
    return out


def match_site(G, reg, site):
    """지명 → {사업 id: (단계, 방법)}. 단계 1 지구+블록 · 2 이름 같음/지구 같음 · 3 이름 포함 · 4 이름만 비슷."""
    reg.prepare_keys()
    toks = site_tokens(G, site['name'])
    out = {}
    for tk in key_variants(G, toks):
        for rid, v in match_key(G, reg, site, tk).items():
            if rid not in out or v[0] < out[rid][0]:
                out[rid] = v
    return out


def key_variants(G, toks):
    """지명 낱말 → 대조 키 변형: 그대로, 첫 낱말 앞에 붙은 시도 이름을 뗀 것(남은 글 2자 이상)."""
    out = [toks]
    if toks:
        for w in sorted(G['sido_prefix'], key=lambda x: (-len(x), x)):
            if toks[0].startswith(w) and len(toks[0]) - len(w) >= G['site_match']['min_exact_len']:
                out.append([toks[0][len(w):]] + toks[1:])
                break
    return out


def match_key(G, reg, site, toks):
    sm = G['site_match']
    key = ''.join(toks)
    out = {}
    for rid in sorted(reg.ents):
        e = reg.ents[rid]
        if site['sido'] and e['sido'] and site['sido'] != e['sido']:
            continue
        if site.get('block') and site.get('district'):
            how = reg.block_match(e, site_district(site), site['block'])
            if how:
                out[rid] = (1, how)
            continue
        if len(key) >= sm['min_exact_len'] and key in e['name_keys']:
            out[rid] = (2, '이름 같음(%s)' % reg.name(rid))
        elif len(key) >= sm['min_exact_len'] and any(dk == key or dk.endswith(key) for dk in e['district_keys']):
            out[rid] = (2, '지구 같음(%s)' % reg.name(rid))
        elif len(key) >= sm['min_exact_len'] and any(first_token(G, n) == key for n in e['names']):
            out[rid] = (3, '이름 첫 낱말 같음(%s)' % reg.name(rid))
        elif len(key) >= sm['min_contains_len'] and any(key in n for n in e['nz']):
            out[rid] = (3, '이름 포함(%s)' % reg.name(rid))
        elif len(key) >= sm['min_exact_len'] and any(district_eq(key, d, reg.suffixes) for d in e['district_list']):
            out[rid] = (4, '지구 안 다른 지명(%s)' % reg.name(rid))
        elif (len(toks) >= 2 and all(len(t) >= 2 for t in toks) and any(all(nz(t) in n for t in toks) for n in e['nz'])) or \
                any(len(k) >= sm['min_reverse_len'] and k in key for k in e['name_keys']) or \
                any(len(et) >= 2 and set(et) <= set(toks) for et in (site_tokens(G, n) for n in e['names'])):
            out[rid] = (4, '이름만 비슷(%s)' % reg.name(rid))
    return out


def site_district(site):
    """지명 지구 칸에서 끝에 붙은 블록 표기(블록·BL 꼬리 포함)를 뗀다."""
    d = re.sub(r'\s', '', site.get('district') or '')
    b = re.sub(r'\s', '', site.get('block') or '')
    d = re.sub(r'(BL|블록|블럭)$', '', d)
    return d[:-len(b)] if b and d.endswith(b) and len(d) > len(b) else d


def id_list(G, reg, rids):
    n = G['output']['matched_max_ids']
    s = ', '.join('%s %s' % (r, reg.name(r)) for r in rids[:n])
    return s + (' 외 %d' % (len(rids) - n) if len(rids) > n else '')


def ref_list(G, rids):
    n = G['output']['matched_max_ids']
    return ' '.join(rids[:n]) + (' 외 %d' % (len(rids) - n) if len(rids) > n else '') if rids else None


def judge_site(G, reg, site, chain_set, other_chains, labels):
    """→ (gap_type, verdict, 이유, 맞춘 id 목록)."""
    V = G['site_verdicts']
    if site['kind'] != 'SITE':
        why = site.get('kind_from') or '원문 지명 분류 %s' % site['kind']
        return 'PROJECT_MISSING', 'OUT_OF_SCOPE', '%s — %s' % (V['aggregate'], why), []
    cands = match_site(G, reg, site)
    if not cands:
        extra = ''
        if site.get('block'):
            same = sorted(r for r, e in reg.ents.items() if src_district(site_district(site), reg.suffixes) in e.get('district_keys', []))
            extra = ' · 같은 지구 사업 %d개는 있으나 이 블록은 없음' % len(same) if same else ''
        return 'PROJECT_MISSING', 'MISSING', V['project_missing'] + extra, []
    best = min(v[0] for v in cands.values())
    B = sorted(r for r, v in cands.items() if v[0] == best)
    near = sorted(r for r, v in cands.items() if v[0] <= 3)
    hit = [r for r in B if r in chain_set]
    if hit and best == 4 and not any(site.get('units') in reg.ents[r]['units'] for r in hit if site.get('units')):
        return 'LINK_MISSING', 'PENDING', '%s — 이 정책 사슬 사업 %s (호수로 확인 못 함)' % (V['similar_only'], id_list(G, reg, hit)), hit
    if hit:
        if best == 4:
            how = ' · 호수 %s 같음' % site['units']
            return 'LINK_MISSING', 'ALREADY_PRESENT', '%s: %s' % (V['present'], '; '.join(cands[r][1] + how + ' ' + r for r in hit[:5])), hit
        return 'LINK_MISSING', 'ALREADY_PRESENT', '%s: %s' % (V['present'], '; '.join(cands[r][1] + ' ' + r for r in hit[:5])), hit
    nhit = [r for r in near if r in chain_set]
    if nhit:
        return 'LINK_MISSING', 'PENDING', '%s — 이 정책 사슬에는 %s 이 있고 레지스트리에 더 맞는 사업(%s)이 따로 있음' % (
            V['ambiguous'], id_list(G, reg, nhit), id_list(G, reg, B)), B
    quote = site.get('quote') or ''
    for pid, lab in labels.items():
        if any(x in quote for x in lab) and any(r in other_chains.get(pid, set()) for r in B):
            o = [r for r in B if r in other_chains[pid]]
            return 'LINK_MISSING', 'OUT_OF_SCOPE', '%s: 원문 \'%s\' · %s' % (V['other_policy'], lab[0], id_list(G, reg, o)), o
    if best == 4:
        return 'LINK_MISSING', 'PENDING', '%s — %s' % (V['similar_only'], id_list(G, reg, B)), B
    pick = B
    how = cands[B[0]][1]
    if len(B) > 1 and site.get('units'):
        same = [r for r in B if site['units'] in reg.ents[r]['units']]
        if len(same) == 1:
            pick, how = same, cands[same[0]][1] + ' · 호수 %s 같음' % site['units']
    if len(pick) == 1:
        return 'LINK_MISSING', 'MISSING', '%s: %s %s' % (V['link_missing'], how, pick[0]), pick
    kinds = sorted({cands[r][1].split('(')[0] for r in B})
    return 'LINK_MISSING', 'PENDING', '%s(%s %d개): %s' % (V['ambiguous'], '·'.join(kinds), len(B), id_list(G, reg, B)), B


# ---------------------------------------------------------------- 02 프로그램 조건 → 권위 원천 블록 행

def parse_period(G, text, announced):
    """문장의 기간 표기 → (시작 YYYY-MM-DD, 끝 YYYY-MM-DD) 또는 None. 여러 표기면 합친 범위."""
    rx = G['programs']['period_regex']
    spans = []
    used = []

    def take(m):
        used.append((m.start(), m.end()))

    def free(m):
        return not any(a <= m.start() < b for a, b in used)
    for m in re.finditer(rx['quarter'], text):
        y, q = 2000 + int(m.group(1)), int(m.group(2))
        if 1 <= q <= 4:
            spans.append(('%d-%02d-01' % (y, 3 * q - 2), '%d-%02d-%02d' % (y, 3 * q, 31 if q in (1, 4) else 30)))
            take(m)
    for m in re.finditer(rx['half'], text):
        if free(m):
            y = 2000 + int(m.group(1))
            spans.append(('%d-01-01' % y, '%d-06-30' % y) if m.group(2) == '上' else ('%d-07-01' % y, '%d-12-31' % y))
            take(m)
    for m in re.finditer(rx['until'], text):
        if free(m):
            spans.append((announced, '%d-12-31' % (2000 + int(m.group(1)))))
            take(m)
    for m in re.finditer(rx['range'], text):
        if free(m):
            a, b = 2000 + int(m.group(1)), 2000 + int(m.group(2))
            if a <= b:
                spans.append(('%d-01-01' % a, '%d-12-31' % b))
                take(m)
    for m in re.finditer(rx['year'], text):
        if free(m):
            y = 2000 + int(m.group(1))
            spans.append(('%d-01-01' % y, '%d-12-31' % y))
    if not spans:
        return None
    return min(s for s, _ in spans), max(e for _, e in spans)


def program_conditions(G, prog, announced):
    """프로그램 → (상태, 조건 목록, 메모). 상태 CONDITIONS · UNKNOWN(조건 미상) · UNCOVERED(원천 범위 밖)."""
    pc = G['programs']
    sents = []
    for f in pc['sentence_fields']:
        if prog.get(f):
            sents.append((f, prog[f]))
    for k, v in (prog.get('conditions') or {}).items():
        if v and not any(x == k or k.startswith(x) for x in pc['exclude_condition_keys']):
            sents.append(('conditions.' + k, v))
    conds = []
    for field, s in sents:
        if re.match(pc['exclude_prefix_regex'], s):
            continue
        word, codes = region_codes(G, s)
        stage = next((st for w, st in pc['stage_words'] if w in s), None)
        period = parse_period(G, s, announced)
        got = {'region': codes, 'stage': stage, 'period': period}
        if all(got[k] for k in pc['required']):
            conds.append(dict(field=field, sentence=s, region_word=word, codes=codes, stage=stage, period=period,
                              land=[k for k, ws in pc['land_words'].items() if any(w in s or w in prog['program_name'] for w in ws)],
                              types=[k for k, ws in pc['type_words'].items() if any(w in s for w in ws)],
                              dev=[k for k, ws in pc['developer_words'].items() if any(w in s for w in ws)],
                              other_dev=[w for w in pc['other_developer_words'] if w in s]))
    if not conds:
        return 'UNKNOWN', [], '원문 한 문장에서 %s 를 모두 뽑지 못함' % '·'.join(pc['required'])
    unc = sorted({w for c in conds for w in pc['uncovered_words'] if w in c['sentence'] or w in prog['program_name']})
    if unc:
        return 'UNCOVERED', conds, '원천(LH 블록 행)이 덮지 못하는 유형 낱말: %s' % ', '.join(unc)
    if all(c['other_dev'] and not c['dev'] for c in conds):
        return 'UNCOVERED', conds, '사업주체가 LH 가 아님: %s' % ', '.join(sorted({w for c in conds for w in c['other_dev']}))
    return 'CONDITIONS', conds, ''


def load_source_rows(G, S):
    """LH 공급계획·건설공사현황·준공예정 블록 행 → 공통 모양."""
    sc = G['sources_02']
    ind = S['independent']['sources']
    out = []
    plan = sc['lh_supply_plan']
    for f in ind['lh_supply_plan']['files']:
        ftype = next((t for k, t in plan['file_type'].items() if k in os.path.basename(f['path'])), None)
        for sheet in readers.read_xls(f['path']).values():
            _, _, rows = readers.xls_table(sheet, f['header'])
            groups = {}
            order = []
            for ln, rec in rows:
                k = (str(rec.get(f['cols']['name']) or '').strip(), str(rec.get(f['cols']['type']) or '').strip())
                if k not in groups:
                    groups[k] = []
                    order.append(k)
                groups[k].append((ln, rec))
            for k in order:
                grp = groups[k]
                name, typ = k
                first = grp[0][1]
                m = re.match(r'^(.*\S)\s+(\S+)$', name)
                district, block = (m.group(1), m.group(2)) if m and re.match(sc['block_regex'], m.group(2)) else (name, '')
                months = sorted({str(r.get(f['cols']['month']) or '') for _, r in grp} - {''})
                mm = [re.search(plan['month_regex'], x) for x in months]
                dates = ['%s-%02d' % (x.group(1), int(x.group(2))) for x in mm if x]
                units = sum(to_int(r.get(f['cols']['units'])) or 0 for _, r in grp)
                lns = ','.join(str(ln) for ln, _ in grp)
                out.append(dict(source='lh_supply_plan', stages=plan['stages'], sido_strict=plan['sido_strict'], type=ftype, district=district, block=block,
                                sido=sido_of(G, first.get(plan['region_col'])), dates=dates, doc_path=f['path'], doc_url=f['url'],
                                locator='%s 엑셀 행 %s' % (os.path.basename(f['path']), lns), key=(f['path'], name, typ),
                                text=name,
                                quote='지구명 %s · 유형 %s · 지역 %s · 공급호수 합 %d · 공급예정시기 %s' % (
                                    name, typ, first.get(plan['region_col']), units, '/'.join(months))))
    pdf = S['sources']['lh_construction_pdf']
    rows, _, _ = readers.read_lh_construction_pdf(pdf['path'])
    pc = sc['lh_pdf']
    for r in rows:
        if any(r.get(k) != v for k, v in pc['row_filter'].items()):
            continue
        head = r['사업지구·현장명·시공회사(텍스트 경계 미분리)']
        district = head.split(' ')[0] if head else ''
        d = r[pc['date_col']]
        date = '20' + d if re.fullmatch(r'\d{2}-\d{2}-\d{2}', d) else d
        blk = r['블록'] if re.match(sc['block_regex'], r['블록'] or '') else ''
        out.append(dict(source='lh_pdf', stages=pc['stages'], sido_strict=pc['sido_strict'], type=None, district=district, block=blk,
                        sido=sido_of(G, r[pc['region_col']]), dates=[date], doc_path=pdf['path'],
                        doc_url=(pdf.get('doc_urls') or {}).get(pdf['path']),
                        locator='PDF %d쪽 줄 %d(공종 %s, 블록 %s)' % (r['쪽'], r['줄'], r['공종'], r['블록']),
                        key=('pdf', r['쪽'], r['줄']), text=head, quote=r['원문_줄']))
    comp = S['sources']['lh_completion_csv']
    cc = sc['lh_completion']
    header, crows = readers.read_table_csv(comp['path'], comp.get('encoding', 'utf-8-sig'))
    ix = {k: header.index(v) for k, v in comp['fields'].items()}
    ri, di = header.index(cc['region_col']), header.index(cc['date_col'])
    for ln, x in crows:
        out.append(dict(source='lh_completion', stages=cc['stages'], sido_strict=cc['sido_strict'], type=None, district=x[ix['district']],
                        block=x[ix['block']] if re.match(sc['block_regex'], x[ix['block']] or '') else '',
                        sido=sido_of(G, x[ri]), dates=[x[di]], doc_path=comp['path'],
                        doc_url=(comp.get('doc_urls') or {}).get(comp['path']), locator='CSV 행 %d' % ln,
                        key=('comp', ln), text=x[ix['district']] + ' ' + x[ix['block']],
                        quote=' · '.join('%s %s' % (h, v) for h, v in zip(header, x))))
    return out


def in_period(dates, period):
    s, e = period
    for d in dates:
        if len(d) == 7 and s[:7] <= d <= e[:7]:
            return True
        if len(d) >= 10 and s <= d[:10] <= e:
            return True
    return False


def row_fits(G, row, cond):
    """권위 원천 행이 프로그램 조건에 드는지."""
    if cond['stage'] not in row['stages']:
        return False
    if row['sido'] not in cond['codes']:
        return False
    if not in_period(row['dates'], cond['period']):
        return False
    want = set(cond['types']) | ({cond['stage']} if cond['stage'] in G['sources_02']['lh_supply_plan']['types'] else set())
    if row['type'] and want and row['type'] not in want:
        return False
    if cond['land']:
        if not row['block'] or any(w in row['text'] for w in G['sources_02']['non_public_land_words']):
            return False
    return True


def judge_block_row(G, reg, row, chain_set):
    """원천 블록 행 → (gap_type, verdict, 이유, 맞춘 id)."""
    if not row['block']:
        return 'PROJECT_MISSING', 'PENDING', '블록 키 없음(지구명 "%s") — 데이터셋 블록 키와 비교 못 함' % row['text'][:60], []
    hits = {}
    for rid in sorted(reg.ents):
        e = reg.ents[rid]
        if row['sido_strict'] and row['sido'] and e['sido'] and row['sido'] != e['sido']:
            continue
        how = reg.block_match(e, row['district'], row['block'])
        if how:
            hits[rid] = how
    ch = [r for r in hits if r in chain_set]
    if ch:
        return 'LINK_MISSING', 'ALREADY_PRESENT', '이 정책 사슬 사업과 블록 키 같음: %s' % '; '.join(
            '%s %s' % (hits[r], r) for r in ch[:5]), ch
    if not hits:
        return 'PROJECT_MISSING', 'MISSING', '레지스트리(원장·HOME)에 블록 키(%s %s)가 같은 사업 없음' % (row['district'], row['block']), []
    rids = sorted(hits)
    if len(rids) == 1:
        return 'LINK_MISSING', 'MISSING', '레지스트리에 있으나 이 정책 사슬에 연결 안 됨: %s %s' % (hits[rids[0]], rids[0]), rids
    return 'LINK_MISSING', 'PENDING', '후보 둘 이상(블록 키 같은 사업 %d개): %s' % (len(rids), id_list(G, reg, rids)), rids


# ---------------------------------------------------------------- 03 건축HUB 필지·법정동+블록

def hub_lines(zip_path, member):
    with zipfile.ZipFile(p(zip_path)) as z, z.open(member) as f:
        for i, line in enumerate(io.TextIOWrapper(f, encoding='utf-8', errors='replace')):
            yield i + 1, line.rstrip('\r\n').split('|')


def make_pnu(G, sgg, bjd, plat, bun, ji):
    land = G['hub']['plat_land'].get((plat or '').strip())
    b, j = (bun or '').strip(), (ji or '').strip()
    if not land or not re.fullmatch(r'\d+', b) or not re.fullmatch(r'\d*', j):
        return None
    bi, ji_ = int(b), int(j or 0)
    if bi <= 0 or bi > 9999 or ji_ > 9999:
        return None
    return '%s%s%s%04d%04d' % (sgg.strip(), bjd.strip(), land, bi, ji_)


def project_targets(S, reg, subjects):
    """사업 → 위치 키: PNU(원장 project_locations) · (법정동, 블록, 지구)(원장 위치·LH 블록 시군구 대응표)."""
    lh = load_json(S['independent']['keys']['lh_block_sgg'])
    out = {}
    for subj in subjects:
        e = reg.ents.get(subj)
        if not e:
            continue
        pnus = {}
        bjds = set()
        for loc in reg.locs.get(subj, []):
            if loc.get('pnu'):
                pnus[loc['pnu']] = loc.get('pnu_scope') or ''
            if loc.get('bjd_code'):
                bjds.add(loc['bjd_code'])
        blocks = []
        for d, b in e['pairs']:
            nb = norm_block(b)
            if not nb:
                continue
            bj = set(bjds)
            for m in lh:
                if m.get('bjd_code') and norm_block(m.get('block')) == nb and district_eq(m.get('district'), d, reg.suffixes):
                    bj.add(m['bjd_code'])
            for x in sorted(bj):
                blocks.append((x, nb, d))
        if pnus or blocks:
            out[subj] = {'pnus': pnus, 'blocks': sorted(set(blocks))}
    return out


def hub_scan(G, S, targets, suffixes):
    """대용량 기본개요·대지위치에서 위치 키가 맞는 기록 → {사업: {관리번호: 방법}}, {관리번호: 기본개요 칸}."""
    hc = G['hub']
    src = S['independent']['sources']['hub_basic']
    man = load_json(src['manifest'])
    by_pnu, by_blk = defaultdict(set), defaultdict(set)
    for subj, t in targets.items():
        for pn in t['pnus']:
            by_pnu[pn].add(subj)
        for bjd, nb, d in t['blocks']:
            by_blk[(bjd, nb)].add((subj, d))
    hits = defaultdict(dict)
    info = {}

    def check(subj_pk_how, ix, c, ln, part):
        g = lambda k: c[ix[k]] if k in ix and len(c) > ix[k] else ''
        pk = g('pk')
        pn = make_pnu(G, g('sgg'), g('bjd'), g('plat'), g('bun'), g('ji'))
        if pn and pn in by_pnu:
            for subj in by_pnu[pn]:
                subj_pk_how[subj].setdefault(pk, '%s 행 %d 필지 PNU %s' % (part, ln, pn))
        nb = norm_block(g('block'))
        if nb:
            for subj, d in by_blk.get((g('sgg') + g('bjd'), nb), ()):
                dn = g('district')
                if dn.strip() and not district_eq(dn, d, suffixes):
                    continue
                subj_pk_how[subj].setdefault(pk, '%s 행 %d 법정동 %s + 블록 %s' % (part, ln, g('sgg') + g('bjd'), g('block')))
        return pk
    parts = []
    for key in ('site', 'basic'):
        fm = man['files'][hc['parts'][key]]
        parts.append((key, fm, os.path.dirname(src['zip']) + '/' + fm['zip']))
    for _, fm, zip_path in parts:
        cols = [c['name'] for c in fm['columns']]
        ix = {k: cols.index(v) for k, v in hc['cols'].items() if v in cols}
        for ln, c in hub_lines(zip_path, fm['member']):
            if len(c) >= 2:
                check(hits, ix, c, ln, fm['member'])
    want = {pk for d in hits.values() for pk in d}
    _, fm, zip_path = parts[-1]
    cols = [c['name'] for c in fm['columns']]
    ix = {k: cols.index(v) for k, v in hc['cols'].items() if v in cols}
    for ln, c in hub_lines(zip_path, fm['member']):
        if len(c) > ix['pk'] and c[ix['pk']] in want and c[ix['pk']] not in info:
            info[c[ix['pk']]] = dict(line=ln, member=fm['member'], zip=zip_path,
                                     **{k: (c[i] if len(c) > i else '') for k, i in ix.items()})
    return hits, info


def judge_hub(G, reg, chain, subj, pk, how, info, targets):
    ev_text = ' '.join(chain['text'].get(subj, []))
    pks_in_ev = set(re.findall(G['hub']['pk_regex'], ev_text))
    owners = sorted(reg.hub_pk.get(pk, set()))
    rec = info.get(pk) or {}
    units = to_int(rec.get('units'))
    if subj in owners or pk in pks_in_ev:
        where = '원장 identifiers' if subj in owners else '이 정책 evidence'
        return 'ALREADY_PRESENT', '이 사업과 연결됨(%s) · 키: %s' % (where, how), [subj]
    if owners:
        return 'OUT_OF_SCOPE', '같은 필지·블록의 다른 사업 기록: %s · 키: %s' % (id_list(G, reg, owners), how), owners
    if not units:
        return 'PENDING', '총세대수 0 기록 — 주택 사업 기록인지 확인 필요 · 키: %s' % how, []
    m = re.search(r'PNU (\d{19})', how)
    if m and targets[subj]['pnus'].get(m.group(1)) == 'REPRESENTATIVE':
        return 'PENDING', '사업 필지가 대표 필지(REPRESENTATIVE) — 같은 필지 다른 블록 기록일 수 있음 · 키: %s' % how, []
    return 'MISSING', '이 사업 위치에 걸린 인허가 기록이 원장 identifiers·evidence 에 연결 안 됨 · 키: %s' % how, []


# ---------------------------------------------------------------- 03 Exa 고시 후보

class Exa:
    def __init__(self, G, allow):
        self.c = G['exa']
        self.allow = allow
        self.dir = self.c['cache_dir']
        os.makedirs(p(self.dir), exist_ok=True)
        self.calls_new = 0
        self.used = []  # 이번 실행에 읽은 캐시 파일(비용 합산)
        self.index = {}

    def existing(self):
        return sorted(x for x in os.listdir(p(self.dir)) if re.match(r'^(search|contents)_[0-9a-f]{16}\.json$', x))

    def call(self, kind, args, ident):
        name = '%s_%s.json' % (kind, sha16(ident))
        path = '%s/%s' % (self.dir, name)
        self.index[name] = ident
        if os.path.exists(p(path)):
            self.used.append(path)
            return load_json(path)
        if not self.allow or len(self.existing()) >= self.c['max_calls']:
            return None
        cmd = ['node', p(self.c['script']), kind] + list(args) + ['--save', p(path)]
        r = subprocess.run(cmd, cwd=p(''), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=self.c['timeout_sec'])
        self.calls_new += 1
        if r.returncode not in (0, 3) or not os.path.exists(p(path)):
            print('Exa %s 실패(%s): %s' % (kind, r.returncode, scrub(r.stderr.decode('utf-8', 'replace'))[:200]), file=sys.stderr)
            return None
        self.used.append(path)
        return load_json(path)

    def write_index(self):
        path = '%s/_index.json' % self.dir
        old = load_json(path) if os.path.exists(p(path)) else {}
        old.update(self.index)
        with open(p(path), 'w', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(dict(sorted(old.items())), ensure_ascii=False, indent=1) + '\n')

    def cost(self, paths=None):
        tot = 0.0
        for path in sorted(set(paths if paths is not None else self.used)):
            c = (load_json(path).get('costDollars') or {}).get('total')
            tot += float(c or 0)
        return round(tot, 4)


def host_kind(domains, url):
    """URL 호스트 → '정부·공공 원 게시처(기관)' · '전재·민간 게시물(기관)' · '도메인 표에 없음'(config/domains.json, 가장 긴 접미사)."""
    host = re.sub(r'^https?://', '', url or '').split('/')[0].lower()
    best = None
    for dom, v in domains.items():
        if (host == dom or host.endswith('.' + dom)) and (best is None or len(dom) > len(best[0])):
            best = (dom, v)
    if not best:
        return '도메인 표에 없음(%s)' % host
    return '%s(%s)' % ('정부·공공 원 게시처' if best[1].get('gov_original') else '전재·민간 게시물', best[1].get('org'))


def exa_key(G, reg, subj):
    """사업 → (질의 종류, 질의, 지구 기본명, 블록, 본문에 있어야 할 낱말들).
    블록에 글자가 있는 (지구, 블록)이 있으면 block 템플릿(지구는 가장 짧은 기본명), 없으면 name 템플릿
    (지구 칸이 있으면 '기본명 장소괄호', 없으면 사업 이름에서 괄호·조달청 머리를 뗀 것)."""
    e = reg.ents.get(subj)
    if not e:
        return None
    t = G['exa']['templates']
    blk = [(src_district(split_district(d)[0], reg.suffixes) or split_district(d)[0], b) for d, b in e['pairs']
           if norm_block(b) and re.search(G['exa']['block_letter_regex'], b)]
    for n in e['names']:
        m = re.match(G['site_match']['name_district_regex'], n or '')
        for _, b in list(blk):
            if m and site_in_text(n, m.group(1), b):
                blk.append((m.group(1), b))
    blk = [x for x in blk if x[0]]
    if blk:
        base, b = sorted(blk, key=lambda x: (len(x[0]), x))[0]
        return 'block', t['block'].format(district=base, block=b), base, b, [nz(base)]
    if e['pairs']:
        d, b = e['pairs'][0]
        base, q = split_district(d)
        words = [w for w in (base, q) if w]
        if norm_block(b) and norm_block(b) not in G['exa']['ignore_numeric_blocks']:
            return 'block', t['name'].format(name=' '.join(words)), base, b, [nz(base)]
    else:
        raw = e['names'][0] if e['names'] else ''
        for rx in G['exa']['name_strip_regex']:
            raw = re.sub(rx, ' ', raw)
        words = raw.split()
    words = [w for w in words if w]
    if not words or len(nz(''.join(words))) < G['site_match']['min_contains_len']:
        return None
    return 'name', t['name'].format(name=' '.join(words)), None, None, [nz(w) for w in words]


def exa_candidates(G, exa, reg, subj):
    """→ (상태 글, [후보 dict])."""
    k = exa_key(G, reg, subj)
    if not k:
        return '질의 키 없음(지구·블록·이름 모두 없음)', []
    kind, q, district, block, names = k
    res = exa.call('search', [q], q)
    if res is None:
        return 'Exa 미조회(캐시 없음 · --exa 없음 또는 호출 한도 %d 초과) · 질의 "%s"' % (G['exa']['max_calls'], q), []
    results = res.get('results') or []

    def hit_head(r):
        t = (r.get('title') or '') + ' ' + ' '.join(r.get('highlights') or [])
        return all(n in nz(t) for n in names[:1])
    urls = sorted({r['url'] for r in results if not G['exa']['contents_prefilter'] or hit_head(r)})
    if not urls:
        return 'Exa 검색 %d건 중 제목·하이라이트에 %s 없음 · 질의 "%s"' % (len(results), '지구' if kind == 'block' else '이름', q), []
    con = exa.call('contents', urls, '\n'.join(urls))
    if con is None:
        return 'Exa 본문 미조회(캐시 없음 · 호출 한도) · URL %d개' % len(urls), []
    title = {r['url']: r.get('title') for r in results}
    pub = {r['url']: r.get('publishedDate') for r in results}
    out = []
    aw = G['exa']['approval_words']
    for r in sorted(con.get('results') or [], key=lambda x: x.get('url') or ''):
        text = r.get('text') or ''
        if kind == 'block' and not re.search(G['exa']['block_letter_regex'], block):
            ok = re.search(re.escape(nz(district)) + G['exa']['numeric_block_regex'].format(block=re.escape(norm_block(block))),
                           nz(text).upper()) is not None
        else:
            ok = site_in_text(text, district, block) if kind == 'block' else all(n in nz(text) for n in names)
        if not ok or not all(w in text for w in aw):
            continue
        m = re.search(G['exa']['gosi_no_regex'], text)
        d = re.search(G['exa']['gosi_date_regex'], text)
        date = d.group(1) if d else None
        flat = re.sub(r'\s+', ' ', text)
        for rx, rep in G['exa']['quote_scrub']:
            flat = re.sub(rx, rep, flat)
        gt = re.search(G['exa']['gosi_title_regex'], flat)
        i = flat.find(block) if kind == 'block' and block in flat else max(flat.find(aw[0]), 0)
        out.append(dict(url=r.get('url'), title=gt.group(1).strip() if gt else re.sub(r'\s+', ' ', r.get('title') or title.get(r.get('url')) or '').strip(), gosi_no=re.sub(r'\s', '', m.group(1)) if m else None,
                        date=date, published=pub.get(r.get('url')), quote=flat[max(0, i - 60):i + 100]))
    return 'Exa 검색 %d건 · 본문 %d건 · 후보 %d건 · 질의 "%s"' % (len(results), len(urls), len(out), q), out


# ---------------------------------------------------------------- 정책 하나

def docs_url_map(work_dir, policies):
    """01 행의 doc_path → doc_url."""
    m = {}
    for pol in policies:
        for g in read_jsonl('%s/%s/%s' % (work_dir, pol['policy_id'], 'gaps.jsonl')):
            if g.get('stage_code') == '01' and g.get('doc_path') and g.get('doc_url'):
                m.setdefault(g['doc_path'], g['doc_url'])
    return m


def run_policy(C, policy):
    G, S = C.G, C.S
    pid, ca = policy['policy_id'], C.checked_at
    chain = C.chains[pid]
    cset = set(chain['subjects'])
    reg = C.reg
    rows, stats = [], {'programs': [], 'exa': [], 'subjects': len(chain['subjects']),
                       'hub_targets': sum(1 for x in chain['subjects'] if x in C.hub_targets)}
    others = {k: set(v['subjects']) for k, v in C.chains.items() if k != pid}
    labels = {o['policy_id']: policy_labels(o) for o in C.policies if o['policy_id'] != pid and policy_labels(o)}
    own = policy_labels(policy)
    # 02-a 지명
    for s in site_records(G, S, policy, C.docs_url):
        lab = {k: v for k, v in labels.items() if not any(x in (s.get('quote') or '') for x in own)}
        gt, v, why, ids = judge_site(G, reg, s, cset, others, lab)
        val = s['name'] + (' %s호' % s['units'] if s.get('units') else '')
        rows.append(gap_row(pid, '02', gt, v, why, val, ca, s['source'], s['doc_url'], s['doc_path'], s['locator'],
                            s['quote'], ref_list(G, ids)))
    # 02-b 프로그램 조건 → 원천 블록 행
    seen = set()
    for prog in read_jsonl('%s/%s/%s' % (S['paths']['work_dir'], pid, G['dataset']['policy_programs'])):
        if prog.get('program_kind') != 'SUPPLY':
            continue
        status, conds, memo = program_conditions(G, prog, policy['announced'])
        n0 = len(rows)
        if status == 'CONDITIONS':
            for cond in conds:
                for row in C.src_rows:
                    if row['key'] in seen or not row_fits(G, row, cond):
                        continue
                    seen.add(row['key'])
                    gt, v, why, ids = judge_block_row(G, reg, row, cset)
                    why += " · 프로그램 '%s' 조건(%s %s · %s · %s~%s, 원문 %s)" % (
                        prog['program_name'], cond['region_word'], '·'.join(cond['land'] + cond['types']) or '', cond['stage'],
                        cond['period'][0], cond['period'][1], page_locator(prog.get('page'), prog.get('printed_page')))
                    rows.append(gap_row(pid, '02', gt, v, why, '%s %s' % (row['district'], row['block']) if row['block'] else row['text'],
                                        ca, row['source'], row['doc_url'], row['doc_path'], row['locator'], row['quote'],
                                        ref_list(G, ids)))
        stats['programs'].append(dict(name=prog['program_name'], status=status, memo=memo, rows=len(rows) - n0,
                                      conds=[dict(field=c['field'], sentence=c['sentence'][:120], region=c['region_word'],
                                                  stage=c['stage'], period=c['period'], land=c['land'], types=c['types']) for c in conds],
                                      page=page_locator(prog.get('page'), prog.get('printed_page'))))
    # 02-c · 03-b 근거 없는 사업
    hub_targets = C.hub_targets
    ev_path = '%s/%s/%s' % (S['paths']['work_dir'], pid, G['dataset']['evidence_glob'])
    later = []
    for stage in ('02', '03'):
        for subj in chain['subjects']:
            ok, evr = stage_status(G, chain, subj, stage)
            if ok:
                continue
            vs = sorted({'%s/%s' % (r['verdict'], r.get('basis')) for r in evr}) or ['행 없음']
            note = next((r.get('notes') for r in evr if r.get('notes')), '') or ''
            why = '%s 근거 없음(evidence stage_%s: %s)%s' % ('사업화' if stage == '02' else '인허가', stage, ', '.join(vs),
                                                      ' · ' + note[:160] if note else '')
            if stage == '02':
                rows.append(gap_row(pid, '02', 'EVIDENCE_MISSING', 'MISSING', why, '%s %s' % (subj, reg.name(subj)), ca,
                                    'evidence', None, ev_path, 'subject_id %s · field stage_%s' % (subj, stage), None, subj))
            else:
                later.append((subj, why))
    # 03-a 건축HUB 기록
    for subj in chain['subjects']:
        for pk, how in sorted(C.hub_hits.get(subj, {}).items()):
            v, why, ids = judge_hub(G, reg, chain, subj, pk, how, C.hub_info, hub_targets)
            rec = C.hub_info.get(pk) or {}
            val = '%s · 블록 %s · 승인일 %s · 총세대수 %s · 관리번호 %s' % (
                rec.get('name') or '', rec.get('block') or '', rec.get('approve') or '', rec.get('units') or '', pk)
            src = S['independent']['sources']['hub_basic']
            rows.append(gap_row(pid, '03', 'LINK_MISSING', v, why + ' · 대상 사업 %s %s' % (subj, reg.name(subj)), val, ca, 'hub_basic',
                                src.get('doc_url'), rec.get('zip') or src['zip'],
                                '%s 행 %s (%s %s)' % (rec.get('member') or '', rec.get('line') or '', G['hub']['cols']['pk'], pk),
                                rec.get('addr'), ref_list(G, ids) or subj))
    # 03-b
    for subj, why in later:
        st, cands = exa_candidates(G, C.exa, reg, subj)
        stats['exa'].append(dict(subject=subj, status=st, candidates=len(cands)))
        rows.append(gap_row(pid, '03', 'EVIDENCE_MISSING', 'MISSING', why + ' · ' + st, '%s %s' % (subj, reg.name(subj)), ca,
                            'evidence', None, ev_path, 'subject_id %s · field stage_03' % subj, None, subj))
        for c in cands:
            loc = ' · '.join(x for x in ('고시번호 ' + c['gosi_no'] if c['gosi_no'] else '고시번호 미상',
                                         '고시일 ' + c['date'] if c['date'] else '고시일 미상') if x)
            rows.append(gap_row(pid, '03', 'EVIDENCE_MISSING', 'PENDING',
                                'Exa 본문에 지구·블록(또는 이름)과 \'%s\' 가 있음 — 원 파일 미확보(받지 않음), 고시 원문으로 사업 범위 확인 필요 · 게시처 %s · 대상 사업 %s %s' % (
                                    '·'.join(G['exa']['approval_words']), host_kind(C.domains, c['url']), subj, reg.name(subj)),
                                c['title'] or c['url'], ca, 'exa', c['url'], None, loc, c['quote'], subj))
    return rows, stats


# ---------------------------------------------------------------- gaps.jsonl 쓰기

def write_gaps(path, rows, stages):
    """stages 에 드는 행만 바꾼다. 다른 단계 행은 원래 글자 그대로, 그 자리를 지킨다(새 행은 옛 행이 있던 자리, 없으면 끝)."""
    keep, at = [], None
    if os.path.exists(p(path)):
        with open(p(path), encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                if json.loads(line).get('stage_code') in stages:
                    if at is None:
                        at = len(keep)
                    continue
                keep.append(line if line.endswith('\n') else line + '\n')
    new = [json.dumps(scrub_json(r), ensure_ascii=False) + '\n' for r in rows]
    at = len(keep) if at is None else at
    os.makedirs(os.path.dirname(p(path)), exist_ok=True)
    with open(p(path), 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(keep[:at] + new + keep[at:]))


# ---------------------------------------------------------------- 보고서

def report(G, S, policies, stage, stats):
    names = {'02': '사업화', '03': '인허가'}
    out = ['# 누락 검증 %s %s (권위 원천 → 데이터셋)' % (stage, names[stage]), '',
           '`tools/research/chain/gaps.py` 가 만든다(손으로 고치지 않는다). 행 단위 근거는 '
           '`docs/speech/research/dataset/_work/<policy_id>/gaps.jsonl`(stage_code "%s"). 규칙은 `tools/research/chain/config/gap_rules.json`.' % stage, '',
           '판정: 누락 확정 · 범위 밖 · 이미 있음 · 판단 보류. 판정은 규칙(TOOL)이 낸 것이고 사람이 확인하지 않았다. '
           'gap_type: LINK_MISSING(레지스트리에 있으나 정책 사슬에 연결 안 됨) · PROJECT_MISSING(레지스트리에도 없음) · '
           'EVIDENCE_MISSING(사슬 사업의 단계 근거 없음).', '']
    if stage == '02':
        out += ['후보 묶음(source): `ORIGINAL`·후속 발표 폴더 = 원문 지명 → 레지스트리, `lh_supply_plan`·`lh_pdf`·`lh_completion` = '
                '조건이 원문 한 문장에서 확정된 공급 프로그램의 LH 블록 행, `evidence` = 사업화 근거 없는 데이터셋 사업.', '']
    else:
        out += ['후보 묶음(source): `hub_basic` = 데이터셋 사업 필지(PNU)·법정동+블록에 걸린 건축HUB 주택인허가 기록, '
                '`evidence` = 인허가 근거 없는 데이터셋 사업, `exa` = Exa 로 찾은 사업계획승인 고시 후보(원 파일 미확보).', '']
    hdr = '| gap_type · source | ' + ' | '.join(GAP_LABEL.values()) + ' | 합계 |'
    for pol in policies:
        pid = pol['policy_id']
        rows = [g for g in read_jsonl('%s/%s/%s' % (S['paths']['work_dir'], pid, G['output']['gaps_file'])) if g.get('stage_code') == stage]
        out += ['## %s %s' % (pid, pol['name']), '', '후보 %d건 · 판정 없는 후보 %d건' % (
            len(rows), sum(1 for r in rows if r['verdict'] not in GAP_LABEL)), '', hdr, '|---|---|---|---|---|---|']
        groups = sorted({(r['gap_type'], src_group(r['source'])) for r in rows}, key=lambda x: (GAP_TYPES.index(x[0]), x[1]))
        for gt, sg in groups:
            rs = [r for r in rows if r['gap_type'] == gt and src_group(r['source']) == sg]
            out.append('| %s · %s | ' % (gt, sg) + ' | '.join(str(sum(1 for r in rs if r['verdict'] == v)) for v in GAP_LABEL) + ' | %d |' % len(rs))
        out.append('| 합계 | ' + ' | '.join(str(sum(1 for r in rows if r['verdict'] == v)) for v in GAP_LABEL) + ' | %d |' % len(rows))
        st = stats.get(pid)
        if stage == '02' and st:
            cnt = defaultdict(int)
            for x in st['programs']:
                cnt[x['status']] += 1
            out += ['', '공급 프로그램(SUPPLY) %d개: 조건 확정 %d · 조건 미상 %d · 원천 범위 밖 %d' % (
                len(st['programs']), cnt['CONDITIONS'], cnt['UNKNOWN'], cnt['UNCOVERED']), '']
            for x in st['programs']:
                if x['status'] != 'UNKNOWN':
                    c = x['conds'][0]
                    out.append("- [%s] '%s' (%s) — %s %s~%s %s%s · 후보 행 %d%s" % (
                        {'CONDITIONS': '조건 확정', 'UNCOVERED': '원천 범위 밖'}[x['status']], x['name'], x['page'] or '',
                        c['region'], c['period'][0], c['period'][1], c['stage'], (' · ' + '·'.join(c['land'] + c['types'])) if c['land'] or c['types'] else '',
                        x['rows'], (' · ' + x['memo']) if x['memo'] else ''))
            unk = [x['name'] for x in st['programs'] if x['status'] == 'UNKNOWN']
            if unk:
                out.append('- [조건 미상] %s' % ', '.join(unk))
        if stage == '03' and st:
            ex = st['exa']
            out += ['', '정책 사슬 사업 %d개 중 위치 키(PNU·법정동+블록)가 있어 건축HUB 대용량을 찾은 사업 %d개 · '
                        'Exa 고시 찾기 대상(인허가 근거 없는 사업) %d개 · 고시 후보 %d건' % (
                            st['subjects'], st['hub_targets'], len(ex), sum(x['candidates'] for x in ex)), '']
        pick = [r for r in rows if r['verdict'] == 'MISSING'] + [r for r in rows if r['verdict'] == 'PENDING']
        mx = G['output']['report_max_rows']
        out += ['', '대표 사례(누락 확정 먼저, 앞 %d건):' % mx, '']
        for r in pick[:mx]:
            where = ('%s %s' % (os.path.basename(r['doc_path'] or r['doc_url'] or ''), r['locator'] or '')).strip()
            out.append('- [%s] %s `%s` — %s (%s)' % (r['verdict_label'], r['gap_type'], r['candidate_value'], r['reason'][:220], where))
        out.append('')
    notes = G['output'].get('report_notes', {}).get(stage) or []
    if notes:
        out += ['## 한계', ''] + ['- ' + x for x in notes] + ['']
    if stage == '03':
        ex = stats.get('_exa') or {}
        out += ['## Exa 호출', '', '캐시 `%s` · 호출(캐시 파일) %d회(한도 %d) · 응답 비용 합 $%s' % (
            G['exa']['cache_dir'], ex.get('files', 0), G['exa']['max_calls'], ex.get('cost', 0)), '']
    return '\n'.join(out) + '\n'


def src_group(s):
    return s if s in ('ORIGINAL', 'lh_supply_plan', 'lh_pdf', 'lh_completion', 'evidence', 'hub_basic', 'exa') else '후속 발표'


# ---------------------------------------------------------------- 실행

class Ctx:
    pass


def build_context(policies_all, allow_exa):
    C = Ctx()
    C.G = load_config('gap_rules.json')
    C.S = load_config('stage_sources.json')
    C.checked_at = C.S['checked_at']
    C.policies = policies_all
    C.reg = Registry(C.G, C.S)
    C.reg.prepare_keys()
    links = load_json(C.G['dataset']['links'])['rows']
    C.chains = {pol['policy_id']: load_chain(C.G, C.S, pol, links) for pol in policies_all}
    C.docs_url = docs_url_map(C.S['paths']['work_dir'], policies_all)
    C.src_rows = load_source_rows(C.G, C.S)
    subjects = sorted({s for ch in C.chains.values() for s in ch['subjects']})
    C.hub_targets = project_targets(C.S, C.reg, subjects)
    C.hub_hits, C.hub_info = hub_scan(C.G, C.S, C.hub_targets, C.reg.suffixes)
    C.exa = Exa(C.G, allow_exa)
    C.domains = load_config('domains.json')['domains']
    return C


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--policy', action='append', help='정책 id 또는 slug(여러 번)')
    ap.add_argument('--all', action='store_true', help='policies.json 의 정책 전부')
    ap.add_argument('--exa', action='store_true', help='캐시에 없는 Exa 질의를 부른다(없으면 캐시만 읽음)')
    a = ap.parse_args(argv)
    if not a.all and not a.policy:
        ap.error('--policy 또는 --all')
    allp = load_config('policies.json')['policies']
    todo = allp if a.all else [x for x in allp if x['policy_id'] in a.policy or x['slug'] in a.policy]
    if not todo:
        ap.error('정책 없음: %s' % a.policy)
    C = build_context(allp, a.exa)
    stats = {}
    for pol in todo:
        rows, st = run_policy(C, pol)
        stats[pol['policy_id']] = st
        write_gaps('%s/%s/%s' % (C.S['paths']['work_dir'], pol['policy_id'], C.G['output']['gaps_file']), rows,
                   C.G['output']['stages'])
        cnt = defaultdict(int)
        for r in rows:
            cnt['%s %s %s' % (r['stage_code'], r['gap_type'], r['verdict'])] += 1
        print('%s: %d행 · %s' % (pol['policy_id'], len(rows), dict(sorted(cnt.items()))))
    C.exa.write_index()
    files = ['%s/%s' % (C.G['exa']['cache_dir'], x) for x in C.exa.existing()]
    stats['_exa'] = {'files': len(files), 'cost': C.exa.cost(files)}
    print('Exa: 새 호출 %d회 · 캐시 파일 %d개 · 비용 합 $%s' % (C.exa.calls_new, len(files), stats['_exa']['cost']))
    if a.all:
        from common import write_text
        write_text(C.G['output']['report_02'], report(C.G, C.S, allp, '02', stats))
        write_text(C.G['output']['report_03'], report(C.G, C.S, allp, '03', stats))


if __name__ == '__main__':
    main()
