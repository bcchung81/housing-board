"""단계 모듈이 함께 쓰는 원천 대조: HOME 근거 표(stage_evidence·evidence_bridge·document_evidence·collection_link)를
원천별 대조(LH 건설 PDF·LH 준공예정 CSV·건축HUB·청약홈·LH 공고)로 보낸다. 단계 모듈은 자기 단계만 넘긴다.

원천 경로·칸 이름·HOME 원천 id 는 config/stage_sources.json 의 sources 에 있다.
"""

from common import (STATUS_KO, nz, norm_block, block_in, digits_date, same_date, to_int, verdict_from, fact_text)


# ---------------------------------------------------------------- 원천 찾기

def pdf_lookup(R, src_pid):
    """HOME 건설 원천 사업(PRO_) 이름으로 PDF 행을 찾는다. 이름(공백·괄호 무시) 포함 → 호수 → 착공일 순으로 좁힘."""
    sp = R.projects.get(src_pid)
    if not sp:
        return None, '근거 사업 레코드가 덤프에 없음'
    pl = sp['payload']
    n = nz(pl.get('name'))
    cand = [x for x in R.S.pdf_rows if n and n in nz(x['원문_줄'])]
    key = '이름 포함(공백·괄호 무시)'
    if len(cand) > 1:
        c2 = [x for x in cand if x['단위'] == '호' and to_int(x['공사규모']) == pl.get('planned_units')]
        if c2:
            cand, key = c2, key + '+공사규모=HOME 호수'
    if len(cand) > 1:
        c2 = [x for x in cand if same_date(pl.get('start_actual_date'), x['착공일'], True)]
        if c2:
            cand, key = c2, key + '+착공일'
    if not cand:
        return None, 'PDF 에서 이름 "%s" 를 찾지 못함' % pl.get('name')
    if len(cand) > 1:
        return None, 'PDF 후보 %d행이라 하나로 정하지 못함' % len(cand)
    return cand[0], key


def pdf_use(R, stage_dir, row, pid):
    R.use(stage_dir, 'lh_construction_pdf', None, (row['쪽'], row['줄']), lambda: dict(row))['관련_project_id'].add(pid)


def pdf_pos(row):
    return 'p.%d 줄 %d (공종 %s, 블록 %s)' % (row['쪽'], row['줄'], row['공종'], row['블록'])


def pdf_val(row):
    return '착공 %s · 준공 %s · 규모 %s%s · 공정률 %s%%' % (row['착공일'], row['준공일'], row['공사규모'], row['단위'],
                                                   row['공정률(%)'])


def comp_lookup(R, lh_entity_id):
    """LH 준공예정 레코드 → CSV 행. 조인 키는 HOME source_object_id(사업지구명|블록명|공급유형)."""
    r = R.lhcp.get(lh_entity_id)
    if not r:
        return None, '준공예정 레코드가 덤프에 없음'
    pl = r['payload']
    ix = R.S.comp_idx
    parts = (pl.get('source_object_id') or '').split('|')
    if len(parts) == 3:
        hits = [(ln, x) for ln, x in R.S.comp_rows
                if x[ix['district']] == parts[0] and x[ix['block']] == parts[1] and x[ix['supply_type']] == parts[2]]
        key = 'source_object_id=%s (%s)' % (R.src('lh_completion_csv')['join_label'], pl.get('source_object_id'))
    else:
        hits = []
        key = 'source_object_id 형식 다름'
    if not hits:
        return None, key + ' → 원본에서 못 찾음'
    if len(hits) > 1:
        u = [h for h in hits if to_int(h[1][ix['units']]) == pl.get('planned_units')]
        hits = u or hits
    return hits[0], key + ('' if len(hits) == 1 else ' (같은 키 %d행 중 첫 행)' % len(hits))


def comp_use(R, stage_dir, hit, pid):
    ln, x = hit
    R.use(stage_dir, 'lh_completion_csv', None, ln,
          lambda: dict(zip(R.S.comp_header, x), _ln=ln))['관련_project_id'].add(pid)


def comp_parts(R, x):
    ix = R.S.comp_idx
    return x[ix['date']], x[ix['units']], x[ix['supply_type']]


