const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const board = fs.readFileSync(path.join(root, 'components/board/Board.tsx'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/board/home-board.json'), 'utf8'));

/* 2026-10-21 사용자 지시: 기관별 진행현황에 기관 미상 및 비중이 없는 경우는 그룹핑 — Board.tsx 와 같은 규칙 */
const group = (agencies) => {
  const zero = agencies.filter((a) => a.projects && !a.delayUnits);
  return zero.length >= 2 ? { zero, units: zero.reduce((n, a) => n + a.units, 0), unknown: zero.some((a) => a.id === 'unknown') } : null;
};

test('Board.tsx: HOME 일 때만, 지연 0호 기관이 2곳 이상일 때 한 줄로 묶고 이름 두 가지', () => {
  assert.match(board, /zero = H \? all\.filter\(\(a\) => !a\.delayUnits\) : \[\]/);
  assert.match(board, /zero\.length >= 2/);
  assert.match(board, /'기관 미상·지연 없음' : '지연 없음'/);
  assert.match(board, /key: 'grouped'/);
  assert.match(board, /지연이 없는 기관\(기관 미상 포함\)은 한 줄로 묶습니다\(2곳 이상일 때\)/);
});

test('home-board.json: 지역별 묶음 대상·호수 합', () => {
  const names = (g) => g.zero.map((a) => a.id).sort();
  const all = group(data.agencies);
  assert.ok(all && all.unknown);
  assert.equal(all.zero.length, 6);
  assert.equal(all.units, 57623);
  assert.equal(all.zero.filter((a) => a.id === 'unknown')[0].units, 40549);
  const gi = group(data.byRegion['28'].agencies);
  assert.equal(gi.zero.length, data.byRegion['28'].agencies.filter((a) => a.projects).length, '인천 = 전부 묶음');
  assert.equal(gi.zero.length, 3);
  for (const k of ['11', '41']) {
    const g = group(data.byRegion[k].agencies);
    assert.ok(g, k);
    assert.ok(g.unknown, k);
    assert.ok(!names(g).includes('LH'), 'LH 는 지연이 있어 따로 한 줄');
  }
  assert.deepEqual(names(group(data.byRegion['41'].agencies)).length, 2, '경기 = 기관 미상·GH');
});
