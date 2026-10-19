#!/usr/bin/env python3
"""토지이음 고시 조회·대조(정책 무관): 02 사업화·03 인허가의 비정형 원천(고시문)을 사업 속성으로 찾아 evidence 로 만든다.

실행(내려받은 파일을 읽으므로 -P -E)
    python3 -P -E tools/research/chain/gosi.py --policy <policy_id 또는 slug> [--refresh] [--offline]
    python3 -P -E tools/research/chain/gosi.py --all [--refresh] [--offline]

네트워크 단계(--offline 이면 건너뜀)
    대상 사업(evidence.jsonl 의 stage_02·stage_03 UNVERIFIED + 단계 순서 모순)의 지구·블록·이름으로 고시제목 검색어를 만들어
    토지이음 고시 목록을 HTTP POST 로 받고, 게이트를 지난 고시의 상세 HTML·고시문 첨부를 받는다. 저장은
    <단계 폴더>/원본/web/gosi/, 기록은 그 단계 원본/web/manifest.json 에 키 접두 u1_ 로 더한다(기존 항목은 그대로).
    같은 질의·상세·첨부는 gosi/_cache/ 기록이 있으면 다시 부르지 않는다(--refresh 때만). 요청 간격·한도는 config/gosi_rules.json.
오프라인 단계
    저장된 목록·상세·첨부만 읽어 dataset/_work/<policy_id>/evidence_gosi.jsonl(설계 5.2·6.1)과 03.인허가/고시대조.md 를 쓴다.
    실행 시각을 쓰지 않아 같은 입력이면 바이트까지 같다.
"""

import argparse
import csv
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import logging
import zipfile
from collections import Counter, OrderedDict, defaultdict
from datetime import date, datetime, timezone