def construction_compare(R, pid, stage_dir, src_pid, facts):
    """HOME 착공·공정률·준공·호수 사실을 PDF 행과 칸별로 대조."""
    row, how = pdf_lookup(R, src_pid)
    cmp_ = []
    units_note = ''
    if not row:
        return None
    pdf_use(R, stage_dir, row, pid)
    for f in facts:
        ms = f.get('milestone')
        if ms == 'CONSTRUCTION':
            cmp_.append(('착공', same_date(f.get('date'), row['착공일'], True), f.get('date'), row['착공일']))
        elif ms == 'COMPLETION':
            cmp_.append(('준공', same_date(f.get('date'), row['준공일'], True), f.get('date'), row['준공일']))
        elif f.get('pct') is not None:
            cmp_.append(('공정률', float(f['pct']) == float(row['공정률(%)']), f['pct'], row['공정률(%)']))
        elif ms is None and f.get('pct') is None and f.get('date'):
            cmp_.append(('날짜(구분 없음)', None, f.get('date'), ''))
        if f.get('units') is not None and row['단위'] == '호':
            ok = to_int(f['units']) == to_int(row['공사규모'])
            cmp_.append(('호수', ok, f['units'], row['공사규모']))
        if f.get('scope_units') is not None and f.get('source_total_units') is not None:
            units_note = ' · 호수 범위: HOME %s호(%s) / 원본 공사규모 %s호' % (
                f['scope_units'], f.get('scope_label') or '', row['공사규모'])
    return row, how, cmp_, units_note


def is_source(R, key, source_id):
    return source_id in R.src(key)['home_source_ids']


# ---------------------------------------------------------------- stage_evidence (02 사업화 · 03 인허가)

