"""원천 형식 파서(정책과 무관). 경로·칸 이름은 config/stage_sources.json 에서 받는다.

- LH 건설공사현황 PDF 표(pypdf 텍스트 줄 끝의 금액·규모·단위·착공·준공·공정률)
- 공공데이터 CSV(인코딩 지정)
- 건축HUB 주택인허가 대용량(ZIP 안 파이프 구분 텍스트, 칸 이름은 manifest)
- 청약홈 분양정보 Detail JSON(rows)
- LH 분양임대공고 목록·공급정보·상세 JSON(응답의 …Nm 설명표로 칸을 찾음)
- HWPX 표(section0.xml 의 tbl·tc 칸 주소·병합)
"""

import csv
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict, defaultdict

import pypdf  # PDF 텍스트 추출에만 쓴다.

from common import p, nz


PDF_TAIL = re.compile(r'^(?P<head>.*?)\s+(?P<amt>[\d,]+(?:\.\d+)?)\s+(?P<size>[\d,]+(?:\.\d+)?)\s+(?P<unit>\S+)\s+'
                      r'(?P<start>\d{2}-\d{2}-\d{2})\s+(?P<end>\d{2}-\d{2}-\d{2})\s+(?P<pct>[\d.]+)\s*$')


def read_lh_construction_pdf(path):
    """LH 건설공사현황 PDF → (행 목록, 쪽 구분 전체 텍스트, 쪽 수). 행은 텍스트 줄 끝 6칸을 정규식으로 자른 것."""
    reader = pypdf.PdfReader(p(path))
    rows, text_parts = [], []
    for pi, pg in enumerate(reader.pages):
        t = pg.extract_text()
        text_parts.append('=== p.%d ===\n%s\n' % (pi + 1, t))
        for li, line in enumerate(t.split('\n')):
            m = PDF_TAIL.match(line.strip())
            if not m:
                continue
            g = m.groupdict()
            head = g['head'].split()
            rows.append(OrderedDict([
                ('쪽', pi + 1), ('줄', li + 1),
                ('본부', head[0] if len(head) > 0 else ''), ('사업단', head[1] if len(head) > 1 else ''),
                ('공종', head[2] if len(head) > 2 else ''), ('블록', head[3] if len(head) > 3 else ''),
                ('사업지구·현장명·시공회사(텍스트 경계 미분리)', ' '.join(head[4:])),
                ('공사금액(백만원)', g['amt']), ('공사규모', g['size']), ('단위', g['unit']),
                ('착공일', g['start']), ('준공일', g['end']), ('공정률(%)', g['pct']),
                ('원문_줄', line.strip()),
            ]))
    return rows, ''.join(text_parts), len(reader.pages)


def read_table_csv(path, encoding='utf-8-sig'):
    """CSV → (머리 줄, [(CSV 행 번호, 행)]). 행 번호는 머리 줄을 1행으로 센다."""
    with open(p(path), 'rb') as f:
        raw = f.read().decode(encoding)
    rows = list(csv.reader(io.StringIO(raw)))
    return rows[0], [(i + 2, r) for i, r in enumerate(rows[1:])]


def read_hub_bulk(zip_path, manifest_path, part, name_col, names):
    """건축HUB 대용량 ZIP 에서 이름 칸(공백·괄호 무시)이 names 에 드는 행만 → (칸 이름들, {이름: [(줄, 칸들)]}, manifest, 멤버)."""
    with open(p(manifest_path), encoding='utf-8') as f:
        man = json.load(f)
    cols = [c['name'] for c in man['files'][part]['columns']]
    ni = cols.index(name_col)
    found = defaultdict(list)
    member = man['files'][part]['member']
    with zipfile.ZipFile(p(zip_path)) as z, z.open(member) as f:
        for i, line in enumerate(io.TextIOWrapper(f, encoding='utf-8', errors='replace')):
            c = line.rstrip('\n').split('|')
            k = nz(c[ni]) if len(c) > ni else ''
            if k in names:
                found[k].append((i + 1, c))
    return cols, found, man, member


def read_applyhome(dir_, ops, key):
    """청약홈 Detail JSON 여러 개 → {키 값: (op, 행 번호, 행)}. 같은 키는 앞 op·앞 행이 이긴다."""
    idx = {}
    for op in ops:
        with open(p(dir_ + '/' + op + '.json'), encoding='utf-8') as f:
            d = json.load(f)
        for i, r in enumerate(d['rows']):
            k = str(r.get(key) or '')
            if k and k not in idx:
                idx[k] = (op, i, r)
    return idx


