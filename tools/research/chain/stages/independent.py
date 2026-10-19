"""독립 수집 경로(정책 무관): HOME 덤프가 가리키지 않은 권위 원천을 사업 위치·식별자로 직접 찾는다.

사업(원장 id)마다 단계(02~06)별로
  (a) 원장 표(events·identifiers·notice_links)에서 그 사업 행 중 HOME 유래(source_ref 가 home-dump-*)가 아닌 것 →
      source_ref 의 원천 원본에서 원 레코드를 다시 찾아 위치·원문 값을 적는다(원장 값과 다르면 비고).
  (b) 원장에 없으면 원천 원본을 위치 키(블록 키·법정동+블록·시군구+이름·PNU)로 찾는다.
  (c) HOME 값이 있으면 칸별 대조(일치/불일치), 원천이 HOME 원천과 같으면 같은 원천 재확인, 다르면 독립 원천 대조.
      HOME 값이 없으면 '원천값 수집'(SOURCED).
  (d) 찾아도 없고 원천이 그 사업을 덮는 범위면 '미도달 확인'(ABSENT_CONFIRMED, search_scope 기록). 뒤 단계에 원천 근거가
      있으면 미도달로 두지 않고 '비교 불가' + 단계 순서 모순 목록(R.order_issues).
원천·칸·키·범위 규칙은 config/stage_sources.json 의 independent. 행의 HOME_표는 common.INDEP.
"""

import json
import os
import re
from collections import OrderedDict, defaultdict

import readers
from common import (p, nz, digits_date, block_in, norm_block, norm_district, split_district, district_eq, site_in_text, same_period, to_int,
                    verdict_from, INDEP, CANDIDATE_TABLES, NO_EXTERNAL)

CODES = ['02', '03', '04', '05', '06']
DATE_KINDS = {'승인일', '착공일', '공사준공', 'LH준공예정', '공고일', '공급예정월', '입주월'}
YEAR_KINDS = {'승인연도', '착공연도', '입주연도'}  # 정책 계획의 연 단위 값(연도끼리만 비교)
POSITIVE = ('일치', '불일치', '원천값 수집')


class Indep:
    """독립 수집 원천을 읽은 것(정책 사이에 함께 쓴다)."""


def _blank(v):
    return v is None or str(v).strip() in ('', '-', 'None')


def _load_table(d, name):
    with open(p('%s/%s.json' % (d, name)), encoding='utf-8') as f:
        return json.load(f)['rows']


def name_in(text, name):
    """사업 이름(공백·괄호 무시)이 글에 있고 이름 바로 뒤가 숫자가 아님(장위1 ≠ 장위12)."""
    t = nz(text)
    for m in re.finditer(re.escape(name), t):
        if not t[m.end():m.end() + 1].isdigit():
            return True
    return False


def any_name(text, names, markers):
    """이름 키: 변형 중 하나가 글에 있고 글에 공공주택 표지(config keys.name_markers)가 있음."""
    t = nz(text)
    return any(m in t for m in markers) and any(name_in(text, n) for n in names)


def _sido_ok(a, b):
    a, b = re.sub(r'\s', '', a or ''), re.sub(r'\s', '', b or '')
    return not a or not b or a[:2] == b[:2]


# ---------------------------------------------------------------- 원천 읽기(한 번)

def load(R):
    if getattr(R.S, 'indep', None) is not None:
        return R.S.indep
    ic = R.cfg['independent']
    sc = ic['sources']
    X = Indep()
    X.urls = {}
    led = ic['ledger']['tables_dir']
    X.events = defaultdict(list)
    for r in _load_table(led, 'events'):
        X.events[r['local_project_id']].append(r)
    X.idents = defaultdict(list)
    for r in _load_table(led, 'identifiers'):
        X.idents[r['local_project_id']].append(r)
    X.nlinks = defaultdict(list)
    for r in _load_table(led, 'notice_links'):
        X.nlinks[r['local_project_id']].append(r)
    X.projects = {r['local_project_id']: r for r in _load_table(led, 'projects')}
    X.locs = defaultdict(list)
    for r in _load_table(led, 'project_locations'):
        X.locs[r['local_project_id']].append(r)
    with open(p(ic['keys']['lh_block_sgg']), encoding='utf-8') as f:
        X.lh_block = json.load(f)
    with open(p(R.cfg['home']['id_map']), encoding='utf-8') as f:
        sidos = {v.split('-')[1][:2] for v in json.load(f).values() if v.startswith('PRJ-')}
    X.sidos = sidos
    # 건축HUB 주택인허가 기본개요(시도 거름)
    c = sc['hub_basic']
    X.hub_cols, rows, X.hub_member = readers.read_hub_basic_rows(c['zip'], c['manifest'], c['part'], c['cols']['sgg'], sidos)
    X.hub_ix = {k: X.hub_cols.index(v) for k, v in c['cols'].items()}
    X.hub_by_block, X.hub_by_sgg, X.hub_by_pk, X.hub_by_sido = defaultdict(list), defaultdict(list), {}, defaultdict(list)
    for ln, r in rows:
        X.hub_by_block[norm_block(r[X.hub_ix['block']])].append((ln, r))
        X.hub_by_sido[r[X.hub_ix['sgg']][:2]].append((ln, r, re.sub(r'\s', '', r[X.hub_ix['name']] + r[X.hub_ix['district']])))
        X.hub_by_sgg[r[X.hub_ix['sgg']]].append((ln, r))
        X.hub_by_pk[r[X.hub_ix['pk']]] = (ln, r)
    X.urls[c['zip']] = c['doc_url']
    # LH 공급계획 엑셀: (파일, 지구명, 유형) 묶음
    c = sc['lh_supply_plan']
    X.plan = []
    for f in c['files']:
        X.urls[f['path']] = f['url']
        for sheet in readers.read_xls(f['path']).values():
            _, _, rows = readers.xls_table(sheet, f['header'])
            groups = OrderedDict()
            for ln, rec in rows:
                k = (rec.get(f['cols']['name']) or '', rec.get(f['cols']['type']) or '')
                groups.setdefault(k, []).append((ln, rec))
            for (name, typ), grp in groups.items():
                X.plan.append((f, name, typ, grp))
    # 청약홈 Detail 전부(op 순서, 행 순서)
    a = R.src('applyhome')
    X.ah = []
    for op in a['ops']:
        path = a['dir'] + '/' + op + '.json'
        with open(p(path), encoding='utf-8') as f:
            for i, r in enumerate(json.load(f)['rows']):
                X.ah.append((path, op, i, r))
        X.urls[path] = a['doc_urls'].get(path)
    # HUG·마이홈
    c = sc['hug']
    with open(p(c['path']), encoding='utf-8') as f:
        X.hug = list(enumerate(json.load(f)['rows']))
    X.urls[c['path']] = c['doc_url']
    X.myhome = []
    for path in sc['myhome']['files']:
        with open(p(path), encoding='utf-8') as f:
            X.myhome += [(path, i, r) for i, r in enumerate(json.load(f)['items'])]
    # LH 공고 상세 HTML·공고문 PDF(웹에서 받은 원 파일)
    c, cp = sc['lh_web'], sc['lh_web_pdf']
    mdir = os.path.dirname(c['manifest'])
    with open(p(c['manifest']), encoding='utf-8') as f:
        man = json.load(f)
    X.web, X.webpdf = [], []
    rx = {k: re.compile(v) for k, v in c['regex'].items()}
    px = {k: re.compile(v) for k, v in cp['regex'].items()}
    for key in sorted(man['files']):
        e = man['files'][key]
        if not key.startswith(c['prefix']):
            continue
        path = mdir + '/' + e['filename']
        with open(p(path), encoding='utf-8', errors='replace') as f:
            t = readers.html_text(f.read())
        got = {k: (r.search(t).group(1) if r.search(t) else '') for k, r in rx.items()}
        X.web.append((path, e.get('url'), got))
        X.urls[path] = e.get('url')
        for att in e.get('attachments') or []:
            if att.get('saved') and att.get('path', '').lower().endswith('.pdf'):
                ap = mdir + '/' + att['path']
                pages = readers.pdf_text(ap, cp['max_pages'])
                text = re.sub(r'\s+', ' ', ' '.join(t for _, t in pages))
                loc = px['location'].search(text)
                nd = px['notice_date'].search(text)
                X.webpdf.append((ap, att.get('download'), dict(
                    location=loc.group(1) if loc else re.sub(r'\s+', ' ', pages[0][1] if pages else '')[:cp['location_fallback_chars']],
                    location_how='공급위치 문장' if loc else '첫 쪽 앞 %d자' % cp['location_fallback_chars'],
                    notice_date=re.sub(r'\s', '', nd.group(1)) if nd else '')))
                X.urls[ap] = att.get('download')
    load_agency(R, X)
    c = sc['lh_notice_old']
    X.lh_old, X.lh_old_limit = None, ''
    if os.path.exists(p(c['manifest'])):
        with open(p(c['path']), encoding='utf-8') as f:
            X.lh_old = json.load(f)['items']
        with open(p(c['manifest']), encoding='utf-8') as f:
            bad = json.load(f).get('bad_pages') or []
        if bad:
            X.lh_old_limit = c['bad_pages_note'].format(n=len(bad), detail=', '.join(
                '%s년 유형 %s 쪽 %s' % (b.get('year'), b.get('type'), b.get('page')) for b in bad))
        X.urls[c['path']] = None
    R.S.indep = X
    return X


