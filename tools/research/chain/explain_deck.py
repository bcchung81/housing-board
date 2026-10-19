"""발표용 장표 덱 생성 — 파이프라인 출력에서 '원천 → 표준화' 4막 덱(정적 HTML 한 파일)을 만든다.

    python3 -P -E tools/research/chain/explain_deck.py [--root 저장소] [--out 출력.html]

- 구성: 표지 · 한눈에 보기 · 4막(흩어진 원천 → 수집 → 표준 데이터셋 → 원천 기준 표준화) · 마무리 · 부록 2장. 장마다 결론 제목과 '이 장이 보여 주는 것' 한 줄.
- 본문(바닥글 출처 줄과 부록 제외)에는 영문 코드·파일명을 쓰지 않는다. 영문 표 이름은 한글 이름 아래 작은 회색 글씨(.en)로만 둔다.
  날짜는 YYYY-MM-DD·YYYY-MM 으로 맞추고, 말줄임표로 문장을 자르지 않으며, 긴 기관 이름은 설정 org_alias 로 줄인다.
- 틀(1920×1080 .slide · 남색 도면 격자 · 금색 강조 · 크기 맞춤 · 키보드/클릭 넘김)은 docs/주택파동_발표자료.html 의 것이다. 이미지는 가져오지 않았다.
- 입력 읽기·지표 계산은 explain.py 의 함수를 쓴다. 문구는 config/explain.json 의 deck 절, 수치는 모두 출력 파일에서 읽는다.
- 없는 입력은 그 장에 '아직 없음'으로 표시하고 실패하지 않는다. 같은 입력이면 바이트까지 같다. 생성 뒤 개인정보 검사를 하고 남으면 실패한다.
"""
import argparse
import glob
import json
import os
import re
import shutil
import string
import subprocess
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -P 로 실행해도 형제 모듈을 찾는다
import explain as ex  # noqa: E402

ROOT = ex.ROOT
CONFIRM = ex.CONFIRM
SEG = ['var(--ink)', '#7FA8E0', 'var(--gold)', '#7FE0C2', '#8FC1FF', 'var(--mute)']

CSS = """:root{--navy:#0B2B5A;--blue:#123E7C;--card:#0F3568;--ink:#EAF2FF;--mute:#BBD3F3;--gold:#FFC247;
--mono:'Space Mono',ui-monospace,Menlo,Consolas,monospace;
--sans:'Gothic A1','Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#050F22;overflow:hidden;font-family:var(--sans);-webkit-font-smoothing:antialiased}
button{font-family:inherit;color:inherit}
.viewport{position:fixed;left:0;top:0;right:0;bottom:0;overflow:hidden}
.deck{position:absolute;left:50%;top:50%;width:1920px;height:1080px;margin-left:-960px;margin-top:-540px;transform-origin:50% 50%}
.slide{position:absolute;left:0;top:0;width:1920px;height:1080px;padding:112px 128px 150px;color:var(--ink);overflow:hidden;
 background-color:var(--blue);
 background-image:repeating-linear-gradient(0deg,rgba(234,242,255,.07) 0 1px,transparent 1px 60px),repeating-linear-gradient(90deg,rgba(234,242,255,.07) 0 1px,transparent 1px 60px);
 opacity:0;visibility:hidden;transform:translateX(60px);
 transition:opacity .6s ease,transform .6s ease,visibility 0s linear .6s}
.slide{word-break:keep-all;overflow-wrap:break-word}
.slide.on{opacity:1;visibility:visible;transform:none;transition-delay:0s}
.slide.before{transform:translateX(-60px)}
.slide::after{content:"";position:absolute;left:48px;top:48px;right:48px;bottom:48px;border:2px solid var(--mute);pointer-events:none}
.bg-navy{background-color:var(--navy)}
.bg-gold{background-color:var(--gold);color:var(--navy);
 background-image:repeating-linear-gradient(0deg,rgba(11,43,90,.10) 0 1px,transparent 1px 60px),repeating-linear-gradient(90deg,rgba(11,43,90,.10) 0 1px,transparent 1px 60px)}
.bg-gold::after{border-color:var(--navy)}
.mono{font-family:var(--mono)}.gold{color:var(--gold)}.mute{color:var(--mute)}.b{font-weight:800}
.eyebrow{display:flex;gap:20px;align-items:baseline;margin-bottom:16px}
.eyebrow .m{font-family:var(--mono);font-size:28px;color:var(--gold);letter-spacing:3px}
.eyebrow .t{font-size:28px;font-weight:600;color:var(--mute)}
h1{font-size:96px;font-weight:800;line-height:1.2}
h2{font-size:52px;font-weight:800;line-height:1.2;margin-bottom:20px}
h3{font-size:36px;font-weight:800}
.sub{font-size:28px;color:var(--mute);line-height:1.4}
.foot{position:absolute;left:128px;right:128px;bottom:72px;height:32px;display:flex;justify-content:space-between;align-items:center;font-size:24px;color:var(--mute);gap:32px}
.foot .m{font-family:var(--mono);white-space:nowrap}
.foot span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cover{padding:128px;display:flex;flex-direction:column;justify-content:space-between}
.cover .brand{font-size:36px;font-weight:600;color:var(--mute);margin:20px 0}
.tblock{width:900px;border:2px solid var(--ink)}
.tblock .tr{display:flex;border-top:2px solid var(--ink)}
.tblock .tr:first-child{border-top:0}
.tblock .k{width:150px;font-size:24px;color:var(--mute);padding:12px 16px;border-right:2px solid var(--ink)}
.tblock .v{flex:1;font-size:28px;padding:12px 16px}
table.t{width:100%;border-collapse:collapse;font-size:24px;line-height:1.4;margin-top:8px}
table.t th{background:var(--blue);color:var(--gold);text-align:left;padding:8px 14px;font-weight:800;border:1px solid rgba(234,242,255,.28)}
table.t td{padding:8px 14px;border:1px solid rgba(234,242,255,.28);vertical-align:top}
table.t tr:nth-child(even) td{background:rgba(15,53,104,.55)}
table.t td.us{background:rgba(255,194,71,.16)!important;color:var(--gold);font-weight:800}
.sgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.sc{border:3px solid var(--gold);background:rgba(255,194,71,.14);padding:14px 22px 16px}
.sc b{display:block;font-size:36px;font-weight:800;color:var(--gold);line-height:1.3}
.sc p{font-size:24px;line-height:1.4;margin-top:6px}
.banner{margin-top:30px;background:#081C3C;border-radius:18px;padding:24px 40px;text-align:center;font-size:36px;font-weight:800;line-height:1.5}
.closing h1{position:absolute;left:128px;top:300px;width:1664px}
.closing .lead{position:absolute;left:128px;top:620px;width:1500px;font-size:36px;font-weight:600;line-height:1.4}
/* 덱 전용: 위 구성 요소를 장표에 맞춘 것 */
.big{display:block;font-family:var(--mono);font-size:64px;font-weight:700;color:var(--gold);line-height:1.1}
.sc.s{padding:18px 24px 20px}.sc.s .l{font-size:28px;font-weight:800;line-height:1.3}
.sc.s p{font-size:24px}
.sbar{display:flex;height:40px;border:2px solid var(--ink);margin-top:14px}
.sbar i{display:block;height:100%}
.lgd{display:flex;flex-wrap:wrap;gap:6px 28px;margin-top:12px;font-size:24px}
.lgd span{display:flex;align-items:center;gap:10px}.lgd i{display:block;width:18px;height:18px}
.flow{display:flex;align-items:stretch;gap:0;margin-top:20px}
.fb{flex:1;border:3px solid var(--ink);background:var(--blue);padding:16px 16px 18px;text-align:center;display:flex;flex-direction:column;justify-content:space-between;gap:8px}
.fb .n{font-family:var(--mono);font-size:24px;color:var(--gold)}
.fb .t{font-size:28px;font-weight:800;line-height:1.3}
.fb .c{font-family:var(--mono);font-size:44px;font-weight:700;color:var(--gold)}
.fb small{font-size:24px;color:var(--mute)}
.fb.gold{border-color:var(--gold);background:rgba(255,194,71,.14)}
.arw{flex:none;width:40px;display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--gold)}
.rb{display:grid;grid-template-columns:260px 1fr 190px;gap:16px;align-items:center;font-size:24px;margin:6px 0}
.rb .tr{height:22px;background:rgba(5,15,34,.55);border:2px solid var(--mute);position:relative}
.rb .fl{position:absolute;left:0;top:0;bottom:0;background:var(--gold)}
.rb .fl.k2{background:#7FA8E0}.rb .fl.k3{background:var(--ink)}
.rb .tg{position:absolute;top:-8px;bottom:-8px;width:3px;background:#7FE0C2}
.rb .v{font-family:var(--mono);text-align:right;white-space:nowrap}
.pb{margin-top:10px;border-top:2px solid var(--mute);padding-top:8px}
.pb .pn{font-size:28px;font-weight:800;color:var(--gold)}
.two{display:grid;grid-template-columns:560px 1fr;gap:40px}
.note{font-size:24px;color:var(--mute);line-height:1.4;margin-top:10px}
.ui{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 12px;background:rgba(5,15,34,.88);border:1px solid rgba(234,242,255,.3);border-radius:10px;color:#EAF2FF;font:600 16px var(--sans);opacity:0;transition:opacity .3s;z-index:50}
.ui.show{opacity:1}
.ui button{background:transparent;border:1px solid rgba(234,242,255,.4);border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}
.ui button:hover{background:rgba(234,242,255,.15)}
.ui .ct{min-width:70px;text-align:center}
.progress{position:fixed;left:0;bottom:0;height:4px;background:var(--gold);z-index:51;transition:width .4s ease}
.static .slide,.static .progress{transition:none!important}.static .ui,.static .progress{display:none}
/* 쉬운 덱: 장 설명 줄 · 영문 표 이름 · 한눈에 보기 카드 · 판정 범례 · 감사 상자 */
.sub.ld{margin:-6px 0 22px}
.sub.hd{font-size:28px;margin-bottom:4px}
.en{display:block;font-family:var(--mono);font-size:20px;font-weight:400;color:var(--mute);line-height:1.3}
table.t small{font-size:20px}
.ov{display:flex;align-items:stretch;margin-top:30px}
.oc{flex:1;border:3px solid var(--gold);background:rgba(255,194,71,.14);padding:22px 24px 24px;display:flex;flex-direction:column;gap:14px}
.oc .act{font-size:30px;font-weight:800;color:var(--gold)}
.oc .ob .big{font-size:48px}
.oc .bl{display:block;font-size:24px;color:var(--mute);margin-top:4px;line-height:1.3}
.oc .ol{font-size:24px;line-height:1.4;margin-top:auto;border-top:2px solid rgba(234,242,255,.28);padding-top:12px}
.fb.st{margin-top:8px;padding:8px 16px;flex-direction:row;align-items:center;text-align:left}
.fb.st .c{font-size:32px}
.vl p{font-size:24px;line-height:1.4;margin-top:8px;color:var(--mute)}.vl b{color:var(--ink)}
.audit{margin-top:24px;border:3px solid var(--gold);background:rgba(255,194,71,.14);padding:16px 20px;font-size:26px;font-weight:800;line-height:1.4}
.sc.fx p{font-size:24px}
.cmd{font-size:22px;line-height:1.6}
table.t.tight td{padding:5px 14px}
.appx table.t{font-size:22px;line-height:1.3}.appx table.t td,.appx table.t th{padding:4px 12px}"""