sys.dont_write_bytecode = True
logging.getLogger('pypdf').setLevel(logging.ERROR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common  # noqa: E402
from common import p, load_config, nz, norm_block, split_district, site_in_text, write_jsonl, write_text  # noqa: E402
from home import load_dump_table  # noqa: E402
from stages.independent import name_in, name_variants, strip_block_from_district  # noqa: E402

FIELDS_ORDER = ['policy_id', 'subject_table', 'subject_id', 'field', 'external_ref', 'stage_code', 'dataset_value',
                'external_value', 'doc_url', 'doc_path', 'locator', 'original_value', 'verdict', 'basis', 'search_scope',
                'checked_by', 'checked_at', 'notes']


def sha16(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:16]


def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<!--.*?-->|<[^>]+>', ' ', s or '', flags=re.S))).strip()


# ---------------------------------------------------------------- 경로

class Paths:
    """단계 폴더의 gosi 저장 경로(저장소 상대)."""

    def __init__(self, cfg, G):
        self.cfg, self.G = cfg, G
        self.research = cfg['paths']['research_dir']
        self.stage_dir = {sc['code']: sc['dir'] for sc in cfg['stages']}

    def gosi(self, code):
        return '%s/%s/%s' % (self.research, self.stage_dir[code], self.G['store']['subdir'])

    def cache(self, code):
        return '%s/%s' % (self.gosi(code), self.G['store']['cache_subdir'])

    def manifest(self, code):
        return '%s/%s/%s' % (self.research, self.stage_dir[code], self.G['store']['manifest'])

    def codes(self):
        return sorted(set(self.G['targets']['fields'].values()))

    def find_cache(self, name):
        """캐시 기록 이름 → (단계, 기록) 또는 None. 두 단계 폴더를 다 본다."""
        for code in self.codes():
            path = '%s/%s' % (self.cache(code), name)
            if os.path.exists(p(path)):
                with open(p(path), encoding='utf-8') as f:
                    return code, json.load(f)
        return None


# ---------------------------------------------------------------- 대상·사업 키

def read_jsonl(path):
    if not os.path.exists(p(path)):
        return []
    with open(p(path), encoding='utf-8') as f:
        return [json.loads(x) for x in f if x.strip()]


def load_targets(cfg, G, pol):
    """evidence.jsonl·review_stage_order.csv → {subject_id: {codes, refs, order, positive}}."""
    tc = G['targets']
    work = '%s/%s' % (cfg['paths']['work_dir'], pol['policy_id'])
    ev = read_jsonl(work + '/evidence.jsonl')
    T = {}

    def ent(sid):
        return T.setdefault(sid, dict(codes=set(), refs=set(), order=set(), order_rows=[]))

    for r in ev:
        if r['subject_table'] != 'projects' or r['field'] not in tc['fields']:
            continue
        if r['verdict'] in tc['verdicts'] and not re.search(tc['skip_note_regex'], r.get('notes') or ''):
            e = ent(r['subject_id'])
            e['codes'].add(tc['fields'][r['field']])
            if r.get('external_ref'):
                e['refs'].add(r['external_ref'])
    path = '%s/%s' % (work, tc['order_review_csv'])
    other_order = []
    if os.path.exists(p(path)):
        with open(p(path), encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                code = row[tc['order_stage_col']]
                if code not in tc['fields'].values():
                    other_order.append(row)
                    continue
                e = ent(row[tc['order_subject_col']])
                e['codes'].add(code)
                e['order'].add(code)
                e['order_rows'].append(row)
                if row.get('project_id'):
                    e['refs'].add(row['project_id'])
    pos = defaultdict(set)
    for r in ev:
        if r['subject_table'] == 'projects' and r['verdict'] in G['positive_verdicts'] and r['basis'] not in (None, 'EXISTENCE'):
            pos[r['subject_id']].add(r['stage_code'])
    for sid, e in T.items():
        e['positive'] = pos.get(sid, set())
    T_other_order[pol['policy_id']] = other_order
    return T


T_other_order = {}  # 정책 → 고시 대상 단계가 아닌 단계 순서 모순 행(보고용)


def block_pattern(b):
    m = re.fullmatch(r'([A-Za-z]*)-?0*(\d+)([A-Za-z]?)', re.sub(r'(BL|블록|블럭)$', '', str(b).replace(' ', ''), flags=re.I))
    if not m:
        return None
    return r'(?<![A-Za-z0-9])%s-?0*%s%s(?![0-9])' % (re.escape(m.group(1)), m.group(2), re.escape(m.group(3)))


def subject_keys(cfg, G, pl):
    """HOME 사업 레코드 → 위치 키. 블록 키(지구 후보·블록 후보) 또는 이름 키(이름 변형·검색 낱말)."""
    kc = cfg['independent']['keys']
    qc = G['queries']
    name = (pl.get('name') or '').strip()
    district, blocks = pl.get('district'), [pl.get('block')] if pl.get('block') else []
    if not (district and blocks):
        m = re.match(kc['name_site_regex'], name)
        district, blocks = (m.group(1), [x.strip() for x in re.split(r'[,·]', m.group(2))]) if m else (None, [])
        if any(re.search(r'[가-힣]', b) for b in blocks):
            district, blocks = None, []
    district = strip_block_from_district(district, blocks)
    base, q = split_district(district)
    k = dict(name=name, region=pl.get('region') or '', muni=pl.get('municipality') or '', district=district or '',
             program=pl.get('program') or '',
             q=q, block_key=bool(base and blocks), bases=[], blocks=[], names=[], tokens=[])
    if k['block_key']:
        bl = []
        for b in blocks:
            bl.append(b)
            for a in kc['block_aliases']:
                if split_district(a['district'])[0] == base and norm_block(b) in [norm_block(x) for x in a['blocks']]:
                    bl += a['blocks']
            m = re.match(kc['block_loose']['regex'], str(b))
            if m:
                bl.append(m.group(1) + m.group(2))
        k['blocks'] = sorted({norm_block(x) for x in bl if norm_block(x)})
        bases = [base]
        for b in bl:
            pat = block_pattern(b)
            hit = re.search(pat + qc['name_block_suffix_regex'], name, flags=re.I) if pat else None
            if hit:
                m = re.search(qc['name_district_regex'], name[:hit.start()])
                d = split_district(m.group(1))[0] if m else ''
                if len(d) >= qc['min_len'] and d not in bases and not any(t in d for t in qc['stop_tokens']):
                    bases.append(d)
        k['bases'] = bases
        k['tokens'] = [q] if len(q) >= qc['min_token_len'] else list(bases)
    else:
        own = set()
        for x in re.split(r'\s+', '%s %s' % (k['muni'], k['region'])):
            if x:
                own |= {nz(x), re.sub(r'(특별시|광역시|특별자치시|특별자치도|시|군|구|도)$', '', nz(x))}
        k['names'] = [x for x in name_variants(name, kc) if x not in own]
        toks = []
        for t in re.split(qc['name_split_regex'], name):
            t = re.sub(qc['strip_suffix_regex'], '', t)
            if len(t) < qc['min_token_len'] or t in qc['stop_tokens'] or nz(t) in own:
                continue
            if re.fullmatch(qc['admin_token_regex'], t) or not re.search(r'[가-힣A-Za-z]', t):
                continue
            if t not in toks:
                toks.append(t)
        k['tokens'] = toks[:qc['max_per_subject']]
    return k


def key_label(k):
    if k['block_key']:
        return '블록 키 지구 %s · 블록 %s' % ('/'.join(k['bases']), ','.join(k['blocks']))
    return '이름 키 %s' % ('/'.join(k['names']) or k['name'])


# ---------------------------------------------------------------- HOME 값

class Home:
    """HOME 덤프에서 대조에 쓰는 단계 사실·eum 고시 seq(같은 원천 판단)."""

    def __init__(self, cfg, G):
        d = cfg['home']['dump_dir']
        self.payload = {r['entity_id']: r['payload'] for r in load_dump_table(d, 'project')}
        self.tables = {n: load_dump_table(d, n) for n in ('evidence_bridge', 'document_evidence', 'stage_evidence')}
        for rows in self.tables.values():
            for r in rows:
                common.collect_actors(r)
        self.G = G
        self.stage_name = {sc['code']: sc['home_stage'] for sc in cfg['stages']}

    def values(self, pid, code):
        """[(구분, 날짜, 날짜 종류, 출처)]"""
        hc = self.G['home_compare'][code]
        st = self.stage_name[code]
        out = []

        def facts(fs, src):
            for f in fs or []:
                if f.get('stage') != st or f.get('kind') != 'ACTUAL' or not f.get('date'):
                    continue
                if f.get('event_type') in hc['exclude_event_types']:
                    continue
                g = hc['fact_milestones'].get(f.get('milestone'))
                if g:
                    out.append((g, f['date'], hc['fact_date_kind'], src))
        for r in self.tables['evidence_bridge']:
            if r['payload'].get('project_id') == pid:
                facts(r['payload'].get('facts'), 'HOME evidence_bridge')
        for r in self.tables['document_evidence']:
            if pid in (r['payload'].get('matched_project_ids') or []):
                facts(r['payload'].get('facts'), 'HOME document_evidence')
        for r in self.tables['stage_evidence']:
            pl = r['payload']
            sel = pl.get('selected') or {}
            if pl.get('project_id') == pid and pl.get('stage') == st and sel.get('event_date'):
                ev = hc['stage_evidence_events'].get(sel.get('event_type'))
                if ev:
                    out.append((ev[0], sel['event_date'], ev[1], 'HOME stage_evidence'))
        return sorted(set(out))

    def seqs(self, pid):
        s = set()
        for name in ('evidence_bridge', 'document_evidence'):
            for r in self.tables[name]:
                pl = r['payload']
                if pl.get('project_id') == pid or pid in (pl.get('matched_project_ids') or []):
                    s |= set(re.findall(r'eum\.go\.kr[^"\s]*?[?&]seq=(\d+)', json.dumps(pl, ensure_ascii=False)))
        return s


# ---------------------------------------------------------------- 목록·상세 파서

def decode(b, enc):
    return b.decode(enc, 'replace')


def parse_list(text):
    """목록 HTML → [{seq, date, gosino, title, org, tag}]"""
    out = []
    for row in re.findall(r'<tr class="center">(.*?)</tr>', text, re.S):
        tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
        m = re.search(r"gvGosiDet\.jsp\?seq=(\d+)[^']*'\s*title='([^']*)'", row)
        if len(tds) < 4 or not m:
            continue
        tag = re.search(r'\[(신규|변경|[^\]]{1,4})\]', clean(tds[2]))
        out.append(dict(seq=m.group(1), date=clean(tds[0]), gosino=clean(tds[1]), title=html.unescape(m.group(2)).strip(),
                        org=clean(tds[3]), tag=tag.group(1) if tag else ''))
    return out


def parse_detail(text):
    """상세 HTML → {title, gosino, dept, date, body, attachments[(file, name)]}. 문의처(전화)는 읽지 않는다."""
    d = {}
    m = re.search(r'<thead>.*?<th[^>]*>(.*?)</th>', text, re.S)
    d['title'] = clean(m.group(1)) if m else ''
    for lab, key in (('고시번호', 'gosino'), ('담당기관', 'dept'), ('고시일', 'date')):
        m = re.search(r'<th[^>]*>\s*%s\s*</th>\s*<td[^>]*>(.*?)</td>' % lab, text, re.S)
        d[key] = clean(m.group(1)) if m else ''
    m = re.search(r'<!-- // 컨텐츠 내용 -->(.*?)<!-- 컨텐츠 내용 // -->', text, re.S)
    d['body'] = clean(m.group(1)) if m else ''
    d['attachments'] = [(f, clean(n)) for f, n in
                        re.findall(r"href=\"javascript:download\('[^']*',\s*'([^']*)'\)\">(.*?)</a>", text, re.S)]
    return d


def gosi_org(gosino, dept):
    """고시 기관 = 고시번호의 '… 고시 제…호' 앞. 없으면 담당기관."""
    m = re.match(r'^(.*?)\s*고시\s*제', gosino or '')
    return (m.group(1).strip() if m else '') or (dept or '').strip()


def attach_text(path, ext, pages):
    try:
        if ext == 'pdf':
            import pypdf
            r = pypdf.PdfReader(p(path))
            return ' '.join((r.pages[i].extract_text() or '') for i in range(min(pages, len(r.pages))))
        if ext == 'hwpx':
            with zipfile.ZipFile(p(path)) as z:
                names = sorted(n for n in z.namelist() if re.match(r'Contents/section\d+\.xml$', n))
                return ' '.join(clean(z.read(n).decode('utf-8', 'replace')) for n in names[:1])
    except Exception as e:  # 깨진 첨부는 본문 대신 HTML 을 쓴다
        return 'ERROR:%s' % type(e).__name__
    return ''


# ---------------------------------------------------------------- 종류·게이트·구분

def kind_of(G, title):
    for k in G['kinds']:
        if re.search(k['title_regex'], title or ''):
            return k
    return None


def change_of(G, text):
    """고시 문장(첫 '…고시합니다' 앞)의 마지막 처분 낱말 → 최초/변경. 못 정하면 None."""
    c = G['change']
    t = re.sub(r'[\s()（）「」『』《》〈〉\[\]]', '', text or '')
    m = re.search(c['head_end_regex'], t)
    head = (t[:m.start()] if m else t[:c['head_max']])[-c['head_max']:]
    last = None
    for last in re.finditer(c['verb_regex'], head):
        pass
    if not last:
        return None
    if re.search(c['change_before_regex'], head[:last.start()]) or re.search(c['change_after_regex'], head[last.end():]):
        return '변경'
    return '최초'


def region_ok(G, gosino, org, region):
    rg = re.sub(r'\s', '', region or '')
    for s in (gosi_org(gosino, ''), org):
        s = re.sub(r'\s', '', s or '')
        for pre in G['region']['sido_prefixes']:
            if s.startswith(pre):
                return not rg or rg.startswith(pre[:2]) or pre.startswith(rg[:2])
    return True


def gate(k, kind, title, others=()):
    """제목(또는 글)에 사업이 있는지 → 게이트 설명 또는 None.
    블록 키: 블록 고시는 지구+블록(site_in_text), 지구 고시는 지구명(뒤가 숫자 아님)·장소 구분 괄호.
    이름 키: 이름 변형(name_in). 다른 대상 사업의 더 긴 이름이 같은 글에 있으면 그 사업 것으로 본다."""
    if k['block_key']:
        for d in k['bases']:
            if kind['scope'] == 'block':
                for b in k['blocks']:
                    if site_in_text(title, d + ('(%s)' % k['q'] if k['q'] else ''), b):
                        return '지구+블록 %s %s' % (d, b)
            elif name_in(title, d) and (not k['q'] or k['q'] in nz(title)):
                return '지구 %s' % d
        return None
    t = nz(title)
    for v in k['names']:
        if name_in(title, v):
            if any(v in o and o != v and o in t and o not in k['names'] for o in others):
                continue
            return '이름 %s' % v
    return None


# ---------------------------------------------------------------- 네트워크

class Blocked(Exception):
    pass


class Http:
    def __init__(self, G, budget=None, opener=None):
        self.s = G['source']
        self.budget = self.s['request_budget'] if budget is None else budget
        self.used = 0
        self.last = 0.0
        self.opener = opener or self._urlopen

    def _urlopen(self, req):
        with urllib.request.urlopen(req, timeout=self.s['timeout_sec']) as r:
            return r.status, dict(r.headers), r.read()

    def can(self, n=1):
        return self.used + n <= self.budget

    def post(self, url, params):
        if not self.can():
            raise Blocked('요청 한도 %d 에 닿음' % self.budget)
        wait = self.s['delay_sec'] - (time.monotonic() - self.last)
        if wait > 0:
            time.sleep(wait)
        data = urllib.parse.urlencode(params, encoding=self.s['encoding']).encode('ascii')
        req = urllib.request.Request(url, data=data, headers={
            'User-Agent': self.s['user_agent'], 'Content-Type': 'application/x-www-form-urlencoded'})
        self.used += 1
        try:
            status, headers, body = self.opener(req)
        except urllib.error.HTTPError as e:
            status, headers, body = e.code, dict(e.headers or {}), e.read() or b''
        finally:
            self.last = time.monotonic()
        return status, headers, body


def fill(tpl, **kw):
    return OrderedDict((k, str(v).format(**kw)) for k, v in tpl.items())


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class Store:
    """저장·캐시·manifest 기록(이번 실행에서 새로 쓴 파일만 manifest 에 더한다)."""

    def __init__(self, P, G):
        self.P, self.G = P, G
        self.new = defaultdict(OrderedDict)  # 단계 → manifest 키 → 항목

    def save(self, code, name, data, key, url, kind, extra=None):
        rel = '%s/%s' % (self.P.gosi(code), name)
        os.makedirs(os.path.dirname(p(rel)), exist_ok=True)
        with open(p(rel), 'wb') as f:
            f.write(data)
        rel_m = os.path.relpath(rel, os.path.dirname(self.P.manifest(code)))
        e = OrderedDict([('filename', rel_m), ('url', url),
                         ('bytes', len(data)), ('sha256', hashlib.sha256(data).hexdigest()), ('fetched_at', now_iso()),
                         ('method', self.G['store']['method']), ('kind', kind)])
        e.update(extra or {})
        self.new[code][self.G['store']['key_prefix'] + key] = e
        return rel

    def record(self, code, name, obj):
        rel = '%s/%s' % (self.P.cache(code), name)
        os.makedirs(os.path.dirname(p(rel)), exist_ok=True)
        with open(p(rel), 'w', encoding='utf-8', newline='\n') as f:
            f.write(json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=True) + '\n')

    def write_manifests(self):
        """manifest.json 에 u1_ 항목을 더한다. 기존 항목은 글자 그대로(같은 키가 이미 있으면 u1_ 것만 바꾼다)."""
        pre = self.G['store']['key_prefix']
        for code, items in sorted(self.new.items()):
            path = p(self.P.manifest(code))
            with open(path, encoding='utf-8') as f:
                m = json.load(f, object_pairs_hook=OrderedDict)
            for k in items:
                assert k.startswith(pre)
            m['files'].update(items)
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(json.dumps(m, ensure_ascii=False, indent=1) + '\n')


def query_id(G, query):
    return sha16(json.dumps([G['source']['list_url'], query, G['source']['page_size']], ensure_ascii=False))


def fetch_query(H, S, G, code, query, refresh, max_pages):
    """고시제목 검색 → 캐시 기록. 쪽 행 수가 page_size 보다 적으면 끝."""
    s = G['source']
    qid = query_id(G, query)
    name = 'q_%s.json' % qid
    got = S.P.find_cache(name)
    if got and not refresh and got[1].get('status') == 'ok':
        return got[1], False
    pages, n, trunc = [], 0, False
    for page in range(1, max_pages + 1):
        status, _, body = H.post(s['list_url'], fill(s['list_params'], page=page, query=query, page_size=s['page_size']))
        text = decode(body, s['encoding'])
        if status != 200 or s['list_empty_marker'] not in text:
            raise Blocked('목록 응답 이상: 질의 %r 쪽 %d HTTP %s · 앞부분 %r' % (query, page, status, text[:300]))
        fname = 'list_%s_p%d.html' % (qid, page)
        S.save(code, fname, body, 'list_%s_p%d' % (qid, page),
               '%s (POST zonenm=%s&listSize=%d&pageNo=%d)' % (s['list_url'], query, s['page_size'], page),
               '토지이음 고시정보 목록(고시제목 검색)', {'query': query})
        rows = parse_list(text)
        pages.append(fname)
        n += len(rows)
        if len(rows) < s['page_size']:
            break
    else:
        trunc = True
    rec = OrderedDict([('query', query), ('qid', qid), ('stage', code), ('pages', pages), ('result_count', n),
                       ('truncated', trunc), ('requests', len(pages)), ('fetched_at', now_iso()), ('status', 'ok')])
    S.record(code, name, rec)
    return rec, True


def fetch_detail(H, S, G, code, seq, refresh):
    s = G['source']
    name = 'd_%s.json' % seq
    got = S.P.find_cache(name)
    if got and not refresh and got[1].get('status') == 'ok':
        return got[1], False
    status, _, body = H.post(s['detail_url'], fill(s['detail_params'], seq=seq))
    text = decode(body, s['encoding'])
    if status != 200 or s['detail_marker'] not in text:
        raise Blocked('상세 응답 이상: seq %s HTTP %s · 앞부분 %r' % (seq, status, text[:300]))
    fname = 'eum_gosi_seq%s.html' % seq
    S.save(code, fname, body, 'det_%s' % seq, '%s?seq=%s' % (s['detail_url'], seq), '토지이음 고시 상세 HTML')
    rec = OrderedDict([('seq', seq), ('stage', code), ('file', fname), ('requests', 1), ('fetched_at', now_iso()),
                       ('status', 'ok')])
    S.record(code, name, rec)
    return rec, True


def pick_attachment(G, atts):
    a = G['attachments']
    ok = [(f, n) for f, n in atts if f.rsplit('.', 1)[-1].lower() in a['exts'] and not re.search(a['skip_regex'], f.rsplit('/', 1)[-1])]
    ok.sort(key=lambda x: (0 if re.search(a['prefer_regex'], x[0].rsplit('/', 1)[-1]) else 1, atts.index(x)))
    return ok[:a['max_per_gosi']]


def safe_name(s):
    return re.sub(r'[\\/:*?"<>|\s]+', '_', s).strip('_')[:120]


def fetch_attachment(H, S, G, code, seq, i, file, refresh):
    s = G['source']
    name = 'a_%s_%d.json' % (seq, i)
    got = S.P.find_cache(name)
    if got and not refresh and got[1].get('status') in ('ok', 'error'):
        return got[1], False
    status, headers, body = H.post(s['download_url'], fill(s['download_params'], seq=seq, file=file))
    ctype = ''.join(v for k, v in headers.items() if k.lower() == 'content-type')
    fname = 'eum_gosi_seq%s_%s' % (seq, safe_name(file.rsplit('/', 1)[-1]))
    if status != 200 or not body or 'text/html' in ctype.lower():
        rec = OrderedDict([('seq', seq), ('stage', code), ('file', None), ('source_file', file), ('requests', 1),
                           ('fetched_at', now_iso()), ('status', 'error'), ('http', status), ('content_type', ctype)])
    else:
        S.save(code, fname, body, 'att_%s_%d' % (seq, i), '%s (POST file=%s&gosi=Y&seq=%s)' % (s['download_url'], file, seq),
               '토지이음 고시 첨부(고시문)')
        rec = OrderedDict([('seq', seq), ('stage', code), ('file', fname), ('source_file', file), ('requests', 1),
                           ('fetched_at', now_iso()), ('status', 'ok')])
    S.record(code, name, rec)
    return rec, True


# ---------------------------------------------------------------- 정책 하나의 준비(네트워크·오프라인 공통)

class Ctx:
    def __init__(self, cfg, G, pol, home, ledger, all_names):
        self.cfg, self.G, self.pol = cfg, G, pol
        self.P = Paths(cfg, G)
        self.T = load_targets(cfg, G, pol)
        self.home = home
        self.ledger = ledger
        self.keys = {}
        for sid, e in self.T.items():
            refs = sorted(r for r in e['refs'] if r in home.payload)
            e['refs'] = refs
            e['in_ledger'] = sid in ledger
            self.keys[sid] = subject_keys(cfg, G, home.payload[refs[0]]) if refs else None
        self.others = all_names

    def queries(self):
        """질의 → (저장 단계 = 그 질의를 부르는 가장 낮은 단계, 쪽 한도: 지구 질의 source.max_pages · 이름 질의 queries.max_pages_name)."""
        q = {}
        for sid, e in sorted(self.T.items()):
            k = self.keys[sid]
            if not k:
                continue
            mp = self.G['source']['max_pages'] if k['block_key'] else self.G['queries']['max_pages_name']
            for t in k['tokens']:
                if len(t) >= self.G['queries']['min_len']:
                    old = q.get(t, ('99', 0))
                    q[t] = (min([old[0]] + sorted(e['codes'])), max(old[1], mp))
        return q


def stage_kinds(G, code):
    return [k for k in G['kinds'] if k['stage'] == code]


def muni_of(G, k):
    m = re.match(G['muni_check']['muni_regex'], nz(k['muni']))
    return m.group(1) if m else ''


def allowed_kinds(G, program):
    for pk in G['program_kinds']:
        if re.search(pk['program_regex'], program or ''):
            return set(pk['kinds'])
    return {k['id'] for k in G['kinds']}


def hits_for(ctx, sid, code, lists):
    """대상 사업·단계 → 게이트를 지난 목록 행 [(item, kind, gate, query)] (seq 중복 제거). 사업 유형(program)에 맞는 종류만."""
    k = ctx.keys[sid]
    ok_kinds = allowed_kinds(ctx.G, k['program'])
    out, seen = [], set()
    for t in k['tokens']:
        rec = lists.get(t)
        if not rec:
            continue
        for it in rec['items']:
            kind = kind_of(ctx.G, it['title'])
            if not kind or kind['stage'] != code or kind['id'] not in ok_kinds or it['seq'] in seen:
                continue
            if not region_ok(ctx.G, it['gosino'], it['org'], k['region']):
                continue
            g = gate(k, kind, it['title'], ctx.others)
            if g:
                seen.add(it['seq'])
                out.append((it, kind, g, t))
    out.sort(key=lambda x: (x[0]['date'], x[0]['seq']))
    return out


def select_hits(ctx, code, hits):
    """02: 종류마다 가장 이른 것 하나. 03: 모두."""
    if code != '02':
        return hits, []
    keep, rest = [], []
    first = {}
    for h in hits:
        if h[1]['id'] not in first:
            first[h[1]['id']] = h
            keep.append(h)
        elif h[0]['gosino'] not in {x[0]['gosino'] for x in keep + rest}:
            rest.append(h)
    return keep, rest


def load_lists(ctx, qmap):
    """저장된 목록 → {질의: {rec, items}}."""
    out = {}
    for qtext in sorted(qmap):
        got = ctx.P.find_cache('q_%s.json' % query_id(ctx.G, qtext))
        if not got or got[1].get('status') != 'ok':
            continue
        code, rec = got
        items = []
        for fname in rec['pages']:
            with open(p('%s/%s' % (ctx.P.gosi(code), fname)), 'rb') as f:
                items += parse_list(decode(f.read(), ctx.G['source']['encoding']))
        out[qtext] = dict(rec=rec, items=items, code=code)
    return out


# ---------------------------------------------------------------- 네트워크 단계

def network(ctx, H, S, refresh, log):
    G = ctx.G
    qmap = ctx.queries()
    stats = Counter()
    for qtext, (code, mp) in sorted(qmap.items()):
        got = ctx.P.find_cache('q_%s.json' % query_id(G, qtext))
        if not (got and not refresh) and not H.can(mp):
            stats['질의 한도 초과'] += 1
            continue
        rec, new = fetch_query(H, S, G, code, qtext, refresh, mp)
        stats['질의 새로' if new else '질의 캐시'] += 1
    lists = load_lists(ctx, qmap)
    want = OrderedDict()
    for sid, e in sorted(ctx.T.items()):
        if not ctx.keys[sid] or not e['in_ledger']:
            continue
        for code in sorted(e['codes']):
            keep, _ = select_hits(ctx, code, hits_for(ctx, sid, code, lists))
            for it, kind, g, t in keep:
                want.setdefault(it['seq'], kind['stage'])
    for seq, code in want.items():
        if not (ctx.P.find_cache('d_%s.json' % seq) and not refresh) and not H.can():
            stats['상세 한도 초과'] += 1
            continue
        rec, new = fetch_detail(H, S, G, code, seq, refresh)
        stats['상세 새로' if new else '상세 캐시'] += 1
    for code_pref in ('03', '02'):
        for seq, code in want.items():
            if code != code_pref:
                continue
            got = ctx.P.find_cache('d_%s.json' % seq)
            if not got:
                continue
            with open(p('%s/%s' % (ctx.P.gosi(got[0]), got[1]['file'])), 'rb') as f:
                d = parse_detail(decode(f.read(), G['source']['encoding']))
            for i, (file, _) in enumerate(pick_attachment(G, d['attachments'])):
                if not ctx.P.find_cache('a_%s_%d.json' % (seq, i)) and not H.can():
                    stats['첨부 한도 초과'] += 1
                    continue
                rec, new = fetch_attachment(H, S, G, code, seq, i, file, refresh)
                stats['첨부 새로' if new else '첨부 캐시'] += 1
    log('%s: 네트워크 %s · 이번 요청 누계 %d' % (ctx.pol['policy_id'], dict(sorted(stats.items())), H.used))
    return stats


# ---------------------------------------------------------------- 오프라인 단계

def doc_text(ctx, seq):
    """상세·첨부 → (상세 dict, 상세 경로, [(첨부 경로, 확장자, 글)])"""
    got = ctx.P.find_cache('d_%s.json' % seq)
    if not got:
        return None, None, []
    code, rec = got
    path = '%s/%s' % (ctx.P.gosi(code), rec['file'])
    with open(p(path), 'rb') as f:
        d = parse_detail(decode(f.read(), ctx.G['source']['encoding']))
    atts = []
    for i in range(ctx.G['attachments']['max_per_gosi']):
        a = ctx.P.find_cache('a_%s_%d.json' % (seq, i))
        if a and a[1].get('file'):
            ap = '%s/%s' % (ctx.P.gosi(a[0]), a[1]['file'])
            ext = ap.rsplit('.', 1)[-1].lower()
            txt = attach_text(ap, ext, ctx.G['attachments']['pdf_pages']) if ext in ctx.G['attachments']['text_exts'] else ''
            atts.append((ap, ext, txt))
    return d, path, atts


def days_between(a, b):
    try:
        da = date(int(a[:4]), int(a[4:6]), int(a[6:8]))
        db = date(int(b[:4]), int(b[4:6]), int(b[6:8]))
    except ValueError:
        return None
    return (db - da).days


def compare_home(G, gub, gdate, hv):
    """(verdict, external_value, 메모)."""
    if not hv:
        return 'SOURCED', None, '외부 입력 없음, 원천값 수집'
    tol = G['home_compare']['date_tolerance_days']
    gd = re.sub(r'\D', '', gdate or '')
    ext = ' / '.join('%s %s(%s, %s)' % (g, d, dk, src) for g, d, dk, src in hv)

    def close(h):
        hd = re.sub(r'\D', '', h[1])
        if len(hd) < 8 or len(gd) < 8:
            return len(hd) >= 6 and hd[:6] == gd[:6] and h[2] == '고시일' and len(hd) < 8
        n = days_between(hd, gd)
        return n is not None and 0 <= n <= tol.get(h[2], 0)
    same = [h for h in hv if close(h)]
    if same:
        if any(h[0] == gub for h in same):
            h = next(h for h in same if h[0] == gub)
            return 'MATCH', ext, '같은 칸: 구분·%s(HOME %s %s / 고시일 %s)' % (h[2], h[2], h[1], gdate)
        return 'MISMATCH', ext, '다른 칸: 구분 HOME %s / 고시 본문 %s(같은 날짜 %s)' % (same[0][0], gub, same[0][1])
    kind = [h for h in hv if h[0] == gub]
    if kind:
        return 'MISMATCH', ext, '다른 칸: %s 날짜 HOME %s / 고시일 %s' % (gub, ','.join(h[1] for h in kind), gdate)
    return 'SOURCED', ext, '외부 입력과 비교할 수 있는 칸 없음(HOME 은 %s 만) · 원천값 수집' % '/'.join(sorted({h[0] for h in hv}))


def row(ctx, sid, code, **kw):
    e = ctx.T[sid]
    r = OrderedDict((f, None) for f in FIELDS_ORDER)
    r.update(policy_id=ctx.pol['policy_id'], subject_table='projects', subject_id=sid, field='stage_' + code,
             external_ref=e['refs'][0] if e['refs'] else None, stage_code=code, checked_by='TOOL',
             checked_at=ctx.cfg['checked_at'])
    r.update(kw)
    return r


def list_scope(ctx, lists, k):
    bits = []
    for t in k['tokens']:
        rec = lists.get(t)
        if rec:
            r = rec['rec']
            bits.append("'%s' 결과 %d건%s(조회 %s)" % (t, r['result_count'], ' · 앞 %d쪽까지만' % len(r['pages']) if r['truncated'] else ' 모두',
                                                   r['fetched_at'][:10]))
        else:
            bits.append("'%s' 미조회" % t)
    return '%s · 고시제목 검색 %s · 기간 %s · 조회 키: %s' % (
        ctx.G['source']['label'], '; '.join(bits), ctx.G['source']['coverage'], key_label(k))


def list_doc(ctx, lists, k):
    for t in k['tokens']:
        rec = lists.get(t)
        if rec:
            return '%s/%s' % (ctx.P.gosi(rec['code']), rec['rec']['pages'][0])
    return None


def build(ctx):
    """오프라인: 저장된 목록·상세·첨부 → (evidence 행, 사업·단계 요약)."""
    G = ctx.G
    lists = load_lists(ctx, ctx.queries())
    rows, summary = [], []
    det_url = G['source']['detail_url']
    for sid, e in sorted(ctx.T.items()):
        k = ctx.keys[sid]
        for code in sorted(e['codes']):
            sm = OrderedDict([('subject_id', sid), ('code', code), ('in_ledger', e['in_ledger']), ('order', code in e['order']),
                              ('name', k['name'] if k else ''), ('key', key_label(k) if k else '키 없음'), ('verdict', None),
                              ('gosi', []), ('note', '')])
            summary.append(sm)
            if not k:
                sm['verdict'], sm['note'] = 'UNVERIFIED', 'HOME 사업 레코드 없음'
                continue
            hits = hits_for(ctx, sid, code, lists)
            keep, rest = select_hits(ctx, code, hits)
            if not e['in_ledger']:
                sm['verdict'] = 'NO_LEDGER'
                sm['gosi'] = ['%s %s 「%s」' % (h[0]['gosino'], h[0]['date'], h[0]['title']) for h in hits]
                continue
            pid = e['refs'][0]
            hv = ctx.home.values(pid, code)
            hseq = set()
            for ref in e['refs']:
                hseq |= ctx.home.seqs(ref)
            for it, kind, g, t in keep:
                d, dpath, atts = doc_text(ctx, it['seq'])
                title = (d or {}).get('title') or it['title']
                gosino = (d or {}).get('gosino') or it['gosino']
                gdate = (d or {}).get('date') or it['date']
                dept = (d or {}).get('dept') or it['org']
                org = gosi_org(gosino, dept)
                g2 = gate(k, kind, title + ' ' + ((d or {}).get('body') or ''), ctx.others) if d else g
                if d and not g2:
                    continue
                mu = muni_of(G, k)
                if d and mu and not k['block_key'] and mu not in nz(' '.join([title, d['body'], d['dept'], gosino] + [a[2] for a in atts])):
                    continue
                gub, why = None, ''
                reads = []
                for src, txt in [('첨부 고시문 %s' % a[0].rsplit('/', 1)[-1], a[2]) for a in atts] + [('상세 본문', (d or {}).get('body'))]:
                    if txt and not txt.startswith('ERROR:') and change_of(G, txt):
                        reads.append((src, change_of(G, txt)))
                if reads:
                    gub, why = reads[0][1], reads[0][0]
                    if len({x[1] for x in reads}) > 1:
                        why += '(다름: %s)' % ', '.join('%s 은 %s' % x for x in reads[1:] if x[1] != reads[0][1])
                else:
                    gub = '변경' if re.search(G['change']['title_change_regex'], title) else '최초'
                    why = '제목'
                if gub != ('변경' if re.search(G['change']['title_change_regex'], title) else '최초'):
                    why += ' · 제목과 다름(제목 %s)' % ('변경' if gub == '최초' else '최초')
                v, ext, cnote = compare_home(G, gub, gdate, hv)
                basis = 'SAME_SOURCE' if it['seq'] in hseq else 'INDEPENDENT'
                val = '%s 「%s」 고시일 %s · %s · %s' % (gosino, title, gdate, kind['label'], gub)
                note = '고시 조회(토지이음 HTTP) · 질의 \'%s\' · 게이트 %s · 고시 기관 %s · 담당기관 %s · 구분 근거 %s · %s%s' % (
                    t, g, org, dept, why, cnote, ' · 같은 종류 고시 %d건 더(목록 값만): %s' % (
                        len(rest), '; '.join('%s %s' % (h[0]['gosino'], h[0]['date']) for h in rest[:5]))
                    if code == '02' and rest else '')
                docs = [(dpath, 'seq %s 상세(고시번호·담당기관·고시일·본문)' % it['seq'])] if dpath else \
                    [('%s/%s' % (ctx.P.gosi(lists[t]['code']), lists[t]['rec']['pages'][0]), '목록 행 seq %s(상세 미수신)' % it['seq'])]
                docs += [(a[0], '첨부 %s 1~%d쪽 고시 문장' % (a[0].rsplit('/', 1)[-1], G['attachments']['pdf_pages']))
                         for a in atts if a[1] in G['attachments']['text_exts'] and a[2] and not a[2].startswith('ERROR:')]
                for path, loc in docs:
                    rows.append(row(ctx, sid, code, dataset_value=val, original_value=val, external_value=ext,
                                    doc_url='%s?seq=%s' % (det_url, it['seq']), doc_path=path,
                                    locator='토지이음 고시 %s · %s' % (gosino, loc), verdict=v, basis=basis, notes=note))
                sm['gosi'].append(OrderedDict([('seq', it['seq']), ('gosino', gosino), ('date', gdate), ('title', title),
                                               ('kind', kind['label']), ('gubun', gub), ('why', why), ('verdict', v),
                                               ('org', org), ('external', ext), ('cnote', cnote)]))
            if sm['gosi']:
                vs = [x['verdict'] for x in sm['gosi']]
                sm['verdict'] = 'MISMATCH' if 'MISMATCH' in vs else 'MATCH' if 'MATCH' in vs else 'SOURCED'
                continue
            sm['cands'] = near_misses(ctx, k, code, lists)
            scope = list_scope(ctx, lists, k)
            doc = list_doc(ctx, lists, k)
            reason = absent_reason(ctx, sid, code, k, lists)
            if reason is None:
                rows.append(row(ctx, sid, code, doc_url=None, doc_path=doc, verdict='ABSENT_CONFIRMED', basis='INDEPENDENT',
                                search_scope=scope, locator=None,
                                notes='고시 조회(토지이음 HTTP) · 지구 고시는 있으나 이 블록의 %s 고시 없음 → 미도달 확인' %
                                      '·'.join(x['label'] for x in stage_kinds(G, code))))
                sm['verdict'] = 'ABSENT_CONFIRMED'
            else:
                rows.append(row(ctx, sid, code, doc_url=None, doc_path=doc, verdict='UNVERIFIED', basis=None,
                                notes='고시 조회(토지이음 HTTP) · 찾아본 범위: %s · 미도달로 두지 않음: %s' % (scope, reason)))
                sm['verdict'], sm['note'] = 'UNVERIFIED', reason
    rows.sort(key=lambda r: (r['subject_id'], r['field'], r['doc_url'] or '', r['doc_path'] or '', r['locator'] or ''))
    return rows, summary


def near_misses(ctx, k, code, lists, n=3):
    """게이트는 못 지났지만 검색어·종류·지역이 맞는 고시(사람 확인용 후보, evidence 아님)."""
    ok_kinds = allowed_kinds(ctx.G, k['program'])
    out = []
    for t in k['tokens']:
        for it in (lists.get(t) or {}).get('items', []):
            kind = kind_of(ctx.G, it['title'])
            if kind and kind['stage'] == code and kind['id'] in ok_kinds and region_ok(ctx.G, it['gosino'], it['org'], k['region']):
                x = '%s %s 「%s」' % (it['gosino'], it['date'], it['title'])
                if x not in out:
                    out.append(x)
    return out[:n]


def absent_reason(ctx, sid, code, k, lists):
    """미도달 확인 조건을 못 채운 이유. 채우면 None."""
    a = ctx.G['absent'].get(code)
    e = ctx.T[sid]
    if not k['tokens']:
        return '검색어로 쓸 낱말 없음(이름이 행정동·일반 낱말뿐)'
    if not all(t in lists for t in k['tokens']):
        return '질의 일부 미조회(요청 한도·차단)'
    if not a:
        return '이 단계는 고시를 못 찾아도 미도달로 보지 않음(규칙 absent.%s 없음)' % code
    if a['key'] == 'block' and not k['block_key']:
        return '이름 키 사업(이름이 고시 제목 표기와 다를 수 있음)'
    if any(lists[t]['rec']['truncated'] for t in k['tokens']):
        return '검색 결과가 쪽 한도를 넘어 일부만 봄'
    if code in e['order']:
        return '단계 순서 모순 대상(뒤 단계 근거·HOME 단계 주장이 있음)'
    later = sorted(c for c in e['positive'] if c >= code)
    if later:
        return '다른 원천에 이 단계·뒤 단계 근거 있음(%s)' % ','.join(later)
    if a.get('need_district_seen'):
        seen = any(gate(dict(k, block_key=True), dict(scope='district'), it['title']) and
                   region_ok(ctx.G, it['gosino'], it['org'], k['region'])
                   for t in k['tokens'] for it in lists[t]['items'])
        if not seen:
            return '검색 결과에 같은 지구 고시가 없음(지구 표기가 고시 제목과 다를 수 있음)'
    return None


# ---------------------------------------------------------------- 보고(md)

def order_table(ctx, summary):
    out = []
    oc = ctx.G['targets']['order_stage_col']
    for r in T_other_order.get(ctx.pol['policy_id'], []):
        out.append(OrderedDict([('subject_id', r[ctx.G['targets']['order_subject_col']]), ('name', ''), ('stage', r[oc]),
                                ('claim', r.get('HOME_주장', '')), ('result', '남음'), ('gosi', ''),
                                ('note', '고시 대상 단계 아님(%s)' % r[oc])]))
    for sid, e in sorted(ctx.T.items()):
        for r in e['order_rows']:
            sm = next((s for s in summary if s['subject_id'] == sid and s['code'] == r[ctx.G['targets']['order_stage_col']]), None)
            ok = sm and sm['gosi'] and sm['in_ledger']
            out.append(OrderedDict([('subject_id', sid), ('name', sm['name'] if sm else ''), ('stage', r[oc]), ('claim', r.get('HOME_주장', '')),
                                    ('result', '해결(고시 근거)' if ok else '남음'),
                                    ('gosi', '; '.join('%s %s %s' % (g['gosino'], g['date'], g['gubun']) for g in (sm['gosi'] if sm else []))),
                                    ('note', '' if ok else ('원장 사업 없음' if sm and not sm['in_ledger'] else (sm['note'] if sm else '')))]))
    out.sort(key=lambda x: (x['subject_id'], x['stage'], x['claim']))
    return out


def md_escape(s):
    return (s or '').replace('|', '／').replace('\n', ' ')


def report_md(cfg, G, parts):
    L = ['# 고시 대조 02 사업화 · 03 인허가 (토지이음 고시정보)', '',
         '`tools/research/chain/gosi.py` 가 만든다(손으로 고치지 않는다). 규칙 `tools/research/chain/config/gosi_rules.json`. '
         '행 단위 근거는 `docs/speech/research/dataset/_work/<policy_id>/evidence_gosi.jsonl`. 원 파일은 '
         '`02.사업화/원본/web/gosi/`·`03.인허가/원본/web/gosi/`(manifest 키 u1_).', '',
         '대상: 엔진 evidence 에서 stage_02·stage_03 이 UNVERIFIED 인 사업·단계 + 단계 순서 모순(review_stage_order.csv). '
         '판정은 규칙(TOOL)이 낸 것이고 사람이 확인하지 않았다. 사업·단계 판정 = 그 항목 고시 행 중 MISMATCH > MATCH > SOURCED, 고시가 없으면 '
         'ABSENT_CONFIRMED 또는 UNVERIFIED.', '']
    tot = Counter()
    for ctx, rows, summary, stats in parts:
        pol = ctx.pol
        L += ['## %s %s' % (pol['policy_id'], pol['name']), '']
        subj = {s['subject_id'] for s in summary}
        found = {g['seq'] for s in summary for g in s['gosi'] if s['in_ledger']}
        L.append('대상 사업 %d개 · 항목 %d개(02 %d · 03 %d) · 원장 사업 없음 %d개 · 찾은 고시 %d건(evidence 행 %d)' % (
            len(subj), len(summary), sum(1 for s in summary if s['code'] == '02'), sum(1 for s in summary if s['code'] == '03'),
            len({s['subject_id'] for s in summary if not s['in_ledger']}), len(found), len(rows)))
        L += ['', '| 단계 | 대상 | MATCH | MISMATCH | SOURCED | ABSENT_CONFIRMED | UNVERIFIED | 원장 없음 |', '|---|---|---|---|---|---|---|---|']
        for code in ('02', '03'):
            c = Counter(s['verdict'] for s in summary if s['code'] == code)
            n = sum(c.values())
            L.append('| %s | %d | %d | %d | %d | %d | %d | %d |' % (code, n, c['MATCH'], c['MISMATCH'], c['SOURCED'],
                                                                c['ABSENT_CONFIRMED'], c['UNVERIFIED'], c['NO_LEDGER']))
            for k_, v_ in c.items():
                tot[(code, k_)] += v_
        ot = order_table(ctx, summary)
        if ot:
            L += ['', '단계 순서 모순 %d건 중 해결(고시 근거) %d건 · 남음 %d건' % (
                len(ot), sum(1 for x in ot if x['result'].startswith('해결')), sum(1 for x in ot if x['result'] == '남음')), '',
                '| subject_id | 사업 | 단계 | HOME 주장 | 결과 | 고시(번호·고시일·구분) | 남은 이유 |', '|---|---|---|---|---|---|---|']
            for x in ot:
                L.append('| %s | %s | %s | %s | %s | %s | %s |' % tuple(md_escape(x[c]) for c in ('subject_id', 'name', 'stage', 'claim', 'result', 'gosi', 'note')))
        mm = [(s, g) for s in summary for g in s['gosi'] if g['verdict'] == 'MISMATCH' and s['in_ledger']]
        if mm:
            L += ['', 'HOME 불일치:', '']
            for s, g in mm:
                L.append('- `%s` %s — %s %s 「%s」 · %s' % (s['subject_id'], md_escape(s['name']), g['gosino'], g['date'],
                                                          md_escape(g['title']), md_escape(g['cnote'])))
        ex = [(s, g) for s in summary for g in s['gosi'] if s['in_ledger']][:8]
        if ex:
            L += ['', '대표 사례(찾은 고시, 앞 8건):', '']
            for s, g in ex:
                L.append('- [%s] `%s` %s — %s %s 「%s」 · %s · %s(근거 %s) · 고시 기관 %s' % (
                    g['verdict'], s['subject_id'], md_escape(s['name']), g['gosino'], g['date'], md_escape(g['title']),
                    g['kind'], g['gubun'], g['why'], md_escape(g['org'])))
        nl = [s for s in summary if not s['in_ledger']]
        if nl:
            L += ['', '원장에 사업이 없는 지명(evidence 를 만들지 않음):', '']
            for s in nl:
                L.append('- `%s` %s (%s) — 게이트 지난 고시 %d건%s' % (s['subject_id'], md_escape(s['name']), s['code'],
                                                              len(s['gosi']), ': ' + md_escape('; '.join(s['gosi'][:3])) if s['gosi'] else ''))
        cs = [s for s in summary if s.get('cands') and s['verdict'] == 'UNVERIFIED' and s['in_ledger']]
        if cs:
            L += ['', '사람 확인 후보(검색어·종류·지역은 맞으나 이름·블록 게이트를 못 지난 고시, evidence 아님):', '']
            for s in cs:
                L.append('- `%s` %s (%s) — %s' % (s['subject_id'], md_escape(s['name']), s['code'], md_escape('; '.join(s['cands']))))
        uv = Counter(s['note'] for s in summary if s['verdict'] == 'UNVERIFIED')
        if uv:
            L += ['', 'UNVERIFIED 이유:', '']
            for k_, v_ in sorted(uv.items(), key=lambda x: (-x[1], x[0])):
                L.append('- %s: %d' % (md_escape(k_), v_))
        L.append('')
    L += ['## 요청·캐시', '']
    reqs = Counter()
    P = Paths(cfg, G)
    for code in P.codes():
        d = p(P.cache(code))
        if os.path.isdir(d):
            for fn in sorted(os.listdir(d)):
                if fn.endswith('.json'):
                    with open(os.path.join(d, fn), encoding='utf-8') as f:
                        rec = json.load(f)
                    reqs[fn[0]] += rec.get('requests', 0)
                    reqs[fn[0] + '#'] += 1
    L.append('캐시 기록 기준 HTTP 요청 %d회(목록 %d회·질의 %d개, 상세 %d회, 첨부 %d회). 요청 간격 %.1f초 이상, 한 실행 한도 %d회.' % (
        reqs['q'] + reqs['d'] + reqs['a'], reqs['q'], reqs['q#'], reqs['d'], reqs['a'], G['source']['delay_sec'],
        G['source']['request_budget']))
    L += ['', '## 한계', '',
          '- 토지이음 고시제목 검색은 제목 부분 문자열 검색이라 공백 표기가 다르면 못 찾는다. 검색어는 지구 기본명·이름 낱말이고, 대조(게이트)는 '
          '지구+블록(블록 고시)·지구명(지구 고시)·이름 변형 전체로 한다.',
          '- 미도달 확인(ABSENT_CONFIRMED)은 03·블록 키 사업에서 지구 고시는 보이는데 블록 고시가 없고, 다른 원천·뒤 단계 근거와 단계 순서 모순이 '
          '없을 때만 둔다. 이름 키 사업과 02 는 못 찾으면 UNVERIFIED.',
          '- 02 는 사업·종류마다 가장 이른 고시 하나만 상세를 받는다(변경 차수는 비고에 목록 값만).',
          '- 최초/변경 구분은 첨부 고시문(PDF·HWPX) → 상세 본문 고시 문장 순으로 정하고(마지막 처분 낱말 앞뒤의 \'변경\'), 둘 다 없으면 제목으로 정한다(근거 칸에 표시). HWP 첨부는 받기만 한다.',
          '- 이름 키 사업은 고시 상세(제목·본문·담당기관·첨부 글)에 사업 시군구 이름이 있어야 하지만, 사업시행자 주소에만 나온 경우도 통과한다(사람 확인 필요).',
          '- Exa 보조 검색은 이번에 쓰지 않았다(토지이음 HTTP 가 막히지 않았고, 못 찾은 사업은 이름 표기 차이·토지이음 미등재로 Exa 로도 원 파일을 확정하기 어렵다).',
          '- 고시 원문에 있는 담당자 이름·전화번호는 원 파일에만 있고 이 문서와 evidence 에는 옮기지 않는다(고시 기관·부서명만).', '']
    return '\n'.join(L)


# ---------------------------------------------------------------- 실행

def load_all():
    cfg = load_config('stage_sources.json')
    G = load_config('gosi_rules.json')
    pols = load_config('policies.json')['policies']
    return cfg, G, pols


def ledger_ids(G):
    with open(p(G['targets']['ledger_projects']), encoding='utf-8') as f:
        return {r['local_project_id'] for r in json.load(f)['rows']}


def all_target_names(cfg, G, pols, home):
    names = set()
    for pol in pols:
        for sid, e in load_targets(cfg, G, pol).items():
            for ref in e['refs']:
                if ref in home.payload:
                    k = subject_keys(cfg, G, home.payload[ref])
                    names |= set(k['names'])
    return sorted(names)


def check_privacy(paths):
    hits = []
    for f in paths:
        if os.path.exists(p(f)):
            t = open(p(f), encoding='utf-8').read()
            hits += [(f, 'actor') for a in common.ACTORS if a in t]
            m = common.PHONE_RE.search(t)
            if m:
                hits.append((f, 'phone'))
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--policy', help='policy_id 또는 slug (config/policies.json)')
    g.add_argument('--all', action='store_true')
    ap.add_argument('--refresh', action='store_true', help='캐시가 있어도 다시 부른다')
    ap.add_argument('--offline', action='store_true', help='네트워크 단계를 건너뛴다(저장된 것만 읽음)')
    a = ap.parse_args(argv)
    cfg, G, pols = load_all()
    todo = pols if a.all else [x for x in pols if a.policy in (x['policy_id'], x['slug'])]
    if not todo:
        raise SystemExit('정책 없음: %s' % a.policy)
    home = Home(cfg, G)
    ledger = ledger_ids(G)
    names = all_target_names(cfg, G, pols, home)
    H = Http(G)
    S = Store(Paths(cfg, G), G)
    if not a.offline:
        try:
            for pol in todo:
                network(Ctx(cfg, G, pol, home, ledger, names), H, S, a.refresh, print)
        except Blocked as e:
            print('멈춤: %s' % e)
        finally:
            S.write_manifests()
        print('HTTP 요청 %d회(이번 실행)' % H.used)
    parts, outs = [], []
    for pol in pols:
        ctx = Ctx(cfg, G, pol, home, ledger, names)
        path = '%s/%s/evidence_gosi.jsonl' % (cfg['paths']['work_dir'], pol['policy_id'])
        if pol in todo:
            rows, summary = build(ctx)
            write_jsonl(path, rows)
        elif os.path.exists(p(path)):
            rows, summary = build(ctx)
        else:
            continue
        outs.append(path)
        parts.append((ctx, rows, summary, None))
        c = Counter((s['code'], s['verdict']) for s in summary)
        print('%s: 대상 항목 %d · evidence_gosi %d행 · %s' % (pol['policy_id'], len(summary), len(rows), dict(sorted(c.items()))))
    md = '%s/%s' % (cfg['paths']['research_dir'], G['store']['report_md'])
    write_text(md, report_md(cfg, G, parts))
    hits = check_privacy(outs + [md])
    if hits:
        print('개인정보 검사 실패:', hits)
        sys.exit(1)
    print('개인정보 검사: actor %d개 값·전화번호 형식 0건' % len(common.ACTORS))


if __name__ == '__main__':
    main()