def load_agency(R, X):
    """SH·GH·iH 모집공고 목록 → 최초 모집공고 묶음. X.agency = [(목록 설정, 행 번호, 행, 묶음 수, 정리한 제목)]."""
    c = R.cfg['independent']['sources']['agency_notice']
    cols = c['cols']
    clean = re.compile(c['title_clean_regex'])
    X.agency, X.agency_pdf = [], {}
    for li in c['lists']:
        path = c['dir'] + '/' + li['path']
        X.urls[path] = None
        rows = readers.read_csv_dicts_rows(path)
        groups = OrderedDict()
        for ln, r in rows:
            t = r.get(cols['title']) or ''
            if not any(w in t for w in c['include_words']) or any(w in t for w in c['exclude_words']) or \
                    any(w in t for w in c['followup_words']):
                continue
            key = nz(clean.sub('', t))
            groups.setdefault(key, []).append((ln, r))
        for key, grp in groups.items():
            ln, r = sorted(grp, key=lambda x: (x[1].get(cols['date']) or '', x[0]))[0]
            X.agency.append((li, path, ln, r, len(grp), key))


def agency_move(R, X, rel):
    """공고문 PDF 앞 쪽의 입주예정 연월(없으면 '')."""
    c = R.cfg['independent']['sources']['agency_notice']
    if rel in X.agency_pdf:
        return X.agency_pdf[rel]
    v = ''
    if rel.lower().endswith('.pdf') and os.path.exists(p(rel)):
        text = re.sub(r'\s+', ' ', ' '.join(t for _, t in readers.pdf_text(rel, c['pdf_pages'])))
        m = re.search(c['move_regex'], text)
        v = '%s-%02d' % (m.group(1), int(m.group(2))) if m else ''
    X.agency_pdf[rel] = v
    return v


# ---------------------------------------------------------------- 위치 키

def project_keys(R, X, pid):
    """사업 위치 키. 블록이 여럿이면 blocks 에 모두(블록 키 찾기는 블록마다)."""
    pl = R.projects[pid]['payload']
    subj = R.subject_id(pid)
    kc = R.cfg['independent']['keys']
    prj = X.projects.get(subj) or {}
    sgg = prj.get('sgg_code') or (subj.split('-')[1] if subj.startswith('PRJ-') else '')
    district, blocks, how = pl.get('district'), [pl.get('block')] if pl.get('block') else [], ''
    if not (district and blocks):
        m = re.match(kc['name_site_regex'], (pl.get('name') or '').strip())
        if m:
            district, blocks, how = m.group(1), [x.strip() for x in re.split(r'[,·]', m.group(2))], '이름에서 지구·블록 읽음'
    district = strip_block_from_district(district, blocks)
    nd = norm_district(district)
    bjds = {l['bjd_code'] for l in X.locs.get(subj, []) if l.get('bjd_code')}
    pnus = {l['pnu'] for l in X.locs.get(subj, []) if l.get('pnu')}
    for b in blocks:
        for m in X.lh_block:
            if nd and norm_district(m.get('district')) == nd and norm_block(m.get('block')) == norm_block(b) and \
                    m.get('bjd_code') and (not sgg or m['bjd_code'][:2] == sgg[:2]):
                bjds.add(m['bjd_code'])
    block_key = bool(nd and blocks and sgg)
    names = [n for n in name_variants(pl.get('name'), kc)
             if n not in (nz(pl.get('municipality')), nz(pl.get('region')))] if not block_key else []
    return dict(pid=pid, sgg=sgg, sido=sgg[:2], district=district, base=split_district(district)[0], blocks=blocks,
                block=blocks[0] if blocks else None, nb=norm_block(blocks[0]) if blocks else '', key_how=how,
                bjds=sorted(bjds), pnus=sorted(pnus), region=pl.get('region') or '', muni=nz(pl.get('municipality')),
                name=names[0] if names else '', names=names, claim=pl.get('stage'), markers=kc['name_markers'],
                block_key=block_key, developer=pl.get('developer') or '', units=to_int(pl.get('planned_units')))


def strip_block_from_district(district, blocks):
    """지구 칸에 블록 표기가 붙어 있으면(예: '의정부법조타운S-3BL (', '평택고덕A-56BL민간참여…') 블록 앞까지만 지구로 본다."""
    if not district:
        return district
    for b in blocks:
        m = re.fullmatch(r'([A-Za-z]*)-?0*(\d+)([A-Za-z]?)', re.sub(r'(BL|블록|블럭)$', '', str(b).replace(' ', ''), flags=re.I))
        if not m:
            continue
        pat = r'(?<![A-Za-z0-9])%s-?0*%s%s(?![0-9])' % (re.escape(m.group(1)), m.group(2), re.escape(m.group(3)))
        hit = re.search(pat, district, flags=re.I)
        if hit and hit.start() > 1:
            return district[:hit.start()].strip()
    return district


def per_block(k, kc):
    """블록 키를 블록마다 하나씩. config keys.block_aliases 에 원천 근거가 있는 다른 이름 블록이 있으면 그 블록도(근거를 키 설명에)."""
    if not k['block_key']:
        return [k]
    out, seen = [], set()
    for b in k['blocks']:
        cands = [(b, '')]
        for a in kc['block_aliases']:
            if split_district(a['district'])[0] == k['base'] and norm_block(b) in [norm_block(x) for x in a['blocks']]:
                cands += [(x, '별칭(%s)' % a['evidence']) for x in a['blocks'] if norm_block(x) != norm_block(b)]
        for x, why in cands:
            if norm_block(x) not in seen:
                seen.add(norm_block(x))
                out.append(dict(k, block=x, nb=norm_block(x), alias=why))
    return out


def name_variants(name, kc):
    """이름 키 변형: 전체, 끝 꼬리(구역·일원) 뗀 것, 괄호 앞·괄호 속. 공백·괄호 무시, min_name_len 자 이상."""
    raw = name or ''
    cands = [nz(raw)]
    for suf in kc['name_strip_suffixes']:
        if nz(raw).endswith(suf):
            cands.append(nz(raw)[:-len(suf)])
    m = re.match(r'^(.*?)\(([^()]*)\)(.*)$', raw)
    if m:
        cands += [nz(m.group(1) + m.group(3)), nz(m.group(2))]
    out = []
    for c in cands:
        if len(c) >= kc['min_name_len'] and c not in out:
            out.append(c)
    return out


def key_label(k):
    if k['block_key']:
        return '블록 키 시도 %s · 지구 %s · 블록 %s%s' % (k['sido'], k['district'], ','.join(k['blocks']),
                                                  ' (%s)' % k['key_how'] if k['key_how'] else '')
    if k['name']:
        return '이름 키 시군구 %s · 이름 %s' % (k['sgg'], '/'.join(k['names']))
    return ''


# ---------------------------------------------------------------- 원천별 찾기 → 레코드
# 레코드: dict(src, rid, file, pos, how, fields{칸: 값}, raw{발췌 칸})

def find_hub(R, X, k):
    """건축HUB 기록. 블록 키로 하나도 없고 블록이 소문자 부호 표기(Ab37)면 대문자+숫자(A37)로 다시 찾는다(keys.block_loose)."""
    recs = _find_hub(R, X, k)
    lo = R.cfg['independent']['keys']['block_loose']
    m = re.match(lo['regex'], str(k.get('block') or '').replace(' ', ''))
    if k['block_key'] and not recs and not k.get('hub_small') and m:
        loose = m.group(1) + m.group(2)
        recs = _find_hub(R, X, dict(k, block=loose, nb=norm_block(loose)))
        for r in recs:
            r['how'] += ' · 블록 표기 차이 흡수(%s → %s)' % (k['block'], loose)
    return recs


def _find_hub(R, X, k):
    ix, suf = X.hub_ix, R.cfg['independent']['keys']['district_suffixes']
    c = R.cfg['independent']['sources']['hub_basic']
    hits = []
    mu = c.get('min_units_record') or 0
    if k['block_key']:
        for ln, r in X.hub_by_block.get(k['nb'], []):
            if r[ix['sgg']][:2] != k['sido']:
                continue
            d = r[ix['district']]
            if d.strip():
                if district_eq(d, k['district'], suf):
                    hits.append((ln, r, '특수지_명 지구 같음 + 블록 같음'))
            elif (r[ix['sgg']] + r[ix['bjd']]) in k['bjds']:
                hits.append((ln, r, '법정동 %s + 블록 같음(특수지_명 빈칸)' % (r[ix['sgg']] + r[ix['bjd']])))
        got = {h[0] for h in hits}
        for ln, r, t in X.hub_by_sido.get(k['sido'], []):
            if ln not in got and k['base'] in t and \
                    site_in_text(r[ix['name']] + ' ' + r[ix['district']] + ' ' + r[ix['block']], k['district'], k['block']):
                hits.append((ln, r, '건물_명·특수지_명·블록 글에 지구·블록'))
    elif k['name']:
        for ln, r, _ in X.hub_by_sido.get(k['sido'], []):
            t = r[ix['name']] + ' ' + r[ix['district']]
            same_sgg = r[ix['sgg']] == k['sgg']
            if same_sgg and any_name(t, k['names'], k['markers']):
                hits.append((ln, r, '시군구 %s + 건물_명·특수지_명에 이름(공공주택 표지)' % k['sgg']))
            elif k['units'] and to_int(r[ix['units']]) == k['units'] and any_name(t, k['names'], ['']):
                hits.append((ln, r, '%s + 건물_명·특수지_명에 이름 + 총세대수=HOME 호수' % (
                    ('시군구 %s' % k['sgg']) if same_sgg else ('시도 %s(시군구 코드 %s, 개편 전후 코드 차이 가능)' % (k['sido'], r[ix['sgg']])))))
    k['hub_small'] = sum(1 for h in hits if (to_int(h[1][ix['units']]) or 0) < mu)
    hits.sort(key=lambda h: h[0])
    return [hub_rec(X, c, ln, r, how) for ln, r, how in hits if (to_int(r[ix['units']]) or 0) >= mu]


