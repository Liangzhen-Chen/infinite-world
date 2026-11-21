// 维度键、修正键、state 路径的拼接与核对（卷二 §2.8 表 kernel 行"种子键与维度键拼接只在 kernel/handles/keys.mjs"；
// §2.9 第 2 条强转豁免文件表 keys.mjs 行：按各自文法解析并查注册表，StatePath 另核对模式在 pathTypes 内且不是 textPath 与账本路径）。
// 本文件做 DimKey、ModKey、StatePath 三种（块 2 第 2-1 张）与 SeedKey 段的文法核对（块 3-2，李白 11-18 05:28 裁定②）；
// 种子键派生串（§1.10 :320）、h_i 的输入串（:323）与骰值键五段（卷二十七 R27-8.5 :721–:733）的拼接也在本文件（卷二 §2.8 :852）；
// NodeName、RxId、TextScope、EventId 的构造随各自那张卡加。
// 注册表全部来自加载结果（维度表表头、idIndex、词表索引、pathTypes），不认任何具体表、维度或路径。

import { CODE_RE, HandleError } from './vocab-handle.mjs';
import { T } from '../validate/types.mjs';
import { GRAMMAR_TOKENS } from './markers.mjs';
import { fixedUnits } from '../det-math.mjs';
import { KernelError } from '../errors.mjs';

// pathTypes 值类型里超出 §1.5 类型名的固定记号：定义源在 kernel/handles/markers.mjs（卷二 §2.7 :811 dimension、sealed、EventId 行），这里只引用。
const TYPE_EXTRA = T.path_type_extra;
// 路径模式的空段与宿主对象保留段名（卷二 §2.7 writers 写法 "" = 整个键；pathTypes 段文法保留 constructor、prototype，李白 11-17 裁定）。
const SEG = Object.freeze({ empty: '' });
const PATH_SEGMENT_RESERVED_LIST = ['constructor', 'prototype'];

/** @typedef {import('../types.d.ts').DimKey} DimKey */
/** @typedef {import('../types.d.ts').ModKey} ModKey */
/**
 * @typedef {{tableDims: Map<string, Record<string, any>>, idIndex: Map<string, string>, vocabIndex: Map<string, {family: string}>}} KeyRegistry
 * tableDims：kind → 该表 dimensions 表头；idIndex：实体 id → kind；vocabIndex：词表代号 → {family}。
 */

// 维度键与 struct 字段名文法（§1.9 :278）。
const DIM_RE = /^[a-z][a-zA-Z0-9]{0,47}$/;
// `<kind>.<dimension>[<key>]`（§2.8 第 1 条 DimKey；§5.0 下标键语法 :1586）。
const DIM_KEY_RE = /^([a-z][a-z0-9_]{1,47})\.([a-z][a-zA-Z0-9]{0,47})(?:\[([^[\]]+)\])?$/;
const DECIMAL_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

// 下标是否合该 map 维度的键定义：数值键收有限数；代号键按键定义的族或 kind 查注册表，没写族与 kind 的查 idIndex 或词表。
function subKeyOk(reg, keyDef, key) {
  const kd = keyDef && typeof keyDef === 'object' ? keyDef : {};
  if (typeof key === 'number') return Number.isFinite(key) && (kd.type === T.type.number || kd.type === T.type.integer);
  if (typeof key !== 'string' || !CODE_RE.test(key)) return false;
  const fam = kd.vocab !== undefined ? kd.vocab : (kd.domain && typeof kd.domain === 'object' ? kd.domain.vocab : undefined);
  if (fam !== undefined) return reg.vocabIndex.has(key) && reg.vocabIndex.get(key).family === fam;
  if (kd.kind !== undefined) return reg.idIndex.get(key) === kd.kind;
  if (Array.isArray(kd.kinds)) return kd.kinds.includes(reg.idIndex.get(key));
  return reg.idIndex.has(key) || reg.vocabIndex.has(key);
}

