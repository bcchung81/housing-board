#!/usr/bin/env python3
"""P0 발견 · P1 원문 확보.

P0  python3 tools/research/chain/discover.py --since YYYY-MM-DD [--until YYYY-MM-DD] [--refresh]
    Exa 검색(기간 = since~until, config/discovery.json 의 질의를 window_months 창마다)으로 주택공급
    정책 보도자료를 찾고, 전재처(정책브리핑 등) 결과는 전재 문구·제목으로 원 게시처(정부 누리집
    게시판) 게시물을 찾아 정규화한다. policies.json 에 있는 것은 '확인됨', 새 것은
    policies_discovered.json 에 후보(status candidate)로 쌓는다. policies.json 은 고치지 않는다.
P1  python3 tools/research/chain/discover.py --fetch POLICY_ID --out 새_빈_폴더
    원 게시물 HTML 과 첨부를 HTTP 로 받아 sha256·manifest 를 쓴다. 정책 docs_dir 에 이미
    manifest.json 이 있으면 docs_dir 에는 쓰지 않고 --out 에 받아 기존 파일과 sha256 만 비교한다.
P2 후보(선택)  python3 tools/research/chain/discover.py --structure POLICY_ID
    Exa search + outputSchema 로 목표·프로그램·지명 후보를 받아 캐시한다(policy.py 가 게이트로 거른다).

네트워크 응답(Exa·게시판 목록)은 cache_dir 에 JSON 으로 남기고, 같은 요청이면 캐시를 읽는다
(--refresh 일 때만 다시 부른다). 그래서 같은 인자로 다시 돌리면 네트워크 없이 같은 출력이 나온다.
코드에는 정책 id·날짜·URL·사업명을 쓰지 않는다. 키는 tools/research/exa.js 가 읽고 여기서는 다루지 않는다.
"""
import argparse
import datetime as dt
import hashlib
import html
import http.cookiejar
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CONFIG = os.path.join(os.path.dirname(__file__), 'config', 'discovery.json')
EXA_JS = os.path.join(ROOT, 'tools', 'research', 'exa.js')


def rel(path):
    return os.path.relpath(path, ROOT)


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def dump_json(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + '\n'


def write_json(path, obj):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(dump_json(obj))


def load_config(path=CONFIG):
    cfg = load_json(path)
    cfg['_cache_dir'] = os.path.join(ROOT, cfg['cache_dir'])
    return cfg


# ---------------------------------------------------------------- 캐시·Exa

class Calls:
    """이번 실행에서 실제로 부른 네트워크 호출 수와 Exa 비용."""

    def __init__(self):
        self.exa = 0
        self.exa_cost = 0.0
        self.http = 0
        self.cached = 0


def cache_key(kind, request):
    blob = json.dumps({'kind': kind, 'request': request}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()[:16]


def cache_path(cache_dir, kind, request):
    return os.path.join(cache_dir, f'{kind}-{cache_key(kind, request)}.json')


def cached(cache_dir, kind, request, fetch, refresh, calls):
    """같은 (kind, request) 면 캐시 파일을 읽고, 없거나 refresh 면 fetch() 결과를 저장한다."""
    path = cache_path(cache_dir, kind, request)
    if os.path.exists(path) and not refresh:
        calls.cached += 1
        return load_json(path)['response']
    response = fetch()
    write_json(path, {'kind': kind, 'request': request, 'response': response})
    return response


def exa_search_request(query, start=None, end=None, schema=None):
    """exa.js searchBody 와 같은 모양(캐시 키·기록용)."""
    body = {'query': query, 'type': 'auto', 'contents': {'highlights': True}}
    if start:
        body['startPublishedDate'] = start
    if end:
        body['endPublishedDate'] = end
    if schema:
        body['outputSchema'] = schema
    return {'endpoint': 'search', 'body': body}


def exa_contents_request(urls):
    return {'endpoint': 'contents', 'body': {'urls': list(urls), 'text': True}}


def run_exa(request, calls):
    body = request['body']
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'res.json')
        if request['endpoint'] == 'search':
            args = ['node', EXA_JS, 'search', body['query'], '--save', out]
            if body.get('startPublishedDate'):
                args += ['--start-date', body['startPublishedDate']]
            if body.get('endPublishedDate'):
                args += ['--end-date', body['endPublishedDate']]
            if body.get('outputSchema'):
                sp = os.path.join(tmp, 'schema.json')
                with open(sp, 'w', encoding='utf-8') as f:
                    json.dump(body['outputSchema'], f, ensure_ascii=False)
                args += ['--schema', sp]
        else:
            args = ['node', EXA_JS, 'contents', *body['urls'], '--save', out]
        proc = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=300)
        if not os.path.exists(out):
            raise RuntimeError(f'Exa 호출 실패: {proc.stderr.strip()[:300]}')
        res = load_json(out)
    calls.exa += 1
    calls.exa_cost += float((res.get('costDollars') or {}).get('total') or 0)
    return res


def exa(cfg, request, refresh, calls):
    kind = 'exa-' + request['endpoint']
    return cached(cfg['_cache_dir'], kind, request, lambda: run_exa(request, calls), refresh, calls)


# ---------------------------------------------------------------- HTTP

def http_opener(cfg):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [('User-Agent', cfg['http']['user_agent'])]
    return opener


def http_get(opener, cfg, url, calls):
    calls.http += 1
    with opener.open(url, timeout=cfg['http']['timeout_seconds']) as res:
        return res.read(), dict(res.headers)


def html_text(raw):
    s = raw.decode('utf-8', errors='replace') if isinstance(raw, bytes) else raw
    s = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


# ---------------------------------------------------------------- URL·제목 규칙

def domain_rule(cfg, url):
    host = (urllib.parse.urlsplit(url).hostname or '').lower()
    for d in cfg['domains']:
        suf = d['host_suffix']
        if host == suf or host.endswith('.' + suf):
            return d
    return None


def classify(cfg, url):
    """URL → {kind, org, rule}. kind: original_board · press_repost · briefing · clarification · news · repost · original · other."""
    d = domain_rule(cfg, url)
    if d is None:
        return {'kind': 'other', 'org': None, 'rule': None}
    board = d.get('board')
    if board and re.search(board['detail_url_regex'], url):
        return {'kind': 'original_board', 'org': d['org'], 'rule': d}
    path = urllib.parse.urlsplit(url).path
    for p, kind in (d.get('paths') or {}).items():
        if path == p:
            return {'kind': kind, 'org': d['org'], 'rule': d}
    return {'kind': d['role'], 'org': d['org'], 'rule': d}


def board_id(rule, url):
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    v = q.get(rule['board']['id_param'])
    return v[0] if v else None


def canonical_url(cfg, url):
    """원 게시처 게시판 상세 주소는 id 만 남긴 정규형으로, 나머지는 그대로."""
    c = classify(cfg, url)
    if c['kind'] == 'original_board':
        i = board_id(c['rule'], url)
        if i:
            return c['rule']['board']['canonical_detail'].format(id=i)
    return url


def clean_title(cfg, title):
    t = re.sub(cfg['title_suffix_regex'], '', title or '').strip()
    return re.sub(r'\s+', ' ', t)


