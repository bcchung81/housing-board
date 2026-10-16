const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');

test('A5-1 지역 지도 안내 문장은 지도 위 글이 아니라 ⓘ 도움말', () => {
  const s = read('components/region/Ahead.tsx');
  assert.doesNotMatch(s, /pointer-events-none absolute top-2 right-3[^>]*>원을 누르면/);
  assert.match(s, /<InfoTip label="지도 보는 법"[^>]*>.*원을 누르면\(키보드는 Enter\)/);
});
test('A5-2 9·7 단계표는 한 번(화면·인쇄 모두 — 첫 칸 유지, 정책 목표 대비 접힘에서 같은 정책 행 제외)', () => {
  const s = read('app/(dashboard)/projects/page.tsx');
  assert.match(s, /const cmpLines = whole\?\.stages \? lines\.filter\(\(l\) => l\.policy\.key !== \(f\.policy \? f\.policy\.key : '97'\)\) : lines/);
  assert.match(s, /<PolicyCompare lines=\{cmpLines\}/);
});
test('A5-3 말줄임(truncate) 되는 핵심 질문 글에 전체 글 title', () => {
  const s = read('components/projects/Summary.tsx');
  assert.match(s, /className="line-clamp-2 \[word-break:keep-all\]" title=\{x\.q\}/, 'r4-screens 3: 말줄임 대신 두 줄 + 전체 글 title');
  assert.match(s, /tabular-nums" title=\{x\.sub\}>\{x\.sub\}/);
});
test('A5-4 단계별 진행의 출처·범위는 원장 요약 카드 머리의 범위 칩(사업 원장)으로 — 단계별 진행 머리에 같은 표지를 되풀이하지 않는다', () => {
  assert.doesNotMatch(read('components/projects/Summary.tsx'), />사업 원장 · 이 단계까지 온 사업/);
  assert.match(read('app/(dashboard)/projects/page.tsx'), /<ScopeChip scope=\{region\} source="사업 원장"/);
});
