#!/usr/bin/env python3
"""팀 수집 관리표(xlsx) ↔ 우리 원천 대조, 수집항목 중복 제거(설계 docs/speech/research/파이프라인_설계.md 1절 M2).

실행
    python3 -P -E tools/research/chain/inventory.py --xlsx <관리표.xlsx>
    --catalog  source_documents 를 dataset/source_documents.json 대신 catalog.build() 로 메모리에서 다시 만든다(쓰지 않음).
               emit 을 다시 돌리기 전에 새로 받은 원 파일을 미리 반영해 볼 때 쓴다.
    --root 입력 저장소 경로, --out 출력 폴더: 시험용. 기본은 이 저장소, docs/speech/research.

규칙(사이트 대조표·API 오퍼레이션·자료명 정규화·판단·연계필드·수집점검)은 config/inventory_rules.json 에 있다. 코드는 해석만 한다.
입력(읽기만, 네트워크 없음)
    관리표 시트: 전체_1-6단계(수집 후보), 원천사이트_통합(출처ID), 연계필드_통합, 수집점검_통합,
        정례브리핑_담당자(이름 칸은 출력에서 지우기 위해서만 읽는다). 연락처·담당자 칸은 읽자마자 버린다.
    우리 원천(경로는 규칙 파일 paths): 연구 데이터셋 source_documents·evidence, 원장 sources 표, 원장 raw 폴더,
        원천주체_단계별.csv, config/stage_sources.json·url_rules.json, schemas/ledger 스키마(연계필드 대응 칸 검사).
출력(docs/speech/research/)
    원천사이트_대조.csv · 수집항목_통합.csv · 수집항목_통합.md · 연계필드_대응.csv
같은 입력이면 바이트까지 같다(실행 시각을 쓰지 않는다).
"""

import argparse
import csv
import fnmatch
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from urllib.parse import parse_qsl, urlsplit

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common  # noqa: E402
import ids  # noqa: E402

OUT_DIR = 'docs/speech/research'
SITE_CSV = '원천사이트_대조.csv'
ITEM_CSV = '수집항목_통합.csv'
ITEM_MD = '수집항목_통합.md'
LINK_CSV = '연계필드_대응.csv'
SHEET_ROWS, SHEET_SITES, SHEET_LINKS, SHEET_CHECKS, SHEET_GUIDE = (
    '전체_1-6단계', '원천사이트_통합', '연계필드_통합', '수집점검_통합', '통합현황_안내')
# 개인 연락처·담당자 칸: 읽자마자 버린다. 이름 칸은 출력에서 지울 이름 목록으로만 쓴다.
PERSONAL_COLS = {'공개 연락처', '기관 협조 담당자', '내부 수집 담당자', '공개 전화번호', '공개 성명', '직위'}
NAME_COLS = {'공개 성명', '기관 협조 담당자', '내부 수집 담당자'}
TITLE_RE = re.compile(r'팀장|사무관|주무관|과장|서기관|국장|실장|연구관|연구사|담당관|담당자')
TEAM_SHEET = '팀 수집 관리표'

RULES_FILE = 'inventory_rules.json'
CFG = ids.load_json(RULES_FILE)
PATHS = {k: v for k, v in CFG['paths'].items() if k != 'raw_roots'}
RAW_ROOTS = tuple(CFG['paths']['raw_roots'])
PORTAL_HOSTS = set(CFG['portal_hosts'])
PORTAL_NAME_RE = re.compile(CFG['portal_name_regex'])
INTERNAL_RE = re.compile(CFG['internal_route_regex'])
DATASET_RE = re.compile(CFG['dataset_number_regex'])
ID_KEYS = tuple(CFG['id_query_keys'])
STAT_RES = tuple(re.compile(x) for x in CFG['stat_token_regexes'])
ALIASES = CFG['aliases']
OPS = {n: {'label': v['label'], 'ops': [(o['name'], o['pattern'], o['raw'], o['why']) for o in v['ops']]}
       for n, v in CFG['operations'].items()}
NN = CFG['name_normalization']
SYNONYMS = [tuple(x) for x in NN['synonyms']]
STOP = set(NN['stopwords'])
SUFFIX = NN['strip_suffix']
SPLIT_RE = re.compile(NN['split_regex'])
JUDGE_RULES = CFG['judge_rules']
LINK_MAP = [(x['pattern'], x['target'], x['kind'], x['note']) for x in CFG['link_map']]
CHECK_MAP = [(x['pattern'], x['ours'], x['metric'], x['state']) for x in CFG['check_map']]
NUM_RE = re.compile(r'(?<!\d)(\d{7,8})(?!\d)')
DATE8_RE = re.compile(r'^(19|20)\d{6}$')
URL_RE = re.compile(r'https?://[^\s,)·]+')
TS_RE = re.compile(r'(\d{8}T\d{6}Z)')


# ------------------------------------------------------------------ 자료명 정규화(규칙 R1·R3)

def nfkc(s):
    return unicodedata.normalize('NFKC', s or '').strip()


def norm_name(s):
    """R1 비교용: 공백·문장부호를 지운 글자열."""
    return re.sub(r'[\s·/,()\[\]{}<>「」『』:;+\-–—~↔→.]+', '', nfkc(s)).lower()


def tokens(name, source_name=''):
    """R3 비교용 낱말 집합: 동의어 맞춤 → 낱말 끝 접미사 뗌 → 불용어 → 원천 이름에 든 낱말 빼기(다 빠지면 빼지 않는다)."""
    s = nfkc(name).lower()
    for a, b in SYNONYMS:
        s = re.sub(a, b, s)
    toks = [t[:-len(SUFFIX)] if SUFFIX and len(t) > 2 and t.endswith(SUFFIX) else t for t in SPLIT_RE.split(s) if t]
    toks = [t for t in toks if t not in STOP]
    src = nfkc(source_name).lower()
    keep = [t for t in toks if not (len(t) >= 2 and t in src)]
    return tuple(sorted(set(keep or toks)))


# ------------------------------------------------------------------ 읽기

def read_workbook(path):
    """관리표 → {시트: [행 dict]}, 이름 목록(지울 것), 기준일. 개인 칸은 버린다."""
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out, names, asof = {}, set(), ''
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if ws.title == SHEET_GUIDE:
            for r in rows:
                for c in r:
                    m = re.search(r'(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})', str(c or ''))
                    if m and not asof:
                        asof = '%s-%02d-%02d' % (m.group(1), int(m.group(2)), int(m.group(3)))
            continue
        if not rows:
            continue
        head = [nfkc(str(h)) if h is not None else '' for h in rows[0]]
        recs = []
        for r in rows[1:]:
            if not any(c is not None and str(c).strip() for c in r):
                continue
            rec = {}
            for i, h in enumerate(head):
                v = r[i] if i < len(r) else None
                if h in NAME_COLS and v:
                    names.update(x for x in re.findall(r'[가-힣]{2,4}', str(v)) if not TITLE_RE.fullmatch(x))
                if not h or h in PERSONAL_COLS:
                    continue
                rec[h] = '' if v is None else nfkc(str(v))
            recs.append(rec)
        out[ws.title] = recs
    # 부서 칸 괄호 안의 '직위 이름'도 이름으로 모은다(출력에서 지우는 데만 쓴다)
    for sheet in out.values():
        for rec in sheet:
            for v in rec.values():
                for inner in re.findall(r'\(([^()]*)\)', v):
                    if TITLE_RE.search(inner):
                        names.update(x for x in re.findall(r'[가-힣]{2,4}', TITLE_RE.sub(' ', inner)))
    return out, names, asof