def title_key(title):
    t = (title or '').replace('＋', '+').replace('ａ', 'α').replace('+a', '+α')
    return re.sub(r'[^0-9A-Za-z가-힣+α]', '', t)


def bigrams(s):
    return {s[i:i + 2] for i in range(len(s) - 1)} if len(s) > 1 else {s}


def similarity(a, b):
    a, b = bigrams(title_key(a)), bigrams(title_key(b))
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def is_policy_title(cfg, title):
    f = cfg['policy_filter']
    return bool(re.search(f['title_include_regex'], title)) and not re.search(f['title_exclude_regex'], title)


def kst_date(published, offset_hours):
    if not published:
        return None
    t = dt.datetime.fromisoformat(published.replace('Z', '+00:00'))
    return (t + dt.timedelta(hours=offset_hours)).date().isoformat()


def month_windows(since, until, months):
    """[since, until] 을 months 개월 창으로 나눈다(끝 창은 until 에서 자른다)."""
    out = []
    start = dt.date.fromisoformat(since)
    last = dt.date.fromisoformat(until)
    while start <= last:
        y, m = start.year, start.month + months
        y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
        nxt = dt.date(y, m, 1) if start.day == 1 else dt.date(y, m, min(start.day, 28))
        end = min(nxt - dt.timedelta(days=1), last)
        out.append((start.isoformat(), end.isoformat()))
        start = end + dt.timedelta(days=1)
    return out


def title_keyword(title):
    """게시판 제목 검색어: 가장 긴 한글 낱말(같으면 앞의 것)."""
    words = re.findall(r'[가-힣]{2,}', title or '')
    return max(words, key=len) if words else ''


# ---------------------------------------------------------------- 게시판

def board_search(cfg, rule, keyword, date_from, date_to, refresh, calls, opener, page=1):
    """게시판 목록을 등록일·제목어로 검색해 [{id, url, title, posted}] 를 돌려준다(캐시). page 는 2쪽부터만 넣는다."""
    board = rule['board']
    params = {k: v.format(date_from=date_from, date_to=date_to, keyword=keyword) for k, v in board['list_params'].items()}
    if page > 1:
        params[board['page_param']] = str(page)
    request = {'url': board['list_url'], 'params': params}

    def fetch():
        raw, _ = http_get(opener, cfg, board['list_url'] + '?' + urllib.parse.urlencode(params), calls)
        page = raw.decode('utf-8', errors='replace')
        rows = []
        for m in re.finditer(r'(?is)<tr[^>]*>(.*?)</tr>', page):
            ids = re.findall(r'dtl\.jsp\?[^"\']*?' + re.escape(board['id_param']) + r'=(\d+)', m.group(1))
            if not ids:
                continue
            text = html_text(m.group(1))
            date = re.search(r'\d{4}-\d{2}-\d{2}', text)
            link = re.search(r'(?is)<a[^>]*dtl\.jsp[^>]*>(.*?)</a>', m.group(1))
            rows.append({
                'id': ids[0],
                'url': board['canonical_detail'].format(id=ids[0]),
                'title': html_text(link.group(1)) if link else text,
                'posted': date.group(0) if date else None,
            })
        return {'rows': rows}

    return cached(cfg['_cache_dir'], 'board', request, fetch, refresh, calls)['rows']


def parse_board_text(rule, text):
    """게시판 상세(HTML 을 글자로 바꾼 것 또는 Exa 본문)에서 담당부서·등록일을 읽는다."""
    b = rule['board']
    dept = re.search(re.escape(b['dept_label']) + r'\s*([가-힣A-Za-z0-9·]+)', text)
    posted = re.search(re.escape(b['posted_label']) + r'\s*(\d{4}[-.]\d{2}[-.]\d{2}(?: \d{2}:\d{2})?)', text)
    return {'dept': dept.group(1) if dept else None,
            'posted': posted.group(1).replace('.', '-') if posted else None}


def board_detail_http(cfg, url, refresh, calls, opener):
    """원 게시물 상세를 HTTP 로 받아 제목·담당부서·등록일만 남긴다(캐시)."""
    rule = classify(cfg, url)['rule']

    def fetch():
        raw, _ = http_get(opener, cfg, url, calls)
        page = raw.decode('utf-8', errors='replace')
        tm = re.search(rule['board']['title_regex'], page)
        return dict(parse_board_text(rule, html_text(page)), title=html.unescape(tm.group(1)).strip() if tm else None)

    return cached(cfg['_cache_dir'], 'board-detail', {'url': url}, fetch, refresh, calls)


def board_details(cfg, urls, refresh, calls, opener=None):
    """원 게시물 상세의 담당부서·등록일·제목. Exa contents(한 번에)와 HTTP 를 둘 다 읽어 맞춰 본다."""
    if not urls:
        return {}
    opener = opener or http_opener(cfg)
    exa_urls = []
    for u in urls:
        c = classify(cfg, u)
        exa_urls.append(c['rule']['board']['exa_detail'].format(id=board_id(c['rule'], u)))
    res = exa(cfg, exa_contents_request(sorted(exa_urls)), refresh, calls)
    by_url = {r['url']: r for r in res.get('results', [])}
    status = {s['id']: s for s in res.get('statuses', [])}
    out = {}
    for u, eu in zip(urls, exa_urls):
        c = classify(cfg, u)
        st = status.get(eu, {})
        info = {'exa_url': eu, 'exa_status': st.get('status'),
                'exa_error': (st.get('error') or {}).get('tag'), 'exa_dept': None, 'exa_posted': None}
        r = by_url.get(eu)
        if r:
            b = parse_board_text(c['rule'], r.get('text') or '')
            info['exa_dept'], info['exa_posted'] = b['dept'], b['posted']
        h = board_detail_http(cfg, u, refresh, calls, opener)
        info.update(http_dept=h['dept'], http_posted=h['posted'], title=h['title'],
                    dept=h['dept'] or info['exa_dept'], posted=h['posted'] or info['exa_posted'])
        out[u] = info
    return out


def attachment_titles(cfg, url, text):
    """전재처 본문의 첨부파일 이름에서 원 보도자료 제목 후보를 만든다(날짜 앞머리·괄호·확장자 제거)."""
    rule = domain_rule(cfg, url)
    if not rule or not rule.get('attachment_regex'):
        return []
    out = []
    for name in re.findall(rule['attachment_regex'], text or ''):
        t = re.sub(r'\.(hwpx|hwp|pdf)$', '', name.replace('_', ' '), flags=re.I)
        t = re.sub(r'\([^)]*\)', ' ', t)
        t = re.sub(r'^\s*\d{6}\s*', '', t)
        t = re.sub(r'\s+', ' ', t).strip()
        if len(title_key(t)) >= cfg['min_title_chars'] and t not in out:
            out.append(t)
    return out


# ---------------------------------------------------------------- P0

