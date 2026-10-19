#!/usr/bin/env python3
"""P9 출력: 원천 문서 목록·대조 기록·정책 표를 원장 형식으로 쓰고, 지표를 계산하고, 스키마로 검사한다.

    python3 tools/research/chain/emit.py      # catalog → emit → metrics → 검증 (오프라인, 결정적)

출력(docs/speech/research/ 아래)
    dataset/{source_documents,evidence,sources,policies,programs,policy_targets,links}.json  (ledger/1 형식)
    dataset/_work/catalog_derived.csv  파생물(발췌·표·추출 텍스트·manifest) 목록 — 원천으로 세지 않는다
    출처_통합.csv                       source_documents 를 사람이 읽는 CSV(문서 1개 = 1행)
    품질_리포트.md·.csv, dataset/_work/미확인_항목.csv  (metrics.py)
값은 원문 기준이고 review_status 는 evidence 로 정한다(설계 5.3): 행의 항목이 모두 '확인됨'(M1 정의, HOME 과 MISMATCH 여도
값은 원문값)이고 NOT_IN_SOURCE 가 없으면 CONFIRMED, 아니면 REVIEW_REQUIRED. 대조 기록이 없는 행은 HOME 값 그대로 REVIEW_REQUIRED.
읽기만: 원장 표(config/emit.json 의 ledger_tables), config/policies.json, 단계 폴더의 원 파일·다른 산출물.
"""
import argparse
import csv
import glob
import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import catalog  # noqa: E402
import ids  # noqa: E402
import metrics  # noqa: E402

DS = catalog.DATASET_SOURCE_REF
EV_COLS = ['evidence_id', 'policy_id', 'subject_table', 'subject_id', 'field', 'external_ref', 'stage_code', 'dataset_value',
           'external_value', 'doc_id', 'locator', 'original_value', 'verdict', 'basis', 'search_scope', 'checked_by',
           'checked_at', 'notes']
SD_COLS = ['doc_id', 'canonical_url', 'url_aliases', 'title', 'doc_type', 'format', 'publisher_org', 'publisher_dept',
           'host_org', 'published_at', 'collected_at', 'collection_method', 'local_path', 'sha256', 'bytes',
           'parent_doc_id', 'stage_codes', 'saved', 'not_saved_reason', 'source_ref', 'notes']
CSV_COLS = ['단계', '문서id', '자료명', '문서유형', '형식', '발행기관', '담당부서', '게시사이트', 'url', '다른_url', '게시일',
            '수집방법', '수집일', '저장파일', 'sha256', '바이트', '상위문서', '보존', '미보존_사유', '쓰인_항목수']
BASIS_RANK = {'INDEPENDENT': 0, 'RULE': 1, 'SAME_SOURCE': 2}
VERDICT_RANK = {v: i for i, v in enumerate(['MISMATCH', 'MATCH', 'SOURCED', 'NOT_IN_SOURCE', 'ABSENT_CONFIRMED', 'EXISTS_ONLY', 'OUT_OF_SCOPE', 'NO_ORIGINAL', 'UNVERIFIED'])}
KEY_COLS = {'policies': ['local_policy_id'], 'programs': ['local_program_id'],
            'policy_targets': ['local_policy_id', 'local_program_id', 'stage_code', 'area_codes', 'period_start', 'period_end'],
            'links': ['link_type', 'from_local_id', 'to_local_id']}


def target_key(r):
    return '|'.join([r['local_policy_id'], r['local_program_id'] or '*', r['stage_code'] or '*', '+'.join(r['area_codes']),
                     r['period_start'], r['period_end']])


def link_key(r):
    return '|'.join([r['link_type'], r['from_local_id'], r['to_local_id']])


SUBJECT_KEY = {'policies': lambda r: r['local_policy_id'], 'programs': lambda r: r['local_program_id'],
               'policy_targets': target_key, 'links': link_key}


def render_table(table, rows):
    body = ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows)
    return '{"schema_version":"ledger/1","table":"%s","rows":[\n%s\n]}\n' % (table, body)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(text)


def csv_text(header, rows):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\n')
    w.writerow(header)
    w.writerows(rows)
    return '﻿' + buf.getvalue()


def load_table(repo, rel, table):
    p = os.path.join(repo, rel, table + '.json')
    if not os.path.exists(p):
        return []
    with open(p, encoding='utf-8') as f:
        return json.load(f)['rows']


