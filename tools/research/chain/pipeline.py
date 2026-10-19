#!/usr/bin/env python3
"""오케스트레이터: 설정(config/pipeline.json)의 단계를 차례로 하위 프로세스로 돌리고 단계마다 시간·결과·출력 해시를 보인다.

    python3 tools/research/chain/pipeline.py [--network] [--only 단계,단계] [--policy <policy_id|slug>] [--xlsx 관리표.xlsx]

기본은 오프라인 단계 전부(저장된 원본·캐시만 읽음). --network 는 네트워크 단계(발견·후속·고시 조회)를 먼저 돌린다(기본 끔).
새 정책 후보는 policies_discovered.json 에만 쌓이고 policies.json 은 고치지 않는다(사람이 확인해 옮긴다).
--only 는 단계 id(쉼표 구분)만 돌린다. --policy 는 policy_args 가 있는 단계만 그 정책으로 좁힌다.
한 단계라도 실패하면 거기서 멈춘다(종료 코드 1). 단계 목록·인자·인터프리터 옵션은 설정에만 있다.
출력 해시: 감시 폴더(watch)에서 그 단계가 쓴 파일(수정 시각·크기가 바뀐 것)의 sha256 을 다시 계산해
쓴 파일 수·내용이 바뀐 수·새 파일·지운 파일과, 쓴 파일 전체(경로·sha256)의 요약 해시를 보인다.
"""
import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
import subprocess
import sys
import time
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CONFIG = os.path.join(HERE, 'config', 'pipeline.json')