def _labels(resp):
    """응답의 …Nm 블록은 필드 이름의 한글 설명표다. {블록 이름: {설명: 필드}}."""
    out = {}
    for blk in resp or []:
        for k, v in blk.items():
            if k.endswith('Nm') and v:
                out[k[:-2]] = {lab: key for key, lab in v[0].items()}
    return out


def _pick(lab, names):
    for n in names:
        if n in lab:
            return lab[n]
    return None


def read_lh_notice(notice_dir, detail_dir, key, labels):
    """LH 공고목록(notices.json)·공급정보(supply.json)·상세(details.json) → 공고 키(PAN_ID)별 색인.
    상세·공급정보는 공고 유형마다 필드 이름이 달라 설명표의 이름(labels 설정)으로 칸을 찾는다."""
    with open(p(notice_dir + '/notices.json'), encoding='utf-8') as f:
        n = json.load(f)
    notices = {}
    for i, r in enumerate(n['items']):
        notices.setdefault(r[key], (i, r))
    with open(p(notice_dir + '/supply.json'), encoding='utf-8') as f:
        s = json.load(f)
    supply = {}
    blk_re = re.compile(labels['supply_block_re'])
    for i, r in enumerate(s['items']):
        lst = []
        lab_all = _labels(r.get('response'))
        for blk in r.get('response') or []:
            for k, v in blk.items():
                if blk_re.fullmatch(k):
                    lab = lab_all.get(k, {})
                    kn, kc = _pick(lab, labels['supply_name']), _pick(lab, labels['supply_count'])
                    for x in v:
                        lst.append((k, x, x.get(kn) if kn else None, x.get(kc) if kc else None, kc))
        supply.setdefault(r[key], (i, lst))
    with open(p(detail_dir + '/details.json'), encoding='utf-8') as f:
        d = json.load(f)
    details = {}
    sbd_blk = labels['detail_block']
    for i, r in enumerate(d['rows']):
        sbd = []
        lab = _labels(r.get('response')).get(sbd_blk, {})
        kn, kt, km = _pick(lab, labels['detail_name']), _pick(lab, labels['detail_total']), _pick(lab, labels['detail_move'])
        for blk in r.get('response') or []:
            if sbd_blk in blk:
                for x in blk[sbd_blk]:
                    sbd.append(dict(x, _name=x.get(kn) if kn else None, _total=x.get(kt) if kt else None,
                                    _move=x.get(km) if km else None, _keys='%s/%s/%s' % (kn, kt, km)))
        details.setdefault(r[key], (i, sbd))
    return notices, supply, details


HWPX_NS = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'


def read_hwpx_tables(path, ncols):
    """HWPX 의 표 → [(표 번호, 행 번호, 칸 ncols 개)]. 병합 칸은 같은 글로 채운다. 첫 행(머리)은 뺀다."""
    with zipfile.ZipFile(p(path)) as z:
        root = ET.fromstring(z.read('Contents/section0.xml'))
    ns = HWPX_NS
    out = []
    for ti, t in enumerate(root.iter(ns + 'tbl')):
        grid = {}
        for tr in t.iter(ns + 'tr'):
            for tc in tr.findall(ns + 'tc'):
                a, s = tc.find(ns + 'cellAddr'), tc.find(ns + 'cellSpan')
                c, r = int(a.get('colAddr')), int(a.get('rowAddr'))
                cs, rs = int(s.get('colSpan')), int(s.get('rowSpan'))
                txt = ''.join(x.text or '' for x in tc.iter(ns + 't')).strip()
                for dr in range(rs):
                    for dc in range(cs):
                        grid[(r + dr, c + dc)] = txt
        nrow = max(k[0] for k in grid) + 1
        for r in range(1, nrow):
            out.append((ti + 1, r + 1, [grid.get((r, c), '') for c in range(ncols)]))
    return out


# ---------------------------------------------------------------- 독립 수집 원천(stages/independent.py)