SCRIPT = """(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var params=new URLSearchParams(location.search);
var STATIC=params.has('static');
if(STATIC)document.body.classList.add('static');
var deck=$('#deck'), slides=$$('.slide'), N=slides.length, cur=-1;
function fit(){var s=Math.min(innerWidth/1920,innerHeight/1080);deck.style.transform='scale('+s+')';}
addEventListener('resize',fit);fit();
function show(i){
 i=Math.max(0,Math.min(N-1,i));
 slides.forEach(function(el,k){el.classList.toggle('on',k===i);el.classList.toggle('before',k<i);});
 cur=i;
 $('#ct').textContent=(cur+1)+' / '+N;
 $('#prog').style.width=((cur+1)/N*100)+'%';
 try{history.replaceState(null,'','#'+(cur+1));}catch(err){}
}
function next(){if(cur<N-1)show(cur+1);}
function prev(){if(cur>0)show(cur-1);}
deck.addEventListener('click',function(e){if(e.target.closest('button,a,.ui'))return;next();});
addEventListener('keydown',function(e){
 var k=e.key;
 if(k==='ArrowRight'||k==='ArrowDown'||k===' '||k==='PageDown'||k==='Enter'){e.preventDefault();next();}
 else if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'||k==='Backspace'){e.preventDefault();prev();}
 else if(k==='Home'){show(0);}
 else if(k==='End'){show(N-1);}
 else if(k==='f'||k==='F'){if(!document.fullscreenElement){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}else{document.exitFullscreen();}}
});
$('#bPrev').addEventListener('click',prev);$('#bNext').addEventListener('click',next);
var ui=$('#ui'), uiT;
addEventListener('mousemove',function(){ui.classList.add('show');clearTimeout(uiT);uiT=setTimeout(function(){ui.classList.remove('show');},2500);});
var tx=null;
addEventListener('touchstart',function(e){tx=e.touches[0].clientX;},{passive:true});
addEventListener('touchend',function(e){if(tx===null)return;var dx=e.changedTouches[0].clientX-tx;tx=null;if(Math.abs(dx)>60){if(dx<0)next();else prev();}},{passive:true});
var start=0;
if(STATIC){start=Math.max(1,parseInt(params.get('static'),10)||1)-1;}
else{var h=parseInt((location.hash||'').replace('#',''),10);if(h>=1&&h<=N)start=h-1;}
show(start);
document.documentElement.setAttribute('data-ready','1');
})();"""


# ---------- 작은 도구 ----------

FOUND = {'MATCH', 'MISMATCH', 'SOURCED'}                       # 원문에서 값을 찾은 판정
CODE_RX = re.compile(r'[A-Z]{3,}_[A-Z_]+')                     # INITIAL_APPROVAL · PAN_DT 같은 영문 코드
ID_RX = re.compile(r'[A-Za-z]+[_.][A-Za-z]')                   # evidence_bridge · project.rows · 파일.확장자
PAREN_RX = re.compile(r'\s*\((?:[^()]|\([^()]*\))*\)')        # 괄호 한 겹(안에 한 겹 더 허용)
EXT_RX = re.compile(r'\.(?:pdf|hwpx?|html?|jsonl?|csv|zip|xlsx?|docx?|txt|xml)(?:\.gz)?$', re.I)
DATE8_RX = re.compile(r'(?<!\d)((?:19|20)\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)')
DATE_DOT_RX = re.compile(r'(?<!\d)((?:19|20)\d\d)\.(\d{1,2})\.(\d{1,2})(?!\d)')
DATE_KO_RX = re.compile(r'((?:19|20)\d\d)년\s*(\d{1,2})월')


def i(n):
    return ex.num(n)


def pc(v):
    return '—' if v is None else '%.1f%%' % v


def e(s):
    return ex.esc(ex.scrub(s))


def norm_dates(s):
    """20211231 · 2025.12.31 · 2028년 12월 → 2021-12-31 · 2025-12-31 · 2028-12."""
    s = DATE8_RX.sub(r'\1-\2-\3', s)
    s = DATE_DOT_RX.sub(lambda m: '%s-%02d-%02d' % (m.group(1), int(m.group(2)), int(m.group(3))), s)
    return DATE_KO_RX.sub(lambda m: '%s-%02d' % (m.group(1), int(m.group(2))), s)


