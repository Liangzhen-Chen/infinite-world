// 代号与格式正则的唯一出处（卷二 §2.8 表 kernel 行 :852，封卷后勘误 1118k17；S13 (b)）。
// 本文件是 handles 叶子：只放正则与按正则判形/取段的具名函数，不 import 任何其他 kernel 文件（避免 import 环）。
// 其余 kernel 文件要用这些格式时 import 本文件的函数，不各写一份正则（S13 ① 只许正则出现在 §2.8 表 kernel 行所列文件，
// handles/ 内只放本叶子）。

// ---------- 路径与代号文法 ----------

// 相对 server-plugin/ 的模块路径（registerAdvanceHook / registerViewReader 的 file：一段或多段目录 + .mjs）。
const MODULE_FILE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.mjs$/;
/** @param {unknown} s @returns {boolean} */
export const isModuleFile = (s) => typeof s === 'string' && MODULE_FILE.test(s);

// 相对 world/rules/ 的规则表文件路径（一段或多段目录 + .json）。
const RULE_TABLE_FILE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.json$/;
/** @param {unknown} s @returns {boolean} */
export const isRuleTableFile = (s) => typeof s === 'string' && RULE_TABLE_FILE.test(s);

// 小驼峰代号：推进钩子名与视图读取名同用一条文法（advance-registry、view-registry）。
const LOWER_CAMEL_CODE = /^[a-z][a-zA-Z0-9_]{0,47}$/;
/** @param {unknown} s @returns {boolean} */
export const isLowerCamelCode = (s) => typeof s === 'string' && LOWER_CAMEL_CODE.test(s);

// 错误码文法（卷二 §4.2）：E-<区>-<名> / W-…
const ERROR_CODE = /^[EW]-[A-Z0-9]+(-[A-Z0-9]+)+$/;
/** @param {unknown} s @returns {boolean} */
export const isErrorCode = (s) => typeof s === 'string' && ERROR_CODE.test(s);

// 依赖声明的三类节点名（卷二 §2.3 :470）与加载器机器生成的两类（:470 末句）。
const DECLARABLE_NODE = /^(view|relation|scope):[A-Za-z][A-Za-z0-9_]*$/;
const GENERATED_NODE = /^(dim|modified):([a-z][a-z0-9_]{1,47})$/;
const ANY_NODE = /^(view|relation|scope|dim|modified):[A-Za-z][A-Za-z0-9_]*$/;
/** @param {unknown} s @returns {boolean} */
export const isDeclarableNode = (s) => typeof s === 'string' && DECLARABLE_NODE.test(s);
/** @param {unknown} s @returns {boolean} */
export const isGeneratedNode = (s) => typeof s === 'string' && GENERATED_NODE.test(s);
/** @param {unknown} s @returns {boolean} */
export const isAnyNode = (s) => typeof s === 'string' && ANY_NODE.test(s);

// state-owners 路径模式（pathTypes 的键）：点分的小驼峰段。
const PATH_PATTERN = /^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/;
/** @param {unknown} s @returns {boolean} */
export const isPathPattern = (s) => typeof s === 'string' && PATH_PATTERN.test(s);

// 十进制文本（含 JS 数的指数写法）：定点算术的唯一解析正则（det-math）。
const DECIMAL_LITERAL = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;
/** @param {unknown} x @returns {RegExpExecArray | null} */
export const parseDecimalLiteral = (x) => DECIMAL_LITERAL.exec(String(x));

// ---------- JSON 文本（L0 语法；load/json-text） ----------