def hub_rec(X, c, ln, r, how):
    ix = X.hub_ix
    return dict(src='hub_basic', rid=('hub', r[ix['pk']]), file=c['zip'],
                pos='%s 행 %d (%s %s)' % (X.hub_member, ln, c['cols']['pk'], r[ix['pk']]), how=how,
                fields=dict(zip(X.hub_cols, r)), raw=OrderedDict(list(zip(X.hub_cols, r)) + [('_file', c['zip'] + '!' + X.hub_member), ('_pos', '행 %d' % ln)]))


def find_pdf(R, X, k):
    if not k['block_key']:
        return []
    c = R.src('lh_construction_pdf')
    wt = R.cfg['independent']['sources']['lh_pdf']['work_types']
    out = []
    for row in R.S.pdf_rows:
        if row['공종'] in wt and k['base'] in row['원문_줄'].replace(' ', '') and \
                site_in_text(row['원문_줄'], k['district'], k['block']):
            f = dict(row)
            if row['단위'] != '호':
                f['공사규모'] = ''
            for d in ('착공일', '준공일'):
                f[d] = '20' + row[d] if re.fullmatch(r'\d{2}-\d{2}-\d{2}', row[d]) else row[d]
            out.append(dict(src='lh_pdf', rid=('pdf', row['쪽'], row['줄']), file=R.stage_file('lh_construction_pdf'),
                            pos='p.%d 줄 %d (공종 %s, 블록 %s)' % (row['쪽'], row['줄'], row['공종'], row['블록']),
                            how='줄에 지구·블록', fields=f,
                            raw=OrderedDict(list(row.items()) + [('_file', c['path']), ('_pos', 'p.%d 줄 %d' % (row['쪽'], row['줄']))])))
    return out


def find_completion(R, X, k):
    if not k['block_key']:
        return []
    c = R.src('lh_completion_csv')
    ix, h = R.S.comp_idx, R.S.comp_header
    suf = R.cfg['independent']['keys']['district_suffixes']
    out = []
    for ln, x in R.S.comp_rows:
        if norm_block(x[ix['block']]) == k['nb'] and district_eq(x[ix['district']], k['district'], suf):
            out.append(dict(src='lh_completion', rid=('comp', ln), file=c['path'], pos='CSV 행 %d' % ln,
                            how='사업지구명 지구 같음 + 블록명 같음', fields=dict(zip(h, x)),
                            raw=OrderedDict(list(zip(h, x)) + [('_file', c['path']), ('_pos', 'CSV 행 %d' % ln)])))
    return out


def find_plan(R, X, k):
    if not k['block_key']:
        return []
    out = []
    for f, name, typ, grp in X.plan:
        cols = f['cols']
        if not site_in_text(name, k['district'], k['block']):
            continue
        region = next((v for _, rec in grp for kk, v in rec.items() if kk == '지역'), '')
        if not _sido_ok(region, k['region']):
            continue
        lns = [ln for ln, _ in grp]

        def col(cn, how='first'):
            if not cn:
                return ''
            vals = [rec.get(cn) for _, rec in grp if not _blank(rec.get(cn))]
            if how == 'sum':
                ns = [to_int(v) for v in vals]
                return str(sum(ns)) if vals and all(n is not None for n in ns) else ''
            vs = sorted(set(str(v).strip() for v in vals))
            return vs[0] if len(vs) == 1 else ' / '.join(vs)
        fields = dict(total=col(cols['total']), units=col(cols['units'], 'sum'), month=col(cols['month']), note=col(cols.get('note')),
                      movein=col(cols['movein']), name=name, type=typ)
        raw = OrderedDict([('지구명', name), ('유형', typ), ('총세대수', fields['total']), ('공급호수 합', fields['units']),
                           ('공급예정시기', fields['month']), ('입주예정', fields['movein']), ('_file', f['path']),
                           ('_pos', '엑셀 행 ' + ','.join(str(x) for x in lns))])
        out.append(dict(src='lh_supply_plan', rid=('plan', f['path'], name, typ), file=f['path'],
                        pos='%s 엑셀 행 %s(지구명 %s · 유형 %s)' % (os.path.basename(f['path']), ','.join(str(x) for x in lns), name, typ),
                        how='지구명에 지구·블록', fields=fields, raw=raw))
    return out


def _text_hit(k, text, sido_text=None, muni_text=None):
    if k['block_key']:
        return k['base'] in text.replace(' ', '') and site_in_text(text, k['district'], k['block']) and \
            _sido_ok(sido_text, k['region'])
    if k['name']:
        return any_name(text, k['names'], k['markers']) and (muni_text is None or k['muni'][:2] in nz(muni_text))
    return False


def find_applyhome(R, X, k, house_nos=None):
    c = R.cfg['independent']['sources']['applyhome_x']
    out = []
    for path, op, i, r in X.ah:
        nm = ' '.join(str(r.get(x) or '') for x in c['name_cols'])
        addr = r.get(c['addr_col']) or ''
        if house_nos is not None:
            if str(r.get(c['id_col'])) not in house_nos:
                continue
            how = '원장 notice_links %s=%s' % (c['id_col'], r.get(c['id_col']))
        elif _text_hit(k, nm + ' ' + addr if k['block_key'] else nm, addr, addr):
            how = ('주택명·공급위치에 지구·블록' if k['block_key'] else '주택명에 이름') + ' · 공급위치 시도/시군구'
        elif applyhome_brand_hit(k, nm, addr, r.get(c['units_col'])):
            how = '브랜드 단지명: 공급위치 시군구 + 주택명 블록 + 지구명 앞부분 + 공급세대수=HOME 호수'
        else:
            continue
        drop = R.src('applyhome')['drop_fields']
        out.append(dict(src='applyhome_x', rid=('ah', op, i), file=path, pos='%s.json rows[%d] (%s %s)' % (op, i, c['id_col'], r.get(c['id_col'])),
                        how=how, fields=r, raw=OrderedDict([(a, b) for a, b in sorted(r.items()) if a not in drop] +
                                                           [('_file', path), ('_pos', 'rows[%d]' % i)])))
    return out


def applyhome_brand_hit(k, nm, addr, units):
    """청약홈 단지명이 '브랜드 + 지구 일부 + 블록' 꼴일 때: 공급위치에 사업 시군구 이름, 주택명에 블록, 주택명에 지구명 앞부분
    (시군구 줄기를 뗀 지구명의 앞 2자 이상)이 있고 공급세대수 = HOME 계획 호수일 때만. 유사도 매칭은 하지 않는다."""
    if not k['block_key'] or not k['muni'] or not k['units'] or to_int(units) != k['units']:
        return False
    stem = re.sub(r'(시|군|구)$', '', k['muni'].split('시')[0] if '시' in k['muni'] else k['muni'])
    if len(stem) < 2 or stem[:2] not in nz(addr) or not _sido_ok(addr, k['region']):
        return False
    if not block_in(nz(nm).upper(), k['nb']):
        return False
    base = k['base'][len(stem):] if k['base'].startswith(stem) else k['base']
    return len(base) >= 2 and base[:2] in nz(nm)


def find_lh_notice(R, X, k, pan_ids=None):
    c = R.cfg['independent']['sources']['lh_notice_x']
    base = R.src('lh_notice')
    from stages.shared import lh_pick_sbd
    out = []
    for pan in sorted(R.S.lh_notices):
        i, r = R.S.lh_notices[pan]
        title = r.get(c['name_col']) or ''
        if pan_ids is not None:
            if pan not in pan_ids:
                continue
            how = '원장 notice_links PAN_ID=%s' % pan
        else:
            if r.get(c['type_col']) in c['exclude_types'] or any(w in title for w in c['exclude_title_words']):
                continue
            if not _text_hit(k, title, r.get('CNP_CD_NM'), None if k['block_key'] else title):
                continue
            how = '공고명에 ' + ('지구·블록' if k['block_key'] else '이름') + ' · 공고 지역 시도'
        f = dict(r)
        pos = 'notices.json items[%d] (PAN_ID %s)' % (i, pan)
        dt = R.S.lh_details.get(pan)
        if dt:
            sbd, pick = lh_pick_sbd(dt[1], k['block'])
            if sbd:
                f['_move'] = sbd['_move']
                pos += ' · details.json rows[%d] %s%s' % (dt[0], base['labels']['detail_block'], pick)
        path = base['notice_dir'] + '/notices.json'
        out.append(dict(src='lh_notice_x', rid=('lhn', pan), file=path, pos=pos, how=how, fields=f,
                        raw=OrderedDict([(a, b) for a, b in sorted(r.items())] + [('입주예정월(상세)', f.get('_move') or ''),
                                                                                ('_file', path), ('_pos', 'items[%d]' % i)])))
    return out