def read_hub_basic_rows(zip_path, manifest_path, part, sgg_col, sido_prefixes):
    """건축HUB 대용량 ZIP 에서 시군구 코드 앞 2자리가 sido_prefixes 에 드는 행 → (칸 이름들, [(줄, 칸들)], 멤버)."""
    with open(p(manifest_path), encoding='utf-8') as f:
        man = json.load(f)
    cols = [c['name'] for c in man['files'][part]['columns']]
    si = cols.index(sgg_col)
    member = man['files'][part]['member']
    out = []
    with zipfile.ZipFile(p(zip_path)) as z, z.open(member) as f:
        for i, line in enumerate(io.TextIOWrapper(f, encoding='utf-8', errors='replace')):
            c = line.rstrip('\n').split('|')
            if len(c) > si and c[si][:2] in sido_prefixes:
                out.append((i + 1, c))
    return cols, out, member


def _cfb_stream(data, name):
    """OLE2(CFB) 파일에서 이름이 name 인 스트림 바이트. 작은 스트림(mini stream)도 읽는다."""
    import struct
    ssz = 1 << struct.unpack_from('<H', data, 30)[0]
    mssz = 1 << struct.unpack_from('<H', data, 32)[0]
    n_fat, dir_start, _, cutoff, mfat_start, n_mfat, difat_start, n_difat = struct.unpack_from('<IIIIIIII', data, 44)
    sec = lambda i: data[512 + i * ssz: 512 + (i + 1) * ssz]
    difat = list(struct.unpack_from('<109I', data, 76))
    d = difat_start
    for _ in range(n_difat):
        s = sec(d)
        vals = struct.unpack('<%dI' % (ssz // 4), s)
        difat += vals[:-1]
        d = vals[-1]
    fat = []
    for fs in difat[:n_fat]:
        fat += struct.unpack('<%dI' % (ssz // 4), sec(fs))

    def chain(start):
        out, i, seen = [], start, set()
        while i < 0xFFFFFFFA and i not in seen:
            seen.add(i)
            out.append(sec(i))
            i = fat[i]
        return b''.join(out)
    dirs = chain(dir_start)
    entries = []
    for k in range(len(dirs) // 128):
        e = dirs[k * 128:(k + 1) * 128]
        nl = struct.unpack_from('<H', e, 64)[0]
        nm = e[:max(nl - 2, 0)].decode('utf-16-le', 'replace')
        start, size = struct.unpack_from('<II', e, 116)
        entries.append((nm, e[66], start, size))
    root = entries[0]
    for nm, typ, start, size in entries:
        if nm != name:
            continue
        if size >= cutoff:
            return chain(start)[:size]
        mini = chain(root[2])
        mfat = []
        if n_mfat:
            b = chain(mfat_start)
            mfat = list(struct.unpack('<%dI' % (len(b) // 4), b))
        out, i = [], start
        while i < 0xFFFFFFFA:
            out.append(mini[i * mssz:(i + 1) * mssz])
            i = mfat[i]
        return b''.join(out)[:size]
    raise ValueError('CFB 스트림 없음: %s' % name)


def read_xls(path):
    """BIFF8 .xls → {시트 이름: {(행, 열): 값}} (표준 라이브러리만). 문자열(SST·LABEL)·숫자(NUMBER·RK·MULRK)만 읽는다."""
    import struct
    with open(p(path), 'rb') as f:
        data = f.read()
    try:
        wb = _cfb_stream(data, 'Workbook')
    except ValueError:
        wb = _cfb_stream(data, 'Book')
    recs, pos = [], 0
    while pos + 4 <= len(wb):
        t, n = struct.unpack_from('<HH', wb, pos)
        recs.append((t, wb[pos + 4:pos + 4 + n]))
        pos += 4 + n

    def rk(v):
        x = struct.unpack('<d', struct.pack('<Q', (v & 0xFFFFFFFC) << 32))[0] if not v & 2 else float(v >> 2)
        return x / 100 if v & 1 else x
    sst = []
    sheets, names, cur = {}, [], None
    i = 0
    while i < len(recs):
        t, b = recs[i]
        if t == 0x0085:  # BOUNDSHEET
            ln, fl = b[6], b[7]
            names.append(b[8:8 + ln * (2 if fl & 1 else 1)].decode('utf-16-le' if fl & 1 else 'latin-1'))
        elif t == 0x00FC:  # SST (+ CONTINUE)
            parts = [b]
            while i + 1 < len(recs) and recs[i + 1][0] == 0x003C:
                i += 1
                parts.append(recs[i][1])
            total = struct.unpack_from('<I', parts[0], 4)[0]
            pi, off = 0, 8
            for _ in range(total):
                if off >= len(parts[pi]):
                    pi, off = pi + 1, 0
                buf = parts[pi]
                cch = struct.unpack_from('<H', buf, off)[0]
                fl = buf[off + 2]
                off += 3
                rt = sz = 0
                if fl & 8:
                    rt = struct.unpack_from('<H', buf, off)[0]
                    off += 2
                if fl & 4:
                    sz = struct.unpack_from('<I', buf, off)[0]
                    off += 4
                chars, left = [], cch
                while left:
                    buf = parts[pi]
                    w = 2 if fl & 1 else 1
                    take = min(left, (len(buf) - off) // w)
                    chars.append(buf[off:off + take * w].decode('utf-16-le' if w == 2 else 'latin-1'))
                    off += take * w
                    left -= take
                    if left:
                        pi += 1
                        fl = parts[pi][0]
                        off = 1
                s = ''.join(chars)
                skip = rt * 4 + sz
                while skip:
                    take = min(skip, len(parts[pi]) - off)
                    off += take
                    skip -= take
                    if skip:
                        pi, off = pi + 1, 0
                sst.append(s)
        elif t == 0x0809:  # BOF
            if struct.unpack_from('<H', b, 2)[0] == 0x0010:
                cur = {}
                sheets[names[len(sheets)] if len(sheets) < len(names) else str(len(sheets))] = cur
        elif cur is not None and t == 0x00FD:
            r, c, _, k = struct.unpack_from('<HHHI', b)
            cur[(r, c)] = sst[k]
        elif cur is not None and t == 0x0203:
            r, c, _, v = struct.unpack_from('<HHHd', b)
            cur[(r, c)] = v
        elif cur is not None and t == 0x027E:
            r, c, _, v = struct.unpack_from('<HHHI', b)
            cur[(r, c)] = rk(v)
        elif cur is not None and t == 0x00BD:
            r, c0 = struct.unpack_from('<HH', b)
            n = (len(b) - 6) // 6
            for k in range(n):
                _, v = struct.unpack_from('<HI', b, 4 + k * 6)
                cur[(r, c0 + k)] = rk(v)
        elif cur is not None and t == 0x0204:
            r, c, _, ln = struct.unpack_from('<HHHH', b)
            fl = b[8]
            cur[(r, c)] = b[9:9 + ln * (2 if fl & 1 else 1)].decode('utf-16-le' if fl & 1 else 'latin-1')
        i += 1
    return sheets


def xls_table(sheet, header_cells):
    """시트 칸 → (머리 행 번호(0부터), 머리 칸들, [(엑셀 행 번호, {칸: 값})]). 머리 행 = header_cells 가 모두 있는 첫 행."""
    rows = {}
    for (r, c), v in sheet.items():
        rows.setdefault(r, {})[c] = v
    hr = next((r for r in sorted(rows) if all(any(str(x).replace(' ', '') == h.replace(' ', '') for x in rows[r].values())
                                               for h in header_cells)), None)
    if hr is None:
        return None, [], []
    cols = {c: str(v).strip() for c, v in rows[hr].items()}
    out = []
    for r in sorted(x for x in rows if x > hr):
        rec = {cols[c]: v for c, v in rows[r].items() if c in cols}
        if any(str(v).strip() for v in rec.values()):
            out.append((r + 1, rec))
    return hr, [cols[c] for c in sorted(cols)], out


def html_text(raw):
    """HTML → 태그·스크립트를 뺀 한 줄 글."""
    import html as _html
    t = re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->', ' ', raw, flags=re.S)
    return re.sub(r'\s+', ' ', _html.unescape(re.sub(r'<[^>]+>', ' ', t))).strip()


def pdf_text(path, max_pages):
    """PDF 앞 max_pages 쪽 텍스트 → [(쪽, 글)]."""
    reader = pypdf.PdfReader(p(path))
    return [(i + 1, reader.pages[i].extract_text() or '') for i in range(min(max_pages, len(reader.pages)))]


def read_csv_dicts_rows(path):
    """UTF-8(BOM) CSV → [(행 번호(머리 줄 = 1), 칸 dict)]."""
    with open(p(path), encoding='utf-8-sig', newline='') as f:
        return [(i + 2, r) for i, r in enumerate(csv.DictReader(f))]
