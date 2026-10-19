'use strict';
// 시험 도우미(시험 파일 아님): 지도 스크립트(assets/js/app.js)가 maplibre 에 칠하는 색을 테마별 실제 값으로 푼다(2026-10-18 화면 통일 ⓕ).
// app.js 의 TOKEN·tokOf·buildTheme 를 그대로 떼어, 브라우저의 계산된 스타일 대신 globals·app.css 를 겹친 값(map-tokens.cjs mapVars)으로 돌린다.
//   mapTheme('dark' | 'light') → { bg, text, …, color: { plan… }, tone, fac, … }
//   themeTokens(theme) → Map(토큰 이름 → 그 테마 값): buildTheme 이 읽은 이름 전부
const fs = require('node:fs');
const path = require('node:path');
const { mapVars } = require('./map-tokens.cjs');

const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'assets/js/app.js'), 'utf8');
const grab = (re) => { const m = re.exec(APP); if (!m) throw new Error(`app.js 에서 찾지 못함: ${re}`); return m[0]; };
const SRC = [grab(/const TOKEN = [^\n]+\n/), grab(/function tokOf\([\s\S]*?\n\}\n/), grab(/function buildTheme\([\s\S]*?\n\}\n/)].join('');
const M = Function('window', `${SRC}; return { tokOf, buildTheme };`)({});

function themeTokens(theme) {
  const V = mapVars({ theme }), light = theme === 'light', tok = M.tokOf({ getPropertyValue: (n) => V[n] ?? '' }), used = new Map();
  M.buildTheme(light, (n) => { const v = tok(n); used.set(n, v); return v; });
  return used;
}
const mapTheme = (theme) => { const V = mapVars({ theme }), light = theme === 'light'; return M.buildTheme(light, M.tokOf({ getPropertyValue: (n) => V[n] ?? '' })); };

module.exports = { mapTheme, themeTokens };
