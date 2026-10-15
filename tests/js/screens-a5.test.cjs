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
test('A5-2 인쇄에서 9·7 단계표는 한 번(첫 칸 유지, 정책 목표 대비에서 같은 정책 행 제외)', () => {
  const s = read('app/(dashboard)/projects/page.tsx');
  assert.match(s, /const cmpLines = print && whole\?\.stages \? lines\.filter\(\(l\) => l\.policy\.key !== \(f\.policy \? f\.policy\.key : '97'\)\) : lines/);
  assert.match(s, /<PolicyCompare lines=\{cmpLines\}/);
});
test('A5-3 말줄임(truncate) 되는 핵심 질문 글에 전체 글 title', () => {
  const s = read('components/projects/Summary.tsx');
  assert.match(s, /className="truncate" title=\{x\.q\}/);
  assert.match(s, /tabular-nums" title=\{x\.sub\}>\{x\.sub\}/);
});
test('A5-4 단계별 진행 머리는 사업 원장 출처·단위를 이름으로', () => {
  assert.match(read('components/projects/Summary.tsx'), />사업 원장 · 이 단계까지 온 사업\(호\) · \{scope\}</);
});
