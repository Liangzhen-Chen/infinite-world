// L0 语法（卷二 §4.1）：JSON 可解析且无重复键，逐字符扫描。结构由本文件扫描，标量文本交给 JSON.parse 解码。
// 返回 {value, errors}；errors 每项 {code, pointer, got, want}，pointer 为 JSON 指针。
// JSON 文法记号（`{ } [ ] , : " \` 与空白字符）是语言与文法常量，出处见卷二 §7 S13 上下文白名单 :2413 (d)（李白 11-18 13:05 裁定第 2 条），
// 不计第 ④ 类。

import { escapeJsonPointer, jsonScalarAt } from './vocab-load.mjs';
import { GRAMMAR_TOKENS as G } from '../handles/markers.mjs';

const WS = new Set([G.jsonSpace, G.jsonTab, G.jsonLf, G.jsonCr]);
const escPtr = escapeJsonPointer;

/** @param {string} text JSON 文本 */
export function parseJsonStrict(text) {
  const errors = [];
  let i = 0;
  const n = text.length;
  const ws = () => { while (i < n && WS.has(text[i])) i++; };
  class Stop extends Error {}
  const bad = (pointer, want) => { errors.push({ code: 'E-DIM-DUPLICATE-KEY', pointer, got: text.slice(i, i + 1) || 'end of text', want, syntax: true }); throw new Stop(); };

  function str(pointer) {
    const start = i;
    i++;
    while (i < n && text[i] !== G.jsonQuote) { if (text[i] === G.jsonEscape) i++; i++; }
    if (i >= n) bad(pointer, 'closing quote');
    i++;
    return JSON.parse(text.slice(start, i));
  }
  function scalar(pointer) {
    const r = jsonScalarAt(text, i);
    if (!r) bad(pointer, 'JSON value');
    i = r.end;
    return JSON.parse(r.raw);
  }
  function value(pointer) {
    ws();
    const c = text[i];
    if (c === G.jsonObjOpen) {
      i++;
      const out = {};
      const seen = new Set();
      ws();
      if (text[i] === G.jsonObjClose) { i++; return out; }
      for (;;) {
        ws();
        if (text[i] !== G.jsonQuote) bad(pointer, 'object key');
        const key = str(pointer);
        const p = `${pointer}/${escPtr(key)}`;
        if (seen.has(key)) errors.push({ code: 'E-DIM-DUPLICATE-KEY', pointer: p, got: key, want: 'unique key' });
        seen.add(key);
        ws();
        if (text[i] !== G.jsonColon) bad(p, ':');
        i++;
        const v = value(p);
        Object.defineProperty(out, key, { value: v, enumerable: true, writable: true, configurable: true });
        ws();
        if (text[i] === G.jsonComma) { i++; continue; }
        if (text[i] === G.jsonObjClose) { i++; return out; }
        bad(p, ', or }');
      }
    }
    if (c === G.jsonArrOpen) {
      i++;
      const out = [];
      ws();
      if (text[i] === G.jsonArrClose) { i++; return out; }
      for (;;) {
        out.push(value(`${pointer}/${out.length}`));
        ws();
        if (text[i] === G.jsonComma) { i++; continue; }
        if (text[i] === G.jsonArrClose) { i++; return out; }
        bad(pointer, ', or ]');
      }
    }
    if (c === G.jsonQuote) return str(pointer);
    return scalar(pointer);
  }
  let result;
  try {
    result = value('');
    ws();
    if (i < n) bad('', 'end of text');
  } catch (e) {
    if (!(e instanceof Stop)) {
      errors.push({ code: 'E-DIM-DUPLICATE-KEY', pointer: '', got: String(e.message), want: 'valid JSON', syntax: true });
    }
    return { value: undefined, errors };
  }
  return { value: result, errors };
}
