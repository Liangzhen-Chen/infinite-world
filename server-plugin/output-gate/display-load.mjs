// 显示配置加载器 displayData()（卷二十九 §3.1 表"displayData()" :428、§2.3 :225–:236、§2.5 模板结构行、C29-3；卷二 §2.9 第 1 条 outputGate 只读白名单；体检 K6-82）。
// 只读不含文字的显示配置：world/i18n/locales.json、world/display/templates.json、world/display/config.json（T0 最小版只读这三份；
// panels、map、assets、epithets 与 gram.* 随面板卡与语言卡）。node:fs 只用 readFileSync、readdirSync（后者逐段核对白名单文件在不在，不把读目录失败当"没有"）。
// 文件不存在即该份为空（卷二十九 A29-1.2：一份显示配置都不留仍可玩）；存在而形状不对即拒收报码。
// 模板变体的 when 是显示档 RX：本文件把它交 kernelApi compileRX（卷二 :633 只开给本文件）；显示档编译内核尚未建（rx.mjs compileRX 现报 E-MOD-RX），
// 所以带 when 的行现在即加载失败，不静默当恒真。代号文法（字串收窄）归 kernelApi narrow 与离线校验，本文件只核形状与封闭枚举，不用正则。
// 文字不经本文件（显示名与模板文本归 textcore/labels.mjs，C29-3）。

import { readFileSync, readdirSync } from 'node:fs';
import { compileRX } from '../kernel/rx.mjs';
import { FORM, KIND, FILL, fail } from './enums.mjs';

const DISPLAY_PROFILE = 'display';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v) => typeof v === 'string' && v.length > 0;

const WHITELIST = Object.freeze({ locales: 'world/i18n/locales.json', templates: 'world/display/templates.json', config: 'world/display/config.json' });

/** 白名单文件在不在：沿路径逐段列目录核对（根目录必须存在，读不了即抛）。 */
function exists(root, rel) {
  let dir = root;
  for (const seg of rel.split('/')) {
    if (!readdirSync(dir).includes(seg)) return false;
    dir = `${dir}/${seg}`;
  }
  return true;
}

function readOptional(root, rel) {
  if (!exists(root, rel)) return undefined;
  const text = readFileSync(`${root}/${rel}`, 'utf8');
  try { return JSON.parse(text); } catch { return fail('E_TPL_KEY', `${rel}: not JSON`); }
}

function checkSlot(s, rowId) {
  if (!isObj(s) || !nonEmpty(s.name) || !FILL.is(s.kind) || !nonEmpty(s.source)
    || !(s.form === null || FORM.is(s.form)) || typeof s.required !== 'boolean') fail('E_TPL_KEY', `${rowId}: bad slot`);
}

function checkRow(row, seen) {
  if (!isObj(row) || !nonEmpty(row.id)) return fail('E_TPL_KEY', 'template row: bad id');
  if (seen.has(row.id)) fail('E_TPL_KEY', `${row.id}: duplicate id`);
  seen.add(row.id);
  if (!KIND.is(row.kind)) fail('E_TPL_KEY', `${row.id}: kind`);
  // key：为空是该 kind 的兜底；否则是主键登记里的代号（R29-2.2 表）。
  if (!(row.key === null || nonEmpty(row.key))) fail('E_TPL_KEY', `${row.id}: key`);
  if (!Array.isArray(row.slots)) fail('E_TPL_KEY', `${row.id}: slots`);
  row.slots.forEach((s) => checkSlot(s, row.id));
  if (new Set(row.slots.map((s) => s.name)).size !== row.slots.length) fail('E_TPL_KEY', `${row.id}: duplicate slot name`);
  if (typeof row.stable !== 'boolean') fail('E_TPL_KEY', `${row.id}: stable`);
  if (!Array.isArray(row.variants) || row.variants.length === 0) fail('E_TPL_KEY', `${row.id}: variants`);
  const vids = new Set();
  const variants = row.variants.map((v) => {
    if (!isObj(v) || !nonEmpty(v.vid) || vids.has(v.vid) || !Number.isInteger(v.priority) || typeof v.rotate !== 'boolean') return fail('E_TPL_KEY', `${row.id}: bad variant`);
    vids.add(v.vid);
    const when = v.when === null || v.when === undefined ? null : compileRX(v.when, DISPLAY_PROFILE);
    return Object.freeze({ vid: v.vid, when, priority: v.priority, rotate: v.rotate });
  });
  return Object.freeze({ id: row.id, kind: row.kind, key: row.key, slots: Object.freeze(row.slots.map((s) => Object.freeze({ ...s }))), variants: Object.freeze(variants), stable: row.stable });
}

/** 兜底核对（E-TPL-NO-FALLBACK）：出现过的每个 kind 必须恰有一条兜底（key 为空），且兜底没有必填槽位；没有任何模板行不算缺兜底。 */
function checkFallbacks(rows) {
  for (const kind of new Set(rows.map((r) => r.kind))) {
    const fb = rows.filter((r) => r.kind === kind && r.key === null);
    if (fb.length !== 1 || fb[0].slots.some((s) => s.required)) fail('E_TPL_NO_FALLBACK', kind);
  }
}

/**
 * displayData(root)：返回冻结的 {locales, templates, byKindKey, config}。
 * @param {string} root 仓库根（含 world/）
 */
export function displayData(root) {
  const locales = readOptional(root, WHITELIST.locales);
  const templates = readOptional(root, WHITELIST.templates);
  const config = readOptional(root, WHITELIST.config);
  if (locales !== undefined && !Array.isArray(locales)) fail('E_I18N_LOCALE', 'locales.json');
  if (templates !== undefined && !Array.isArray(templates)) fail('E_TPL_KEY', 'templates.json');
  if (config !== undefined && !isObj(config)) fail('E_TPL_KEY', 'config.json');
  const seen = new Set();
  const rows = (templates || []).map((r) => checkRow(r, seen));
  /** @type {Map<string, Map<string | null, object>>} */
  const byKindKey = new Map();
  for (const r of rows) {
    if (!byKindKey.has(r.kind)) byKindKey.set(r.kind, new Map());
    const m = byKindKey.get(r.kind);
    if (m.has(r.key)) fail('E_TPL_KEY', `${r.id}: kind+key already has a template`);
    m.set(r.key, r);
  }
  checkFallbacks(rows);
  return Object.freeze({ locales: Object.freeze(locales || []), templates: Object.freeze(rows), byKindKey, config: Object.freeze({ ...(config || {}) }) });
}