def drop_id_parens(s):
    """영문 식별자·`코드`가 든 괄호를 뺀다: (evidence_bridge) · (project.rows(LH 공급계획)) · (`파일.md` 2절)."""
    def f(m):
        x = m.group(0)
        return '' if ('`' in x or ID_RX.search(x) or CODE_RX.search(x)) else x
    return PAREN_RX.sub(f, s)


def fix_parens(s):
    """앞뒤가 잘려 짝이 안 맞는 괄호를 정리한다: '민간참여) 화성동탄2 C-14' → '화성동탄2 C-14', '6공구 (' → '6공구'."""
    s = (s or '').strip()
    depth, start = 0, 0
    for k, ch in enumerate(s):
        if ch == '(':
            depth += 1
        elif ch == ')':
            if depth:
                depth -= 1
            else:
                start = k + 1
    t = s[start:]
    while t.count('(') > t.count(')'):
        t = t[:t.rindex('(')]
    return t.strip() or s.replace('(', '').replace(')', '').strip()


def clip_words(s, limit):
    """글자 수가 넘치면 낱말 경계에서 줄인다(말줄임표 없이)."""
    if len(s) <= limit:
        return s
    cut = s[:limit].rsplit(' ', 1)[0]
    return cut or s[:limit]


def short_name(name):
    """정책 이름 끝 괄호 안 표기: '주택공급 확대방안 (9·7)' → '9·7'."""
    m = re.search(r'\(([^()]+)\)\s*$', name or '')
    return m.group(1) if m else (name or '')


def pct_range(vals):
    lo, hi = min(vals), max(vals)
    return pc(lo) if pc(lo) == pc(hi) else '%s~%s' % (pc(lo), pc(hi))


def head_org(s):
    """칸 값에서 기관·부서 이름 앞부분만(설명·괄호 앞)."""
    s = ex.scrub(s or '').strip()
    if not s or s.startswith('해당 없음') or s.startswith('미확인'):
        return None
    s = re.split(r'\s*[—(·]\s*|\s+/\s+', s)[0].strip()
    s = re.sub(r'[〈〉]', '', s)
    return s or None


def same_org(a, b):
    x, y = a.split()[0], b.split()[0]
    return x.startswith(y) or y.startswith(x)


def missing_body(cfg, what):
    return '<p class="sub"><span class="gold b">%s</span> %s</p>' % (e(cfg['missing_text']), e(what))


def table(head, rows, us=()):
    """칸은 HTML 문자열 또는 (HTML, 금색 여부). us 의 열은 모두 금색."""
    def td(k, c):
        html, gold = c if isinstance(c, tuple) else (c, k in us)
        return '<td%s>%s</td>' % (' class="us"' if gold else '', html)
    h = ''.join('<th>%s</th>' % e(c) for c in head)
    b = ''.join('<tr>%s</tr>' % ''.join(td(k, c) for k, c in enumerate(r)) for r in rows)
    return '<table class="t"><thead><tr>%s</tr></thead><tbody>%s</tbody></table>' % (h, b)


def sbar(parts):
    """parts = [(라벨, 수)] → 막대 + 범례. 비율은 합계 기준."""
    tot = sum(n for _l, n in parts) or 1
    bars = ''.join('<i style="width:%.2f%%;background:%s"></i>' % (100.0 * n / tot, SEG[k % len(SEG)]) for k, (_l, n) in enumerate(parts) if n)
    lg = ''.join('<span><i style="background:%s"></i>%s %s</span>' % (SEG[k % len(SEG)], e(l), i(n)) for k, (l, n) in enumerate(parts) if n)
    return '<div class="sbar">%s</div><div class="lgd">%s</div>' % (bars, lg)


def stat(label, big, sub, cls=''):
    return '<div class="sc s%s"><p class="l">%s</p><span class="big">%s</span><p>%s</p></div>' % (cls, e(label), e(big), sub)


def fill(tpl, vals):
    """템플릿의 자리 값이 하나라도 없으면 None."""
    keys = [f for _t, f, _s, _c in string.Formatter().parse(tpl) if f]
    if any(vals.get(k) is None for k in keys):
        return None
    return tpl.format(**vals)


# ---------- 여러 장이 함께 쓰는 계산 ----------

def site_key(x):
    """같은 사이트로 세는 열쇠: 공식URL(앞의 http·www·끝 / 뺌), 없으면 공식원천명."""
    u = re.sub(r'^https?://(www\.)?', '', (x.get('공식URL') or '').strip().lower()).rstrip('/')
    return u or x.get('공식원천명') or ''


def sites_info(c):
    if c.sites is None:
        return None
    listed = sum(1 for x in c.sites if (x.get('통합출처ID') or '').startswith('SRC-'))
    n = len({site_key(x) for x in c.sites})
    orgs = {(x.get('제공기관') or '').strip() for x in c.sites} - {''}
    return {'n': n, 'orgs': len(orgs), 'listed': listed, 'ours': len(c.sites) - listed, 'merged': len(c.sites) - n}


def docs_info(c):
    if not c.docs:
        return None
    fm = Counter(r.get('format') for r in c.docs)
    u = sum(n for k, n in fm.items() if k in c.d['s5']['unstructured'])
    return {'n': len(c.docs), 'u': u, 'upct': pc(ex.pct(u, len(c.docs))), 'fm': fm}


def m1_info(c):
    out = []
    for p in c.data.policies:
        s = (c.m1.get(p['policy_id']) or {}).get('전체')
        if not s or not s.get('total'):
            continue
        tot = s['total']
        out.append({'p': p, 'short': short_name(p['name']), 'tot': tot, 'inc': s.get('inc', 0), 'nd': s.get('nd'), 'na': s.get('na', 0),
                    'indep': s.get('basis:INDEPENDENT', 0), 'prim': ex.pct(s.get('inc', 0), tot), 'pna': ex.pct(s.get('na', 0), tot)})
    return out


def find_info(c):
    mrows, others, extra, has = ex.collect_findings(c.data)
    uniq, seen = [], set()
    for r in mrows:                       # HOME 레코드 id 만 다른 줄은 하나로 센다
        k = (r['kind'], r['name'], r['home'], r['src'])
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    return {'rows': mrows, 'uniq': uniq, 'texts': list(others) + list(extra), 'has': has}


class Ctx:
    def __init__(self, root):
        self.root = root
        self.data = ex.Data(root)
        self.cfg = self.data.cfg
        self.d = self.cfg.get('deck') or {}
        self.names = self.cfg.get('stage_names', {})
        self.alias = [tuple(x) for x in self.d.get('org_alias', [])]
        self.used = []
        self.picked = {}          # 장 함수가 고른 중간값(사례·대표 행 등). 팀 공유판이 원천 위치를 적을 때 쓴다
        dj = lambda n: ex.read_json(self.data.path(self.data.dataset + '/' + n + '.json'))
        self.table_rows = {}
        for t in ('source_documents', 'evidence', 'policies', 'programs', 'policy_targets', 'links', 'sources'):
            j = dj(t)
            self.table_rows[t] = j.get('rows') if isinstance(j, dict) else None
        self.docs = self.table_rows['source_documents']
        self.evidence = ex.load_evidence(self.data)
        self.m1, self.m1src = ex.collect_m1(self.data, self.evidence)
        self.actors = self.data.csv('원천주체_단계별.csv')
        self.sites = self.data.csv('원천사이트_대조.csv')
        self.qr = self.data.csv('품질_리포트.csv')
        if not self.d:
            return
        self.sites_info = sites_info(self)
        self.docs_info = docs_info(self)
        self.m1_info = m1_info(self)
        self.find_info = find_info(self)

    def title(self, key, **kw):
        return self.d['titles'][key].format(**kw)

    def al(self, s):
        """긴 기관 이름을 약칭으로(설정 org_alias). 쓴 약칭은 그 장의 풀이 줄에 모인다."""
        for a, b in self.alias:
            if a in s:
                s = s.replace(a, b)
                if (a, b) not in self.used:
                    self.used.append((a, b))
        return s

    def alias_note(self, body):
        """이 장에서 줄인 약칭 중 본문에 실제로 보이는 것만 풀이한다."""
        pairs, shorts = [], set()
        for a, b in self.alias:
            if (a, b) in self.used and b not in shorts and b in body:
                shorts.add(b)
                pairs.append('%s = %s' % (b, a))
        self.used = []
        return '<p class="note">%s</p>' % e(self.d['alias_note'].format(pairs=' · '.join(pairs))) if pairs else ''

    def clean(self, s, parts=None):
        """원문 값 정리: 영문 식별자 괄호·영문 코드 구절을 빼고, 날짜를 맞추고, 기관을 약칭으로."""
        s = drop_id_parens(ex.scrub(s or '').replace('`', '').replace('**', ''))
        out = [x.strip() for x in s.split(' · ') if x.strip() and not CODE_RX.search(x) and not re.fullmatch(r'[A-Z_]{4,}', x.strip())]
        if parts:
            out = out[:parts]
        return self.al(norm_dates(' · '.join(out)))


