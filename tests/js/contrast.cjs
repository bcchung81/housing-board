'use strict';
/* 글자·면 대비(WCAG 상대 휘도) 도우미 — tailwind.test.cjs 와 warm-scope.test.cjs 가 같이 쓴다. #RRGGBB 만 받는다 */
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
module.exports = { lum, ratio };
