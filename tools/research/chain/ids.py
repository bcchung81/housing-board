"""URL 정규화와 문서·대조 기록 id(설계 docs/speech/research/파이프라인_설계.md 5.1·5.2).

    canonical_url(url, rules)  → (정규화 URL, locator). 규칙은 config/url_rules.json.
    doc_id_for_file(sha256)    → DOC-<sha256 앞 16자>
    doc_id_for_url(canonical)  → URL-<sha256(canonical_url) 앞 16자>
    evidence_id(...)           → EV-<sha256(subject_table|subject_id|field|external_ref|doc_id|locator) 앞 16자>
표준 라이브러리만 쓴다. 정책 id·URL 을 코드에 두지 않는다.
"""
import hashlib
import json
import os
import re
from urllib.parse import parse_qsl, quote, unquote, urlsplit, urlunsplit

CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config')
POST_RE = re.compile(r'^(\S+)\s+\(POST\s+(.*)\)\s*$', re.S)
PAGE_RE = re.compile(r'^page=(\d+)$')
PATH_SAFE = "/:@!$&'()*+,;=-._~"
QUERY_SAFE = "/:@!$'()*,;-._~"
DEFAULT_PORT = {'http': '80', 'https': '443'}


def load_json(name, config_dir=CONFIG):
    with open(os.path.join(config_dir, name), encoding='utf-8') as f:
        return json.load(f)


def load_rules(config_dir=CONFIG):
    return load_json('url_rules.json', config_dir)


def _sha(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def _norm_params(pairs, rule, global_drop):
    keep = set(rule.get('keep_params') or []) if rule else set()
    drop = set(rule.get('drop_params') or []) if rule else set()
    out = []
    for k, v in pairs:
        if v == '' or k.lower() in global_drop or k in drop or (keep and k not in keep):
            continue
        out.append((k, v))
    out.sort()
    return '&'.join(quote(k, safe=QUERY_SAFE) + '=' + quote(v, safe=QUERY_SAFE) for k, v in out)


def _rule_for(host, path, rules):
    for r in rules.get('rules', []):
        if r['host'] != host:
            continue
        if 'path' in r and r['path'] == path:
            return r
        if 'path_regex' in r and re.search(r['path_regex'], path):
            return r
    return None


def canonical_url(url, rules):
    """정규화 URL 과 locator(#page=N → 'page=N', 없으면 None). url 이 비면 (None, None)."""
    if not url or not url.strip():
        return None, None
    url = url.strip()
    body = None
    m = POST_RE.match(url)
    if m:
        url, body = m.group(1), m.group(2)
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = (parts.hostname or '').lower()
    host = rules.get('host_aliases', {}).get(host, host)
    netloc = host
    if parts.port and str(parts.port) != DEFAULT_PORT.get(scheme):
        netloc += ':%d' % parts.port
    path = quote(unquote(parts.path), safe=PATH_SAFE) or '/'
    frag = unquote(parts.fragment)
    locator = None
    pm = PAGE_RE.match(frag)
    if pm:
        locator = 'page=%s' % pm.group(1)
    rule = _rule_for(host, unquote(parts.path), rules)
    gdrop = {p.lower() for p in rules.get('global_drop_params', [])}
    query = _norm_params(parse_qsl(parts.query, keep_blank_values=True), rule, gdrop)
    out = urlunsplit((scheme, netloc, path, query, ''))
    if body is not None:
        out += ' (POST %s)' % _norm_params(parse_qsl(body, keep_blank_values=True), rule, gdrop)
    return out, locator


def host_of(url):
    if not url:
        return ''
    m = POST_RE.match(url.strip())
    if m:
        url = m.group(1)
    return (urlsplit(url.strip()).hostname or '').lower()


def domain_entry(host, domains):
    """가장 긴 접미사가 맞는 domains.json 줄(dict) 또는 None."""
    best = None
    for dom, e in domains.get('domains', {}).items():
        if host == dom or host.endswith('.' + dom):
            if best is None or len(dom) > len(best[0]):
                best = (dom, e)
    return best[1] if best else None


def doc_id_for_file(sha256):
    return 'DOC-' + sha256[:16]


def doc_id_for_url(canonical):
    return 'URL-' + _sha(canonical)[:16]


def evidence_id(subject_table, subject_id, field, external_ref, doc_id, locator):
    key = '|'.join('' if v is None else str(v) for v in (subject_table, subject_id, field, external_ref, doc_id, locator))
    return 'EV-' + _sha(key)[:16]


LINK_TYPES = ('POLICY_PROGRAM', 'PROGRAM_PROJECT', 'POLICY_PROJECT')


def subject_key(subject_table, subject_id, field=None):
    """evidence 의 subject_id 를 설계 5.2 모양(구분자 '|')으로: links 'TYPE|from|to',
    policy_targets 'policy|program 또는 *|stage 또는 *|지역+지역|start|end'. 옛 모양도 읽는다:
    links 'TYPE:from:to'(to 에 'HOME:PRO_…' 가능)·'from>to'(+ field = TYPE), policy_targets ':' 구분·'-'(없음)·','(지역)."""
    sid = subject_id or ''
    if subject_table == 'links':
        if '|' in sid:
            return sid
        if '>' in sid and field in LINK_TYPES:
            a, b = sid.split('>', 1)
            return '%s|%s|%s' % (field, a, b)
        parts = sid.split(':', 2)
        if len(parts) == 3 and parts[0] in LINK_TYPES:
            return '|'.join(parts)
        return sid
    if subject_table == 'policy_targets':
        parts = sid.split('|') if '|' in sid else sid.split(':')
        if len(parts) == 6:
            parts[1] = '*' if parts[1] in ('', '-', '*') else parts[1]
            parts[2] = '*' if parts[2] in ('', '-', '*') else parts[2]
            parts[3] = '+'.join(x for x in re.split(r'[+,]', parts[3]) if x)
            return '|'.join(parts)
    return sid
