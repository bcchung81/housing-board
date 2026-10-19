"""품질 지표 M1~M3(설계 docs/speech/research/파이프라인_설계.md 1절) → 품질_리포트.md·.csv, dataset/_work/미확인_항목.csv.

M1 원천 확인률(정책별·항목 범주별): 항목 = evidence 의 (subject_table, subject_id, field). 확인됨 = verdict ∈ {MATCH,
   MISMATCH, SOURCED, NOT_IN_SOURCE, ABSENT_CONFIRMED} 이고 basis ≠ EXISTENCE 인 기록이 하나라도 있음.
   세 기준(분모는 모두 전체 항목, explain.py·explain_deck.py 와 같은 값): 미도달 포함(M1) · 파생 미도달 제외(확인 기록에서
   verdict ABSENT_CONFIRMED 이면서 basis RULE 인 것을 뺌, M1(파생 미도달 제외)) · 미도달 제외(ABSENT_CONFIRMED 를 모두 뺌, M1(ABSENT 제외)).
M2 출처 목록 완전성: canonical_url·sha256 중복, 디스크 원 파일 미등록, evidence 참조 못 이음, 보존율(evidence 가 가리키는 문서 ·
   전체 목록), manifest 첨부 등록률, 발행기관 채움.
M3 정확도: dataset/_work/audit/*.csv(열 evidence_id, audit_result = OK|ERROR) 가 있으면 오류율, 없으면 '미측정'.
M4 누락 검증: dataset/_work/*/gaps.jsonl 이 있으면 정책·단계별 후보 수·판정별 수·판정 안 된 후보 수(목표 0), 없으면 '미측정'.
"""
import csv
import glob
import io
import os
import re
from collections import Counter, defaultdict

import catalog
import ids

GOV_DOC_TYPES = {'PRESS_RELEASE', 'AGENDA', 'BRIEFING', 'CLARIFICATION', 'GOSI', 'RECRUIT_NOTICE'}   # 정책·고시·공고 문서
CONFIRM = {'MATCH', 'MISMATCH', 'SOURCED', 'NOT_IN_SOURCE', 'ABSENT_CONFIRMED'}
REPORT_COLS = ['지표', '정책', '범주', '분자', '분모', '값', '목표', '판정']
GUESS_COLS = ['doc_id', '단계', '문서유형', '형식', '자료명', 'url', '저장파일', '추정_기관', '게시사이트']
UNCONFIRMED_COLS = ['policy_id', '범주', 'subject_table', 'subject_id', 'field', 'stage_code', '판정_수', 'doc_id']


def category(e):
    t, sid = e['subject_table'], e['subject_id'] or ''
    if t == 'policies':
        return '정책 값'
    if t == 'policy_targets':
        return '정책 목표'
    if t == 'programs':
        return '프로그램'
    if t == 'links':
        sid = ids.subject_key(t, sid, e['field'])
        return {'POLICY_PROGRAM': '정책→프로그램', 'PROGRAM_PROJECT': '프로그램→사업', 'POLICY_PROJECT': '정책→사업'}.get(sid.split('|')[0], '연결')
    m = re.match(r'^stage_(0[1-6])$', e['field'] or '')
    return '사업×단계 %s' % (m.group(1) if m else (e['stage_code'] or ''))


def is_confirming(e, with_absent=True):
    return e['verdict'] in CONFIRM and e['basis'] != 'EXISTENCE' and (with_absent or e['verdict'] != 'ABSENT_CONFIRMED')


def is_derived_absent(e):
    """파생 미도달: 선행 단계 미도달에서 이어서 판단한 미도달(verdict ABSENT_CONFIRMED · basis RULE)."""
    return e['verdict'] == 'ABSENT_CONFIRMED' and e['basis'] == 'RULE'


def pct(n, d):
    return None if not d else round(100.0 * n / d, 1)


def fmt_pct(v):
    return '—' if v is None else '%.1f%%' % v