def stage_evidence(R, stage):
    sdir = R.sdir(stage)
    pdf_name, pdf_file = R.src('lh_construction_pdf')['label'], R.stage_file('lh_construction_pdf')
    hub = R.src('hub_bulk')
    hx = R.S.hub_idx
    for pid in R.pids:
        e = R.se.get((pid, stage))
        if not e:
            continue
        st = STATUS_KO.get(e.get('status'), e.get('status'))
        sel = e.get('selected') or {}
        if not sel:
            R.add(stage, pid, HOME_표='stage_evidence', HOME_상태=st, 대조='근거없음',
                  비고='HOME 단계 근거 미연결(후보 %d건)' % len(e.get('candidates') or []))
            continue
        src = sel.get('source_id')
        method = sel.get('original_method') or sel.get('method')
        hval = '단계 %s · 방법 %s · 사건일 %s · 근거 호수 %s · 근거명 %s' % (
            st, method, sel.get('event_date') or '없음', sel.get('units'), sel.get('source_name'))
        common = dict(HOME_표='stage_evidence', HOME_근거원천=src, HOME_근거키=sel.get('source_entity_id'),
                      HOME_값=hval, HOME_근거_URL=sel.get('evidence_url'), HOME_상태=st)
        if is_source(R, 'lh_construction_pdf', src):
            row, how = pdf_lookup(R, sel.get('source_entity_id'))
            if not row:
                R.add(stage, pid, 원본_자료명=pdf_name, 원본_파일=pdf_file, 대조='원본에서 못 찾음', 비고=how, **common)
                continue
            pdf_use(R, sdir, row, pid)
            hu = to_int(sel.get('units'))
            ok = None if (hu is None or row['단위'] != '호') else hu == to_int(row['공사규모'])
            v, note = verdict_from([('호수', ok, sel.get('units'), row['공사규모'] + row['단위'])])
            R.add(stage, pid, 원본_자료명=pdf_name, 원본_파일=pdf_file, 원본_위치=pdf_pos(row) + ' · 키: ' + how,
                  원본_값=pdf_val(row), 대조=v,
                  비고=('날짜 대조 아님: HOME 은 착공 기록이 있으므로 이 단계를 거쳤다고 추정(%s). 원본은 근거 기록의 존재와 '
                      '호수만 확인 · ' % method) + note,
                  **common)
        elif is_source(R, 'hub_bulk', src):
            k = nz(sel.get('source_name'))
            hits = R.S.hub_found.get(k, [])
            how = '%s = HOME 근거명(공백·괄호 무시)' % hub['fields']['name']
            if len(hits) > 1:
                h2 = [h for h in hits if to_int(h[1][hx['units']]) == to_int(sel.get('units'))]
                if h2:
                    hits, how = h2, how + '+%s=HOME 호수' % hub['fields']['units'].split('(')[0]
            if len(hits) > 1:
                h2 = [h for h in hits if same_date(sel.get('event_date'), h[1][hx['date']])]
                if h2:
                    hits, how = h2, how + '+' + hub['fields']['date']
            if not hits:
                R.add(stage, pid, 원본_자료명=hub['label'], 원본_파일=hub['zip'],
                      대조='원본에서 못 찾음', 비고='대용량 파일에 같은 %s 없음' % hub['fields']['name'], **common)
                continue
            ln, c = hits[0]
            R.use(sdir, 'hub_bulk', None, ln, lambda: dict(zip(R.S.hub_cols, c), _ln=ln))['관련_project_id'].add(pid)
            cmp_ = [('승인일', same_date(sel.get('event_date'), c[hx['date']]), sel.get('event_date'), c[hx['date']])]
            scope = ''
            if sel.get('source_units') is not None:
                # HOME 이 승인 원천 세대수(source_units)를 따로 적은 경우: 원본 총세대수는 그 값과 비교하고,
                # 사업 호수(units)와의 차이는 HOME 이 기록한 범위 관계(relation_type·scope_label)로 비고에 남긴다.
                cmp_.append(('승인 원천 세대수(source_units)', to_int(sel['source_units']) == to_int(c[hx['units']]),
                             sel['source_units'], c[hx['units']]))
                if to_int(sel.get('units')) != to_int(c[hx['units']]):
                    scope = ' · 호수 범위 차이: HOME 사업 %s호 / 원본 총세대수 %s (HOME 기록 %s · %s), 불일치로 세지 않음' % (
                        sel.get('units'), c[hx['units']], sel.get('relation_type') or '', sel.get('scope_label') or '')
            elif sel.get('units') is not None:
                cmp_.append(('호수', to_int(sel.get('units')) == to_int(c[hx['units']]), sel.get('units'), c[hx['units']]))
            v, note = verdict_from(cmp_)
            note += scope
            R.add(stage, pid, 원본_자료명=hub['label'], 원본_파일=hub['zip'],
                  원본_위치='%s 행 %d (%s %s) · 키: %s%s' % (R.S.hub_member, ln, hub['fields']['pk'], c[hx['pk']], how,
                                                       '' if len(hits) == 1 else ' · 후보 %d행 중 첫 행' % len(hits)),
                  원본_값='%s %s · %s %s · %s %s · %s %s' % (
                      hub['fields']['date'], c[hx['date']], hub['fields']['units'].split('(')[0], c[hx['units']],
                      hub['fields']['name'], c[hx['name']], hub['fields']['block'], c[hx['block']]),
                  대조=v, 비고=note + hub['note'], **common)
        else:
            doc = (R.docs.get(sel.get('source_entity_id')) or {}).get('payload', {})
            name, note = R.web_source(src, original_file=doc.get('original_file') or '기록 없음', method=method)
            R.no_local(stage, pid, 'stage_evidence', src, sel.get('source_entity_id'), hval, sel.get('evidence_url'),
                       st, name, note)


# ---------------------------------------------------------------- evidence_bridge · document_evidence

def _bridge_records(R):
    for r in sorted(R.D['evidence_bridge'], key=lambda x: x['entity_id']):
        b = r['payload']
        if b.get('project_id') in R.pids_set:
            yield b


def _facts_of(b, stage):
    return [f for f in b.get('facts') or [] if f.get('stage') == stage]


def bridge_base_note(b):
    return '연결 관계 %s · 근거명 %s' % (b.get('relation_type') or '기록 없음', b.get('source_name'))