def find_originals(cfg, group, titles, publishers, refresh, calls, opener):
    """전재처 묶음의 원 게시처 게시물을 발행기관 게시판에서 제목(묶음 제목·첨부 이름)·등록일로 찾는다."""
    found = []
    if not group['date']:
        return found
    boards = [d for d in cfg['domains'] if d.get('board', {}).get('list_url')]
    # 전재 문구로 발행기관을 알면 그 기관 게시판만, 모르면 규칙이 있는 게시판을 모두 찾아본다.
    rules = [d for d in boards if d['org'] in publishers] if publishers else boards
    day = dt.date.fromisoformat(group['date'])
    d0, d1 = (day - dt.timedelta(days=1)).isoformat(), (day + dt.timedelta(days=1)).isoformat()
    for rule in rules:
        for title in titles:
            rows = board_search(cfg, rule, title_keyword(title), d0, d1, refresh, calls, opener)
            best = max(rows, key=lambda r: similarity(r['title'], title), default=None)
            if best and similarity(best['title'], title) >= cfg['title_match_threshold']:
                found.append({'url': best['url'], 'org': rule['org'], 'title': best['title'],
                              'posted': best['posted'], 'via': 'board_search'})
                break
    return found


def discover(cfg, since, until, refresh, calls):
    opener = http_opener(cfg)
    off = cfg['kst_offset_hours']
    hits = []
    for start, end in month_windows(since, until, cfg['search']['window_months']):
        for q in cfg['search']['queries']:
            res = exa(cfg, exa_search_request(q, start, end), refresh, calls)
            for r in res.get('results', []):
                hits.append({'url': r['url'], 'title': clean_title(cfg, r.get('title')),
                             'date': kst_date(r.get('publishedDate'), off), 'query': q, 'window': f'{start}~{end}'})

    # 정부 원 게시처·전재처의 보도자료만, 주택공급 정책 제목만 남긴다.
    keep = []
    for h in hits:
        c = classify(cfg, h['url'])
        if c['kind'] in ('original_board', 'press_repost', 'repost', 'briefing') and is_policy_title(cfg, h['title']):
            keep.append(dict(h, kind=c['kind'], org=c['org']))

    # 날짜 없는 전재본(KDI·국세청 등)은 제목으로 다시 찾아 정책브리핑 전재본·원 게시물의 날짜를 얻는다.
    undated = sorted({h['title'] for h in keep if not h['date']})
    for title in undated[:cfg['max_title_research']]:
        res = exa(cfg, exa_search_request(title), refresh, calls)
        for r in res.get('results', []):
            c = classify(cfg, r['url'])
            t = clean_title(cfg, r.get('title'))
            if c['kind'] in ('original_board', 'press_repost') and similarity(t, title) >= cfg['title_match_threshold']:
                keep.append({'url': r['url'], 'title': t, 'date': kst_date(r.get('publishedDate'), off),
                             'query': 'title:' + title, 'window': None, 'kind': c['kind'], 'org': c['org']})
    keep = [h for h in keep if h['date']]

    groups = {}
    for h in sorted(keep, key=lambda h: (h['date'] or '', h['url'])):
        key = (title_key(h['title']), h['date'])
        g = groups.setdefault(key, {'title': h['title'], 'date': h['date'], 'hits': []})
        g['hits'].append(h)

    # 전재본·브리핑 본문(전재 문구 = 원 발행기관, 첨부 이름 = 원 보도자료 제목)을 한 번에 받는다.
    text_urls = sorted({h['url'] for g in groups.values() for h in g['hits'] if h['kind'] in ('press_repost', 'briefing')})
    briefing_urls = {h['url'] for g in groups.values() for h in g['hits'] if h['kind'] == 'briefing'}
    publisher_of, attach_of = {}, {}
    if text_urls:
        res = exa(cfg, exa_contents_request(text_urls), refresh, calls)
        for r in res.get('results', []):
            rule = domain_rule(cfg, r['url'])
            m = re.search(rule['publisher_regex'], r.get('text') or '') if rule and rule.get('publisher_regex') else None
            publisher_of[r['url']] = m.group(1) if m else None
            attach_of[r['url']] = attachment_titles(cfg, r['url'], r.get('text'))

    records = []
    for (_, date), g in sorted(groups.items(), key=lambda kv: (kv[0][1] or '', kv[0][0])):
        originals = [{'url': canonical_url(cfg, h['url']), 'org': h['org'], 'title': h['title'], 'posted': h['date'],
                      'via': 'exa_search'} for h in g['hits'] if h['kind'] == 'original_board']
        publishers = sorted({publisher_of.get(h['url']) for h in g['hits'] if publisher_of.get(h['url'])})
        if not originals:
            titles = [g['title']] + [t for h in g['hits'] for t in attach_of.get(h['url'], []) if t != g['title']]
            originals = find_originals(cfg, g, titles, publishers, refresh, calls, opener)
        reposts = sorted({h['url'] for h in g['hits'] if h['kind'] != 'original_board'})
        records.append({
            'title': g['title'],
            'date': date,
            'publishers': publishers,
            'originals': sorted({o['url']: o for o in originals}.values(), key=lambda o: o['url']),
            'reposts': reposts,
            'queries': sorted({h['query'] for h in g['hits']}),
        })

    # 같은 원 게시물로 모이는 묶음(전재처마다 다른 제목·날짜)을 합친다.
    def absorb(m, r):
        m['publishers'] = sorted(set(m['publishers']) | set(r['publishers']))
        m['reposts'] = sorted(set(m['reposts']) | set(r['reposts']))
        m['queries'] = sorted(set(m['queries']) | set(r['queries']))

    def near(a, b):
        return abs((dt.date.fromisoformat(a) - dt.date.fromisoformat(b)).days) <= 1

    merged = {}
    for r in records:
        if r['originals']:
            key = r['originals'][0]['url']
            if key in merged:
                absorb(merged[key], r)
            else:
                merged[key] = r
    for r in records:
        if r['originals']:
            continue
        # 원 게시물을 못 찾은 전재본은 ±1일 안에 제목이 비슷한 원 게시물 묶음에 붙인다.
        twin = next((m for m in merged.values() if m['originals'] and near(m['date'], r['date'])
                     and similarity(m['title'], r['title']) >= cfg['title_match_threshold']), None)
        if twin:
            absorb(twin, r)
            continue
        # 브리핑(속기본)만 있는 묶음은 보도자료가 아니므로 후보로 세우지 않고 같은 날 묶음에 참고로 붙인다.
        if all(u in briefing_urls for u in r['reposts']):
            same_day = next((m for m in merged.values() if m['date'] == r['date']), None)
            if same_day:
                same_day.setdefault('related_briefings', [])
                same_day['related_briefings'] = sorted(set(same_day['related_briefings']) | set(r['reposts']))
            continue
        key = 'repost:' + r['reposts'][0]
        if key in merged:
            absorb(merged[key], r)
        else:
            merged[key] = r

    details = board_details(cfg, sorted(k for k in merged if not k.startswith('repost:')), refresh, calls, opener)
    return list(merged.values()), details, len(hits)


def candidate_row(cfg, rec, details):
    o = rec['originals'][0] if rec['originals'] else None
    d = details.get(o['url'], {}) if o else {}
    return {
        'status': 'candidate',
        'title': (d.get('title') or (o or {}).get('title') or rec['title']),
        'posted': d.get('posted') or (o or {}).get('posted') or rec['date'],
        'canonical_url': o['url'] if o else None,
        'publisher_org': o['org'] if o else (rec['publishers'][0] if rec['publishers'] else None),
        'publisher_dept': d.get('dept'),
        'repost_urls': rec['reposts'],
        'repost_publishers': rec['publishers'],
        'related_briefings': rec.get('related_briefings', []),
        'found_by_queries': rec['queries'],
        'note': None if o else '원 게시처 게시물을 찾지 못함(발행기관 게시판 규칙 없음 또는 목록 검색 실패) — 전재본만 있음',
    }