// 共用：查表头，返回维度定义；未登记交调用方按各自的码报。
function dimDef(reg, kind, dimension) {
  if (typeof kind !== 'string' || !CODE_RE.test(kind)) throw new HandleError('E-DIM-ID-FORMAT', `kind ${JSON.stringify(kind)}: want ^[a-z][a-z0-9_]{1,47}$`);
  if (typeof dimension !== 'string' || !DIM_RE.test(dimension)) throw new HandleError('E-DIM-ID-FORMAT', `dimension ${JSON.stringify(dimension)}: want ^[a-z][a-zA-Z0-9]{0,47}$`);
  const dims = reg.tableDims.get(kind);
  return dims && Object.hasOwn(dims, dimension) ? dims[dimension] : undefined;
}

function join(kind, dimension, key) {
  return key === undefined ? `${kind}.${dimension}` : `${kind}.${dimension}[${key}]`;
}

/**
 * 拼 DimKey：kind 有维度表、dimension 在其表头；带下标时该维必须是 map，下标合其键定义（§5.0 :1586）。
 * 未登记的 kind、维度或下标 E-DIM-REF-MISSING；文法不合 E-DIM-ID-FORMAT。
 * @param {KeyRegistry} reg @param {string} kind @param {string} dimension @param {string|number} [key]
 * @returns {DimKey}
 */
export function dimKeyOf(reg, kind, dimension, key) {
  const def = dimDef(reg, kind, dimension);
  if (!def) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension)}: dimension not registered`);
  if (key !== undefined && (def.type !== T.type.map || !subKeyOk(reg, def.key, key))) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension, key)}: subscript not a key of a map dimension`);
  return /** @type {DimKey} */ (join(kind, dimension, key));
}

/**
 * 拼 ModKey（§3.1）：`modifiable:true` 的 number/integer/map<…,number> 维度即修正键。
 * 未登记或不可修正 E-MOD-KEY-UNREGISTERED；map 子键不存在 E-DIM-REF-MISSING（§7 A3 :2358）。
 * 本函数只覆盖 `<kind>.<dimension>[<key>]` 一类；`body.<capability>`、`process.<slot>`、存量目标键等另立命名空间随其登记卡加。
 * @param {KeyRegistry} reg @param {string} kind @param {string} dimension @param {string|number} [key]
 * @returns {ModKey}
 */