# ---------- 장 ----------

def slide_cover(c):
    d = c.d['cover']
    st = sorted(c.names)
    vals = {'checked_at': c.data.checked_at, 'n': i(len(c.data.policies)), 'names': ' · '.join(short_name(p['name']) for p in c.data.policies),
            'stages': i(len(st)), 'first': c.names.get(st[0], '') if st else '', 'last': c.names.get(st[-1], '') if st else ''}
    rows = ''.join('<div class="tr"><p class="k">%s</p><p class="v%s">%s</p></div>' % (
        e(k), ' mono' if '{checked_at}' in v else '', e(v.format(**vals))) for k, v in d['rows'])
    return ('<section class="slide cover" id="s-cover" data-title="표지"><div><p class="mono gold" style="font-size:28px;letter-spacing:3px">%s</p>'
            '<p class="brand">%s</p><h1>%s</h1></div><div class="tblock">%s</div></section>') % (
        e(d['kicker']), e(d['brand']), '<br>'.join(e(x) for x in d['title']), rows)


def slide_overview(c):
    d = c.d['overview']
    si, di, mi, fi = c.sites_info, c.docs_info, c.m1_info, c.find_info
    ledger = len(c.d['s6']['ledger_tables'])
    vals = {'sites': si and i(si['n']), 'orgs': si and i(si['orgs']), 'docs': di and i(di['n']), 'upct': di and di['upct'],
            'tables': i(2 + ledger), 'extra': i(2), 'ledger': i(ledger),
            'range': pct_range([x['prim'] for x in mi]) if mi else None,
            'mm': i(len(fi['uniq'])) if fi['has'] else None}
    c.picked['overview'] = vals
    cards = []
    for card in d['cards']:
        bigs = ''.join('<div class="ob"><span class="big">%s</span><span class="bl">%s</span></div>' % (e(fill(tpl, vals) or '—'), e(label))
                       for tpl, label in card['bigs'])
        line = fill(card['line'], vals)
        cards.append('<div class="oc"><p class="act">%s</p>%s<p class="ol">%s</p></div>' % (
            e(c.d['acts'][card['act']]), bigs, e(line if line is not None else c.cfg['missing_text'])))
    body = '<div class="ov">%s</div>' % '<div class="arw">▶</div>'.join(cards)
    return (c.title('overview', docs=vals['docs'] or '—', tables=vals['tables']), body,
            'dataset/*.json · 원천사이트_대조.csv · 품질_리포트.csv · README.md(주요 불일치)')


def s2_matrix(c):
    cfg, d = c.cfg, c.d['s2']
    rows = c.actors
    if not rows:
        return c.title('missing', label='원천·작성 주체'), missing_body(cfg, '원천주체_단계별.csv'), '원천주체_단계별.csv'
    per = defaultdict(lambda: [Counter(), Counter(), Counter()])
    tot, dif = Counter(), Counter()
    for r in rows:
        st = r.get('단계') or ''
        vals = []
        for k in ('①업무주체', '②입력처', '③공개부서'):
            h = head_org(r.get(k))
            vals.append(clip_words(c.al(h), 22) if h else None)
        for k, v in enumerate(vals):
            if v:
                per[st][k][v] += 1
        if vals[0] and vals[2]:
            tot[st] += 1
            dif[st] += not same_org(vals[0], vals[2])
    body_rows = []
    for st in sorted(per):
        tops = []
        for k in range(3):
            top = []
            for n, _ in per[st][k].most_common(6):
                if not any(n.startswith(t) or t.startswith(n) for t in top) and len(top) < 2:
                    top.append(n)
            tops.append(top)
        cells = [e(' · '.join(t)) if t else '<span class="mute">%s</span>' % e(d['none'] if k == 1 else '—') for k, t in enumerate(tops)]
        gold3 = bool(tops[2]) and any(not any(same_org(x, y) for y in tops[0]) for x in tops[2])
        first = '<b>%s %s</b><br><small class="mute">%s %s/%s</small>' % (e(st), e(c.names.get(st, '')), e(d['diff_label']), i(dif[st]), i(tot[st]))
        body_rows.append([first, cells[0], cells[1], (cells[2], gold3)])
    body = table(d['cols'], body_rows, us=(0,)).replace('<table class="t">', '<table class="t tight">', 1) + '<p class="note">%s</p>' % e(d['note'])
    return c.title('s2', rows=i(sum(tot.values())), diff=i(sum(dif.values()))), body, '원천주체_단계별.csv'


def s3_numbers(c):
    cfg, d = c.cfg, c.d['s3']
    L = d['labels']
    cards, fmts = [], '—'
    si = c.sites_info
    if si is None:
        cards.append(stat(L['sites'], '—', e(cfg['missing_text'])))
        cards.append(stat(L['orgs'], '—', e(cfg['missing_text'])))
    else:
        cards.append(stat(L['sites'], i(si['n']), e(d['sites_sub'].format(listed=i(si['listed']), ours=i(si['ours']), merged=i(si['merged'])))))
        cards.append(stat(L['orgs'], i(si['orgs']), e(d['orgs_sub'])))
    if c.docs is None:
        cards.append(stat(L['formats'], '—', e(cfg['missing_text'])))
    else:
        fmts = i(len({r.get('format') for r in c.docs}))
        cards.append(stat(L['formats'], fmts, e(d['formats_sub'].format(docs=i(len(c.docs))))))
    cf = c.data.csv('연계필드_대응.csv')
    if cf is None:
        cards.append(stat(L['ids'], '—', e(cfg['missing_text'])))
    else:
        cn = Counter((r.get('대응') or '—') for r in cf)
        cards.append(stat(L['ids'], d['ids_big'], e(d['ids_sub'].format(n=i(len(cf)), same=i(cn.get('같음', 0)), part=i(cn.get('부분', 0)), none=i(cn.get('없음', 0))))))
    md = c.data.text('원천주체_단계별.md')
    quote = None
    for h, lines in ex.md_sections(md or '', 2):
        if h.startswith('기준표와 다른 점'):
            for head, trs in ex.md_tables(lines):
                if trs and '우리 원문 값' in head:
                    quote = ex.scrub(trs[0][head.index('우리 원문 값')])
                    break
    if quote:
        parts = [re.sub(r'\s+', ' ', re.sub(r'〈[^〉]*〉|[`*\'‘’“”"]', '', x)).strip() for x in quote.split(' / ')]
        parts = [c.al(x) for x in parts if x]
        cards.append(stat(L['press'], d['press_big'].format(n=len(parts)), '<br>'.join(e(x) for x in parts)))
    else:
        cards.append(stat(L['press'], '—', e(cfg['missing_text'])))
    t = ex.read_text(c.data.rpath(d['quote_file']))
    m = re.search(d['quote_pattern'], t or '')
    c.picked['s3'] = {'quote': quote, 'dept': m.group(0).strip() if m else None}
    mn = re.search(r'(\d+)가지', m.group(0)) if m else None
    cards.append(stat(L['dept'], (mn.group(1) + '가지') if mn else '—', e('“%s”' % m.group(0).strip()) if m else e(cfg['missing_text'])))
    body = '<div class="sgrid" style="margin-top:20px">%s</div>' % ''.join(cards)
    return (c.title('s3', sites=i(si['n']) if si else '—', fmts=fmts), body,
            '원천사이트_대조.csv · 연계필드_대응.csv · 원천주체_단계별.md · %s' % d['quote_file'])