def run_discover(cfg, since, until, refresh):
    calls = Calls()
    records, details, n_hits = discover(cfg, since, until, refresh, calls)
    policies = load_json(os.path.join(ROOT, cfg['policies_file']))['policies']
    known = {canonical_url(cfg, p['canonical_url']): p for p in policies}

    confirmed, candidates = [], []
    for rec in records:
        row = candidate_row(cfg, rec, details)
        p = known.get(row['canonical_url'])
        if p:
            confirmed.append(dict(row, status='confirmed', policy_id=p['policy_id']))
        else:
            candidates.append(row)

    disc_path = os.path.join(ROOT, cfg['discovered_file'])
    old = load_json(disc_path) if os.path.exists(disc_path) else {'candidates': []}
    by_key = {(c.get('canonical_url') or c['repost_urls'][0]): c for c in old.get('candidates', [])}
    for c in candidates:
        key = c['canonical_url'] or c['repost_urls'][0]
        if key in by_key:
            prev = by_key[key]
            c = dict(prev, **c)  # 후속 발표 표시(parent_policy_id 등)는 다른 단계가 단 것이라 남긴다
            c.update(found_by_queries=sorted(set(prev.get('found_by_queries', [])) | set(c['found_by_queries'])),
                     status=prev.get('status', 'candidate'))
        by_key[key] = c
    out = {
        'description': 'P0 발견 후보(사람 확인 전). 원 게시물·발행기관을 확인한 뒤 policies.json 으로 옮긴다(자동으로 옮기지 않는다).',
        'runs': sorted({*(tuple(r) for r in old.get('runs', [])), (since, until)}),
        'candidates': sorted(by_key.values(), key=lambda c: (c['posted'] or '', c['canonical_url'] or c['repost_urls'][0])),
    }
    out['runs'] = [list(r) for r in out['runs']]
    write_json(disc_path, out)

    recall = []
    for p in policies:
        in_window = since <= p['announced'] <= until
        hit = next((c for c in confirmed if c['policy_id'] == p['policy_id']), None)
        recall.append({'policy_id': p['policy_id'], 'announced': p['announced'], 'in_window': in_window,
                       'found': bool(hit), 'canonical_url': p['canonical_url'],
                       'found_dept': hit['publisher_dept'] if hit else None,
                       'found_posted': hit['posted'] if hit else None})
    summary = {'since': since, 'until': until, 'exa_results': n_hits, 'policy_records': len(records),
               'recall': recall, 'confirmed': confirmed, 'new_candidates': candidates}
    write_json(os.path.join(cfg['_cache_dir'], f'run-{since}_{until}.json'), summary)

    in_win = [r for r in recall if r['in_window']]
    print(f'Exa 결과 {n_hits}건 → 정책 보도자료 묶음 {len(records)}개')
    print(f'재현율 {sum(r["found"] for r in in_win)}/{len(in_win)} (창 안의 확인된 정책)')
    for r in recall:
        print(f"  {'찾음' if r['found'] else '못 찾음'} {r['policy_id']} {r['announced']} 부서={r['found_dept']} 등록={r['found_posted']}")
    print(f'새 후보 {len(candidates)}개 → {rel(disc_path)}')
    for c in candidates:
        print(f"  {c['posted']} {c['publisher_org']}/{c['publisher_dept']} {c['title']} | {c['canonical_url'] or c['repost_urls'][0]}")
    print(f'호출: Exa {calls.exa}회 ${calls.exa_cost:.3f}, HTTP {calls.http}회, 캐시 {calls.cached}회')
    return summary


# ---------------------------------------------------------------- 후속 발표(M4 01)

def board_attachments(cfg, url, refresh, calls, opener):
    """원 게시물 첨부 목록(이름·주소)만 읽는다(캐시). 파일은 받지 않는다."""
    rule = classify(cfg, url)['rule']

    def fetch():
        raw, _ = http_get(opener, cfg, url, calls)
        page = raw.decode('utf-8', errors='replace')
        out = []
        for h in re.findall(rule['board']['attachment_href_regex'], page):
            full = urllib.parse.quote(urllib.parse.urljoin(url, html.unescape(h)), safe=":/?&=%()[],;!*'@$~+")
            if all(a['url'] != full for a in out):
                out.append({'name': attachment_name(rule, full, {}), 'url': full})
        return {'attachments': out}

    return cached(cfg['_cache_dir'], 'board-attach', {'url': url}, fetch, refresh, calls)['attachments']


def name_core(name):
    return re.sub(r'\s*\([^)]*\)\s*$', '', name or '')


def parents_of(title, policies):
    """제목이 부모 정책을 가리키면 [policy_id] (제목에 나온 순서). 표지: 발표일 'M.D' 또는 정책 이름."""
    found = []
    tk = title_key(title)
    for p in policies:
        m, d = int(p['announced'][5:7]), int(p['announced'][8:10])
        hit = re.search(rf'(?<![\d.]){m}\.{d}(?!\d)', title)
        pos = hit.start() if hit else (title.find(name_core(p['name'])) if title_key(name_core(p['name'])) in tk else -1)
        if pos >= 0:
            found.append((pos, p['policy_id']))
    return [pid for _, pid in sorted(found)]


def followup_slug(cfg, parents, posted, policies, taken):
    slugs = {p['policy_id']: p['slug'] for p in policies}
    base = '+'.join(slugs[x] for x in parents) + cfg['followup']['slug_infix'] + posted[2:10].replace('-', '')
    return base


def body_parents(cfg, url, policies, refresh, calls, opener):
    """제목에 '후속조치'가 없어도 본문(첨부 PDF)이 부모 정책을 '후속'으로 명시하면 그 정책들과 인용 구절(캐시).
    표지: 정책 이름 또는 발표일 'M.D'(대책·방안과 함께) 이고, 앞뒤 window 글자 안에 '후속'이 있어야 한다."""
    fu = cfg['followup']

    def fetch():
        import policy as P2  # 늦게 불러 순환을 피한다(PDF 텍스트 추출만 쓴다)
        rule = classify(cfg, url)['rule']
        raw, _ = http_get(opener, cfg, url, calls)
        page = raw.decode('utf-8', errors='replace')
        hrefs = [urllib.parse.quote(urllib.parse.urljoin(url, html.unescape(h)), safe=":/?&=%()[],;!*'@$~+")
                 for h in re.findall(rule['board']['attachment_href_regex'], page)]
        pdfs = [h for h in dict.fromkeys(hrefs) if attachment_name(rule, h, {}).lower().endswith('.pdf')]
        found = []
        with tempfile.TemporaryDirectory() as tmp:  # 내려받은 파일은 새 빈 폴더에서만 읽는다
            for h in pdfs[:fu['body_max_pdfs']]:
                body, _ = http_get(opener, cfg, h, calls)
                path = os.path.join(tmp, 'a.pdf')
                with open(path, 'wb') as f:
                    f.write(body)
                for pg in P2.pdf_pages(path):
                    text = ' '.join(pg['lines'])
                    for p in policies:
                        if any(x['policy_id'] == p['policy_id'] for x in found):
                            continue
                        m, d = int(p['announced'][5:7]), int(p['announced'][8:10])
                        pats = [r'\s*'.join(map(re.escape, name_core(p['name']).split())),
                                rf'(?<![\d.]){m}\.\s?{d}(?!\d)\s*\)?\s*(의|에서|대책|공급방안|방안)']
                        for pat in pats:
                            mm = re.search(pat, text)
                            if not mm:
                                continue
                            w = text[max(0, mm.start() - fu['body_window']):mm.end() + fu['body_window']]
                            if '후속' in w:
                                found.append({'policy_id': p['policy_id'], 'quote': squeeze_text(w),
                                              'file': attachment_name(rule, h, {}), 'page': pg['page']})
                                break
        return {'parents': found, 'pdfs': len(pdfs)}

    return cached(cfg['_cache_dir'], 'body-parents', {'url': url}, fetch, refresh, calls)


