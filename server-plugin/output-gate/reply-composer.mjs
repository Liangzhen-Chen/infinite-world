// 回应通道第 3、4 环的订阅者：收 kernel 交来的 ReplyResult，拼成下行载荷交 envelope-exit（卷二 §2.9 第 0 条通路表第 3、4 环、"各环的规矩"第 4 环；
// 卷二十九 §4.7.2 :775、R29-7.1、R29-7.4、R29-7.11；体检 K6-81、K6-82，6-17 最小版与改一轮）。
// 只在 postReply 交来结果之后才动，所以只显示已结算的事实：本文件不拿 state、不调任何读入口，输入只有 ReplyResult（代号、id 与数值）。
// 文字全由 templates.mjs 按回执代号渲染（notice：回执的动作代号；refusal：失败回执的错误码与拒收代号；dialogue：决定卡代号），不解析任何文字；
// 没有模板时回落 labelText（显示名，缺译则代号本身并标未译，R29-1.6），所以每个回执都有一行。每个文字都过 redact（screen 与替换裁决）才进载荷。
// 块 6 无 AI（aiGate 不建）：不调 NarrateCap，叙述一律 T0 模板。mountOutput 在 output-gate/mount.mjs（卷二 groupApi :683）。
// 面板与节点树（panel-composer.mjs、composeScreen）块 6 后面的卡再建，不在本最小版。

import { onReply } from '../kernel/transport/reply-channel.mjs';
import { labelText, renderTpl } from './templates.mjs';
import { FORM, KIND, RESULT, SEGMENT } from './enums.mjs';

// 封闭枚举值的显示名键是"枚举名、一个点、值"（卷二十九 :250）。
const RESULT_KEY_PREFIX = 'reply_result.';

/**
 * 造订阅函数。deps：envelopeExit（createEnvelopeExit 的产出）、redact（createRedactor 的产出）、display（displayData 的产出）、
 * labels 与 templates（textcore labels 的产出：names、templates）。
 * @param {{envelopeExit: {respond: (handle: object, payload: object) => unknown}, redact: (text: object) => {screened: object, verdict: string}, display: any, labels: ReadonlyMap<string, ReadonlyMap<string, object>>, templates: ReadonlyMap<string, ReadonlyMap<string, unknown>>}} deps
 * @returns {(handle: object, result: any, responseId: number) => unknown}
 */
export function createReplyComposer(deps) {
  const { envelopeExit, redact, display, labels, templates } = deps;
  if (!envelopeExit || typeof envelopeExit.respond !== 'function' || typeof redact !== 'function') throw new TypeError('createReplyComposer: envelopeExit and redact required');

  return function compose(handle, result, responseId) {
    const ctx = { display, labels, templates, seq: 0 };
    const lines = [];
    // 一行：模板渲染，没有模板回落到显示名再到代号；过显示闸后进载荷。
    // 轮换序号取行序号：R29-2.3 写"输入里的序号（事件的 id 序号，没有事件的取本次响应的行序号）"，回执形状（卷九 :294）里没有事件序号字段，
    // 内核也没给从 EventId 取序号的出口，所以只用行序号；事件 id 序号的出口等李白（问题.md）。
    const line = (kind, key, input, seg, speaker, fallbackKey) => {
      ctx.seq = lines.length;
      const t = renderTpl(kind, key, input, ctx);
      const label = t === null ? labelText(fallbackKey, FORM.label, ctx) : null;
      const gated = redact(t === null ? label.text : t.text);
      lines.push({
        seq: lines.length, tpl: t === null ? null : t.templateId, speaker, seg, stored: false,
        untranslated: t === null ? label.untranslated : t.untranslated, gate: gated.verdict, text: gated.screened,
      });
    };

    const rejects = [];
    if (result.rejectCode !== undefined && result.rejectCode !== null) {
      rejects.push(result.rejectCode);
      line(KIND.refusal, result.rejectCode, { code: result.rejectCode }, SEGMENT.narration, null, result.rejectCode);
    }
    // 回执：成功的（code 为空）讲动作；失败的（带 code 与 stage）讲拒因，不讲动作（动作没发生，不是已结算的事实）。
    for (const r of Array.isArray(result.receipts) ? result.receipts : []) {
      if (r.code === null || r.code === undefined) line(KIND.notice, r.actionId, { receipt: r }, SEGMENT.narration, null, r.actionId);
      else line(KIND.refusal, r.code, { receipt: r, code: r.code }, SEGMENT.narration, null, r.code);
    }
    // 决定卡：台词按决定卡代号走模板（不开 AI 时的路径，卷二"菜单回合的叙述与对白"第 3 条）。
    for (const c of Array.isArray(result.cards) ? result.cards : []) {
      line(KIND.dialogue, c.card, { card: c }, SEGMENT.dialogue, c.speaker, c.card);
    }
    // 存档不可用等状态代号：只在没有别的行时以结果代号的显示名交代；ok 与 received 不出行。
    if (lines.length === 0 && result.resultCode !== RESULT.ok && result.resultCode !== RESULT.received) {
      const key = `${RESULT_KEY_PREFIX}${result.resultCode}`;
      line(KIND.notice, key, { result }, SEGMENT.narration, null, key);
    }

    return envelopeExit.respond(handle, { responseId, result: result.resultCode, rejects, lines });
  };
}

/**
 * 把订阅函数登记给 kernel 回应通道（恰登记一次，二次登记 kernel 报 E-WIRE-REPLY）。由 output-gate/mount.mjs 的 mountOutput 调用。
 * @param {Parameters<typeof createReplyComposer>[0]} deps 同 createReplyComposer
 * @returns {void}
 */
export function registerComposer(deps) {
  onReply(createReplyComposer(deps));
}