export function modKeyOf(reg, kind, dimension, key) {
  const def = dimDef(reg, kind, dimension);
  const valueType = def && def.type === T.type.map ? (def.value || {}).type : def && def.type;
  if (!def || def.modifiable !== true || !(valueType === T.type.number || valueType === T.type.integer)) throw new HandleError('E-MOD-KEY-UNREGISTERED', `${join(kind, dimension, key)}: not a modifiable number/integer/map<...,number> dimension`);
  if (def.type === T.type.map && key === undefined) throw new HandleError('E-MOD-KEY-UNREGISTERED', `${join(kind, dimension)}: map dimension needs a subscript`);
  if (key !== undefined && (def.type !== T.type.map || !subKeyOk(reg, def.key, key))) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension, key)}: subscript not a key of the map dimension`);
  return /** @type {ModKey} */ (join(kind, dimension, key));
}

/**
 * 解析 DimKey 字串（§5.0 :1586"kernel 拆出维代号与下标，分别查维度登记与 idIndex（或按数值读）"），拆完按 dimKeyOf 同一套核对。
 * @param {KeyRegistry} reg @param {string} text
 * @returns {{key: DimKey, kind: string, dimension: string, sub: string|number|undefined}}
 */
export function parseDimKey(reg, text) {
  const m = typeof text === 'string' ? DIM_KEY_RE.exec(text) : null;
  if (!m) throw new HandleError('E-DIM-ID-FORMAT', `dim key ${JSON.stringify(text)}: want <kind>.<dimension>[<key>]`);
  const [, kind, dimension, raw] = m;
  const def = dimDef(reg, kind, dimension);
  const keyType = def && def.type === T.type.map ? (def.key || {}).type : undefined;
  const numericKey = keyType === T.type.number || keyType === T.type.integer;
  const sub = raw === undefined ? undefined : (numericKey && DECIMAL_RE.test(raw) ? Number(raw) : raw);
  return { key: dimKeyOf(reg, kind, dimension, sub), kind, dimension, sub };
}

// 通配 `*` 与路径分隔符 `.` 是卷二文法记号（卷二 §2.7 :814：路径按 `.` 分段、`*` 恰匹配一段）；S13 上下文白名单的语言与文法常量，
// 不计第 ④ 类（李白 11-18 13:05 裁定第 2 条）。
/**
 * 模式的 `*` 段数（§2.7 路径模式匹配语义 :814：按 `.` 分段，`*` 恰匹配一段）。
 * @param {string} pattern
 */
export function wildcardCount(pattern) {
  return pattern.split(GRAMMAR_TOKENS.pathSep).filter((s) => s === GRAMMAR_TOKENS.wildcard).length;
}

/** pathTypes 模式字面段文法（李白 11-17 pathTypes 段文法裁定及其修正，卷二 §2.7）：小写字母开头，后面允许大小写字母、数字、下划线。 */
export const PATH_SEGMENT_RE = /^[a-z][a-zA-Z0-9_]*$/;
/** 保留字段名（防原型污染，与 __proto__ 同理）：整类拒收。 */
export const PATH_SEGMENT_RESERVED = new Set(PATH_SEGMENT_RESERVED_LIST);

/**
 * 校验一条 pathTypes 模式：每个非 `*` 段合 PATH_SEGMENT_RE，且至少一个字面段（全 `*` 的模式派生成员名为空串）。
 * 违者 E-PATH-SEGMENT-GRAMMAR。所有读 pathTypes 模式生成句柄的入口都经它（generated.mjs buildP）。
 * @param {string} pattern
 */
export function checkPathPattern(pattern) {
  const segs = typeof pattern === 'string' ? pattern.split(GRAMMAR_TOKENS.pathSep) : [];
  const bad = segs.find((s) => s !== GRAMMAR_TOKENS.wildcard && (!PATH_SEGMENT_RE.test(s) || PATH_SEGMENT_RESERVED.has(s)));
  if (!segs.length || bad !== undefined) throw new HandleError('E-PATH-SEGMENT-GRAMMAR', `pathTypes pattern ${JSON.stringify(pattern)}: literal segment ${JSON.stringify(bad)} not ^[a-z][a-zA-Z0-9_]*$ or reserved word`);
  if (!segs.some((s) => s !== GRAMMAR_TOKENS.wildcard)) throw new HandleError('E-PATH-SEGMENT-GRAMMAR', `pathTypes pattern ${JSON.stringify(pattern)}: needs at least one literal segment`);
}

/**
 * 由种子派生的实体 id 段（SeedKey；keyKinds (c) `seedKey`，李白 11-18 05:28 裁定②）是否合文法：
 * 卷二 §1.10 :320 种子键各部件"按代号规范"，派生 id 即 §1.9 代号文法 CODE_RE（与 handle 段同一文法，不另立宽松正则；卷二 :234 `ownerKey.aggregate: SeedKey`、
 * 卷二十七 :348 聚合体 id 由 §1.10 派生函数得出、登记为 role_id）；且它既不是词表代号（词表代号段走命名 struct，02:55 裁定，不借 seedKey 兜底），
 * 也不是已载入的带 kind 实体 id（那类段写实体 kind，keyKinds (a)(b)）。
 * 种子键各段以 `|` 相连（同 :320）；join 分隔串是卷二文法记号，S13 上下文白名单的语言与文法常量，不计第 ④ 类（李白 11-18 13:05 裁定第 2 条）。
 * @param {KeyRegistry} reg @param {unknown} text
 * @returns {boolean}
 */
export function isSeedKey(reg, text) {
  return typeof text === 'string' && CODE_RE.test(text) && !reg.vocabIndex.has(text) && !reg.idIndex.has(text);
}

/**
 * string → SeedKey（§2.9 第 2 条强转豁免表 keys.mjs 行）：不合 isSeedKey 即 E-PATH-KEYKINDS（卷二 :1545 码表、:815 现文，勘误 1118k10）。
 * @param {KeyRegistry} reg @param {unknown} text
 * @returns {import('../types.d.ts').SeedKey}
 */
export function seedKeyOf(reg, text) {
  if (!isSeedKey(reg, text)) throw new HandleError('E-PATH-KEYKINDS', `seedKey ${JSON.stringify(text)}: want ^[a-z][a-z0-9_]{1,47}$, not a vocab code or loaded entity id`);
  return /** @type {import('../types.d.ts').SeedKey} */ (/** @type {unknown} */ (text));
}

// ---------- 种子键、h_i 输入串与骰值键的拼接（卷二 §1.10 :320–:323；卷二十七 R27-8.5 :721–:733） ----------
// 卷二 §2.8 表 kernel 行（:852）"种子键与维度键拼接只在 kernel/handles/keys.mjs"：键串的拼接一律在本文件。
// 各部件是否合文法的核对与错误码归调用方（kernel/sample.mjs 按卷二 §1.10 :320、卷二十七 R27-8.5 校验后调用），
// 本文件只拼已核对的部件；不 import 别的内核文件，import 闭包不变。

// 键成分之间的分隔串是卷二文法记号（定义源 handles/markers.mjs），不在这里另写字面量。
const KEY_JOIN = GRAMMAR_TOKENS.joinSep;
// joint 的第四段写作 `joint:<group>`（卷二 §1.10 :320）。
const JOINT_PREFIX = 'joint:';

/**
 * 种子键文本（卷二 §1.10 :320）：`template.seed | kind | instanceId | dimension`，joint 把 dimension 换成 `joint:<group>`。
 * 调用方已核对各部件合代号文法、不含分隔串；返回值尚未哈希（sha256 归 kernel/sample.mjs）。
 * @param {string} templateSeed 世界模板种子（存档）
 * @param {string} kind 实体类代号
 * @param {string} instanceId 实例 id（卷十确定性导出）
 * @param {string} dimension 维度名（joint 时是 map 维度名）
 * @param {string} [group] joint 的组名；给出时第四段写 `joint:<group>`
 * @returns {string}
 */
export function seedKeyText(templateSeed, kind, instanceId, dimension, group) {
  const dimPart = group === undefined ? dimension : JOINT_PREFIX + group;
  return [templateSeed, kind, instanceId, dimPart].join(KEY_JOIN);
}

/**
 * 第 i 个哈希的输入串（卷二 §1.10 :323）：`seedKey | i`，i 从 0 起，i=0 也再哈希一次。
 * 调用方已核对 seedKey 是 64 位十六进制、i 是非负整数；sha256 归 kernel/sample.mjs。
 * @param {string} seedKey 种子键（64 位十六进制） @param {number} i 非负整数
 * @returns {string}
 */
export function seedHashText(seedKey, i) {
  return `${seedKey}${KEY_JOIN}${i}`;
}

/**
 * 骰值键文本（卷二十七 R27-8.5 :721–:733，全书唯一写法）：恰五段
 * `(worldSeed, streamCode, subjectId, worldTime, drawSiteCode)`，主体 id 与一到两个限定成分用 `|` 连接。
 * 调用方已核对成分只能是代号、id、整数，无空段、无多余成分、无计数（E-SEED-COMPONENT 归 sample.mjs）。
 * @param {string} worldSeed 世界种子
 * @param {string} streamCode 流代号
 * @param {Array<string | number>} subjectParts 主体 id 与限定成分（已按 id 在前、限定成分在后排好）
 * @param {number} worldTime 世界时钟分钟数
 * @param {string} drawSiteCode 抽取点代号
 * @returns {string}
 */
export function diceKeyText(worldSeed, streamCode, subjectParts, worldTime, drawSiteCode) {
  return [worldSeed, streamCode, subjectParts.join(KEY_JOIN), String(worldTime), drawSiteCode].join(KEY_JOIN);
}

/**
 * 区格生成种子键文本（卷五 §4.1 规则 15、卷二十七 R27-5.9）：世界种子 | 生成流代号 | 抽取点代号 | 其余整数成分。
 * 其余整数成分由调用方给出（区格种子是格空间号 w、区格 x、区格 y；起伏噪声是格空间号 w、格点、级数），按 String 转十进制。
 * 生成流代号与抽取点代号是调用处的字面量（seed_sites 检测器按登记表双向比对）；sha256 归调用方（kernel/grid.mjs）。
 * @param {string} worldSeed 世界种子 @param {string} stream 生成流代号 @param {string} site 抽取点代号 @param {...(number|string)} parts
 * @returns {string}
 */
export function gridSeedKeyText(worldSeed, stream, site, ...parts) {
  return [worldSeed, stream, site, ...parts.map(String)].join(KEY_JOIN);
}

/**
 * 种子之下的次序键输入串 hash(种子, 序号...)（卷十 R10-2.14 :431–:433；洞穴起点、生长、洞口并列）：种子键 | 整数序号 | 整数序号，按 String 转十进制；
 * 调用方已核对种子键是 64 位十六进制、序号是整数；sha256 归 kernel/sample.mjs orderKeyAt。
 * @param {string} seedKey 64 位十六进制种子键 @param {...number} parts 整数序号
 * @returns {string}
 */
export function orderKeyText(seedKey, ...parts) {
  return [seedKey, ...parts.map(String)].join(KEY_JOIN);
}

// ---------- state 路径里格坐标段 gridKey 的编解码（卷二 §2.7 keyKinds (c) `gridKey`，封卷后勘误 1121k1；李白 11-21 裁定） ----------
// w 段＝格空间号，里块号段＝`<cx>:<cy>`，格键段＝`<x>:<y>:<z>`，都是十进制整数（负号带 `-`、零写 `0`、不补前导零）；
// cx = floor(x ÷ (chunkRegionCells × regionCellM ÷ cellM))，cy 同理用 y，向负无穷取整（卷二 :852）。三段唯一可逆：
// 构造用 gridKeyOf / gridPathOf，还原用 gridKeyParse，加载与写入核三段与"格键所在里块须等于路径里的里块号"用 isGridKeySeg。

// 十进制整数（不补前导零，不收 `-0`、小数、空串）。
const GRID_INT = /^(0|-?[1-9][0-9]*)$/;
// 里块号与格键里的 `:` 分隔串（卷二 :852 gridKey 串形）。
const GRID_SEP = ':';

// 向下取整的整数除法（b > 0）；BigInt 的 / 向零截断，负数要修正（同 footprint.mjs regionOfPos 的 floorDiv）。
function floorDiv(a, b) {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n ? q - 1n : q;
}

// 格坐标段的三段名（卷二 :852：格空间号、里块号、格键）；加载校验按它的长度定"前几个 * 段是 gridKey"，不另写个数。
export const GRID_KEY_SEGMENTS = Object.freeze(['w', 'chunk', 'cell']);

function gridInt(text) {
  if (!GRID_INT.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null; // 超出安全整数的十进制串不可逆，拒收
}

function gridPair(text) {
  const [a, b, extra] = text.split(GRID_SEP);
  if (a === undefined || b === undefined || extra !== undefined) return null;
  const ai = gridInt(a);
  const bi = gridInt(b);
  return ai === null || bi === null ? null : [ai, bi];
}

function gridTriple(text) {
  const [a, b, c, extra] = text.split(GRID_SEP);
  if (a === undefined || b === undefined || c === undefined || extra !== undefined) return null;
  const ai = gridInt(a);
  const bi = gridInt(b);
  const ci = gridInt(c);
  return ai === null || bi === null || ci === null ? null : [ai, bi, ci];
}

/**
 * 里块边长（细格数）= chunkRegionCells × regionCellM ÷ cellM，须是正整数，否则 E-DET-DOMAIN（卷二 :852 gridKey 串形的分母；卷五 §2.3 :271、:427）。
 * 全程 BigInt 定点（照 footprint.mjs regionOfPos），不写 0、1、-1 以外的数字字面量。
 * @param {{cellM: number, regionCellM: number, chunkRegionCells: number}} grid rules.grid
 * @returns {number}
 */
export function gridChunkCells(grid) {
  const cellM = grid.cellM;
  const regionCellM = grid.regionCellM;
  const chunkRegionCells = grid.chunkRegionCells;
  if (!Number.isInteger(cellM) || !Number.isInteger(regionCellM) || !Number.isInteger(chunkRegionCells)
    || cellM < 1 || regionCellM < 1 || chunkRegionCells < 1) {
    throw new KernelError('E-DET-DOMAIN', {}, 'gridChunkCells: cellM, regionCellM, chunkRegionCells must be positive integers');
  }
  const numerator = BigInt(chunkRegionCells) * fixedUnits(regionCellM);
  const cellMf = fixedUnits(cellM);
  const cells = floorDiv(numerator, cellMf);
  if (cells <= 0n || cells * cellMf !== numerator) throw new KernelError('E-DET-DOMAIN', {}, 'gridChunkCells: (chunkRegionCells * regionCellM) / cellM is not a positive integer');
  return Number(cells);
}

/**
 * 三段文本（w 段、里块号段、格键段），唯一可逆的一半（卷二 :852 gridKey 串形）。pos = {w, x, y, z}（整数）。
 * @param {{cellM: number, regionCellM: number, chunkRegionCells: number}} grid rules.grid
 * @param {{w: number, x: number, y: number, z: number}} pos
 * @returns {{w: string, chunk: string, cell: string}}
 */
export function gridKeyOf(grid, pos) {
  const chunkCells = gridChunkCells(grid);
  const cx = floorDiv(BigInt(pos.x), BigInt(chunkCells));
  const cy = floorDiv(BigInt(pos.y), BigInt(chunkCells));
  return { w: String(pos.w), chunk: `${cx}${GRID_SEP}${cy}`, cell: `${pos.x}${GRID_SEP}${pos.y}${GRID_SEP}${pos.z}` };
}

/**
 * 把三段文本还原成 {w, cx, cy, x, y, z}（整数）；任一段不合文法（前导零、`-0`、小数、空串、多余冒号、非数字）返回 null。
 * @param {unknown} segs [w, chunk, cell] 三段文本
 * @returns {{w: number, cx: number, cy: number, x: number, y: number, z: number} | null}
 */
export function gridKeyParse(segs) {
  if (!Array.isArray(segs)) return null;
  const [wText, chunkText, cellText, extra] = segs;
  if (wText === undefined || chunkText === undefined || cellText === undefined || extra !== undefined) return null;
  if (typeof wText !== 'string' || typeof chunkText !== 'string' || typeof cellText !== 'string') return null;
  const w = gridInt(wText);
  if (w === null) return null;
  const chunk = gridPair(chunkText);
  if (chunk === null) return null;
  const cell = gridTriple(cellText);
  if (cell === null) return null;
  const [cx, cy] = chunk;
  const [x, y, z] = cell;
  return { w, cx, cy, x, y, z };
}

/**
 * 三段合文法、且格键 (x, y) 算出的里块等于路径里的里块号（卷二 :852"格键所在里块必须等于路径里的里块号"）；里块不一致返回 false。
 * @param {{cellM: number, regionCellM: number, chunkRegionCells: number}} grid rules.grid
 * @param {unknown} w @param {unknown} chunk @param {unknown} cell
 * @returns {boolean}
 */
export function isGridKeySeg(grid, w, chunk, cell) {
  const parsed = gridKeyParse([w, chunk, cell]);
  if (parsed === null) return false;
  const chunkCells = gridChunkCells(grid);
  const cx = floorDiv(BigInt(parsed.x), BigInt(chunkCells));
  const cy = floorDiv(BigInt(parsed.y), BigInt(chunkCells));
  return cx === BigInt(parsed.cx) && cy === BigInt(parsed.cy);
}

/**
 * `cells.<w>.<cx>:<cy>.<x>:<y>:<z>` 这条 state 路径（给 G9 差分写入用；本卡不被别处调用，但与 gridKeyParse 互逆）。与 gridKeyOf 同一套串形。
 * @param {{cellM: number, regionCellM: number, chunkRegionCells: number}} grid rules.grid
 * @param {{w: number, x: number, y: number, z: number}} pos
 * @returns {string}
 */
export function gridPathOf(grid, pos) {
  const { w, chunk, cell } = gridKeyOf(grid, pos);
  return ['cells', w, chunk, cell].join(GRAMMAR_TOKENS.pathSep);
}

/**
 * 拆 state 路径或路径模式为段（§2.7 路径模式匹配语义：按 `.` 分段）。kernel 组里 state 路径的字串拆分只在本文件做（§2.8 表 kernel 行），
 * storage.mjs 读写时经它拿段，不自己切字串。不是非空字串、或有空段，返回 null。
 * @param {unknown} path
 * @returns {string[] | null}
 */
export function statePathSegments(path) {
  if (typeof path !== 'string' || path === SEG.empty) return null;
  const segs = path.split(GRAMMAR_TOKENS.pathSep);
  return segs.includes('') ? null : segs;
}

/**
 * @typedef {{base: 'number'|'integer'|'boolean'|'dimension'|'sealed'|'EventId'} | {base: 'ref'|'enum'|'struct', name: string} | {base: 'list', item: PathTypeShape}} PathTypeShape
 */

/**
 * 解析 pathTypes 的值类型串为结构（文法同 kernel/load/state-owners.mjs 的核对：number[:单位]、integer[:单位]、boolean、ref:<kind>、enum:<族>、
 * dimension、struct:<名>、sealed、EventId、list<…>）。类型文法的解析只在本文件（§2.8 表 kernel 行），storage.mjs 运行期按结构核对值。
 * 不合文法返回 null（加载期已由合并器报，运行期按值类型不符处置）。
 * @param {unknown} t
 * @returns {PathTypeShape | null}
 */
export function pathTypeShape(t) {
  if (typeof t !== 'string') return null;
  const list = /^list<(.+)>$/.exec(t);
  if (list) { const item = pathTypeShape(list[1]); return item ? { base: 'list', item } : null; }
  const num = /^(number|integer)(?::.*)?$/.exec(t);
  if (num) return { base: /** @type {'number'|'integer'} */ (num[1]) };
  if (t === T.type.boolean || t === TYPE_EXTRA.dimension || t === TYPE_EXTRA.sealed || t === TYPE_EXTRA.EventId) return { base: t };
  const named = /^(ref|enum|struct):([a-zA-Z][a-zA-Z0-9_<>]*)$/.exec(t);
  if (named) { const [, base, name] = named; return { base: /** @type {'ref'|'enum'|'struct'} */ (base), name }; }
  return null;
}

/**
 * 拼 StatePath<P>（§2.6 第 1 条）：pattern 必须是可生成 P 构造函数的模式（在 pathTypes 内、不是 textPath 与账本路径，由调用方给出集合），
 * 每个 `*` 段按次序换成一个实参；实参须是非空、不含 `.` 的字串（EntityId、EventId 或 Handle 的值形态），保证拼出的路径仍由该模式匹配。
 * 模式不在集合内或实参个数不符 E-PATH-UNDECLARED；段值不合 E-DIM-ID-FORMAT。
 * @template {string} P
 * @param {Set<string>} patterns @param {P} pattern @param {string[]} segs
 * @returns {import('../types.d.ts').StatePath<P>}
 */
export function statePathOf(patterns, pattern, segs) {
  if (!patterns.has(pattern)) throw new HandleError('E-PATH-UNDECLARED', `${JSON.stringify(pattern)}: not a P-constructible pathTypes pattern`);
  const parts = pattern.split(GRAMMAR_TOKENS.pathSep);
  if (segs.length !== wildcardCount(pattern)) throw new HandleError('E-PATH-UNDECLARED', `${pattern}: ${segs.length} segment(s) given, ${wildcardCount(pattern)} wildcard(s)`);
  let i = 0;
  const out = parts.map((p) => {
    if (p !== GRAMMAR_TOKENS.wildcard) return p;
    const s = segs[i++];
    if (typeof s !== 'string' || s === SEG.empty || s.includes(GRAMMAR_TOKENS.pathSep)) throw new HandleError('E-DIM-ID-FORMAT', `${pattern}: segment ${JSON.stringify(s)} not a single path segment`);
    return s;
  });
  return /** @type {import('../types.d.ts').StatePath<P>} */ (out.join(GRAMMAR_TOKENS.pathSep));
}

// ---------- 文件路径、代号、节点名、摘要的格式文法 ----------
// 原 kernel/handles/patterns.mjs 搬入（S13 (b) 允许 handles/* 用正则；patterns.mjs 只留从 rx.mjs 搬来的正则）。

// 相对 server-plugin/ 的模块路径（registerAdvanceHook / registerViewReader 的 file：一段或多段目录 + .mjs）。
const MODULE_FILE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.mjs$/;
/** @param {unknown} s @returns {boolean} */
export const isModuleFile = (s) => typeof s === 'string' &&MODULE_FILE.test(s);

// 相对 world/rules/ 的规则表文件路径（一段或多段目录 + .json）。
const RULE_TABLE_FILE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.json$/;
/** @param {unknown} s @returns {boolean} */
export const isRuleTableFile = (s) => typeof s === 'string' &&RULE_TABLE_FILE.test(s);

// 小驼峰代号：推进钩子名与视图读取名同用一条文法（advance-registry、view-registry）。
const LOWER_CAMEL_CODE = /^[a-z][a-zA-Z0-9_]{0,47}$/;
/** @param {unknown} s @returns {boolean} */
export const isLowerCamelCode = (s) => typeof s === 'string' &&LOWER_CAMEL_CODE.test(s);

// 依赖声明的三类节点名（卷二 §2.3 :470）与加载器机器生成的两类（:470 末句）。
const DECLARABLE_NODE = /^(view|relation|scope):[A-Za-z][A-Za-z0-9_]*$/;
const GENERATED_NODE = /^(dim|modified):([a-z][a-z0-9_]{1,47})$/;
const ANY_NODE = /^(view|relation|scope|dim|modified):[A-Za-z][A-Za-z0-9_]*$/;
/** @param {unknown} s @returns {boolean} */
export const isDeclarableNode = (s) => typeof s === 'string' &&DECLARABLE_NODE.test(s);
/** @param {unknown} s @returns {boolean} */
export const isGeneratedNode = (s) => typeof s === 'string' &&GENERATED_NODE.test(s);
/** @param {unknown} s @returns {boolean} */
export const isAnyNode = (s) => typeof s === 'string' &&ANY_NODE.test(s);

// state-owners 路径模式（pathTypes 的键）：点分的小驼峰段。
const PATH_PATTERN = /^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/;
/** @param {unknown} s @returns {boolean} */
export const isPathPattern = (s) => typeof s === 'string' &&PATH_PATTERN.test(s);

// 64 位小写十六进制摘要（存档清单与摘要；save、load/save）。
const HEX64 = /^[0-9a-f]{64}$/;
/** @param {unknown} s @returns {boolean} */
export const isHex64 = (s) => typeof s === 'string' &&HEX64.test(s);

// 日志键的代号形（scheduler）：驼峰转下划线小写（卷二十 §4.1.3 第 7 条对照表）。
const UPPER = /[A-Z]/g;
/** @param {string} key @returns {string} */
export const snakeCaseKey = (key) => key.replace(UPPER, (c) => `_${c.toLowerCase()}`);
