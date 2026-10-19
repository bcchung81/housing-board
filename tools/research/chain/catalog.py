"""source_documents 만들기(설계 docs/speech/research/파이프라인_설계.md 5.1, P9).

문서 1개 = 1행. 파일이 있으면 sha256 이 같은 것은 한 행(다른 URL·경로는 url_aliases·notes), 파일이 없으면
canonical_url(config/url_rules.json) 이 같은 것은 한 행. 실행할 때마다 디스크·manifest 를 다시 읽는다(오프라인, 결정적).

입력(모두 읽기만)
    연구 폴더 원본/** 의 파일(발췌·표·추출 텍스트·manifest·Exa 응답에서 뽑은 텍스트는 파생물 → catalog_derived.csv)
    원본/**/manifest.json (files·identical·각 항목의 attachments)
    웹확인_결과.csv(원문에 적힌 발행기관·부서), dataset/_work/legacy/출처_통합_*.csv(앞서 채운 기관·부서),
    Exa 응답 JSON(*_exa/**, web/exa/**), dataset/_work/*/evidence*.jsonl·policy_*.jsonl 의 doc_url·doc_path
    legacy·evidence 가 가리키는 저장소 raw 파일(schemas/ledger-2026-10/raw/**, data/raw/**, HOME 덤프)
"""
import csv
import glob
import hashlib
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict
from urllib.parse import parse_qsl, urlsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ids  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
RESEARCH = 'docs/speech/research'
DATASET_SOURCE_REF = 'research-chain-dataset'

# 우리 도구가 만든 파생물(원천 아님) — 파일 이름 형식 규칙
DERIVED_NAME = [(re.compile(r'^발췌_.*\.csv$'), '발췌'), (re.compile(r'_표\.csv$'), '표 추출'),
                (re.compile(r'_추출텍스트\.txt$'), '추출 텍스트'), (re.compile(r'^manifest\.json$'), '수집 기록(manifest)'),
                (re.compile(r'^run-\d{4}-\d{2}-\d{2}_.*\.json$'), '발견 실행 요약'), (re.compile(r'^compare\.json$'), '수집 비교 기록'),
                (re.compile(r'^copy-hashes-.*\.json$'), '재게시본 해시 비교 기록'), (re.compile(r'^followups-.*\.json$'), '후속 발표 발견 기록'),
                (re.compile(r'^progress_reports\.json$'), '발견 진행 기록')]
# 발견 단계(discover.py --fetch)가 manifest 머리 주소(endpoint) 게시물을 저장하는 파일 이름
ENDPOINT_PAGE_NAMES = ('page.html',)
# 우리 도구의 내려받기 기록 캐시 폴더(원천 아님)
DERIVED_DIR = [(re.compile(r'/_cache/'), '수집 도구 캐시')]
# 발견 단계 캐시({"kind","request","response"}) 의 kind → 수집 방법
CACHE_METHOD = {'exa-search': 'EXA_SEARCH', 'exa-contents': 'EXA_CONTENTS'}
FORMAT_EXT = {'.pdf': 'PDF', '.hwpx': 'HWPX', '.hwp': 'HWP', '.html': 'HTML', '.htm': 'HTML', '.json': 'JSON',
              '.csv': 'CSV', '.xls': 'XLS', '.xlsx': 'XLSX', '.zip': 'ZIP', '.docx': 'DOCX', '.txt': 'TXT'}
DOC_FORMATS = {'PDF', 'HWPX', 'HWP', 'DOCX', 'TXT'}   # '보고·현황' 규칙을 쓰는 파일 형식(HTML 게시물·안내 페이지 제외)
# (낱말, 문서 유형, 문서 형식에만) — 위에서부터 처음 맞는 것
DOC_TYPE_RULES = [(('해명',), 'CLARIFICATION', False), (('안건',), 'AGENDA', False), (('브리핑문', '모두말씀'), 'BRIEFING', False),
                  (('보도자료', '(조간)', '(석간)'), 'PRESS_RELEASE', False), (('고시',), 'GOSI', False),
                  (('모집공고', '입주자모집', '공급안내'), 'RECRUIT_NOTICE', False), (('공급계획', '입주계획'), 'PLAN_LIST', False),
                  (('보고', '현황'), 'REPORT', True)]
# 정부 보도자료 파일 이름 관례: 'YYMMDD (부처) 제목'·'YYMMDD(조간) 제목'
PRESS_FILE = re.compile(r'^\d{6}\s*\((조간|석간|[가-힣]+부|관계부처 합동)\)')
# 모집공고 게시물의 첨부: 공고문 본문이면 RECRUIT_NOTICE, 아니면(평면도·팸플릿·서식 등) NOTICE_ATTACHMENT
NOTICE_BODY = ('공고문', '모집공고', '정정공고')
NOT_NOTICE_BODY = ('팸플릿', '팜플렛', '카탈로그', '배치도', '평면도', '동의서', '위임장', '확인서', '신청서', '작성방법', '서식', '양식')
GOSI_FILE = re.compile(r'(국토교통부|[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구))_?고시\s*_?제?\s*\d{4}-\d+호|'
                       r'(국토교통부|[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구))_제\d{4}-\d+호_고시')
LEGACY_METHOD = {'저장소원본': 'REPO_RAW', 'HOME덤프': 'HOME_DUMP', 'ego lite': 'EGO_LITE', 'Exa(보고서 인용)': 'EXA_SEARCH'}
PHONE_RE = re.compile(r'(?<![\d.])(0\d{1,2}[-)] ?\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4})(?![\d])')
URL_RE = re.compile(r'https?://\S+')
# 기관 후보 우선순위(작을수록 앞): 원문 기록 → 앞선 기록 → manifest → 고시 파일명 → 게시물(상위 문서) → 도메인 추정
P_WEB, P_LEGACY, P_MANIFEST, P_GOSI = 0, 1, 2, 3
PUB_METHOD = {P_WEB: '웹 원문 확인 기록', P_LEGACY: '앞선 출처 기록', P_MANIFEST: '게시판 표기'}
# 상위 문서 후보 우선순위: manifest attachments → source_page → manifest 머리 주소(같은 호스트) → 웹확인 url
Q_ATTACH, Q_SOURCE_PAGE, Q_ENDPOINT, Q_WEBCHECK = 0, 1, 2, 3


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def format_of(name):
    n = (name or '').lower()
    if n.endswith('.jsonl.gz'):
        return 'JSONL_GZ'
    return FORMAT_EXT.get(os.path.splitext(n)[1], 'OTHER')


ZIP_FAMILY = {'HWPX', 'XLSX', 'DOCX', 'ZIP'}
OLE_FAMILY = {'HWP', 'XLS'}