def find_lh_notice_old(R, X, k):
    """LH 공고 과거 목록(config lh_notice_old, manifest 가 있을 때만). 제외 유형·제목어는 lh_notice_x 와 같다."""
    if X.lh_old is None:
        return []
    c = R.cfg['independent']['sources']['lh_notice_old']
    cx = R.cfg['independent']['sources']['lh_notice_x']
    out = []
    for i, r in enumerate(X.lh_old):
        title = r.get(c['name_col']) or ''
        if r.get(c['type_col']) in cx['exclude_types'] or any(w in title for w in cx['exclude_title_words']):
            continue
        if not _text_hit(k, title, r.get('CNP_CD_NM'), None if k['block_key'] else title):
            continue
        out.append(dict(src='lh_notice_old', rid=('lhn', r.get('PAN_ID')), file=c['path'],
                        pos='notices.json items[%d] (PAN_ID %s, 제목 "%s")' % (i, r.get('PAN_ID'), title),
                        how='공고명에 ' + ('지구·블록' if k['block_key'] else '이름') + ' · 공고 지역 시도', fields=r,
                        raw=OrderedDict(sorted(r.items()) + [('_file', c['path']), ('_pos', 'items[%d]' % i)])))
    return out


def find_hug(R, X, k):
    c = R.cfg['independent']['sources']['hug']
    out = []
    for i, r in X.hug:
        nm = ' '.join(str(r.get(x) or '') for x in c['name_cols'])
        if not _text_hit(k, nm, r.get('AREA_DCD_NM'), r.get(c['addr_col'])):
            continue
        out.append(dict(src='hug', rid=('hug', i), file=c['path'], pos='rows[%d] (BSU_NM %s)' % (i, nz(r.get('BSU_NM'))),
                        how='사업장명에 ' + ('지구·블록' if k['block_key'] else '이름'), fields=r,
                        raw=OrderedDict(sorted(r.items()) + [('_file', c['path']), ('_pos', 'rows[%d]' % i)])))
    return out


def find_myhome(R, X, k):
    c = R.cfg['independent']['sources']['myhome']
    out = []
    for path, i, r in X.myhome:
        nm = ' '.join(str(r.get(x) or '') for x in c['name_cols'])
        if k['pnus'] and r.get(c['pnu_col']) in k['pnus']:
            how = 'PNU %s' % r.get(c['pnu_col'])
        elif _text_hit(k, nm, r.get('brtcNm'), (r.get('signguNm') or '') + (r.get(c['addr_col']) or '')):
            how = '공고명·단지명에 ' + ('지구·블록' if k['block_key'] else '이름')
        else:
            continue
        out.append(dict(src='myhome', rid=('mh', path, i), file=path, pos='items[%d] (pblancId %s)' % (i, r.get('pblancId')),
                        how=how, fields=r, raw=OrderedDict(sorted((a, b) for a, b in r.items() if a != 'refrnc') +
                                                           [('_file', path), ('_pos', 'items[%d]' % i)])))
    return out


def find_web(R, X, k):
    if not k['block_key']:
        return []
    out = []
    for path, url, got in X.web:
        if not site_in_text(got['title'] + ' ' + got['location'], k['district'], k['block']):
            continue
        out.append(dict(src='lh_web', rid=('web', path), file=path, pos='HTML 공고명 "%s" · 소재지 "%s"' % (got['title'], got['location']),
                        how='공고명·소재지에 지구·블록', fields=got,
                        raw=OrderedDict([('공고명', got['title']), ('공고일', got['notice_date']), ('입주예정일', got['move']),
                                         ('소재지', got['location']), ('_file', path), ('_pos', 'HTML 본문')])))
    return out


def find_webpdf(R, X, k):
    if not k['block_key']:
        return []
    out = []
    for path, url, got in X.webpdf:
        if not site_in_text(got['location'], k['district'], k['block']):
            continue
        out.append(dict(src='lh_web_pdf', rid=('wpdf', path), file=path,
                        pos='앞 쪽 텍스트 %s "%s"' % (got['location_how'], got['location'][:120]), how='공급위치에 지구·블록',
                        fields=got, raw=OrderedDict([('공급위치', got['location'][:200]), ('모집공고일', got['notice_date']),
                                                     ('_file', path), ('_pos', got['location_how'])])))
    return out


def status_gate(R, X, d):
    """추진 상태 문장이 원 PDF 그 쪽 텍스트에 있는지(공백 무시). 결과는 X 에 둔다."""
    X.status_ok = getattr(X, 'status_ok', {})
    key = (d['doc_path'], d['status_page'], d['status_quote'])
    if key not in X.status_ok:
        ok = False
        if os.path.exists(p(d['doc_path'])):
            pages = readers.pdf_text(d['doc_path'], d['status_page'])
            ok = nz(d['status_quote']) in nz(pages[d['status_page'] - 1][1]) if len(pages) >= d['status_page'] else False
        X.status_ok[key] = ok
    return X.status_ok[key]


def find_site_status(R, X, k):
    """정책 후속 발표의 사이트 단위 행(policy_sites.jsonl) 중 이 사업 지명 → 목록 전체에 걸린 추진 상태(02 근거)."""
    from home import site_matches
    c = R.cfg['independent']['sources']['site_status']
    out = []
    pl = R.projects[k['pid']]['payload']
    for d in c['docs']:
        if not status_gate(R, X, d):
            continue
        rows = [x for x in R.sites or [] if x.get('doc_path') == d['doc_path'] and x.get('page') in d['site_pages']
                and x.get('site_kind') == 'SITE']
        for s_, how in site_matches(pl, rows, R.cfg['independent']['keys']['site_name_rules']):
            path = d['doc_path']
            X.urls.setdefault(path, None)
            out.append(dict(src='site_status', rid=('status', path, s_.get('page'), s_.get('site_name')), file=path,
                            pos='p.%s 사이트 행 "%s" · 추진 상태 p.%s "%s"' % (s_.get('page'), s_.get('quote'), d['status_page'],
                                                                     d['status_quote']),
                            how='정책 지명 연결(%s)' % how, fields={'status': d['status']},
                            doc_stem=os.path.splitext(os.path.basename(path))[0],
                            raw=OrderedDict([('지명', s_.get('site_name')), ('원문 행', s_.get('quote')), ('추진 상태', d['status']),
                                             ('_file', path), ('_pos', 'p.%s' % s_.get('page'))])))
    return out


def find_policy_table(R, X, k):
    """정책 후속 발표 표 행(policy_sites.jsonl, candidate_source 가 표)에서 이 사업 지명 행 → 사업승인·이주·착공·입주 연도."""
    from home import site_matches
    c = R.cfg['independent']['sources']['policy_table']
    rx = {kk: re.compile(v) for kk, v in c['fields_regex'].items()}
    out = []
    for s_, how in site_matches(R.projects[k['pid']]['payload'], R.sites or [], R.cfg['independent']['keys']['site_name_rules']):
        if s_.get('candidate_source') not in c['candidate_sources']:
            continue
        f = {}
        for kk, r in rx.items():
            m = r.search(s_.get('notes') or '')
            if m:
                v = m.group(1)
                f[kk] = '20' + v if '.' not in v else '20%s.%s' % tuple(v.split('.'))
        path = s_.get('doc_path') or ''
        out.append(dict(src='policy_table', rid=('ptab', path, s_.get('page'), s_.get('site_name')), file=path,
                        pos='p.%s 표 행 "%s"' % (s_.get('page'), s_.get('quote')), how='정책 지명 연결(%s)' % how, fields=f,
                        doc_stem=os.path.splitext(os.path.basename(path))[0],
                        raw=OrderedDict([('지명', s_.get('site_name')), ('원문', s_.get('quote')), ('표 칸', s_.get('notes')),
                                         ('_file', path), ('_pos', 'p.%s' % s_.get('page'))])))
    return out


