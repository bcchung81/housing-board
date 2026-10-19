"""정책 하나의 사슬(정책 → 프로그램 → 사업 → 02~06 단계 근거)을 모으고 대조한다.

Run 이 HOME 덤프·원천을 읽고(build), 단계 모듈(stages/sNN_*.py)이 행을 더하고(process),
웹확인 결과를 반영한 뒤 정렬·중복 제거한다. 출력은 outputs.py·evidence.py·report.py.
"""

import importlib
import json
import os
import re
from collections import Counter, OrderedDict, defaultdict

import readers
from common import (p, STATUS_KO, NAME_MATCH, CANDIDATE_TABLES, digits_date, read_csv_dicts, scrub, norm_block, norm_district, nz)
from home import (load_home, policy_project_ids, project_subject_ids, program_checks, load_policy_sites)

EXTRACT_COLS = ['project_id', '사업명', '지역', '지구', '블록', '프로그램', 'HOME_표', 'HOME_근거원천', 'HOME_근거키',
                'HOME_값', 'HOME_근거_URL', 'HOME_상태', '원본_자료명', '원본_파일', '원본_위치', '원본_값', '대조', '대조_성격',
                '비고']
BASE_COLS = 6


class Sources:
    """원천 형식 파서로 읽은 원본. 키는 config sources 의 키."""


def load_sources(cfg, D, projects):
    sc = cfg['sources']
    S = Sources()
    c = sc['lh_construction_pdf']
    S.pdf_rows, S.pdf_text, S.pdf_pages = readers.read_lh_construction_pdf(c['path'])
    c = sc['lh_completion_csv']
    S.comp_header, S.comp_rows = readers.read_table_csv(c['path'], c['encoding'])
    S.comp_idx = {k: S.comp_header.index(v) for k, v in c['fields'].items()}
    c = sc['applyhome']
    S.ah = readers.read_applyhome(c['dir'], c['ops'], c['key'])
    c = sc['lh_notice']
    S.lh_notices, S.lh_supply, S.lh_details = readers.read_lh_notice(c['notice_dir'], c['detail_dir'], c['key'], c['labels'])
    c = sc['movein_hwpx']
    S.hwpx = {f['path']: readers.read_hwpx_tables(f['path'], len(c['columns'])) for f in c['files']}
    for key in ('movein_reb_csv', 'lh_complex_csv'):
        c = sc[key]
        h, rows = readers.read_table_csv(c['path'], c.get('encoding', 'utf-8-sig'))
        setattr(S, key, (h, rows))
    c = sc['hub_bulk']
    hub_names = set()
    for r in D['stage_evidence']:
        sel = (r['payload'] or {}).get('selected') or {}
        if r['payload'].get('project_id') in projects and sel.get('source_id') in c['home_source_ids']:
            hub_names.add(nz(sel.get('source_name')))
    S.hub_cols, S.hub_found, S.hub_man, S.hub_member = readers.read_hub_bulk(
        c['zip'], c['manifest'], c['part'], c['fields']['name'], hub_names)
    S.hub_idx = {k: S.hub_cols.index(v) for k, v in c['fields'].items()}
    return S