def sniff_format(path, by_ext):
    """파일 앞 바이트(매직 넘버)로 형식을 정한다. 확장자 형식과 다르면 (내용 형식, notes 문구)."""
    with open(path, 'rb') as f:
        head = f.read(512)
    s = head.lstrip(b'\xef\xbb\xbf \t\r\n')
    if head.startswith(b'%PDF'):
        got = 'PDF'
    elif head.startswith(b'\xd0\xcf\x11\xe0'):                  # OLE 복합 문서(HWP 5·XLS)
        got = by_ext if by_ext in OLE_FAMILY else 'OTHER'
    elif head.startswith(b'PK\x03\x04'):
        got = by_ext if by_ext in ZIP_FAMILY else 'ZIP'
    elif head.startswith(b'\x1f\x8b'):
        got = 'JSONL_GZ' if by_ext == 'JSONL_GZ' else 'OTHER'
    elif s[:1] in (b'{', b'[') and by_ext in ('JSON', 'TXT', 'OTHER'):
        got = 'JSON'
    elif s[:1] == b'<' and re.match(rb'<(!doctype|html|head|body|\?xml|!--|meta|div|table)', s[:20], re.I) and by_ext not in ZIP_FAMILY:
        got = 'HTML' if by_ext != 'OTHER' or b'html' in s[:200].lower() else by_ext
    else:
        return by_ext, None
    if got == by_ext:
        return by_ext, None
    return got, '형식: 확장자는 %s, 내용(앞 바이트)은 %s' % (by_ext, got)


def url_format(url):
    """파일 없는 URL 의 형식: 경로·쿼리 값의 확장자, 내려받기 주소면 OTHER, 아니면 HTML."""
    from urllib.parse import unquote, urlsplit
    m = ids.POST_RE.match(url)
    body = m.group(2) if m else ''
    p = urlsplit(m.group(1) if m else url)
    for part in [p.path] + re.split(r'[&=]', unquote(p.query + '&' + body)):
        f = format_of(part)
        if f != 'OTHER':
            return f
    if re.search(r'download|filedown|lhfile', p.path, re.I):
        return 'OTHER'
    return 'HTML'


def stage_codes_of(text):
    out = set()
    for part in re.split(r'[;,\s]+', text or ''):
        m = re.match(r'^(\d\d)~(\d\d)$', part)
        if m:
            out.update('%02d' % i for i in range(int(m.group(1)), int(m.group(2)) + 1))
            continue
        m = re.match(r'^(0[1-6])(\.|$)', part)
        if m:
            out.add(m.group(1))
    return out


def stage_of_path(rel):
    m = re.search(r'(?:^|/)(0[1-6])\.[^/]+/', rel)
    return {m.group(1)} if m else set()


def method_of(text):
    t = (text or '').lower()
    if t.startswith('ego lite') or 'ego lite' in t:
        return 'EGO_LITE'
    if 'exa' in t:
        return 'EXA_CONTENTS'
    return 'HTTP' if t else None


def strip_parens(s):
    s = re.sub(r'\s*\([^()]*\)', '', s).strip()
    return re.sub(r'\s+(보도자료|게시물|자료)$', '', s)


def parse_org(raw):
    """기록된 기관 문자열 → (발행기관 또는 None, 게시처 또는 None, 도메인 추정 여부)."""
    raw = (raw or '').strip()
    if not raw:
        return None, None, False
    parts = [p.strip() for p in raw.split(' · ')]
    pub, host = None, None
    head = parts[0]
    for p in parts[1:]:
        if p.startswith('게시 '):
            host = strip_parens(p[3:])
        elif p.startswith('원 보도자료 ') or p.startswith('원 '):
            pub, host = strip_parens(p.split(' ', 2)[-1]), strip_parens(head)
    if pub:
        return pub, host, False
    if head.endswith(' 게시') or '(재게시)' in head or head.startswith('비공식'):
        return None, strip_parens(re.sub(r'\s*게시$', '', head)), False
    return strip_parens(head) or None, host, False


def clean_dept(raw):
    d = (raw or '').strip()
    if not d or d.startswith('본부 열') or ' ; ' in d:
        return None
    d = re.sub(r'\s*\([^()]*(파일명|기준|담당)[^()]*\)', '', d).strip()
    return d or None


def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def read_jsonl(path):
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.strip():
                out.append(json.loads(line))
    return out


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    if isinstance(v, str) and v.startswith('['):
        try:
            return json.loads(v.replace("'", '"'))
        except ValueError:
            return URL_RE.findall(v)
    return [v]


class Obs(dict):
    """한 원천 기록이 한 파일(path) 또는 URL 에 대해 말한 것."""

    def __init__(self, **kw):
        super().__init__(urls=[], stages=set(), method=None, collected_at=None, published_at=None, kinds=[],
                         titles=[], orgs=[], depts=[], hosts=[], parents=[], notes=[], reason=None, legacy=False)
        self.update(kw)


