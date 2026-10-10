'use strict';
/* 법정동코드 파일(공공데이터포털 15123287, 열: 법정동코드·법정동명·폐지여부)을 원장 areas 표 행으로 옮긴다.
   순수 함수다: 파일을 읽거나 쓰지 않는다. source_ref 는 넣지 않는다(변환기 convert.js 가 붙인다).
   존재 행만 돌려준다(폐지 행은 버린다). 단계는 코드 10자리로 가른다: 뒤 8자리 0 → SIDO, 뒤 5자리 0 → SGG(일반구도 SGG), 그 밖 → BJD. */

/* BOM·UTF-8·EUC-KR(CP949)을 모두 받는다. 유효하지 않은 UTF-8 이면 EUC-KR 로 푼다 */
function decode(buffer) {
  const buf = Buffer.from(buffer);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('euc-kr').decode(buf);
  }
}

/* 파일 이름 끝의 날짜(예 국토교통부_법정동코드_20260929.csv → 2026-09-29). 없으면 null */
function asOfFromName(fileName) {
  const m = /(\d{4})(\d{2})(\d{2})(?=\D*$)/.exec(String(fileName ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function levelRow(code, name) {
  if (/^\d{2}0{8}$/.test(code)) return { area_code: code.slice(0, 2), level: 'SIDO', area_name: name, parent_code: null };
  if (/^\d{5}0{5}$/.test(code)) return { area_code: code.slice(0, 5), level: 'SGG', area_name: name, parent_code: code.slice(0, 2) };
  return { area_code: code, level: 'BJD', area_name: name, parent_code: code.slice(0, 5) };
}

function parseLegalDong(buffer, fileName) {
  const text = decode(buffer).replace(/^﻿/, '');
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cut = line.split(',').map((c) => c.trim());
    if (!/^\d{10}$/.test(cut[0])) continue; // 머리글 행
    const [code, name, state] = cut;
    if (state !== '존재') continue;
    if (!name) throw new Error(`법정동명이 비었다: ${code}`);
    rows.push(levelRow(code, name));
  }
  return { asOf: asOfFromName(fileName), rows };
}

module.exports = { parseLegalDong };