def load_json(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return json.load(f)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


class Values:
    """인자 속 {이름} 값. 쓰일 때 한 번만 정한다."""

    def __init__(self, spec, policy_id, xlsx):
        self.spec, self.cache = spec, {}
        if policy_id:
            self.cache['policy_id'] = policy_id
        if xlsx:
            self.cache['inventory_xlsx'] = os.path.abspath(os.path.expanduser(xlsx))
        self.private = {k for k, v in spec.items() if v.get('private')}

    def get(self, name):
        if name in self.cache:
            return self.cache[name]
        s = self.spec.get(name)
        if s is None:
            raise SystemExit('설정 values 에 없는 이름: {%s}' % name)
        if 'from_json' in s:
            v = load_json(s['from_json'])
            for k in s['path']:
                v = v[k]
        elif s.get('today'):
            v = dt.date.today().isoformat()
        elif 'find_file' in s:
            d = os.path.expanduser(s['find_file'])
            hits = sorted(f for f in os.listdir(d) if fnmatch.fnmatch(unicodedata.normalize('NFC', f), s['pattern']))
            if len(hits) != 1:
                raise SystemExit('{%s}: %s 에서 %s 와 맞는 파일이 %d개(1개여야 함). --xlsx 로 정한다' % (name, s['find_file'], s['pattern'], len(hits)))
            v = os.path.join(d, hits[0])
        else:
            raise SystemExit('values.%s 의 모양을 모른다' % name)
        self.cache[name] = str(v)
        return self.cache[name]

    def fill(self, args):
        out = []
        for a in args:
            while '{' in a and '}' in a[a.index('{'):]:
                i = a.index('{')
                j = a.index('}', i)
                a = a[:i] + self.get(a[i + 1:j]) + a[j + 1:]
            out.append(a)
        return out

    def shown(self, name):
        v = self.get(name)
        if name in self.private:
            return 'sha256 %s…' % sha256_file(v)[:12] if os.path.exists(v) else '(없음)'
        return v


class Watch:
    """감시 폴더의 {상대 경로: (mtime_ns, size, sha256)}."""

    def __init__(self, roots, ignore):
        self.roots, self.ignore, self.state = roots, set(ignore), {}

    def scan(self):
        cur = {}
        for r in self.roots:
            for d, dirs, fs in os.walk(os.path.join(ROOT, r)):
                dirs[:] = sorted(x for x in dirs if x not in self.ignore)
                for f in fs:
                    if f in self.ignore:
                        continue
                    a = os.path.join(d, f)
                    st = os.stat(a)
                    cur[os.path.relpath(a, ROOT)] = (st.st_mtime_ns, st.st_size)
        return cur

    def start(self):
        self.state = {k: v + (sha256_file(os.path.join(ROOT, k)),) for k, v in self.scan().items()}

    def diff(self):
        cur, new_state = self.scan(), {}
        written, changed, added = [], 0, 0
        for k, ms in cur.items():
            old = self.state.get(k)
            if old and old[:2] == ms:
                new_state[k] = old
                continue
            sha = sha256_file(os.path.join(ROOT, k))
            new_state[k] = ms + (sha,)
            written.append((k, sha))
            added += old is None
            changed += old is not None and old[2] != sha
        removed = sorted(set(self.state) - set(cur))
        self.state = new_state
        digest = hashlib.sha256(''.join('%s %s\n' % kv for kv in sorted(written)).encode()).hexdigest()
        return {'written': len(written), 'changed': changed, 'added': added, 'removed': len(removed), 'digest': digest}


def pick_policy(arg):
    pols = load_json('tools/research/chain/config/policies.json')['policies']
    for p in pols:
        if arg in (p['policy_id'], p['slug']):
            return p['policy_id']
    raise SystemExit('config/policies.json 에 없는 정책: %s (있는 것: %s)' % (arg, ', '.join(p['policy_id'] for p in pols)))


def discovered_count():
    try:
        d = load_json('tools/research/chain/config/policies_discovered.json')
    except (OSError, ValueError):
        return None
    return len(d.get('candidates', []))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--network', action='store_true', help='네트워크 단계(발견·후속·고시 조회)를 먼저 돌린다')
    ap.add_argument('--only', help='돌릴 단계 id(쉼표 구분)')
    ap.add_argument('--policy', help='policy_id 또는 slug')
    ap.add_argument('--xlsx', help='팀 수집 관리표 경로(없으면 설정의 find_file 로 찾음)')
    ap.add_argument('--config', default=CONFIG)
    a = ap.parse_args(argv)
    with open(a.config, encoding='utf-8') as f:
        cfg = json.load(f)
    net, off = cfg['network_stages'], cfg['stages']
    stages = (net if a.network else []) + off
    if a.only:
        want = [x.strip() for x in a.only.split(',') if x.strip()]
        known = {s['id'] for s in net + off}
        bad = [x for x in want if x not in known]
        if bad:
            raise SystemExit('모르는 단계: %s (있는 것: %s)' % (', '.join(bad), ', '.join(s['id'] for s in net + off)))
        skipped_net = [x for x in want if x in {s['id'] for s in net} and not a.network]
        if skipped_net:
            raise SystemExit('네트워크 단계 %s 는 --network 와 함께만 돈다' % ', '.join(skipped_net))
        stages = [s for s in stages if s['id'] in want]
    pid = pick_policy(a.policy) if a.policy else None
    vals = Values(cfg.get('values', {}), pid, a.xlsx)

    plan = []
    for s in stages:
        tmpl = s['policy_args'] if pid and s.get('policy_args') is not None else s['args']
        plan.append((s, tmpl, [sys.executable] + s['python_flags'] + [os.path.join(ROOT, s['script'])] + vals.fill(tmpl)))
    print('파이프라인: %d단계%s%s' % (len(plan), ' · 네트워크 포함' if a.network else ' · 오프라인', ' · 정책 %s' % pid if pid else ''))
    for name in sorted({n for _s, t, _c in plan for x in t for n in names_in(x)}):
        print('  {%s} = %s' % (name, vals.shown(name)))
    if a.network:
        print('알림: 새 정책 후보는 config/policies_discovered.json 에만 쌓인다. config/policies.json 은 자동으로 고치지 않는다 — '
              '사람이 후보의 원 게시물·발행기관을 확인한 뒤 옮긴다.')

    watch = Watch(cfg.get('watch', []), cfg.get('watch_ignore', []))
    t0 = time.time()
    watch.start()
    print('감시 폴더 해시 %d개 (%.1fs)' % (len(watch.state), time.time() - t0))
    results = []
    for s, tmpl, cmd in plan:
        shown = ' '.join(['python3'] + s['python_flags'] + [s['script']] + tmpl)
        print('\n▶ %s — %s\n  %s' % (s['id'], s['name'], shown), flush=True)
        before = discovered_count() if s['id'] == 'discover' else None
        t = time.time()
        r = subprocess.run(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        sec = time.time() - t
        lines = r.stdout.rstrip('\n').split('\n') if r.stdout.strip() else []
        w = watch.diff()
        ok = r.returncode == 0
        for x in lines[-(40 if not ok else 4):]:
            print('  │ ' + x)
        print('  %s %.1fs · 쓴 파일 %d(내용 바뀜 %d · 새 파일 %d) · 지운 파일 %d · 출력 해시 %s' % (
            '성공' if ok else '실패(종료 코드 %d)' % r.returncode, sec, w['written'], w['changed'], w['added'], w['removed'], w['digest'][:16]))
        if before is not None:
            after = discovered_count()
            print('  발견 후보 %s → %s (policies_discovered.json). policies.json 은 그대로다.' % (before, after))
        results.append((s['id'], ok, sec, w))
        if not ok:
            break
    print('\n요약')
    print('  %-14s %-6s %8s %6s %6s %s' % ('단계', '결과', '시간(s)', '쓴', '바뀜', '출력 해시'))
    for sid, ok, sec, w in results:
        print('  %-14s %-6s %8.1f %6d %6d %s' % (sid, '성공' if ok else '실패', sec, w['written'], w['changed'], w['digest'][:16]))
    print('  합계 %.1fs' % sum(x[2] for x in results))
    if not all(x[1] for x in results):
        sys.exit(1)


def names_in(arg):
    out, i = [], arg.find('{')
    while i >= 0:
        j = arg.find('}', i)
        if j < 0:
            break
        out.append(arg[i + 1:j])
        i = arg.find('{', j)
    return out


if __name__ == '__main__':
    main()