def bridge(R, stage):
    """evidence_bridge 의 이 단계 사실 중 공고(LH 공고·청약홈) 아닌 것. 공고는 bridge_notice 가 (공급·입주 처리 뒤에) 맡는다."""
    sdir = R.sdir(stage)
    pdf_name, pdf_file = R.src('lh_construction_pdf')['label'], R.stage_file('lh_construction_pdf')
    comp = R.src('lh_completion_csv')
    notice_srcs = set(R.src('lh_notice')['home_source_ids']) | set(R.src('applyhome')['home_source_ids'])
    for b in _bridge_records(R):
        pid = b.get('project_id')
        src = b.get('source_id')
        sid = b.get('source_entity_id')
        facts = _facts_of(b, stage)
        if not facts:
            continue
        hval = ' | '.join(fact_text(f) for f in facts)
        common = dict(HOME_표='evidence_bridge', HOME_근거원천=src, HOME_근거키=sid, HOME_값=hval,
                      HOME_근거_URL=b.get('evidence_url'), HOME_상태=STATUS_KO.get(b.get('status'), b.get('status')))
        base_note = bridge_base_note(b)
        if is_source(R, 'lh_construction_pdf', src):
            out = construction_compare(R, pid, sdir, sid, facts)
            if out is None:
                _, how = pdf_lookup(R, sid)
                R.add(stage, pid, 원본_자료명=pdf_name, 원본_파일=pdf_file, 대조='원본에서 못 찾음', 비고=how, **common)
                continue
            row, how, cmp_, unote = out
            v, note = verdict_from(cmp_)
            if v == '불일치' and unote and all(c[0] == '호수' for c in cmp_ if c[1] is False):
                v, note = '일치', '날짜·공정률 같음' + unote + ' (범위 차이, 불일치로 세지 않음)'
            R.add(stage, pid, 원본_자료명=pdf_name, 원본_파일=pdf_file, 원본_위치=pdf_pos(row) + ' · 키: ' + how,
                  원본_값=pdf_val(row), 대조=v, 비고=note + unote + ' · ' + base_note, **common)
        elif is_source(R, 'lh_completion_csv', src):
            hit, how = comp_lookup(R, sid)
            if not hit:
                R.add(stage, pid, 원본_자료명=comp['label'], 원본_파일=comp['path'], 대조='원본에서 못 찾음', 비고=how, **common)
                continue
            comp_use(R, sdir, hit, pid)
            ln, x = hit
            cdate, cunits, ctype = comp_parts(R, x)
            cmp_ = [('준공예정일', same_date(f.get('date'), cdate), f.get('date'), cdate) for f in facts if f.get('date')]
            v, note = verdict_from(cmp_)
            unote = ''
            if b.get('units') is not None and to_int(b.get('units')) != to_int(cunits):
                unote = ' · 호수 참고: HOME 사업 %s호 / 원본 세대수 %s (원본은 공급유형별 행, 범위가 다를 수 있음)' % (
                    b.get('units'), cunits)
            R.add(stage, pid, 원본_자료명=comp['label'], 원본_파일=comp['path'], 원본_위치='CSV 행 %d · 키: %s' % (ln, how),
                  원본_값='준공예정일 %s · 세대수 %s · 공급유형 %s' % (cdate, cunits, ctype), 대조=v,
                  비고=note + unote + ' · ' + base_note, **common)
        elif src in notice_srcs:
            R.seen_doc.add((pid, sid, stage))
        else:
            if src == R.cfg['home']['document_source_id']:
                R.seen_doc.add((pid, sid, stage))
            doc = (R.docs.get(sid) or {}).get('payload') or {}
            name, note = R.web_source(src, original_file=doc.get('original_file') or '기록 없음')
            R.no_local(stage, pid, 'evidence_bridge', src, sid, hval, b.get('evidence_url'), common['HOME_상태'],
                       name, note + ' · ' + base_note, plan=all(f.get('kind') == 'PLAN' for f in facts))


