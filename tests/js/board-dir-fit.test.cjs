/* 종합상황판 총리 지시 카드 6장: 내용이 카드에서 넘치거나 끝에 붙지 않게(2026-10-16 5차) — 소스 구조 시험 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const board = fs.readFileSync(path.join(__dirname, '../../components/board/Board.tsx'), 'utf8');
const btn = board.slice(board.indexOf('data-slot="board-dir" title='), board.indexOf('</button>', board.indexOf('data-slot="board-dir" title=')));
const cls = btn.match(/className=\{cn\(btn, '([^']*)'/)[1];

test('카드 단추: 위아래 여백이 있고 내용을 잘라 숨기지 않으며 내용만큼 자란다', () => {
  assert.match(cls, /\bpy-2\.5\b/, '세로 안쪽 여백 10px');
  assert.match(cls, /\bmin-h-20\b/);
  assert.doesNotMatch(cls, /\boverflow-hidden\b/, '카드 단추는 넘친 내용을 자르지 않는다');
  assert.doesNotMatch(cls, /(^| )h-20 |\bmax-h-/, '고정·최대 높이 없음');
  assert.match(btn, /<span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-\[inherit\]"><span className="absolute bottom-0 left-0 h-\[3px\]/, 'overflow-hidden 은 진행 막대 장식 틀에만');
  const pair = board.slice(board.indexOf('data-slot="board-dir-pair"'), board.indexOf('</div>', board.indexOf('data-slot="board-dir-pair"')));
  assert.doesNotMatch(pair, /overflow-hidden/);
  assert.match(pair, /\bpy-2\.5\b/);
});

test('1번 카드: 제목 / 작은 줄(원천 꼬리 · 기간 한 줄) / 값 줄 세 틀', () => {
  assert.match(board, /const small = \[x\.tag, x\.note\]\.filter\(Boolean\);/);
  assert.match(board, /data-slot="dir-tag"[^>]*>\{small\.map\(\(t, k\) => <span key=\{k\} className="whitespace-nowrap">\{t\}\{k < small\.length - 1 \? ' · ' : ''\}<\/span>\)\}/);
  assert.doesNotMatch(board, /data-slot="dir-note"/, '기간은 값 줄이 아니라 작은 줄');
});

test('목록 링크는 제목을 밀어내지 않는다: 고정 pr-[112px]/pr-[72px] 없음, 링크는 오른쪽 아래, 값 줄 끝에 같은 글자 자리표', () => {
  assert.doesNotMatch(board, /pr-\[112px\]|pr-\[72px\]/);
  assert.match(board, /<span className="block pr-8 text-\[min\(14px,8\.5cqi\)\]/, '제목은 (i) 자리(pr-8)만 비운다');
  assert.match(board, /data-slot="dir-list-gap" className=\{cn\(dirListText, 'invisible ml-auto'\)\} aria-hidden="true">\{x\.list\.text \?\? '목록'\}/);
  const link = board.slice(board.indexOf('data-slot="board-dir-list"'), board.indexOf('</Link>', board.indexOf('data-slot="board-dir-list"')));
  assert.match(link, /absolute right-3\.5 bottom-\[11px\]/);
  assert.doesNotMatch(link, /\btop-/);
  assert.match(link, /\{x\.list\.text \?\? '목록'\}/, '링크 글자(무엇이 열리는지)는 그대로');
});

test('일정 지연 관리 두 숫자: 위아래 두 줄, 글자 13px 이상(cqi 로 더 줄지 않음)', () => {
  assert.match(board, /const pairRow = 'flex min-w-0 flex-col items-start/);
  const pv = board.slice(board.indexOf('function pairVals'), board.indexOf('/* 지시 카드 윗줄'));
  assert.doesNotMatch(pv, /min\(1[0-2]px|text-\[min\(1[0-9]px,\d+cqi\)\]/, '13px 아래로 줄어드는 크기 없음');
  assert.match(pv, /text-\[13px\] font-bold/);
  assert.match(pv, /text-\[max\(13px,min\(15px,7cqi\)\)\]/);
  assert.doesNotMatch(pv, /aria-hidden="true">·<\/span>/, '가운데 점 없음');
});
