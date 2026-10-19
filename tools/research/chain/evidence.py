"""설계 5.2·6.1 의 중간 출력 _work/<policy_id>/evidence.jsonl 행 만들기.

항목 = (subject_table, subject_id, field).
- 사업 × 단계: ('projects', 원장 사업 id, 'stage_NN'). 단계 추출 행 하나 = evidence 행 하나(근거 없는 기대 항목은 UNVERIFIED 행).
- 프로그램 → 사업 연결: ('links', 'PROGRAM_PROJECT|<프로그램 id>|<사업 id>', 'program_project'). 구분자 '|'(설계 5.2).
- 사업 × 단계 행 중 원 파일이 여럿인 대조는 파일마다 한 행, 독립 수집 미도달 행은 search_scope 를 채운다.
"""

import json
import os
import re

from common import p, VERDICT_EN, BASIS_EN, NAME_MATCH
from home import site_matches

COLS = ['policy_id', 'subject_table', 'subject_id', 'field', 'external_ref', 'stage_code', 'dataset_value',
        'external_value', 'doc_url', 'doc_path', 'locator', 'original_value', 'verdict', 'basis', 'search_scope',
        'checked_by', 'checked_at', 'notes']


def _n(v):
    return v if v not in ('', None) else None


def web_fetched_at(R):
    """원본/web/manifest.json 의 파일별 받은 날짜(AGENT 판정의 checked_at)."""
    out = {}
    for sc in R.stages.values():
        mf = '%s/%s/원본/web/manifest.json' % (R.out, sc['dir'])
        if not os.path.exists(p(mf)):
            continue
        with open(p(mf), encoding='utf-8') as f:
            m = json.load(f)
        for e in (m.get('files') or {}).values():
            d = (e.get('fetched_at') or m.get('fetched_at') or '')[:10]
            if d:
                out['%s/%s/원본/web/%s' % (R.out, sc['dir'], e['filename'])] = d
    return out


def doc_urls(R):
    out = {}
    for c in R.cfg['sources'].values():
        out.update(c.get('doc_urls') or {})
    return out


def split_locator(loc, path, files):
    """한 행의 원본_위치(' · ' 로 이은 조각)에서 이 파일 조각만 남긴다. 파일 이름이 든 조각이 없으면 전체, '키 …' 조각은 늘 남긴다."""
    if not loc or len(files) < 2:
        return loc
    parts = loc.split(' · ')
    base = os.path.basename(path)
    mine = [x for x in parts if base in x]
    if not mine:
        return loc
    return ' · '.join(x for x in parts if x in mine or x.startswith('키'))


def stage_rows(R):
    """단계 추출 행 → evidence 행. 한 대조에 원 파일이 여럿이면(원본_파일 '; ' 구분) 파일마다 한 행(설계 5.2)."""
    checked_at = R.cfg['checked_at']
    fetched = web_fetched_at(R)
    urls = doc_urls(R)
    out = []
    for stage, sc in R.stages.items():
        for r in R.rows[stage]:
            files = [x for x in (r['원본_파일'] or '').split('; ') if x]
            web = r.get('_web')
            verdict = VERDICT_EN[r['대조']]
            notes = ['HOME %s(%s)' % (r['HOME_표'] or '근거 없음', r['HOME_상태'])]
            if r['HOME_근거_URL']:
                notes.append('HOME 근거 URL ' + r['HOME_근거_URL'])
            if len(files) > 1:
                notes.append('한 대조의 원본 %d개 중 하나(파일마다 한 행)' % len(files))
            if r['비고']:
                notes.append(r['비고'])
            tail = ''
            if r['HOME_표'] == NAME_MATCH and '교차 후보' not in r['비고']:
                tail = ' · HOME 이 잇지 않은 교차 후보'
            by_file = r.get('_by_file') or {}
            for doc_path in files or [None]:
                loc, val, nts_extra = split_locator(r['원본_위치'], doc_path or '', files), r['원본_값'], []
                if len(files) > 1:
                    if doc_path in by_file:
                        loc, val = by_file[doc_path]
                    elif doc_path:
                        nts_extra = ['원본 값은 파일 %d개를 함께 본 값(파일별로 나눌 수 없음)' % len(files)]
                doc_url = None
                if web:
                    doc_url = _n(web['url'])
                elif verdict == 'NO_ORIGINAL':
                    doc_url = _n(r['HOME_근거_URL'])
                elif doc_path:
                    doc_url = urls.get(doc_path) or r.get('_doc_url')
                nts = [x for x in notes if not (doc_url and x == 'HOME 근거 URL ' + doc_url)] + nts_extra
                out.append(dict(
                    policy_id=R.policy['policy_id'], subject_table=R.cfg['home']['subject_table'],
                    subject_id=R.subject_id(r['project_id']), field='stage_' + sc['code'], external_ref=r['project_id'],
                    stage_code=sc['code'], dataset_value=_n(val), external_value=_n(r['HOME_값']),
                    doc_url=doc_url, doc_path=doc_path, locator=_n(loc), original_value=_n(val), verdict=verdict, basis=BASIS_EN[r['대조_성격']],
                    search_scope=r.get('_scope'), checked_by='AGENT' if web else 'TOOL',
                    checked_at=(fetched.get(doc_path) or checked_at) if web else checked_at,
                    notes=' · '.join(nts) + tail))
    return out