# ---------- evidence ----------
def load_evidence(cat):
    """_work/*/evidence*.jsonl → evidence 행(doc_id·evidence_id 붙임), 못 이은 참조, 같은 id 중복 수."""
    rows, unresolved = [], []
    for path in sorted(glob.glob(cat.abs(cat.research + '/dataset/_work/*/evidence*.jsonl'))):
        rel = cat.rel(path)
        for ln, r in enumerate(catalog.read_jsonl(path), 1):
            doc_id, locator = None, r.get('locator')
            if r.get('doc_path') or r.get('doc_url'):
                doc_id, why = cat.lookup(path=r.get('doc_path'), url=r.get('doc_url'))
                if not doc_id:
                    unresolved.append([rel, ln, r.get('doc_path') or '', r.get('doc_url') or '', why])
                if not locator and r.get('doc_url'):
                    locator = ids.canonical_url(r['doc_url'], cat.rules)[1]
            e = {c: r.get(c) for c in EV_COLS}
            e['doc_id'], e['locator'] = doc_id, locator
            e['evidence_id'] = ids.evidence_id(e['subject_table'], e['subject_id'], e['field'], e['external_ref'], doc_id, locator)
            rows.append(e)
    # 같은 evidence_id(항목·외부 레코드·문서·위치가 모두 같음)는 같은 대조를 두 번 적은 것 — 판정이 가장 강한 행 하나를 남기고,
    # 다른 판정이 있었으면 notes 에 적는다
    rows.sort(key=lambda e: (e['evidence_id'], VERDICT_RANK.get(e['verdict'], 9), BASIS_RANK.get(e['basis'], 9),
                             json.dumps(e, ensure_ascii=False, sort_keys=True)))
    out, dup = [], 0
    for e in rows:
        if out and out[-1]['evidence_id'] == e['evidence_id']:
            dup += 1
            k = out[-1]
            if e['verdict'] != k['verdict']:
                extra = '같은 대조의 다른 판정: %s' % e['verdict']
                if extra not in (k['notes'] or ''):
                    k['notes'] = (k['notes'] + ' · ' if k['notes'] else '') + extra
            continue
        out.append(e)
    return out, unresolved, dup


def best_value(evs):
    """원문값을 줄 대조 기록(MATCH·MISMATCH·SOURCED, 문서 있음) 중 근거가 가장 독립적인 것."""
    c = [e for e in evs if e['verdict'] in ('MATCH', 'MISMATCH', 'SOURCED') and e['doc_id']]
    c.sort(key=lambda e: (BASIS_RANK.get(e['basis'], 9), e['evidence_id']))
    return c[0] if c else None


def item_confirmed(evs):
    """설계 5.3: 항목이 '확인됨'(M1 정의)이고 NOT_IN_SOURCE 가 없음."""
    return any(metrics.is_confirming(x) for x in evs) and not any(x['verdict'] == 'NOT_IN_SOURCE' for x in evs)


def apply_evidence(table, rows, by_subject):
    for r in rows:
        evs = by_subject.get((table, SUBJECT_KEY[table](r)), {})
        changed = False
        for field, fevs in sorted(evs.items()):
            b = best_value(fevs)
            if b and field in r and field not in KEY_COLS[table]:
                v = b['dataset_value']
                if isinstance(r[field], int) and isinstance(v, str) and re.fullmatch(r'-?\d+', v):
                    v = int(v)
                if v != r[field]:
                    r[field], changed = v, True
        if changed:
            r['source_ref'] = DS
        r['review_status'] = 'CONFIRMED' if evs and all(item_confirmed(v) for v in evs.values()) else 'REVIEW_REQUIRED'
        if table == 'links' and evs:
            refs = sorted({'%s %s' % (e['doc_id'], e['locator'] or '') for v in evs.values() for e in v if e['doc_id']})
            if refs:
                r['evidence'] = '; '.join(x.strip() for x in refs[:5]) + (' 외 %d' % (len(refs) - 5) if len(refs) > 5 else '')