def m1(evidence):
    items = defaultdict(list)
    for e in evidence:
        items[(e['policy_id'], e['subject_table'], ids.subject_key(e['subject_table'], e['subject_id'], e['field']), e['field'])].append(e)
    stat = defaultdict(Counter)   # (정책, 범주) → 셈
    unconfirmed, not_in_source = [], []
    for key, evs in sorted(items.items()):
        cat_ = category(evs[0])
        conf = [e for e in evs if is_confirming(e)]
        conf_na = [e for e in evs if is_confirming(e, False)]
        conf_nd = [e for e in conf if not is_derived_absent(e)]
        for k in [(key[0], cat_), (key[0], '전체')]:
            s = stat[k]
            s['total'] += 1
            s['confirmed'] += bool(conf)
            s['absent_only'] += bool(conf) and not conf_na
            s['confirmed_na'] += bool(conf_na)
            s['confirmed_nd'] += bool(conf_nd)
            s['sourced'] += any(e['verdict'] == 'SOURCED' for e in conf)
            if conf:
                best = sorted(conf, key=lambda e: {'INDEPENDENT': 0, 'RULE': 1, 'SAME_SOURCE': 2}.get(e['basis'], 3))[0]
                s['basis:' + (best['basis'] or '없음')] += 1
        if any(e['verdict'] == 'NOT_IN_SOURCE' for e in evs):
            not_in_source.append(key)
        if not conf:
            v = Counter(e['verdict'] for e in evs)
            unconfirmed.append([key[0], cat_, key[1], key[2], key[3], evs[0]['stage_code'] or '',
                                ' · '.join('%s %d' % kv for kv in sorted(v.items())),
                                ';'.join(sorted({e['doc_id'] for e in evs if e['doc_id']}))])
    return stat, unconfirmed, not_in_source


def m2(cat, docs, evidence, unresolved):
    r = {}
    canon = Counter(d['canonical_url'] for d in docs if d['canonical_url'])
    shas = Counter(d['sha256'] for d in docs if d['sha256'])
    r['canonical_dup'] = sum(1 for v in canon.values() if v > 1)
    r['sha_dup'] = sum(1 for v in shas.values() if v > 1)
    # 디스크 원 파일(파생물 제외) 중 목록에 없는 것 — catalog 와 따로 다시 훑는다
    disk, unreg = 0, []
    for d, _dirs, fs in os.walk(cat.abs(cat.research)):
        rd = cat.rel(d)
        if '/원본/' not in rd + '/':
            continue
        for f in sorted(fs):
            rel = rd + '/' + f
            if f.startswith('.') or rel in cat.derived:
                continue
            disk += 1
            if catalog.sha256_file(cat.abs(rel)) not in shas:
                unreg.append(rel)
    r['disk_files'], r['disk_unregistered'] = disk, sorted(unreg)
    r['unresolved'] = unresolved
    ev_docs = {e['doc_id'] for e in evidence if e['doc_id']}
    by = {d['doc_id']: d for d in docs}
    r['ev_docs'] = len(ev_docs)
    r['ev_saved'] = sum(1 for x in ev_docs if by.get(x, {}).get('saved'))
    r['all_docs'], r['all_saved'] = len(docs), sum(1 for d in docs if d['saved'])
    att_ok = sum(1 for parent, rel, url in cat.attachments if cat.lookup(path=rel, url=url)[0])
    r['attachments'], r['attachments_registered'] = len(cat.attachments), att_ok
    r['attachments_saved'] = sum(1 for _, rel, _u in cat.attachments if rel)
    r['org_filled'] = sum(1 for d in docs if d['publisher_org'])
    r['dept_filled'] = sum(1 for d in docs if d['publisher_dept'])
    r['pub_methods'] = Counter(cat.pub_method.get(d['doc_id'], '도메인 추정') for d in docs)
    r['org_source_checked'] = sum(v for k, v in r['pub_methods'].items() if k != '도메인 추정')
    r['org_domain_guess'] = r['pub_methods'].get('도메인 추정', 0)
    gov = [d for d in docs if d['doc_type'] in GOV_DOC_TYPES]
    r['gov_docs'], r['gov_dept_filled'] = len(gov), sum(1 for d in gov if d['publisher_dept'])
    r['ambiguous_urls'] = sorted(cat.ambiguous.items())
    legacy_docs = set()
    for kind, v in cat.legacy_map:
        legacy_docs.add(cat.lookup(path=v)[0] if kind == 'file' else cat.lookup(url=v)[0] if kind == 'url' else None)
    r['legacy_rows'], r['legacy_docs'] = len(cat.legacy_map), len(legacy_docs - {None})
    r['legacy_unmapped'] = sum(1 for kind, v in cat.legacy_map if kind == 'missing')
    r['not_saved_reasons'] = Counter(d['not_saved_reason'] for d in docs if not d['saved'])
    return r


