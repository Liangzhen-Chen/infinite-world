// kernelApi `report(code, fields)`（卷二 §2.7 kernelApi :630；§2.6"事务内拒写的处置"第 2 件 :501；§2.9 第 1 条登记出口表 report.mjs 行）：
// 日志与控制台的唯一出口，"按代号与数值写"——只收 ErrorCode 与只含代号、数值的字段，不收文字，不进 state，不进哈希。
// console 只许本文件用（§2.9 第 1 条全局对象白名单 kernel 行）；node:fs 追加写只许本文件、kernel/load/*、kernel/save.mjs（§2.7 import 矩阵 kernel 行）。
// 日志落到哪里由挂接时定（useReportSink）；未挂接时写到控制台。只按登记数据判，不认任何具体错误码或字段。

import { appendFileSync } from 'node:fs';
import { errorCodeOf, HandleError, CODE_RE } from './handles/vocab-handle.mjs';
import { REGISTERED_CODES } from './error-codes.mjs';

/** @typedef {null | boolean | number | string} FieldValue 代号（实体 id、句柄值、错误码）或数值；文字收不进来。 */
/** @typedef {{code: import('./types.d.ts').ErrorCode, fields: Readonly<Record<string, FieldValue>>}} ReportRecord */

/**
 * 字段核对：键是代号文法；值只许 null、布尔、有限数、代号（§1.9 :278 文法）或登记错误码。不合即 E-DIM-ID-FORMAT（非有限数 E-DET-NONFINITE）。
 * @param {unknown} fields
 * @returns {Record<string, FieldValue>} 按键名升序的新对象
 */
export function checkFields(fields) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) throw new HandleError('E-DIM-ID-FORMAT', 'report fields: want a plain object of codes and numbers');
  /** @type {Record<string, FieldValue>} */
  const out = {};
  for (const k of Object.keys(fields).sort()) {
    if (!CODE_RE.test(k)) throw new HandleError('E-DIM-ID-FORMAT', `report field name ${JSON.stringify(k)}: want ^[a-z][a-z0-9_]{1,47}$`);
    const v = fields[k];
    if (v === null || typeof v === 'boolean') { out[k] = v; continue; }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new HandleError('E-DET-NONFINITE', `report field ${k}: non-finite number`);
      out[k] = v; continue;
    }
    if (typeof v === 'string' && (CODE_RE.test(v) || REGISTERED_CODES.has(v))) { out[k] = v; continue; }
    throw new HandleError('E-DIM-ID-FORMAT', `report field ${k}: value must be null, boolean, finite number, code or error code`);
  }
  return out;
}

/** @type {(rec: ReportRecord) => void} */
const consoleSink = (rec) => { console.error(JSON.stringify(rec)); };
let sink = consoleSink;

/**
 * 挂接日志出口（kernel 挂接时调；kernel 组内用，不在 kernelApi）。不给参数即回到控制台。
 * @param {(rec: ReportRecord) => void} [next]
 * @returns {(rec: ReportRecord) => void} 原出口（便于恢复）
 */
export function useReportSink(next) {
  const prev = sink;
  sink = typeof next === 'function' ? next : consoleSink;
  return prev;
}

/**
 * 追加写日志文件的出口：每条一行 JSON（键名升序，确定）。路径由挂接时给。
 * @param {string} path
 * @returns {(rec: ReportRecord) => void}
 */
export function fileSink(path) {
  return (rec) => { appendFileSync(path, JSON.stringify(rec) + '\n'); };
}

/**
 * kernelApi `report(code, fields)`：码须是登记码（经 E 句柄来的值），字段只含代号与数值。记录冻结后交给出口。
 * @param {import('./types.d.ts').ErrorCode} code
 * @param {Record<string, FieldValue>} [fields]
 * @returns {ReportRecord}
 */
export function report(code, fields = {}) {
  const rec = Object.freeze({ code: errorCodeOf(code), fields: Object.freeze(checkFields(fields)) });
  sink(rec);
  return rec;
}