def build_tables(repo, research, ledger_rel, policies_cfg, evidence):
    by_subject = {}
    for e in evidence:
        key = ids.subject_key(e['subject_table'], e['subject_id'], e['field'])
        by_subject.setdefault((e['subject_table'], key), {}).setdefault(e['field'], []).append(e)
    lp = {r['local_policy_id']: r for r in load_table(repo, ledger_rel, 'policies')}
    lprog = {r['local_program_id']: r for r in load_table(repo, ledger_rel, 'programs')}
    ltargets = load_table(repo, ledger_rel, 'policy_targets')
    llinks = load_table(repo, ledger_rel, 'links')
    home_to = {p.get('home_policy_id') or p['policy_id']: p['policy_id'] for p in policies_cfg}
    policies = []
    for p in policies_cfg:
        base = dict(lp.get(p.get('home_policy_id') or p['policy_id']) or {
            'policy_name': p['name'], 'announcement_date': p.get('announced'), 'scope_region': None, 'source_ref': DS})
        base['local_policy_id'] = p['policy_id']
        policies.append({k: base[k] for k in ['local_policy_id', 'policy_name', 'announcement_date', 'scope_region', 'source_ref']}
                        | {'review_status': 'REVIEW_REQUIRED'})
    links = []
    for r in llinks:
        if r['link_type'] in ('POLICY_PROGRAM', 'POLICY_PROJECT') and r['from_local_id'] in home_to:
            links.append(dict(r, from_local_id=home_to[r['from_local_id']]))
    prog_ids = {r['to_local_id'] for r in links if r['link_type'] == 'POLICY_PROGRAM'}
    links += [dict(r) for r in llinks if r['link_type'] == 'PROGRAM_PROJECT' and r['from_local_id'] in prog_ids]
    programs = [dict(lprog[i]) for i in sorted(prog_ids) if i in lprog]
    # 원문 프로그램(policy_programs.jsonl, P2 후보): 같은 정책에 연결된 원장 프로그램과 이름이 같으면 정의를 원문으로 채운다.
    # 이름이 맞지 않는 후보는 표에 더하지 않고 수만 센다(후보는 제목·지명까지 섞여 있어 사람 확인 뒤 config 로 들인다)
    unmatched = []
    norm = lambda s: re.sub(r'\s+', '', s or '')  # noqa: E731
    for path in sorted(glob.glob(os.path.join(repo, research, 'dataset/_work/*/policy_programs.jsonl'))):
        for pp in catalog.read_jsonl(path):
            pol = pp['policy_id']
            linked = {r['to_local_id'] for r in links if r['link_type'] == 'POLICY_PROGRAM' and r['from_local_id'] == pol}
            hit = next((g for g in programs if g['local_program_id'] in linked and norm(g['program_name']) == norm(pp['program_name'])), None)
            if not hit:
                unmatched.append((pol, pp.get('program_kind') or '종류 없음', pp['program_name']))
            elif pp.get('definition') and pp['definition'] != hit['program_definition']:
                hit['program_definition'], hit['source_ref'] = pp['definition'], DS
    targets = [dict(r, local_policy_id=home_to[r['local_policy_id']]) for r in ltargets if r['local_policy_id'] in home_to]
    tables = {'policies': policies, 'programs': programs, 'policy_targets': targets, 'links': links}
    build_tables.unmatched_programs = sorted(set(unmatched))
    for t, rows in tables.items():
        apply_evidence(t, rows, by_subject)
    programs.sort(key=lambda r: r['local_program_id'])
    targets.sort(key=target_key)
    links.sort(key=link_key)
    return tables


def dataset_source(docs, evidence):
    col = sorted(r['collected_at'] for r in docs if r['collected_at'])
    return {'source_ref': DS, 'source_owner': 'HOUSING_WAVE', 'provider': '정책→입주 원천 수집 파이프라인(tools/research/chain)',
            'dataset_name': '정책 사슬 원천 문서 목록(source_documents)·대조 기록(evidence)', 'source_url': None,
            'source_record_key': None, 'data_as_of': None, 'collected_at': col[-1] if col else None, 'original_filename': None,
            'notes': '문서 1개 = 1행 목록과 항목 × 원천 대조 기록. 연구용 데이터셋이며 운영 원장(Supabase)에 싣지 않는다',
            'record_count': len(docs) + len(evidence), 'license': None, 'used_by': [], 'is_demo': False}


def sources_csv_rows(docs, evidence):
    used = {}
    for e in evidence:
        if e['doc_id']:
            used.setdefault(e['doc_id'], set()).add((e['subject_table'], e['subject_id'], e['field']))
    out = []
    for r in docs:
        out.append([';'.join(r['stage_codes']), r['doc_id'], r['title'], r['doc_type'], r['format'], r['publisher_org'],
                    r['publisher_dept'] or '', r['host_org'] or '', r['canonical_url'] or '', ' ; '.join(r['url_aliases']),
                    r['published_at'] or '', r['collection_method'], r['collected_at'] or '', r['local_path'] or '',
                    r['sha256'] or '', '' if r['bytes'] is None else r['bytes'], r['parent_doc_id'] or '',
                    'Y' if r['saved'] else 'N', r['not_saved_reason'] or '', len(used.get(r['doc_id'], ()))])
    out.sort(key=lambda x: (x[0] or '99', x[17] != 'Y', x[5], x[2], x[1]))
    return out


MISSING_COLS = ['문서id', 'url', '단계', '관련 항목 수', '자료명']


def missing_rows(docs, evidence):
    """evidence 가 가리키는데 원 파일이 없는 문서(다음 수집 작업의 입력)."""
    items = {}
    for e in evidence:
        if e['doc_id']:
            items.setdefault(e['doc_id'], set()).add((e['subject_table'], e['subject_id'], e['field'], e['external_ref']))
    out = []
    for d in docs:
        if d['doc_id'] in items and not d['saved']:
            out.append([d['doc_id'], d['canonical_url'] or (d['url_aliases'] or [''])[0], ';'.join(d['stage_codes']),
                        len(items[d['doc_id']]), d['title']])
    out.sort(key=lambda r: (-r[3], r[0]))
    return out


