"""설명자료 HTML 생성 — 파이프라인 출력(docs/speech/research)을 읽어 정적 HTML 한 파일을 만든다.

    python3 -P -E tools/research/chain/explain.py [--root 저장소] [--out 출력.html]

- 수치는 모두 입력 파일에서 읽는다. 문구는 config/explain.json, 기준일은 config/stage_sources.json 의 checked_at.
- 없는 입력은 그 절에 '아직 없음'으로 표시하고 실패하지 않는다. 같은 입력이면 바이트까지 같다(실행 시각 없음).
- 개인정보(전화번호·이메일·IPv4)는 입력에서 지우고, 생성한 HTML 에 하나라도 남으면 실패한다.
- 정책 id·이름은 코드에 없다(config/policies.json 과 _work 폴더에서 읽는다).
"""
import argparse
import csv
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

CONFIRM = {'MATCH', 'MISMATCH', 'SOURCED', 'NOT_IN_SOURCE', 'ABSENT_CONFIRMED'}
BASIS_ORDER = ['INDEPENDENT', 'RULE', 'SAME_SOURCE']
BASIS_LABEL = {'INDEPENDENT': '독립 원천', 'RULE': '규칙', 'SAME_SOURCE': '같은 원천'}

PII = [
    ('전화번호', re.compile(r'(?<![\w-])(?:0\d{1,2}[-.)\s]\s?\d{3,4}[-.\s]\d{4}|01[016789]\d{7,8}|\d{2,4}-\d{3,4}-\d{4})(?![\w-])')),
    ('이메일', re.compile(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+')),
    ('IPv4', re.compile(r'(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])')),
]

CSS = """:root{--bg:#F5F7FB;--pn:#fff;--ink:#0F1A33;--sub:#56627F;--line:#DCE2EF;--acc:#C8421F;--soft:#EEF2FB;--ok:#1F7A4D;--warn:#A86A00;--bad:#C8421F;--track:#E4E9F4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0B1230;--pn:#121C45;--ink:#E8EDFF;--sub:#A3AFD6;--line:#25336A;--acc:#FF8A65;--soft:#17235A;--ok:#5FD39A;--warn:#F2B94B;--bad:#FF8A65;--track:#1C2A63}}
:root[data-theme="dark"]{--bg:#0B1230;--pn:#121C45;--ink:#E8EDFF;--sub:#A3AFD6;--line:#25336A;--acc:#FF8A65;--soft:#17235A;--ok:#5FD39A;--warn:#F2B94B;--bad:#FF8A65;--track:#1C2A63}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:980px;margin:0 auto;padding:44px 16px 80px}
h1{margin:0 0 6px;font-size:26px;line-height:1.3;letter-spacing:-.02em}
.sub{color:var(--sub);font-size:13.5px;margin:0 0 30px}
h2{margin:44px 0 12px;font-size:19px}
h3{margin:26px 0 8px;font-size:16px}
.card{background:var(--pn);border:1px solid var(--line);border-left:4px solid var(--acc);border-radius:10px;padding:16px 20px}
.card p{margin:0;font-size:17px;font-weight:700;line-height:1.6}
.card p+p{margin-top:8px;font-size:14.5px;font-weight:500;color:var(--sub)}
ul,ol{margin:12px 0 0;padding-left:20px}li{margin:6px 0}
code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.tw{overflow-x:auto;margin:6px 0 4px;border:1px solid var(--line);border-radius:10px;background:var(--pn)}
table{border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.55}
th,td{padding:8px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:var(--soft);font-weight:700;white-space:nowrap}tr:last-child td{border-bottom:0}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.note{color:var(--sub);font-size:13px;margin:6px 0 0}
.tag{display:inline-block;font-size:12px;font-weight:700;line-height:1;padding:4px 7px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.t-ok{color:var(--ok)}.t-warn{color:var(--warn)}.t-bad{color:var(--bad)}
/* 키 사슬 */
.chain{margin:8px 0 0;display:grid;gap:0}
.st{display:grid;grid-template-columns:44px 1fr auto;gap:4px 14px;align-items:center;background:var(--pn);border:1px solid var(--line);border-radius:10px;padding:12px 16px}
.st .no{width:36px;height:36px;border-radius:50%;background:var(--soft);display:grid;place-items:center;font-weight:700}
.st .nm{font-weight:700}.st .k{color:var(--sub);font-size:13.5px}
.st .c{text-align:right;font-size:13px;color:var(--sub);font-variant-numeric:tabular-nums;line-height:1.5}
.st .c b{color:var(--ink);font-size:15px}
.br{display:grid;grid-template-columns:44px 1fr;gap:0 14px;padding:0 16px}
.br .ln{justify-self:center;width:2px;background:var(--line)}
.br .bd{padding:10px 0 12px;font-size:13.5px}
.br .bt{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.bar{display:flex;align-items:center;gap:10px;margin:6px 0 2px}
.bar .tr{flex:1;max-width:340px;height:8px;border-radius:4px;background:var(--track);overflow:hidden}
.bar .fl{height:100%;border-radius:4px;background:var(--acc)}
.bar .fl.ok{background:var(--ok)}.bar .fl.warn{background:var(--warn)}
.bar .v{font-variant-numeric:tabular-nums;font-weight:700;white-space:nowrap}
.br .why{color:var(--sub)}
.log{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);color:var(--sub);font-size:13.5px}
.log ul{margin:6px 0 0}
@media (max-width:560px){.st{grid-template-columns:36px 1fr}.st .c{grid-column:2;text-align:left}.br{padding:0 10px}.st{padding:12px}}"""


# ---------- 읽기 ----------

def read_text(path):
    try:
        with open(path, encoding='utf-8-sig') as f:
            return f.read()
    except OSError:
        return None


def read_json(path):
    t = read_text(path)
    if t is None:
        return None
    try:
        return json.loads(t)
    except ValueError:
        return None


def read_jsonl(path):
    t = read_text(path)
    out = []
    for line in (t or '').splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def read_csv(path):
    t = read_text(path)
    if t is None:
        return None
    return list(csv.DictReader(t.splitlines()))


def scrub(s):
    """개인정보 모양을 지운다(입력에 있어도 옮기지 않는다)."""
    s = str(s)
    for _name, rx in PII:
        s = rx.sub('', s)
    return s


# ---------- 문자열·HTML ----------

def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def inline(s):
    """`코드`와 **굵게** 만 HTML 로."""
    s = scrub(s)
    out = []
    for i, part in enumerate(s.split('`')):
        if i % 2 == 1:
            out.append('<code>%s</code>' % esc(part))
        else:
            out.append(re.sub(r'\*\*(.+?)\*\*', lambda m: '<b>%s</b>' % m.group(1), esc(part)))
    return ''.join(out)


def short(s, limit):
    s = scrub(s or '').strip()
    if len(s) <= limit:
        return inline(s)
    return esc(s.replace('`', '').replace('**', '')[:limit].rstrip()) + '…'


def num(n):
    return '{:,}'.format(n)


def pct(n, d):
    return None if not d else 100.0 * n / d


def fpct(v):
    return '—' if v is None else '%.1f%%' % v


def table(head, rows, numeric=(), raw=False):
    """rows 의 칸은 HTML 문자열(raw=True) 또는 이미 변환된 문자열이다."""
    h = ''.join('<th%s>%s</th>' % (' class="n"' if i in numeric else '', esc(c)) for i, c in enumerate(head))
    b = ''.join('<tr>%s</tr>' % ''.join('<td%s>%s</td>' % (' class="n"' if i in numeric else '', c) for i, c in enumerate(r)) for r in rows)
    return '<div class="tw"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (h, b)


def tag(kind, text):
    return '<span class="tag t-%s">%s</span>' % (kind, esc(text))


def bar(n, d, cls=''):
    p = pct(n, d)
    w = 0 if p is None else max(0.0, min(100.0, p))
    return ('<div class="bar"><div class="tr"><div class="fl %s" style="width:%.1f%%"></div></div>'
            '<span class="v">%s / %s · %s</span></div>') % (cls, w, num(n), num(d), fpct(p))


def missing(cfg, what):
    return '<p class="note">%s %s</p>' % (tag('warn', cfg['missing_text']), inline(what))


# ---------- 마크다운 일부 ----------

def md_sections(text, level):
    """level 개의 # 로 시작하는 제목별로 [(제목, [줄...])]. 더 깊은 제목은 본문에 남는다."""
    out, cur = [], None
    mark = '#' * level + ' '
    for line in (text or '').splitlines():
        if line.startswith(mark):
            cur = (line[len(mark):].strip(), [])
            out.append(cur)
        elif re.match(r'^#{1,%d} ' % (level - 1 if level > 1 else 0), line) and level > 1:
            cur = None
        elif cur is not None:
            cur[1].append(line)
    return out


def md_tables(lines):
    """줄 목록에서 표를 [(머리, [행...])] 로. `\\|` 는 칸 안의 문자."""
    out, cur = [], None
    for line in lines:
        if line.lstrip().startswith('|'):
            cells = [c.strip().replace('\x00', '|') for c in line.strip().replace('\\|', '\x00').strip('|').split('|')]
            if cur is None:
                cur = [cells, []]
                out.append(cur)
            elif all(re.match(r'^:?-{2,}:?$', c) for c in cells):
                continue
            else:
                cur[1].append(cells)
        else:
            cur = None
    return [(h, r) for h, r in out]


def md_render(lines, limit=None):
    """문단·글머리·번호·표를 HTML 로(제목은 건너뜀)."""
    html, i, n = [], 0, len(lines)
    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1
        elif line.lstrip().startswith('|'):
            j = i
            while j < n and lines[j].lstrip().startswith('|'):
                j += 1
            for head, rows in md_tables(lines[i:j]):
                lim = limit or 400
                html.append(table(head, [[short(c, lim) for c in r + [''] * (len(head) - len(r))] for r in rows]))
            i = j
        elif re.match(r'^\s*(?:[-*]|\d+\.)\s', line):
            j = i
            while j < n and (re.match(r'^\s*(?:[-*]|\d+\.)\s', lines[j]) or (lines[j].startswith('  ') and lines[j].strip())):
                j += 1
            html.append(md_list(lines[i:j], limit))
            i = j
        elif line.startswith('#'):
            i += 1
        else:
            j = i
            while j < n and lines[j].strip() and not lines[j].lstrip().startswith(('|', '#')) and not re.match(r'^\s*(?:[-*]|\d+\.)\s', lines[j]):
                j += 1
            html.append('<p>%s</p>' % short(' '.join(x.strip() for x in lines[i:j]), limit or 600))
            i = j
    return '\n'.join(html)


def md_list(lines, limit):
    items = []   # (깊이, 글)
    for line in lines:
        m = re.match(r'^(\s*)(?:[-*]|\d+\.)\s+(.*)$', line)
        if m:
            items.append([len(m.group(1)) // 2, m.group(2)])
        elif items:
            items[-1][1] += ' ' + line.strip()
    out, depth = [], 0
    for d, t in items:
        d = min(d, depth + 1)
        while depth < d:
            out.append('<ul>')
            depth += 1
        while depth > d:
            out.append('</ul>')
            depth -= 1
        out.append('<li>%s</li>' % short(t, limit or 500))
    while depth > 0:
        out.append('</ul>')
        depth -= 1
    return '<ul>' + ''.join(out) + '</ul>'


# ---------- 입력 모음 ----------

class Data:
    def __init__(self, root):
        self.root = root
        self.cfg = read_json(os.path.join(root, 'tools/research/chain/config/explain.json')) or {}
        stage = read_json(os.path.join(root, 'tools/research/chain/config/stage_sources.json')) or {}
        paths = stage.get('paths') or {}
        self.checked_at = stage.get('checked_at') or '—'
        self.research = paths.get('research_dir', 'docs/speech/research')
        self.work = paths.get('work_dir', self.research + '/dataset/_work')
        self.dataset = self.research + '/dataset'
        pol = read_json(os.path.join(root, 'tools/research/chain/config/policies.json')) or {}
        self.policies = [{'policy_id': p.get('policy_id'), 'name': p.get('name') or p.get('policy_id'), 'announced': p.get('announced')}
                         for p in pol.get('policies', []) if p.get('policy_id')]
        known = {p['policy_id'] for p in self.policies}
        for d in sorted(glob.glob(os.path.join(root, self.work, '*', ''))):
            pid = os.path.basename(d.rstrip('/'))
            if pid not in known and (glob.glob(d + 'evidence*.jsonl') or os.path.exists(d + 'report.json')):
                rep = read_json(d + 'report.json') or {}
                self.policies.append({'policy_id': pid, 'name': rep.get('name') or pid, 'announced': None})
        self.pid_name = {p['policy_id']: p['name'] for p in self.policies}

    def path(self, rel):
        return os.path.join(self.root, rel)

    def rpath(self, name):
        return os.path.join(self.root, self.research, name)

    def text(self, name):
        return read_text(self.rpath(name))

    def csv(self, name):
        return read_csv(self.rpath(name))


# ---------- M1 ----------

def load_evidence(data):
    ev = {}
    for p in data.policies:
        rows = []
        for f in sorted(glob.glob(data.path(data.work + '/' + p['policy_id'] + '/evidence*.jsonl'))):
            rows += read_jsonl(f)
        if rows:
            ev[p['policy_id']] = rows
    return ev


def category(e):
    t, sid = e.get('subject_table'), e.get('subject_id') or ''
    if t == 'policies':
        return '정책 값'
    if t == 'policy_targets':
        return '정책 목표'
    if t == 'programs':
        return '프로그램'
    if t == 'links':
        return {'POLICY_PROGRAM': '정책→프로그램', 'PROGRAM_PROJECT': '프로그램→사업', 'POLICY_PROJECT': '정책→사업'}.get(sid.split('|')[0], '연결')
    m = re.match(r'^stage_(0[1-6])$', e.get('field') or '')
    return '사업×단계 %s' % (m.group(1) if m else (e.get('stage_code') or ''))


def m1_from_evidence(rows):
    """설계 1절. 항목 = (subject_table, subject_id, field)."""
    items = defaultdict(list)
    for e in rows:
        items[(e.get('subject_table'), e.get('subject_id'), e.get('field'))].append(e)
    stat = defaultdict(Counter)
    for evs in items.values():
        conf = [e for e in evs if e.get('verdict') in CONFIRM and e.get('basis') != 'EXISTENCE']
        nd = [e for e in conf if not (e['verdict'] == 'ABSENT_CONFIRMED' and e.get('basis') == 'RULE')]   # 파생 미도달 = 미도달 확인이면서 규칙(basis RULE)
        na = [e for e in conf if e['verdict'] != 'ABSENT_CONFIRMED']
        best = None
        if conf:
            best = min((e.get('basis') for e in conf), key=lambda b: BASIS_ORDER.index(b) if b in BASIS_ORDER else 9)
        for k in (category(evs[0]), '전체'):
            s = stat[k]
            s['total'] += 1
            s['inc'] += bool(conf)
            s['nd'] += bool(nd)
            s['na'] += bool(na)
            s['sourced'] += any(e['verdict'] == 'SOURCED' for e in conf)
            s['notinsrc'] += any(e['verdict'] == 'NOT_IN_SOURCE' for e in evs)
            if conf:
                s['basis:' + (best if best in BASIS_ORDER else '기타')] += 1
            elif any(e.get('basis') == 'EXISTENCE' or e.get('verdict') == 'EXISTS_ONLY' for e in evs):
                s['existence_only'] += 1
            s['derived_only'] += bool(conf) and not nd
    return stat


def m1_from_csv(rows, pids):
    """품질_리포트.csv(옛 판): '파생 미도달 제외' 값이 없다."""
    stat = defaultdict(lambda: defaultdict(Counter))
    for r in rows:
        pid, cat, kind = r.get('정책'), r.get('범주'), r.get('지표') or ''
        if pid not in pids or not kind.startswith('M1'):
            continue
        try:
            a, d = int(r['분자']), int(r['분모'])
        except (ValueError, KeyError, TypeError):
            continue
        s = stat[pid][cat]
        if kind == 'M1':
            s['inc'], s['total'] = a, d
        elif kind.startswith('M1(ABSENT'):
            s['na'] = a
        elif kind.startswith('M1 basis '):
            b = kind[len('M1 basis '):].strip()
            s['basis:' + b] = a
        elif kind == 'M1 SOURCED':
            s['sourced'] = a
    return stat


def collect_m1(data, evidence):
    out, source = {}, {}
    csv_rows = data.csv('품질_리포트.csv')
    pids = [p['policy_id'] for p in data.policies]
    from_csv = m1_from_csv(csv_rows or [], set(pids)) if csv_rows else {}
    for pid in pids:
        if pid in evidence:
            out[pid], source[pid] = m1_from_evidence(evidence[pid]), 'evidence'
        elif pid in from_csv and from_csv[pid].get('전체'):
            out[pid], source[pid] = from_csv[pid], 'csv'
    return out, source


# ---------- 절 ----------

def cat_order(c):
    base = ['정책 값', '정책 목표', '정책→프로그램', '프로그램', '프로그램→사업', '정책→사업', '연결']
    if c in base:
        return (0, base.index(c))
    return (1, c)


def tri(s, key_nd=True):
    return s.get('inc', 0), s.get('nd') if 'nd' in s else None, s.get('na', 0)


def cell3(n, d, t):
    if n is None:
        return '<span class="note">%s</span>' % esc('아직 없음')
    p = pct(n, d)
    return '%s / %s · %s %s' % (num(n), num(d), fpct(p), tag('ok' if p is not None and p >= t else 'bad', '≥%g%%' % t if p is not None and p >= t else '<%g%%' % t))


def section_conclusion(data, m1, src):
    c, t = data.cfg, data.cfg.get('target_pct', 90)
    cc = c.get('conclusion', {})
    rows, met, inc_met = [], 0, 0
    for p in data.policies:
        s = (m1.get(p['policy_id']) or {}).get('전체')
        if not s:
            continue
        d = s['total']
        vals = [s.get('inc', 0), s.get('nd'), s.get('na', 0)]
        ok = [v is not None and pct(v, d) is not None and pct(v, d) >= t for v in vals]
        met += all(ok)
        inc_met += ok[0]
        rows.append([inc(p['name']), num(d)] + [cell3(v, d, t) for v in vals] + [tag('ok', '달성') if all(ok) else tag('bad', '미달')])
    if not rows:
        return '<div class="card"><p>%s</p></div>' % esc(cc.get('no_data', ''))
    n = len(rows)
    if met == n:
        k = 'all_met'
    elif met == 0:
        k = 'none_met'
    else:
        k = 'mixed'
    sentence = cc.get(k, '').format(n=n, met=met, miss=n - met, t=t)
    basis = cc.get('basis_note', '').format(inc_met=inc_met, n=n, t=t)
    html = '<div class="card"><p>%s</p><p>%s</p></div>' % (esc(sentence), esc(basis))
    html += '<ul>%s</ul>' % ''.join('<li>%s</li>' % esc(b) for b in cc.get('bullets', []))
    html += table(['정책', '전체 항목(분모)', '미도달 포함', '파생 미도달 제외', '미도달 제외', 'M1 목표'], rows, numeric=(1,))
    if any(src.get(p['policy_id']) == 'csv' for p in data.policies):
        html += '<p class="note">%s</p>' % esc('일부 정책은 evidence 가 없어 품질_리포트.csv 에서 읽었습니다(옛 판에는 파생 미도달 제외 값이 없음).')
    return html


def inc(s):
    return esc(scrub(s))


def section1(data, m1):
    c, t = data.cfg, data.cfg.get('target_pct', 90)
    names = c.get('stage_names', {})
    html = '<p class="note">%s</p>' % esc(c['sections']['s1']['note'])
    if not m1:
        return html + missing(c, '입력: evidence 또는 품질 리포트')
    for p in data.policies:
        st = m1.get(p['policy_id'])
        if not st:
            continue
        html += '<h3>%s</h3><div class="chain">' % inc(p['name'])
        boxes = []
        for cat in sorted((k for k in st if k != '전체'), key=cat_order):
            m = re.match(r'^사업×단계 (0[1-6])$', cat)
            label = (m.group(1) + ' ' + names.get(m.group(1), '')) if m else cat
            boxes.append((cat, label))
        for idx, (cat, label) in enumerate(boxes):
            s = st[cat]
            d = s['total']
            nd = s.get('nd')
            m = re.match(r'^사업×단계 (0[1-6])$', cat)
            no = {'01': '①', '02': '②', '03': '③', '04': '④', '05': '⑤', '06': '⑥'}.get(m.group(1), '') if m else '·'
            html += ('<div class="st"><div class="no">%s</div><div><div class="nm">%s</div><div class="k">%s</div></div>'
                     '<div class="c"><b>%s</b><br>/ %s 항목</div></div>') % (
                esc(no), esc(label), esc('확인된 항목 / 전체 항목(미도달 포함)'), num(s.get('inc', 0)), num(d))
            na = s.get('na', 0)
            p_na = pct(na, d)
            kind = 'ok' if p_na is not None and p_na >= t else ('warn' if p_na and p_na >= 50 else '')
            why = '미도달 포함 %s · 파생 미도달 제외 %s · 미도달 제외 %s' % (
                fpct(pct(s.get('inc', 0), d)), fpct(pct(nd, d)) if nd is not None else '아직 없음', fpct(p_na))
            bas = ' · '.join('%s %s' % (BASIS_LABEL[b], num(s.get('basis:' + b, 0))) for b in BASIS_ORDER)
            if idx < len(boxes) - 1:
                html += ('<div class="br"><div class="ln"></div><div class="bd">%s<div class="why">%s<br>확인 근거(항목 수): %s</div></div></div>'
                         % (bar(na, d, kind), esc(why), esc(bas)))
            else:
                html += ('<div class="br"><div></div><div class="bd">%s<div class="why">%s<br>확인 근거(항목 수): %s</div></div></div>'
                         % (bar(na, d, kind), esc(why), esc(bas)))
        html += '</div>'
    return html


def section2(data):
    c = data.cfg
    html = '<p class="note">%s</p>' % esc(c['sections']['s2']['note'])
    rows = data.csv('원천주체_단계별.csv')
    if rows is None:
        html += missing(c, '입력 ' + '`%s/원천주체_단계별.csv`' % data.research)
    else:
        per = defaultdict(Counter)
        for r in rows:
            s = per[r.get('단계') or '']
            s['rows'] += 1
            s['author'] += (r.get('작성주체_확인') or '').startswith('원문')
            s['dept'] += (r.get('담당부서_확인') or '').startswith('원문')
            s['ev'] += int(r.get('쓰인_evidence_수') or 0) if (r.get('쓰인_evidence_수') or '').isdigit() else 0
        names = c.get('stage_names', {})
        html += table(['단계', '원천 행', '작성 주체 원문 확인', '담당부서 원문 확인', '쓰인 evidence'],
                      [['%s %s' % (k, names.get(k, '')), num(v['rows']), '%s (%s)' % (num(v['author']), fpct(pct(v['author'], v['rows']))),
                        '%s (%s)' % (num(v['dept']), fpct(pct(v['dept'], v['rows']))), num(v['ev'])] for k, v in sorted(per.items())], numeric=(1, 2, 3, 4))
        html += '<p class="note">%s</p>' % esc('작성 주체 확인 = 확인방법 칸이 원문 확인으로 시작하는 원천 행. 분모는 단계별 원천 행 수.')
        html += '<h3>원천별 ① 업무 주체 · ② 입력처 · ③ 공개 부서</h3>'
        html += table(['단계', '원천', '① 업무 주체', '② 입력처', '③ 공개 부서'],
                      [[esc(r.get('단계', '')), short(r.get('원천', ''), 70), short(r.get('①업무주체', ''), 70),
                        short(r.get('②입력처', ''), 60), short(r.get('③공개부서', ''), 60)] for r in rows])
    md = data.text('원천주체_단계별.md')
    if md is None:
        html += missing(c, '입력 `원천주체_단계별.md`')
    else:
        secs = [s for s in md_sections(md, 2) if s[0].startswith('기준표와 다른 점')]
        html += '<h3>기준표와 다른 점</h3>'
        if secs:
            tabs = md_tables(secs[0][1])
            if tabs:
                head, trs = tabs[0]
                keep = [i for i, h in enumerate(head) if h != '근거']
                html += table([head[i] for i in keep], [[short(r[i], 160) if i < len(r) else '' for i in keep] for r in trs])
        else:
            html += missing(c, '그 절이 없음')
    return html


def section3(data, m1, src, evidence):
    c = data.cfg
    t = c.get('target_pct', 90)
    html = '<p class="note">%s</p>' % esc(c['sections']['s3']['note'])
    html += '<h3>M1 원천 확인률 — 정책 × 범주</h3>'
    if not m1:
        html += missing(c, '입력: evidence 또는 품질 리포트')
    else:
        rows = []
        for p in data.policies:
            st = m1.get(p['policy_id'])
            if not st:
                continue
            for cat in ['전체'] + sorted((k for k in st if k != '전체'), key=cat_order):
                s = st[cat]
                d = s['total']
                nd = s.get('nd')
                rows.append([inc(p['name']) if cat == '전체' else '', esc(cat), num(d),
                             '%s · %s' % (num(s.get('inc', 0)), fpct(pct(s.get('inc', 0), d))),
                             ('%s · %s' % (num(nd), fpct(pct(nd, d)))) if nd is not None else esc('아직 없음'),
                             '%s · %s' % (num(s.get('na', 0)), fpct(pct(s.get('na', 0), d)))])
        html += table(['정책', '범주', '전체 항목(분모)', '미도달 포함(확인 수 · 확인률)', '파생 미도달 제외', '미도달 제외'], rows, numeric=(2,))
        html += '<h3>basis 분포 — 확인된 항목을 가장 강한 근거 하나로 분류</h3>'
        rows = []
        for p in data.policies:
            s = (m1.get(p['policy_id']) or {}).get('전체')
            if not s:
                continue
            conf = s.get('inc', 0)
            rows.append([inc(p['name'])] + ['%s (%s)' % (num(s.get('basis:' + b, 0)), fpct(pct(s.get('basis:' + b, 0), conf))) for b in BASIS_ORDER] + [
                num(s['existence_only']) if 'existence_only' in s or src.get(p['policy_id']) == 'evidence' else esc('아직 없음'),
                num(s['derived_only']) if src.get(p['policy_id']) == 'evidence' else esc('아직 없음'),
                num(s.get('notinsrc', 0)) if src.get(p['policy_id']) == 'evidence' else esc('아직 없음'),
                num(conf)])
        html += table(['정책', '독립 원천', '규칙', '같은 원천', '존재만(미확인)', '파생 미도달로만 확인', 'NOT_IN_SOURCE 포함 항목', '확인된 항목(분모)'], rows, numeric=(1, 2, 3, 4, 5, 6, 7))
        html += '<p class="note">%s</p>' % esc('괄호 안 비율의 분모는 확인된 항목 수(미도달 포함 기준). 존재만 = 확인되지 않았고 기록의 존재만 본 항목. 파생 미도달로만 확인 = 선행 단계 미도달에서 이어서 판단한 미도달만 있는 항목.')
    # M2
    qr = data.csv('품질_리포트.csv')
    html += '<h3>M2 출처 목록 완전성</h3>'
    m2 = [r for r in (qr or []) if (r.get('지표') or '') == 'M2']
    if not m2:
        html += missing(c, '입력 `품질_리포트.csv` 의 M2 행')
    else:
        html += table(['항목', '값'], [[esc(r.get('범주', '')), esc(r.get('값', ''))] for r in m2], numeric=(1,))
    # M3 · M4 정확도: 품질_리포트.csv(metrics.py 가 감사 파일을 종류별 최신 판으로 센 값)를 읽는다
    for metric, title, what in (('M3', 'M3 표본 정확도', '확인된 항목 표본(evidence_id 있는 감사 행)'),
                                ('M4 정확도', 'M4 누락 판정 정확도', '누락 후보 판정 표본(audit_gaps)')):
        html += '<h3>%s</h3>' % esc(title)
        cur = [r for r in (qr or []) if (r.get('지표') or '') == metric]
        hist = [r for r in (qr or []) if (r.get('지표') or '') == metric + ' 이력']
        r0 = cur[0] if cur else None
        if not r0 or (r0.get('판정') or '') == '미측정' or not (r0.get('분모') or '').strip():
            html += '<p>%s <span class="note">%s</span></p>' % (tag('warn', '미측정'), esc('%s 감사 파일이 없습니다. 목표는 오류율 2%% 이하.' % what))
        else:
            n, err, rate = int(r0['분모']), int(r0['분자']), float(r0['값'])
            html += '<p>%s %s · 표본 %s건 중 오류 %s건 · 오류율 %s <span class="note">%s</span></p>' % (
                tag('ok' if rate <= 2 else 'bad', '목표 2% 이하'), esc(what), num(n), num(err), fpct(rate), esc('최신 판 ' + (r0.get('범주') or '')))
        for h in hist:
            html += '<p class="note">%s</p>' % esc('이전 판 %s: %s건 중 오류 %s건' % (h.get('범주', ''), h.get('분모', ''), h.get('분자', '')))
    # M4
    html += '<h3>M4 누락 검증 — 권위 원천에 있는데 데이터셋에 없는 후보</h3>'
    by = defaultdict(Counter)
    labels = set()
    for p in data.policies:
        for r in read_jsonl(data.path(data.work + '/' + p['policy_id'] + '/gaps.jsonl')):
            lab = r.get('verdict_label') or r.get('verdict') or '판정 없음'
            labels.add(lab)
            by[(p['policy_id'], r.get('stage_code') or '')][lab] += 1
    if not by:
        html += missing(c, '입력 `_work/<정책>/gaps.jsonl`')
    else:
        labs = sorted(labels)
        rows = []
        for (pid, stg), cn in sorted(by.items()):
            rows.append([inc(data.pid_name.get(pid, pid)), esc(('%s %s' % (stg, c.get('stage_names', {}).get(stg, ''))).strip())] + [num(cn.get(l, 0)) for l in labs] + [num(sum(cn.values()))])
        html += table(['정책', '단계'] + labs + ['합계'], rows, numeric=tuple(range(2, 3 + len(labs))))
        html += '<p class="note">%s</p>' % esc('판정 칸은 gaps.jsonl 의 verdict_label(없으면 verdict). 목표는 판정 안 된 후보 0.')
    return html


def md_section_by_prefix(text, level, prefix):
    for h, lines in md_sections(text, level):
        if h.startswith(prefix):
            return lines
    return None


def pol_blocks(text, data):
    """'## … — `정책id`' 제목별 블록 → {정책id: lines}."""
    out = {}
    for h, lines in md_sections(text or '', 2):
        m = re.search(r'`([A-Za-z0-9_]+)`', h)
        pid = m.group(1) if m else next((p['policy_id'] for p in data.policies if p['policy_id'] in h or p['name'] in h), None)
        if pid:
            out[pid] = lines
    return out


MISMATCH_RX = re.compile(r'^\*\*(.+?)\*\*\s+`([^`]+)`\s+(.*?)\s+—\s+HOME 값:\s*(.*?)\s*/\s*원본\(([^)]*)\):\s*(.*)$')


def collect_findings(data):
    """README '주요 불일치' 절 + report_notes.json → (불일치 행, 그 밖의 글, 설정에만 있는 글, README 가 있는지).
    불일치 행 = dict(policy, kind, rid, name, home, src, files). 글 = (정책 이름, 본문)."""
    readme = data.text('README.md')
    seen, rows, others, readme_all = set(), [], [], ''
    if readme is not None:
        for pid, lines in pol_blocks(readme, data).items():
            sub = md_section_by_prefix('\n'.join(lines) and '\n'.join(lines).replace('\n### ', '\n## ').replace('\r', ''), 2, '주요 불일치')
            if not sub:
                continue
            pname = data.pid_name.get(pid, pid)
            for line in sub:
                m = re.match(r'^\d+\.\s+(.*)$', line)
                if not m:
                    continue
                txt = scrub(m.group(1))
                readme_all += txt
                if (pid, txt) in seen:
                    continue
                seen.add((pid, txt))
                mm = MISMATCH_RX.match(txt)
                if mm:
                    paths = [x.strip() for x in mm.group(5).split(';') if x.strip()]
                    files = ', '.join(sorted({os.path.basename(x) for x in paths}))
                    rows.append({'policy': pname, 'kind': mm.group(1), 'rid': mm.group(2), 'name': mm.group(3), 'home': mm.group(4),
                                 'src': mm.group(6), 'files': files, 'paths': paths})
                else:
                    others.append((pname, txt))
    notes = read_json(data.path('tools/research/chain/config/report_notes.json')) or {}
    extra = []
    plain_all = re.sub(r'[`*]', '', readme_all)
    for pid, lst in sorted((notes.get('notes') or {}).items()):
        for n in lst:
            plain = re.sub(r'[`*]', '', scrub(n))[:40]
            if plain and plain not in plain_all:
                extra.append((data.pid_name.get(pid, pid), n))
    return rows, others, extra, readme is not None


def section4(data):
    c = data.cfg
    html = '<p class="note">%s</p>' % esc(c['sections']['s4']['note'])
    mrows, others, extra, has_readme = collect_findings(data)
    if not has_readme:
        html += missing(c, '입력 `README.md`')
    else:
        html += '<h3>원문·원천과 HOME 값이 다른 사업</h3>'
        if mrows:
            html += table(['정책', '구분', 'HOME 레코드', '사업', 'HOME 값', '원천 값', '원천 위치(파일)'],
                          [[inc(r['policy']), esc(r['kind']), '<code>%s</code>' % esc(r['rid']), short(r['name'], 50), short(r['home'], 110),
                            short(r['src'], 150), short(r['files'], 70)] for r in mrows])
            html += '<p class="note">%s</p>' % esc('완전히 같은 행만 합쳤습니다. 정책마다 README 의 \'주요 불일치\' 절에서 읽었습니다.')
        else:
            html += missing(c, 'README 의 \'주요 불일치\' 절에 불일치 행이 없음')
        if others:
            html += '<h3>그 밖의 발견·수정 제안</h3><ul>%s</ul>' % ''.join('<li><b>%s</b> %s</li>' % (inc(p), short(t, 420)) for p, t in others)
    if extra:
        html += '<h3>설정(report_notes.json)의 HOME 수정 제안</h3><ul>%s</ul>' % ''.join('<li><b>%s</b> %s</li>' % (inc(p), short(t, 420)) for p, t in extra)
    # 검토_단계순서
    html += '<h3>단계 순서 검토 — 뒤 단계 근거는 있는데 앞 단계 기록을 못 찾은 사업</h3>'
    t = data.text('검토_단계순서.md')
    if t is None:
        html += missing(c, '입력 `검토_단계순서.md`')
    else:
        rows, causes = [], Counter()
        for h, lines in md_sections(t, 2):
            m = re.search(r'—\s*(\d+)건', h)
            pid_m = re.search(r'`([A-Za-z0-9_]+)`', h)
            if not m:
                continue
            cs = Counter()
            for head, trs in md_tables(lines):
                if '추정 원인' in head:
                    i = head.index('추정 원인')
                    cs.update(r[i] for r in trs if len(r) > i)
            pid = pid_m.group(1) if pid_m else None
            rows.append([inc(data.pid_name.get(pid, re.sub(r'\s*\(`.*', '', h.split('—')[0]).strip())), num(int(m.group(1))),
                         short(' · '.join('%s %d' % kv for kv in cs.most_common()) or '—', 300)])
        html += table(['정책', '건수', '추정 원인별 건수'], rows, numeric=(1,)) if rows else missing(c, '정책별 건수 행이 없음')
    # 고시대조
    html += '<h3>고시 대조 — 02 사업화 · 03 인허가(토지이음 고시정보)</h3>'
    t = data.text('03.인허가/고시대조.md')
    if t is None:
        html += missing(c, '입력 `03.인허가/고시대조.md`')
    else:
        for pid, lines in pol_blocks(t, data).items():
            first = next((l for l in lines if l.strip()), '')
            html += '<p><b>%s</b> %s</p>' % (inc(data.pid_name.get(pid, pid)), short(first, 260))
            tabs = [x for x in md_tables(lines) if x[0] and x[0][0] == '단계']
            if tabs:
                head, trs = tabs[0]
                html += table(head, [[esc(x) for x in r] for r in trs], numeric=tuple(range(1, len(head))))
        lim = md_section_by_prefix(t, 2, '한계')
        if lim:
            html += '<h3>고시 대조의 한계</h3>' + md_render(lim, 300)
    # 프로그램 조건 대조
    html += '<h3>프로그램 조건 대조 — 원문 정의를 사업 속성 원천으로 규칙 판정(basis RULE)</h3>'
    t = data.text('01.정책/프로그램조건_대조.md')
    if t is None:
        html += missing(c, '입력 `01.정책/프로그램조건_대조.md`')
    else:
        items = []
        for pid, lines in pol_blocks(t, data).items():
            first = next((l for l in lines if l.strip()), '')
            items.append('<li><b>%s</b> %s</li>' % (inc(data.pid_name.get(pid, pid)), short(first, 260)))
        html += '<ul>%s</ul>' % ''.join(items) if items else ''
        tot = md_section_by_prefix(t, 2, '합계')
        if tot:
            html += '<p><b>합계</b> %s</p>' % short(' '.join(x for x in tot if x.strip()), 300)
        un = md_section_by_prefix(t, 2, '원천이 없어')
        if un:
            html += '<h3>원천이 없어 검사 못한 조건</h3>' + md_render(un, 300)
    return html


def section5(data):
    c = data.cfg
    html = '<p class="note">%s</p>' % esc(c['sections']['s5']['note'])
    t = data.text('파이프라인_설계.md')
    if t is None:
        html += missing(c, '입력 `파이프라인_설계.md`')
    else:
        for prefix, title in (('2.', '파이프라인 단계(P0~P9)'), ('3.', 'Exa 쓰임'), ('4.', '설정 파일')):
            lines = md_section_by_prefix(t, 2, prefix)
            html += '<h3>%s</h3>' % esc(title)
            if lines is None:
                html += missing(c, '설계 문서에 %s절이 없음' % prefix)
            else:
                html += md_render(lines, 200)
    pol = read_json(data.path('tools/research/chain/config/policies.json')) or {}
    disc = read_json(data.path('tools/research/chain/config/policies_discovered.json'))
    cands = disc.get('candidates') if isinstance(disc, dict) else None
    html += '<h3>처리 정책과 발견 후보</h3>'
    html += '<ul><li>처리할 정책(policies.json): %s</li><li>발견 후보(policies_discovered.json): %s</li></ul>' % (
        '%s개' % num(len(pol.get('policies', []))) if pol else esc(c['missing_text']),
        '%s건' % num(len(cands)) if cands is not None else esc(c['missing_text']))
    if data.policies:
        html += table(['정책', '발표일'], [[inc(p['name']), esc(p.get('announced') or '—')] for p in data.policies])
    return html


def section6(data):
    c = data.cfg
    html = '<p class="note">%s</p>' % esc(c['sections']['s6']['note'])
    t = data.text('파이프라인_설계.md')
    if t is None:
        html += missing(c, '입력 `파이프라인_설계.md`')
    else:
        sec = md_section_by_prefix(t, 2, '5.')
        if sec is None:
            html += missing(c, '설계 문서에 5절이 없음')
        else:
            subs = md_sections('\n'.join('## ' + l[4:] if l.startswith('### ') else l for l in sec), 2)
            rows = []
            for h, lines in subs:
                cols = []
                for head, trs in md_tables(lines):
                    if head and head[0] == '칸':
                        cols = [re.sub(r'[`]', '', r[0]) for r in trs]
                if cols:
                    rows.append([short(h, 80), short(', '.join(cols), 400)])
                else:
                    para = ' '.join(x for x in lines if x.strip() and not x.startswith('|'))
                    rows.append([short(h, 80), short(para, 400)])
            html += table(['표', '칸·설명(설계 5절)'], rows)
    html += '<h3>dataset/*.json 행 수</h3>'
    files = sorted(glob.glob(data.path(data.dataset + '/*.json')))
    rows = []
    for f in files:
        d = read_json(f)
        if isinstance(d, dict) and isinstance(d.get('rows'), list):
            rows.append(['<code>%s</code>' % esc(os.path.basename(f)), esc(d.get('table', '')), esc(d.get('schema_version', '')), num(len(d['rows']))])
    html += table(['파일', '표', '형식', '행 수'], rows, numeric=(3,)) if rows else missing(c, '입력 `dataset/*.json`')
    html += '<h3>연계 필드 대응(수집 관리표 ↔ 우리 표·칸)</h3>'
    cf = data.csv('연계필드_대응.csv')
    if cf is None:
        html += missing(c, '입력 `연계필드_대응.csv`')
    else:
        per = defaultdict(Counter)
        for r in cf:
            per[r.get('연계 구간', '')][r.get('대응', '') or '—'] += 1
        kinds = sorted({k for v in per.values() for k in v})
        html += table(['연계 구간'] + kinds + ['합계'], [[esc(k)] + [num(v.get(x, 0)) for x in kinds] + [num(sum(v.values()))] for k, v in per.items()],
                      numeric=tuple(range(1, len(kinds) + 2)))
        html += '<p class="note">%s</p>' % esc('전체 %s행' % num(len(cf)))
    return html


def section7(data):
    c = data.cfg
    html = '<p class="note">%s</p>' % esc(c['sections']['s7']['note'])
    items = data.csv('수집항목_통합.csv')
    if items is None:
        html += missing(c, '입력 `수집항목_통합.csv`')
    else:
        ids = 0
        for r in items:
            v = (r.get('관리ID_수') or '').strip()
            ids += int(v) if v.isdigit() else 0
        st = Counter((r.get('우리_수집상태') or '—') for r in items)
        stage = Counter()
        for r in items:
            for s in re.split(r'\s*[,·/]\s*', r.get('쓰는_단계') or ''):
                if s:
                    stage[s] += 1
        dup = Counter((r.get('중복_판정') or '—') for r in items)
        html += '<p class="card" style="font-size:16px;font-weight:700;margin:0">%s</p>' % esc(
            '관리표 수집 후보 %s건(관리ID)이 중복 제거 뒤 수집항목 %s개로 통합됐습니다.' % (num(ids), num(len(items))))
        html += '<h3>우리 수집상태별 항목 수(분모: 수집항목 %s개)</h3>' % num(len(items))
        html += table(['상태', '항목 수', '비율'], [[esc(k), num(v), fpct(pct(v, len(items)))] for k, v in st.most_common()], numeric=(1, 2))
        html += '<h3>중복 판정별 항목 수</h3>'
        html += table(['판정', '항목 수'], [[esc(k), num(v)] for k, v in dup.most_common()], numeric=(1,))
        html += '<h3>쓰는 단계별 항목 수(여러 단계에 쓰이면 각 단계에 셈)</h3>'
        html += table(['단계', '항목 수'], [[esc(k), num(v)] for k, v in sorted(stage.items())], numeric=(1,))
    md = data.text('수집항목_통합.md')
    if md is None:
        html += missing(c, '입력 `수집항목_통합.md`')
    else:
        agg = md_section_by_prefix(md, 2, '1.')
        if agg:
            tabs = md_tables(agg)
            if tabs:
                html += '<h3>통합 집계(수집항목_통합.md 1절)</h3>' + table(tabs[0][0], [[short(x, 120) for x in r] for r in tabs[0][1]], numeric=(1,))
    sites = data.csv('원천사이트_대조.csv')
    html += '<h3>원천 사이트 대조</h3>'
    if sites is None:
        html += missing(c, '입력 `원천사이트_대조.csv`')
    else:
        def rows_of(r):
            v = (r.get('관리표 행 수') or '').strip()
            return int(v) if v.isdigit() else 0
        listed = [r for r in sites if (r.get('통합출처ID') or '').startswith('SRC-')]

        def klass(r):
            s = r.get('우리_상태') or ''
            has_raw, has_file = '원장 raw' in s, '원 파일 보존' in s
            if has_raw and has_file:
                return '원 파일 보존 · 원장 raw'
            if has_raw:
                return '원장 raw 있음'
            if has_file:
                return '원 파일 보존'
            return s.split('(')[0].strip() or '—'
        stc, jd = Counter(klass(r) for r in listed), Counter((r.get('판단') or '—') for r in listed)
        html += '<p>%s</p>' % esc('관리표 사이트 %s곳 → 우리 상태: %s. 판단: %s. 관리표에 없는 우리 원천 %s행.' % (
            num(len(listed)), ', '.join('%s %s' % kv for kv in stc.most_common()), ', '.join('%s %s' % kv for kv in jd.most_common()),
            num(len(sites) - len(listed))))
        miss = [r for r in listed if (r.get('우리_상태') or '').startswith('미수집') and r.get('판단') == '필요']
        miss.sort(key=lambda r: (-rows_of(r), r.get('통합출처ID', '')))
        html += '<h3>파이프라인에 필요하지만 미수집인 사이트 — 관리표 행 수 상위 10</h3>'
        if miss:
            html += table(['통합출처ID', '공식원천명', '제공기관', '관리표 행 수', '판단 이유'],
                          [[esc(r.get('통합출처ID', '')), short(r.get('공식원천명', ''), 70), short(r.get('제공기관', ''), 40), num(rows_of(r)), short(r.get('판단_이유', ''), 90)]
                           for r in miss[:10]], numeric=(3,))
        else:
            html += '<p class="note">%s</p>' % esc('해당 없음')
    return html


def section8(data):
    c = data.cfg
    items = c.get('open_items') or []
    if not items:
        return '<p>%s</p>' % esc(c.get('open_items_empty', '메인 정리 예정'))
    li = []
    for it in items:
        if isinstance(it, dict):
            li.append('<li><b>%s</b> %s</li>' % (inline(it.get('title', '')), inline(it.get('detail', ''))))
        else:
            li.append('<li>%s</li>' % inline(it))
    return '<ul>%s</ul>' % ''.join(li)


def appendix(data):
    c = data.cfg
    html = '<h3>측정 정의</h3>'
    html += table(['기준', '정의'], [[esc(a), inline(b)] for a, b in c.get('measure_defs', [])])
    t = data.text('파이프라인_설계.md')
    sec = md_section_by_prefix(t, 2, '1.') if t else None
    html += '<h3>설계 1절 지표 정의 (파이프라인_설계.md)</h3>'
    html += md_render(sec, 600) if sec else missing(c, '설계 문서 1절')
    html += '<h3>재현 명령</h3><ul>%s</ul>' % ''.join('<li><code>%s</code></li>' % esc(x) for x in c.get('repro_commands', []))
    html += '<h3>주요 파일</h3>' + table(['경로', '내용'], [['<code>%s</code>' % esc(a), inline(b)] for a, b in c.get('key_files', [])])
    return html


# ---------- 조립 ----------

def build(root):
    data = Data(root)
    cfg = data.cfg
    if not cfg:
        raise SystemExit('config/explain.json 이 없습니다')
    evidence = load_evidence(data)
    m1, src = collect_m1(data, evidence)
    S = cfg['sections']
    parts = [
        '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>%s</title>' % esc(cfg.get('title', '')),
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap">',
        '<style>\n%s\n</style></head><body><main>' % CSS,
        '<h1>%s</h1>' % esc(cfg.get('title', '')),
        '<p class="sub">%s</p>' % esc(cfg.get('subtitle', '').replace('{checked_at}', data.checked_at)),
        '<h2>결론</h2>', section_conclusion(data, m1, src),
        '<h2>%s</h2>' % esc(S['s1']['title']), section1(data, m1),
        '<h2>%s</h2>' % esc(S['s2']['title']), section2(data),
        '<h2>%s</h2>' % esc(S['s3']['title']), section3(data, m1, src, evidence),
        '<h2>%s</h2>' % esc(S['s4']['title']), section4(data),
        '<h2>%s</h2>' % esc(S['s5']['title']), section5(data),
        '<h2>%s</h2>' % esc(S['s6']['title']), section6(data),
        '<h2>%s</h2>' % esc(S['s7']['title']), section7(data),
        '<h2>%s</h2>' % esc(S['s8']['title']), section8(data),
        '<h2>%s</h2>' % esc(S['appendix']['title']), appendix(data),
        '<div class="log"><b>생성</b><ul><li>기준일 %s · <code>tools/research/chain/explain.py</code> 가 파이프라인 출력에서 만들었습니다(손으로 고치지 않음).</li></ul></div>' % esc(data.checked_at),
        '</main></body></html>\n',
    ]
    return '\n'.join(parts), data


def pii_hits(html):
    return [(name, m.group(0)) for name, rx in PII for m in rx.finditer(html)]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--out', default=None)
    a = ap.parse_args(argv)
    html, data = build(a.root)
    hits = pii_hits(html)
    if hits:
        sys.stderr.write('개인정보 모양이 남았습니다(%d건): %s\n' % (len(hits), ', '.join('%s' % h[0] for h in hits[:5])))
        return 1
    out = a.out or os.path.join(a.root, data.cfg.get('output', 'docs/speech/research/조사결과_설명자료.html'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('작성: %s (%d bytes)' % (os.path.relpath(out, a.root), len(html.encode('utf-8'))))
    return 0


if __name__ == '__main__':
    sys.exit(main())