def find_agency(R, X, k):
    """SH·GH·iH 최초 모집공고 중 이 사업(시도 = 기관 시도, 제목에 지구·블록 또는 이름) 공고."""
    c = R.cfg['independent']['sources']['agency_notice']
    cols = c['cols']
    out = []
    for li, path, ln, r, n, key in X.agency:
        if li['sido'] != k['sido']:
            continue
        t = r.get(cols['title']) or ''
        if k['block_key']:
            if not (k['base'] in t.replace(' ', '') and site_in_text(t, k['district'], k['block'])):
                continue
            how = '%s 공고 제목에 지구·블록' % li['agency']
        elif k['name']:
            if not any_name(t, k['names'], ['']):
                continue
            how = '%s 공고 제목에 이름' % li['agency']
        else:
            continue
        base = c['dir'] + '/' + os.path.dirname(li['path'])
        doc = (base + '/' + r[cols['doc']]) if r.get(cols['doc']) else ''
        detail = (base + '/' + r[cols['detail']]) if r.get(cols['detail']) else ''
        f = dict(r, _move=agency_move(R, X, doc) if doc else '')
        f['공고일'] = r.get(cols['date'])
        files = [x for x in (detail, doc) if x] or [path]
        rec = dict(src='agency_notice', rid=('agency', li['agency'], r.get(cols['no'])), file='; '.join(files),
                   pos='%s 행 %d (공고번호 %s, 제목 "%s")%s' % (os.path.basename(path), ln, r.get(cols['no']), t,
                                                        ' · 정정·재공고 묶음 %d건 중 최초' % n if n > 1 else ''),
                   how=how, fields=f, raw=OrderedDict(list(r.items()) + [('묶음_수', n), ('입주예정(공고문)', f['_move']),
                                                                          ('_file', path), ('_pos', '행 %d' % ln)]))
        for x in files:
            X.urls.setdefault(x, r.get(cols['url']) if x == detail else None)
        out.append(rec)
    return out


FINDERS = OrderedDict([('hub_basic', find_hub), ('lh_pdf', find_pdf), ('lh_completion', find_completion),
                       ('lh_supply_plan', find_plan), ('applyhome_x', find_applyhome), ('lh_notice_x', find_lh_notice), ('lh_notice_old', find_lh_notice_old),
                       ('hug', find_hug), ('myhome', find_myhome), ('lh_web', find_web), ('lh_web_pdf', find_webpdf), ('agency_notice', find_agency)])
ONCE = OrderedDict([('policy_table', find_policy_table), ('site_status', find_site_status)])  # 위치 키와 무관하게 사업마다 한 번


# ---------------------------------------------------------------- (a) 원장 행 → 원 레코드

def from_ledger(R, X, pid, k):
    """원장의 이 사업 행(HOME 유래 제외)을 원 레코드로 다시 찾는다 → (레코드 목록, 비고 목록, 경로 없는 행 수)."""
    ic = R.cfg['independent']
    pre = ic['home_ref_prefix']
    routes = ic['ledger']['routes']
    subj = R.subject_id(pid)
    recs, notes, unrouted = [], [], 0
    for r in X.idents.get(subj, []):
        if r['source_ref'].startswith(pre):
            continue
        rt = routes.get(r['source_ref'])
        if not rt or rt.get('identifier') != r['id_type']:
            unrouted += 1
            continue
        if rt['source'] == 'hub_basic':
            hit = X.hub_by_pk.get(r['id_value'])
            if not hit:
                notes.append('원장 %s=%s 의 원 레코드를 대용량에서 못 찾음' % (r['id_type'], r['id_value']))
                continue
            rec = hub_rec(X, ic['sources']['hub_basic'], hit[0], hit[1], '원장 identifiers %s=%s' % (r['id_type'], r['id_value']))
            for e in X.events.get(subj, []):
                if e['source_ref'] == r['source_ref'] and e.get('event_date'):
                    raw_dates = {digits(rec['fields'].get(cn)) for cn in ('승인_일', '착공_일', '사용_검사_일', '사용_검사_예정_일')}
                    if digits(e['event_date']) not in raw_dates:
                        rec['how'] += ' · 원장 %s %s 는 원 레코드에 없음' % (e['event_type'], e['event_date'])
            recs.append(rec)
        elif rt['source'] == 'lh_completion':
            ix = R.S.comp_idx
            d, b = (r['id_value'].split('|') + [''])[:2]
            for ln, x in R.S.comp_rows:
                if x[ix['district']] == d and x[ix['block']] == b:
                    c = R.src('lh_completion_csv')
                    recs.append(dict(src='lh_completion', rid=('comp', ln), file=c['path'], pos='CSV 행 %d' % ln,
                                     how='원장 identifiers %s=%s' % (r['id_type'], r['id_value']),
                                     fields=dict(zip(R.S.comp_header, x)),
                                     raw=OrderedDict(list(zip(R.S.comp_header, x)) + [('_file', c['path']), ('_pos', 'CSV 행 %d' % ln)])))
    nos = defaultdict(set)
    for r in X.nlinks.get(subj, []):
        if r['source_ref'].startswith(pre):
            continue
        rt = routes.get(r['source_ref'])
        if not rt or not rt.get('notice'):
            unrouted += 1
            continue
        nos[rt['source']].add(str(r['notice_id']))
    if nos.get('applyhome_x'):
        recs += find_applyhome(R, X, k, nos['applyhome_x'])
    if nos.get('lh_notice_x'):
        recs += find_lh_notice(R, X, k, nos['lh_notice_x'])
    for e in X.events.get(subj, []):
        if not e['source_ref'].startswith(pre) and e['source_ref'] not in routes:
            unrouted += 1
    return recs, notes, unrouted


def digits(v):
    """날짜 숫자열(월·일 0 채움, common.digits_date 한 곳의 규칙)."""
    return digits_date(v or '')


# ---------------------------------------------------------------- HOME 값(대조용)

def home_values(R, pid):
    """HOME 이 이 사업에 둔 단계별 값 {단계: {종류: [값]}}. 종류는 config sources[].stages 의 세 번째 칸.
    사실(fact)은 실제(ACTUAL)면 실제 종류(승인일·착공일·공고일), 계획(PLAN)은 같은 원천 종류의 계획(공사준공·LH준공예정·입주월)만 쓰고
    연 단위 정책 계획값(date_precision YEAR·PERIOD_END)과 상태·문서 사실은 대조에 쓰지 않는다."""
    pl = R.projects[pid]['payload']
    out = {c: defaultdict(list) for c in CODES}
    comp_srcs = set(R.src('lh_completion_csv')['home_source_ids'])

    def put(code, kind, v):
        if not _blank(v) and str(v) not in out[code][kind]:
            out[code][kind].append(str(v))
    put('02', '호수', pl.get('planned_units'))
    dev = pl.get('developer') or ''
    if dev and '확인' not in dev:
        put('02', '사업주체', dev)
    if pl.get('stage') == 'PLANNED_SUPPLY':
        put('02', '공급예정월', pl.get('schedule_month'))
        put('05', '공급예정월', pl.get('schedule_month'))
    put('04', '착공연도', pl.get('start_plan_year'))
    put('06', '입주연도', digits(pl.get('source_move_in_label'))[:4] if len(digits(pl.get('source_move_in_label'))) >= 4 else None)
    if shared_is_construction(R, R.projects[pid]['source_id']):
        put('04', '착공일', pl.get('start_actual_date'))
        put('04', '공사준공', pl.get('completion_plan_date'))
    stage_code = {sc['home_stage']: sc['code'] for sc in R.cfg['stages']}
    for (p_, st), e in sorted(R.se.items()):
        sel = e.get('selected') or {}
        if p_ == pid and st == 'APPROVAL' and sel.get('source_id') in R.src('hub_bulk')['home_source_ids']:
            put('03', '승인일', sel.get('event_date'))

    def facts(fs, src):
        for f in fs or []:
            code = stage_code.get(f.get('stage'))
            ms, d, kind = f.get('milestone'), f.get('date'), f.get('kind')
            if f.get('date_precision') == 'YEAR' or f.get('date_conversion'):
                year = {'03': '승인연도', '04': '착공연도', '06': '입주연도'}.get(code)
                if year and kind == 'PLAN' and (code != '04' or ms == 'CONSTRUCTION') and d:
                    put(code, year, str(d)[:4])
                continue
            if kind == 'ACTUAL':
                if code == '03' and ms in ('INITIAL_APPROVAL', 'AMENDED_APPROVAL', 'APPROVAL'):
                    put('03', '승인일', d)
                elif code == '04' and ms == 'CONSTRUCTION':
                    put('04', '착공일', d)
                elif code == '05' and ms == 'NOTICE':
                    put('05', '공고일', d)
            elif kind == 'PLAN':
                if code == '04' and ms == 'COMPLETION':
                    put('04', 'LH준공예정' if src in comp_srcs else '공사준공', d)
                elif code == '06' and ms == 'MOVE_IN':
                    put('06', '입주월', d)
    for r in sorted(R.D['evidence_bridge'], key=lambda x: x['entity_id']):
        if r['payload'].get('project_id') == pid:
            facts(r['payload'].get('facts'), r['payload'].get('source_id'))
    for r in sorted(R.D['document_evidence'], key=lambda x: x['entity_id']):
        if pid in (r['payload'].get('matched_project_ids') or []):
            facts(r['payload'].get('facts'), r['source_id'])
    for r in R.D['collection_link']:
        c = r['payload']
        if c.get('project_id') == pid and c.get('stage') in ('SUPPLY', 'MOVE_IN'):
            for l in c.get('links') or []:
                put('05' if c['stage'] == 'SUPPLY' else '06', '공고일' if c['stage'] == 'SUPPLY' else '입주월', l.get('date'))
    return out


def shared_is_construction(R, source_id):
    return source_id in R.src('lh_construction_pdf')['home_source_ids']