class Run:
    def __init__(self, cfg, policy, home=None, sources=None):
        self.cfg = cfg
        self.policy = policy
        self.slug = policy['slug']
        self.out = cfg['paths']['research_dir']
        self.stages = OrderedDict((s['home_stage'], s) for s in cfg['stages'])
        self.D, self.dump_manifest = home or load_home(cfg)
        D = self.D
        self.projects = {r['entity_id']: r for r in D['project']}
        self.pids = policy_project_ids(D, cfg['home']['policy_field'], policy['home_policy_id'])
        self.pids_set = set(self.pids)
        self.seen_doc = set()  # (사업, 문서, 단계): evidence_bridge 로 이미 나온 문서 근거
        self.notices = {r['entity_id']: r for r in D['notice']}
        self.docs = {r['entity_id']: r for r in D['document_evidence']}
        self.lhcp = {r['entity_id']: r for r in D['lh_completion_plan']}
        self.sched = defaultdict(list)
        for r in D['execution_schedule']:
            self.sched[(r['payload'].get('project_id'), r['payload'].get('stage'))].append(r['payload'])
        self.se = {}
        for r in D['stage_evidence']:
            pl = r['payload']
            if pl.get('project_id') in self.projects:
                self.se[(pl['project_id'], pl['stage'])] = pl
        with open(p(cfg['home']['id_map']), encoding='utf-8') as f:
            id_map = json.load(f)
        self.subject = project_subject_ids(D, self.pids, id_map, cfg['home']['id_keys'], cfg['home']['unmapped_prefix'])
        self.prog_check = program_checks(cfg, policy)
        self.sites = load_policy_sites(self.work_path(cfg['policy_sites']))
        self.S = sources or load_sources(cfg, D, self.projects)
        self.rows = {st: [] for st in self.stages}
        self.used = defaultdict(lambda: defaultdict(dict))  # used[stage_dir][(source, part)][key] = row
        self.web_stats = Counter()

    # ------------------------------------------------ 경로·이름
    def work_path(self, name):
        return '%s/%s/%s' % (self.cfg['paths']['work_dir'], self.policy['policy_id'], name)

    def sdir(self, stage):
        return self.stages[stage]['dir']

    def src(self, key):
        return self.cfg['sources'][key]

    def excerpt_file(self, source_key, part=None):
        c = self.indep_src(source_key) if source_key.startswith('indep:') else self.src(source_key)
        name = c['excerpt'] if part is None else c['excerpts'][part]
        return '발췌_%s_%s.csv' % (name, self.slug)

    def indep_src(self, key):
        """독립 수집 원천 설정(발췌 키 'indep:<원천>')."""
        return self.cfg['independent']['sources'][key.split(':', 1)[1]]

    def stage_file(self, source_key):
        """원 파일 사본이 단계 폴더에 있으면 그 경로(원본_파일 칸), 아니면 원 위치."""
        c = self.src(source_key)
        if c.get('copy_dir'):
            return '%s/%s/원본/%s' % (self.out, c['copy_dir'], os.path.basename(c['path']))
        return c['path']

    def subject_id(self, pid):
        return self.subject[pid][0]

    # ------------------------------------------------ 행 만들기
    def base(self, pid):
        pl = self.projects[pid]['payload']
        return OrderedDict([
            ('project_id', pid), ('사업명', pl.get('name')), ('지역', pl.get('region')),
            ('지구', pl.get('district') or ''), ('블록', pl.get('block') or ''), ('프로그램', pl.get('program')),
        ])

    @staticmethod
    def nature_of(r):
        """대조_성격: 존재 확인 = 선행 단계 추정(PREREQUISITE) 근거로 기록의 존재·호수만 본 것.
        같은 원천 재확인 = HOME 이 값을 읽은 것과 같은 파일·API 를 다시 읽은 것. 독립 원천 대조 = HOME 이 쓰지 않은 원천과 비교."""
        if r['대조'] in ('원본 없음', '근거없음', '수집 범위 밖'):
            return ''
        if r['HOME_표'] == NAME_MATCH:
            return '독립 원천 대조'
        if 'PREREQUISITE' in (r['HOME_값'] or ''):
            return '존재 확인'
        return '같은 원천 재확인'

    def add(self, stage, pid, **kw):
        r = self.base(pid)
        for c in EXTRACT_COLS[BASE_COLS:]:
            r[c] = kw.get(c, '')
        if '대조_성격' not in kw:
            r['대조_성격'] = self.nature_of(r)
        self.rows[stage].append(r)
        return r

    def no_local(self, stage, pid, table, src, key, val, url, status, name, note, plan=False):
        """plan=True: 계획·전망 값(정책 문서 계획, 공급계획 예정월). 단계 도달 근거가 아니라 단계 순서 판단(독립 수집)에서 뺀다."""
        r = self.add(stage, pid, HOME_표=table, HOME_근거원천=src, HOME_근거키=key, HOME_값=val, HOME_근거_URL=url,
                     HOME_상태=status, 원본_자료명=name, 대조='원본 없음', 비고=note)
        if plan:
            r['_plan'] = True
        return r

    def web_source(self, source_id, original_file='', method=None):
        """저장소 원본이 없는 HOME 원천 → (자료명, 비고 머리). config home_sources, 없으면 _default.
        method 를 주면(단계 근거 표) 원천 설정의 with_method 에 따라 ' · 방법 …' 을 붙인다."""
        hs = self.cfg['home_sources']
        e = hs.get(source_id) or hs['_default']
        fmt = dict(source_id=source_id, original_file=original_file)
        note = e['note'].format(**fmt)
        if method is not None and e.get('with_method'):
            note += ' · 방법 %s' % method
        return e['label'].format(**fmt), note

    def own_status(self, pid, stage, value):
        for e in self.sched.get((pid, stage), []):
            if e.get('input_rule') == 'SOURCE_ACCEPTED' and e.get('status') == 'CONFIRMED' and value and \
                    digits_date(e.get('due_date')).startswith(digits_date(value)[:6]):
                return '확정', 'execution_schedule %s·SOURCE_ACCEPTED·CONFIRMED(수집값 채택)' % stage
        return '검토', '사업 자체 원천 기록 · 단계 확정 기록 없음'

    def use(self, stage_dir, source_key, part, key, make):
        """발췌 기록: 같은 원본 행은 한 번, 관련 사업(PRO id)은 모은다."""
        rec = self.used[stage_dir][(source_key, part)].setdefault(key, None)
        if rec is None:
            rec = make()
            rec.setdefault('관련_project_id', set())
            self.used[stage_dir][(source_key, part)][key] = rec
        return rec

    # ------------------------------------------------ 프로그램·블록 키
    def prog_cols(self, pid):
        prog = self.projects[pid]['payload'].get('program') or ''
        v = self.prog_check.get(prog)
        return (v['raw'], v['page']) if v else ('대조표에 없음', '')

    def block_key(self, pid):
        pl = self.projects[pid]['payload']
        nb = norm_block(pl.get('block'))
        nd = norm_district(pl.get('district'))
        return '%s|%s|%s' % (pl.get('region') or '', nd, nb) if (nb and nd) else ''

    # ------------------------------------------------ 처리
    def process(self):
        for stage, sc in self.stages.items():
            mod = importlib.import_module('stages.' + sc['module'])
            mod.run(self, stage)
        self.merge_web()
        self.type_guard()
        importlib.import_module('stages.independent').run(self)
        self.type_guard()
        for stage in self.stages:
            have = {r['project_id'] for r in self.rows[stage] if r['HOME_표'] not in CANDIDATE_TABLES}
            for pid in self.pids:
                if pid not in have:
                    self.add(stage, pid, HOME_표='', HOME_상태='근거없음', 대조='근거없음', 비고='HOME 덤프에 이 단계 근거 없음')
        for stage in self.stages:
            rows = [r for r in self.rows[stage] if r.get('HOME_표') != '' or r['대조'] == '근거없음']
            rows.sort(key=lambda r: (r['project_id'], r['HOME_표'], r['HOME_근거원천'], r['HOME_근거키'] or '',
                                     r['원본_자료명'], r['원본_위치'], r['HOME_값']))
            dedup, seen = [], set()
            for r in rows:
                k = tuple(r.get(c, '') for c in EXTRACT_COLS)
                if k not in seen:
                    seen.add(k)
                    dedup.append(r)
            self.rows[stage] = dedup
        return self

    def type_guard(self):
        """다른 사업 근거 막기(config independent.type_guard): 사업 유형 충돌, 또는 이름으로 이은 근거의 세대수 규모 차이."""
        tg = (self.cfg.get('independent') or {}).get('type_guard')
        if not tg:
            return
        for stage in self.stages:
            for r in self.rows[stage]:
                if r['대조'] not in ('일치', '불일치', '원천값 수집') or not r['원본_값']:
                    continue
                why = self.type_conflict(tg, r)
                if why:
                    r['대조'], r['대조_성격'] = '비교 불가', ''
                    r['비고'] = '다른 사업 근거 의심: %s · %s' % (why, r['비고'])

    def type_conflict(self, tg, r):
        pl = self.projects[r['project_id']]['payload']
        ptype = nz('%s %s %s' % (pl.get('program') or '', pl.get('program_type') or '', pl.get('name') or ''))
        val = nz(r['원본_값'])
        for rule in tg['rules']:
            if any(nz(w) in ptype for w in rule['project_words']):
                hit = [w for w in rule['conflict_words'] if nz(w) in val]
                if hit:
                    return '사업 유형(HOME %s) ↔ 원천 %s' % (pl.get('program'), hit[0])
        units = pl.get('planned_units')
        if units and (r.get('_web') or '이름' in (r['원본_위치'] or '')):
            for rx in tg['units_regex']:
                m = re.search(rx, r['원본_값'])
                if m:
                    n = int(m.group(1).replace(',', ''))
                    if n and (n > units * tg['units_ratio'] or units > n * tg['units_ratio']):
                        return '세대수 규모(HOME %s호 ↔ 원천 %s)' % (units, n)
                    break
        return ''

    def merge_web(self):
        """웹확인_결과.csv(다른 작업 산출물, 읽기만)로 '원본 없음' 행을 채운다.
        키: (단계, HOME 근거 URL, project_id), 여러 행이면 확인할_값 = HOME_값. 채운 행은 checked_by = AGENT."""
        wc = self.cfg['web_result']
        stats = self.web_stats
        if not os.path.exists(p(wc['path'])):
            return
        W = read_csv_dicts(wc['path'])
        idx = defaultdict(list)
        for i, w in enumerate(W):
            for pid in (w.get('관련_project_id') or '').split(';'):
                if pid:
                    idx[(w['단계'], w['url'], pid)].append((i, w))
        hit_rows = set()
        for stage in self.stages:
            sdir = self.sdir(stage)
            for r in self.rows[stage]:
                if r['대조'] != '원본 없음' or not r['HOME_근거_URL']:
                    continue
                cands = idx.get((sdir, r['HOME_근거_URL'], r['project_id']), [])
                if len(cands) > 1:
                    c2 = [c for c in cands if c[1]['확인할_값'] == scrub(r['HOME_값'])]
                    cands = c2 or cands
                if not cands:
                    stats[(sdir, '웹 결과 없음')] += 1
                    continue
                i, w = sorted(cands, key=lambda c: c[0])[0]
                hit_rows.add(i)
                v = '원본에서 못 찾음' if w['대조'] == wc['not_found_value'] else w['대조']
                r['원본_자료명'] = '웹 원문 · ' + (w.get('발행기관') or '')
                r['원본_파일'] = w.get('저장파일') or ''
                r['원본_위치'] = w.get('근거_위치') or ''
                r['원본_값'] = w.get('원문_값') or ''
                r['대조'] = v
                if 'PREREQUISITE' in (r['HOME_값'] or ''):
                    r['대조_성격'] = '존재 확인'
                elif w.get('sha_비교') == '다름':
                    r['대조_성격'] = '독립 원천 대조'
                else:
                    r['대조_성격'] = '같은 원천 재확인'
                r['비고'] = ('웹확인_결과(%s) · sha_비교 %s%s%s · 이전: %s' % (
                    w.get('수집상태'), w.get('sha_비교'),
                    (' · 웹 판정 "%s"' % wc['not_found_value'] if w['대조'] == wc['not_found_value'] else ''),
                    (' · ' + w['비고']) if w.get('비고') else '', r['비고']))
                if len(cands) > 1:
                    r['비고'] += ' · 같은 키 웹 결과 %d행 중 첫 행' % len(cands)
                r['_web'] = dict(url=w.get('url') or '')
                stats[(sdir, '해소')] += 1
                stats[(sdir, '해소:' + v)] += 1
        stats['웹 결과 행'] = len(W)
        stats['쓰인 웹 결과 행'] = len(hit_rows)


def stage_judgement(run, pid, stage):
    """HOME 이 단계 표로 내린 판정: 02·03 은 stage_evidence.status, 05·06 은 collection_link 연결 여부."""
    D = run.D
    kind = run.stages[stage].get('judgement')
    if kind == 'stage_evidence':
        for r in D['stage_evidence']:
            if r['payload'].get('project_id') == pid and r['payload'].get('stage') == stage:
                return STATUS_KO.get(r['payload'].get('status'), r['payload'].get('status'))
        return '기록 없음'
    if kind == 'collection_link':
        for r in D['collection_link']:
            if r['payload'].get('project_id') == pid and r['payload'].get('stage') == stage:
                ls = r['payload'].get('links') or []
                return '·'.join(sorted({STATUS_KO.get(l.get('review_status'), l.get('review_status') or '') for l in ls})) or '미연결'
        return '기록 없음'
    return '(단계 판정 표 없음)'