def document_evidence(R, stage):
    """document_evidence 에서 이 정책 사업에 직접 걸린 사실 (bridge 로 이미 나온 문서는 뺌)."""
    label = R.cfg['home_sources'][R.cfg['home']['document_source_id']]['label']
    for r in sorted(R.D['document_evidence'], key=lambda x: x['entity_id']):
        d = r['payload']
        for pid in sorted(set(d.get('matched_project_ids') or []) & R.pids_set):
            facts = [f for f in d.get('facts') or [] if f.get('stage') == stage]
            if not facts or (pid, r['entity_id'], stage) in R.seen_doc:
                continue
            hval = ' | '.join(fact_text(f) for f in facts)
            R.no_local(stage, pid, 'document_evidence', r['source_id'], r['entity_id'], hval, d.get('evidence_url'),
                       '검토', label.format(original_file=d.get('original_file') or '기록 없음'),
                       'HOME 문서 근거(matched_project_ids) · 검증 상태 %s · 원 파일은 저장소에 없음' % d.get('verification_status'),
                       plan=all(f.get('kind') == 'PLAN' for f in facts))


# ---------------------------------------------------------------- 공고 (05 공급 · 06 입주)

def lh_notice_rows(R, stage, pid, doc, facts, common, base_note):
    c = R.src('lh_notice')
    f_ = c['fields']
    sdir = R.sdir(stage)
    pan = str(doc.get('notice_no') or '')
    nt = R.S.lh_notices.get(pan)
    dt = R.S.lh_details.get(pan)
    sp = R.S.lh_supply.get(pan)
    if not nt and not dt:
        nd = digits_date(doc.get('announcement_date') or doc.get('source_date') or '')
        out_of_window = bool(nd) and nd[:8] < c['window_start']
        R.add(stage, pid, 원본_자료명=c['label'], 원본_파일=c['notice_dir'] + '/notices.json',
              대조='수집 범위 밖' if out_of_window else '원본에서 못 찾음',
              비고='%s=%s 가 notices.json·details.json 에 없음. 공고일 %s, %s · %s' % (
                  c['key'], pan, doc.get('announcement_date') or doc.get('source_date') or '기록 없음', c['window_note'],
                  base_note), **common)
        return
    sbd, pick = lh_pick_sbd(dt[1] if dt else [], doc.get('block'))
    cmp_, vals, pos = [], [], []
    by_file = {}  # 원 파일 → (위치, 그 파일에서 읽은 값): evidence 를 파일마다 한 행으로 나눌 때 쓴다
    f_notice, f_detail, f_supply = c['notice_dir'] + '/notices.json', c['detail_dir'] + '/details.json', c['notice_dir'] + '/supply.json'
    unote = ''
    if nt:
        i, x = nt
        R.use(sdir, 'lh_notice', 'notices', i, lambda: dict(x, _i=i))['관련_project_id'].add(pid)
        pos.append('notices.json items[%d]' % i)
        vals.append('%s %s · %s %s' % (f_['post_date'], x.get(f_['post_date']), f_['title'], x.get(f_['title'])))
        by_file[f_notice] = ('키 %s=%s · %s' % (c['key'], pan, pos[-1]), '%s %s · %s · %s %s' % (
            f_['notice_date'], x.get(f_['notice_date']), vals[-1], f_['title'], x.get(f_['title'])))
    if dt:
        i, _ = dt
        pos.append('details.json rows[%d] %s' % (i, c['labels']['detail_block']) + pick)
        for k, srow in enumerate(dt[1]):
            R.use(sdir, 'lh_notice', 'details', (i, k),
                  lambda: dict({a: b for a, b in srow.items() if not a.startswith('_')}, PAN_ID=pan, _i=i, _k=k)
                  )['관련_project_id'].add(pid)
        if sbd:
            vals.append('단지명 %s · 총세대수 %s · 입주예정월 %s (칸 %s)' % (
                sbd['_name'], sbd['_total'], sbd['_move'], sbd['_keys']))
            by_file[f_detail] = ('키 %s=%s · %s' % (c['key'], pan, pos[-1]), vals[-1])
    sil = None
    if sp:
        i, lst = sp
        nb = norm_block(doc.get('block'))
        names = sorted({x[2] or '' for x in lst})
        sel = [x for x in lst if x[4] and (len(names) == 1 or block_in(nz(x[2]).upper(), nb))]
        if sel:
            sil = sum(to_int(x[3]) or 0 for x in sel)
            pos.append('supply.json items[%d] dsList (%d행)' % (i, len(sel)))
            vals.append('금회공급 세대수(%s) 합 %d' % (sel[0][4], sil))
            by_file[f_supply] = ('키 %s=%s · %s' % (c['key'], pan, pos[-1]), vals[-1])
            for k, (blk, x, _, _, _) in enumerate(lst):
                R.use(sdir, 'lh_notice', 'supply', (i, k),
                      lambda: dict(x, PAN_ID=pan, _blk=blk, _i=i, _k=k))['관련_project_id'].add(pid)
    for f in facts:
        if f.get('milestone') == 'NOTICE' and nt:
            cmp_.append(('공고일(%s)' % f_['notice_date'], same_date(f.get('date'), nt[1].get(f_['notice_date'])),
                         f.get('date'), nt[1].get(f_['notice_date'])))
            if digits_date(nt[1].get(f_['notice_date'])) != digits_date(nt[1].get(f_['post_date'])):
                unote += ' · 원본 게시일 %s %s 는 공고일 %s 와 다름(정정공고 게시일)' % (
                    f_['post_date'], nt[1].get(f_['post_date']), f_['notice_date'])
            if f.get('units') is not None:
                if sil is not None:
                    cmp_.append(('금회공급 호수', to_int(f['units']) == sil, f['units'], sil))
                elif sbd:
                    unote += ' · 호수 범위: HOME 금회 공급 %s호 / 원본 총세대수 %s, 금회공급 칸 없음 (범위 차이, 대조 안 함)' % (
                        f['units'], sbd['_total'])
        if f.get('milestone') == 'MOVE_IN' and sbd:
            cmp_.append(('입주예정월', same_date(f.get('date'), sbd['_move']), f.get('date'), sbd['_move']))
    if doc.get('planned_units') is not None and sbd and sbd['_total']:
        cmp_.append(('총세대수', to_int(doc['planned_units']) == to_int(sbd['_total']), doc['planned_units'], sbd['_total']))
    if not cmp_:
        R.add(stage, pid, 원본_자료명=c['label'], 원본_파일=c['detail_dir'] + '/details.json', 원본_위치=' · '.join(pos),
              원본_값=' / '.join(vals), 대조='비교 불가',
              비고='%s=%s 는 있으나 비교할 칸(단지 하나로 정하지 못함 등)이 없음%s · %s' % (c['key'], pan, pick, base_note), **common)
        return
    v, note = verdict_from(cmp_)
    files = [f_notice, f_detail] + ([f_supply] if f_supply in by_file else [])
    r = R.add(stage, pid, 원본_자료명=c['label'], 원본_파일='; '.join(files),
              원본_위치='키 %s=%s · ' % (c['key'], pan) + ' · '.join(pos), 원본_값=' / '.join(vals), 대조=v,
              비고=note + unote + ' · 날짜는 구분자(. - 년 월)만 빼고 비교 · ' + base_note, **common)
    r['_by_file'] = by_file