def siblings(R, pid):
    """같은 원장 사업 id 로 합쳐지는 HOME 레코드 전부(이 정책 밖 레코드 포함). basis 는 이 전부의 원천으로 정한다."""
    X = R.S.indep
    if getattr(X, 'subject_of', None) is None:
        from home import project_subject_ids
        with open(p(R.cfg['home']['id_map']), encoding='utf-8') as f:
            id_map = json.load(f)
        allp = sorted(R.projects)
        X.subject_of = project_subject_ids(R.D, allp, id_map, R.cfg['home']['id_keys'], R.cfg['home']['unmapped_prefix'])
        X.by_subject = defaultdict(list)
        for x in allp:
            X.by_subject[X.subject_of[x][0]].append(x)
    return X.by_subject.get(R.subject_id(pid)) or [pid]


def home_urls(R, pid):
    """HOME 이 이 사업(같은 원장 사업의 HOME 레코드 전부) 근거로 든 URL(퍼센트 인코딩을 풀어 비교용)."""
    from urllib.parse import unquote
    sib = set(siblings(R, pid))
    us = set()
    for x in sib:
        pl = R.projects[x]['payload']
        us |= {pl.get(y) for y in ('evidence_url', 'move_in_evidence_url', 'quantity_evidence_url')}
    for r in R.D['evidence_bridge']:
        if r['payload'].get('project_id') in sib:
            us.add(r['payload'].get('evidence_url'))
    return sorted(unquote(u) for u in us if u)


def home_sources(R, pid):
    """HOME 이 이 사업(같은 원장 사업의 HOME 레코드 전부)에서 읽은 원천 id: 사업 레코드 원천, 단계 근거의 선택·후보 원천,
    evidence_bridge·document_evidence·collection_link 원천."""
    sib = set(siblings(R, pid))
    s = {R.projects[x]['source_id'] for x in sib}
    for (x, _), e in R.se.items():
        if x in sib:
            for c in [e.get('selected') or {}] + list(e.get('candidates') or []):
                if c.get('source_id'):
                    s.add(c['source_id'])
    for r in R.D['evidence_bridge']:
        if r['payload'].get('project_id') in sib and r['payload'].get('source_id'):
            s.add(r['payload']['source_id'])
    for r in R.D['document_evidence']:
        if sib & set(r['payload'].get('matched_project_ids') or []):
            s.add(r['source_id'])
    for r in R.D['collection_link']:
        if r['payload'].get('project_id') in sib:
            s |= {l.get('source_id') for l in r['payload'].get('links') or [] if l.get('source_id')}
    for rows in R.rows.values():
        for r in rows:
            if r['project_id'] in sib and r['HOME_표'] not in CANDIDATE_TABLES and r['HOME_근거원천']:
                s.add(r['HOME_근거원천'])
    return s


# ---------------------------------------------------------------- 대조·행

def compare(kind, home, v):
    """HOME 값 목록과 원천 값 하나 → True/False/None, 범위 메모."""
    if kind in DATE_KINDS:
        rs = [same_period(h, v) for h in home]
        if any(x is True for x in rs):
            return True, ''
        return (None if all(x is None for x in rs) else False), ''
    if kind in YEAR_KINDS:
        y = digits(v)[:4]
        hs = [digits(h)[:4] for h in home if len(digits(h)) >= 4]
        if len(y) < 4 or not hs:
            return None, ''
        return y in hs, ''
    if kind == '호수':
        n = to_int(v)
        hs = [to_int(h) for h in home]
        if n is None or all(h is None for h in hs):
            return None, ''
        if n in hs:
            return True, ''
        return None, ' · 호수 범위: HOME %s / 원본 %s (전체·유형·공구 범위가 다를 수 있어 불일치로 세지 않음)' % ('/'.join(home), v)
    return None, ''


def records_rows(R, pid, code, src_key, recs, hv, hsrc):
    """같은 원천·같은 사업·같은 단계 레코드들 → 행(만든 행 수를 돌려준다). 값 칸이 모두 빈 레코드는 행을 만들지 않는다.
    HOME 값과 맞는 레코드가 하나라도 있으면 맞지 않는 다른 레코드는 원천값 수집."""
    ic = R.cfg['independent']
    c = ic['sources'][src_key]
    spec = c['stages'][code]
    home = hv[code]
    same = bool(set(c['home_source_ids']) & hsrc)
    res = []
    for rec in recs:
        vals = [(lab, rec['fields'].get(col) if col else None, kind) for lab, col, kind in spec]
        if all(_blank(v) for _, v, _ in vals):
            continue
        cmp_, extra = [], ''
        for lab, v, kind in vals:
            if kind and home.get(kind) and not _blank(v):
                ok, m = compare(kind, home[kind], v)
                extra += m
                cmp_.append((lab, ok, '/'.join(home[kind]), v))
        if code == '02' and c.get('developer') and home.get('사업주체'):
            cmp_.append(('사업주체', nz(c['developer']) in nz(home['사업주체'][0]), home['사업주체'][0],
                         '%s(%s 목록의 사업)' % (c['developer'], c['org'])))
        res.append((rec, vals, cmp_, extra))
    good = any(any(x[1] is True for x in cm) and not any(x[1] is False for x in cm) for _, _, cm, _ in res)
    stage = next(st for st, sc in R.stages.items() if sc['code'] == code)
    n = 0
    for rec, vals, cmp_, extra in res:
        n += 1
        same_doc = rec.get('doc_stem') and any(nz(rec['doc_stem'])[:20] in nz(u) for u in R.home_urls.get(pid, ()))
        nature = '같은 원천 재확인' if (same or same_doc) else '독립 원천 대조'
        done = [x for x in cmp_ if x[1] is not None]
        hval = ' · '.join('%s %s' % (x[0], x[2]) for x in cmp_)
        if not done:
            v = '원천값 수집'
            note = NO_EXTERNAL if not any(home.get(kind) for _, _, kind in vals if kind) else \
                '외부 입력과 비교할 수 있는 칸 없음 · 원천값 수집'
            hval = ''
        else:
            v, note = verdict_from(cmp_)
            if v == '불일치' and good:
                v, note, hval = '원천값 수집', '같은 사업의 다른 레코드(외부 입력과 맞는 레코드가 따로 있음) · ' + note, ''
        R.add(stage, pid, HOME_표=INDEP, HOME_근거원천='', HOME_근거키='', HOME_값=hval, HOME_근거_URL='', HOME_상태='미연결',
              원본_자료명=c['label'], 원본_파일=rec['file'], 원본_위치='%s · 키: %s' % (rec['pos'], rec['how']),
              원본_값=' · '.join(show_value(c, lab, val) for lab, val, _ in vals if not _blank(val)), 대조=v, 대조_성격=nature,
              비고='독립 수집 · %s%s · 원천 %s 기준 %s' % (note, extra, c['org'], c.get('as_of', '')))
        R.rows[stage][-1]['_doc_url'] = R.S.indep.urls.get(rec['file'])
        shown = [lab for lab, val, _ in vals if not _blank(val)]
        if c.get('plan') or (shown and all(lab in c.get('plan_fields', ()) for lab in shown)):
            R.rows[stage][-1]['_plan'] = True  # 계획값만 있는 행은 단계 도달 근거가 아니다
        R.use(R.sdir(stage), 'indep:' + src_key, None, rec['rid'], lambda: OrderedDict(rec['raw']))['관련_project_id'].add(pid)
    return n


def show_value(c, lab, val):
    """원본 값 글. 계획 칸(config plan_fields)은 '계획 <칸> YYYY-MM(<기관>)' 으로 계획임을 표시한다."""
    if lab not in c.get('plan_fields', ()):
        return '%s %s' % (lab, val)
    d = digits(val)
    ym = '%s-%s' % (d[:4], d[4:6]) if len(d) >= 6 else (d[:4] if len(d) >= 4 else str(val))
    return '계획 %s %s(%s)' % (lab, ym, c['org'])


def has_absent(R, pid, code):
    return any(r['project_id'] == pid and r['대조'] == '미도달 확인' for r in R.rows[stage_of(R, code)])


