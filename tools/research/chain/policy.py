#!/usr/bin/env python3
"""P2 정책 해석: 원 파일 텍스트 → 목표·프로그램·지명, HOME 정책 값과 원문 대조.

    python3 -I tools/research/chain/policy.py [--policy POLICY_ID ...] [--checked-at YYYY-MM-DD]

입력  config/policies.json(정책·docs_dir), docs_dir 의 원 파일(PDF 는 pypdf, HWPX 는 zip 안 XML)과
      manifest.json, config/policy_inputs.json(HOME 원장 표·CSV, 수동 대조 CSV 대응표),
      discover.py 캐시(게시판 담당부서, Exa outputSchema 후보 — 있으면).
출력  docs/speech/research/dataset/_work/<policy_id>/
        evidence_policy.jsonl   HOME 정책 값·목표·프로그램 연결 × 원문 대조(설계 5.2 칸, doc_id 대신 doc_url·doc_path)
        policy_programs.jsonl   원문 과제 제목·정의·조건
        policy_sites.jsonl      원문 지명(시도·지구·블록·이름·호수)
        regression_policy.json  자동 판정 ↔ 수동 대조 CSV 비교

원문 문자열 게이트: 받아들이는 값은 그 문자열·숫자가 원 파일 텍스트에 실제로 있고 PDF 쪽(인쇄 쪽을
알면 함께)이 기록된 것뿐이다. 게이트를 못 넘은 HOME 항목은 수동 대조 판정이 있으면 checked_by AGENT 로
옮기고, 없으면 UNVERIFIED 로 남긴다. 코드에는 정책 고유 값(호수·지명·쪽·id·URL)을 쓰지 않는다.
같은 입력·같은 --checked-at 이면 출력은 바이트까지 같다.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

try:
    import pypdf
except ModuleNotFoundError:  # python3 -I 는 사용자 site-packages 를 경로에서 뺀다
    import site
    sys.path.append(site.getusersitepackages())
    import pypdf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CONF_DIR = os.path.join(os.path.dirname(__file__), 'config')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import discover  # noqa: E402  같은 폴더의 P0·P1 모듈(캐시 경로·URL 규칙)

# 시도 코드·이름(행정표준코드 앞 2자리). 정책과 무관한 지리 상수다.
SIDO = {
    '11': ['서울'], '26': ['부산'], '27': ['대구'], '28': ['인천'], '29': ['광주'], '30': ['대전'], '31': ['울산'],
    '36': ['세종'], '41': ['경기'], '43': ['충북'], '44': ['충남'], '46': ['전남'], '47': ['경북'], '48': ['경남'],
    '50': ['제주'], '51': ['강원'], '52': ['전북'],
}
CAPITAL_AREA = {'11', '28', '41'}
CAPITAL_LABEL = '수도권'
SIDO_NAMES = sorted({n for v in SIDO.values() for n in v} | {CAPITAL_LABEL}, key=len, reverse=True)
SIDO_FULL = {'서울특별시': '11', '인천광역시': '28', '경기도': '41'}


def rel(path):
    return os.path.relpath(path, ROOT)


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def read_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- 정규화·숫자

_TRANS = str.maketrans({
    'ㆍ': '', '·': '', '‧': '', '･': '', '・': '', '∙': '', '•': '',
    '非': '비', '比': '비', '年': '년', '舊': '구', '委': '위',
    '「': '', '」': '', '｢': '', '｣': '', '『': '', '』': '', '“': '', '”': '', '‘': "'", '’': "'",
    '＋': '+', '～': '~', '∼': '~',
})


def norm(s):
    """대조용 정규화: 가운뎃점·낫표 제거, 한자 약어 → 한글, 공백 제거."""
    return re.sub(r'\s+', '', (s or '').translate(_TRANS))


def redact(text):
    """공무원 개인 이름을 지운다: '(장관 ○○○)' 괄호, '○○○ 직함' 앞 이름, 전화번호."""
    if not text:
        return text
    t = re.sub(r'\(\s*(장관|차관|사장|실장|청장|위원장|원장|이사장)\s*[가-힣]{2,4}\s*\)', r'(\1)', text)
    t = re.sub(r'(?<![가-힣])[가-힣]{2,4}(?<![부청처실회과팀단국시도군구])(\s+[가-힣]*?(부총리|장관|차관|본부장|실장|국장|과장|청장|위원장))',
               r'○○○\1', t)
    return re.sub(r'\d{2,4}-\d{3,4}-\d{4}', '○', t)


def squeeze(s):
    return re.sub(r'\s+', ' ', (s or '')).strip()


UNIT_SCALE = {'만': 10000, '천': 1000, '': 1, None: 1}
NUM_SUFFIX_RE = re.compile(
    r'(?<![\d.,제])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만|천)?\s*(호|가구|세대)(?!선)')


def to_number(text):
    return float(text.replace(',', ''))


def same_units(a, b):
    return a is not None and b is not None and abs(a - b) < 0.5


def suffixed_numbers(line):
    """'NN만호' 'N.N천호' 'N,NNN호' 같은 단위 붙은 수 → [(값(호), 원문, 시작)]."""
    out = []
    for m in NUM_SUFFIX_RE.finditer(line):
        out.append((to_number(m.group(1)) * UNIT_SCALE[m.group(2) or ''], m.group(0).strip(), m.start()))
    return out


def page_unit(text):
    """표 단위 선언 '(단위:만호)' → 배수. 없으면 None."""
    m = re.search(r'단위\s*[:：]?\s*(만|천)?\s*(호|가구|세대)', text)
    return UNIT_SCALE[m.group(1) or ''] if m else None


def line_unit(line):
    m = re.search(r'\((만|천)\s*(호|가구|세대)\)', line)
    return UNIT_SCALE[m.group(1)] if m else None


CELL_RE = re.compile(r'(?<![\w.])(-|\d+(?:\.\d+)?)(?![\w.])')
YEAR_RE = re.compile(r"(?<!~)['‘’`](\d{2})(?!\d)(?!\s*~)|(?<!\d)(20\d{2})(?!\d)(?!\s*~)")


def row_cells(line):
    """표 한 줄 → (머리말, [칸]). 괄호 속(증감)은 칸에서 뺀다."""
    t = re.sub(r'\([^)]*\)', lambda m: ' ' * len(m.group(0)), line.translate(_TRANS))
    cells = list(CELL_RE.finditer(t))
    if not cells:
        return t, []
    return t[:cells[0].start()], [c.group(1) for c in cells]


def header_years(line):
    """머리 줄의 연도 칸(범위 '~' 에 붙은 것은 뺀다)과 그 바로 앞이 '합계' 인지."""
    t = line.translate(_TRANS)
    years, first = [], None
    for m in YEAR_RE.finditer(t):
        start, end = m.span()
        if t[max(0, start - 1):start] == '~' or t[end:end + 1] == '~':
            continue
        y = int(m.group(2)) if m.group(2) else 2000 + int(m.group(1))
        years.append(y)
        first = start if first is None else first
    if len(years) < 2:
        return None
    return {'years': years, 'total_before': norm(t[:first]).endswith('합계')}


# ---------------------------------------------------------------- 원 파일 텍스트

def pdf_pages(path):
    """PDF → [{page, printed, lines}] (pypdf 레이아웃 추출, 빈 줄 제거, 인쇄 쪽은 '- N -' 줄)."""
    out = []
    for i, p in enumerate(pypdf.PdfReader(path).pages, 1):
        text = p.extract_text(extraction_mode='layout') or ''
        raw = [x.rstrip() for x in text.splitlines() if x.strip()]
        lines = [squeeze(x) for x in raw]
        printed = None
        for x in lines:
            m = re.fullmatch(r'-\s*(\d{1,3})\s*-', x)
            if m:
                printed = int(m.group(1))
        out.append({'page': i, 'printed': printed, 'lines': lines, 'raw': raw})
    return out


def hwpx_paragraphs(path):
    """HWPX(zip) → [{section, para, text}] (Contents/section*.xml 의 문단, 쪽 정보 없음)."""
    out = []
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if re.fullmatch(r'Contents/section\d+\.xml', n))
        for name in names:
            root = ET.fromstring(z.read(name))
            for i, p in enumerate(e for e in root.iter() if e.tag.endswith('}p')):
                text = ''.join(t.text or '' for t in p.iter() if t.tag.endswith('}t'))
                if text.strip():
                    out.append({'section': os.path.basename(name), 'para': i, 'text': squeeze(text)})
    return out


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def doc_priority(order, name):
    for word, rank in order:
        if word in name:
            return rank
    return 9


def ordered(cfg, docs, purpose):
    """purpose 'policy'(보도자료 먼저) · 'detail'(방안 본문 먼저) 순서로 문서를 줄 세운다."""
    order = cfg['doc_priority_' + purpose]
    return sorted(docs, key=lambda d: (doc_priority(order, d['name'] + ' ' + d['kind']), d['name']))


def load_docs(cfg, policy):
    """docs_dir 의 PDF·HWPX → 문서 목록. 같은 sha256 은 하나만, 안건·보도자료 순으로."""
    ddir = os.path.join(ROOT, policy['docs_dir'])
    manifest = load_json(os.path.join(ddir, 'manifest.json')) if os.path.exists(os.path.join(ddir, 'manifest.json')) else {}
    url_of = {f['filename']: f.get('url') for f in (manifest.get('files') or {}).values()}
    kind_of = {f['filename']: f.get('kind') or '' for f in (manifest.get('files') or {}).values()}
    docs, seen = [], {}
    for name in sorted(os.listdir(ddir)):
        ext = name.rsplit('.', 1)[-1].lower()
        if ext not in ('pdf', 'hwpx'):
            continue
        path = os.path.join(ddir, name)
        sha = sha256_file(path)
        if sha in seen:
            seen[sha]['aliases'].append(rel(path))
            continue
        d = {'path': rel(path), 'name': name, 'url': url_of.get(name), 'sha256': sha, 'format': ext.upper(),
             'kind': kind_of.get(name, ''), 'aliases': []}
        if ext == 'pdf':
            d['pages'] = pdf_pages(path)
        else:
            d['paragraphs'] = hwpx_paragraphs(path)
        seen[sha] = d
        docs.append(d)
    # 같은 이름의 PDF 가 있는 HWPX 는 쪽을 PDF 로 기록하므로 대조에서 뺀다(쪽이 없는 HWPX 만 남긴다).
    pdf_stems = {d['name'].rsplit('.', 1)[0] for d in docs if d['format'] == 'PDF'}
    for d in docs:
        d['twin_pdf'] = d['format'] == 'HWPX' and d['name'].rsplit('.', 1)[0] in pdf_stems
    # 비교용 사본(manifest kind 에 '비교용')은 원본과 sha 가 같으면 이미 빠졌다.
    return ordered(cfg, docs, 'detail'), manifest


def pdf_docs(docs):
    return [d for d in docs if d['format'] == 'PDF']


def locator(page):
    if page['printed'] is not None:
        return f"PDF {page['page']}쪽 · 인쇄 {page['printed']}쪽"
    return f"PDF {page['page']}쪽"


# ---------------------------------------------------------------- 게이트

REGION_STRIP_RE = re.compile('|'.join(map(re.escape, SIDO_NAMES)) + r'|합계|소계|\d+｣|\d+\)')


def label_text(line):
    head, cells = row_cells(line)
    return norm(REGION_STRIP_RE.sub('', head if cells else line))


def window_label(lines, i, radius):
    return ''.join(label_text(lines[j]) for j in range(max(0, i - radius), min(len(lines), i + radius + 1)))


def region_labels(areas):
    s = set(areas)
    if s == CAPITAL_AREA:
        return [CAPITAL_LABEL]
    if len(s) == 1:
        return SIDO.get(next(iter(s)), [])
    return []


def find_text(docs, needle):
    """정규화한 문자열이 PDF 쪽 텍스트에 있으면 [(doc, page, 줄, 원문 조각)] (문서·쪽 순)."""
    n = norm(needle)
    hits = []
    if not n:
        return hits
    for d in pdf_docs(docs):
        for p in d['pages']:
            joined, owner = '', []
            for li, line in enumerate(p['lines']):
                t = norm(line)
                joined += t
                owner += [li] * len(t)
            k = joined.find(n)
            if k >= 0:
                a, b = owner[k], owner[k + len(n) - 1]
                hits.append((d, p, a, ' / '.join(p['lines'][a:b + 1])))
    return hits


def find_tokens(docs, needle, slack):
    """낱말이 순서대로, 이름 길이 + slack 글자 안에 모두 나오면 [(doc, page, 줄, 원문 조각)]."""
    toks = [norm(t) for t in re.split(r'[\s·ㆍ‧･]+', needle) if norm(t)]
    if len(toks) < 2:
        return []
    limit = len(norm(needle)) + slack
    pat = re.compile('.{0,%d}?'.join(map(re.escape, toks)) % tuple([slack] * (len(toks) - 1)))
    hits = []
    for d in pdf_docs(docs):
        for p in d['pages']:
            joined, owner = '', []
            for li, line in enumerate(p['lines']):
                t = norm(line)
                joined += t
                owner += [li] * len(t)
            for m in pat.finditer(joined):
                if len(m.group(0)) <= limit:
                    a, b = owner[m.start()], owner[m.end() - 1]
                    hits.append((d, p, a, ' / '.join(p['lines'][a:b + 1])))
                    break
    return hits


def find_table_label(docs, name, radius=2):
    """표의 여러 줄에 나뉜 머리말(지역 낱말·각주 표시 제외)을 이어 붙여 이름을 찾는다."""
    n = norm(name)
    hits = []
    for d in pdf_docs(docs):
        for p in d['pages']:
            for i, line in enumerate(p['lines']):
                own = label_text(line)
                if row_cells(line)[1] and own and n.startswith(own) and n in window_label(p['lines'], i, radius):
                    hits.append((d, p, i, ' / '.join(p['lines'][i:i + radius + 1])))
                    break
    return hits


def table_matches(docs, value, areas, year_from, year_to, program_name, exclude_names):
    """표 칸에서 값 찾기: 단위 선언이 있는 쪽, 머리 줄 연도 칸·합계 칸, 행 지역 낱말, 프로그램 머리말."""
    labels = region_labels(areas)
    if not labels:
        return []
    single = year_from == year_to
    out = []
    for d in pdf_docs(docs):
        for p in d['pages']:
            scale = page_unit('\n'.join(p['lines']))
            if scale is None:
                continue
            header = None
            for i, line in enumerate(p['lines']):
                h = header_years(line)
                if h:
                    header = h
                    continue
                if header is None:
                    continue
                head, cells = row_cells(line)
                if not cells or not any(lb in norm(head) for lb in labels):
                    continue
                years = header['years']
                n, k = len(cells), len(years)
                if single:
                    if year_from not in years or n < k:
                        continue
                    cell = cells[n - k + years.index(year_from)]
                    col = f"'{str(year_from)[2:]}"
                else:
                    if not (header['total_before'] and n > k and years[0] == year_from and years[-1] == year_to):
                        continue
                    cell = cells[n - k - 1]
                    col = '합계'
                if cell == '-' or not same_units(to_number(cell) * scale, value):
                    continue
                if program_name and norm(program_name) not in window_label(p['lines'], i, 2):
                    continue
                if not program_name and any(norm(x) in window_label(p['lines'], i, 1) for x in exclude_names):
                    continue
                out.append({'doc': d, 'page': p, 'line': line, 'cell': cell, 'col': col,
                            'unit': {10000: '만호', 1000: '천호', 1: '호'}[scale]})
    return out


def year_marker_matches(docs, value, areas, year):
    """'수도권 APT 입주물량(만호): (’YYe)N.N' 처럼 줄에 단위가 있고 연도 표시 뒤에 값이 오는 표기."""
    labels = region_labels(areas)
    out = []
    for d in pdf_docs(docs):
        for p in d['pages']:
            for line in p['lines']:
                scale = line_unit(line)
                if scale is None or not any(lb in norm(line) for lb in labels):
                    continue
                for m in re.finditer(r"\(\s*['‘’`](\d{2})[^)\d]{0,3}\)\s*(\d+(?:\.\d+)?)", line):
                    if 2000 + int(m.group(1)) == year and same_units(to_number(m.group(2)) * scale, value):
                        out.append({'doc': d, 'page': p, 'line': line, 'cell': m.group(0), 'col': None,
                                    'unit': {10000: '만호', 1000: '천호', 1: '호'}[scale]})
    return out


def suffix_matches(docs, value, labels=None, near_names=None):
    """단위 붙은 수('NN만호')가 값과 같은 줄. labels·near_names 가 있으면 ±1줄 안에 그 낱말이 있어야 한다."""
    out = []
    for d in pdf_docs(docs):
        for p in d['pages']:
            for i, line in enumerate(p['lines']):
                for v, raw, _ in suffixed_numbers(line):
                    if not same_units(v, value):
                        continue
                    around = norm(' '.join(p['lines'][max(0, i - 1):i + 2]))
                    if labels and not any(lb in around for lb in labels):
                        continue
                    if near_names and not any(norm(x) in around for x in near_names):
                        continue
                    out.append({'doc': d, 'page': p, 'line': line, 'cell': raw, 'col': None, 'unit': None})
    return out


def date_matches(cfg, docs, iso):
    """같은 날짜 표기. 보도시점·배포 줄을 먼저, 없으면 1쪽 머리(5줄)에서 찾는다."""
    y, m, d = (int(x) for x in iso.split('-'))
    pats = [rf'{y}\s*\.\s*{m}\s*\.\s*{d}\s*\.', rf'{y}\s*년\s*{m}\s*월\s*{d}\s*일']
    out = []
    for marker_pass in (True, False):
        for doc in pdf_docs(docs):
            for p in doc['pages']:
                for i, line in enumerate(p['lines']):
                    marked = any(mk in line for mk in cfg['date_line_markers'])
                    if marker_pass and not marked or not marker_pass and (marked or not (p['page'] == 1 and i < 5)):
                        continue
                    for pat in pats:
                        mm = re.search(pat, line)
                        if mm:
                            out.append({'doc': doc, 'page': p, 'line': line, 'cell': mm.group(0)})
                            break
    return out


# ---------------------------------------------------------------- 담당 표(발행기관·담당부서)

DEPT_RE = re.compile(r'(?<![가-힣])([가-힣]{2,}(?:과|팀))(?![가-힣])')


def contact_table(docs, orgs):
    """보도자료 끝 '담당 부서' 표 → [(기관, 부서, 총괄 여부, doc, page, 줄)]. 사람 이름·전화번호는 읽지 않는다."""
    out = []
    for d in pdf_docs(docs):
        for p in d['pages']:
            org, on = None, False
            for line in p['lines']:
                if '담당 부서' in line or '담당부서' in line:
                    on = True
                if not on:
                    continue
                for o in orgs:
                    if o in line:
                        org = o
                for dept in DEPT_RE.findall(line.replace('과 장', '').replace('팀 장', '')):
                    if dept in orgs:
                        continue
                    out.append({'org': org, 'dept': dept, 'lead': '총괄' in line, 'doc': d, 'page': p, 'line': line})
        if out:
            return out
    return out


# ---------------------------------------------------------------- 지명·과제 추출(후보 → 게이트)

SITE_STOP = set('매년 연간 총 약 이상 각 연평균 추가 신규 기존 합계 소계 물량 착공 공급 분양 입주 규모 수준 내외 당초 최대 '
                '최소 전체 기 후 중 등 및 순증 계획 목표 예정 실적 년 월 일 시 제외 포함 기준 누계 평균 호수 기타 '
                '수도권 위한 따른 보다 이번 상기 外 內 과 내년 합 달 올해 남은 수치 사례'.split())
PARTICLE_RE = re.compile(r'(을|를|에|에서|는|은|하고|했고|되고|이고|며|해|하여|하고|로|으로|부터|까지|와|의|위해|통해|대비|이며|당겨|따라|으나|에게|에도)$|..(인|한|된|할|던|이|난|른)$')
SITE_GENERIC = set('개발 복합개발 공공주택 공공주택지구 유휴부지 공공택지 도심공급 신축매입임대 추진물량 전환분 확보분 잠정 사업 '
                   '납부 주택 추진 발표 후보지 발굴 완화 효율화 조기화 보다 내년 공급목표 신도시 중소택지 공유지 국유지 '
                   '택지 도심 민간 공공 지구 부지 청사 재정비복합개발 공공기관부지 아파트 일반주택 확대 구축 정상화 조성 '
                   '기금 규제지역 청년형 육아친화형 나머지 사무소 입지공개 예고물량 신규택지 우선추진물량 조성공급 '
                   '공공분양 분양 도시 복합지구 인허가 준공 실적'.split())
SITE_REJECT_RE = re.compile(r"[%㎡+/↔~～‘’'`]|층|\d+\s*(년|개|곳|분기|월|차|만|천)|[年平委]|대책|발표물량|착공물량")
BLOCK_RE = re.compile(r'(?<![A-Za-z0-9])([A-Z]{1,2}-?\d{1,3}(?:-\d{1,2})?)(?![A-Za-z0-9])')
# 사업군 합계 줄('○○ 공급 확대 NN만호')은 지명이 아니라 공급 유형이다.
SITE_PROGRAMISH_RE = re.compile(r'(공급|확대|구축|활용|정상화|완화|추진|지원|복합개발|재정비|조성|전환|착공|물량|발표|확보분|재건축|개발|사업)$')
SEG_DELIM_RE = re.compile(r'\s{5,}|[,(:)→|◇◈□ㅇ*※▪▸✔✓①-⑳➊-➓\[\]△▲⦁•]')


def site_candidates(raw):
    """한 줄(레이아웃 공백 보존)에서 'N호' 앞 조각을 지명 후보로: 이전 수량·구분자 뒤부터 수량 앞까지."""
    out, prev = [], 0
    for m in NUM_SUFFIX_RE.finditer(raw):
        seg = raw[prev:m.start()]
        prev = m.end()
        seg = re.sub(r'[\d,.]+\s*㎡', ' ', seg)  # 표 행의 면적 칸
        seg = re.sub(r'(?<=[가-힣A-Za-z0-9])\([^()]*\)', '', seg)  # 이름에 붙은 괄호 설명('○○(이전)')
        seg = re.sub(r'\(?\s*약\s*$', '', seg)
        seg = re.sub(r'[(\s]+$', '', seg)
        parts = [x for x in SEG_DELIM_RE.split(seg) if x.strip()]
        # 표 행: 끝 칸이 자치구·유형 칸이면 그 앞 칸이 이름이다.
        while len(parts) > 1 and re.fullmatch(r'(\s*([가-힣]{1,4}(구|군|시)|저층주거지|역세권|주거상업고밀|\d+)\s*)+', parts[-1]):
            parts.pop()
        name = squeeze(parts[-1]) if parts else ''
        words = name.split()
        cut = max((i for i, w in enumerate(words) if PARTICLE_RE.search(w) and len(w) > 1), default=-1)
        words = [w for w in words[cut + 1:]]
        while words and (words[0] in SITE_STOP or words[0] in ('에', '의', '및') or re.fullmatch(r'[\d.,%+~\-]+', words[0])):
            words = words[1:]
        name = re.sub(r'\d+｣\s*', '', ' '.join(words)).strip()
        words = name.split()
        if len(words) > 1 and re.fullmatch(r'[가-힣]{1,4}(구|군)', words[-1]):  # 표 행 끝의 자치구 칸
            words = words[:-1]
            name = ' '.join(words)
        n = norm(name)
        if (len(n) < 2 or not words or words[-1] in SITE_STOP or n in SITE_STOP or n in SIDO_NAMES or n in SITE_GENERIC
                or SITE_REJECT_RE.search(name) or SITE_PROGRAMISH_RE.search(words[-1]) or len(words) > 4
                or not re.search(r'[가-힣A-Za-z]', n)):
            continue
        units = int(round(to_number(m.group(1)) * UNIT_SCALE[m.group(2) or '']))
        out.append({'name': name, 'units': units, 'unit_text': squeeze(m.group(0)), 'precise': not m.group(2),
                    'after': raw[m.end():m.end() + 8], 'before': raw[max(0, m.start() - len(name) - 12):m.start()]})
    return out


def sido_of(line, name):
    m = re.search(r'\((' + '|'.join(SIDO_NAMES) + r')[^)]*\)', line)
    if m:
        return m.group(1) if m.group(1) != CAPITAL_LABEL else None
    for n in SIDO_NAMES:
        if n != CAPITAL_LABEL and name.startswith(n):
            return n
    return None


def district_of(name):
    m = re.search(r'((?:\S+\s)?\S*(?:공공주택지구|지구|신도시|택지))', name)
    return m.group(1) if m else None


NOT_SITE_WORDS = set('기숙사 연합기숙사 소형주택 주택 임대주택 공공주택 오피스텔 추가물량 공급물량 합계 신축매입 공공분양 공공임대'.split())
CATEGORY_WORDS = set('도심 유휴부지 노후청사 군부지 군부대 공공택지 신도시 택지 공공부지 청사 부지 신규택지 중소택지 우체국 세무서'.split())


NOT_SITE_NAME_RE = re.compile(r'(방안|대책|계획|제도|특별법|법$|모델|방식|체계|프로그램|공모|리츠|\d\s*(억|조)|억원|조원|투자|예산)')
COMPARISON_RE = re.compile(r'^\s*\)?\s*(급|같은|규모의|배|하나\s*더|만큼|\d+\s*개)')


def site_kind(name, after=None):
    """SITE(개별 지명) · AGGREGATE(여러 곳 묶음: 'N기 신도시', '<시도> 유휴부지', 범주 낱말만)
    · NOT_SITE(주택 유형·서수·블록만, 정책·제도 이름, 금액, 비교 표현 '○○급'·'○○ 하나 더')."""
    n = norm(name)
    if any(norm(w) in label_words() for w in name.split()):  # 표 머리·카드 꼬리표 낱말('공급규모' 등)
        return 'NOT_SITE'
    if (n in NOT_SITE_WORDS or re.fullmatch(r'\d+(지구|곳)', n) or BLOCK_RE.fullmatch(name.strip())
            or NOT_SITE_NAME_RE.search(name) or (after is not None and COMPARISON_RE.match(after))):
        return 'NOT_SITE'
    # 묶음 낱말('3기 신도시'·'중소택지')만이면 AGGREGATE, 뒤에 특정 지구 이름이 붙으면('3기 신도시 ○○') SITE
    core = [w for w in name.replace('3기신도시', '3기 신도시').split()
            if w not in SIDO_NAMES and not re.fullmatch(r'[△▲]?\d+기', w)]
    if not core or all(norm(w).lstrip('△▲') in CATEGORY_WORDS for w in core):
        return 'AGGREGATE'
    return 'SITE'


def site_key(name):
    """같은 지명 묶기용 키: 앞의 시·군·구 낱말, 끝의 부지·일대·일원을 떼고 정규화."""
    w = name.split()
    if len(w) > 1 and re.search(r'(구|시|군)$', w[0]):
        w = w[1:]
    return re.sub(r'(부지|일대|일원)$', '', norm(' '.join(w)).replace('-', ''))


NAME_NORMALIZE = {}  # policy_inputs.json 의 name_normalize(추출 뒤 지명 글자 고침, quote 는 원문 그대로)


def normalize_name(name):
    for a, b in NAME_NORMALIZE.items():
        name = name.replace(a, b)
    return name


def site_row(policy, d, p, quote, name, units, source, sido=None, notes=None, unit_text=None, precise=None, after=None):
    fixed = normalize_name(name)
    if fixed != name:
        notes = (notes + ' | ' if notes else '') + f"지명 글자 정규화: {name} → {fixed}"
        name = fixed
    blk = BLOCK_RE.search(name)
    # '○○ 하나 더' 처럼 지명 뒤에 비교 표현이 오는 경우(줄 전체로 확인)
    if after is None and re.search(re.escape(name) + r'\s*\)?\s*(하나\s*더|급\b|같은)', quote or ''):
        after = '하나 더'
    return {'policy_id': policy['policy_id'], 'program_name': None, 'sido': sido,
            'district': district_of(name) or name, 'block': blk.group(1) if blk else None, 'site_name': name,
            'site_kind': site_kind(name, after), 'units': units, 'doc_path': d['path'], 'page': p['page'],
            'printed_page': p['printed'], 'quote': quote, 'candidate_source': source,
            'policy_attribution': None, 'attribution_quote': None, 'notes': notes,
            '_unit_text': unit_text, '_precise': precise}


CARD_TITLE_RE = re.compile(r'^(?:[①-⑳]|⟪)\s*(.+?)\s*⟫?$')
CARD_UNITS_RE = re.compile(r'(공급규모|공급 규모|호수|세대수|규모)\s*\)?\s*[:：]?\s*(?:약\s*)?(\d[\d,.]*)\s*(만|천)?\s*(호|세대|가구)')
CARD_PLACE_RE = re.compile(r'\(위치\)\s*(.+)$')


def card_sites(lines):
    """카드 꼴 지명: 제목 줄('① ○○역 동측', '⟪ ○○구 ○○ 후보지(유형) ⟫') 뒤 5줄 안의 '(공급규모) N호'·'(위치) …'."""
    out = []
    for i, line in enumerate(lines):
        m = CARD_TITLE_RE.match(line)
        if not m or suffixed_numbers(line) or len(m.group(1)) > 40:
            continue
        units = place = None
        for nxt in lines[i + 1:i + 6]:
            if CARD_TITLE_RE.match(nxt):
                break
            u = CARD_UNITS_RE.search(nxt)
            if u and units is None:
                units = (int(round(to_number(u.group(2)) * UNIT_SCALE[u.group(3) or ''])), squeeze(u.group(0)), not u.group(3))
            pm = CARD_PLACE_RE.search(nxt)
            if pm and place is None:
                place = squeeze(pm.group(1))
        if units is None:
            continue
        name = re.sub(r'\s*\([^)]*\)\s*', ' ', m.group(1))
        name = squeeze(re.sub(r'\s*후보지\s*$', '', squeeze(name)))
        if len(norm(name)) < 2 or SITE_REJECT_RE.search(name):
            continue
        out.append({'i': i, 'name': name, 'units': units[0], 'unit_text': units[1], 'precise': units[2], 'place': place})
    return out


TABLE_NAME_COL_RE = re.compile(r'(단지명|지구명|구역명|사업명|사업지명?|복합지구명|후보지명)')
TABLE_UNITS_COL_RE = re.compile(r'(호수|세대수|공급규모|공급물량)')
TABLE_STAGE_COL_RE = re.compile(r'(승인|이주|착공|입주|지정|준공|분양)')


TABLE_REGION_COL_RE = re.compile(r'^(지역|위치|위|치|시군구|자치구|지역\(서울\))$')


def table_sites(raw_lines):
    """머리 줄에 이름 칸(후보지명·단지명·위치 등)과 호수 칸이 있는 표: 글자 위치로 칸을 맞춰 이름·지역·호수·단계 연도를 읽는다.
    호수 칸이 여럿이면 '계획'이 붙은 칸, 없으면 마지막 호수 칸. 호수 칸이 맨 끝이면 행의 마지막 값을 쓴다."""
    out = []
    i = 0
    while i < len(raw_lines):
        head = raw_lines[i]
        nxt = raw_lines[i + 1] if i + 1 < len(raw_lines) else ''
        two = bool(nxt.strip()) and not re.search(r'\d', nxt)
        cols = [{'x': m.start(), 'label': m.group(0)} for m in re.finditer(r'\S+', head)]
        if two:
            for m in re.finditer(r'\S+', nxt):
                c = min(cols, key=lambda c: abs(c['x'] - m.start()))
                c['label'] += m.group(0)
        name_col = next((k for k, c in enumerate(cols) if TABLE_NAME_COL_RE.fullmatch(c['label'])), None)
        if name_col is None:  # 이름 칸이 따로 없으면 '위치' 칸이 이름(지역 칸이 따로 있을 때)
            loc = [k for k, c in enumerate(cols) if c['label'] == '위치']
            if loc and any(c['label'] == '지역' for c in cols):
                name_col = loc[0]
        unit_cols = [k for k, c in enumerate(cols) if TABLE_UNITS_COL_RE.search(c['label'])]
        if name_col is None or not unit_cols:
            i += 1
            continue
        ucol = next((k for k in unit_cols if '계획' in cols[k]['label']), unit_cols[-1])
        region_cols = [k for k, c in enumerate(cols) if k != name_col and TABLE_REGION_COL_RE.match(c['label'])]
        j = i + (2 if two else 1)
        while j < len(raw_lines) and re.search(r'\d', raw_lines[j]) and not raw_lines[j].lstrip().startswith(('*', '※')):
            toks = [m for m in re.finditer(r'\S+', raw_lines[j])]
            if toks and re.fullmatch(r'\d+', toks[0].group(0)):
                toks = toks[1:]  # 행 번호
            toks = [m for m in toks if m.group(0) not in ('만', '천')]  # 단위 글자만 떨어져 나온 토막
            first_val = next((n for n, m in enumerate(toks) if re.match(r"['‘’]?\d[\d,.]*(%|㎡|만|천|호|세대)?$|['‘’]\d", m.group(0))), len(toks))
            vals = toks[first_val:]
            if len([m for m in vals if re.match(r'\d', m.group(0))]) < 2:
                j += 1  # 값이 하나뿐인 줄은 앞 행의 이어지는 줄(주소 등)
                continue
            cells = {}
            for m in toks[:first_val]:  # 글자 칸은 위치로 맞춘다(왼쪽 정렬)
                k = min((k for k in range(len(cols)) if k <= max(name_col, *region_cols, 0) or k == name_col),
                        key=lambda k: abs(cols[k]['x'] - m.start()))
                cells.setdefault(k, []).append(m.group(0))
            rest = [k for k in range(len(cols)) if k > max([name_col] + region_cols)]
            if ucol == len(cols) - 1:
                cells[ucol] = [vals[-1].group(0)]
                for k, m in zip(rest[:-1], vals[:-1]):
                    cells.setdefault(k, [m.group(0)])
            elif len(vals) >= len(rest):
                # 값 칸 수가 머리 칸 수 이상이면 왼쪽부터 차례로 맞춘다(오른쪽 정렬로 위치가 어긋난 표)
                for k, m in zip(rest, vals):
                    cells[k] = [m.group(0)]
            else:
                for m in vals:
                    k = min(range(len(cols)), key=lambda k: abs(cols[k]['x'] - m.start()))
                    cells.setdefault(k, []).append(m.group(0))
            name = ' '.join(cells.get(name_col, []))
            region = ' '.join(t for k in region_cols for t in cells.get(k, []))
            op = re.search(r'\(([A-Z]{1,3})\)', name)
            name = squeeze(re.sub(r'\([^)]*\)', '', name))
            w = name.split()
            while len(w) > 1 and re.fullmatch(r'[가-힣]{1,4}(구|군|시)|저층주거지|역세권', w[-1]):
                region = (region + ' ' + w[-1]).strip()
                w = w[:-1]  # 이름 칸에 섞여 든 자치구·유형 칸
            name = ' '.join(w)
            val = ' '.join(cells.get(ucol, []))
            num = re.search(r'(\d[\d,]*(?:\.\d+)?)\s*(만|천)?\s*(호|세대)?\s*$', val)
            if name and num and len(norm(name)) >= 2 and not re.fullmatch(r'[\d.,]+', norm(name)):
                stages = ' · '.join(f"{cols[k]['label']} {' '.join(v)}" for k, v in sorted(cells.items())
                                    if TABLE_STAGE_COL_RE.search(cols[k]['label']) and k != ucol)
                out.append({'i': j, 'name': name, 'region': region or None,
                            'units': int(round(to_number(num.group(1)) * UNIT_SCALE[num.group(2) or ''])),
                            'unit_text': squeeze(num.group(0)), 'precise': not num.group(2),
                            'notes': '; '.join(x for x in (f'시행 {op.group(1)}' if op else None,
                                                           f'지역 {region}' if region else None,
                                                           f'표 칸 {cols[ucol]["label"]}', stages) if x)})
            j += 1
        i = j
    return out


LABELED_SITE_RE = re.compile(r'^[ㅇ○◦·\-]\s*\(([^)]{2,20})\)\s*\S')
LABEL_GENERIC = set('공급계획 향후계획 개발구상 입지여건 추진방안 추진현황 공급규모 사업시행자 관계부처 위치 면적 호수 대상 '
                    '기간 일정 사례 실적 계획 주요과제 점검회의 공급상황판 현장소통 조정회의 현장지원'.split())


TABLE_LABEL_WORDS = set('공급규모 공급호수 공급물량 계획호수 세대수 호수 면적 위치 구분 합계 소계 계 연번 비고 유형'.split())


def label_words():
    """지명이 될 수 없는 표 머리·카드 꼬리표 낱말."""
    return LABEL_GENERIC | TABLE_LABEL_WORDS | set(COND_KEYS) | set(COND_KEYS.values())


def labeled_sites(lines, raw_lines=None):
    """'ㅇ (○○2) 설명' 처럼 꼬리표가 지명인 줄: 꼬리표가 숫자로 끝나거나 같은 쪽 다른 줄(지도 이름표 등)에도 나오면 지명.
    호수는 바로 앞 ◈ 줄의 묶음 호수만 있으므로 units 는 비우고 notes 에 묶음 호수를 적는다."""
    out = []
    page_norm = [norm(x) for x in lines]
    for i, line in enumerate(lines):
        m = LABELED_SITE_RE.match(line)
        if not m:
            continue
        label = squeeze(m.group(1))
        n = norm(label)
        if n in LABEL_GENERIC or n in COND_KEYS or COND_KEYS.get(n) or not re.search(r'[가-힣]', n):
            continue
        # 다른 줄 = 지도 이름표처럼 짧고 글머리표 없는 줄
        elsewhere = any(n in t for k, t in enumerate(page_norm)
                        if k != i and len(lines[k]) <= 40 and not re.match(r'^[□ㅇ○◈◇*※\-▪§➊-➓①-⑳(]', lines[k].strip()))
        placeish = re.search(r'(지구|도심|역세권|동|역|부지|공원|단지|마을|구역|CC)$', n)
        if not (re.search(r'[가-힣]\d+$', n) or (elsewhere and placeish)):
            continue
        h = next((k for k in range(i - 1, max(-1, i - 8), -1) if lines[k].startswith('◈')), None)
        head = None
        if h is not None:  # ◈ 줄과 이어지는 줄(다음 글머리표 전까지)
            ends = next((k for k in range(h + 1, i + 1) if re.match(r'^[□ㅇ○◈]', lines[k])), i)
            head = ' '.join(lines[h:ends])
        total = suffixed_numbers(head)[-1][1] if head and suffixed_numbers(head) else None
        out.append({'i': i, 'name': label, 'note': f"묶음 호수 {total}(◈ 줄)" if total else None})
    return out


POLICIES = []  # 귀속 표기 대조용 정책 목록(main 에서 policies.json 을 넣는다)


def table_attribution(raw_lines, policies, page_no):
    """'비고' 칸이 행 묶음마다 정책을 표시하는 표(병합 칸): 줄 번호 → (정책 id 목록, 비고 원문·쪽).
    병합 칸의 글자는 묶음 가운데 줄에 찍히므로, 비고 왼쪽 칸(유형 등) 값이 바뀌는 곳을 경계 후보로 삼아
    각 비고 글자가 묶음 가운데(±1행)에 오는 나눔이 하나로 정해질 때만 귀속한다. 애매하면 비운다."""
    out = {}
    for h, head in enumerate(raw_lines):
        hit = re.search(r'비고', head)
        if not hit or not re.search(r'(호수|호\(안\)|공급|면적)', head):
            continue
        bx = hit.start()
        rows, labels = [], []  # rows: (줄 번호, 유형 칸 값), labels: (위치, 글자)
        for k in range(h + 1, len(raw_lines)):
            line = raw_lines[k]
            if re.fullmatch(r'\s*-\s*\d+\s*-\s*', line):
                break
            tail = line[max(0, bx - 6):].strip()
            if re.match(r'^\s*\d+\s+\S', line):
                rows.append((k, squeeze(line[:max(0, bx - 6)]).split()[-2:]))
                if tail and policy_markers(tail, policies):
                    labels.append((len(rows) - 1, tail))
            elif tail and policy_markers(tail, policies) and not line[:max(0, bx - 6)].strip():
                labels.append((len(rows) - 0.5, tail))  # 행 사이 줄
        if not rows or not labels:
            continue
        # 유형 칸(비고 바로 앞 낱말) 값이 바뀌는 곳 = 묶음 경계 후보
        runs, start = [], 0
        for n in range(1, len(rows) + 1):
            if n == len(rows) or rows[n][1][-1:] != rows[start][1][-1:]:
                runs.append((start, n - 1))
                start = n
        best = None
        for cuts in _partitions(len(runs), len(labels)):
            groups = [(runs[a][0], runs[b][1]) for a, b in cuts]
            err = [abs((g[0] + g[1]) / 2 - lab[0]) for g, lab in zip(groups, labels)]
            if max(err) <= 1.0 and (best is None or sum(err) < best[0]):
                if best is not None and abs(sum(err) - best[0]) < 1e-9:
                    best = (sum(err), None)  # 같은 오차의 나눔이 둘이면 애매
                else:
                    best = (sum(err), groups)
        if not best or best[1] is None:
            continue
        for (a, b), (_, text) in zip(best[1], labels):
            pols = policy_markers(text, policies)
            for n in range(a, b + 1):
                out[rows[n][0]] = (pols, f"비고 '{squeeze(text)}' (PDF {page_no}쪽, 표 {a + 1}~{b + 1}행 묶음)")
    return out


def _partitions(n_runs, n_groups):
    """연속한 n_runs 토막을 n_groups 묶음으로 나누는 모든 방법: [(시작 토막, 끝 토막), ...]."""
    if n_groups == 1:
        yield [(0, n_runs - 1)]
        return
    for first_end in range(0, n_runs - n_groups + 1):
        for rest in _partitions(n_runs - first_end - 1, n_groups - 1):
            yield [(0, first_end)] + [(a + first_end + 1, b + first_end + 1) for a, b in rest]


def extract_sites(policy, docs, program_heads):
    """지명 후보. 블록만 적힌 후보는 같은 줄·앞 2줄의 지구 이름을 붙인다.
    표 비고 칸에 행 묶음별 정책 표기가 있으면 행마다 policy_attribution·attribution_quote 를 단다."""
    rows, seen = [], set()
    for d in pdf_docs(docs):
        for p in d['pages']:
            attr = table_attribution(p['raw'], POLICIES, p['page']) if POLICIES else {}
            page_start = len(rows)
            recent = []  # (줄 번호, 지구) — 같은 쪽 앞 줄의 지구 문맥
            for li, (line, raw) in enumerate(zip(p['lines'], p['raw'])):
                for c in site_candidates(raw):
                    name, notes = c['name'], None
                    if district_of(name):
                        recent.append((li, district_of(name)))
                    elif BLOCK_RE.fullmatch(name):
                        ctx = next((dname for lj, dname in reversed(recent) if li - lj <= 2), None)
                        if ctx is None:
                            ctx = district_of(line[:max(0, line.find(name))])
                        if ctx:
                            name = f'{ctx} {name}'
                            notes = f"블록만 적힌 행 — 같은 줄·앞 줄의 지구 '{ctx}' 를 붙임"
                    key = (d['path'], p['page'], norm(name), c['units'])
                    if key in seen:
                        continue
                    seen.add(key)
                    r = site_row(policy, d, p, line, name, c['units'], 'RULE', sido_of(line, name), notes,
                                 c['unit_text'], c['precise'], c['after'])
                    r['program_name'] = program_heads.get((d['path'], p['page']))
                    r['_li'] = li
                    rows.append(r)
            for c in labeled_sites(p['lines']):
                key = (d['path'], p['page'], norm(c['name']), None)
                if key in seen:
                    continue
                seen.add(key)
                r = site_row(policy, d, p, p['lines'][c['i']], c['name'], None, 'RULE_LABEL', None, c['note'])
                r['program_name'] = program_heads.get((d['path'], p['page']))
                rows.append(r)
            for c in table_sites(p['raw']):
                key = (d['path'], p['page'], norm(c['name']), c['units'])
                if key in seen:
                    continue
                seen.add(key)
                sido = next((n for n in SIDO_NAMES if n != CAPITAL_LABEL and (c['region'] or '').startswith(n)), None)
                r = site_row(policy, d, p, p['lines'][c['i']], c['name'], c['units'], 'RULE_TABLE', sido,
                             c['notes'], c['unit_text'], c['precise'])
                r['region'] = c['region']
                r['_li'] = c['i']
                r['program_name'] = program_heads.get((d['path'], p['page']))
                rows.append(r)
            for c in card_sites(p['lines']):
                key = (d['path'], p['page'], norm(c['name']), c['units'])
                if key in seen:
                    continue
                seen.add(key)
                sido = next((n for n in SIDO_NAMES if n != CAPITAL_LABEL and (c['place'] or '').startswith(n)), None)
                r = site_row(policy, d, p, p['lines'][c['i']], c['name'], c['units'], 'RULE_CARD', sido,
                             f"위치: {c['place']}" if c['place'] else None, c['unit_text'], c['precise'])
                r['program_name'] = program_heads.get((d['path'], p['page']))
                rows.append(r)
            for r in rows[page_start:]:
                a = attr.get(r.pop('_li', None))
                if a:
                    r['policy_attribution'], r['attribution_quote'] = a
    return rows


def merge_sites(rows, more):
    """제목 줄 지명(more)이 같은 문서·쪽에서 이미 같은 지명·호수로 뽑혔으면 더하지 않는다."""
    have = {(r['doc_path'], r['page'], site_key(r['site_name']), r['units']) for r in rows}
    return rows + [r for r in more if (r['doc_path'], r['page'], site_key(r['site_name']), r['units']) not in have]


def annotate_duplicate_sites(rows):
    """같은 지명(SITE)이 다른 호수로 여러 번 나오면 둘 다 남기고, 위치·표기와 대표 판단을 notes 에 적는다.
    대표 규칙: 호 단위 정수 표기(반올림 안 한 값) 우선 → 같으면 뒤 쪽(세부 절) 우선."""
    sites = [r for r in rows if r['site_kind'] == 'SITE' and r['units'] is not None]
    groups = []
    for r in sorted(sites, key=lambda r: -len(site_key(r['site_name']))):
        k = site_key(r['site_name'])
        # 블록이 다르면(한쪽만 블록이어도) 다른 곳이다: 지구 전체와 그 안의 블록은 묶지 않는다.
        g = next((g for g in groups if len(k) >= 3 and (k in g['key'] or g['key'] in k) and g['block'] == r['block']), None)
        if g:
            g['rows'].append(r)
        else:
            groups.append({'key': k, 'block': r['block'], 'rows': [r]})
    for g in groups:
        units = sorted({r['units'] for r in g['rows']})
        if len(units) < 2:
            continue
        rep = max(g['rows'], key=lambda r: (bool(r['_precise']), r['doc_path'] == g['rows'][0]['doc_path'], r['page']))
        where = '; '.join(f"{r['units']}({r['_unit_text'] or '제목'} · {os.path.basename(r['doc_path'])} PDF {r['page']}쪽)"
                          for r in sorted(g['rows'], key=lambda r: (r['doc_path'], r['page'], r['units'])))
        for r in g['rows']:
            role = '대표' if r is rep else '참고'
            reason = '반올림 표기' if not r['_precise'] else '정수 표기'
            note = (f"{role}: 같은 지명 다른 호수 — {where}. 이 행은 {reason}. "
                    f"대표 규칙: 정수 표기 우선, 같으면 뒤 쪽(세부 절) 우선 → 대표 {rep['units']}")
            r['notes'] = (r['notes'] + ' | ' if r['notes'] else '') + note


HEAD_MARK = ''  # 한글 문서 PDF 의 과제 제목 앞 상자 글리프(사용자 영역 문자)
HEAD_STOP = set('추진현황 개선방안 향후계획 추진배경 추진방향 기대효과 향후 주요일정 참고 별첨'.split())
COND_RE = re.compile(r'^[□ㅇ✔✓▪▸\-*]?\s*\(([^)]{1,12})\)\s*(.+)$')
COND_KEYS = {'사업시행자': '사업주체', '사업주체': '사업주체', '시행자': '사업주체', '시행': '사업주체',
             '대상': '대상', '대상지': '대상', '위치': '위치', '면적': '면적', '호수': '호수',
             '기간': '기간', '향후계획': '일정', '추진일정': '일정', '일정': '일정', '택지': '택지 유형'}


HEAD_DROP_RE = re.compile(r'(단계|현황|일정|체계|조치|방향|효과|계획$|^다만|에 한해|하여|하고|도모|있게|!)')
HEAD_SUPPLY_RE = re.compile(r'(공급|착공|분양|임대|정비|재건축|재개발|택지|주택지구|복합사업|복합개발|기숙사|용도전환|주택 전환|'
                            r'리모델링|빈집|모듈러|비아파트|非아파트|오피스텔|매입|신도시)')
HEAD_MEASURE_RE = re.compile(r'(강화|개선|완화|개편|신설|도입|합리화|확대|지원|설치|추진|제고|조사|관리|적용|일원화|출시|가동|조성|'
                             r'정례화|전환|마련|구축|유도|차단|효율화|조기화|활성화|본격화|제한|보증|금융|규제|세제|대출)')
HEAD_MEASURE_TOPIC_RE = re.compile(r'(제도|금융|보증|대출|LTV|기금|자금|인센티브|확약|선정방식|목표|규제|세제|인허가|부담)')
HEAD_TAG_RE = re.compile(r'^\(([^)]{1,20})\)\s*(.*)$')
PLACE_TAG_RE = re.compile(r'(지구|도심|역세권\d*|부지|택지|신도시|일원|일대)$')


def classify_heading(name, title, site_names):
    """과제 제목 → SITE(지명 제목) · DROP(절차·서술 제목) · SUPPLY(공급 유형·사업군) · MEASURE(제도·금융·규제 과제).
    지명 제목: '(시도 …)'·'(…지구·도심·역세권)' 꼬리표로 시작하거나, '이름 : N호' 꼴이거나, 규칙으로 뽑은 지명과 같은 제목."""
    tag = HEAD_TAG_RE.match(name)
    if tag and (any(tag.group(1).startswith(n) for n in SIDO_NAMES) or PLACE_TAG_RE.search(tag.group(1).strip())):
        return 'SITE'
    if tag:
        return 'DROP'  # '(꼬리표) 설명' 꼴 하위 항목(지명 아님)은 과제 제목이 아니다
    pre = title.split(':', 1)[0]
    if (':' in title and re.match(r'\s*(약\s*)?\d[\d,.]*\s*(만|천)?\s*호', title.split(':', 1)[1])
            and not re.search(r"['‘’]\d{2}|계획|총", pre)):
        return 'SITE'
    if norm(name) in site_names and not HEAD_SUPPLY_RE.search(name):
        return 'SITE'
    if re.match(r"['‘’]\d{2}", name):
        return 'DROP'
    sentence = sum(1 for w in name.split() if re.search(r'.(을|를|에|의)$', w)) >= 2
    if HEAD_DROP_RE.search(name) or sentence or norm(name) in HEAD_STOP or len(norm(name)) < 4 or len(name.split()) > 10:
        return 'DROP'
    # 공급 낱말이 있어도 제도·금융·규제 과제면 MEASURE(예: '○○ 제도 개선', '○○ 금융지원 강화').
    if HEAD_MEASURE_TOPIC_RE.search(name):
        return 'MEASURE'
    if HEAD_SUPPLY_RE.search(name):
        return 'SUPPLY'
    # 공급·제도 동사가 없는 짧은 제목은 지명 제목이다(예: '○○ 정보대(△△ 앞)').
    if not HEAD_MEASURE_RE.search(name) and len(name.split()) <= 5:
        return 'SITE'
    return 'MEASURE'


def heading_site(policy, d, p, title):
    """지명 제목 '(시도 시군구) ○○ 부지 : 약 N호' · '(○○도심) …' → policy_sites 행.
    꼬리표의 시군구 이름이 지명 앞에 없으면 붙인다(예: '(시도 ○○시) 군부대' → '○○ 군부대')."""
    m = HEAD_TAG_RE.match(title)
    tag, rest = (squeeze(m.group(1)), m.group(2)) if m else ('', title)
    tag_words = tag.split()
    sido = next((n for n in SIDO_NAMES if n != CAPITAL_LABEL and tag.startswith(n)), None)
    admin_tag = bool(tag) and sido is not None and (len(tag_words) > 1 or tag in SIDO_NAMES)
    body = squeeze(re.split(r'\s:\s|:', rest)[0])
    name = body if (not tag or admin_tag) else tag
    if admin_tag and len(tag_words) > 1:
        city = re.sub(r'(특별자치시|시|군|구)$', '', tag_words[-1])
        if city and not norm(name).startswith(city):
            name = f'{city} {name}'
    nums = suffixed_numbers(title.split(':', 1)[1]) if ':' in title else []
    raw = re.search(r':\s*(?:약\s*)?(\d[\d,.]*\s*(만|천)?\s*호)', title)
    return site_row(policy, d, p, title, name, int(round(nums[0][0])) if nums else None, 'RULE_HEADING', sido,
                    unit_text=raw.group(1) if raw else None, precise=bool(raw and not raw.group(2)))


def extract_programs(policy, docs, site_names):
    """과제 제목(상자 글리프 줄) → 이름·목표 문구, 다음 □ 문단을 정의로, '(꼬리표) 내용' 줄을 조건으로.
    지명 제목은 지명 행으로 돌리고, 절차·서술 제목은 버린다. program_kind 로 공급 유형(SUPPLY)과 제도 과제(MEASURE)를 가른다."""
    rows, heads, site_rows, dropped, seen_names = [], {}, [], [], set()
    for d in pdf_docs(docs):
        flat = [(p, line, raw) for p in d['pages'] for line, raw in zip(p['lines'], p['raw'])]
        # 총괄표의 사업군 줄 '◇ 사업군 이름 N천호' 도 공급 유형 후보로 둔다.
        for p, line, _ in flat:
            m = re.match(r'^◇\s*(.+?)\s*(?:\d+곳\s*)?(?:\(?\s*약\s*)?\d[\d,.]*(?:\s*~\s*\d[\d,.]*)?\s*(?:만|천)?\s*호', line)
            if m and norm(m.group(1)) not in seen_names and len(norm(m.group(1))) >= 4:
                seen_names.add(norm(m.group(1)))
                rows.append({'policy_id': policy['policy_id'], 'program_name': squeeze(m.group(1)),
                             'program_kind': 'SUPPLY', 'target_text': squeeze(line[m.end(1):]), 'definition': None,
                             'conditions': {}, 'doc_path': d['path'], 'page': p['page'], 'printed_page': p['printed'],
                             'quote': line, 'candidate_source': 'RULE_GROUP_ROW'})
        idx = [i for i, (_, line, _) in enumerate(flat) if line.startswith(HEAD_MARK)]
        for n, i in enumerate(idx):
            p, line, raw = flat[i]
            # 제목 줄: '<상자> 과제 이름 <상자> 목표 문구' — 두 번째 상자 글리프가 이름과 목표를 가른다.
            parts = [squeeze(x) for x in line[1:].split(HEAD_MARK, 1)]
            title = squeeze(line[1:].replace(HEAD_MARK, ' '))
            name = squeeze(re.sub(r'※.*$', '', parts[0]))
            kind = classify_heading(name, title, site_names)
            if kind in ('SUPPLY', 'MEASURE') and norm(name) in seen_names:
                continue
            seen_names.add(norm(name))
            if kind == 'SITE':
                site_rows.append(heading_site(policy, d, p, title))
                continue
            if kind == 'DROP':
                dropped.append(title)
                continue
            body = flat[i + 1: idx[n + 1] if n + 1 < len(idx) else min(len(flat), i + 40)]
            definition, conditions = None, {}
            for _, b, _ in body:
                if definition is None and b.startswith('□'):
                    definition = b.lstrip('□ ').strip()
                m = COND_RE.match(b)
                if m:
                    label = squeeze(m.group(1))
                    key = COND_KEYS.get(norm(label), label)
                    conditions.setdefault(key, squeeze(m.group(2)))
            heads.setdefault((d['path'], p['page']), name)
            for q, _, _ in body:
                heads.setdefault((d['path'], q['page']), name)
            rows.append({
                'policy_id': policy['policy_id'],
                'program_name': name,
                'program_kind': kind,
                'target_text': parts[1] if len(parts) > 1 else None,
                'definition': definition,
                'conditions': conditions,
                'doc_path': d['path'],
                'page': p['page'],
                'printed_page': p['printed'],
                'quote': title,
                'candidate_source': 'RULE',
            })
    return rows, heads, site_rows, dropped


def exa_candidates(cfg_disc, policy, docs, programs, sites):
    """discover.py --structure 캐시(Exa outputSchema)가 있으면 그 후보를 원문 게이트로 걸러 더한다."""
    path = discover.cache_path(cfg_disc['_cache_dir'], 'exa-search', discover.structure_request(cfg_disc, policy))
    if not os.path.exists(path):
        return 0, 0
    content = ((load_json(path)['response'].get('output') or {}).get('content')) or {}
    have_p = {norm(r['program_name']): r for r in programs}
    have_s_names = {norm(r['site_name']) for r in sites}
    added_p = added_s = 0
    for c in content.get('programs') or []:
        name = c.get('name') or ''
        # 정책·회의 이름(…방안·…대책·…회의)과 지명은 프로그램 후보로 받지 않는다.
        if re.search(r'(방안|대책|회의)$', name) or classify_heading(name, name, have_s_names) in ('SITE', 'DROP'):
            continue
        if norm(name) in have_p:
            have_p[norm(name)]['candidate_source'] = 'RULE+EXA'
            continue
        hits = find_text(docs, name)
        if not hits:
            continue
        d, p, _, quote = hits[0]
        row = {'policy_id': policy['policy_id'], 'program_name': name,
               'program_kind': 'SUPPLY' if HEAD_SUPPLY_RE.search(name) and not HEAD_MEASURE_TOPIC_RE.search(name) else 'MEASURE',
               'target_text': None,
               'definition': None, 'conditions': {}, 'doc_path': d['path'], 'page': p['page'],
               'printed_page': p['printed'], 'quote': quote, 'candidate_source': 'EXA'}
        programs.append(row)
        have_p[norm(name)] = row
        added_p += 1
    have_s = {norm(r['site_name']) for r in sites}
    for c in content.get('sites') or []:
        raw_name = c.get('name') or ''
        name = squeeze(re.sub(r'\s*\([^)]*\)', '', raw_name))
        if not c.get('units') and raw_name != name:
            c = dict(c, units=raw_name)
        if norm(name) in have_s:
            for r in sites:
                if norm(r['site_name']) == norm(name):
                    r['candidate_source'] = 'RULE+EXA'
            continue
        hits = find_text(docs, name)
        if not hits:
            continue
        d, p, li, quote = hits[0]
        units = None
        if c.get('units'):
            nums = suffixed_numbers(c['units'])
            if nums and any(same_units(nums[0][0], v) for v, _, _ in suffixed_numbers(' '.join(p['lines'][li:li + 2]))):
                units = int(round(nums[0][0]))
        sites.append(site_row(policy, d, p, quote, name, units, 'EXA', sido_of(quote, name)))
        have_s.add(norm(name))
        added_s += 1
    return added_p, added_s


# ---------------------------------------------------------------- HOME 항목

def first_url(text):
    m = re.search(r'https?://\S+', text or '')
    return m.group(0).rstrip('.,)') if m else None


def target_key(policy_id, program_id, stage, areas, start, end):
    """설계 5.2 subject_id: <policy_id>|<program_id 또는 *>|<stage_code 또는 *>|<area_codes + 로 이음>|<시작>|<끝>."""
    return f"{policy_id}|{program_id or '*'}|{stage or '*'}|{'+'.join(sorted(areas))}|{start}|{end}"


def link_key(link_type, from_id, to_id):
    return f'{link_type}|{from_id}|{to_id}'


def home_items(cfg, policy):
    """HOME 항목(원장 표 + HOME CSV) → [{item, subject_table, subject_id, field, external_value, ...}]."""
    home = cfg['home']
    hid = policy['home_policy_id']
    ledger = os.path.join(ROOT, home['ledger_dir'])
    tables = {t: load_json(os.path.join(ledger, f'{t}.json'))['rows'] for t in ('policies', 'programs', 'policy_targets', 'links')}
    prog_name = {r['local_program_id']: r['program_name'] for r in tables['programs']}
    pol_csv = next((r for r in read_csv(os.path.join(ROOT, home['policies_csv'])) if r['id'] == hid), {})
    led_pol = next((r for r in tables['policies'] if r['local_policy_id'] == hid), {})
    items = []

    def add(table, sid, field, value, **kw):
        items.append(dict({'item': f'{table}#{sid}#{field}', 'subject_table': table, 'subject_id': sid, 'field': field,
                           'external_value': value, 'stage_code': '01', 'external_ref': None, 'home_url': None,
                           'home_page': None}, **kw))

    home_url = pol_csv.get('근거_URL') or None
    ext_ref = pol_csv.get('entity_id') or None
    add('policies', hid, 'policy_name', led_pol.get('policy_name') or pol_csv.get('이름'), home_url=home_url, external_ref=ext_ref)
    add('policies', hid, 'announcement_date', led_pol.get('announcement_date') or pol_csv.get('발표일'), home_url=home_url, external_ref=ext_ref)
    add('policies', hid, 'scope_region', led_pol.get('scope_region') or pol_csv.get('범위'), home_url=home_url, external_ref=ext_ref)
    add('policies', hid, 'target_units', int(pol_csv['목표(호)']) if pol_csv.get('목표(호)') else None, home_url=home_url, external_ref=ext_ref)
    add('policies', hid, 'target_indicator', pol_csv.get('지표') or None, home_url=home_url, external_ref=ext_ref)
    add('policies', hid, 'source_url', home_url, home_url=home_url, external_ref=ext_ref)
    add('policies', hid, 'publisher_org', None, external_ref=ext_ref)
    add('policies', hid, 'publisher_dept', None, external_ref=ext_ref)

    # 목표: 원장 policy_targets + HOME 목표 CSV(원장에 없는 행)
    targets = {}
    for r in tables['policy_targets']:
        if r['local_policy_id'] != hid:
            continue
        k = target_key(hid, r['local_program_id'], r['stage_code'], r['area_codes'], r['period_start'], r['period_end'])
        targets.setdefault(k, {'program_id': r['local_program_id'], 'stage': r['stage_code'], 'areas': sorted(r['area_codes']),
                               'start': r['period_start'], 'end': r['period_end'], 'value': r['target_units'],
                               'home_url': first_url(r.get('evidence')), 'origin': 'ledger'})
    tcsv = home.get('targets_csv', {}).get(hid)
    if tcsv:
        for r in read_csv(os.path.join(ROOT, tcsv)):
            period = r.get('연도') or ''
            if not re.fullmatch(r'\d{4}(~\d{4})?', period):
                continue
            y0, y1 = (period.split('~') + [period])[:2]
            stage = '06' if r.get('이름') == 'MOVE_IN' or r.get('역할') in ('REFERENCE', 'FORECAST_TARGET') else '04'
            prog = home['group_program_id'].format(policy_id=hid, group=r['프로그램군_id']) if r.get('프로그램군_id') else None
            rows = []
            if r['이름'] in SIDO_FULL:
                rows.append(([SIDO_FULL[r['이름']]], r.get('호수')))
            else:
                rows.append((sorted(CAPITAL_AREA), r.get('호수')))
                if r.get('서울_호수'):
                    rows.append((['11'], r['서울_호수']))
            for areas, v in rows:
                k = target_key(hid, prog, stage, areas, f'{y0}-01-01', f'{y1}-12-31')
                if k in targets:
                    continue
                targets[k] = {'program_id': prog, 'stage': stage, 'areas': areas, 'start': f'{y0}-01-01',
                              'end': f'{y1}-12-31', 'value': int(v) if v else None,
                              'home_url': r.get('근거_URL') or None, 'origin': 'home_csv'}
    for k in sorted(targets):
        t = targets[k]
        add('policy_targets', k, 'target_units', t['value'], stage_code=t['stage'], home_url=t['home_url'],
            target=t, program_name=prog_name.get(t['program_id']))

    # 프로그램 연결: 원장 links(POLICY_PROGRAM)
    pcsv = {r['프로그램_id']: r for r in read_csv(os.path.join(ROOT, home['programs_csv'])) if r['정책_id'] == hid}
    for r in sorted((r for r in tables['links'] if r['link_type'] == 'POLICY_PROGRAM' and r['from_local_id'] == hid),
                    key=lambda r: r['to_local_id']):
        pid = r['to_local_id']
        c = pcsv.get(pid, {})
        url = c.get('근거_URL') or first_url(r.get('evidence'))
        page = c.get('근거_쪽(#page)') or None
        add('links', link_key('POLICY_PROGRAM', hid, pid), 'POLICY_PROGRAM', prog_name.get(pid), external_ref=pid,
            home_url=url, home_page=int(page) if page else None)
    return items


# ---------------------------------------------------------------- 판정

def manifest_urls(manifest):
    urls = set()
    for f in (manifest.get('files') or {}).values():
        for k in ('url', 'source_page'):
            if f.get(k):
                urls.add(f[k])
    if isinstance(manifest.get('endpoint'), str):
        urls.add(manifest['endpoint'])
    return urls


def basis_for(home_url, manifest):
    """HOME 근거가 이 원 파일(같은 sha256 사본 포함)이면 SAME_SOURCE, 다른 문서면 INDEPENDENT."""
    if not home_url:
        return 'INDEPENDENT'
    return 'SAME_SOURCE' if home_url.split('#')[0] in manifest_urls(manifest) else 'INDEPENDENT'


def evidence_row(policy, it, cfg, checked_at, **kw):
    row = {
        'policy_id': policy['policy_id'], 'subject_table': it['subject_table'], 'subject_id': it['subject_id'],
        'field': it['field'], 'external_ref': it['external_ref'], 'stage_code': it['stage_code'],
        'dataset_value': None, 'external_value': it['external_value'], 'doc_url': None, 'doc_path': None,
        'locator': None, 'original_value': None, 'verdict': 'UNVERIFIED', 'basis': None, 'search_scope': None,
        'checked_by': 'TOOL', 'checked_at': checked_at, 'notes': None,
    }
    row.update(kw)
    if row['notes'] and len(row['notes']) > cfg['max_note_chars']:
        row['notes'] = row['notes'][:cfg['max_note_chars'] - 1] + '…'
    return row


def hit_fields(hit):
    d, p = hit['doc'], hit['page']
    return {'doc_url': d['url'], 'doc_path': d['path'], 'locator': locator(p)}


def search_scope(docs):
    return '원 파일 PDF 전 쪽: ' + ', '.join(os.path.basename(d['path']) for d in pdf_docs(docs))


def board_info(cfg_disc, policy):
    """discover.py 캐시의 게시판 상세(HTTP)·Exa contents → 담당부서·등록일."""
    url = discover.canonical_url(cfg_disc, policy['canonical_url'])
    out = {'org': None, 'http_dept': None, 'exa_dept': None, 'posted': None}
    c = discover.classify(cfg_disc, url)
    if c['kind'] != 'original_board':
        return out
    out['org'] = c['org']
    p = discover.cache_path(cfg_disc['_cache_dir'], 'board-detail', {'url': url})
    if os.path.exists(p):
        r = load_json(p)['response']
        out['http_dept'], out['posted'] = r.get('dept'), r.get('posted')
    eu = c['rule']['board']['exa_detail'].format(id=discover.board_id(c['rule'], url))
    p = discover.cache_path(cfg_disc['_cache_dir'], 'exa-contents', discover.exa_contents_request([eu]))
    if os.path.exists(p):
        for r in load_json(p)['response'].get('results', []):
            if r['url'] == eu:
                out['exa_dept'] = discover.parse_board_text(c['rule'], r.get('text') or '')['dept']
    return out


def confirmed_record(cfg_disc, policy):
    """discover.py 실행 요약(run-*.json)의 '확인됨' 묶음(전재본·브리핑 주소)을 합친다."""
    out = {'repost_urls': set(), 'related_briefings': set()}
    d = cfg_disc['_cache_dir']
    for name in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        if name.startswith('run-') and name.endswith('.json'):
            for c in load_json(os.path.join(d, name)).get('confirmed', []):
                if c.get('policy_id') == policy['policy_id']:
                    out['repost_urls'] |= set(c.get('repost_urls', []))
                    out['related_briefings'] |= set(c.get('related_briefings', []))
    return {k: sorted(v) for k, v in out.items()}


def source_url_verdict(home, canon, aliases, kind, home_canon):
    """근거 URL 항목: 원 게시물이면 MATCH, 같은 문서의 재게시 주소(manifest 의 sha256 같은 사본 주소·같은 보도자료
    전재본)면 MATCH + 원 게시물 병기 권장, 다른 문서면 MISMATCH."""
    if home and home_canon == canon:
        return 'MATCH', None
    if home in aliases:
        return 'MATCH', f"같은 문서의 재게시 주소({kind['kind']}, {kind['org']}) — 원 게시물 병기 권장"
    return 'MISMATCH', f"HOME 근거는 다른 문서({kind['kind']}, {kind['org']}) — 원 게시물과 sha256·전재 관계 없음"


def judge(cfg, cfg_disc, policy, docs, manifest, items, checked_at):
    """항목별 TOOL 판정. 게이트를 못 넘으면 UNVERIFIED(이후 수동 대조로 채움)."""
    rows = {}
    scope = search_scope(docs)
    group_names = sorted({it['program_name'] for it in items if it['subject_table'] == 'policy_targets' and it.get('program_name')})
    table_pages = set()
    board = board_info(cfg_disc, policy)

    def miss(it, note=None):
        return evidence_row(policy, it, cfg, checked_at, search_scope=scope, notes=note)

    pdocs = ordered(cfg, docs, 'policy')
    for it in items:
        f, v = it['field'], it['external_value']
        basis = basis_for(it['home_url'], manifest)
        if it['subject_table'] == 'policies':
            if f in ('policy_name', 'scope_region', 'target_indicator'):
                needle = re.sub(r'\s*\([^)]*\)\s*$', '', v or '') if f == 'policy_name' else (v or '')
                hits = find_text(pdocs, needle)
                if hits:
                    d, p, _, quote = hits[0]
                    rows[it['item']] = evidence_row(policy, it, cfg, checked_at, verdict='MATCH', basis=basis,
                                                    dataset_value=needle, original_value=quote, doc_url=d['url'],
                                                    doc_path=d['path'], locator=locator(p),
                                                    notes=('HOME 이름의 끝 괄호(약칭)는 떼고 찾음' if needle != v else None))
                else:
                    rows[it['item']] = miss(it, '정규화한 문자열이 원 파일에 없음')
            elif f == 'announcement_date':
                hits = date_matches(cfg, pdocs, v) if v else []
                if hits:
                    h = hits[0]
                    rows[it['item']] = evidence_row(policy, it, cfg, checked_at, verdict='MATCH', basis=basis,
                                                    dataset_value=v, original_value=h['cell'], **hit_fields(h),
                                                    notes='줄: ' + h['line'])
                else:
                    rows[it['item']] = miss(it, '보도시점·배포 줄에 같은 날짜 없음')
            elif f == 'target_units':
                hits = suffix_matches(pdocs, v) if v is not None else []
                if hits:
                    h = hits[0]
                    rows[it['item']] = evidence_row(policy, it, cfg, checked_at, verdict='MATCH', basis=basis,
                                                    dataset_value=v, original_value=h['cell'], **hit_fields(h),
                                                    notes='줄: ' + h['line'])
                else:
                    rows[it['item']] = miss(it, '단위 붙은 같은 수 없음')
            elif f == 'source_url':
                # 같은 문서(원 게시물, sha256 같은 첨부 사본, 같은 보도자료 전재본)면 MATCH, 다른 문서면 MISMATCH.
                canon = discover.canonical_url(cfg_disc, policy['canonical_url'])
                home = (v or '').split('#')[0]
                c = discover.classify(cfg_disc, home) if home else {'kind': None, 'org': None}
                aliases = manifest_urls(manifest) | set(confirmed_record(cfg_disc, policy).get('repost_urls', []))
                verdict, note = source_url_verdict(home, canon, aliases, c, discover.canonical_url(cfg_disc, home) if home else None)
                rows[it['item']] = evidence_row(
                    policy, it, cfg, checked_at, verdict=verdict, basis=basis_for(home, manifest),
                    dataset_value=canon, original_value=canon, doc_url=canon, locator='원 게시처 게시물 주소', notes=note)
            elif f in ('publisher_org', 'publisher_dept'):
                table = contact_table(pdocs, cfg_disc['orgs'])
                if not table:
                    rows[it['item']] = miss(it, '담당 부서 표를 찾지 못함')
                    continue
                first = table[0]
                orgs = []
                for t in table:
                    if t['org'] and t['org'] not in orgs:
                        orgs.append(t['org'])
                joint = any('관계부처합동' in norm(line) for p in first['doc']['pages'] for line in p['lines'])
                ext_note = f"게시판(HTTP) {board['http_dept']} · Exa contents {board['exa_dept']}"
                if f == 'publisher_org':
                    val = ('관계부처 합동: ' if joint else '') + '·'.join(orgs)
                    ok = board['org'] in orgs if board['org'] else None
                    rows[it['item']] = evidence_row(
                        policy, it, cfg, checked_at, dataset_value=val, original_value='·'.join(orgs),
                        verdict='SOURCED', basis=None, doc_url=first['doc']['url'],
                        doc_path=first['doc']['path'], locator=locator(first['page']) + ' 담당 부서 표',
                        notes=f"HOME 값 없음 — 첨부 담당 표에서 직접 수집. 게시처 기관 {board['org']} "
                              f"{'포함' if ok else ('없음' if ok is False else '미확인')}")
                else:
                    mine = [t for t in table if t['org'] == board['org']] if board['org'] else table
                    lead = next((t for t in mine if t['lead']), mine[0] if mine else first)
                    bd = board['http_dept'] or board['exa_dept']
                    ok = (lead['dept'] == bd) if bd else None
                    rows[it['item']] = evidence_row(
                        policy, it, cfg, checked_at, dataset_value=lead['dept'], original_value=lead['dept'],
                        verdict='SOURCED', basis=None, doc_url=lead['doc']['url'],
                        doc_path=lead['doc']['path'], locator=locator(lead['page']) + ' 담당 부서 표',
                        notes=f"HOME 값 없음 — 첨부 담당 표의 {lead['org'] or '첫'} 부서({'총괄' if lead['lead'] else '첫 행'})를 직접 수집. "
                              f"게시판 담당부서와 {'같음' if ok else ('다름' if ok is False else '미확인')}: {ext_note}")
        elif it['subject_table'] == 'policy_targets':
            t = it['target']
            if v is None:
                continue  # 값 없는 항목은 표 쪽을 모은 뒤 판정
            y0, y1 = int(t['start'][:4]), int(t['end'][:4])
            hits = table_matches(docs, v, t['areas'], y0, y1, it.get('program_name'), [] if it.get('program_name') else group_names)
            how = '표 칸'
            if not hits and y0 == y1:
                hits, how = year_marker_matches(docs, v, t['areas'], y0), '줄 단위·연도 표시'
            if not hits and y0 != y1:
                labels = region_labels(t['areas'])
                if labels:
                    hits, how = suffix_matches(docs, v, labels, [it['program_name']] if it.get('program_name') else None), '단위 붙은 수'
            if hits:
                h = hits[0]
                if how == '표 칸':
                    table_pages.add((h['doc']['path'], h['page']['page']))
                col = f" · 열 {h['col']}" if h['col'] else ''
                unit = f" · 단위 {h['unit']}" if h['unit'] else ''
                rows[it['item']] = evidence_row(
                    policy, it, cfg, checked_at, verdict='MATCH', basis=basis, dataset_value=v,
                    original_value=h['cell'], **hit_fields(h),
                    notes=f"{how}{col}{unit} · 줄: {h['line']}")
            else:
                rows[it['item']] = miss(it, '표 칸·연도 표시·단위 붙은 수에서 같은 값을 찾지 못함')
        elif it['subject_table'] == 'links':
            name = v or ''
            hits, how = find_text(docs, name), '이름 그대로'
            if not hits:
                hits, how = find_table_label(docs, name), '표 머리말(여러 줄)'
            if not hits:
                hits, how = find_tokens(docs, name, 6), '낱말 순서(6자 이내 간격)'
            if hits:
                # 과제 제목 줄(상자 글리프)에 나온 곳을 먼저 근거로 삼는다.
                d, p, _, quote = min(hits, key=lambda h: (not h[3].startswith(HEAD_MARK), docs.index(h[0]), h[1]['page']))
                pages = sorted({h[1]['page'] for h in hits if h[0] is d})
                hp = it['home_page']
                hp_note = '' if hp is None else (f" · HOME 근거 쪽 {hp} {'일치' if hp in pages else '불일치'}")
                rows[it['item']] = evidence_row(
                    policy, it, cfg, checked_at, verdict='MATCH', basis=basis, dataset_value=quote,
                    original_value=quote, doc_url=d['url'], doc_path=d['path'], locator=locator(p),
                    notes=f"{how} · 이 문서 쪽 {pages[:6]}{hp_note}")
            else:
                rows[it['item']] = miss(it, '이름·표 머리말·낱말 순서 모두 원 파일에 없음(같은 뜻 표기는 판정하지 않음)')

    # 값 없는(HOME 이 '배분 없음'으로 둔) 목표: 같은 정책 목표가 맞은 표에 그 지역 행이 없으면 MATCH.
    for it in items:
        if it['subject_table'] != 'policy_targets' or it['external_value'] is not None:
            continue
        labels = region_labels(it['target']['areas'])
        pages = [(d, p) for d in pdf_docs(docs) for p in d['pages'] if (d['path'], p['page']) in table_pages]
        if not labels or not pages:
            rows[it['item']] = miss(it, '대조할 목표 표가 없음')
            continue
        present = any(row_cells(line)[1] and any(lb in norm(row_cells(line)[0]) for lb in labels)
                      for _, p in pages for line in p['lines'])
        d, p = pages[0]
        if present:
            rows[it['item']] = miss(it, '목표 표에 그 지역 행이 있음 — HOME 값 없음과 맞지 않을 수 있음')
        else:
            rows[it['item']] = evidence_row(
                policy, it, cfg, checked_at, verdict='MATCH', basis=basis_for(it['home_url'], manifest),
                dataset_value=None, original_value=None, doc_url=d['url'], doc_path=d['path'], locator=locator(p),
                notes=f"값 없음 확인: 목표 표에 '{'·'.join(labels)}' 행이 없음")
    return rows


# ---------------------------------------------------------------- 수동 대조(AGENT)·회귀

MANUAL_RULES = [
    (r'^불일치는 아니', 'MATCH'), (r'^불일치', 'MISMATCH'), (r'^수정', 'MISMATCH'),
    (r'^원문에 없음', 'NOT_IN_SOURCE'), (r'^계산값 일치', 'NOT_IN_SOURCE'),
    (r'^(일치|원문에 있음|같은 뜻)', 'MATCH'),
]


def manual_verdict(text):
    t = (text or '').strip()
    for pat, v in MANUAL_RULES:
        if re.search(pat, t):
            return v
    return None


def manual_entries(cfg, items_by_policy):
    """수동 대조 CSV → {item: {verdict, text, locator, doc_path, value, source}}."""
    man = cfg['manual']
    out = {}
    for spec in man['values']:
        rows = read_csv(os.path.join(ROOT, spec['path']))
        for m in spec['rows']:
            r = rows[m['row'] - 1]
            label = r[spec['label_col']]
            if ('label' in m and label != m['label']) or ('label_prefix' in m and not label.startswith(m['label_prefix'])):
                raise SystemExit(f"수동 대응표가 CSV 와 어긋남: {spec['path']} {m['row']}행 '{label}'")
            for item in m['items']:
                out[item] = manual_record(cfg, spec, r, f"{os.path.basename(spec['path'])} {m['row']}행 '{label}'")
    for spec in man['programs']:
        for i, r in enumerate(read_csv(os.path.join(ROOT, spec['path'])), 1):
            pid = spec.get('policy_id') or spec['policy_map'].get(r[spec['policy_col']])
            name = r[spec['name_col']]
            for it in items_by_policy.get(pid, []):
                if it['subject_table'] == 'links' and norm(it['external_value']) == norm(name):
                    out[it['item']] = manual_record(cfg, spec, r, f"{os.path.basename(spec['path'])} {i}행 '{name}'")
    return out


def manual_record(cfg, spec, r, source):
    text = r[spec['verdict_col']]
    loc = r.get(spec['locator_col']) or None
    doc = r.get(spec['file_col']) if spec.get('file_col') else None
    notes = [r[c] for c in spec.get('note_cols', []) if r.get(c)]
    return {
        'verdict': manual_verdict(text), 'text': text, 'source': source,
        'locator': spec['locator_format'].format(loc) if loc else None,
        'doc_path': os.path.join(cfg['manual']['doc_root'], doc) if doc else None,
        'value': r.get(spec['value_col']) or None, 'notes': notes,
    }


MANUAL_DOC_HINTS = [('해명', ('해명',)), ('보도자료', ('보도자료', '보도')), ('안건', ('방안 본문', '안건')),
                    ('총괄표', ('방안 본문', '안건')), ('브리핑', ('브리핑',))]


def manual_doc(m, docs):
    """파일 칸이 없는 수동 대조 행의 근거 원 파일: 위치 글('안건 …'·'보도자료 …'·'해명 …')로 문서를 고르고,
    'PDF N' 이 있으면 그 쪽, 없으면 원문 인용(따옴표 안)을 그 문서에서 찾아 쪽을 정한다. 못 고르면 (None, None)."""
    loc = m['locator'] or ''
    # 위치 글에 먼저 나온 문서 낱말부터(예: '보도자료 … / 해명 …' 이면 보도자료)
    for word, kinds in sorted((h for h in MANUAL_DOC_HINTS if h[0] in loc), key=lambda h: loc.find(h[0])):
        cands = [d for d in pdf_docs(docs) if any(k in d['name'] + ' ' + d['kind'] for k in kinds)]
        cands.sort(key=lambda d: [k in d['name'] + ' ' + d['kind'] for k in kinds].index(True))
        if not cands:
            continue
        d = cands[0]
        pm = re.search(r'PDF\s*(\d+)', loc)
        if pm and int(pm.group(1)) <= len(d['pages']):
            return d, d['pages'][int(pm.group(1)) - 1]
        for q in re.findall(r'["“]([^"”]{4,})["”]', m['value'] or ''):
            hits = find_text([d], q)
            if hits:
                return d, hits[0][1]
        return d, None
    return None, None


def check_evidence_docs(rows):
    """확인 판정(MATCH·MISMATCH·SOURCED·NOT_IN_SOURCE)인데 근거 문서(doc_url·doc_path)가 없는 행 목록."""
    return [r for r in rows if r['verdict'] in ('MATCH', 'MISMATCH', 'SOURCED', 'NOT_IN_SOURCE')
            and not r.get('doc_url') and not r.get('doc_path')]


def apply_manual(cfg, policy, items, rows, manual, docs, manifest):
    """TOOL 이 못 정한 항목(UNVERIFIED)에 수동 대조 판정을 checked_by AGENT 로 옮긴다."""
    url_of = {d['path']: d['url'] for d in docs}
    for a in (al for d in docs for al in d['aliases']):
        url_of.setdefault(a, None)
    for it in items:
        row = rows[it['item']]
        m = manual.get(it['item'])
        if row['verdict'] != 'UNVERIFIED' or not m or not m['verdict']:
            continue
        doc_path, locator_text, verdict = m['doc_path'], m['locator'], m['verdict']
        extra = ''
        if doc_path is None:  # 수동 CSV 에 파일 칸이 없으면 위치 글로 원 파일·쪽을 찾는다
            d, pg = manual_doc(m, docs)
            if d:
                doc_path = d['path']
                locator_text = f"{m['locator']} · {locator(pg)}" if pg else m['locator']
                extra = f" | 근거 문서는 위치 글로 고름{'(쪽은 인용 문구 검색)' if pg and 'PDF' not in (m['locator'] or '') else ''}"
            else:
                verdict = 'UNVERIFIED'
                extra = ' | 근거 원 파일을 정할 수 없어 UNVERIFIED'
        rows[it['item']] = evidence_row(
            policy, it, cfg, (manifest.get('fetched_at') or cfg['manual']['checked_at'])[:10],
            verdict=verdict, basis=basis_for(it['home_url'], manifest) if verdict != 'UNVERIFIED' else None,
            dataset_value=(None if m['verdict'] == 'NOT_IN_SOURCE' else
                           it['external_value'] if m['verdict'] == 'MATCH' and it['external_value'] is not None else m['value']),
            original_value=m['value'], doc_path=doc_path, doc_url=url_of.get(doc_path),
            locator=locator_text, checked_by='AGENT',
            notes=f"수동 대조({m['source']}): {m['text']}" + (f" | {' / '.join(m['notes'])}" if m['notes'] else '') + extra)


def regression(items, tool_rows, manual):
    """자동 판정(TOOL) ↔ 수동 대조 판정 비교."""
    same, diff, tool_only, manual_only = [], [], [], []
    for it in items:
        t = tool_rows[it['item']]
        m = manual.get(it['item'])
        if t['verdict'] == 'UNVERIFIED':
            if m and m['verdict']:
                manual_only.append({'item': it['item'], 'manual': m['verdict']})
            continue
        if not m or not m['verdict']:
            tool_only.append({'item': it['item'], 'tool': t['verdict']})
            continue
        rec = {'item': it['item'], 'tool': t['verdict'], 'manual': m['verdict'], 'manual_text': m['text'][:160],
               'tool_locator': t['locator'], 'manual_locator': m['locator']}
        (same if t['verdict'] == m['verdict'] else diff).append(rec)
    n = len(same) + len(diff)
    return {'compared': n, 'agree': len(same), 'agree_rate': round(len(same) / n, 4) if n else None,
            'disagree': diff, 'tool_only': tool_only, 'manual_fallback': manual_only}


# ---------------------------------------------------------------- 이행 실적 발표(정례브리핑 등)

def policy_markers(text, policies):
    """글에 나온 정책: 정책 이름, 발표일 'M.D'+대책·방안·의, 또는 '대책(M.D, M.D)' 목록."""
    out = []
    for p in policies:
        m, d = int(p['announced'][5:7]), int(p['announced'][8:10])
        md = rf'(?<![\d.]){m}\.\s?{d}(?!\d)'
        pats = [r'\s*'.join(map(re.escape, discover.name_core(p['name']).split())),
                md + r'\s*\)?\s*(의|에서|대책|공급방안|방안)',
                r'(대책|방안)\s*\([\d.,\s]*' + md + r'[\d.,\s]*\)']
        if any(re.search(x, text) for x in pats):
            out.append(p['policy_id'])
    return out


SECTION_RE = re.compile(r'^\s*(\d)\s{2,}\S')
METRIC_WORD_RE = re.compile(r'(목표|실적|전망|계획|완료|착공|분양|공급|입주|모집)')
METRIC_VALUE_RE = re.compile(r'(?<![\d.,~])(\d[\d,]*(?:\.\d+)?)\s*(만호|천호|호|건|%)')
METRIC_LABEL_RE = re.compile(r'^[\s□ㅇ➊-➓§*※◈-]*\(([^)]{1,16})\)')
ASOF_RE = re.compile(r"(~\s*\d{1,2}월(?:\s*\d주)?\*?|\d분기(?:까지)?|연말까지|올해|전망\s*\d{1,2}월|’\d{2}년)")


def report_sections(docs, policies):
    """(doc_path, page, 줄 번호) → {'pols': 그 절에 나온 정책들, 'quote': 정책을 처음 언급한 줄(쪽)}. 절 = '1   제목' 꼴 번호 줄."""
    out = {}
    for d in pdf_docs(docs):
        buf = []

        def flush():
            pol, quote = [], None
            for pg, _, line in buf:
                new = [x for x in policy_markers(line, policies) if x not in pol]
                if new and quote is None:
                    quote = f"{line} (PDF {pg}쪽)"
                pol += new
            for pg, li, _ in buf:
                out[(d['path'], pg, li)] = {'pols': pol, 'quote': quote}
        for p in d['pages']:
            for li, (line, raw) in enumerate(zip(p['lines'], p['raw'])):
                if SECTION_RE.match(raw) and buf:
                    flush()
                    buf = []
                buf.append((p['page'], li, line))
        if buf:
            flush()
    return out


def line_attribution(line, label, sec, policies, page_no):
    """지표·지명 한 줄의 정책 귀속: 줄(또는 꼬리표)에 정책 표기가 있으면 그 정책, 없으면 절에 정책이 하나만 나오면 그 정책,
    절에 여럿이 함께 나오거나 없으면 공통(None)."""
    own = policy_markers(f"{label or ''} {line}", policies)
    if own:
        return own, f"줄: {line} (PDF {page_no}쪽)"
    if sec and len(sec['pols']) == 1:
        return sec['pols'], f"절: {sec['quote']}"
    return None, (f"공통 — 절에 여러 정책: {sec['quote']}" if sec and sec['pols'] else '공통 — 절에 정책 표기 없음')


def extract_progress(report, docs, sections, policies):
    """이행 실적 수치(목표·실적·전망·계획·완료): 단위(만호·천호·호·건·%) 붙은 수와 같은 줄의 지표 낱말·기준 시점.
    행마다 정책 귀속(line_attribution)을 단다. 지명 뒤 괄호 속 수('○○(2.3천호)')는 사업별 값이라 지표로 뽑지 않는다."""
    rows = []
    for d in pdf_docs(docs):
        for p in d['pages']:
            label = None
            for li, line in enumerate(p['lines']):
                lm = METRIC_LABEL_RE.match(line)
                if lm:
                    label = squeeze(lm.group(1))
                if line.startswith(('□', '◈', '➊', '➋', '➌', '➍', '➎')) and not lm:
                    label = None
                vals = [v for v in METRIC_VALUE_RE.finditer(line)
                        if not re.search(r'[가-힣A-Za-z0-9]\s*\(\s*$', line[:v.start()])]
                if not vals or not METRIC_WORD_RE.search(line):
                    continue
                for v in vals:
                    before = [m.group(1) for m in METRIC_WORD_RE.finditer(line[:v.start()])]
                    after = METRIC_WORD_RE.search(line[v.end():])
                    # 값 바로 뒤(8자 안)의 낱말('9.9만호 이상을 착공')이 앞의 낱말보다 우선
                    near = after if after and after.start() <= 8 else None
                    measure = near.group(1) if near else (before[-1] if before else (after.group(1) if after else None))
                    asof = ASOF_RE.search((label or '') + ' ' + line[:v.start()])
                    unit = v.group(2)
                    num = to_number(v.group(1))
                    pa, aq = line_attribution(line, label, sections.get((d['path'], p['page'], li)), policies, p['page'])
                    rows.append({
                        'policy_id': None, 'policy_attribution': pa, 'attribution_quote': aq,
                        'report': report['slug'], 'indicator': label, 'measure': measure,
                        'as_of': squeeze(asof.group(1)).rstrip('*') if asof else None, 'reported_at': (report['posted'] or '')[:10] or None,
                        'value': int(round(num * {'만호': 10000, '천호': 1000}.get(unit, 1))) if unit in ('만호', '천호', '호') else num,
                        'unit': '호' if unit in ('만호', '천호', '호') else unit, 'value_text': squeeze(v.group(0)),
                        'doc_path': d['path'], 'page': p['page'], 'printed_page': p['printed'], 'quote': line,
                        'source': '정례브리핑' if '정례브리핑' in report['slug'] else report['slug'],
                    })
    return rows


def progress_list(cfg_disc):
    path = os.path.join(cfg_disc['_cache_dir'], 'progress_reports.json')
    return load_json(path)['items'] if os.path.exists(path) else []


# ---------------------------------------------------------------- M4 누락 검증(01 정책, 원문 → 데이터셋)

HEADLINE_LINES = 8
GAP_LABEL = {'MISSING': '누락 확정', 'OUT_OF_SCOPE': '범위 밖', 'ALREADY_PRESENT': '이미 있음', 'PENDING': '판단 보류'}
PAST_RE = re.compile(r'(실적|했고|했으며|하였|지난|과거|평균|당초|대비|기존|現)')


def gap_row(policy, gap_type, verdict, reason, value, checked_at, doc=None, page=None, quote=None, matched=None,
            source='ORIGINAL', locator_text=None, doc_url=None):
    return {
        'policy_id': policy['policy_id'], 'stage_code': '01', 'gap_type': gap_type, 'source': source,
        'candidate_value': value, 'doc_url': doc_url if doc_url is not None else (doc or {}).get('url'),
        'doc_path': (doc or {}).get('path'), 'locator': locator_text or (locator(page) if page else None),
        'quote': quote, 'verdict': verdict, 'verdict_label': GAP_LABEL[verdict], 'reason': reason,
        'matched_ref': matched, 'checked_by': 'TOOL', 'checked_at': checked_at,
    }


def dataset_view(cfg, policy, items):
    """데이터셋(원장·HOME) 쪽: 목표 값, 연결 프로그램 이름, 이 정책 프로그램에 걸린 사업 이름, 원장 전체 사업 이름."""
    ledger = os.path.join(ROOT, cfg['home']['ledger_dir'])
    links = load_json(os.path.join(ledger, 'links.json'))['rows']
    projects = {r['local_project_id']: r['project_name'] for r in load_json(os.path.join(ledger, 'projects.json'))['rows']}
    progs = {it['external_ref']: it['external_value'] for it in items if it['subject_table'] == 'links'}
    linked = {r['to_local_id'] for r in links if r['link_type'] == 'PROGRAM_PROJECT' and r['from_local_id'] in progs}
    values = {it['external_value'] for it in items if it['field'] in ('target_units',) and it['external_value']}
    return {'values': values, 'programs': progs,
            'projects': {pid: projects.get(pid) or '' for pid in sorted(linked)}, 'all_projects': projects}


def name_keys(name):
    """이름 대조 키들: 그대로, 괄호 뗀 것, 괄호 속, 끝의 '인근·일대·주변' 뗀 것."""
    base = [name or '', re.sub(r'\([^)]*\)', ' ', name or '')] + re.findall(r'\(([^)]+)\)', name or '')
    w = (name or '').split()
    while w and (re.fullmatch(r'[△▲]?\d+기', w[0]) or norm(w[0]).lstrip('△▲') in CATEGORY_WORDS):
        w = w[1:]  # 앞의 묶음 낱말('3기 신도시 ○○')
    base.append(' '.join(w))
    base.append(re.sub(r'(공공주택지구|택지개발지구|도시개발구역|지구)', ' ', name or ''))  # '○○ 공공주택지구 A1' ↔ '○○ A1'
    keys = set()
    for b in base:
        k = re.sub(r'(인근|일대|일원|주변)$', '', site_key(b))
        if len(k) >= 3:
            keys.add(k)
    return keys


def name_match(a, names):
    """대조 키가 같거나 한쪽이 다른 쪽을 품으면(3자 이상) 그 id."""
    ka = name_keys(a)
    for pid, nm in names.items():
        for kb in name_keys(nm):
            if any(x == kb or x in kb or kb in x for x in ka):
                return pid
    return None


# 프로그램 이름 겹침을 셀 때 빼는 흔한 낱말(이것만 겹치면 같은 프로그램이 아니다).
PROGRAM_GENERIC = set('공급 주택 주택공급 확대 활성화 추진 활용 제고 사업 조성 지원 도입 개선 신속 수도권 통한 위한 모델 정비'.split())


def program_match(name, progs):
    """(프로그램 id, 점수). 이름이 같거나 한쪽이 다른 쪽을 품으면 1.0, 아니면 낱말 겹침(포함 관계도 겹침으로 셈) 비율."""
    def toks(x):
        return [norm(t) for t in re.split(r'[\s·ㆍ,]+', x or '') if len(norm(t)) >= 2 and norm(t) not in PROGRAM_GENERIC]
    n, ta = norm(name), toks(name)
    best, score = None, 0.0
    for pid, nm in sorted(progs.items()):
        m, tb = norm(nm or ''), toks(nm)
        if n == m or (len(m) >= 4 and (m in n or n in m)):
            return pid, 1.0
        hit = sum(1 for a in ta if any(a in b or b in a for b in tb))
        j = hit / (len(ta) + len(tb) - hit) if ta and tb else 0.0
        if j > score:
            best, score = pid, j
    return best, score


def target_candidates(docs, programs, headline=False):
    """원문 목표 후보: 요약 기호(◈·◇) 줄과 공급 과제 제목의 목표 문구에 나온 단위 붙은 수(100호 이상).
    headline 이면 보도자료 1쪽 머리(제목·부제, 앞 headline_lines 줄)도 본다(후속 발표용)."""
    out, seen = [], set()
    for d in pdf_docs(docs):
        for p in d['pages']:
            for li, line in enumerate(p['lines']):
                head = headline and p['page'] == 1 and li < HEADLINE_LINES and not line.startswith(('보도', '배포'))
                if not line.startswith(('◈', '◇')) and not head:
                    continue
                for v, raw, _ in suffixed_numbers(line):
                    if v >= 100 and (v, norm(line)) not in seen:
                        seen.add((v, norm(line)))
                        out.append((v, raw, line, d, p))
    by_path = {d['path']: d for d in docs}
    for r in programs:
        if r.get('program_kind') == 'SUPPLY' and r.get('target_text'):
            d = by_path.get(r['doc_path'])
            pg = next(p for p in d['pages'] if p['page'] == r['page'])
            for v, raw, _ in suffixed_numbers(r['target_text']):
                if v >= 100 and (v, norm(r['quote'])) not in seen:
                    seen.add((v, norm(r['quote'])))
                    out.append((v, raw, r['quote'], d, pg))
    return out


def judge_target(v, raw, line, ds):
    if any(same_units(v, x) for x in ds['values']):
        return 'ALREADY_PRESENT', '원장·HOME 목표에 같은 호수가 있음'
    if PAST_RE.search(line):
        return 'OUT_OF_SCOPE', '실적·현황·비교 서술(목표 아님)'
    after = line[line.find(raw) + len(raw):][:3]
    if '+' in after or 'α' in after or '이상' in after or '~' in raw:
        return 'PENDING', '하한·범위 표기(+α·이상·~) — 목표로 넣을 값을 사람이 정해야 함'
    return 'MISSING', '원장 policy_targets·HOME 목표에 없음'


def block_filter(r, names):
    """지명에 블록 번호가 있으면 같은 블록 번호가 이름에 든 사업만 대조 대상으로(다른 블록에 잘못 잇지 않게)."""
    if not r.get('block'):
        return names
    b = norm(r['block']).replace('-', '').lower()
    return {k: v for k, v in names.items() if b in norm(v or '').replace('-', '').lower()}


def judge_site(r, ds):
    if r['site_kind'] != 'SITE':
        return 'OUT_OF_SCOPE', None, f"{r['site_kind']} — 개별 지명 아님(묶음·주택 유형·서수)"
    pid = name_match(r['site_name'], block_filter(r, ds['projects']))
    if pid:
        return 'ALREADY_PRESENT', pid, '이 정책 프로그램에 연결된 사업 이름과 같음'
    pid = name_match(r['site_name'], block_filter(r, ds['all_projects']))
    if pid:
        return 'PENDING', pid, '원장에 같은 이름 사업이 있으나 이 정책과 연결 안 됨(02 사업화에서 확인)'
    return 'MISSING', None, '원장 사업·정책 연결에 없음'


def followup_sites(cfg, policy, f):
    """후속 발표 원문의 지명 → 부모 정책 policy_sites 행(candidate_source FOLLOWUP_*, notes 에 후속 발표 폴더)."""
    fdocs, _ = load_docs(cfg, {'docs_dir': f['docs_dir']})
    fsites = extract_sites(policy, fdocs, {})
    _, heads, hsites, _ = extract_programs(policy, fdocs, {norm(r['site_name']) for r in fsites})
    out, seen = [], set()
    for r in merge_sites(fsites, hsites):
        k = (site_key(r['site_name']), r['units'])
        if k in seen:
            continue
        seen.add(k)
        r['candidate_source'] = 'FOLLOWUP_' + r['candidate_source']
        r['program_name'] = heads.get((r['doc_path'], r['page']))
        r['notes'] = (r['notes'] + ' | ' if r['notes'] else '') + f"후속 발표 {f['slug']}"
        out.append(r)
    return out


def build_gaps(cfg, cfg_disc, policy, docs, manifest, items, programs, sites, followups, checked_at, followup_sites_of,
               reports=(), report_sites=None, progress=(), report_common=None):
    ds = dataset_view(cfg, policy, items)
    rows = []
    # (i) 목표
    for v, raw, line, d, p in target_candidates(docs, programs):
        verdict, reason = judge_target(v, raw, line, ds)
        rows.append(gap_row(policy, 'TARGET', verdict, reason, raw, checked_at, d, p, line))
    # (i) 프로그램(SUPPLY)
    for r in programs:
        if r.get('program_kind') != 'SUPPLY':
            continue
        pid, score = program_match(r['program_name'], ds['programs'])
        d = next(x for x in docs if x['path'] == r['doc_path'])
        pg = next(x for x in d['pages'] if x['page'] == r['page'])
        if score >= 0.5:
            verdict, reason = 'ALREADY_PRESENT', f"연결 프로그램 '{ds['programs'][pid]}' 과 이름이 맞음({score:.2f})"
        elif score >= 0.3:
            verdict, reason = 'PENDING', f"비슷한 연결 프로그램 '{ds['programs'][pid]}' 있음({score:.2f}) — 같은 것인지 사람이 확인"
        else:
            verdict, reason, pid = 'MISSING', '원장 POLICY_PROGRAM 연결에 없음', None
        rows.append(gap_row(policy, 'PROGRAM', verdict, reason, r['program_name'], checked_at, d, pg, r['quote'], pid))
    # (i) 지명
    for r in sites:
        verdict, pid, reason = judge_site(r, ds)
        d = next(x for x in docs if x['path'] == r['doc_path'])
        pg = next(x for x in d['pages'] if x['page'] == r['page'])
        rows.append(gap_row(policy, 'SITE', verdict, reason, r['site_name'] + (f" {r['units']}호" if r['units'] else ''),
                            checked_at, d, pg, r['quote'], pid))
    # (ii) 원문 첨부·해명·관련 문서
    fu = discover.load_json(os.path.join(cfg_disc['_cache_dir'], cfg['followups_summary'])) if os.path.exists(
        os.path.join(cfg_disc['_cache_dir'], cfg['followups_summary'])) else {'attachments': {}, 'clarifications': {}, 'followups': []}
    have = {norm(f['filename']) for f in (manifest.get('files') or {}).values()}
    mtext = json.dumps(manifest, ensure_ascii=False)
    for a in fu['attachments'].get(policy['policy_id'], []):
        ok = norm(a['name']) in have
        rows.append(gap_row(policy, 'ATTACHMENT', 'ALREADY_PRESENT' if ok else 'MISSING',
                            '원 파일 받음(manifest)' if ok else '원 게시물 첨부를 받지 않음', a['name'], checked_at,
                            doc_url=a['url'], locator_text='원 게시물 첨부'))
    for c in fu['clarifications'].get(policy['policy_id'], []):
        ok = c['url'] in mtext
        rows.append(gap_row(policy, 'CLARIFICATION', 'ALREADY_PRESENT' if ok else 'MISSING',
                            '해명 첨부를 받음(manifest)' if ok else '해명·설명자료를 받지 않음', c['title'], checked_at,
                            doc_url=c['url'], locator_text=f"{c['kind']} {c['date']}"))
    for u in confirmed_record(cfg_disc, policy)['related_briefings']:
        rows.append(gap_row(policy, 'RELATED_DOC', 'OUT_OF_SCOPE', '브리핑 속기본 — 보도자료·안건·참고·해명이 아님', u,
                            checked_at, doc_url=u, locator_text='정책브리핑 브리핑'))
    disc = discover.load_json(os.path.join(discover.ROOT, cfg_disc['discovered_file']))
    day = dt.date.fromisoformat(policy['announced'])
    for c in disc['candidates']:
        if c.get('kind') == 'FOLLOWUP' or not c.get('posted'):
            continue
        if abs((dt.date.fromisoformat(c['posted'][:10]) - day).days) <= 1:
            rows.append(gap_row(policy, 'RELATED_DOC', 'PENDING',
                                f"발표일 ±1일 다른 기관 보도자료({c['publisher_org']}) — 같은 정책의 관계부처 원문인지 사람이 확인",
                                c['title'], checked_at, doc_url=c['canonical_url'] or c['repost_urls'][0],
                                locator_text='P0 발견 후보'))
    # (iii) 후속 발표: 발표 자체(원 파일을 받았으면 resolution ACQUIRED '확보함')와 그 원문의 목표·지명
    for f in followups:
        fdocs, fman = load_docs(cfg, {'docs_dir': f['docs_dir']})
        r0 = gap_row(policy, 'FOLLOWUP_RELEASE', 'MISSING', '원장 policies·links 에 후속 발표가 없음',
                     f['title'], checked_at, doc_url=f['url'], locator_text=f"후속 발표 {f['posted_at']}", source=f['slug'])
        r0['parent_basis'] = f.get('parent_basis')
        if fman.get('files'):
            r0['resolution'], r0['resolution_label'] = 'ACQUIRED', '확보함'
            r0['doc_path'] = f['docs_dir']
        rows.append(r0)
        for v, raw, line, d, p in target_candidates(fdocs, [], headline=True):
            verdict, reason = judge_target(v, raw, line, ds)
            rows.append(gap_row(policy, 'FOLLOWUP_TARGET', verdict, reason, raw, checked_at, d, p, line, source=f['slug']))
        for r in followup_sites_of.get(f['slug'], []):
            verdict, pid, reason = judge_site(r, ds)
            pa = r.get('policy_attribution')
            if pa and policy['policy_id'] not in pa:
                verdict, pid, reason = 'OUT_OF_SCOPE', None, f"다른 정책 귀속 — {r['attribution_quote']}"
            d = next(x for x in fdocs if x['path'] == r['doc_path'])
            pg = next(x for x in d['pages'] if x['page'] == r['page'])
            rows.append(gap_row(policy, 'FOLLOWUP_SITE', verdict, reason,
                                r['site_name'] + (f" {r['units']}호" if r['units'] else ''), checked_at, d, pg,
                                r['quote'], pid, source=f['slug']))
    # (iii) 이행 실적 공식 발표: 발표 자체(확보함), 실적 수치, 사업(지명)
    for rep_ in reports:
        r0 = gap_row(policy, 'PROGRESS_REPORT', 'MISSING', '원장에 이 정책의 이행 실적 발표가 없음', rep_['title'],
                     checked_at, doc_url=rep_['url'], locator_text=f"이행 실적 발표 {rep_['posted']}", source=rep_['slug'])
        r0['resolution'], r0['resolution_label'], r0['doc_path'] = 'ACQUIRED', '확보함', rep_['docs_dir']
        rows.append(r0)
    by_path = {}
    for r in progress:
        if r['doc_path'] not in by_path:
            by_path[r['doc_path']] = {'path': r['doc_path'], 'url': None}
        present = r['unit'] == '호' and any(same_units(r['value'], x) for x in ds['values'])
        rows.append(gap_row(policy, 'PROGRESS_METRIC', 'ALREADY_PRESENT' if present else 'MISSING',
                            '원장·HOME 목표에 같은 호수가 있음' if present else '원장에 이행 실적(목표·실적·전망) 값이 없음',
                            f"{r['indicator'] or ''} {r['measure'] or ''} {r['value_text']}".strip(), checked_at,
                            by_path[r['doc_path']], None, r['quote'], source=r['report'],
                            locator_text=f"PDF {r['page']}쪽" + (f" · 인쇄 {r['printed_page']}쪽" if r['printed_page'] else '')))
    for slug, rs in (report_common or {}).items():
        if rs:  # 여러 정책 공통 지표는 행마다가 아니라 공통 항목 하나로
            rows.append(gap_row(policy, 'PROGRESS_METRIC', 'OUT_OF_SCOPE',
                                f'정책 공통 지표 {len(rs)}개(절에 여러 정책이 함께 나오거나 정책 표기 없음) — '
                                f'_work/reference/progress_common.jsonl', f'정책 공통 지표 {len(rs)}개', checked_at,
                                {'path': rs[0]['doc_path'], 'url': None}, None, None, source=slug, locator_text='정책 브리프 전체'))
    for slug, rs in (report_sites or {}).items():
        for r in rs:
            verdict, pid, reason = judge_site(r, ds)
            rows.append(gap_row(policy, 'PROGRESS_SITE', verdict, reason,
                                r['site_name'] + (f" {r['units']}호" if r['units'] else ''), checked_at,
                                {'path': r['doc_path'], 'url': None}, None, r['quote'], pid, source=slug,
                                locator_text=f"PDF {r['page']}쪽"))
    return rows


def write_gaps(path, rows):
    """gaps.jsonl 은 단계 작업자가 함께 쓴다: 01 이 아닌 행은 그대로 두고 01 행만 바꾼다."""
    keep = []
    if os.path.exists(path):
        keep = [json.loads(x) for x in open(path, encoding='utf-8') if x.strip()]
        keep = [r for r in keep if r.get('stage_code') != '01']
    write_jsonl(path, keep + rows)


def gap_report(cfg, all_gaps, followups):
    """사람이 읽는 누락 검증 요약(01 정책)."""
    out = ['# 누락 검증 01 정책 (원문 → 데이터셋)', '',
           '`tools/research/chain/policy.py` 가 만든다(손으로 고치지 않는다). 행 단위 근거는 '
           '`docs/speech/research/dataset/_work/<policy_id>/gaps.jsonl`(stage_code "01").', '',
           '판정: 누락 확정 · 범위 밖 · 이미 있음 · 판단 보류. 판정은 규칙(TOOL)이 낸 것이고 사람이 확인하지 않았다.', '']
    types = ['TARGET', 'PROGRAM', 'SITE', 'ATTACHMENT', 'CLARIFICATION', 'RELATED_DOC',
             'FOLLOWUP_RELEASE', 'FOLLOWUP_TARGET', 'FOLLOWUP_SITE']
    for pid, rows in all_gaps.items():
        out += [f'## {pid}', '', '| 종류 | ' + ' | '.join(GAP_LABEL.values()) + ' | 합계 |', '|---|---|---|---|---|---|']
        for t in types:
            rs = [r for r in rows if r['gap_type'] == t]
            if rs:
                cnt = [sum(1 for r in rs if r['verdict'] == v) for v in GAP_LABEL]
                out.append(f'| {t} | ' + ' | '.join(map(str, cnt)) + f' | {len(rs)} |')
        miss = [r for r in rows if r['verdict'] in ('MISSING', 'PENDING') and r['gap_type'] not in ('FOLLOWUP_RELEASE',)]
        out += ['', f'누락 확정·판단 보류 {len(miss)}건(앞 {cfg["report_max_rows"]}건):', '']
        for r in miss[:cfg['report_max_rows']]:
            where = f"{os.path.basename(r['doc_path'] or r['doc_url'] or '')} {r['locator'] or ''}".strip()
            out.append(f"- [{r['verdict_label']}] {r['gap_type']} `{r['candidate_value']}` — {r['reason']} ({where})")
        out.append('')
    out += ['## 받은 후속 발표', '', '| 게시일 | 부모 정책 | 폴더 | 제목 |', '|---|---|---|---|']
    for f in followups:
        out.append(f"| {f['posted_at']} | {', '.join(f['parents'])} | `{f['slug']}` | {f['title']} |")
    return redact('\n'.join(out)) + '\n'


# ---------------------------------------------------------------- 실행

REDACT_KEYS = ('quote', 'notes', 'definition', 'original_value', 'target_text', 'reason', 'parent_basis')


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        for r in rows:
            r = {k: (redact(v) if k in REDACT_KEYS and isinstance(v, str) else v) for k, v in r.items()}
            if isinstance(r.get('conditions'), dict):
                r['conditions'] = {k: redact(v) for k, v in r['conditions'].items()}
            f.write(json.dumps(r, ensure_ascii=False, sort_keys=False) + '\n')


def run_policy(cfg, cfg_disc, policy, checked_at, manual):
    docs, manifest = load_docs(cfg, policy)
    items = home_items(cfg, policy)
    tool = judge(cfg, cfg_disc, policy, docs, manifest, items, checked_at)
    rows = dict(tool)
    apply_manual(cfg, policy, items, rows, manual, docs, manifest)
    reg = regression(items, tool, manual)
    out_dir = os.path.join(ROOT, cfg['work_dir'], policy['policy_id'])
    evidence = [rows[it['item']] for it in items]
    sites = extract_sites(policy, docs, {})
    programs, heads, head_sites, dropped = extract_programs(policy, docs, {norm(r['site_name']) for r in sites})
    for r in sites:
        r['program_name'] = heads.get((r['doc_path'], r['page']))
    sites = merge_sites(sites, head_sites)
    exa_p, exa_s = exa_candidates(cfg_disc, policy, docs, programs, sites)
    followups = [f for f in followup_list(cfg, cfg_disc) if policy['policy_id'] in f['parents']]
    fu_sites = {f['slug']: followup_sites(cfg, policy, f) for f in followups}
    own_sites = list(sites)
    for f in followups:
        sites.extend(fu_sites[f['slug']])
    progress, report_sites, reports_used, report_common = [], {}, [], {}
    policies_all = load_json(os.path.join(ROOT, cfg_disc['policies_file']))['policies']
    for rep_ in progress_list(cfg_disc):
        rdocs, _ = load_docs(cfg, {'docs_dir': rep_['docs_dir']})
        if rep_.get('metric_docs_regex'):  # 실적 수치·사업은 지정한 첨부(예: 정책 브리프)에서만 뽑는다
            rdocs = [d for d in rdocs if re.search(rep_['metric_docs_regex'], d['name'])]
        secs = report_sections(rdocs, policies_all)
        related = [r['policy_id'] for r in rep_['related']]
        allprog = extract_progress(rep_, rdocs, secs, policies_all)
        prog = [dict(r, policy_id=policy['policy_id']) for r in allprog if r['policy_attribution'] and policy['policy_id'] in r['policy_attribution']]
        common_prog = [r for r in allprog if not r['policy_attribution']] if policy['policy_id'] in related else []
        line_of = {(d['path'], p['page']): p['lines'] for d in rdocs for p in d['pages']}
        rs = []
        for r in extract_sites(policy, rdocs, {}):
            li = next((i for i, l in enumerate(line_of[(r['doc_path'], r['page'])]) if l == r['quote']), 0)
            pa, aq = line_attribution(r['quote'], None, secs.get((r['doc_path'], r['page'], li)), policies_all, r['page'])
            if (pa and policy['policy_id'] in pa) or (not pa and policy['policy_id'] in related):
                r['policy_attribution'], r['attribution_quote'] = pa, aq
                rs.append(r)
        for r in rs:
            r['candidate_source'] = '정례브리핑' if '정례브리핑' in rep_['slug'] else rep_['slug']
            r['notes'] = (r['notes'] + ' | ' if r['notes'] else '') + f"이행 실적 발표 {rep_['slug']}"
        if prog or rs or policy['policy_id'] in [r['policy_id'] for r in rep_['related']]:
            reports_used.append(rep_)
        progress += prog
        report_common[rep_['slug']] = common_prog
        report_sites[rep_['slug']] = rs
        sites.extend(rs)
    for r in sites:
        pa = r.get('policy_attribution')
        r['attribution_status'] = ('귀속' if pa and policy['policy_id'] in pa else '다른 정책 귀속' if pa else '공통')
    annotate_duplicate_sites(sites)
    gaps = build_gaps(cfg, cfg_disc, policy, docs, manifest, items, programs, own_sites, followups, checked_at, fu_sites,
                      reports_used, report_sites, progress, report_common)
    for r in sites:
        r.pop('_unit_text', None)
        r.pop('_precise', None)
        r.pop('region', None)
    write_gaps(os.path.join(out_dir, 'gaps.jsonl'), gaps)
    write_jsonl(os.path.join(out_dir, 'policy_progress.jsonl'), progress)
    bad = check_evidence_docs(evidence)
    if bad:
        raise SystemExit(f"{policy['policy_id']}: 확인 판정인데 근거 문서가 없는 행 {len(bad)}개 — "
                         + ', '.join(f"{r['subject_id']}#{r['field']}" for r in bad[:5]))
    write_jsonl(os.path.join(out_dir, 'evidence_policy.jsonl'), evidence)
    write_jsonl(os.path.join(out_dir, 'policy_programs.jsonl'), programs)
    write_jsonl(os.path.join(out_dir, 'policy_sites.jsonl'), sites)
    counts = {}
    for r in evidence:
        k = f"{r['checked_by']}:{r['verdict']}"
        counts[k] = counts.get(k, 0) + 1
    summary = {
        'policy_id': policy['policy_id'], 'items': len(items), 'evidence_rows': len(evidence),
        'by_table': {t: sum(1 for it in items if it['subject_table'] == t) for t in ('policies', 'policy_targets', 'links')},
        'verdicts': dict(sorted(counts.items())), 'regression': reg,
        'programs': len(programs), 'program_kinds': {k: sum(1 for r in programs if r.get('program_kind') == k) for k in ('SUPPLY', 'MEASURE')},
        'sites': len(sites), 'site_kinds': {k: sum(1 for r in sites if r['site_kind'] == k) for k in ('SITE', 'AGGREGATE', 'NOT_SITE')},
        'heading_sites': len(head_sites), 'dropped_headings': dropped,
        'progress_rows': len(progress), 'report_sites': {k: len(v) for k, v in report_sites.items()},
        'gaps': {t: {v: sum(1 for g in gaps if g['gap_type'] == t and g['verdict'] == v) for v in GAP_LABEL}
                 for t in sorted({g['gap_type'] for g in gaps})},
        'exa_added': {'programs': exa_p, 'sites': exa_s},
        'docs': [{'path': d['path'], 'sha256': d['sha256'], 'format': d['format'],
                  'used_for_gate': d['format'] == 'PDF', 'aliases': d['aliases']} for d in docs],
    }
    with open(os.path.join(out_dir, 'regression_policy.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    summary['_gaps'] = gaps
    summary['_common_progress'] = [r for rs in report_common.values() for r in rs]
    return summary


def followup_list(cfg, cfg_disc):
    path = os.path.join(cfg_disc['_cache_dir'], cfg['followups_summary'])
    return load_json(path)['followups'] if os.path.exists(path) else []


def build_reference(cfg, cfg_disc):
    """참고 발표 묶음(discovery.json reference_sets) → _work/reference/<out_name>: 후보지 이름·시군구·호수·차수·쪽·quote.
    정책 policy_sites 가 아니라 프로그램 조건 대조용 속성 원천이다."""
    out_counts = {}
    for ref in cfg_disc.get('reference_sets', []):
        idx_path = os.path.join(ROOT, cfg_disc['followup']['docs_root'], ref['slug'], 'manifest.json')
        if not os.path.exists(idx_path):
            continue
        rows, seen = [], set()
        for it in load_json(idx_path)['items']:
            docs, _ = load_docs(cfg, {'docs_dir': it['docs_dir']})
            rnd = re.search(r'(\d+)\s*차', it['title'] or '')
            pages = {(d['path'], p['page']): p['lines'] for d in pdf_docs(docs) for p in d['pages']}
            for r in extract_sites({'policy_id': None}, docs, {}):
                # 표·카드에서 읽은 행만(문장 속 수치는 지명 오인이 많다)
                if r['candidate_source'] not in ('RULE_TABLE', 'RULE_CARD') or r['site_kind'] != 'SITE' or r['units'] is None:
                    continue
                name, region = r['site_name'], (r.get('region') or '').split()
                # 표 칸이 어긋나 '동측'·'인근'만 이름 칸에 남은 경우: 지역 칸 뒤쪽 낱말을 이름 앞에 붙인다
                if re.match(r'^(동측|서측|남측|북측|인근|주민센터)', name) and len(region) > 1:
                    name, region = ' '.join(region[1:] + [name]), region[:1]
                name = ' '.join(w for w in name.split() if not re.fullmatch(r'\d+차|저층주거|역세권|준공업', w))
                k = site_key(name)
                if k in seen:  # 같은 후보지는 처음 발표된 것 하나만(뒤 발표의 누계 표 반복)
                    continue
                seen.add(k)
                round_no, round_src = (int(rnd.group(1)), '제목') if rnd else (None, None)
                if round_no is None:  # 제목에 차수가 없으면 같은 쪽 표 제목('○차 후보지', 글자 순서가 깨진 것 포함)
                    cap = ' '.join(pages.get((r['doc_path'], r['page']), [])[:40])
                    mm = re.search(r'(\d+)\s*차\s*후보지', cap) or re.search(r'차\s*후보지[^\d⟫]{0,30}(\d+)\s*⟫', cap)
                    if mm:
                        round_no, round_src = int(mm.group(1)), '쪽 표 제목'
                rows.append({
                    'reference': ref['slug'], 'site_name': name,
                    'sigungu': ' '.join(region) or r['sido'], 'units': r['units'],
                    'round': round_no, 'round_source': round_src, 'announced': (it['posted'] or '')[:10] or None,
                    'source_title': it['title'], 'source_url': it['url'], 'doc_path': r['doc_path'], 'page': r['page'],
                    'printed_page': r['printed_page'], 'quote': r['quote'], 'candidate_source': r['candidate_source'],
                    'notes': r['notes'],
                })
        path = os.path.join(ROOT, cfg['work_dir'], 'reference', ref['out_name'])
        write_jsonl(path, rows)
        out_counts[ref['slug']] = len(rows)
    return out_counts


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--policy', action='append', help='정책 id(여러 번). 없으면 policies.json 전부')
    ap.add_argument('--checked-at', default=None,
                    help='TOOL 판정 날짜. 없으면 config/stage_sources.json 의 checked_at(실행 시각을 쓰지 않는다)')
    a = ap.parse_args(argv)
    cfg = load_json(os.path.join(CONF_DIR, 'policy_inputs.json'))
    NAME_NORMALIZE.update(cfg.get('name_normalize', {}))
    POLICIES.extend(load_json(os.path.join(ROOT, discover.load_config()['policies_file']))['policies'])
    if a.checked_at is None:
        a.checked_at = load_json(os.path.join(CONF_DIR, 'stage_sources.json'))['checked_at']
    cfg_disc = discover.load_config()
    policies = load_json(os.path.join(ROOT, cfg_disc['policies_file']))['policies']
    if a.policy:
        policies = [p for p in policies if p['policy_id'] in a.policy]
    items_by_policy = {p['policy_id']: home_items(cfg, p) for p in policies}
    manual = manual_entries(cfg, items_by_policy)
    all_gaps, common_rows = {}, {}
    for p in policies:
        s = run_policy(cfg, cfg_disc, p, a.checked_at, manual)
        all_gaps[p['policy_id']] = s.pop('_gaps')
        for r in s.pop('_common_progress'):
            common_rows.setdefault((r['doc_path'], r['page'], r['quote'], r['value_text']), r)
        r = s['regression']
        print(f"{p['policy_id']}: 항목 {s['items']} (정책 {s['by_table']['policies']} · 목표 {s['by_table']['policy_targets']} · 연결 {s['by_table']['links']})"
              f" | {s['verdicts']} | 수동 대조 일치 {r['agree']}/{r['compared']} | 다른 행 {len(r['disagree'])}"
              f" | 과제 {s['programs']} · 지명 {s['sites']} (Exa 더함 {s['exa_added']})")
        for x in r['disagree']:
            print(f"   다름 {x['item']}: TOOL {x['tool']} ↔ 수동 {x['manual']} ({x['manual_text'][:60]})")
        print(f"   지명 {s['site_kinds']} | 누락 후보 {sum(sum(v.values()) for v in s['gaps'].values())}: {s['gaps']}")
    if not a.policy:
        write_jsonl(os.path.join(ROOT, cfg['work_dir'], 'reference', 'progress_common.jsonl'),
                    [common_rows[k] for k in sorted(common_rows, key=lambda k: (k[0], k[1], k[2], k[3]))])
        print('참고 원천:', build_reference(cfg, cfg_disc))
        with open(os.path.join(ROOT, cfg['gap_report']), 'w', encoding='utf-8') as f:
            f.write(gap_report(cfg, all_gaps, followup_list(cfg, cfg_disc)))


if __name__ == '__main__':
    main()