def s4_flow(c):
    cfg, d = c.cfg, c.d['s4']
    if not c.docs:
        return c.title('missing', label='수집 경로'), missing_body(cfg, '수집 문서 목록'), 'dataset/source_documents.json'
    stages = sorted(c.names)
    cnt = Counter(s for r in c.docs for s in set(r.get('stage_codes') or []))
    multi = sum(1 for r in c.docs if len(set(r.get('stage_codes') or [])) > 1)
    boxes = ['<div class="fb%s"><span class="n">%s</span><span class="t">%s</span><span class="c">%s%s</span><small>%s</small></div>' % (
        ' gold' if k == len(stages) - 1 else '', e(s), e(c.names.get(s, '')), i(cnt.get(s, 0)), e(d['unit']), e(d['stage_kinds'].get(s, '')))
        for k, s in enumerate(stages)]
    body = '<div class="flow">%s</div>' % '<div class="arw">▶</div>'.join(boxes)
    body += '<p class="note">%s</p>' % e(d['overlap_note'].format(multi=i(multi), sum=i(sum(cnt.get(s, 0) for s in stages))))
    meth = Counter(r.get('collection_method') for r in c.docs)
    parts = [(d['methods'].get(k, k or '—'), n) for k, n in meth.most_common()]
    body += '<p class="note" style="margin-top:28px">%s</p>' % e(d['methods_note'].format(docs=i(len(c.docs)))) + sbar(parts)
    return c.title('s4', docs=i(len(c.docs)), methods=i(len(meth))), body, 'dataset/source_documents.json(stage_codes · collection_method)'


def m2_value(c, key):
    for r in c.qr or []:
        if (r.get('지표') or '') == 'M2' and key in (r.get('범주') or ''):
            return r.get('값')
    return None


def s5_trust(c):
    cfg, d = c.cfg, c.d['s5']
    di = c.docs_info
    if not di:
        return c.title('missing', label='비정형 수집'), missing_body(cfg, '수집 문서 목록'), 'dataset/source_documents.json'
    F, L = d['formats'], d['cards']
    fm = di['fm']
    parts = [(F.get(k, k), n) for k, n in fm.most_common(5)]
    rest = sum(fm.values()) - sum(n for _k, n in parts)
    if rest:
        parts.append(('기타', rest))
    cards = []
    du, ds = m2_value(c, 'canonical_url 중복'), m2_value(c, 'sha256 중복')
    if du is not None and ds is not None and du.isdigit() and ds.isdigit():
        cards.append(stat(L['dup'], '%s건' % i(int(du) + int(ds)), e(L['dup_sub'].format(u=i(int(du)), s=i(int(ds))))))
    else:
        cards.append(stat(L['dup'], '—', e(cfg['missing_text'])))
    inv = c.data.csv('수집항목_통합.csv')
    if inv is None:
        cards.append(stat(L['inventory'], '—', e(cfg['missing_text'])))
    else:
        ids = sum(int(r['관리ID_수']) for r in inv if (r.get('관리ID_수') or '').isdigit())
        cards.append(stat(L['inventory'], '%s→%s' % (i(ids), i(len(inv))), e(L['inventory_sub'])))
    for key, lab, sub in (('첨부 등록률', 'attach', 'attach_sub'), ('보존율 — evidence', 'saved', 'saved_sub')):
        v = m2_value(c, key)
        cards.append(stat(L[lab], re.sub(r'\.0%$', '%', v) if v else '—', e(L[sub] if v else cfg['missing_text'])))
    body = '<p class="note" style="margin-top:0">%s</p>' % e(d['formats_note'].format(docs=i(di['n']))) + sbar(parts)
    body += '<div class="banner" style="margin-top:22px;padding:14px 32px;font-size:30px">%s</div>' % e(d['gate'])
    body += '<div class="sgrid" style="margin-top:20px;grid-template-columns:repeat(4,1fr)">%s</div>' % ''.join(cards)
    return c.title('s5', pct=di['upct']), body, 'dataset/source_documents.json(format) · 품질_리포트.csv(M2) · 수집항목_통합.csv'