def lh_rule_05(R, pid, k, by, found, later):
    """LH 사업: LH 공고 두 목록(config lh_notice_old·lh_notice_x 창)과 다른 공고 원천에 없고 인허가 승인일이 모두 approval_after
    이후면 05 미도달(직접), 06 은 파생."""
    ic = R.cfg['independent']
    A = ic['absent']
    rule = A['05']['lh_rule']
    sc = ic['sources']
    subj = R.subject_id(pid)
    if R.S.indep.lh_old is None or not k['block_key'] or nz(rule['developer']) not in nz(k['developer']):
        return
    if has_absent(R, pid, '05') or set(found.get('05') or ()) & set(A['05']['searched']):
        return
    hubs = by.get('hub_basic') or []
    if not hubs:
        R.indep_why[(subj, '05')] = 'LH 공고 %s~ 에 없으나 인허가 기록을 위치 키로 못 찾아 공고 가능 시기를 정하지 못함' % (
            sc['lh_notice_old']['window'][0])
        return
    if not all(digits(r['fields'].get('승인_일')) >= rule['approval_after'] for r in hubs):
        R.indep_why[(subj, '05')] = 'LH 공고 %s~ 에 없으나 인허가 승인일이 %s 전이라 그 전 공고 가능(범위 밖)' % (
            sc['lh_notice_old']['window'][0], rule['approval_after'])
        return
    scope = '%s(%s) · %s · 승인일 %s · 그 밖 공고 원천 %s 에도 없음 · 조회 키: %s' % (
        sc['lh_notice_old']['label'], R.S.indep.lh_old_limit or '빠진 조각 없음', sc['lh_notice_x']['label'],
        ','.join(sorted({digits(r['fields'].get('승인_일')) for r in hubs})),
        ', '.join(sc[x]['label'] for x in A['05']['searched'] if x not in rule['notice_sources']), key_label(k))
    if later('05'):
        add_conflict(R, pid, '05', scope, '모집공고 없음 vs 원천 근거 있는 단계 %s' % ','.join(later('05')), k)
        return
    files = [sc['lh_notice_old']['path'], R.src('lh_notice')['notice_dir'] + '/notices.json']
    add_absent(R, pid, '05', scope, rule['note'], files)
    if not has_absent(R, pid, '06'):
        add_absent(R, pid, '06', '선행 단계 05 미도달(%s)' % scope, A['06']['note_from_05'], files, derived_from='05')


def pre_completion_06(R, pid, k, by):
    """착공했고 원천 준공(예정)일이 모두 원천 기준일 뒤이며 사용검사일이 없으면 06 미도달(파생 RULE, '파생: 04 준공 전')."""
    A = R.cfg['independent']['absent']
    rule = A['06']['pre_completion']
    sc = R.cfg['independent']['sources']
    if has_absent(R, pid, '06'):
        return
    started = [(src, digits(r['fields'].get(f))) for src, f in rule['started'] for r in by.get(src) or []
               if digits(r['fields'].get(f))]
    if not started:
        return
    if any(not _blank(r['fields'].get(f)) for src, f in rule['actual'] for r in by.get(src) or []):
        return
    comp = [(src, digits(r['fields'].get(f)), asof) for src, f, asof in rule['completion'] for r in by.get(src) or []
            if len(digits(r['fields'].get(f))) >= 6]
    if not comp or not all(d[:8] > digits(asof) for _, d, asof in comp):
        return
    latest = max(comp, key=lambda x: x[1])
    files = sorted({r['file'] for src, _, _ in comp for r in by.get(src) or []})
    scope = '착공 기록 %s · 준공(예정) %s · 조회 키: %s' % (
        ', '.join('%s %s' % (sc[src]['label'], d) for src, d in started),
        ', '.join('%s %s(기준일 %s)' % (sc[src]['label'], d, asof) for src, d, asof in comp), key_label(k))
    add_absent(R, pid, '06', scope, rule['note'], files[:3], derived_from='04',
               derived_text='파생: 04 준공 전(준공예정 %s-%s, %s·기준일 %s)' % (
                   latest[1][:4], latest[1][4:6], sc[latest[0]]['label'], latest[2]))


def pre_supply_05(R, pid, k, by, found):
    """LH 공급계획의 공급예정시기가 모두 공고 원천 기준일 뒤이고 공고 원천 어디에도 없으면 05 미도달(파생 RULE)."""
    A = R.cfg['independent']['absent']
    rule = A['05']['pre_supply']
    c = R.cfg['independent']['sources'][rule['source']]
    if has_absent(R, pid, '05') or (found.get('05') or set()) - {rule['source']}:
        return
    recs = by.get(rule['source']) or []
    months = [digits(r['fields'].get(rule['field'])) for r in recs]
    if not recs or any(len(m) < 6 for m in months):
        return
    if R.S.indep.lh_old is None and \
            any(w in (r['fields'].get(rule['note_field']) or '') for r in recs for w in rule['skip_note_words']):
        R.indep_why[(R.subject_id(pid), '05')] = '공급계획 비고에 %s — LH 공고 수집 시작(%s) 전 공고 가능성(범위 밖)' % (
            '·'.join(rule['skip_note_words']), R.src('lh_notice')['window_start'])
        return
    base = digits(rule['notice_as_of'])[:6]
    if not all(m[:6] > base for m in months):
        return
    scope = '%s 공급예정시기 %s > 공고 원천 기준 %s · 공고 원천 %s 에서 같은 키로 못 찾음 · 조회 키: %s' % (
        c['label'], ','.join(sorted(set(m[:6] for m in months))), rule['notice_as_of'],
        ', '.join(R.cfg['independent']['sources'][x]['label'] for x in A['05']['searched']), key_label(k))
    add_absent(R, pid, '05', scope, rule['note'], sorted({r['file'] for r in recs}), derived_from='05',
               derived_text='파생: 공급계획상 공급 전(공급예정 %s, %s)' % (
                   ','.join(sorted(set('%s-%s' % (m[:4], m[4:6]) for m in months))), c['label']))


def stage_of(R, code):
    return next(st for st, sc in R.stages.items() if sc['code'] == code)


def positive(R, pid, code):
    """그 단계에 도달했다는 원천 근거: 일치·불일치·원천값 수집 행 중 존재 확인·계획값(_plan) 이 아닌 것."""
    return any(r['project_id'] == pid and r['대조'] in POSITIVE and r['대조_성격'] != '존재 확인' and not r.get('_plan')
               for r in R.rows[stage_of(R, code)])


def add_absent(R, pid, code, scope, note, files=(), derived_from=None, derived_text=None):
    """미도달 확인 행. 원본_파일 = 찾아본 원천 파일(evidence 에서 파일마다 한 행), search_scope = 원천·기준일·조회 키.
    직접 원천 탐색으로 없음을 확인하면 basis INDEPENDENT, 선행 단계 미도달에서 이어서 판단하면(derived_from) basis RULE."""
    r = R.add(stage_of(R, code), pid, HOME_표=INDEP, HOME_근거원천='', HOME_근거키='', HOME_값='', HOME_근거_URL='',
              HOME_상태='미연결', 원본_자료명='독립 수집(미도달 확인)', 원본_파일='; '.join(files), 원본_위치='',
              원본_값='', 대조='미도달 확인', 대조_성격='규칙 파생' if derived_from else '독립 원천 대조',
              비고='독립 수집 · ' + (derived_text + ' · ' if derived_text else '파생: %s 미도달 · ' % derived_from if derived_from else '') + note)
    r['_scope'] = scope
    r['_doc_url'] = R.S.indep.urls.get(files[0]) if files else None


def diagnose(R, k):
    """단계 순서 모순의 추정 원인(config review): 같은 시도 건축HUB 에서 지구명이 나오는 기록을 본다 → (원인, 탐색 결과)."""
    X = R.S.indep
    rv = R.cfg['independent']['review']
    if not k['block_key']:
        return rv['cause_name'], '이름 키 %s 로 건축HUB·공고 원천에서 못 찾음' % '/'.join(k['names'])
    ix = X.hub_ix
    base = k['base']
    same = [(ln, r) for ln, r, t in X.hub_by_sido.get(k['sido'], []) if base and base in t]
    if not same:
        short = base[2:] if len(base) > 4 else ''
        same = [(ln, r) for ln, r, t in X.hub_by_sido.get(k['sido'], []) if short and short in t]
    if not same:
        return rv['cause_none'], '시도 %s 건축HUB 에 지구명 %s 이 나오는 기록 없음' % (k['sido'], base)
    digits = re.sub(r'\D', '', k['nb'] or '')
    sample = '; '.join('행 %d %s|%s|%s' % (ln, r[ix['name']], r[ix['district']], r[ix['block']]) for ln, r in same[:3])
    bad = [x for x in same if not re.search(r'\d', x[1][ix['block']] or '') and not re.search(r'\d', x[1][ix['name']])]
    near = [x for x in same if digits and re.sub(r'\D', '', norm_block(x[1][ix['block']])) == digits]
    if near:
        return rv['cause_block'], '지구명 기록 %d건 중 블록 숫자가 같은 기록 %d건(%s)' % (len(same), len(near), '; '.join(
            '행 %d 블록 %s' % (ln, r[ix['block']]) for ln, r in near[:3]))
    if bad:
        return rv['cause_hub'], '지구명 기록 %d건 중 블록·건물명에 블록 번호가 없는 기록 %d건(%s)' % (len(same), len(bad), '; '.join(
            '행 %d %s|%s' % (ln, r[ix['name']], r[ix['block']]) for ln, r in bad[:3]))
    return rv['cause_name'], '지구명 기록 %d건이 있으나 블록 %s 와 맞는 기록 없음(예: %s)' % (len(same), k['block'], sample)


def diagnose_notice(R, pid, k):
    """05 모순: 뒤 단계 근거의 원천과, 같은 지구명이 나오는 LH 공고 제목(두 목록) 예."""
    X = R.S.indep
    rv = R.cfg['independent']['review']
    srcs = sorted({r['원본_자료명'] for c in ('06',) for r in R.rows[stage_of(R, c)]
                   if r['project_id'] == pid and r['대조'] in POSITIVE and not r.get('_plan')})
    titles = []
    for it in list(X.lh_old or []) + [x for _, x in R.S.lh_notices.values()]:
        t = it.get('PAN_NM') or ''
        if k.get('base') and k['base'] in t.replace(' ', ''):
            titles.append(t)
    return rv['cause_notice'], '06 근거 원천: %s · 지구명 %s 이 든 LH 공고 %d건(예: %s)' % (
        ', '.join(srcs) or '없음', k.get('base'), len(titles), ' / '.join(sorted(set(titles))[:3]))