def program_ids(R):
    """HOME 프로그램 이름 → 프로그램 id(home_program_mapping, 이 정책 것)."""
    out = {}
    for r in sorted(R.D['home_program_mapping'], key=lambda x: x['id']):
        if r.get('policy_id') == R.policy['home_policy_id']:
            out.setdefault(r.get('name'), r['id'])
    return out


def site_rules(R):
    return ((R.cfg.get('independent') or {}).get('keys') or {}).get('site_name_rules') or {}


def site_attribution(R, s):
    """정책 지명 행이 이 정책에 귀속되는지 → (True/False, 이유). 문서로 판정한다(config independent.link_attribution):
    doc_path 가 정책 docs_dir 안이면 원문, 폴더가 '<부모slug>_후속_…' 이고 부모가 이 정책 하나면 후속 발표 귀속, 그 밖은 공통 언급."""
    la = (R.cfg.get('independent') or {}).get('link_attribution')
    if not la:
        return True, ''
    rs = la.get('row_status') or {}
    st = s.get(rs.get('field')) if rs else None
    if st == rs.get('own') and R.policy['policy_id'] in (s.get(rs['ids']) or []):
        return True, ''  # 행 단위 귀속(표·절 머리 등): 다부모 문서라도 쓴다
    if st == rs.get('other') or (st == rs.get('own') and R.policy['policy_id'] not in (s.get(rs['ids']) or [])):
        return False, '%s: %s' % (rs['other'], ','.join(s.get(rs['ids']) or []))
    path = (s.get('doc_path') or '').rstrip('/')
    docs_dir = (R.policy.get('docs_dir') or '').rstrip('/')
    folder = os.path.dirname(path)
    if docs_dir and path.startswith(docs_dir + '/'):
        return True, ''
    m = re.match(la['followup_dir_regex'], os.path.basename(folder))
    if m:
        parents = m.group(1).split(la['parent_sep'])
        if parents == [R.policy['slug']]:
            return True, ''
        return False, '%s: 후속 발표의 부모 정책 %s' % (la['shared_note'], '·'.join(parents))
    return False, '%s: %s' % (la['shared_note'], os.path.basename(folder))


def program_home_url(R, prog):
    for r in sorted(R.D['home_program_mapping'], key=lambda x: x['id']):
        if r.get('policy_id') == R.policy['home_policy_id'] and r.get('name') == prog and r.get('evidence_url'):
            return r['evidence_url']
    return None


def program_same_source(R, prog, pc):
    """HOME 이 그 프로그램 근거로 원문과 같은 파일(정책 canonical_url 또는 원문 파일 이름이 든 URL)을 썼으면 True."""
    from urllib.parse import unquote
    u = program_home_url(R, prog)
    if not u:
        return False
    if R.policy.get('canonical_url') and u.split('#')[0] == R.policy['canonical_url']:
        return True
    stem = re.sub(r'[\s_]', '', os.path.splitext(os.path.basename(pc.get('doc_path') or ''))[0])[:20]
    return bool(stem) and stem in re.sub(r'[\s_]', '', unquote(u))


