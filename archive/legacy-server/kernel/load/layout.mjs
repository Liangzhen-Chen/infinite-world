// 世界数据的文件布局常量（卷二 §1.4、§1.5、§1.10、§1.12、§3.9；卷二 S10）：冻结常量，无 import、无副作用。
// world.mjs（加载器）与门禁（tools/accept）都从这里引，单位表等文件名只此一处。

export const LAYOUT = Object.freeze({
  dimensionsDir: 'world/ontology/dimensions',
  units: '_units.json',
  vocab: '_vocab.json',
  effects: '_effects.json',
  // 冻结分布表（卷二 §1.10 :324–:325；卷二十七 R27-5.2）：与 _units.json 同目录、同一种读法，读入后装配到内核。
  distributions: '_distributions.json',
  // 未建派生登记（卷二 §1.12 封卷后勘误 1118k23）：加载器读，与维度表同目录、下划线前缀，不当维度表。
  unbuiltDerived: '_unbuilt-derived.json',
  stateOwners: 'world/ontology/state-owners.json',
  // 效果族行引用闭合要核的原语目录（卷二 §3.9 :1479：`op` 是 primitives.json 的原语）；文件不存在时不交，效果族的原语输出一律被拒。
  primitives: 'world/ontology/primitives.json',
  // 命名 struct 登记（卷二 §1.5 :252 struct:pos；事件载荷 pos 的形状从这里派生，G1 记账第一条）；文件不存在时不装入。
  namedStructs: 'world/ontology/named-structs.json',
  // 内核常数表在 engine.rules 下的表代号（卷二 S10 登记豁免表；登记行见 world/rules/registry.json）。
  constants: 'kernelConstants',
});