def validation_text(c):
    d = c.d['s6']
    node = shutil.which('node')
    sd, ld, dd = c.data.path(d['schema_dir']), c.data.path(d['ledger_dir']), c.data.path(c.data.dataset)
    script = os.path.join(ex.HERE, 'validate_dataset.cjs')
    if not (node and os.path.isdir(sd) and os.path.isdir(ld) and os.path.isdir(dd) and os.path.exists(script)):
        return d['validate_na'], 'warn'
    try:
        r = subprocess.run([node, script, dd, sd, ld], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return d['validate_na'], 'warn'
    return (d['validate_ok'], 'ok') if r.returncode == 0 else (d['validate_fail'], 'bad')


def tname(d, t):
    """표 이름: 한글 이름 + 아래 작은 회색 영문 이름."""
    return '%s<span class="en">%s</span>' % (e(d['names'].get(t, t)), e(t))


def s6_structure(c):
    cfg, d = c.cfg, c.d['s6']
    docs, ev = c.table_rows['source_documents'], c.table_rows['evidence']
    tables = 2 + len(d['ledger_tables'])
    if docs is None or ev is None:
        return c.title('missing', label='데이터셋 구조'), missing_body(cfg, '문서 목록·원천 대조 기록 표'), 'dataset/*.json'
    ledger = {}
    for t in d['ledger_tables']:
        rows = c.table_rows.get(t)
        ledger[t] = len(rows) if rows is not None else None
    proj = ex.read_json(c.data.path(d['ledger_dir'] + '/projects.json'))
    if isinstance(proj, dict) and isinstance(proj.get('rows'), list):
        ledger['projects'] = len(proj['rows'])
    c.picked['s6'] = {'ledger': dict(ledger), 'docs': len(docs), 'evidence': len(ev)}
    pj_ev = len({r.get('subject_id') for rows in c.evidence.values() for r in rows if r.get('subject_table') == 'projects' and str(r.get('subject_id', '')).startswith('PRJ-')})
    stack = ''.join('<div class="fb st"><span class="t">%s</span><span class="c">%s</span></div>' % (
        tname(d, t), (i(n) + e(d['row_unit'])) if n is not None else e(cfg['missing_text'])) for t, n in ledger.items())
    vtxt, vk = validation_text(c)
    body = ('<div class="flow" style="margin-top:12px">'
            '<div class="fb gold"><span class="t">%s</span><span class="c">%s%s</span><small>%s</small></div>'
            '<div class="arw">◀</div>'
            '<div class="fb gold"><span class="t">%s</span><span class="c">%s%s</span><small>%s</small></div>'
            '<div class="arw">▶</div>'
            '<div style="flex:1.1">%s</div></div>') % (
        tname(d, 'source_documents'), i(len(docs)), e(d['doc_unit']), e(d['doc_note']),
        tname(d, 'evidence'), i(len(ev)), e(d['doc_unit']), e(d['ev_note']), stack)
    note = d['proj_note'].format(all=i(ledger['projects']) if ledger.get('projects') is not None else '—', used=i(pj_ev))
    body += '<p class="note">%s <span class="gold b">%s</span>%s</p>' % (e(note), e(vtxt), '' if vk == 'ok' else ' (%s)' % e(d['validate_hint']))
    return c.title('s6', tables=i(tables)), body, 'dataset/*.json · %s/projects.json' % d['ledger_dir']


def best_conf(evs, verdicts=CONFIRM):
    conf = [x for x in evs if x.get('verdict') in verdicts and x.get('basis') != 'EXISTENCE']
    if not conf:
        return None
    return sorted(conf, key=lambda x: (ex.BASIS_ORDER.index(x['basis']) if x.get('basis') in ex.BASIS_ORDER else 9, x.get('doc_path') or '', x.get('evidence_id') or ''))[0]


def doc_label(c, title, doc_type):
    """문서 제목을 읽히게: 확장자·날짜 앞머리·숫자 조각을 빼고, 한글이 없으면 설정의 이름이나 문서 종류로."""
    d = c.d['s7']
    base = EXT_RX.sub('', title or '')
    t = re.sub(r'^\d{6}(?:\([^)]*\))*_?', '', base)
    t = re.sub(r'\s+', ' ', ' '.join(x for x in re.split(r'_+', t) if x and not x.isdigit())).strip()
    if not re.search('[가-힣]', t):
        t = d['doc_names'].get(base) or d['doc_types'].get(doc_type or '') or d['doc_types'].get('OTHER', '')
    return c.al(norm_dates(t))


def s7_chain(c):
    cfg, d = c.cfg, c.d['s7']
    vname = {k: n for k, n, _x in c.d['s9']['verdicts']}
    pols = [p for p in c.data.policies if p['policy_id'] in c.evidence]
    idx = d.get('example_policy_index', 0)
    src = '_work/<정책>/evidence*.jsonl · dataset/source_documents.json · 원장 projects.json'
    if not pols or idx >= len(pols):
        return c.title('missing', label='사업 사슬 예시'), missing_body(cfg, '원천 대조 기록'), src
    pol = pols[idx]
    rows = c.evidence[pol['policy_id']]
    by = defaultdict(lambda: defaultdict(list))
    link_by = defaultdict(list)
    for r in rows:
        if r.get('subject_table') == 'projects':
            by[r['subject_id']][r.get('field')].append(r)
        elif r.get('subject_table') == 'links' and r.get('field') == 'program_project':
            for part in str(r.get('subject_id') or '').split('|'):
                link_by[part].append(r)
    later = [s for s in sorted(c.names) if s != '01']
    cand = []
    for sid, fs in by.items():
        if not str(sid).startswith('PRJ-'):
            continue
        picks = {st: best_conf(fs.get('stage_' + st, []), FOUND) for st in later}
        link = best_conf(link_by.get(sid, []), FOUND)
        got = [v for v in list(picks.values()) + [link] if v]
        cand.append((-len(got), -sum(1 for v in got if v.get('basis') == 'INDEPENDENT'), sid, picks, link))
    if not cand:
        return c.title('missing', label='사업 사슬 예시'), missing_body(cfg, '원천 대조 기록의 사업'), src
    cand.sort(key=lambda x: x[:3])
    nneg, _ind, sid, picks, link = cand[0]
    by_path = {r.get('local_path'): r for r in (c.docs or []) if r.get('local_path')}
    by_url = {r.get('canonical_url'): r for r in (c.docs or []) if r.get('canonical_url')}

    def docinfo(ev_row):
        dr = by_path.get(ev_row.get('doc_path')) or by_url.get(ev_row.get('doc_url'))
        if dr:
            org = ' '.join(x for x in (dr.get('publisher_org'), dr.get('publisher_dept')) if x)
            return e(doc_label(c, dr.get('title'), dr.get('doc_type'))), e(c.al(org))
        return e(doc_label(c, os.path.basename(ev_row.get('doc_path') or ''), None)), ''

    links = c.table_rows.get('links') or []
    progs = {r.get('local_program_id'): r.get('program_name') for r in (c.table_rows.get('programs') or [])}
    prog = next((progs.get(l.get('from_local_id')) for l in links if l.get('link_type') == 'PROGRAM_PROJECT' and l.get('to_local_id') == sid), None)
    pj = ex.read_json(c.data.path(d.get('ledger_projects', c.d['s6']['ledger_dir'] + '/projects.json'))) or {}
    name = next((r.get('project_name') for r in pj.get('rows', []) if r.get('local_project_id') == sid), None)
    trs = []
    lk = link or best_conf(link_by.get(sid, []))
    c.picked['s7'] = {'policy': pol, 'sid': sid, 'name': name, 'program': prog, 'picks': picks, 'link': lk, 'later': later}
    v1 = '%s → %s' % (e(pol['name']), e(prog or '—'))
    if lk and not link:
        v1 += ' <span class="mute">(%s)</span>' % e(vname.get(lk['verdict'], ''))
    t1, o1 = docinfo(lk) if lk else ('', '')
    trs.append(['<b>01 %s</b>' % e(c.names.get('01', '')), v1, t1, o1])
    for st in later:
        r = picks.get(st)
        if not r:
            trs.append(['<b>%s %s</b>' % (st, e(c.names.get(st, ''))), '<span class="mute">%s</span>' % e(cfg['missing_text']), '', ''])
            continue
        val = c.clean(str(r.get('dataset_value') or ''), d.get('max_parts', 2))
        val = e(val) if val else '<span class="mute">%s</span>' % e(vname.get(r['verdict'], ''))
        t, o = docinfo(r)
        trs.append(['<b>%s %s</b>' % (st, e(c.names.get(st, ''))), val, t, o])
    body = '<p class="sub hd"><b style="color:var(--ink)">%s</b> · %s <span class="mono mute" style="font-size:20px">%s</span></p>' % (
        e(fix_parens(name or '')), e(pol['name']), e(sid))
    body += table(d['cols'], trs, us=(0,)) + '<p class="note">%s</p>' % e(d['rule'])
    return c.title('s7', n=-nneg, total=len(c.names)), body, src


def s8_canonical(c):
    cfg, d = c.cfg, c.d['s8']
    if c.actors is None:
        return c.title('s8', n=len(d['rows'])), missing_body(cfg, '원천주체_단계별.csv'), '원천주체_단계별.csv'
    evn = Counter()
    for rows in c.evidence.values():
        for r in rows:
            evn[r.get('stage_code')] += 1
    trs, matched = [], []
    for row in d['rows']:
        orgs, hit = [], []
        matched.append((row, hit))
        for r in c.actors:
            if r.get('단계') == row['stage'] and any(m in (r.get('원천') or '') for m in row['match']):
                hit.append(r)
                h = head_org(r.get('①업무주체'))
                h = clip_words(c.al(h), 22) if h else None
                if h and h not in orgs:
                    orgs.append(h)
        trs.append(['<b>%s</b>' % e(row['item']), e(row['source']),
                    e(' · '.join(orgs[:2])) if orgs else '<span class="mute">%s</span>' % e(cfg['missing_text']),
                    '<span class="mono">%s</span>%s' % (i(evn.get(row['stage'], 0)), e(d['unit']))])
    c.picked['s8'] = matched
    body = table(d['cols'], trs, us=(0,)) + '<div class="banner" style="margin-top:18px;padding:14px 32px;font-size:30px">%s</div>' % e(d['principle'])
    return c.title('s8', n=len(d['rows'])), body, '원천주체_단계별.csv · _work/<정책>/evidence*.jsonl'


def audit_m3(c):
    """품질_리포트.csv 의 M3(감사 파일 종류별 최신 판, evidence_id 있는 행) → (표본 수, 오류 수) 또는 None."""
    m3 = next((r for r in c.qr or [] if (r.get('지표') or '') == 'M3' and (r.get('분모') or '').strip()), None)
    c.picked['m3'] = m3
    if not m3:
        return None
    return int(m3['분모']), int(m3['분자'])


def s9_verdict(c):
    cfg, d = c.cfg, c.d['s9']
    t = cfg.get('target_pct', 90)
    mi = c.m1_info
    src = '_work/<정책>/evidence*.jsonl · 품질_리포트.csv(M3: _work/audit 최신 판)'
    if not mi:
        return c.title('missing', label='판정 결과'), missing_body(cfg, '원천 대조 기록 또는 품질 리포트'), src
    left = '<h3 class="gold" style="font-size:28px">%s</h3><div class="vl">%s</div>' % (
        e(d['legend_title']), ''.join('<p><b>%s</b> %s</p>' % (e(n), e(x)) for _k, n, x in d['verdicts']))
    au = audit_m3(c)
    left += '<div class="audit">%s</div>' % e(d['audit'].format(n=i(au[0]), err=i(au[1])) if au else d['audit_pending'])
    right = ''
    for x in mi:
        right += '<div class="pb"><div class="pn">%s <span class="mute" style="font-size:24px;font-weight:600">%s %s</span></div>' % (
            e(x['p']['name']), e(d['items_label']), i(x['tot']))
        for lab, v, k in ((d['bar_inc'], x['inc'], ''), (d['bar_na'], x['na'], 'k3')):
            pv = ex.pct(v, x['tot'])
            right += ('<div class="rb"><span>%s</span><div class="tr"><div class="fl %s" style="width:%.1f%%"></div><div class="tg" style="left:%g%%"></div></div>'
                      '<span class="v">%s/%s %s</span></div>') % (e(lab), k, pv, t, i(v), i(x['tot']), pc(pv))
        right += '</div>'
    right += '<p class="note">%s</p>' % e(d['note'].format(t='%g' % t))
    body = '<div class="two">%s<div>%s</div></div>' % ('<div>%s</div>' % left, right)
    met = [x for x in mi if x['prim'] >= t]
    rng = pct_range([x['prim'] for x in mi])
    if len(met) == len(mi):
        title = c.title('s9_all', range=rng, t='%g' % t, n=len(mi))
    elif met:
        title = c.title('s9_some', range=rng, t='%g' % t, names=' · '.join(x['short'] for x in met))
    else:
        title = c.title('s9_none', range=rng, t='%g' % t)
    return title, body, src


def item_split(s):
    """'승인일 2020-01-07' → ('승인일', '2020-01-07'). 앞의 'HOME ' 과 영문 표식 괄호는 뺀다."""
    s = norm_dates(drop_id_parens(s)).strip()
    s = re.sub(r'^HOME\s+', '', s)
    m = re.match(r'^(\D*?)\s*(\d.*)$', s)
    return (m.group(1).strip(), m.group(2).strip()) if m else ('', s)


def src_value(src, label):
    """원문 값(' · ' 로 이은 구절) 중 HOME 값과 같은 항목의 값."""
    key = lambda x: re.sub(r'\s+', '', x)
    clauses = [item_split(x) for x in drop_id_parens(src).split(' · ') if x.strip()]
    for test in (lambda a: key(a) == key(label), lambda a: key(a).endswith(key(label)) or key(label).endswith(key(a))):
        for a, v in clauses:
            if a and v and test(a):
                return v
    return clauses[0][1] if clauses else ''


def suggestion(c, txt, limit):
    """'**라벨**: 글' → (라벨, 앞 문장들). `코드`·파일명 괄호·영문 식별자가 든 문장은 뺀다. 문장은 자르지 않는다."""
    m = re.match(r'^\*\*(.+?)\*\*(.*)$', ex.scrub(txt), re.S)
    label, rest = (m.group(1), m.group(2)) if m else ('', ex.scrub(txt))
    rest = drop_id_parens(rest).lstrip(' :')
    out = ''
    for s in re.split(r'(?<=[.])\s+', rest):
        s = s.strip()
        if not s or '`' in s or ID_RX.search(s) or CODE_RX.search(s):
            continue
        if out and len(out) + len(s) + 1 > limit:
            break
        out = (out + ' ' + s).strip()
    return c.al(norm_dates(label)), c.al(norm_dates(out))


def s10_fixes(c):
    cfg, d = c.cfg, c.d['s10']
    fi = c.find_info
    src = 'README.md(주요 불일치) · report_notes.json'
    if not fi['has'] and not fi['texts']:
        return c.title('missing', label='원천으로 바로잡은 것'), missing_body(cfg, 'README 주요 불일치 절'), src
    cands = []
    for k, r in enumerate(fi['uniq']):
        if CODE_RX.search(r['home'] + ' ' + r['src']):
            continue
        hl, hv = item_split(r['home'])
        if hl and hv:
            cands.append(('/' in hv, k, r, hl, hv))
    kinds = []
    for _m, _k, r, _l, _v in cands:
        if r['kind'] not in kinds:
            kinds.append(r['kind'])
    trs, shown = [], []
    for kind in kinds[:d['max_mismatch']]:
        _m, _k, r, hl, hv = min((x for x in cands if x[2]['kind'] == kind), key=lambda x: x[:2])
        shown.append(r)
        mk = re.match(r'^(\d\d)\.?\s*(\S+)', kind)
        stage = '%s %s' % (mk.group(1), mk.group(2)) if mk else kind
        sv = src_value(r['src'], hl)
        trs.append(['<b>%s</b><br><small class="mute">%s</small>' % (e(fix_parens(r['name'] or '')), e(stage)), e(hl),
                    e(re.sub(r'\s*\([^()]*\)$', '', hv).replace('/', ' / ')), ('<b>%s</b>' % e(re.sub(r'\s*\([^()]*\)$', '', sv)), True)])
    picked, cards = set(), []
    c.picked['s10'] = {'rows': shown, 'texts': []}
    sugg = [suggestion(c, txt, d['sentence_limit']) for _p, txt in fi['texts']]
    for kw in d['priority']:
        for k, (lab, sent) in enumerate(sugg):
            if k not in picked and lab and sent and kw in lab + ' ' + sent and len(cards) < d['max_text']:
                picked.add(k)
                c.picked['s10']['texts'].append(k)
                cards.append('<div class="sc s fx"><p class="l">%s</p><p>%s</p></div>' % (e(lab), e(sent)))
                break
    body = table(d['cols'], trs) if trs else missing_body(cfg, '대표 사례 없음')
    if cards:
        body += '<div class="sgrid" style="margin-top:20px">%s</div>' % ''.join(cards)
    body += '<p class="note">%s</p>' % e(d['note'].format(mm=i(len(fi['uniq'])), raw=i(len(fi['rows']))))
    return c.title('s10', mm=i(len(fi['uniq'])), ex=i(len(fi['texts']))), body, src


def s11_newpolicy(c):
    d = c.d['s11']
    pol = ex.read_json(c.data.path('tools/research/chain/config/policies.json')) or {}
    pids = [p.get('policy_id') for p in pol.get('policies', []) if p.get('policy_id')]
    files = sorted(glob.glob(c.data.path('tools/research/chain/*.py')) + glob.glob(c.data.path('tools/research/chain/stages/*.py')))
    c.picked['s11'] = {'files': files, 'policy_ids': pids}
    hits = 0
    for f in files:
        t = ex.read_text(f) or ''
        hits += sum(t.count(pid) for pid in pids)
    boxes = ['<div class="fb%s"><span class="n">%02d</span><span class="t">%s</span></div>' % (' gold' if k == 0 else '', k + 1, e(lab)) for k, lab in enumerate(d['flow'])]
    flow = '<div class="flow">%s</div>' % '<div class="arw">▶</div>'.join(boxes)
    disc = ex.read_json(c.data.path('tools/research/chain/config/policies_discovered.json')) or {}
    vals = {'n': i(len(pids)), 'cand': i(sum(1 for x in disc.get('candidates') or [] if x.get('status') == 'candidate')),
            'hits': i(hits), 'files': i(len(files)), 'checked_at': c.data.checked_at}
    cards = ''.join('<div class="sc s"><p class="l">%s</p><span class="big">%s</span><p>%s</p></div>' % (
        e(k['label']), e(k['big'].format(**vals)), e(k['sub'].format(**vals))) for k in d['cards'])
    body = flow + '<div class="sgrid" style="margin-top:32px">%s</div>' % cards
    return c.title('s11', hits=i(hits)), body, 'config/policies.json · policies_discovered.json · tools/research/chain/*.py'


# ---------- 부록 ----------

def appx_measures(c):
    a, cfg = c.d['appendix'], c.cfg
    body = '<p class="note" style="margin-top:0">%s</p>' % e(a['defs_title'])
    body += table(['기준', '정의'], [['<b>%s</b>' % e(x), e(y)] for x, y in cfg.get('measure_defs', [])])
    body += '<p class="note" style="margin-top:22px">%s</p>' % e(a['table_title'])
    cell = lambda v, tot: e(cfg['missing_text']) if v is None else '<span class="mono">%s/%s %s</span>' % (i(v), i(tot), pc(ex.pct(v, tot)))
    rows = [['<b>%s</b>' % e(x['p']['name']), '<span class="mono">%s</span>' % i(x['tot']), cell(x['inc'], x['tot']), cell(x['nd'], x['tot']),
             cell(x['na'], x['tot']), '<span class="mono">%s / %s</span>' % (i(x['indep']), i(x['inc']))] for x in c.m1_info]
    body += table(a['table_cols'], rows) if rows else missing_body(cfg, '원천 대조 기록 또는 품질 리포트')
    return c.title('a1'), body, 'config/explain.json(measure_defs) · _work/<정책>/evidence*.jsonl'


def appx_terms(c):
    a, cfg, s9 = c.d['appendix'], c.cfg, c.d['s9']
    gl = [['<span class="mono">%s</span>' % e(k), '<b>%s</b> — %s' % (e(n), e(x))] for k, n, x in s9['verdicts'] + s9['basis']]
    gl += [['<b>%s</b>' % e(k), e(x)] for k, x in a['glossary']]
    left = '<p class="note" style="margin-top:0">%s</p>' % e(a['glossary_title']) + table(a['glossary_cols'], gl)
    right = '<p class="note" style="margin-top:0">%s</p><p class="cmd">%s</p>' % (e(a['repro_title']), '<br>'.join(
        '<span class="mono">%s</span>' % e(x) for x in cfg.get('repro_commands', []) + ['python3 -P -E tools/research/chain/explain_deck.py']))
    right += '<p class="note">%s</p><p class="cmd"><span class="mono gold">%s</span><br>%s<br><span class="mono">%s</span></p>' % (
        e(a['detail_title']), e(a['detail']), e(a['detail_note']), e(a['report']))
    body = '<div class="two" style="grid-template-columns:1fr 600px">%s<div>%s</div></div>' % ('<div>%s</div>' % left, right)
    return c.title('a2'), body, a['detail']


# ---------- 조립 ----------

def wrap(c, idx, total, act, title, lead, body, source, cls=''):
    lead_html = '<p class="sub ld">%s</p>' % e(lead) if lead else ''
    return ('<section class="slide%s" id="s-%02d" data-title="%s"><div class="eyebrow"><span class="m">SHEET %02d</span><span class="t">%s</span></div>'
            '<h2>%s</h2>%s%s%s<div class="foot"><span class="m">SHEET %02d / %02d</span><span>출처: %s</span></div></section>') % (
        cls, idx, e(title), idx, e(act), e(title), lead_html, body, c.alias_note(body), idx, total, e(source))


def slide_closing(c, idx, total):
    d = c.d['closing']
    return ('<section class="slide bg-gold closing" id="s-%02d" data-title="마무리"><div class="eyebrow"><span class="m" style="color:#0B2B5A">SHEET %02d</span>'
            '<span class="t" style="color:#0B2B5A">%s</span></div><h1>%s</h1><p class="lead">%s</p>'
            '<div class="foot" style="color:#0B2B5A"><span class="m">SHEET %02d / %02d</span><span>출처: %s · 기준일 %s</span></div></section>') % (
        idx, idx, e(c.d['acts']['5']), '<br>'.join(e(x) for x in d['title']), e(d['lead']), idx, total, e(d['ref']), e(c.data.checked_at))


PLAN = [('overview', '0', slide_overview), ('s2', '1', s2_matrix), ('s3', '1', s3_numbers), ('s4', '2', s4_flow), ('s5', '2', s5_trust),
        ('s6', '3', s6_structure), ('s7', '3', s7_chain), ('s8', '4', s8_canonical), ('s9', '4', s9_verdict), ('s10', '4', s10_fixes),
        ('s11', '4', s11_newpolicy)]
APPENDIX = [('a1', appx_measures), ('a2', appx_terms)]


def slides(c):
    """장 목록 [dict(idx 번호, key, act 막, title 제목, lead, body 본문 HTML, source 출처, html 장 HTML)]. 덱과 팀 공유판이 함께 쓴다."""
    acts, leads = c.d['acts'], c.d.get('leads', {})
    total = 1 + len(PLAN) + 1 + len(APPENDIX)
    cv = c.d['cover']
    out = [{'idx': 1, 'key': 'cover', 'act': cv['kicker'], 'title': ' '.join(cv['title']), 'lead': None, 'body': None, 'source': None,
            'html': slide_cover(c)}]

    def add(idx, key, act, fn, cls=''):
        c.used = []
        title, body, source = fn(c)
        if '기준일' not in source:
            source += ' · 기준일 %s' % c.data.checked_at
        out.append({'idx': idx, 'key': key, 'act': act, 'title': title, 'lead': leads.get(key), 'body': body, 'source': source,
                    'html': wrap(c, idx, total, act, title, leads.get(key), body, source, cls)})
    for k, (key, act, fn) in enumerate(PLAN):
        add(k + 2, key, acts[act], fn)
    cl, idx = c.d['closing'], len(PLAN) + 2
    out.append({'idx': idx, 'key': 'closing', 'act': acts['5'], 'title': ' '.join(cl['title']), 'lead': cl['lead'], 'body': None,
                'source': '%s · 기준일 %s' % (cl['ref'], c.data.checked_at), 'html': slide_closing(c, idx, total)})
    for k, (key, fn) in enumerate(APPENDIX):
        add(len(PLAN) + 3 + k, key, acts['a'], fn, ' appx')
    return out


def build(root):
    c = Ctx(root)
    if not c.d:
        raise SystemExit('config/explain.json 의 deck 절이 없습니다')
    sl = slides(c)
    total = len(sl)
    secs = [s['html'] for s in sl]
    ui = ('<div class="ui" id="ui"><button id="bPrev" aria-label="이전">◀</button><span class="ct" id="ct">1 / %d</span>'
          '<button id="bNext" aria-label="다음">▶</button></div><div class="progress" id="prog" style="width:0"></div>') % total
    html = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            '<title>%s</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">\n'
            '<style>\n%s\n</style>\n</head>\n<body>\n<div class="viewport" id="vp">\n<div class="deck" id="deck">\n%s\n</div>\n</div>\n%s\n<script>\n%s\n</script>\n</body>\n</html>\n') % (
        e(c.d['page_title']), CSS, '\n'.join(secs), ui, SCRIPT)
    return html, c


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=ROOT)
    ap.add_argument('--out', default=None)
    a = ap.parse_args(argv)
    html, c = build(a.root)
    hits = ex.pii_hits(html)
    if hits:
        sys.stderr.write('개인정보 모양이 남았습니다(%d건): %s\n' % (len(hits), ', '.join(h[0] for h in hits[:5])))
        return 1
    out = a.out or os.path.join(a.root, c.d.get('output', 'docs/speech/research/조사결과_발표.html'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('작성: %s (%d bytes, %d장)' % (os.path.relpath(out, a.root), len(html.encode('utf-8')), html.count('<section class="slide')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
