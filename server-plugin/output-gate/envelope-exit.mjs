// 下行出口 respond（卷二 §2.9 第 0 条"已筛信封"第 1–3 步、通路第 4、5 环、"违例"E-TEXT-EXIT；卷二十九 R29-7.4；体检 K6-81、K6-82，6-17 改一轮）。
// 唯一的下行出口：respond(reply, payload) 把 payload 里每个 Screened<Text> 字段经 textcore release 取出字串、算 sha256 摘要，写成信封 {screenId, text, digest}，
// 整个响应 JSON.stringify 后只经 ReplyCap 的 send 发出（send 对句柄一次一用，核对在 ReplyCap 一侧，router-caps 随 6-19）。
// Screened 只由 gate/screen.mjs 产出（本文件不造、不改字、不取段、不替换；替换裁决在 redact.mjs）；release 遇到非 Screened 即 E-TEXT-EXIT，一个字节都不发。
// 载荷只收白名单字段：顶层 responseId、result、rejects、lines；每行 seq、tpl、speaker、seg、stored、untranslated、gate、text（text 必须是 Screened 或 null）。
// 白名单外的字段一律 E-TEXT-EXIT：载荷里没有第二个放字串的位置。

import { release } from '../textcore/release.mjs';
import { digestHex } from '../textcore/digest.mjs';
import { VERDICT, fail } from './enums.mjs';

const PAYLOAD_KEYS = ['responseId', 'result', 'rejects', 'lines'];
const LINE_KEYS = ['seq', 'tpl', 'speaker', 'seg', 'stored', 'untranslated', 'gate', 'text'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 造出口。replyCap 是 ReplyCap 结构 {send(handle, body)}（卷二 :989 能力对象；router-caps 建，经装配注入）。
 * 输出响应体 {responseId, result, rejects, envelopeCount, envelopes:[{screenId, text, digest}], lines:[{…, env, text 已去}]}，
 * screenId = "<responseId>:<序号>"，序号从 0 起。
 * @param {{send: (handle: object, body: string) => unknown}} replyCap
 */
export function createEnvelopeExit(replyCap) {
  if (!isObj(replyCap) || typeof replyCap.send !== 'function') fail('E_TEXT_EXIT', 'ReplyCap.send required');
  return Object.freeze({
    respond(reply, payload) {
      if (!isObj(payload) || Object.keys(payload).some((k) => !PAYLOAD_KEYS.includes(k))) fail('E_TEXT_EXIT', 'payload field outside the whitelist');
      if (!Number.isInteger(payload.responseId) || payload.responseId < 1) fail('E_WIRE_REPLY', 'payload.responseId');
      const lines = payload.lines === undefined ? [] : payload.lines;
      if (!Array.isArray(lines)) fail('E_TEXT_EXIT', 'lines');
      const envelopes = [];
      const outLines = lines.map((line, i) => {
        if (!isObj(line) || Object.keys(line).some((k) => !LINE_KEYS.includes(k))) fail('E_TEXT_EXIT', `lines[${i}] field outside the whitelist`);
        const { text, ...rest } = line;
        if (text === null || text === undefined) return { ...rest, env: null };
        const raw = release(text);
        const n = envelopes.length;
        envelopes.push({ screenId: `${payload.responseId}:${n}`, text: raw, digest: digestHex(raw) });
        return { ...rest, env: n, gate: rest.gate === undefined || rest.gate === VERDICT.pass ? null : rest.gate };
      });
      const { lines: dropped, ...others } = payload;
      const body = JSON.stringify({ ...others, lines: outLines, envelopeCount: envelopes.length, envelopes });
      return replyCap.send(reply, body);
    },
  });
}