def dept_only(s, names):
    """부서명만: 직위·이름이 든 괄호와 이름·전화번호를 지운다."""
    def repl(m):
        inner = m.group(1)
        return '' if TITLE_RE.search(inner) or any(n in inner for n in names) else m.group(0)
    s = re.sub(r'\(([^()]*)\)', repl, s or '')
    for n in sorted(names, key=lambda x: (-len(x), x)):
        s = s.replace(n, '')
    s = common.PHONE_RE.sub('', s)
    return re.sub(r'\s+', ' ', s).strip(' ·,')


def _load_json(root, rel):
    with open(os.path.join(root, rel), encoding='utf-8') as f:
        return json.load(f)


def host_key(h):
    h = (h or '').lower()
    for pre in ('www.', 'm.'):
        if h.startswith(pre):
            h = h[len(pre):]
    return h


def numbers_in(text):
    out = {n for n in NUM_RE.findall(text or '') if not DATE8_RE.match(n)}
    for rx in STAT_RES:
        out |= {'stat:' + n for n in rx.findall(text or '')}
    return out


def url_sig(url):
    """같은 게시물 키: (호스트, 경로 끝 이름, id 류 쿼리)."""
    if not url:
        return None
    sp = urlsplit(url.split(' (POST')[0])
    q = dict(parse_qsl(sp.query))
    keys = tuple(sorted((k, q[k]) for k in ID_KEYS if q.get(k)))
    if not keys:
        return None
    return (host_key(sp.hostname), sp.path.rsplit('/', 1)[-1], keys)


def datagokr_no(url):
    m = DATASET_RE.search(url or '')
    return m.group(1) if m else None


def is_site_main(url):
    sp = urlsplit(url)
    path = sp.path or '/'
    return path == '/' or bool(re.search(r'(^|/)(main|index)[^/]*$', path, re.I))


