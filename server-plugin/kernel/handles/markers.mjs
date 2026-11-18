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
  // 卷二十七 §2.1 :123 族 detfn：内核定点数学设施提供的超越函数七值，代码内封闭枚举、值不带前缀（卷二 §1.9 :285、:289）。
  // 规则表 det-numeric 的 fnTables 用它作 map 键；不登 _vocab 族（李白 11-18 21:3x 裁定第 1 条），七值只在这一处定义。
  detfn: ['exp', 'ln', 'sin', 'cos', 'atan', 'sqrt', 'pow'],
});

// 不必写 domain 的类型（卷二 §1.2 表头；规则表登记的取值域同此写法，§4.1）。
export const DOMAIN_OPTIONAL = Object.freeze(['boolean', 'rx', 'struct', 'map', 'union', 'distribution', 'curve', 'ref', 'enum']);

// 行键文法里的行字段（卷二 §5.0 公共字段与 §1.3、§1.7）：不是维度，不参与继承（各行只取自己的）。
export const ROW_FIELDS = Object.freeze(['extends', 'abstract', 'classes', 'tags', 'basis', 'sources', 'selection', 'status', 'generated', 'termination', 'nameParts', 'memberLinks']);

// rxTree 的 op 字面值（卷二 §2.9 第 4 条变体表，:1167–:1180 逐行）：判别联合 discriminator "op" 的封闭取值。
// 数据档收其中除 slot、mod、broader 外的变体（同条"显示档与对 outputGate 开放"）；数据档与显示档的选择在 rx.mjs。
export const RX_OPS = Object.freeze(['num', 'dim', 'handle', 'add', 'sub', 'mul', 'div', 'cmp', 'and', 'or', 'not', 'agg', 'clock', 'slot', 'mod', 'broader', 'ns', 'member']);

// RX 求值与编译的类型标记（卷二 §2.9 第 4 条"RX 类型规则" :1184–:1186，全 RX 唯一定义；§1.9 代码内封闭枚举 rx_type :288）：
// number/boolean/code/handle 即 rx_type 四值（:1184、:1185）；codeOrHandle 是 :1185"实体类与词表族混合的 ref 为『代号或句柄』"的读法标记；
// set 是 :1180、:1185 只许作 member 的 set 的读法标记（"不是读数、不算第五种类型"）；
// runtime 是 :1185"返回类型为『随字段』的按所读字段取四种之一"（同 :1195）的代码占位：编译期取不到具体字段类型时记 runtime，不是第五种类型。
export const RX_KINDS = Object.freeze(['number', 'boolean', 'code', 'handle', 'codeOrHandle', 'set', 'runtime']);

// pathTypes 值文法里超出 §1.5 类型名的三个固定记号（卷二 §2.7 :811 路径类型文法：dimension / sealed / EventId 三行）：
// 定义源只此一份，handles/keys.mjs、kernel/storage.mjs、kernel/load/state-owners.mjs 三处比较都引用这里的成员。
export const PATH_TYPE_EXTRAS = Object.freeze(['EventId', 'dimension', 'sealed']);

// RX 可读命名空间登记行里"随字段"的读法记号（卷二 §2.9 第 4 条"RX 可读命名空间登记"第 1 点 :1195：各字段类型不同的行写"随字段"，
// 按所读字段取四种之一；登记数据 state-owners.json 的 rxNamespaces 行把它记作 field）。
export const NS_ROW_TYPES = Object.freeze(['field']);

// 卷二文法里的固定记号（S13 上下文白名单 (d)，卷二 :2413）：通配 `*`、路径分隔符、join 分隔串、JSON 文法记号。
// 这些是语言与文法常量，不计第 ④ 类；卷二没写到的串不收。两个以上文件用到的文法记号只在此定义一次，别处引用（卷二 :2413 末句）。
export const GRAMMAR_TOKENS = Object.freeze({
  wildcard: '*', // 路径模式里的通配，恰匹配一段（卷二 §2.7 :814）
  pathSep: '.', // 路径分段符（卷二 §2.7 :814：路径按 `.` 分段）
  joinSep: '|', // 种子键各部件相连的分隔串（卷二 §1.10 :320）
  // JSON 文法记号（卷二 :2413 (d)）：结构字符、字符串引号与转义、空白字符。
  jsonObjOpen: '{',
  jsonObjClose: '}',
  jsonArrOpen: '[',
  jsonArrClose: ']',
  jsonComma: ',',
  jsonColon: ':',
  jsonQuote: '"',
  jsonEscape: '\\',
  jsonSpace: ' ',
  jsonTab: '\t',
  jsonLf: '\n',
  jsonCr: '\r',
});

// 声明节点的字段（卷二 §2.3 :476 `declareInputs(node,{impl,own,uses})`、:477 `foldsOverDays`）。
export const DECL_FIELDS = Object.freeze(['impl', 'own', 'uses', 'foldsOverDays']);

// 规则表的独立格式名（卷二 §3.7 :1429：registry 文件级登记，结构写 `processSlots`）。
export const RULE_STRUCTURES = Object.freeze(['processSlots']);

// kernel 直接比较的词表族名（卷二 §1.9 :288 族名表：class、component、vstatus）。
export const VOCAB_FAMILIES = Object.freeze(['class', 'component', 'vstatus']);

// 表 kind 之外的伪类（卷二 §1.5 :182：`kind` 取 22 类或伪类 `effect`，即 _effects.json 的族）。
export const ID_KINDS = Object.freeze(['effect']);

// 作为写者模块路径的内核模块（卷二 §2.6 :247：账本写者 `kernel/ledger.mjs`）。
export const KERNEL_MODULES = Object.freeze({ ledger: 'kernel/ledger.mjs' });

// 入账腿 lot 的键集记号 attrs / splitFrom：卷三乙 post 批次腿的协议字段（块 3-2 实现定）。
// 卷文待回补：卷三乙 post 批次腿字段（主会话另派勘误）；卷二、卷六、卷三乙现行卷文未找到这两个键名作批次腿键集的定义。
// 定义源只此一份，kernel/ledger.mjs 引用（S13 ④，李白 11-18 13:05 裁定第 2 条）。
export const LOT_LEG_KEYS = Object.freeze(['attrs', 'splitFrom']);

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
  path_type_extra: markersOf('path_type_extra', PATH_TYPE_EXTRAS),
  ns_row_type: markersOf('ns_row_type', NS_ROW_TYPES),
  lot_leg_key: markersOf('lot_leg_key', LOT_LEG_KEYS),
  decl_field: markersOf('decl_field', DECL_FIELDS),
  rule_structure: markersOf('rule_structure', RULE_STRUCTURES),
  vocab_family: markersOf('vocab_family', VOCAB_FAMILIES),
  id_kind: markersOf('id_kind', ID_KINDS),
});
