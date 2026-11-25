// labels 唯一加载器（卷二 §2.7 :1080 附近 labels.mjs 行；§2.9 第 1 条 outputGate 只读白名单第 1 项；卷二十九 §2.4、R29-1.4、R29-1.6；体检 K6-82，6-17 改一轮）。
// 只读 world/i18n/labels.<lang>.json（代号 → 形态 → 文字）与 templates.<lang>.json（模板代号 → 变体代号 → 段列表），不读别的路径、不写、不联网；
// 输出两张冻结 Map，文字一律 brand 成 Text。文件不存在即该份为空（卷二十九 A29-1.2：一份语言包都不留仍可玩，节点文字是代号）；
// 存在但形状不对即拒收：条目不是"形态 → 文字"的对象（E-I18N-FORM）、缺 label 形态或 label 为空（E-I18N-LABEL-MISSING）。
// 块 6 边界：扩展包目录 packs/<ns>/i18n 与形态名的封闭枚举核对（E-I18N-FORM 的另一半）、键集合核对（E-I18N-LABEL-ORPHAN）随语言卡与离线校验，不在本最小版。

import { readFileSync, readdirSync } from 'node:fs';
import { brand } from './brand.mjs';
import { fail } from './fail.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const LABEL_FORM = 'label';

/** 白名单文件在不在：沿路径逐段列目录核对（根必须存在；读目录失败即抛，不当"没有"）。 */
function exists(root, rel) {
  let dir = root;
  for (const seg of rel.split('/')) {
    if (!readdirSync(dir).includes(seg)) return false;
    dir = `${dir}/${seg}`;
  }
  return true;
}

function readJson(root, rel) {
  if (!exists(root, rel)) return undefined;
  try { return JSON.parse(readFileSync(`${root}/${rel}`, 'utf8')); } catch { return fail('E_I18N_FORM', `${rel}: not JSON`); }
}

function loadNames(raw) {
  /** @type {Map<string, ReadonlyMap<string, object>>} */
  const out = new Map();
  if (raw === undefined) return out;
  if (!isObj(raw)) fail('E_I18N_FORM', 'labels file must be an object');
  for (const code of Object.keys(raw)) {
    const entry = raw[code];
    if (!isObj(entry)) fail('E_I18N_FORM', `${code}: entry must map form to text`);
    const forms = new Map();
    for (const form of Object.keys(entry)) {
      if (typeof entry[form] !== 'string') fail('E_I18N_FORM', `${code}.${form}: text required`);
      forms.set(form, brand(entry[form]));
    }
    if (!forms.has(LABEL_FORM) || entry[LABEL_FORM].length === 0) fail('E_I18N_LABEL_MISSING', code);
    out.set(code, Object.freeze(forms));
  }
  return out;
}

// 段列表：每段是一段文字（brand 成 Text）或槽位引用 {s, f}；选择结构（带 slot 字段的对象）原样冻结保留，由模板引擎按能力取舍。
function loadSegments(list, where) {
  if (!Array.isArray(list)) return Object.freeze(isObj(list) ? { ...list } : fail('E_I18N_TPL_SLOT', where));
  return Object.freeze(list.map((seg) => {
    if (typeof seg === 'string') return brand(seg);
    if (isObj(seg) && typeof seg.s === 'string') return Object.freeze({ s: seg.s, f: seg.f === undefined ? null : seg.f });
    return fail('E_I18N_TPL_SLOT', where);
  }));
}

function loadTemplates(raw) {
  /** @type {Map<string, ReadonlyMap<string, unknown>>} */
  const out = new Map();
  if (raw === undefined) return out;
  if (!isObj(raw)) fail('E_I18N_TPL_SLOT', 'templates file must be an object');
  for (const id of Object.keys(raw)) {
    if (!isObj(raw[id])) fail('E_I18N_TPL_SLOT', id);
    const variants = new Map();
    for (const vid of Object.keys(raw[id])) variants.set(vid, loadSegments(raw[id][vid], `${id}.${vid}`));
    out.set(id, Object.freeze(variants));
  }
  return out;
}

/**
 * groupApi `labels`（callers inputEdge、outputGate）：加载一种显示语言的 labels 与模板文本。
 * @param {string} root 仓库根（含 world/）
 * @param {string} lang 显示语言代号（拼文件名；不在此核对是否已登记，显示语言行归 outputGate 的 locales 加载）
 * @returns {Readonly<{names: ReadonlyMap<string, ReadonlyMap<string, object>>, templates: ReadonlyMap<string, ReadonlyMap<string, unknown>>}>}
 */
export function labels(root, lang) {
  const base = 'world/i18n';
  return Object.freeze({
    names: loadNames(readJson(root, `${base}/labels.${lang}.json`)),
    templates: loadTemplates(readJson(root, `${base}/templates.${lang}.json`)),
  });
}

/**
 * 缺译时"以代号本身显示"（卷二十九 R29-1.6 ③）：把代号变成 Text。代号是 kernel 登记的代号串，不是玩家文字；卷二没有给这一步的出口，
 * 自定放在 labels.mjs 并开给 outputGate（groupApi callers outputGate），回报报李白核。
 * @param {string} code
 * @returns {object} Text
 */
export function codeText(code) {
  return brand(code);
}
