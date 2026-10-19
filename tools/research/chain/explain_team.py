"""팀 공유판 생성 — 발표 덱과 같은 15장을 세로 문서로 펼치고, 장마다 원천 위치를 줄이지 않고 적는다(정적 HTML 한 파일).

    python3 -P -E tools/research/chain/explain_team.py [--root 저장소] [--out 출력.html]

- 장 그림은 explain_deck.slides() 의 장 HTML 을 그대로 넣고 1920×1080 을 폭에 맞춰 줄인다. 수치·사례·문구는 덱과 같은 값이다(다시 계산하지 않는다).
- 장마다 '이 장의 원천 위치(전체)' 절: 출처 줄 파일을 전체 경로로(와일드카드는 실제 파일로 펼침), 장별 원천 목록(사이트·문서·사례 근거·불일치 등)을 전부 넣는다.
  이 절에서는 말줄임·낱말 자르기·사람용 제목 바꾸기를 하지 않는다. 원 파일 본문은 넣지 않고 경로·URL 만 넣는다.
- 문구는 config/explain.json 의 team 절, 수치·목록은 출력 파일에서 읽는다. 없는 입력은 '아직 없음'으로 적고 실패하지 않는다. 같은 입력이면 바이트까지 같다.
- URL 쿼리의 비밀 모양 값(serviceKey·apiKey·token 등)은 *** 로 가린다. 생성 뒤 개인정보·가리지 않은 비밀 값 검사를 하고 남으면 실패한다.
"""
import argparse
import glob
import os
import re
import sys
from collections import defaultdict
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -P 로 실행해도 형제 모듈을 찾는다
import explain as ex  # noqa: E402
import explain_deck as dk  # noqa: E402

ROOT = ex.ROOT

# 게시판 글 번호(key=·fileKey·tblKey)는 비밀이 아니다. 이름 앞이 쿼리 경계여야 하므로 fileKey 같은 이름은 걸리지 않는다.
SECRET_RX = re.compile(r'((?:^|(?<=[?&;(\s]))(?:service_?key|api_?key|auth_?key|crtfc_?key|(?:access|refresh|id|auth)_?token|token'
                       r'|(?:client_)?secret|password|passwd)=)([^&#\s;)"<>]*)', re.I)