class Catalog:
    def __init__(self, repo=REPO, research=RESEARCH, config_dir=ids.CONFIG):
        self.repo, self.research = repo, research.rstrip('/')
        self.rules = ids.load_rules(config_dir)
        self.domains = ids.load_json('domains.json', config_dir)
        self.file_meta = {}                 # rel path → (sha, bytes)
        self.fobs = defaultdict(list)       # rel path → [Obs]
        self.uobs = []                      # [(raw url, Obs)]
        self.derived = {}                   # rel path → {kind, from: set(rel path)}
        self.legacy_map = []                # legacy 행마다 ('file', rel) · ('url', raw) · ('missing', 값)
        self.attachments = []               # manifest 첨부: (부모 rel path, 첨부 rel path 또는 None, download)
        self.missing_refs = []              # 가리키지만 없는 파일
        self.pub_rules = ids.load_json('publisher_rules.json', config_dir)
        self.manifest_heads = {}            # manifest 폴더 → 머리 주소(endpoint·params URL)
        self.pub_method = {}                # doc_id → 발행기관 판정 방법

    def chost(self, url):
        """호스트 별칭(url_rules.json host_aliases)을 적용한 호스트."""
        return ids.host_of(ids.canonical_url(url, self.rules)[0]) if url else ''

    # ---------- 경로 ----------
    def abs(self, rel):
        return os.path.join(self.repo, rel)

    def rel(self, path):
        return os.path.relpath(path, self.repo).replace(os.sep, '/')

    def exists(self, rel):
        return bool(rel) and os.path.isfile(self.abs(rel))

    def add_file(self, rel, obs):
        if rel not in self.file_meta:
            p = self.abs(rel)
            self.file_meta[rel] = (sha256_file(p), os.path.getsize(p))
        obs['stages'] |= stage_of_path(rel)
        self.fobs[rel].append(obs)

    # ---------- 1. 디스크 ----------
    def scan_disk(self):
        base = self.abs(self.research)
        files = []
        for d, _dirs, fs in os.walk(base):
            if '/원본' not in self.rel(d) + '/' and not self.rel(d).endswith('/원본'):
                continue
            for f in fs:
                if not f.startswith('.'):
                    files.append(self.rel(os.path.join(d, f)))
        files.sort()
        exa_texts = {}
        for rel in files:
            if self.is_exa_json(rel):
                d = self.load_exa(rel)
                for r in d.get('results') or []:
                    if r.get('text'):
                        exa_texts.setdefault(r['text'].strip(), rel)
        for rel in files:
            name = os.path.basename(rel)
            kind = next((k for rx, k in DERIVED_NAME if rx.search(name)), None) or \
                next((k for rx, k in DERIVED_DIR if rx.search(rel)), None)
            if kind:
                self.derived[rel] = {'kind': kind, 'from': self.derived_sources(rel, kind)}
                continue
            if rel.endswith('.txt') and re.search(r'_exa[^/]*/|/exa/', rel):
                with open(self.abs(rel), encoding='utf-8', errors='replace') as f:
                    src = exa_texts.get(f.read().strip())
                if src:
                    self.derived[rel] = {'kind': 'Exa 응답 본문 텍스트', 'from': {src}}
                    continue
            cache = self.cache_wrapper(rel)
            if cache:
                req = cache.get('request') or {}
                url = req.get('url') or req.get('endpoint') or ''
                method = CACHE_METHOD.get(cache['kind'], 'HTTP')
                host = 'api.exa.ai' if method.startswith('EXA') else ids.host_of(url)
                self.add_file(rel, Obs(method=method, hosts=[host] if host else [], kinds=['응답 캐시 ' + cache['kind']],
                                       request_urls=[url] if url.startswith('http') else [],
                                       notes=['응답 캐시(%s) 요청: %s' % (cache['kind'], url)] if url else []))
                continue
            if self.is_exa_json(rel):
                d = self.load_exa(rel)
                method = 'EXA_SEARCH' if 'resolvedSearchType' in d or 'searchType' in d else 'EXA_CONTENTS'
                self.add_file(rel, Obs(method=method, titles=['Exa %s 응답 %s' % ('검색' if method == 'EXA_SEARCH' else 'contents', name)],
                                       hosts=['api.exa.ai'], notes=['Exa 응답 결과 %d건' % len(d.get('results') or [])]))
            else:
                self.add_file(rel, Obs())

    def cache_wrapper(self, rel):
        if not rel.endswith('.json') or os.path.basename(rel) == 'manifest.json':
            return None
        try:
            with open(self.abs(rel), encoding='utf-8') as f:
                d = json.load(f)
        except ValueError:
            return None
        return d if isinstance(d, dict) and isinstance(d.get('kind'), str) and isinstance(d.get('request'), dict) else None

    def is_exa_json(self, rel):
        return rel.endswith('.json') and bool(re.search(r'_exa[^/]*/|/exa/', rel)) and os.path.basename(rel) != 'manifest.json'

    def load_exa(self, rel):
        with open(self.abs(rel), encoding='utf-8') as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}

    def derived_sources(self, rel, kind):
        out = set()
        p = self.abs(rel)
        if rel.endswith('.csv'):
            with open(p, encoding='utf-8-sig', newline='') as f:
                for r in csv.DictReader(f):
                    v = (r.get('원본_파일') or '').split('!')[0]
                    if v:
                        out.add(v)
        elif rel.endswith('.txt'):
            with open(p, encoding='utf-8', errors='replace') as f:
                m = re.search(r'원본: (\S+)', f.readline())
            if m:
                out.add(m.group(1))
        return out

    # ---------- 2. manifest ----------
    def read_manifests(self):
        for mf in sorted(glob.glob(os.path.join(self.abs(self.research), '**', '원본', '**', 'manifest.json'), recursive=True)):
            mrel = self.rel(mf)
            mdir = os.path.dirname(mrel)
            with open(mf, encoding='utf-8') as f:
                m = json.load(f)
            heads = [u for u in as_list(m.get('endpoint')) if isinstance(u, str) and u.startswith('http')]
            heads += [v for v in (m.get('params') or {}).values() if isinstance(v, str) and v.startswith('http')]
            params = m.get('params') or {}
            if isinstance(params, str):
                try:
                    params = json.loads(params.replace("'", '"').replace('None', 'null'))
                except ValueError:
                    params = {}
            heads += [v for v in params.values() if isinstance(v, str) and v.startswith('http') and v not in heads]
            self.manifest_heads[mdir] = heads
            src_dept = None
            sm = re.search(r'담당부서 ([^),，]+)', m.get('source') or '')
            if sm:
                src_dept = sm.group(1).strip()
            top_method = method_of(m.get('method') or m.get('notes'))
            files = m.get('files') or {}
            items = sorted(files.items()) if isinstance(files, dict) else [(str(i), e) for i, e in enumerate(files)]
            for key, e in items:
                rel = mdir + '/' + e['filename']
                url = e.get('url')
                host = self.chost(url)
                same = [h for h in heads if self.chost(h) == host and ids.canonical_url(h, self.rules)[0] != ids.canonical_url(url, self.rules)[0]]
                o = Obs(urls=[u for u in [url] + as_list(e.get('also_from')) if u], method=method_of(e.get('method')) or top_method,
                        collected_at=e.get('fetched_at') or m.get('fetched_at'), kinds=[e['kind']] if e.get('kind') else [],
                        notes=['manifest %s' % mrel.split('/원본/')[0].split('/')[-1] + ' ' + key])
                if e.get('dept'):
                    o['depts'].append((P_MANIFEST, e['dept']))
                for k in self.pub_rules.get('manifest_org_keys', []):
                    if isinstance(e.get(k), str) and e[k].strip():
                        o['orgs'].append((P_MANIFEST, e[k].strip()))
                        break
                if heads and same:
                    if params.get('posted'):
                        o['published_at'] = str(params['posted'])[:10]
                    d = params.get('dept') or src_dept
                    if d:
                        o['depts'].append((P_MANIFEST, d))
                if e.get('source_page'):
                    o['parents'].append((Q_SOURCE_PAGE, e['source_page']))
                if len(same) == 1:
                    o['parents'].append((Q_ENDPOINT, same[0]))
                if self.exists(rel):
                    self.add_file(rel, o)
                else:
                    self.missing_refs.append(('manifest', mrel, rel))
                    if url:
                        o['stages'] |= stage_of_path(mdir + '/')
                        o['reason'] = 'manifest 에 적혔으나 파일 없음'
                        self.uobs.append((url, o))
                for a in e.get('attachments') or []:
                    self.attachment(mdir, rel, url, e, a)
            self.sibling_parents(mdir, items)
            ends = [u for u in as_list(m.get('endpoint')) if isinstance(u, str) and u.startswith('http')]
            listed = {e['filename'] for _k, e in items}
            for name in ENDPOINT_PAGE_NAMES:
                rel = mdir + '/' + name
                if len(ends) == 1 and name not in listed and self.exists(rel):
                    o = Obs(urls=[ends[0]], method=top_method, collected_at=m.get('fetched_at'), kinds=['게시물 페이지'],
                            notes=['manifest %s endpoint' % mrel.split('/원본/')[0].split('/')[-1]])
                    if params.get('posted'):
                        o['published_at'] = str(params['posted'])[:10]
                    if params.get('dept') or src_dept:
                        o['depts'].append((P_MANIFEST, params.get('dept') or src_dept))
                    self.add_file(rel, o)
            for e in m.get('identical') or []:
                rel = e.get('same_file')
                o = Obs(urls=[e['url']] if e.get('url') else [], method=method_of(e.get('method')) or top_method,
                        collected_at=e.get('fetched_at'), stages=stage_codes_of(e.get('stage')),
                        notes=['manifest %s identical' % mrel.split('/원본/')[0].split('/')[-1]])
                same = [h for h in heads if self.chost(h) == self.chost(e.get('url'))]
                if len(same) == 1:
                    o['parents'].append((Q_ENDPOINT, same[0]))
                if self.exists(rel):
                    self.add_file(rel, o)
                else:
                    self.missing_refs.append(('manifest identical', mrel, rel))

    def sibling_parents(self, mdir, items):
        """같은 manifest 의 '첨부' 항목: 같은 호스트의 HTML 항목 중 URL(·POST 본문) 값이 겹치는 것이 하나면 그 게시물이 상위 문서."""
        def vals(u):
            m = ids.POST_RE.match(u or '')
            q = urlsplit(m.group(1) if m else (u or '')).query + '&' + (m.group(2) if m else '')
            return {v for _k, v in parse_qsl(q) if len(v) >= 4}
        pages = [(e, mdir + '/' + e['filename']) for _k, e in items if format_of(e['filename']) == 'HTML' and e.get('url')]
        for _k, e in items:
            if '첨부' not in (e.get('kind') or '') or not e.get('url'):
                continue
            rel = mdir + '/' + e['filename']
            mine = vals(e['url'])
            hits = [prel for pe, prel in pages if self.chost(pe['url']) == self.chost(e['url']) and mine & vals(pe['url'])]
            if len(hits) == 1 and self.exists(rel) and rel in self.fobs:
                for o in self.fobs[rel]:
                    o['parents'].append((Q_ENDPOINT, hits[0]))

    def attachment(self, mdir, parent_rel, parent_url, entry, a):
        stage_dir = a.get('path_stage')
        rel = None
        if a.get('saved') and a.get('path'):
            base = (self.research + '/' + stage_dir + '/원본/web') if stage_dir else mdir
            rel = base + '/' + a['path']
        download = a.get('download') or ''
        is_url = download.startswith('http')
        o = Obs(urls=[download] if is_url else [], method=method_of(entry.get('method')),
                collected_at=entry.get('fetched_at'), titles=[a['filename']], kinds=[a.get('role') or '게시물 첨부'],
                stages=stage_codes_of(stage_dir) | stage_of_path(mdir + '/'), parents=[(Q_ATTACH, parent_rel if self.exists(parent_rel) else parent_url)])
        if entry.get('dept'):
            o['depts'].append((P_MANIFEST, entry['dept']))
        if rel and self.exists(rel):
            self.add_file(rel, o)
            self.attachments.append((parent_rel, rel, download))
            return
        if rel:
            self.missing_refs.append(('attachment', parent_rel, rel))
        o['reason'] = a.get('reason') or ('저장 경로의 파일 없음' if rel else '첨부를 받지 않음')
        if a.get('size_bytes') is not None:
            o['notes'].append('첨부 크기 %s바이트' % a['size_bytes'])
        if not is_url:
            o['notes'].append('다운로드 식별자: %s' % (download or '없음'))
            o['urls'] = ['%s#attach=%s' % (parent_url, a['filename'])]
        o['format_hint'] = format_of(a['filename'])
        self.uobs.append((o['urls'][0], o))
        self.attachments.append((parent_rel, None, o['urls'][0]))

    # ---------- 3. 웹확인 결과·legacy 출처 ----------
    def read_webcheck(self):
        path = self.abs(self.research + '/웹확인_결과.csv')
        if not os.path.exists(path):
            return
        for w in read_csv(path):
            rel = w.get('저장파일') or ''
            if not self.exists(rel):
                continue
            pub, host, _ = parse_org(w.get('발행기관'))
            o = Obs(stages=stage_codes_of(w.get('단계')))
            if pub:
                o['orgs'].append((P_WEB, pub))
            if host:
                o['hosts'].append(host)
            d = clean_dept(w.get('담당부서'))
            if d:
                o['depts'].append((P_WEB, d))
            if w.get('url'):
                o['page_urls'] = [w['url']]
            self.add_file(rel, o)

    def legacy_paths(self, v):
        out = []
        m = re.match(r'^(.*?) \(원 위치 (.*)\)$', v or '')
        for p in ([m.group(1), m.group(2)] if m else [v]):
            p = (p or '').strip()
            if p:
                out.append(p)
        return out

    def read_legacy(self):
        for path in sorted(glob.glob(self.abs(self.research + '/dataset/_work/legacy/출처_통합_*.csv'))):
            for r in read_csv(path):
                stages = stage_codes_of(r.get('단계'))
                pub, host, _ = parse_org(r.get('발행·제공기관'))
                domain_guess = '도메인) 기준' in (r.get('비고') or '')
                o = Obs(stages=stages, titles=[r['자료명']] if r.get('자료명') else [], legacy=True,
                        method=LEGACY_METHOD.get(r.get('수집방법')))
                if pub and not domain_guess:
                    o['orgs'].append((P_LEGACY, pub))
                if host:
                    o['hosts'].append(host)
                d = clean_dept(r.get('담당부서'))
                if d:
                    o['depts'].append((P_LEGACY, d))
                url = r.get('url') or ''
                method = r.get('수집방법')
                paths = [] if method == 'Exa(보고서 인용)' else self.legacy_paths(r.get('저장파일'))
                found = [p for p in paths if self.exists(p)]
                if found:
                    o['urls'] = [url] if url else []
                    if method in ('저장소원본', 'HOME덤프') and r.get('수집일'):
                        o['collected_at'] = r['수집일']
                    if method == 'Exa':
                        o['method'] = None
                    for p in found:
                        self.add_file(p, Obs(**{k: (list(v) if isinstance(v, list) else (set(v) if isinstance(v, set) else v)) for k, v in o.items()}))
                    self.legacy_map.append(('file', found[0]))
                elif url:
                    o['urls'] = [url]
                    o['reason'] = '보고서 인용 URL, 원 파일을 받지 않음' if method == 'Exa(보고서 인용)' else 'HOME 덤프 근거 URL, 원 파일을 받지 않음'
                    self.uobs.append((url, o))
                    self.legacy_map.append(('url', url))
                else:
                    self.legacy_map.append(('missing', r.get('저장파일')))
                    self.missing_refs.append(('legacy', path, r.get('저장파일')))

    # ---------- 4. evidence 중간 출력 ----------
    def read_evidence_refs(self):
        for path in sorted(glob.glob(self.abs(self.research + '/dataset/_work/*/*.jsonl'))):
            name = os.path.basename(path)
            if not (name.startswith('evidence') or name.startswith('policy_')):
                continue
            for r in read_jsonl(path):
                st = {r['stage_code']} if r.get('stage_code') else ({'01'} if name.startswith('policy_') else set())
                p, u = r.get('doc_path'), r.get('doc_url')
                if p and self.exists(p):
                    # doc_url 은 그 파일을 내려받은 주소가 아닐 수 있다(게시물·포털 안내 페이지) → 파일의 URL 과 같지 않으면 상위 문서 후보
                    self.add_file(p, Obs(page_urls=[u] if u else [], stages=st, method='REPO_RAW' if not p.startswith(self.research + '/') else None))
                elif u:
                    if p:
                        self.missing_refs.append(('evidence', self.rel(path), p))
                    self.uobs.append((u, Obs(stages=st, method='HOME_DUMP' if r.get('external_ref') else 'EXA_SEARCH',
                                             reason='evidence 가 가리킨 URL, 원 파일을 받지 않음', notes=['evidence 에서 온 URL'])))
                elif p:
                    self.missing_refs.append(('evidence', self.rel(path), p))

    def add_parent_pages(self):
        """상위 게시물 후보 URL 을 URL 기록으로 더한다(받은 파일이 있으면 그 문서에 합쳐지고, 없으면 미보존 URL 문서)."""
        allobs = [o for os_ in self.fobs.values() for o in os_] + [o for _, o in self.uobs]
        for o in allobs:
            for q, ref in o['parents'] + [(Q_WEBCHECK, u) for u in o.get('page_urls') or []]:
                if ref and ref.startswith('http'):
                    self.uobs.append((ref, Obs(stages=set(o['stages']), method='HOME_DUMP' if q == Q_WEBCHECK else o['method'],
                                               reason='첨부의 게시물 페이지, 원 파일을 받지 않음')))

    # ---------- 5. 묶기 ----------
    def build(self):
        self.scan_disk()
        self.read_manifests()
        self.read_webcheck()
        self.read_legacy()
        self.read_evidence_refs()
        self.add_parent_pages()
        canon = lambda u: ids.canonical_url(u, self.rules)[0]  # noqa: E731
        # 파일 → sha 묶음
        by_sha = defaultdict(list)
        for rel in sorted(self.fobs):
            by_sha[self.file_meta[rel][0]].append(rel)
        docs = {}
        url_owner = defaultdict(set)   # 정규화 URL → 파일 문서 doc_id
        for sha, rels in sorted(by_sha.items()):
            did = ids.doc_id_for_file(sha)
            obs = [o for r in rels for o in self.fobs[r]]
            raw = sorted({u for o in obs for u in o['urls'] if u})
            # 웹확인 url 은 그 파일의 URL 이 아니면 상위 게시물 후보(웹확인은 게시물 주소와 받은 첨부를 한 줄에 적는다)
            own = {canon(u) for u in raw}
            for o in obs:
                for wu in o.get('page_urls') or []:
                    if canon(wu) not in own:
                        o['parents'].append((Q_WEBCHECK, wu))
            docs[did] = {'doc_id': did, 'sha256': sha, 'bytes': self.file_meta[rels[0]][1], 'paths': rels, 'obs': obs,
                         'raw_urls': raw}
            for u in raw:
                url_owner[canon(u)].add(did)
        # 같은 URL 이 다른 내용을 돌려준 경우: 모두 HTML 이면 가장 늦게 받은 것, 아니면 아무도 canonical 을 갖지 않는다
        self.ambiguous = {}
        winner = {}
        for c, owners in url_owner.items():
            if len(owners) == 1:
                winner[c] = next(iter(owners))
                continue
            fmts = {format_of(docs[d]['paths'][0]) for d in owners}
            if fmts == {'HTML'}:
                best = sorted(owners, key=lambda d: (max((o['collected_at'] or '') for o in docs[d]['obs']), d))[-1]
                winner[c] = best
            self.ambiguous[c] = sorted(owners)
        for did, d in docs.items():
            cands = sorted({canon(u) for u in d['raw_urls']})
            mine = [c for c in cands if winner.get(c) == did]
            gov = [c for c in mine if (ids.domain_entry(ids.host_of(c), self.domains) or {}).get('gov_original')]
            d['canonical_url'] = (gov or mine or [None])[0]
            d['url_aliases'] = sorted(({*d['raw_urls'], *cands}) - {d['canonical_url']})
            for c in cands:
                if c in self.ambiguous and winner.get(c) != did:
                    d['obs'][0]['notes'].append('같은 URL 이 다른 내용을 돌려줌(%s)' % ', '.join(x for x in self.ambiguous[c] if x != did))
        # URL 기록 → 파일 문서에 합치거나 URL 문서
        for raw, o in sorted(self.uobs, key=lambda x: x[0]):
            c = canon(raw)
            if c in url_owner:
                for did in sorted(url_owner[c]):
                    o2 = Obs(**{k: v for k, v in o.items() if k not in ('reason',)})
                    o2['urls'] = [raw]
                    docs[did]['obs'].append(o2)
                    docs[did]['raw_urls'] = sorted(set(docs[did]['raw_urls']) | {raw})
                    if raw != docs[did]['canonical_url'] and raw not in docs[did]['url_aliases']:
                        docs[did]['url_aliases'] = sorted(set(docs[did]['url_aliases']) | {raw})
                continue
            did = ids.doc_id_for_url(c)
            d = docs.setdefault(did, {'doc_id': did, 'sha256': None, 'bytes': None, 'paths': [], 'obs': [],
                                      'raw_urls': [], 'canonical_url': c, 'url_aliases': []})
            d['obs'].append(o)
            if raw != c:
                d['url_aliases'] = sorted(set(d['url_aliases']) | {raw})
        self.docs = docs
        self.url_index = {c: winner.get(c) for c in url_owner}
        for did, d in docs.items():
            if not d['sha256']:
                self.url_index[d['canonical_url']] = did
        self.path_index = {p: did for did, d in docs.items() for p in d['paths']}
        self.resolve_parents()
        rows = [self.row(d) for d in docs.values()]
        self.decide_publishers(rows)
        self.refine_attachment_types(rows)
        rows.sort(key=lambda r: r['doc_id'])
        self.rows = rows
        return rows

    def lookup(self, path=None, url=None):
        """doc_path·doc_url → (doc_id 또는 None, 사유)."""
        if path and path in self.path_index:
            return self.path_index[path], None
        if path and self.exists(path):
            return self.path_index.get(path), None
        if url:
            c = ids.canonical_url(url, self.rules)[0]
            if c in self.url_index and self.url_index[c]:
                return self.url_index[c], None
            if c in self.ambiguous:
                return None, '같은 URL 이 다른 내용(여러 문서)'
            return None, '목록에 없는 URL'
        return None, '목록에 없는 파일' if path else '문서 없음'

    def derived_in_research(self):
        """연구 폴더 원본/** 아래 파생물 경로(디스크 판정에서 제외하는 것)."""
        return sorted(p for p in self.derived if p.startswith(self.research + '/') and '/원본/' in p)

    def resolve(self, url=None, path=None):
        """URL·저장소 경로 → doc_id(없으면 None). URL 은 정규화 뒤 canonical_url·url_aliases(같은 sha 의 다른 URL 포함)로 찾는다."""
        return self.lookup(path=path, url=url)[0]

    def same_document(self, a, b):
        """두 참조(URL 또는 저장소 경로)가 같은 문서인가: True·False, 하나라도 목록에 없으면 None.
        같은 문서 = 같은 doc_id(파일은 sha256 이 같고, URL 은 같은 문서의 canonical_url·url_aliases)."""
        ids_ = [self.resolve(path=x) if x and not x.startswith('http') else self.resolve(url=x) for x in (a, b)]
        return None if None in ids_ else ids_[0] == ids_[1]

    def resolve_parents(self):
        for did, d in self.docs.items():
            found = []
            for _q, ref in sorted({p for o in d['obs'] for p in o['parents'] if p[1]}):
                pid = self.path_index.get(ref) or self.lookup(url=ref)[0]
                if pid and pid != did and pid not in found:
                    found.append(pid)
            d['parent'] = found[0] if found else None
            d['other_parents'] = found[1:]

    def row(self, d):
        obs = d['obs']
        rep = self.pick_path(d['paths'])
        titles = [t for o in obs for t in o['titles']]
        kinds = [k for o in obs for k in o['kinds']]
        fmt_note = None
        if rep:
            fmt, fmt_note = sniff_format(self.abs(rep), format_of(rep))
        fmt = fmt if rep else next((o['format_hint'] for o in obs if o.get('format_hint')), None) or url_format(d['canonical_url'])
        title = os.path.basename(rep) if rep else (Counter(titles).most_common(1)[0][0] if titles else d['canonical_url'])
        methods = [o['method'] for o in obs if o['method']]
        if rep and not methods:
            methods = ['REPO_RAW' if not rep.startswith(self.research + '/') else 'HTTP']
        method = self.pick_method(methods, rep)
        stages = sorted({s for o in obs for s in o['stages']})
        notes = []
        org, org_note = self.pick_org(d, obs, rep)
        if org_note:
            notes.append(org_note)
        d['pub_method'] = PUB_METHOD.get(d.pop('org_prio', None))
        depts = sorted({(p, v) for o in obs for p, v in o['depts']})
        dept = None
        if depts:
            top = [v for p, v in depts if p == depts[0][0]]
            vals = Counter(top).most_common()
            dept = vals[0][0]
            if len({v for v in top}) > 1:
                notes.append('부서 기록 여러 가지: ' + ', '.join(sorted(set(top))))
        host_url = d['canonical_url'] or next((u for u in d['url_aliases'] if u.startswith('http')), None)
        he = ids.domain_entry(ids.host_of(host_url), self.domains) if host_url else None
        if not he:
            hosts = [h for o in obs for h in o['hosts']]
            he = next((ids.domain_entry(h, self.domains) for h in hosts if ids.domain_entry(h, self.domains)), None)
            he = he or ({'org': hosts[0]} if hosts else None)
        host_org = he['org'] if he else None
        if fmt_note:
            notes.append(fmt_note)
        if len(d['paths']) > 1:
            notes.append('같은 파일 다른 경로: ' + '; '.join(p for p in d['paths'] if p != rep))
        if d.get('other_parents'):
            notes.append('다른 게시물에도 첨부: ' + ', '.join(d['other_parents']))
        notes += sorted({n for o in obs for n in o['notes'] if not n.startswith('manifest ')})
        mans = sorted({n for o in obs for n in o['notes'] if n.startswith('manifest ')})
        if mans:
            notes.append('; '.join(mans))
        if not rep and self.exa_has(d['canonical_url']):
            notes.append('Exa 응답에 본문 있음: ' + ', '.join(self.exa_has(d['canonical_url'])))
        reasons = sorted({o['reason'] for o in obs if o['reason']})
        collected = sorted({o['collected_at'] for o in obs if o['collected_at'] and rep})
        published = sorted({o['published_at'] for o in obs if o['published_at']})
        return {
            'doc_id': d['doc_id'], 'canonical_url': d['canonical_url'], 'url_aliases': d['url_aliases'],
            'title': title, 'doc_type': self.doc_type(fmt, method, rep, [title] + kinds + titles), 'format': fmt,
            'publisher_org': org, 'publisher_dept': dept, 'host_org': host_org,
            'published_at': published[0] if published else None,
            'collected_at': collected[0] if collected else None, 'collection_method': method,
            'local_path': rep, 'sha256': d['sha256'], 'bytes': d['bytes'], 'parent_doc_id': d.get('parent'),
            'stage_codes': stages, 'saved': bool(rep), 'not_saved_reason': None if rep else (reasons[0] if reasons else '원 파일을 받지 않음'),
            'source_ref': DATASET_SOURCE_REF, 'notes': ' · '.join(dict.fromkeys(n for n in notes if n)) or None,
        }

    def pick_path(self, paths):
        if not paths:
            return None
        return sorted(paths, key=lambda p: (p.startswith(self.research + '/'), '/web/' in p, '/attach/' in p, p))[0]

    def pick_method(self, methods, rep):
        if rep and not rep.startswith(self.research + '/'):
            return 'HOME_DUMP' if '/raw/home/' in rep else 'REPO_RAW'
        order = ['EGO_LITE', 'HTTP', 'API', 'EXA_CONTENTS', 'EXA_SEARCH', 'REPO_RAW', 'HOME_DUMP']
        if rep:
            methods = [m for m in methods if m not in ('HOME_DUMP', 'EXA_SEARCH') or len(set(methods)) == 1] or methods
        return sorted(set(methods), key=order.index)[0] if methods else 'HTTP'

    def pick_org(self, d, obs, rep):
        """기록(웹확인 결과·앞선 출처·manifest 기관 표기)에 적힌 발행기관. 없으면 (None, None) — decide_publishers 가 정한다."""
        cands = sorted({(p, v) for o in obs for p, v in o['orgs']})
        if not cands:
            return None, None
        best = cands[0][0]
        d['org_prio'] = best
        vals = Counter(v for o in obs for p, v in o['orgs'] if p == best)
        org = sorted(vals.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        others = sorted({v for _, v in cands} - {org})
        return org, ('발행기관 다른 기록: ' + ', '.join(others)) if others else None

    # ---------- 발행기관 판정(publisher_rules.json) ----------
    def html_text(self, rel):
        with open(self.abs(rel), 'rb') as f:
            b = f.read()
        for enc in ('utf-8', 'cp949'):
            try:
                return b.decode(enc)
            except UnicodeDecodeError:
                pass
        return b.decode('utf-8', 'replace')

    def html_cells(self, rel):
        t = re.sub(r'(?is)<(script|style)\b.*?</\1>', ' ', self.html_text(rel))
        return [c for c in (re.sub(r'\s+', ' ', html.unescape(x)).strip() for x in re.split(r'<[^>]+>', t)) if c]

    @staticmethod
    def label_value(cells, label):
        """칸 이름(label)과 정확히 같은 칸 다음의 첫 칸 값. 정해진 칸만 읽는다(작성자·문의처는 읽지 않는다)."""
        for i, c in enumerate(cells[:-1]):
            if c == label:
                return cells[i + 1]
        return None

    @staticmethod
    def org_dept(org, value):
        """'서울특별시 공공주택과, 도봉구 주택과' 같은 값에서 org 로 시작하는 항목의 부서 이름(괄호·전화 뺌)."""
        for item in re.split(r'\s*(?:,|및|/)\s*', re.sub(r'\([^)]*\)', '', value or '')):
            item = item.strip(' :')
            if item.startswith(org + ' '):
                m = re.match(r'([가-힣]+(?:과|팀|단|처|실|국|부))(?![가-힣])', item[len(org):].strip())
                if m:
                    return m.group(1)
        return None

    def doc_urls(self, d):
        return [u for u in [d['canonical_url']] + d['url_aliases'] + d['raw_urls'] if u and u.startswith('http')]

    def html_rule(self, d):
        """상세 HTML 의 정해진 칸 → (org, dept, method, note, dataset). 맞는 규칙이 없으면 None."""
        rep = self.pick_path(d['paths'])
        if not rep or format_of(rep) != 'HTML':
            return None
        for u in self.doc_urls(d):
            c = ids.canonical_url(u, self.rules)[0]
            host = ids.host_of(c)
            path = urlsplit(c.split(' (POST')[0]).path
            for rule in self.pub_rules.get('html_fields', []):
                if rule['host'] != host or not re.search(rule['path_regex'], path):
                    continue
                cells = self.html_cells(rep)
                org = dept = note = None
                if rule.get('org_label'):
                    org = self.label_value(cells, rule['org_label'])
                    if org and rule.get('org_regex'):
                        m = re.search(rule['org_regex'], org)
                        org = m.group(1).strip() if m else None
                    if not org and rule.get('org_fallback_label'):
                        org = self.label_value(cells, rule['org_fallback_label'])
                if rule.get('dept_label'):
                    dept = self.label_value(cells, rule['dept_label'])
                if not dept and org and rule.get('dept_place_label'):
                    dept = self.org_dept(org, self.label_value(cells, rule['dept_place_label']))
                if not dept and org and rule.get('dept_body_regex'):
                    end = rule.get('dept_body_end_label')
                    body = cells[:len(cells) - 1 - cells[::-1].index(end)] if end in cells else cells
                    hits = sorted(set(re.findall(rule['dept_body_regex'].replace('{org}', re.escape(org)), ' '.join(body))))
                    dept = hits[0] if len(hits) == 1 else None
                if rule.get('note_label'):
                    v = self.label_value(cells, rule['note_label'])
                    note = '%s: %s' % (rule['note_label'], v) if v and v != org else None
                ds = None
                if rule.get('dataset_regex'):
                    m = re.search(rule['dataset_regex'], path)
                    ds = m.group(1) if m else None
                if org or dept:
                    return org, dept, rule['method'], note, ds
        return None

    def portal_meta(self):
        """공공데이터포털 상세 HTML(받은 것) → {데이터셋 번호: (제공기관, 관리부서)}."""
        out = {}
        for did, d in sorted(self.docs.items()):
            r = self.html_rule(d)
            if r and r[4]:
                out[r[4]] = (r[0], r[1])
        return out

    def dataset_numbers(self, d, row):
        texts = [row['title']] + d['paths'] + self.doc_urls(d) + [t for o in d['obs'] for t in o['titles'] + o['kinds']]
        nums = set()
        for rx in self.pub_rules.get('portal_dataset_regex', []):
            for t in texts:
                nums.update(re.findall(rx, t or ''))
        urls = list(self.doc_urls(d))
        for p in d['paths']:   # manifest 에 항목이 없는 응답 파일: 가장 가까운 manifest 의 머리 주소
            q = os.path.dirname(p)
            while q.startswith(self.research) and q not in self.manifest_heads:
                q = os.path.dirname(q)
            urls += self.manifest_heads.get(q, []) or self.raw_manifest_heads(os.path.dirname(p))
        for u in urls:
            for prefix, num in self.pub_rules.get('portal_api_paths', {}).items():
                if prefix in u:
                    nums.add(num)
        return sorted(nums)

    def raw_manifest_heads(self, rel_dir):
        """저장소 raw 폴더의 manifest.json endpoint(연구 폴더 밖, 읽기만)."""
        p = self.abs(rel_dir + '/manifest.json')
        if rel_dir.startswith(self.research) or not os.path.exists(p):
            return []
        with open(p, encoding='utf-8') as f:
            m = json.load(f)
        return [u for u in as_list(m.get('endpoint')) if isinstance(u, str) and u.startswith('http')]

    def gosi_evidence(self):
        """evidence_gosi*.jsonl 의 notes '고시 기관 X' → {doc_id: X}(고시 조회 작업이 뽑은 값 재사용)."""
        rx = re.compile(self.pub_rules.get('gosi_evidence_regex', r'$^'))
        out = {}
        for path in sorted(glob.glob(self.abs(self.research + '/dataset/_work/*/evidence_gosi*.jsonl'))):
            for r in read_jsonl(path):
                m = rx.search(r.get('notes') or '')
                if m and (r.get('doc_path') or r.get('doc_url')):
                    did = self.lookup(path=r.get('doc_path'), url=r.get('doc_url'))[0]
                    if did:
                        out.setdefault(did, m.group(1).strip())
        return out

    def publisher_checks(self):
        path = self.abs(self.research + '/dataset/_work/원천주체_확인.csv')
        out = {}
        if os.path.exists(path):
            for c in sorted(read_csv(path), key=lambda x: (x.get('doc_id') or '', x.get('확인일') or '')):
                if (c.get('doc_id') or '').strip():
                    out[c['doc_id'].strip()] = c
        return out

    def decide_publishers(self, rows):
        """발행기관·부서와 판정 방법을 정한다(publisher_rules.json 순서). 부모 게시물이 먼저 정해지도록 깊이 순으로 돈다."""
        by = {r['doc_id']: r for r in rows}

        def depth(did, n=0):
            p = by[did]['parent_doc_id']
            return n if not p or p not in by or n > 5 else depth(p, n + 1)
        meta, gosi, checks = self.portal_meta(), self.gosi_evidence(), self.publisher_checks()
        for r in sorted(rows, key=lambda x: (depth(x['doc_id']), x['doc_id'])):
            did = r['doc_id']
            d = self.docs[did]
            method, notes = d.get('pub_method'), []
            org, dept = r['publisher_org'], r['publisher_dept']
            c = checks.get(did)
            if c and (c.get('방법') or '').strip() not in ('원문 표기 없음', '도메인 추정'):
                org = (c.get('publisher_org') or '').strip() or org
                dept = (c.get('publisher_dept') or '').strip() or dept
                method = '원천주체 확인: ' + ((c.get('방법') or '').strip() or '방법 없음')
            elif c:
                notes.append('원천주체 확인: ' + (c.get('방법') or '').strip())
            hr = self.html_rule(d)
            if hr:
                if not method and hr[0]:
                    org, method = hr[0], hr[2]
                if not dept and hr[1]:
                    dept = hr[1]
                    notes.append('부서: ' + hr[2])
                if hr[3]:
                    notes.append(hr[3])
            if not method and did in gosi:
                org, method = gosi[did], '고시 기관 표기'
            if not method:
                m = GOSI_FILE.search(os.path.basename(r['local_path'] or ''))
                if m:
                    org, method = m.group(1) or m.group(2), '고시 기관 표기(파일명)'
            if not method:
                nums = self.dataset_numbers(d, r)
                got = [meta[n] for n in nums if n in meta]
                orgs = {g[0] for g in got if g[0]}
                if len(orgs) == 1:
                    org, method = orgs.pop(), '공공데이터포털 메타'
                    depts = {g[1] for g in got if g[1]}
                    if not dept and len(depts) == 1 and len(got) == len(nums):
                        dept = depts.pop()
                    notes.append('데이터셋 ' + '·'.join(nums))
            p = by.get(r['parent_doc_id'])
            if p and self.pub_method.get(p['doc_id']) not in (None, '도메인 추정'):
                if not method:
                    org, method = p['publisher_org'], '부모 게시물'
                if not dept and org == p['publisher_org']:
                    dept = p['publisher_dept']
            if not method:
                for u in self.doc_urls(d) + [x for o in d['obs'] for x in o.get('request_urls') or []]:
                    e = ids.domain_entry(ids.host_of(ids.canonical_url(u, self.rules)[0]), self.domains)
                    if e and e.get('own_site'):
                        org, method = e['org'], '공식 누리집 게시'
                        break
            if not method and r['collection_method'] in self.pub_rules.get('api_provider_methods', []):
                org, method = self.domains['domains'].get('api.exa.ai', {}).get('org', 'Exa'), 'API 응답 제공자'
            if not method:
                for u in self.doc_urls(d):
                    c = ids.canonical_url(u, self.rules)[0]
                    host, path = ids.host_of(c), urlsplit(c.split(' (POST')[0]).path
                    rule = next((x for x in self.pub_rules.get('listing_pages', []) if x['host'] == host and re.search(x['path_regex'], path)), None)
                    e = ids.domain_entry(host, self.domains)
                    if rule and e:
                        org, method = e['org'], rule['method']
                        break
            if not method or not org:
                org, method = self.domain_guess(d, r), '도메인 추정'
            r['publisher_org'], r['publisher_dept'] = org, dept
            self.pub_method[did] = method
            head = '도메인 추정' if method == '도메인 추정' else '발행기관 근거: ' + method
            r['notes'] = ' · '.join(dict.fromkeys([head] + notes + ([r['notes']] if r['notes'] else []))) or None

    def domain_guess(self, d, r):
        urls = self.doc_urls(d)
        hosts = [ids.host_of(ids.canonical_url(u, self.rules)[0]) for u in urls] or [h for o in d['obs'] for h in o['hosts']]
        for h in hosts:
            e = ids.domain_entry(h, self.domains)
            if e:
                return e['org']
        if r['local_path'] and '/raw/home/' in r['local_path']:
            return 'HOME PoC 팀'
        return hosts[0] if hosts else '미상'

    def refine_attachment_types(self, rows):
        """상위 문서가 모집공고(RECRUIT_NOTICE)인 첨부: 공고문 본문은 RECRUIT_NOTICE, 나머지는 NOTICE_ATTACHMENT."""
        by = {r['doc_id']: r for r in rows}
        for r in rows:
            p = by.get(r['parent_doc_id'])
            if not p or p['doc_type'] != 'RECRUIT_NOTICE' or r['format'] in ('HTML', 'JSON'):
                continue
            kinds = [k for o in self.docs[r['doc_id']]['obs'] for k in o['kinds']]
            text = ' '.join([r['title']] + kinds)
            body = any(w in text for w in NOTICE_BODY) and not any(w in r['title'] for w in NOT_NOTICE_BODY)
            r['doc_type'] = 'RECRUIT_NOTICE' if body else 'NOTICE_ATTACHMENT'

    def doc_type(self, fmt, method, rep, texts):
        if fmt == 'JSON' and (method in ('EXA_SEARCH', 'EXA_CONTENTS') or any(t.startswith('응답 캐시') for t in texts if t)):
            return 'API_RESPONSE'
        if rep and fmt == 'JSON' and '/raw/' in rep:
            return 'API_RESPONSE'
        for words, t, doc_only in DOC_TYPE_RULES:
            if doc_only and fmt not in DOC_FORMATS:
                continue
            if any(w in (x or '') for x in texts for w in words):
                return t
        if any(PRESS_FILE.search(os.path.basename(x or '')) for x in texts[:1]):
            return 'PRESS_RELEASE'
        if fmt == 'HTML':
            return 'WEB_PAGE'
        if fmt in ('CSV', 'XLS', 'XLSX', 'ZIP', 'JSONL_GZ', 'JSON'):
            return 'DATA_FILE'
        return 'OTHER'

    _exa_urls = None

    def exa_has(self, canonical):
        if self._exa_urls is None:
            self._exa_urls = defaultdict(set)
            for did, d in self.docs.items():
                for p in d['paths']:
                    if self.is_exa_json(p):
                        for r in self.load_exa(p).get('results') or []:
                            if r.get('url') and r.get('text'):
                                self._exa_urls[ids.canonical_url(r['url'], self.rules)[0]].add(did)
        return sorted(self._exa_urls.get(canonical, ()))


def build(repo=REPO, research=RESEARCH, config_dir=ids.CONFIG):
    """Catalog 를 만들어 돌려준다(cat.rows = source_documents 행). 문서 조회는 cat.resolve(url=…·path=…)·cat.same_document(a, b)."""
    cat = Catalog(repo, research, config_dir)
    cat.build()
    return cat


def derived_rows(cat):
    """catalog_derived.csv 행: 경로, 종류, sha256, 바이트, 원천 문서(doc_id), 원천 경로."""
    out = []
    for rel in sorted(cat.derived):
        e = cat.derived[rel]
        srcs = sorted(e['from'])
        dids = sorted({cat.lookup(path=s)[0] or '' for s in srcs} - {''})
        out.append([rel, e['kind'], sha256_file(cat.abs(rel)), os.path.getsize(cat.abs(rel)), ';'.join(dids), ';'.join(srcs)])
    return out


DERIVED_COLS = ['경로', '종류', 'sha256', '바이트', '원천_doc_id', '원천_경로']
