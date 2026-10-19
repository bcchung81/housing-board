"""공통 도구: 경로·설정 읽기, 출력 쓰기(개인정보 지움), 이름·블록·지구·날짜 정규화, 칸별 대조 판정.

정책 고유 값(정책 id·날짜·slug·URL·사업명)은 여기에 두지 않는다. 정책은 config/policies.json, 원천은 config/stage_sources.json.
"""

import csv
import hashlib
import json
import os
import re

CHAIN_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(CHAIN_DIR, '..', '..', '..'))
CONFIG_DIR = os.path.join(CHAIN_DIR, 'config')


def p(path):
    """저장소 상대 경로 → 절대 경로."""
    return os.path.join(ROOT, path)


def load_config(name, config_dir=None):
    with open(os.path.join(config_dir or CONFIG_DIR, name), encoding='utf-8') as f:
        return json.load(f)


# ---------------------------------------------------------------- 판정 값

VERDICTS = ['일치', '불일치', '원천값 수집', '비교 불가', '원본에서 못 찾음', '원본 칸 비어 있음', '미도달 확인', '수집 범위 밖', '원본 없음', '근거없음']
NATURES = ['존재 확인', '같은 원천 재확인', '독립 원천 대조', '규칙 파생', '']
STATUS_KO = {'CONFIRMED': '확정', 'REVIEW': '검토', 'UNMATCHED': '미연결'}
STATUS_ORDER = {'확정': 0, '검토': 1, '미연결': 2, '근거없음': 3}
VERDICT_ORDER = {'일치': 0, '불일치': 0, '원천값 수집': 1, '비교 불가': 1, '원본에서 못 찾음': 1, '원본 칸 비어 있음': 1, '미도달 확인': 1, '수집 범위 밖': 2,
                 '원본 없음': 2, '근거없음': 3}
# 설계 5.2 의 verdict·basis 로 옮기는 표
VERDICT_EN = {'일치': 'MATCH', '불일치': 'MISMATCH', '원천값 수집': 'SOURCED', '원본에서 못 찾음': 'NOT_IN_SOURCE', '원본 칸 비어 있음': 'NOT_IN_SOURCE',
              '미도달 확인': 'ABSENT_CONFIRMED', '수집 범위 밖': 'OUT_OF_SCOPE', '원본 없음': 'NO_ORIGINAL', '비교 불가': 'UNVERIFIED', '근거없음': 'UNVERIFIED'}
BASIS_EN = {'존재 확인': 'EXISTENCE', '같은 원천 재확인': 'SAME_SOURCE', '독립 원천 대조': 'INDEPENDENT', '규칙 파생': 'RULE', '': None}
NAME_MATCH = '(HOME 연결 없음: 이름 대조)'
INDEP = '(HOME 연결 없음: 독립 수집)'  # 사업 위치·식별자로 권위 원천을 직접 찾은 행(stages/independent.py)
CANDIDATE_TABLES = (NAME_MATCH, INDEP)  # HOME 이 잇지 않은 행: 추적표 대표·'HOME 근거 있음' 판단에서 뺀다
NO_EXTERNAL = '외부 입력 없음, 원천값 수집'
CONFIRMED_VERDICTS = ('MATCH', 'MISMATCH', 'SOURCED', 'NOT_IN_SOURCE', 'ABSENT_CONFIRMED')  # 설계 1절 M1 '확인됨'(basis ≠ EXISTENCE)

# ---------------------------------------------------------------- 개인정보 지움·쓰기

PHONE_RE = re.compile(r'(?<![\d.])(0\d{1,2}[-)] ?\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4})(?![\d])')
ACTORS = set()