def home_actors(repo, docs):
    """목록에 오른 HOME 덤프 파일의 actor 값(담당자 이름) — 출력에 나오면 안 된다."""
    out = set()

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'actor' and isinstance(v, str) and len(v.strip()) >= 2:
                    out.add(v.strip())
                walk(v)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    for d in docs:
        if d['collection_method'] == 'HOME_DUMP' and (d['local_path'] or '').endswith('.jsonl.gz'):
            with gzip.open(os.path.join(repo, d['local_path']), 'rt', encoding='utf-8') as f:
                for line in f:
                    walk(json.loads(line))
    return out


def privacy_check(texts, actors=()):
    bad = [name for name, t in texts if catalog.PHONE_RE.search(t)]
    bad += ['%s(담당자 이름)' % name for name, t in texts if any(a in t for a in actors)]
    if bad:
        raise SystemExit('개인정보 형식이 출력에 있다: ' + ', '.join(bad))


def run(repo=catalog.REPO, research=catalog.RESEARCH, config_dir=ids.CONFIG, ledger_rel=None,
        schemas_rel=None, validate=True, log=print):
    if ledger_rel is None or schemas_rel is None:
        cfg = ids.load_json('emit.json', config_dir)
        ledger_rel = ledger_rel or cfg['ledger_tables']
        schemas_rel = schemas_rel or cfg['schemas']
    cat = catalog.build(repo, research, config_dir)
    docs = [{c: r[c] for c in SD_COLS} for r in cat.rows]
    evidence, unresolved, dup = load_evidence(cat)
    with open(os.path.join(config_dir, 'policies.json'), encoding='utf-8') as f:
        policies_cfg = json.load(f)['policies']
    tables = build_tables(repo, research, ledger_rel, policies_cfg, evidence)
    out = os.path.join(repo, research, 'dataset')
    files = {'source_documents': docs, 'evidence': [{c: e[c] for c in EV_COLS} for e in evidence],
             'sources': [dataset_source(docs, evidence)], **tables}
    texts = []
    for t, rows in files.items():
        texts.append((t + '.json', render_table(t, rows)))
        write(os.path.join(out, t + '.json'), texts[-1][1])
    texts.append(('catalog_derived.csv', csv_text(catalog.DERIVED_COLS, catalog.derived_rows(cat))))
    write(os.path.join(out, '_work', 'catalog_derived.csv'), texts[-1][1])
    texts.append(('출처_통합.csv', csv_text(CSV_COLS, sources_csv_rows(docs, evidence))))
    write(os.path.join(repo, research, '출처_통합.csv'), texts[-1][1])
    texts.append(('미보존_evidence_URL.csv', csv_text(MISSING_COLS, missing_rows(docs, evidence))))
    write(os.path.join(out, '_work', 'fetch', '미보존_evidence_URL.csv'), texts[-1][1])
    extra = []
    um = build_tables.unmatched_programs
    if um:
        per = {}
        for pol, kind, _n in um:
            per[(pol, kind)] = per.get((pol, kind), 0) + 1
        extra.append('정책 원문 프로그램 후보(policy_programs.jsonl) 중 원장 프로그램과 이름이 같지 않아 표에 넣지 않은 것(정책 program_kind 수): ' +
                     ' · '.join('%s %s %d' % (p, k, n) for (p, k), n in sorted(per.items())))
    rep = metrics.run(cat, docs, files['evidence'], unresolved, dup, repo, research, extra)
    texts += rep['texts']
    privacy_check(texts, home_actors(repo, docs))
    log('source_documents %d행 · evidence %d행 · 파생물 %d · 정책 %d · 프로그램 %d · 목표 %d · 연결 %d' % (
        len(docs), len(evidence), len(cat.derived), len(tables['policies']), len(tables['programs']),
        len(tables['policy_targets']), len(tables['links'])))
    log(rep['summary'])
    if validate:
        node = subprocess.run(['node', os.path.join(HERE, 'validate_dataset.cjs'), out, os.path.join(repo, schemas_rel),
                               os.path.join(repo, ledger_rel)], capture_output=True, text=True)
        log(node.stdout.strip())
        if node.returncode:
            raise SystemExit('데이터셋 검증 실패:\n' + node.stdout + node.stderr)
    return {'catalog': cat, 'files': files, 'metrics': rep}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--no-validate', action='store_true', help='node 스키마 검사를 건너뛴다')
    a = ap.parse_args(argv)
    run(validate=not a.no_validate)


if __name__ == '__main__':
    main()
