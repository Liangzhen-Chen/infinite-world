// T0 模板引擎：labelText 与 renderTpl（卷二十九 §3.1 表 :424–:425、R29-1.6 回落、R29-2.2 选模板只看代号、R29-2.3 选变体、R29-2.4 填槽位、R29-2.6 条件只读槽位值；体检 K6-82）。
// 规则层不拼文字；文字只在这里由 labels（代号 → 形态 → Text）与模板文本（模板代号 → 变体代号 → 段列表）拼出，拼接只经 textcore concatText，
// 整数成十进制数字只经 textcore intDigits（卷二 :876 outputGate 闭集），选哪个模板、哪个变体全按代号与数值（显示选择器 select.mjs），本文件不解析任何文字。
// 块 6 最小版的边界（挂卡写进回报）：槽位只做 ref（显示名，按槽位 form）与 num（非负整数，按位数字，不做显示语言行的数字分组、不做负号与定点数）；
// qty、time、dur、bearing、dist、list、stored、sub 与选择结构需要单位表、历法、片段与 readSealed 等未建设施，用到它们的变体视为不可填，作废并落到下一变体、再落到兜底，不编文字；
// 主键上位链（R29-2.2 表）需各卷登记，块 6 只走"本代号 → 该 kind 兜底"两步。
// 显示档 RX 建好后，变体 when 读的是本行已填槽位的值（bindings = {slot: 槽位名 → 值}），本文件已按此交值，不是占位。

import { concatText, intDigits } from '../textcore/ops.mjs';
import { codeText } from '../textcore/labels.mjs';
import { selectRows } from './select.mjs';
import { FORM, FILL } from './enums.mjs';

/**
 * 取显示名（R29-1.6）：有该形态用该形态；没有用同条目的 label；条目也没有就以代号本身显示并标未译。只在同一语言内回落。
 * @param {string} code
 * @param {string} form label_form 的值
 * @param {{labels: ReadonlyMap<string, ReadonlyMap<string, object>>}} ctx
 * @returns {{text: object, untranslated: boolean}}
 */
export function labelText(code, form, ctx) {
  const forms = ctx.labels.get(code);
  if (forms !== undefined && forms.has(form)) return { text: forms.get(form), untranslated: false };
  if (forms !== undefined && forms.has(FORM.label)) return { text: forms.get(FORM.label), untranslated: false };
  return { text: codeText(code), untranslated: true };
}

const hasOwn = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isSlotRef = (seg) => seg !== null && typeof seg === 'object' && typeof seg.s === 'string';

/** 按 source 路径（点号分段）从 input 取值；任一段不是自有字段即 undefined。 */
function pick(input, source) {
  let cur = input;
  for (const seg of source.split('.')) {
    if (!hasOwn(cur, seg)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** 填一个槽位的 Text；填不了（缺值、类型不对、未建的 fill_kind）返回 undefined。 */
function fillSlot(slot, raw, ctx, flags) {
  if (raw === undefined || raw === null) return undefined;
  if (slot.kind === FILL.ref) {
    if (typeof raw !== 'string') return undefined;
    const r = labelText(raw, slot.form === null ? FORM.label : slot.form, ctx);
    if (r.untranslated) flags.untranslated = true;
    return r.text;
  }
  if (slot.kind === FILL.num) return Number.isSafeInteger(raw) && raw >= 0 ? intDigits(raw, 0) : undefined;
  return undefined;
}

/** 一个变体的段列表拼成 Text；引用了填不了的槽位、遇到选择结构或未知段形状即返回 undefined（变体作废）。 */
function assemble(segments, slots, values, ctx, flags) {
  if (!Array.isArray(segments)) return undefined;
  const parts = [];
  for (const seg of segments) {
    if (!isSlotRef(seg)) { parts.push(seg); continue; }
    const slot = slots.find((x) => x.name === seg.s);
    if (slot === undefined) return undefined;
    const use = seg.f === undefined || seg.f === null ? slot : { ...slot, form: seg.f };
    const text = fillSlot(use, values[seg.s], ctx, flags);
    if (text === undefined) return undefined;
    parts.push(text);
  }
  return concatText(...parts);
}

/**
 * renderTpl(kind, key, input, ctx)：先找 key 等于所给代号的模板，没有再用该 kind 的兜底模板；
 * 在模板的变体里选一个能填出文字的（显示选择器取 priority 最大，并列时 rotate 者按 ctx.seq 取模、否则取 vid 代号序第一个）。
 * 该 kind 没有任何模板（显示配置为空）或没有一个变体能填，返回 null——由调用方按 labelText 回落到显示名再到代号（V-30 空 labels 可玩）。
 * @param {string} kind
 * @param {string | null} key
 * @param {object} input 该 kind 的输入结构（回执等代号结构）
 * @param {{display: {byKindKey: Map<string, Map<string | null, any>>}, labels: ReadonlyMap<string, ReadonlyMap<string, object>>, templates: ReadonlyMap<string, ReadonlyMap<string, unknown>>, seq: number}} ctx seq：事件 id 序号，没有事件取本次响应的行序号（R29-2.3）
 * @returns {null | {text: object, templateId: string, vid: string, untranslated: boolean}}
 */
export function renderTpl(kind, key, input, ctx) {
  const byKey = ctx.display.byKindKey.get(kind);
  if (byKey === undefined) return null;
  const candidates = [];
  if (key !== null && byKey.has(key)) candidates.push(byKey.get(key));
  if (byKey.has(null)) candidates.push(byKey.get(null));
  for (const row of candidates) {
    const texts = ctx.templates.get(row.id);
    if (texts === undefined) continue;
    const values = {};
    for (const s of row.slots) values[s.name] = pick(input, s.source);
    const built = new Map();
    for (const v of row.variants) {
      if (!texts.has(v.vid)) continue;
      const flags = { untranslated: false };
      const text = assemble(texts.get(v.vid), row.slots, values, ctx, flags);
      if (text !== undefined) built.set(v.vid, { text, untranslated: flags.untranslated });
    }
    const chosen = selectRows(row.variants.filter((v) => built.has(v.vid)), { slot: values });
    if (chosen.length === 0) continue;
    const tied = [...chosen].sort((a, b) => (a.vid < b.vid ? -1 : a.vid > b.vid ? 1 : 0));
    const pickOne = tied.every((v) => v.rotate) ? tied[((ctx.seq % tied.length) + tied.length) % tied.length] : tied[0];
    return { text: built.get(pickOne.vid).text, templateId: row.id, vid: pickOne.vid, untranslated: built.get(pickOne.vid).untranslated };
  }
  return null;
}