TEAM_CSS = """:root{--bg:#050F22;--line:rgba(234,242,255,.24);--link:#8FC1FF}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:16.5px/1.7 var(--sans);-webkit-font-smoothing:antialiased;overflow-wrap:anywhere}
.tm{max-width:1280px;margin:0 auto;padding:40px 24px 96px}
.tm *{box-sizing:border-box}
.tm a{color:var(--link)}
.tm .kick{margin:0;font:700 15px var(--mono);letter-spacing:3px;color:var(--gold)}
.tm .tt{margin:8px 0 6px;font-size:34px;line-height:1.3;font-weight:800}
.tm .meta{margin:0;color:var(--mute);font-family:var(--mono)}
.box{margin:28px 0 0;border:2px solid var(--gold);background:rgba(255,194,71,.10);padding:16px 22px}
.toc{margin:24px 0 0;border:1px solid var(--line);background:var(--card);padding:16px 22px}
.gt{margin:0 0 8px;font-size:20px;line-height:1.4;font-weight:800;color:var(--gold)}
.box ul,.toc ol{margin:0;padding-left:22px}
.box li,.toc li{margin:4px 0}
.toc ol{columns:2 340px;column-gap:40px}
.sh{margin-top:64px;padding-top:20px;border-top:3px solid var(--gold)}
.sh .no{margin:0;font:700 15px var(--mono);letter-spacing:2px;color:var(--gold)}
.sh .ht{margin:6px 0 4px;font-size:26px;line-height:1.35;font-weight:800}
.sh .ld{margin:0 0 14px;color:var(--mute)}
.fig{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;outline:1px solid var(--line);background:var(--blue);font:16px/normal var(--sans);color:var(--ink);overflow-wrap:normal}
.fig>.slide{opacity:1;visibility:visible;transition:none;transform-origin:0 0;transform:scale(.5)}
.srcs{margin-top:26px}
.srcs .sx{margin:0 0 6px;font-size:22px;line-height:1.4;font-weight:800;color:var(--gold)}
.srcs .sy{margin:22px 0 6px;font-size:18px;line-height:1.4;font-weight:800}
.srcs p{margin:6px 0}
.srcs .nt{color:var(--mute);font-size:16px}
.srcs .p{font-family:var(--mono);font-size:15px}
.srcs .ms{color:var(--mute)}
.srcs .bd{display:inline-block;margin:0 0 0 8px;padding:0 8px;border:1px solid var(--gold);color:var(--gold);font-size:14px;font-weight:800;white-space:nowrap}
.srcs .fl{margin:6px 0;padding-left:22px}.srcs .fl li{margin:3px 0}
.srcs blockquote{margin:6px 0;padding:8px 14px;border-left:4px solid var(--gold);background:rgba(15,53,104,.55)}
.srcs code{font-family:var(--mono);font-size:15px}
table.st{width:100%;border-collapse:collapse;font-size:16px;line-height:1.55;margin:8px 0}
table.st th{background:var(--blue);color:var(--gold);text-align:left;font-weight:800;padding:6px 10px;border:1px solid var(--line);vertical-align:bottom}
table.st td{padding:6px 10px;border:1px solid var(--line);vertical-align:top}
table.st tr:nth-child(even) td{background:rgba(15,53,104,.55)}
details{margin:10px 0;border:1px solid var(--line);background:rgba(15,53,104,.30)}
details>summary{cursor:pointer;padding:10px 14px;font-weight:800}
details>div{padding:0 12px 12px}
.rec{margin:10px 0;border:1px solid var(--line);background:rgba(15,53,104,.35);padding:10px 14px}
.rec .rh{margin:0;font-weight:800}
.rec dl{display:grid;grid-template-columns:12em minmax(0,1fr);gap:4px 14px;margin:6px 0 0}
.rec dt{color:var(--mute)}.rec dd{margin:0;min-width:0}
@media (max-width:760px){
.tm{padding:24px 16px 72px}
.tm .tt{font-size:26px}.sh .ht{font-size:22px}
table.st thead{display:none}
table.st,table.st tbody,table.st tr,table.st td{display:block;width:100%}
table.st tr{border:1px solid var(--line);margin:0 0 8px}
table.st td{border:0;border-top:1px solid var(--line)}
table.st tr td:first-child{border-top:0}
table.st td::before{display:block;color:var(--mute);font-size:14px}
.rec dl{grid-template-columns:minmax(0,1fr);gap:0}
.rec dd{margin-bottom:6px}
/*LABELS*/
}"""

FIT = """(function(){
var figs=Array.prototype.slice.call(document.querySelectorAll('.fig'));
function fit(){figs.forEach(function(f){var s=f.firstElementChild;if(s)s.style.transform='scale('+(f.clientWidth/1920)+')';});}
addEventListener('resize',fit);fit();
document.documentElement.setAttribute('data-ready','1');
})();"""


# ---------- 작은 도구 ----------

def mask(s):
    """URL 쿼리·POST 본문의 비밀 모양 매개변수 값을 *** 로."""
    return SECRET_RX.sub(lambda m: m.group(1) + '***', s)


def secret_hits(html):
    """가리지 않은 비밀 모양 값."""
    return [m.group(0) for m in SECRET_RX.finditer(html) if m.group(2) not in ('', '***')]


def t(s):
    """글: 개인정보 지움 → 비밀 가림 → HTML 이스케이프. 자르지 않는다."""
    return '' if s is None else ex.esc(mask(ex.scrub(s)))