def lh_pick_sbd(sbd, block):
    names = sorted({x['_name'] or '' for x in sbd})
    if len(names) <= 1:
        return (sbd[0] if sbd else None), ''
    nb = norm_block(block)
    hit = [n for n in names if nb and block_in(nz(n).upper(), nb)]
    if len(hit) == 1:
        return [x for x in sbd if (x['_name'] or '') == hit[0]][0], ' · 단지 %d개 중 블록 %s 로 고름' % (len(names), block)
    return None, ' · 단지 %d개 중 하나로 정하지 못함' % len(names)


def cheongyak_rows(R, stage, pid, sid, facts, common, base_note):
    c = R.src('applyhome')
    f_ = c['fields']
    n = R.notices.get(sid)
    if not n:
        hit, how = None, '공고 레코드가 덤프에 없음'
    else:
        no = str(n['payload'].get('house_manage_no') or '')
        hit, how = R.S.ah.get(no), '%s=%s' % (c['key'], no)
    if not hit:
        R.add(stage, pid, 원본_자료명=c['label'], 원본_파일=c['dir'], 대조='원본에서 못 찾음',
              비고='%s 가 청약홈 Detail %d종에 없음 · %s' % (how, len(c['ops']), base_note), **common)
        return
    op, i, x = hit
    rec = R.use(R.sdir(stage), 'applyhome', None, (op, i),
                lambda: dict((k, v) for k, v in x.items() if k not in c['drop_fields']))
    rec.setdefault('_op', op)
    rec.setdefault('_i', i)
    rec['관련_project_id'].add(pid)
    cmp_ = []
    unote = ''
    dc = R.stages[stage].get('applyhome_date') or {}
    date_field, date_label = f_.get(dc.get('field')), dc.get('label')
    for f in facts:
        if date_field and f.get('date'):
            cmp_.append((date_label, same_date(f.get('date'), x.get(date_field)), f.get('date'), x.get(date_field)))
        if f.get('units') is not None:
            if f.get('scope_partial'):
                unote = ' · 호수 범위: HOME %s호(%s) / 원본 %s %s (범위 차이, 대조 안 함)' % (
                    f['units'], f.get('scope_label') or '', f_['units'], x.get(f_['units']))
            else:
                cmp_.append(('공급세대수', to_int(f['units']) == to_int(x.get(f_['units'])), f['units'], x.get(f_['units'])))
    v, note = verdict_from(cmp_)
    R.add(stage, pid, 원본_자료명=c['label'], 원본_파일=c['dir'] + '/' + op + '.json',
          원본_위치='%s.json rows[%d] · 키: %s (HOME 공고 %s)' % (op, i, how, sid),
          원본_값='%s %s · %s %s · %s %s · %s %s' % (f_['name'], x.get(f_['name']), f_['notice_date'], x.get(f_['notice_date']),
                                             f_['units'], x.get(f_['units']), f_['move'], x.get(f_['move'])),
          대조=v, 비고=note + unote + ' · ' + base_note, **common)


