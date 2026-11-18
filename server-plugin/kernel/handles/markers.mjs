// 协议标记句柄叶子（卷二 §2.8 kernel 闭集叶子文件；§7 S13 (a) 上下文白名单，李白 11-18 13:05 B2-W4 裁定第 1 条）。
// 本文件是 handles 叶子：不含任何 import 语句（tests/kernel/markers.test.mjs 读文本核对）。只放各族的定义源与由它们派生的冻结标记句柄 T，
// 定义源只此一份：validate/types.mjs 与 rx.mjs 都从这里取，rx 与 validate 之间因此没有 import 环（同 handles/patterns.mjs 做法）。
// 族的取值与出处同在定义源处；本文件不判任何具体值，只按定义源派生成员。

// 类型清单（卷二 §1.5 封闭 14 种，:183）。
export const TYPES = Object.freeze(['number', 'integer', 'boolean', 'string', 'enum', 'ref', 'union', 'set', 'map', 'list', 'struct', 'curve', 'distribution', 'rx']);

// 代码内封闭枚举（卷二 §1.9 末段 :288；值不带前缀）。只收卷二 §1.9 写出取值的；别卷定义取值的（carrier、etmode 等）在此缺席，引用即报未登记。
export const CODE_ENUMS = Object.freeze({
  stage: ['add', 'mul', 'max', 'min', 'set', 'post'],
  scope: ['self', 'holder', 'located', 'members', 'believers', 'jurisdiction', 'target', 'global', 'mounted'],
  eff_output: ['modifier', 'status', 'primitive', 'event', 'spawn'],
  consent_mode: ['none', 'target', 'holder', 'authority'],
  status_target: ['body', 'mind', 'place', 'org', 'faith'],
  onUnknown: ['skip', 'gap', 'error'],
  basis_kind: ['generated', 'migrated', 'deviation'],
  rx_cmp: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'],
  rx_clock: ['day', 'season'],
  slot_kind: ['code', 'number', 'text'],
  successor_mode: ['inherit', 'liquidate', 'wreck'],
  term_account: ['successor', 'sink', 'remains'],
  gate_verdict: ['pass', 'replace', 'block'],
  wire_route: ['menu', 'input', 'save_export', 'save_import'],
  wire_body: ['envelope', 'bytes'],
  event_role: ['actor', 'target', 'witness', 'related', 'informed'],
  stock_mode: ['raw', 'anchor', 'remainder', 'extScale'],
  reply_result: ['ok', 'received', 'rejected', 'error', 'save_unavailable'],
  narrate_result: ['written', 'skipped', 'rejected'],
  term_record: ['clear', 'hold', 'keep'],
  revive_record: ['clear', 'keep'],
  writer_role: ['create', 'rewrite'],
  rx_type: ['number', 'boolean', 'code', 'handle'],
  // 卷三甲 §2.1"物性格的来源级别"：代码内封闭枚举，只有三个值（A 实测出处、B 参照材料、C 设计设定）。
  cell_grade: ['measured', 'referenced', 'designed'],
});

// 不必写 domain 的类型（卷二 §1.2 表头；规则表登记的取值域同此写法，§4.1）。
export const DOMAIN_OPTIONAL = Object.freeze(['boolean', 'rx', 'struct', 'map', 'union', 'distribution', 'curve', 'ref', 'enum']);

// 行键文法里的行字段（卷二 §5.0 公共字段与 §1.3、§1.7）：不是维度，不参与继承（各行只取自己的）。
export const ROW_FIELDS = Object.freeze(['extends', 'abstract', 'classes', 'tags', 'basis', 'sources', 'selection', 'status', 'generated', 'termination', 'nameParts', 'memberLinks']);

// rxTree 的 op 字面值（卷二 §2.9 第 4 条变体表，:1167–:1180 逐行）：判别联合 discriminator "op" 的封闭取值。
// 数据档收其中除 slot、mod、broader 外的变体（同条"显示档与对 outputGate 开放"）；数据档与显示档的选择在 rx.mjs。
export const RX_OPS = Object.freeze(['num', 'dim', 'handle', 'add', 'sub', 'mul', 'div', 'cmp', 'and', 'or', 'not', 'agg', 'clock', 'slot', 'mod', 'broader', 'ns', 'member']);