class Ours:
    """우리 원천: 문서·대조 기록·원장 원천·raw 단위·원천주체 표."""

    def __init__(self, root, rules, live_catalog=False):
        self.root, self.rules = root, rules
        if live_catalog:
            import catalog
            self.docs = [dict(r) for r in catalog.build(root).rows]
        else:
            self.docs = _load_json(root, PATHS['docs'])['rows']
        self.ev = _load_json(root, PATHS['evidence'])['rows']
        self.ledger = _load_json(root, PATHS['ledger'])['rows']
        with open(os.path.join(root, PATHS['owner']), encoding='utf-8-sig', newline='') as f:
            self.owner = list(csv.DictReader(f))
        self.doc = {d['doc_id']: d for d in self.docs}
        self.children = defaultdict(list)
        for d in self.docs:
            if d.get('parent_doc_id'):
                self.children[d['parent_doc_id']].append(d['doc_id'])
        self.ev_by_doc = defaultdict(Counter)
        for e in self.ev:
            if e.get('doc_id'):
                self.ev_by_doc[e['doc_id']][e['verdict']] += 1
        self.doc_info = {}
        for d in self.docs:
            urls = [u for u in [d.get('canonical_url')] + list(d.get('url_aliases') or []) if u]
            canon = set()
            for u in urls:
                c, _ = ids.canonical_url(u, rules)
                if c:
                    canon.add(c)
            self.doc_info[d['doc_id']] = {
                'canon': canon, 'sigs': {s for s in (url_sig(u) for u in canon) if s},
                'hosts': {host_key(urlsplit(u).hostname) for u in canon},
                'nums': {n for n in (datagokr_no(u) for u in canon) if n}}
        self.home_refs = {x['source_ref'] for x in self.ledger if x.get('source_owner') == 'HOME'}
        self.units = self._raw_units()
        self.ledger_raw = self._link_ledger()
        self.stage_ids = self._stage_ids()

    # raw 단위: 원장 달 raw 는 폴더 하나, 그 밖의 raw 는 파일(하위 폴더만 있으면 폴더) 하나
    def _raw_units(self):
        units = {}
        for bi, base in enumerate(RAW_ROOTS):
            absb = os.path.join(self.root, base)
            if not os.path.isdir(absb):
                continue
            for name in sorted(os.listdir(absb)):
                ap = os.path.join(absb, name)
                if not os.path.isdir(ap):
                    continue
                if bi == 0:
                    units[base + '/' + name] = self._unit(base + '/' + name)
                    continue
                files = sorted(f for f in os.listdir(ap) if os.path.isfile(os.path.join(ap, f)) and f != 'README.md')
                if files:
                    for f in files:
                        units['%s/%s/%s' % (base, name, f)] = self._unit('%s/%s/%s' % (base, name, f))
                else:
                    for sub in sorted(os.listdir(ap)):
                        if os.path.isdir(os.path.join(ap, sub)):
                            units['%s/%s/%s' % (base, name, sub)] = self._unit('%s/%s/%s' % (base, name, sub))
        return units

    def _unit(self, rel):
        ap = os.path.join(self.root, rel)
        files, text, urls, src_refs = [], [], set(), set()
        if os.path.isdir(ap):
            for dp, dn, fn in os.walk(ap):
                dn.sort()
                for f in sorted(fn):
                    files.append(os.path.relpath(os.path.join(dp, f), self.root).replace(os.sep, '/'))
        else:
            files = [rel]
        data_files = [f for f in files if os.path.basename(f) not in ('manifest.json', 'README.md')]
        for f in files:
            base = os.path.basename(f)
            text.append(base)
            if base == 'manifest.json':
                m = _load_json(self.root, f)
                text.append(str(m.get('source', '')))
                fs = m.get('files') or {}
                for fv in (fs.values() if isinstance(fs, dict) else fs):
                    if isinstance(fv, dict) and fv.get('portal_id'):
                        text.append(str(fv['portal_id']))
                ep = m.get('endpoint')
                for e in (ep if isinstance(ep, list) else [ep or '']):
                    urls |= set(URL_RE.findall(e))
        for f in data_files[:1]:
            if f.endswith('.json'):
                with open(os.path.join(self.root, f), encoding='utf-8', errors='replace') as fh:
                    head = fh.read(4096)
                src_refs |= set(re.findall(r'"source_ref":\s*"([^"]+)"', head))
                urls |= set(re.findall(r'"endpoint":\s*"([^"]+)"', head))
        return {'path': rel, 'files': files, 'data_files': data_files, 'nums': numbers_in(' '.join(text)),
                'urls': {ids.canonical_url(u, self.rules)[0] for u in urls}, 'src_refs': src_refs}

    def _link_ledger(self):
        """원장 원천 → raw 단위."""
        out = {}
        for s in self.ledger:
            ref = s['source_ref']
            links = set()
            if ref in self.home_refs:
                m = TS_RE.search(ref)
                links = {u for u, x in self.units.items() if m and any(m.group(1) in f for f in x['files'])}
            else:
                text = ' '.join(str(s.get(k) or '') for k in ('source_ref', 'dataset_name', 'source_url', 'original_filename'))
                nums = numbers_in(text)
                fnames = {x.strip() for x in str(s.get('original_filename') or '').split('·') if x.strip()}
                surls = {ids.canonical_url(u, self.rules)[0] for u in URL_RE.findall(str(s.get('source_url') or ''))}
                base_name = re.sub(r'\([^)]*\)', '', str(s.get('dataset_name') or '')).strip()
                for path, u in self.units.items():
                    bases = {os.path.basename(f) for f in u['data_files']}
                    if fnames:
                        if fnames & bases:
                            links.add(path)
                        continue
                    if (nums & u['nums']) or ref in u['src_refs'] or (surls & u['urls']) or \
                            (len(base_name) >= 6 and any(base_name in b for b in bases)):
                        links.add(path)
            out[ref] = sorted(links)
        return out

    def _stage_ids(self):
        cfg = ids.load_json('stage_sources.json')
        out = defaultdict(set)

        def paths(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in ('path', 'zip', 'dir', 'notice_dir', 'detail_dir') and isinstance(v, str):
                        yield v
                    else:
                        yield from paths(v)
            elif isinstance(o, list):
                for v in o:
                    yield from paths(v)
        for sid, src in sorted(cfg.get('sources', {}).items()):
            for pth in paths(src):
                for u in self.units:
                    if pth == u or pth.startswith(u + '/'):
                        out[u].add(sid)
        return out

    # 문서 묶음
    def descend(self, doc_ids):
        seen, stack = set(), list(doc_ids)
        while stack:
            d = stack.pop()
            if d in seen or d not in self.doc:
                continue
            seen.add(d)
            stack.extend(self.children.get(d, []))
        return seen

    def docs_under(self, prefixes):
        """local_path 가 그 경로이거나 그 아래인 문서."""
        out = set()
        for d in self.docs:
            lp = d.get('local_path') or ''
            if any(lp == u or lp.startswith(u.rstrip('/') + '/') for u in prefixes):
                out.add(d['doc_id'])
        return out

    def root_of(self, doc_id):
        seen = set()
        while self.doc.get(doc_id, {}).get('parent_doc_id') and doc_id not in seen:
            seen.add(doc_id)
            doc_id = self.doc[doc_id]['parent_doc_id']
        return doc_id


# ------------------------------------------------------------------ 1. 원천 사이트 대조

def _alias_hit(alias, canon, rules):
    m = alias['match']
    if m.startswith('host:'):
        return host_key(urlsplit(canon).hostname) == m[5:]
    mc = ids.canonical_url(m, rules)[0] if '://' in m else m
    if alias.get('exact'):
        return canon == mc
    if '?' in mc:
        return canon == mc or canon.startswith(mc + '&')
    path, root = canon.split('?')[0], mc.rstrip('/')
    return path.startswith(root) and (path == root or path[len(root)] in '/?')


def _resolve_refs(ours, patterns):
    led, raws = set(), set()
    for pat in patterns:
        if pat.startswith('ledger:'):
            led |= {s['source_ref'] for s in ours.ledger if fnmatch.fnmatchcase(s['source_ref'], pat[7:])}
        else:
            raws |= {u for u in ours.units if fnmatch.fnmatchcase(u, pat)}
    return led, raws


def match_site(site, ours):
    """관리표 사이트 하나 → 우리 문서·원장 원천·raw 와 대조 근거."""
    canon = ids.canonical_url(site['url'], ours.rules)[0] if site['url'] else ''
    internal = bool(INTERNAL_RE.search(site['route']))
    docs, led, raws, basis, owner = set(), set(), set(), [], set()
    if canon and not internal:
        hit = {d for d, i in ours.doc_info.items() if canon in i['canon']}
        if hit:
            docs |= hit
            basis.append('URL 일치')
        sig = url_sig(canon)
        if sig:
            hit = {d for d, i in ours.doc_info.items() if sig in i['sigs']} - docs
            if hit:
                docs |= hit
                basis.append('같은 게시물(%s)' % '·'.join('%s=%s' % kv for kv in sig[2]))
        n = datagokr_no(canon)
        if n:
            hit = {d for d, i in ours.doc_info.items() if n in i['nums']} - docs
            u_hit = {u for u, x in ours.units.items() if n in x['nums']}
            l_hit = {s['source_ref'] for s in ours.ledger if n in numbers_in(' '.join(
                str(s.get(k) or '') for k in ('source_ref', 'dataset_name', 'source_url')))}
            if hit or u_hit or l_hit:
                docs |= hit
                raws |= u_hit
                led |= l_hit
                basis.append('데이터셋 번호 %s' % n)
        for a in ALIASES:
            if _alias_hit(a, canon, ours.rules):
                l2, r2 = _resolve_refs(ours, a.get('refs', []))
                d2 = {d for d, i in ours.doc_info.items() if i['hosts'] & set(a.get('doc_hosts', []))}
                d2 |= ours.docs_under(a.get('doc_paths', []))
                if l2 or r2 or d2:
                    owner |= set(a.get('owner', []))
                    led |= l2
                    raws |= r2
                    docs |= d2
                    basis.append('같은 원천 다른 경로: ' + a['why'])
        h = host_key(urlsplit(canon).hostname)
        if is_site_main(canon) and h not in PORTAL_HOSTS:
            hit = {d for d, i in ours.doc_info.items() if h in i['hosts']} - docs
            if hit:
                docs |= hit
                basis.append('같은 사이트(%s)' % h)
    for ref in sorted(led - ours.home_refs):  # HOME 덤프는 여러 원천을 한 폴더에 담아 사이트 하나에 붙이지 않는다
        raws |= set(ours.ledger_raw.get(ref, []))
    docs = ours.descend(docs) | ours.docs_under(raws)
    return {'canon': canon, 'docs': docs, 'ledger': led, 'raws': raws, 'basis': basis, 'owner': owner}


def status_of(ours, docs, raws, ledger=()):
    saved = sorted(d for d in docs if ours.doc[d].get('saved'))
    raw_ok = sorted(r for r in raws if ours.units[r]['data_files'])
    parts = []
    if saved:
        parts.append('원 파일 보존 %d건' % len(saved))
    if raw_ok:
        parts.append('원장 raw 있음(%s)' % ' · '.join(raw_ok))
    if parts:
        return ' · '.join(parts), saved, raw_ok
    if docs or raws or ledger:
        return '목록만', saved, raw_ok
    return '미수집', saved, raw_ok


def ev_count(ours, docs):
    c = Counter()
    for d in docs:
        c.update(ours.ev_by_doc.get(d, {}))
    return c


def ev_text(c):
    if not c:
        return ''
    return ' · '.join('%s %d' % (k, c[k]) for k in sorted(c, key=lambda k: (-c[k], k)))


def host_in(text, host):
    """글에 호스트가 따로 나오는가(www.·// 뒤 또는 앞이 낱말 아님). 하위 호스트(앞에 점)는 치지 않는다."""
    rx = r'(?:(?<=//)|(?<=www\.)|(?<![\w.]))' + re.escape(host) + r'(?![\w])'
    return re.search(rx, text) is not None


def owner_rows(ours, toks, hosts=()):
    out = []
    for i, r in enumerate(ours.owner, 1):
        text = ' '.join(r.values())
        if any(t and t in text for t in toks) or any(host_in(text, h) for h in hosts):
            out.append(i)
    return out


def site_tokens(ours, site, m):
    """원천주체 표 행을 찾을 낱말: 데이터셋 번호, 게시물 id, 별칭 낱말, 대조 문서 파일 이름 · 사이트 첫 화면이면 호스트."""
    toks, hosts = set(m.get('owner', ())), set()
    if INTERNAL_RE.search(site['route']):
        return set(), set()
    canon = m['canon']
    if canon:
        n = datagokr_no(canon)
        if n:
            toks.add(n)
        q = dict(parse_qsl(urlsplit(canon).query))
        toks |= {v for k, v in q.items() if k in ID_KEYS and len(v) >= 5}
        h = host_key(urlsplit(canon).hostname)
        if h not in PORTAL_HOSTS and is_site_main(canon):
            hosts.add(h)
    for d in m['docs']:
        b = os.path.basename(ours.doc[d].get('local_path') or '')
        if len(b) >= 12 and not re.match(r'(board|contents|search|[cs]\d)', b):
            toks.add(b)
    return toks, hosts


def stage_code(s):
    m = re.match(r'\s*(\d)', s or '')
    return ('0' + m.group(1)) if m else ''


def _cond(c, t):
    if c.get('always'):
        return True
    if 'all' in c:
        return all(_cond(x, t) for x in c['all'])
    if 'flag' in c:
        return bool(t[c['flag']])
    return re.search(c['regex'], t[c['field']]) is not None


def judge(site, rows):
    """규칙 파일 judge_rules 를 위에서부터 적용(처음 맞는 것)."""
    units = ' '.join(sorted({r.get('연결 가능 단위', '') for r in rows})) if rows else site['name']
    canon = site['canon'] or ''
    t = {'route': site['route'] + ' ' + ' '.join(sorted({r.get('수집 경로·형식', '') for r in rows})),
         'internal': bool(INTERNAL_RE.search(site['route'])),
         'all_coop': bool(rows) and all('협조' in r.get('원천 안내 확인수준', '') for r in rows),
         'portal': bool(canon) and host_key(urlsplit(canon).hostname) in PORTAL_HOSTS and is_site_main(canon)
         and bool(PORTAL_NAME_RE.search(site['name'])),
         'name': site['name'], 'units': units, 'name_units': site['name'] + ' ' + units}
    for r in JUDGE_RULES:
        if any(_cond(c, t) for c in r['when']):
            return r['verdict'], r['why']
    return '참고', ''


def build_sites(wb, names, ours):
    rows_by_src = defaultdict(list)
    for r in wb[SHEET_ROWS]:
        rows_by_src[r.get('통합 출처ID', '')].append(r)
    out, matched_docs, matched_led, matched_raw, site_info = [], set(), set(), set(), {}
    for s in sorted(wb[SHEET_SITES], key=lambda r: r.get('통합 출처ID', '')):
        sid = s.get('통합 출처ID', '')
        site = {'id': sid, 'url': s.get('공식 원천 URL', ''), 'route': s.get('수집 경로·형식', ''), 'name': s.get('공식 원천명', '')}
        m = match_site(site, ours)
        site['canon'] = m['canon']
        rows = rows_by_src.get(sid, [])
        st, saved, raw_ok = status_of(ours, m['docs'], m['raws'], m['ledger'])
        evc = ev_count(ours, m['docs'])
        verdict, why = judge(site, rows)
        doc_ids = sorted(m['docs'])
        refs = []
        if doc_ids:
            refs.append('문서 %d건: %s%s' % (len(doc_ids), ', '.join(doc_ids[:3]), ' 외' if len(doc_ids) > 3 else ''))
        if m['ledger']:
            refs.append('source_ref: ' + ', '.join(sorted(m['ledger'])))
        sids = sorted({x for u in m['raws'] for x in ours.stage_ids.get(u, ())})
        if sids:
            refs.append('stage_sources: ' + ', '.join(sids))
        own = owner_rows(ours, *site_tokens(ours, site, m))
        stages_ws = sorted({stage_code(r.get('단계', '')) for r in rows} - {''})
        stages_ours = sorted({c for d in m['docs'] for c in (ours.doc[d].get('stage_codes') or [])})
        out.append({
            '통합출처ID': sid, '제공기관': s.get('제공 기관', ''), '공식원천명': site['name'],
            '소관부서': dept_only(s.get('소관 부서·담당범위', ''), names), '공식URL': site['url'], '우리_상태': st,
            '우리_문서id·원장 source_ref': ' | '.join(refs), '원 파일 수': len(saved), 'evidence 수': sum(evc.values()),
            'evidence 판정': ev_text(evc), '단계(관리표)': '·'.join(stages_ws), '단계(우리)': '·'.join(stages_ours),
            '관리표 행 수': len(rows), '원천주체_행': '·'.join('r%d' % i for i in own),
            '대조_근거': ' / '.join(m['basis']), '판단': verdict, '판단_이유': why})
        site_info[sid] = dict(m, status=st, saved=saved, raw_ok=raw_ok, ev=evc, verdict=verdict, name=site['name'],
                              org=s.get('제공 기관', ''))
        matched_docs |= m['docs']
        matched_led |= m['ledger']
        matched_raw |= m['raws']
    return out, site_info, (matched_docs, matched_led, matched_raw)


def build_unlisted(ours, matched):
    """관리표에 없는 우리 원천: 원장 원천(같은 raw 를 쓰면 한 행), 원장에 없는 raw 단위, 어느 단위에도 없는 문서(게시처별)."""
    mdocs, mled, mraw = matched
    rows = []
    groups = defaultdict(list)
    for s in ours.ledger:
        if s['source_ref'] in mled:
            continue
        key = tuple(ours.ledger_raw.get(s['source_ref'], [])) or ('ledger:' + s['source_ref'],)
        groups[key].append(s)
    linked_raw = {u for v in ours.ledger_raw.values() for u in v}
    for key in sorted(groups):
        ss = sorted(groups[key], key=lambda s: s['source_ref'])
        raws = [k for k in key if not k.startswith('ledger:')]
        docs = ours.docs_under(raws)
        st, saved, raw_ok = status_of(ours, docs, raws, [s['source_ref'] for s in ss])
        evc = ev_count(ours, docs)
        used = sorted({x for s in ss for x in (s.get('used_by') or [])})
        own_product = all(str(s.get('provider', '')).startswith('주택파동') for s in ss)
        rows.append(_unlisted_row(
            ss[0].get('provider', ''), ss[0].get('dataset_name', '') + (' 외 %d' % (len(ss) - 1) if len(ss) > 1 else ''),
            ss[0].get('source_url') or (raws[0] if raws else ''), st,
            'source_ref: ' + ', '.join(s['source_ref'] for s in ss) + _stage_txt(ours, raws), saved, evc, docs, ours,
            ('자체 산출물(레지스트리·번들·수기 목록) — 외부 원천 아님' if own_product else
             '원장 원천' + (' — 화면 ' + ', '.join(used) if used else ' — 화면에서 쓰지 않음')),
            verdict='해당 없음' if own_product else '관리표 추가 제안'))
    for u in sorted(ours.units):
        if u in mraw or u in linked_raw:
            continue
        x = ours.units[u]
        docs = ours.docs_under([u])
        st, saved, raw_ok = status_of(ours, docs, [u])
        if not x['data_files']:
            st = '목록만(원본 못 받음)' if x['files'] else '미수집(빈 폴더)'
        evc = ev_count(ours, docs)
        rows.append(_unlisted_row('', os.path.basename(u), u, st, 'raw: ' + u + _stage_txt(ours, [u]), saved, evc, docs, ours,
                                  '원장 raw — sources 표에 행 없음'))
    unit_docs = ours.docs_under(list(ours.units))
    rest = [d for d in sorted(ours.doc) if d not in mdocs and d not in unit_docs]
    by_site = defaultdict(set)
    for d in rest:
        r = ours.doc[ours.root_of(d)]
        urls = sorted(ours.doc_info[r['doc_id']]['canon'])
        if urls:
            sp = urlsplit(urls[0])
            key = host_key(sp.hostname) + sp.path
        else:
            key = os.path.dirname(r.get('local_path') or '(경로 없음)')
        by_site[key].add(d)
    for key in sorted(by_site):
        docs = by_site[key]
        st, saved, raw_ok = status_of(ours, docs, [])
        evc = ev_count(ours, docs)
        orgs = Counter(ours.doc[d].get('publisher_org') or '' for d in docs)
        org = sorted(orgs, key=lambda k: (-orgs[k], k))[0]
        titles = sorted({ours.doc[ours.root_of(d)]['title'] for d in docs})
        cache = all(str(ours.doc[d].get('collection_method') or '').startswith('EXA') or '_discovery' in (ours.doc[d].get('local_path') or '')
                    for d in docs)
        rows.append(_unlisted_row(org, '%s 외 %d' % (titles[0], len(titles) - 1) if len(titles) > 1 else titles[0],
                                  key, st, '문서 %d건: %s' % (len(docs), ', '.join(sorted(docs)[:3]) + (' 외' if len(docs) > 3 else '')),
                                  saved, evc, docs, ours,
                                  '검색·발견 응답 캐시(Exa·게시판 목록 API) — 원천 문서가 아님' if cache else '연구 문서(source_documents) — 게시처 단위',
                                  verdict='해당 없음' if cache else '관리표 추가 제안'))
    return rows


def _stage_txt(ours, raws):
    sids = sorted({x for u in raws for x in ours.stage_ids.get(u, ())})
    return (' | stage_sources: ' + ', '.join(sids)) if sids else ''


def _unlisted_row(org, name, url, st, refs, saved, evc, docs, ours, why, verdict='관리표 추가 제안'):
    stages = sorted({c for d in docs for c in (ours.doc[d].get('stage_codes') or [])})
    own = owner_rows(ours, {os.path.basename(ours.doc[d].get('local_path') or '') for d in docs
                            if len(os.path.basename(ours.doc[d].get('local_path') or '')) >= 12})
    return {'통합출처ID': '관리표 미수록', '제공기관': org, '공식원천명': name, '소관부서': '', '공식URL': url, '우리_상태': st,
            '우리_문서id·원장 source_ref': refs, '원 파일 수': len(saved), 'evidence 수': sum(evc.values()),
            'evidence 판정': ev_text(evc), '단계(관리표)': '', '단계(우리)': '·'.join(stages), '관리표 행 수': 0,
            '원천주체_행': '·'.join('r%d' % i for i in own), '대조_근거': '', '판단': verdict,
            '판단_이유': why + (' · evidence 에 쓰임' if evc else '')}


SITE_HEAD = ['통합출처ID', '제공기관', '공식원천명', '소관부서', '공식URL', '우리_상태', '우리_문서id·원장 source_ref', '원 파일 수',
             'evidence 수', 'evidence 판정', '단계(관리표)', '단계(우리)', '관리표 행 수', '원천주체_행', '대조_근거', '판단', '판단_이유']


# ------------------------------------------------------------------ 2. 수집항목 중복 제거

def source_groups(sites, rules):
    """같은 정규화 URL(뿌리 경로 아님)인 출처ID 묶음(R4) → {출처ID: 대표 출처ID}."""
    by = defaultdict(list)
    for s in sites:
        c = ids.canonical_url(s.get('공식 원천 URL', ''), rules)[0] or ''
        sp = urlsplit(c)
        if c and (sp.path or '/') != '/':
            by[c].append(s['통합 출처ID'])
    rep = {}
    for c, members in by.items():
        for m in members:
            rep[m] = min(members)
    return rep, {c: sorted(v) for c, v in by.items() if len(v) > 1}


def op_of(row, src_url):
    n = datagokr_no(src_url)
    spec = OPS.get(n or '')
    if not spec:
        return None
    name = row.get('수집 후보 데이터·자료명', '')
    for op, pat, raw, why in spec['ops']:
        if re.search(pat, name):
            return (n, op, raw, why)
    return None


def build_items(wb, site_info, ours):
    rules = ours.rules
    sites = wb[SHEET_SITES]
    canon_of = {s['통합 출처ID']: ids.canonical_url(s.get('공식 원천 URL', ''), rules)[0] or '' for s in sites}
    rep, same_url = source_groups(sites, rules)
    rows = sorted(wb[SHEET_ROWS], key=lambda r: r['관리ID'])
    groups = defaultdict(list)
    meta = {}
    for r in rows:
        src = r.get('통합 출처ID', '')
        g = rep.get(src, src)
        op = op_of(r, canon_of.get(src, ''))
        if op:
            key = (g, 'op:%s:%s' % (op[0], op[1]))
        else:
            tk = tokens(r.get('수집 후보 데이터·자료명', ''), r.get('원천 사이트·자료명', ''))
            key = (g, 'el:' + '·'.join(tk)) if tk else (g, 'nm:' + norm_name(r.get('수집 후보 데이터·자료명', '')))
        groups[key].append(r)
        meta[key] = op
    items = []
    for key in sorted(groups, key=lambda k: groups[k][0]['관리ID']):
        rs = groups[key]
        g, ek = key
        iid = 'CI-' + hashlib.sha256(('%s|%s' % (g, ek)).encode('utf-8')).hexdigest()[:12]
        op = meta[key]
        names_n = {norm_name(r.get('수집 후보 데이터·자료명', '')) for r in rs}
        srcs = sorted({r.get('통합 출처ID', '') for r in rs})
        if len(rs) == 1:
            rule = ''
        elif op:
            rule = 'R2 같은 API 오퍼레이션(%s %s)' % (OPS[op[0]]['label'], op[1])
        elif len(names_n) == 1:
            rule = 'R1 같은 원천·같은 자료명'
        else:
            rule = 'R3 같은 원천·정규화 자료명 같음'
        if len(srcs) > 1:
            rule += ' · R4 같은 URL 의 다른 출처ID(%s)' % '·'.join(srcs)
        items.append({'id': iid, 'group': g, 'key': ek, 'rows': rs, 'op': op, 'rule': rule, 'srcs': srcs,
                      'toks': set(tokens(rs[0].get('수집 후보 데이터·자료명', ''))) if ek.startswith('el:') else set()})
    # 중복 후보(R5): 같은 원천 묶음 안, 한 항목의 낱말(원천 이름 낱말은 빼지 않음, 2개 이상)에 낱말 하나만 더한 항목
    by_g = defaultdict(list)
    for it in items:
        by_g[it['group']].append(it)
    cand = defaultdict(set)
    for g in sorted(by_g):
        its = [i for i in by_g[g] if i['toks']]
        for a in range(len(its)):
            for b in range(a + 1, len(its)):
                small, big = sorted((its[a]['toks'], its[b]['toks']), key=len)
                if len(small) >= 2 and small < big and len(big - small) == 1:
                    cand[its[a]['id']].add(its[b]['id'])
                    cand[its[b]['id']].add(its[a]['id'])
    by_id = {i['id']: i for i in items}
    out = []
    for it in items:
        rs = it['rows']
        first = rs[0]
        infos = [site_info.get(s) for s in it['srcs'] if site_info.get(s)]
        docs = set().union(*[i['docs'] for i in infos]) if infos else set()
        raws = set().union(*[i['raws'] for i in infos]) if infos else set()
        led = set().union(*[i['ledger'] for i in infos]) if infos else set()
        op = it['op']
        note = [it['rule']] if it['rule'] else []
        if op:
            hits = sorted({f for pat in op[2] for f in _glob(ours, pat)})
            op_raws = sorted({u for u in ours.units for f in hits if f == u or f.startswith(u + '/')})
            docs_op = {d for d in ours.docs_under(op_raws) if (ours.doc[d].get('local_path') or '') in hits} or ours.docs_under(op_raws)
            if hits:
                st = '원장 raw'
                basis = ' · '.join(hits[:3]) + (' 외 %d' % (len(hits) - 3) if len(hits) > 3 else '') + (' (%s)' % op[3] if op[3] else '')
            else:
                st = '미수집'
                basis = '이 오퍼레이션의 원본 없음(같은 원천의 다른 오퍼레이션만 있음)' if (raws or docs) else ''
            evc = ev_count(ours, docs_op)
        else:
            stx, saved, raw_ok = status_of(ours, docs, raws, led)
            parts = []
            if saved:
                parts.append('보존')
            if raw_ok:
                parts.append('원장 raw')
            st = ' · '.join(parts) or ('목록만' if stx == '목록만' else '미수집')
            basis = _basis(ours, saved, raw_ok, led)
            evc = ev_count(ours, docs)
        ver = ('원천 단위 ' + ev_text(evc)) if evc else '없음'
        if it['id'] in cand:
            verdict = '중복 후보'
            note.append('중복 후보: ' + ', '.join('%s(%s)' % (c, by_id[c]['rows'][0].get('수집 후보 데이터·자료명', ''))
                                                for c in sorted(cand[it['id']])))
        else:
            verdict = '합침' if len(rs) > 1 else '대표'
        stages, fields, keys = [], [], []
        for r in rs:
            for lst, col in ((stages, '단계'), (fields, '필요 세부 필드·내용'), (keys, '개별 사업 연결키 후보')):
                v = r.get(col, '')
                if v and v not in lst:
                    lst.append(v)
        refs = []
        if op:
            refs.append('%s %s' % (OPS[op[0]]['label'], op[1]))
        if led:
            refs.append('source_ref ' + ', '.join(sorted(led)))
        if docs and not op:
            ds = sorted(docs)
            refs.append('문서 %d건(%s%s)' % (len(ds), ', '.join(ds[:2]), ' 외' if len(ds) > 2 else ''))
        prop_state = {'보존': '수집(원 파일 보존)', '원장 raw': '수집(원장 raw)', '보존 · 원장 raw': '수집(원 파일 보존·원장 raw)',
                      '목록만': '목록만 확보(원 파일 없음)', '미수집': '미수집'}[st]
        got = '응답·파일 확보' if 'raw' in st else ('원 파일 확보' if st == '보존' else '')
        if evc and got:
            prop_test = '%s · 원천 문서 대조 %d건(%s)' % (got, sum(evc.values()), ev_text(evc))
        elif got:
            prop_test = got + '(대조 기록 없음)'
        else:
            prop_test = '미검증'
        out.append({
            '항목ID': it['id'], '대표_자료명': first.get('수집 후보 데이터·자료명', ''),
            '데이터_요소·필드': ((op[1] + ' — ') if op else '') + ' / '.join(fields),
            '원천': '·'.join(it['srcs']) + (' | ' + ' | '.join(refs) if refs else ''), '제공기관': first.get('제공 기관', ''),
            '쓰는_단계': ' · '.join(stages), '연결키': ' / '.join(keys),
            '관리표_관리ID들': ' · '.join(r['관리ID'] for r in rs), '관리ID_수': len(rs),
            '우리_수집상태': st, '우리_검증상태': ver, '중복_판정': verdict,
            '제안_수집상태': prop_state, '제안_테스트결과': prop_test,
            '제안_근거': basis + (' · evidence.json' if evc else ''), '비고': ' / '.join(note)})
    return out, same_url


def _glob(ours, pat):
    base = pat.split('*')[0].rsplit('/', 1)[0]
    absb = os.path.join(ours.root, base)
    if not os.path.isdir(absb):
        return []
    out = []
    for dp, dn, fn in os.walk(absb):
        dn.sort()
        for f in sorted(fn):
            rel = os.path.relpath(os.path.join(dp, f), ours.root).replace(os.sep, '/')
            if fnmatch.fnmatchcase(rel, pat):
                out.append(rel)
    return out


def _basis(ours, saved, raw_ok, led):
    parts = []
    if saved:
        lp = sorted({ours.doc[d].get('local_path') or '' for d in saved} - {''})
        parts.append('원 파일 %d건(%s%s)' % (len(saved), ', '.join(lp[:2]), ' 외' if len(lp) > 2 else ''))
    if raw_ok:
        parts.append('raw ' + ', '.join(raw_ok[:3]) + (' 외' if len(raw_ok) > 3 else ''))
    if led and not raw_ok:
        parts.append('원장 sources ' + ', '.join(sorted(led)))
    return ' · '.join(parts)


ITEM_HEAD = ['항목ID', '대표_자료명', '데이터_요소·필드', '원천', '제공기관', '쓰는_단계', '연결키', '관리표_관리ID들', '관리ID_수',
             '우리_수집상태', '우리_검증상태', '중복_판정', '제안_수집상태', '제안_테스트결과', '제안_근거', '비고']


# ------------------------------------------------------------------ 3. 연계필드·수집점검 대응

def schema_columns(root):
    cols = {}
    d = os.path.join(root, PATHS['schema_dir'])
    for f in sorted(os.listdir(d)):
        if not f.endswith('.schema.json'):
            continue
        with open(os.path.join(d, f), encoding='utf-8') as fh:
            s = json.load(fh)
        row = (s.get('$defs') or {}).get('row') or {}
        cols[f[:-len('.schema.json')]] = set((row.get('properties') or {}).keys())
    return cols


def build_links(wb, root):
    cols = schema_columns(root)
    out = []
    for r in wb[SHEET_LINKS]:
        key = r.get('식별자·권장 필드', '')
        for pat, target, kind, note in LINK_MAP:
            if re.search(pat, key):
                break
        else:
            target, kind, note = '', '없음', '대응 규칙 없음'
        for tc in [t.strip() for t in target.split('·') if t.strip()]:
            t, c = tc.split('.', 1)
            if c not in cols.get(t, set()):
                raise SystemExit('연계필드 대응 칸이 스키마에 없음: %s' % tc)
        out.append({'연계 구간': r.get('연계 구간·구분', ''), '관리표_식별자': key, '뜻': r.get('필드 의미·설명', ''),
                    '관리표_원천 기준': r.get('원천 후보·기준', ''), '우리_표·칸': target or '없음', '대응': kind, '비고': note})
    return out


LINK_HEAD = ['연계 구간', '관리표_식별자', '뜻', '관리표_원천 기준', '우리_표·칸', '대응', '비고']


def build_checks(wb):
    out = []
    for i, r in enumerate(wb[SHEET_CHECKS], 1):
        text = r.get('점검 분야', '') + ' ' + r.get('수집·검증할 작업', '')
        for pat, ours_, metric, state in CHECK_MAP:
            if re.search(pat, text):
                break
        else:
            ours_, metric, state = '대응 없음', '—', '미실행'
        out.append((i, r.get('해당 단계', ''), r.get('점검 분야', ''), ours_, metric, state))
    return out


# ------------------------------------------------------------------ md

def build_md(asof, site_rows, unlisted, items, same_url, checks, links, nrows):
    n_src = len(site_rows)
    lines = ['# 수집항목 통합 — %s(%s) 대조' % (TEAM_SHEET, asof), '',
             '`tools/research/chain/inventory.py` 가 만든다(재실행 바이트 동일). 규칙은 `tools/research/chain/config/%s`. '
             '관리표 원본은 고치지 않았고 담당자 이름·연락처는 옮기지 않았다.' % RULES_FILE,
             '', '## 1. 집계', '']
    vc = Counter(i['중복_판정'] for i in items)
    merged_ids = sum(i['관리ID_수'] for i in items if i['관리ID_수'] > 1)
    lines += ['| 구분 | 수 |', '|---|---:|', '| 관리표 수집 후보(관리ID) | %d |' % nrows, '| 수집항목(중복 제거 뒤) | %d |' % len(items),
              '| 대표(한 행 그대로) | %d |' % vc['대표'], '| 합침(두 행 이상) | %d |' % vc['합침'], '| 중복 후보(합치지 않고 표시) | %d |' % vc['중복 후보'],
              '| 합쳐진 관리ID(두 행 이상인 항목에 든 것) | %d |' % merged_ids, '']
    rc = Counter()
    for i in items:
        for part in re.findall(r'R\d', i['비고']):
            rc[part] += 1
    lines += ['규칙별 항목 수(한 항목에 규칙이 둘 이상일 수 있음): ' + ', '.join('%s %d' % (k, rc[k]) for k in sorted(rc)), '']
    st = Counter(i['우리_수집상태'] for i in items)
    lines += ['우리 수집상태별 항목 수: ' + ', '.join('%s %d' % (k, st[k]) for k in sorted(st, key=lambda k: (-st[k], k))), '']
    stage_c = Counter()
    for i in items:
        for s in i['쓰는_단계'].split(' · '):
            stage_c[s] += 1
    lines += ['단계별 항목 수(여러 단계에 쓰이면 각 단계에 셈): ' + ', '.join('%s %d' % (k, stage_c[k]) for k in sorted(stage_c)), '']
    labels = ', '.join(OPS[n]['label'] for n in sorted(OPS))
    lines += ['## 2. 합친 규칙', '',
              '수집항목 = (원천 데이터셋·문서 종류, 데이터 요소). 모든 관리ID 는 정확히 한 항목에 들어간다(시험으로 확인). 항목ID 는 `CI-` + sha256(대표 출처ID|요소 키) 앞 12자.', '',
              '| 규칙 | 기준 | 근거 기록 |', '|---|---|---|',
              '| R1 | 같은 원천 묶음 + 같은 자료명(공백·문장부호 무시) | 비고 `R1` |',
              '| R2 | 같은 API 오퍼레이션 — 자료명이 오퍼레이션을 가리킴(규칙 파일 operations: %s) | 비고에 오퍼레이션, 제안_근거에 우리 원본 파일 |' % labels,
              '| R3 | 같은 원천 묶음 + 정규화 자료명 같음(규칙 파일 name_normalization: 동의어, 낱말 끝 `%s` 뗌, 불용어 %d개, 원천 이름에 든 낱말 뺌) | 비고 `R3` |'
              % (SUFFIX, len(STOP)),
              '| R4 | 원천 묶음: 정규화 URL 이 같은(뿌리 경로 아님) 출처ID 는 한 원천 | 비고 `R4`, 아래 목록 |',
              '| R5 | 합치지 않음 — 같은 원천 묶음에서 한 항목의 낱말(2개 이상, 원천 이름 낱말 포함)에 낱말 하나만 더한 항목은 둘 다 `중복 후보`(예: 학교 운영 상태 ↔ 학교 설립·운영 상태) | 비고에 상대 항목ID |', '',
              '같은 URL 의 다른 출처ID(R4):', '']
    for c, members in sorted(same_url.items(), key=lambda kv: kv[1]):
        lines.append('- %s — `%s`' % (' · '.join(members), c))
    lines += ['', '자료명 정규화로 합친 것은 같은 원 파일·통계표·오퍼레이션 안의 같은 요소다(통계표는 출처ID 가 표 하나를 가리킴). 문서형 원천(고시·공고·보도자료)에서 낱말이 다르면 합치지 않고 R5 로 표시했다.', '']
    lines += ['## 3. 원천 사이트 대조(`원천사이트_대조.csv`)', '']
    sc = Counter()
    for r in site_rows:
        s = r['우리_상태']
        key = '원 파일 보존·원장 raw' if '원 파일' in s and 'raw' in s else ('원 파일 보존' if '원 파일' in s else ('원장 raw 있음' if 'raw' in s else s))
        sc[key] += 1
    jc = Counter(r['판단'] for r in site_rows)
    lines += ['관리표 사이트 %d곳 → 우리 상태: ' % n_src + ', '.join('%s %d' % (k, sc[k]) for k in sorted(sc, key=lambda k: (-sc[k], k))) + '.',
              '판단: ' + ', '.join('%s %d' % (k, jc[k]) for k in sorted(jc)) + '. 관리표에 없는 우리 원천 %d행(표 아래쪽 `관리표 미수록`).' % len(unlisted), '',
              '대조 근거 순서: URL 일치 → 같은 게시물(쿼리 id) → 공공데이터포털 데이터셋 번호 → 같은 원천 다른 경로(규칙 파일 aliases, 이유 기록) → 같은 사이트(사이트 첫 화면 URL 일 때만, 포털 제외). '
              '원장 원천(sources)은 같은 raw 를 쓰는 것끼리 한 행으로 묶었다. 원 파일 수는 대조된 문서 중 저장된 것, evidence 수는 그 문서를 가리키는 대조 기록 수다. '
              '원천주체_행 `rN` 은 원천주체_단계별.csv 의 N번째 데이터 행(머리글 제외)이다.', '',
              '파이프라인에 필요하지만 미수집인 사이트(관리표 행 수 순):', '']
    need = [r for r in site_rows if r['판단'] == '필요' and r['우리_상태'] == '미수집']
    need.sort(key=lambda r: (-r['관리표 행 수'], r['통합출처ID']))
    for r in need:
        lines.append('- %s %s(%s) — 관리표 %d행' % (r['통합출처ID'], r['공식원천명'], r['제공기관'], r['관리표 행 수']))
    lines += ['', '## 4. 관리표 상태칸 채움 제안', '',
              '`수집항목_통합.csv` 의 `제안_수집상태`·`제안_테스트결과`·`제안_근거`. 관리표의 `실제 자료 수집상태`(지금 미수집)·`API·파일 테스트`(지금 미검증) 칸에 옮길 값이다. '
              '수집상태는 오퍼레이션이 정해진 항목은 그 오퍼레이션 원본 파일로, 나머지는 출처ID 대조 결과로 정했다. 테스트결과는 파일·응답 확보 여부와 그 원천 문서를 가리키는 evidence 판정 수다 — '
              '항목(요소) 단위 대조가 아니라 원천 단위다(`우리_검증상태` 도 같음). 요소별 대조는 evidence 의 subject_table·field 로 따로 봐야 한다.', '']
    pc = Counter(i['제안_수집상태'] for i in items)
    lines += ['| 제안 수집상태 | 항목 수 |', '|---|---:|'] + ['| %s | %d |' % (k, pc[k]) for k in sorted(pc, key=lambda k: (-pc[k], k))] + ['']
    lc = Counter(r['대응'] for r in links)
    lines += ['## 5. 연계필드 대응(`연계필드_대응.csv`)', '',
              '관리표 연계필드 %d개 → 우리 표·칸(설계 5절 evidence·source_documents, 원장 projects·identifiers·project_locations·notices 와 기존 policies·programs·policy_targets·links·events). '
              % len(links) + ', '.join('%s %d' % (k, lc[k]) for k in ('같음', '부분', '없음')) + '. 칸 이름은 schemas/ledger 스키마에 있는지 실행 때 검사한다.', '',
              '대응 없음: ' + ', '.join(r['관리표_식별자'] for r in links if r['대응'] == '없음'), '']
    lines += ['## 6. 수집점검 대응', '', '관리표 수집점검 %d개를 우리 지표(M1~M4)·시험·표와 맞춘 것.' % len(checks), '',
              '| # | 단계 | 점검 분야 | 우리 대응 | 지표·시험 | 상태 |', '|---:|---|---|---|---|---|']
    for i, stg, area, o, m, s in checks:
        lines.append('| %d | %s | %s | %s | %s | %s |' % (i, stg, area, o.replace('|', '/'), m, s))
    cc = Counter(c[5].split('(')[0] for c in checks)
    lines += ['', '상태: ' + ', '.join('%s %d' % (k, cc[k]) for k in sorted(cc, key=lambda k: (-cc[k], k))), '']
    return '\n'.join(lines) + '\n'


# ------------------------------------------------------------------ 쓰기·실행

def _write_csv(path, header, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, lineterminator='\r\n')
        w.writerow(header)
        for r in rows:
            w.writerow([common.scrub(r.get(h, '')) for h in header])


def _write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(common.scrub(text))


def run(xlsx, root=common.ROOT, out_dir=None, live_catalog=False):
    wb, names, asof = read_workbook(xlsx)
    common.ACTORS.update(names)
    rules = ids.load_rules()
    ours = Ours(root, rules, live_catalog)
    site_rows, site_info, matched = build_sites(wb, names, ours)
    unlisted = build_unlisted(ours, matched)
    items, same_url = build_items(wb, site_info, ours)
    links = build_links(wb, root)
    checks = build_checks(wb)
    all_ids = [r['관리ID'] for r in wb[SHEET_ROWS]]
    got = [x for i in items for x in i['관리표_관리ID들'].split(' · ')]
    if sorted(got) != sorted(all_ids) or len(set(got)) != len(got):
        raise SystemExit('관리ID 가 빠지거나 두 번 들어감')
    out_dir = out_dir or os.path.join(root, OUT_DIR)
    _write_csv(os.path.join(out_dir, SITE_CSV), SITE_HEAD, site_rows + unlisted)
    _write_csv(os.path.join(out_dir, ITEM_CSV), ITEM_HEAD, items)
    _write_csv(os.path.join(out_dir, LINK_CSV), LINK_HEAD, links)
    _write_text(os.path.join(out_dir, ITEM_MD), build_md(asof, site_rows, unlisted, items, same_url, checks, links, len(all_ids)))
    return {'rows': len(all_ids), 'items': len(items), 'sites': len(site_rows), 'unlisted': len(unlisted),
            'verdicts': Counter(i['중복_판정'] for i in items), 'out_dir': out_dir}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--xlsx', required=True)
    ap.add_argument('--root', default=common.ROOT)
    ap.add_argument('--out', default=None)
    ap.add_argument('--catalog', action='store_true', help='source_documents 를 catalog.build() 로 메모리에서 다시 만든다')
    a = ap.parse_args(argv)
    res = run(a.xlsx, a.root, a.out, a.catalog)
    print('관리ID %(rows)d → 수집항목 %(items)d, 사이트 %(sites)d, 관리표 미수록 %(unlisted)d' % res)
    print('중복 판정: ' + ', '.join('%s %d' % kv for kv in sorted(res['verdicts'].items())))


if __name__ == '__main__':
    main()