def add_conflict(R, pid, code, scope, why, k=None):
    R.add(stage_of(R, code), pid, HOME_표=INDEP, HOME_근거원천='', HOME_근거키='', HOME_값='', HOME_근거_URL='',
          HOME_상태='미연결', 원본_자료명='독립 수집(미도달 판단 보류)', 원본_파일='', 원본_위치='', 원본_값='', 대조='비교 불가',
          대조_성격='', 비고='독립 수집 · 단계 순서 모순: %s · 찾아본 범위: %s' % (why, scope))
    cause, found = (diagnose_notice(R, pid, k) if code == '05' else diagnose(R, k)) if k else ('', '')
    R.order_issues.append(OrderedDict([('subject_id', R.subject_id(pid)), ('project_id', pid), ('단계', code),
                                       ('HOME_주장', why), ('원천_탐색', scope), ('탐색_결과', found), ('추정_원인', cause)]))
    R.indep_why[(R.subject_id(pid), code)] = '단계 순서 모순(미도달 판단 보류)'


def run(R):
    """engine.process 가 단계 모듈·웹 결과 반영 뒤에 부른다."""
    ic = R.cfg['independent']
    X = load(R)
    R.order_issues = []
    R.home_urls = {}
    R.indep_why = {}
    R.indep_stats = defaultdict(int)
    for pid in R.pids:
        k = project_keys(R, X, pid)
        recs, lnotes, unrouted = from_ledger(R, X, pid, k)
        R.indep_stats['원장 행(경로 없음)'] += unrouted
        R.indep_stats['원장 행 → 원 레코드'] += len(recs)
        seen = {r['rid'] for r in recs}
        usable = bool(k['block_key'] or k['name'])
        if usable:
            small = 0
            for kb in per_block(k, ic['keys']):
                for key, fn in FINDERS.items():
                    for rec in fn(R, X, kb):
                        if kb.get('alias'):
                            rec['how'] += ' · 블록 ' + kb['alias']
                        if rec['rid'] not in seen:
                            seen.add(rec['rid'])
                            recs.append(rec)
                small += kb.get('hub_small') or 0
            k['hub_small'] = small
        for key, fn in ONCE.items():
            for rec in fn(R, X, k):
                if rec['rid'] not in seen:
                    seen.add(rec['rid'])
                    recs.append(rec)
        hv = home_values(R, pid)
        R.home_urls[pid] = home_urls(R, pid)
        hsrc = home_sources(R, pid)
        by = defaultdict(list)
        for rec in recs:
            by[rec['src']].append(rec)
        found = defaultdict(set)
        for key in list(FINDERS) + list(ONCE):
            for code in ic['sources'][key]['stages']:
                if by.get(key) and records_rows(R, pid, code, key, by[key], hv, hsrc):
                    found[code].add(key)
        absent(R, pid, k, usable, by, found, lnotes)


def absent(R, pid, k, usable, by, found, lnotes):
    ic = R.cfg['independent']
    A = ic['absent']
    sc = ic['sources']
    subj = R.subject_id(pid)
    if not usable:
        for code in CODES:
            R.indep_why[(subj, code)] = '위치 키 없음(지구·블록, 시군구+이름 모두 없음)'
        return
    claims = ic['keys']['home_stage_claims']
    claim = claims.get(k.get('claim'))
    later = lambda code: [c for c in CODES if c >= code and positive(R, pid, c)] + (
        ['HOME 단계 주장 %s(%s)' % (k['claim'], claim)] if claim and claim >= code else [])
    hub = sc['hub_basic']
    scope03 = '%s · %s · 조회 키: %s' % (hub['label'], hub['scope'], key_label(k))
    a03 = False
    if not by.get('hub_basic'):
        mu = A['03']['min_units']
        if k.get('hub_small'):
            R.indep_why[(subj, '03')] = '인허가 기록은 총세대수 0 기록만 있음(판단 보류)'
        elif k['units'] is not None and k['units'] < mu:
            R.indep_why[(subj, '03')] = '범위 밖: 호수 %d < %d(건축법 허가 대상일 수 있음)' % (k['units'], mu)
        elif later('03'):
            add_conflict(R, pid, '03', scope03, '인허가 기록 없음 vs 원천 근거 있는 단계 %s' % ','.join(later('03')), k)
        else:
            add_absent(R, pid, '03', scope03, A['03']['note'] + (' · ' + '; '.join(lnotes) if lnotes else ''), [hub['zip']])
            a03 = True
    if a03:
        for code in ('04', '05', '06'):
            if code == '05' and found.get('05'):
                continue
            extra = ''
            if code == '05':
                extra = ' · 공고 원천 %s 에서도 같은 키로 찾은 공고 없음' % ', '.join(sc[x]['label'] for x in A['05']['searched'])
            add_absent(R, pid, code, '선행 단계 03 미도달(%s)%s' % (scope03, extra), A[code]['note'], [hub['zip']],
                       derived_from=A[code]['derive_from'])
    else:
        lh_rule_04(R, pid, k, by, later, key_label(k))
        agency_rule_05(R, pid, k, by, found, later)
        pre_supply_05(R, pid, k, by, found)
        lh_rule_05(R, pid, k, by, found, later)
        pre_completion_06(R, pid, k, by)
    why = ic['unverified_reasons']
    for code in CODES:
        if not found.get(code) and (subj, code) not in R.indep_why:
            R.indep_why[(subj, code)] = why['02_name'] if code == '02' and not k['block_key'] else why[code]


def agency_rule_05(R, pid, k, by, found, later):
    """SH·GH·iH 사업: 그 기관 모집공고 목록 범위에 공고가 없고 인허가 승인일이 모두 범위 시작 뒤면 05 미도달(직접), 06 은 파생."""
    ic = R.cfg['independent']
    A = ic['absent']
    rule = A['05']['agency_rule']
    c = ic['sources'][rule['source']]
    li = next((x for x in c['lists'] if x['sido'] == k['sido'] and any(nz(n) in nz(k['developer']) for n in x['names'])), None)
    if not li or found.get('05') or (R.subject_id(pid), '05') in R.indep_why and R.indep_why[(R.subject_id(pid), '05')] == '미도달 확인':
        return
    hubs = by.get('hub_basic') or []
    if not hubs or not all(digits(r['fields'].get('승인_일')) >= rule['approval_after'] for r in hubs):
        R.indep_why[(R.subject_id(pid), '05')] = '%s 사업이나 인허가 승인일이 %s 전이거나 기록 없음(그 전 공고는 목록 범위 밖)' % (
            li['agency'], rule['approval_after'])
        return
    scope = '%s(%s · %s) · 승인일 %s · 그 밖 공고 원천 %s 에도 없음 · 조회 키: %s' % (
        c['label'], li['agency'], li['scope_note'], ','.join(sorted({digits(r['fields'].get('승인_일')) for r in hubs})),
        ', '.join(ic['sources'][x]['label'] for x in A['05']['searched'] if x != rule['source']), key_label(k))
    if later('05'):
        add_conflict(R, pid, '05', scope, '모집공고 없음 vs 원천 근거 있는 단계 %s' % ','.join(later('05')), k)
        return
    lst = c['dir'] + '/' + li['path']
    add_absent(R, pid, '05', scope, rule['note'], [lst])
    add_absent(R, pid, '06', '선행 단계 05 미도달(%s)' % scope, A['06']['note_from_05'], [lst], derived_from='05')


def lh_rule_04(R, pid, k, by, later, keytxt):
    """LH 사업: 공사추진현황·준공예정에 없고 인허가 기록의 착공일·사용검사일이 비면 착공 미도달."""
    sc = R.cfg['independent']['sources']
    A = R.cfg['independent']['absent']
    rule = A['04']['lh_rule']
    hub = sc['hub_basic']
    if not (k['block_key'] and nz(rule['developer']) in nz(k['developer']) and by.get(rule['need']) and
            not any(by.get(x) for x in rule['not_in'])):
        return
    hubs = by[rule['need']]
    if not all(all(_blank(r['fields'].get(c)) for c in rule['hub_empty']) for r in hubs):
        return
    scope = '%s(%s)·%s(%s)에 없음, %s 기록 %d건의 %s 빈칸 · 조회 키: %s' % (
        sc['lh_pdf']['label'], sc['lh_pdf']['as_of'], sc['lh_completion']['label'], sc['lh_completion']['as_of'],
        hub['label'], len(hubs), '·'.join(rule['hub_empty']), keytxt)
    if later('04'):
        add_conflict(R, pid, '04', scope, '착공 기록 없음 vs 원천 근거 있는 단계 %s' % ','.join(later('04')), k)
    else:
        add_absent(R, pid, '04', scope, A['04']['note'],
                   [R.stage_file('lh_construction_pdf'), R.src('lh_completion_csv')['path'], hub['zip']])