def redact(text):
    import policy as P2  # 공무원 개인 이름·전화번호 지우기는 policy.py 와 같은 규칙
    return P2.redact(text)


def squeeze_text(t):
    return re.sub(r'\s+', ' ', t).strip()


def run_followups(cfg, until, refresh, fetch=True):
    """부모 정책이 있는 후속 발표를 게시판 제목 검색으로 모으고, 원 게시물·첨부를 받는다(P1).
    정책별 해명·설명자료는 Exa 검색(발표 뒤 days_after 일)으로 찾는다."""
    calls = Calls()
    opener = http_opener(cfg)
    fu = cfg['followup']
    policies = load_json(os.path.join(ROOT, cfg['policies_file']))['policies']
    known = {canonical_url(cfg, p['canonical_url']) for p in policies}
    since = min(p['announced'] for p in policies)
    rows = {}
    # 제목 검색어: 설정의 '후속조치' 낱말 + 정책 표지(발표일 'M.D', 정책 이름) — 표지만 있고 '후속조치'가 없는 제목도 잡는다
    marks = [f"{int(p['announced'][5:7])}.{int(p['announced'][8:10])}" for p in policies] + [name_core(p['name']) for p in policies]
    for rule in (d for d in cfg['domains'] if d.get('board', {}).get('list_url')):
        for kw in fu['keywords'] + marks:
            seen_kw = set()
            for page in range(1, fu['max_pages'] + 1):
                got = board_search(cfg, rule, kw, since, until, refresh, calls, opener, page)
                if not got or {r['url'] for r in got} <= seen_kw:
                    break
                seen_kw |= {r['url'] for r in got}
                for r in got:
                    rows.setdefault(r['url'], dict(r, org=rule['org'], keyword=kw))
    items = []
    for url, r in sorted(rows.items(), key=lambda kv: (kv[1]['posted'] or '', kv[0])):
        if url in known or re.search(cfg['policy_filter']['title_exclude_regex'], r['title']):
            continue
        parents = parents_of(r['title'], policies)
        if parents:
            items.append(dict(r, parents=parents, parent_basis='제목: ' + r['title'], found_by='board_title'))

    # 제목에 '후속조치'가 없는 후속 발표: 게시판 주제어 검색 + Exa 검색 → 원 게시물 → 본문(첨부 PDF)의 부모 정책 표기
    cand = {}
    for rule in (d for d in cfg['domains'] if d.get('board', {}).get('list_url')):
        for kw in fu['body_keywords']:
            seen_kw = set()
            for page in range(1, fu['max_pages'] + 1):
                got = board_search(cfg, rule, kw, since, until, refresh, calls, opener, page)
                if not got or {r['url'] for r in got} <= seen_kw:
                    break
                seen_kw |= {r['url'] for r in got}
                for r in got:
                    cand.setdefault(r['url'], dict(r, org=rule['org'], keyword=kw, found_by='board:' + kw))
        for start, end in month_windows(since, until, fu['exa_window_months']):
            for q in fu['exa_queries']:
                res = exa(cfg, exa_search_request(q, start, end), refresh, calls)
                for x in res.get('results', []):
                    c = classify(cfg, x['url'])
                    t = clean_title(cfg, x.get('title'))
                    date = kst_date(x.get('publishedDate'), cfg['kst_offset_hours'])
                    if c['kind'] == 'original_board':
                        u = canonical_url(cfg, x['url'])
                        cand.setdefault(u, {'url': u, 'title': t, 'posted': date, 'org': c['org'], 'keyword': q,
                                            'found_by': 'exa:' + q})
                    elif c['kind'] in ('press_repost', 'briefing') and date:
                        for o in find_originals(cfg, {'title': t, 'date': date}, [t], [], refresh, calls, opener):
                            cand.setdefault(o['url'], {'url': o['url'], 'title': o['title'], 'posted': o['posted'],
                                                       'org': o['org'], 'keyword': q, 'found_by': 'exa:' + q})
    have = {it['url'] for it in items}
    for url, r in sorted(cand.items(), key=lambda kv: (kv[1]['posted'] or '', kv[0])):
        if url in have or url in known or re.search(cfg['policy_filter']['title_exclude_regex'], r['title'] or ''):
            continue
        tp = parents_of(r['title'] or '', policies)
        if tp:  # 제목에 부모 정책 표지가 있으면 제목이 근거
            items.append(dict(r, parents=tp, parent_basis='제목: ' + r['title']))
            continue
        if not re.search(fu['body_title_regex'], r['title'] or ''):
            continue
        bp = body_parents(cfg, url, policies, refresh, calls, opener)
        if bp['parents']:
            first = bp['parents'][0]
            items.append(dict(r, parents=[x['policy_id'] for x in bp['parents']],
                              parent_basis=f"본문({first['file']} PDF {first['page']}쪽): {first['quote']}"))
    items.sort(key=lambda it: (it['posted'] or '', it['url']))

    disc_old = load_json(os.path.join(ROOT, cfg['discovered_file'])) if os.path.exists(os.path.join(ROOT, cfg['discovered_file'])) else {'candidates': []}
    old_slug = {c.get('canonical_url'): c.get('slug') for c in disc_old['candidates'] if c.get('slug')}
    details = board_details(cfg, [i['url'] for i in items], refresh, calls, opener)
    slugs = {}
    for it in items:
        slug = old_slug.get(it['url']) or followup_slug(cfg, it['parents'], it['posted'], policies, slugs)
        if it['url'] not in old_slug and (slug in slugs.values() or slug in old_slug.values()):
            slug += '_' + board_id(classify(cfg, it['url'])['rule'], it['url'])
        slugs[it['url']] = slug
        it['slug'] = slug
        it['docs_dir'] = os.path.join(fu['docs_root'], slug)
        d = details.get(it['url'], {})
        it['dept'], it['posted_at'] = d.get('dept'), d.get('posted') or it['posted']
        ddir = os.path.join(ROOT, it['docs_dir'])
        if fetch and not os.path.exists(os.path.join(ddir, 'manifest.json')):
            fetch_original(cfg, {'policy_id': slug, 'canonical_url': it['url'], 'docs_dir': it['docs_dir']}, ddir, refresh)
    # 확인된 정책의 원 게시물 첨부 목록(받은 것과 대조용)
    attachments = {p['policy_id']: board_attachments(cfg, canonical_url(cfg, p['canonical_url']), refresh, calls, opener)
                   for p in policies if classify(cfg, p['canonical_url'])['kind'] == 'original_board'}
    # 해명·설명자료
    clar = {}
    for p in policies:
        end = (dt.date.fromisoformat(p['announced']) + dt.timedelta(days=fu['clarification_days_after'])).isoformat()
        q = fu['clarification_query'].format(name=name_core(p['name']))
        res = exa(cfg, exa_search_request(q, p['announced'], min(end, until)), refresh, calls)
        words = [w for w in re.findall(r'[가-힣]{2,}', name_core(p['name']))]
        hits = []
        for x in res.get('results', []):
            t = clean_title(cfg, x.get('title'))
            c = classify(cfg, x['url'])
            if (c['kind'] in ('clarification', 'press_repost', 'original_board') and re.search(fu['clarification_title_regex'], t)
                    and sum(w in t for w in words) >= max(1, len(words) - 1)):
                hits.append({'url': x['url'], 'title': t, 'kind': c['kind'], 'date': kst_date(x.get('publishedDate'), cfg['kst_offset_hours'])})
        clar[p['policy_id']] = sorted(hits, key=lambda h: h['url'])

    # policies_discovered.json 에 후속 발표 표시(policies.json 은 고치지 않는다)
    disc_path = os.path.join(ROOT, cfg['discovered_file'])
    out = load_json(disc_path) if os.path.exists(disc_path) else {'description': '', 'runs': [], 'candidates': []}
    by_key = {(c.get('canonical_url') or c['repost_urls'][0]): c for c in out['candidates']}
    for it in items:
        prev = by_key.get(it['url'], {})
        row = {
            'status': prev.get('status', 'candidate'),
            'title': prev.get('title') or it['title'],
            'posted': prev.get('posted') or it['posted_at'],
            'canonical_url': it['url'],
            'publisher_org': prev.get('publisher_org') or it['org'],
            'publisher_dept': prev.get('publisher_dept') or it['dept'],
            'repost_urls': prev.get('repost_urls', []),
            'repost_publishers': prev.get('repost_publishers', []),
            'related_briefings': prev.get('related_briefings', []),
            'found_by_queries': sorted(set(prev.get('found_by_queries', [])) | {it['found_by'] if it['found_by'] != 'board_title' else 'board:' + it['keyword']}),
            'note': prev.get('note'),
            'kind': 'FOLLOWUP',
            'parent_policy_id': it['parents'][0],
            'parent_policy_ids': it['parents'],
            'parent_basis': redact(it['parent_basis']),
            'slug': it['slug'],
            'docs_dir': it['docs_dir'],
        }
        by_key[it['url']] = row
    out['candidates'] = sorted(by_key.values(), key=lambda c: (c['posted'] or '', c['canonical_url'] or c['repost_urls'][0]))
    write_json(disc_path, out)
    summary = {'until': until, 'followups': [{k: (redact(it[k]) if k == 'parent_basis' else it[k])
                                              for k in ('url', 'title', 'posted_at', 'dept', 'parents', 'parent_basis',
                                                        'found_by', 'slug', 'docs_dir')}
                                             for it in items],
               'attachments': attachments, 'clarifications': clar}
    write_json(os.path.join(cfg['_cache_dir'], f'followups-{until}.json'), summary)
    print(f'후속 발표 {len(items)}건(부모 정책 있음) → {rel(disc_path)}')
    for it in items:
        print(f"  {it['posted_at']} {it['parents']} {it['slug']} {it['title'][:60]}")
    for pid, hs in clar.items():
        print(f'  해명·설명 {pid}: {len(hs)}건')
    print(f'호출: Exa {calls.exa}회 ${calls.exa_cost:.3f}, HTTP {calls.http}회, 캐시 {calls.cached}회')
    return summary