def scope_css(css):
    """덱 CSS 를 .fig 안으로 가둔다(:root 토큰은 그대로, html·body 규칙은 뺀다)."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = []
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        sel, body = m.group(1).strip(), m.group(2)
        if sel.startswith(':root'):
            out.append('%s{%s}' % (sel, body))
            continue
        parts = [x.strip() for x in sel.split(',')]
        if any(x in ('html', 'body') for x in parts):
            continue
        out.append('%s{%s}' % (','.join('.fig ' + x for x in parts), body))
    return '\n'.join(out)


class Team:
    def __init__(self, c, out_rel):
        self.c = c
        self.cfg = c.cfg
        self.d = c.cfg['team']
        self.miss = c.cfg.get('missing_text', '아직 없음')
        self.base = os.path.dirname(out_rel)          # 링크는 출력 파일 위치 기준
        self.labels = []                              # 좁은 화면에서 칸 이름(표 id 별)
        self.ntab = 0
        dd = c.d
        self.vars = {'research': c.data.research, 'work': c.data.work, 'dataset': c.data.dataset,
                     'ledger_dir': dd['s6']['ledger_dir'], 'schema_dir': dd['s6']['schema_dir'], 'quote_file': dd['s3']['quote_file']}

    # ----- 경로 -----
    def rel(self, p):
        p = p or ''
        if os.path.isabs(p):
            p = os.path.relpath(p, self.c.root)
        return p.replace(os.sep, '/')

    def expand(self, pat):
        """경로 틀 → [(경로, 있음)]. * 가 있으면 실제 파일로 펼치고, 없으면 [] 대신 [(폴더, False)]."""
        p = pat.format(**self.vars)
        if any(ch in p for ch in '*?['):
            hits = sorted(self.rel(x) for x in glob.glob(os.path.join(self.c.root, p)) if os.path.isfile(x))
            pre = re.split(r'[*?\[]', p)[0]
            return [(h, True) for h in hits] or [((pre if pre.endswith('/') else os.path.dirname(pre)).rstrip('/') or '.', False)]
        return [(p, os.path.isfile(os.path.join(self.c.root, p)))]

    def files(self, pats):
        out, seen = [], set()
        for pat in pats:
            for p, ok in self.expand(pat):
                if (p, ok) not in seen:
                    seen.add((p, ok))
                    out.append((p, ok, '*' in pat))
        return out

    def plink(self, p):
        """로컬 경로: 전체 경로 글 + 출력 파일 기준 상대 링크."""
        if not p:
            return self.ms()
        p = self.rel(p)
        href = quote(os.path.relpath(p, self.base).replace(os.sep, '/'), safe='/')
        return '<a class="p" href="%s">%s</a>' % (t(href), t(p))

    def ulink(self, u):
        """원 URL: 전체 글(비밀 가림). http(s) 로 시작하면 첫 낱말까지 링크."""
        if not u:
            return self.ms()
        u = str(u)
        if re.match(r'https?://', u):
            return '<a class="p" href="%s">%s</a>' % (t(u.split()[0]), t(u))
        return '<span class="p">%s</span>' % t(u)

    def ms(self, what=None):
        return '<span class="ms">%s</span>' % t(what or self.miss)

    def file_list(self, pats):
        items = []
        for p, ok, globbed in self.files(pats):
            if ok:
                items.append('<li>%s</li>' % self.plink(p))
            else:
                items.append('<li><span class="p">%s/</span> %s</li>' % (t(p), self.ms(self.d['files_missing'])) if globbed else
                             '<li><span class="p">%s</span> %s</li>' % (t(p), self.ms(self.d['file_missing'])))
        return '<ul class="fl">%s</ul>' % ''.join(items)

    # ----- 표 -----
    def table(self, cols, rows):
        self.ntab += 1
        tid = 'tb-%d' % self.ntab
        for k, col in enumerate(cols):
            self.labels.append('#%s td:nth-child(%d)::before{content:"%s"}' % (tid, k + 1, col.replace('\\', '').replace('"', "'")))
        h = ''.join('<th>%s</th>' % t(x) for x in cols)
        b = ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % v for v in r) for r in rows)
        return '<table class="st" id="%s"><thead><tr>%s</tr></thead><tbody>%s</tbody></table>' % (tid, h, b)

    def rec(self, head, pairs):
        dl = ''.join('<dt>%s</dt><dd>%s</dd>' % (t(k), v) for k, v in pairs)
        return '<div class="rec"><p class="rh">%s</p><dl>%s</dl></div>' % (head, dl)

    @staticmethod
    def details(summary, inner):
        return '<details><summary>%s</summary><div>%s</div></details>' % (summary, inner)

    def sy(self, s):
        return '<h4 class="sy">%s</h4>' % t(s)

    def badge(self):
        return '<span class="bd">%s</span>' % t(self.d['picked_badge'])

    # ----- 문서·원천 대조 기록 찾기(출력 파일에서) -----
    def doc_index(self):
        if not hasattr(self, '_docs'):
            docs = self.c.docs or []
            self._docs = ({r.get('local_path'): r for r in docs if r.get('local_path')},
                          {r.get('canonical_url'): r for r in docs if r.get('canonical_url')},
                          {r.get('doc_id'): r for r in docs if r.get('doc_id')})
        return self._docs

    def doc_for(self, ev):
        """덱과 같은 규칙: doc_path 로, 없으면 doc_url 로 문서 목록 행."""
        by_path, by_url, _ = self.doc_index()
        return by_path.get(ev.get('doc_path')) or by_url.get(ev.get('doc_url'))

    def ev_ids(self, ev, doc):
        """_work 대조 기록 한 줄 → dataset/evidence.json 의 evidence_id(항목·외부 레코드·문서·위치가 같은 행)."""
        if not hasattr(self, '_ev'):
            self._ev = defaultdict(list)
            for r in self.c.table_rows.get('evidence') or []:
                self._ev[(r.get('subject_table'), r.get('subject_id'), r.get('field'), r.get('external_ref'))].append(r)
        cand = self._ev.get((ev.get('subject_table'), ev.get('subject_id'), ev.get('field'), ev.get('external_ref')), [])
        for test in ((lambda x: doc is not None and x.get('doc_id') == doc.get('doc_id')),
                     (lambda x: ev.get('locator') is not None and x.get('locator') == ev.get('locator'))):
            narrowed = [x for x in cand if test(x)]
            if narrowed:
                cand = narrowed
        if len(cand) > 1:
            cand = [x for x in cand if x.get('verdict') == ev.get('verdict') and x.get('basis') == ev.get('basis')] or cand
        return sorted({x.get('evidence_id') for x in cand if x.get('evidence_id')})

    # ----- 장별 원천 위치 -----
    def block_overview(self, s):
        o = self.d['overview']
        vals = self.c.picked.get('overview')
        if vals is None:
            return self.ms()
        rows = []
        for card in self.c.d['overview']['cards']:
            act = self.c.d['acts'][card['act']]
            items = [(tpl, label) for tpl, label in card['bigs']]
            if dk.fill(card['line'], vals) is not None and '{' in card['line']:
                items.append((card['line'], o['line_label']))
            for tpl, label in items:
                keys = [k for k in re.findall(r'\{(\w+)\}', tpl)]
                pats = [p for k in keys for p in o['files'].get(k, [])]
                v = dk.fill(tpl, vals)
                rows.append([t(act), t(v) if v is not None else self.ms(), t(label), self.file_list(pats) if pats else self.ms()])
        return '<h4 class="sy">%s</h4>' % t(o['title']) + self.table(o['cols'], rows)

    def block_s2(self, s):
        d = self.d['s2']
        if not self.c.actors:
            return self.ms()
        rows = [[t(r.get(k)) if r.get(k) else self.ms('—') for k in d['cols']] for r in self.c.actors]
        return self.sy(d['title']) + self.details(t(d['summary'].format(n=ex.num(len(rows)))), self.table(d['cols'], rows))

    def block_s3(self, s):
        d, c = self.d['s3'], self.c
        out = self.sy(d['sites_title'])
        si = c.sites_info
        if si is None:
            out += self.ms()
        else:
            no, rows = {}, {True: [], False: []}
            for x in c.sites:
                k = dk.site_key(x)
                no.setdefault(k, len(no) + 1)
                listed = (x.get('통합출처ID') or '').startswith('SRC-')
                rows[listed].append([t(no[k]), t(x.get('통합출처ID')), t(x.get('제공기관')), t(x.get('공식원천명')), t(x.get('소관부서')),
                                     self.ulink((x.get('공식URL') or '').strip())])
            out += '<p class="nt">%s</p>' % t(d['sites_note'].format(rows=ex.num(len(c.sites)), listed=ex.num(si['listed']), ours=ex.num(si['ours']),
                                                                       merged=ex.num(si['merged']), n=ex.num(si['n'])))
            out += self.details(t(d['listed_summary'].format(n=ex.num(len(rows[True])))), self.table(d['cols'], rows[True]))
            out += self.details(t(d['ours_summary'].format(n=ex.num(len(rows[False])))), self.table(d['cols'], rows[False]))
        out += self.sy(d['fields_title'])
        cf = c.data.csv('연계필드_대응.csv')
        if cf is None:
            out += self.ms()
        else:
            cols = list(cf[0].keys()) if cf else []
            out += self.details(t(d['fields_summary'].format(n=ex.num(len(cf)))),
                                self.table(cols, [[t(r.get(k)) if r.get(k) else self.ms('—') for k in cols] for r in cf]))
        q = c.picked.get('s3') or {}
        out += self.sy(d['quote_title'])
        out += '<p class="nt">%s · %s</p>' % (t(d['quote_label']), self.plink(c.data.research + '/원천주체_단계별.md'))
        out += '<blockquote>%s</blockquote>' % t(q['quote']) if q.get('quote') else '<p>%s</p>' % self.ms()
        out += '<p class="nt">%s · %s</p>' % (t(d['dept_label']), self.plink(c.data.research + '/' + c.d['s3']['quote_file']))
        out += '<blockquote>%s</blockquote>' % t(q['dept']) if q.get('dept') else '<p>%s</p>' % self.ms()
        return out

    def block_s4(self, s):
        d, c = self.d['s4'], self.c
        if not c.docs:
            return self.sy(d['title']) + self.ms()
        meth, fmt = c.d['s4']['methods'], c.d['s5']['formats']
        groups = defaultdict(list)
        for r in c.docs:
            st = sorted(set(r.get('stage_codes') or []))
            groups[st[0] if st else ''].append((st, r))
        out = self.sy(d['title']) + '<p class="nt" id="docs-all">%s</p>' % t(d['note'].format(n=ex.num(len(c.docs))))
        for g in sorted(groups, key=lambda x: (x == '', x)):
            rows = []
            for st, r in groups[g]:
                org = ' '.join(x for x in (r.get('publisher_org'), r.get('publisher_dept')) if x)
                m, f = r.get('collection_method'), r.get('format')
                lp = self.plink(r['local_path']) if r.get('local_path') else self.ms('%s%s' % (self.d['s4']['not_saved'], (' · ' + r['not_saved_reason']) if r.get('not_saved_reason') else ''))
                rows.append(['<span class="p">%s</span>' % t(r.get('doc_id')), t(' · '.join(st)) or self.ms('—'), t(r.get('title')),
                             t(f if f not in fmt or f in fmt[f] else '%s (%s)' % (fmt[f], f)), t(m if m not in meth or m in meth[m] else '%s (%s)' % (meth[m], m)),
                             t(org) or self.ms('—'), lp, self.ulink(r.get('canonical_url'))])
            name = '%s %s' % (g, c.names.get(g, '')) if g else d['none_stage']
            out += self.details(t(d['summary'].format(stage=name.strip(), n=ex.num(len(rows)))), self.table(d['cols'], rows))
        return out

    def block_s5(self, s):
        d = self.d['s5']
        if not self.c.docs:
            return self.ms()
        return '<p>%s <a href="#docs-all">%s</a></p>' % (t(d['pointer'].format(n=ex.num(len(self.c.docs)))), t(d['link']))

    def block_s6(self, s):
        d, c, dd = self.d['s6'], self.c, self.c.d['s6']
        p = c.picked.get('s6')
        if p is None:
            return self.ms()
        tabs = [('source_documents', p['docs']), ('evidence', p['evidence'])] + list(p['ledger'].items())
        rows = []
        for name, n in tabs:
            f = (dd['ledger_dir'] + '/projects.json') if name == 'projects' else (c.data.dataset + '/' + name + '.json')
            sch = '%s/%s.schema.json' % (dd['schema_dir'], name)
            ok = os.path.isfile(os.path.join(c.root, sch))
            rows.append(['%s<br><span class="p">%s</span>' % (t(dd['names'].get(name, name)), t(name)), self.plink(f),
                         t(ex.num(n)) if n is not None else self.ms(), self.plink(sch) if ok else '<span class="p">%s</span> %s' % (t(sch), self.ms(self.d['file_missing']))])
        out = self.sy(d['title'].format(n=len(tabs))) + self.table(d['cols'], rows)
        out += '<p class="nt">%s · %s</p>' % (t(d['validator']), self.plink('tools/research/chain/validate_dataset.cjs'))
        return out

    def ev_rec(self, head, ev):
        d = self.d['s7']
        vname = {k: n for k, n, _x in self.c.d['s9']['verdicts']}
        bname = {k: n for k, n, _x in self.c.d['s9']['basis']}
        doc = self.doc_for(ev)
        org = ' '.join(x for x in (doc.get('publisher_org'), doc.get('publisher_dept')) if x) if doc else ''
        lp = (doc or {}).get('local_path') or ev.get('doc_path')
        url = (doc or {}).get('canonical_url') or ev.get('doc_url')
        ids = self.ev_ids(ev, doc)
        verdict = '%s (%s) · %s (%s)' % (vname.get(ev.get('verdict'), ev.get('verdict')), ev.get('verdict'),
                                         bname.get(ev.get('basis'), ev.get('basis')), ev.get('basis'))
        vals = [t(verdict), t(ev.get('dataset_value')) or self.ms('—'),
                t(doc.get('title')) if doc else self.ms(d['no_doc']), t(org) or self.ms('—'),
                self.plink(lp), self.ulink(url), t(ev.get('locator')) or self.ms('—'),
                '<span class="p">%s</span>' % t(doc.get('doc_id')) if doc else self.ms(),
                '<span class="p">%s</span>' % t(' · '.join(ids)) if ids else self.ms()]
        return self.rec(head, list(zip(d['fields'], vals)))

    def block_s7(self, s):
        d, c = self.d['s7'], self.c
        p = c.picked.get('s7')
        if not p:
            return self.ms()
        h = d['head']
        out = self.sy(d['title'])
        out += self.rec(t(p['name'] or p['sid']), [(h[0], t(p['name']) or self.ms()), (h[1], '<span class="p">%s</span>' % t(p['sid'])),
                                                   (h[2], '%s <span class="p">%s</span>' % (t(p['policy']['name']), t(p['policy']['policy_id']))),
                                                   (h[3], t(p['program']) or self.ms())])
        head = '<b>01 %s</b> · %s' % (t(c.names.get('01', '')), t(d['link_label']))
        out += self.ev_rec(head, p['link']) if p['link'] else self.rec(head, [(d['fields'][0], self.ms())])
        for st in p['later']:
            head = '<b>%s %s</b>' % (t(st), t(c.names.get(st, '')))
            r = p['picks'].get(st)
            out += self.ev_rec(head, r) if r else self.rec(head, [(d['fields'][0], self.ms())])
        return out

    def block_s8(self, s):
        d = self.d['s8']
        m = self.c.picked.get('s8')
        if m is None:
            return self.ms()
        out = self.sy(d['title'])
        for row, hits in m:
            out += '<h4 class="sy">%s — %s (%s %s)</h4>' % (t(row['item']), t(row['source']), t(row['stage']), t(self.c.names.get(row['stage'], '')))
            out += self.table(d['cols'], [[t(r.get(k)) if r.get(k) else self.ms('—') for k in d['cols']] for r in hits]) if hits else '<p>%s</p>' % self.ms()
        return out

    def block_s9(self, s):
        d, c = self.d['s9'], self.c
        rows = []
        for pol in c.data.policies:
            fs = sorted(glob.glob(c.data.path(c.data.work + '/' + pol['policy_id'] + '/evidence*.jsonl')))
            if fs:
                rows.append([t(pol['name']), '<span class="p">%s</span>' % t(pol['policy_id']), '<ul class="fl">%s</ul>' % ''.join('<li>%s</li>' % self.plink(f) for f in fs)])
        out = self.sy(d['title']) + (self.table(d['cols'], rows) if rows else '<p>%s</p>' % self.ms())
        out += '<p>%s · %s</p>' % (t(d['report_label']), self.plink(c.data.research + '/품질_리포트.csv') if c.qr is not None else self.ms())
        m3 = c.picked.get('m3')
        if m3 and (m3.get('범주') or '').strip():
            out += '<p>%s · %s</p>' % (t(d['audit_label']), self.plink(c.data.work + '/audit/' + m3['범주'].strip()))
        else:
            out += '<p>%s · %s</p>' % (t(d['audit_label']), self.ms(d['audit_missing']))
        return out

    def block_s10(self, s):
        d, c = self.d['s10'], self.c
        fi = c.find_info
        p = c.picked.get('s10') or {'rows': [], 'texts': []}
        shown = {(r['kind'], r['name'], r['home'], r['src']) for r in p['rows']}
        rids, paths = defaultdict(list), defaultdict(list)
        for r in fi['rows']:
            k = (r['kind'], r['name'], r['home'], r['src'])
            if r['rid'] not in rids[k]:
                rids[k].append(r['rid'])
            for x in r.get('paths') or []:
                if x not in paths[k]:
                    paths[k].append(x)
        out = self.sy(d['mm_title'].format(n=ex.num(len(fi['uniq'])), raw=ex.num(len(fi['rows']))))
        if not fi['uniq']:
            out += '<p>%s</p>' % self.ms()
        for r in fi['uniq']:
            k = (r['kind'], r['name'], r['home'], r['src'])
            head = '<b>%s</b>%s' % (t(r['name']), self.badge() if k in shown else '')
            f = d['fields']
            out += self.rec(head, [(f[0], t(r['policy'])), (f[1], t(r['kind'])), (f[2], '<span class="p">%s</span>' % t(' · '.join(rids[k]))),
                                   (f[3], t(r['home'])), (f[4], t(r['src'])),
                                   (f[5], '<ul class="fl">%s</ul>' % ''.join('<li>%s</li>' % self.plink(x) for x in paths[k]) if paths[k] else self.ms())])
        out += self.sy(d['texts_title'].format(n=ex.num(len(fi['texts']))))
        if not fi['texts']:
            out += '<p>%s</p>' % self.ms()
        else:
            items = ''.join('<li><b>%s</b>%s<br>%s</li>' % (t(pname), self.badge() if k in p['texts'] else '', ex.inline(mask(ex.scrub(txt))))
                            for k, (pname, txt) in enumerate(fi['texts']))
            out += '<ol class="fl">%s</ol>' % items
        return out

    def block_s11(self, s):
        d, c = self.d['s11'], self.c
        p = c.picked.get('s11') or {'files': []}
        out = self.sy(d['config_title']) + self.file_list(['tools/research/chain/config/policies.json', 'tools/research/chain/config/policies_discovered.json'])
        out += self.sy(d['files_title'].format(n=ex.num(len(p['files']))))
        out += '<ol class="fl">%s</ol>' % ''.join('<li>%s</li>' % self.plink(f) for f in p['files']) if p['files'] else '<p>%s</p>' % self.ms()
        return out

    def srcs(self, s):
        key = s['key']
        out = '<h3 class="sx">%s</h3>' % t(self.d['src_title'])
        out += self.sy(self.d['files_title']) + self.file_list(self.d['sources'].get(key, []))
        fn = getattr(self, 'block_' + key, None)
        if fn:
            out += fn(s)
        return '<section class="srcs">%s</section>' % out


def build(root, out_rel=None):
    c = dk.Ctx(root)
    if not c.d or not c.cfg.get('team'):
        raise SystemExit('config/explain.json 의 deck·team 절이 없습니다')
    out_rel = out_rel or c.cfg['team']['output']
    tm = Team(c, out_rel)
    d = tm.d
    sl = dk.slides(c)
    toc, arts = [], []
    for s in sl:
        aid = 'sh-%02d' % s['idx']
        toc.append('<li><a href="#%s">%02d · %s</a></li>' % (aid, s['idx'], t(s['title'])))
        lead = '<p class="ld">%s</p>' % t(s['lead']) if s['lead'] else ''
        arts.append(('<article class="sh" id="%s"><p class="no">SHEET %02d · %s</p><h2 class="ht">%s</h2>%s'
                     '<div class="fig" role="img" aria-label="%s %d">%s</div>%s</article>') % (
            aid, s['idx'], t(s['act']), t(s['title']), lead, t(d['deck_label']), s['idx'], s['html'], tm.srcs(s)))
    head = ('<header><p class="kick">%s</p><h1 class="tt">%s</h1><p class="meta">%s %s</p></header>'
            '<section class="box"><h2 class="gt">%s</h2><ul>%s</ul></section>'
            '<nav class="toc"><h2 class="gt">%s</h2><ol>%s</ol></nav>') % (
        t(d['kicker']), t(d['title']), t(d['checked_label']), t(c.data.checked_at),
        t(d['guide_title']), ''.join('<li>%s</li>' % t(x) for x in d['guide']), t(d['toc_title']), ''.join(toc))
    css = scope_css(dk.CSS) + '\n' + TEAM_CSS.replace('/*LABELS*/', '\n'.join(tm.labels))
    html = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            '<title>%s</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">\n'
            '<style>\n%s\n</style>\n</head>\n<body>\n<main class="tm">\n%s\n%s\n</main>\n<script>\n%s\n</script>\n</body>\n</html>\n') % (
        t(d['page_title']), css, head, '\n'.join(arts), FIT)
    return html, c


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--out', default=None)
    a = ap.parse_args(argv)
    cfg = ex.read_json(os.path.join(a.root, 'tools/research/chain/config/explain.json')) or {}
    out = a.out or os.path.join(a.root, (cfg.get('team') or {}).get('output', 'docs/speech/research/조사결과_팀공유.html'))
    out_rel = os.path.relpath(os.path.abspath(out), os.path.abspath(a.root))
    html, _c = build(a.root, out_rel)
    hits = ex.pii_hits(html)
    if hits:
        sys.stderr.write('개인정보 모양이 남았습니다(%d건): %s\n' % (len(hits), ', '.join(h[0] for h in hits[:5])))
        return 1
    sec = secret_hits(html)
    if sec:
        sys.stderr.write('가리지 않은 비밀 모양 값이 남았습니다(%d건)\n' % len(sec))
        return 1
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('작성: %s (%d bytes, %d장)' % (os.path.relpath(out, a.root), len(html.encode('utf-8')), html.count('<article class="sh"')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