def collect_actors(o):
    """덤프 레코드의 actor 값(담당자 이름)을 모은다. 출력 전에 지운다."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'actor' and isinstance(v, str) and v.strip():
                ACTORS.add(v.strip())
            collect_actors(v)
    elif isinstance(o, list):
        for x in o:
            collect_actors(x)


def scrub(v):
    """출력 칸 값: 덤프 actor 이름은 [담당자], 전화번호 형식은 지운다."""
    if v is None:
        return ''
    if isinstance(v, float):
        s = ('%f' % v).rstrip('0').rstrip('.')
    else:
        s = str(v)
    for a in sorted(ACTORS, key=lambda x: (-len(x), x)):
        s = s.replace(a, '[담당자]')
    return PHONE_RE.sub('[전화번호 생략]', s)


def scrub_json(v):
    if v is None or isinstance(v, (bool, int)):
        return v
    if isinstance(v, list):
        return [scrub_json(x) for x in v]
    if isinstance(v, dict):
        return {k: scrub_json(x) for k, x in v.items()}
    return scrub(v)


def write_csv(path, header, rows):
    os.makedirs(os.path.dirname(p(path)), exist_ok=True)
    with open(p(path), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, lineterminator='\r\n')
        w.writerow(header)
        for r in rows:
            if isinstance(r, dict):
                r = [r.get(h, '') for h in header]
            w.writerow([scrub(x) for x in r])


def write_text(path, text):
    os.makedirs(os.path.dirname(p(path)), exist_ok=True)
    with open(p(path), 'w', encoding='utf-8', newline='\n') as f:
        f.write(scrub(text))


def write_jsonl(path, rows):
    os.makedirs(os.path.dirname(p(path)), exist_ok=True)
    with open(p(path), 'w', encoding='utf-8', newline='\n') as f:
        for r in rows:
            f.write(json.dumps(scrub_json(r), ensure_ascii=False) + '\n')


def write_json(path, obj):
    os.makedirs(os.path.dirname(p(path)), exist_ok=True)
    with open(p(path), 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(scrub_json(obj), ensure_ascii=False, indent=1, sort_keys=True) + '\n')


def sha256_file(path):
    h = hashlib.sha256()
    with open(p(path), 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def read_csv_dicts(path):
    with open(p(path), encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- 정규화

def nz(s):
    """이름 비교용: 공백·괄호·가운뎃점 제거."""
    return re.sub(r'[\s()\[\]（）·ㆍ]', '', s or '')


def norm_block(b):
    """블록 표기 정규화: 대문자, 공백·'-'·'BL'·'블록'·'블럭' 제거, 숫자 앞 0 제거 (A-07BL → A7)."""
    if not b:
        return ''
    x = str(b).upper().replace(' ', '').replace('-', '')
    x = re.sub(r'(BL|블록|블럭)$', '', x)
    x = re.sub(r'(?<!\d)0+(?=\d)', '', x)
    return x


GENERIC_QUAL = {'공공주택', '택', '택지', '고령자', '뉴스테이', '복합개발', '도시재생뉴딜', '행복주택', '주환', '기',
                '가로주택', '공공분양', '국민임대', '영구임대', '통합공공임대', '신혼희망', '신혼희망타운'}


def is_generic_qual(q):
    """괄호 속 말이 사업 유형·관리 부호이면 True (예: 공공주택, 뉴스테이, 06,택3). 장소 이름이면 False."""
    q = re.sub(r'\s', '', q or '')
    return (not q) or q in GENERIC_QUAL or re.match(r'^\d{2},', q) is not None


def split_district(d):
    """(기본 지구명, 구분 괄호). 기본 지구명은 첫 '(' 앞, 공백·끝 '지구' 제거. 구분 괄호는 첫 괄호 속 말이 유형·부호가 아닐 때만."""
    if not d:
        return '', ''
    s = str(d)
    base = re.sub(r'지구$', '', re.sub(r'\s', '', s.split('(')[0]))
    m = re.search(r'\(([^()]*)\)', s)
    q = re.sub(r'\s', '', m.group(1)) if m else ''
    return base, ('' if is_generic_qual(q) else q)


def norm_district(d):
    """지구 표기 정규화: 기본 지구명 + 장소 구분 괄호 보존."""
    base, q = split_district(d)
    return base + ('(%s)' % q if q else '')


DATE_RE = re.compile(r'^\D*?(\d{4})\s*[.\-/년]\s*(\d{1,2})(?:\s*[.\-/월]\s*(\d{1,2})(?!\d))?')


def digits_date(s, yy=False):
    """날짜 비교용 숫자열(날짜 정규화는 여기 한 곳). 'YYYY.M.D'·'YYYY-MM-DD'·'YYYY/M/D'·'YYYY년 M월 D일'·'YYYY.MM' 은
    월·일을 0 채움해 YYYYMMDD·YYYYMM 으로, 이미 숫자만이면 그대로. yy=True 면 'YY-MM-DD' 를 '20YYMMDD' 로 읽는다(원본 PDF 표기).
    날짜 꼴이 아니면 숫자만 이어 붙인다."""
    if s is None:
        return ''
    s = str(s).strip()
    if yy and re.fullmatch(r'\d{2}-\d{2}-\d{2}', s):
        s = '20' + s
    if re.fullmatch(r'\d+', s):
        return s
    m = DATE_RE.match(s)
    if m and 1 <= int(m.group(2)) <= 12:
        return m.group(1) + m.group(2).zfill(2) + (m.group(3).zfill(2) if m.group(3) else '')
    return re.sub(r'\D', '', s)


def same_date(home, orig, yy=False):
    a, b = digits_date(home), digits_date(orig, yy)
    if not a or not b:
        return None
    return a == b


def to_int(v):
    if v is None:
        return None
    s = str(v).replace(',', '').strip()
    if re.fullmatch(r'-?\d+(\.0+)?', s):
        return int(float(s))
    return None


def page_of(url):
    m = re.search(r'#page=(\d+)', url or '')
    return m.group(1) if m else ''


def block_in(text_upper_nz, nb):
    """블록 정규화 값이 문자열에 블록으로 들어 있는지. 숫자 없는 블록(A 등)은 앞뒤가 영문·숫자가 아닌 정확 일치만."""
    if not nb:
        return False
    t = text_upper_nz.replace(' ', '')
    m = re.fullmatch(r'([A-Z가-힣]*)(\d+)([A-Z]?)', nb)
    if not m:
        return re.search(r'(?<![A-Z0-9])%s(?![A-Z0-9])' % re.escape(nb), t) is not None
    pat = r'(?<![A-Z0-9])%s-?0*%s%s(?![0-9])' % (re.escape(m.group(1)), m.group(2), re.escape(m.group(3)))
    return re.search(pat, t) is not None


def name_match(text, district, block):
    """이름 문자열(단지명·아파트명)에 사업의 지구와 블록이 함께 있는지.
    지구: 기본 지구명이 있어야 하고, 사업에 장소 구분 괄호가 있으면 그 말도 있어야 한다. 문자열에서 지구명 바로 뒤에
    장소 구분 괄호가 붙어 있으면 사업의 구분과 같아야 한다. 블록은 지구명이 나온 자리 뒤에서만 찾는다."""
    base, q = split_district(district)
    nb = norm_block(block)
    if not base or not nb:
        return False
    raw = re.sub(r'\s', '', text or '')
    for mm in re.finditer(re.escape(base), raw):
        after = raw[mm.end():]
        pm = re.match(r'(?:지구)?\(([^()]*)\)', after)
        tq = pm.group(1) if pm and not is_generic_qual(pm.group(1)) else ''
        if q and q not in raw:
            continue
        if tq and tq != q:
            continue
        if block_in(nz(after).upper(), nb):
            return True
    return False


def verdict_from(cmp_):
    """칸별 비교 결과 [(칸, True/False/None, HOME 값, 원본 값)] → (판정, 비고).
    한쪽 값이 없어 비교하지 못한 칸(None)은 통과로 세지 않는다. 실제로 비교한 칸이 0개면 '비교 불가'."""
    done = [c for c in cmp_ if c[1] is not None]
    skip = [c for c in cmp_ if c[1] is None]
    snote = (' · 비교 못 한 칸: ' + ', '.join('%s(HOME %s / 원본 %s)' % (c[0], c[2], c[3]) for c in skip)) if skip else ''
    if not done:
        return '비교 불가', '비교할 수 있는 칸 없음' + snote
    bad = [c for c in done if c[1] is False]
    if bad:
        return '불일치', '다른 칸: ' + '; '.join('%s HOME %s / 원본 %s' % (c[0], c[2], c[3]) for c in bad) + snote
    return '일치', '같은 칸: ' + ', '.join(c[0] for c in done) + snote


def fact_text(f):
    """HOME 사실(fact) 한 건을 사람이 읽는 글로."""
    bits = []
    if f.get('milestone'):
        bits.append(f['milestone'])
    if f.get('event_type'):
        bits.append(f['event_type'])
    if f.get('date') or f.get('date_label'):
        bits.append(str(f.get('date') or f.get('date_label')))
    if f.get('pct') is not None:
        bits.append('공정률 %s%%' % f['pct'])
    if f.get('units') is not None:
        bits.append('%s호' % f['units'])
    if f.get('scope_label'):
        bits.append('범위: ' + f['scope_label'])
    return ' · '.join(bits)


# ---------------------------------------------------------------- 위치 키 대조(독립 수집)

def src_district(text, suffixes):
    """원천의 지구 칸(특수지_명·사업지구명 등) 정규화: 공백·괄호 속 유형 부호를 빼고 끝의 사업 유형 꼬리(설정 suffixes)를 되풀이해 뗀다."""
    s = re.sub(r'\s', '', text or '')
    s = re.sub(r'\(([^()]*)\)', lambda m: '' if is_generic_qual(m.group(1)) else m.group(0), s)
    changed = True
    while changed and s:
        changed = False
        for suf in suffixes:
            if s.endswith(suf) and len(s) > len(suf):
                s, changed = s[:-len(suf)], True
    return s


def district_eq(src_text, district, suffixes):
    """원천 지구 칸이 사업 지구와 같은 곳인지. 같거나, 원천이 사업 지구명으로 시작하고 바로 뒤가 숫자가 아니거나
    (남양주왕숙 ≠ 남양주왕숙2), 사업 지구명이 원천 지구명(시 이름을 뺀 짧은 표기, 2자 이상)으로 끝난다. 사업에 장소 구분 괄호가 있으면 원천에도 있어야 한다."""
    base, q = split_district(district)
    s = src_district(src_text, suffixes)
    if not base or not s:
        return False
    if q and q not in re.sub(r'\s', '', src_text or ''):
        return False
    s = re.sub(r'\([^()]*\)', '', s)
    if not s:
        return False
    if s == base:
        return True
    if s.startswith(base) and not s[len(base)].isdigit():
        return True
    return len(s) >= 2 and base.endswith(s) and not s[0].isdigit()


def site_in_text(text, district, block):
    """자유 문장(공고명·단지명·PDF 줄)에 사업 지구와 블록이 함께 있는지. name_match 와 같되 지구명 바로 뒤가 숫자면
    다른 지구로 본다(남양주왕숙 ≠ 남양주왕숙2)."""
    base, q = split_district(district)
    nb = norm_block(block)
    if not base or not nb:
        return False
    raw = re.sub(r'\s', '', text or '')
    if q and q not in raw:
        return False
    for mm in re.finditer(re.escape(base), raw):
        after = raw[mm.end():]
        if after[:1].isdigit():
            continue
        pm = re.match(r'(?:지구)?\(([^()]*)\)', after)
        tq = pm.group(1) if pm and not is_generic_qual(pm.group(1)) else ''
        if tq and tq != q:
            continue
        if block_in(nz(after).upper(), nb):
            return True
    return False


def same_period(home, orig):
    """날짜 비교(숫자열). 짧은 쪽 정밀도(연월 6자리 이상)로 비교한다. 한쪽이 없으면 None."""
    a, b = digits_date(home), digits_date(orig)
    if len(a) < 6 or len(b) < 6:
        return None
    n = min(len(a), len(b), 8)
    return a[:n] == b[:n]