def link_rows(R):
    """프로그램 → 사업 연결. 프로그램이 원문에 없으면 NOT_IN_SOURCE(프로그램 원문 대조표, AGENT),
    정책 원문 지명(policy_sites.jsonl)이 사업과 맞으면 MATCH/INDEPENDENT(TOOL), 그 밖은 UNVERIFIED."""
    checked_at = R.cfg['checked_at']
    pids_of = program_ids(R)
    out = []
    for pid in R.pids:
        pl = R.projects[pid]['payload']
        prog = pl.get('program') or ''
        subj = 'PROGRAM_PROJECT|%s|%s' % (pids_of.get(prog) or prog, R.subject_id(pid))
        base = dict(policy_id=R.policy['policy_id'], subject_table='links', subject_id=subj, field='program_project',
                    external_ref=pid, stage_code='01', external_value='HOME 프로그램 %s · 사업 %s' % (prog, pl.get('name')),
                    search_scope=None)
        rows = []
        pc = R.prog_check.get(prog)
        if pc and pc['verdict'] == 'NOT_IN_SOURCE':
            same = program_same_source(R, prog, pc)
            rows.append(dict(base, dataset_value=None, doc_url=None if pc['doc_path'] else _n(R.policy.get('canonical_url')),
                             doc_path=_n(pc['doc_path']), locator=_n(('p.%s' % pc['page']) if pc['page'] else pc['locator']),
                             original_value=_n(pc['quote'] or pc['raw']), verdict='NOT_IN_SOURCE',
                             basis='SAME_SOURCE' if same else 'INDEPENDENT', checked_by='AGENT', checked_at=checked_at,
                             notes='프로그램이 정책 원문에 없음(%s: %s) · HOME 프로그램 근거 %s' % (
                                 pc['check_file'], pc['raw'], '같은 원문 파일' if same else '다른 문서(%s)' % (
                                     program_home_url(R, prog) or '없음'))))
        shared = []
        for s, how in site_matches(pl, R.sites or [], site_rules(R)):
            ok, why_s = site_attribution(R, s)
            if not ok:
                shared.append('%s(%s p.%s)' % (why_s, os.path.basename(s.get('doc_path') or ''), s.get('page')))
                continue
            rows.append(dict(base, dataset_value=_n(s.get('site_name')), doc_url=None, doc_path=_n(s.get('doc_path')),
                             locator=_n('p.%s' % s['page'] if s.get('page') not in (None, '') else None),
                             original_value=_n(s.get('quote')), verdict='MATCH', basis='INDEPENDENT', checked_by='TOOL',
                             checked_at=checked_at,
                             notes='정책 원문 지명 연결(%s) · 원문 프로그램 %s' % (how, s.get('program_name') or '없음')))
        if not rows:
            why = ('프로그램 원문 대조: %s' % pc['raw']) if pc else '프로그램 원문 대조표에 없음'
            why += ' · ' + ('정책 원문 지명(policy_sites.jsonl)에 이 정책에 귀속된 이 사업 지명 없음' if R.sites is not None
                            else 'policy_sites.jsonl 없음(지명 연결 건너뜀)')
            if shared:
                why += ' · 연결 확인에 쓰지 않은 지명: ' + '; '.join(sorted(set(shared)))
            rows.append(dict(base, dataset_value=None, doc_url=None, doc_path=None, locator=None, original_value=None,
                             verdict='UNVERIFIED', basis=None, checked_by='TOOL', checked_at=checked_at, notes=why))
        out += rows
    return out


CONFIRMED = ('MATCH', 'MISMATCH', 'SOURCED', 'NOT_IN_SOURCE', 'ABSENT_CONFIRMED')


def require_doc(r):
    """확인된 판정(설계 1절)에는 문서가 있어야 한다: doc_url·doc_path 가 모두 비면 UNVERIFIED 로 내리고 이유를 남긴다."""
    if r['verdict'] in CONFIRMED and not r.get('doc_url') and not r.get('doc_path'):
        r = dict(r, verdict='UNVERIFIED', basis=None,
                 notes=(r.get('notes') or '') + ' · 근거 문서 없음(doc_url·doc_path 빈칸)이라 확인 판정(%s)을 UNVERIFIED 로 내림' % r['verdict'])
    return r


def build(R):
    rows = [require_doc(r) for r in stage_rows(R) + link_rows(R)]
    uniq = {}
    for r in rows:
        r = {c: r.get(c) for c in COLS}
        uniq[json.dumps(r, ensure_ascii=False, sort_keys=True)] = r
    key = lambda r: tuple('' if r[c] is None else str(r[c]) for c in
                          ('subject_table', 'subject_id', 'field', 'external_ref', 'doc_path', 'locator', 'verdict',
                           'basis', 'original_value', 'external_value', 'notes', 'doc_url'))
    return sorted(uniq.values(), key=key)