/** JSON 指针转义（RFC 6901）：`~` → `~0`、`/` → `~1`。@param {string} k @returns {string} */
export const escapeJsonPointer = (k) => k.replace(/~/g, '~0').replace(/\//g, '~1');

// JSON 标量（数字、true/false/null）的粘性匹配：从 at 起匹配，返回原文与结束位；不匹配返回 null。
const JSON_SCALAR = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
/** @param {string} text @param {number} at @returns {{raw: string, end: number} | null} */
export function jsonScalarAt(text, at) {
  JSON_SCALAR.lastIndex = at;
  const m = JSON_SCALAR.exec(text);
  return m ? { raw: m[0], end: JSON_SCALAR.lastIndex } : null;
}

// 规则表键表的行值指针：登记行的 path 末段是 /value 时取键所在位置（load/rules）。
const VALUE_SEGMENT_END = /\/value$/;
/** @param {string} path @returns {string} */
export const keyPointerOf = (path) => path.replace(VALUE_SEGMENT_END, '/key');

// 64 位小写十六进制摘要（存档清单与摘要；save、load/save）。
const HEX64 = /^[0-9a-f]{64}$/;
/** @param {unknown} s @returns {boolean} */
export const isHex64 = (s) => typeof s === 'string' && HEX64.test(s);

// ---------- state-owners 的 pathTypes 值文法（卷二 §2.7） ----------

const LIST_TYPE = /^list<(?<item>.+)>$/;
const NUMBER_TYPE = /^(?<base>number|integer)(?::(?<unit>.*))?$/;
const CLOSED_TYPE = /^(ref|enum):[a-z][a-z0-9_]*$/;
const STRUCT_TYPE = /^struct:[a-zA-Z][a-zA-Z0-9_<>]*$/;
/** list<…> 的内层类型；不是 list 返回 null。@param {string} t @returns {string | null} */
export function listItemType(t) {
  const m = LIST_TYPE.exec(t);
  return m ? m.groups.item : null;
}
/** number[:unit] / integer[:unit] 的 base 与 unit；不是数值类型返回 null。@param {string} t @returns {{base: string, unit: string | undefined} | null} */
export function parseNumberType(t) {
  const m = NUMBER_TYPE.exec(t);
  return m ? { base: m.groups.base, unit: m.groups.unit } : null;
}
/** ref:<kind> / enum:<family> / struct:<name> 三类封闭写法。@param {string} t @returns {boolean} */
export const isClosedType = (t) => typeof t === 'string' && (CLOSED_TYPE.test(t) || STRUCT_TYPE.test(t));

const SEALED_MENTION = /(^|<)sealed(>|$)/;
/** 类型文法里是否出现 sealed（list<sealed>、struct 名含 sealed 段等）。@param {unknown} t @returns {boolean} */
export const mentionsSealed = (t) => typeof t === 'string' && SEALED_MENTION.test(t);

// required 策略的多条件分隔符（卷二 §1.2 :104：一个维度可并列多个条件，以"；"分隔）。
const REQUIRED_TERM_SEPARATOR = /；/;
/** @param {unknown} s @returns {string[]} */
export const splitRequiredTerms = (s) => (typeof s === 'string' ? s.split(REQUIRED_TERM_SEPARATOR).map((x) => x.trim()) : []);

// ---------- RX 表达式与返回形状（rx） ----------

// RX 词法：数字、名字（可带点分下标）、运算符；粘性匹配从 at 起。
const RX_TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)|(==|!=|<=|>=|&&|\|\||[-+*/%<>()!,]))/y;
/** @param {string} text @param {number} at @returns {{groups: (string | undefined)[], end: number} | null} */
export function rxTokenAt(text, at) {
  RX_TOKEN.lastIndex = at;
  const m = RX_TOKEN.exec(text);
  if (!m) return null;
  const [, numTok, nameTok, opTok] = m;
  return { groups: [numTok, nameTok, opTok], end: RX_TOKEN.lastIndex };
}

// 返回形状里每个 `<…>` 占位是一段 arg。
const SHAPE_ARG = /<[^<>]+>/g;
/** @param {string} shape @returns {number} */
export const shapeArgCount = (shape) => (shape.match(SHAPE_ARG) || []).length;

// 返回形状里写明"（set，只作 member 的 set）"的字段名：`<字段>（set，只作 member 的 set）`。
const SET_FIELD = /([A-Za-z_][\w]*)（set，只作 member 的 set）/g;
/** @param {string} shape @returns {string[]} */
export const setFieldNames = (shape) => [...String(shape).matchAll(SET_FIELD)].map((m) => m[1]);

// ---------- 日志键的代号形（scheduler） ----------

const UPPER = /[A-Z]/g;
/** 驼峰转下划线小写（卷二十 §4.1.3 第 7 条对照表）。@param {string} key @returns {string} */
export const snakeCaseKey = (key) => key.replace(UPPER, (c) => `_${c.toLowerCase()}`);