def audit_version(path):
    """감사 파일 판 순서: 파일 이름의 날짜(8자리)·회차(_r2·_2·-2 등 뒤 숫자)·이름."""
    name = os.path.basename(path)
    date = (re.findall(r'(20\d{6})', name) or ['0'])[-1]
    rest = name.split(date, 1)[-1] if date != '0' else name
    rnd = re.findall(r'[_-]r?(\d{1,2})(?=\D*$)', rest)
    return (date, int(rnd[-1]) if rnd else 0, name)


def audit_summary(audit_dir):
    """dataset/_work/audit/*.csv → {'m3': …, 'm4': …}. evidence_id 칸이 있는 파일 = M3 표본 감사(evidence_id 가 빈 행은 뺀다),
    없는 파일(audit_gaps_* 등) = M4 누락 판정 감사. 종류마다 최신 판 하나로 세고, 이전 판은 이력으로 돌려준다."""
    kinds = {'m3': [], 'm4': []}
    for p in sorted(glob.glob(os.path.join(audit_dir, '*.csv'))):
        rows = catalog.read_csv(p)
        has_ev = rows and 'evidence_id' in rows[0]
        ok = err = 0
        for r in rows:
            if has_ev and not (r.get('evidence_id') or '').strip():
                continue
            v = (r.get('audit_result') or '').strip().upper()
            ok += v == 'OK'
            err += v == 'ERROR'
        kinds['m3' if has_ev else 'm4'].append({'file': os.path.basename(p), 'ok': ok, 'error': err, 'version': audit_version(p)})
    out = {}
    for k, items in kinds.items():
        items.sort(key=lambda x: x['version'])
        latest = items[-1] if items else None
        out[k] = {'latest': latest, 'history': items[:-1], 'files': len(items),
                  'ok': latest['ok'] if latest else 0, 'error': latest['error'] if latest else 0}
    return out


def m3(cat):
    return audit_summary(cat.abs(cat.research + '/dataset/_work/audit'))


GAP_VERDICTS = {'누락 확정': '누락 확정', 'MISSING': '누락 확정', 'MISSING_CONFIRMED': '누락 확정', '범위 밖': '범위 밖',
                'OUT_OF_SCOPE': '범위 밖', '이미 있음': '이미 있음', 'ALREADY_PRESENT': '이미 있음', 'PRESENT': '이미 있음',
                '판단 보류': '판단 보류', 'PENDING': '판단 보류', 'HOLD': '판단 보류'}


def m4(cat):
    """gaps.jsonl(6.1) → {(정책, 단계): Counter(판정)}. 판정 칸 이름은 verdict·판정·judgement 중 있는 것, 비면 '판정 없음'."""
    out = defaultdict(Counter)
    files = sorted(glob.glob(cat.abs(cat.research + '/dataset/_work/*/gaps.jsonl')))
    for p in files:
        pol_dir = os.path.basename(os.path.dirname(p))
        for r in catalog.read_jsonl(p):
            raw = next((r[k] for k in ('verdict', '판정', 'judgement', 'decision') if r.get(k)), None)
            v = GAP_VERDICTS.get(str(raw).strip(), '판정 없음' if not raw else '기타(%s)' % raw)
            out[(r.get('policy_id') or pol_dir, r.get('stage_code') or '')][v] += 1
    return {'files': len(files), 'by': out}