// RX 求值与编译的类型标记（卷二 §2.9 第 4 条"RX 类型规则" :1183 与 §1.9 代码内封闭枚举 rx_type）：
// number/boolean/code/handle 即 rx_type 四值；codeOrHandle 是"代号或句柄"的混合读法标记（同条 :1183）；set 是只许作 member 的 set 的读法标记（同条）；
// runtime 是代码内占位（同条"返回类型为随字段的按所读字段取四种之一"：编译期取不到具体类型时记 runtime），不是第五种类型。
export const RX_KINDS = Object.freeze(['number', 'boolean', 'code', 'handle', 'codeOrHandle', 'set', 'runtime']);

// JavaScript 语言自带的 typeof 结果（S13 上下文白名单 (d)：typeof 结果比较属语言常量，不计第 ④ 类）。
// 取值来自 ECMAScript 的 typeof 返回值集合，不是任何卷的协议标记；放在此处只为同一定义只写一份。
export const JS_TYPES = Object.freeze(['undefined', 'object', 'boolean', 'number', 'bigint', 'string', 'symbol', 'function']);

// 语言自身的协议键（不是协议标记）：then 给 thenable 探测、toJSON 给 JSON 序列化，其余是对象自带成员名。
const MARKER_PROTOCOL_KEYS = Object.freeze({ 'then': true, 'toJSON': true, 'constructor': true, 'prototype': true, 'toString': true, 'valueOf': true, 'hasOwnProperty': true, 'is': true, 'family': true });

function markerMiss(family, key) {
  const e = new Error(`E-DIM-REF-MISSING marker ${JSON.stringify(key)} not defined in family ${family}`);
  e.code = 'E-DIM-REF-MISSING';
  return e;
}

/**
 * 由定义源派生一个族的冻结标记句柄：成员值即定义源里的字串，族名与 is 只作诊断与运行期核对。
 * @param {string} family 族名
 * @param {readonly string[]} values 定义源
 * @returns {Readonly<Record<string, string>>}
 */
export function markersOf(family, values) {
  const target = { family, is: (x) => values.includes(x) };
  for (const value of values) {
    if (!value || value.length === 0) throw new Error(`E-DIM-ID-FORMAT marker family ${family}: non-empty strings only`);
    if (Object.hasOwn(target, value)) throw new Error(`E-DIM-ID-DUPLICATE marker family ${family}: duplicate ${value}`);
    target[value] = value;
  }
  Object.freeze(target);
  // 未定义标记的读取抛 E-DIM-REF-MISSING；语言自身的协议键（then、toJSON 等）照常取 undefined。
  // symbol 键没有 length，按协议键原样放行（console、迭代器等内部读取）。
  return new Proxy(target, {
    get(t, key) {
      if (key.length === undefined || Object.hasOwn(t, key) || Object.hasOwn(MARKER_PROTOCOL_KEYS, key)) return t[key];
      throw markerMiss(family, key);
    },
  });
}

const codeEnumFamilies = {};
for (const fam of Object.keys(CODE_ENUMS)) codeEnumFamilies[fam] = markersOf(`code_enum.${fam}`, CODE_ENUMS[fam]);

// 协议标记句柄根：T.<族>.<标记>，例如 T.type.number、T.code_enum.rx_cmp.eq。族名与定义源同在，不手写成员。
export const T = Object.freeze({
  type: markersOf('type', TYPES),
  domain_optional: markersOf('domain_optional', DOMAIN_OPTIONAL),
  row_field: markersOf('row_field', ROW_FIELDS),
  code_enum: Object.freeze(codeEnumFamilies),
  rx_op: markersOf('rx_op', RX_OPS),
  rx_kind: markersOf('rx_kind', RX_KINDS),
  js_type: markersOf('js_type', JS_TYPES),
});