# ---------------------------------------------------------------- 이행 실적 발표(정례브리핑 등)

def copy_hashes(cfg, url, refresh, calls, opener):
    """같은 발표의 다른 게시물(부처 게시판·정책브리핑·전재) 첨부를 새 빈 임시 폴더에 받아 sha256 만 남긴다(캐시)."""
    rule = domain_rule(cfg, url)

    def fetch():
        regex = (rule.get('board') or {}).get('attachment_href_regex') or rule.get('copy_attachment_regex')
        raw, _ = http_get(opener, cfg, url, calls)
        page = raw.decode('utf-8', errors='replace')
        out = []
        for h in dict.fromkeys(re.findall(regex, page)):
            full = urllib.parse.quote(urllib.parse.urljoin(url, html.unescape(h)), safe=":/?&=%()[],;!*'@$~+")
            body, headers = http_get(opener, cfg, full, calls)
            out.append({'url': full, 'filename': attachment_name(rule, full, headers) if rule.get('board') else
                        attachment_name({'board': {'attachment_name_params': []}}, full, headers),
                        'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()})
        return {'files': out}

    return cached(cfg['_cache_dir'], 'copy-hashes', {'url': url}, fetch, refresh, calls)['files']


def related_policies(docs_dir, policies):
    """원 파일 PDF 텍스트에 정책 표기(policy.policy_markers)가 나오면 그 정책과 첫 인용(쪽)."""
    import policy as P2
    found = {}
    for name in sorted(os.listdir(docs_dir)):
        if not name.lower().endswith('.pdf'):
            continue
        for pg in P2.pdf_pages(os.path.join(docs_dir, name)):
            for line in pg['lines']:
                for pid in P2.policy_markers(line, policies):
                    found.setdefault(pid, {'policy_id': pid, 'file': name, 'page': pg['page'], 'quote': redact(line)})
    return [found[p['policy_id']] for p in policies if p['policy_id'] in found]


def run_progress(cfg, refresh):
    """이행 실적 발표: 원 게시물·첨부를 받고(P1), 같은 발표의 다른 게시물 첨부와 sha256 을 비교하고,
    관련 정책을 원문 표기로 정해 policies_discovered.json 에 kind PROGRESS_REPORT 로 단다."""
    calls = Calls()
    opener = http_opener(cfg)
    policies = load_json(os.path.join(ROOT, cfg['policies_file']))['policies']
    summary = []
    for it in cfg['progress_reports']['items']:
        docs_dir = os.path.join(cfg['followup']['docs_root'], it['slug'])
        ddir = os.path.join(ROOT, docs_dir)
        if not os.path.exists(os.path.join(ddir, 'manifest.json')):
            fetch_original(cfg, {'policy_id': it['slug'], 'canonical_url': it['url'], 'docs_dir': docs_dir}, ddir, refresh)
        manifest = load_json(os.path.join(ddir, 'manifest.json'))
        by_sha = {f['sha256']: f['filename'] for f in manifest['files'].values()}
        copies = []
        for u in it['copies']:
            for f in copy_hashes(cfg, u, refresh, calls, opener):
                copies.append(dict(f, page_url=u, same_as=by_sha.get(f['sha256'])))
        related = related_policies(ddir, policies)
        rec = {'url': canonical_url(cfg, it['url']), 'slug': it['slug'], 'docs_dir': docs_dir,
               'metric_docs_regex': it.get('metric_docs_regex'),
               'title': manifest.get('source'), 'posted': manifest['params'].get('posted'),
               'related': related, 'copies': copies}
        summary.append(rec)
        # policies_discovered.json: 같은 발표의 게시물(원 게시처·사본 주소) 항목에 표시, 없으면 새 항목
        disc_path = os.path.join(ROOT, cfg['discovered_file'])
        disc = load_json(disc_path)
        urls = {rec['url']} | {canonical_url(cfg, u) for u in it['copies']}
        hit = [c for c in disc['candidates'] if c.get('canonical_url') in urls or set(c.get('repost_urls', [])) & urls]
        if not hit:
            hit = [{'status': 'candidate', 'title': rec['title'], 'posted': rec['posted'], 'canonical_url': rec['url'],
                    'publisher_org': classify(cfg, rec['url'])['org'], 'publisher_dept': manifest['params'].get('dept'),
                    'repost_urls': [], 'repost_publishers': [], 'related_briefings': [], 'found_by_queries': [],
                    'note': None}]
            disc['candidates'].append(hit[0])
        for c in hit:
            c.update(kind='PROGRESS_REPORT', related_policy_ids=[r['policy_id'] for r in related],
                     original_url=rec['url'], slug=it['slug'], docs_dir=docs_dir)
        disc['candidates'] = sorted(disc['candidates'], key=lambda c: (c['posted'] or '', c['canonical_url'] or c['repost_urls'][0]))
        write_json(disc_path, disc)
        print(f"{it['slug']}: 관련 정책 {[r['policy_id'] for r in related]}")
        for f in manifest['files'].values():
            print(f"  원본 {f['filename']} {f['bytes']}B")
        for f in copies:
            print(f"  사본 {'같음' if f['same_as'] else '다름'} {f['filename']} ({f['page_url']})")
    write_json(os.path.join(cfg['_cache_dir'], 'progress_reports.json'), {'items': summary})
    print(f'호출: Exa {calls.exa}회 ${calls.exa_cost:.3f}, HTTP {calls.http}회, 캐시 {calls.cached}회')


# ---------------------------------------------------------------- 참고 원천(프로그램 조건 대조용)

def run_reference(cfg, refresh):
    """참고 발표 묶음(예: 도심복합 후보지 1~N차): 게시판 제목 검색 + Exa(빠진 차수) → 원 게시물 → 게시물마다 하위 폴더에 P1."""
    calls = Calls()
    opener = http_opener(cfg)
    for ref in cfg['reference_sets']:
        cand = {}
        for rule in (d for d in cfg['domains'] if d.get('board', {}).get('list_url')):
            for kw in ref['board_keywords']:
                seen_kw = set()
                for page in range(1, cfg['followup']['max_pages'] + 1):
                    got = board_search(cfg, rule, kw, ref['date_from'], ref['date_to'], refresh, calls, opener, page)
                    if not got or {r['url'] for r in got} <= seen_kw:
                        break
                    seen_kw |= {r['url'] for r in got}
                    for r in got:
                        cand.setdefault(r['url'], dict(r, found_by='board:' + kw))
        for q in ref.get('exa_queries', []):
            res = exa(cfg, exa_search_request(q, ref['date_from'], ref['date_to']), refresh, calls)
            for x in res.get('results', []):
                c = classify(cfg, x['url'])
                t = clean_title(cfg, x.get('title'))
                date = kst_date(x.get('publishedDate'), cfg['kst_offset_hours'])
                if c['kind'] == 'original_board':
                    u = canonical_url(cfg, x['url'])
                    cand.setdefault(u, {'url': u, 'title': t, 'posted': date, 'found_by': 'exa:' + q})
                elif c['kind'] in ('press_repost', 'briefing') and date:
                    for o in find_originals(cfg, {'title': t, 'date': date}, [t], [], refresh, calls, opener):
                        cand.setdefault(o['url'], {'url': o['url'], 'title': o['title'], 'posted': o['posted'],
                                                   'found_by': 'exa:' + q})
        items = sorted((r for r in cand.values() if re.search(ref['title_regex'], r['title'] or '')
                        and not re.search(ref['exclude_regex'], r['title'] or '')),
                       key=lambda r: (r['posted'] or '', r['url']))
        root = os.path.join(cfg['followup']['docs_root'], ref['slug'])
        index = []
        for it in items:
            sub = os.path.join(root, (it['posted'] or '')[2:10].replace('-', '') + '_' + board_id(classify(cfg, it['url'])['rule'], it['url']))
            if not os.path.exists(os.path.join(ROOT, sub, 'manifest.json')):
                fetch_original(cfg, {'policy_id': ref['slug'], 'canonical_url': it['url'], 'docs_dir': sub}, os.path.join(ROOT, sub), refresh)
            index.append({'url': it['url'], 'title': it['title'], 'posted': it['posted'], 'found_by': it['found_by'], 'docs_dir': sub})
        write_json(os.path.join(ROOT, root, 'manifest.json'), {'source': ref['note'], 'items': index})
        print(f"{ref['slug']}: 발표 {len(index)}건")
        for x in index:
            print(f"  {x['posted']} {x['title'][:70]} ({x['found_by']})")
    print(f'호출: Exa {calls.exa}회 ${calls.exa_cost:.3f}, HTTP {calls.http}회, 캐시 {calls.cached}회')


# ---------------------------------------------------------------- P1

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def attachment_name(rule, url, headers):
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    for p in rule['board']['attachment_name_params']:
        if q.get(p):
            return os.path.basename(q[p][0])
    cd = headers.get('Content-Disposition') or ''
    m = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)", cd)
    if not m:
        return hashlib.sha256(url.encode()).hexdigest()[:16]
    name = urllib.parse.unquote(m.group(1))
    try:  # 머리글의 UTF-8 파일명을 http.client 가 latin-1 로 읽은 경우
        name = name.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return os.path.basename(name)


def fetch_original(cfg, policy, out_dir, refresh=False):
    """원 게시물 HTML·첨부를 out_dir 에 받고 manifest 를 쓴다. 기존 원 파일이 있으면 비교만 한다."""
    calls = Calls()
    url = policy['canonical_url']
    c = classify(cfg, url)
    if c['kind'] != 'original_board':
        raise SystemExit(f'원 게시처 게시판 규칙이 없는 주소: {url}')
    rule = c['rule']
    docs_dir = os.path.join(ROOT, policy['docs_dir'])
    existing = os.path.join(docs_dir, 'manifest.json')
    compare = os.path.exists(existing)
    out_dir = os.path.abspath(out_dir)
    if compare and os.path.commonpath([out_dir, docs_dir]) == docs_dir:
        raise SystemExit('기존 원 파일이 있는 정책은 docs_dir 에 다시 쓰지 않는다 — --out 에 새 빈 폴더를 준다')
    if os.path.exists(out_dir) and os.listdir(out_dir):
        raise SystemExit(f'--out 은 새 빈 폴더여야 한다: {out_dir}')
    os.makedirs(out_dir, exist_ok=True)

    opener = http_opener(cfg)
    raw, _ = http_get(opener, cfg, url, calls)
    page = raw.decode('utf-8', errors='replace')
    with open(os.path.join(out_dir, 'page.html'), 'wb') as f:
        f.write(raw)
    text = html_text(page)
    board = parse_board_text(rule, text)
    tm = re.search(rule['board']['title_regex'], page)
    hrefs = []
    for h in re.findall(rule['board']['attachment_href_regex'], page):
        # 첨부 주소의 한글·공백 파일명은 퍼센트 인코딩한다(이미 인코딩된 %XX 는 그대로).
        full = urllib.parse.quote(urllib.parse.urljoin(url, html.unescape(h)), safe=":/?&=%()[],;!*'@$~+")
        if full not in hrefs:
            hrefs.append(full)
    files = {}
    for i, href in enumerate(hrefs, 1):
        body, headers = http_get(opener, cfg, href, calls)
        name = attachment_name(rule, href, headers)
        sha = hashlib.sha256(body).hexdigest()
        limit = cfg['followup']['max_save_bytes']
        if len(body) > limit and any(f['filename'].rsplit('.', 1)[0] == name.rsplit('.', 1)[0] for f in files.values()) or (
                len(body) > limit and any(h != href and attachment_name(rule, h, {}).rsplit('.', 1)[0] == name.rsplit('.', 1)[0] for h in hrefs)):
            # 같은 이름의 다른 형식(PDF 등)이 있으면 너무 큰 파일은 보존하지 않고 기록만 한다.
            files[f'file{i}'] = {'filename': name, 'url': href, 'bytes': len(body), 'sha256': sha, 'saved': False,
                                 'not_saved_reason': f'{len(body)} 바이트 — 저장 한도({limit}) 초과, 같은 이름의 다른 형식 보존'}
            continue
        path = os.path.join(out_dir, name)
        with open(path, 'wb') as f:
            f.write(body)
        files[f'file{i}'] = {'filename': name, 'url': href, 'bytes': len(body), 'sha256': sha}
    manifest = {
        'source': html.unescape(tm.group(1)) if tm else None,
        'fetched_at': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        'endpoint': url,
        'params': {'board': rule['board']['name'], 'id': board_id(rule, url),
                   'posted': board['posted'], 'dept': board['dept']},
        'notes': 'discover.py --fetch 로 HTTP 로 받음(쿠키 유지).',
        'files': files,
    }
    write_json(os.path.join(out_dir, 'manifest.json'), manifest)

    # Exa contents 로 받은 게시판 본문의 담당부서·등록일과 맞춰 본다.
    exa_info = board_details(cfg, [canonical_url(cfg, url)], refresh, calls).get(canonical_url(cfg, url), {})
    report = {'policy_id': policy['policy_id'], 'endpoint': url, 'http_board': board, 'exa_board': exa_info,
              'exa_dept_match': board['dept'] == exa_info.get('exa_dept') if exa_info.get('exa_dept') else None,
              'exa_posted_match': board['posted'] == exa_info.get('exa_posted') if exa_info.get('exa_posted') else None,
              'files': [], 'not_on_board': []}
    if compare:
        old = load_json(existing)
        old_files = list(old.get('files', {}).values())
        by_sha = {f['sha256']: f for f in old_files}
        by_name = {f['filename']: f for f in old_files}
        for f in files.values():
            same = by_sha.get(f['sha256'])
            named = by_name.get(f['filename'])
            report['files'].append({
                'filename': f['filename'], 'bytes': f['bytes'], 'sha256': f['sha256'],
                'result': 'SAME_SHA256' if same else ('DIFFERENT_BYTES' if named else 'NOT_IN_MANIFEST'),
                'existing_file': (same or named or {}).get('filename'),
            })
        got = {f['sha256'] for f in files.values()}
        report['not_on_board'] = [{'filename': f['filename'], 'url': f['url']} for f in old_files if f['sha256'] not in got]
    write_json(os.path.join(out_dir, 'compare.json'), report)
    print(f"{policy['policy_id']} 게시판 부서={board['dept']} 등록={board['posted']} | Exa contents {exa_info.get('exa_status')}"
          f" 부서={exa_info.get('exa_dept')} 등록={exa_info.get('exa_posted')} {exa_info.get('exa_error') or ''}")
    for f in report['files']:
        print(f"  {f['result']} {f['filename']} ({f['bytes']}B)")
    for f in report['not_on_board']:
        print(f"  게시판에 없음(다른 출처로 받은 기존 파일) {f['filename']}")
    print(f'호출: Exa {calls.exa}회 ${calls.exa_cost:.3f}, HTTP {calls.http}회, 캐시 {calls.cached}회')
    return report


# ---------------------------------------------------------------- P2 후보(Exa outputSchema)

def structure_request(cfg, policy):
    s = cfg['structure_schema']
    return exa_search_request(s['query_template'].format(name=policy['name']), schema=s['schema'])


def run_structure(cfg, policy, refresh):
    calls = Calls()
    res = exa(cfg, structure_request(cfg, policy), refresh, calls)
    content = (res.get('output') or {}).get('content') or {}
    print(f"{policy['policy_id']} 후보: 목표 {len(content.get('targets', []))} · 프로그램 {len(content.get('programs', []))} · 지명 {len(content.get('sites', []))}")
    print(f'호출: Exa {calls.exa}회 ${calls.exa_cost:.3f}, 캐시 {calls.cached}회')


def find_policy(cfg, policy_id):
    for p in load_json(os.path.join(ROOT, cfg['policies_file']))['policies']:
        if p['policy_id'] == policy_id:
            return p
    raise SystemExit(f'policies.json 에 없는 정책: {policy_id}')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--since')
    ap.add_argument('--until', default=None)
    ap.add_argument('--refresh', action='store_true', help='캐시를 무시하고 다시 부른다')
    ap.add_argument('--fetch', metavar='POLICY_ID')
    ap.add_argument('--out', help='--fetch 가 받을 새 빈 폴더')
    ap.add_argument('--structure', metavar='POLICY_ID')
    ap.add_argument('--followups', action='store_true', help='부모 정책이 있는 후속 발표를 찾아 받는다(--until 필요)')
    ap.add_argument('--progress', action='store_true', help='설정의 이행 실적 발표를 받고 사본과 비교한다')
    ap.add_argument('--reference', action='store_true', help='설정의 참고 발표 묶음(reference_sets)을 받는다')
    ap.add_argument('--config', default=CONFIG)
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    if a.fetch:
        if not a.out:
            ap.error('--fetch 에는 --out 이 필요하다')
        fetch_original(cfg, find_policy(cfg, a.fetch), a.out, a.refresh)
    elif a.reference:
        run_reference(cfg, a.refresh)
    elif a.progress:
        run_progress(cfg, a.refresh)
    elif a.followups:
        if not a.until:
            ap.error('--followups 에는 --until 이 필요하다')
        run_followups(cfg, a.until, a.refresh)
    elif a.structure:
        run_structure(cfg, find_policy(cfg, a.structure), a.refresh)
    elif a.since:
        until = a.until or dt.date.today().isoformat()
        run_discover(cfg, a.since, until, a.refresh)
    else:
        ap.error('--since, --fetch, --structure 중 하나가 필요하다')


if __name__ == '__main__':
    main()