def csv_text(header, rows):
    buf = io.StringIO()
    csv.writer(buf, lineterminator='\n').writerows([header] + rows)
    return '﻿' + buf.getvalue()


def run(cat, docs, evidence, unresolved, dup, repo, research, extra=()):
    stat, unconfirmed, nis = m1(evidence)
    r2 = m2(cat, docs, evidence, unresolved)
    r3 = m3(cat)
    rows, L = [], ['# 품질 리포트 — 정책 → 입주 원천 수집', '',
                   '`python3 tools/research/chain/emit.py` 가 만든다(오프라인, 같은 입력이면 같은 결과). 지표 정의는 `파이프라인_설계.md` 1절.', '']
    # M1
    L += ['## M1 원천 확인률', '']
    if not stat:
        L += ['evidence 가 없다(`dataset/_work/<policy_id>/evidence*.jsonl` 없음) — 미측정.', '']
        rows.append(['M1', '', '', 0, 0, '', '≥ 90%', '미측정'])
    else:
        L += ['세 기준의 분모는 모두 항목 수다. 미도달 포함 = 확인 / 항목, 파생 미도달 제외 = 파생 미도달(ABSENT_CONFIRMED · basis RULE)만으로 확인된 항목을 미확인으로 셈, '
              '미도달 제외 = ABSENT_CONFIRMED 만으로 확인된 항목을 미확인으로 셈. 판정(목표 ≥ 90%)은 미도달 포함 기준.', '',
              '| 정책 | 범주 | 항목 | 확인 | 미도달 포함 | 파생 미도달 제외 | 미도달 제외 | SOURCED | 독립 | 규칙 | 같은 원천 | 판정 |',
              '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|']
        for (pol, cat_), s in sorted(stat.items(), key=lambda kv: (kv[0][0], kv[0][1] != '전체', kv[0][1])):
            v = pct(s['confirmed'], s['total'])
            vnd = pct(s['confirmed_nd'], s['total'])
            vna = pct(s['confirmed_na'], s['total'])
            judge = ('달성' if v is not None and v >= 90 else '미달') if cat_ == '전체' else ''
            L.append('| %s | %s | %d | %d | %s | %s | %s | %d | %d | %d | %d | %s |' % (
                pol, cat_, s['total'], s['confirmed'], fmt_pct(v), fmt_pct(vnd), fmt_pct(vna), s['sourced'], s['basis:INDEPENDENT'], s['basis:RULE'],
                s['basis:SAME_SOURCE'], judge))
            rows.append(['M1', pol, cat_, s['confirmed'], s['total'], '' if v is None else v, '≥ 90%' if cat_ == '전체' else '', judge])
            rows.append(['M1(파생 미도달 제외)', pol, cat_, s['confirmed_nd'], s['total'], '' if vnd is None else vnd, '', ''])
            rows.append(['M1(ABSENT 제외)', pol, cat_, s['confirmed_na'], s['total'], '' if vna is None else vna, '', ''])
            rows.append(['M1 SOURCED', pol, cat_, s['sourced'], s['confirmed'], '', '', ''])
            for b in ('INDEPENDENT', 'RULE', 'SAME_SOURCE'):
                rows.append(['M1 basis ' + b, pol, cat_, s['basis:' + b], s['confirmed'], '', '', ''])
        L += ['', '원천에 근거가 없다고 확인된 항목(NOT_IN_SOURCE, 확인됨으로 세지만 품질 문제): %d' % len(nis)]
        L += ['- `%s` %s %s.%s' % k for k in nis[:20]] + (['- … 외 %d' % (len(nis) - 20)] if len(nis) > 20 else [])
        nodoc = sum(1 for e in evidence if e['verdict'] in CONFIRM and e['verdict'] != 'ABSENT_CONFIRMED' and not e['doc_id'])
        L += ['', '- 확인 판정(MATCH·MISMATCH·SOURCED·NOT_IN_SOURCE)인데 doc_id 가 빈 evidence 행: %d%s' % (nodoc, ' — **경고: 근거 문서 없는 확인**' if nodoc else '')]
        rows.append(['M1 확인 판정 문서 없음', '', '', nodoc, len(evidence), '', '0', '달성' if not nodoc else '경고'])
        L += ['- ' + x for x in extra]
        L += ['', '미확인 항목 %d개 → `dataset/_work/미확인_항목.csv`. 같은 evidence_id(항목·외부 레코드·문서·위치가 모두 같음)로 겹친 중간 출력 행 %d개는 하나만 남겼다.' % (len(unconfirmed), dup), '']
    # M2
    ev_pct, all_pct = pct(r2['ev_saved'], r2['ev_docs']), pct(r2['all_saved'], r2['all_docs'])
    att_pct = pct(r2['attachments_registered'], r2['attachments'])
    org_pct = pct(r2['org_filled'], r2['all_docs'])
    m2rows = [
        ('canonical_url 중복', r2['canonical_dup'], '', '0', r2['canonical_dup'] == 0),
        ('sha256 중복', r2['sha_dup'], '', '0', r2['sha_dup'] == 0),
        ('연구 폴더 원 파일 중 목록에 없는 것', len(r2['disk_unregistered']),
         '원본 폴더 파일 %d = 원 파일(분모) %d + 파생물(제외) %d' % (r2['disk_files'] + len(cat.derived_in_research()), r2['disk_files'], len(cat.derived_in_research())),
         '0', not r2['disk_unregistered']),
        ('evidence 가 가리키는데 목록에 없는 것', len(r2['unresolved']), '', '0', not r2['unresolved']),
        ('보존율 — evidence 가 가리키는 문서', fmt_pct(ev_pct), '%d / %d' % (r2['ev_saved'], r2['ev_docs']), '≥ 90%',
         None if ev_pct is None else ev_pct >= 90),
        ('보존율 — 전체 목록(참고)', fmt_pct(all_pct), '%d / %d' % (r2['all_saved'], r2['all_docs']), '참고', None),
        ('manifest 첨부 등록률', fmt_pct(att_pct), '%d / %d (받은 첨부 %d)' % (r2['attachments_registered'], r2['attachments'], r2['attachments_saved']),
         '100%', None if att_pct is None else att_pct == 100),
        ('발행기관 채움', fmt_pct(org_pct), '%d / %d (도메인 추정 %d)' % (r2['org_filled'], r2['all_docs'], r2['org_domain_guess']), '100%',
         org_pct == 100),
        ('발행기관 원문 확인률(도메인 추정이 아닌 비율)', fmt_pct(pct(r2['org_source_checked'], r2['all_docs'])),
         '%d / %d' % (r2['org_source_checked'], r2['all_docs']), '참고', None),
        ('담당부서 채움률 — 정책·고시·공고 문서', fmt_pct(pct(r2['gov_dept_filled'], r2['gov_docs'])),
         '%d / %d (보도자료·안건·브리핑·해명·고시·모집공고)' % (r2['gov_dept_filled'], r2['gov_docs']), '참고', None),
        ('담당부서 채움 — 전체(참고)', fmt_pct(pct(r2['dept_filled'], r2['all_docs'])), '%d / %d' % (r2['dept_filled'], r2['all_docs']), '참고', None),
    ]
    L += ['## M2 출처 목록 완전성', '', '| 항목 | 값 | 내역 | 목표 | 판정 |', '|---|---:|---|---|---|']
    for name, v, detail, goal, ok in m2rows:
        judge = '' if ok is None else ('달성' if ok else '미달')
        if ok is None and goal != '참고':
            judge = '미측정'
        L.append('| %s | %s | %s | %s | %s |' % (name, v, detail, goal, judge))
        rows.append(['M2', '', name, '', '', v, goal, judge])
    L += ['', '- 문서 %d행: 형식 %s' % (r2['all_docs'], ' · '.join('%s %d' % kv for kv in sorted(Counter(d['format'] for d in docs).items()))),
          '- 문서 유형: ' + ' · '.join('%s %d' % kv for kv in sorted(Counter(d['doc_type'] for d in docs).items())),
          '- 수집 방법: ' + ' · '.join('%s %d' % kv for kv in sorted(Counter(d['collection_method'] for d in docs).items())),
          '- 앞선 출처 목록(legacy) %d행 → 문서 %d개(못 이은 행 %d)' % (r2['legacy_rows'], r2['legacy_docs'], r2['legacy_unmapped']),
          '- 미보존 사유: ' + ' · '.join('%s %d' % kv for kv in sorted(r2['not_saved_reasons'].items())),
          '- 파생물(발췌·표·추출 텍스트·manifest, 원천으로 세지 않음) %d개 → `dataset/_work/catalog_derived.csv`' % len(cat.derived)]
    L += ['- 발행기관 판정 방법(문서 수): ' + ' · '.join('%s %d' % kv for kv in sorted(r2['pub_methods'].items(), key=lambda kv: (-kv[1], kv[0]))),
          '  → 도메인 추정으로 남은 문서 목록 `dataset/_work/발행기관_도메인추정.csv`']
    for k, v in sorted(r2['pub_methods'].items()):
        rows.append(['M2 발행기관 방법', '', k, v, r2['all_docs'], pct(v, r2['all_docs']), '', ''])
    if r2['ambiguous_urls']:
        L += ['- 같은 정규화 URL 이 다른 내용(sha256)을 돌려준 경우 %d: 모두 HTML 이면 가장 늦게 받은 문서가 canonical_url 을 갖고, 아니면 아무 문서도 갖지 않는다(URL 은 url_aliases).' % len(r2['ambiguous_urls'])]
        L += ['  - %s → %s (canonical_url: %s)' % (u, ', '.join(ds), cat.url_index.get(u) or '없음') for u, ds in r2['ambiguous_urls']]
    dk = Counter(cat.derived[p]['kind'] for p in cat.derived_in_research())
    L += ['- 디스크 판정 규칙: 연구 폴더 `**/원본/**` 의 모든 파일 중 우리 도구가 만든 파생물(발췌·표 추출·추출 텍스트·manifest·수집 캐시·발견 기록·Exa 응답 본문 텍스트)은 '
          '원천 목록에 넣지 않고 `dataset/_work/catalog_derived.csv` 에 모두 적는다. 나머지(분모)는 sha256 으로 source_documents 에 있어야 한다. 파생물 종류: ' +
          ' · '.join('%s %d' % kv for kv in sorted(dk.items(), key=lambda kv: (-kv[1], kv[0])))]
    if r2['disk_unregistered']:
        L += ['- 목록에 없는 원 파일:'] + ['  - `%s`' % p for p in r2['disk_unregistered']]
    if r2['unresolved']:
        L += ['- evidence 참조를 못 이음:'] + ['  - %s:%s %s %s (%s)' % tuple(u) for u in r2['unresolved'][:50]]
    L.append('')
    # M3 · M4 정확도(감사 파일: evidence_id 칸 있음 = M3, 없음 = M4 누락 판정 감사; 종류마다 최신 판)
    # 목표(설계 1절): M3 오류율 ≤ 2%, M4 판정 정확도 ≥ 90%(= 오류율 ≤ 10%)
    for key, metric, title, empty, limit in (('m3', 'M3', '## M3 정확도(표본 재대조)', '`dataset/_work/audit/*.csv` 중 evidence_id 칸이 있는 감사 파일이 없다.', 2),
                                             ('m4', 'M4 정확도', '## M4 정확도(누락 판정 표본 감사)', 'evidence_id 칸이 없는 누락 판정 감사 파일(audit_gaps_*.csv)이 없다.', 10)):
        a = r3[key]
        L += [title, '']
        n = a['ok'] + a['error']
        if n:
            v = pct(a['error'], n)
            judge = '달성' if v <= limit else '미달'
            L.append('`%s`: 표본 %d건 중 오류 %d건 → 오류율 %s (목표 ≤ %d%%, %s)' % (a['latest']['file'], n, a['error'], fmt_pct(v), limit, judge))
            rows.append([metric, '', a['latest']['file'], a['error'], n, v, '≤ %d%%' % limit, judge])
        else:
            L.append('미측정 — ' + empty)
            rows.append([metric, '', '', '', '', '', '≤ %d%%' % limit, '미측정'])
        for h in a['history']:
            hn = h['ok'] + h['error']
            L.append('- 이전 판 `%s`: %d건 중 오류 %d건(%s)' % (h['file'], hn, h['error'], fmt_pct(pct(h['error'], hn))))
            rows.append([metric + ' 이력', '', h['file'], h['error'], hn, pct(h['error'], hn) if hn else '', '', ''])
        L.append('')
    r4 = m4(cat)
    L += ['## M4 누락 검증(역방향 대조)', '']
    if not r4['files']:
        L.append('미측정 — `dataset/_work/*/gaps.jsonl` 이 없다.')
        rows.append(['M4', '', '', '', '', '', '판정 없음 0', '미측정'])
    else:
        L += ['| 정책 | 단계 | 후보 | 누락 확정 | 범위 밖 | 이미 있음 | 판단 보류 | 판정 없음 | 판정 |', '|---|---|---:|---:|---:|---:|---:|---:|---|']
        for (pol, st), c in sorted(r4['by'].items()):
            n = sum(c.values())
            undecided = c['판정 없음'] + sum(v for k, v in c.items() if k.startswith('기타'))
            judge = '달성' if undecided == 0 else '미달'
            L.append('| %s | %s | %d | %d | %d | %d | %d | %d | %s |' % (pol, st, n, c['누락 확정'], c['범위 밖'], c['이미 있음'],
                                                                     c['판단 보류'], undecided, judge))
            rows.append(['M4', pol, st, undecided, n, '', '판정 없음 0', judge])
        L.append('')
        L.append('판정 없음 = 판정 칸이 비었거나 정해진 네 값(누락 확정·범위 밖·이미 있음·판단 보류)이 아닌 후보. 판단 보류는 따로 센다.')
    L.append('')
    md, rcsv = '\n'.join(L), csv_text(REPORT_COLS, [[str(x) for x in r] for r in rows])
    ucsv = csv_text(UNCONFIRMED_COLS, unconfirmed)
    base = os.path.join(repo, research)
    gcsv = csv_text(GUESS_COLS, sorted([[d['doc_id'], ';'.join(d['stage_codes']), d['doc_type'], d['format'], d['title'],
                                         d['canonical_url'] or (d['url_aliases'] or [''])[0], d['local_path'] or '', d['publisher_org'],
                                         d['host_org'] or ''] for d in docs if cat.pub_method.get(d['doc_id']) == '도메인 추정'],
                                       key=lambda x: (x[1], x[7], x[4], x[0])))
    for rel, text in [('품질_리포트.md', md), ('품질_리포트.csv', rcsv), ('dataset/_work/미확인_항목.csv', ucsv),
                      ('dataset/_work/발행기관_도메인추정.csv', gcsv)]:
        with open(os.path.join(base, rel), 'w', encoding='utf-8', newline='') as f:
            f.write(text)
    summary = 'M2: canonical 중복 %d · sha 중복 %d · 미등록 원 파일 %d/%d · evidence 못 이음 %d · 보존(evidence 문서) %s · 보존(전체) %s · 첨부 등록 %s · 기관 채움 %s' % (
        r2['canonical_dup'], r2['sha_dup'], len(r2['disk_unregistered']), r2['disk_files'], len(r2['unresolved']),
        fmt_pct(ev_pct), fmt_pct(all_pct), fmt_pct(att_pct), fmt_pct(org_pct))
    return {'texts': [('품질_리포트.md', md), ('품질_리포트.csv', rcsv), ('미확인_항목.csv', ucsv), ('발행기관_도메인추정.csv', gcsv)], 'summary': summary,
            'm1': stat, 'm2': r2, 'm3': r3, 'm4': r4, 'unconfirmed': unconfirmed}