def collection_link(R, stage, pid):
    """collection_link: HOME 이 공고(청약홈 등)를 이 단계에 잇는 기록."""
    for r in R.D['collection_link']:
        c = r['payload']
        if c.get('project_id') != pid or c.get('stage') != stage:
            continue
        for l in c.get('links') or []:
            fact = {'date': l.get('date'), 'kind': l.get('kind')}
            common = dict(HOME_표='collection_link', HOME_근거원천=l.get('source_id'), HOME_근거키=l.get('source_entity_id'),
                          HOME_값='%s %s · %s' % (l.get('kind'), l.get('date'), l.get('basis')),
                          HOME_근거_URL=l.get('evidence_url'),
                          HOME_상태=STATUS_KO.get(l.get('review_status'), l.get('review_status')))
            if is_source(R, 'applyhome', l.get('source_id')):
                cheongyak_rows(R, stage, pid, l.get('source_entity_id'), [fact], common, '수집 연결(collection_link)')
            else:
                R.no_local(stage, pid, 'collection_link', l.get('source_id'), l.get('source_entity_id'),
                           common['HOME_값'], l.get('evidence_url'), common['HOME_상태'], l.get('source_id'), '저장소 원본 없음')


def bridge_notice(R, stage):
    """evidence_bridge 의 공고 사실(LH 공고 상세·청약홈)."""
    for b in _bridge_records(R):
        src = b.get('source_id')
        if not (is_source(R, 'lh_notice', src) or is_source(R, 'applyhome', src)):
            continue
        facts = _facts_of(b, stage)
        if not facts:
            continue
        pid = b['project_id']
        common = dict(HOME_표='evidence_bridge', HOME_근거원천=src, HOME_근거키=b['source_entity_id'],
                      HOME_값=' | '.join(fact_text(f) for f in facts), HOME_근거_URL=b.get('evidence_url'),
                      HOME_상태=STATUS_KO.get(b.get('status'), b.get('status')))
        if is_source(R, 'lh_notice', src):
            lh_notice_rows(R, stage, pid, (R.docs.get(b['source_entity_id']) or {}).get('payload') or {}, facts, common,
                           bridge_base_note(b))
        else:
            cheongyak_rows(R, stage, pid, b['source_entity_id'], facts, common, bridge_base_note(b))


